import { NextRequest } from "next/server";
import { successResponse, errorResponse, parsePagination } from "@/lib/utils";
import { assetAccessDenied, assetRelationScopeWhere } from "@/lib/scope";
import { requireUserScope } from "@/lib/auth";
import { Prisma } from "@prisma/client";
import { writeActivityLog } from "@/lib/logger";
import { moveStock, stockUpdateData } from "@/lib/stock";

export const dynamic = "force-dynamic";

// GET /api/incidents — List insiden (dibatasi divisi + outlet lewat asetnya)
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireUserScope(request);
    if (!ctx.ok) return ctx.response;
    const { db, scope } = ctx;

    const { searchParams } = request.nextUrl;
    const assetId = searchParams.get("assetId");
    const status = searchParams.get("status"); // "resolved" | "unresolved"
    const resolveStatus = searchParams.get("resolveStatus"); // mis. "PENDING_REVIEW"
    const { page, limit, skip } = parsePagination(searchParams, {
      defaultLimit: 20,
      maxLimit: 100,
    });

    // Insiden mengikuti cakupan asetnya: divisi + outlet
    const where: Prisma.IncidentWhereInput = assetRelationScopeWhere(scope);

    if (assetId) where.assetId = assetId;
    if (status === "resolved") where.resolvedAt = { not: null };
    if (status === "unresolved") where.resolvedAt = null;
    // Filter di sisi server agar hitungan & paginasi konsisten dengan hasil.
    if (resolveStatus) where.resolveStatus = resolveStatus;

    const [incidents, total] = await Promise.all([
      db.incident.findMany({
        where,
        include: {
          asset: {
            select: {
              id: true,
              name: true,
              divisionId: true,
              quantity: true,
              activeQty: true,
              division: { select: { name: true } },
              category: { select: { name: true } },
              branch: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { reportedAt: "desc" },
        skip,
        take: limit,
      }),
      db.incident.count({ where }),
    ]);

    return successResponse(
      {
        incidents,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      "Daftar insiden berhasil diambil"
    );
  } catch (error) {
    console.error("Get incidents error:", error);
    return errorResponse("Terjadi kesalahan server", "Gagal mengambil data insiden", 500);
  }
}

// POST /api/incidents — Catat insiden kerusakan baru
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireUserScope(request);
    if (!ctx.ok) return ctx.response;
    const { db, scope, user } = ctx;

    const body = await request.json();
    const { assetId, description, quantity } = body;

    if (!assetId || !description) {
      return errorResponse(
        "ID aset dan deskripsi masalah wajib diisi",
        "Validasi gagal",
        400
      );
    }

    // Aset organisasi lain tidak terlihat oleh client tenant → 404.
    const asset = await db.asset.findUnique({
      where: { id: assetId },
    });

    if (!asset) {
      return errorResponse("Aset tidak ditemukan", "Validasi gagal", 404);
    }

    // Cek akses divisi & outlet — kerusakan hanya boleh dilaporkan atas aset
    // yang benar-benar berada di divisi & outlet pelapor
    const denied = assetAccessDenied(scope, asset);
    if (denied) return denied;

    // ── Jumlah pcs yang rusak ────────────────────────────────────────
    const brokenCount =
      quantity === undefined || quantity === null || quantity === ""
        ? 1
        : parseInt(String(quantity), 10);

    if (!Number.isFinite(brokenCount) || brokenCount < 1) {
      return errorResponse(
        "Jumlah unit yang rusak harus berupa angka minimal 1",
        "Validasi gagal",
        400
      );
    }

    // Pcs yang boleh dinyatakan rusak = seluruh stok kecuali yang sudah pensiun
    // dan yang sedang dikunci pengajuan BAP. Stok yang sudah tercatat rusak
    // tetap ikut dihitung agar tiket kedua atas perangkat yang sudah rusak
    // (mis. gejala baru pada laptop yang sama) tidak ikut terblokir.
    const reportableQty = asset.quantity - asset.reservedQty - asset.retiredQty;

    if (reportableQty <= 0) {
      return errorResponse(
        asset.quantity <= 0
          ? "Seluruh stok aset ini sudah dihapus melalui BAP."
          : "Tidak ada stok yang dapat dilaporkan rusak — seluruh stok sudah pensiun atau sedang menunggu persetujuan BAP.",
        "Validasi gagal",
        400
      );
    }

    if (brokenCount > reportableQty) {
      return errorResponse(
        `Jumlah rusak (${brokenCount} pcs) melebihi stok yang tersedia (${reportableQty} pcs)`,
        "Validasi gagal",
        400
      );
    }

    // Pemindahan dibatasi isi bucket Aktif: pcs yang memang sudah tercatat
    // rusak tidak dihitung dua kali (lihat `moveStock`).
    const nextStock = moveStock(asset, "activeQty", "brokenQty", brokenCount);
    const movedQty = asset.activeQty - nextStock.activeQty;

    const [incident] = await db.$transaction([
      db.incident.create({
        data: {
          organizationId: user.organizationId,
          assetId,
          quantity: brokenCount,
          description,
          handledBy: user.name,
        },
        include: {
          asset: {
            select: { id: true, name: true, category: { select: { name: true } } },
          },
        },
      }),
      // Status aset diturunkan dari komposisi stok: selama masih ada pcs aktif
      // item tetap tampil ACTIVE, hanya jumlahnya yang berkurang.
      db.asset.update({
        where: { id: assetId },
        data: stockUpdateData(nextStock),
      }),
    ]);

    await writeActivityLog(
      ctx,
      "REPORT_INCIDENT",
      `Melaporkan kerusakan ${brokenCount} pcs pada aset "${asset.name}" (ID: ${asset.id}). ` +
        `Stok aktif ${asset.activeQty} → ${nextStock.activeQty} pcs. Deskripsi: ${description}`,
      request
    );

    return successResponse(
      incident,
      `Insiden kerusakan ${brokenCount} pcs berhasil dicatat. ` +
        `Sisa stok aktif: ${nextStock.activeQty} dari ${nextStock.quantity} pcs.` +
        (movedQty < brokenCount
          ? ` (${brokenCount - movedQty} pcs sudah tercatat rusak sebelumnya)`
          : ""),
      201
    );
  } catch (error) {
    console.error("Create incident error:", error);
    return errorResponse("Terjadi kesalahan server", "Gagal mencatat insiden", 500);
  }
}
