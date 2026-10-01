import { errorResponse } from "./utils";

/**
 * MDM dinonaktifkan pada Fase 1: token aktivasi global tidak aman untuk
 * multi-tenant (perangkat organisasi A bisa terdaftar ke aset organisasi B).
 * Desain ulang (aktivasi & token per divisi, agent) dijadwalkan terpisah —
 * lihat docs/superpowers/specs/2026-09-29-fase1-multi-tenant-divisi-dinamis-design.md §10.
 * Kode lama tersedia di riwayat git sebagai referensi.
 */
export function mdmDisabledResponse(): Response {
  return errorResponse("Not Found", "Fitur MDM dinonaktifkan sementara", 404);
}
