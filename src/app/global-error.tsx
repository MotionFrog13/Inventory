"use client";
import UiIcon from "@/components/UiIcon";


import "./globals.css";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Root layout ikut gagal saat error ini muncul, sehingga tidak ada jejak lain
  // selain konsol. Digest-nya yang mengaitkan tampilan ini dengan log server.
  useEffect(() => {
    console.error("Global error:", error.digest ?? "(tanpa digest)", error);
  }, [error]);

  return (
    <html lang="id">
      <body className="min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full text-center space-y-6 bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-red-500/10 text-red-500 rounded-full text-3xl mb-2">
            <UiIcon name="warning" className="inline-block align-middle" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight">Terjadi Kesalahan Sistem</h2>
          <p className="text-slate-500 text-sm">
            Aplikasi mendeteksi adanya error tidak terduga pada sistem utama. Silakan coba muat ulang halaman.
          </p>
          <button
            onClick={() => reset()}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-4 rounded-xl transition shadow-lg shadow-indigo-600/20 cursor-pointer"
          >
            Coba Lagi <UiIcon name="transfer" className="inline-block align-middle" />
          </button>
        </div>
      </body>
    </html>
  );
}
