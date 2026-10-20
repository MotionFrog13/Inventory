import { NextRequest } from "next/server";
import {
  successResponse,
  errorResponse,
  isAdminRole,
  isSuperAdmin,
  EDITABLE_ASSET_STATUSES,
} from "@/lib/utils";
import { assetAccessDenied } from "@/lib/scope";
import { requireUserScope } from "@/lib/auth";
import { writeActivityLog } from "@/lib/logger";
import { isUniqueViolation, isRecordNotFound } from "@/lib/db-errors";
import {
  AssetStock,
  STOCK_SELECT,
  deriveAssetStatus,
  initialStock,
  isStockCondition,
  stockUpdateData,
  stockMutationWhere,
} from "@/lib/stock";

export const dynamic = "force-dynamic";

// GET /api/assets/[id] — Detail aset + log insiden + log transfer + BAP.
// Data MDM tidak disertakan: fitur MDM dinonaktifkan selama Fase 1.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireUserScope(request);
    if (!ctx.ok) return ctx.response;
    const { db, scope } = ctx;

    const { id } = await params;

    // Aset organisasi lain tidak terlihat oleh client tenant → 404 tanpa data.
    const asset = await db.asset.findUnique({
      where: { id },
      include: {
        branch: true,
        division: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        incidents: {
          orderBy: { reportedAt: "desc" },
        },
        transfers: {
          include: {
            fromBranch: { select: { id: true, name: true } },
            toBranch: { select: { id: true, name: true } },
            requestedBy: { select: { id: true, name: true, username: true } },
            approvedBy: { select: { id: true, name: true, username: true } },
          },
          orderBy: { transferredAt: "desc" },
        },
        // Riwayat BAP (terbaru lebih dulu) — relasi one-to-many
        baps: {
          include: {
            requestedBy: { select: { id: true, name: true, username: true } },
            approvedBy: { select: { id: true, name: true, username: true } },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!asset) {
      return errorResponse("Aset tidak ditemukan", "Gagal", 404);
    }

    // Cek akses divisi DAN outlet di dalam organisasi pengguna
    const denied = assetAccessDenied(scope, asset);
    if (denied) return denied;

    // `bap` dipertahankan untuk kompatibilitas konsumen lama (BAP terbaru),
    // sementara `baps` memuat seluruh riwayat pengajuan.
    return successResponse(
      { ...asset, bap: asset.baps[0] ?? null },
      "Detail aset berhasil diambil"
    );
  } catch (error) {
    console.error("Get asset detail error:", error);
    return errorResponse("Terjadi kesalahan server", "Gagal mengambil detail aset", 500);
  }
}

// PUT /api/assets/[id] — Edit spesifikasi/data aset (Admin Divisi & Super Admin)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireUserScope(request);
    if (!ctx.ok) return ctx.response;
    const { db, scope, user } = ctx;

    // Hanya admin yang bisa edit aset
    if (!isAdminRole(user.role)) {
      return errorResponse(
        "Akses ditolak",
        "Hanya admin yang dapat mengedit spesifikasi aset",
        403
      );
    }

    const { id } = await params;

    const existingAsset = await db.asset.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        divisionId: true,
        categoryId: true,
        serialNumber: true,
        branchId: true,
        ...STOCK_SELECT,
      },
    });

    if (!existingAsset) {
      return errorResponse("Aset tidak ditemukan", "Gagal", 404);
    }

    // Cek akses divisi & outlet
    const denied = assetAccessDenied(scope, existingAsset);
    if (denied) return denied;

    // Cek BAP lock. Dengan model stok, status BAP_PENDING hanya muncul ketika
    // SELURUH sisa stok sedang dipesan sebuah pengajuan BAP — BAP parsial
    // (mis. 10 dari 100 pcs) menyisakan stok yang tetap bebas diedit.
    if (existingAsset.status === "BAP_PENDING" || existingAsset.status === "BAP") {
      return errorResponse(
        existingAsset.status === "BAP"
          ? "Seluruh stok aset ini sudah dihapus melalui BAP dan tidak dapat diedit."
          : "Seluruh sisa stok aset ini sedang menunggu persetujuan BAP. " +
            "Selesaikan proses BAP terlebih dahulu.",
        "Aset terkunci",
        400
      );
    }

    const body = await request.json();
    const {
      name,
      categoryId,
      serialNumber,
      brand,
      model,
      specs,
      purchaseDate,
      warrantyDate,
      status,
      quantity,
      photoUrl,
      notes,
      branchId,
    } = body;

    // Validasi status — cegah bypass alur BAP melalui PUT langsung
    if (status !== undefined && !EDITABLE_ASSET_STATUSES.includes(status)) {
      return errorResponse(
        `Status "${status}" tidak dapat diset langsung. ` +
        "Status BAP hanya dapat dicapai melalui alur pengajuan & persetujuan BAP. " +
        `Pilihan yang valid: ${EDITABLE_ASSET_STATUSES.join(", ")}`,
        "Validasi gagal",
        400
      );
    }

    // Divisi aset tidak dapat diubah; kategori hanya dalam divisi yang sama.
    if (body.divisionId !== undefined && body.divisionId !== existingAsset.divisionId) {
      return errorResponse("Divisi aset tidak dapat diubah", "Validasi gagal", 400);
    }
    if (categoryId !== undefined && categoryId !== existingAsset.categoryId) {
      const category = await db.category.findFirst({
        where: { id: categoryId, divisionId: existingAsset.divisionId },
        select: { id: true },
      });
      if (!category) {
        return errorResponse("Kategori tidak ditemukan di divisi aset ini", "Validasi gagal", 400);
      }
    }

    // Validasi serial number unik per kategori (jika diisi dan berubah)
    if (serialNumber && serialNumber !== existingAsset.serialNumber) {
      const existing = await db.asset.findFirst({
        where: {
          serialNumber,
          categoryId: categoryId ?? existingAsset.categoryId,
          NOT: { id },
        },
        select: { id: true },
      });

      if (existing) {
        return errorResponse(
          `Serial number "${serialNumber}" sudah terdaftar untuk kategori ini`,
          "Validasi gagal",
          400
        );
      }
    }

    // Validasi branchId TIDAK DIPERBOLEHKAN diubah langsung melalui PUT.
    // Perubahan lokasi aset HARUS melalui alur Transfer (POST /api/assets/[id]/transfer).
    // Ini memastikan semua perpindahan aset tercatat dan memerlukan persetujuan admin.
    // Catatan: jika branchId dikirim sama dengan nilai saat ini, request tetap diizinkan.
    if (branchId !== undefined && branchId !== existingAsset.branchId) {
      return errorResponse(
        "Perpindahan lokasi aset tidak dapat dilakukan langsung. Gunakan fitur Transfer Aset.",
        "Aksi tidak diizinkan",
        400
      );
    }

    // ── Rekonsiliasi stok ────────────────────────────────────────────
    // `quantity` pada payload adalah TOTAL stok baru. Selisihnya hanya masuk ke
    // atau keluar dari bucket Aktif: pengurangan stok rusak, perbaikan, pensiun,
    // maupun yang sedang dipesan BAP wajib melalui alur Insiden/BAP agar setiap
    // pcs yang hilang dari inventaris selalu meninggalkan jejak dokumen.
    let nextStock: AssetStock = {
      quantity: existingAsset.quantity,
      activeQty: existingAsset.activeQty,
      brokenQty: existingAsset.brokenQty,
      repairQty: existingAsset.repairQty,
      retiredQty: existingAsset.retiredQty,
      reservedQty: existingAsset.reservedQty,
    };

    if (quantity !== undefined && quantity !== null && quantity !== "") {
      const newTotal = Number(quantity);

      if ((typeof quantity !== "number" && typeof quantity !== "string") ||
          !Number.isInteger(newTotal) || newTotal < 1 || newTotal > 2147483647) {
        return errorResponse(
          "Total stok harus berupa angka minimal 1",
          "Validasi gagal",
          400
        );
      }

      const delta = newTotal - nextStock.quantity;

      if (delta < 0 && nextStock.activeQty < -delta) {
        return errorResponse(
          `Stok aktif hanya ${nextStock.activeQty} pcs, sehingga total stok tidak dapat diturunkan ke ${newTotal}. ` +
          "Stok rusak, perbaikan, pensiun, atau yang sedang diajukan BAP hanya dapat dikurangi melalui alur BAP.",
          "Validasi gagal",
          400
        );
      }

      nextStock = {
        ...nextStock,
        quantity: newTotal,
        activeQty: nextStock.activeQty + delta,
      };
    }

    // Status hanya dapat diset manual untuk item unit tunggal tanpa reservasi
    // BAP. Untuk item ber-stok banyak status SELALU turunan komposisi bucket —
    // menerimanya dari payload akan membuat label dan angka saling bertentangan.
    const isSingleUnit = nextStock.quantity === 1 && nextStock.reservedQty === 0;

    if (status !== undefined) {
      if (isSingleUnit) {
        if (isStockCondition(status)) {
          nextStock = initialStock(1, status);
        }
      } else if (status !== deriveAssetStatus(nextStock)) {
        return errorResponse(
          "Status aset ber-stok banyak tidak dapat diubah langsung — status mengikuti komposisi stok. " +
          "Gunakan alur Insiden untuk menandai pcs rusak, atau BAP untuk menghapus stok.",
          "Validasi gagal",
          400
        );
      }
    }

    // Validasi business rule: status BROKEN atau REPAIR hanya boleh diset
    // jika ada minimal 1 tiket insiden yang belum diselesaikan —
    // KECUALI jika aset sudah dalam status tersebut (tidak perlu insiden baru saat edit field lain)
    const isTransitioningToBroken =
      isSingleUnit &&
      (status === "BROKEN" || status === "REPAIR") &&
      existingAsset.status !== status;

    if (isTransitioningToBroken) {
      const unresolvedIncident = await db.incident.findFirst({
        where: { assetId: id, resolvedAt: null },
      });
      if (!unresolvedIncident) {
        return errorResponse(
          `Aset tidak dapat diubah ke status "${status}" tanpa tiket insiden aktif. ` +
          "Buat tiket insiden terlebih dahulu melalui halaman Insiden.",
          "Validasi gagal",
          400
        );
      }
    }

    const asset = await db.asset.update({
      where: stockMutationWhere(existingAsset),
      data: {
        ...(name !== undefined && { name }),
        ...(categoryId !== undefined && { categoryId }),
        ...(serialNumber !== undefined && { serialNumber: serialNumber || null }),
        ...(brand !== undefined && { brand: brand || null }),
        ...(model !== undefined && { model: model || null }),
        ...(specs !== undefined && { specs: specs || null }),
        ...(purchaseDate !== undefined && {
          purchaseDate: purchaseDate ? new Date(purchaseDate) : null,
        }),
        ...(warrantyDate !== undefined && {
          warrantyDate: warrantyDate ? new Date(warrantyDate) : null,
        }),
        // Stok + status turunannya selalu ditulis bersama agar tidak pernah
        // ada baris dengan label status yang tidak cocok dengan angkanya.
        ...stockUpdateData(nextStock),
        ...(photoUrl !== undefined && { photoUrl: photoUrl || null }),
        ...(notes !== undefined && { notes: notes || null }),
        // branchId dikeluarkan secara sengaja — hanya bisa diubah melalui Transfer workflow
      },
      include: {
        branch: { select: { id: true, name: true } },
        division: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
      },
    });

    await writeActivityLog(
      ctx,
      "UPDATE_ASSET",
      `Mengubah spesifikasi aset "${asset.name}" (ID: ${asset.id})` +
        (nextStock.quantity !== existingAsset.quantity
          ? `. Total stok ${existingAsset.quantity} → ${nextStock.quantity} pcs`
          : ""),
      request
    );

    return successResponse(asset, "Aset berhasil diperbarui");
  } catch (error) {
    if (isUniqueViolation(error)) {
      return errorResponse("Serial number sudah terdaftar untuk kategori ini", "Validasi gagal", 400);
    }
    if (isRecordNotFound(error)) {
      return errorResponse("Stok atau lokasi aset berubah. Muat ulang sebelum mencoba lagi.", "Konflik perubahan", 409);
    }
    console.error("Update asset error:", error);
    return errorResponse("Terjadi kesalahan server", "Gagal memperbarui aset", 500);
  }
}

