
import UiIcon from "@/components/UiIcon";
import { AssetStock } from "@/lib/stock";

/**
 * Visualisasi komposisi stok satu aset.
 *
 * `StockSummary` dipakai di halaman Detail Aset (kartu penuh), `StockInline`
 * di sel tabel daftar aset dan daftar aset per cabang. Keduanya membaca bentuk
 * data yang sama (`AssetStock`) supaya angka yang tampil di semua halaman
 * selalu berasal dari sumber yang sama.
 */

type Segment = {
  key: string;
  label: string;
  qty: number;
  /** Warna isian bar */
  bar: string;
  /** Kelas badge pastel sesuai palet status (CLAUDE.md §7.A) */
  badge: string;
};

function segmentsOf(stock: AssetStock): Segment[] {
  return [
    {
      key: "ACTIVE",
      label: "Aktif",
      qty: stock.activeQty,
      bar: "bg-emerald-500",
      badge: "bg-emerald-50 text-emerald-700 border-emerald-200/60",
    },
    {
      key: "BROKEN",
      label: "Rusak",
      qty: stock.brokenQty,
      bar: "bg-rose-500",
      badge: "bg-rose-50 text-rose-700 border-rose-200/60",
    },
    {
      key: "REPAIR",
      label: "Perbaikan",
      qty: stock.repairQty,
      bar: "bg-amber-500",
      badge: "bg-amber-50 text-amber-700 border-amber-200/60",
    },
    {
      key: "RETIRED",
      label: "Tidak Digunakan",
      qty: stock.retiredQty,
      bar: "bg-slate-400",
      badge: "bg-slate-100 text-slate-700 border-slate-200",
    },
    {
      key: "RESERVED",
      label: "Diajukan BAP",
      qty: stock.reservedQty,
      bar: "bg-violet-500",
      badge: "bg-violet-50 text-violet-700 border-violet-200/60",
    },
  ];
}

export default function StockSummary({ stock }: { stock: AssetStock }) {
  const segments = segmentsOf(stock);
  const total = Math.max(stock.quantity, 1);
  // Bucket kosong disembunyikan agar kartu tidak penuh angka nol untuk aset
  // unit tunggal yang tidak pernah punya rincian.
  const filled = segments.filter((s) => s.qty > 0);

  return (
    <div className="ui-panel bg-white border border-slate-200/80 rounded-xl p-5 shadow-xs">
      <div className="flex items-end justify-between gap-4 flex-wrap mb-4">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            Total Stok
          </p>
          <p className="text-3xl font-bold text-slate-900 leading-none">
            {stock.quantity}
            <span className="text-base font-semibold text-slate-400 ml-1.5">pcs</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            Siap Pakai
          </p>
          <p className="text-3xl font-bold text-emerald-600 leading-none">
            {stock.activeQty}
            <span className="text-base font-semibold text-emerald-400 ml-1.5">pcs</span>
          </p>
        </div>
      </div>

      {/* Bar proporsi — hanya ditampilkan bila stok benar-benar terbagi */}
      {stock.quantity > 0 && (
        <div className="flex h-2.5 w-full rounded-full overflow-hidden bg-slate-100 mb-4">
          {filled.map((s) => (
            <div
              key={s.key}
              className={`${s.bar} transition-all duration-200 ease-in-out`}
              style={{ width: `${(s.qty / total) * 100}%` }}
              title={`${s.label}: ${s.qty} pcs`}
            />
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {filled.length === 0 ? (
          <p className="text-sm text-slate-400">
            Stok habis — seluruh unit sudah dihapus melalui BAP.
          </p>
        ) : (
          filled.map((s) => (
            <span
              key={s.key}
              className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${s.badge}`}
            >
              {s.label}: {s.qty} pcs
            </span>
          ))
        )}
      </div>

      {stock.reservedQty > 0 && (
        <p className="text-xs text-violet-700 bg-violet-50 border border-violet-200/60 rounded-lg px-3 py-2 mt-3">
          <UiIcon name="clock" className="inline-block align-middle" /> {stock.reservedQty} pcs sedang menunggu persetujuan BAP dan tidak dapat
          dipakai, dilaporkan rusak, atau diajukan ulang. Sisa stok tetap dapat digunakan.
        </p>
      )}
    </div>
  );
}

/** Versi ringkas untuk sel tabel: "90 / 100 pcs" + bar tipis. */
export function StockInline({ stock }: { stock: AssetStock }) {
  const segments = segmentsOf(stock).filter((s) => s.qty > 0);
  const total = Math.max(stock.quantity, 1);

  return (
    <div className="min-w-[92px]">
      <p className="text-sm font-semibold text-slate-800 whitespace-nowrap">
        {stock.activeQty}
        <span className="text-slate-400 font-normal"> / {stock.quantity} pcs</span>
      </p>
      <div className="flex h-1.5 w-full rounded-full overflow-hidden bg-slate-100 mt-1.5">
        {segments.map((s) => (
          <div
            key={s.key}
            className={s.bar}
            style={{ width: `${(s.qty / total) * 100}%` }}
            title={`${s.label}: ${s.qty} pcs`}
          />
        ))}
      </div>
    </div>
  );
}
