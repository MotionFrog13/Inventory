"use client";
import { useI18n } from "@/components/LanguageProvider";
import { formatDate } from "@/lib/utils";
import UiIcon, { type IconName } from "@/components/UiIcon";
import PageHeading from "@/components/PageHeading";
import GuideCard from "@/components/GuideCard";


export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { ASSET_STATUS_LABELS, ASSET_STATUS_COLORS, STATUS_COLOR_FALLBACK } from "@/lib/utils";

type Tab = "summary" | "monthly" | "warranty";

interface SummaryData {
  totalAssets: number;
  totalBranches: number;
  totalIncidents: number;
  unresolvedIncidents: number;
  assetsByCategory: { categoryId: string; name: string; divisionName: string | null; count: number }[];
  assetsByDivision: { divisionId: string; name: string; count: number }[];
  assetsByStatus: { status: string; count: number }[];
  assetsByBranch: { id: string; name: string; assetCount: number }[];
}

interface MonthlyData {
  month: string;
  total: number;
  resolved: number;
  unresolved: number;
}

interface WarrantyAsset {
  id: string;
  name: string;
  serialNumber: string | null;
  brand: string | null;
  status: string;
  warrantyDate: string;
  branch: { id: string; name: string };
  division: { name: string } | null;
  category: { name: string } | null;
}

interface WarrantyData {
  summary: {
    expired: number;
    expiringIn30Days: number;
    expiringIn31to90Days: number;
    total: number;
  };
  expired: WarrantyAsset[];
  expiringIn30Days: WarrantyAsset[];
  expiringIn31to90Days: WarrantyAsset[];
}



function daysFromNow(d: string): number {
  return Math.ceil((new Date(d).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

// Simple Bar Chart Component (no library)
function BarChart({ data }: { data: MonthlyData[] }) {
  const { t } = useI18n();
  const maxVal = Math.max(...data.map((d) => d.total), 1);

  return (
    <div className="space-y-2">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-24 text-xs text-slate-500 text-right flex-shrink-0 truncate">{d.month}</div>
          <div className="flex-1 flex items-center gap-2">
            <div className="flex-1 bg-slate-100 rounded-full h-6 overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full flex items-center justify-end pr-2 transition-all duration-500"
                style={{ width: `${(d.total / maxVal) * 100}%`, minWidth: d.total > 0 ? "2rem" : "0" }}
              >
                {d.total > 0 && <span className="text-xs font-bold text-white">{d.total}</span>}
              </div>
            </div>
            <div className="w-32 flex-shrink-0 flex gap-1.5">
              <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">✓ {d.resolved}</span>
              {d.unresolved > 0 && (
                <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium"><UiIcon name="clock" className="inline-block align-middle" /> {d.unresolved}</span>
              )}
            </div>
          </div>
        </div>
      ))}
      {data.length === 0 && (
        <div className="text-center py-10 text-slate-400">{t("Tidak ada data insiden dalam 12 bulan terakhir")}</div>
      )}
    </div>
  );
}

