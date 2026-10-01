import fs from "fs/promises";
import path from "path";

/**
 * Penyimpanan berkas unggahan (dokumen BAP) — sengaja DI LUAR `public/` agar
 * tidak pernah dilayani Next.js sebagai berkas statis tanpa cek akses. URL
 * `/uploads/<rel>` dipetakan ke `<UPLOAD_ROOT>/<rel>` dan hanya dilayani
 * `src/app/api/uploads/[...path]/route.ts` (lihat rewrite di next.config.ts).
 * `UPLOAD_DIR` dipakai kontainer produksi untuk menunjuk ke volume data.
 */
export const UPLOAD_ROOT = path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads"));

/** Lokasi lama (≤ 2.1.0) — hanya DIBACA agar dokumen lama tetap terbuka, tidak pernah ditulis. */
const LEGACY_UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads");

/** Satu-satunya bentuk `Bap.fileUrl` yang ditulis server: `/uploads/bap/YYYY/MM/<uuid>.(pdf|webp)`. */
export const BAP_FILE_URL_PATTERN = /^\/uploads\/bap\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.(pdf|webp)$/;

export const UPLOAD_CONTENT_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".webp": "image/webp",
};

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
      return await fs.readFile(uploadPath(fileUrl, root));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }
  return null;
}
