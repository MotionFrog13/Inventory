import Link from "next/link";

export const dynamic = "force-dynamic";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="max-w-md w-full text-center space-y-5 bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
        <div className="text-6xl">🔍</div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Halaman Tidak Ditemukan</h2>
        <p className="text-slate-500 text-sm">
          Maaf, halaman yang Anda cari tidak dapat ditemukan atau telah dipindahkan.
        </p>
        <Link
          href="/"
          className="inline-block bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-5 rounded-xl transition shadow-xs"
        >
          Kembali ke Dashboard
        </Link>
      </div>
    </div>
  );
}
