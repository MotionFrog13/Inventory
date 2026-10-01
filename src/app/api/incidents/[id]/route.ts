import { NextRequest } from "next/server";
import { successResponse, errorResponse, isAdminRole, isSuperAdmin } from "@/lib/utils";
import { UserScope, assetAccessError } from "@/lib/scope";
import { requireUserScope, type TenantDb } from "@/lib/auth";
import { writeActivityLog } from "@/lib/logger";
import {
  STOCK_BUCKET_BY_CONDITION,
  STOCK_CONDITIONS,
  STOCK_SELECT,
  StockCondition,
  isStockCondition,
  moveStock,
  stockUpdateData,
} from "@/lib/stock";

export const dynamic = "force-dynamic";

// Status aset yang diizinkan saat resolusi = bucket stok yang tersedia.
// Diturunkan dari STOCK_CONDITIONS agar pilihan resolusi tidak pernah menunjuk
// kondisi yang tidak punya tempat penyimpanan stok.
const VALID_RESOLVED_STATUSES = STOCK_CONDITIONS;

// Status aset yang terkunci proses BAP (CLAUDE.md §4.B.2). Dengan model stok,
// status ini hanya muncul ketika SELURUH sisa stok sedang dipesan pengajuan BAP
// (BAP_PENDING) atau stok sudah habis dihapus (BAP) — BAP parsial tidak
// memblokir resolusi insiden atas pcs lain yang masih ada.
const BAP_LOCKED_STATUSES = ["BAP_PENDING", "BAP"];

// Helper: ambil incident dengan validasi akses divisi + outlet. Insiden
// organisasi lain tidak terlihat oleh client tenant (→ 404).
async function getIncidentWithAccess(db: TenantDb, id: string, scope: UserScope) {
  const incident = await db.incident.findUnique({
    where: { id },
    include: {
      asset: {
        select: {
          id: true,
          name: true,
          status: true,
          divisionId: true,
          branchId: true,
          ...STOCK_SELECT,
        },
      },
    },
  });
  if (!incident) return { incident: null, denied: false };
  if (assetAccessError(scope, incident.asset)) {
    return { incident: null, denied: true };
  }
  return { incident, denied: false };
}

