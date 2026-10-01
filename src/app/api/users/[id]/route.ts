import { NextRequest } from "next/server";
import type { Role } from "@prisma/client";
import { hashPassword, requireUserScope } from "@/lib/auth";
import { validateAssignment } from "@/lib/scope";
import { USER_PUBLIC_SELECT, assignmentRefsError, toPublicUser } from "@/lib/users";
import { isUniqueViolation } from "@/lib/db-errors";
import { writeActivityLog } from "@/lib/logger";
import {
  VALID_ROLES,
  errorResponse,
  isSuperAdmin,
  isValidEmail,
  isValidUsername,
  normalizeEmail,
  successResponse,
} from "@/lib/utils";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// PUT /api/users/[id] — Ubah pengguna (SUPER_ADMIN)
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const ctx = await requireUserScope(request);
    if (!ctx.ok) return ctx.response;
    const { db, user } = ctx;

    if (!isSuperAdmin(user.role)) {
      return errorResponse("Akses ditolak", "Hanya Super Admin yang dapat mengedit pengguna", 403);
    }

    const { id } = await params;
    const existing = await db.user.findUnique({
      where: { id },
      select: { id: true, role: true, email: true, divisionId: true, branches: { select: { branchId: true } } },
    });
    if (!existing) return errorResponse("Pengguna tidak ditemukan", "Gagal", 404);

    const body = await request.json();

    const finalRole: string = body.role ?? existing.role;
    if (!(VALID_ROLES as readonly string[]).includes(finalRole)) {
      return errorResponse(`Peran tidak valid. Pilihan: ${VALID_ROLES.join(", ")}`, "Validasi gagal", 400);
    }

    let username: string | undefined;
    if (body.username !== undefined) {
      username = String(body.username).trim().toLowerCase();
      if (!isValidUsername(username)) {
        return errorResponse(
          "Username hanya boleh huruf kecil, angka, titik, garis bawah, dan tanda hubung (3–32 karakter)",
          "Validasi gagal",
          400
        );
      }
    }

    const email = body.email === undefined ? existing.email : normalizeEmail(body.email);
    if (email && !isValidEmail(email)) {
      return errorResponse("Format email tidak valid", "Validasi gagal", 400);
    }
    if (isSuperAdmin(finalRole) && !email) {
      return errorResponse("Email wajib diisi untuk Super Admin", "Validasi gagal", 400);
    }

    // Penugasan divalidasi terhadap peran FINAL — menurunkan Super Admin tanpa
    // divisi/outlet akan menghasilkan akun yang langsung terkunci.
    const assignment = validateAssignment(
      finalRole,
      body.divisionId === undefined ? existing.divisionId : body.divisionId,
      body.branchIds === undefined ? existing.branches.map((b) => b.branchId) : body.branchIds
    );
    if (!assignment.ok) return errorResponse(assignment.message, "Validasi gagal", 400);

    const refError = await assignmentRefsError(db, assignment.divisionId, assignment.branchIds);
    if (refError) return errorResponse(refError, "Validasi gagal", 400);

    // Organisasi tidak boleh kehilangan Super Admin terakhirnya — pada mode
    // SaaS tidak ada operator yang dapat memulihkannya.
    if (existing.role === "SUPER_ADMIN" && !isSuperAdmin(finalRole)) {
      const others = await db.user.count({ where: { role: "SUPER_ADMIN", id: { not: id } } });
      if (others === 0) {
        return errorResponse("Organisasi harus memiliki minimal satu Super Admin", "Validasi gagal", 400);
      }
    }

    let hashedPassword: string | undefined;
    if (body.password) {
      if (String(body.password).length < 6) {
        return errorResponse("Password minimal 6 karakter", "Validasi gagal", 400);
      }
      hashedPassword = await hashPassword(String(body.password));
    }

    const updated = await db.user.update({
      where: { id },
      data: {
        ...(body.name && { name: String(body.name).trim() }),
        ...(username && { username }),
        ...(hashedPassword && { password: hashedPassword }),
        email,
        role: finalRole as Role,
        divisionId: assignment.divisionId,
        // Ganti seluruh penugasan outlet dalam satu operasi.
        branches: {
          deleteMany: {},
          create: assignment.branchIds.map((branchId) => ({ branchId })),
        },
      },
      select: USER_PUBLIC_SELECT,
    });

    const result = toPublicUser(updated);
    await writeActivityLog(
      ctx,
      "UPDATE_USER",
      `Memperbarui pengguna "${result.username}" (${result.roleLabel}, Outlet: ${result.branches.map((b) => b.name).join(", ") || "Semua outlet"})`,
      request
    );
    return successResponse(result, "Pengguna berhasil diperbarui");
  } catch (error) {
    if (isUniqueViolation(error)) {
      return errorResponse("Username atau email sudah digunakan", "Validasi gagal", 409);
    }
    console.error("Update user error:", error);
    return errorResponse("Terjadi kesalahan server", "Gagal memperbarui pengguna", 500);
  }
}

// DELETE /api/users/[id] — Hapus pengguna (SUPER_ADMIN, bukan diri sendiri)
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const ctx = await requireUserScope(request);
    if (!ctx.ok) return ctx.response;
    const { db, user } = ctx;

    if (!isSuperAdmin(user.role)) {
      return errorResponse("Akses ditolak", "Hanya Super Admin yang dapat menghapus pengguna", 403);
    }

    const { id } = await params;
    if (id === user.id) {
      return errorResponse("Tidak dapat menghapus akun Anda sendiri", "Validasi gagal", 400);
    }

    const existing = await db.user.findUnique({ where: { id }, select: { username: true } });
    if (!existing) return errorResponse("Pengguna tidak ditemukan", "Gagal", 404);

    await db.user.delete({ where: { id } });
    await writeActivityLog(ctx, "DELETE_USER", `Menghapus pengguna "${existing.username}" (ID: ${id})`, request);
    return successResponse(null, "Pengguna berhasil dihapus");
  } catch (error) {
    console.error("Delete user error:", error);
    return errorResponse("Terjadi kesalahan server", "Gagal menghapus pengguna", 500);
  }
}
