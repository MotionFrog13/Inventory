import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { tenantDb, type TenantDb } from "./tenant-db";
import { signToken, verifyToken } from "./jwt";
import type { JwtPayload } from "./jwt";
import { UNASSIGNED_MESSAGE, resolveScope, type UserScope } from "./scope";
import { errorResponse } from "./utils";

// Sengaja TIDAK me-reexport `prisma` maupun `tenantDb`: keduanya hanya boleh
// dipakai di balik pengecekan akses di bawah (lihat eslint.config.mjs).
export { signToken, verifyToken };
export type { JwtPayload, TenantDb };

/** Kolom pengguna yang dibaca SETIAP request — sumber cakupan divisi & outlet. */
const SESSION_USER_SELECT = {
  id: true,
  organizationId: true,
  username: true,
  name: true,
  email: true,
  role: true,
  divisionId: true,
  division: { select: { id: true, name: true } },
  branches: {
    select: { branch: { select: { id: true, name: true } } },
    orderBy: { branch: { name: "asc" } },
  },
  organization: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.UserSelect;

export interface SessionUser {
  id: string;
  organizationId: string;
  username: string;
  name: string;
  email: string | null;
  role: string;
  divisionId: string | null;
  division: { id: string; name: string } | null;
  branches: { id: string; name: string }[];
  organization: { id: string; name: string; slug: string };
}

/** Konteks request terautentikasi: satu-satunya jalan memperoleh `db`. */
export interface RequestContext {
  db: TenantDb;
  scope: UserScope;
  user: SessionUser;
}

/**
 * Muat pengguna dari DATABASE. `organizationId` ikut disaring: token yang
 * membawa organisasi berbeda dari baris pengguna diperlakukan tidak valid.
 */
async function loadSessionUser(userId: string, organizationId: string): Promise<SessionUser | null> {
  const row = await prisma.user.findFirst({
    where: { id: userId, organizationId },
    select: SESSION_USER_SELECT,
  });
  if (!row) return null;
  return { ...row, branches: row.branches.map((link) => link.branch) };
}

/** Ambil token JWT dari cookie HttpOnly (async di Next.js 16). */
export async function getTokenFromCookies(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    return cookieStore.get("token")?.value ?? null;
  } catch {
    // cookies() melempar saat build/prerender statis
    return null;
  }
}

/**
 * Pengguna sesi dari cookie — dipakai `/api/auth/me` dan halaman. TIDAK
 * memeriksa penugasan; gunakan `getPageContext()` untuk membaca data.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = await getTokenFromCookies();
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload?.organizationId) return null;
  try {
    return await loadSessionUser(payload.userId, payload.organizationId);
  } catch {
    return null;
  }
}

/**
 * Konteks untuk halaman server. `null` = tidak terautentikasi ATAU belum
 * ditugaskan — halaman merender `<AccessDenied />` (middleware sudah
 * mengalihkan pengguna tanpa cookie ke /login).
 */
export async function getPageContext(): Promise<RequestContext | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const scope = resolveScope(user);
  if (!scope) return null;
  return { db: tenantDb(user.organizationId), scope, user };
}

/**
 * Identitas dari header yang diisi middleware (src/proxy.ts). Header ini
 * dibuang dari setiap request masuk sebelum diisi, sehingga tidak dapat
 * dipalsukan klien.
 */
export function getAuthUser(request: NextRequest): {
  userId: string;
  organizationId: string;
  role: string;
  name: string;
  username: string;
} | null {
  const userId = request.headers.get("x-user-id");
  const organizationId = request.headers.get("x-user-org");
  const role = request.headers.get("x-user-role");
  const name = request.headers.get("x-user-name");
  const username = request.headers.get("x-user-username");
  if (!userId || !organizationId || !role || !name) return null;
  return { userId, organizationId, role, name, username: username || "" };
}

/**
 * Konteks untuk route handler, dibaca dari DATABASE setiap request sehingga
 * perubahan peran/penugasan langsung berlaku tanpa menunggu token kedaluwarsa.
 *
 * ```ts
 * const ctx = await requireUserScope(request);
 * if (!ctx.ok) return ctx.response;
 * const { db, scope, user } = ctx;
 * ```
 */
export async function requireUserScope(
  request: NextRequest
): Promise<({ ok: true } & RequestContext) | { ok: false; response: Response }> {
  const authUser = getAuthUser(request);
  if (!authUser) {
    return { ok: false, response: errorResponse("Unauthorized", "Token tidak valid", 401) };
  }

  const user = await loadSessionUser(authUser.userId, authUser.organizationId);
  if (!user) {
    return { ok: false, response: errorResponse("Unauthorized", "User tidak ditemukan di database", 401) };
  }

  const scope = resolveScope(user);
  if (!scope) {
    return { ok: false, response: errorResponse("Akses ditolak", UNASSIGNED_MESSAGE, 403) };
  }

  return { ok: true, db: tenantDb(user.organizationId), scope, user };
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
