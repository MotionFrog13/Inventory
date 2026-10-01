import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Izinkan file upload lebih besar untuk BAP documents (default 4MB)
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  // Middleware file (proxy.ts sebagai middleware Next.js)
  // Catatan: file middleware harus bernama middleware.ts di root src/

  // Kontainer dev (docker/compose.dev.yml): Docker Desktop di Windows/macOS tidak
  // meneruskan event perubahan file dari bind mount, sehingga hot reload memakai
  // polling (dipakai watcher webpack — lihat docker/entrypoint.sh). Tanpa env ini
  // (dev biasa di host) watcher bawaan tetap dipakai.
  watchOptions: {
    pollIntervalMs: Number(process.env.WATCH_POLL_INTERVAL_MS) || undefined,
  },

  // Dokumen BAP (`Bap.fileUrl` = /uploads/...) dilayani route ber-cek-akses.
  // `beforeFiles` berjalan sebelum berkas statis, sehingga /uploads/* tidak
  // pernah jatuh ke public/ — termasuk sisa unggahan lama di public/uploads.
  async rewrites() {
    return {
      beforeFiles: [{ source: "/uploads/:path*", destination: "/api/uploads/:path*" }],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
// Force reload config
