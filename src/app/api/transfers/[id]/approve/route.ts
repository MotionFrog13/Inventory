import { NextRequest } from "next/server";
import { successResponse, errorResponse, isAdminRole } from "@/lib/utils";
import { canApproveTransfer, divisionAccessError } from "@/lib/scope";
import { requireUserScope } from "@/lib/auth";
import { writeActivityLog } from "@/lib/logger";

export const dynamic = "force-dynamic";

// POST /api/transfers/[id]/approve — Setujui permintaan transfer aset
// Hanya Admin Divisi / Super Admin dari outlet ASAL
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
        "Hanya admin yang dapat menyetujui transfer aset",
        403
      );
    }

    const { id } = await params;

    // Transfer organisasi lain tidak terlihat oleh client tenant → 404.
    const transfer = await db.transfer.findUnique({
      where: { id },
      include: {
        asset: { select: { id: true, name: true, divisionId: true } },
        toBranch: { select: { id: true, name: true } },
      },
    });

    if (!transfer) {
      return errorResponse("Permintaan transfer tidak ditemukan", "Gagal", 404);
    }

    // Admin hanya bisa menyetujui transfer untuk divisinya
    const divisionDenied = divisionAccessError(scope, transfer.asset.divisionId);
    if (divisionDenied) return errorResponse(divisionDenied.error, divisionDenied.message, 403);

    // Kewenangan menyetujui ada pada outlet ASAL. Outlet tujuan boleh melihat
    // mutasi yang menuju ke sana (lihat GET /api/transfers), namun tidak boleh
    // menariknya sendiri tanpa persetujuan cabang pemilik aset.
    if (!canApproveTransfer(scope, transfer)) {
      return errorResponse(
        "Hanya admin outlet asal yang dapat menyetujui mutasi ini.",
        "Akses ditolak",
        403
      );
    }

    if (transfer.status !== "PENDING") {
      return errorResponse(
        `Transfer sudah ${transfer.status === "APPROVED" ? "disetujui" : "ditolak"} sebelumnya`,
        "Validasi gagal",
        400
      );
    }

    // Approve transfer dalam transaksi — update status Transfer + pindahkan aset
    const updatedTransfer = await db.$transaction(async (tx) => {
      // Guard atomik: hanya mengenai baris yang MASIH PENDING, sehingga dua
      // request approve/reject bersamaan tidak sama-sama lolos (TOCTOU).
      const claimed = await tx.transfer.updateMany({
        where: { id, status: "PENDING" },
        data: {
          status: "APPROVED",
          approvedById: user.id,
        },
      });

      if (claimed.count === 0) {
        throw new Error("TRANSFER_ALREADY_PROCESSED");
      }

      // Pindahkan aset ke cabang tujuan
      await tx.asset.update({
        where: { id: transfer.assetId },
        data: { branchId: transfer.toBranchId },
      });

      return tx.transfer.findUniqueOrThrow({
        where: { id },
        include: {
          fromBranch: { select: { id: true, name: true } },
          toBranch: { select: { id: true, name: true } },
          asset: { select: { id: true, name: true } },
          requestedBy: { select: { id: true, name: true } },
          approvedBy: { select: { id: true, name: true } },
        },
      });
    });

    await writeActivityLog(
      ctx,
      "APPROVE_TRANSFER",
      `Menyetujui mutasi aset "${transfer.asset.name}" (ID: ${transfer.asset.id}) ke cabang "${transfer.toBranch.name}"`,
      request
    );

    return successResponse(
      updatedTransfer,
      `Transfer aset "${transfer.asset.name}" ke ${transfer.toBranch.name} berhasil disetujui`
    );
  } catch (error) {
    if (error instanceof Error && error.message === "TRANSFER_ALREADY_PROCESSED") {
      return errorResponse(
        "Permintaan transfer ini sudah diproses oleh admin lain",
        "Validasi gagal",
        409
      );
    }
    console.error("Approve transfer error:", error);
    return errorResponse("Terjadi kesalahan server", "Gagal menyetujui transfer", 500);
  }
}