// PUT /api/incidents/[id] — Multi-action endpoint
// action: "propose"  — Staf divisi mengajukan penyelesaian (menunggu acc Admin)
// action: "approve"  — Admin menyetujui pengajuan penyelesaian
// action: "reject"   — Admin menolak pengajuan penyelesaian
// action: "resolve"  — Admin langsung menyelesaikan tanpa melalui pengajuan
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireUserScope(request);
    if (!ctx.ok) return ctx.response;
    const { db, scope, user } = ctx;

    const { id } = await params;
    const body = await request.json();
    const { action, solution, assetStatus } = body;

    const { incident, denied } = await getIncidentWithAccess(db, id, scope);

    if (denied) {
      return errorResponse(
        "Unauthorized cross-division or cross-branch access detected.",
        "Akses ditolak",
        403
      );
    }
    if (!incident) {
      return errorResponse("Insiden tidak ditemukan", "Gagal", 404);
    }

    // ── ACTION: PROPOSE ──────────────────────────────────────────────
    if (action === "propose") {
      if (!solution) {
        return errorResponse("Solusi perbaikan wajib diisi", "Validasi gagal", 400);
      }
      if (incident.resolvedAt) {
        return errorResponse("Insiden ini sudah diselesaikan", "Validasi gagal", 400);
      }
      if (incident.resolveStatus === "PENDING_REVIEW") {
        return errorResponse(
          "Sudah ada pengajuan yang sedang menunggu persetujuan Admin",
          "Validasi gagal",
          400
        );
      }
      if (assetStatus && !isStockCondition(assetStatus)) {
        return errorResponse(
          `Status aset tidak valid. Pilihan: ${VALID_RESOLVED_STATUSES.join(", ")}`,
          "Validasi gagal",
          400
        );
      }

      const updated = await db.incident.update({
        where: { id },
        data: {
          resolveStatus: "PENDING_REVIEW",
          pendingSolution: solution,
          pendingAssetStatus: assetStatus || "ACTIVE",
          proposedBy: user.name,
          proposedAt: new Date(),
        },
        include: { asset: { select: { id: true, name: true } } },
      });

      await writeActivityLog(
        ctx,
        "PROPOSE_INCIDENT_RESOLVE",
        `Mengajukan penyelesaian insiden pada aset "${incident.asset.name}" (ID: ${incident.asset.id}). Solusi: ${solution}`,
        request
      );

      return successResponse(updated, "Pengajuan penyelesaian berhasil dikirim, menunggu persetujuan Admin");
    }

    // ── ACTION: APPROVE ──────────────────────────────────────────────
    if (action === "approve") {
      if (!isAdminRole(user.role)) {
        return errorResponse("Akses ditolak", "Hanya Admin yang dapat menyetujui penyelesaian insiden", 403);
      }
      if (incident.resolveStatus !== "PENDING_REVIEW") {
        return errorResponse(
          "Tidak ada pengajuan penyelesaian yang perlu disetujui",
          "Validasi gagal",
          400
        );
      }
      if (BAP_LOCKED_STATUSES.includes(incident.asset.status)) {
        return errorResponse(
          `Aset dengan status "${incident.asset.status}" sedang terkunci proses BAP. ` +
          "Selesaikan proses BAP terlebih dahulu.",
          "Aset terkunci",
          400
        );
      }

      // pendingSolution wajib terisi saat resolveStatus = PENDING_REVIEW.
      // Bila null, data tidak konsisten — jangan diam-diam menyimpan solusi kosong.
      if (!incident.pendingSolution) {
        return errorResponse(
          "Data pengajuan tidak lengkap (solusi kosong). Minta pengaju untuk mengirim ulang.",
          "Validasi gagal",
          409
        );
      }

      const finalSolution = incident.pendingSolution;
      const finalAssetStatus: StockCondition = isStockCondition(
        incident.pendingAssetStatus
      )
        ? incident.pendingAssetStatus
        : "ACTIVE";

      // Pcs yang dilaporkan rusak pindah dari bucket Rusak ke bucket tujuan.
      // Target BROKEN berarti pcs tetap di tempatnya (pemindahan nol).
      const nextStock = moveStock(
        incident.asset,
        "brokenQty",
        STOCK_BUCKET_BY_CONDITION[finalAssetStatus],
        incident.quantity
      );

      const [updatedIncident] = await db.$transaction([
        db.incident.update({
          where: { id },
          data: {
            solution: finalSolution,
            resolveStatus: "APPROVED",
            resolvedAt: new Date(),
            handledBy: user.name,
            // Bersihkan field pending
            pendingSolution: null,
            pendingAssetStatus: null,
          },
          include: { asset: { select: { id: true, name: true } } },
        }),
        db.asset.update({
          where: { id: incident.assetId },
          data: stockUpdateData(nextStock),
        }),
      ]);

      await writeActivityLog(
        ctx,
        "APPROVE_INCIDENT_RESOLVE",
        `Menyetujui penyelesaian insiden ${incident.quantity} pcs pada aset "${incident.asset.name}" ` +
          `(ID: ${incident.asset.id}) dengan kondisi ${finalAssetStatus}. Solusi: ${finalSolution}`,
        request
      );

      return successResponse(
        updatedIncident,
        `Pengajuan penyelesaian berhasil disetujui. Stok aktif: ${nextStock.activeQty} dari ${nextStock.quantity} pcs.`
      );
    }

    // ── ACTION: REJECT ───────────────────────────────────────────────
    if (action === "reject") {
      if (!isAdminRole(user.role)) {
        return errorResponse("Akses ditolak", "Hanya Admin yang dapat menolak pengajuan penyelesaian", 403);
      }
      if (incident.resolveStatus !== "PENDING_REVIEW") {
        return errorResponse(
          "Tidak ada pengajuan penyelesaian yang perlu ditolak",
          "Validasi gagal",
          400
        );
      }

      const updated = await db.incident.update({
        where: { id },
        data: {
          resolveStatus: "REJECTED",
          pendingSolution: null,
          pendingAssetStatus: null,
          proposedBy: null,
          proposedAt: null,
        },
        include: { asset: { select: { id: true, name: true } } },
      });

      await writeActivityLog(
        ctx,
        "REJECT_INCIDENT_RESOLVE",
        `Menolak pengajuan penyelesaian insiden pada aset "${incident.asset.name}" (ID: ${incident.asset.id})`,
        request
      );

      return successResponse(updated, "Pengajuan penyelesaian ditolak, insiden dapat diajukan kembali");
    }

    // ── ACTION: RESOLVE (Admin langsung) ────────────────────────────
    if (action === "resolve" || !action) {
      if (!isAdminRole(user.role)) {
        return errorResponse(
          "Akses ditolak",
          "Hanya Admin yang dapat langsung menyelesaikan insiden",
          403
        );
      }
      if (!solution) {
        return errorResponse("Solusi perbaikan wajib diisi", "Validasi gagal", 400);
      }
      if (incident.resolvedAt) {
        return errorResponse("Insiden ini sudah diselesaikan sebelumnya", "Validasi gagal", 400);
      }
      if (assetStatus && !isStockCondition(assetStatus)) {
        return errorResponse(
          `Status aset tidak valid. Pilihan: ${VALID_RESOLVED_STATUSES.join(", ")}`,
          "Validasi gagal",
          400
        );
      }
      if (assetStatus && BAP_LOCKED_STATUSES.includes(incident.asset.status)) {
        return errorResponse(
          `Aset dengan status "${incident.asset.status}" sedang terkunci proses BAP. ` +
          "Selesaikan proses BAP terlebih dahulu.",
          "Aset terkunci",
          400
        );
      }

      // Tanpa `assetStatus`, insiden ditutup tanpa memindahkan stok — pcs tetap
      // berada di bucket Rusak sampai ada keputusan kondisi akhirnya.
      const nextStock = isStockCondition(assetStatus)
        ? moveStock(
            incident.asset,
            "brokenQty",
            STOCK_BUCKET_BY_CONDITION[assetStatus],
            incident.quantity
          )
        : null;

      const [updatedIncident] = await db.$transaction([
        db.incident.update({
          where: { id },
          data: {
            solution,
            resolveStatus: "APPROVED",
            resolvedAt: new Date(),
            handledBy: user.name,
            pendingSolution: null,
            pendingAssetStatus: null,
          },
          include: { asset: { select: { id: true, name: true } } },
        }),
        ...(nextStock
          ? [
              db.asset.update({
                where: { id: incident.assetId },
                data: stockUpdateData(nextStock),
              }),
            ]
          : []),
      ]);

      await writeActivityLog(
        ctx,
        "RESOLVE_INCIDENT",
        `Menyelesaikan insiden ${incident.quantity} pcs pada aset "${incident.asset.name}" ` +
          `(ID: ${incident.asset.id})${assetStatus ? ` dengan kondisi ${assetStatus}` : ""}. Solusi: ${solution}`,
        request
      );

      return successResponse(
        updatedIncident,
        nextStock
          ? `Insiden berhasil diselesaikan. Stok aktif: ${nextStock.activeQty} dari ${nextStock.quantity} pcs.`
          : "Insiden berhasil diselesaikan"
      );
    }

    return errorResponse("Action tidak dikenali. Gunakan: propose | approve | reject | resolve", "Validasi gagal", 400);

  } catch (error) {
    console.error("Incident PUT error:", error);
    return errorResponse("Terjadi kesalahan server", "Gagal memproses permintaan", 500);
  }
}

