@echo off
rem Klik dua kali: Inventory mode PRODUKSI (PostgreSQL + next start) dalam satu kontainer Docker.
rem Opsi: docker-prod.bat [start, tunnel, url, stop, logs]  -  lihat docs/docker.md
rem   tunnel = sekaligus buka alamat publik HTTPS lewat Cloudflare Quick Tunnel (tanpa VPS)
call "%~dp0docker\launch.bat" prod %*
