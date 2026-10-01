import { NextRequest } from "next/server";
import { successResponse, errorResponse, isAdminRole } from "@/lib/utils";
import { assetAccessDenied } from "@/lib/scope";
import { requireUserScope } from "@/lib/auth";
import { writeActivityLog } from "@/lib/logger";
import { STOCK_SELECT, removeStock, stockUpdateData } from "@/lib/stock";

export const dynamic = "force-dynamic";

// POST /api/assets/[id]/bap/approve — Setujui pengajuan BAP
// Hanya Admin Divisi / Super Admin
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireUserScope(request);
    if (!ctx.ok) return ctx.response;
    const { db, scope, user } = ctx;

    if (!isAdminRole(user.role)) {
      return errorResponse(
        "Akses ditolak",
        "Hanya admin yang dapat menyetujui pengajuan BAP",
        403
      );
    }

    const { id } = await params;

    // Ambil pengajuan BAP yang masih menunggu persetujuan.
    // Relasi one-to-many: satu aset bisa punya beberapa BAP historis,
    // namun hanya boleh ada satu yang berstatus PENDING pada satu waktu.
    // BAP organisasi lain tidak terlihat oleh client tenant → 404.
    const bap = await db.bap.findFirst({
      where: { assetId: id, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      include: {
        asset: {
          select: {
            id: true,
            name: true,
            divisionId: true,
            branchId: true,
            status: true,
            ...STOCK_SELECT,
          },
        },
      },
    });

    if (!bap) {
      return errorResponse(
        "Tidak ada pengajuan BAP yang menunggu persetujuan untuk aset ini",
        "Gagal",
        404
      );
    }

    // Cek akses divisi & outlet — admin hanya menyetujui BAP aset di cakupannya.
    // Diperiksa SEBELUM validasi stok agar pesan galat detail stok tidak bocor
    // ke admin divisi/outlet lain.
    const denied = assetAccessDenied(scope, bap.asset);
    if (denied) return denied;

    // Pcs yang diajukan sudah dipindah ke bucket reservasi saat pengajuan
    // dibuat. Bila reservasi tidak mencukupi, data stok tidak konsisten dan
    // persetujuan harus dihentikan daripada menghasilkan angka negatif.
    if (bap.asset.reservedQty < bap.quantity) {
      return errorResponse(
        `Stok yang dipesan pengajuan ini (${bap.asset.reservedQty} pcs) tidak sesuai dengan jumlah BAP (${bap.quantity} pcs)`,
        "Validasi gagal",
        400
      );
    }

    // Pcs yang disetujui keluar permanen dari inventaris: bucket reservasi dan
    // total stok sama-sama berkurang. Status headline menyusul komposisi stok
    // yang tersisa — BAP hanya ketika stok benar-benar habis, selain itu aset
    // tetap tampil dengan kondisi sisa stoknya (mis. tetap ACTIVE 90 pcs).
    const nextStock = removeStock(bap.asset, "reservedQty", bap.quantity);

    // Approve BAP dalam transaksi
    const updatedBap = await db.$transaction(async (tx) => {
      // Guard atomik: update hanya mengenai baris yang MASIH berstatus PENDING.
      // Tanpa ini, dua request approve/reject yang berjalan bersamaan sama-sama
      // lolos pengecekan di atas (TOCTOU) dan kuantitas aset ikut terpengaruh.
      const claimed = await tx.bap.updateMany({
        where: { id: bap.id, status: "PENDING" },
        data: {
          status: "APPROVED",
          approvedById: user.id,
        },
      });

      if (claimed.count === 0) {
        throw new Error("BAP_ALREADY_PROCESSED");
      }

      await tx.asset.update({
        where: { id: bap.assetId },
        data: stockUpdateData(nextStock),
      });

      return tx.bap.findUniqueOrThrow({
        where: { id: bap.id },
        include: {
          requestedBy: { select: { id: true, name: true } },
          approvedBy: { select: { id: true, name: true } },
          asset: { select: { id: true, name: true } },
        },
      });
    });

    await writeActivityLog(
      ctx,
      "APPROVE_BAP",
      `Menyetujui pengajuan BAP untuk aset "${bap.asset.name}" (ID: ${bap.asset.id}, Kuantitas BAP: ${bap.quantity})`,
      request
    );

    return successResponse(
      updatedBap,
      `Pengajuan BAP untuk aset "${bap.asset.name}" berhasil disetujui. ` +
        `Stok berkurang ${bap.quantity} pcs — sisa total ${nextStock.quantity} pcs ` +
        `(${nextStock.activeQty} pcs aktif).`
    );
  } catch (error) {
    if (error instanceof Error && error.message === "BAP_ALREADY_PROCESSED") {
      return errorResponse(
        "Pengajuan BAP ini sudah diproses oleh admin lain",
        "Validasi gagal",
        409
      );
    }
    console.error("Approve BAP error:", error);
    return errorResponse("Terjadi kesalahan server", "Gagal menyetujui BAP", 500);
  }
}
