import type { Prisma } from "@prisma/client";
import type { TenantDb } from "./tenant-db";
import { roleLabel } from "./utils";

/** Kolom pengguna yang aman dikirim ke klien (tanpa hash password). */
export const USER_PUBLIC_SELECT = {
  id: true,
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
  createdAt: true,
} satisfies Prisma.UserSelect;

type PublicUserRow = Prisma.UserGetPayload<{ select: typeof USER_PUBLIC_SELECT }>;

export function toPublicUser(row: PublicUserRow) {
  return {
    ...row,
    branches: row.branches.map((link) => link.branch),
    roleLabel: roleLabel(row.role, row.division?.name),
  };
}

/**
 * Pastikan divisi & outlet penugasan ada di organisasi pengguna. Client tenant
 * membuat ID milik organisasi lain "tidak ditemukan" → 400.
 */
export async function assignmentRefsError(
  db: TenantDb,
  divisionId: string | null,
  branchIds: string[]
): Promise<string | null> {
  if (divisionId) {
    const division = await db.division.findUnique({ where: { id: divisionId }, select: { id: true } });
    if (!division) return "Divisi tidak ditemukan";
  }
  if (branchIds.length > 0) {
    const found = await db.branch.count({ where: { id: { in: branchIds } } });
    if (found !== branchIds.length) return "Outlet tidak ditemukan";
  }
  return null;
}
