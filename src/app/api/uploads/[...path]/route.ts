import { NextRequest } from "next/server";
import path from "path";
import { errorResponse } from "@/lib/utils";
import { assetAccessDenied } from "@/lib/scope";
import { requireUserScope } from "@/lib/auth";
import { BAP_FILE_URL_PATTERN, UPLOAD_CONTENT_TYPES, readUpload } from "@/lib/uploads";

export const dynamic = "force-dynamic";

// GET /api/uploads/[...path] — dokumen BAP, dibuka lewat URL `/uploads/...`
// yang tersimpan di `Bap.fileUrl` (rewrite di next.config.ts).
// Akses: pengguna yang boleh melihat aset pemilik BAP (organisasi, divisi, outlet).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const ctx = await requireUserScope(request);
    if (!ctx.ok) return ctx.response;
    const { db, scope } = ctx;

    const { path: segments } = await params;
    const fileUrl = `/uploads/${segments.join("/")}`;
    // Bentuk di luar pola (termasuk upaya `..`) tidak mungkin milik BAP mana pun.
    if (!BAP_FILE_URL_PATTERN.test(fileUrl)) {
      return errorResponse("Dokumen tidak ditemukan", "Gagal", 404);
    }

    // Dokumen milik organisasi lain tidak terlihat oleh client tenant → 404.
    const bap = await db.bap.findFirst({
      where: { fileUrl },
      select: { asset: { select: { divisionId: true, branchId: true } } },
    });
    if (!bap) {
      return errorResponse("Dokumen tidak ditemukan", "Gagal", 404);
    }

    const denied = assetAccessDenied(scope, bap.asset);
    if (denied) return denied;

    const file = await readUpload(fileUrl);
    if (!file) {
      return errorResponse("Berkas dokumen tidak ditemukan di penyimpanan", "Gagal", 404);
    }

    const filename = path.posix.basename(fileUrl);
    return new Response(new Uint8Array(file), {
      headers: {
        "Content-Type": UPLOAD_CONTENT_TYPES[path.posix.extname(filename)],
        "Content-Length": String(file.byteLength),
        "Content-Disposition": `inline; filename="${filename}"`,
        // Dokumen bukti terikat hak akses — jangan disimpan cache bersama/proxy.
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Serve upload error:", error);
    return errorResponse("Terjadi kesalahan server", "Gagal memuat dokumen", 500);
  }
}
