import { getI18n } from "@/lib/i18n/server";
import { formatDateTime } from "@/lib/utils";

import UiIcon from "@/components/UiIcon";
import PageHeading from "@/components/PageHeading";
import GuideCard from "@/components/GuideCard";
import Link from "next/link";
import { Suspense } from "react";
import { getPageContext, type RequestContext } from "@/lib/auth";
import {
  TRANSFER_STATUS_COLORS,
  TRANSFER_STATUS_LABELS,
  STATUS_COLOR_FALLBACK,
  branchScopeLabel,
  divisionScopeLabel,
} from "@/lib/utils";
import { UNASSIGNED_MESSAGE, transferScopeWhere } from "@/lib/scope";
import AccessDenied from "@/components/AccessDenied";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

interface SearchParams {
  fromBranchId?: string;
  toBranchId?: string;
  page?: string;
}



async function TransfersContent({
  searchParams,
  ctx,
}: {
  searchParams: SearchParams;
  ctx: RequestContext;
}) {
  const { t, locale } = await getI18n();
  const { db, scope, user } = ctx;
  // Clamp: `?page=abc` / `?page=0` menghasilkan skip NaN/negatif yang membuat
  // Prisma melempar error dan halaman gagal dirender.
  const rawPage = parseInt(searchParams.page || "1", 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const limit = 25;
  const skip = (page - 1) * limit;

  // Filter divisi + outlet diterapkan di tingkat query Prisma (CLAUDE.md §2).
  // Untuk pengguna ber-outlet, cakupannya mencakup KEDUA sisi mutasi: transfer
  // keluar dari outletnya maupun yang masuk ke outletnya.
  const where: Prisma.TransferWhereInput = transferScopeWhere(scope);
  if (searchParams.fromBranchId) where.fromBranchId = searchParams.fromBranchId;
  if (searchParams.toBranchId) where.toBranchId = searchParams.toBranchId;

  const [transfers, total, branches] = await Promise.all([
    db.transfer.findMany({
      where,
      include: {
        asset: {
          select: {
            id: true,
            name: true,
            division: { select: { name: true } },
            category: { select: { name: true } },
          },
        },
        fromBranch: { select: { id: true, name: true } },
        toBranch: { select: { id: true, name: true } },
        requestedBy: { select: { id: true, name: true, username: true } },
        approvedBy: { select: { id: true, name: true, username: true } },
      },
      orderBy: { transferredAt: "desc" },
      skip,
      take: limit,
    }),
    db.transfer.count({ where }),
    // Filter cabang memuat seluruh cabang organisasi: mutasi masuk bisa datang
    // dari cabang mana pun. Barisnya tetap dibatasi `transferScopeWhere`.
    db.branch.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const totalPages = Math.ceil(total / limit);

  function buildUrl(overrides: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    const merged = { ...searchParams, ...overrides };
    Object.entries(merged).forEach(([k, v]) => {
      if (v && k !== "page") params.set(k, v);
    });
    if (overrides.page) params.set("page", overrides.page);
    return `/transfers?${params.toString()}`;
  }

  const divisionText = t("aset {0}", [divisionScopeLabel(user, locale)]);

  return (
    <>
      {/* Filter */}
      <form method="GET" action="/transfers" className="ui-panel bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="min-w-[160px]">
            <label htmlFor="transfers-page-field-1" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">{t("Dari Cabang")}</label>
            <select id="transfers-page-field-1" name="fromBranchId" defaultValue={searchParams.fromBranchId || ""}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">{t("Semua Cabang")}</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div className="min-w-[160px]">
            <label htmlFor="transfers-page-field-2" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">{t("Ke Cabang")}</label>
            <select id="transfers-page-field-2" name="toBranchId" defaultValue={searchParams.toBranchId || ""}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">{t("Semua Cabang")}</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="bg-indigo-600 text-white font-semibold px-4 py-2 rounded-lg text-sm hover:bg-indigo-700 transition">
              <UiIcon name="search" className="inline-block align-middle" /> Filter
            </button>
            <Link href="/transfers" className="bg-slate-100 text-slate-700 font-semibold px-4 py-2 rounded-lg text-sm hover:bg-slate-200 transition">
              Reset
            </Link>
          </div>
        </div>
      </form>

      <div className="text-sm text-slate-500">
        Total <strong className="text-slate-700">{total}</strong>{" "}{t("riwayat perpindahan")}{" "}{divisionText}
      </div>

      {/* Timeline */}
      {transfers.length === 0 ? (
        <div className="ui-panel bg-white border border-slate-200 rounded-xl py-16 text-center">
          <div className="text-5xl mb-3"><UiIcon size={40} name="transfer" className="inline-block align-middle" /></div>
          <p className="font-semibold text-slate-700">{t("Tidak ada riwayat transfer")}</p>
          <p className="text-xs text-slate-400 mt-1">{t("Belum ada perpindahan aset yang tercatat dengan filter ini.")}</p>
        </div>
      ) : (
        <div className="relative">
          {/* Timeline vertical line */}
          <div className="absolute left-5 top-0 bottom-0 w-px bg-slate-200 z-0"></div>

          <div className="space-y-3 relative z-10">
            {transfers.map((transfer) => (
              <div key={transfer.id} className="relative pl-12">
                {/* Dot */}
                <div className="absolute left-4 top-5 w-3 h-3 rounded-full bg-indigo-500 border-2 border-white shadow-sm -translate-x-1/2"></div>

                <div className="ui-panel bg-white border border-slate-200 rounded-xl p-4 hover:shadow-sm transition">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-0">
                      {/* Perangkat */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link href={`/assets/${transfer.asset.id}`} className="font-semibold text-slate-900 hover:text-indigo-600 hover:underline text-sm">
                          {transfer.asset.name}
                        </Link>
                        <span className="text-xs text-slate-400">
                          {transfer.asset.category.name} · {transfer.asset.division.name}
                        </span>
                        {/* Status wajib terlihat: transfer PENDING belum
                            memindahkan aset, sedangkan APPROVED sudah. */}
                        <span className={`status-badge status-badge-sm ${TRANSFER_STATUS_COLORS[transfer.status] || STATUS_COLOR_FALLBACK}`}>
                          {t(TRANSFER_STATUS_LABELS[transfer.status] || transfer.status)}
                        </span>
                      </div>

                      {/* Arah Transfer */}
                      <div className="flex items-center gap-2 mt-1.5 text-sm flex-wrap">
                        <span className="bg-slate-100 text-slate-700 font-medium px-2 py-0.5 rounded text-xs">
                          <UiIcon name="pin" className="inline-block align-middle" /> {transfer.fromBranch.name}
                        </span>
                        <span className="text-indigo-600 font-bold">→</span>
                        <span className="bg-indigo-50 text-indigo-700 font-medium px-2 py-0.5 rounded text-xs">
                          <UiIcon name="pin" className="inline-block align-middle" /> {transfer.toBranch.name}
                        </span>
                      </div>

                      {/* Alasan */}
                      <p className="text-sm text-slate-600 mt-2">{transfer.reason}</p>
                    </div>

                    {/* Meta */}
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs font-semibold text-slate-700">{formatDateTime(transfer.transferredAt, locale)}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{t("oleh")}{" "}{transfer.requestedBy?.name || "-"}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          {page > 1 && (
            <Link href={buildUrl({ page: String(page - 1) })} className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 transition font-medium text-slate-700">{t("← Sebelumnya")}</Link>
          )}
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Link key={p} href={buildUrl({ page: String(p) })}
              className={`px-3 py-1.5 text-sm border rounded-lg font-medium transition ${
                p === page ? "bg-indigo-600 text-white border-indigo-600" : "border-slate-200 text-slate-700 hover:bg-slate-50"
              }`}
            >
              {p}
            </Link>
          ))}
          {page < totalPages && (
            <Link href={buildUrl({ page: String(page + 1) })} className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 transition font-medium text-slate-700">{t("Berikutnya →")}</Link>
          )}
        </div>
      )}
    </>
  );
}

export default async function TransfersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { t, locale } = await getI18n();
  const [params, ctx] = await Promise.all([searchParams, getPageContext()]);

  // Filter organisasi + divisi + outlet diterapkan di tingkat query (CLAUDE.md §2)
  if (!ctx) {
    return (
      <AccessDenied
        message={UNASSIGNED_MESSAGE}
        backHref="/login"
        backLabel={t("Kembali ke Halaman Masuk")}
      />
    );
  }

  const { scope, user } = ctx;
  const isBranchBound = scope.branchIds !== null;
  const assetLabel = t("aset {0}", [divisionScopeLabel(user, locale)]);
  const currentSubtitle = isBranchBound
    ? t("Kronologis mutasi {0} yang keluar dari maupun masuk ke {1}.", [assetLabel, branchScopeLabel(user, locale)])
    : t("Kronologis mutasi dan perpindahan {0} antar {1}.", [assetLabel, branchScopeLabel(user, locale)]);

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeading eyebrow={t("Inventaris & operasional")} title={<>{t("Riwayat Mutasi Aset")}</>} description={<>{currentSubtitle}</>} />
      <GuideCard title={t("Mutasi diproses setelah disetujui")} icon="transfer">{t("Permintaan mutasi belum mengubah lokasi aset. Persetujuan dilakukan oleh admin outlet asal atau Super Admin.")}</GuideCard>


      <Suspense fallback={
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin"></div>
        </div>
      }>
        <TransfersContent searchParams={params} ctx={ctx} />
      </Suspense>
    </div>
  );
}
