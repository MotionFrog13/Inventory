# Changelog & Catatan Rilis (Release Notes)

Seluruh perubahan dan catatan rilis untuk proyek **Inventory** didokumentasikan di berkas ini.

## [2.1.0] - 2026-10-01
### 🌐 Rilis Publik Open Source: **Inventory**
- **Nama & merek baru**: aplikasi kini bernama **Inventory**. Seluruh merek perusahaan lama — nama, logo, favicon, dan tema warna emas — dihapus dari kode dan dokumentasi; diganti logo & favicon baru (`public/logo.svg`, `src/app/icon.svg`, `icon.png`, `apple-icon.png`).
- **Tema Indigo**: palet warna kembali ke Indigo sesuai panduan UI (`CLAUDE.md` §7), termasuk halaman login.
- **Lisensi AGPL-3.0** (`LICENSE`), README berbahasa Inggris dengan ringkasan Bahasa Indonesia dan tangkapan layar (`docs/screenshots/`), `CONTRIBUTING.md`, `SECURITY.md`, dan `.env.example`.
- **Sidebar responsif**: di bawah 768px sidebar menjadi laci navigasi (tombol ☰, tutup lewat ✕/backdrop/Escape/berpindah halaman), konten di belakangnya `inert`, header ringkas satu baris.
- **Perbaikan**: logo & favicon kini termuat di halaman login sebelum pengguna masuk (sebelumnya dialihkan proxy ke `/login`).
- **docker-compose**: nama kontainer dan database bawaan menjadi `inventory`.

> ℹ️ Riwayat git dimulai ulang dari satu commit rilis publik. Untuk instalasi lama, `DATABASE_URL` di `.env` tetap berlaku — nama database tidak perlu diganti.

---

## [2.0.0] - 2026-09-30
### 💥 Breaking: Fondasi Multi-Tenant & Divisi Dinamis (Fase 1)
- **Organisasi (tenant)**: setiap data milik satu `Organization`. Isolasi ditegakkan client Prisma terikat organisasi (`src/lib/tenant-db.ts`) dan FK komposit `(organizationId, …)` di database. Data organisasi lain dijawab `404`; ID organisasi lain di payload ditolak `400`.
- **Akses database hanya lewat konteks request**: route memakai `requireUserScope()`, halaman server `getPageContext()` — keduanya membaca peran, divisi, dan outlet dari database setiap request. ESLint menolak impor `@/lib/prisma`, `@/lib/tenant-db`, `PrismaClient`, dan SQL mentah di luar modul auth.
- **Divisi & kategori dinamis**: enum `InventoryType` dan `AssetType` dihapus. Super Admin mengelola divisi; Super Admin dan Admin Divisi mengelola kategori (`/divisions`). Divisi/kategori/cabang yang masih berisi tidak dapat dihapus (`409`).
- **Peran 3 tingkat**: `SUPER_ADMIN`, `DIVISION_ADMIN`, `DIVISION_STAFF` + `User.divisionId`. Label seperti "Admin Kitchen" dibentuk dari tingkat + nama divisi. Super Admin terakhir organisasi tidak dapat diturunkan.
- **Multi-outlet**: pengguna dapat ditugaskan ke beberapa outlet (`UserBranch`). Akun tanpa divisi atau outlet ditolak sepenuhnya (fail closed).
- **Login**: email, atau kode organisasi + username (`APP_MODE=saas`); mode `self-hosted` (default) tanpa kode organisasi. Pesan & waktu gagal seragam. Token lama (peran pra-2.0 atau tanpa `organizationId`) tidak berlaku.
- **Antarmuka**: form aset memilih divisi ➡️ kategori; form pengguna dengan divisi dan centang outlet; laporan per divisi & kategori; dashboard dengan ringkasan per divisi.
- **MDM dinonaktifkan** (`404`) sampai desain ulang per divisi; `DEVICE_ACTIVATION_TOKEN` tidak dipakai lagi.
- **Pengujian**: unit test (`npm run test:unit`), integration test isolasi tenant (`npm run test:integration`), dan QA runner per suite (`QA_ONLY=<suite> npm run qa`) — 53 kasus, termasuk isolasi organisasi (ORG-01..07) dan penolakan token lama (AUTH-02). Selama migrasi, ORG-07 menemukan route log aktivitas yang belum dimigrasikan memuat log seluruh organisasi; route tersebut kini hanya memuat log organisasi sendiri.

