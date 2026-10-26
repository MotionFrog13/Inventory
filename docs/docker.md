# Menjalankan Inventory dengan Docker (Satu Kontainer)

PostgreSQL 15 dan aplikasi Next.js berjalan di **satu kontainer**. Tidak perlu memasang Node.js atau PostgreSQL di komputer — cukup Docker.

| | Mode **dev** | Mode **produksi** | Produksi + **akses publik** |
|---|---|---|---|
| Windows (klik dua kali) | `docker-dev.bat` | `docker-prod.bat` | `docker-tunnel.bat` |
| macOS / Linux | `bash docker/launch.sh dev` | `bash docker/launch.sh prod` | `bash docker/launch.sh prod tunnel` |
| Alamat | http://localhost:3000 | http://localhost:8000 | http://localhost:8000 + `https://<acak>.trycloudflare.com` (atau domain sendiri) |
| Server | `next dev` — kode di-mount dari folder proyek, hot reload | `next build` di dalam image, `next start` | Sama dengan produksi + `cloudflared` |
| Data awal | Data **demo** (organisasi `demo`, password `admin123` / `staff123`) | **Satu** organisasi + akun Super Admin; password acak dicetak di log | Sama dengan produksi (volume yang sama) |
| Database | Dibuka ke host di `127.0.0.1:55432` (user `postgres`, password `postgres`, DB `inventory`) | Hanya di dalam kontainer | Hanya di dalam kontainer |
| Saat Docker/komputer restart | Tidak menyala sendiri | Menyala otomatis (`restart: unless-stopped`) | Menyala otomatis; alamat quick tunnel **berganti** |

