import { STOCK_CONDITIONS } from "./stock";

/**
 * Format a UTC date to WIB (UTC+7) date string
 * Example: "20 Jun 2026"
 */
export function formatDate(date: Date | string | null): string {
  if (!date) return "-";
  const d = new Date(date);
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

/**
 * Format a UTC date to WIB (UTC+7) datetime string
 * Example: "20 Jun 2026, 14:30 WIB"
 */
export function formatDateTime(date: Date | string | null): string {
  if (!date) return "-";
  const d = new Date(date);
  const formatted = d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
  return `${formatted} WIB`;
}

/**
 * Calculate days until warranty expires
 * Returns negative number if already expired
 */
export function daysUntilWarrantyExpires(warrantyDate: Date | string | null): number | null {
  if (!warrantyDate) return null;
  const now = new Date();
  const warranty = new Date(warrantyDate);
  const diffTime = warranty.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Get warranty status class based on days remaining
 */
export function getWarrantyStatusClass(daysRemaining: number | null): string {
  if (daysRemaining === null) return "";
  if (daysRemaining <= 0) return "warranty-expired";
  if (daysRemaining <= 30) return "warranty-critical";
  if (daysRemaining <= 90) return "warranty-warning";
  return "warranty-safe";
}

/**
 * Merge class names (simple utility)
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * Replacer JSON yang mengubah BigInt menjadi string.
 *
 * Prisma memetakan kolom `BigInt` (mis. `MdmDevice.storageTotal` /
 * `storageUsed`) ke tipe BigInt JavaScript, dan `JSON.stringify` melempar
 * `TypeError: Do not know how to serialize a BigInt` untuk nilai tersebut.
 * Tanpa replacer ini, setiap endpoint yang menyertakan data MDM — termasuk
 * `GET /api/assets/[id]` untuk aset IT yang sudah check-in — membalas 500.
 * String dipilih (bukan Number) agar nilai byte tidak kehilangan presisi.
 */
function bigintReplacer(_key: string, value: unknown) {
  return typeof value === "bigint" ? value.toString() : value;
}

/**
 * Standard success API response
 */
export function successResponse(data: unknown, message = "Berhasil", status = 200) {
  return new Response(
    JSON.stringify({ success: true, data, message }, bigintReplacer),
    { status, headers: { "Content-Type": "application/json" } }
  );
}

/**
 * Standard error API response
 */
export function errorResponse(error: string, message = "Gagal", status = 400) {
  return Response.json(
    { success: false, error, message },
    { status }
  );
}

/**
 * Parse & clamp parameter paginasi dari query string.
 *
 * Tanpa clamping, `?page=abc` menghasilkan `skip: NaN` dan `?page=0`
 * menghasilkan `skip` negatif — keduanya membuat Prisma melempar error
 * sehingga endpoint membalas 500, bukan 400. `limit` juga dibatasi agar
 * satu request tidak dapat memindai seluruh tabel.
 */
export function parsePagination(
  searchParams: URLSearchParams,
  { defaultLimit = 20, maxLimit = 100 } = {}
): { page: number; limit: number; skip: number } {
  const rawPage = parseInt(searchParams.get("page") || "1", 10);
  const rawLimit = parseInt(searchParams.get("limit") || String(defaultLimit), 10);

  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, maxLimit)
      : defaultLimit;

  return { page, limit, skip: (page - 1) * limit };
}

/**
 * Check if a role can manage users and branches (create/delete)
 */
export function isSuperAdmin(role?: string | null): boolean {
  return role === "SUPER_ADMIN";
}

/**
 * Status aset yang boleh diset langsung lewat form tambah/edit aset maupun
 * `POST`/`PUT /api/assets`. `BAP_PENDING` dan `BAP` sengaja DIKECUALIKAN —
 * keduanya hanya boleh dicapai melalui alur pengajuan & persetujuan BAP
 * (CLAUDE.md §4.B) agar dokumen dan approval tidak dapat dilewati.
 *
 * Diturunkan dari `STOCK_CONDITIONS` supaya daftar ini tidak pernah menyimpang
 * dari bucket stok yang benar-benar tersedia (src/lib/stock.ts).
 */
export const EDITABLE_ASSET_STATUSES: string[] = [...STOCK_CONDITIONS];

/**
 * Status aset yang boleh dipilih saat menyelesaikan insiden (CLAUDE.md §4.E).
 * Dipakai bersama oleh halaman Insiden dan modal di halaman Detail Aset
 * agar kedua titik masuk selalu menawarkan pilihan yang identik.
 */
export const INCIDENT_RESOLVE_STATUSES = [
  { value: "ACTIVE", label: "Aktif (Sudah Normal)" },
  { value: "REPAIR", label: "Dalam Perbaikan (REPAIR)" },
  { value: "RETIRED", label: "Tidak Digunakan (RETIRED)" },
  { value: "BROKEN", label: "Tetap Rusak (BROKEN)" },
];

/**
 * Map AssetStatus enum to human-readable Indonesian label
 */
export const ASSET_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Aktif",
  BROKEN: "Rusak",
  REPAIR: "Perbaikan",
  RETIRED: "Tidak Digunakan",
  BAP_PENDING: "BAP Diajukan",
  BAP: "BAP Disetujui",
};

