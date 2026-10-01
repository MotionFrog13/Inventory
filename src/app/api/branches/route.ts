import { NextRequest } from "next/server";
import { successResponse, errorResponse, isSuperAdmin } from "@/lib/utils";
import { assetScopeWhere } from "@/lib/scope";
import { requireUserScope } from "@/lib/auth";
import { writeActivityLog } from "@/lib/logger";
import { isUniqueViolation } from "@/lib/db-errors";

export const dynamic = "force-dynamic";

// GET /api/branches — List cabang beserta summary jumlah aset (dibatasi divisi +
// outlet pengguna; organisasi dijamin client tenant)
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireUserScope(request);
    if (!ctx.ok) return ctx.response;
    const { db, scope } = ctx;

    // Aset berstatus BAP sudah dihapus/diarsipkan permanen dan dikeluarkan dari
    // perhitungan aktif cabang (CLAUDE.md §4.B.3).
    const assetScope = {
      ...assetScopeWhere(scope),
      status: { not: "BAP" as const },
    };

    // `?all=1` mengembalikan seluruh cabang organisasi — dipakai sebagai daftar
    // cabang TUJUAN pada form transfer dan penugasan outlet di halaman
    // Pengguna. Nama & lokasi cabang bukan data inventaris, sehingga aman;
    // angka aset tetap mengikuti cakupan pengguna di bawah.
    const listAllBranches = request.nextUrl.searchParams.get("all") === "1";

    const branches = await db.branch.findMany({
      where:
        scope.branchIds && !listAllBranches ? { id: { in: scope.branchIds } } : undefined,
      include: {
        _count: {
          select: { assets: { where: assetScope } },
        },
      },
      orderBy: { name: "asc" },
    });

    const data = branches.map((branch) => ({
      ...branch,
      assetCount: branch._count.assets,
      _count: undefined,
    }));

    return successResponse(data, "Daftar cabang berhasil diambil");
  } catch (error) {
    console.error("Get branches error:", error);
    return errorResponse("Terjadi kesalahan server", "Gagal mengambil data cabang", 500);
  }
}

// POST /api/branches — Tambah cabang baru (Super Admin)
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireUserScope(request);
    if (!ctx.ok) return ctx.response;
    const { db, user } = ctx;

    if (!isSuperAdmin(user.role)) {
      return errorResponse(
        "Akses ditolak",
        "Hanya Super Admin yang dapat menambah cabang",
        403
      );
    }

    const body = await request.json();
    const { name, location } = body;
    let mapUrl = body.mapUrl ? body.mapUrl.trim() : null;

    if (mapUrl === "") {
      mapUrl = null;
    } else if (mapUrl && mapUrl.includes("<iframe")) {
      const match = mapUrl.match(/src=["']([^"']+)["']/);
      if (match) {
        mapUrl = match[1];
      }
    }

    if (!name || !location) {
      return errorResponse(
        "Nama dan lokasi cabang wajib diisi",
        "Validasi gagal",
        400
      );
    }

    const branch = await db.branch.create({
      data: { organizationId: user.organizationId, name, location, mapUrl },
    });

    await writeActivityLog(
      ctx,
      "CREATE_BRANCH",
      `Menambahkan cabang baru: "${branch.name}" (ID: ${branch.id}, Lokasi: ${branch.location})`,
      request
    );

    return successResponse(branch, "Cabang berhasil ditambahkan", 201);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return errorResponse("Nama cabang sudah dipakai", "Validasi gagal", 409);
    }
    console.error("Create branch error:", error);
    return errorResponse("Terjadi kesalahan server", "Gagal menambah cabang", 500);
  }
}
