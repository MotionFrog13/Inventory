import { BASE_URL, headersFor, recordResult, runTest, safeJson } from "../context";

export async function run() {
  // TC-BR-06: detail cabang lain ditolak 403 (halaman ini memuat daftar asetnya)
  try {
    const res = await fetch(`${BASE_URL}/api/branches/branch-bogor`, {
      method: "GET",
      headers: headersFor("ADMIN_IT_JAKARTA"),
    });
    const data = await safeJson(res);

    const passed = res.status === 403;
    recordResult(
      "BR-06",
      "Reading another outlet's branch detail returns 403",
      passed,
      passed ? "403 ditolak" : `Status: ${res.status}, error: ${data?.error ?? "-"}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recordResult("BR-06", "Reading another outlet's branch detail returns 403", false, message);
  }

  await runTest("DIV-04b", "Cabang yang masih punya aset/pengguna tidak dapat dihapus (409)", async () => {
    const res = await fetch(`${BASE_URL}/api/branches/branch-bandung`, { method: "DELETE", headers: headersFor("SUPER_ADMIN") });
    const body = await safeJson(res);
    return { passed: res.status === 409, notes: `status=${res.status} ${body?.error ?? ""}` };
  });
}
