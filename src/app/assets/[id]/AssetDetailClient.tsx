"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ASSET_STATUS_LABELS,
  ASSET_STATUS_COLORS,
  INCIDENT_RESOLVE_STATUSES,
  isAdminRole,
} from "@/lib/utils";
import {
  STOCK_CONDITIONS,
  STOCK_CONDITION_LABELS,
  StockCondition,
} from "@/lib/stock";
import StockSummary from "@/components/StockSummary";

interface Branch {
  id: string;
  name: string;
  location?: string;
}

interface Incident {
  id: string;
  assetId: string;
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
}

interface Transfer {
  id: string;
  assetId: string;
  fromBranchId: string;
  toBranchId: string;
  fromBranch: { id: string; name: string };
  toBranch: { id: string; name: string };
  reason: string;
  status: string;
  transferredAt: string;
  requestedBy?: { id: string; name: string; username: string };
  approvedBy?: { id: string; name: string; username: string } | null;
}

interface Asset {
  id: string;
  name: string;
  divisionName: string;
  categoryName: string;
  serialNumber: string | null;
  brand: string | null;
  model: string | null;
  specs: string | null;
  purchaseDate: string | null;
  warrantyDate: string | null;
  status: string;
  quantity: number;
  activeQty: number;
  brokenQty: number;
  repairQty: number;
  retiredQty: number;
  reservedQty: number;
  photoUrl: string | null;
  notes: string | null;
  branchId: string;
  branch: Branch;
  createdAt: string;
  updatedAt: string;
}

interface Bap {
  id: string;
  assetId: string;
  quantity: number;
  sourceCondition: string;
  fileUrl: string;
  status: string;
  notes: string | null;
  requestedBy: { id: string; name: string; username: string };
  approvedBy?: { id: string; name: string; username: string } | null;
  createdAt: string;
  updatedAt?: string;
}

interface Props {
  asset: Asset;
  incidents: Incident[];
  transfers: Transfer[];
  branches: Branch[];
  userRole: string | null;
  bap: Bap | null;
}

type Tab = "info" | "incidents" | "transfers";

function formatDate(d: Date | string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

function formatDateTime(d: Date | string | null): string {
  if (!d) return "—";
  return (
    new Date(d).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Jakarta",
    }) + " WIB"
  );
}

