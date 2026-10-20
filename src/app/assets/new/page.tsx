"use client";
import GuideCard from "@/components/GuideCard";
import UiIcon from "@/components/UiIcon";


export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  EDITABLE_ASSET_STATUSES,
  ASSET_STATUS_LABELS,
  isAdminRole,
  type SessionUserView,
} from "@/lib/utils";

// Pilihan status awal diturunkan dari daftar yang sama dengan validasi API
// (EDITABLE_ASSET_STATUSES) agar form tidak pernah menawarkan status yang
// akan ditolak server — mis. BAP_PENDING / BAP.
const ASSET_STATUSES = EDITABLE_ASSET_STATUSES.map((value) => ({
  value,
  label:
    value === "ACTIVE"
      ? ASSET_STATUS_LABELS[value]
      : `${ASSET_STATUS_LABELS[value]} (${value})`,
}));

interface Branch {
  id: string;
  name: string;
}

interface DivisionOption {
  id: string;
  name: string;
  categories: { id: string; name: string }[];
}

const inputClass =
  "w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 placeholder:text-slate-400 transition-all duration-200 ease-in-out";
const lockedClass =
  "w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-500 bg-slate-100 flex items-center gap-1.5 cursor-not-allowed";

export default function NewAssetPage() {
  const router = useRouter();
  const [me, setMe] = useState<SessionUserView | null>(null);
  const [divisions, setDivisions] = useState<DivisionOption[]>([]);
  // `/api/branches` sudah dibatasi cakupan: seluruh cabang untuk SUPER_ADMIN,
  // outlet penugasan untuk peran lain.
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    name: "",
    divisionId: "",
    categoryId: "",
    serialNumber: "",
    brand: "",
    model: "",
    specs: "",
    purchaseDate: "",
    warrantyDate: "",
    status: "ACTIVE",
    photoUrl: "",
    notes: "",
    branchId: "",
    quantity: "1",
  });

  useEffect(() => {
    Promise.all([
      fetch("/api/auth/me").then((r) => r.json()),
      fetch("/api/divisions").then((r) => r.json()),
      fetch("/api/branches").then((r) => r.json()),
    ])
      .then(([meRes, divisionRes, branchRes]) => {
        const branchList: Branch[] = branchRes.success ? branchRes.data : [];
        if (divisionRes.success) setDivisions(divisionRes.data);
        setBranches(branchList);
        if (meRes.success) {
          const user: SessionUserView = meRes.data;
          setMe(user);
          // Admin divisi selalu divisinya sendiri; outlet tunggal terisi otomatis
          // (API menolak divisi/outlet di luar cakupan dengan 403).
          setForm((f) => ({
            ...f,
            divisionId: user.division?.id ?? f.divisionId,
            branchId: user.role !== "SUPER_ADMIN" && branchList.length === 1 ? branchList[0].id : f.branchId,
          }));
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setError(null);
  }

  const isSuperAdmin = me?.role === "SUPER_ADMIN";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const { divisionId, ...rest } = form;
      const payload = {
        ...rest,
        // Divisi hanya dikirim SUPER_ADMIN; admin divisi terkunci di server.
        ...(isSuperAdmin ? { divisionId } : {}),
        serialNumber: form.serialNumber || null,
        brand: form.brand || null,
        model: form.model || null,
        specs: form.specs || null,
        purchaseDate: form.purchaseDate || null,
        warrantyDate: form.warrantyDate || null,
        photoUrl: form.photoUrl || null,
        notes: form.notes || null,
        quantity: parseInt(form.quantity) || 1,
      };

      const res = await fetch("/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || "Terjadi kesalahan saat menyimpan aset.");
        setIsSubmitting(false);
        return;
      }

      router.push(`/assets/${data.data.id}`);
    } catch {
      setError("Terjadi kesalahan jaringan. Silakan coba lagi.");
      setIsSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isAdminRole(me?.role)) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-6 shadow-xs max-w-lg mx-auto my-10 text-center space-y-3">
        <h2 className="text-lg font-bold">Akses Ditolak</h2>
        <p className="text-sm">Anda tidak memiliki hak akses untuk menambahkan aset baru.</p>
        <Link href="/assets" className="inline-block bg-red-600 text-white font-semibold px-4 py-2 rounded-lg text-sm hover:bg-red-700 transition shadow-xs">
          Kembali ke Daftar Aset
        </Link>
      </div>
    );
  }

  const selectedDivision = divisions.find((d) => d.id === form.divisionId);
  const categoryOptions = selectedDivision?.categories ?? [];
  const lockedBranch = !isSuperAdmin && branches.length === 1 ? branches[0] : null;

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-3">
          <Link href="/assets" className="hover:text-indigo-600 hover:underline">Daftar Aset</Link>
          <span>/</span>
          <span className="text-slate-800 font-medium">Tambah Aset Baru</span>
        </div>
        <h1 className="page-title">
          Tambah Aset {selectedDivision?.name ?? ""}
        </h1>
        <p className="text-slate-500 mt-1">Daftarkan aset baru ke sistem inventaris.</p>
      </div>

      {/* Form */}
      <GuideCard title="Isi informasi aset secara bertahap" icon="box">Kolom bertanda * wajib diisi. Pilih kategori dan lokasi yang sesuai, lalu lengkapi stok dan informasi pendukung. Data garansi dan catatan membantu tim menindaklanjuti aset.</GuideCard>
      <form onSubmit={handleSubmit} className="space-y-6">

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl px-4 py-3 text-sm font-medium">
            <UiIcon name="warning" className="inline-block align-middle" /> {error}
          </div>
        )}

        {/* Informasi Dasar */}
        <div className="ui-panel bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-5">
          <h2 className="text-base font-bold text-slate-800 border-b border-slate-100 pb-3">Informasi Dasar</h2>

          {/* Divisi — dipilih SUPER_ADMIN; admin divisi melihat divisinya sebagai label mati */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              Divisi <span className="text-red-500">*</span>
            </label>
            {isSuperAdmin ? (
              <select
                name="divisionId" aria-label="Divisi"
                value={form.divisionId}
                onChange={(e) => {
                  // Kategori milik divisi lama tidak berlaku di divisi baru
                  setForm((prev) => ({ ...prev, divisionId: e.target.value, categoryId: "" }));
                  setError(null);
                }}
                required
                className={inputClass}
              >
                <option value="">Pilih Divisi...</option>
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            ) : (
              <div className={lockedClass}>
                <span><UiIcon name="layers" className="inline-block align-middle" /></span>
                <span className="truncate">{me?.division?.name ?? "Divisi Anda"}</span>
              </div>
            )}
          </div>

          {/* Nama Perangkat */}
          <div>
            <label htmlFor="assets-new-page-field-1" className="block text-sm font-semibold text-slate-700 mb-1.5">
              Nama Aset <span className="text-red-500">*</span>
            </label>
            <input id="assets-new-page-field-1"
              type="text"
              name="name"
              value={form.name}
              onChange={handleChange}
              required
              placeholder="Contoh: Laptop Dell Latitude 3420 / Chiller GEA 1200L"
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Kategori — mengikuti divisi */}
            <div>
              <label htmlFor="assets-new-page-field-2" className="block text-sm font-semibold text-slate-700 mb-1.5">
                Kategori <span className="text-red-500">*</span>
              </label>
              <select id="assets-new-page-field-2"
                name="categoryId"
                value={form.categoryId}
                onChange={handleChange}
                required
                disabled={!selectedDivision}
                className={`${inputClass} disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <option value="">{selectedDivision ? "Pilih Kategori..." : "Pilih divisi dulu"}</option>
                {categoryOptions.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {selectedDivision && categoryOptions.length === 0 && (
                <p className="text-xs text-red-500 mt-1">
                  Divisi ini belum memiliki kategori.{" "}
                  <Link href="/divisions" className="font-semibold underline">Tambah kategori</Link>
                </p>
              )}
            </div>

            {/* Status — sekaligus menentukan bucket stok awal (src/lib/stock.ts) */}
            <div>
              <label htmlFor="assets-new-page-field-3" className="block text-sm font-semibold text-slate-700 mb-1.5">
                Kondisi Stok Awal <span className="text-red-500">*</span>
              </label>
              <select id="assets-new-page-field-3"
                name="status"
                value={form.status}
                onChange={handleChange}
                required
                className={inputClass}
              >
                {ASSET_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
              <p className="text-xs text-slate-400 mt-1">
                Seluruh stok awal dicatat pada kondisi ini.
              </p>
            </div>

            {/* Brand */}
            <div>
              <label htmlFor="assets-new-page-field-4" className="block text-sm font-semibold text-slate-700 mb-1.5">Brand / Merk</label>
              <input id="assets-new-page-field-4"
                type="text"
                name="brand"
                value={form.brand}
                onChange={handleChange}
                placeholder="Contoh: Dell, GEA, Daikin"
                className={inputClass}
              />
            </div>

            {/* Model */}
            <div>
              <label htmlFor="assets-new-page-field-5" className="block text-sm font-semibold text-slate-700 mb-1.5">Model / Seri</label>
              <input id="assets-new-page-field-5"
                type="text"
                name="model"
                value={form.model}
                onChange={handleChange}
                placeholder="Contoh: Latitude 3420, FTKC50"
                className={inputClass}
              />
            </div>

            {/* Serial Number */}
            <div>
              <label htmlFor="assets-new-page-field-6" className="block text-sm font-semibold text-slate-700 mb-1.5">Serial Number</label>
              <input id="assets-new-page-field-6"
                type="text"
                name="serialNumber"
                value={form.serialNumber}
                onChange={handleChange}
                placeholder="Unik per kategori"
                className={`${inputClass} font-mono placeholder:font-sans`}
              />
              <p className="text-xs text-slate-400 mt-1">Opsional. Jika diisi, harus unik dalam kategori yang sama.</p>
            </div>

            {/* Cabang — outlet tunggal terkunci; beberapa outlet dipilih dari penugasan */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                Lokasi Cabang <span className="text-red-500">*</span>
              </label>
              {lockedBranch ? (
                <>
                  <div className={lockedClass}>
                    <span><UiIcon name="building" className="inline-block align-middle" /></span>
                    <span className="truncate">{lockedBranch.name}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Aset baru otomatis terdaftar di outlet Anda.
                  </p>
                </>
              ) : (
                <select
                  name="branchId" aria-label="Cabang"
                  value={form.branchId}
                  onChange={handleChange}
                  required
                  className={inputClass}
                >
                  <option value="">Pilih Cabang...</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Stok */}
            <div>
              <label htmlFor="assets-new-page-field-7" className="block text-sm font-semibold text-slate-700 mb-1.5">
                Stok Awal (pcs) <span className="text-red-500">*</span>
              </label>
              <input id="assets-new-page-field-7"
                type="number"
                name="quantity"
                value={form.quantity}
                onChange={handleChange}
                min={1}
                required
                className={inputClass}
              />
              <p className="text-xs text-slate-400 mt-1">
                Isi 1 untuk unit tunggal. Untuk barang massal isi jumlahnya — mis. Sumpit Kayu 100 pcs.
              </p>
            </div>
          </div>

          {/* Specs */}
          <div>
            <label htmlFor="assets-new-page-field-8" className="block text-sm font-semibold text-slate-700 mb-1.5">Spesifikasi</label>
            <textarea id="assets-new-page-field-8"
              name="specs"
              value={form.specs}
              onChange={handleChange}
              rows={3}
              placeholder="Contoh: Intel Core i5, RAM 8GB / Kapasitas 1200 liter"
              className={`${inputClass} resize-y`}
            />
          </div>
        </div>

        {/* Tanggal & Garansi */}
        <div className="ui-panel bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-5">
          <h2 className="text-base font-bold text-slate-800 border-b border-slate-100 pb-3">Tanggal & Garansi</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label htmlFor="assets-new-page-field-9" className="block text-sm font-semibold text-slate-700 mb-1.5">Tanggal Pembelian</label>
              <input id="assets-new-page-field-9"
                type="date"
                name="purchaseDate"
                value={form.purchaseDate}
                onChange={handleChange}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="assets-new-page-field-10" className="block text-sm font-semibold text-slate-700 mb-1.5">Tanggal Garansi Berakhir</label>
              <input id="assets-new-page-field-10"
                type="date"
                name="warrantyDate"
                value={form.warrantyDate}
                onChange={handleChange}
                className={inputClass}
              />
            </div>
          </div>
        </div>

        {/* Catatan Tambahan */}
        <div className="ui-panel bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-5">
          <h2 className="text-base font-bold text-slate-800 border-b border-slate-100 pb-3">Catatan Tambahan</h2>
          <div>
            <label htmlFor="assets-new-page-field-11" className="block text-sm font-semibold text-slate-700 mb-1.5">Catatan</label>
            <textarea id="assets-new-page-field-11"
              name="notes"
              value={form.notes}
              onChange={handleChange}
              rows={3}
              placeholder="Catatan tambahan, kondisi fisik, riwayat perbaikan sebelumnya, dll."
              className={`${inputClass} resize-y`}
            />
          </div>
          <div>
            <label htmlFor="assets-new-page-field-12" className="block text-sm font-semibold text-slate-700 mb-1.5">URL Foto Perangkat</label>
            <input id="assets-new-page-field-12"
              type="url"
              name="photoUrl"
              value={form.photoUrl}
              onChange={handleChange}
              placeholder="https://..."
              className={inputClass}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between gap-4 pt-2">
          <Link
            href="/assets"
            className="text-slate-600 font-semibold hover:underline text-sm"
          >
            ← Batal & Kembali
          </Link>
          <button
            type="submit"
            disabled={isSubmitting}
            className="bg-indigo-600 text-white font-semibold px-6 py-2.5 rounded-xl text-sm hover:bg-indigo-700 active:scale-[0.98] transition-all duration-200 ease-in-out shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSubmitting ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                Menyimpan...
              </>
            ) : (
              "💾 Simpan Aset"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