/**
 * Map AssetStatus to badge color classes
 */
export const ASSET_STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700 border border-emerald-200/60",
  BROKEN: "bg-rose-50 text-rose-700 border border-rose-200/60",
  REPAIR: "bg-amber-50 text-amber-700 border border-amber-200/60",
  RETIRED: "bg-slate-100 text-slate-700 border border-slate-200",
  BAP_PENDING: "bg-violet-50 text-violet-700 border border-violet-200/60",
  BAP: "bg-red-50 text-red-700 border border-red-200/60",
};

/**
 * Kelas badge default saat status tidak dikenali
 */
export const STATUS_COLOR_FALLBACK =
  "bg-slate-100 text-slate-700 border border-slate-200";

/**
 * Map TransferStatus to badge color classes
 */
export const TRANSFER_STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700 border border-amber-200/60",
  APPROVED: "bg-emerald-50 text-emerald-700 border border-emerald-200/60",
  REJECTED: "bg-rose-50 text-rose-700 border border-rose-200/60",
};

/**
 * Map TransferStatus to human-readable Indonesian label
 */
export const TRANSFER_STATUS_LABELS: Record<string, string> = {
  PENDING: "Menunggu",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
};

/**
 * Tiga tingkat peran. Divisi TIDAK lagi dikodekan di dalam peran — divisi
 * adalah data (`User.divisionId`) yang dikelola Super Admin.
 */
export const VALID_ROLES = ["SUPER_ADMIN", "DIVISION_ADMIN", "DIVISION_STAFF"] as const;
export type RoleTier = (typeof VALID_ROLES)[number];

/** Label tingkat peran untuk pilihan di form (tanpa nama divisi). */
export const ROLE_TIER_LABELS: Record<RoleTier, string> = {
  SUPER_ADMIN: "Super Admin",
  DIVISION_ADMIN: "Admin Divisi",
  DIVISION_STAFF: "Staf Divisi",
};

/**
 * Label peran lengkap: "Super Admin", "Admin Kitchen", "Staf Engineering".
 * Akun yang belum punya divisi tampil generik.
 */
export function roleLabel(role: string, divisionName?: string | null): string {
  if (role === "SUPER_ADMIN") return ROLE_TIER_LABELS.SUPER_ADMIN;
  if (role === "DIVISION_ADMIN") {
    return divisionName ? `Admin ${divisionName}` : ROLE_TIER_LABELS.DIVISION_ADMIN;
  }
  if (role === "DIVISION_STAFF") {
    return divisionName ? `Staf ${divisionName}` : ROLE_TIER_LABELS.DIVISION_STAFF;
  }
  return role;
}

/** Tingkat admin: boleh mengelola aset dan menyetujui/menolak pengajuan. */
export function isAdminRole(role?: string | null): boolean {
  return role === "SUPER_ADMIN" || role === "DIVISION_ADMIN";
}

/** Username: huruf kecil, angka, titik, garis bawah, tanda hubung — tanpa "@". */
export const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;
/** Kode organisasi (slug) untuk login mode SaaS. */
export const ORG_SLUG_PATTERN = /^[a-z0-9-]{3,32}$/;

export function isValidUsername(value: unknown): value is string {
  return typeof value === "string" && USERNAME_PATTERN.test(value);
}

export function isValidOrgSlug(value: unknown): value is string {
  return typeof value === "string" && ORG_SLUG_PATTERN.test(value);
}

/** Email disimpan huruf kecil tanpa spasi; string kosong berarti "tidak ada". */
export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email === "" ? null : email;
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Nama divisi/kategori: spasi dirapikan, 1–`maxLength` karakter. `null` bila
 * tidak valid agar pemanggil membalas 400.
 */
export function normalizeName(value: unknown, maxLength = 60): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/\s+/g, " ");
  return name.length === 0 || name.length > maxLength ? null : name;
}

/**
 * Bentuk data sesi yang dikirim `/api/auth/me` ke komponen klien (Sidebar,
 * Header, form). Didefinisikan di sini karena src/lib/auth.ts tidak boleh
 * diimpor dari komponen klien.
 */
export interface SessionUserView {
  id: string;
  username: string;
  name: string;
  email: string | null;
  role: string;
  roleLabel: string;
  organization: { id: string; name: string; slug: string };
  division: { id: string; name: string } | null;
  branches: { id: string; name: string }[];
  access: "ok" | "unassigned";
}

/** "Kitchen", atau "Semua Divisi" untuk SUPER_ADMIN. */
export function divisionScopeLabel(user: { division: { name: string } | null }): string {
  return user.division?.name ?? "Semua Divisi";
}

/**
 * Cakupan wilayah untuk subtitle halaman — angka pada kartu tidak boleh salah
 * dibaca sebagai angka seluruh organisasi ketika pengguna terikat outlet.
 */
export function branchScopeLabel(user: {
  role: string;
  branches: { name: string }[];
  organization: { name: string };
}): string {
  if (isSuperAdmin(user.role)) return `seluruh cabang ${user.organization.name}`;
  if (user.branches.length === 1) return `outlet ${user.branches[0].name}`;
  return `${user.branches.length} outlet (${user.branches.map((b) => b.name).join(", ")})`;
}
