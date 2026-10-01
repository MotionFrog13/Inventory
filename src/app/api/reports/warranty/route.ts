import { NextRequest } from "next/server";
import { successResponse, errorResponse } from "@/lib/utils";
import { assetScopeWhere } from "@/lib/scope";
import { requireUserScope } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/reports/warranty — Daftar garansi habis dalam N hari ke depan
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireUserScope(request);
    if (!ctx.ok) return ctx.response;
    const { db, scope } = ctx;

    const { searchParams } = request.nextUrl;
    // Clamp: `?days=abc` menghasilkan NaN sehingga `futureDate` menjadi Invalid Date
    // dan Prisma melempar error (endpoint membalas 500, bukan hasil kosong).
    const rawDays = parseInt(searchParams.get("days") || "90", 10);
    const days =
      Number.isFinite(rawDays) && rawDays > 0 ? Math.min(rawDays, 3650) : 90;

    const now = new Date();
    const futureDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    // Assets with warranty expiring within the specified days OR already expired
    const expiringAssets = await db.asset.findMany({
      where: {
        ...assetScopeWhere(scope),
        warrantyDate: {
          not: null,
          lte: futureDate,
        },
        status: {
          notIn: ["RETIRED", "BAP"],
        },
      },
      include: {
        branch: { select: { id: true, name: true } },
        division: { select: { name: true } },
        category: { select: { name: true } },
      },
      orderBy: { warrantyDate: "asc" },
    });

    // Categorize by urgency
    const expired = expiringAssets.filter(
      (a) => a.warrantyDate && a.warrantyDate <= now
    );
    const urgent = expiringAssets.filter(
      (a) =>
        a.warrantyDate &&
        a.warrantyDate > now &&
        a.warrantyDate <= new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    );
    const warning = expiringAssets.filter(
      (a) =>
        a.warrantyDate &&
        a.warrantyDate > new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) &&
        a.warrantyDate <= futureDate
    );

    return successResponse(
      {
        summary: {
          expired: expired.length,
          expiringIn30Days: urgent.length,
          expiringIn31to90Days: warning.length,
          total: expiringAssets.length,
        },
        expired,
        expiringIn30Days: urgent,
        expiringIn31to90Days: warning,
      },
      "Laporan garansi berhasil diambil"
    );
  } catch (error) {
    console.error("Get warranty report error:", error);
    return errorResponse("Terjadi kesalahan server", "Gagal mengambil laporan garansi", 500);
  }
}
