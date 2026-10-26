"use client";
import { useI18n } from "@/components/LanguageProvider";
import Image from "next/image";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn, divisionScopeLabel, type SessionUserView } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import UiIcon, { type IconName } from "./UiIcon";

interface NavItem {
  label: string;
  href: string;
  icon: IconName;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Ringkasan", href: "/", icon: "grid" },
  { label: "Aset", href: "/assets", icon: "box" },
  { label: "Insiden", href: "/incidents", icon: "tool" },
  { label: "Mutasi Aset", href: "/transfers", icon: "transfer" },
  { label: "Cabang", href: "/branches", icon: "building" },
  { label: "Laporan", href: "/reports", icon: "chart" },
];

const SUPER_ADMIN_NAV_ITEMS: NavItem[] = [
  { label: "Divisi & Kategori", href: "/divisions", icon: "layers" },
  { label: "Pengguna", href: "/users", icon: "users" },
  { label: "Log Aktivitas", href: "/activity-logs", icon: "history" },
];

// Admin divisi mengelola kategori divisinya sendiri (halaman yang sama).
const DIVISION_ADMIN_NAV_ITEMS: NavItem[] = [
  { label: "Kategori", href: "/divisions", icon: "layers" },
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
  const { t, locale } = useI18n();
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
      ? t("Semua Outlet")
      : user.branches.length === 1
        ? user.branches[0].name
        : t("{0} outlet", [user.branches.length]);
  const scopeLine = user ? `${divisionScopeLabel(user, locale)} · ${branchLabel}` : "";

  return (
    <aside
      id="app-sidebar"
      aria-label={t("Navigasi utama")}
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
        <Link href="/" className="sidebar-brand" aria-label={t("Inventory, buka ringkasan")} onClick={handleNavigate}>
          <span className="sidebar-logo">
            <Image src="/logo.svg" width={40} height={40} alt="" className="w-full h-full" />
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
            aria-label={t("Tutup menu navigasi")}
          >
            <UiIcon name="close" size={18} />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="sidebar-toggle"
            aria-label={collapsed ? t("Perluas navigasi") : t("Ringkas navigasi")}
          >
            <UiIcon name={collapsed ? "chevron" : "back"} size={16} />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {!isCollapsed && <p className="sidebar-section-label">{t("Ruang kerja")}</p>}
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "sidebar-link",
              isActive(item.href) && "sidebar-link-active"
            )}
            title={isCollapsed ? item.label : undefined}
            aria-label={isCollapsed ? item.label : undefined}
            aria-current={isActive(item.href) ? "page" : undefined}
            onClick={handleNavigate}
          >
            <span className="sidebar-link-icon"><UiIcon name={item.icon} /></span>
            {!isCollapsed && (
              <span className="sidebar-link-label">{t(item.label)}</span>
            )}
          </Link>
        ))}

        {/* Admin-only nav items */}
        {adminItems.length > 0 && (
          <>
            {!isCollapsed && (
              <div className="px-3 pt-4 pb-1">
                <p className="sidebar-section-label">{t("Administrasi")}</p>
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
            aria-label={isCollapsed ? item.label : undefined}
            aria-current={isActive(item.href) ? "page" : undefined}
                onClick={handleNavigate}
              >
                <span className="sidebar-link-icon"><UiIcon name={item.icon} /></span>
                {!isCollapsed && (
                  <span className="sidebar-link-label">{t(item.label)}</span>
                )}
              </Link>
            ))}
          </>
        )}
      </nav>

      {/* Footer */}
      {!isCollapsed && (
        <div className="sidebar-footer">
          <span className="sidebar-workspace-dot" aria-hidden="true" />
          <div><p className="sidebar-footer-text">{user?.organization.name ?? t("Ruang kerja Anda")}</p><p className="sidebar-footer-version">{scopeLine || t("Inventaris organisasi")}</p></div>
        </div>
      )}
    </aside>
  );
}