export default function AssetDetailClient({ asset, incidents, transfers, branches, userRole, bap }: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("info");

  // Transfer Modal
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferForm, setTransferForm] = useState({ toBranchId: "", reason: "" });
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);

  // Incident Modal
  const [showIncidentModal, setShowIncidentModal] = useState(false);
  const [incidentForm, setIncidentForm] = useState({ description: "", quantity: "1" });
  const [incidentLoading, setIncidentLoading] = useState(false);
  const [incidentError, setIncidentError] = useState<string | null>(null);

  // Resolve Modal (Admin langsung)
  const [resolveIncidentId, setResolveIncidentId] = useState<string | null>(null);
  const [resolveForm, setResolveForm] = useState({ solution: "", assetStatus: "ACTIVE" });
  const [resolveLoading, setResolveLoading] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  // Propose Modal (IT Support mengajukan selesai)
  const [proposeIncidentId, setProposeIncidentId] = useState<string | null>(null);
  const [proposeForm, setProposeForm] = useState({ solution: "", assetStatus: "ACTIVE" });
  const [proposeLoading, setProposeLoading] = useState(false);
  const [proposeError, setProposeError] = useState<string | null>(null);

  // Review Modal (Admin acc/tolak pengajuan)
  const [reviewIncident, setReviewIncident] = useState<Incident | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  // BAP Modal
  const [showBapModal, setShowBapModal] = useState(false);
  const [bapFile, setBapFile] = useState<File | null>(null);
  const [bapForm, setBapForm] = useState({ quantity: "1", notes: "", sourceCondition: "ACTIVE" });
  const [bapLoading, setBapLoading] = useState(false);
  const [bapError, setBapError] = useState<string | null>(null);
  
  // Rejection Notes for BAP Rejection Dialog
  const [showRejectBapDialog, setShowRejectBapDialog] = useState(false);
  const [bapRejectNotes, setBapRejectNotes] = useState("");

  // Approval Loading States
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const isAdmin = isAdminRole(userRole);
  // Terkunci penuh hanya ketika SELURUH sisa stok sedang diajukan BAP
  // (BAP_PENDING) atau stok sudah habis (BAP). BAP parsial menyisakan stok yang
  // tetap bisa dilaporkan rusak dan ditransfer.
  const isLocked = asset.status === "BAP_PENDING" || asset.status === "BAP";
  const pendingTransfer = transfers.find((t) => t.status === "PENDING");
  const hasPendingBap = bap?.status === "PENDING";

  const stockByCondition: Record<StockCondition, number> = {
    ACTIVE: asset.activeQty,
    BROKEN: asset.brokenQty,
    REPAIR: asset.repairQty,
    RETIRED: asset.retiredQty,
  };

  // Pcs yang boleh dinyatakan rusak — sejalan dengan validasi POST /api/incidents
  const reportableQty = asset.quantity - asset.reservedQty - asset.retiredQty;
  const bapSource = bapForm.sourceCondition as StockCondition;
  const bapMaxQty = stockByCondition[bapSource] ?? 0;

  /** Bucket default saat membuka modal BAP: utamakan stok yang benar-benar ada. */
  function defaultBapSource(): StockCondition {
    return (
      STOCK_CONDITIONS.find((c) => stockByCondition[c] > 0) ?? "ACTIVE"
    );
  }

  async function handleBap(e: React.FormEvent) {
    e.preventDefault();
    if (!bapFile) {
      setBapError("File BAP (PDF atau Gambar) wajib diunggah.");
      return;
    }
    setBapLoading(true);
    setBapError(null);
    try {
      const formData = new FormData();
      formData.append("file", bapFile);
      formData.append("quantity", bapForm.quantity);
      formData.append("sourceCondition", bapForm.sourceCondition);
      formData.append("notes", bapForm.notes);

      const res = await fetch(`/api/assets/${asset.id}/bap`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setBapError(data.error || "Gagal mengajukan BAP.");
        setBapLoading(false);
        return;
      }
      setShowBapModal(false);
      setBapFile(null);
      setBapForm({ quantity: "1", notes: "", sourceCondition: "ACTIVE" });
      router.refresh();
    } catch {
      setBapError("Terjadi kesalahan jaringan.");
      setBapLoading(false);
    }
  }

  async function handleApproveBap() {
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/assets/${asset.id}/bap/approve`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setActionError(data.error || "Gagal menyetujui BAP.");
        setActionLoading(false);
        return;
      }
      setActionLoading(false);
      router.refresh();
    } catch {
      setActionError("Terjadi kesalahan jaringan.");
      setActionLoading(false);
    }
  }

  async function handleRejectBap(notes: string) {
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/assets/${asset.id}/bap/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setActionError(data.error || "Gagal menolak BAP.");
        setActionLoading(false);
        return;
      }
      setActionLoading(false);
      setShowRejectBapDialog(false);
      setBapRejectNotes("");
      router.refresh();
    } catch {
      setActionError("Terjadi kesalahan jaringan.");
      setActionLoading(false);
    }
  }

  async function handleApproveTransfer(transferId: string) {
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/transfers/${transferId}/approve`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setActionError(data.error || "Gagal menyetujui transfer.");
        setActionLoading(false);
        return;
      }
      setActionLoading(false);
      router.refresh();
    } catch {
      setActionError("Terjadi kesalahan jaringan.");
      setActionLoading(false);
    }
  }

  async function handleRejectTransfer(transferId: string) {
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/transfers/${transferId}/reject`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setActionError(data.error || "Gagal menolak transfer.");
        setActionLoading(false);
        return;
      }
      setActionLoading(false);
      router.refresh();
    } catch {
      setActionError("Terjadi kesalahan jaringan.");
      setActionLoading(false);
    }
  }

  async function handleTransfer(e: React.FormEvent) {
    e.preventDefault();
    setTransferLoading(true);
    setTransferError(null);
    try {
      const res = await fetch(`/api/assets/${asset.id}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(transferForm),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setTransferError(data.error || "Gagal melakukan transfer.");
        setTransferLoading(false);
        return;
      }
      setShowTransferModal(false);
      router.refresh();
    } catch {
      setTransferError("Terjadi kesalahan jaringan.");
      setTransferLoading(false);
    }
  }

  async function handleCreateIncident(e: React.FormEvent) {
    e.preventDefault();
    setIncidentLoading(true);
    setIncidentError(null);
    try {
      const res = await fetch("/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetId: asset.id,
          description: incidentForm.description,
          quantity: parseInt(incidentForm.quantity, 10) || 1,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setIncidentError(data.error || "Gagal membuat tiket insiden.");
        setIncidentLoading(false);
        return;
      }
      setShowIncidentModal(false);
      setIncidentForm({ description: "", quantity: "1" });
      router.refresh();
    } catch {
      setIncidentError("Terjadi kesalahan jaringan.");
      setIncidentLoading(false);
    }
  }

  async function handleResolveIncident(e: React.FormEvent) {
    e.preventDefault();
    if (!resolveIncidentId) return;
    setResolveLoading(true);
    setResolveError(null);
    try {
      const res = await fetch(`/api/incidents/${resolveIncidentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve", ...resolveForm }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setResolveError(data.error || "Gagal menyelesaikan insiden.");
        setResolveLoading(false);
        return;
      }
      setResolveIncidentId(null);
      setResolveForm({ solution: "", assetStatus: "ACTIVE" });
      router.refresh();
    } catch {
      setResolveError("Terjadi kesalahan jaringan.");
      setResolveLoading(false);
    }
  }

  async function handleProposeIncident(e: React.FormEvent) {
    e.preventDefault();
    if (!proposeIncidentId) return;
    setProposeLoading(true);
    setProposeError(null);
    try {
      const res = await fetch(`/api/incidents/${proposeIncidentId}`, {
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
      setProposeIncidentId(null);
      setProposeForm({ solution: "", assetStatus: "ACTIVE" });
      router.refresh();
    } catch {
      setProposeError("Terjadi kesalahan jaringan.");
      setProposeLoading(false);
    }
  }

  async function handleApproveIncident() {
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
      router.refresh();
    } catch {
      setReviewError("Terjadi kesalahan jaringan.");
      setReviewLoading(false);
    }
  }

  async function handleRejectIncident() {
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
      router.refresh();
    } catch {
      setReviewError("Terjadi kesalahan jaringan.");
      setReviewLoading(false);
    }
  }

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: "info", label: "Informasi Umum" },
    { key: "incidents", label: "Riwayat Insiden", count: incidents.length },
    { key: "transfers", label: "Riwayat Transfer", count: transfers.length },
  ];

  return (
    <>
      {/* Rincian Stok — inti model persediaan: total, siap pakai, dan sebaran
          kondisinya. Ditempatkan di atas tab agar terlihat lebih dulu. */}
      <div className="mb-4">
        <StockSummary stock={asset} />
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col gap-4 mb-4">
        {actionError && (
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-3 text-sm font-medium">
            ⚠️ {actionError}
          </div>
        )}
        
        <div className="flex items-center gap-3 flex-wrap">
          {/* Only allow incident reporting & transfer requests if not locked */}
          {!isLocked && (
            <>
              <button
                onClick={() => {
                  setShowIncidentModal(true);
                  setIncidentError(null);
                  setIncidentForm({ description: "", quantity: "1" });
                }}
                disabled={reportableQty <= 0}
                className="bg-red-600 text-white font-semibold px-4 py-2 rounded-lg text-sm hover:bg-red-700 transition shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
              >
                🔧 Buat Tiket Insiden
              </button>
              {branches.length > 0 && (
                <button
                  onClick={() => { setShowTransferModal(true); setTransferError(null); setTransferForm({ toBranchId: "", reason: "" }); }}
                  className="bg-blue-600 text-white font-semibold px-4 py-2 rounded-lg text-sm hover:bg-blue-700 transition shadow-xs"
                >
                  🔄 Transfer Aset
                </button>
              )}
              {/* Hanya boleh ada satu pengajuan BAP menunggu persetujuan per aset */}
              <button
                onClick={() => {
                  setShowBapModal(true);
                  setBapError(null);
                  setBapFile(null);
                  setBapForm({ quantity: "1", notes: "", sourceCondition: defaultBapSource() });
                }}
                disabled={hasPendingBap}
                title={hasPendingBap ? "Masih ada pengajuan BAP yang menunggu persetujuan" : undefined}
                className="bg-slate-800 text-white font-semibold px-4 py-2 rounded-lg text-sm hover:bg-slate-900 transition shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
              >
                📄 Ajukan Penghapusan (BAP)
              </button>
            </>
          )}

          {/* Admin Approval controls for BAP — dipicu oleh adanya pengajuan yang
              masih PENDING, bukan oleh status aset: BAP parsial menyisakan aset
              berstatus ACTIVE sehingga tombol ini tidak boleh bergantung padanya. */}
          {hasPendingBap && isAdmin && (
            <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 p-2 rounded-lg flex-wrap">
              <span className="text-xs font-semibold text-blue-800 px-2">
                Persetujuan BAP ({bap?.quantity} pcs):
              </span>
              <button
                onClick={handleApproveBap}
                disabled={actionLoading}
                className="bg-green-600 text-white font-semibold px-3 py-1.5 rounded-lg text-xs hover:bg-green-700 transition disabled:opacity-60"
              >
                {actionLoading ? "Proses..." : "✓ Setujui BAP"}
              </button>
              <button
                onClick={() => { setShowRejectBapDialog(true); setBapRejectNotes(""); }}
                disabled={actionLoading}
                className="bg-red-600 text-white font-semibold px-3 py-1.5 rounded-lg text-xs hover:bg-red-700 transition disabled:opacity-60"
              >
                ✗ Tolak BAP
              </button>
            </div>
          )}

          {/* Admin Approval controls for Transfer */}
          {pendingTransfer && isAdmin && (
            <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 p-2 rounded-lg">
              <span className="text-xs font-semibold text-yellow-800 px-2">Persetujuan Transfer:</span>
              <button
                onClick={() => handleApproveTransfer(pendingTransfer.id)}
                disabled={actionLoading}
                className="bg-green-600 text-white font-semibold px-3 py-1.5 rounded-lg text-xs hover:bg-green-700 transition disabled:opacity-60"
              >
                {actionLoading ? "Proses..." : "✓ Setujui Transfer"}
              </button>
              <button
                onClick={() => handleRejectTransfer(pendingTransfer.id)}
                disabled={actionLoading}
                className="bg-red-600 text-white font-semibold px-3 py-1.5 rounded-lg text-xs hover:bg-red-700 transition disabled:opacity-60"
              >
                ✗ Tolak Transfer
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        {/* Tab Navigation */}
        <div className="border-b border-slate-200 bg-slate-50/50 flex">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-5 py-3.5 text-sm font-semibold transition-colors relative flex items-center gap-2 ${
                activeTab === tab.key
                  ? "text-indigo-600 bg-white border-b-2 border-indigo-600"
                  : "text-slate-600 hover:text-slate-900 hover:bg-white"
              }`}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                  activeTab === tab.key ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-600"
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="p-6">
          
          {/* INFO TAB */}
          {activeTab === "info" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-5">
              <InfoRow label="Nama Perangkat" value={asset.name} />
              <InfoRow label="Divisi" value={asset.divisionName} />
              <InfoRow label="Kategori" value={asset.categoryName} />
              <InfoRow label="Brand / Merk" value={asset.brand || "—"} />
              <InfoRow label="Model / Seri" value={asset.model || "—"} />
              <InfoRow label="Serial Number" value={asset.serialNumber || "—"} mono />
              <InfoRow label="Lokasi (Cabang)" value={asset.branch.name} />
              <InfoRow label="Status" value={
                <span className={`status-badge status-badge-sm ${ASSET_STATUS_COLORS[asset.status] || ""}`}>
                  {ASSET_STATUS_LABELS[asset.status] || asset.status}
                </span>
              } />
              <InfoRow label="Tanggal Pembelian" value={formatDate(asset.purchaseDate)} />
              <InfoRow label="Garansi Berakhir" value={formatDate(asset.warrantyDate)} />
              <InfoRow label="Terdaftar" value={formatDateTime(asset.createdAt)} />
              {asset.specs && (
                <div className="col-span-full">
                  <dt className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Spesifikasi</dt>
                  <dd className="text-sm text-slate-800 bg-slate-50 rounded-lg px-4 py-3 whitespace-pre-wrap border border-slate-100">{asset.specs}</dd>
                </div>
              )}
              {asset.notes && (
                <div className="col-span-full">
                  <dt className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Catatan</dt>
                  <dd className="text-sm text-slate-800 bg-amber-50 rounded-lg px-4 py-3 whitespace-pre-wrap border border-amber-100">{asset.notes}</dd>
                </div>
              )}
              {asset.photoUrl && (
                <div className="col-span-full">
                  <dt className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Foto Perangkat</dt>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={asset.photoUrl} alt={asset.name} className="max-h-48 rounded-lg border border-slate-200 object-contain bg-slate-50" />
                </div>
              )}
              {bap && (
                <div className="col-span-full border-t border-slate-200 pt-4 mt-2">
                  <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-1.5">
                    📄 Detail Pengajuan BAP (Penghapusan Aset)
                  </h3>
                  <div className="bg-indigo-50/20 rounded-xl border border-indigo-100 p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <InfoRow label="Status BAP" value={
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                        bap.status === "PENDING"
                          ? "bg-yellow-100 text-yellow-800"
                          : bap.status === "APPROVED"
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                      }`}>
                        {bap.status === "PENDING" ? "Menunggu Persetujuan" : bap.status === "APPROVED" ? "Disetujui" : "Ditolak"}
                      </span>
                    } />
                    <InfoRow label="Jumlah Dihapus" value={`${bap.quantity} pcs`} />
                    <InfoRow
                      label="Diambil dari Stok"
                      value={
                        STOCK_CONDITION_LABELS[bap.sourceCondition as StockCondition] ??
                        bap.sourceCondition
                      }
                    />
                    <InfoRow label="Diajukan Oleh" value={bap.requestedBy.name} />
                    <InfoRow label="Tanggal Pengajuan" value={formatDate(bap.createdAt)} />
                    {bap.approvedBy && (
                      <InfoRow
                        label={bap.status === "APPROVED" ? "Disetujui Oleh" : "Ditolak Oleh"}
                        value={bap.approvedBy.name}
                      />
                    )}
                    {bap.notes && (
                      <div className="col-span-full">
                        <dt className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Catatan BAP</dt>
                        <dd className="text-sm text-slate-700">{bap.notes}</dd>
                      </div>
                    )}
                    <div className="col-span-full">
                      <dt className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Dokumen BAP</dt>
                      <dd className="text-sm">
                        <a
                          href={bap.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 font-semibold hover:underline flex items-center gap-1"
                        >
                          📥 Unduh / Buka Dokumen ({bap.fileUrl.endsWith(".pdf") ? "PDF" : "Gambar"})
                        </a>
                      </dd>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* INCIDENTS TAB */}
          {activeTab === "incidents" && (
            <div className="space-y-4">
              {incidents.length === 0 ? (
                <div className="py-10 text-center">
                  <div className="text-4xl mb-2">✅</div>
                  <p className="font-semibold text-slate-700">Tidak ada riwayat insiden</p>
                  <p className="text-xs text-slate-400 mt-1">Perangkat ini belum pernah mengalami kerusakan yang tercatat.</p>
                </div>
              ) : (
                incidents.map((incident) => {
                  const isPendingReview = incident.resolveStatus === "PENDING_REVIEW";
                  const isRejected = incident.resolveStatus === "REJECTED";
                  return (
                  <div
                    key={incident.id}
                    className={`border rounded-xl p-4 ${
                      incident.resolvedAt
                        ? "border-green-100 bg-green-50/40"
                        : isPendingReview
                        ? "border-amber-200 bg-amber-50/40"
                        : "border-red-100 bg-red-50/40"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          {incident.resolvedAt ? (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full border bg-green-100 text-green-700 border-green-200">
                              ✓ Resolved
                            </span>
                          ) : isPendingReview ? (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full border bg-amber-100 text-amber-700 border-amber-200 animate-pulse">
                              ⏳ Menunggu Acc Admin
                            </span>
                          ) : (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full border bg-red-100 text-red-700 border-red-200 animate-pulse">
                              ⏳ Unresolved
                            </span>
                          )}
                          {isRejected && (
                            <span className="text-xs text-red-500 font-medium">↩ Pengajuan sebelumnya ditolak</span>
                          )}
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full border bg-slate-100 text-slate-700 border-slate-200">
                            {incident.quantity} pcs
                          </span>
                          <span className="text-xs text-slate-400">Dilaporkan: {formatDate(incident.reportedAt)}</span>
                          {incident.handledBy && (
                            <span className="text-xs text-slate-400">· Diselesaikan oleh: {incident.handledBy}</span>
                          )}
                        </div>
                        <p className="text-sm font-medium text-slate-800">{incident.description}</p>
                        {/* Solusi pending review */}
                        {isPendingReview && incident.pendingSolution && (
                          <div className="mt-2 pt-2 border-t border-amber-200">
                            <p className="text-xs font-semibold text-amber-700 mb-0.5">📝 Solusi diajukan oleh {incident.proposedBy}:</p>
                            <p className="text-sm text-slate-700">{incident.pendingSolution}</p>
                            {incident.pendingAssetStatus && (
                              <p className="text-xs text-amber-600 mt-0.5">Status diusulkan: <strong>{incident.pendingAssetStatus}</strong></p>
                            )}
                          </div>
                        )}
                        {/* Solusi final */}
                        {incident.solution && !isPendingReview && (
                          <div className="mt-2 pt-2 border-t border-green-200">
                            <p className="text-xs font-semibold text-green-700 mb-0.5">Solusi Perbaikan:</p>
                            <p className="text-sm text-slate-700">{incident.solution}</p>
                            {incident.resolvedAt && (
                              <p className="text-xs text-slate-400 mt-1">Diselesaikan: {formatDate(incident.resolvedAt)}</p>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-2 flex-shrink-0">
                        {/* Admin: Acc / Tolak jika ada pending review */}
                        {isAdmin && isPendingReview && (
                          <button
                            onClick={() => { setReviewIncident(incident); setReviewError(null); }}
                            className="bg-amber-500 text-white font-semibold px-3 py-1.5 rounded-lg text-xs hover:bg-amber-600 transition"
                          >
                            ✓ Acc / Tolak
                          </button>
                        )}
                        {/* Admin: Selesaikan langsung */}
                        {isAdmin && !incident.resolvedAt && !isPendingReview && (
                          <button
                            onClick={() => {
                              setResolveIncidentId(incident.id);
                              setResolveForm({ solution: "", assetStatus: "ACTIVE" });
                              setResolveError(null);
                            }}
                            className="bg-green-600 text-white font-semibold px-3 py-1.5 rounded-lg text-xs hover:bg-green-700 transition"
                          >
                            ✓ Selesaikan
                          </button>
                        )}
                        {/* IT Support / Kitchen: Ajukan Selesai */}
                        {!isAdmin && !incident.resolvedAt && !isPendingReview && (
                          <button
                            onClick={() => {
                              setProposeIncidentId(incident.id);
                              setProposeForm({ solution: "", assetStatus: "ACTIVE" });
                              setProposeError(null);
                            }}
                            className="bg-indigo-600 text-white font-semibold px-3 py-1.5 rounded-lg text-xs hover:bg-indigo-700 transition"
                          >
                            📝 Ajukan Selesai
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  );
                })
              )}
            </div>
          )}

          {/* TRANSFERS TAB */}
          {activeTab === "transfers" && (
            <div className="space-y-4">
              {transfers.length === 0 ? (
                <div className="py-10 text-center">
                  <div className="text-4xl mb-2">📍</div>
                  <p className="font-semibold text-slate-700">Belum ada riwayat perpindahan</p>
                  <p className="text-xs text-slate-400 mt-1">Aset ini belum pernah dipindahkan ke cabang lain.</p>
                </div>
              ) : (
                <div className="relative">
                  {/* Timeline Line */}
                  <div className="absolute left-4 top-0 bottom-0 w-px bg-slate-200"></div>

                  <div className="space-y-4">
                    {transfers.map((transfer) => (
                      <div key={transfer.id} className="relative pl-10">
                        {/* Dot */}
                        <div className="absolute left-3 top-4 w-3 h-3 rounded-full bg-indigo-500 border-2 border-white shadow-sm"></div>

                        <div className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-sm transition">
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div>
                              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 flex-wrap">
                                <span className="text-slate-500">{transfer.fromBranch.name}</span>
                                <span className="text-indigo-600">→</span>
                                <span>{transfer.toBranch.name}</span>
                              </div>
                              <p className="text-sm text-slate-600 mt-1">{transfer.reason}</p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-xs font-semibold text-slate-500">{formatDate(transfer.transferredAt)}</p>
                              <p className="text-xs text-slate-400 mt-0.5">oleh {transfer.requestedBy?.name || "-"}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modal: Transfer Aset */}
      {showTransferModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-1">Transfer Aset</h2>
              <p className="text-sm text-slate-500 mb-5">Pindahkan <strong>{asset.name}</strong> dari <strong>{asset.branch.name}</strong> ke cabang lain.</p>
              
              <form onSubmit={handleTransfer} className="space-y-4">
                {transferError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{transferError}</div>
                )}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Cabang Tujuan <span className="text-red-500">*</span></label>
                  <select
                    value={transferForm.toBranchId}
                    onChange={(e) => setTransferForm((f) => ({ ...f, toBranchId: e.target.value }))}
                    required
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Pilih cabang tujuan...</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Alasan Transfer <span className="text-red-500">*</span></label>
                  <textarea
                    value={transferForm.reason}
                    onChange={(e) => setTransferForm((f) => ({ ...f, reason: e.target.value }))}
                    required
                    rows={3}
                    placeholder="Contoh: Mutasi operasional, pengiriman untuk perbaikan, dll."
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400 resize-none"
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setShowTransferModal(false)} className="flex-1 bg-slate-100 text-slate-700 font-semibold py-2.5 rounded-lg text-sm hover:bg-slate-200 transition">
                    Batal
                  </button>
                  <button type="submit" disabled={transferLoading} className="flex-1 bg-blue-600 text-white font-semibold py-2.5 rounded-lg text-sm hover:bg-blue-700 transition disabled:opacity-60">
                    {transferLoading ? "Memproses..." : "🔄 Transfer"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Buat Insiden */}
      {showIncidentModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-1">Buat Tiket Insiden</h2>
              <p className="text-sm text-slate-500 mb-5">Laporkan kerusakan atau masalah pada <strong>{asset.name}</strong>.</p>

              <form onSubmit={handleCreateIncident} className="space-y-4">
                {incidentError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{incidentError}</div>
                )}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    Jumlah Unit yang Rusak (pcs) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={Math.max(reportableQty, 1)}
                    value={incidentForm.quantity}
                    onChange={(e) => setIncidentForm((f) => ({ ...f, quantity: e.target.value }))}
                    required
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    Stok siap pakai saat ini: <strong className="text-slate-600">{asset.activeQty} pcs</strong> dari total {asset.quantity} pcs.
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Deskripsi Masalah / Gejala <span className="text-red-500">*</span></label>
                  <textarea
                    value={incidentForm.description}
                    onChange={(e) => setIncidentForm((f) => ({ ...f, description: e.target.value }))}
                    required
                    rows={4}
                    placeholder="Jelaskan gejala kerusakan secara detail..."
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400 resize-none"
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    Unit yang dilaporkan berpindah ke stok Rusak. Selama masih ada stok siap
                    pakai, aset tetap berstatus Aktif dengan jumlah berkurang.
                  </p>
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setShowIncidentModal(false)} className="flex-1 bg-slate-100 text-slate-700 font-semibold py-2.5 rounded-lg text-sm hover:bg-slate-200 transition">
                    Batal
                  </button>
                  <button type="submit" disabled={incidentLoading} className="flex-1 bg-red-600 text-white font-semibold py-2.5 rounded-lg text-sm hover:bg-red-700 transition disabled:opacity-60">
                    {incidentLoading ? "Menyimpan..." : "🔧 Buat Tiket"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Selesaikan Insiden */}
      {resolveIncidentId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-1">Selesaikan Insiden</h2>
              <p className="text-sm text-slate-500 mb-5">Isi solusi perbaikan dan perbarui status aset.</p>

              <form onSubmit={handleResolveIncident} className="space-y-4">
                {resolveError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{resolveError}</div>
                )}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Solusi Perbaikan <span className="text-red-500">*</span></label>
                  <textarea
                    value={resolveForm.solution}
                    onChange={(e) => setResolveForm((f) => ({ ...f, solution: e.target.value }))}
                    required
                    rows={4}
                    placeholder="Jelaskan solusi yang dilakukan untuk memperbaiki masalah..."
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400 resize-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Update Status Aset</label>
                  <select
                    value={resolveForm.assetStatus}
                    onChange={(e) => setResolveForm((f) => ({ ...f, assetStatus: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {INCIDENT_RESOLVE_STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setResolveIncidentId(null)} className="flex-1 bg-slate-100 text-slate-700 font-semibold py-2.5 rounded-lg text-sm hover:bg-slate-200 transition">
                    Batal
                  </button>
                  <button type="submit" disabled={resolveLoading} className="flex-1 bg-green-600 text-white font-semibold py-2.5 rounded-lg text-sm hover:bg-green-700 transition disabled:opacity-60">
                    {resolveLoading ? "Menyimpan..." : "✓ Selesaikan Insiden"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
      {/* Modal: Ajukan Selesai (IT Support) */}
      {proposeIncidentId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-1">Ajukan Penyelesaian Insiden</h2>
              <p className="text-sm text-slate-500 mb-5">Isi solusi dan status perangkat. Pengajuan akan menunggu persetujuan Admin.</p>
              <form onSubmit={handleProposeIncident} className="space-y-4">
                {proposeError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{proposeError}</div>
                )}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Solusi / Tindakan yang Dilakukan <span className="text-red-500">*</span></label>
                  <textarea
                    value={proposeForm.solution}
                    onChange={(e) => setProposeForm((f) => ({ ...f, solution: e.target.value }))}
                    required rows={4}
                    placeholder="Jelaskan tindakan perbaikan yang sudah dilakukan..."
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400 resize-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Status Perangkat yang Diusulkan</label>
                  <select
                    value={proposeForm.assetStatus}
                    onChange={(e) => setProposeForm((f) => ({ ...f, assetStatus: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {INCIDENT_RESOLVE_STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-xs text-amber-700">
                  ℹ️ Pengajuan ini akan dikirim ke Admin dan menunggu persetujuan sebelum insiden resmi ditandai selesai.
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setProposeIncidentId(null)} className="flex-1 bg-slate-100 text-slate-700 font-semibold py-2.5 rounded-lg text-sm hover:bg-slate-200 transition">
                    Batal
                  </button>
                  <button type="submit" disabled={proposeLoading} className="flex-1 bg-indigo-600 text-white font-semibold py-2.5 rounded-lg text-sm hover:bg-indigo-700 transition disabled:opacity-60">
                    {proposeLoading ? "Mengirim..." : "📝 Kirim Pengajuan"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Review Acc / Tolak (Admin) */}
      {reviewIncident && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-1">Review Pengajuan Penyelesaian</h2>
              <p className="text-sm text-slate-500 mb-4">Periksa solusi yang diajukan dan putuskan untuk menyetujui atau menolak.</p>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4 space-y-3">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Masalah</p>
                  <p className="text-sm text-slate-700">{reviewIncident.description}</p>
                </div>
                <div className="border-t border-slate-200 pt-3">
                  <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider mb-1">
                    Solusi Diajukan oleh {reviewIncident.proposedBy}
                    {reviewIncident.proposedAt && (
                      <span className="text-slate-400 normal-case font-normal ml-1">
                        · {new Date(reviewIncident.proposedAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" })}
                      </span>
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
                  onClick={handleRejectIncident}
                  disabled={reviewLoading}
                  className="flex-1 bg-red-600 text-white font-semibold py-2.5 rounded-lg text-sm hover:bg-red-700 transition disabled:opacity-60"
                >
                  {reviewLoading ? "Proses..." : "✗ Tolak"}
                </button>
                <button
                  onClick={handleApproveIncident}
                  disabled={reviewLoading}
                  className="flex-1 bg-green-600 text-white font-semibold py-2.5 rounded-lg text-sm hover:bg-green-700 transition disabled:opacity-60"
                >
                  {reviewLoading ? "Proses..." : "✓ Acc"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Ajukan BAP */}
      {showBapModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-1">Ajukan Penghapusan Aset (BAP)</h2>
              <p className="text-sm text-slate-500 mb-5">
                Ajukan dokumen BAP untuk menghapus sebagian atau seluruh stok aset <strong>{asset.name}</strong>.
              </p>

              <form onSubmit={handleBap} className="space-y-4">
                {bapError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">
                    {bapError}
                  </div>
                )}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    File BAP (PDF / Gambar) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="file"
                    accept=".pdf, image/png, image/jpeg, image/webp"
                    onChange={(e) => setBapFile(e.target.files?.[0] || null)}
                    required
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    Format: PDF (max 5MB) atau Gambar (PNG, JPEG, WebP yang akan dikompres).
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    Diambil dari Stok <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={bapForm.sourceCondition}
                    onChange={(e) =>
                      setBapForm((f) => ({ ...f, sourceCondition: e.target.value, quantity: "1" }))
                    }
                    required
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    {STOCK_CONDITIONS.map((c) => (
                      <option key={c} value={c} disabled={stockByCondition[c] <= 0}>
                        {STOCK_CONDITION_LABELS[c]} ({stockByCondition[c]} pcs)
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-400 mt-1">
                    Contoh: unit yang <em>hilang</em> diambil dari stok Aktif, unit yang
                    sudah rusak permanen dari stok Rusak.
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    Jumlah yang Dihapus (pcs) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={Math.max(bapMaxQty, 1)}
                    value={bapForm.quantity}
                    onChange={(e) => setBapForm((f) => ({ ...f, quantity: e.target.value }))}
                    required
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    Tersedia {bapMaxQty} pcs pada stok {STOCK_CONDITION_LABELS[bapSource]}.
                    Sisa stok lain tetap dapat dipakai selama pengajuan menunggu persetujuan.
                  </p>
                  {bapMaxQty <= 0 && (
                    <p className="text-red-500 text-xs mt-1">
                      Tidak ada stok pada kondisi ini — pilih kondisi lain.
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Catatan / Alasan</label>
                  <textarea
                    value={bapForm.notes}
                    onChange={(e) => setBapForm((f) => ({ ...f, notes: e.target.value }))}
                    rows={3}
                    placeholder="Alasan penghapusan atau catatan lainnya..."
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400 resize-none"
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowBapModal(false)}
                    className="flex-1 bg-slate-100 text-slate-700 font-semibold py-2.5 rounded-lg text-sm hover:bg-slate-200 transition"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={bapLoading || bapMaxQty <= 0}
                    className="flex-1 bg-slate-900 text-white font-semibold py-2.5 rounded-lg text-sm hover:bg-slate-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {bapLoading ? "Mengajukan..." : "📄 Ajukan"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Dialog: Tolak BAP dengan Catatan */}
      {showRejectBapDialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-1">Tolak Pengajuan BAP?</h2>
            <p className="text-sm text-slate-500 mb-4">
              Silakan masukkan alasan penolakan BAP ini.
            </p>
            <div className="space-y-4">
              <textarea
                value={bapRejectNotes}
                onChange={(e) => setBapRejectNotes(e.target.value)}
                rows={3}
                placeholder="Alasan penolakan..."
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
              <div className="flex gap-3">
                <button
                  onClick={() => setShowRejectBapDialog(false)}
                  className="flex-1 bg-slate-100 text-slate-700 font-semibold py-2.5 rounded-lg text-sm hover:bg-slate-200 transition"
                >
                  Batal
                </button>
                <button
                  onClick={() => handleRejectBap(bapRejectNotes)}
                  disabled={actionLoading}
                  className="flex-1 bg-red-600 text-white font-semibold py-2.5 rounded-lg text-sm hover:bg-red-700 transition disabled:opacity-60"
                >
                  {actionLoading ? "Proses..." : "✗ Tolak"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">{label}</dt>
      <dd className={`text-sm text-slate-800 ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}
