"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import AccessDenied from "@/components/AccessDenied";
import type { SessionUserView } from "@/lib/utils";

interface CategoryRow {
  id: string;
  name: string;
  _count: { assets: number };
}

interface DivisionRow {
  id: string;
  name: string;
  description: string | null;
  categories: CategoryRow[];
  _count: { assets: number; users?: number };
}

type Modal =
  | { kind: "division"; division: DivisionRow | null } // null = tambah
  | { kind: "category"; divisionId: string; category: CategoryRow | null }
  | { kind: "delete-division"; division: DivisionRow }
  | { kind: "delete-category"; category: CategoryRow }
  | null;

const inputClass =
  "w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-200 ease-in-out";
const labelClass = "block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5";

export default function DivisionsPage() {
  const [me, setMe] = useState<SessionUserView | null>(null);
  const [divisions, setDivisions] = useState<DivisionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<Modal>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [meRes, divRes] = await Promise.all([
        fetch("/api/auth/me").then((r) => r.json()),
        fetch("/api/divisions").then((r) => r.json()),
      ]);
      if (meRes.success) setMe(meRes.data);
      if (divRes.success) setDivisions(divRes.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const isSuperAdmin = me?.role === "SUPER_ADMIN";
  const canManage = isSuperAdmin || me?.role === "DIVISION_ADMIN";

  function open(next: Modal) {
    setModal(next);
    setError(null);
    setName(
      next?.kind === "division" ? next.division?.name ?? ""
      : next?.kind === "category" ? next.category?.name ?? ""
      : ""
    );
    setDescription(next?.kind === "division" ? next.division?.description ?? "" : "");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!modal) return;

    let url = "";
    let method = "POST";
    let body: object | undefined;
    switch (modal.kind) {
      case "division":
        url = modal.division ? `/api/divisions/${modal.division.id}` : "/api/divisions";
        method = modal.division ? "PUT" : "POST";
        body = { name, description };
        break;
      case "category":
        url = modal.category ? `/api/categories/${modal.category.id}` : `/api/divisions/${modal.divisionId}/categories`;
        method = modal.category ? "PUT" : "POST";
        body = { name };
        break;
      case "delete-division":
        url = `/api/divisions/${modal.division.id}`;
        method = "DELETE";
        break;
      case "delete-category":
        url = `/api/categories/${modal.category.id}`;
        method = "DELETE";
        break;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Gagal menyimpan perubahan.");
        return;
      }
      setModal(null);
      await load();
    } catch {
      setError("Terjadi kesalahan jaringan.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!canManage) {
    return <AccessDenied message="Hanya Super Admin dan Admin Divisi yang dapat mengelola kategori." />;
  }

  const isDelete = modal?.kind === "delete-division" || modal?.kind === "delete-category";

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
            {isSuperAdmin ? "Divisi & Kategori" : `Kategori ${me?.division?.name ?? ""}`}
          </h1>
          <p className="text-slate-500 mt-1">
            {isSuperAdmin
              ? "Atur divisi organisasi Anda dan kategori aset di setiap divisi."
              : "Atur kategori aset di divisi Anda."}
          </p>
        </div>
        {isSuperAdmin && (
          <button
            onClick={() => open({ kind: "division", division: null })}
            className="bg-indigo-600 text-white font-semibold px-4 py-2.5 rounded-xl text-sm hover:bg-indigo-700 active:scale-[0.98] transition-all duration-200 ease-in-out shadow-sm"
          >
            + Tambah Divisi
          </button>
        )}
      </div>

      {divisions.length === 0 ? (
        <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs py-16 text-center">
          <div className="text-5xl mb-3 opacity-60">🗂️</div>
          <p className="font-semibold text-slate-700">Belum ada divisi</p>
          <p className="text-xs text-slate-400 mt-1">Tambahkan divisi pertama, mis. IT, Kitchen, atau Engineering.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {divisions.map((division) => (
            <div key={division.id} className="bg-white border border-slate-200/80 rounded-2xl shadow-xs p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">{division.name}</h2>
                  {division.description && <p className="text-sm text-slate-500 mt-0.5">{division.description}</p>}
                  <p className="text-xs text-slate-400 mt-1">
                    {division._count.assets} aset
                    {division._count.users !== undefined && ` · ${division._count.users} pengguna`}
                  </p>
                </div>
                {isSuperAdmin && (
                  <div className="flex gap-2 flex-shrink-0">
                    <button onClick={() => open({ kind: "division", division })} className="text-xs font-semibold text-indigo-600 hover:underline">Ubah</button>
                    <button onClick={() => open({ kind: "delete-division", division })} className="text-xs font-semibold text-rose-600 hover:underline">Hapus</button>
                  </div>
                )}
              </div>

              <div className="border-t border-slate-100 pt-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Kategori</p>
                  <button
                    onClick={() => open({ kind: "category", divisionId: division.id, category: null })}
                    className="text-xs font-semibold text-indigo-600 hover:underline"
                  >
                    + Tambah Kategori
                  </button>
                </div>
                {division.categories.length === 0 ? (
                  <p className="text-sm text-slate-400">Belum ada kategori — aset divisi ini belum bisa ditambahkan.</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {division.categories.map((category) => (
                      <li key={category.id} className="flex items-center justify-between py-2 hover:bg-slate-50 rounded-lg px-2 transition-all duration-200 ease-in-out">
                        <span className="text-sm text-slate-800">
                          {category.name}
                          <span className="text-xs text-slate-400 ml-2">{category._count.assets} aset</span>
                        </span>
                        <span className="flex gap-3">
                          <button onClick={() => open({ kind: "category", divisionId: division.id, category })} className="text-xs font-semibold text-indigo-600 hover:underline">Ubah</button>
                          <button onClick={() => open({ kind: "delete-category", category })} className="text-xs font-semibold text-rose-600 hover:underline">Hapus</button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50">
          <form
            onSubmit={submit}
            className="w-full max-w-md rounded-2xl shadow-xl p-6 space-y-4 border border-white/20"
            style={{ backdropFilter: "blur(8px)", backgroundColor: "rgba(255, 255, 255, 0.95)" }}
          >
            <h3 className="text-lg font-bold text-slate-900">
              {modal.kind === "division" && (modal.division ? "Ubah Divisi" : "Tambah Divisi")}
              {modal.kind === "category" && (modal.category ? "Ubah Kategori" : "Tambah Kategori")}
              {modal.kind === "delete-division" && `Hapus divisi "${modal.division.name}"?`}
              {modal.kind === "delete-category" && `Hapus kategori "${modal.category.name}"?`}
            </h3>

            {!isDelete && (
              <div>
                <label className={labelClass}>Nama</label>
                <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} className={inputClass} autoFocus />
              </div>
            )}
            {modal.kind === "division" && (
              <div>
                <label className={labelClass}>Deskripsi (opsional)</label>
                <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} />
              </div>
            )}
            {isDelete && (
              <p className="text-sm text-slate-500">Hanya bisa dihapus bila tidak ada aset{modal.kind === "delete-division" ? " maupun pengguna" : ""} yang memakainya.</p>
            )}

            {error && <p className="text-red-500 text-xs mt-1">{error}</p>}

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setModal(null)} className="flex-1 bg-slate-100 text-slate-700 font-semibold py-2.5 rounded-lg text-sm hover:bg-slate-200 transition-all duration-200 ease-in-out">
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className={`flex-1 inline-flex items-center justify-center gap-2 text-white font-semibold py-2.5 rounded-lg text-sm active:scale-[0.98] transition-all duration-200 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed ${isDelete ? "bg-rose-600 hover:bg-rose-700" : "bg-indigo-600 hover:bg-indigo-700"}`}
              >
                {saving && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {isDelete ? "Hapus" : "Simpan"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
