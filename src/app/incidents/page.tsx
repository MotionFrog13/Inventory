"use client";
import UiIcon from "@/components/UiIcon";
import PageHeading from "@/components/PageHeading";
import GuideCard from "@/components/GuideCard";
import Dialog from "@/components/Dialog";


export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  INCIDENT_RESOLVE_STATUSES,
  branchScopeLabel,
  divisionScopeLabel,
  isAdminRole,
  isSuperAdmin,
  type SessionUserView,
} from "@/lib/utils";

interface Incident {
  id: string;
  quantity: number;
  description: string;
  solution: string | null;
  resolveStatus: string | null;
  pendingSolution: string | null;
  pendingAssetStatus: string | null;
  proposedBy: string | null;
  proposedAt: string | null;
  reportedAt: string;
  resolvedAt: string | null;
  handledBy: string | null;
  asset: {
    id: string;
    name: string;
    quantity: number;
    activeQty: number;
    category: { name: string };
    division: { name: string };
    branch: { id: string; name: string };
  };
}

interface Asset {
  id: string;
  name: string;
  quantity: number;
  activeQty: number;
  retiredQty: number;
  reservedQty: number;
  category: { name: string };
  branch: { name: string };
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("id-ID", {
    day: "numeric", month: "short", year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

function daysAgo(d: string): number {
  return Math.floor((Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24));
}

// Sumber kebenaran tunggal ada di lib/utils agar halaman ini dan modal di
// halaman Detail Aset tidak pernah menawarkan pilihan status yang berbeda.
const ASSET_STATUS_OPTIONS = INCIDENT_RESOLVE_STATUSES;

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<"" | "unresolved" | "resolved" | "pending_review">("");
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  // Divisi & outlet pengguna — hanya untuk label; pembatasan datanya sendiri
  // sudah dilakukan server di GET /api/incidents.
  const [me, setMe] = useState<SessionUserView | null>(null);

  // Modal: Buat Tiket
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({ assetId: "", description: "", quantity: "1" });
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [assetSearch, setAssetSearch] = useState("");
  const [assetOptions, setAssetOptions] = useState<Asset[]>([]);
  // Aset yang dipilih di modal — dipakai untuk membatasi jumlah pcs yang boleh
  // dilaporkan rusak, sejalan dengan validasi POST /api/incidents.
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);

  // Modal: Ajukan Selesai (Staf divisi)
  const [proposeId, setProposeId] = useState<string | null>(null);
  const [proposeForm, setProposeForm] = useState({ solution: "", assetStatus: "ACTIVE" });
  const [proposeLoading, setProposeLoading] = useState(false);
  const [proposeError, setProposeError] = useState<string | null>(null);

  // Modal: Review Pengajuan (Admin — approve/reject)
  const [reviewIncident, setReviewIncident] = useState<Incident | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  // Modal: Selesaikan Langsung (Admin)
  const [resolveId, setResolveId] = useState<string | null>(null);
  const [resolveForm, setResolveForm] = useState({ solution: "", assetStatus: "ACTIVE" });
  const [resolveLoading, setResolveLoading] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  // Modal: Hapus
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const limit = 20;

  const fetchIncidents = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    // Filter PENDING_REVIEW ditangani server (resolveStatus) agar `total` dan
    // paginasi konsisten dengan baris yang benar-benar ditampilkan. Sebelumnya
    // filter dilakukan di klien atas satu halaman saja, sehingga pengajuan di
    // halaman berikutnya tidak pernah terlihat dan hitungan halaman menyesatkan.
    if (statusFilter === "pending_review") {
      params.set("resolveStatus", "PENDING_REVIEW");
    } else if (statusFilter) {
      params.set("status", statusFilter);
    }
    params.set("page", String(page));
    params.set("limit", String(limit));

    try {
      const res = await fetch(`/api/incidents?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setIncidents(data.data.incidents);
        setTotal(data.data.pagination.total);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [statusFilter, page]);

  useEffect(() => {
    fetchIncidents();
  }, [fetchIncidents]);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setUserRole(d.data.role);
          setMe(d.data);
        }
      })
      .catch(console.error);
  }, []);

  // Search assets for create modal
  useEffect(() => {
    if (!showCreateModal) return;
    const timeout = setTimeout(async () => {
      const params = new URLSearchParams();
      if (assetSearch) params.set("search", assetSearch);
      params.set("limit", "10");
      try {
        const res = await fetch(`/api/assets?${params.toString()}`);
        const data = await res.json();
        if (data.success) setAssetOptions(data.data.assets);
      } catch (e) {
        console.error(e);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [assetSearch, showCreateModal]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateLoading(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...createForm,
          quantity: parseInt(createForm.quantity, 10) || 1,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setCreateError(data.error || "Gagal membuat tiket.");
        setCreateLoading(false);
        return;
      }
      setShowCreateModal(false);
      setCreateForm({ assetId: "", description: "", quantity: "1" });
      setSelectedAsset(null);
      setAssetSearch("");
      fetchIncidents();
    } catch {
      setCreateError("Terjadi kesalahan jaringan.");
      setCreateLoading(false);
    }
  }

  // Staf divisi: Ajukan Selesai
  async function handlePropose(e: React.FormEvent) {
    e.preventDefault();
    if (!proposeId) return;
    setProposeLoading(true);
    setProposeError(null);
    try {
      const res = await fetch(`/api/incidents/${proposeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "propose", ...proposeForm }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setProposeError(data.error || "Gagal mengajukan penyelesaian.");
        setProposeLoading(false);
        return;
      }
      setProposeId(null);
      setProposeForm({ solution: "", assetStatus: "ACTIVE" });
      fetchIncidents();
    } catch {
      setProposeError("Terjadi kesalahan jaringan.");
      setProposeLoading(false);
    }
  }