> ⚠️ **Dampak**: migrasi lama diganti satu migrasi `init` — database harus di-reset (`npx prisma migrate reset`, **menghapus seluruh data**) lalu di-seed ulang. Tambahkan `APP_MODE` ke `.env`. Semua pengguna wajib login ulang.

---

## [1.2.0] - 2026-08-12
### ♻️ Penyeragaman Penamaan Peran: Holding ➡️ Kitchen
Divisi dapur sudah disebut `KITCHEN` pada enum `InventoryType`, sementara perannya masih bernama `HOLDING` — penamaan ganda ini disatukan.

- **Enum `Role`**: `ADMIN_HOLDING` ➡️ `ADMIN_KITCHEN`, `HOLDING` ➡️ `KITCHEN`.
  Migrasi `20260812000000_rename_holding_role_to_kitchen` memakai `ALTER TYPE ... RENAME VALUE` sehingga baris `User` yang sudah ada terbawa tanpa migrasi data.
- **Akun bawaan**: migrasi `20260812000100_rename_holding_seed_accounts` mengganti `admin_holding` ➡️ `admin_kitchen` dan `holding` ➡️ `kitchen` (idempoten, dengan guard `NOT EXISTS`). Tanpa ini, `prisma db seed` akan meninggalkan akun lama sebagai akun yatim yang masih dapat dipakai login.
- **Label antarmuka**: "Admin Holding" ➡️ "Admin Kitchen", "Holding" ➡️ "Kitchen", opsi form "Holding Division" ➡️ "Kitchen Division", serta ringkasan di halaman Pengguna.
- **Dokumentasi**: `CLAUDE.md`, `README.md`, `AGENTS.md`, `QA.md`, dan `get-started.md` diselaraskan.

### 🔒 Penutupan Celah Eskalasi Hak Akses (ditemukan saat rename)
`getInventoryForRole()` mengembalikan `null` (= tanpa batasan inventaris, jatah `SUPER_ADMIN`) sebagai *fallthrough* untuk peran apa pun yang tidak cocok. Token JWT yang diterbitkan sebelum rename memuat `role: "HOLDING"`, tanda tangannya tetap sah hingga 8 jam, sehingga pemegangnya akan memperoleh **akses penuh ke inventaris IT maupun Kitchen**. Ditutup di dua lapis:

- `getInventoryForRole()` kini memeriksa `SUPER_ADMIN` secara eksplisit dan melempar error untuk peran tak dikenal (fail closed), bukan diam-diam memberi akses penuh.
- `src/proxy.ts` memvalidasi `payload.role` terhadap `VALID_ROLES`; token dengan peran yang sudah tidak ada diperlakukan sebagai tidak valid — cookie dihapus dan pengguna diarahkan ke halaman login.

> ⚠️ **Dampak**: seluruh pengguna divisi dapur wajib login ulang setelah rilis ini.

---

## [1.1.1] - 2026-07-11
### 🐛 Perbaikan Bug & Peningkatan Tipe Data
- **Peningkatan Keamanan Tipe Data (TypeScript)**: Memperbarui fungsi `isAdminRole` dan `isSuperAdmin` di `src/lib/utils.ts` agar menerima parameter `string | null | undefined`. Hal ini memperbaiki error kompilasi TypeScript (`TS2345`) di halaman manajemen cabang (`src/app/branches/page.tsx`) saat memproses `userRole` yang bernilai `null` selama proses pemuatan data sesi berlangsung.

---

## [1.1.0] - 2026-07-01
### 🚀 Penambahan Fitur Keamanan, BAP, Transfer Approval, & Integrasi MDM
Rilis ini membawa pembaruan besar pada sistem inventaris dengan membagi inventory menjadi dua kategori (IT dan Kitchen), memperketat hak akses (RBAC), menambahkan alur pengajuan penghapusan aset (BAP), persetujuan mutasi antar-cabang, serta modul dasar Mobile Device Management (MDM).

### Fitur yang Diterapkan:

