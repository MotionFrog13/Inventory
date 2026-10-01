import { Prisma } from "@prisma/client";

// Kode galat Prisma yang dipetakan route ke respons 4xx. Dipisah dari
// utils.ts karena modul itu juga diimpor komponen klien.

/** Pelanggaran unique constraint (mis. nama divisi ganda) → 409. */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** Pelanggaran foreign key (mis. referensi lintas organisasi). */
export function isForeignKeyViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003";
}

/** Baris yang diubah/dihapus tidak ditemukan dalam cakupan client. */
export function isRecordNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}
