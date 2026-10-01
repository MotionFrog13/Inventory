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
};

export default nextConfig;
// Force reload config
