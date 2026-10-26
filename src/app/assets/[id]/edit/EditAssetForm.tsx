"use client";
import { useI18n } from "@/components/LanguageProvider";
import GuideCard from "@/components/GuideCard";
import UiIcon from "@/components/UiIcon";
import Dialog from "@/components/Dialog";


import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  EDITABLE_ASSET_STATUSES,
  ASSET_STATUS_LABELS,
} from "@/lib/utils";
import StockSummary from "@/components/StockSummary";

// Sumber kebenaran tunggal ada di src/lib/utils.ts — dipakai bersama oleh form
// tambah aset, form edit aset, dan validasi API agar ketiganya tidak menyimpang.
const ASSET_STATUSES = EDITABLE_ASSET_STATUSES.map((value) => ({
  value,
  label: ASSET_STATUS_LABELS[value],
}));

interface Branch {
  id: string;
  name: string;
}

interface Category {
  id: string;
  name: string;
}

interface AssetData {
  id: string;
  name: string;
  categoryId: string;
  serialNumber: string | null;
  brand: string | null;
  model: string | null;
  specs: string | null;
  purchaseDate: Date | string | null;
  warrantyDate: Date | string | null;
  status: string;
  photoUrl: string | null;
  notes: string | null;
  branchId: string;
  quantity?: number;
  activeQty?: number;
  brokenQty?: number;
  repairQty?: number;
  retiredQty?: number;
  reservedQty?: number;
}

interface EditAssetFormProps {
  asset: AssetData;
  branches: Branch[];
  /** Kategori di divisi aset — kategori hanya boleh diganti dalam divisi yang sama */
  categories: Category[];
  divisionName: string;
  userRole: string;
}

