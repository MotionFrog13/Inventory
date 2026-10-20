import { NextRequest } from "next/server";
import { successResponse, errorResponse } from "@/lib/utils";
import { assetAccessDenied } from "@/lib/scope";
import { requireUserScope } from "@/lib/auth";
import { writeActivityLog } from "@/lib/logger";
import { isSerializationConflict } from "@/lib/db-errors";

export const dynamic = "force-dynamic";

// POST /api/assets/[id]/transfer — Request mutasi aset (membuat Transfer PENDING)
// Aset TIDAK langsung berpindah — menunggu persetujuan admin outlet asal
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireUserScope(request);
    if (!ctx.ok) return ctx.response;
    const { db, scope, user } = ctx;

    const { id } = await params;
    const body = await request.json();
    const { toBranchId, reason } = body;

    // Validasi required fields
    if (!toBranchId || !reason) {
      return errorResponse(
        "Cabang tujuan dan alasan transfer wajib diisi",
        "Validasi gagal",
        400
      );
    }

    // Aset organisasi lain tidak terlihat oleh client tenant → 404.
    const asset = await db.asset.findUnique({
      where: { id },
      select: { id: true, branchId: true, name: true, status: true, divisionId: true },
    });

    if (!asset) {
      return errorResponse("Aset tidak ditemukan", "Gagal", 404);
    }

    // Cek akses divisi & outlet. Mutasi hanya boleh DIAJUKAN oleh outlet asal —
    // aset masih menjadi tanggung jawab cabang pengirim sampai disetujui,
    // sehingga cabang lain tidak dapat menarik aset milik outlet ini.
    const denied = assetAccessDenied(scope, asset);
    if (denied) return denied;

    // Aset tanpa stok yang bisa dipindahkan tidak dapat dimutasi. Status di sini
    // adalah turunan komposisi stok (src/lib/stock.ts), sehingga BAP parsial —
    // mis. 10 dari 100 pcs sedang diajukan — TIDAK memblokir mutasi sisa stok.
    if (asset.status === "BAP_PENDING" || asset.status === "BAP" || asset.status === "RETIRED") {
      return errorResponse(
        `Aset dengan status "${asset.status}" tidak dapat dimutasi. ` +
        (asset.status === "RETIRED"
          ? "Seluruh stok sudah tidak digunakan."
          : asset.status === "BAP"
          ? "Seluruh stok sudah dihapus melalui BAP."
          : "Seluruh sisa stok sedang menunggu persetujuan BAP."),
        "Aset terkunci",
        400
      );
    }

    // Cek apakah sudah ada transfer PENDING untuk aset ini
    const pendingTransfer = await db.transfer.findFirst({
      where: { assetId: id, status: "PENDING" },
    });

    if (pendingTransfer) {
      return errorResponse(
        "Aset ini sudah memiliki permintaan transfer yang menunggu persetujuan",
        "Validasi gagal",
        400
      );
    }

    // Prevent transfer to same branch
    if (asset.branchId === toBranchId) {
      return errorResponse(
        "Tidak dapat mentransfer ke cabang yang sama",
        "Validasi gagal",
        400
      );
    }

    // Cabang tujuan boleh cabang mana pun DI ORGANISASI yang sama — ID cabang
    // organisasi lain tidak ditemukan oleh client tenant.
    const toBranch = await db.branch.findUnique({
      where: { id: toBranchId },
    });

    if (!toBranch) {
      return errorResponse("Cabang tujuan tidak ditemukan", "Validasi gagal", 400);
    }

    // Buat Transfer record dengan status PENDING (aset belum berpindah)
    const transfer = await db.$transaction(async (tx) => {
      const currentAsset = await tx.asset.findUnique({
        where: { id },
        select: { branchId: true, status: true },
      });
      if (!currentAsset || currentAsset.branchId !== asset.branchId ||
          ["BAP_PENDING", "BAP", "RETIRED"].includes(currentAsset.status)) {
        throw new Error("TRANSFER_ASSET_CHANGED");
      }
      const pending = await tx.transfer.findFirst({
        where: { assetId: id, status: "PENDING" },
        select: { id: true },
      });
      if (pending) throw new Error("TRANSFER_ALREADY_PENDING");
      return tx.transfer.create({
        data: {
          organizationId: user.organizationId,
          assetId: id,
          fromBranchId: asset.branchId,
          toBranchId,
          reason,
          status: "PENDING",
          requestedById: user.id,
        },
        include: {
          fromBranch: { select: { id: true, name: true } },
          toBranch: { select: { id: true, name: true } },
          asset: { select: { id: true, name: true } },
          requestedBy: { select: { id: true, name: true } },
        },
      });
    }, { isolationLevel: "Serializable" });

    await writeActivityLog(
      ctx,
      "REQUEST_TRANSFER",
      `Mengajukan mutasi aset "${asset.name}" (ID: ${asset.id}) dari cabang "${transfer.fromBranch.name}" ke "${transfer.toBranch.name}"`,
      request
    );

    return successResponse(
      transfer,
      `Permintaan transfer aset "${asset.name}" berhasil diajukan. Menunggu persetujuan admin.`,
      201
    );
  } catch (error) {
    if (error instanceof Error && error.message === "TRANSFER_ALREADY_PENDING") {
      return errorResponse("Aset ini sudah memiliki permintaan transfer yang menunggu persetujuan", "Validasi gagal", 400);
    }
    if (isSerializationConflict(error) || (error instanceof Error && error.message === "TRANSFER_ASSET_CHANGED")) {
      return errorResponse("Permintaan transfer atau lokasi aset berubah. Muat ulang sebelum mencoba lagi.", "Konflik perubahan", 409);
    }
    console.error("Transfer asset error:", error);
    return errorResponse("Terjadi kesalahan server", "Gagal membuat permintaan transfer", 500);
  }
}
