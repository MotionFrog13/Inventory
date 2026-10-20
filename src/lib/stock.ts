/**
 * Stok per kondisi — sumber kebenaran tunggal untuk model persediaan aset.
 *
 * Sebuah baris `Asset` mewakili SATU item ber-stok (mis. "Sumpit Kayu" 100 pcs
 * di outlet Yasmin), bukan satu unit fisik. Total stok dipecah ke beberapa
 * bucket kondisi yang saling eksklusif:
 *
 *   quantity = activeQty + brokenQty + repairQty + retiredQty + reservedQty
 *
 * `reservedQty` adalah pcs yang sedang dikunci pengajuan BAP berstatus PENDING.
 * Pcs tersebut keluar dari bucket asalnya saat pengajuan dibuat sehingga tidak
 * bisa dilaporkan rusak atau di-BAP dua kali, namun SISA stok lain tetap bisa
 * dipakai — 10 sumpit hilang tidak boleh membekukan 90 sisanya.
 *
 * Aset unit tunggal tetap bekerja tanpa perlakuan khusus: quantity = 1 dan
 * salah satu bucket berisi 1.
 */

export const STOCK_CONDITIONS = ["ACTIVE", "BROKEN", "REPAIR", "RETIRED"] as const;

export type StockCondition = (typeof STOCK_CONDITIONS)[number];

/** Nama kolom bucket pada tabel Asset, termasuk bucket reservasi BAP. */
export type StockBucket =
  | "activeQty"
  | "brokenQty"
  | "repairQty"
  | "retiredQty"
  | "reservedQty";

/** Komposisi stok satu aset — bentuk minimal yang dibutuhkan semua helper. */
export interface AssetStock {
  quantity: number;
  activeQty: number;
  brokenQty: number;
  repairQty: number;
  retiredQty: number;
  reservedQty: number;
}

/** Status headline yang bisa dihasilkan `deriveAssetStatus`. */
export type DerivedAssetStatus =
  | StockCondition
  | "BAP_PENDING"
  | "BAP";

/**
 * `select` Prisma untuk seluruh kolom stok. Dipakai bersama oleh route insiden,
 * BAP, dan aset agar tidak ada yang lupa mengambil satu bucket lalu menuliskan
 * nilai lama kembali ke database.
 */
export const STOCK_SELECT = {
  updatedAt: true,
  quantity: true,
  activeQty: true,
  brokenQty: true,
  repairQty: true,
  retiredQty: true,
  reservedQty: true,
} as const;

/** Compare-and-swap: jangan menimpa stok atau aset yang sudah berpindah outlet. */
export function stockMutationWhere(asset: AssetStock & {
  id: string;
  divisionId: string;
  branchId: string;
  status: DerivedAssetStatus;
  updatedAt: Date;
}) {
  return {
    id: asset.id,
    divisionId: asset.divisionId,
    branchId: asset.branchId,
    status: asset.status,
    updatedAt: asset.updatedAt,
    quantity: asset.quantity,
    activeQty: asset.activeQty,
    brokenQty: asset.brokenQty,
    repairQty: asset.repairQty,
    retiredQty: asset.retiredQty,
    reservedQty: asset.reservedQty,
  };
}

export const STOCK_BUCKET_BY_CONDITION: Record<StockCondition, StockBucket> = {
  ACTIVE: "activeQty",
  BROKEN: "brokenQty",
  REPAIR: "repairQty",
  RETIRED: "retiredQty",
};

export const STOCK_CONDITION_LABELS: Record<StockCondition, string> = {
  ACTIVE: "Aktif",
  BROKEN: "Rusak",
  REPAIR: "Perbaikan",
  RETIRED: "Tidak Digunakan",
};

export function isStockCondition(value: unknown): value is StockCondition {
  return (
    typeof value === "string" &&
    (STOCK_CONDITIONS as readonly string[]).includes(value)
  );
}

