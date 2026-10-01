"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useCallback, useRef } from "react";
import { flushSync } from "react-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";
import { cn, type SessionUserView } from "@/lib/utils";
import { MOBILE_MEDIA_QUERY, useMediaQuery } from "@/lib/use-media-query";

// Akun yang penugasannya dicabut setelah login: data tetap ditolak API (403),
// shell ini hanya memastikan pengguna melihat alasannya dan dapat keluar,
// alih-alih terjebak di halaman kosong yang penuh galat.
function UnassignedNotice() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="animate-fade-in flex items-center justify-center py-20">
      <div className="max-w-md w-full bg-white border border-slate-200/80 rounded-2xl shadow-sm p-8 text-center">
        <div className="text-5xl mb-3">🔒</div>
        <h1 className="text-xl font-bold text-slate-900">Akses Ditolak</h1>
        <p className="text-sm text-slate-500 mt-2 leading-relaxed">
          Akun Anda belum ditugaskan ke divisi dan outlet. Hubungi Super Admin.
        </p>
        <button
          onClick={logout}
          disabled={loading}
          className="mt-6 inline-flex items-center gap-2 bg-indigo-600 text-white font-semibold px-4 py-2.5 rounded-xl text-sm hover:bg-indigo-700 active:scale-[0.98] transition-all duration-200 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading && (
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          )}
          Keluar
        </button>
      </div>
    </div>
  );
}

function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";
  const [user, setUser] = useState<SessionUserView | null>(null);

  // Laci navigasi ponsel. Yang disimpan adalah halaman tempat laci dibuka,
  // sehingga laci otomatis tertutup begitu halaman berganti (termasuk tombol
  // Back) dan saat layar melebar ke tata letak desktop — tanpa effect tambahan.
  const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY);
  const [drawerOpenedAt, setDrawerOpenedAt] = useState<string | null>(null);
  // Layar melebar ke desktop saat laci terbuka (mis. ponsel diputar): lupakan
  // laci agar tidak muncul lagi ketika layar kembali sempit. Pola "sesuaikan
  // state saat nilai berubah" dari dokumentasi React — tanpa effect.
  const [wasMobile, setWasMobile] = useState(isMobile);
  if (wasMobile !== isMobile) {
    setWasMobile(isMobile);
    if (!isMobile) setDrawerOpenedAt(null);
  }
  const drawerOpen = isMobile && drawerOpenedAt === pathname;
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  const closeDrawer = useCallback((restoreFocus = true) => {
    // flushSync: area konten masih `inert` sampai render berikutnya, dan
    // elemen di dalam area inert tidak dapat menerima fokus.
    flushSync(() => setDrawerOpenedAt(null));
    // Kembalikan fokus ke tombol menu agar pengguna keyboard tidak kehilangan
    // posisinya. Tidak dilakukan saat menutup karena berpindah halaman.
    if (restoreFocus) menuButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDrawer();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen, closeDrawer]);

  useEffect(() => {
    if (isLoginPage) return;

    const fetchUser = async () => {
      try {
        const response = await fetch("/api/auth/me");
        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            setUser(result.data);
          }
        }
      } catch (error) {
        console.error("Gagal mengambil data user:", error);
      }
    };

    fetchUser();
  }, [isLoginPage, pathname]);

  if (isLoginPage) {
    return <div className="min-h-screen w-full">{children}</div>;
  }

  return (
    <div className="app-container">
      <Sidebar user={user} isMobile={isMobile} mobileOpen={drawerOpen} onClose={closeDrawer} />
      {isMobile && (
        <div
          className={cn("sidebar-backdrop", drawerOpen && "sidebar-backdrop-visible")}
          onClick={() => closeDrawer()}
          aria-hidden="true"
        />
      )}
      {/* Selama laci terbuka, konten di belakangnya tidak dapat difokus —
          perilaku modal tanpa perlu jebakan fokus manual. */}
      <div className="main-content-wrapper" inert={drawerOpen}>
        <Header
          user={user}
          menuOpen={drawerOpen}
          onMenuClick={() => setDrawerOpenedAt(pathname)}
          menuButtonRef={menuButtonRef}
        />
        <main className="main-content">
          {user?.access === "unassigned" ? <UnassignedNotice /> : children}
        </main>
      </div>
    </div>
  );
}

export default function AppLayoutClient({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    // Saat SSR (Server-Side Rendering) atau proses build prerendering,
    // kembalikan anak secara langsung untuk menghindari panggilan hook usePathname.
    return <div className="min-h-screen w-full bg-slate-50">{children}</div>;
  }

  return <AuthenticatedLayout>{children}</AuthenticatedLayout>;
}
