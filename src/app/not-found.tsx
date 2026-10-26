import { getI18n } from "@/lib/i18n/server";

import UiIcon from "@/components/UiIcon";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function NotFound() {
  const { t } = await getI18n();
  return (
    <div className="min-h-[60dvh] flex items-center justify-center bg-slate-50 p-6">
      <div className="ui-panel max-w-md w-full text-center space-y-5 bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
        <div className="text-6xl"><UiIcon size={40} name="search" className="inline-block align-middle" /></div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">{t("Halaman Tidak Ditemukan")}</h2>
        <p className="text-slate-500 text-sm">{t("Maaf, halaman yang Anda cari tidak dapat ditemukan atau telah dipindahkan.")}</p>
        <Link
          href="/"
          className="inline-block bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-5 rounded-xl transition shadow-xs"
        >{t("Kembali ke Dashboard")}</Link>
      </div>
    </div>
  );
}
