import { NextRequest } from "next/server";
import { successResponse, errorResponse, isAdminRole } from "@/lib/utils";
import { assetAccessDenied } from "@/lib/scope";
import { requireUserScope } from "@/lib/auth";
import { writeActivityLog } from "@/lib/logger";
import {
  STOCK_BUCKET_BY_CONDITION,
  STOCK_CONDITION_LABELS,
  STOCK_SELECT,
  moveStock,
  stockUpdateData,
} from "@/lib/stock";

export const dynamic = "force-dynamic";

// POST /api/assets/[id]/bap/reject — Tolak pengajuan BAP
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
        "Hanya admin yang dapat menolak pengajuan BAP",
        403
      );
    }

    const { id } = await params;

    // Optional: catatan penolakan dari body
    let rejectionNotes: string | null = null;
    try {
      const body = await request.json();
      rejectionNotes = body.notes || null;
    } catch {
      // Body kosong diperbolehkan
    }

    // Ambil pengajuan BAP yang masih menunggu persetujuan.
    // Relasi one-to-many: hanya boleh ada satu BAP berstatus PENDING per aset.
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

    // Cek akses divisi & outlet
    const denied = assetAccessDenied(scope, bap.asset);
    if (denied) return denied;

    // Pcs yang dipesan dikembalikan ke bucket asalnya — bukan selalu ke stok
    // aktif: 10 sumpit yang diajukan dari stok Rusak harus kembali sebagai
    // Rusak, bukan mendadak terhitung siap pakai.
    const restoredStock = moveStock(
      bap.asset,
      "reservedQty",
      STOCK_BUCKET_BY_CONDITION[bap.sourceCondition],
      bap.quantity
    );

    // Reject BAP dalam transaksi — reservasi stok dilepas kembali
    const updatedBap = await db.$transaction(async (tx) => {
      // Guard atomik: hanya mengenai baris yang MASIH PENDING, agar approve dan
      // reject yang berjalan bersamaan tidak sama-sama lolos (TOCTOU).
      const claimed = await tx.bap.updateMany({
        where: { id: bap.id, status: "PENDING" },
        data: {
          status: "REJECTED",
          approvedById: user.id,
          notes: rejectionNotes || bap.notes,
        },
      });

      if (claimed.count === 0) {
        throw new Error("BAP_ALREADY_PROCESSED");
      }

      await tx.asset.update({
        where: { id: bap.assetId },
        data: stockUpdateData(restoredStock),
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
      "REJECT_BAP",
      `Menolak pengajuan BAP untuk aset "${bap.asset.name}" (ID: ${bap.asset.id}, Kuantitas BAP: ${bap.quantity})`,
      request
    );

    return successResponse(
      updatedBap,
      `Pengajuan BAP aset "${bap.asset.name}" berhasil ditolak. ` +
        `${bap.quantity} pcs dikembalikan ke stok ${STOCK_CONDITION_LABELS[bap.sourceCondition]}.`
    );
  } catch (error) {
    if (error instanceof Error && error.message === "BAP_ALREADY_PROCESSED") {
      return errorResponse(
        "Pengajuan BAP ini sudah diproses oleh admin lain",
        "Validasi gagal",
        409
      );
    }
    console.error("Reject BAP error:", error);
    return errorResponse("Terjadi kesalahan server", "Gagal menolak BAP", 500);
  }
}