#### 📂 Pemisahan Inventaris (IT vs Kitchen)
- Aset kini dipisahkan secara dinamis berdasarkan jenis inventaris: **IT** dan **KITCHEN**.
- Pengguna dengan peran IT (`ADMIN_IT`, `IT_SUPPORT`) hanya dapat mengelola/melihat aset tipe IT.
- Pengguna dengan peran Kitchen/Holding (`ADMIN_HOLDING`, `HOLDING`) hanya dapat mengelola/melihat aset tipe KITCHEN.
- Peran `SUPER_ADMIN` dapat melihat dan menyaring kedua tipe inventaris di antarmuka web.
- Proteksi API untuk mencegah cross-inventory access ilegal (mengembalikan status `403 Forbidden`).

#### 🔐 Peningkatan Sistem Autentikasi & RBAC
- Penambahan dan penyesuaian peran (Roles):
  - **SUPER_ADMIN**: Hak penuh (CRUD cabang, users, all assets, serta menyetujui BAP/mutasi semua divisi).
  - **ADMIN_IT** & **ADMIN_HOLDING**: CRUD aset, insiden, mutasi, serta approval BAP untuk divisi masing-masing. Tidak bisa menghapus cabang atau mengelola divisi lain.
  - **IT_SUPPORT** & **HOLDING**: Mengajukan transfer/BAP, melaporkan insiden, dan melihat aset. Dilarang mengedit spesifikasi aset atau menyetujui BAP/mutasi.

#### 📝 Alur Kerja BAP (Berita Acara Pemeriksaan)
- Form upload dokumen BAP untuk menghapuskan aset yang rusak secara permanen.
- **Kompresi Gambar Otomatis**: Gambar (PNG, JPEG, WebP) dikompresi di sisi server menggunakan `sharp` ke format WebP (kualitas 75%, resolusi maks 1920px).
- **Validasi PDF**: File PDF dibatasi maksimal 5MB.
- Organisasi direktori upload aman: `/public/uploads/bap/YYYY/MM/` menggunakan hash nama acak.
- Pengajuan BAP otomatis mengunci aset (berubah status menjadi `BAP_PENDING`, memblokir edit spesifikasi dan mutasi).
- Pengurangan kuantitas otomatis saat BAP disetujui (Prisma transaction). Jika unit sisa bernilai 0 atau aset single-unit, status berubah menjadi `BAP` (diarsipkan secara permanen).

#### 🛡️ Integrasi MDM (Mobile Device Management)
- Pemetaan satu-ke-satu antara perangkat terkelola (`MdmDevice`) dengan `Asset` tipe IT.
- Bypass middleware cookie untuk check-in/enrollment perangkat agent (`/api/mdm/*`) menggunakan Bearer Token (Device/Activation Token).
- Fitur antrean perintah remote: `LOCK`, `WIPE`, `REBOOT`, `SYNC` yang aman di dalam transaksi database dan hanya bisa dipicu oleh `SUPER_ADMIN` atau `ADMIN_IT`.
- Pencatatan spesifikasi hardware, OS version, status kepatuhan (compliance), level baterai, kapasitas penyimpanan, status enkripsi, dan jailbreak/root detection.

#### 🔄 Alur Persetujuan Mutasi Cabang (Transfer Approval)
- Permintaan transfer aset antar cabang tidak langsung mengubah `branchId`. Aksi ini memicu record `Transfer` berstatus `PENDING`.
- Tombol persetujuan/penolakan (Approve/Reject) hanya tersedia untuk admin terkait.
- Jika disetujui, update lokasi `branchId` dan status `Transfer` dilakukan secara atomik di dalam Prisma transaction (`prisma.$transaction`).

### ⚙️ Infrastruktur & Dependensi
- **Sharp**: Ditambahkan untuk manipulasi dan kompresi gambar server-side.
- **Bcryptjs** & **JSONWebToken**: Digunakan untuk enkripsi password dan token session.
- **Database Migrations**: Penambahan tabel `Bap`, `MdmDevice`, `MdmCommand`, serta perluasan field pada tabel `Asset` (inventory, quantity) dan `User` (roles).
- **Seeder Database**: Diperbarui dengan data uji baru untuk menguji skenario multi-peran dan multi-divisi.

---

## [1.0.0] - 2026-06-28
### 🚀 Rilis Perdana (Initial Release)
Ini adalah rilis perdana dari aplikasi manajemen inventaris perangkat dan aset IT. Aplikasi ini menyatukan pencatatan aset, pelacakan garansi, riwayat mutasi antar cabang, dan penanganan insiden kerusakan dalam satu platform web internal yang modern dan terintegrasi.

