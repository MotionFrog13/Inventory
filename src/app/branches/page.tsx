"use client";
import PageHeading from "@/components/PageHeading";
import GuideCard from "@/components/GuideCard";
import UiIcon from "@/components/UiIcon";
import Dialog from "@/components/Dialog";


export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { isSuperAdmin } from "@/lib/utils";

interface Branch {
  id: string;
  name: string;
  location: string;
  mapUrl?: string | null;
  assetCount: number;
  createdAt: string;
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("id-ID", {
    day: "numeric", month: "short", year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

export default function BranchesPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);

  // Modal: Tambah Cabang
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", location: "", mapUrl: "" });
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Modal: Edit Cabang
  const [editBranch, setEditBranch] = useState<Branch | null>(null);
  const [editForm, setEditForm] = useState({ name: "", location: "", mapUrl: "" });
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Modal: Hapus Konfirmasi
  const [deleteBranch, setDeleteBranch] = useState<Branch | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchBranches = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/branches");
      const data = await res.json();
      if (data.success) setBranches(data.data);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchBranches();
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => { if (d.success) setUserRole(d.data.role); })
      .catch(console.error);
  }, [fetchBranches]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddLoading(true);
    setAddError(null);
    try {
      const res = await fetch("/api/branches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addForm),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setAddError(data.error || "Gagal menambah cabang.");
        setAddLoading(false);
        return;
      }
      setShowAddModal(false);
      setAddForm({ name: "", location: "", mapUrl: "" });
      fetchBranches();
    } catch {
      setAddError("Terjadi kesalahan jaringan.");
      setAddLoading(false);
    }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editBranch) return;
    setEditLoading(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/branches/${editBranch.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setEditError(data.error || "Gagal mengupdate cabang.");
        setEditLoading(false);
        return;
      }
      setEditBranch(null);
      fetchBranches();
    } catch {
      setEditError("Terjadi kesalahan jaringan.");
      setEditLoading(false);
    }
  }

  async function handleDelete() {
    if (!deleteBranch) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/branches/${deleteBranch.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setDeleteError(data.error || "Gagal menghapus cabang.");
        setDeleteLoading(false);
        return;
      }
      setDeleteBranch(null);
      fetchBranches();
    } catch {
      setDeleteError("Terjadi kesalahan jaringan.");
      setDeleteLoading(false);
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <PageHeading eyebrow="Inventaris & operasional" title={<>Manajemen Cabang</>} description={<>Kelola data seluruh cabang dan titik operasional organisasi Anda.</>} />
        {isSuperAdmin(userRole) && (
          <button
            onClick={() => { setShowAddModal(true); setAddError(null); setAddForm({ name: "", location: "", mapUrl: "" }); }}
            className="bg-indigo-600 text-white font-semibold px-4 py-2.5 rounded-xl text-sm hover:bg-indigo-700 transition shadow-sm flex items-center gap-2"
          >
            + Tambah Cabang
          </button>
        )}
      </div>
      <GuideCard title="Kenali lokasi inventaris Anda" icon="building">Buka detail cabang untuk melihat stok dan kondisi aset. Daftar ini mengikuti outlet yang dapat Anda akses.</GuideCard>


      {/* Branch Cards / Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin"></div>
        </div>
      ) : branches.length === 0 ? (
        <div className="ui-panel bg-white border border-slate-200 rounded-xl py-16 text-center">
          <div className="text-5xl mb-3"><UiIcon size={40} name="building" className="inline-block align-middle" /></div>
          <p className="font-semibold text-slate-700">Belum ada cabang terdaftar</p>
          {isSuperAdmin(userRole) && (
            <button onClick={() => setShowAddModal(true)} className="mt-4 bg-indigo-600 text-white font-semibold px-4 py-2 rounded-lg text-sm hover:bg-indigo-700 transition">
              + Tambah Cabang Pertama
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {branches.map((branch) => (
            <div key={branch.id} className="ui-panel bg-white border border-slate-200 rounded-xl p-5 shadow-xs hover:shadow-md transition-shadow group">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-xl flex-shrink-0"><UiIcon name="building" className="inline-block align-middle" /></div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-slate-900 text-base truncate">{branch.name}</h3>
                    <p className="text-xs text-slate-500 truncate mt-0.5">{branch.location}</p>
                  </div>
                </div>

                {isSuperAdmin(userRole) && (
                  <div className="flex items-center gap-1 transition-opacity flex-shrink-0">
                    <button
                      onClick={() => { setEditBranch(branch); setEditForm({ name: branch.name, location: branch.location, mapUrl: branch.mapUrl || "" }); setEditError(null); }}
                      className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                      title="Edit Cabang"
                    >
                      <UiIcon name="edit" className="inline-block align-middle" />
                    </button>
                    {isSuperAdmin(userRole) && (
                      <button
                        onClick={() => { setDeleteBranch(branch); setDeleteError(null); }}
                        className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                        title="Hapus Cabang"
                      >
                        <UiIcon name="trash" className="inline-block align-middle" />
                      </button>
                    )}
                  </div>
                )}
              </div>

              {branch.mapUrl && (
                <div className="mt-4 relative w-full h-[180px] bg-slate-50 rounded-lg overflow-hidden border border-slate-100">
                  <iframe
                    title={"Peta cabang " + branch.name}
                    src={branch.mapUrl}
                    className="absolute inset-0 w-full h-full border-0"
                    allowFullScreen
                    loading="lazy"
                    referrerPolicy="strict-origin-when-cross-origin"
                  />
                </div>
              )}

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500">Total Aset</p>
                  <p className="text-2xl font-extrabold text-slate-900">{branch.assetCount}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-xs text-slate-400">Terdaftar</p>
                    <p className="text-xs text-slate-500 font-medium">{formatDate(branch.createdAt)}</p>
                  </div>
                  <Link
                    href={`/branches/${branch.id}`}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:underline whitespace-nowrap"
                  >
                    Detail →
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Total Summary */}
      {branches.length > 0 && (
        <div className="ui-panel bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-sm flex-wrap gap-3">
            <span className="text-slate-500">
              <strong className="text-slate-800">{branches.length}</strong> cabang terdaftar ·{" "}
              <strong className="text-slate-800">{branches.reduce((sum, b) => sum + b.assetCount, 0)}</strong> total aset
            </span>
            {!isSuperAdmin(userRole) && (
              <span className="text-xs text-slate-400">
                Hubungi Super Admin untuk mengubah data cabang.
              </span>
            )}
          </div>
        </div>
      )}

      {/* Modal: Tambah Cabang */}
      {showAddModal && (
        <Dialog label="Tambah Cabang Baru" onClose={() => setShowAddModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-1">Tambah Cabang Baru</h2>
              <p className="text-sm text-slate-500 mb-5">Daftarkan lokasi cabang baru ke sistem.</p>
              <form onSubmit={handleAdd} className="space-y-4">
                {addError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{addError}</div>
                )}
                <div>
                  <label htmlFor="branches-page-field-1" className="block text-sm font-semibold text-slate-700 mb-1.5">Nama Cabang <span className="text-red-500">*</span></label>
                  <input id="branches-page-field-1" type="text" value={addForm.name} onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                    required placeholder="Contoh: Bogor (Pusat), Jakarta Selatan"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400" />
                </div>
                <div>
                  <label htmlFor="branches-page-field-2" className="block text-sm font-semibold text-slate-700 mb-1.5">Alamat Lengkap <span className="text-red-500">*</span></label>
                  <textarea id="branches-page-field-2" value={addForm.location} onChange={(e) => setAddForm((f) => ({ ...f, location: e.target.value }))}
                    required rows={3} placeholder="Alamat lengkap cabang..."
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400 resize-none" />
                </div>
                <div>
                  <label htmlFor="branches-page-field-3" className="block text-sm font-semibold text-slate-700 mb-1.5">Google Maps Link / Iframe (Opsional)</label>
                  <textarea id="branches-page-field-3" value={addForm.mapUrl} onChange={(e) => setAddForm((f) => ({ ...f, mapUrl: e.target.value }))}
                    rows={2} placeholder="https://www.google.com/maps/embed?... atau kode <iframe src='...'></iframe>"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400 resize-none" />
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 bg-slate-100 text-slate-700 font-semibold py-2.5 rounded-lg text-sm hover:bg-slate-200 transition">
                    Batal
                  </button>
                  <button type="submit" disabled={addLoading} className="flex-1 bg-indigo-600 text-white font-semibold py-2.5 rounded-lg text-sm hover:bg-indigo-700 transition disabled:opacity-60">
                    {addLoading ? "Menyimpan..." : "+ Tambah Cabang"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </Dialog>
      )}

      {/* Modal: Edit Cabang */}
      {editBranch && (
        <Dialog label="Edit Cabang" onClose={() => setEditBranch(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-1">Edit Cabang</h2>
              <p className="text-sm text-slate-500 mb-5">Perbarui informasi cabang <strong>{editBranch.name}</strong>.</p>
              <form onSubmit={handleEdit} className="space-y-4">
                {editError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{editError}</div>
                )}
                <div>
                  <label htmlFor="branches-page-field-4" className="block text-sm font-semibold text-slate-700 mb-1.5">Nama Cabang <span className="text-red-500">*</span></label>
                  <input id="branches-page-field-4" type="text" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                    required
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label htmlFor="branches-page-field-5" className="block text-sm font-semibold text-slate-700 mb-1.5">Alamat Lengkap <span className="text-red-500">*</span></label>
                  <textarea id="branches-page-field-5" value={editForm.location} onChange={(e) => setEditForm((f) => ({ ...f, location: e.target.value }))}
                    required rows={3}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
                </div>
                <div>
                  <label htmlFor="branches-page-field-6" className="block text-sm font-semibold text-slate-700 mb-1.5">Google Maps Link / Iframe (Opsional)</label>
                  <textarea id="branches-page-field-6" value={editForm.mapUrl} onChange={(e) => setEditForm((f) => ({ ...f, mapUrl: e.target.value }))}
                    rows={2} placeholder="https://www.google.com/maps/embed?... atau kode <iframe src='...'></iframe>"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setEditBranch(null)} className="flex-1 bg-slate-100 text-slate-700 font-semibold py-2.5 rounded-lg text-sm hover:bg-slate-200 transition">
                    Batal
                  </button>
                  <button type="submit" disabled={editLoading} className="flex-1 bg-indigo-600 text-white font-semibold py-2.5 rounded-lg text-sm hover:bg-indigo-700 transition disabled:opacity-60">
                    {editLoading ? "Menyimpan..." : "💾 Simpan"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </Dialog>
      )}

      {/* Modal: Hapus Konfirmasi */}
      {deleteBranch && (
        <Dialog label="Hapus Cabang?" onClose={() => setDeleteBranch(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-2">Hapus Cabang?</h2>
            <p className="text-sm text-slate-600 mb-2">
              Cabang <strong>&ldquo;{deleteBranch.name}&rdquo;</strong> akan dihapus permanen.
            </p>
            {deleteBranch.assetCount > 0 && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2 text-sm mb-4">
                <UiIcon name="warning" className="inline-block align-middle" /> Cabang ini masih memiliki <strong>{deleteBranch.assetCount} aset</strong>. Hapus atau pindahkan aset terlebih dahulu.
              </div>
            )}
            {deleteError && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm mb-4">{deleteError}</div>
            )}
            <div className="flex gap-3">
              <button onClick={() => setDeleteBranch(null)} className="flex-1 bg-slate-100 text-slate-700 font-semibold py-2.5 rounded-lg text-sm hover:bg-slate-200 transition">
                Batal
              </button>
              <button onClick={handleDelete} disabled={deleteLoading || deleteBranch.assetCount > 0} className="flex-1 bg-red-600 text-white font-semibold py-2.5 rounded-lg text-sm hover:bg-red-700 transition disabled:opacity-60">
                {deleteLoading ? "Menghapus..." : "Ya, Hapus"}
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
