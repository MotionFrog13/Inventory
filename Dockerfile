# syntax=docker/dockerfile:1
#
# Inventory — SATU kontainer berisi PostgreSQL + aplikasi Next.js.
#   target `dev`  : kode di-mount dari host, `next dev` dengan hot reload (docker/compose.dev.yml)
#   target `prod` : hasil `next build`, dijalankan `next start`           (docker/compose.prod.yml)
#                   + Cloudflare Tunnel opsional untuk akses publik tanpa VPS
# Proses di dalam kontainer diatur docker/entrypoint.sh (lihat docs/docker.md).

ARG NODE_VERSION=24
ARG CLOUDFLARED_VERSION=2026.9.3

# Sumber biner cloudflared (statis, multi-arsitektur) untuk target prod.
FROM cloudflare/cloudflared:${CLOUDFLARED_VERSION} AS cloudflared

# ── base: Node.js + PostgreSQL 15 (Debian bookworm) ─────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS base

ENV PG_MAJOR=15
# Paket Debian otomatis membuat klaster "main" — tidak dipakai, PGDATA
# diinisialisasi entrypoint di volume /data.
RUN mkdir -p /etc/postgresql-common \
 && echo "create_main_cluster = false" > /etc/postgresql-common/createcluster.conf \
 && apt-get update \
 && apt-get install -y --no-install-recommends "postgresql-${PG_MAJOR}" gosu tini openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ENV PATH="/usr/lib/postgresql/${PG_MAJOR}/bin:${PATH}" \
    NEXT_TELEMETRY_DISABLED=1 \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    PRISMA_HIDE_UPDATE_MESSAGE=1

COPY docker/entrypoint.sh /usr/local/bin/inventory
COPY docker/healthcheck.sh /usr/local/bin/inventory-healthcheck
# Buang CRLF bila repositori di-checkout di Windows tanpa .gitattributes.
RUN sed -i 's/\r$//' /usr/local/bin/inventory /usr/local/bin/inventory-healthcheck \
 && chmod +x /usr/local/bin/inventory /usr/local/bin/inventory-healthcheck

WORKDIR /app
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 CMD ["inventory-healthcheck"]
ENTRYPOINT ["tini", "--", "inventory"]

# ── dev: source code di-mount dari host ─────────────────────────────────────
FROM base AS dev
ENV NODE_ENV=development
# Volume bernama untuk node_modules & .next mewarisi kepemilikan direktori ini,
# sehingga `npm ci` dan `next dev` (user `node`) dapat menulis ke dalamnya.
RUN mkdir -p /app/node_modules /app/.next && chown node:node /app/node_modules /app/.next
CMD ["dev"]

# ── deps: dependensi lengkap (prisma CLI & ts-node dipakai saat runtime) ────
FROM base AS deps
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma/schema.prisma prisma/schema.prisma
# postinstall menjalankan `prisma generate`.
RUN npm ci --no-audit --no-fund && npm cache clean --force

# ── build: next build ───────────────────────────────────────────────────────
FROM deps AS build
COPY . .
# src/lib/jwt.ts menolak dimuat tanpa JWT_SECRET. Nilai ini hanya hidup selama
# perintah build — tidak tersimpan di image; rahasia produksi dibuat entrypoint.
RUN JWT_SECRET=build-only-placeholder npm run build && rm -rf .next/cache

# ── prod ────────────────────────────────────────────────────────────────────
FROM base AS prod
# Dokumen BAP disimpan di volume agar tidak hilang saat kontainer dibuat ulang
# (src/lib/uploads.ts; dilayani /api/uploads dengan cek akses).
ENV NODE_ENV=production \
    UPLOAD_DIR=/data/uploads
COPY --from=build /app/package.json /app/package-lock.json /app/next.config.ts /app/prisma.config.ts /app/tsconfig.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/src ./src
COPY --from=build /app/public ./public
# `next start` menulis cache (mis. optimasi gambar) ke .next — milik user `node`.
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=cloudflared /usr/local/bin/cloudflared /usr/local/bin/cloudflared
CMD ["prod"]
