import fs from "fs/promises";
import path from "path";

/**
 * Penyimpanan berkas unggahan (dokumen BAP) — sengaja DI LUAR `public/` agar
 * tidak pernah dilayani Next.js sebagai berkas statis tanpa cek akses. URL
 * `/uploads/<rel>` dipetakan ke `<UPLOAD_ROOT>/<rel>` dan hanya dilayani
 * `src/app/api/uploads/[...path]/route.ts` (lihat rewrite di next.config.ts).
 * `UPLOAD_DIR` dipakai kontainer produksi untuk menunjuk ke volume data.
 */
// Isi volume unggahan disediakan saat runtime, bukan dibundel ke output build.
export const UPLOAD_ROOT = path.resolve(/* turbopackIgnore: true */ process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads"));

/** Lokasi lama (≤ 2.1.0) — hanya DIBACA agar dokumen lama tetap terbuka, tidak pernah ditulis. */
const LEGACY_UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads");

/** Satu-satunya bentuk `Bap.fileUrl` yang ditulis server: `/uploads/bap/YYYY/MM/<uuid>.(pdf|webp)`. */
export const BAP_FILE_URL_PATTERN = /^\/uploads\/bap\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.(pdf|webp)$/;

export const UPLOAD_CONTENT_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".webp": "image/webp",
};

/** Pemeriksaan byte dasar; MIME/ekstensi dari klien bukan bukti isi dokumen. */
export function isPdfDocument(data: Buffer): boolean {
  return /^%PDF-\d\.\d[\r\n]/.test(data.subarray(0, 10).toString("latin1")) &&
    /%%EOF\s*$/.test(data.subarray(-1024).toString("latin1"));
}

/** Batasi keseluruhan multipart sebelum formData() mengalokasikan berkas. */
export async function readBapForm(request: Request, maxBytes = 6 * 1024 * 1024): Promise<FormData> {
  if (Number(request.headers.get("content-length")) > maxBytes) throw new Error("BAP_BODY_TOO_LARGE");
  if (!request.body) throw new Error("BAP_INVALID_FORM");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new Error("BAP_BODY_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    const body = new Uint8Array(Buffer.concat(chunks, size));
    return await new Request(request.url, {
      method: "POST",
      headers: { "Content-Type": request.headers.get("content-type") || "" },
      body,
    }).formData();
  } catch {
    throw new Error("BAP_INVALID_FORM");
  }
}

/**
 * Path absolut sebuah `/uploads/...` di bawah `root`. Melempar bila hasilnya
 * keluar dari `root` — penjaga terakhir terhadap path traversal.
 */
export function uploadPath(fileUrl: string, root: string = UPLOAD_ROOT): string {
  const relative = fileUrl.replace(/^\/uploads\//, "");
  const resolved = path.resolve(root, relative);
  if (!resolved.startsWith(root + path.sep)) {
    throw new Error(`Path unggahan di luar direktori penyimpanan: ${fileUrl}`);
  }
  return resolved;
}

/** Isi berkas unggahan, atau `null` bila tidak ada di lokasi baru maupun lama. */
export async function readUpload(fileUrl: string): Promise<Buffer | null> {
  for (const root of [UPLOAD_ROOT, LEGACY_UPLOAD_ROOT]) {
    try {
      return await fs.readFile(/* turbopackIgnore: true */ uploadPath(fileUrl, root));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }
  return null;
}
