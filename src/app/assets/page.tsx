import {
  formatDate,
  ASSET_STATUS_LABELS,
  ASSET_STATUS_COLORS,
  STATUS_COLOR_FALLBACK,
  isAdminRole,
  branchScopeLabel,
} from "@/lib/utils";
import Link from "next/link";
import { Suspense } from "react";
import { Prisma, AssetStatus } from "@prisma/client";
import { getPageContext, type RequestContext } from "@/lib/auth";
import { UNASSIGNED_MESSAGE, effectiveBranchFilter, effectiveDivisionFilter } from "@/lib/scope";
import AccessDenied from "@/components/AccessDenied";
import { StockInline } from "@/components/StockSummary";

export const dynamic = "force-dynamic";

interface SearchParams {
  /** Hanya dihormati untuk outlet milik pengguna (semua outlet untuk SUPER_ADMIN) */
  branchId?: string;
  /** Hanya dihormati untuk SUPER_ADMIN — peran lain terkunci ke divisinya */
  divisionId?: string;
  categoryId?: string;
  status?: string;
  search?: string;
  page?: string;
  dateFrom?: string;
  dateTo?: string;
}

// Filter status memuat seluruh status termasuk BAP_PENDING/BAP — berbeda dengan
// form tambah/edit yang hanya boleh menawarkan EDITABLE_ASSET_STATUSES.
const ASSET_STATUSES = ["ACTIVE", "BROKEN", "REPAIR", "RETIRED", "BAP_PENDING", "BAP"];

const selectClass =
  "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-200 ease-in-out";
const labelClass = "block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5";

