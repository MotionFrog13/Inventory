import GuideCard from "@/components/GuideCard";
import UiIcon from "@/components/UiIcon";

import { notFound } from "next/navigation";
import {
  formatDate,
  ASSET_STATUS_LABELS,
  ASSET_STATUS_COLORS,
  STATUS_COLOR_FALLBACK,
  isAdminRole,
} from "@/lib/utils";
import Link from "next/link";
import AssetDetailClient from "./AssetDetailClient";
import { getPageContext } from "@/lib/auth";
import { UNASSIGNED_MESSAGE, assetAccessError } from "@/lib/scope";
import AccessDenied from "@/components/AccessDenied";

export const dynamic = "force-dynamic";

export default async function AssetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Halaman ini melakukan query langsung, jadi guard-nya WAJIB di sini juga,
  // bukan hanya di /api/assets/[id] (CLAUDE.md §2).
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

  // Aset organisasi lain tidak terlihat oleh client tenant → halaman 404.
  const asset = await db.asset.findUnique({
    where: { id },
    include: {
      branch: true,
      division: { select: { name: true } },
      category: { select: { name: true } },
      incidents: {
        orderBy: { reportedAt: "desc" },
      },
      transfers: {
        include: {
          fromBranch: { select: { id: true, name: true } },
          toBranch: { select: { id: true, name: true } },
          requestedBy: { select: { id: true, name: true, username: true } },
          approvedBy: { select: { id: true, name: true, username: true } },
        },
        orderBy: { transferredAt: "desc" },
      },
      // Riwayat BAP (terbaru lebih dulu) — relasi one-to-many
      baps: {
        include: {
          requestedBy: { select: { id: true, name: true, username: true } },
          approvedBy: { select: { id: true, name: true, username: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!asset) notFound();

  // Pemisahan divisi & outlet di dalam organisasi pengguna. Tanpa ini staf
  // Kitchen bisa membaca detail aset IT, dan admin outlet lain bisa membaca
  // aset yang bukan miliknya.
  const accessError = assetAccessError(scope, asset);
  if (accessError) {
    return (
      <AccessDenied
        message={
          accessError.error === "Unauthorized cross-branch access detected."
            ? "Aset ini berada di outlet lain dan tidak dapat diakses."
            : "Aset ini berada di luar cakupan divisi Anda."
        }
        backHref="/assets"
        backLabel="← Kembali ke Daftar Aset"
      />
    );
  }

  const latestBap = asset.baps[0] ?? null;

  // Daftar cabang TUJUAN transfer sengaja lintas outlet (dalam organisasi yang
  // sama): mutasi keluar memang menuju cabang lain. Yang dibatasi adalah aset
  // mana yang boleh dimutasi (aset di outlet pengguna) — bukan tujuannya.
  const branches = await db.branch.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const daysUntilWarranty = asset.warrantyDate
    ? Math.ceil((new Date(asset.warrantyDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  const showEdit =
    isAdminRole(user.role) &&
    asset.status !== "BAP_PENDING" &&
    asset.status !== "BAP";

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link href="/assets" className="hover:text-indigo-600 hover:underline">Daftar Aset</Link>
        <span>/</span>
        <span className="text-slate-800 font-medium truncate max-w-xs">{asset.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="page-title">{asset.name}</h1>
            <span className={`status-badge ${ASSET_STATUS_COLORS[asset.status] || STATUS_COLOR_FALLBACK}`}>
              {ASSET_STATUS_LABELS[asset.status] || asset.status}
            </span>
          </div>
          <p className="text-slate-500 mt-1">
            {asset.category.name}
            <span className="text-slate-400"> · {asset.division.name}</span>
            {asset.brand && ` · ${asset.brand}`}
            {asset.model && ` ${asset.model}`}
            {asset.serialNumber && <span className="font-mono ml-1 text-slate-400">#{asset.serialNumber}</span>}
          </p>
        </div>
        {showEdit && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <Link
              href={`/assets/${asset.id}/edit`}
              className="bg-white border border-slate-200 text-slate-700 font-semibold px-4 py-2 rounded-lg text-sm hover:bg-slate-50 transition shadow-xs"
            >
              <UiIcon name="edit" className="inline-block align-middle" /> Edit Aset
            </Link>
          </div>
        )}
      </div>

      {/* Warranty Alert */}
      {daysUntilWarranty !== null && daysUntilWarranty <= 30 && (
        <div className={`rounded-xl px-4 py-3 border text-sm font-medium flex items-center gap-2 ${
          daysUntilWarranty <= 0
            ? "bg-red-50 border-red-200 text-red-800"
            : "bg-amber-50 border-amber-200 text-amber-800"
        }`}>
          {daysUntilWarranty <= 0 ? "🔴" : "⚠️"}
          {daysUntilWarranty <= 0
            ? `Garansi sudah kadaluarsa ${Math.abs(daysUntilWarranty)} hari yang lalu (${formatDate(asset.warrantyDate)}).`
            : `Garansi akan habis dalam ${daysUntilWarranty} hari (${formatDate(asset.warrantyDate)}).`
          }
        </div>
      )}

      <GuideCard title="Kelola aset dari satu halaman" icon="info">Periksa rincian stok di bawah, lalu pilih tindakan yang diperlukan. Insiden untuk kerusakan, mutasi untuk perpindahan cabang, dan BAP untuk penghapusan stok yang disertai dokumen.</GuideCard>

      {/* Client Component (Tabs, Modal Transfer, Modal Insiden) */}
      <AssetDetailClient
        asset={{
          id: asset.id,
          name: asset.name,
          divisionName: asset.division.name,
          categoryName: asset.category.name,
          serialNumber: asset.serialNumber,
          brand: asset.brand,
          model: asset.model,
          specs: asset.specs,
          purchaseDate: asset.purchaseDate ? asset.purchaseDate.toISOString() : null,
          warrantyDate: asset.warrantyDate ? asset.warrantyDate.toISOString() : null,
          status: asset.status,
          quantity: asset.quantity,
          activeQty: asset.activeQty,
          brokenQty: asset.brokenQty,
          repairQty: asset.repairQty,
          retiredQty: asset.retiredQty,
          reservedQty: asset.reservedQty,
          photoUrl: asset.photoUrl,
          notes: asset.notes,
          branchId: asset.branchId,
          branch: asset.branch,
          createdAt: asset.createdAt.toISOString(),
          updatedAt: asset.updatedAt.toISOString(),
        }}
        incidents={asset.incidents.map((i) => ({
          ...i,
          reportedAt: i.reportedAt.toISOString(),
          resolvedAt: i.resolvedAt ? i.resolvedAt.toISOString() : null,
          proposedAt: i.proposedAt ? i.proposedAt.toISOString() : null,
        }))}
        transfers={asset.transfers.map((t) => ({
          ...t,
          transferredAt: t.transferredAt.toISOString(),
          requestedBy: t.requestedBy ? { id: t.requestedBy.id, name: t.requestedBy.name, username: t.requestedBy.username } : undefined,
          approvedBy: t.approvedBy ? { id: t.approvedBy.id, name: t.approvedBy.name, username: t.approvedBy.username } : null,
        }))}
        branches={branches.filter((b) => b.id !== asset.branchId)}
        userRole={user.role}
        bap={latestBap ? {
          ...latestBap,
          createdAt: latestBap.createdAt.toISOString(),
          updatedAt: latestBap.updatedAt.toISOString(),
        } : null}
      />
    </div>
  );
}
