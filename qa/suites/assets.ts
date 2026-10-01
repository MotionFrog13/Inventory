import { BASE_URL, headersFor, jsonHeaders, qaDb, recordResult, runTest, safeJson } from "../context";

export async function run() {
  // TC-RBAC-01 — staf tidak dapat mengedit spesifikasi aset
  try {
    const res = await fetch(`${BASE_URL}/api/assets/asset-laptop-dell-bogor`, {
      method: "PUT",
      headers: headersFor("STAFF_IT", { "Content-Type": "application/json" }),
      body: JSON.stringify({ name: "Updated by Staff" }),
    });
    const data = await safeJson(res);
    const passed = res.status === 403;
    recordResult(
      "RBAC-01",
      "Staff (STAFF_IT) cannot edit asset specs",
      passed,
      passed ? "Correctly blocked with 403" : `Failed with status ${res.status}: ${JSON.stringify(data)}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recordResult("RBAC-01", "Staff (STAFF_IT) cannot edit asset specs", false, message);
  }

  // TC-SEP-01 — Admin IT tidak dapat membuka aset divisi Kitchen
  try {
    const res = await fetch(`${BASE_URL}/api/assets/asset-chiller-bogor`, {
      method: "GET",
      headers: headersFor("ADMIN_IT"),
    });
    const data = await safeJson(res);
    const passed = res.status === 403 && data?.error === "Unauthorized cross-division access detected.";
    recordResult(
      "SEP-01",
      "Admin IT blocked from Kitchen division asset",
      passed,
      passed ? "Correctly blocked with 403 cross-division" : `Failed with status ${res.status}, error: ${data?.error ?? "-"}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recordResult("SEP-01", "Admin IT blocked from Kitchen division asset", false, message);
  }

  // TC-SEP-02 — Admin Kitchen tidak dapat membuka aset divisi IT
  try {
    const res = await fetch(`${BASE_URL}/api/assets/asset-laptop-dell-bogor`, {
      method: "GET",
      headers: headersFor("ADMIN_KITCHEN"),
    });
    const passed = res.status === 403;
    recordResult(
      "SEP-02",
      "Admin Kitchen blocked from IT division asset",
      passed,
      passed ? "Correctly blocked with 403" : `Failed with status ${res.status}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recordResult("SEP-02", "Admin Kitchen blocked from IT division asset", false, message);
  }

  // TC-SEP-03 — Super Admin dapat membuka aset semua divisi
  try {
    const resIt = await fetch(`${BASE_URL}/api/assets/asset-laptop-dell-bogor`, {
      method: "GET",
      headers: headersFor("SUPER_ADMIN"),
    });
    const resKitchen = await fetch(`${BASE_URL}/api/assets/asset-chiller-bogor`, {
      method: "GET",
      headers: headersFor("SUPER_ADMIN"),
    });
    const passed = resIt.status === 200 && resKitchen.status === 200;
    recordResult(
      "SEP-03",
      "Super Admin has full access to IT and Kitchen divisions",
      passed,
      passed ? "Succeeded accessing both" : `Failed: IT code ${resIt.status}, Kitchen code ${resKitchen.status}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recordResult("SEP-03", "Super Admin has full access to IT and Kitchen divisions", false, message);
  }

  // Sudut pandang: `admin_it_jakarta` (outlet Jakarta Selatan) terhadap aset
  // milik outlet Bogor — kebocoran antar outlet hanya terlihat dari akun ini.
  const bogorAssetId = "asset-laptop-dell-bogor";

  // TC-BR-01: daftar aset tidak boleh memuat aset outlet lain
  try {
    const res = await fetch(`${BASE_URL}/api/assets?limit=100`, {
      method: "GET",
      headers: headersFor("ADMIN_IT_JAKARTA"),
    });
    const data = await safeJson(res);
    const assets: Array<{ branchId: string }> = data?.data?.assets ?? [];
    const leaked = assets.filter((a) => a.branchId !== "branch-jakarta");

    const passed = res.status === 200 && assets.length > 0 && leaked.length === 0;
    recordResult(
      "BR-01",
      "Asset list is scoped to the user's own outlet",
      passed,
      passed
        ? `${assets.length} aset, seluruhnya milik branch-jakarta`
        : `Status: ${res.status}, total: ${assets.length}, bocor dari outlet lain: ${leaked.length}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recordResult("BR-01", "Asset list is scoped to the user's own outlet", false, message);
  }

  // TC-BR-02: detail aset outlet lain ditolak 403 (bukan 404, bukan data aset)
  try {
    const res = await fetch(`${BASE_URL}/api/assets/${bogorAssetId}`, {
      method: "GET",
      headers: headersFor("ADMIN_IT_JAKARTA"),
    });
    const data = await safeJson(res);

    const passed = res.status === 403 && data?.error === "Unauthorized cross-branch access detected.";
    recordResult(
      "BR-02",
      "Reading an asset from another outlet returns 403",
      passed,
      passed ? "403 cross-branch" : `Status: ${res.status}, error: ${data?.error ?? "-"}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recordResult("BR-02", "Reading an asset from another outlet returns 403", false, message);
  }

  // TC-BR-03: membuat aset di outlet lain ditolak 403
  try {
    const res = await fetch(`${BASE_URL}/api/assets`, {
      method: "POST",
      headers: headersFor("ADMIN_IT_JAKARTA", { "Content-Type": "application/json" }),
      body: JSON.stringify({
        name: "QA Cross-Branch Asset",
        categoryId: "cat-it-laptop",
        status: "ACTIVE",
        branchId: "branch-bogor",
      }),
    });
    const data = await safeJson(res);

    // Tanpa branchId: pemegang satu outlet otomatis ke outletnya; pemegang
    // beberapa outlet wajib memilih (400) — tidak pernah ditebak.
    const autoRes = await fetch(`${BASE_URL}/api/assets`, {
      method: "POST",
      headers: headersFor("ADMIN_IT_JAKARTA", { "Content-Type": "application/json" }),
      body: JSON.stringify({ name: "QA Auto Branch Asset", categoryId: "cat-it-laptop", status: "ACTIVE" }),
    });
    const auto = await safeJson(autoRes);
    if (auto?.data?.id) {
      await fetch(`${BASE_URL}/api/assets/${auto.data.id}`, { method: "DELETE", headers: headersFor("SUPER_ADMIN") });
    }
    const multiRes = await fetch(`${BASE_URL}/api/assets`, {
      method: "POST",
      headers: headersFor("ADMIN_ENGINEERING", { "Content-Type": "application/json" }),
      body: JSON.stringify({ name: "QA Multi Outlet Asset", categoryId: "cat-eng-ac", status: "ACTIVE" }),
    });
    const multi = await safeJson(multiRes);
    if (multi?.data?.id) {
      await fetch(`${BASE_URL}/api/assets/${multi.data.id}`, { method: "DELETE", headers: headersFor("SUPER_ADMIN") });
    }

    const passed =
      res.status === 403 &&
      autoRes.status === 201 && auto?.data?.branchId === "branch-jakarta" &&
      multiRes.status === 400;
    recordResult(
      "BR-03",
      "Creating an asset in another outlet returns 403",
      passed,
      passed
        ? "403 ditolak; tanpa branchId → outlet tunggal pengguna (201), pemegang beberapa outlet 400"
        : `lain=${res.status} (${data?.error ?? "-"}), otomatis=${autoRes.status}/${auto?.data?.branchId ?? "-"}, multi=${multiRes.status}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recordResult("BR-03", "Creating an asset in another outlet returns 403", false, message);
  }

  // TC-BR-04: `?branchId=` milik outlet lain DIABAIKAN, bukan dituruti
  try {
    const res = await fetch(`${BASE_URL}/api/assets?branchId=branch-bogor&limit=100`, {
      method: "GET",
      headers: headersFor("ADMIN_IT_JAKARTA"),
    });
    const data = await safeJson(res);
    const assets: Array<{ branchId: string }> = data?.data?.assets ?? [];
    const leaked = assets.filter((a) => a.branchId !== "branch-jakarta");

    // Hasil yang benar: tetap aset Jakarta (filter diabaikan) — bukan aset Bogor.
    const passed = res.status === 200 && assets.length > 0 && leaked.length === 0;
    recordResult(
      "BR-04",
      "A branchId query param cannot widen access beyond the user's outlet",
      passed,
      passed
        ? `Filter diabaikan, tetap ${assets.length} aset branch-jakarta`
        : `Status: ${res.status}, total: ${assets.length}, bocor: ${leaked.length}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recordResult("BR-04", "A branchId query param cannot widen access beyond the user's outlet", false, message);
  }

  await runTest("DIV-03", "Kategori dari divisi lain ditolak saat membuat maupun mengubah aset", async () => {
    const create = await fetch(`${BASE_URL}/api/assets`, {
      method: "POST",
      headers: jsonHeaders("SUPER_ADMIN"),
      body: JSON.stringify({ name: "QA Salah Kategori", divisionId: "div-it", categoryId: "cat-kitchen-chiller", branchId: "branch-bogor", status: "ACTIVE" }),
    });
    const update = await fetch(`${BASE_URL}/api/assets/asset-laptop-dell-bogor`, {
      method: "PUT",
      headers: jsonHeaders("ADMIN_IT"),
      body: JSON.stringify({ categoryId: "cat-kitchen-chiller" }),
    });
    return { passed: create.status === 400 && update.status === 400, notes: `create=${create.status} update=${update.status}` };
  });

  await runTest("ORG-01", "Daftar aset tidak pernah memuat aset organisasi lain", async () => {
    const body = await safeJson(await fetch(`${BASE_URL}/api/assets?limit=100`, { headers: headersFor("SUPER_ADMIN") }));
    const ids: string[] = (body?.data?.assets ?? []).map((a: { id: string }) => a.id);
    const demoTotal = await qaDb().asset.count({ where: { organizationId: "org-demo" } });
    const passed = !ids.includes("asset-b-laptop") && body?.data?.pagination?.total === demoTotal;
    return { passed, notes: `total=${body?.data?.pagination?.total} (demo=${demoTotal}), memuat B: ${ids.includes("asset-b-laptop")}` };
  });

  await runTest("ORG-02", "Aset organisasi lain: GET/PUT/DELETE membalas 404 tanpa data", async () => {
    const url = `${BASE_URL}/api/assets/asset-b-laptop`;
    const get = await fetch(url, { headers: headersFor("SUPER_ADMIN") });
    const getBody = await safeJson(get);
    const put = await fetch(url, { method: "PUT", headers: jsonHeaders("SUPER_ADMIN"), body: JSON.stringify({ name: "Dibajak" }) });
    const del = await fetch(url, { method: "DELETE", headers: headersFor("SUPER_ADMIN") });
    const stillThere = await safeJson(await fetch(url, { headers: headersFor("B_SUPER_ADMIN") }));
    const passed =
      get.status === 404 && getBody?.data == null && put.status === 404 && del.status === 404 &&
      stillThere?.data?.name === "Laptop Org B";
    return { passed, notes: `get=${get.status} put=${put.status} delete=${del.status} B masih ada: ${stillThere?.data?.name}` };
  });

  await runTest("ORG-03", "Kategori/cabang organisasi lain di payload ditolak 400 tanpa membuat baris", async () => {
    const name = `QA Lintas Org ${Date.now().toString(36)}`;
    const badCategory = await fetch(`${BASE_URL}/api/assets`, {
      method: "POST",
      headers: jsonHeaders("SUPER_ADMIN"),
      body: JSON.stringify({ name, divisionId: "div-it", categoryId: "cat-b-laptop", branchId: "branch-bogor", status: "ACTIVE" }),
    });
    const badBranch = await fetch(`${BASE_URL}/api/assets`, {
      method: "POST",
      headers: jsonHeaders("SUPER_ADMIN"),
      body: JSON.stringify({ name, divisionId: "div-it", categoryId: "cat-it-laptop", branchId: "branch-b1", status: "ACTIVE" }),
    });
    const leaked = await qaDb().asset.count({ where: { name } });
    const passed = badCategory.status === 400 && badBranch.status === 400 && leaked === 0;
    return { passed, notes: `kategori=${badCategory.status} cabang=${badBranch.status} baris=${leaked}` };
  });

  await runTest("USR-03", "Staf multi-outlet melihat aset divisinya di semua outletnya saja", async () => {
    const body = await safeJson(await fetch(`${BASE_URL}/api/assets?limit=100`, { headers: headersFor("TEKNISI_ENGINEERING") }));
    const assets: { id: string; divisionId: string }[] = body?.data?.assets ?? [];
    const ids = assets.map((a) => a.id);
    const passed =
      ids.includes("asset-genset-bogor") && ids.includes("asset-ac-jkt") &&
      !ids.includes("asset-pompa-bandung") && assets.every((a) => a.divisionId === "div-engineering");
    return { passed, notes: `aset: ${ids.join(", ")}` };
  });
}
