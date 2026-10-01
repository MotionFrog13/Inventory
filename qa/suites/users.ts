import { BASE_URL, headersFor, jsonHeaders, loginAs, qaDb, runTest, safeJson, tokenCookie } from "../context";

export async function run() {
  await runTest("USR-01", "Akun non-Super Admin wajib punya divisi dan outlet; Super Admin wajib email", async () => {
    const base = { username: `qa_${Date.now().toString(36)}`, name: "QA", password: "staff123" };
    const post = (payload: object) =>
      fetch(`${BASE_URL}/api/users`, { method: "POST", headers: jsonHeaders("SUPER_ADMIN"), body: JSON.stringify({ ...base, ...payload }) });
    const noBranch = await post({ role: "DIVISION_STAFF", divisionId: "div-it", branchIds: [] });
    const noDivision = await post({ role: "DIVISION_STAFF", branchIds: ["branch-bogor"] });
    const superNoEmail = await post({ role: "SUPER_ADMIN" });
    const statuses = [noBranch.status, noDivision.status, superNoEmail.status];
    return { passed: statuses.every((s) => s === 400), notes: `status: ${statuses.join(", ")}` };
  });

  await runTest("USR-02", "Penugasan dicabut setelah login: API 403, me unassigned, login ulang 403", async () => {
    const username = `qa_unassigned_${Date.now().toString(36)}`;
    const created = await safeJson(
      await fetch(`${BASE_URL}/api/users`, {
        method: "POST",
        headers: jsonHeaders("SUPER_ADMIN"),
        body: JSON.stringify({ username, name: "QA Unassigned", password: "staff123", role: "DIVISION_STAFF", divisionId: "div-it", branchIds: ["branch-bogor"] }),
      })
    );
    const userId: string | undefined = created?.data?.id;
    if (!userId) throw new Error(`Gagal membuat pengguna uji: ${JSON.stringify(created)}`);

    try {
      const cookie = tokenCookie(await loginAs("demo", username, "staff123"));
      if (!cookie) throw new Error("Login awal gagal");

      // Dicabut langsung di database — API sengaja menolak akun tanpa outlet.
      await qaDb().userBranch.deleteMany({ where: { userId } });

      const assets = await fetch(`${BASE_URL}/api/assets`, { headers: { Cookie: cookie } });
      const me = await safeJson(await fetch(`${BASE_URL}/api/auth/me`, { headers: { Cookie: cookie } }));
      const logout = await fetch(`${BASE_URL}/api/auth/logout`, { method: "POST", headers: { Cookie: cookie } });
      const relogin = await loginAs("demo", username, "staff123");

      const passed = assets.status === 403 && me?.data?.access === "unassigned" && logout.status === 200 && relogin.status === 403;
      return { passed, notes: `assets=${assets.status} me.access=${me?.data?.access} logout=${logout.status} relogin=${relogin.status}` };
    } finally {
      await fetch(`${BASE_URL}/api/users/${userId}`, { method: "DELETE", headers: headersFor("SUPER_ADMIN") });
    }
  });

  await runTest("USR-04", "Super Admin terakhir organisasi tidak dapat diturunkan", async () => {
    const res = await fetch(`${BASE_URL}/api/users/user-superadmin`, {
      method: "PUT",
      headers: jsonHeaders("SUPER_ADMIN"),
      body: JSON.stringify({ role: "DIVISION_ADMIN", divisionId: "div-it", branchIds: ["branch-bogor"] }),
    });
    const body = await safeJson(res);
    return { passed: res.status === 400, notes: `status=${res.status} ${body?.error ?? ""}` };
  });
}
