// Hanya tipe — menjaga modul ini tetap ringan sehingga aman diimpor dari
// komponen klien maupun server tanpa menyeret Prisma ke bundle browser.
import type { Prisma } from "@prisma/client";
import { errorResponse, isSuperAdmin } from "./utils";

/**
 * Cakupan data satu pengguna — sumber kebenaran tunggal untuk TIGA sumbu
 * pembatasan yang berlaku bersamaan:
 *
 *   1. Organisasi (`organizationId`) — ditegakkan client tenant
 *      (src/lib/tenant-db.ts); helper di file ini TIDAK menambahkannya lagi.
 *   2. Divisi     (`divisionId`)
 *   3. Outlet     (`branchIds`)
 *
 * `null` pada divisi/outlet berarti "tanpa batasan pada sumbu itu" dan hanya
 * SUPER_ADMIN yang memperolehnya. Peran lain tanpa divisi atau tanpa outlet
 * ditolak di `resolveScope()` — bukan diperlakukan sebagai akses penuh.
 */
export interface UserScope {
  organizationId: string;
  divisionId: string | null;
  branchIds: string[] | null;
}

/**
 * Identitas minimum untuk menurunkan cakupan. Isi dengan data dari DATABASE
 * (lihat requireUserScope()/getPageContext() di src/lib/auth.ts), bukan dari
 * payload JWT yang membeku saat login.
 */
export interface ScopedIdentity {
  role: string;
  organizationId: string;
  divisionId: string | null;
  branches: { id: string }[];
}

export const UNASSIGNED_MESSAGE =
  "Akun Anda belum ditugaskan ke divisi dan outlet. Hubungi Super Admin.";

const CROSS_DIVISION_ERROR = "Unauthorized cross-division access detected.";
const CROSS_BRANCH_ERROR = "Unauthorized cross-branch access detected.";

/**
 * Turunkan cakupan data dari identitas pengguna. `null` = akses DITOLAK
 * (fail closed) — pemanggil wajib memperlakukannya sebagai penolakan.
 */
export function resolveScope(user: ScopedIdentity): UserScope | null {
  if (isSuperAdmin(user.role)) {
    return { organizationId: user.organizationId, divisionId: null, branchIds: null };
  }

  // Peran yang tidak dikenal (mis. token lama "ADMIN_IT") tidak pernah
  // memperoleh cakupan apa pun.
  if (user.role !== "DIVISION_ADMIN" && user.role !== "DIVISION_STAFF") return null;

  const branchIds = user.branches.map((branch) => branch.id);
  if (!user.divisionId || branchIds.length === 0) return null;

  return { organizationId: user.organizationId, divisionId: user.divisionId, branchIds };
}

/** Filter Prisma untuk tabel `Asset` — divisi + outlet. */
export function assetScopeWhere(scope: UserScope): Prisma.AssetWhereInput {
  return {
    ...(scope.divisionId ? { divisionId: scope.divisionId } : {}),
    ...(scope.branchIds ? { branchId: { in: scope.branchIds } } : {}),
  };
}

/** Filter untuk tabel yang menggantung pada aset (Incident, Bap). */
export function assetRelationScopeWhere(
  scope: UserScope
): { asset: Prisma.AssetWhereInput } | Record<string, never> {
  const where = assetScopeWhere(scope);
  return Object.keys(where).length > 0 ? { asset: where } : {};
}

/**
 * Filter untuk tabel `Transfer`: divisi lewat aset, outlet pada KEDUA sisi
 * mutasi (keluar dari maupun masuk ke outlet pengguna). Dibungkus `AND` agar
 * `OR` milik pemanggil (mis. pencarian) tidak menimpanya.
 */
export function transferScopeWhere(scope: UserScope): Prisma.TransferWhereInput {
  const parts: Prisma.TransferWhereInput[] = [];
  if (scope.divisionId) parts.push({ asset: { divisionId: scope.divisionId } });
  if (scope.branchIds) {
    parts.push({
      OR: [
        { fromBranchId: { in: scope.branchIds } },
        { toBranchId: { in: scope.branchIds } },
      ],
    });
  }
  return parts.length > 0 ? { AND: parts } : {};
}

/** Boleh MELIHAT transfer bila salah satu sisinya outlet pengguna. */
export function canViewTransfer(
  scope: UserScope,
  transfer: { fromBranchId: string; toBranchId: string }
): boolean {
  if (!scope.branchIds) return true;
  return (
    scope.branchIds.includes(transfer.fromBranchId) ||
    scope.branchIds.includes(transfer.toBranchId)
  );
}

