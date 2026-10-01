import { mdmDisabledResponse } from "@/lib/mdm";

export const dynamic = "force-dynamic";

// Fitur MDM dinonaktifkan selama Fase 1 — lihat src/lib/mdm.ts.
// Implementasi lama tersedia di riwayat git (commit sebelum Fase 1).
export async function POST() {
  return mdmDisabledResponse();
}