/**
 * Status headline aset diturunkan dari komposisi stok — tidak pernah diset
 * manual di alur insiden/BAP (CLAUDE.md §4.F).
 *
 * Urutan prioritas sengaja menempatkan ACTIVE paling atas: selama masih ada
 * stok siap pakai, item wajib tampil sebagai aktif walaupun sebagian rusak atau
 * sedang diajukan BAP. Sisanya diurutkan dari kondisi paling perlu perhatian.
 */
export function deriveAssetStatus(stock: AssetStock): DerivedAssetStatus {
  if (stock.quantity <= 0) return "BAP";
  if (stock.activeQty > 0) return "ACTIVE";
  if (stock.brokenQty > 0) return "BROKEN";
  if (stock.repairQty > 0) return "REPAIR";
  if (stock.retiredQty > 0) return "RETIRED";
  // Tidak ada pcs di bucket manapun namun stok belum habis → seluruh sisa
  // sedang dikunci pengajuan BAP yang menunggu persetujuan admin.
  return "BAP_PENDING";
}

/** Jumlah pcs yang benar-benar tercatat di seluruh bucket. */
export function stockSum(stock: AssetStock): number {
  return (
    stock.activeQty +
    stock.brokenQty +
    stock.repairQty +
    stock.retiredQty +
    stock.reservedQty
  );
}

/**
 * Snapshot stok awal saat aset dibuat: seluruh kuantitas masuk ke satu bucket
 * sesuai status awal yang dipilih admin.
 */
export function initialStock(quantity: number, condition: StockCondition): AssetStock {
  const base: AssetStock = {
    quantity,
    activeQty: 0,
    brokenQty: 0,
    repairQty: 0,
    retiredQty: 0,
    reservedQty: 0,
  };
  base[STOCK_BUCKET_BY_CONDITION[condition]] = quantity;
  return base;
}

/**
 * Pindahkan `qty` pcs antar bucket. Jumlah dibatasi (clamped) oleh isi bucket
 * asal agar tidak pernah menghasilkan angka negatif — misalnya ketika sebuah
 * insiden atas 10 pcs diselesaikan setelah 4 pcs di antaranya sudah di-BAP.
 * Total stok tidak berubah; gunakan `removeStock` untuk mengurangi total.
 */
export function moveStock(
  stock: AssetStock,
  from: StockBucket,
  to: StockBucket,
  qty: number
): AssetStock {
  const moved = Math.max(0, Math.min(qty, stock[from]));
  const next = { ...stock };
  next[from] -= moved;
  next[to] += moved;
  return next;
}

/**
 * Keluarkan `qty` pcs dari sebuah bucket sekaligus dari total stok — dipakai
 * saat BAP disetujui (pcs benar-benar hilang dari inventaris).
 */
export function removeStock(
  stock: AssetStock,
  from: StockBucket,
  qty: number
): AssetStock {
  const removed = Math.max(0, Math.min(qty, stock[from]));
  return {
    ...stock,
    quantity: Math.max(0, stock.quantity - removed),
    [from]: stock[from] - removed,
  };
}

/**
 * Payload `data` Prisma untuk menyimpan snapshot stok berikut status headline
 * turunannya. Selalu pakai helper ini saat menulis stok supaya `status` tidak
 * pernah berbeda dari angka yang mendasarinya.
 */
export function stockUpdateData(stock: AssetStock) {
  return {
    quantity: stock.quantity,
    activeQty: stock.activeQty,
    brokenQty: stock.brokenQty,
    repairQty: stock.repairQty,
    retiredQty: stock.retiredQty,
    reservedQty: stock.reservedQty,
    status: deriveAssetStatus(stock),
  };
}

/**
 * Ringkasan stok untuk ditampilkan di UI (kartu rincian, tabel daftar aset).
 */
export function stockBreakdown(stock: AssetStock) {
  return [
    { condition: "ACTIVE" as const, qty: stock.activeQty },
    { condition: "BROKEN" as const, qty: stock.brokenQty },
    { condition: "REPAIR" as const, qty: stock.repairQty },
    { condition: "RETIRED" as const, qty: stock.retiredQty },
  ];
}