// DELETE /api/incidents/[id] — Hapus catatan insiden (SUPER_ADMIN only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireUserScope(request);
    if (!ctx.ok) return ctx.response;
    const { db, scope, user } = ctx;

    if (!isSuperAdmin(user.role)) {
      return errorResponse(
        "Akses ditolak",
        "Hanya Super Admin yang dapat menghapus catatan insiden",
        403
      );
    }

    const { id } = await params;

    const existingIncident = await db.incident.findUnique({
      where: { id },
      include: {
        asset: {
          select: { divisionId: true, branchId: true, name: true, ...STOCK_SELECT },
        },
      },
    });

    if (!existingIncident) {
      return errorResponse("Insiden tidak ditemukan", "Gagal", 404);
    }

    // Cek akses divisi & outlet. Endpoint ini dibatasi SUPER_ADMIN (lintas
    // divisi & outlet di organisasinya), namun pemeriksaan tetap dipertahankan
    // agar aturan tidak hilang bila kelak aksesnya diperluas.
    const accessError = assetAccessError(scope, existingIncident.asset);
    if (accessError) {
      return errorResponse(accessError.error, accessError.message, 403);
    }

    // Menghapus insiden yang BELUM diselesaikan wajib mengembalikan pcs yang
    // sempat ditandai rusak ke stok aktif — kalau tidak, stok rusak menggantung
    // tanpa tiket dan invariant total stok jadi menyesatkan. Insiden yang sudah
    // selesai tidak memindahkan apa pun: pcs-nya sudah dipindah saat resolusi.
    const restoredStock = existingIncident.resolvedAt
      ? null
      : moveStock(
          existingIncident.asset,
          "brokenQty",
          "activeQty",
          existingIncident.quantity
        );

    await db.$transaction([
      db.incident.delete({ where: { id } }),
      ...(restoredStock
        ? [
            db.asset.update({
              where: { id: existingIncident.assetId },
              data: stockUpdateData(restoredStock),
            }),
          ]
        : []),
    ]);

    await writeActivityLog(
      ctx,
      "DELETE_INCIDENT",
      `Menghapus riwayat insiden kerusakan pada aset "${existingIncident.asset.name}" (ID Insiden: ${id})` +
        (restoredStock ? `. ${existingIncident.quantity} pcs dikembalikan ke stok aktif` : ""),
      request
    );

    return successResponse(null, "Insiden berhasil dihapus");
  } catch (error) {
    console.error("Delete incident error:", error);
    return errorResponse("Terjadi kesalahan server", "Gagal menghapus insiden", 500);
  }
}
