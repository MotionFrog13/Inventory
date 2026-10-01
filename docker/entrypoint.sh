#!/usr/bin/env bash
# Entrypoint kontainer all-in-one Inventory: PostgreSQL + Next.js dalam SATU kontainer.
#
#   inventory dev         npm ci bila lockfile berubah ➡️ migrate ➡️ seed DEMO bila DB kosong ➡️ next dev
#   inventory prod        migrate ➡️ buat organisasi + Super Admin pertama bila DB kosong ➡️ next start
#   inventory run <cmd>   jalankan perintah di /app sebagai user `node` dengan DATABASE_URL & JWT_SECRET
#                         terisi, mis. `docker compose exec app inventory run npx prisma db seed`
#   inventory tunnel-status   status Cloudflare Tunnel untuk launcher: off | starting | ready [https://…]
#
# Seluruh data persisten berada di volume /data:
#   /data/postgres   PGDATA
#   /data/uploads    dokumen BAP (mode prod, UPLOAD_DIR; mode dev memakai uploads/ milik host)
#   /data/secrets    JWT_SECRET & password database yang dibuat otomatis pada start pertama
set -Eeuo pipefail

DATA_DIR=/data
SECRETS_DIR="$DATA_DIR/secrets"
export PGDATA="$DATA_DIR/postgres"
DB_NAME=inventory
APP_PORT=3000

log() { echo "[inventory] $*"; }
as_app() { gosu node "$@"; }

# Nilai dari environment dipakai bila di-set; selain itu dibuat SEKALI lalu
# disimpan di volume agar tetap sama setiap kontainer dibuat ulang.
load_secret() {
  local name="$1" file="$SECRETS_DIR/$1"
  if [ -n "${!name:-}" ]; then return; fi
  if [ ! -s "$file" ]; then
    (umask 077 && openssl rand -hex 48 > "$file")
    log "$name dibuat otomatis dan disimpan di volume ($file)"
  fi
  export "$name=$(cat "$file")"
}

load_env() {
  mkdir -p "$SECRETS_DIR"
  chmod 700 "$SECRETS_DIR"
  load_secret JWT_SECRET
  load_secret POSTGRES_PASSWORD
  local password
  password="$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$POSTGRES_PASSWORD")"
  # Selalu database internal kontainer — DATABASE_URL dari luar sengaja diabaikan.
  export DATABASE_URL="postgresql://postgres:${password}@127.0.0.1:5432/${DB_NAME}?schema=public"
}

# ── PostgreSQL ──────────────────────────────────────────────────────────────
init_postgres() {
  mkdir -p "$PGDATA" /var/run/postgresql
  chown postgres:postgres "$PGDATA" /var/run/postgresql
  chmod 700 "$PGDATA"
  if [ -s "$PGDATA/PG_VERSION" ]; then return; fi

  log "Inisialisasi PostgreSQL di $PGDATA ..."
  local pwfile
  pwfile="$(mktemp)"
  printf '%s' "$POSTGRES_PASSWORD" > "$pwfile"
  chown postgres "$pwfile"
  # Socket lokal (dipakai entrypoint & `psql` di dalam kontainer) tanpa password;
  # koneksi TCP — termasuk aplikasi — wajib password.
  gosu postgres initdb --username=postgres --pwfile="$pwfile" --encoding=UTF8 --locale=C.UTF-8 \
    --auth-local=trust --auth-host=scram-sha-256 >/dev/null
  rm -f "$pwfile"
  echo "host all all all scram-sha-256" >> "$PGDATA/pg_hba.conf"

  gosu postgres pg_ctl -D "$PGDATA" -o "-c listen_addresses=''" -w start >/dev/null
  gosu postgres createdb "$DB_NAME"
  gosu postgres pg_ctl -D "$PGDATA" -m fast -w stop >/dev/null
}

PG_PID=""
APP_PID=""
STOPPING=""

start_postgres() {
  # Mode dev membuka port database ke host (compose memetakannya ke 127.0.0.1
  # saja); mode prod hanya mendengarkan di dalam kontainer.
  local listen=localhost
  if [ "$MODE" = dev ]; then listen='*'; fi
  gosu postgres postgres -D "$PGDATA" -c listen_addresses="$listen" &
  PG_PID=$!
  for _ in $(seq 1 60); do
    if pg_isready -q -h 127.0.0.1 -p 5432; then return 0; fi
    if ! kill -0 "$PG_PID" 2>/dev/null; then log "PostgreSQL gagal dijalankan."; exit 1; fi
    sleep 1
  done
  log "PostgreSQL belum siap setelah 60 detik."
  exit 1
}