export default function EditAssetForm({ asset, branches, categories, divisionName, userRole }: EditAssetFormProps) {
  const { t } = useI18n();
  const router = useRouter();
  const assetId = asset.id;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const formatDateString = (dateVal: Date | string | null) => {
    if (!dateVal) return "";
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return "";
    return d.toISOString().slice(0, 10);
  };

  const [form, setForm] = useState({
    name: asset.name || "",
    categoryId: asset.categoryId || "",
    serialNumber: asset.serialNumber || "",
    brand: asset.brand || "",
    model: asset.model || "",
    specs: asset.specs || "",
    purchaseDate: formatDateString(asset.purchaseDate),
    warrantyDate: formatDateString(asset.warrantyDate),
    status: asset.status || "ACTIVE",
    photoUrl: asset.photoUrl || "",
    notes: asset.notes || "",
    branchId: asset.branchId || "",
    quantity: String(asset.quantity || 1),
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      // Untuk item ber-stok banyak, `status` sengaja TIDAK dikirim: server
      // menurunkannya dari komposisi stok dan akan menolak nilai manual.
      const { status: formStatus, ...rest } = form;

      const payload = {
        ...rest,
        ...(isSingleUnit ? { status: formStatus } : {}),
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

      const res = await fetch(`/api/assets/${assetId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || "Terjadi kesalahan saat menyimpan.");
        setIsSubmitting(false);
        return;
      }

      router.push(`/assets/${assetId}`);
      router.refresh();
    } catch {
      setError("Terjadi kesalahan jaringan. Silakan coba lagi.");
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/assets/${assetId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Gagal menghapus aset.");
        setIsDeleting(false);
        setShowDeleteConfirm(false);
        return;
      }
      router.push("/assets");
      router.refresh();
    } catch {
      setError("Terjadi kesalahan jaringan.");
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

  // Rincian stok tersimpan saat ini (read-only di form ini) — hanya bisa
  // berubah lewat alur Insiden dan BAP, bukan lewat penyuntingan langsung.
  const stock = {
    quantity: asset.quantity ?? 1,
    activeQty: asset.activeQty ?? 1,
    brokenQty: asset.brokenQty ?? 0,
    repairQty: asset.repairQty ?? 0,
    retiredQty: asset.retiredQty ?? 0,
    reservedQty: asset.reservedQty ?? 0,
  };

  // Dropdown status hanya relevan untuk item unit tunggal. Begitu total stok
  // lebih dari 1, status adalah turunan komposisi bucket sehingga menyunting
  // label saja akan bertentangan dengan angkanya.
  const nextTotal = parseInt(form.quantity, 10) || 1;
  const isSingleUnit = nextTotal === 1 && stock.reservedQty === 0;

  const currentTitle = t("Edit Aset {0}", [divisionName]);
  const currentSubtitle = t("Perbarui data aset divisi {0} yang sudah terdaftar.", [divisionName]);

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-3">
          <Link href="/assets" className="hover:text-indigo-600 hover:underline">{t("Daftar Aset")}</Link>
          <span>/</span>
          <Link href={`/assets/${assetId}`} className="hover:text-indigo-600 hover:underline">{t("Detail Aset")}</Link>
          <span>/</span>
          <span className="text-slate-800 font-medium">Edit</span>
        </div>
        <h1 className="page-title">{currentTitle}</h1>
        <p className="text-slate-500 mt-1">{currentSubtitle}</p>
      </div>

      {/* Form */}
      <GuideCard title={t("Isi informasi aset secara bertahap")} icon="box">{t("Kolom bertanda * wajib diisi. Pilih kategori dan lokasi yang sesuai, lalu lengkapi stok dan informasi pendukung. Data garansi dan catatan membantu tim menindaklanjuti aset.")}</GuideCard>
      <form onSubmit={handleSubmit} className="space-y-6">

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl px-4 py-3 text-sm font-medium">
            <UiIcon name="warning" className="inline-block align-middle" /> {t(error)}
          </div>
        )}

        {/* Rincian stok tersimpan — konteks sebelum admin mengubah total stok */}
        {!isSingleUnit && <StockSummary stock={stock} />}

        {/* Informasi Dasar */}
        <div className="ui-panel bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-5">
          <h2 className="text-base font-bold text-slate-800 border-b border-slate-100 pb-3">{t("Informasi Dasar")}</h2>

          <div>
            <label htmlFor="assets-id-edit-EditAssetForm-field-1" className="block text-sm font-semibold text-slate-700 mb-1.5">{t("Nama Perangkat")}{" "}<span className="text-red-500">*</span>
            </label>
            <input id="assets-id-edit-EditAssetForm-field-1"
              type="text" name="name" value={form.name} onChange={handleChange} required
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label htmlFor="assets-id-edit-EditAssetForm-field-2" className="block text-sm font-semibold text-slate-700 mb-1.5">{t("Kategori")}{" "}<span className="text-red-500">*</span></label>
              <select id="assets-id-edit-EditAssetForm-field-2" name="categoryId" value={form.categoryId} onChange={handleChange} required
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500">
                <option value="">{t("Pilih Kategori...")}</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {/* Divisi aset tidak dapat diubah; kategori hanya dalam divisi yang sama */}
              <p className="text-xs text-slate-400 mt-1">{t("Divisi:")}{" "}{divisionName}{" "}{t("(tidak dapat diubah)")}</p>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Status <span className="text-red-500">*</span></label>
              {isSingleUnit ? (
                <>
                  <select name="status" aria-label="Status" value={form.status} onChange={handleChange} required
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500">
                    {ASSET_STATUSES.map((s) => <option key={s.value} value={s.value}>{t(s.label)}</option>)}
                  </select>
                  <p className="text-xs text-slate-400 mt-1">{t("Berlaku untuk item unit tunggal.")}</p>
                </>
              ) : (
                <>
                  <div className="w-full border border-slate-200 bg-slate-50 rounded-lg px-3 py-2.5 text-sm text-slate-500 cursor-not-allowed">
                    {t(ASSET_STATUS_LABELS[asset.status] || asset.status)}{" "}{t("· otomatis dari stok")}</div>
                  <p className="text-xs text-slate-400 mt-1">{t("Status item ber-stok banyak mengikuti rincian stok. Ubah lewat alur Insiden (menandai pcs rusak) atau BAP (menghapus stok).")}</p>
                </>
              )}
            </div>
            <div>
              <label htmlFor="assets-id-edit-EditAssetForm-field-3" className="block text-sm font-semibold text-slate-700 mb-1.5">{t("Brand / Merk")}</label>
              <input id="assets-id-edit-EditAssetForm-field-3" type="text" name="brand" value={form.brand} onChange={handleChange}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label htmlFor="assets-id-edit-EditAssetForm-field-4" className="block text-sm font-semibold text-slate-700 mb-1.5">{t("Model / Seri")}</label>
              <input id="assets-id-edit-EditAssetForm-field-4" type="text" name="model" value={form.model} onChange={handleChange}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label htmlFor="assets-id-edit-EditAssetForm-field-5" className="block text-sm font-semibold text-slate-700 mb-1.5">Serial Number</label>
              <input id="assets-id-edit-EditAssetForm-field-5" type="text" name="serialNumber" value={form.serialNumber} onChange={handleChange}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label htmlFor="assets-id-edit-EditAssetForm-field-6" className="block text-sm font-semibold text-slate-700 mb-1.5">{t("Total Stok (pcs)")}</label>
              <input id="assets-id-edit-EditAssetForm-field-6" type="number" name="quantity" value={form.quantity} onChange={handleChange} min={1} required
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
              <p className="text-xs text-slate-400 mt-1">{t("Penambahan stok masuk ke kondisi Aktif. Pengurangan hanya diambil dari stok Aktif (")}{stock.activeQty}{" "}{t("pcs) — stok rusak/perbaikan/pensiun harus dihapus melalui BAP.")}</p>
            </div>
            <div>
              <label htmlFor="assets-id-edit-EditAssetForm-field-7" className="block text-sm font-semibold text-slate-700 mb-1.5">{t("Lokasi (Cabang)")}{" "}<span className="text-red-500">*</span></label>
              <select id="assets-id-edit-EditAssetForm-field-7" name="branchId" value={form.branchId} disabled
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-400 bg-slate-50 cursor-not-allowed">
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <p className="text-xs text-slate-400 mt-1">{t("Lokasi cabang hanya dapat diubah melalui proses Transfer Aset.")}</p>
            </div>
          </div>
          <div>
            <label htmlFor="assets-id-edit-EditAssetForm-field-8" className="block text-sm font-semibold text-slate-700 mb-1.5">{t("Spesifikasi")}</label>
            <textarea id="assets-id-edit-EditAssetForm-field-8" name="specs" value={form.specs} onChange={handleChange} rows={3}
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y" />
          </div>
        </div>

        {/* Tanggal & Garansi */}
        <div className="ui-panel bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-5">
          <h2 className="text-base font-bold text-slate-800 border-b border-slate-100 pb-3">{t("Tanggal & Garansi")}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label htmlFor="assets-id-edit-EditAssetForm-field-9" className="block text-sm font-semibold text-slate-700 mb-1.5">{t("Tanggal Pembelian")}</label>
              <input id="assets-id-edit-EditAssetForm-field-9" type="date" name="purchaseDate" value={form.purchaseDate} onChange={handleChange}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label htmlFor="assets-id-edit-EditAssetForm-field-10" className="block text-sm font-semibold text-slate-700 mb-1.5">{t("Garansi Berakhir")}</label>
              <input id="assets-id-edit-EditAssetForm-field-10" type="date" name="warrantyDate" value={form.warrantyDate} onChange={handleChange}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>
        </div>

        {/* Catatan */}
        <div className="ui-panel bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-5">
          <h2 className="text-base font-bold text-slate-800 border-b border-slate-100 pb-3">{t("Catatan Tambahan")}</h2>
          <div>
            <label htmlFor="assets-id-edit-EditAssetForm-field-11" className="block text-sm font-semibold text-slate-700 mb-1.5">{t("Catatan")}</label>
            <textarea id="assets-id-edit-EditAssetForm-field-11" name="notes" value={form.notes} onChange={handleChange} rows={3}
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y" />
          </div>
          <div>
            <label htmlFor="assets-id-edit-EditAssetForm-field-12" className="block text-sm font-semibold text-slate-700 mb-1.5">{t("URL Foto Perangkat")}</label>
            <input id="assets-id-edit-EditAssetForm-field-12" type="url" name="photoUrl" value={form.photoUrl} onChange={handleChange}
              placeholder="https://..."
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400" />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Link href={`/assets/${assetId}`} className="text-slate-600 font-semibold hover:underline text-sm">{t("← Batal")}</Link>
            {userRole === "SUPER_ADMIN" && (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="text-red-600 font-semibold hover:underline text-sm border border-red-200 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition"
              >
                <UiIcon name="trash" className="inline-block align-middle" />{" "}{t("Hapus Aset")}</button>
            )}
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="bg-indigo-600 text-white font-semibold px-6 py-2.5 rounded-xl text-sm hover:bg-indigo-700 transition shadow-sm disabled:opacity-60 flex items-center gap-2"
          >
            {isSubmitting ? (
              <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>{" "}{t("Menyimpan...")}</>
            ) : t("💾 Simpan Perubahan")}
          </button>
        </div>
      </form>

      {/* Confirm Delete Modal */}
      {showDeleteConfirm && (
        <Dialog label={t("Hapus Aset?")} onClose={() => setShowDeleteConfirm(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-2">{t("Hapus Aset?")}</h2>
            <p className="text-sm text-slate-600 mb-5">{t("Tindakan ini akan menghapus aset beserta semua data insiden dan transfer terkait secara permanen.")}{" "}<strong>{t("Tindakan ini tidak dapat dibatalkan.")}</strong>
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 bg-slate-100 text-slate-700 font-semibold py-2.5 rounded-lg text-sm hover:bg-slate-200 transition">{t("Batal")}</button>
              <button onClick={handleDelete} disabled={isDeleting} className="flex-1 bg-red-600 text-white font-semibold py-2.5 rounded-lg text-sm hover:bg-red-700 transition disabled:opacity-60">
                {isDeleting ? t("Menghapus...") : t("Ya, Hapus")}
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