async function AssetListContent({
  searchParams,
  ctx,
}: {
  searchParams: SearchParams;
  ctx: RequestContext;
}) {
  const { db, scope, user } = ctx;
  const isAdmin = isAdminRole(user.role);
  const isSuperAdmin = scope.divisionId === null;
  const rawPage = parseInt(searchParams.page || "1", 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const limit = 20;
  const skip = (page - 1) * limit;

  const where: Prisma.AssetWhereInput = {};

  // Divisi & outlet — nilai dari URL hanya mempersempit, tidak pernah
  // memperluas cakupan pengguna (lihat effective*Filter di src/lib/scope.ts).
  const divisionFilter = effectiveDivisionFilter(scope, searchParams.divisionId);
  if (divisionFilter) where.divisionId = divisionFilter;
  const branchFilter = effectiveBranchFilter(scope, searchParams.branchId);
  if (branchFilter) where.branchId = { in: branchFilter };

  if (searchParams.categoryId) where.categoryId = searchParams.categoryId;
  if (searchParams.status) where.status = searchParams.status as AssetStatus;

  // Limit date search to 2010-01-01 until today
  const minDate = "2010-01-01";
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());

  let dateFrom = searchParams.dateFrom;
  let dateTo = searchParams.dateTo;

  if (dateFrom) {
    if (dateFrom < minDate) dateFrom = minDate;
    if (dateFrom > todayStr) dateFrom = todayStr;
  }
  if (dateTo) {
    if (dateTo > todayStr) dateTo = todayStr;
    if (dateTo < minDate) dateTo = minDate;
  }

  // Date range filter on createdAt
  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) {
      where.createdAt.gte = new Date(dateFrom + "T00:00:00+07:00");
    }
    if (dateTo) {
      where.createdAt.lte = new Date(dateTo + "T23:59:59+07:00");
    }
  }

  if (searchParams.search) {
    where.OR = [
      { name: { contains: searchParams.search, mode: "insensitive" } },
      { serialNumber: { contains: searchParams.search, mode: "insensitive" } },
      { brand: { contains: searchParams.search, mode: "insensitive" } },
      { model: { contains: searchParams.search, mode: "insensitive" } },
    ];
  }

  const [assets, total, branches, divisions] = await Promise.all([
    db.asset.findMany({
      where,
      include: {
        branch: { select: { id: true, name: true } },
        division: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        _count: { select: { incidents: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    db.asset.count({ where }),
    // Dropdown cabang hanya menampilkan outlet yang memang boleh dilihat —
    // menawarkan cabang lain di filter hanya akan menghasilkan hasil kosong.
    db.branch.findMany({
      where: scope.branchIds ? { id: { in: scope.branchIds } } : undefined,
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.division.findMany({
      where: scope.divisionId ? { id: scope.divisionId } : undefined,
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        categories: { orderBy: { name: "asc" }, select: { id: true, name: true } },
      },
    }),
  ]);

  const totalPages = Math.ceil(total / limit);

  // Kategori mengikuti divisi terpilih; tanpa pilihan divisi (SUPER_ADMIN),
  // semua kategori ditampilkan dengan nama divisinya agar tidak ambigu.
  const categoryOptions = divisionFilter
    ? divisions.find((d) => d.id === divisionFilter)?.categories ?? []
    : divisions.flatMap((d) => d.categories.map((c) => ({ id: c.id, name: `${c.name} (${d.name})` })));

  // Build URL helper
  function buildUrl(overrides: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    const merged = { ...searchParams, dateFrom, dateTo, ...overrides };
    Object.entries(merged).forEach(([k, v]) => {
      if (v && k !== "page") params.set(k, v);
    });
    if (overrides.page) params.set("page", overrides.page);
    return `/assets?${params.toString()}`;
  }

  const lockedBranch = scope.branchIds && branches.length === 1 ? branches[0] : null;

  return (
    <>
      {/* Filter Bar */}
      <form method="GET" action="/assets" className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
        <div className="flex flex-wrap gap-3 items-end">
          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <label className={labelClass}>Cari</label>
            <input
              type="text"
              name="search"
              defaultValue={searchParams.search || ""}
              placeholder="Nama, serial, brand, model..."
              className={`${selectClass} placeholder:text-slate-400`}
            />
          </div>

          {/* Filter Divisi — hanya SUPER_ADMIN; peran lain terkunci divisinya */}
          {isSuperAdmin && (
            <div className="min-w-[150px]">
              <label className={labelClass}>Divisi</label>
              <select name="divisionId" defaultValue={searchParams.divisionId || ""} className={selectClass}>
                <option value="">Semua Divisi</option>
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Filter Cabang — pengguna ber-outlet tunggal melihat outletnya sebagai
              keterangan mati agar jelas bahwa cakupannya memang terkunci. */}
          <div className="min-w-[160px]">
            <label className={labelClass}>Cabang</label>
            {lockedBranch ? (
              <div className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-500 bg-slate-100 flex items-center gap-1.5 cursor-not-allowed">
                <span>🏢</span>
                <span className="truncate">{lockedBranch.name}</span>
              </div>
            ) : (
              <select name="branchId" defaultValue={searchParams.branchId || ""} className={selectClass}>
                <option value="">{isSuperAdmin ? "Semua Cabang" : "Semua Outlet Saya"}</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Filter Kategori */}
          <div className="min-w-[160px]">
            <label className={labelClass}>Kategori</label>
            <select name="categoryId" defaultValue={searchParams.categoryId || ""} className={selectClass}>
              <option value="">Semua Kategori</option>
              {categoryOptions.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Filter Status */}
          <div className="min-w-[140px]">
            <label className={labelClass}>Status</label>
            <select name="status" defaultValue={searchParams.status || ""} className={selectClass}>
              <option value="">Semua Status</option>
              {ASSET_STATUSES.map((s) => (
                <option key={s} value={s}>{ASSET_STATUS_LABELS[s] || s}</option>
              ))}
            </select>
          </div>

          {/* Filter Tanggal Dari */}
          <div className="min-w-[145px]">
            <label className={labelClass}>Dari Tanggal</label>
            <input
              type="date"
              name="dateFrom"
              min={minDate}
              max={todayStr}
              defaultValue={dateFrom || ""}
              className={selectClass}
            />
          </div>

          {/* Filter Tanggal Sampai */}
          <div className="min-w-[145px]">
            <label className={labelClass}>Sampai Tanggal</label>
            <input
              type="date"
              name="dateTo"
              min={minDate}
              max={todayStr}
              defaultValue={dateTo || ""}
              className={selectClass}
            />
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              className="bg-indigo-600 text-white font-semibold px-4 py-2 rounded-lg text-sm hover:bg-indigo-700 active:scale-[0.98] transition-all duration-200 ease-in-out"
            >
              🔍 Filter
            </button>
            <Link
              href="/assets"
              className="bg-slate-100 text-slate-700 font-semibold px-4 py-2 rounded-lg text-sm hover:bg-slate-200 transition-all duration-200 ease-in-out"
            >
              Reset
            </Link>
          </div>
        </div>
      </form>

      {/* Results Info */}
      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>
          Menampilkan <strong className="text-slate-700">{assets.length}</strong> dari <strong className="text-slate-700">{total}</strong> aset
          {searchParams.search && <> untuk pencarian &ldquo;<em>{searchParams.search}</em>&rdquo;</>}
          {(dateFrom || dateTo) && (
            <span className="ml-1 text-xs bg-indigo-50 text-indigo-700 font-semibold px-2 py-0.5 rounded-full border border-indigo-100">
              📅 {dateFrom || "awal"} → {dateTo || "sekarang"}
            </span>
          )}
        </span>
        {total > 0 && (
          <span>Halaman {page} dari {totalPages}</span>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        {assets.length === 0 ? (
          <div className="py-16 text-center">
            <div className="text-5xl mb-3 opacity-60">📦</div>
            <p className="font-semibold text-slate-700">Tidak ada aset ditemukan</p>
            <p className="text-xs text-slate-400 mt-1">
              {isAdmin ? "Coba ubah filter atau tambah aset baru" : "Coba ubah filter pencarian"}
            </p>
            {/* CTA hanya untuk admin — staf tidak boleh melihat jalur ke form
                tambah aset (CLAUDE.md §2) */}
            {isAdmin && (
              <Link href="/assets/new" className="mt-4 inline-block bg-indigo-600 text-white font-semibold px-4 py-2 rounded-lg text-sm hover:bg-indigo-700 active:scale-[0.98] transition-all duration-200 ease-in-out">
                + Tambah Aset
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Nama Perangkat</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Kategori</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Serial Number</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Cabang</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Stok (Aktif / Total)</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Garansi Hingga</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Terdaftar</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Insiden</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {assets.map((asset) => {
                  const warrantyExpired = asset.warrantyDate && new Date(asset.warrantyDate) < new Date();
                  const warrantyUrgent = asset.warrantyDate && !warrantyExpired &&
                    new Date(asset.warrantyDate) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

                  return (
                    <tr key={asset.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-900">
                        <Link href={`/assets/${asset.id}`} className="hover:text-indigo-600 hover:underline">
                          {asset.name}
                        </Link>
                        {asset.brand && <span className="block text-xs text-slate-400 mt-0.5">{asset.brand} {asset.model}</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {asset.category.name}
                        {/* Nama divisi hanya relevan saat melihat lintas divisi */}
                        {isSuperAdmin && <span className="block text-xs text-slate-400 mt-0.5">{asset.division.name}</span>}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{asset.serialNumber || <span className="text-slate-300">—</span>}</td>
                      <td className="px-4 py-3 text-slate-600">{asset.branch.name}</td>
                      <td className="px-4 py-3">
                        <span className={`status-badge status-badge-sm ${ASSET_STATUS_COLORS[asset.status] || STATUS_COLOR_FALLBACK}`}>
                          {ASSET_STATUS_LABELS[asset.status] || asset.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <StockInline stock={asset} />
                      </td>
                      <td className={`px-4 py-3 text-sm font-medium ${
                        warrantyExpired ? "text-red-600" : warrantyUrgent ? "text-amber-600" : "text-slate-600"
                      }`}>
                        {asset.warrantyDate ? (
                          <span>
                            {formatDate(asset.warrantyDate)}
                            {warrantyExpired && <span className="block text-xs font-semibold text-red-500">⚠ Kadaluarsa</span>}
                            {warrantyUrgent && <span className="block text-xs font-semibold text-amber-500">⚠ Segera habis</span>}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{formatDate(asset.createdAt)}</td>
                      <td className="px-4 py-3">
                        {asset._count.incidents > 0 ? (
                          <span className="text-xs font-semibold bg-red-50 text-red-700 border border-red-100 px-2 py-0.5 rounded-full">
                            {asset._count.incidents} tiket
                          </span>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/assets/${asset.id}`}
                          className="text-indigo-600 font-semibold text-xs hover:underline"
                        >
                          Detail →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          {page > 1 && (
            <Link href={buildUrl({ page: String(page - 1) })} className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 transition font-medium text-slate-700">
              ← Sebelumnya
            </Link>
          )}
          {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={buildUrl({ page: String(p) })}
              className={`px-3 py-1.5 text-sm border rounded-lg font-medium transition ${
                p === page
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "border-slate-200 text-slate-700 hover:bg-slate-50"
              }`}
            >
              {p}
            </Link>
          ))}
          {page < totalPages && (
            <Link href={buildUrl({ page: String(page + 1) })} className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 transition font-medium text-slate-700">
              Berikutnya →
            </Link>
          )}
        </div>
      )}
    </>
  );
}

export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const [params, ctx] = await Promise.all([searchParams, getPageContext()]);

  // Cakupan pengguna: organisasi (client tenant) + divisi + outlet
  if (!ctx) {
    return (
      <AccessDenied
        message={UNASSIGNED_MESSAGE}
        backHref="/login"
        backLabel="Kembali ke Halaman Masuk"
      />
    );
  }

  const { scope, user } = ctx;
  const title = scope.divisionId ? `Daftar Aset ${user.division?.name ?? ""}` : "Daftar Semua Aset";
  const subtitle = `Kelola aset ${scope.divisionId ? `divisi ${user.division?.name ?? ""}` : "seluruh divisi"} di ${branchScopeLabel(user)}.`;

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">{title}</h1>
          <p className="text-slate-500 mt-1">{subtitle}</p>
        </div>
        {isAdminRole(user.role) && (
          <Link
            href="/assets/new"
            className="bg-indigo-600 text-white font-semibold px-4 py-2.5 rounded-xl text-sm hover:bg-indigo-700 active:scale-[0.98] transition-all duration-200 ease-in-out shadow-sm flex items-center gap-2"
          >
            <span>+</span> Tambah Aset
          </Link>
        )}
      </div>

      <Suspense fallback={
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin"></div>
        </div>
      }>
        <AssetListContent searchParams={params} ctx={ctx} />
      </Suspense>
    </div>
  );
}
