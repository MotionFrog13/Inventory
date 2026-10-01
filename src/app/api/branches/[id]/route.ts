import { NextRequest } from "next/server";
import { successResponse, errorResponse, isSuperAdmin } from "@/lib/utils";
import { assetScopeWhere } from "@/lib/scope";
import { requireUserScope } from "@/lib/auth";
import { writeActivityLog } from "@/lib/logger";
import { isUniqueViolation } from "@/lib/db-errors";

export const dynamic = "force-dynamic";

// GET /api/branches/[id] — Detail cabang + daftar aset (dibatasi divisi pengguna)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireUserScope(request);
    if (!ctx.ok) return ctx.response;
    const { db, scope } = ctx;

    const { id } = await params;

    // Pengguna ber-outlet hanya boleh membuka detail outletnya sendiri —
    // halaman ini memuat daftar aset, sehingga membukanya untuk cabang lain
    // sama dengan melihat inventaris cabang tersebut.
    if (scope.branchIds && !scope.branchIds.includes(id)) {
      return errorResponse(
        "Unauthorized cross-branch access detected.",
        "Akses ditolak",
        403
      );
    }

    // Aset berstatus BAP sudah diarsipkan permanen dan dikeluarkan dari
    // perhitungan aktif cabang (CLAUDE.md §4.B.3).
    const assetScope = {
      ...assetScopeWhere(scope),
      status: { not: "BAP" as const },
    };

    // Cabang organisasi lain tidak terlihat oleh client tenant → 404.
    const branch = await db.branch.findUnique({
      where: { id },
      include: {
        assets: {
          where: assetScope,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            name: true,
            status: true,
            divisionId: true,
            categoryId: true,
            division: { select: { name: true } },
            category: { select: { name: true } },
            quantity: true,
            brand: true,
            serialNumber: true,
            warrantyDate: true,
          },
        },
        _count: {
          select: { assets: { where: assetScope } },
        },
      },
    });

    if (!branch) {
      return errorResponse("Cabang tidak ditemukan", "Gagal", 404);
    }

    return successResponse(branch, "Detail cabang berhasil diambil");
  } catch (error) {
    console.error("Get branch detail error:", error);
    return errorResponse("Terjadi kesalahan server", "Gagal mengambil detail cabang", 500);
  }
}

// PUT /api/branches/[id] — Edit detail cabang (Super Admin only)
// Disamakan dengan POST /api/branches dan DELETE /api/branches/[id]:
// cabang adalah data lintas-divisi, sehingga admin divisi tidak boleh
// mengubah nama/lokasi cabang yang juga dipakai divisi lain.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireUserScope(request);
    if (!ctx.ok) return ctx.response;
    const { db, user } = ctx;

    if (!isSuperAdmin(user.role)) {
      return errorResponse(
        "Akses ditolak",
        "Hanya Super Admin yang dapat mengedit cabang",
        403
      );
    }

    const { id } = await params;
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
      return errorResponse("Nama dan lokasi wajib diisi", "Validasi gagal", 400);
    }

    const existing = await db.branch.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      return errorResponse("Cabang tidak ditemukan", "Gagal", 404);
    }

    const branch = await db.branch.update({
      where: { id },
      data: { name, location, mapUrl },
    });

    await writeActivityLog(
      ctx,
      "UPDATE_BRANCH",
      `Mengubah detail cabang "${branch.name}" (ID: ${branch.id}, Lokasi Baru: ${branch.location})`,
      request
    );

    return successResponse(branch, "Cabang berhasil diperbarui");
  } catch (error) {
    if (isUniqueViolation(error)) {
      return errorResponse("Nama cabang sudah dipakai", "Validasi gagal", 409);
    }
    console.error("Update branch error:", error);
    return errorResponse("Terjadi kesalahan server", "Gagal memperbarui cabang", 500);
  }
}

// DELETE /api/branches/[id] — Hapus cabang (Super Admin only), hanya bila tidak
// ada aset maupun pengguna yang ditugaskan ke cabang tersebut.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireUserScope(request);
    if (!ctx.ok) return ctx.response;
    const { db, user } = ctx;

    if (!isSuperAdmin(user.role)) {
      return errorResponse(
        "Akses ditolak",
        "Hanya Super Admin yang dapat menghapus cabang",
        403
      );
    }

    const { id } = await params;

    const branch = await db.branch.findUnique({
      where: { id },
      select: { name: true, _count: { select: { assets: true, userBranches: true } } },
    });
    if (!branch) return errorResponse("Cabang tidak ditemukan", "Gagal", 404);

    // Pengguna yang ditugaskan ikut menghalangi: menghapus penugasannya diam-diam
    // bisa membuat akun kehilangan satu-satunya outlet dan terkunci total.
    const { assets, userBranches } = branch._count;
    if (assets > 0 || userBranches > 0) {
      return errorResponse(
        `Cabang masih memiliki ${assets} aset dan ${userBranches} pengguna yang ditugaskan. Pindahkan terlebih dahulu.`,
        "Gagal menghapus cabang",
        409
      );
    }

    await db.branch.delete({
      where: { id },
    });

    await writeActivityLog(
      ctx,
      "DELETE_BRANCH",
      `Menghapus cabang "${branch.name}" (ID: ${id})`,
      request
    );

    return successResponse(null, "Cabang berhasil dihapus");
  } catch (error) {
    console.error("Delete branch error:", error);
    return errorResponse("Terjadi kesalahan server", "Gagal menghapus cabang", 500);
  }
}
