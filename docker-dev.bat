@echo off
rem Klik dua kali: Inventory mode PENGEMBANGAN (PostgreSQL + next dev) dalam satu kontainer Docker.
rem Opsi: docker-dev.bat [start, stop, logs, seed]  -  lihat docs/docker.md
call "%~dp0docker\launch.bat" dev %*
