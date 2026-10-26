import { getI18n } from "@/lib/i18n/server";
import QuickStart from "@/components/QuickStart";

import PageHeading from "@/components/PageHeading";
import UiIcon from "@/components/UiIcon";
import {
  formatDate,
  daysUntilWarrantyExpires,
  ASSET_STATUS_LABELS,
  ASSET_STATUS_COLORS,
  STATUS_COLOR_FALLBACK,
  branchScopeLabel,
  divisionScopeLabel,
} from "@/lib/utils";
import Link from "next/link";
import { getPageContext } from "@/lib/auth";
import { UNASSIGNED_MESSAGE, assetRelationScopeWhere, assetScopeWhere } from "@/lib/scope";
import AccessDenied from "@/components/AccessDenied";

export const dynamic = "force-dynamic";

// Server Component default untuk fetching data
export default async function DashboardPage() {
  const { t, locale } = await getI18n();
  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Konteks request: pengguna, cakupan divisi + outlet, dan client database
  // yang terikat organisasinya. `null` = belum ditugaskan (fail closed).
  const ctx = await getPageContext();
  if (!ctx) {
    return (
      <AccessDenied
        message={UNASSIGNED_MESSAGE}
        backHref="/login"
        backLabel={t("Kembali ke Halaman Masuk")}
      />
    );
  }
  const { db, scope, user } = ctx;

  const isSuperAdmin = scope.divisionId === null;
  // Satu outlet → tampilkan namanya; beberapa outlet / SUPER_ADMIN → hitungan.
  const singleBranchName = user.branches.length === 1 ? user.branches[0].name : null;

  // Base filter (divisi + outlet) untuk semua query aset
  const inventoryFilter = assetScopeWhere(scope);
  // Filter setara untuk tabel yang menggantung pada aset (Incident)
  const incidentScope = assetRelationScopeWhere(scope);

  // Satu Promise.all untuk semua query — lebih efisien
  const [
    totalAssets,
    stockTotals,
    totalBranches,
    unresolvedIncidents,
    expiringAssets,
    brokenAssetsPending,
    slaOverdueIncidents,
    divisionBreakdown,
    divisions,
  ] = await Promise.all([
    // Statistik — difilter berdasarkan divisi + outlet
    db.asset.count({ where: { ...inventoryFilter } }),
    // Angka kondisi dijumlahkan dalam satuan pcs, bukan jumlah baris aset: satu
    // item "Sumpit Kayu" bisa berisi 92 pcs aktif dan 8 pcs rusak sekaligus,
    // sehingga menghitung per baris akan menyembunyikan kerusakan sebagian.
    db.asset.aggregate({
      where: { ...inventoryFilter },
      _sum: {
        activeQty: true,
        brokenQty: true,
        repairQty: true,
        retiredQty: true,
      },
    }),
    // Pengguna ber-outlet hanya menghitung outletnya sendiri
    db.branch.count({
      where: scope.branchIds ? { id: { in: scope.branchIds } } : undefined,
    }),
    // Insiden unresolved — difilter via relasi asset (divisi + outlet)
    db.incident.count({
      where: {
        resolvedAt: null,
        ...incidentScope,
      },
    }),

    // Alert 1: Garansi Expiring (≤ 30 hari) — difilter divisi + outlet
    db.asset.findMany({
      where: {
        ...inventoryFilter,
        warrantyDate: { not: null, lte: thirtyDaysFromNow },
        status: { not: "RETIRED" },
      },
      include: { branch: { select: { id: true, name: true } } },
      orderBy: { warrantyDate: "asc" },
    }),

    // Alert 2: Broken Asset Pending — ada stok rusak namun belum ada tiket
    // insiden sama sekali. Diperiksa lewat `brokenQty`, bukan status headline:
    // item dengan 92 pcs aktif + 8 pcs rusak berstatus ACTIVE dan akan luput
    // bila alert ini hanya melihat status.
    db.asset.findMany({
      where: {
        ...inventoryFilter,
        brokenQty: { gt: 0 },
        incidents: { none: {} },
      },
      include: {
        branch: { select: { id: true, name: true } },
        category: { select: { name: true } },
      },
      orderBy: { updatedAt: "desc" },
    }),

    // Alert 3: Insiden lebih dari 7 hari (Tiket insiden unresolved > 7 hari)
    db.incident.findMany({
      where: {
        resolvedAt: null,
        reportedAt: { lt: sevenDaysAgo },
        ...incidentScope,
      },
      include: {
        asset: {
          select: {
            id: true,
            name: true,
            branch: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { reportedAt: "asc" },
    }),

    // Ringkasan per divisi — hanya untuk SUPER_ADMIN (lintas divisi). Angka
    // kondisi dijumlahkan dalam pcs, bukan jumlah baris aset.
    isSuperAdmin
      ? db.asset.groupBy({
          by: ["divisionId"],
          where: inventoryFilter,
          _count: { id: true },
          _sum: { activeQty: true, brokenQty: true, repairQty: true },
        })
      : Promise.resolve([]),
    isSuperAdmin
      ? db.division.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
  ]);

  const activeAssets = stockTotals._sum.activeQty ?? 0;
  const brokenAssets = stockTotals._sum.brokenQty ?? 0;
  const repairAssets = stockTotals._sum.repairQty ?? 0;
  const retiredAssets = stockTotals._sum.retiredQty ?? 0;

  // Cek apakah ada peringatan kritis aktif
  const hasAlerts = expiringAssets.length > 0 || brokenAssetsPending.length > 0 || slaOverdueIncidents.length > 0;

  // Label cakupan: divisi pengguna (atau "Semua Divisi") dan wilayah outletnya,
  // agar angka pada kartu tidak salah dibaca sebagai angka seluruh organisasi.
  const divisionLabel = divisionScopeLabel(user, locale);
  const dashboardSubtitle = t("Status real-time operasional aset {0} di {1}.", [divisionLabel, branchScopeLabel(user, locale)]);
  const branchBadge = isSuperAdmin
    ? t("Semua Outlet")
    : user.branches.map((b) => b.name).join(", ");

  // Divisi tanpa aset tetap tampil (angka nol) agar Super Admin melihat
  // seluruh divisi organisasinya dalam satu tabel.
  const divisionRows = divisions.map((division) => {
    const group = divisionBreakdown.find((g) => g.divisionId === division.id);
    return {
      id: division.id,
      name: division.name,
      items: group?._count.id ?? 0,
      active: group?._sum.activeQty ?? 0,
      broken: group?._sum.brokenQty ?? 0,
      repair: group?._sum.repairQty ?? 0,
    };
  });

  return (
    <div className="space-y-8 animate-fade-in">

      {/* Welcome & Title */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <PageHeading eyebrow={t("Ruang kerja")} title={<>{t("Ringkasan inventaris")}</>} description={<>{dashboardSubtitle}</>} />
        {/* Badge divisi + outlet aktif */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border ${
            isSuperAdmin
              ? "bg-purple-50 text-purple-700 border-purple-200"
              : "bg-indigo-50 text-indigo-700 border-indigo-200"
          }`}>
            <span><UiIcon name="layers" className="inline-block align-middle" /></span>{t("Divisi:")}{" "}{divisionLabel}
          </span>
          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border ${
            isSuperAdmin
              ? "bg-purple-50 text-purple-700 border-purple-200"
              : "bg-emerald-50 text-emerald-700 border-emerald-200/60"
          }`}>
            <span><UiIcon name="building" className="inline-block align-middle" /></span>{t("Outlet:")}{" "}{branchBadge}
          </span>
        </div>
      </div>

      <QuickStart canCreate={user.role === "SUPER_ADMIN" || user.role === "DIVISION_ADMIN"} />

      {/* Grid Statistik Ringkasan */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

        {/* Card 1: Total Aset */}
        <div className="ui-panel bg-white border border-slate-200 rounded-xl p-5 shadow-xs relative overflow-hidden transition hover:shadow-md">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t("Total Item")}{" "}{divisionLabel}</p>
              <h3 className="text-3xl font-extrabold text-slate-900 mt-2">{totalAssets}</h3>
            </div>
            <span className="text-2xl p-2 bg-indigo-50 rounded-lg"><UiIcon name="box" className="inline-block align-middle" /></span>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
            <span>{t("Aktif:")}{" "}<strong className="text-green-600 font-semibold">{activeAssets}</strong> pcs</span>
            <span>{t("Perbaikan:")}{" "}<strong className="text-amber-500 font-semibold">{repairAssets}</strong> pcs</span>
            <span>{t("Tidak digunakan:")}{" "}<strong>{retiredAssets}</strong> pcs</span>
          </div>
        </div>

        {/* Card 2: Status Kerusakan */}
        <div className="ui-panel bg-white border border-slate-200 rounded-xl p-5 shadow-xs relative overflow-hidden transition hover:shadow-md">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t("Stok rusak")}</p>
              <h3 className="text-3xl font-extrabold text-slate-900 mt-2">
                {brokenAssets}
                <span className="text-base font-semibold text-slate-400 ml-1.5">pcs</span>
              </h3>
            </div>
            <span className="text-2xl p-2 bg-red-50 rounded-lg"><UiIcon name="warning" className="inline-block align-middle" /></span>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
            <span>{t("Menunggu penanganan &amp; perbaikan")}</span>
          </div>
        </div>

        {/* Card 3: Cabang */}
        <div className="ui-panel bg-white border border-slate-200 rounded-xl p-5 shadow-xs relative overflow-hidden transition hover:shadow-md">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {isSuperAdmin ? t("Total Cabang") : t("Outlet Anda")}
              </p>
              {/* Pengguna ber-outlet tunggal melihat NAMA outletnya, bukan angka
                  "1" yang tidak memberi informasi apa pun */}
              {singleBranchName && !isSuperAdmin ? (
                <h3 className="text-xl font-extrabold text-slate-900 mt-2 leading-snug">{singleBranchName}</h3>
              ) : (
                <h3 className="text-3xl font-extrabold text-slate-900 mt-2">{totalBranches}</h3>
              )}
            </div>
            <span className="text-2xl p-2 bg-blue-50 rounded-lg"><UiIcon name="building" className="inline-block align-middle" /></span>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500">
            <span>
              {isSuperAdmin
                ? t("Tersebar di seluruh area operasional")
                : t("Seluruh angka di halaman ini hanya mencakup outlet Anda")}
            </span>
          </div>
        </div>

        {/* Card 4: Insiden Unresolved */}
        <div className="ui-panel bg-white border border-slate-200 rounded-xl p-5 shadow-xs relative overflow-hidden transition hover:shadow-md">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t("Tiket Insiden Aktif")}</p>
              <h3 className="text-3xl font-extrabold text-slate-900 mt-2">{unresolvedIncidents}</h3>
            </div>
            <span className="text-2xl p-2 bg-amber-50 rounded-lg"><UiIcon name="tool" className="inline-block align-middle" /></span>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500 flex flex-wrap gap-2 items-center justify-between">
            <span>{t("Belum selesai diperbaiki")}</span>
            <Link href="/incidents" className="text-indigo-600 font-semibold hover:underline">{t("Lihat Semua →")}</Link>
          </div>
        </div>

      </div>

      {/* Ringkasan per Divisi — hanya SUPER_ADMIN (pengguna divisi hanya
          melihat divisinya sendiri, jadi tabel ini tidak memberi informasi) */}
      {isSuperAdmin && divisionRows.length > 0 && (
        <div className="ui-panel bg-white border border-slate-200/80 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-slate-900">{t("Ringkasan per Divisi")}</h2>
            <Link href="/divisions" className="text-xs font-semibold text-indigo-600 hover:underline">{t("Kelola Divisi →")}</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="inventory-table w-full text-left text-sm">
              <thead>
                <tr className="text-xs text-slate-500 uppercase tracking-wider border-b border-slate-100">
                  <th className="py-2 font-semibold">{t("Divisi")}</th>
                  <th className="py-2 font-semibold text-right">Item</th>
                  <th className="py-2 font-semibold text-right">{t("Aktif (pcs)")}</th>
                  <th className="py-2 font-semibold text-right">{t("Rusak (pcs)")}</th>
                  <th className="py-2 font-semibold text-right">{t("Perbaikan (pcs)")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {divisionRows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50 transition-all duration-200 ease-in-out">
                    <td className="py-2.5 font-medium text-slate-900">
                      <Link href={`/assets?divisionId=${row.id}`} className="hover:text-indigo-600 hover:underline">
                        {row.name}
                      </Link>
                    </td>
                    <td className="py-2.5 text-right text-slate-700">{row.items}</td>
                    <td className="py-2.5 text-right text-emerald-700 font-semibold">{row.active}</td>
                    <td className={`py-2.5 text-right font-semibold ${row.broken > 0 ? "text-rose-700" : "text-slate-400"}`}>{row.broken}</td>
                    <td className={`py-2.5 text-right font-semibold ${row.repair > 0 ? "text-amber-700" : "text-slate-400"}`}>{row.repair}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Widget Alerts / Peringatan Sistem */}
      <div className="ui-panel bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <span className="text-xl"><UiIcon name="warning" className="inline-block align-middle" /></span>
            <h2 className="text-lg font-bold text-slate-900">{t("Perlu perhatian ·")}{" "}{divisionLabel}
            </h2>
          </div>
          {!hasAlerts && (
            <span className="text-xs bg-green-50 text-green-700 font-semibold px-2.5 py-1 rounded-full border border-green-200">{t("Sistem Normal")}{" "}<UiIcon name="check" className="inline-block align-middle" />
            </span>
          )}
        </div>

        {/* Jika tidak ada alert sama sekali */}
        {!hasAlerts && (
          <div className="py-8 text-center text-slate-500">
            <div className="text-4xl mb-2">🎉</div>
            <p className="font-semibold text-slate-700">{t("Semua aman &amp; terkendali!")}</p>
            <p className="text-xs text-slate-400 mt-1">{t("Tidak ada isu garansi, insiden yang melewati 7 hari, atau perangkat rusak tanpa tiket insiden saat ini.")}</p>
          </div>
        )}

        {/* 1. ALERT: BROKEN ASSET PENDING */}
        {brokenAssetsPending.length > 0 && (
          <div className="border border-red-200 rounded-lg bg-red-50/50 overflow-hidden">
            <div className="bg-red-50 border-b border-red-200 px-4 py-3 flex items-center gap-2.5">
              <span className="text-red-600 text-lg"><UiIcon name="warning" className="inline-block align-middle" /></span>
              <div>
                <h3 className="font-bold text-red-900 text-sm">{t("Aset rusak tanpa tiket (")}{brokenAssetsPending.length}{" "}{t("Perangkat)")}</h3>
                <p className="text-xs text-red-700">{t("Aset berstatus RUSAK (BROKEN) namun belum terdaftar di tiket insiden manapun.")}</p>
              </div>
            </div>
            <div className="p-4 overflow-x-auto">
              <table className="inventory-table w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="text-slate-500 border-b border-red-100">
                    <th className="pb-2 font-semibold uppercase tracking-wider">{t("Nama Perangkat")}</th>
                    <th className="pb-2 font-semibold uppercase tracking-wider">{t("Kategori")}</th>
                    <th className="pb-2 font-semibold uppercase tracking-wider">{t("Cabang")}</th>
                    <th className="pb-2 font-semibold uppercase tracking-wider">Serial Number</th>
                    <th className="pb-2 font-semibold uppercase tracking-wider text-right">{t("Aksi")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-red-50">
                  {brokenAssetsPending.map((asset) => (
                    <tr key={asset.id} className="text-slate-700 hover:bg-red-50/70 transition">
                      <td className="py-2.5 font-medium text-slate-900">
                        <Link href={`/assets/${asset.id}`} className="hover:underline hover:text-red-700">
                          {asset.name}
                        </Link>
                      </td>
                      <td className="py-2.5">{asset.category.name}</td>
                      <td className="py-2.5">{asset.branch.name}</td>
                      <td className="py-2.5 font-mono">{asset.serialNumber || "-"}</td>
                      <td className="py-2.5 text-right">
                        <Link
                          href={`/incidents?createAssetId=${asset.id}`}
                          className="inline-block bg-red-600 text-white font-semibold px-3 py-1 rounded-md text-xs hover:bg-red-700 transition"
                        >
                          <UiIcon name="tool" className="inline-block align-middle" />{" "}{t("Buat Tiket")}</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 2. ALERT: SLA OVERDUE */}
        {slaOverdueIncidents.length > 0 && (
          <div className="border border-amber-200 rounded-lg bg-amber-50/50 overflow-hidden">
            <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 flex items-center gap-2.5">
              <span className="text-amber-600 text-lg"><UiIcon name="tool" className="inline-block align-middle" /></span>
              <div>
                <h3 className="font-bold text-amber-900 text-sm">{t("Insiden lebih dari 7 hari (")}{slaOverdueIncidents.length}{" "}{t("Tiket)")}</h3>
                <p className="text-xs text-amber-700">{t("Tiket insiden aktif yang sudah berjalan lebih dari 7 hari namun belum selesai diperbaiki (resolved).")}</p>
              </div>
            </div>
            <div className="p-4 overflow-x-auto">
              <table className="inventory-table w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="text-slate-500 border-b border-amber-100">
                    <th className="pb-2 font-semibold uppercase tracking-wider">{t("Perangkat")}</th>
                    <th className="pb-2 font-semibold uppercase tracking-wider">{t("Cabang")}</th>
                    <th className="pb-2 font-semibold uppercase tracking-wider">{t("Keluhan Kerusakan")}</th>
                    <th className="pb-2 font-semibold uppercase tracking-wider">{t("Tanggal Lapor")}</th>
                    <th className="pb-2 font-semibold uppercase tracking-wider">{t("Durasi Aktif")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-50">
                  {slaOverdueIncidents.map((incident) => {
                    const daysActive = Math.floor((now.getTime() - new Date(incident.reportedAt).getTime()) / (1000 * 60 * 60 * 24));
                    return (
                      <tr key={incident.id} className="text-slate-700 hover:bg-amber-50/70 transition">
                        <td className="py-2.5 font-medium text-slate-900">
                          <Link href={`/assets/${incident.asset.id}`} className="hover:underline hover:text-amber-700">
                            {incident.asset.name}
                          </Link>
                        </td>
                        <td className="py-2.5">{incident.asset.branch.name}</td>
                        <td className="py-2.5 truncate max-w-xs">{incident.description}</td>
                        <td className="py-2.5">{formatDate(incident.reportedAt, locale)}</td>
                        <td className="py-2.5">
                          <span className="bg-amber-100 text-amber-950 font-bold px-2 py-0.5 rounded-full border border-amber-300">
                            {daysActive}{" "}{t("Hari")}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 3. ALERT: GARANSI EXPIRING */}
        {expiringAssets.length > 0 && (
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center gap-2.5">
              <span className="text-slate-600 text-lg"><UiIcon name="warning" className="inline-block align-middle" /></span>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">{t("Garansi perlu diperiksa (")}{expiringAssets.length}{" "}{t("Aset)")}</h3>
                <p className="text-xs text-slate-500">{t("Aset dengan masa garansi habis dalam ≤ 30 hari ke depan (termasuk yang sudah habis).")}</p>
              </div>
            </div>
            <div className="p-4 overflow-x-auto">
              <table className="inventory-table w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-100">
                    <th className="pb-2 font-semibold uppercase tracking-wider">{t("Nama Perangkat")}</th>
                    <th className="pb-2 font-semibold uppercase tracking-wider">{t("Cabang")}</th>
                    <th className="pb-2 font-semibold uppercase tracking-wider">{t("Status Aset")}</th>
                    <th className="pb-2 font-semibold uppercase tracking-wider">{t("Batas Garansi")}</th>
                    <th className="pb-2 font-semibold uppercase tracking-wider">{t("Sisa Hari")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {expiringAssets.map((asset) => {
                    const daysRemaining = daysUntilWarrantyExpires(asset.warrantyDate);
                    const isExpired = daysRemaining !== null && daysRemaining <= 0;

                    // Skala pastel sesuai panduan warna (CLAUDE.md §7.A):
                    // aman → emerald, mendekati habis → amber, kadaluarsa → rose
                    let bgClass = "bg-emerald-50 text-emerald-700 border-emerald-200/60";
                    let label = t("{0} Hari", [daysRemaining]);

                    if (isExpired) {
                      bgClass = "bg-rose-50 text-rose-700 border-rose-200/60";
                      label = t("Expired ({0} hari lalu)", [Math.abs(daysRemaining || 0)]);
                    } else if (daysRemaining !== null && daysRemaining <= 30) {
                      bgClass = "bg-amber-50 text-amber-700 border-amber-200/60";
                    }

                    return (
                      <tr key={asset.id} className="text-slate-700 hover:bg-slate-50/70 transition">
                        <td className="py-2.5 font-medium text-slate-900">
                          <Link href={`/assets/${asset.id}`} className="hover:underline">
                            {asset.name}
                          </Link>
                        </td>
                        <td className="py-2.5">{asset.branch.name}</td>
                        <td className="py-2.5">
                          <span className={`status-badge status-badge-sm ${ASSET_STATUS_COLORS[asset.status] || STATUS_COLOR_FALLBACK}`}>
                            {t(ASSET_STATUS_LABELS[asset.status] || asset.status)}
                          </span>
                        </td>
                        <td className="py-2.5 font-semibold">{formatDate(asset.warrantyDate, locale)}</td>
                        <td className="py-2.5">
                          <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded-md border ${bgClass}`}>
                            {label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
