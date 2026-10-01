import { NextRequest } from "next/server";
import { successResponse, errorResponse, parsePagination } from "@/lib/utils";
import { requireUserScope } from "@/lib/auth";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

// GET /api/activity-logs — Log aktivitas organisasi pengguna (SUPER_ADMIN only).
// Client tenant membatasi hasil ke organisasi pengguna; peran dibaca dari
// database (middleware hanya memeriksa dini dari payload token).
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireUserScope(request);
    if (!ctx.ok) return ctx.response;
    const { db, user } = ctx;

    // Hanya SUPER_ADMIN yang bisa melihat log aktivitas
    if (user.role !== "SUPER_ADMIN") {
      return errorResponse(
        "Akses ditolak",
        "Akses ditolak",
        403
      );
    }

    const { searchParams } = request.nextUrl;
    const search = searchParams.get("search");
    const { page, limit, skip } = parsePagination(searchParams, {
      defaultLimit: 50,
      maxLimit: 100,
    });

    const where: Prisma.ActivityLogWhereInput = {};

    if (search) {
      where.OR = [
        { username: { contains: search, mode: "insensitive" } },
        { action: { contains: search, mode: "insensitive" } },
        { details: { contains: search, mode: "insensitive" } },
      ];
    }

    const [logs, total] = await Promise.all([
      db.activityLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      db.activityLog.count({ where }),
    ]);

    return successResponse(
      {
        logs,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      "Log aktivitas berhasil diambil"
    );
  } catch (error) {
    console.error("Get activity logs error:", error);
    return errorResponse("Terjadi kesalahan server", "Gagal mengambil log aktivitas", 500);
  }
}

// Menolak mutasi data log aktivitas
export async function POST() {
  return errorResponse("Method Not Allowed", "Operasi tidak diizinkan", 405);
}

export async function PUT() {
  return errorResponse("Method Not Allowed", "Operasi tidak diizinkan", 405);
}

export async function PATCH() {
  return errorResponse("Method Not Allowed", "Operasi tidak diizinkan", 405);
}

export async function DELETE() {
  return errorResponse("Method Not Allowed", "Operasi tidak diizinkan", 405);
}
