import { NextRequest } from "next/server";
import { successResponse, errorResponse, parsePagination } from "@/lib/utils";
import { transferScopeWhere } from "@/lib/scope";
import { requireUserScope } from "@/lib/auth";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

// GET /api/transfers — Riwayat transfer aset (dibatasi divisi + outlet pengguna)
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireUserScope(request);
    if (!ctx.ok) return ctx.response;
    const { db, scope } = ctx;

    const { searchParams } = request.nextUrl;
    const assetId = searchParams.get("assetId");
    const fromBranchId = searchParams.get("fromBranchId");
    const toBranchId = searchParams.get("toBranchId");
    const status = searchParams.get("status"); // "PENDING" | "APPROVED" | "REJECTED"
    const { page, limit, skip } = parsePagination(searchParams, {
      defaultLimit: 20,
      maxLimit: 100,
    });

    // Filter divisi + outlet. Untuk pengguna ber-outlet, `transferScopeWhere`
    // mencakup KEDUA sisi mutasi (keluar dari & masuk ke outletnya) sehingga
    // kiriman dari cabang lain tetap terlihat — meski hanya outlet asal yang
    // berwenang menyetujuinya (lihat route approve/reject).
    const where: Prisma.TransferWhereInput = transferScopeWhere(scope);

    if (assetId) where.assetId = assetId;
    if (fromBranchId) where.fromBranchId = fromBranchId;
    if (toBranchId) where.toBranchId = toBranchId;
    if (status) where.status = status as Prisma.EnumTransferStatusFilter["equals"];

    const [transfers, total] = await Promise.all([
      db.transfer.findMany({
        where,
        include: {
          asset: {
            select: {
              id: true,
              name: true,
              divisionId: true,
              division: { select: { name: true } },
              category: { select: { name: true } },
            },
          },
          fromBranch: {
            select: { id: true, name: true },
          },
          toBranch: {
            select: { id: true, name: true },
          },
          requestedBy: {
            select: { id: true, name: true, username: true },
          },
          approvedBy: {
            select: { id: true, name: true, username: true },
          },
        },
        orderBy: { transferredAt: "desc" },
        skip,
        take: limit,
      }),
      db.transfer.count({ where }),
    ]);

    return successResponse(
      {
        transfers,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      "Riwayat transfer berhasil diambil"
    );
  } catch (error) {
    console.error("Get transfers error:", error);
    return errorResponse("Terjadi kesalahan server", "Gagal mengambil data transfer", 500);
  }
}
