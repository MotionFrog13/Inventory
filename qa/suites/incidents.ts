import {
  BASE_URL,
  headersFor,
  invariantHolds,
  jsonHeaders,
  qaDb,
  readAsset,
  recordResult,
  safeJson,
} from "../context";

export async function run() {
  // TC-INC-01 — resolusi dengan status BROKEN tersimpan dan diterapkan ke aset.
  // asset-cctv-bogor berstatus ACTIVE tanpa insiden, jadi transisi ACTIVE →
  // BROKEN benar-benar teruji; aset dikembalikan ke ACTIVE di akhir agar suite
  // dapat diulang tanpa seed ulang.
  const cctvId = "asset-cctv-bogor";
  try {
    const createRes = await fetch(`${BASE_URL}/api/incidents`, {
      method: "POST",
      headers: jsonHeaders("ADMIN_IT"),
      body: JSON.stringify({ assetId: cctvId, description: "TC-INC-01 kerusakan uji coba" }),
    });
    const incidentId = (await safeJson(createRes))?.data?.id;
    if (!incidentId) throw new Error(`No incident ID returned (status ${createRes.status}).`);

    const resolveRes = await fetch(`${BASE_URL}/api/incidents/${incidentId}`, {
      method: "PUT",
      headers: jsonHeaders("ADMIN_IT"),
      body: JSON.stringify({
        action: "resolve",
        solution: "Diagnosa selesai, sparepart belum tersedia",
        assetStatus: "BROKEN",
      }),
    });
    const resolveData = await safeJson(resolveRes);
    const assetStatus = (await readAsset(cctvId))?.status;

    const passed = resolveRes.status === 200 && !!resolveData?.data?.resolvedAt && assetStatus === "BROKEN";
    recordResult(
      "INC-01",
      "Resolving an incident with assetStatus BROKEN persists and updates the asset",
      passed,
      passed
        ? "Incident resolved and asset status remained BROKEN"
        : `Resolve status: ${resolveRes.status}, resolvedAt: ${resolveData?.data?.resolvedAt}, asset status: ${assetStatus}`
    );

    // Bersihkan agar tidak mengotori test berikutnya
    await fetch(`${BASE_URL}/api/incidents/${incidentId}`, {
      method: "DELETE",
      headers: headersFor("SUPER_ADMIN"),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recordResult("INC-01", "Resolving an incident with assetStatus BROKEN persists and updates the asset", false, message);
  } finally {
    // Unit tunggal tanpa reservasi boleh diset status manual (CLAUDE.md §3).
    await fetch(`${BASE_URL}/api/assets/${cctvId}`, {
      method: "PUT",
      headers: jsonHeaders("ADMIN_IT"),
      body: JSON.stringify({ status: "ACTIVE" }),
    });
  }

  // TC-INC-02 — staf tidak boleh menyetujui pengajuan penyelesaian insiden.
  // Memakai insiden nyata di cakupan STAFF_IT (IT, Bogor): ID fiktif hanya
  // membuktikan 404 dari pengecekan keberadaan, bukan pengecekan peran.
  const pcIncidentId = "incident-pc-bogor";
  try {
    const snapshot = () =>
      qaDb().incident.findUnique({
        where: { id: pcIncidentId },
        select: { resolvedAt: true, resolveStatus: true, solution: true },
      });
    const before = await snapshot();
    const res = await fetch(`${BASE_URL}/api/incidents/${pcIncidentId}`, {
      method: "PUT",
      headers: jsonHeaders("STAFF_IT"),
      body: JSON.stringify({ action: "approve" }),
    });
    const after = await snapshot();
    const unchanged = before !== null && JSON.stringify(before) === JSON.stringify(after);

    const passed = res.status === 403 && unchanged;
    recordResult(
      "INC-02",
      "Staff (STAFF_IT) cannot approve an incident resolution",
      passed,
      passed
        ? "Correctly blocked with 403, incident unchanged"
        : `Status: ${res.status}, insiden ${before ? (unchanged ? "tidak berubah" : "BERUBAH") : "tidak ditemukan di seed"}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recordResult("INC-02", "Staff (STAFF_IT) cannot approve an incident resolution", false, message);
  }

  // TC-BR-05 — melaporkan insiden atas aset outlet lain ditolak 403
  try {
    const res = await fetch(`${BASE_URL}/api/incidents`, {
      method: "POST",
      headers: jsonHeaders("ADMIN_IT_JAKARTA"),
      body: JSON.stringify({
        assetId: "asset-laptop-dell-bogor",
        description: "QA cross-branch incident",
        quantity: 1,
      }),
    });
    const data = await safeJson(res);

    const passed = res.status === 403;
    recordResult(
      "BR-05",
      "Reporting an incident on another outlet's asset returns 403",
      passed,
      passed ? "403 ditolak" : `Status: ${res.status}, error: ${data?.error ?? "-"}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recordResult("BR-05", "Reporting an incident on another outlet's asset returns 403", false, message);
  }

  // ═══════════════════════════════════════════════════════════════════
  // Stok per kondisi (CLAUDE.md §6.F) — memakai aset seed ber-stok massal
  // "Kabel LAN Cat6 3m" (50 pcs, divisi IT) agar ADMIN_IT berwenang penuh.
  // ═══════════════════════════════════════════════════════════════════
  const stockAssetId = "asset-kabel-lan-bogor";

  // TC-STOCK-01 / TC-STOCK-02 — kerusakan sebagian tidak menonaktifkan item
  let stockIncidentId: string | null = null;
  try {
    const before = await readAsset(stockAssetId);
    if (!before) throw new Error("Aset stok uji tidak ditemukan (jalankan seed terlebih dahulu).");

    const createRes = await fetch(`${BASE_URL}/api/incidents`, {
      method: "POST",
      headers: jsonHeaders("ADMIN_IT"),
      body: JSON.stringify({
        assetId: stockAssetId,
        quantity: 8,
        description: "TC-STOCK-01 — 8 pcs kabel putus",
      }),
    });
    stockIncidentId = (await safeJson(createRes))?.data?.id ?? null;
    const afterReport = await readAsset(stockAssetId);

    const reportPassed =
      createRes.status === 201 &&
      afterReport?.activeQty === before.activeQty - 8 &&
      afterReport?.brokenQty === before.brokenQty + 8 &&
      afterReport?.quantity === before.quantity &&
      afterReport?.status === "ACTIVE" &&
      invariantHolds(afterReport);

    recordResult(
      "STOCK-01",
      "Partial breakage keeps the item ACTIVE with a reduced active stock count",
      reportPassed,
      reportPassed
        ? `Aktif ${before.activeQty} → ${afterReport.activeQty}, rusak ${afterReport.brokenQty}, status tetap ACTIVE`
        : `Report status: ${createRes.status}, stok: ${JSON.stringify(afterReport)}`
    );

    // TC-STOCK-02 — resolusi ACTIVE mengembalikan pcs ke stok siap pakai
    if (stockIncidentId) {
      const resolveRes = await fetch(`${BASE_URL}/api/incidents/${stockIncidentId}`, {
        method: "PUT",
        headers: jsonHeaders("ADMIN_IT"),
        body: JSON.stringify({
          action: "resolve",
          solution: "Kabel diganti dengan stok cadangan",
          assetStatus: "ACTIVE",
        }),
      });
      const afterResolve = await readAsset(stockAssetId);

      const resolvePassed =
        resolveRes.status === 200 &&
        afterResolve?.activeQty === before.activeQty &&
        afterResolve?.brokenQty === before.brokenQty &&
        invariantHolds(afterResolve);

      recordResult(
        "STOCK-02",
        "Resolving an incident as ACTIVE returns the reported pcs to usable stock",
        resolvePassed,
        resolvePassed
          ? `Stok aktif kembali ke ${afterResolve.activeQty} pcs`
          : `Resolve status: ${resolveRes.status}, stok: ${JSON.stringify(afterResolve)}`
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recordResult("STOCK-01", "Partial breakage keeps the item ACTIVE with a reduced active stock count", false, message);
  }

  // TC-STOCK-03 / TC-STOCK-04 — validasi batas stok & status manual
  try {
    const current = await readAsset(stockAssetId);

    const overRes = await fetch(`${BASE_URL}/api/incidents`, {
      method: "POST",
      headers: jsonHeaders("ADMIN_IT"),
      body: JSON.stringify({
        assetId: stockAssetId,
        quantity: current.quantity + 10,
        description: "TC-STOCK-03 — jumlah melebihi stok",
      }),
    });

    const statusRes = await fetch(`${BASE_URL}/api/assets/${stockAssetId}`, {
      method: "PUT",
      headers: jsonHeaders("ADMIN_IT"),
      body: JSON.stringify({ status: "BROKEN" }),
    });

    const shrinkRes = await fetch(`${BASE_URL}/api/assets/${stockAssetId}`, {
      method: "PUT",
      headers: jsonHeaders("ADMIN_IT"),
      body: JSON.stringify({ quantity: 0 }),
    });

    const after = await readAsset(stockAssetId);
    const passed =
      overRes.status === 400 &&
      statusRes.status === 400 &&
      shrinkRes.status === 400 &&
      invariantHolds(after);

    recordResult(
      "STOCK-03",
      "Stock guards reject over-reporting, manual status on bulk items, and invalid totals",
      passed,
      passed
        ? "Ketiganya ditolak 400 dan invariant stok tetap utuh"
        : `Over: ${overRes.status}, status manual: ${statusRes.status}, total invalid: ${shrinkRes.status}, stok: ${JSON.stringify(after)}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recordResult("STOCK-03", "Stock guards reject over-reporting, manual status on bulk items, and invalid totals", false, message);
  }

  // Bersihkan insiden stok (sudah selesai → penghapusan tidak memindahkan pcs)
  if (stockIncidentId) {
    await fetch(`${BASE_URL}/api/incidents/${stockIncidentId}`, {
      method: "DELETE",
      headers: headersFor("SUPER_ADMIN"),
    });
  }
}
