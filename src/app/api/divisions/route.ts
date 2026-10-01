import { NextRequest } from "next/server";
import { requireUserScope } from "@/lib/auth";
import { assetScopeWhere } from "@/lib/scope";
import { errorResponse, isSuperAdmin, normalizeName, successResponse } from "@/lib/utils";
import { isUniqueViolation } from "@/lib/db-errors";
import { writeActivityLog } from "@/lib/logger";

export const dynamic = "force-dynamic";

// GET /api/divisions — SUPER_ADMIN: semua divisi; peran lain: divisinya sendiri.
// Hitungan aset mengikuti cakupan outlet pengguna agar jumlah aset outlet lain
// tidak bocor; hitungan pengguna hanya untuk SUPER_ADMIN.
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireUserScope(request);
    if (!ctx.ok) return ctx.response;
    const { db, scope, user } = ctx;

    const assetWhere = assetScopeWhere(scope);
    const divisions = await db.division.findMany({
      where: scope.divisionId ? { id: scope.divisionId } : undefined,
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        description: true,
        categories: {
          orderBy: { name: "asc" },
          select: { id: true, name: true, _count: { select: { assets: { where: assetWhere } } } },
        },
        _count: {
          select: {
            assets: { where: assetWhere },
            ...(isSuperAdmin(user.role) ? { users: true } : {}),
          },
        },
      },
    });

    return successResponse(divisions, "Daftar divisi berhasil diambil");
  } catch (error) {
    console.error("Get divisions error:", error);
    return errorResponse("Terjadi kesalahan server", "Gagal mengambil data divisi", 500);
  }
}

// POST /api/divisions — Tambah divisi (SUPER_ADMIN)
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireUserScope(request);
    if (!ctx.ok) return ctx.response;
    const { db, user } = ctx;

    if (!isSuperAdmin(user.role)) {
      return errorResponse("Akses ditolak", "Hanya Super Admin yang dapat menambah divisi", 403);
    }

    const body = await request.json().catch(() => ({}));
    const name = normalizeName(body.name);
    if (!name) {
      return errorResponse("Nama divisi wajib diisi (maksimal 60 karakter)", "Validasi gagal", 400);
    }
    const description =
      typeof body.description === "string" && body.description.trim() ? body.description.trim() : null;

    const division = await db.division.create({
      data: { organizationId: user.organizationId, name, description },
    });

    await writeActivityLog(ctx, "CREATE_DIVISION", `Menambahkan divisi "${division.name}" (ID: ${division.id})`, request);
    return successResponse(division, "Divisi berhasil ditambahkan", 201);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return errorResponse("Nama divisi sudah dipakai", "Validasi gagal", 409);
    }
    console.error("Create division error:", error);
    return errorResponse("Terjadi kesalahan server", "Gagal menambah divisi", 500);
  }
}
