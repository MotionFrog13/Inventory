import fs from "fs";
import {
  type AccountKey,
  BASE_URL,
  fixtures,
  headersFor,
  invariantHolds,
  jsonHeaders,
  readAsset,
  recordResult,
  runTest,
  safeJson,
} from "../context";

function bapForm(file: string, type: string, name: string, fields: Record<string, string>) {
  const form = new FormData();
  form.append("file", new Blob([fs.readFileSync(file)], { type }), name);
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  return form;
}

export async function run() {
  // TC-RBAC-02 — staf tidak dapat menyetujui BAP (peran dicek lebih dulu)
  try {
    const res = await fetch(`${BASE_URL}/api/assets/asset-laptop-dell-bogor/bap/approve`, {
      method: "POST",
      headers: headersFor("STAFF_IT"),
    });
    const passed = res.status === 403;
    recordResult(
      "RBAC-02",
      "Staff (STAFF_IT) cannot approve BAP",
      passed,
      passed ? "Correctly blocked with 403" : `Failed with status ${res.status}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recordResult("RBAC-02", "Staff (STAFF_IT) cannot approve BAP", false, message);
  }

  // TC-BAP-01 / TC-BAP-02 / TC-FILE-02 — memakai aset uji unit tunggal yang
  // dibuat setiap run lalu dihapus di akhir, agar data demo tidak habis dan
  // suite dapat diulang tanpa seed ulang.
  let bapAssetId: string | null = null;
  try {
    const created = await safeJson(
      await fetch(`${BASE_URL}/api/assets`, {
        method: "POST",
        headers: jsonHeaders("SUPER_ADMIN"),
        body: JSON.stringify({
          name: `QA BAP Printer ${Date.now().toString(36)}`,
          divisionId: "div-it",
          categoryId: "cat-it-printer",
          branchId: "branch-bogor",
          status: "ACTIVE",
          quantity: 1,
        }),
      })
    );
    bapAssetId = created?.data?.id ?? null;
    if (!bapAssetId) throw new Error(`Gagal membuat aset uji BAP: ${JSON.stringify(created)}`);

    // Ajukan BAP berupa gambar (sekaligus bahan uji kompresi FILE-02)
    const bapRes = await fetch(`${BASE_URL}/api/assets/${bapAssetId}/bap`, {
      method: "POST",
      headers: headersFor("STAFF_IT"),
      body: bapForm(fixtures.image, "image/png", "test-image.png", {
        quantity: "1",
        notes: "Submitted by QA test suite",
      }),
    });
    const bapData = await safeJson(bapRes);
    if (bapRes.status !== 201) {
      throw new Error(`BAP submission failed: ${bapRes.status} ${JSON.stringify(bapData)}`);
    }

    // Seluruh stok (1 unit) terkunci → spesifikasi & mutasi harus ditolak
    const locked = await readAsset(bapAssetId);
    const updateRes = await fetch(`${BASE_URL}/api/assets/${bapAssetId}`, {
      method: "PUT",
      headers: jsonHeaders("ADMIN_IT"),
      body: JSON.stringify({ name: "Attempting to bypass lock" }),
    });
    const transferRes = await fetch(`${BASE_URL}/api/assets/${bapAssetId}/transfer`, {
      method: "POST",
      headers: jsonHeaders("STAFF_IT"),
      body: JSON.stringify({ toBranchId: "branch-jakarta", reason: "Operational transfer" }),
    });

    const passed = locked?.status === "BAP_PENDING" && updateRes.status === 400 && transferRes.status === 400;
    recordResult(
      "BAP-01",
      "Asset BAP submission locks the asset from edits and mutations",
      passed,
      passed
        ? "Asset status BAP_PENDING, specification update blocked (400), transfer blocked (400)"
        : `Failed. Status: ${locked?.status || "Unknown"}, UpdateRes: ${updateRes.status}, TransferRes: ${transferRes.status}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recordResult("BAP-01", "Asset BAP submission locks the asset from edits and mutations", false, message);
  }

  // TC-BAP-02 — persetujuan mengurangi stok; unit tunggal menjadi BAP
  try {
    if (!bapAssetId) throw new Error("Aset uji BAP tidak tersedia (BAP-01 gagal).");
    const approveRes = await fetch(`${BASE_URL}/api/assets/${bapAssetId}/bap/approve`, {
      method: "POST",
      headers: headersFor("ADMIN_IT"),
    });
    const after = await readAsset(bapAssetId);

    const passed = approveRes.status === 200 && after?.status === "BAP" && after?.quantity === 0;
    recordResult(
      "BAP-02",
      "BAP approval decrements quantity and changes status to BAP when remaining qty is 0",
      passed,
      passed
        ? `Status: ${after.status}, Qty: ${after.quantity}`
        : `Failed. Approve status: ${approveRes.status}, Asset status: ${after?.status || "Unknown"}, Asset qty: ${after?.quantity ?? "Unknown"}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recordResult("BAP-02", "BAP approval decrements quantity and changes status to BAP when remaining qty is 0", false, message);
  }

  // TC-FILE-02 — gambar BAP dikompres ke WebP ≤ 1920px dalam struktur YYYY/MM
  try {
    if (!bapAssetId) throw new Error("Aset uji BAP tidak tersedia (BAP-01 gagal).");
    const fileUrl: string | undefined = (await readAsset(bapAssetId))?.bap?.fileUrl;
    if (!fileUrl) {
      throw new Error("No BAP file URL found on asset. Previous BAP submission/approval might have failed.");
    }

    // Diunduh lewat HTTP, bukan dibaca dari disk: berkas tersimpan di luar
    // public/ (UPLOAD_DIR server) dan hanya dilayani route ber-cek-akses.
    const fileRes = await fetch(`${BASE_URL}${fileUrl}`, { headers: headersFor("ADMIN_IT") });
    const contentType = fileRes.headers.get("content-type");
    const isWebp = fileUrl.endsWith(".webp") && contentType === "image/webp";
    const inYearMonth = /^\/uploads\/bap\/\d{4}\/\d{2}\//.test(fileUrl);
    let width = 0;
    let height = 0;

    if (fileRes.status === 200 && isWebp) {
      const sharp = (await import("sharp")).default;
      const metadata = await sharp(Buffer.from(await fileRes.arrayBuffer())).metadata();
      width = metadata.width || 0;
      height = metadata.height || 0;
    }

    const passed = fileRes.status === 200 && isWebp && inYearMonth && width <= 1920 && height <= 1920 && width > 0;
    recordResult(
      "FILE-02",
      "Image Upload: server-side compression, dimensions <= 1920px, saved as WebP in YYYY/MM structure",
      passed,
      passed
        ? `WebP saved: ${fileUrl}, dimensions: ${width}x${height}`
        : `Failed. Download: ${fileRes.status} (${contentType}), URL: ${fileUrl}, isWebp: ${isWebp}, dimensions: ${width}x${height}`
    );

    // TC-FILE-03 — dokumen BAP mengikuti cakupan aset pemiliknya (IT, Bogor)
    await runTest("FILE-03", "BAP documents are served only to users who can access the asset", async () => {
      const get = (url: string, key?: AccountKey) =>
        fetch(`${BASE_URL}${url}`, { headers: key ? headersFor(key) : {}, redirect: "manual" });
      const owner = await get(fileUrl, "STAFF_IT");
      const superAdmin = await get(fileUrl, "SUPER_ADMIN");
      const anonymous = await get(fileUrl);
      const anonymousApi = await get(fileUrl.replace(/^\/uploads\//, "/api/uploads/"));
      const otherDivision = await get(fileUrl, "ADMIN_KITCHEN");
      const otherBranch = await get(fileUrl, "ADMIN_IT_JAKARTA");
      const otherOrg = await get(fileUrl, "B_SUPER_ADMIN");
      const traversal = await get("/uploads/bap/..%2F..%2Fpackage.json", "SUPER_ADMIN");
      const divisionError = (await safeJson(otherDivision))?.error;
      const branchError = (await safeJson(otherBranch))?.error;

      const passed =
        owner.status === 200 &&
        superAdmin.status === 200 &&
        anonymous.status === 307 && (anonymous.headers.get("location") ?? "").includes("/login") &&
        anonymousApi.status === 401 &&
        otherDivision.status === 403 && divisionError === "Unauthorized cross-division access detected." &&
        otherBranch.status === 403 && branchError === "Unauthorized cross-branch access detected." &&
        otherOrg.status === 404 &&
        traversal.status === 404;
      return {
        passed,
        notes:
          `owner=${owner.status} super=${superAdmin.status} anon=${anonymous.status} anonApi=${anonymousApi.status} ` +
          `otherDivision=${otherDivision.status} otherBranch=${otherBranch.status} otherOrg=${otherOrg.status} traversal=${traversal.status}`,
      };
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recordResult("FILE-02", "Image Upload: server-side compression, dimensions <= 1920px, saved as WebP in YYYY/MM structure", false, message);
  } finally {
    if (bapAssetId) {
      await fetch(`${BASE_URL}/api/assets/${bapAssetId}`, { method: "DELETE", headers: headersFor("SUPER_ADMIN") });
    }
  }

  // TC-FILE-01 — batas ukuran PDF. BAP kecil yang berhasil dibuat ditolak lagi
  // di akhir agar laptop Dell tidak tertinggal terkunci BAP_PENDING.
  try {
    const resLarge = await fetch(`${BASE_URL}/api/assets/asset-laptop-dell-bogor/bap`, {
      method: "POST",
      headers: headersFor("STAFF_IT"),
      body: bapForm(fixtures.largePdf, "application/pdf", "test-large.pdf", { quantity: "1", notes: "large pdf test" }),
    });
    const dataLarge = await safeJson(resLarge);

    const resSmall = await fetch(`${BASE_URL}/api/assets/asset-laptop-dell-bogor/bap`, {
      method: "POST",
      headers: headersFor("STAFF_IT"),
      body: bapForm(fixtures.smallPdf, "application/pdf", "test-small.pdf", { quantity: "1", notes: "small pdf test" }),
    });
    const dataSmall = await safeJson(resSmall);

    const passed = resLarge.status === 400 && resSmall.status === 201;
    recordResult(
      "FILE-01",
      "PDF size limits: rejects PDFs > 5MB, accepts PDFs <= 5MB",
      passed,
      passed
        ? "Large (5.2MB) rejected with 400, Small accepted with 201"
        : `Failed. Large status: ${resLarge.status} (${JSON.stringify(dataLarge || {})}), Small status: ${resSmall.status} (${JSON.stringify(dataSmall || {})})`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recordResult("FILE-01", "PDF size limits: rejects PDFs > 5MB, accepts PDFs <= 5MB", false, message);
  } finally {
    await fetch(`${BASE_URL}/api/assets/asset-laptop-dell-bogor/bap/reject`, {
      method: "POST",
      headers: jsonHeaders("ADMIN_IT"),
      body: JSON.stringify({ notes: "QA cleanup FILE-01" }),
    });
  }

  // TC-BAP-03 / TC-BAP-04 — BAP parsial hanya mengunci pcs yang diajukan;
  // penolakan mengembalikannya ke bucket asal. Memakai aset seed ber-stok
  // massal "Kabel LAN Cat6 3m" (50 pcs, divisi IT) — net nol setelah tolak.
  const stockAssetId = "asset-kabel-lan-bogor";
  try {
    const before = await readAsset(stockAssetId);
    if (!before) throw new Error("Aset stok uji tidak ditemukan (jalankan seed terlebih dahulu).");

    const submitRes = await fetch(`${BASE_URL}/api/assets/${stockAssetId}/bap`, {
      method: "POST",
      headers: headersFor("ADMIN_IT"),
      body: bapForm(fixtures.smallPdf, "application/pdf", "bap-parsial.pdf", {
        quantity: "5",
        sourceCondition: "ACTIVE",
        notes: "TC-BAP-03 — 5 pcs hilang",
      }),
    });
    const afterSubmit = await readAsset(stockAssetId);

    // Sisa stok harus tetap bisa dipakai — dibuktikan dengan penyuntingan
    // spesifikasi yang seharusnya TIDAK terkunci oleh BAP parsial.
    const editRes = await fetch(`${BASE_URL}/api/assets/${stockAssetId}`, {
      method: "PUT",
      headers: jsonHeaders("ADMIN_IT"),
      body: JSON.stringify({ notes: "TC-BAP-03 — sisa stok masih dapat diedit" }),
    });

    const partialPassed =
      submitRes.status === 201 &&
      afterSubmit?.status === "ACTIVE" &&
      afterSubmit?.reservedQty === before.reservedQty + 5 &&
      afterSubmit?.activeQty === before.activeQty - 5 &&
      afterSubmit?.quantity === before.quantity &&
      editRes.status === 200 &&
      invariantHolds(afterSubmit);

    recordResult(
      "BAP-03",
      "Partial BAP reserves only the submitted pcs and leaves the rest usable",
      partialPassed,
      partialPassed
        ? `Reserved ${afterSubmit.reservedQty} pcs, aset tetap ACTIVE dengan ${afterSubmit.activeQty} pcs aktif dan tetap dapat diedit`
        : `Submit: ${submitRes.status}, edit: ${editRes.status}, stok: ${JSON.stringify(afterSubmit)}`
    );

    // TC-BAP-04 — penolakan mengembalikan pcs ke bucket asal
    const rejectRes = await fetch(`${BASE_URL}/api/assets/${stockAssetId}/bap/reject`, {
      method: "POST",
      headers: jsonHeaders("ADMIN_IT"),
      body: JSON.stringify({ notes: "TC-BAP-04 — ditolak oleh QA" }),
    });
    const afterReject = await readAsset(stockAssetId);

    const rejectPassed =
      rejectRes.status === 200 &&
      afterReject?.reservedQty === before.reservedQty &&
      afterReject?.activeQty === before.activeQty &&
      afterReject?.quantity === before.quantity &&
      invariantHolds(afterReject);

    recordResult(
      "BAP-04",
      "Rejecting a BAP returns the reserved pcs to their original stock bucket",
      rejectPassed,
      rejectPassed
        ? `Stok aktif kembali ke ${afterReject.activeQty} pcs, reservasi kosong`
        : `Reject status: ${rejectRes.status}, stok: ${JSON.stringify(afterReject)}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recordResult("BAP-03", "Partial BAP reserves only the submitted pcs and leaves the rest usable", false, message);
  }

  await runTest("ORG-05b", "Persetujuan BAP organisasi lain: 404 dan reservasi tetap", async () => {
    const approve = await fetch(`${BASE_URL}/api/assets/asset-b-laptop/bap/approve`, { method: "POST", headers: headersFor("SUPER_ADMIN") });
    const reject = await fetch(`${BASE_URL}/api/assets/asset-b-laptop/bap/reject`, { method: "POST", headers: headersFor("SUPER_ADMIN") });
    const asset = await safeJson(await fetch(`${BASE_URL}/api/assets/asset-b-laptop`, { headers: headersFor("B_SUPER_ADMIN") }));
    const passed =
      approve.status === 404 && reject.status === 404 &&
      asset?.data?.reservedQty === 1 && asset?.data?.baps?.[0]?.status === "PENDING";
    return { passed, notes: `approve=${approve.status} reject=${reject.status} reserved=${asset?.data?.reservedQty} bap=${asset?.data?.baps?.[0]?.status}` };
  });
}
