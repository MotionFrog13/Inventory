"use client";
import { useI18n } from "@/components/LanguageProvider";

import UiIcon from "@/components/UiIcon";
import Link from "next/link";

/**
 * Panel "Akses Ditolak" bersama untuk seluruh halaman.
 *
 * Dipakai ketika halaman berhasil dirender namun penggunanya tidak berhak atas
 * datanya — mis. akun tanpa outlet (lihat `resolveScope()` di src/lib/scope.ts)
 * atau staf yang membuka URL form admin secara langsung. Menyatukan tampilannya
 * di satu tempat menjaga pesan penolakan tetap konsisten di semua halaman.
 */
export default function AccessDenied({
  title = "Akses Ditolak",
  message,
  backHref = "/",
  backLabel = "← Kembali ke Dashboard",
}: {
  title?: string;
  message: string;
  backHref?: string;
  backLabel?: string;
}) {
  const { t } = useI18n();
  return (
    <div className="animate-fade-in flex items-center justify-center py-20">
      <div className="ui-panel max-w-md w-full bg-white border border-slate-200/80 rounded-2xl shadow-sm p-8 text-center">
        <div className="text-5xl mb-3"><UiIcon name="lock" className="inline-block align-middle" /></div>
        <h1 className="page-title">{typeof title === "string" ? t(title) : title}</h1>
        <p className="text-sm text-slate-500 mt-2 leading-relaxed">{t(message)}</p>
        <Link
          href={backHref}
          className="mt-6 inline-block bg-indigo-600 text-white font-semibold px-4 py-2.5 rounded-xl text-sm hover:bg-indigo-700 active:scale-[0.98] transition-all duration-200 ease-in-out"
        >
          {t(backLabel)}
        </Link>
      </div>
    </div>
  );
}
