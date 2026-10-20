import Link from "next/link";
import UiIcon from "./UiIcon";

export default function QuickStart({ canCreate }: { canCreate: boolean }) {
  return (
    <section className="quick-start" aria-labelledby="quick-start-title">
      <div className="quick-start-heading"><UiIcon name="grid" size={18} /><h2 id="quick-start-title">Mulai dari sini</h2></div>
      <p className="mt-1 text-xs text-slate-500">Pilih pekerjaan yang ingin Anda lakukan hari ini.</p>
      <div className="quick-start-links">
        <Link className="quick-start-link" href="/assets"><UiIcon name="box" /><div><strong>Temukan aset</strong><span>Cari aset dan periksa kondisi stok</span></div></Link>
        <Link className="quick-start-link" href="/incidents"><UiIcon name="tool" /><div><strong>Pantau insiden</strong><span>Laporkan dan tindak lanjuti kerusakan</span></div></Link>
        <Link className="quick-start-link" href={canCreate ? "/assets/new" : "/transfers"}><UiIcon name={canCreate ? "plus" : "transfer"} /><div><strong>{canCreate ? "Tambahkan aset" : "Lihat mutasi aset"}</strong><span>{canCreate ? "Daftarkan inventaris ke ruang kerja" : "Pantau perpindahan antar-outlet"}</span></div></Link>
      </div>
    </section>
  );
}
