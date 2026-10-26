# Instalasi Inventory

Untuk pemakaian sehari-hari, cukup pasang Docker Desktop (Windows/macOS) atau Docker Engine + Compose 2.20+ (Linux). Nyalakan Docker dan pastikan tersedia ruang untuk image, database, dan dokumen. Koneksi internet dibutuhkan saat build pertama dan pembaruan. Node.js dan PostgreSQL di komputer tidak diperlukan.

## Windows: unduh, ekstrak, klik

1. [Unduh ZIP](https://github.com/MotionFrog13/Inventory/archive/refs/heads/master.zip) dan ekstrak ke folder permanen.
2. Klik dua kali **docker-prod.bat**. Tunggu build selesai; unduhan pertama dapat memakan beberapa menit.
3. Launcher menampilkan password acak Super Admin dan membuka **http://localhost:8000**.
4. Masuk dengan username **superadmin** dan password tersebut. Ganti password melalui menu **Pengguna** dan simpan di tempat aman.
5. Buat **Divisi → Kategori**, **Cabang**, lalu **Pengguna** dan **Aset**. Pengguna selain Super Admin wajib memiliki divisi dan minimal satu cabang.

Instalasi menyiapkan satu organisasi bernama `Organisasi Saya` (kode `main`), satu admin, dan inventaris kosong. Data contoh hanya ada pada mode pengembangan (`docker-dev.bat`).

## macOS / Linux

Unduh dan ekstrak ZIP, buka terminal di folder hasil ekstrak, lalu jalankan:

```bash
bash docker/launch.sh prod
```

Alternatif untuk semua platform dengan Git:

```bash
git clone https://github.com/MotionFrog13/Inventory.git
cd Inventory
docker compose up -d --build --wait --wait-timeout 600
docker compose logs app
```

Buka http://localhost:8000. Cari baris `Password Super Admin pertama` pada log untuk password awal. Tidak perlu membuat `.env`, memasang dependensi, menjalankan migrasi atau mengisi seed secara manual.

## Pengaturan opsional sebelum instalasi

Salin `docker/.env.example` menjadi `docker/.env` bila ingin menentukan nama organisasi, kode organisasi, email admin, atau password sendiri. Isi `ADMIN_PASSWORD` minimal 8 karakter; bila kosong password dibuat acak. Konfigurasi awal hanya berlaku saat database kosong. Ubah password akun yang sudah ada melalui menu Pengguna.

Jika port 8000 terpakai, isi `PROD_PORT=8001`, jalankan ulang launcher, lalu buka http://localhost:8001. Jangan mengedit `.env` di root untuk konfigurasi Docker.

## Menyalakan, menghentikan, memperbarui

| Kebutuhan | Perintah |
|---|---|
| Nyalakan kembali | `docker compose up -d --wait --wait-timeout 600` |
| Hentikan, simpan data | `docker compose down` |
| Periksa status | `docker compose ps` |
| Lihat log | `docker compose logs --tail 100 app` |
| Perbarui dari Git | `git pull --ff-only`, lalu `docker compose up -d --build --wait --wait-timeout 600` |

Backup sebelum pembaruan. Jika memakai ZIP, ekstrak versi baru ke folder terpisah, salin konfigurasi `docker/.env` bila ada, hentikan aplikasi lama tanpa menghapus volume, lalu jalankan launcher versi baru. Nama proyek produksi tetap `inventory`, sehingga volume data yang sama dipakai. Simpan versi lama untuk referensi; pemulihan versi dengan migrasi database memerlukan backup yang sesuai.

Database, dokumen BAP, dan rahasia disimpan dalam volume **inventory_data**. Restart, `docker compose down`, dan build ulang mempertahankan data. **Jangan menjalankan `down -v` atau menghapus volume tersebut pada instalasi berisi data.** Lihat [cara backup dan pemulihan](docs/docker.md#7-data--backup).

## Akses dari perangkat lain

Produksi memakai cookie sesi `Secure`. Untuk komputer yang menjalankan aplikasi, gunakan `http://localhost:8000` melalui Chrome/Edge/Firefox. Untuk HP, komputer lain, atau domain publik, gunakan **HTTPS**: klik `docker-tunnel.bat` untuk alamat uji coba atau atur domain tetap sesuai [panduan Cloudflare Tunnel](docs/docker.md#4-akses-publik-dengan-cloudflare-tunnel-tanpa-vps). Alamat quick tunnel berubah setelah restart dan komputer server harus tetap menyala.

## Bila instalasi belum berhasil

- **Docker belum berjalan:** buka Docker Desktop, tunggu engine siap, lalu ulangi launcher.
- **Compose tidak mengenali `include`:** perbarui Compose ke 2.20+ atau gunakan `docker-prod.bat` / `bash docker/launch.sh prod` yang memilih konfigurasi produksi langsung.
- **Build gagal mengunduh paket/image:** cek koneksi internet dan akses ke registry npm/Docker, lalu ulangi. Font sudah lokal.
- **Aplikasi belum sehat:** periksa `docker compose ps` dan `docker compose logs --tail 100 app`; jangan menghapus volume untuk memperbaiki kegagalan build.
- **Password awal terlewat:** lihat `docker compose logs app` sebelum kontainer dibuat ulang. Password hanya dicetak saat bootstrap; mengubah `ADMIN_PASSWORD` tidak mereset akun yang sudah ada.
- **Login gagal lewat IP LAN:** buka alamat HTTPS atau `localhost` di komputer server.
- **Punya instalasi database lama:** konfigurasi database terpisah ada di `docker/compose.db.yml`; produksi memakai volume lain. Backup dan pindahkan data secara terencana, bukan seed ulang.

Untuk pengembangan, pengujian, dan akun demo, lihat [get-started.md](get-started.md) dan [CONTRIBUTING.md](CONTRIBUTING.md).
