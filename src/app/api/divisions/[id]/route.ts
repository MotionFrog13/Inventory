import { NextRequest } from "next/server";
import { requireUserScope } from "@/lib/auth";
import { errorResponse, isSuperAdmin, normalizeName, successResponse } from "@/lib/utils";
import { isUniqueViolation } from "@/lib/db-errors";
import { writeActivityLog } from "@/lib/logger";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// PUT /api/divisions/[id] — Ganti nama/deskripsi divisi (SUPER_ADMIN)
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const ctx = await requireUserScope(request);
    if (!ctx.ok) return ctx.response;
    const { db, user } = ctx;

    if (!isSuperAdmin(user.role)) {
      return errorResponse("Akses ditolak", "Hanya Super Admin yang dapat mengubah divisi", 403);
    }

    const { id } = await params;
    const existing = await db.division.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!existing) return errorResponse("Divisi tidak ditemukan", "Gagal", 404);

    const body = await request.json().catch(() => ({}));
    const name = body.name === undefined ? undefined : normalizeName(body.name);
    if (name === null) {
      return errorResponse("Nama divisi wajib diisi (maksimal 60 karakter)", "Validasi gagal", 400);
    }
    const description =
      body.description === undefined
        ? undefined
        : typeof body.description === "string" && body.description.trim()
          ? body.description.trim()
          : null;

    const division = await db.division.update({
      where: { id },
      data: { ...(name !== undefined && { name }), ...(description !== undefined && { description }) },
    });

    await writeActivityLog(ctx, "UPDATE_DIVISION", `Mengubah divisi "${existing.name}" → "${division.name}" (ID: ${id})`, request);
    return successResponse(division, "Divisi berhasil diperbarui");
  } catch (error) {
    if (isUniqueViolation(error)) {
      return errorResponse("Nama divisi sudah dipakai", "Validasi gagal", 409);
    }
    console.error("Update division error:", error);
    return errorResponse("Terjadi kesalahan server", "Gagal memperbarui divisi", 500);
  }
}

// DELETE /api/divisions/[id] — Hapus divisi kosong (SUPER_ADMIN). Kategori
// kosongnya ikut terhapus lewat onDelete: Cascade.
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const ctx = await requireUserScope(request);
    if (!ctx.ok) return ctx.response;
    const { db, user } = ctx;

    if (!isSuperAdmin(user.role)) {
      return errorResponse("Akses ditolak", "Hanya Super Admin yang dapat menghapus divisi", 403);
    }

    const { id } = await params;
    const division = await db.division.findUnique({
      where: { id },
      select: { name: true, _count: { select: { assets: true, users: true } } },
    });
    if (!division) return errorResponse("Divisi tidak ditemukan", "Gagal", 404);

    const { assets, users } = division._count;
    if (assets > 0 || users > 0) {
      return errorResponse(
        `Divisi masih memiliki ${assets} aset dan ${users} pengguna. Pindahkan atau hapus terlebih dahulu.`,
        "Gagal menghapus divisi",
        409
      );
    }

    await db.division.delete({ where: { id } });
    await writeActivityLog(ctx, "DELETE_DIVISION", `Menghapus divisi "${division.name}" (ID: ${id})`, request);
    return successResponse(null, "Divisi berhasil dihapus");
  } catch (error) {
    console.error("Delete division error:", error);
    return errorResponse("Terjadi kesalahan server", "Gagal menghapus divisi", 500);
  }
}
