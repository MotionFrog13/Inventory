import { NextRequest } from "next/server";
import { requireUserScope } from "@/lib/auth";
import { canManageCategories } from "@/lib/scope";
import { errorResponse, normalizeName, successResponse } from "@/lib/utils";
import { isUniqueViolation } from "@/lib/db-errors";
import { writeActivityLog } from "@/lib/logger";

export const dynamic = "force-dynamic";

// POST /api/divisions/[id]/categories — Tambah kategori
// (SUPER_ADMIN, atau DIVISION_ADMIN divisi tersebut)
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireUserScope(request);
    if (!ctx.ok) return ctx.response;
    const { db, scope, user } = ctx;

    const { id: divisionId } = await params;
    // Hak akses diperiksa SEBELUM keberadaan divisi agar admin divisi lain
    // tidak bisa memetakan ID divisi mana yang ada.
    if (!canManageCategories(user.role, scope, divisionId)) {
      return errorResponse("Akses ditolak", "Hanya Super Admin atau Admin Divisi terkait yang dapat mengelola kategori ini", 403);
    }

    const division = await db.division.findUnique({ where: { id: divisionId }, select: { id: true, name: true } });
    if (!division) return errorResponse("Divisi tidak ditemukan", "Gagal", 404);

    const body = await request.json().catch(() => ({}));
    const name = normalizeName(body.name);
    if (!name) {
      return errorResponse("Nama kategori wajib diisi (maksimal 60 karakter)", "Validasi gagal", 400);
    }

    const category = await db.category.create({
      data: { organizationId: user.organizationId, divisionId, name },
    });

    await writeActivityLog(ctx, "CREATE_CATEGORY", `Menambahkan kategori "${name}" di divisi "${division.name}"`, request);
    return successResponse(category, "Kategori berhasil ditambahkan", 201);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return errorResponse("Nama kategori sudah dipakai di divisi ini", "Validasi gagal", 409);
    }
    console.error("Create category error:", error);
    return errorResponse("Terjadi kesalahan server", "Gagal menambah kategori", 500);
  }
}