  // Admin: Approve pengajuan
  async function handleApprove() {
    if (!reviewIncident) return;
    setReviewLoading(true);
    setReviewError(null);
    try {
      const res = await fetch(`/api/incidents/${reviewIncident.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setReviewError(data.error || "Gagal menyetujui pengajuan.");
        setReviewLoading(false);
        return;
      }
      setReviewIncident(null);
      fetchIncidents();
    } catch {
      setReviewError("Terjadi kesalahan jaringan.");
      setReviewLoading(false);
    }
  }

  // Admin: Reject pengajuan
  async function handleReject() {
    if (!reviewIncident) return;
    setReviewLoading(true);
    setReviewError(null);
    try {
      const res = await fetch(`/api/incidents/${reviewIncident.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject" }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setReviewError(data.error || "Gagal menolak pengajuan.");
        setReviewLoading(false);
        return;
      }
      setReviewIncident(null);
      fetchIncidents();
    } catch {
      setReviewError("Terjadi kesalahan jaringan.");
      setReviewLoading(false);
    }
  }

  // Admin: Selesaikan langsung
  async function handleResolve(e: React.FormEvent) {
    e.preventDefault();
    if (!resolveId) return;
    setResolveLoading(true);
    setResolveError(null);
    try {
      const res = await fetch(`/api/incidents/${resolveId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve", ...resolveForm }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setResolveError(data.error || "Gagal menyelesaikan tiket.");
        setResolveLoading(false);
        return;
      }
      setResolveId(null);
      setResolveForm({ solution: "", assetStatus: "ACTIVE" });
      fetchIncidents();
    } catch {
      setResolveError("Terjadi kesalahan jaringan.");
      setResolveLoading(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/incidents/${deleteId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setDeleteError(data.error || "Gagal menghapus insiden.");
        setDeleteLoading(false);
        return;
      }
      setDeleteId(null);
      fetchIncidents();
    } catch {
      setDeleteError("Terjadi kesalahan jaringan.");
    }
    setDeleteLoading(false);
  }

  const totalPages = Math.ceil(total / limit);
  // Hitungan ini hanya mencakup halaman yang sedang ditampilkan — diberi label
  // "di halaman ini" agar tidak terbaca sebagai jumlah keseluruhan.
  const unresolvedCount = incidents.filter((i) => !i.resolvedAt).length;
  const pendingReviewCount = incidents.filter((i) => i.resolveStatus === "PENDING_REVIEW").length;

  const currentSubtitle = me
    ? `Kelola tiket kerusakan aset ${divisionScopeLabel(me)} di ${branchScopeLabel(me)}.`
    : "Kelola tiket kerusakan aset.";

  const isAdmin = isAdminRole(userRole);

  // Badge helper
  function ResolveStatusBadge({ incident }: { incident: Incident }) {
    if (incident.resolvedAt) {
      return (
        <span className="text-xs font-bold px-2.5 py-1 rounded-full border bg-green-100 text-green-700 border-green-200 whitespace-nowrap">
          ✓ Selesai
        </span>
      );
    }
    if (incident.resolveStatus === "PENDING_REVIEW") {
      return (
        <span className="text-xs font-bold px-2.5 py-1 rounded-full border bg-amber-100 text-amber-700 border-amber-200 whitespace-nowrap animate-pulse">
          <UiIcon name="clock" className="inline-block align-middle" /> Menunggu Acc
        </span>
      );
    }
    if (incident.resolveStatus === "REJECTED") {
      return (
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-bold px-2.5 py-1 rounded-full border bg-red-100 text-red-700 border-red-200 whitespace-nowrap">
            <UiIcon name="clock" className="inline-block align-middle" /> Aktif
          </span>
          <span className="text-xs text-red-500 font-medium px-1">↩ Pengajuan ditolak</span>
        </div>
      );
    }
    return (
      <span className="text-xs font-bold px-2.5 py-1 rounded-full border bg-red-100 text-red-700 border-red-200 whitespace-nowrap">
        <UiIcon name="clock" className="inline-block align-middle" /> Aktif
      </span>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <PageHeading eyebrow="Inventaris & operasional" title={<>Daftar Insiden</>} description={<>{currentSubtitle}</>} />
        <button
          onClick={() => {
            setShowCreateModal(true);
            setCreateError(null);
            setAssetSearch("");
            setSelectedAsset(null);
            setCreateForm({ assetId: "", description: "", quantity: "1" });
          }}
          className="bg-red-600 text-white font-semibold px-4 py-2.5 rounded-xl text-sm hover:bg-red-700 transition shadow-sm flex items-center gap-2"
        >
          <UiIcon name="tool" className="inline-block align-middle" /> Buat Tiket Baru
        </button>
      </div>
      <GuideCard title="Dari laporan hingga selesai" icon="tool">Laporkan aset yang bermasalah, lalu ajukan solusi setelah perbaikan. Pengajuan penyelesaian diperiksa oleh admin divisi atau Super Admin.</GuideCard>


      {/* Filter Tabs */}
      <div className="ui-panel flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1.5 w-fit shadow-xs flex-wrap">
        {([
          { key: "", label: "Semua" },
          { key: "unresolved", label: "Aktif (Unresolved)" },
          { key: "pending_review", label: "Menunggu Acc" },
          { key: "resolved", label: "Selesai (Resolved)" },
        ] as { key: "" | "unresolved" | "resolved" | "pending_review"; label: string }[]).map((f) => (
          <button
            key={f.key}
            onClick={() => { setStatusFilter(f.key); setPage(1); }}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition ${
              statusFilter === f.key
                ? "bg-indigo-600 text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {f.label}
            {f.key === "pending_review" && statusFilter === "pending_review" && pendingReviewCount > 0 && (
              <span className="ml-1.5 bg-amber-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                {pendingReviewCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Stats */}
      <div className="text-sm text-slate-500">
        Menampilkan <strong className="text-slate-700">{incidents.length}</strong> dari <strong className="text-slate-700">{total}</strong> insiden
        {statusFilter === "" && unresolvedCount > 0 && (
          <span className="ml-2 text-rose-600 font-semibold">· {unresolvedCount} masih aktif di halaman ini</span>
        )}
        {isAdmin && statusFilter !== "pending_review" && pendingReviewCount > 0 && (
          <span className="ml-2 text-amber-600 font-semibold">· {pendingReviewCount} menunggu persetujuan di halaman ini</span>
        )}
      </div>

      {/* Table */}
      <div className="ui-panel bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin"></div>
          </div>
        ) : incidents.length === 0 ? (
          <div className="py-16 text-center">
            <div className="text-5xl mb-3"><UiIcon size={40} name="check" className="inline-block align-middle" /></div>
            <p className="font-semibold text-slate-700">Tidak ada insiden ditemukan</p>
            <p className="text-xs text-slate-400 mt-1">
              {statusFilter === "unresolved" ? "Semua tiket sudah diselesaikan." :
               statusFilter === "pending_review" ? "Tidak ada pengajuan yang menunggu persetujuan." :
               "Belum ada tiket insiden yang tercatat."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="inventory-table w-full text-sm text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Perangkat</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Jumlah</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Cabang</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Masalah / Solusi</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Dilaporkan</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Durasi</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {incidents.map((incident) => {
                  const days = daysAgo(incident.reportedAt);
                  const isOverdue = !incident.resolvedAt && days > 7;
                  const isPendingReview = incident.resolveStatus === "PENDING_REVIEW";
                  return (
                    <tr
                      key={incident.id}
                      className={`hover:bg-slate-50/60 transition-colors ${
                        isPendingReview ? "bg-amber-50/40" : isOverdue ? "bg-red-50/20" : ""
                      }`}
                    >
                      <td className="px-4 py-3">
                        <ResolveStatusBadge incident={incident} />
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/assets/${incident.asset.id}`} className="font-medium text-slate-900 hover:text-indigo-600 hover:underline">
                          {incident.asset.name}
                        </Link>
                        <p className="text-xs text-slate-400 mt-0.5">{incident.asset.category.name}{isSuperAdmin(userRole) && ` · ${incident.asset.division.name}`}</p>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full border bg-rose-50 text-rose-700 border-rose-200/60">
                          {incident.quantity} pcs
                        </span>
                        <p className="text-xs text-slate-400 mt-0.5">
                          dari {incident.asset.quantity} pcs
                        </p>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{incident.asset.branch.name}</td>
                      <td className="px-4 py-3 text-slate-700 max-w-xs">
                        <p className="truncate">{incident.description}</p>
                        {/* Tampilkan solusi pending untuk Admin */}
                        {isPendingReview && incident.pendingSolution && (
                          <div className="mt-1.5 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                            <p className="text-xs font-semibold text-amber-700 mb-0.5">Solusi diajukan oleh {incident.proposedBy}:</p>
                            <p className="text-xs text-amber-900">{incident.pendingSolution}</p>
                            {incident.pendingAssetStatus && (
                              <p className="text-xs text-amber-600 mt-0.5">Status diusulkan: <strong>{incident.pendingAssetStatus}</strong></p>
                            )}
                          </div>
                        )}
                        {incident.solution && !isPendingReview && (
                          <p className="text-xs text-green-700 mt-0.5 truncate">✓ {incident.solution}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                        {formatDate(incident.reportedAt)}
                        {incident.handledBy && <p className="text-xs text-slate-400">oleh {incident.handledBy}</p>}
                      </td>
                      <td className="px-4 py-3">
                        {incident.resolvedAt ? (
                          <span className="text-xs text-slate-400">
                            {daysAgo(incident.reportedAt) > 0 ? `${daysAgo(incident.reportedAt)}h` : "< 1h"}
                          </span>
                        ) : (
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                            isOverdue ? "bg-amber-100 text-amber-800 border-amber-200" : "bg-slate-100 text-slate-600 border-slate-200"
                          }`}>
                            {days === 0 ? "Hari ini" : `${days} hari`}
                            {isOverdue && " ⚠"}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2 flex-wrap">
                          {/* Admin: tombol Acc & Tolak jika ada pengajuan pending */}
                          {isAdmin && isPendingReview && (
                            <>
                              <button
                                onClick={() => { setReviewIncident(incident); setReviewError(null); }}
                                className="text-xs font-semibold text-white bg-green-600 hover:bg-green-700 px-3 py-1 rounded-lg transition whitespace-nowrap shadow-sm"
                              >
                                ✓ Acc / Tolak
                              </button>
                            </>
                          )}
                          {/* Admin: Selesaikan langsung jika belum resolved dan tidak pending review */}
                          {isAdmin && !incident.resolvedAt && !isPendingReview && (
                            <button
                              onClick={() => { setResolveId(incident.id); setResolveForm({ solution: "", assetStatus: "ACTIVE" }); setResolveError(null); }}
                              className="text-xs font-semibold text-green-700 bg-green-50 border border-green-200 hover:bg-green-100 px-2.5 py-1 rounded-lg transition whitespace-nowrap"
                            >
                              ✓ Selesaikan
                            </button>
                          )}
                          {/* Staf divisi: Ajukan Selesai */}
                          {!isAdmin && !incident.resolvedAt && !isPendingReview && (
                            <button
                              onClick={() => { setProposeId(incident.id); setProposeForm({ solution: "", assetStatus: "ACTIVE" }); setProposeError(null); }}
                              className="text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 px-2.5 py-1 rounded-lg transition whitespace-nowrap"
                            >
                              Ajukan Selesai
                            </button>
                          )}
                          {/* SUPER_ADMIN: tombol hapus */}
                          {isSuperAdmin(userRole) && (
                            <button
                              onClick={() => { setDeleteId(incident.id); setDeleteError(null); }}
                              aria-label={`Hapus insiden ${incident.asset.name}`}
                              className="text-xs font-semibold text-red-600 hover:text-red-700 px-1.5 py-1 rounded hover:bg-red-50 transition"
                            >
                              <UiIcon name="trash" className="inline-block align-middle" />
                            </button>
                          )}
                        </div>
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
            <button onClick={() => setPage(page - 1)} className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 transition font-medium text-slate-700">
              ← Sebelumnya
            </button>
          )}
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button key={p} onClick={() => setPage(p)}
              className={`px-3 py-1.5 text-sm border rounded-lg font-medium transition ${
                p === page ? "bg-indigo-600 text-white border-indigo-600" : "border-slate-200 text-slate-700 hover:bg-slate-50"
              }`}
            >
              {p}
            </button>
          ))}
          {page < totalPages && (
            <button onClick={() => setPage(page + 1)} className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 transition font-medium text-slate-700">
              Berikutnya →
            </button>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          MODAL: Buat Tiket
      ═══════════════════════════════════════════════════════ */}
      {showCreateModal && (
        <Dialog label="Buat Tiket Insiden Baru" onClose={() => setShowCreateModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-1">Buat Tiket Insiden Baru</h2>
              <p className="text-sm text-slate-500 mb-5">Laporkan kerusakan atau masalah pada perangkat.</p>
              <form onSubmit={handleCreate} className="space-y-4">
                {createError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{createError}</div>
                )}
                <div>
                  <label htmlFor="incidents-page-field-1" className="block text-sm font-semibold text-slate-700 mb-1.5">Cari Perangkat <span className="text-red-500">*</span></label>
                  <input id="incidents-page-field-1"
                    type="text"
                    value={assetSearch}
                    onChange={(e) => setAssetSearch(e.target.value)}
                    placeholder="Ketik nama perangkat..."
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400 mb-2"
                  />
                  {assetOptions.length > 0 && (
                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                      {assetOptions.map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => {
                            setCreateForm((f) => ({ ...f, assetId: a.id, quantity: "1" }));
                            setSelectedAsset(a);
                            setAssetSearch(a.name);
                            setAssetOptions([]);
                          }}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 transition ${
                            createForm.assetId === a.id ? "bg-indigo-50 text-indigo-700 font-medium" : "text-slate-700"
                          }`}
                        >
                          <span className="font-medium">{a.name}</span>
                          <span className="text-xs text-slate-400 ml-2">({a.category.name}) · {a.branch.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {createForm.assetId && selectedAsset && (
                    <p className="text-xs text-green-600 font-medium mt-1">
                      ✓ Dipilih · stok siap pakai {selectedAsset.activeQty} dari {selectedAsset.quantity} pcs
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor="incidents-page-field-2" className="block text-sm font-semibold text-slate-700 mb-1.5">
                    Jumlah Unit yang Rusak (pcs) <span className="text-red-500">*</span>
                  </label>
                  <input id="incidents-page-field-2"
                    type="number"
                    min={1}
                    max={Math.max(
                      selectedAsset
                        ? selectedAsset.quantity - selectedAsset.reservedQty - selectedAsset.retiredQty
                        : 1,
                      1
                    )}
                    value={createForm.quantity}
                    onChange={(e) => setCreateForm((f) => ({ ...f, quantity: e.target.value }))}
                    required
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    Isi 1 untuk perangkat unit tunggal. Untuk barang massal, isi berapa pcs yang rusak.
                  </p>
                </div>
                <div>
                  <label htmlFor="incidents-page-field-3" className="block text-sm font-semibold text-slate-700 mb-1.5">Deskripsi Masalah / Gejala <span className="text-red-500">*</span></label>
                  <textarea id="incidents-page-field-3"
                    value={createForm.description}
                    onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
                    required rows={4}
                    placeholder="Jelaskan gejala kerusakan secara detail..."
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400 resize-none"
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    Unit yang dilaporkan berpindah ke stok Rusak. Selama masih ada stok siap pakai,
                    perangkat tetap berstatus Aktif dengan jumlah berkurang.
                  </p>
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setShowCreateModal(false)} className="flex-1 bg-slate-100 text-slate-700 font-semibold py-2.5 rounded-lg text-sm hover:bg-slate-200 transition">
                    Batal
                  </button>
                  <button type="submit" disabled={createLoading || !createForm.assetId} className="flex-1 bg-red-600 text-white font-semibold py-2.5 rounded-lg text-sm hover:bg-red-700 transition disabled:opacity-60">
                    {createLoading ? "Menyimpan..." : "Buat Tiket"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </Dialog>
      )}

      {/* ═══════════════════════════════════════════════════════
          MODAL: Ajukan Selesai (Staf divisi)
      ═══════════════════════════════════════════════════════ */}
      {proposeId && (
        <Dialog label="Ajukan Penyelesaian Insiden" onClose={() => setProposeId(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-1">Ajukan Penyelesaian Insiden</h2>
              <p className="text-sm text-slate-500 mb-5">Isi solusi dan status perangkat. Pengajuan akan dikirim ke Admin untuk disetujui.</p>
              <form onSubmit={handlePropose} className="space-y-4">
                {proposeError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{proposeError}</div>
                )}
                <div>
                  <label htmlFor="incidents-page-field-4" className="block text-sm font-semibold text-slate-700 mb-1.5">Solusi / Tindakan yang Dilakukan <span className="text-red-500">*</span></label>
                  <textarea id="incidents-page-field-4"
                    value={proposeForm.solution}
                    onChange={(e) => setProposeForm((f) => ({ ...f, solution: e.target.value }))}
                    required rows={4}
                    placeholder="Jelaskan tindakan perbaikan yang sudah dilakukan..."
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400 resize-none"
                  />
                </div>
                <div>
                  <label htmlFor="incidents-page-field-5" className="block text-sm font-semibold text-slate-700 mb-1.5">Status Perangkat yang Diusulkan</label>
                  <select id="incidents-page-field-5"
                    value={proposeForm.assetStatus}
                    onChange={(e) => setProposeForm((f) => ({ ...f, assetStatus: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {ASSET_STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-xs text-amber-700">
                  ℹ️ Pengajuan ini akan dikirim ke Admin dan menunggu persetujuan sebelum insiden resmi ditandai selesai.
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setProposeId(null)} className="flex-1 bg-slate-100 text-slate-700 font-semibold py-2.5 rounded-lg text-sm hover:bg-slate-200 transition">
                    Batal
                  </button>
                  <button type="submit" disabled={proposeLoading} className="flex-1 bg-indigo-600 text-white font-semibold py-2.5 rounded-lg text-sm hover:bg-indigo-700 transition disabled:opacity-60">
                    {proposeLoading ? "Mengirim..." : "Kirim Pengajuan"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </Dialog>
      )}

      {/* ═══════════════════════════════════════════════════════
          MODAL: Review Pengajuan (Admin — Acc / Tolak)
      ═══════════════════════════════════════════════════════ */}
      {reviewIncident && (
        <Dialog label="Review Pengajuan Penyelesaian" onClose={() => setReviewIncident(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-1">Review Pengajuan Penyelesaian</h2>
              <p className="text-sm text-slate-500 mb-4">Periksa solusi yang diajukan dan putuskan untuk menyetujui atau menolak.</p>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4 space-y-3">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Perangkat</p>
                  <p className="text-sm font-medium text-slate-800">{reviewIncident.asset.name}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Masalah</p>
                  <p className="text-sm text-slate-700">{reviewIncident.description}</p>
                </div>
                <div className="border-t border-slate-200 pt-3">
                  <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider mb-1">
                    Solusi Diajukan oleh {reviewIncident.proposedBy}
                    {reviewIncident.proposedAt && (
                      <span className="text-slate-400 normal-case font-normal ml-1">· {formatDate(reviewIncident.proposedAt)}</span>
                    )}
                  </p>
                  <p className="text-sm text-slate-800 font-medium">{reviewIncident.pendingSolution}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Status Perangkat Diusulkan</p>
                  <span className="text-xs font-bold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">
                    {reviewIncident.pendingAssetStatus || "ACTIVE"}
                  </span>
                </div>
              </div>

              {reviewError && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm mb-4">{reviewError}</div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setReviewIncident(null)}
                  className="flex-1 bg-slate-100 text-slate-700 font-semibold py-2.5 rounded-lg text-sm hover:bg-slate-200 transition"
                >
                  Tutup
                </button>
                <button
                  onClick={handleReject}
                  disabled={reviewLoading}
                  className="flex-1 bg-red-600 text-white font-semibold py-2.5 rounded-lg text-sm hover:bg-red-700 transition disabled:opacity-60"
                >
                  {reviewLoading ? "Proses..." : "✗ Tolak"}
                </button>
                <button
                  onClick={handleApprove}
                  disabled={reviewLoading}
                  className="flex-1 bg-green-600 text-white font-semibold py-2.5 rounded-lg text-sm hover:bg-green-700 transition disabled:opacity-60"
                >
                  {reviewLoading ? "Proses..." : "✓ Acc"}
                </button>
              </div>
            </div>
          </div>
        </Dialog>
      )}

      {/* ═══════════════════════════════════════════════════════
          MODAL: Selesaikan Langsung (Admin)
      ═══════════════════════════════════════════════════════ */}
      {resolveId && (
        <Dialog label="Selesaikan Insiden" onClose={() => setResolveId(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-1">Selesaikan Insiden</h2>
              <p className="text-sm text-slate-500 mb-5">Isi solusi perbaikan dan perbarui status perangkat secara langsung.</p>
              <form onSubmit={handleResolve} className="space-y-4">
                {resolveError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{resolveError}</div>
                )}
                <div>
                  <label htmlFor="incidents-page-field-6" className="block text-sm font-semibold text-slate-700 mb-1.5">Solusi Perbaikan <span className="text-red-500">*</span></label>
                  <textarea id="incidents-page-field-6"
                    value={resolveForm.solution}
                    onChange={(e) => setResolveForm((f) => ({ ...f, solution: e.target.value }))}
                    required rows={4}
                    placeholder="Jelaskan solusi yang dilakukan..."
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400 resize-none"
                  />
                </div>
                <div>
                  <label htmlFor="incidents-page-field-7" className="block text-sm font-semibold text-slate-700 mb-1.5">Update Status Perangkat</label>
                  <select id="incidents-page-field-7"
                    value={resolveForm.assetStatus}
                    onChange={(e) => setResolveForm((f) => ({ ...f, assetStatus: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {ASSET_STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setResolveId(null)} className="flex-1 bg-slate-100 text-slate-700 font-semibold py-2.5 rounded-lg text-sm hover:bg-slate-200 transition">
                    Batal
                  </button>
                  <button type="submit" disabled={resolveLoading} className="flex-1 bg-green-600 text-white font-semibold py-2.5 rounded-lg text-sm hover:bg-green-700 transition disabled:opacity-60">
                    {resolveLoading ? "Menyimpan..." : "✓ Selesaikan"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </Dialog>
      )}

      {/* ═══════════════════════════════════════════════════════
          MODAL: Hapus Konfirmasi
      ═══════════════════════════════════════════════════════ */}
      {deleteId && (
        <Dialog label="Hapus Insiden?" onClose={() => setDeleteId(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-2">Hapus Insiden?</h2>
            <p className="text-sm text-slate-600 mb-4">Catatan insiden ini akan dihapus permanen.</p>
            {deleteError && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm mb-4">{deleteError}</div>
            )}
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 bg-slate-100 text-slate-700 font-semibold py-2.5 rounded-lg text-sm hover:bg-slate-200 transition">
                Batal
              </button>
              <button onClick={handleDelete} disabled={deleteLoading} className="flex-1 bg-red-600 text-white font-semibold py-2.5 rounded-lg text-sm hover:bg-red-700 transition disabled:opacity-60">
                {deleteLoading ? "Menghapus..." : "Ya, Hapus"}
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
