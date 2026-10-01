import { NextRequest } from "next/server";
import {
  successResponse,
  errorResponse,
  isAdminRole,
  parsePagination,
  EDITABLE_ASSET_STATUSES,
} from "@/lib/utils";
import { effectiveBranchFilter, effectiveDivisionFilter } from "@/lib/scope";
import { requireUserScope } from "@/lib/auth";
import { Prisma } from "@prisma/client";
import { writeActivityLog } from "@/lib/logger";
import { isUniqueViolation } from "@/lib/db-errors";
import { initialStock, isStockCondition, stockUpdateData } from "@/lib/stock";

export const dynamic = "force-dynamic";

// GET /api/assets — List aset (filter: divisionId, categoryId, branchId, status, search)
// Organisasi dijamin client tenant; divisi & outlet dibatasi cakupan pengguna.
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireUserScope(request);
    if (!ctx.ok) return ctx.response;
    const { db, scope } = ctx;

    const { searchParams } = request.nextUrl;
    const status = searchParams.get("status");
    const search = searchParams.get("search");
    const { page, limit, skip } = parsePagination(searchParams, {
      defaultLimit: 20,
      maxLimit: 100,
    });

    const where: Prisma.AssetWhereInput = {};

    // Divisi & outlet: nilai dari klien hanya mempersempit, tidak pernah
    // memperluas — `?divisionId=` hanya berlaku untuk SUPER_ADMIN, dan
    // `?branchId=` di luar outlet pengguna diabaikan.
    const divisionFilter = effectiveDivisionFilter(scope, searchParams.get("divisionId"));
    if (divisionFilter) where.divisionId = divisionFilter;
    const branchFilter = effectiveBranchFilter(scope, searchParams.get("branchId"));
    if (branchFilter) where.branchId = { in: branchFilter };

    const categoryId = searchParams.get("categoryId");
    if (categoryId) where.categoryId = categoryId;
    if (status) where.status = status as Prisma.EnumAssetStatusFilter["equals"];
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { serialNumber: { contains: search, mode: "insensitive" } },
        { brand: { contains: search, mode: "insensitive" } },
        { model: { contains: search, mode: "insensitive" } },
      ];
    }

    const [assets, total] = await Promise.all([
      db.asset.findMany({
        where,
        include: {
          branch: { select: { id: true, name: true } },
          division: { select: { id: true, name: true } },
          category: { select: { id: true, name: true } },
          // BAP terbaru saja — relasi one-to-many, riwayat lama tetap tersimpan
          baps: {
            select: { id: true, status: true, quantity: true },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      db.asset.count({ where }),
    ]);

    return successResponse(
      {
        assets,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      "Daftar aset berhasil diambil"
    );
  } catch (error) {
    console.error("Get assets error:", error);
    return errorResponse("Terjadi kesalahan server", "Gagal mengambil data aset", 500);
  }
}

// POST /api/assets — Tambah aset baru (Admin Divisi & Super Admin)
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireUserScope(request);
    if (!ctx.ok) return ctx.response;
    const { db, scope, user } = ctx;

    if (!isAdminRole(user.role)) {
      return errorResponse("Akses ditolak", "Hanya admin yang dapat menambahkan aset", 403);
    }

    const body = await request.json();
    const {
      name,
      categoryId,
      serialNumber,
      brand,
      model,
      specs,
      purchaseDate,
      warrantyDate,
      status,
      quantity,
      photoUrl,
      notes,
    } = body;

    // Divisi: admin divisi selalu divisinya sendiri — nilai berbeda DITOLAK
    // (bukan diam-diam ditimpa) agar salah pilih terlihat jelas.
    const divisionId: string | undefined = scope.divisionId
      ? body.divisionId || scope.divisionId
      : body.divisionId;
    if (scope.divisionId && divisionId !== scope.divisionId) {
      return errorResponse("Anda hanya dapat menambahkan aset di divisi Anda sendiri.", "Akses ditolak", 403);
    }

    // Outlet: harus salah satu outlet pengguna. Pengguna ber-outlet tunggal
    // tidak perlu mengirimnya; pemegang beberapa outlet wajib memilih.
    let branchId: string | undefined = body.branchId || undefined;
    if (scope.branchIds) {
      if (!branchId && scope.branchIds.length === 1) branchId = scope.branchIds[0];
      if (branchId && !scope.branchIds.includes(branchId)) {
        return errorResponse("Anda hanya dapat menambahkan aset di outlet Anda sendiri.", "Akses ditolak", 403);
      }
    }

    if (!name || !divisionId || !categoryId || !branchId || !status) {
      return errorResponse(
        "Nama, divisi, kategori, outlet, dan kondisi stok awal wajib diisi",
        "Validasi gagal",
        400
      );
    }

    // Kategori wajib milik divisi aset; client tenant sekaligus menolak ID
    // milik organisasi lain. FK komposit (divisionId, categoryId) adalah
    // jaring pengaman terakhir di database.
    const category = await db.category.findFirst({
      where: { id: categoryId, divisionId },
      select: { id: true, name: true },
    });
    if (!category) {
      return errorResponse("Kategori tidak ditemukan di divisi ini", "Validasi gagal", 400);
    }

    const branch = await db.branch.findUnique({ where: { id: branchId }, select: { id: true } });
    if (!branch) {
      return errorResponse("Cabang tidak ditemukan", "Validasi gagal", 400);
    }

    // Validasi status awal — cegah aset dibuat langsung dalam status BAP/BAP_PENDING
    // (melewati alur pengajuan & persetujuan BAP) serta cegah nilai enum tak dikenal
    // yang akan membuat Prisma melempar error dan endpoint membalas 500, bukan 400.
    // Status awal sekaligus menentukan bucket stok mana yang diisi.
    if (!isStockCondition(status)) {
      return errorResponse(
        `Status "${status}" tidak dapat diset saat pembuatan aset. ` +
          "Status BAP hanya dapat dicapai melalui alur pengajuan & persetujuan BAP. " +
          `Pilihan yang valid: ${EDITABLE_ASSET_STATUSES.join(", ")}`,
        "Validasi gagal",
        400
      );
    }

    // Stok awal — divalidasi eksplisit agar "abc" atau 0 ditolak 400, bukan
    // diam-diam jatuh ke 1 dan menghasilkan angka persediaan yang salah.
    const initialQuantity =
      quantity === undefined || quantity === null || quantity === ""
        ? 1
        : parseInt(String(quantity), 10);

    if (!Number.isFinite(initialQuantity) || initialQuantity < 1) {
      return errorResponse("Stok awal harus berupa angka minimal 1", "Validasi gagal", 400);
    }

    if (serialNumber) {
      const existing = await db.asset.findFirst({
        where: { serialNumber, categoryId },
        select: { id: true },
      });
      if (existing) {
        return errorResponse(
          `Serial number "${serialNumber}" sudah terdaftar untuk kategori ${category.name}`,
          "Validasi gagal",
          400
        );
      }
    }

    const asset = await db.asset.create({
      data: {
        organizationId: ctx.user.organizationId,
        divisionId,
        categoryId,
        branchId,
        name,
        serialNumber: serialNumber || null,
        brand: brand || null,
        model: model || null,
        specs: specs || null,
        purchaseDate: purchaseDate ? new Date(purchaseDate) : null,
        warrantyDate: warrantyDate ? new Date(warrantyDate) : null,
        // Seluruh stok awal masuk ke satu bucket sesuai status yang dipilih;
        // `status` ikut diturunkan dari komposisi itu (src/lib/stock.ts).
        ...stockUpdateData(initialStock(initialQuantity, status)),
        photoUrl: photoUrl || null,
        notes: notes || null,
      },
      include: {
        branch: { select: { id: true, name: true } },
        division: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
      },
    });

    await writeActivityLog(
      ctx,
      "CREATE_ASSET",
      `Menambahkan aset baru: "${asset.name}" (ID: ${asset.id}, Divisi: ${asset.division.name}, ` +
        `Kategori: ${asset.category.name}, Outlet: ${asset.branch.name}, Stok awal: ${asset.quantity} pcs ${status})`,
      request
    );

    return successResponse(asset, "Aset berhasil ditambahkan", 201);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return errorResponse("Serial number sudah terdaftar untuk kategori ini", "Validasi gagal", 400);
    }
    console.error("Create asset error:", error);
    return errorResponse("Terjadi kesalahan server", "Gagal menambah aset", 500);
  }
}
