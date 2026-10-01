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

// GET /api/users — Daftar pengguna organisasi (SUPER_ADMIN)
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireUserScope(request);
    if (!ctx.ok) return ctx.response;
    const { db, user } = ctx;

    if (!isSuperAdmin(user.role)) {
      return errorResponse("Akses ditolak", "Hanya Super Admin yang dapat melihat daftar pengguna", 403);
    }

    const users = await db.user.findMany({ select: USER_PUBLIC_SELECT, orderBy: { createdAt: "asc" } });
    return successResponse(users.map(toPublicUser), "Daftar pengguna berhasil diambil");
  } catch (error) {
    console.error("Get users error:", error);
    return errorResponse("Terjadi kesalahan server", "Gagal mengambil data pengguna", 500);
  }
}

// POST /api/users — Tambah pengguna (SUPER_ADMIN)
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireUserScope(request);
    if (!ctx.ok) return ctx.response;
    const { db, user } = ctx;

    if (!isSuperAdmin(user.role)) {
      return errorResponse("Akses ditolak", "Hanya Super Admin yang dapat menambah pengguna", 403);
    }

    const body = await request.json();
    const username = String(body.username ?? "").trim().toLowerCase();
    const name = String(body.name ?? "").trim();
    const password = typeof body.password === "string" ? body.password : "";
    const role = body.role;
    const email = normalizeEmail(body.email);

    if (!username || !name || !password || !role) {
      return errorResponse("Username, nama, password, dan peran wajib diisi", "Validasi gagal", 400);
    }
    if (!isValidUsername(username)) {
      return errorResponse(
        "Username hanya boleh huruf kecil, angka, titik, garis bawah, dan tanda hubung (3–32 karakter)",
        "Validasi gagal",
        400
      );
    }
    if (password.length < 6) {
      return errorResponse("Password minimal 6 karakter", "Validasi gagal", 400);
    }
    if (!(VALID_ROLES as readonly string[]).includes(role)) {
      return errorResponse(`Peran tidak valid. Pilihan: ${VALID_ROLES.join(", ")}`, "Validasi gagal", 400);
    }
    if (email && !isValidEmail(email)) {
      return errorResponse("Format email tidak valid", "Validasi gagal", 400);
    }
    if (isSuperAdmin(role) && !email) {
      return errorResponse("Email wajib diisi untuk Super Admin", "Validasi gagal", 400);
    }

    const assignment = validateAssignment(role, body.divisionId, body.branchIds);
    if (!assignment.ok) return errorResponse(assignment.message, "Validasi gagal", 400);

    const refError = await assignmentRefsError(db, assignment.divisionId, assignment.branchIds);
    if (refError) return errorResponse(refError, "Validasi gagal", 400);

    const created = await db.user.create({
      data: {
        organizationId: user.organizationId,
        username,
        name,
        email,
        role: role as Role,
        password: await hashPassword(password),
        divisionId: assignment.divisionId,
        // organizationId UserBranch diwarisi dari User (FK komposit).
        branches: { create: assignment.branchIds.map((branchId) => ({ branchId })) },
      },
      select: USER_PUBLIC_SELECT,
    });

    const result = toPublicUser(created);
    await writeActivityLog(
      ctx,
      "CREATE_USER",
      `Membuat pengguna "${result.username}" (${result.roleLabel}, Outlet: ${result.branches.map((b) => b.name).join(", ") || "Semua outlet"})`,
      request
    );
    return successResponse(result, "Pengguna berhasil ditambahkan", 201);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return errorResponse("Username atau email sudah digunakan", "Validasi gagal", 409);
    }
    console.error("Create user error:", error);
    return errorResponse("Terjadi kesalahan server", "Gagal menambah pengguna", 500);
  }
}
