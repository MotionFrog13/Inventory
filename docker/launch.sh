#!/usr/bin/env bash
# Launcher Docker Inventory untuk macOS/Linux (padanan docker-dev.bat / docker-prod.bat).
#   docker/launch.sh dev [start|stop|logs|seed]
#   docker/launch.sh prod [start|tunnel|url|stop|logs]
set -euo pipefail
cd "$(dirname "$0")/.."

MODE="${1:-}"
ACTION="${2:-start}"
case "$MODE" in
  dev) PORT=3000; PORT_VAR=DEV_PORT ;;
  prod) PORT=8000; PORT_VAR=PROD_PORT ;;
  *) echo "Pemakaian: docker/launch.sh dev [start|stop|logs|seed] | prod [start|tunnel|url|stop|logs]"; exit 1 ;;
esac
# Port dapat diganti lewat docker/.env (DEV_PORT / PROD_PORT).
if [ -f docker/.env ]; then
  value="$(sed -n "s/^${PORT_VAR}=//p" docker/.env | tail -n1 | tr -d '"\r')"
  PORT="${value:-$PORT}"
fi
URL="http://localhost:$PORT"
compose() { docker compose -f "docker/compose.$MODE.yml" "$@"; }

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker belum terpasang: https://docs.docker.com/get-docker/"
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "Docker belum berjalan. Nyalakan Docker lalu coba lagi."
  exit 1
fi

open_url() {
  if command -v open >/dev/null 2>&1; then open "$1"
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$1" >/dev/null 2>&1 || true
  fi
}
# Status Cloudflare Tunnel dari kontainer: off | starting | ready [https://…]
TUNNEL_URL=""
tunnel_report() { # tunnel_report <percobaan>
  local status=""
  for _ in $(seq 0 "$1"); do
    status="$(compose exec -T app inventory tunnel-status 2>/dev/null | tr -d '
' || true)"
    [ "$status" = starting ] || break
    sleep 2
  done
  case "$status" in
    off) [ "$ACTION" = url ] && echo "Cloudflare Tunnel tidak aktif. Jalankan: docker/launch.sh prod tunnel" ;;
    "ready https://"*)
      TUNNEL_URL="${status#ready }"
      echo "Alamat publik: $TUNNEL_URL"
      echo "Quick tunnel - alamat ini berganti setiap kontainer dinyalakan ulang." ;;
    ready) echo "Cloudflare Tunnel tersambung - buka domain yang Anda atur di dashboard Cloudflare." ;;
    starting) echo "Cloudflare Tunnel belum tersambung. Periksa token dan koneksi: docker/launch.sh prod logs" ;;
    *) echo "Status tunnel tidak terbaca - kontainer produksi belum berjalan. Jalankan: docker/launch.sh prod" ;;
  esac
  return 0
}

wait_ready() { # wait_ready <percobaan>
  for _ in $(seq 1 "$1"); do
    if curl -fsS -o /dev/null "$URL/logo.svg" 2>/dev/null; then return 0; fi
    sleep 2
  done
  return 1
}

case "$ACTION" in
  stop) compose down ;;
  logs) compose logs -f --tail 200 app ;;
  seed)
    if [ "$MODE" != dev ]; then
      echo "Seed demo MENGHAPUS seluruh data dan hanya tersedia untuk mode dev."
      exit 1
    fi
    read -r -p "Seed demo akan MENGHAPUS seluruh data database dev. Lanjutkan? (y/N) " confirm
    if [ "$confirm" = y ] || [ "$confirm" = Y ]; then
      compose exec app inventory run npx prisma db seed
    fi
    ;;
  url)
    if [ "$MODE" != prod ]; then echo "Aksi url hanya untuk mode prod."; exit 1; fi
    tunnel_report 5
    ;;
  start|tunnel)
    if [ "$ACTION" = tunnel ]; then
      if [ "$MODE" != prod ]; then echo "Cloudflare Tunnel hanya untuk mode prod."; exit 1; fi
      # Quick tunnel hanya untuk kontainer yang dinyalakan perintah ini.
      export CLOUDFLARE_QUICK_TUNNEL=true
      echo "+ Cloudflare Quick Tunnel: alamat publik HTTPS sementara *.trycloudflare.com"
    fi
    if [ "$MODE" = dev ]; then
      echo "Inventory - mode DEV (hot reload). Start pertama memasang dependensi & data demo."
      echo "Browser terbuka di $URL setelah siap. Ctrl+C untuk berhenti."
      echo "Akun demo: superadmin / admin123  -  staff_it / staff123"
      # Di Linux inotify berjalan normal lewat bind mount — polling tidak perlu.
      if [ "$(uname -s)" = Linux ] && [ -z "${WATCH_POLL_INTERVAL_MS:-}" ] \
        && ! grep -qs '^WATCH_POLL_INTERVAL_MS=' docker/.env; then
        export WATCH_POLL_INTERVAL_MS=0
      fi
      (wait_ready 600 && open_url "$URL") &
      compose up --build
    else
      compose up -d --build
      echo "Menunggu aplikasi siap di $URL ..."
      if ! wait_ready 150; then
        echo "Aplikasi belum merespons. Periksa log: docker/launch.sh prod logs"
        exit 1
      fi
      compose logs --no-log-prefix app | grep -F -e "[inventory]" -e "Super Admin" || true
      echo
      echo "Inventory berjalan di $URL"
      tunnel_report 45
      echo "Hentikan: docker/launch.sh prod stop  -  Log: docker/launch.sh prod logs"
      open_url "${TUNNEL_URL:-$URL}"
    fi
    ;;
  *) echo "Aksi tidak dikenal: $ACTION"; exit 1 ;;
esac
