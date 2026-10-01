@echo off
rem Klik dua kali: Inventory mode PRODUKSI + alamat publik HTTPS lewat Cloudflare Quick Tunnel
rem (*.trycloudflare.com, tanpa VPS dan tanpa akun). Untuk domain sendiri isi
rem CLOUDFLARE_TUNNEL_TOKEN di docker/.env lalu pakai docker-prod.bat  -  lihat docs/docker.md
call "%~dp0docker\launch.bat" prod tunnel