// DELETE /api/assets/[id] — Hapus aset (Super Admin only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireUserScope(request);
    if (!ctx.ok) return ctx.response;
    const { db, user } = ctx;

    if (!isSuperAdmin(user.role)) {
      return errorResponse(
        "Akses ditolak",
        "Hanya Super Admin yang dapat menghapus aset",
        403
      );
    }

    const { id } = await params;

    // Aset organisasi lain tidak terlihat → 404, dan transaksi di bawah tidak
    // pernah dijalankan atas ID tersebut.
    const assetToDelete = await db.asset.findUnique({
      where: { id },
      select: { name: true },
    });
    if (!assetToDelete) {
      return errorResponse("Aset tidak ditemukan", "Gagal", 404);
    }

    // Delete related records in transaction
    await db.$transaction([
      db.incident.deleteMany({ where: { assetId: id } }),
      db.transfer.deleteMany({ where: { assetId: id } }),
      db.bap.deleteMany({ where: { assetId: id } }),
      db.mdmDevice.deleteMany({ where: { assetId: id } }),
      db.asset.delete({ where: { id } }),
    ]);

    await writeActivityLog(
      ctx,
      "DELETE_ASSET",
      `Menghapus aset "${assetToDelete.name}" (ID: ${id})`,
      request
    );

    return successResponse(null, "Aset berhasil dihapus");
  } catch (error) {
    console.error("Delete asset error:", error);
    return errorResponse("Terjadi kesalahan server", "Gagal menghapus aset", 500);
  }
}
