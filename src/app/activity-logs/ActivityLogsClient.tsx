"use client";
import { useI18n } from "@/components/LanguageProvider";
import PageHeading from "@/components/PageHeading";
import GuideCard from "@/components/GuideCard";
import UiIcon from "@/components/UiIcon";


export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

interface LogEntry {
  id: string;
  userId: string | null;
  username: string;
  action: string;
  details: string;
  ipAddress: string | null;
  createdAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const ACTION_COLORS: Record<string, string> = {
  LOGIN: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  LOGOUT: "bg-slate-100 text-slate-700 border border-slate-200",
  CREATE_ASSET: "bg-blue-50 text-blue-700 border border-blue-200",
  UPDATE_ASSET: "bg-amber-50 text-amber-700 border border-amber-200",
  DELETE_ASSET: "bg-rose-50 text-rose-700 border border-rose-200",
  SUBMIT_BAP: "bg-violet-50 text-violet-700 border border-violet-200",
  APPROVE_BAP: "bg-purple-50 text-purple-700 border border-purple-200",
  REJECT_BAP: "bg-pink-50 text-pink-700 border border-pink-200",
  REQUEST_TRANSFER: "bg-cyan-50 text-cyan-700 border border-cyan-200",
  APPROVE_TRANSFER: "bg-teal-50 text-teal-700 border border-teal-200",
  REJECT_TRANSFER: "bg-orange-50 text-orange-700 border border-orange-200",
  CREATE_BRANCH: "bg-sky-50 text-sky-700 border border-sky-200",
  UPDATE_BRANCH: "bg-indigo-50 text-indigo-700 border border-indigo-200",
  DELETE_BRANCH: "bg-red-50 text-red-700 border border-red-200",
  REPORT_INCIDENT: "bg-yellow-50 text-yellow-800 border border-yellow-200",
  RESOLVE_INCIDENT: "bg-green-50 text-green-700 border border-green-200",
  DELETE_INCIDENT: "bg-rose-50 text-rose-700 border border-rose-200",
  PROPOSE_INCIDENT_RESOLVE: "bg-lime-50 text-lime-700 border border-lime-200",
  APPROVE_INCIDENT_RESOLVE: "bg-green-50 text-green-700 border border-green-200",
  REJECT_INCIDENT_RESOLVE: "bg-orange-50 text-orange-700 border border-orange-200",
  CREATE_USER: "bg-blue-50 text-blue-700 border border-blue-200",
  UPDATE_USER: "bg-amber-50 text-amber-700 border border-amber-200",
  DELETE_USER: "bg-rose-50 text-rose-700 border border-rose-200",
  MDM_COMMAND: "bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200",
};

export default function ActivityLogsPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  // Verifikasi apakah user adalah SUPER_ADMIN
  useEffect(() => {
    async function verifyAccess() {
      try {
        const res = await fetch("/api/auth/me");
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.data.role === "SUPER_ADMIN") {
            setAuthorized(true);
          } else {
            setAuthorized(false);
          }
        } else {
          setAuthorized(false);
        }
      } catch (error) {
        console.error("Gagal verifikasi role:", error);
        setAuthorized(false);
      }
    }
    verifyAccess();
  }, []);

  const fetchLogs = useCallback(async (pageNumber = 1, searchQuery = "") => {
    setLoading(true);
    try {
      const url = new URL("/api/activity-logs", window.location.origin);
      url.searchParams.append("page", pageNumber.toString());
      url.searchParams.append("limit", "20");
      if (searchQuery) {
        url.searchParams.append("search", searchQuery);
      }

      const res = await fetch(url.toString());
      const data = await res.json();
      if (data.success) {
        setLogs(data.data.logs);
        setPagination(data.data.pagination);
      }
    } catch (e) {
      console.error("Gagal fetch logs:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authorized === true) {
      fetchLogs(1, "");
    }
  }, [authorized, fetchLogs]);

  // Debounced search handler
  useEffect(() => {
    if (authorized !== true) return;
    const delayDebounceFn = setTimeout(() => {
      fetchLogs(1, search);
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [search, authorized, fetchLogs]);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= pagination.totalPages) {
      fetchLogs(newPage, search);
    }
  };

  function formatDateTime(dStr: string, language: "en" | "id"): string {
    return new Date(dStr).toLocaleString(language === "en" ? "en-GB" : "id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZone: "Asia/Jakarta",
    }) + " WIB";
  }

  if (authorized === null) {
    return (
      <div className="py-20 flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin"></div>
        <p className="text-sm text-slate-500 font-medium">{t("Memeriksa hak akses...")}</p>
      </div>
    );
  }

  if (authorized === false) {
    return (
      <div className="ui-panel max-w-md mx-auto my-20 p-8 bg-white border border-slate-200 rounded-2xl shadow-lg text-center">
        <div className="text-6xl mb-4">🚫</div>
        <h1 className="page-title">{t("Akses Ditolak")}</h1>
        <p className="text-slate-500 mb-6">{t("Halaman ini hanya dapat diakses oleh peran")}{" "}<strong>{t("Super Admin")}</strong>.
        </p>
        <button
          onClick={() => router.push("/")}
          className="bg-indigo-600 text-white font-medium px-6 py-2.5 rounded-xl hover:bg-indigo-700 active:scale-[0.98] transition-all duration-200"
        >{t("Kembali ke Dashboard")}</button>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header Halaman */}
      <PageHeading eyebrow={t("Administrasi")} title={<>{t("Log Aktivitas Sistem")}</>} description={<>{t("Histori dan kronologi aktivitas operasional penting di organisasi Anda.")}</>} />
      <GuideCard title={t("Telusuri perubahan di organisasi")} icon="history">{t("Gunakan pencarian untuk menemukan pengguna, tindakan, atau detail aktivitas. Halaman ini hanya tersedia untuk Super Admin.")}</GuideCard>


      {/* Filter / Search Bar */}
      <div className="ui-panel bg-white border border-slate-200 rounded-xl p-4 mb-6 shadow-xs flex flex-col md:flex-row gap-4 items-center">
        <div className="relative w-full md:max-w-md">
          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 text-sm"><UiIcon name="search" className="inline-block align-middle" /></span>
          <input
            type="text"
            aria-label={t("Cari log aktivitas")}
            placeholder={t("Cari berdasarkan nama pengguna, aksi, atau detail...")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm"
          />
        </div>
        <div className="text-xs text-slate-400 md:ml-auto font-medium">{t("Menampilkan")}{" "}{logs.length}{" "}{t("dari total")}{" "}{pagination.total} log
        </div>
      </div>

      {/* Logs Table */}
      <div className="ui-panel bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        {loading ? (
          <div className="py-16 flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin"></div>
            <p className="text-sm text-slate-500">{t("Memuat log aktivitas...")}</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="py-16 text-center">
            <div className="text-5xl mb-3"><UiIcon size={40} name="history" className="inline-block align-middle" /></div>
            <p className="font-semibold text-slate-700">{t("Tidak ada log aktivitas ditemukan")}</p>
            <p className="text-xs text-slate-400 mt-1">{t("Coba sesuaikan kata kunci pencarian Anda.")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="inventory-table w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3.5 w-1/5">{t("Waktu")}</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3.5 w-1/5">{t("Pengguna")}</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3.5 w-1/6">{t("Aksi")}</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3.5 w-2/5">{t("Deskripsi")}</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3.5 w-1/12">IP Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-normal">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-4 text-slate-500 whitespace-nowrap">
                      {formatDateTime(log.createdAt, locale)}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-slate-100 border border-slate-200/80 flex items-center justify-center text-slate-700 font-bold text-xs">
                          {log.username.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900 leading-tight">{log.username}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${ACTION_COLORS[log.action] || "bg-slate-50 text-slate-600 border border-slate-200"}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-slate-700 leading-relaxed max-w-md break-words">
                      {log.details}
                    </td>
                    <td className="px-5 py-4 text-slate-500 font-mono text-xs whitespace-nowrap">
                      {log.ipAddress || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {!loading && pagination.totalPages > 1 && (
          <div className="border-t border-slate-100 px-5 py-3.5 flex items-center justify-between bg-slate-50/30">
            <button
              onClick={() => handlePageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="px-3.5 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed bg-white shadow-2xs hover:border-slate-300 transition-all duration-200"
            >{t("◀ Sebelumnya")}</button>
            <span className="text-xs text-slate-500 font-medium">{t("Halaman")}{" "}<strong>{pagination.page}</strong>{" "}{t("dari")}{" "}<strong>{pagination.totalPages}</strong>
            </span>
            <button
              onClick={() => handlePageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
              className="px-3.5 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed bg-white shadow-2xs hover:border-slate-300 transition-all duration-200"
            >{t("Selanjutnya ▶")}</button>
          </div>
        )}
      </div>
    </div>
  );
}