### Fitur yang Diterapkan:

#### 🔐 Keamanan & Autentikasi (Authentication)
- Implementasi sistem login berbasis JWT token yang aman dan disimpan dalam *HttpOnly Cookies*.
- Proteksi rute halaman via middleware internal untuk membatasi akses pengguna yang belum masuk.
- Pembagian hak akses (*Role-based Access Control*):
  - **ADMIN**: Akses penuh untuk mengelola cabang, pengguna (staf IT), aset (termasuk penghapusan), dan seluruh tiket insiden/mutasi.
  - **STAFF (IT Support)**: Akses operasional untuk menambah/mengedit aset, melaporkan insiden, memproses mutasi, dan menyelesaikan perbaikan (tanpa izin penghapusan data master).

#### 📊 Dashboard Utama & Peringatan Bisnis (Business Alerts)
- Tampilan ringkasan metrik statistik real-time (Total Aset, Perangkat Rusak, Jumlah Cabang, Tiket Aktif).
- **Business Alerts Widget** otomatis berdasarkan aturan operasional:
  - 🔴 **Broken Asset Pending**: Notifikasi aset rusak yang belum didaftarkan di tiket kerusakan.
  - 🔧 **SLA Overdue**: Peringatan tiket insiden perbaikan aktif yang sudah tertunda lebih dari 7 hari.
  - ⚠️ **Garansi Expiring**: Peringatan untuk perangkat yang masa garansinya habis dalam waktu ≤ 30 hari.

#### 💻 Manajemen Aset IT (Assets Management)
- Sistem pencatatan aset terpusat dengan dukungan berbagai tipe perangkat (CCTV, Printer, PC, Laptop, HP, Server, Router, Switch, dll.).
- Validasi keunikan Serial Number per tipe perangkat untuk mencegah redundansi data.
- Tab Riwayat pada halaman Detail Aset:
  - **Informasi Umum**: Spesifikasi teknis lengkap, tanggal pembelian, dan masa garansi.
  - **Riwayat Insiden**: Kronologi kerusakan dan solusi perbaikan yang pernah diterapkan pada perangkat tersebut.
  - **Riwayat Transfer**: Catatan mutasi fisik unit dari satu lokasi cabang ke cabang lainnya.
- Fitur mutasi lokasi aman berbasis transaksi database (`prisma.$transaction`).

#### 🏢 Manajemen Cabang (Branches Management)
- CRUD cabang secara dinamis untuk memetakan lokasi penempatan perangkat.
- Statistik ringkasan aset (Total, Aktif, Rusak) per cabang.
- Safeguard/proteksi penghapusan cabang yang masih memiliki aset aktif demi integritas data.

#### 🔧 Manajemen Insiden & Tiket Kerusakan (Incidents)
- Pembuatan tiket keluhan kerusakan perangkat lintas cabang secara cepat.
- Pembaruan status perbaikan (*resolved*) lengkap dengan input solusi teknis, durasi aktif, dan teknisi penanggung jawab.

#### 🔄 Log Mutasi Lintas Cabang (Transfers)
- Catatan historis mutasi barang yang tidak dapat diubah (read-only logs) untuk kebutuhan audit.
- Pencatatan informasi cabang asal, cabang tujuan, tanggal transfer, staf pembuat transfer, dan alasan transfer.

#### 📈 Laporan & Analitik (Reports)
- Laporan agregat sebaran tipe aset dan status perangkat.
- Laporan tren tingkat kerusakan bulanan.
- Laporan peringatan garansi habis.

#### 👥 Manajemen Pengguna (Users Management)
- Panel khusus admin untuk menambah, mengedit peran/nama/username, dan melakukan reset password staf IT Support.

### ⚙️ Infrastruktur & Pengembangan
- **Docker Compose**: Konfigurasi PostgreSQL 15-Alpine dan pgAdmin 4 untuk kemudahan setup database lokal.
- **Prisma Schema & Migrations**: Otomatisasi pembuatan skema database relasional.
- **Seeder Database**: Pengisian data uji awal (admin, teknisi, 3 cabang, 10 sample aset, dan beberapa log transfer & insiden).
