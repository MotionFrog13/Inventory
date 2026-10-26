import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import AppLayoutClient from "@/components/AppLayoutClient";
import { Suspense } from "react";


// Bundled font keeps production builds independent of Google Fonts availability.
const geist = localFont({
  src: "./fonts/geist-latin.woff2",
  variable: "--font-geist",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Inventory - Sistem Inventaris Aset",
  description: "Sistem manajemen inventaris aset multi-divisi dan multi-outlet",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="id"
      className={`${geist.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        <a href="#main-content" className="skip-link">Lewati ke konten utama</a>
        <Suspense fallback={
          <div className="min-h-screen flex items-center justify-center bg-slate-50">
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin"></div>
              <p className="text-sm text-slate-500 font-medium">Memuat Inventory...</p>
            </div>
          </div>
        }>
          <AppLayoutClient>{children}</AppLayoutClient>
        </Suspense>
      </body>
    </html>
  );
}