// Donut-like Stat with bars for distribution
function DistributionBar({ items }: { items: { label: string; count: number; colorClass: string }[] }) {
  const total = items.reduce((sum, i) => sum + i.count, 0);
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-28 text-xs text-slate-600 font-medium truncate flex-shrink-0">{item.label}</div>
          <div className="flex-1 bg-slate-100 rounded-full h-4 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${item.colorClass}`}
              style={{ width: total > 0 ? `${(item.count / total) * 100}%` : "0%", minWidth: item.count > 0 ? "1.5rem" : "0" }}
            />
          </div>
          <div className="w-16 text-right">
            <span className="text-sm font-bold text-slate-800">{item.count}</span>
            {total > 0 && <span className="text-xs text-slate-400 ml-1">({Math.round((item.count / total) * 100)}%)</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ReportsPage() {
  const { t, locale } = useI18n();
  const [activeTab, setActiveTab] = useState<Tab>("summary");
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
  const [warrantyData, setWarrantyData] = useState<WarrantyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const url = activeTab === "warranty" ? "/api/reports/warranty?days=90" : "/api/reports/" + activeTab;
    fetch(url, { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error || t("Laporan belum dapat dimuat."));
        return result.data;
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        if (activeTab === "summary") setSummaryData(data);
        else if (activeTab === "monthly") setMonthlyData(data);
        else setWarrantyData(data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError("Laporan belum dapat dimuat. Periksa koneksi Anda, lalu coba lagi.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [activeTab, retryCount, locale, t]);

  const TABS: { key: Tab; label: string }[] = [
    { key: "summary", label: t("Ringkasan") },
    { key: "monthly", label: t("Insiden bulanan") },
    { key: "warranty", label: t("Status garansi") },
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeading eyebrow={t("Inventaris & operasional")} title={<>{t("Laporan & Statistik")}</>} description={<>{t("Analisis kondisi aset, riwayat kerusakan, dan status garansi aset.")}</>} />
      <GuideCard title={t("Pahami angka dalam laporan")} icon="chart">{t("Jumlah item menunjukkan banyaknya jenis aset terdaftar, sedangkan pcs menunjukkan jumlah stok. Laporan mengikuti divisi dan outlet yang dapat Anda akses.")}</GuideCard>


      {/* Tab Navigation */}
      <div className="ui-panel bg-white border border-slate-200 rounded-xl p-1.5 flex gap-1 w-fit section-tabs shadow-xs">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            aria-pressed={activeTab === tab.key}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
              activeTab === tab.key
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {t(tab.label)}
          </button>
        ))}
      </div>

      {error && <div role="alert" className="ui-panel bg-white p-6 text-center"><UiIcon name="warning" className="mx-auto mb-3 text-amber-600" size={28} /><p className="text-sm text-slate-600">{t(error)}</p><button type="button" onClick={() => setRetryCount((count) => count + 1)} className="btn-primary mt-4">{t("Coba lagi")}</button></div>}

      {/* Loading */}
      {loading && (
        <div role="status" aria-label={t("Memuat laporan")} className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin"></div>
        </div>
      )}

      {/* SUMMARY TAB */}
      {!loading && !error && activeTab === "summary" && summaryData && (
        <div className="space-y-5">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard label={t("Total Aset")} value={summaryData.totalAssets} icon="box" colorClass="bg-indigo-50" />
            <KpiCard label={t("Total Cabang")} value={summaryData.totalBranches} icon="building" colorClass="bg-blue-50" />
            <KpiCard label={t("Total Insiden")} value={summaryData.totalIncidents} icon="tool" colorClass="bg-amber-50" />
            <KpiCard label={t("Insiden Aktif")} value={summaryData.unresolvedIncidents} icon="clock" colorClass="bg-red-50" highlight={summaryData.unresolvedIncidents > 0} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* By Status */}
            <div className="ui-panel bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
              <h2 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                <span><UiIcon name="box" className="inline-block align-middle" /></span>{" "}{t("Distribusi per Status")}</h2>
              <DistributionBar
                items={[
                  { label: t("Aktif"), count: summaryData.assetsByStatus.find((s) => s.status === "ACTIVE")?.count || 0, colorClass: "bg-green-500" },
                  { label: t("Rusak"), count: summaryData.assetsByStatus.find((s) => s.status === "BROKEN")?.count || 0, colorClass: "bg-red-500" },
                  { label: t("Perbaikan"), count: summaryData.assetsByStatus.find((s) => s.status === "REPAIR")?.count || 0, colorClass: "bg-amber-500" },
                  { label: "Retired", count: summaryData.assetsByStatus.find((s) => s.status === "RETIRED")?.count || 0, colorClass: "bg-slate-400" },
                ]}
              />
            </div>

            {/* By Branch */}
            <div className="ui-panel bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
              <h2 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                <span><UiIcon name="building" className="inline-block align-middle" /></span>{" "}{t("Aset per Cabang")}</h2>
              <DistributionBar
                items={summaryData.assetsByBranch.map((b) => ({
                  label: b.name,
                  count: b.assetCount,
                  colorClass: "bg-indigo-500",
                }))}
              />
            </div>
          </div>

          {/* Per Divisi — hanya bermakna bila cakupan pengguna mencakup lebih
              dari satu divisi (Super Admin). */}
          {summaryData.assetsByDivision.length > 1 && (
            <div className="ui-panel bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
              <h2 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                <span>🏷️</span>{" "}{t("Distribusi per Divisi")}</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {summaryData.assetsByDivision.map((item) => (
                  <div key={item.divisionId} className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-center hover:border-indigo-200 hover:bg-indigo-50/30 transition">
                    <p className="text-2xl font-extrabold text-slate-900">{item.count}</p>
                    <p className="text-xs text-slate-500 mt-1 font-medium">{item.name}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Per Kategori */}
          <div className="ui-panel bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
            <h2 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
              <span><UiIcon name="layers" className="inline-block align-middle" /></span>{" "}{t("Distribusi per Kategori")}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {summaryData.assetsByCategory.map((item) => (
                <div key={item.categoryId} className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-center hover:border-indigo-200 hover:bg-indigo-50/30 transition">
                  <p className="text-2xl font-extrabold text-slate-900">{item.count}</p>
                  <p className="text-xs text-slate-500 mt-1 font-medium">{item.name}</p>
                  {summaryData.assetsByDivision.length > 1 && item.divisionName && (
                    <p className="text-[11px] text-slate-400">{item.divisionName}</p>
                  )}
                </div>
              ))}
              {summaryData.assetsByCategory.length === 0 && (
                <div className="col-span-full text-center text-slate-400 text-sm py-4">{t("Belum ada data aset.")}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MONTHLY TAB */}
      {!loading && !error && activeTab === "monthly" && (
        <div className="ui-panel bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="font-bold text-slate-800 text-lg">{t("Insiden per Bulan")}</h2>
              <p className="text-sm text-slate-500 mt-0.5">{t("Statistik kerusakan 12 bulan terakhir")}</p>
            </div>
            <div className="flex items-center gap-3 text-xs font-medium">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-green-400 inline-block"></span> Resolved</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-400 inline-block"></span> Unresolved</span>
            </div>
          </div>
          <BarChart data={monthlyData} />
          {monthlyData.length > 0 && (
            <div className="pt-3 border-t border-slate-100 grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-extrabold text-slate-900">{monthlyData.reduce((s, d) => s + d.total, 0)}</p>
                <p className="text-xs text-slate-500 mt-0.5">{t("Total Insiden")}</p>
              </div>
              <div>
                <p className="text-2xl font-extrabold text-green-600">{monthlyData.reduce((s, d) => s + d.resolved, 0)}</p>
                <p className="text-xs text-slate-500 mt-0.5">Resolved</p>
              </div>
              <div>
                <p className="text-2xl font-extrabold text-red-600">{monthlyData.reduce((s, d) => s + d.unresolved, 0)}</p>
                <p className="text-xs text-slate-500 mt-0.5">{t("Masih Aktif")}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* WARRANTY TAB */}
      {!loading && !error && activeTab === "warranty" && warrantyData && (
        <div className="space-y-5">
          {/* Summary Badges */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard label={t("Sudah Kadaluarsa")} value={warrantyData.summary.expired} icon="warning" colorClass="bg-red-50" highlight={warrantyData.summary.expired > 0} />
            <KpiCard label={t("Habis ≤ 30 Hari")} value={warrantyData.summary.expiringIn30Days} icon="warning" colorClass="bg-amber-50" highlight={warrantyData.summary.expiringIn30Days > 0} />
            <KpiCard label={t("Habis 31-90 Hari")} value={warrantyData.summary.expiringIn31to90Days} icon="calendar" colorClass="bg-yellow-50" />
            <KpiCard label={t("Total dalam 90 Hari")} value={warrantyData.summary.total} icon="shield" colorClass="bg-slate-50" />
          </div>

          {/* Expired */}
          {warrantyData.expired.length > 0 && (
            <WarrantyTable
              title={t("Garansi Sudah Kadaluarsa")}
              assets={warrantyData.expired}
              headerClass="bg-red-50 border-b border-red-200 text-red-900"
            />
          )}

          {/* Expiring in 30 days */}
          {warrantyData.expiringIn30Days.length > 0 && (
            <WarrantyTable
              title={t("Garansi Habis dalam 30 Hari")}
              assets={warrantyData.expiringIn30Days}
              headerClass="bg-amber-50 border-b border-amber-200 text-amber-900"
            />
          )}

          {/* Expiring in 31-90 days */}
          {warrantyData.expiringIn31to90Days.length > 0 && (
            <WarrantyTable
              title={t("📅 Garansi Habis dalam 31-90 Hari")}
              assets={warrantyData.expiringIn31to90Days}
              headerClass="bg-yellow-50 border-b border-yellow-200 text-yellow-900"
            />
          )}

          {warrantyData.summary.total === 0 && (
            <div className="ui-panel bg-white border border-slate-200 rounded-xl py-16 text-center">
              <div className="text-5xl mb-3">🎉</div>
              <p className="font-semibold text-slate-700">{t("Tidak ada aset dengan garansi hampir habis")}</p>
              <p className="text-xs text-slate-400 mt-1">{t("Semua garansi aset aktif masih aman dalam 90 hari ke depan.")}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, icon, colorClass, highlight }: {
  label: string; value: number; icon: IconName; colorClass: string; highlight?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className={`bg-white border rounded-xl p-4 shadow-xs ${highlight ? "border-red-200" : "border-slate-200"}`}>
      <div className="flex items-center gap-3">
        <span className={`text-xl p-2 rounded-lg ${colorClass}`}><UiIcon name={icon} /></span>
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t(label)}</p>
          <p className={`text-2xl font-extrabold mt-0.5 ${highlight ? "text-red-600" : "text-slate-900"}`}>{value}</p>
        </div>
      </div>
    </div>
  );
}

// Kolom "Sisa / Lewat" menghitung sendiri warna badge dari selisih hari,
// sehingga tabel tidak memerlukan prop penyorot baris dari pemanggil.
function WarrantyTable({ title, assets, headerClass }: {
  title: string;
  assets: WarrantyAsset[];
  headerClass: string;
}) {
  const { t, locale } = useI18n();
  return (
    <div className="ui-panel bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
      <div className={`px-5 py-3 ${headerClass}`}>
        <h3 className="font-bold text-sm">{title} ({assets.length}{" "}{t("aset)")}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="inventory-table w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{t("Aset")}</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{t("Kategori")}</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{t("Cabang")}</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{t("Garansi Hingga")}</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{t("Sisa / Lewat")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {assets.map((a) => {
              const days = daysFromNow(a.warrantyDate);
              const isExpired = days <= 0;
              return (
                <tr key={a.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    <a href={`/assets/${a.id}`} className="hover:text-indigo-600 hover:underline">
                      {a.name}
                    </a>
                    {a.serialNumber && <span className="block text-xs font-mono text-slate-400">#{a.serialNumber}</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {a.category?.name ?? "-"}
                    {a.division && <span className="block text-xs text-slate-400">{a.division.name}</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{a.branch.name}</td>
                  <td className="px-4 py-3">
                    <span className={`status-badge status-badge-sm ${ASSET_STATUS_COLORS[a.status] || STATUS_COLOR_FALLBACK}`}>
                      {t(ASSET_STATUS_LABELS[a.status] || a.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-700">{formatDate(a.warrantyDate, locale)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded border ${
                      isExpired
                        ? "bg-red-100 text-red-800 border-red-200"
                        : days <= 30
                        ? "bg-amber-100 text-amber-800 border-amber-200"
                        : "bg-yellow-50 text-yellow-800 border-yellow-200"
                    }`}>
                      {isExpired ? t("{0}h lalu", [Math.abs(days)]) : t("{0} hari lagi", [days])}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
