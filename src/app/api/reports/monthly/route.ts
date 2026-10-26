import { NextRequest } from "next/server";
import { successResponse, errorResponse } from "@/lib/utils";
import { assetRelationScopeWhere } from "@/lib/scope";
import { requireUserScope } from "@/lib/auth";
import { intlLocale, LANGUAGE_COOKIE, resolveLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

// GET /api/reports/monthly — Laporan statistik kerusakan per bulan (12 bulan terakhir)
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireUserScope(request);
    if (!ctx.ok) return ctx.response;
    const { db, scope } = ctx;
    const locale = resolveLocale(request.cookies.get(LANGUAGE_COOKIE)?.value);

    // Get incidents from the last 12 months
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const incidents = await db.incident.findMany({
      where: {
        reportedAt: {
          gte: twelveMonthsAgo,
        },
        ...assetRelationScopeWhere(scope),
      },
      select: {
        id: true,
        reportedAt: true,
        resolvedAt: true,
      },
      orderBy: { reportedAt: "asc" },
    });

    // Group by month
    const monthlyData: Record<
      string,
      { month: string; total: number; resolved: number; unresolved: number }
    > = {};

    incidents.forEach((incident) => {
      const date = new Date(incident.reportedAt);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const monthLabel = date.toLocaleDateString(intlLocale(locale), {
        month: "long",
        year: "numeric",
        timeZone: "Asia/Jakarta",
      });

      if (!monthlyData[key]) {
        monthlyData[key] = {
          month: monthLabel,
          total: 0,
          resolved: 0,
          unresolved: 0,
        };
      }

      monthlyData[key].total++;
      if (incident.resolvedAt) {
        monthlyData[key].resolved++;
      } else {
        monthlyData[key].unresolved++;
      }
    });

    const data = Object.values(monthlyData);

    return successResponse(data, "Laporan bulanan berhasil diambil");
  } catch (error) {
    console.error("Get monthly report error:", error);
    return errorResponse("Terjadi kesalahan server", "Gagal mengambil laporan bulanan", 500);
  }
}
