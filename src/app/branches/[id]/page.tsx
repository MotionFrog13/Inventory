
import PageHeading from "@/components/PageHeading";
import GuideCard from "@/components/GuideCard";
import UiIcon from "@/components/UiIcon";
import { notFound } from "next/navigation";
import {
  ASSET_STATUS_LABELS,
  ASSET_STATUS_COLORS,
  STATUS_COLOR_FALLBACK,
  isAdminRole,
} from "@/lib/utils";
import { getPageContext } from "@/lib/auth";
import { UNASSIGNED_MESSAGE, assetScopeWhere } from "@/lib/scope";
import AccessDenied from "@/components/AccessDenied";
import { StockInline } from "@/components/StockSummary";
import Link from "next/link";

export const dynamic = "force-dynamic";

function formatDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("id-ID", {
    day: "numeric", month: "short", year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

export default async function BranchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Pemisahan organisasi, divisi & outlet (CLAUDE.md §2) — halaman ini query
  // database langsung, jadi filter yang sama seperti di /api/branches/[id]
  // wajib diterapkan pada daftar aset MAUPUN pada _count, agar jumlah aset
  // divisi atau outlet lain tidak bocor.
  const ctx = await getPageContext();
  if (!ctx) {
    return (
      <AccessDenied
        message={UNASSIGNED_MESSAGE}
        backHref="/login"
        backLabel="Kembali ke Halaman Masuk"
      />
    );
  }
  const { db, scope, user } = ctx;

  // Pengguna ber-outlet hanya boleh membuka halaman outlet miliknya —
  // halaman ini memuat seluruh daftar aset cabang bersangkutan.
  if (scope.branchIds && !scope.branchIds.includes(id)) {
    return (
      <AccessDenied
        message="Anda hanya dapat melihat detail outlet tempat Anda bertugas."
        backHref="/branches"
        backLabel="← Kembali ke Daftar Cabang"
      />
    );
  }

  // Aset berstatus BAP sudah dihapus/diarsipkan permanen dan dikeluarkan dari
  // perhitungan aktif cabang (CLAUDE.md §4.B.3).
  const assetScope = {
    ...assetScopeWhere(scope),
    status: { not: "BAP" as const },
  };

  // Cabang organisasi lain tidak terlihat oleh client tenant → halaman 404.
  const branch = await db.branch.findUnique({
    where: { id },
    include: {
      assets: {
        where: assetScope,
        orderBy: { createdAt: "desc" },
        include: {
          division: { select: { name: true } },
          category: { select: { name: true } },
          _count: { select: { incidents: true } },
        },
      },
      _count: {
        select: { assets: { where: assetScope } },
      },
    },
  });

  if (!branch) notFound();

  const isAdmin = isAdminRole(user.role);

  const now = new Date();
  const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Statistik dihitung dalam satuan pcs (bukan jumlah baris aset): satu baris
  // "Sumpit Kayu" bisa mewakili 100 pcs dengan sebagian rusak, sehingga
  // menghitung per baris akan sangat menyesatkan pada inventaris massal.
  // Diikat ke variabel lokal: `typeof branch.assets` di posisi tipe tidak ikut
  // menyempit dari guard `if (!branch) notFound()` di atas.
  const branchAssets = branch.assets;
  const sumStock = (pick: (a: (typeof branchAssets)[number]) => number) =>
    branchAssets.reduce((total, a) => total + pick(a), 0);

  const totalStock = sumStock((a) => a.quantity);
  const activeCount = sumStock((a) => a.activeQty);
  const brokenCount = sumStock((a) => a.brokenQty);
  const repairCount = sumStock((a) => a.repairQty);
  const retiredCount = sumStock((a) => a.retiredQty);
  const expiringCount = branch.assets.filter(
    a => a.warrantyDate && a.warrantyDate <= thirtyDays && a.status !== "RETIRED"
  ).length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link href="/branches" className="hover:text-indigo-600 hover:underline">Cabang</Link>
        <span>/</span>
        <span className="text-slate-800 font-medium truncate max-w-xs">{branch.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageHeading eyebrow="Inventaris & operasional" title={<>{branch.name}</>} description={<><UiIcon name="pin" size={16} className="inline-block" />
            <span>{branch.location}</span></>} />
        <Link
          href="/branches"
          className="bg-white border border-slate-200 text-slate-700 font-semibold px-4 py-2 rounded-lg text-sm hover:bg-slate-50 transition shadow-xs"
        >
          ← Kembali
        </Link>
      </div>
      <GuideCard title="Kenali lokasi inventaris Anda" icon="building">Lihat komposisi stok dan daftar aset pada cabang ini. Gunakan filter untuk menemukan aset, lalu buka detailnya untuk tindak lanjut.</GuideCard>


      {/* Statistik */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="ui-panel bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">Total Stok</p>
          <p className="text-3xl font-bold text-slate-900">{totalStock}</p>
          <p className="text-xs text-slate-400 mt-0.5">pcs · {branch._count.assets} item</p>
        </div>
        <div className="ui-panel bg-white border border-green-100 rounded-xl p-4 shadow-xs">
          <p className="text-xs text-green-600 font-semibold uppercase tracking-wider mb-1">Aktif</p>
          <p className="text-3xl font-bold text-green-700">{activeCount}</p>
          <p className="text-xs text-slate-400 mt-0.5">pcs</p>
        </div>
        <div className="ui-panel bg-white border border-red-100 rounded-xl p-4 shadow-xs">
          <p className="text-xs text-red-600 font-semibold uppercase tracking-wider mb-1">Rusak</p>
          <p className="text-3xl font-bold text-red-700">{brokenCount}</p>
          <p className="text-xs text-slate-400 mt-0.5">pcs</p>
        </div>
        <div className="ui-panel bg-white border border-yellow-100 rounded-xl p-4 shadow-xs">
          <p className="text-xs text-yellow-600 font-semibold uppercase tracking-wider mb-1">Perbaikan</p>
          <p className="text-3xl font-bold text-yellow-700">{repairCount}</p>
          <p className="text-xs text-slate-400 mt-0.5">pcs</p>
        </div>
        <div className="ui-panel bg-white border border-slate-100 rounded-xl p-4 shadow-xs">
          <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">Pensiun</p>
          <p className="text-3xl font-bold text-slate-500">{retiredCount}</p>
          <p className="text-xs text-slate-400 mt-0.5">pcs</p>
        </div>
      </div>

      {/* Alert: Garansi Akan Habis */}
      {expiringCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3 text-amber-800 text-sm font-medium">
          <span><UiIcon name="warning" className="inline-block align-middle" /></span>
          <span>{expiringCount} aset di cabang ini memiliki garansi yang akan habis dalam 30 hari ke depan.</span>
        </div>
      )}

      {/* Peta Lokasi Cabang */}
      {branch.mapUrl && (
        <div className="ui-panel bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs animate-fade-in">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <span><UiIcon name="pin" className="inline-block align-middle" /></span> Peta Lokasi Cabang
            </h2>
            <a
              href={branch.mapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1"
            >
              Buka di Google Maps ↗
            </a>
          </div>
          <div className="relative w-full h-[320px] bg-slate-50">
            <iframe
              src={branch.mapUrl}
              className="absolute inset-0 w-full h-full border-0"
              allowFullScreen
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
        </div>
      )}

      {/* Tabel Aset */}
      <div className="ui-panel bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">Daftar Aset di Cabang Ini</h2>
          <Link
            href={`/assets?branchId=${branch.id}`}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:underline"
          >
            Filter di halaman Aset →
          </Link>
        </div>

        {branch.assets.length === 0 ? (
          <div className="py-16 text-center">
            <div className="text-5xl mb-3">📭</div>
            <p className="font-semibold text-slate-700">Belum ada aset di cabang ini</p>
            <p className="text-xs text-slate-400 mt-1">
              {isAdmin
                ? "Tambahkan aset baru untuk cabang ini."
                : "Hubungi admin divisi Anda untuk menambahkan aset."}
            </p>
            {/* CTA hanya untuk admin — staf (IT_SUPPORT/KITCHEN) tidak boleh
                melihat jalur ke form tambah aset (CLAUDE.md §2) */}
            {isAdmin && (
              <Link
                href="/assets/new"
                className="inline-block mt-4 bg-indigo-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-indigo-700 active:scale-[0.98] transition-all duration-200 ease-in-out"
              >
                + Tambah Aset
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="inventory-table w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3.5">Nama Aset</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3.5">Kategori</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3.5">Status</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3.5">Stok (Aktif / Total)</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3.5">Garansi</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3.5">Insiden</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3.5">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {branch.assets.map((asset) => {
                  const daysUntilWarranty = asset.warrantyDate
                    ? Math.ceil((new Date(asset.warrantyDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
                    : null;

                  const warrantyColor =
                    daysUntilWarranty === null
                      ? ""
                      : daysUntilWarranty <= 0
                      ? "text-red-700 font-semibold"
                      : daysUntilWarranty <= 30
                      ? "text-red-600 font-semibold"
                      : daysUntilWarranty <= 90
                      ? "text-yellow-600 font-semibold"
                      : "text-slate-600";

                  return (
                    <tr key={asset.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-4">
                        <Link
                          href={`/assets/${asset.id}`}
                          className="font-semibold text-slate-900 hover:text-indigo-600 hover:underline"
                        >
                          {asset.name}
                        </Link>
                        {asset.brand && (
                          <p className="text-xs text-slate-400">{asset.brand} {asset.model}</p>
                        )}
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        {asset.category.name}
                        {scope.divisionId === null && (
                          <span className="block text-xs text-slate-400">{asset.division.name}</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`status-badge ${ASSET_STATUS_COLORS[asset.status] || STATUS_COLOR_FALLBACK}`}>
                          {ASSET_STATUS_LABELS[asset.status] || asset.status}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <StockInline stock={asset} />
                      </td>
                      <td className={`px-5 py-4 text-sm ${warrantyColor}`}>
                        {asset.warrantyDate ? (
                          <>
                            {formatDate(asset.warrantyDate)}
                            {daysUntilWarranty !== null && daysUntilWarranty <= 30 && (
                              <span className="ml-1 text-xs">
                                {daysUntilWarranty <= 0
                                  ? `(Kadaluarsa)`
                                  : `(${daysUntilWarranty}h)`}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        {asset._count.incidents > 0 ? (
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200">
                            {asset._count.incidents} insiden
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">Tidak ada</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <Link
                          href={`/assets/${asset.id}`}
                          className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:underline"
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
    </div>
  );
}