/**
 * Boleh MENYETUJUI/MENOLAK transfer hanya bila outlet ASAL milik pengguna —
 * cabang tujuan tidak boleh menarik aset cabang lain lewat persetujuannya sendiri.
 */
export function canApproveTransfer(scope: UserScope, transfer: { fromBranchId: string }): boolean {
  if (!scope.branchIds) return true;
  return scope.branchIds.includes(transfer.fromBranchId);
}

/** Penolakan bila data milik divisi lain; `null` = diizinkan. */
export function divisionAccessError(
  scope: UserScope,
  divisionId: string
): { error: string; message: string } | null {
  if (scope.divisionId && divisionId !== scope.divisionId) {
    return { error: CROSS_DIVISION_ERROR, message: "Akses ditolak" };
  }
  return null;
}

/**
 * Guard satu aset — memeriksa divisi lalu outlet. Pesan sengaja dibedakan agar
 * log & QA dapat memastikan penolakan berasal dari aturan yang benar.
 */
export function assetAccessError(
  scope: UserScope,
  asset: { divisionId: string; branchId: string }
): { error: string; message: string } | null {
  const division = divisionAccessError(scope, asset.divisionId);
  if (division) return division;
  if (scope.branchIds && !scope.branchIds.includes(asset.branchId)) {
    return { error: CROSS_BRANCH_ERROR, message: "Akses ditolak" };
  }
  return null;
}

/** Versi siap-pakai `assetAccessError()` untuk route handler (403 atau null). */
export function assetAccessDenied(
  scope: UserScope,
  asset: { divisionId: string; branchId: string }
): Response | null {
  const denied = assetAccessError(scope, asset);
  return denied ? errorResponse(denied.error, denied.message, 403) : null;
}

/** Kelola kategori: SUPER_ADMIN, atau DIVISION_ADMIN untuk divisinya sendiri. */
export function canManageCategories(role: string, scope: UserScope, divisionId: string): boolean {
  if (isSuperAdmin(role)) return true;
  return role === "DIVISION_ADMIN" && scope.divisionId === divisionId;
}

/**
 * Validasi penugasan saat membuat/mengubah akun, terhadap peran FINAL:
 *   • SUPER_ADMIN → divisi & outlet SELALU dikosongkan.
 *   • peran lain  → divisi dan minimal satu outlet WAJIB (akun tanpa keduanya
 *     terkunci total). Keberadaan ID dicek pemanggil lewat client tenant.
 */
export function validateAssignment(
  role: string,
  divisionId: unknown,
  branchIds: unknown
): { ok: true; divisionId: string | null; branchIds: string[] } | { ok: false; message: string } {
  if (isSuperAdmin(role)) return { ok: true, divisionId: null, branchIds: [] };

  if (typeof divisionId !== "string" || divisionId.trim() === "") {
    return {
      ok: false,
      message: "Divisi wajib dipilih untuk peran selain Super Admin — akun tanpa divisi tidak dapat mengakses data apa pun.",
    };
  }
  if (
    !Array.isArray(branchIds) ||
    branchIds.length === 0 ||
    branchIds.some((id) => typeof id !== "string" || id.trim() === "")
  ) {
    return {
      ok: false,
      message: "Minimal satu outlet wajib dipilih untuk peran selain Super Admin — akun tanpa outlet tidak dapat mengakses data apa pun.",
    };
  }
  return { ok: true, divisionId, branchIds: [...new Set(branchIds as string[])] };
}

/**
 * Outlet sebagai filter tampilan (`?branchId=`). Nilai dari klien hanya
 * dihormati bila outlet itu milik pengguna; selain itu DIABAIKAN dan pengguna
 * melihat seluruh outletnya — filter UI tidak boleh memperluas akses.
 * `undefined` = tanpa filter (hanya SUPER_ADMIN tanpa pilihan).
 */
export function effectiveBranchFilter(
  scope: UserScope,
  requested?: string | null
): string[] | undefined {
  if (!scope.branchIds) return requested ? [requested] : undefined;
  if (requested && scope.branchIds.includes(requested)) return [requested];
  return scope.branchIds;
}

/** Divisi sebagai filter tampilan (`?divisionId=`) — hanya untuk SUPER_ADMIN. */
export function effectiveDivisionFilter(
  scope: UserScope,
  requested?: string | null
): string | undefined {
  return scope.divisionId ?? (requested || undefined);
}