organization_count() {
  gosu postgres psql -qtAX -d "$DB_NAME" -c 'SELECT COUNT(*) FROM "Organization"'
}

# Dipanggil sekali lewat trap EXIT — baik saat `docker stop`, saat salah satu
# proses mati, maupun saat langkah persiapan gagal — agar PostgreSQL selalu
# berhenti dengan bersih, bukan di-SIGKILL.
shutdown() {
  if [ -n "$STOPPING" ]; then return; fi
  STOPPING=1
  if [ -z "$APP_PID$PG_PID" ]; then return; fi
  log "Menghentikan aplikasi & database ..."
  # Tunnel lebih dulu: berhenti menerima pengunjung sebelum aplikasi ditutup.
  if [ -n "$TUNNEL_PID" ]; then kill -TERM "$TUNNEL_PID" 2>/dev/null || true; wait "$TUNNEL_PID" 2>/dev/null || true; fi
  if [ -n "$APP_PID" ]; then kill -TERM "$APP_PID" 2>/dev/null || true; wait "$APP_PID" 2>/dev/null || true; fi
  # SIGINT = fast shutdown: koneksi aktif diputus, data di-flush dengan aman.
  if [ -n "$PG_PID" ]; then kill -INT "$PG_PID" 2>/dev/null || true; wait "$PG_PID" 2>/dev/null || true; fi
}

# ── Cloudflare Tunnel (opsional, hanya mode prod) ───────────────────────────
# Akses publik lewat HTTPS tanpa VPS maupun port forwarding: cloudflared membuka
# koneksi KELUAR ke Cloudflare lalu meneruskan pengunjung ke Next.js di dalam
# kontainer. Bila keduanya di-set, tunnel bernama yang dipakai.
#   CLOUDFLARE_TUNNEL_TOKEN=<token>  domain sendiri, permanen (Zero Trust ➡️ Tunnels)
#   CLOUDFLARE_QUICK_TUNNEL=true     alamat acak *.trycloudflare.com, berganti setiap restart
CLOUDFLARED_METRICS=127.0.0.1:20241
TUNNEL_PID=""

tunnel_mode() { # tunnel_mode <token>
  if [ -n "$1" ]; then echo named
  elif [ "${CLOUDFLARE_QUICK_TUNNEL:-}" = true ]; then echo quick
  fi
}

start_tunnel() { # start_tunnel <token>
  local token="$1"
  local -a args=(tunnel --no-autoupdate --metrics "$CLOUDFLARED_METRICS")
  case "$(tunnel_mode "$token")" in
    named)
      log "Cloudflare Tunnel: menyambungkan domain Anda (Public Hostname di dashboard Cloudflare) ..."
      args+=(run)
      ;;
    quick)
      log "Cloudflare Quick Tunnel: membuat alamat sementara *.trycloudflare.com ..."
      args+=(--url "http://127.0.0.1:$APP_PORT")
      ;;
    *) return 0 ;;
  esac
  # cloudflared menyambung ulang sendiri saat jaringan putus. Loop ini hanya
  # menyalakannya lagi bila prosesnya berhenti (mis. token salah), tanpa
  # menjatuhkan aplikasi — akses lokal tetap berjalan.
  (
    set +e
    child=""
    trap 'kill -TERM "$child" 2>/dev/null; wait "$child"; exit 0' TERM INT
    while true; do
      # Token hanya diberikan ke proses cloudflared (user `nobody`).
      TUNNEL_TOKEN="$token" gosu nobody cloudflared "${args[@]}" &
      child=$!
      wait "$child"
      log "cloudflared berhenti (kode $?) — dicoba lagi dalam 15 detik."
      sleep 15 &
      wait $!
    done
  ) &
  TUNNEL_PID=$!
}

# ── Persiapan aplikasi per mode ─────────────────────────────────────────────
prepare_dev() {
  chown node:node /app/node_modules /app/.next
  local want
  want="$(sha256sum package-lock.json | cut -d' ' -f1)"
  if [ "$(cat node_modules/.docker-lock-sha256 2>/dev/null)" != "$want" ]; then
    log "Memasang dependensi (npm ci) — hanya saat package-lock.json berubah ..."
    as_app npm ci --no-audit --no-fund
    as_app sh -c "echo '$want' > node_modules/.docker-lock-sha256"
  else
    as_app npx prisma generate >/dev/null
  fi
}

