import jwt from "jsonwebtoken";
import { BASE_URL, headersFor, loginAs, recordResult, runTest, safeJson } from "../context";

/** Cookie `token` dihapus: nilai kosong dengan kedaluwarsa di masa lalu. */
function clearsTokenCookie(res: Response): boolean {
  const cookie = res.headers.get("set-cookie") ?? "";
  return /(^|,\s*)token=;/.test(cookie) && /(Max-Age=0|1970)/i.test(cookie);
}

export async function run() {
  // TC-AUTH-01 — header identitas dari klien tidak boleh dipercaya.
  // Regresi untuk bypass middleware lewat `x-next-prerender` + `x-user-*`.
  try {
    const res = await fetch(`${BASE_URL}/api/users`, {
      method: "GET",
      headers: {
        "x-next-prerender": "1",
        "x-user-id": "forged-user-id",
        "x-user-org": "org-demo",
        "x-user-role": "SUPER_ADMIN",
        "x-user-name": "Forged Admin",
        "x-user-username": "forged",
      },
    });
    const passed = res.status === 401 || res.status === 403;
    recordResult(
      "AUTH-01",
      "Forged x-user-* identity headers (no cookie) are rejected",
      passed,
      passed
        ? `Correctly rejected with ${res.status}`
        : `SECURITY: privilege escalation possible — status ${res.status}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recordResult("AUTH-01", "Forged x-user-* identity headers (no cookie) are rejected", false, message);
  }

  // TC-AUTH-02 — token bertanda tangan sah tetapi berformat lama tidak boleh
  // diteruskan: peran pra-Fase 1 (mis. ADMIN_IT) atau tanpa organizationId.
  // Regresi celah eskalasi 1.2.0 (peran tak dikenal diperlakukan tanpa batasan).
  await runTest("AUTH-02", "Token format lama (peran lama / tanpa organizationId) ditolak dan cookie dihapus", async () => {
    const secret = process.env.JWT_SECRET;
    if (!secret) return { passed: false, notes: "JWT_SECRET tidak tersedia di lingkungan QA" };
    const legacyRole = jwt.sign(
      { userId: "user-admin-it", organizationId: "org-demo", username: "admin_it", role: "ADMIN_IT", name: "Legacy" },
      secret,
      { expiresIn: "5m" }
    );
    const noOrg = jwt.sign(
      { userId: "user-superadmin", username: "superadmin", role: "SUPER_ADMIN", name: "Legacy", branchId: null },
      secret,
      { expiresIn: "5m" }
    );

    const apiLegacy = await fetch(`${BASE_URL}/api/assets`, { headers: { Cookie: `token=${legacyRole}` } });
    const apiNoOrg = await fetch(`${BASE_URL}/api/users`, { headers: { Cookie: `token=${noOrg}` } });
    const page = await fetch(`${BASE_URL}/assets`, { headers: { Cookie: `token=${noOrg}` }, redirect: "manual" });
    const pageToLogin = [302, 303, 307, 308].includes(page.status) && (page.headers.get("location") ?? "").includes("/login");

    const passed =
      apiLegacy.status === 401 && clearsTokenCookie(apiLegacy) &&
      apiNoOrg.status === 401 && clearsTokenCookie(apiNoOrg) &&
      pageToLogin && clearsTokenCookie(page);
    return {
      passed,
      notes: `peran lama=${apiLegacy.status}${clearsTokenCookie(apiLegacy) ? "+hapus cookie" : ""}, ` +
        `tanpa org=${apiNoOrg.status}${clearsTokenCookie(apiNoOrg) ? "+hapus cookie" : ""}, ` +
        `halaman=${page.status}→${page.headers.get("location") ?? "-"}`,
    };
  });

  await runTest("ORG-06", "Kode organisasi menentukan akun; username sama di dua organisasi", async () => {
    const meDemo = await safeJson(await fetch(`${BASE_URL}/api/auth/me`, { headers: headersFor("SUPER_ADMIN") }));
    const meB = await safeJson(await fetch(`${BASE_URL}/api/auth/me`, { headers: headersFor("B_SUPER_ADMIN") }));
    // admin_kitchen hanya ada di demo; kode organisasi "tidak-ada" tidak terdaftar.
    const wrongOrg = await loginAs("uji-b", "admin_kitchen", "admin123");
    const missingOrg = await loginAs("tidak-ada", "superadmin", "admin123");
    const wrongOrgBody = await safeJson(wrongOrg);
    const missingOrgBody = await safeJson(missingOrg);

    const passed =
      meDemo?.data?.organization?.slug === "demo" &&
      meB?.data?.organization?.slug === "uji-b" &&
      meDemo?.data?.id !== meB?.data?.id &&
      wrongOrg.status === 401 &&
      missingOrg.status === 401 &&
      wrongOrgBody?.error === missingOrgBody?.error;

    return {
      passed,
      notes: `demo=${meDemo?.data?.organization?.slug} B=${meB?.data?.organization?.slug} wrongOrg=${wrongOrg.status} missingOrg=${missingOrg.status}`,
    };
  });
}
