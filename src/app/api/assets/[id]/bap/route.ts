import { NextRequest } from "next/server";
import { successResponse, errorResponse } from "@/lib/utils";
import { assetAccessDenied } from "@/lib/scope";
import { requireUserScope } from "@/lib/auth";
import { writeActivityLog } from "@/lib/logger";
import {
  STOCK_BUCKET_BY_CONDITION,
  STOCK_CONDITIONS,
  STOCK_CONDITION_LABELS,
  STOCK_SELECT,
  isStockCondition,
  moveStock,
  stockUpdateData,
} from "@/lib/stock";
import path from "path";
import fs from "fs/promises";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

// POST /api/assets/[id]/bap — Upload dokumen BAP dan ajukan penghapusan aset
// Akses: semua peran dalam divisi & outlet aset (staf boleh mengajukan)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireUserScope(request);
    if (!ctx.ok) return ctx.response;
    const { db, scope, user } = ctx;

    const { id } = await params;

    // Aset organisasi lain tidak terlihat oleh client tenant → 404.
    const asset = await db.asset.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        status: true,
        divisionId: true,
        branchId: true,
        ...STOCK_SELECT,
      },
    });

    if (!asset) {
      return errorResponse("Aset tidak ditemukan", "Gagal", 404);
    }

    // Cek akses divisi & outlet
    const denied = assetAccessDenied(scope, asset);
    if (denied) return denied;

    // Seluruh stok sudah habis dihapus lewat BAP sebelumnya
    if (asset.quantity <= 0) {
      return errorResponse(
        "Seluruh stok aset ini sudah dihapus melalui BAP sebelumnya",
        "Validasi gagal",
        400
      );
    }

    // Parse form data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const quantityStr = formData.get("quantity") as string | null;
    const sourceConditionRaw = formData.get("sourceCondition") as string | null;
    const notes = formData.get("notes") as string | null;

    if (!file) {
      return errorResponse(
        "File BAP (PDF atau Gambar) wajib diunggah",
        "Validasi gagal",
        400
      );
    }

    const quantity = quantityStr ? parseInt(quantityStr) : 1;

    if (isNaN(quantity) || quantity < 1) {
      return errorResponse("Jumlah aset yang dihapus tidak valid", "Validasi gagal", 400);
    }

    // Bucket stok asal — menentukan pcs mana yang dipesan pengajuan ini, dan ke
    // mana pcs tersebut dikembalikan bila BAP ditolak. Default ACTIVE menjaga
    // kompatibilitas dengan klien lama yang belum mengirim field ini.
    const sourceCondition = sourceConditionRaw || "ACTIVE";

    if (!isStockCondition(sourceCondition)) {
      return errorResponse(
        `Kondisi stok "${sourceCondition}" tidak dikenal. Pilihan: ${STOCK_CONDITIONS.join(", ")}`,
        "Validasi gagal",
        400
      );
    }

    const sourceBucket = STOCK_BUCKET_BY_CONDITION[sourceCondition];
    const availableQty = asset[sourceBucket];

    if (quantity > availableQty) {
      return errorResponse(
        `Jumlah yang dihapus (${quantity} pcs) melebihi stok ` +
        `${STOCK_CONDITION_LABELS[sourceCondition]} yang tersedia (${availableQty} pcs)`,
        "Validasi gagal",
        400
      );
    }

    // Buat folder penyimpanan: /public/uploads/bap/YYYY/MM/
    const now = new Date();
    const year = now.getFullYear().toString();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const uploadDir = path.join(process.cwd(), "public", "uploads", "bap", year, month);
    await fs.mkdir(uploadDir, { recursive: true });

    // Batas ukuran berlaku untuk SEMUA tipe file (bukan hanya PDF) agar
    // gambar berukuran ekstrem tidak dibaca penuh ke memori sebelum dikompres.
    const MAX_UPLOAD_SIZE = 5 * 1024 * 1024; // 5MB
    if (file.size > MAX_UPLOAD_SIZE) {
      return errorResponse(
        "Ukuran file tidak boleh melebihi 5MB",
        "Validasi gagal",
        400
      );
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    // Fallback: beberapa browser tidak mengirim MIME type yang benar saat re-upload file yang sama
    const rawMime = file.type;
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    const mimeMap: Record<string, string> = {
      pdf: "application/pdf",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
    };
    const mimeType = rawMime || mimeMap[ext] || "";
    const uniqueName = randomUUID();
    let fileUrl: string;

    if (!mimeType) {
      return errorResponse(
        "Format file tidak dapat dideteksi. Pastikan file adalah PDF, JPEG, PNG, atau WebP.",
        "Validasi gagal",
        400
      );
    }

    // Proses file berdasarkan tipe
    if (mimeType === "application/pdf") {
      // Re-cek terhadap byte aktual (file.size berasal dari klien)
      if (fileBuffer.byteLength > MAX_UPLOAD_SIZE) {
        return errorResponse(
          "Ukuran file PDF tidak boleh melebihi 5MB",
          "Validasi gagal",
          400
        );
      }

      const filePath = path.join(uploadDir, `${uniqueName}.pdf`);
      await fs.writeFile(filePath, fileBuffer);
      fileUrl = `/uploads/bap/${year}/${month}/${uniqueName}.pdf`;
    } else if (
      mimeType === "image/jpeg" ||
      mimeType === "image/png" ||
      mimeType === "image/webp"
    ) {
      // Gambar: Kompres dengan sharp → WebP 75% quality, max 1920px
      try {
        const sharp = (await import("sharp")).default;
        const webpBuffer = await sharp(fileBuffer)
          .resize(1920, 1920, { fit: "inside", withoutEnlargement: true })
          .webp({ quality: 75 })
          .toBuffer();

        const filePath = path.join(uploadDir, `${uniqueName}.webp`);
        await fs.writeFile(filePath, webpBuffer);
        fileUrl = `/uploads/bap/${year}/${month}/${uniqueName}.webp`;
      } catch (sharpError) {
        console.error("Sharp image processing error:", sharpError);
        return errorResponse(
          "Gagal memproses gambar. Pastikan file gambar tidak rusak dan coba lagi.",
          "Validasi gagal",
          400
        );
      }
    } else {
      return errorResponse(
        "Format file tidak didukung. Gunakan PDF, JPEG, PNG, atau WebP",
        "Validasi gagal",
        400
      );
    }

    const reservedStock = moveStock(asset, sourceBucket, "reservedQty", quantity);

    // Relasi Asset↔Bap bersifat one-to-many: riwayat BAP lama (APPROVED maupun
    // REJECTED) TIDAK BOLEH dihapus karena merupakan bukti penghapusan aset.
    // Transaksi interaktif dipakai untuk memeriksa ulang kondisi "tidak ada BAP
    // PENDING" tepat sebelum create, mencegah pengajuan ganda secara bersamaan.
    const runBapTransaction = () => db.$transaction(async (tx) => {
      // 1. Pastikan belum ada pengajuan BAP yang masih menunggu persetujuan
      const pendingBap = await tx.bap.findFirst({
        where: { assetId: id, status: "PENDING" },
        select: { id: true },
      });
      if (pendingBap) {
        throw new Error("BAP_ALREADY_PENDING");
      }

      // 2. Buat BAP baru (simpan bucket asal untuk dikembalikan saat ditolak)
      const newBap = await tx.bap.create({
        data: {
          organizationId: user.organizationId,
          assetId: id,
          quantity,
          sourceCondition,
          fileUrl,
          status: "PENDING",
          previousStatus: asset.status, // Jejak historis status aset saat diajukan
          notes: notes || null,
          requestedById: user.id,
        },
        include: {
          requestedBy: { select: { id: true, name: true, username: true } },
          asset: { select: { id: true, name: true } },
        },
      });

      // 3. Kunci pcs yang diajukan ke bucket reservasi. Sisa stok TIDAK ikut
      //    terkunci — status aset baru menjadi BAP_PENDING bila seluruh sisa
      //    stok habis dipesan (lihat `deriveAssetStatus`).
      await tx.asset.update({
        where: { id },
        data: stockUpdateData(reservedStock),
      });

      return newBap;
    });

    let bap;
    try {
      bap = await runBapTransaction();
    } catch (txError) {
      // Bersihkan file yang terlanjur ditulis agar tidak menjadi orphan di disk
      await fs
        .unlink(path.join(process.cwd(), "public", fileUrl))
        .catch(() => {});

      if (txError instanceof Error && txError.message === "BAP_ALREADY_PENDING") {
        return errorResponse(
          "Aset ini sudah memiliki pengajuan BAP yang menunggu persetujuan",
          "Validasi gagal",
          400
        );
      }
      throw txError;
    }

    await writeActivityLog(
      ctx,
      "SUBMIT_BAP",
      `Mengajukan dokumen BAP untuk aset "${asset.name}" (ID: ${asset.id}, ` +
        `Kuantitas BAP: ${quantity} pcs dari stok ${STOCK_CONDITION_LABELS[sourceCondition]})`,
      request
    );

    return successResponse(
      bap,
      `Pengajuan BAP ${quantity} pcs untuk aset "${asset.name}" berhasil dibuat. ` +
        `Menunggu persetujuan admin. Sisa stok yang masih dapat dipakai: ${reservedStock.activeQty} pcs.`,
      201
    );
  } catch (error) {
    console.error("Create BAP error:", error);
    return errorResponse("Terjadi kesalahan server", "Gagal mengajukan BAP", 500);
  }
}
