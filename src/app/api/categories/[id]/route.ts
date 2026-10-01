import { NextRequest } from "next/server";
import { requireUserScope } from "@/lib/auth";
import { canManageCategories } from "@/lib/scope";
import { errorResponse, isSuperAdmin, normalizeName, successResponse } from "@/lib/utils";
import { isUniqueViolation } from "@/lib/db-errors";
import { writeActivityLog } from "@/lib/logger";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// PUT /api/categories/[id] — Ganti nama kategori
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const ctx = await requireUserScope(request);
    if (!ctx.ok) return ctx.response;
    const { db, scope, user } = ctx;

    const { id } = await params;
    const category = await db.category.findUnique({ where: { id }, select: { id: true, name: true, divisionId: true } });
    if (!category) return errorResponse("Kategori tidak ditemukan", "Gagal", 404);
    if (!canManageCategories(user.role, scope, category.divisionId)) {
      return errorResponse("Akses ditolak", "Hanya Super Admin atau Admin Divisi terkait yang dapat mengelola kategori ini", 403);
    }

    const body = await request.json().catch(() => ({}));
    const name = normalizeName(body.name);
    if (!name) {
      return errorResponse("Nama kategori wajib diisi (maksimal 60 karakter)", "Validasi gagal", 400);
    }

    const updated = await db.category.update({ where: { id }, data: { name } });
    await writeActivityLog(ctx, "UPDATE_CATEGORY", `Mengubah kategori "${category.name}" → "${name}" (ID: ${id})`, request);
    return successResponse(updated, "Kategori berhasil diperbarui");
  } catch (error) {
    if (isUniqueViolation(error)) {
      return errorResponse("Nama kategori sudah dipakai di divisi ini", "Validasi gagal", 409);
    }
    console.error("Update category error:", error);
    return errorResponse("Terjadi kesalahan server", "Gagal memperbarui kategori", 500);
  }
}

// DELETE /api/categories/[id] — Hapus kategori yang belum dipakai aset
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const ctx = await requireUserScope(request);
    if (!ctx.ok) return ctx.response;
    const { db, scope, user } = ctx;

    const { id } = await params;
    const category = await db.category.findUnique({
      where: { id },
      select: { name: true, divisionId: true, _count: { select: { assets: true } } },
    });
    if (!category) return errorResponse("Kategori tidak ditemukan", "Gagal", 404);
    if (!canManageCategories(user.role, scope, category.divisionId)) {
      return errorResponse("Akses ditolak", "Hanya Super Admin atau Admin Divisi terkait yang dapat mengelola kategori ini", 403);
    }

    if (category._count.assets > 0) {
      // Jumlah hanya untuk SUPER_ADMIN: admin divisi terikat outlet, dan
      // hitungan ini mencakup aset di outlet lain.
      const detail = isSuperAdmin(user.role) ? ` (${category._count.assets} aset)` : "";
      return errorResponse(
        `Kategori masih dipakai aset${detail}. Ubah kategori aset tersebut terlebih dahulu.`,
        "Gagal menghapus kategori",
        409
      );
    }

    await db.category.delete({ where: { id } });
    await writeActivityLog(ctx, "DELETE_CATEGORY", `Menghapus kategori "${category.name}" (ID: ${id})`, request);
    return successResponse(null, "Kategori berhasil dihapus");
  } catch (error) {
    console.error("Delete category error:", error);
    return errorResponse("Terjadi kesalahan server", "Gagal menghapus kategori", 500);
  }
}
