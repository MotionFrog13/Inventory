"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SessionUserView } from "@/lib/utils";

interface HeaderProps {
  user: SessionUserView | null;
  /** Laci navigasi ponsel sedang terbuka (untuk `aria-expanded`). */
  menuOpen: boolean;
  onMenuClick: () => void;
  menuButtonRef: React.RefObject<HTMLButtonElement | null>;
}

export default function Header({ user, menuOpen, onMenuClick, menuButtonRef }: HeaderProps) {
  const router = useRouter();
  const [showMenu, setShowMenu] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // SUPER_ADMIN lintas outlet; peran lain bisa memegang lebih dari satu outlet.
  const isAllOutlets = user?.role === "SUPER_ADMIN";
  const branchBadge = !user
    ? ""
    : isAllOutlets
      ? "Semua Outlet"
      : user.branches.map((b) => b.name).join(", ");

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch (error) {
      console.error("Logout failed:", error);
      setLoggingOut(false);
    }
  };

  return (
    <header className="app-header">
      <div className="header-left">
        {/* Tombol laci navigasi — hanya tampil di layar ponsel (globals.css) */}
        <button
          ref={menuButtonRef}
          type="button"
          onClick={onMenuClick}
          className="header-menu-btn"
          aria-label="Buka menu navigasi"
          aria-controls="app-sidebar"
          aria-expanded={menuOpen}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        <h2 className="header-greeting">
          <span className="header-greeting-prefix">Selamat datang, </span>
          <span className="header-username">{user?.name || "User"}</span>
        </h2>
        {/* Penanda outlet aktif — SUPER_ADMIN lintas outlet, jadi ditandai berbeda.
            Di layar ponsel dipindah ke menu pengguna agar header tidak terlipat. */}
        {user && branchBadge && (
          <span
            className={`ml-3 hidden md:inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border transition-all duration-200 ease-in-out ${
              isAllOutlets
                ? "bg-purple-50 text-purple-700 border-purple-200/60"
                : "bg-indigo-50 text-indigo-700 border-indigo-200/60"
            }`}
          >
            <span>🏢</span>
            {branchBadge}
          </span>
        )}
      </div>

      <div className="header-right">
        {/* User Menu */}
        <div className="header-user-menu">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="header-avatar-btn"
          >
            <span className="header-avatar">
              {user?.name?.charAt(0)?.toUpperCase() || "U"}
            </span>
            <span className="header-user-info">
              <span className="header-user-name">{user?.name}</span>
              <span className="header-user-role">{user?.roleLabel ?? ""}</span>
            </span>
          </button>

          {showMenu && (
            <div className="header-dropdown">
              <div className="header-dropdown-info">
                <p className="dropdown-username">@{user?.username}</p>
                <p className="dropdown-role">{user?.roleLabel ?? ""}</p>
                {user && <p className="dropdown-role">{user.organization.name}</p>}
                {user && branchBadge && <p className="dropdown-role md:hidden">🏢 {branchBadge}</p>}
              </div>
              <hr className="dropdown-divider" />
              <button
                onClick={handleLogout}
                disabled={loggingOut}
                className="dropdown-logout-btn"
              >
                {loggingOut ? "Keluar..." : "🚪 Keluar"}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
