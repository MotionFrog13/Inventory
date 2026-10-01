@echo off
rem Launcher Docker Inventory untuk Windows. Dipanggil docker-dev.bat / docker-prod.bat.
rem   launch.bat dev [start|stop|logs|seed]
rem   launch.bat prod [start|tunnel|url|stop|logs]
setlocal EnableExtensions
cd /d "%~dp0.."

set "MODE=%~1"
set "ACTION=%~2"
if "%ACTION%"=="" set "ACTION=start"
if /i not "%MODE%"=="dev" if /i not "%MODE%"=="prod" (
  echo Pemakaian: docker\launch.bat dev [start^|stop^|logs^|seed]
  echo            docker\launch.bat prod [start^|tunnel^|url^|stop^|logs]
  exit /b 1
)

set "COMPOSE=docker compose -f docker/compose.%MODE%.yml"
if /i "%MODE%"=="dev" (set "PORT=3000") else (set "PORT=8000")
rem Port dapat diganti lewat docker/.env (DEV_PORT / PROD_PORT).
if exist "docker\.env" (
  for /f "usebackq eol=# tokens=1,* delims==" %%a in ("docker\.env") do (
    if /i "%MODE%"=="dev" if "%%a"=="DEV_PORT" set "PORT=%%b"
    if /i "%MODE%"=="prod" if "%%a"=="PROD_PORT" set "PORT=%%b"
  )
)
set "URL=http://localhost:%PORT%"

call :ensure_docker || goto :fail

if /i "%ACTION%"=="stop" (
  %COMPOSE% down
  goto :done
)
if /i "%ACTION%"=="logs" (
  %COMPOSE% logs -f --tail 200 app
  goto :done
)
if /i "%ACTION%"=="seed" goto :seed
if /i "%ACTION%"=="start" goto :start_%MODE%
if /i "%MODE%"=="prod" if /i "%ACTION%"=="tunnel" (
  rem Quick tunnel hanya untuk kontainer yang dinyalakan perintah ini.
  set "CLOUDFLARE_QUICK_TUNNEL=true"
  goto :start_prod
)
if /i "%MODE%"=="prod" if /i "%ACTION%"=="url" (
  set "TUNNEL_WAIT=5"
  call :tunnel_report
  goto :done
)
echo Aksi tidak dikenal: %ACTION%
goto :fail

:start_dev
echo.
echo  Inventory - mode DEV (hot reload)
echo  Start pertama memasang dependensi dan mengisi data demo; bisa beberapa menit.
echo  Browser terbuka otomatis di %URL% setelah siap. Tekan Ctrl+C untuk berhenti.
echo  Akun demo: superadmin / admin123  -  staff_it / staff123
echo.
call :open_when_ready
%COMPOSE% up --build
goto :done

:start_prod
echo.
echo  Inventory - mode PRODUKSI
if /i "%ACTION%"=="tunnel" echo  + Cloudflare Quick Tunnel: alamat publik HTTPS sementara *.trycloudflare.com
echo  Membangun image dan menyalakan kontainer di latar belakang ...
echo.
%COMPOSE% up -d --build || goto :fail
echo.
echo  Menunggu aplikasi siap di %URL% ...
powershell -NoProfile -Command "$ProgressPreference='SilentlyContinue';for($i=0;$i -lt 150;$i++){try{$null=Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 '%URL%/logo.svg';exit 0}catch{Start-Sleep 2}};exit 1"
if errorlevel 1 (
  echo  Aplikasi belum merespons. Periksa log: docker-prod.bat logs
  goto :fail
)
echo.
%COMPOSE% logs --no-log-prefix app 2>nul | findstr /l /c:"[inventory]" /c:"Super Admin"
echo.
echo  Inventory berjalan di %URL%
set "TUNNEL_WAIT=45"
call :tunnel_report
echo  Hentikan: docker-prod.bat stop   -   Log: docker-prod.bat logs
set "OPEN_URL=%URL%"
if defined TUNNEL_URL set "OPEN_URL=%TUNNEL_URL%"
start "" "%OPEN_URL%"
goto :done

:tunnel_report
rem Status Cloudflare Tunnel dari kontainer (inventory tunnel-status).
call :wait_tunnel
if "%TUNNEL_STATE%"=="off" (
  if /i "%ACTION%"=="url" echo  Cloudflare Tunnel tidak aktif. Jalankan: docker-prod.bat tunnel
  exit /b 0
)
if "%TUNNEL_STATE%"=="ready" (
  if defined TUNNEL_URL (
    echo  Alamat publik: %TUNNEL_URL%
    echo  Quick tunnel - alamat ini berganti setiap kontainer dinyalakan ulang.
  ) else (
    echo  Cloudflare Tunnel tersambung - buka domain yang Anda atur di dashboard Cloudflare.
  )
  exit /b 0
)
if "%TUNNEL_STATE%"=="unknown" (
  echo  Status tunnel tidak terbaca - kontainer produksi belum berjalan. Jalankan: docker-prod.bat
  exit /b 0
)
echo  Cloudflare Tunnel belum tersambung. Periksa token dan koneksi: docker-prod.bat logs
exit /b 0

:wait_tunnel
rem Mengisi TUNNEL_STATE (off/starting/ready) dan TUNNEL_URL; menunggu selama "starting".
set /a TRIES=0
:wait_tunnel_loop
set "TUNNEL_STATE=unknown"
set "TUNNEL_URL="
for /f "tokens=1,2" %%a in ('%COMPOSE% exec -T app inventory tunnel-status 2^>nul') do (
  set "TUNNEL_STATE=%%a"
  set "TUNNEL_URL=%%b"
)
if "%TUNNEL_STATE%"=="starting" if %TRIES% lss %TUNNEL_WAIT% (
  set /a TRIES+=1
  timeout /t 2 /nobreak >nul
  goto :wait_tunnel_loop
)
exit /b 0

:seed
if /i not "%MODE%"=="dev" (
  echo Seed demo MENGHAPUS seluruh data dan hanya tersedia untuk mode dev.
  goto :fail
)
echo Seed demo akan MENGHAPUS seluruh data database dev lalu mengisi data demo.
set /p "CONFIRM=Lanjutkan? (y/N) "
if /i not "%CONFIRM%"=="y" goto :done
%COMPOSE% exec app inventory run npx prisma db seed || goto :fail
goto :done

:open_when_ready
rem Jendela terpisah (diminimalkan lalu disembunyikan) - `-WindowStyle Hidden` pada
rem konsol yang sama akan ikut menyembunyikan jendela launcher ini.
start "" /min powershell -NoProfile -WindowStyle Hidden -Command "$ProgressPreference='SilentlyContinue';for($i=0;$i -lt 600;$i++){try{$null=Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 '%URL%/logo.svg';Start-Process '%URL%';exit}catch{Start-Sleep 2}}"
exit /b 0

:ensure_docker
where docker >nul 2>&1 || (
  echo Docker belum terpasang. Pasang Docker Desktop: https://www.docker.com/products/docker-desktop/
  exit /b 1
)
docker info >nul 2>&1 && exit /b 0
if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" (
  echo Menyalakan Docker Desktop ...
  start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
)
for /l %%i in (1,1,60) do (
  timeout /t 3 /nobreak >nul
  docker info >nul 2>&1 && exit /b 0
)
echo Docker belum berjalan. Nyalakan Docker Desktop lalu coba lagi.
exit /b 1

:fail
echo.
pause
exit /b 1

:done
if /i "%MODE%"=="prod" if /i not "%ACTION%"=="logs" if /i not "%ACTION%"=="stop" pause
exit /b 0