Dev dan produksi dapat berjalan bersamaan dan datanya terpisah. `docker-tunnel.bat` hanyalah mode produksi dengan tunnel menyala — data dan volumenya sama. Lihat [bagian 4](#4-akses-publik-dengan-cloudflare-tunnel-tanpa-vps) untuk domain sendiri dan hal yang perlu diperhatikan sebelum membuka aplikasi ke internet.

---

## 1. Prasyarat
- **Windows / macOS**: [Docker Desktop](https://www.docker.com/products/docker-desktop/). Launcher `.bat` menyalakan Docker Desktop sendiri bila belum berjalan.
- **Linux**: Docker Engine dengan plugin Compose v2 (`docker compose version`). Instalasi lewat compose di root membutuhkan Compose **2.20+**.

## 2. Mode Pengembangan (dev)
Klik dua kali **`docker-dev.bat`**. Yang terjadi:
1. Image dev dibangun (sekali saja), kontainer menyala, log tampil di jendela tersebut.
2. Start pertama: database diinisialisasi, dependensi Linux dipasang (`npm ci` — beberapa menit), migrasi diterapkan, data demo diisi.
3. Browser terbuka otomatis di http://localhost:3000 begitu aplikasi siap.

Ubah kode di editor seperti biasa — halaman ter-reload otomatis. Tekan **Ctrl+C** untuk menghentikan.

Catatan:
- `npm ci` diulang otomatis hanya bila `package-lock.json` berubah. Migrasi baru di `prisma/migrations` diterapkan setiap kontainer menyala.
- `node_modules` dan `.next` di dalam kontainer adalah volume terpisah (versi Linux) — tidak menimpa milik host.
- Mengisi ulang data demo (**menghapus seluruh data dev**): `docker-dev.bat seed`.
- **QA runner** (`npm run qa`) membutuhkan `APP_MODE="saas"`: set `DEV_APP_MODE=saas` di `docker/.env`, nyalakan ulang, lalu `docker-dev.bat seed`. Jalankan QA dari host dengan `DATABASE_URL` mengarah ke `localhost:55432`.
- Membuat migrasi baru: `docker compose -f docker/compose.dev.yml exec app inventory run npx prisma migrate dev --name <nama>`.

## 3. Mode Produksi
Klik dua kali **`docker-prod.bat`**. Image produksi dibangun (`next build`), kontainer berjalan di latar belakang, lalu launcher menunggu aplikasi siap dan membuka http://localhost:8000.

Pada start **pertama** (database kosong) kontainer membuat:
- satu organisasi — bawaan "Organisasi Saya", kode `main`;
- satu Super Admin — bawaan username `superadmin`, email `admin@inventory.local`, password **acak** yang dicetak satu kali di log dan ditampilkan launcher.

Masuk dengan akun tersebut, **ganti passwordnya** di menu Pengguna, lalu buat divisi, cabang, dan pengguna dari antarmuka. Untuk menentukan nilai-nilai ini sendiri, isi `docker/.env` **sebelum** start pertama (lihat bagian 5).

Rahasia lain dibuat otomatis pada start pertama dan disimpan di volume: `JWT_SECRET` dan password database. Tidak ada yang perlu diisi manual.

**Memperbarui aplikasi**: ambil kode terbaru (`git pull`), lalu klik `docker-prod.bat` lagi. Image dibangun ulang dan migrasi diterapkan otomatis; data tetap di volume.

> [!IMPORTANT]
> **HTTPS.** Pada mode produksi cookie sesi bertanda `Secure`, sehingga browser hanya menyimpannya lewat HTTPS — kecuali `http://localhost` di Chrome, Edge, dan Firefox. Bila aplikasi dibuka dari komputer lain lewat `http://<IP>:8000`, login akan gagal. Cara termudah tanpa VPS: **Cloudflare Tunnel** (bagian 4) — semua pengguna, termasuk di jaringan kantor, membuka alamat HTTPS-nya. Alternatifnya reverse proxy HTTPS sendiri (mis. Caddy atau Nginx) di depan port 8000.

## 4. Akses Publik dengan Cloudflare Tunnel (Tanpa VPS)
Komputer ini sendiri yang menjadi server. `cloudflared` di dalam kontainer membuka koneksi **keluar** ke Cloudflare, lalu Cloudflare meneruskan pengunjung ke aplikasi lewat HTTPS — tanpa VPS, tanpa IP publik, dan tanpa membuka port di router. Hanya untuk mode produksi.

| | Quick Tunnel | Tunnel dengan domain sendiri |
|---|---|---|
| Cara menyalakan | Klik dua kali `docker-tunnel.bat` | Isi `CLOUDFLARE_TUNNEL_TOKEN` di `docker/.env`, lalu `docker-prod.bat` |
| Kebutuhan | Tidak perlu akun | Akun Cloudflare (gratis) + domain yang DNS-nya dikelola Cloudflare |
| Alamat | Acak, `https://<kata-acak>.trycloudflare.com`; **berganti** setiap kontainer dinyalakan ulang | Tetap, mis. `https://inventory.perusahaan.com` |
| Cocok untuk | Uji coba dan demo singkat | Pemakaian sehari-hari |

### A. Quick Tunnel (uji coba)
Klik dua kali **`docker-tunnel.bat`**. Launcher menyalakan mode produksi, menunggu tunnel tersambung, lalu menampilkan dan membuka alamat publiknya. Alamat yang sedang aktif dapat dilihat lagi dengan `docker-prod.bat url`. Untuk kembali ke akses lokal saja, jalankan `docker-prod.bat` (tanpa `tunnel`).

Cloudflare menyediakan quick tunnel tanpa jaminan ketersediaan dan menyarankannya untuk pengujian. Karena alamatnya berganti setiap restart — termasuk setelah komputer dinyalakan ulang — gunakan domain sendiri untuk pemakaian rutin.

### B. Domain sendiri (permanen)
1. Tambahkan domain ke Cloudflare (paket Free cukup) dan arahkan nameserver domain ke Cloudflare.
2. Buka **Cloudflare Zero Trust** ➡️ **Networks** ➡️ **Tunnels** ➡️ **Create a tunnel** ➡️ pilih **Cloudflared**, beri nama (mis. `inventory`). Nama menu di dashboard dapat sedikit berbeda.
3. Pada langkah instalasi, salin **token** — teks panjang setelah `--token` pada perintah yang ditampilkan. cloudflared tidak perlu dipasang di komputer; sudah ada di dalam kontainer.
4. Tambahkan **Public Hostname**: subdomain + domain (mis. `inventory.perusahaan.com`), Service **Type** `HTTP`, **URL** `localhost:3000`. Port 3000 adalah port aplikasi **di dalam** kontainer — bukan 8000.
5. Tempel token ke `docker/.env` (`CLOUDFLARE_TUNNEL_TOKEN=...`), lalu klik `docker-prod.bat`. Launcher menunggu sampai tunnel tersambung.

Token bersifat **rahasia**: siapa pun yang memegangnya dapat menjalankan tunnel tersebut. Bila bocor, buat ulang (rotate) token di dashboard. Token hanya diberikan ke proses cloudflared — tidak ikut ke aplikasi maupun log.

### Yang perlu diperhatikan
- **Komputer harus menyala** dan terhubung ke internet; bila tidur atau mati, situs tidak dapat diakses. Matikan mode sleep, dan aktifkan *Start Docker Desktop when you sign in* agar kontainer menyala lagi setelah restart. Putus koneksi sesaat ditangani cloudflared sendiri; bila prosesnya berhenti (mis. token salah), kontainer mencobanya lagi setiap 15 detik tanpa menghentikan aplikasi.
- **Aplikasi terbuka ke internet.** Ganti password Super Admin awal dan jangan memakai akun demo. Pembatasan login tersedia per proses (10 percobaan per identitas/15 menit dan 120 percobaan global/menit); penghitung direset saat restart. Untuk domain sendiri, tambahkan pembatasan di Cloudflare untuk `/api/auth/login`, atau lindungi situs dengan Cloudflare Access.
- **Mode dev tidak dibuka lewat tunnel**: server dev Next.js menolak aset yang diminta dari domain lain dan tidak dirancang untuk akses publik.
- Log aktivitas mencatat IP asli pengunjung dari header `CF-Connecting-IP` yang diisi Cloudflare.

## 5. Pengaturan (`docker/.env`)
Opsional. Salin `docker/.env.example` menjadi `docker/.env` lalu ubah seperlunya. Berkas `.env` di root proyek **tidak** dibaca kontainer.

| Variabel | Bawaan | Keterangan |
|---|---|---|
| `DEV_PORT` / `PROD_PORT` | `3000` / `8000` | Port di host |
| `DEV_DB_PORT` | `55432` | Port PostgreSQL dev di `127.0.0.1` |
| `DEV_APP_MODE` / `PROD_APP_MODE` | `self-hosted` | `self-hosted` atau `saas` |
| `WATCH_POLL_INTERVAL_MS` | `2000` | Polling hot reload (dev, memakai webpack). `0` = mati (Turbopack); launcher Linux mematikannya sendiri |
| `ORG_NAME`, `ORG_SLUG` | `Organisasi Saya`, `main` | Organisasi pertama (produksi, start pertama saja) |
| `ADMIN_NAME`, `ADMIN_USERNAME`, `ADMIN_EMAIL` | `Super Administrator`, `superadmin`, `admin@inventory.local` | Super Admin pertama (produksi, start pertama saja) |
| `ADMIN_PASSWORD` | acak | Minimal 8 karakter |
| `JWT_EXPIRES_IN` | `8h` | Lama sesi |
| `CLOUDFLARE_TUNNEL_TOKEN` | kosong | Token tunnel domain sendiri (produksi, bagian 4B). Bila terisi, tunnel selalu menyala bersama `docker-prod.bat` |
| `CLOUDFLARE_QUICK_TUNNEL` | `false` | `true` = quick tunnel selalu menyala. `docker-tunnel.bat` menyalakannya tanpa mengubah berkas ini |

## 6. Perintah
| Tujuan | Windows | macOS / Linux |
|---|---|---|
| Menyalakan | `docker-dev.bat` / `docker-prod.bat` | `bash docker/launch.sh dev` / `prod` |
| Produksi + Quick Tunnel | `docker-tunnel.bat` | `bash docker/launch.sh prod tunnel` |
| Alamat tunnel yang aktif | `docker-prod.bat url` | `bash docker/launch.sh prod url` |
| Menghentikan | `docker-dev.bat stop` / `docker-prod.bat stop` | `bash docker/launch.sh dev stop` / `prod stop` |
| Melihat log | `docker-dev.bat logs` / `docker-prod.bat logs` | `bash docker/launch.sh dev logs` / `prod logs` |
| Isi ulang data demo (dev) | `docker-dev.bat seed` | `bash docker/launch.sh dev seed` |

Perintah lain di dalam kontainer memakai `inventory run`, yang mengisi `DATABASE_URL` dan `JWT_SECRET` secara otomatis:

```bash
docker compose -f docker/compose.prod.yml exec app inventory run npx prisma migrate status
```

## 7. Data & Backup
Semua data mode produksi ada di volume Docker **`inventory_data`** (`/data` di dalam kontainer): database (`/data/postgres`), dokumen BAP (`/data/uploads`), dan rahasia (`/data/secrets`). Mode dev memakai volume `inventory-dev_*`; dokumen BAP dev tersimpan di folder `uploads/` milik proyek.

Backup database dan dokumen BAP:

```bash
docker compose -f docker/compose.prod.yml exec -T app gosu postgres pg_dump inventory > backup-inventory.sql
```

```bash
docker compose -f docker/compose.prod.yml cp app:/data/uploads ./backup-uploads
```

`/data/secrets` tidak perlu ikut di-backup: instalasi baru membuat rahasia baru, dan pengguna cukup login ulang. Bila Anda mem-backup seluruh volume, perlakukan salinannya seperti kredensial.

Pemulihan backup dilakukan pada instalasi pengganti yang kosong. Simpan instalasi lama dan backup asli sampai hasil pemulihan terverifikasi. Nyalakan instalasi pengganti, salin dump SQL, lalu pulihkan (perintah berikut mengganti data database tujuan):

```bash
docker compose -f docker/compose.prod.yml cp ./backup-inventory.sql app:/tmp/restore.sql
docker compose -f docker/compose.prod.yml exec -T app gosu postgres psql -d inventory -v ON_ERROR_STOP=1 -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;' -f /tmp/restore.sql
docker compose -f docker/compose.prod.yml cp ./backup-uploads/. app:/data/uploads/
docker compose -f docker/compose.prod.yml exec -T app chown -R node:node /data/uploads
docker compose -f docker/compose.prod.yml restart app
```

Saat memulihkan, tutup akses pengguna/tunnel agar tidak ada penulisan baru. Gunakan versi aplikasi yang sesuai backup, pastikan akun dan dokumen BAP bisa dibuka, lalu hapus `/tmp/restore.sql` di dalam kontainer. Dump SQL memuat hash password dan data organisasi; simpan secara privat. Pada PowerShell lama, gunakan `cmd /c` untuk redirect dump SQL agar encoding tidak diubah.

Mengosongkan **seluruh** data (tidak dapat dibatalkan) — ganti `dev` dengan `prod` untuk produksi:

```bash
docker compose -f docker/compose.dev.yml down -v
```

## 8. Pemecahan Masalah
- **Port sudah dipakai** (mis. Laragon/Apache, PostgreSQL lokal): ganti `DEV_PORT`, `DEV_DB_PORT`, atau `PROD_PORT` di `docker/.env`.
- **Password Super Admin pertama terlewat** (log hilang setelah kontainer dibuat ulang): bila belum ada data yang perlu disimpan, kosongkan volume produksi (`docker compose -f docker/compose.prod.yml down -v`), isi `ADMIN_PASSWORD` di `docker/.env`, lalu jalankan `docker-prod.bat` lagi.
- **Tunnel "belum tersambung"**: periksa `docker-prod.bat logs` — `Provided Tunnel token is not valid` berarti token salah salin. Di dashboard Cloudflare, pastikan Public Hostname mengarah ke `localhost:3000`. cloudflared membutuhkan koneksi **keluar** ke Cloudflare di port 7844 — UDP (QUIC), dengan cadangan otomatis TCP (HTTP/2); pastikan firewall jaringan mengizinkannya.
- **Hot reload tidak jalan**: pastikan `WATCH_POLL_INTERVAL_MS` bukan `0` (Windows/macOS).
- **Start pertama mode dev lama**: wajar — `npm ci` versi Linux. Start berikutnya cepat.
- **Linux: file di folder proyek tidak dapat ditulis kontainer dev**: aplikasi berjalan sebagai user `node` (UID 1000); pastikan folder proyek dapat ditulis UID tersebut.
- `docker-compose.yml` di root menyertakan konfigurasi produksi yang sama: `docker compose up -d --build --wait --wait-timeout 600`. Konfigurasi PostgreSQL terpisah untuk Node.js di host ada di `docker/compose.db.yml` (tanpa pgAdmin, port hanya di localhost). Volume database lama `inventory_postgres_data` tetap dipakai konfigurasi database terpisah; beralih ke produksi tidak memigrasikan data lama secara otomatis.
