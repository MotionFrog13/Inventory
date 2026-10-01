import { BASE_URL, headersFor, recordResult, runTest, safeJson } from "../context";

export async function run() {
  // TC-ACT-01 — Super Admin dapat membaca log aktivitas
  try {
    const res = await fetch(`${BASE_URL}/api/activity-logs`, {
      method: "GET",
      headers: headersFor("SUPER_ADMIN"),
    });
    const data = await safeJson(res);
    const passed = res.status === 200 && data?.success === true;
    recordResult(
      "ACT-01",
      "Super Admin can fetch activity logs",
      passed,
      passed ? `Succeeded: Found ${data?.data?.logs?.length} logs` : `Failed. Status: ${res.status}, data: ${JSON.stringify(data)}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recordResult("ACT-01", "Super Admin can fetch activity logs", false, message);
  }

  // TC-ACT-02 — peran lain diblokir dari API log aktivitas
  try {
    const res = await fetch(`${BASE_URL}/api/activity-logs`, {
      method: "GET",
      headers: headersFor("STAFF_IT"),
    });
    const passed = res.status === 403;
    recordResult(
      "ACT-02",
      "Non-Super Admin blocked from fetching activity logs",
      passed,
      passed ? "Correctly blocked with 403" : `Failed with status ${res.status}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recordResult("ACT-02", "Non-Super Admin blocked from fetching activity logs", false, message);
  }

  // TC-ACT-03 — log aktivitas tidak dapat ditambah manual
  try {
    const res = await fetch(`${BASE_URL}/api/activity-logs`, {
      method: "POST",
      headers: headersFor("SUPER_ADMIN"),
      body: JSON.stringify({ action: "HACK", details: "Insert custom log" }),
    });
    const passed = res.status === 405;
    recordResult(
      "ACT-03",
      "Activity Log mutations are blocked (read-only check)",
      passed,
      passed ? "Correctly blocked with 405 Method Not Allowed" : `Failed with status ${res.status}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recordResult("ACT-03", "Activity Log mutations are blocked (read-only check)", false, message);
  }

  // TC-ACT-04 — semua metode mutasi ke activity-logs harus 405
  try {
    const methods = ["POST", "PUT", "PATCH", "DELETE"];
    const statuses: Record<string, number> = {};
    for (const method of methods) {
      const res = await fetch(`${BASE_URL}/api/activity-logs`, {
        method,
        headers: headersFor("SUPER_ADMIN"),
      });
      statuses[method] = res.status;
    }
    const passed = methods.every((m) => statuses[m] === 405);
    recordResult(
      "ACT-04",
      "All activity log mutation verbs (POST/PUT/PATCH/DELETE) return 405",
      passed,
      passed ? "All four verbs correctly blocked with 405" : `Unexpected statuses: ${JSON.stringify(statuses)}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recordResult("ACT-04", "All activity log mutation verbs (POST/PUT/PATCH/DELETE) return 405", false, message);
  }

  // TC-RBAC-04 (halaman) — non Super Admin diblokir dari /activity-logs
  try {
    const res = await fetch(`${BASE_URL}/activity-logs`, {
      method: "GET",
      headers: headersFor("ADMIN_IT"),
      redirect: "manual",
    });
    const passed = res.status === 403;
    recordResult(
      "RBAC-04",
      "Non-Super Admin blocked from /activity-logs page (not just the API)",
      passed,
      passed ? "Correctly blocked with 403" : `Failed with status ${res.status}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recordResult("RBAC-04", "Non-Super Admin blocked from /activity-logs page (not just the API)", false, message);
  }

  // Log aktivitas milik organisasi lain tidak pernah terlihat. Setiap run
  // login-kan akun Org Uji B, jadi log LOGIN mereka pasti ada di database.
  await runTest("ORG-07", "Log aktivitas hanya memuat organisasi sendiri", async () => {
    const demo = await safeJson(await fetch(`${BASE_URL}/api/activity-logs?limit=100&search=LOGIN`, { headers: headersFor("SUPER_ADMIN") }));
    const b = await safeJson(await fetch(`${BASE_URL}/api/activity-logs?limit=100&search=LOGIN`, { headers: headersFor("B_SUPER_ADMIN") }));
    const demoLogs: { userId: string | null }[] = demo?.data?.logs ?? [];
    const bLogs: { userId: string | null }[] = b?.data?.logs ?? [];
    const demoSeesB = demoLogs.some((l) => l.userId?.startsWith("user-b-"));
    const bSeesDemo = bLogs.some((l) => l.userId && !l.userId.startsWith("user-b-"));
    const passed = demoLogs.length > 0 && bLogs.length > 0 && !demoSeesB && !bSeesDemo;
    return {
      passed,
      notes: `demo=${demoLogs.length} log (lihat B: ${demoSeesB}), B=${bLogs.length} log (lihat demo: ${bSeesDemo})`,
    };
  });
}
