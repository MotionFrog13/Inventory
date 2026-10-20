import jwt from "jsonwebtoken";
import { BASE_URL, headersFor, jsonHeaders, loginAs, qaDb, runTest } from "../context";

export async function run() {
  await runTest("SEC-01", "Cross-origin mutations including login are rejected", async () => {
    const statuses = await Promise.all(["/api/auth/login", "/api/auth/logout", "/api/incidents"].map(async (path) =>
      (await fetch(`${BASE_URL}${path}`, { method: "POST", headers: { ...jsonHeaders("SUPER_ADMIN"), Origin: "https://attacker.example" }, body: "{}" })).status));
    return { passed: statuses.every((s) => s === 403), notes: `statuses=${statuses}` };
  });
  await runTest("SEC-02", "Malformed signed identity never becomes another user", async () => {
    const token = jwt.sign({ organizationId: "org-demo", role: "SUPER_ADMIN", name: "Admin", username: "superadmin" }, process.env.JWT_SECRET!);
    const res = await fetch(`${BASE_URL}/api/users`, { headers: { Cookie: `token=${token}` } });
    return { passed: res.status === 401, notes: `status=${res.status}` };
  });
  await runTest("SEC-03", "Login rejects invalid JSON shape and throttles repeated attempts", async () => {
    const malformed = await fetch(`${BASE_URL}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "null" });
    const statuses: number[] = [];
    let retry = "";
    const identifier = `missing-${Date.now().toString(36)}`;
    for (let i = 0; i < 11; i++) {
      const res = await loginAs("demo", identifier, "incorrect");
      statuses.push(res.status);
      retry = res.headers.get("retry-after") ?? "";
    }
    return { passed: malformed.status === 400 && statuses.slice(0, 10).every((s) => s === 401) && statuses[10] === 429 && Number(retry) > 0, notes: `invalid=${malformed.status} attempts=${statuses} retry=${retry}` };
  });

  const db = qaDb();
  const prefix = `qa-security-${Date.now()}`;
  const ids = ["upload", "transfer", "concurrent"].map((suffix) => `${prefix}-${suffix}`);
  await db.asset.createMany({ data: ids.map((id) => ({
    id, organizationId: "org-demo", divisionId: "div-it", categoryId: "cat-it-laptop", branchId: "branch-bogor",
    name: id, status: "ACTIVE" as const, quantity: 100, activeQty: 100,
  })) });
  try {
    await runTest("SEC-04", "Forged PDF and disguised SVG do not reserve stock or create BAP", async () => {
      const statuses: number[] = [];
      for (const type of ["application/pdf", "image/png"]) {
        const form = new FormData();
        form.set("file", new Blob(["<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"], { type }), type === "application/pdf" ? "fake.pdf" : "fake.png");
        form.set("quantity", "1");
        statuses.push((await fetch(`${BASE_URL}/api/assets/${ids[0]}/bap`, { method: "POST", headers: headersFor("SUPER_ADMIN"), body: form })).status);
      }
      const asset = await db.asset.findUniqueOrThrow({ where: { id: ids[0] } });
      const count = await db.bap.count({ where: { assetId: ids[0] } });
      return { passed: statuses.every((s) => s === 400) && count === 0 && asset.reservedQty === 0, notes: `statuses=${statuses} BAP=${count} reserved=${asset.reservedQty}` };
    });
    await runTest("SEC-05", "Fractional and partially numeric quantities are rejected", async () => {
      const statuses: number[] = [];
      for (const quantity of ["1.5", "2pcs", true, "2147483648"]) {
        statuses.push((await fetch(`${BASE_URL}/api/assets/${ids[0]}`, { method: "PUT", headers: jsonHeaders("SUPER_ADMIN"), body: JSON.stringify({ quantity }) })).status);
        statuses.push((await fetch(`${BASE_URL}/api/incidents`, { method: "POST", headers: jsonHeaders("SUPER_ADMIN"), body: JSON.stringify({ assetId: ids[0], description: "Invalid quantity", quantity }) })).status);
      }
      return { passed: statuses.every((s) => s === 400), notes: `statuses=${statuses}` };
    });
    await runTest("SEC-06", "Stale-origin and BAP-locked transfers cannot be approved", async () => {
      const statuses: number[] = [];
      for (const locked of [false, true]) {
        await db.asset.update({ where: { id: ids[1] }, data: { branchId: "branch-bogor", status: "ACTIVE", activeQty: 100, reservedQty: 0 } });
        const transfer = await db.transfer.create({ data: { organizationId: "org-demo", assetId: ids[1], fromBranchId: "branch-bogor", toBranchId: "branch-jakarta", requestedById: "user-superadmin", reason: "Changed after request" } });
        await db.asset.update({ where: { id: ids[1] }, data: locked ? { status: "BAP_PENDING", activeQty: 0, reservedQty: 100 } : { branchId: "branch-bandung" } });
        statuses.push((await fetch(`${BASE_URL}/api/transfers/${transfer.id}/approve`, { method: "POST", headers: headersFor("SUPER_ADMIN") })).status);
        const after = await db.transfer.findUniqueOrThrow({ where: { id: transfer.id } });
        if (after.status !== "PENDING") return { passed: false, notes: "Transfer was mutated" };
        await db.transfer.delete({ where: { id: transfer.id } });
      }
      return { passed: statuses.every((s) => s === 409), notes: `statuses=${statuses}` };
    });
    await runTest("SEC-07", "Concurrent transfer requests create only one pending transfer", async () => {
      const statuses = await Promise.all(Array.from({ length: 8 }, async () =>
        (await fetch(`${BASE_URL}/api/assets/${ids[2]}/transfer`, { method: "POST", headers: jsonHeaders("SUPER_ADMIN"), body: JSON.stringify({ toBranchId: "branch-jakarta", reason: "Concurrent request" }) })).status));
      const pending = await db.transfer.count({ where: { assetId: ids[2], status: "PENDING" } });
      return { passed: statuses.filter((s) => s === 201).length === 1 && statuses.every((s) => [201, 400, 409].includes(s)) && pending === 1, notes: `statuses=${statuses} pending=${pending}` };
    });
  } finally {
    await db.transfer.deleteMany({ where: { assetId: { in: ids } } });
    await db.incident.deleteMany({ where: { assetId: { in: ids } } });
    await db.bap.deleteMany({ where: { assetId: { in: ids } } });
    await db.asset.deleteMany({ where: { id: { in: ids } } });
  }

  await runTest("SEC-08", "Concurrent demotions cannot remove the last Super Admin", async () => {
    const orgId = `${prefix}-org`;
    const divisionId = `${prefix}-div`;
    const branchId = `${prefix}-branch`;
    const userIds = [`${prefix}-admin-a`, `${prefix}-admin-b`];
    try {
      await db.organization.create({ data: { id: orgId, name: "QA admin concurrency", slug: `qa-${Date.now().toString(36)}` } });
      await db.division.create({ data: { id: divisionId, organizationId: orgId, name: "IT" } });
      await db.branch.create({ data: { id: branchId, organizationId: orgId, name: "QA outlet", location: "QA" } });
      await db.user.createMany({ data: userIds.map((id, i) => ({ id, organizationId: orgId, username: `admin-${i}`, name: "QA Admin", email: `${id}@qa.local`, password: "unused", role: "SUPER_ADMIN" as const })) });
      const statuses = await Promise.all(userIds.map(async (id, i) => {
        const token = jwt.sign({ userId: id, organizationId: orgId, username: `admin-${i}`, name: "QA Admin", role: "SUPER_ADMIN" }, process.env.JWT_SECRET!);
        return (await fetch(`${BASE_URL}/api/users/${id}`, { method: "PUT", headers: { Cookie: `token=${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ role: "DIVISION_ADMIN", divisionId, branchIds: [branchId] }) })).status;
      }));
      const remaining = await db.user.count({ where: { organizationId: orgId, role: "SUPER_ADMIN" } });
      return { passed: remaining >= 1 && statuses.filter((s) => s === 200).length === 1, notes: `statuses=${statuses} superAdmins=${remaining}` };
    } finally {
      await db.activityLog.deleteMany({ where: { organizationId: orgId } });
      await db.userBranch.deleteMany({ where: { organizationId: orgId } });
      await db.user.deleteMany({ where: { organizationId: orgId } });
      await db.division.deleteMany({ where: { organizationId: orgId } });
      await db.branch.deleteMany({ where: { organizationId: orgId } });
      await db.organization.deleteMany({ where: { id: orgId } });
    }
  });
}
