"use client";
import { useI18n } from "@/components/LanguageProvider";
import Link from "next/link";
import UiIcon from "./UiIcon";

export default function QuickStart({ canCreate }: { canCreate: boolean }) {
  const { t } = useI18n();
  return (
    <section className="quick-start" aria-labelledby="quick-start-title">
      <div className="quick-start-heading"><UiIcon name="grid" size={18} /><h2 id="quick-start-title">{t("Mulai dari sini")}</h2></div>
      <p className="mt-1 text-xs text-slate-500">{t("Pilih pekerjaan yang ingin Anda lakukan hari ini.")}</p>
      <div className="quick-start-links">
        <Link className="quick-start-link" href="/assets"><UiIcon name="box" /><div><strong>{t("Temukan aset")}</strong><span>{t("Cari aset dan periksa kondisi stok")}</span></div></Link>
        <Link className="quick-start-link" href="/incidents"><UiIcon name="tool" /><div><strong>{t("Pantau insiden")}</strong><span>{t("Laporkan dan tindak lanjuti kerusakan")}</span></div></Link>
        <Link className="quick-start-link" href={canCreate ? "/assets/new" : "/transfers"}><UiIcon name={canCreate ? "plus" : "transfer"} /><div><strong>{canCreate ? t("Tambahkan aset") : t("Lihat mutasi aset")}</strong><span>{canCreate ? t("Daftarkan inventaris ke ruang kerja") : t("Pantau perpindahan antar-outlet")}</span></div></Link>
      </div>
    </section>
  );
}
