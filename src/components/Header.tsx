"use client";
import { useI18n } from "@/components/LanguageProvider";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { SessionUserView } from "@/lib/utils";
import { roleLabel } from "@/lib/utils";
import UiIcon from "./UiIcon";
import LanguageSwitcher from "./LanguageSwitcher";

interface HeaderProps {
  user: SessionUserView | null;
  menuOpen: boolean;
  onMenuClick: () => void;
  menuButtonRef: React.RefObject<HTMLButtonElement | null>;
}

const sections: Record<string, string> = { assets: "Aset", incidents: "Insiden", transfers: "Mutasi Aset", branches: "Cabang", reports: "Laporan", divisions: "Divisi & Kategori", users: "Pengguna", "activity-logs": "Log Aktivitas" };

export default function Header({ user, menuOpen, onMenuClick, menuButtonRef }: HeaderProps) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const [showMenu, setShowMenu] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLButtonElement>(null);
  const segment = pathname.split("/")[1];
  const section = segment === "divisions" && user?.role === "DIVISION_ADMIN" ? t("Kategori") : sections[segment];
  const branchBadge = !user ? "" : user.role === "SUPER_ADMIN" ? t("Semua outlet") : user.branches.map((b) => b.name).join(", ");

  useEffect(() => {
    if (!showMenu) return;
    const dismiss = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setShowMenu(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setShowMenu(false); accountRef.current?.focus(); } };
    const focusOutside = (event: FocusEvent) => { if (!menuRef.current?.contains(event.target as Node)) setShowMenu(false); };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    document.addEventListener("focusin", focusOutside);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape); document.removeEventListener("focusin", focusOutside); };
  }, [showMenu]);

  async function handleLogout() {
    setLoggingOut(true);
    setLogoutError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Logout failed");
      router.push("/login");
      router.refresh();
    } catch {
      setLogoutError("Gagal keluar. Silakan coba lagi.");
      setLoggingOut(false);
    }
  }

  return (
    <header className="app-header">
      <div className="header-left">
        <button ref={menuButtonRef} type="button" onClick={onMenuClick} className="header-menu-btn" aria-label={t("Buka menu navigasi")} aria-controls="app-sidebar" aria-expanded={menuOpen}><UiIcon name="menu" /></button>
        <nav className="header-breadcrumb" aria-label={t("Jejak navigasi")}>
          <Link href="/">{t("Ruang kerja")}</Link><UiIcon name="chevron" size={14} /><span aria-current="page">{t(section || "Ringkasan")}</span>
        </nav>
      </div>
      <div className="header-right">
        <LanguageSwitcher />
        {branchBadge && <span className="header-scope" title={branchBadge}><UiIcon name="building" size={15} /><span>{branchBadge}</span></span>}
        <div className="header-user-menu" ref={menuRef}>
          <button ref={accountRef} onClick={() => setShowMenu(!showMenu)} className="header-avatar-btn" aria-expanded={showMenu} aria-controls="account-panel" aria-label={t("Akun ") + (user?.name || t("pengguna"))}>
            <span className="header-avatar">{user?.name?.charAt(0)?.toUpperCase() || "U"}</span>
            <span className="header-user-info"><span className="header-user-name">{user?.name || t("Memuat akun...")}</span><span className="header-user-role">{user && roleLabel(user.role, user.division?.name, locale)}</span></span><UiIcon name="down" size={15} />
          </button>
          {showMenu && (
            <div id="account-panel" className="header-dropdown">
              <div className="header-dropdown-info"><p className="dropdown-username">@{user?.username}</p><p className="dropdown-role">{user && roleLabel(user.role, user.division?.name, locale)}</p><p className="dropdown-role">{user?.organization.name}</p><p className="dropdown-role">{branchBadge}</p></div>
              <hr className="dropdown-divider" />
              {logoutError && <p role="alert" className="px-3 py-2 text-xs text-red-700">{t(logoutError)}</p>}
              <button onClick={handleLogout} disabled={loggingOut} className="dropdown-logout-btn"><UiIcon name="logout" size={17} />{loggingOut ? t("Sedang keluar...") : t("Keluar dari akun")}</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
