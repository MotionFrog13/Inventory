"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn, divisionScopeLabel, type SessionUserView } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";

interface NavItem {
  label: string;
  href: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/", icon: "📊" },
  { label: "Aset", href: "/assets", icon: "💻" },
  { label: "Insiden", href: "/incidents", icon: "🔧" },
  { label: "Transfer", href: "/transfers", icon: "🔄" },
  { label: "Cabang", href: "/branches", icon: "🏢" },
  { label: "Laporan", href: "/reports", icon: "📈" },
];

const SUPER_ADMIN_NAV_ITEMS: NavItem[] = [
  { label: "Divisi & Kategori", href: "/divisions", icon: "🗂️" },
  { label: "Pengguna", href: "/users", icon: "👤" },
  { label: "Log Aktivitas", href: "/activity-logs", icon: "📜" },
];

// Admin divisi mengelola kategori divisinya sendiri (halaman yang sama).
const DIVISION_ADMIN_NAV_ITEMS: NavItem[] = [
  { label: "Kategori", href: "/divisions", icon: "🗂️" },
];

interface SidebarProps {
  user: SessionUserView | null;
  /** Layar sempit: sidebar menjadi laci (drawer) di luar layar. */
  isMobile: boolean;
  /** Laci ponsel sedang terbuka. */
  mobileOpen: boolean;
  /** Tutup laci; `restoreFocus` mengembalikan fokus ke tombol menu. */
  onClose: (restoreFocus?: boolean) => void;
}

export default function Sidebar({ user, isMobile, mobileOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  // Mode ikon (rail) hanya untuk desktop; laci ponsel selalu menampilkan label.
  const isCollapsed = collapsed && !isMobile;
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Laci dibuka: pindahkan fokus ke dalamnya agar navigasi keyboard dan
  // pembaca layar langsung berada di menu.
  useEffect(() => {
    if (mobileOpen) closeButtonRef.current?.focus();
  }, [mobileOpen]);

  // Berpindah halaman menutup laci; fokus dibiarkan mengikuti halaman baru.
  const handleNavigate = () => {
    if (mobileOpen) onClose(false);
  };

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const adminItems =
    user?.role === "SUPER_ADMIN"
      ? SUPER_ADMIN_NAV_ITEMS
      : user?.role === "DIVISION_ADMIN"
        ? DIVISION_ADMIN_NAV_ITEMS
        : [];

  // Divisi & outlet selalu terlihat agar pengguna sadar cakupan data yang
  // sedang dilihatnya — angka aset antar divisi/outlet mudah tertukar.
  const branchLabel = !user
    ? ""
    : user.role === "SUPER_ADMIN"
      ? "Semua Outlet"
      : user.branches.length === 1
        ? user.branches[0].name
        : `${user.branches.length} outlet`;
  const scopeLine = user ? `${divisionScopeLabel(user)} · ${branchLabel}` : "";

  return (
    <aside
      id="app-sidebar"
      aria-label="Navigasi utama"
      className={cn(
        "sidebar",
        isCollapsed && "sidebar-collapsed",
        mobileOpen && "sidebar-mobile-open"
      )}
      // Laci yang tertutup berada di luar layar: keluarkan dari urutan Tab dan
      // pembaca layar agar fokus tidak "hilang" ke tautan yang tidak terlihat.
      inert={isMobile && !mobileOpen}
    >
      {/* Logo / Brand */}
      <div className="sidebar-header">
        <Link href="/" className="sidebar-brand" onClick={handleNavigate}>
          <span className="sidebar-logo">
            <img src="/logo.svg" alt="Inventory" className="w-full h-full" />
          </span>
          {!isCollapsed && (
            <div className="sidebar-brand-text">
              <span className="sidebar-title">Inventory</span>
              <span className="sidebar-subtitle">{user?.organization.name ?? ""}</span>
              <span className="sidebar-subtitle text-[11px] text-slate-400">{scopeLine}</span>
            </div>
          )}
        </Link>
        {isMobile ? (
          <button
            ref={closeButtonRef}
            type="button"
            onClick={() => onClose(true)}
            className="sidebar-toggle"
            aria-label="Tutup menu navigasi"
          >
            ✕
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="sidebar-toggle"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? "→" : "←"}
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "sidebar-link",
              isActive(item.href) && "sidebar-link-active"
            )}
            title={isCollapsed ? item.label : undefined}
            onClick={handleNavigate}
          >
            <span className="sidebar-link-icon">{item.icon}</span>
            {!isCollapsed && (
              <span className="sidebar-link-label">{item.label}</span>
            )}
          </Link>
        ))}

        {/* Admin-only nav items */}
        {adminItems.length > 0 && (
          <>
            {!isCollapsed && (
              <div className="px-3 pt-4 pb-1">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Admin</p>
              </div>
            )}
            {adminItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "sidebar-link",
                  isActive(item.href) && "sidebar-link-active"
                )}
                title={isCollapsed ? item.label : undefined}
                onClick={handleNavigate}
              >
                <span className="sidebar-link-icon">{item.icon}</span>
                {!isCollapsed && (
                  <span className="sidebar-link-label">{item.label}</span>
                )}
              </Link>
            ))}
          </>
        )}
      </nav>

      {/* Footer */}
      {!isCollapsed && (
        <div className="sidebar-footer">
          <p className="sidebar-footer-text">{user?.organization.name ?? ""}</p>
          <p className="sidebar-footer-version">v2.1.0</p>
        </div>
      )}
    </aside>
  );
}
