import { BASE_URL, headersFor, jsonHeaders, runTest, safeJson } from "../context";

const stamp = () => Date.now().toString(36);

export async function run() {
  await runTest("DIV-01", "Hanya Super Admin yang dapat mengelola divisi", async () => {
    const post = (key: "ADMIN_IT" | "STAFF_IT") =>
      fetch(`${BASE_URL}/api/divisions`, { method: "POST", headers: jsonHeaders(key), body: JSON.stringify({ name: `QA ${stamp()}` }) });
    const statuses = [
      (await post("ADMIN_IT")).status,
      (await post("STAFF_IT")).status,
      (await fetch(`${BASE_URL}/api/divisions/div-it`, { method: "PUT", headers: jsonHeaders("ADMIN_IT"), body: JSON.stringify({ name: "IT Baru" }) })).status,
      (await fetch(`${BASE_URL}/api/divisions/div-it`, { method: "DELETE", headers: headersFor("ADMIN_IT") })).status,
    ];
    return { passed: statuses.every((s) => s === 403), notes: `status: ${statuses.join(", ")}` };
  });

  await runTest("DIV-02", "Admin divisi mengelola kategori divisinya sendiri saja", async () => {
    const name = `QA Kategori ${stamp()}`;
    const created = await fetch(`${BASE_URL}/api/divisions/div-it/categories`, { method: "POST", headers: jsonHeaders("ADMIN_IT"), body: JSON.stringify({ name }) });
    const createdBody = await safeJson(created);
    const id = createdBody?.data?.id;
    const renamed = await fetch(`${BASE_URL}/api/categories/${id}`, { method: "PUT", headers: jsonHeaders("ADMIN_IT"), body: JSON.stringify({ name: `${name} 2` }) });
    const removed = await fetch(`${BASE_URL}/api/categories/${id}`, { method: "DELETE", headers: headersFor("ADMIN_IT") });
    const foreignCreate = await fetch(`${BASE_URL}/api/divisions/div-kitchen/categories`, { method: "POST", headers: jsonHeaders("ADMIN_IT"), body: JSON.stringify({ name }) });
    const foreignRename = await fetch(`${BASE_URL}/api/categories/cat-kitchen-oven`, { method: "PUT", headers: jsonHeaders("ADMIN_IT"), body: JSON.stringify({ name: "Oven Dibajak" }) });
    const staffCreate = await fetch(`${BASE_URL}/api/divisions/div-it/categories`, { method: "POST", headers: jsonHeaders("STAFF_IT"), body: JSON.stringify({ name }) });
    const passed =
      created.status === 201 && renamed.status === 200 && removed.status === 200 &&
      foreignCreate.status === 403 && foreignRename.status === 403 && staffCreate.status === 403;
    return {
      passed,
      notes: `create=${created.status} rename=${renamed.status} delete=${removed.status} kitchenCreate=${foreignCreate.status} kitchenRename=${foreignRename.status} staff=${staffCreate.status}`,
    };
  });

  await runTest("DIV-04a", "Divisi/kategori yang masih berisi tidak dapat dihapus (409); divisi kosong bisa", async () => {
    const division = await fetch(`${BASE_URL}/api/divisions/div-it`, { method: "DELETE", headers: headersFor("SUPER_ADMIN") });
    const category = await fetch(`${BASE_URL}/api/categories/cat-it-laptop`, { method: "DELETE", headers: headersFor("SUPER_ADMIN") });
    const empty = await safeJson(await fetch(`${BASE_URL}/api/divisions`, { method: "POST", headers: jsonHeaders("SUPER_ADMIN"), body: JSON.stringify({ name: `QA Divisi ${stamp()}` }) }));
    const emptyDelete = await fetch(`${BASE_URL}/api/divisions/${empty?.data?.id}`, { method: "DELETE", headers: headersFor("SUPER_ADMIN") });
    const passed = division.status === 409 && category.status === 409 && emptyDelete.status === 200;
    return { passed, notes: `divisi=${division.status} kategori=${category.status} divisiKosong=${emptyDelete.status}` };
  });
}
