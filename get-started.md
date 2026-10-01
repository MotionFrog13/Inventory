# Panduan Memulai Aplikasi (Get Started Guide)

Dokumen ini menjelaskan langkah-langkah untuk menyiapkan environment, menjalankan database, inisialisasi skema data, menjalankan server Next.js, dan menguji fitur-fitur utama (isolasi organisasi/divisi/outlet, divisi & kategori dinamis, mutasi, BAP, dan insiden) baik secara manual maupun otomatis.

---

## 📋 Daftar Isi
1. [Prasyarat Sistem](#1-prasyarat-sistem)
2. [Konfigurasi Environment (`.env`)](#2-konfigurasi-environment-env)
3. [Setup Database & Seeding](#3-setup-database--seeding)
4. [Menjalankan Aplikasi](#4-menjalankan-aplikasi)
5. [Skenario Pengujian Fitur (Manual QA)](#5-skenario-pengujian-fitur-manual-qa)
6. [Menjalankan Pengujian Otomatis](#6-menjalankan-pengujian-otomatis)

---

## 1. Prasyarat Sistem
Sebelum memulai, pastikan perangkat Anda telah terinstal:
* **Node.js 20.19+, 22.12+, atau 24+** (syarat Prisma 7)
* **Docker & Docker Desktop** (untuk PostgreSQL)
* **NPM (v10 atau lebih baru)**

---

## 2. Konfigurasi Environment (`.env`)
Unduh kode dan pasang dependensinya, lalu salin contoh konfigurasi:

```bash
git clone https://github.com/MotionFrog13/Inventory.git
cd Inventory
npm install
cp .env.example .env
```

Isi `.env` minimal seperti berikut. **Ganti `JWT_SECRET`** dengan string acak yang panjang (mis. hasil `openssl rand -base64 48`):

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/inventory?schema=public"
JWT_SECRET="ganti_dengan_rahasia_acak_yang_panjang"
JWT_EXPIRES_IN="8h"
APP_MODE="self-hosted"
```

> [!IMPORTANT]
> **`APP_MODE`** menentukan cara login:
> * `self-hosted` (default) — satu organisasi per instalasi; login cukup dengan username atau email. Bila database memuat lebih atau kurang dari satu organisasi, login ditolak (`503`).
> * `saas` — banyak organisasi; login dengan **email**, atau **kode organisasi + username**. Tautan `/login?org=demo` mengisi kode organisasi otomatis. Mode ini wajib untuk menjalankan QA runner.
>
> `DEVICE_ACTIVATION_TOKEN` tidak dipakai lagi — fitur MDM dinonaktifkan sampai didesain ulang.

---

## 3. Setup Database & Seeding
Jalankan kontainer database PostgreSQL melalui Docker, lalu bangun skema tabel dan isi data awal (*seed*).

### A. Jalankan PostgreSQL via Docker Compose
```bash
docker-compose up -d
```
Verifikasi kontainer berjalan dengan `docker ps`. pgAdmin tersedia di `http://localhost:8080`.

### B. Terapkan Migrasi Database Prisma
```bash
npx prisma migrate deploy
```

> [!WARNING]
> **Upgrade dari versi 1.x**: riwayat migrasi lama diganti satu migrasi `init` (2.0.0). Database lama harus di-reset dengan `npx prisma migrate reset` — perintah ini **menghapus seluruh data** — lalu di-seed ulang. Semua pengguna wajib login ulang.

### C. Jalankan Database Seeder
```bash
npx prisma db seed
```
Seeder mengosongkan seluruh tabel lalu membuat organisasi **Demo Resto** (kode `demo`): 3 outlet (Bogor (Pusat), Jakarta Selatan, Bandung), 3 divisi (IT, Kitchen, Engineering) beserta kategorinya, 8 pengguna, dan aset contoh. Bila `APP_MODE="saas"`, seeder juga membuat organisasi **Org Uji B** (kode `uji-b`) untuk menguji isolasi.

---

## 4. Menjalankan Aplikasi
```bash
npm run dev
```

Server akan aktif pada alamat **[http://localhost:3000](http://localhost:3000)**.

---

## 5. Skenario Pengujian Fitur (Manual QA)

Akun bawaan organisasi `demo` (pada mode `saas`, isi kolom kode organisasi dengan `demo`, atau login memakai email):

| Username | Password | Peran | Divisi | Outlet |
| :--- | :--- | :--- | :--- | :--- |
| `superadmin` (email `superadmin@demo.local`) | `admin123` | Super Admin | Semua | Semua |
| `admin_it` | `admin123` | Admin Divisi | IT | Bogor |
| `staff_it` | `staff123` | Staf Divisi | IT | Bogor |
| `admin_it_jakarta` | `admin123` | Admin Divisi | IT | Jakarta Selatan |
| `admin_kitchen` | `admin123` | Admin Divisi | Kitchen | Bogor |
| `staff_kitchen` | `staff123` | Staf Divisi | Kitchen | Bogor |
| `admin_engineering` | `admin123` | Admin Divisi | Engineering | Bogor + Jakarta Selatan |
| `teknisi_engineering` | `staff123` | Staf Divisi | Engineering | Bogor + Jakarta Selatan |

Organisasi `uji-b` (mode `saas` saja): `superadmin` / `admin123` dan `admin_it` / `admin123`.

---

### Skenario 1: Pemisahan Divisi & Outlet
1. **Login sebagai `admin_it`**: menu **Aset** hanya memuat aset divisi IT di outlet Bogor. Buka `/assets/asset-chiller-bogor` (aset Kitchen) — harus tampil **Akses Ditolak**.
2. **Login sebagai `admin_it_jakarta`**: hanya aset IT di Jakarta Selatan. Menambahkan `?branchId=branch-bogor` pada URL tidak mengubah hasil (filter diabaikan).
3. **Login sebagai `teknisi_engineering`**: aset Engineering di Bogor **dan** Jakarta Selatan terlihat, di Bandung tidak.
4. **Login sebagai `superadmin`**: filter **Divisi** dan **Cabang** di atas tabel dapat diganti bebas.

---

### Skenario 2: Divisi & Kategori Dinamis
1. **Login sebagai `superadmin`** ➡️ menu **Divisi & Kategori**: tambah divisi "Housekeeping", lalu kategori "Vacuum". Buka **+ Tambah Aset**, pilih divisi Housekeeping — daftar kategori berganti menjadi "Vacuum".
2. Coba hapus divisi **IT** — ditolak dengan pesan jumlah aset dan pengguna yang masih memakainya.
3. **Login sebagai `admin_kitchen`** ➡️ menu **Kategori**: hanya kartu Kitchen yang tampil, tanpa tombol kelola divisi.
4. **Login sebagai `staff_kitchen`**: menu Kategori tidak tampil; membuka `/divisions` langsung menampilkan **Akses Ditolak**.
5. **Menu Pengguna** (`superadmin`): buat staf dengan dua outlet. Kosongkan semua centang outlet — form menolak dan menampilkan galat merah.

---

### Skenario 3: Alur Persetujuan Mutasi Cabang (Transfer)
1. **Login sebagai `staff_it`**: buka `Laptop Dell Latitude 3420` (Bogor) ➡️ **Transfer Aset** ke `Jakarta Selatan`. Lokasi aset **tidak langsung berubah**; transfer tercatat `PENDING`.
2. **Login sebagai `admin_it_jakarta`** (outlet tujuan): transfer terlihat di menu **Transfer**, tetapi tidak dapat disetujui — detail aset masih milik Bogor, dan API persetujuan menolak `403`.
3. **Login sebagai `admin_it`** (outlet asal): buka detail aset tersebut ➡️ **Setujui Transfer**. Aset berpindah ke Jakarta Selatan dalam satu transaksi database.

---

### Skenario 4: BAP Parsial & Penghapusan Aset
1. **Login sebagai `staff_it`**: buka `Kabel LAN Cat6 3m` (50 pcs, Bogor) ➡️ **Ajukan BAP** untuk 5 pcs dari stok Aktif, unggah gambar atau PDF (PDF > 5MB ditolak; gambar dikompresi server ke WebP).
2. Aset tetap **Aktif** dengan 45 pcs siap pakai dan 5 pcs "Dipesan BAP" — sisa stok masih dapat dilaporkan rusak maupun ditransfer.
3. **Login sebagai `admin_it`**: setujui BAP ➡️ total stok menjadi 45 pcs. Bila ditolak, 5 pcs kembali ke bucket asalnya.

---

### Skenario 5: Insiden per pcs
1. **Login sebagai `staff_kitchen`**: menu **Insiden** ➡️ **Buat Tiket Baru** untuk aset Kitchen di Bogor dengan jumlah rusak tertentu. Aset tetap Aktif selama masih ada stok siap pakai.
2. Ajukan penyelesaian (**Ajukan Selesai**) ➡️ **login sebagai `admin_kitchen`** untuk menyetujuinya. Status yang dipilih (Aktif/Perbaikan/Pensiun/Rusak) menentukan ke mana pcs rusak dipindahkan.

---

### Skenario 6: Isolasi Organisasi (mode `saas`)
1. Setel `APP_MODE="saas"`, jalankan `npx prisma db seed`, lalu restart server.
2. Login dengan kode organisasi `uji-b` + `superadmin`: hanya data Org Uji B yang terlihat. Membuka ID aset organisasi `demo` (mis. `/assets/asset-laptop-dell-bogor`) menampilkan halaman tidak ditemukan.
3. Login dengan kode organisasi yang salah menghasilkan pesan generik "Email/username atau password salah".

---

## 6. Menjalankan Pengujian Otomatis
```bash
npm run typecheck && npm run lint && npm run build
npm run test:unit           # unit test fungsi murni
npm run test:integration    # isolasi client tenant terhadap database pengembangan
```

**QA runner API** (`qa-test-runner.ts` + `qa/suites/*`) memverifikasi seluruh aturan bisnis lewat HTTP:
1. Pastikan `.env` berisi `APP_MODE="saas"`, jalankan `npx prisma db seed`, lalu `npm run dev` di port `3000`.
2. Jalankan seluruh suite:
   ```bash
   npm run qa
   ```
3. Atau satu suite saja (`auth`, `divisions`, `assets`, `branches`, `users`, `transfers`, `bap`, `incidents`, `activity`, `mdm`):
   ```bash
   QA_ONLY=transfers npm run qa
   ```
4. Hasil *Pass/Fail* setiap kasus ditampilkan di terminal; proses keluar dengan kode bukan nol bila ada yang gagal. Katalog kasus uji lengkap ada di `CLAUDE.md` §6.