seed_dev() {
  log "Database kosong — mengisi data DEMO (APP_MODE=${APP_MODE:-self-hosted}) ..."
  as_app npx prisma db seed
}

bootstrap_prod() {
  local generated=""
  if [ -z "${ADMIN_PASSWORD:-}" ]; then
    ADMIN_PASSWORD="$(openssl rand -base64 32 | tr -dc 'A-Za-z0-9' | cut -c1-16)"
    generated=1
  fi
  log "Database kosong — membuat organisasi & Super Admin pertama ..."
  (export SEED_MODE=bootstrap ADMIN_PASSWORD && as_app npx prisma db seed)

  if [ -n "$generated" ]; then
    log "================================================================"
    log " Password Super Admin pertama : $ADMIN_PASSWORD"
    log " Dibuat acak dan hanya ditampilkan di log ini — segera ganti"
    log " lewat menu Pengguna setelah masuk."
    log "================================================================"
  fi
}

# ── Main ────────────────────────────────────────────────────────────────────
MODE="${1:-prod}"
case "$MODE" in
  dev|prod) ;;
  run)
    shift
    load_env
    cd /app
    exec gosu node "$@"
    ;;
  tunnel-status)
    mode="$(tunnel_mode "${CLOUDFLARE_TUNNEL_TOKEN:-}")"
    if [ -z "$mode" ]; then echo off; exit 0; fi
    exec node --input-type=module -e '
      const [mode, metrics] = process.argv.slice(1);
      const get = (path) => fetch(`http://${metrics}${path}`).then((r) => (r.ok ? r.json() : null), () => null);
      const ready = await get("/ready");
      if (!(ready?.readyConnections > 0)) {
        console.log("starting");
      } else {
        const quick = mode === "quick" ? await get("/quicktunnel") : null;
        console.log(quick?.hostname ? `ready https://${quick.hostname}` : "ready");
      }
    ' "$mode" "$CLOUDFLARED_METRICS"
    ;;
  *) exec "$@" ;;
esac

trap shutdown EXIT
trap 'exit 0' TERM INT

# Token tunnel tidak boleh ikut ke environment migrasi, seed, maupun Next.js.
TUNNEL_TOKEN_VALUE="${CLOUDFLARE_TUNNEL_TOKEN:-}"
unset CLOUDFLARE_TUNNEL_TOKEN

load_env
init_postgres
start_postgres

if [ "$MODE" = dev ]; then
  prepare_dev
else
  mkdir -p "$DATA_DIR/uploads"
  chown node:node "$DATA_DIR/uploads"
fi

log "Menerapkan migrasi database ..."
as_app npx prisma migrate deploy

if [ "$(organization_count)" = "0" ]; then
  if [ "$MODE" = dev ]; then seed_dev; else bootstrap_prod; fi
fi
# Password awal tidak perlu ikut ke environment proses aplikasi.
unset ADMIN_PASSWORD

# `gosu` dipanggil langsung (bukan lewat fungsi) agar $! adalah PID Next.js
# sendiri dan SIGTERM saat shutdown sampai kepadanya.
if [ "$MODE" = dev ]; then
  # Turbopack tidak mendeteksi perubahan isi file lewat polling di bind mount
  # Docker Desktop (Windows, Next.js 16.2) — saat polling aktif dev server memakai
  # webpack, yang watcher-nya mendukung polling. Tanpa polling: Turbopack.
  dev_flags=()
  if [ "${WATCH_POLL_INTERVAL_MS:-0}" != "0" ]; then dev_flags=(--webpack); fi
  log "Menjalankan next dev ${dev_flags[*]} (hot reload) — buka http://localhost:${PUBLIC_PORT:-$APP_PORT}"
  gosu node node_modules/.bin/next dev "${dev_flags[@]}" --hostname 0.0.0.0 --port "$APP_PORT" &
else
  log "Menjalankan next start (produksi) — buka http://localhost:${PUBLIC_PORT:-$APP_PORT}"
  gosu node node_modules/.bin/next start --hostname 0.0.0.0 --port "$APP_PORT" &
fi
APP_PID=$!

# Tunnel tidak ikut `wait -n` di bawah: putusnya tunnel tidak menghentikan aplikasi.
if [ "$MODE" = prod ]; then start_tunnel "$TUNNEL_TOKEN_VALUE"; fi

# Bila salah satu proses berhenti, hentikan yang lain agar kontainer ikut
# berhenti (dan dinyalakan ulang oleh `restart: unless-stopped`) — bukan setengah hidup.
set +e
wait -n "$APP_PID" "$PG_PID"
exit $?
