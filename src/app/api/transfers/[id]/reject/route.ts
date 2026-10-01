import { NextRequest } from "next/server";
import { successResponse, errorResponse, isAdminRole } from "@/lib/utils";
import { canApproveTransfer, divisionAccessError } from "@/lib/scope";
import { requireUserScope } from "@/lib/auth";
import { writeActivityLog } from "@/lib/logger";

export const dynamic = "force-dynamic";

// POST /api/transfers/[id]/reject — Tolak permintaan transfer aset
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
        "Hanya admin yang dapat menolak transfer aset",
        403
      );
    }

    const { id } = await params;

    // Transfer organisasi lain tidak terlihat oleh client tenant → 404.
    const transfer = await db.transfer.findUnique({
      where: { id },
      include: {
        asset: { select: { id: true, name: true, divisionId: true } },
        fromBranch: { select: { id: true, name: true } },
        toBranch: { select: { id: true, name: true } },
      },
    });

    if (!transfer) {
      return errorResponse("Permintaan transfer tidak ditemukan", "Gagal", 404);
    }

    // Cek akses divisi
    const divisionDenied = divisionAccessError(scope, transfer.asset.divisionId);
    if (divisionDenied) return errorResponse(divisionDenied.error, divisionDenied.message, 403);

    // Sama seperti approve: keputusan ada di tangan outlet ASAL pemilik aset.
    if (!canApproveTransfer(scope, transfer)) {
      return errorResponse(
        "Hanya admin outlet asal yang dapat menolak mutasi ini.",
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

    // Reject transfer (aset tetap di cabang asal — branchId sengaja tidak disentuh)
    // Guard atomik: hanya mengenai baris yang MASIH PENDING agar approve/reject
    // yang berjalan bersamaan tidak sama-sama lolos (TOCTOU).
    const claimed = await db.transfer.updateMany({
      where: { id, status: "PENDING" },
      data: {
        status: "REJECTED",
        approvedById: user.id,
      },
    });

    if (claimed.count === 0) {
      return errorResponse(
        "Permintaan transfer ini sudah diproses oleh admin lain",
        "Validasi gagal",
        409
      );
    }

    const updatedTransfer = await db.transfer.findUniqueOrThrow({
      where: { id },
      include: {
        fromBranch: { select: { id: true, name: true } },
        toBranch: { select: { id: true, name: true } },
        asset: { select: { id: true, name: true } },
        requestedBy: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
      },
    });

    await writeActivityLog(
      ctx,
      "REJECT_TRANSFER",
      `Menolak mutasi aset "${transfer.asset.name}" (ID: ${transfer.asset.id}) dari cabang "${transfer.fromBranch.name}" ke "${transfer.toBranch.name}"`,
      request
    );

    return successResponse(
      updatedTransfer,
      `Permintaan transfer aset "${transfer.asset.name}" berhasil ditolak. Aset tetap di cabang asal.`
    );
  } catch (error) {
    console.error("Reject transfer error:", error);
    return errorResponse("Terjadi kesalahan server", "Gagal menolak transfer", 500);
  }
}
