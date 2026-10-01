import { NextRequest } from "next/server";
import { successResponse, errorResponse } from "@/lib/utils";
import { assetRelationScopeWhere, assetScopeWhere } from "@/lib/scope";
import { requireUserScope } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/reports/summary — Statistik aset per kategori, divisi, status, dan cabang
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireUserScope(request);
    if (!ctx.ok) return ctx.response;
    const { db, scope } = ctx;

    // Cakupan divisi + outlet, dipakai konsisten oleh SEMUA agregat di bawah
    const scopeFilter = assetScopeWhere(scope);
    const incidentScope = assetRelationScopeWhere(scope);
    const branchWhere = scope.branchIds ? { id: { in: scope.branchIds } } : undefined;

    // Aset berstatus BAP sudah dihapus/diarsipkan permanen dan dikeluarkan dari
    // perhitungan aktif (CLAUDE.md §4.B.3) — sama seperti /api/branches. Tanpa
    // filter ini, cabang yang sama menampilkan dua angka berbeda antara halaman
    // Cabang dan halaman Laporan. BAP_PENDING tetap dihitung karena pengajuannya
    // masih bisa ditolak dan asetnya kembali aktif.
    const activeAssetFilter = {
      ...scopeFilter,
      status: { not: "BAP" as const },
    };

    const [
      totalAssets,
      assetsByCategory,
      assetsByDivision,
      assetsByStatus,
      assetsByBranch,
      totalBranches,
      totalIncidents,
      unresolvedIncidents,
      overdueIncidents,
      expiringWarranties,
      bapPending,
    ] = await Promise.all([
      db.asset.count({ where: activeAssetFilter }),
      db.asset.groupBy({
        by: ["categoryId"],
        where: activeAssetFilter,
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
      }),
      db.asset.groupBy({
        by: ["divisionId"],
        where: activeAssetFilter,
        _count: { id: true },
      }),
      db.asset.groupBy({
        by: ["status"],
        where: activeAssetFilter,
        _count: { id: true },
      }),
      // Rincian & hitungan cabang mengikuti outlet pengguna: pengguna ber-outlet
      // melihat outlet miliknya, Super Admin melihat seluruh cabang organisasi.
      db.branch.findMany({
        where: branchWhere,
        select: {
          id: true,
          name: true,
          _count: {
            select: { assets: { where: activeAssetFilter } },
          },
        },
        orderBy: { name: "asc" },
      }),
      db.branch.count({ where: branchWhere }),
      db.incident.count({
        where: incidentScope,
      }),
      db.incident.count({
        where: { resolvedAt: null, ...incidentScope },
      }),
      // SLA overdue: insiden aktif > 7 hari
      db.incident.count({
        where: {
          resolvedAt: null,
          reportedAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          ...incidentScope,
        },
      }),
      // Warranty expiring in 30 days
      db.asset.count({
        where: {
          ...scopeFilter,
          warrantyDate: {
            not: null,
            lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            gt: new Date(),
          },
          status: { notIn: ["RETIRED", "BAP"] },
        },
      }),
      // BAP menunggu persetujuan — dihitung dari baris pengajuan, bukan dari
      // status aset: BAP parsial (mis. 10 dari 100 pcs) menyisakan aset dengan
      // status ACTIVE sehingga menghitung lewat status akan melewatkannya.
      db.bap.count({
        where: { status: "PENDING", ...incidentScope },
      }),
    ]);

    // Nama kategori & divisi dimuat terpisah — groupBy hanya mengembalikan ID.
    const [categoryNames, divisionNames] = await Promise.all([
      db.category.findMany({
        where: { id: { in: assetsByCategory.map((g) => g.categoryId) } },
        select: { id: true, name: true, division: { select: { name: true } } },
      }),
      db.division.findMany({
        where: { id: { in: assetsByDivision.map((g) => g.divisionId) } },
        select: { id: true, name: true },
      }),
    ]);
    const nameOf = (rows: { id: string; name: string }[], id: string) =>
      rows.find((row) => row.id === id)?.name ?? id;

    return successResponse(
      {
        totalAssets,
        totalBranches,
        totalIncidents,
        unresolvedIncidents,
        overdueIncidents,
        expiringWarranties,
        bapPending,
        // Nama kategori hanya unik di dalam satu divisi ("Lain-lain" bisa ada
        // di setiap divisi) — nama divisi ikut dikirim sebagai pembeda.
        assetsByCategory: assetsByCategory.map((item) => ({
          categoryId: item.categoryId,
          name: nameOf(categoryNames, item.categoryId),
          divisionName: categoryNames.find((row) => row.id === item.categoryId)?.division.name ?? null,
          count: item._count.id,
        })),
        assetsByDivision: assetsByDivision.map((item) => ({
          divisionId: item.divisionId,
          name: nameOf(divisionNames, item.divisionId),
          count: item._count.id,
        })),
        assetsByStatus: assetsByStatus.map((item) => ({
          status: item.status,
          count: item._count.id,
        })),
        assetsByBranch: assetsByBranch.map((branch) => ({
          id: branch.id,
          name: branch.name,
          assetCount: branch._count.assets,
        })),
      },
      "Ringkasan statistik berhasil diambil"
    );
  } catch (error) {
    console.error("Get summary report error:", error);
    return errorResponse("Terjadi kesalahan server", "Gagal mengambil ringkasan", 500);
  }
}
