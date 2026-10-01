import { BASE_URL, headersFor, jsonHeaders, runTest } from "../context";

export async function run() {
  await runTest("MDM-01", "Seluruh route MDM dinonaktifkan (404)", async () => {
    const statuses = [
      (await fetch(`${BASE_URL}/api/mdm/enroll`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status,
      (await fetch(`${BASE_URL}/api/mdm/check-in`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status,
      (await fetch(`${BASE_URL}/api/assets/asset-laptop-dell-bogor/mdm`, { headers: headersFor("SUPER_ADMIN") })).status,
      (await fetch(`${BASE_URL}/api/assets/asset-laptop-dell-bogor/mdm/command`, { method: "POST", headers: jsonHeaders("SUPER_ADMIN"), body: JSON.stringify({ commandType: "LOCK" }) })).status,
    ];
    return { passed: statuses.every((s) => s === 404), notes: `status: ${statuses.join(", ")}` };
  });
}
