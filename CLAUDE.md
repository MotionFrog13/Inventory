# Inventory — Developer & QA Manual (CLAUDE.md)
*Panduan Teknis Senior Developer & Senior QA Tester — Teroptimasi Token*

## 1. Arsitektur & Peran (Senior Developer & Senior QA Tester)
Saat bekerja pada repositori ini, bertindaklah sebagai:
- **Senior Developer**: Menulis kode modular, aman, teroptimasi, aman terhadap kondisi balapan (race conditions) dengan transaksi Prisma, serta memvalidasi input di tingkat API dan database.
- **Senior QA Tester**: Menjamin kepatuhan terhadap aturan bisnis secara agresif, merancang pengujian batas (boundary tests), menguji bypass RBAC, serta memastikan tidak ada kebocoran data antar-organisasi, antar-divisi, maupun antar-outlet.

Aplikasi ini **multi-tenant**: satu instalasi dapat melayani banyak organisasi (mode `saas`) atau tepat satu organisasi (mode `self-hosted`). Divisi dan kategori aset bersifat **dinamis** — dibuat dari antarmuka, bukan enum.

---

## 2. Pemisahan Data (Organisasi × Divisi × Outlet) - PENTING
Setiap akses data dibatasi pada **TIGA sumbu yang berlaku bersamaan**:
1. **Organisasi (tenant)** — setiap baris milik satu `Organization`. Ditegakkan oleh client Prisma terikat organisasi `tenantDb(organizationId)` (`src/lib/tenant-db.ts`) **dan** FK komposit `(organizationId, …)` di database.
2. **Divisi** — `User.divisionId` (divisi dibuat Super Admin; mis. IT, Kitchen, Engineering).
3. **Outlet** — outlet penugasan pengguna lewat tabel `UserBranch` (satu pengguna boleh punya **beberapa** outlet).

Sumbu divisi & outlet diturunkan `resolveScope()` (`src/lib/scope.ts`) yang menjadi **sumber kebenaran tunggal**. Jangan menghitung filter divisi/outlet secara manual di route baru.

### Akses Database — `db` Hanya dari Konteks Request
```ts
// Route handler
const ctx = await requireUserScope(request);
if (!ctx.ok) return ctx.response;            // 401 / 403
const { db, scope, user } = ctx;

// Halaman server
const ctx = await getPageContext();
if (!ctx) return <AccessDenied message={UNASSIGNED_MESSAGE} backHref="/login" backLabel="Kembali ke Halaman Masuk" />;
```
- Keduanya (`src/lib/auth.ts`) membaca pengguna **dari database setiap request** — peran, divisi, dan outlet — sehingga perubahan penugasan langsung berlaku. Peran di dalam token **tidak pernah** dipakai untuk otorisasi.
- `db` adalah client tenant: `organizationId` disuntikkan ke setiap `where`/`create`, `update` yang mencoba memindah `organizationId` dilempar error, operasi yang tidak dikenal dilempar error (fail closed), dan semuanya tetap berlaku di dalam `db.$transaction(...)`.
- **Dilarang** (ditegakkan ESLint, `eslint.config.mjs`): mengimpor `@/lib/prisma`, mengimpor nilai dari `@/lib/tenant-db` (impor `type` boleh), mengimpor `PrismaClient`, dan `$queryRaw`/`$executeRaw`/`$queryRawUnsafe`/`$executeRawUnsafe`. Pengecualian **hanya**: `src/lib/prisma.ts`, `src/lib/tenant-db.ts`, `src/lib/auth.ts`, `src/app/api/auth/**`, `prisma/seed.ts`, `qa-test-runner.ts`, `qa/**`, `tests/**`. Jangan menambah pengecualian — migrasikan kodenya.
- `create` tetap menulis `organizationId: user.organizationId` secara eksplisit (tipe Prisma mewajibkannya; nilainya ditimpa client tenant). FK ditulis sebagai skalar (`branchId: "…"`), bukan `connect`. Nested create hanya untuk tabel anak yang relasinya ke induk memakai FK komposit (mis. `UserBranch` dari `User`).

### Matriks Cakupan
- **`SUPER_ADMIN`** ➡️ seluruh divisi dan seluruh outlet **di organisasinya sendiri**, dengan dropdown filter Divisi & Cabang di antarmuka (`?divisionId=`, `?branchId=`).
- **`DIVISION_ADMIN` / `DIVISION_STAFF`** ➡️ hanya divisinya **dan** outlet-outlet penugasannya (minimal satu).

### Aturan Penugasan — Gagal Tertutup (Fail Closed) - PENTING
- Akun non-`SUPER_ADMIN` **tanpa divisi atau tanpa outlet** ➡️ `resolveScope()` mengembalikan `null` ➡️ API `403` (`UNASSIGNED_MESSAGE`), halaman `<AccessDenied />`, dan `POST /api/auth/login` menolak `403` sejak awal. Tidak pernah diperlakukan sebagai "semua divisi/outlet".
- Hanya `/api/auth/logout` dan `/api/auth/me` yang tetap dapat diakses akun tersebut. `/api/auth/me` mengembalikan `access: "unassigned"`, dan shell aplikasi (`AppLayoutClient`) menampilkan pemberitahuan beserta tombol keluar.
- Peran yang tidak dikenal ➡️ `null` (ditolak), bukan akses penuh.
- Payload JWT: `{ userId, organizationId, username, role, name }`. Token **tanpa** `organizationId` atau dengan peran di luar tiga tingkat (mis. `ADMIN_IT` dari sebelum 2.0.0) tidak valid: cookie dihapus, API `401`, halaman dialihkan ke `/login` (`src/proxy.ts`).
- `POST`/`PUT /api/users` memvalidasi penugasan terhadap peran **final** memakai `validateAssignment()`, lalu memastikan divisi & outlet ada di organisasi lewat `assignmentRefsError()`. `SUPER_ADMIN` selalu berakhir tanpa divisi dan tanpa outlet, dan wajib punya email. Menurunkan `SUPER_ADMIN` terakhir di organisasi ditolak `400`.

### Kode Respons Akses
| Kasus | Respons |
|---|---|
| Data milik organisasi lain | `404` (client tenant tidak menemukannya) — bukan `403`, agar keberadaan data organisasi lain tidak bocor |
| Data divisi lain dalam organisasi sendiri | `403`, message `"Akses ditolak"`, error `"Unauthorized cross-division access detected."` |
| Data outlet lain dalam organisasi sendiri | `403`, message `"Akses ditolak"`, error `"Unauthorized cross-branch access detected."` |
| ID kategori/cabang/divisi/pengguna milik organisasi lain di payload | `400` (tidak ditemukan) — tidak ada baris yang dibuat |
| Akun non-`SUPER_ADMIN` tanpa divisi atau outlet | API `403`, halaman `<AccessDenied />`, login `403` |

Guard satu aset memakai `assetAccessDenied(scope, asset)`, yang memeriksa divisi lalu outlet sekaligus.

### Aturan Transfer Antar-Outlet:
- **Melihat**: pengguna ber-outlet melihat mutasi pada **kedua sisi** — keluar dari outletnya (`fromBranchId`) maupun masuk ke outletnya (`toBranchId`), dalam divisinya. Gunakan `transferScopeWhere()`.
- **Mengajukan**: hanya atas aset yang berada di salah satu outletnya (dijaga `assetAccessDenied()` pada `POST /api/assets/[id]/transfer`). Cabang **tujuan** boleh cabang mana pun **di organisasi yang sama** (cabang organisasi lain ➡️ `400`).
- **Menyetujui/Menolak**: hanya admin **outlet asal** (`canApproveTransfer()`: `fromBranchId` ∈ outlet pengguna) — pesan `"Hanya admin outlet asal yang dapat menyetujui mutasi ini."`. Outlet tujuan tidak boleh menarik aset milik cabang lain dengan menyetujui permintaannya sendiri. Admin yang memegang outlet asal **dan** tujuan boleh menyetujui mutasinya.

### Kelola Divisi, Kategori, Cabang & Pengguna
- **Divisi**: hanya `SUPER_ADMIN` (`/api/divisions`, `/api/divisions/[id]`).
- **Kategori**: `SUPER_ADMIN`, atau `DIVISION_ADMIN` untuk divisinya sendiri (`canManageCategories()`; `/api/divisions/[id]/categories`, `/api/categories/[id]`). Admin divisi lain dan staf ➡️ `403`.
- **Cabang & Pengguna**: hanya `SUPER_ADMIN`.
- **Aturan hapus** (`409` beserta jumlah penghalang): kategori hanya bila tanpa aset; divisi hanya bila tanpa aset **dan** tanpa pengguna (kategori kosongnya ikut terhapus); cabang hanya bila tanpa aset **dan** tanpa pengguna yang ditugaskan.
- **Nama unik**: divisi per organisasi, kategori per divisi, cabang per organisasi. Nomor seri unik per kategori.
- **Divisi aset tidak dapat diubah** setelah dibuat; kategori hanya dapat diganti ke kategori lain di divisi yang sama (dijamin FK `(divisionId, categoryId)`).

### Aturan Keamanan Database & API:
- Setiap *query* dan *mutasi* pada route aset, insiden, BAP, dokumen unggahan (`/api/uploads`), transfer, laporan, dan `/api/branches/[id]` **wajib** memakai `db` dari konteks request **dan** helper `src/lib/scope.ts` — `assetScopeWhere()`, `assetRelationScopeWhere()`, `transferScopeWhere()`, `assetAccessDenied()`, `divisionAccessError()` — jangan menyusun filter secara manual.
- Parameter `?branchId=` dan `?divisionId=` dari klien **tidak boleh dipercaya**: `effectiveBranchFilter()` hanya menghormati outlet milik pengguna, `effectiveDivisionFilter()` hanya menghormati pilihan `SUPER_ADMIN`. Filter di antarmuka tidak boleh menjadi jalan memperluas akses.
- `GET /api/branches` mengembalikan hanya outlet pengguna. Gunakan `?all=1` **khusus** untuk daftar cabang **tujuan transfer** dan penugasan outlet di halaman Pengguna — nama/lokasi cabang bukan data inventaris, sedangkan hitungan asetnya tetap mengikuti cakupan pengguna.
- `GET /api/branches/[id]` menolak `403` bila pengguna ber-outlet membuka cabang selain outletnya, dan `404` untuk cabang organisasi lain.
- **Akses Halaman & API Activity Log**: API `/api/activity-logs` dan halaman `/activity-logs` **hanya** dapat diakses oleh `SUPER_ADMIN`, dan hanya memuat log **organisasinya sendiri**. Peran lain diblokir `403 Forbidden` (pesan `"Akses ditolak"`).

### Aturan Tampilan & Validasi UI/Frontend:
- **Form Tambah & Edit Aset**:
  - `SUPER_ADMIN` memilih **Divisi**, lalu daftar **Kategori** menyesuaikan divisi terpilih (mengganti divisi mengosongkan kategori). `DIVISION_ADMIN` melihat divisinya sebagai label mati.
  - Divisi tanpa kategori ➡️ pesan kosong beserta tautan ke `/divisions`.
  - Form edit: divisi hanya ditampilkan; kategori hanya dari divisi yang sama.
- **Pelepasan Akses Non-Admin (RBAC di UI)**:
  - Tombol "+ Tambah Aset" dan akses ke form `/assets/new` atau `/assets/[id]/edit` **wajib** disembunyikan/dilarang untuk `DIVISION_STAFF`. Tampilkan pesan "Akses Ditolak" jika mereka mengakses URL secara langsung.
- **Penguncian Outlet pada Form**:
  - Pengguna dengan satu outlet: `branchId` **diisi otomatis** dan pemilih cabang diganti keterangan mati. Pengguna dengan beberapa outlet memilih dari outletnya sendiri; `SUPER_ADMIN` dari seluruh cabang.
  - `POST /api/assets` menolak `403` bila `branchId` bukan outlet pengguna — ditolak, bukan diam-diam ditimpa, agar salah pilih terlihat jelas. Tanpa `branchId`: otomatis bila pengguna punya satu outlet, `400` bila punya beberapa.
  - Filter di halaman `/assets`: Divisi (hanya `SUPER_ADMIN`), Kategori, Cabang (label mati bila hanya satu outlet), Status.
- **Pemisahan Riwayat Transfer**:
  - Halaman `/transfers` wajib menerapkan cakupan di tingkat server query Prisma (`getPageContext()` ➡️ `transferScopeWhere()`), sama seperti endpoint API `/api/transfers`.
- **Halaman Server Wajib Punya Guard Sendiri**:
  - Halaman yang melakukan query Prisma langsung (`/`, `/assets`, `/assets/[id]`, `/assets/[id]/edit`, `/branches/[id]`, `/transfers`) **wajib** memanggil `getPageContext()` sendiri — middleware saja tidak cukup karena ia tidak tahu data mana yang dibaca halaman tersebut. Penolakan dirender memakai komponen bersama `<AccessDenied />`; ID organisasi lain ➡️ `notFound()`.
- **Halaman Pengguna** (`/users`, khusus `SUPER_ADMIN`): pilihan peran tiga tingkat; pilihan Divisi dan daftar centang Outlet (minimal satu, galat merah bila kosong) disembunyikan untuk Super Admin; email wajib untuk Super Admin.
- **Sidebar**: "Divisi & Kategori" (`SUPER_ADMIN`), "Kategori" (`DIVISION_ADMIN`), "Pengguna" dan "Log Aktivitas" (**hanya** `SUPER_ADMIN`). Header Sidebar memuat nama organisasi dan cakupan (divisi · outlet).
- **Label Dinamis**: judul/subtitle memakai nama divisi (`divisionScopeLabel()`, "Semua Divisi" untuk Super Admin) dan outlet (`branchScopeLabel()`); label peran dibentuk `roleLabel(role, divisionName)` — "Super Admin", "Admin {divisi}", "Staf {divisi}".

### Login & `APP_MODE`
| | `self-hosted` (default) | `saas` |
|---|---|---|
| Form login | Username atau email + password | Email + password, **atau** kode organisasi + username + password |
| Resolusi organisasi | Satu-satunya organisasi di database; bila jumlahnya bukan satu ➡️ `503` (fail closed) | Dari email, atau dari `Organization.slug` (kode organisasi) |
| Kemudahan | – | `/login?org=demo` mengisi kode organisasi; kode terakhir diingat di `localStorage` |

- Seluruh kegagalan login dibalas `401` dengan pesan seragam `"Email/username atau password salah"`; bila pengguna tidak ditemukan, `bcrypt.compare` tetap dijalankan terhadap hash dummy agar waktu respons setara.
- Username `^[a-z0-9._-]{3,32}$` (tanpa `@`, unik per organisasi) — input yang memuat `@` selalu diperlakukan sebagai email. Email unik global. Kode organisasi `^[a-z0-9-]{3,32}$`, unik global.

---

## 3. Skema Data Ringkas (Token-Efficient Reference)
*Lihat schema lengkap di `prisma/schema.prisma`.*
- **Organization**: ID, Name, Slug (kode organisasi).
- **Division**: ID, Name (unik per organisasi), Description.
- **Category**: ID, DivisionId, Name (unik per divisi).
- **Branch**: ID, Name (unik per organisasi), Location.
- **User**: ID, Username (unik per organisasi), Email (opsional, unik global; wajib `SUPER_ADMIN`), Role (`SUPER_ADMIN`, `DIVISION_ADMIN`, `DIVISION_STAFF`), DivisionId (nullable), outlet lewat **UserBranch** (UserId, BranchId).
- **Asset**: ID, Name, DivisionId, CategoryId, BranchId, SerialNumber (unik per kategori), Status (ACTIVE, BROKEN, REPAIR, RETIRED, BAP_PENDING, BAP), **Stok**: Quantity (total) + ActiveQty + BrokenQty + RepairQty + RetiredQty + ReservedQty.
- **Bap**: ID, AssetId, Quantity, SourceCondition (ACTIVE|BROKEN|REPAIR|RETIRED), FileUrl (`/uploads/bap/YYYY/MM/<uuid>.(pdf|webp)`; berkasnya di `UPLOAD_DIR`, bukan `public/`), Status (PENDING, APPROVED, REJECTED).
- **Transfer**: ID, AssetId, FromBranchId, ToBranchId, Status (PENDING, APPROVED, REJECTED).
- **Incident**: ID, AssetId, **Quantity (jumlah pcs rusak)**, Description, Solution, ResolveStatus.
- **ActivityLog**: ID, UserId (nullable), Username, Action, Details, IpAddress (nullable), CreatedAt.
- **MdmDevice / MdmCommand**: tabel tetap ada, route-nya dinonaktifkan (§4.C).

**Aturan model:** setiap model kecuali `Organization` punya `organizationId`, dan nilainya tidak pernah diambil dari input klien. Relasi wajib memakai **FK komposit** `(organizationId, …)` sehingga database sendiri menolak referensi lintas organisasi; `Asset` ➡️ `Category` memakai `(divisionId, categoryId)` sehingga kategori tidak bisa berasal dari divisi lain. Relasi opsional (`User.divisionId`, `Bap.approvedById`, `Transfer.approvedById`, `ActivityLog.userId`) memakai FK biasa dan divalidasi aplikasi lewat client tenant.

### Model Stok per Kondisi — PENTING
Satu baris `Asset` mewakili **satu item ber-stok** (mis. "Sumpit Kayu" 100 pcs di outlet Jakarta), bukan satu unit fisik. Aturan wajib:

- **Invariant**: `quantity = activeQty + brokenQty + repairQty + retiredQty + reservedQty`. Setiap mutasi stok WAJIB melewati helper di `src/lib/stock.ts` (`moveStock`, `removeStock`, `stockUpdateData`) agar invariant ini tidak pernah pecah.
- **Status adalah turunan**, bukan input. `deriveAssetStatus()` menentukannya dengan prioritas: stok habis → `BAP`; ada `activeQty` → `ACTIVE`; lalu `BROKEN` → `REPAIR` → `RETIRED`; bila seluruh sisa stok terkunci pengajuan BAP → `BAP_PENDING`. Selama masih ada stok siap pakai, item **tetap tampil aktif dengan jumlah berkurang**.
- **`reservedQty`** menampung pcs yang dikunci pengajuan BAP berstatus `PENDING`. Pcs tersebut keluar dari bucket asalnya sehingga tidak bisa dilaporkan rusak atau di-BAP dua kali, namun **sisa stok tetap dapat dipakai, dilaporkan rusak, dan ditransfer**.
- **Aset unit tunggal** tetap bekerja tanpa perlakuan khusus: `quantity = 1` dan salah satu bucket berisi 1.
- **`Asset.status` hanya boleh diset manual** lewat `POST /api/assets` (menentukan bucket stok awal) dan `PUT /api/assets/[id]` **khusus item unit tunggal tanpa reservasi**. Untuk item ber-stok banyak, `PUT` menolak `status` yang berbeda dari status turunannya dengan `400`.
- **Penambahan/pengurangan total stok** lewat `PUT /api/assets/[id]` hanya menyentuh bucket Aktif. Pengurangan yang melebihi `activeQty` ditolak `400` — stok rusak/perbaikan/pensiun hanya boleh hilang melalui alur BAP agar selalu ada bukti dokumen.

---

## 4. Alur Kerja & Aturan Bisnis (Business Rules)

### Matriks Peran
| Aksi | `SUPER_ADMIN` | `DIVISION_ADMIN` | `DIVISION_STAFF` |
|---|---|---|---|
| Lihat aset, insiden, BAP, transfer | Semua (organisasinya) | Divisi + outletnya | Divisi + outletnya |
| Tambah/edit aset | ✓ | ✓ (divisi + outletnya) | ✗ |
| Lapor insiden, ajukan BAP/transfer | ✓ | ✓ | ✓ |
| Setujui/tolak BAP & penyelesaian insiden | ✓ | ✓ (divisinya) | ✗ |
| Setujui/tolak transfer | ✓ | ✓ (outlet asal ∈ outletnya) | ✗ |
| Tambah/ubah/hapus kategori | ✓ | ✓ (divisinya) | ✗ |
| Tambah/ubah/hapus divisi, cabang, pengguna | ✓ | ✗ | ✗ |
| Activity log, hapus insiden | ✓ | ✗ | ✗ |

`isAdminRole(role)` = `SUPER_ADMIN` atau `DIVISION_ADMIN`.

### A. Alur Mutasi / Transfer Aset
1. **Pengajuan**: Staf/Admin mengajukan transfer ➡️ Membuat record `Transfer` dengan status `PENDING`. Lokasi aset (`Asset.branchId`) **tidak boleh berubah** pada tahap ini.
2. **Persetujuan**: Hanya Admin divisi bersangkutan (`DIVISION_ADMIN` outlet asal) atau `SUPER_ADMIN` yang dapat menyetujui/menolak (lihat §2 Aturan Transfer).
3. **Eksekusi**: Persetujuan transfer memperbarui status Transfer menjadi `APPROVED` dan memindahkan `Asset.branchId` ke cabang target di dalam **Prisma Transaction (`db.$transaction`)**.

### B. Alur BAP (Penghapusan / Pemutihan Aset)
1. **Pengajuan**: Mengunggah dokumen BAP (PDF maks 5MB, Gambar dikompresi ke WebP 75% maks 1920px), disertai **jumlah pcs** dan **bucket stok asal** (`sourceCondition`: Aktif / Rusak / Perbaikan / Pensiun). Contoh: 10 dari 100 pcs sumpit **hilang** diajukan dari stok Aktif. Pcs yang diajukan pindah ke `reservedQty`. Dokumennya disimpan di luar `public/` dan hanya dapat dibuka pengguna yang berhak atas aset tersebut (lihat §5 "Berkas Unggahan Tidak Pernah di `public/`").
2. **Kondisi Terkunci — hanya sebesar yang diajukan**: pcs di `reservedQty` tidak dapat dipakai, dilaporkan rusak, atau diajukan BAP lagi. **Sisa stok tetap bebas** dipakai, dilaporkan rusak, dan ditransfer. Aset baru terkunci sepenuhnya (status `BAP_PENDING` → tidak dapat diedit/dimutasi) ketika **seluruh sisa stok** habis dipesan pengajuan tersebut.
3. **Satu pengajuan `PENDING` per aset** pada satu waktu (dijaga di dalam transaksi).
4. **Persetujuan (Admin Divisi / Super Admin)**:
   - Jika disetujui: Status BAP menjadi `APPROVED`. `reservedQty` **dan** `quantity` sama-sama berkurang sebesar kuantitas BAP — pcs keluar permanen dari inventaris. Status aset menyusul komposisi stok tersisa; menjadi `BAP` hanya ketika total stok mencapai 0.
   - Jika ditolak: Status BAP menjadi `REJECTED`, dan pcs dikembalikan **ke bucket asalnya** (`sourceCondition`) — bukan otomatis ke stok Aktif.
5. **Aset dengan status `BAP`** (stok habis) dikeluarkan dari perhitungan aktif cabang.

### C. Integrasi MDM (Mobile Device Management) — DINONAKTIFKAN
- Seluruh route MDM (`/api/mdm/enroll`, `/api/mdm/check-in`, `/api/assets/[id]/mdm`, `/api/assets/[id]/mdm/command`) adalah stub yang **selalu membalas `404`** (`mdmDisabledResponse()` di `src/lib/mdm.ts`) sampai MDM didesain ulang per divisi. Kode lama tersedia di riwayat git sebagai referensi.
- Tabel `MdmDevice` dan `MdmCommand` tetap ada dengan `organizationId` dan FK komposit, agar desain ulang tidak perlu mengubah tabel inti. `DEVICE_ACTIVATION_TOKEN` tidak dipakai lagi.
- Jangan menambah fitur MDM baru sebelum desainnya disetujui.

### D. Alur Activity Log (Log Aktivitas)
1. **Perekaman Log Otomatis**: Sistem secara otomatis mencatat aktivitas penting (misal: login, logout, penambahan/perubahan/penghapusan aset, divisi, kategori, cabang, dan pengguna, pengajuan/persetujuan/penolakan BAP dan transfer, pelaporan/penyelesaian insiden).
2. **Hanya Dapat Dilihat oleh Super Admin**, dan hanya log organisasinya sendiri. Pengguna dengan peran lain tidak boleh melihat menu/halaman ini.
3. **Sifat Read-Only (Tidak Dapat Di-edit)**: Log aktivitas adalah data historis permanen yang tidak memiliki fungsi atau endpoint untuk menambah secara manual (via form), memperbarui (update), maupun menghapus (delete). Tidak boleh ada form penyuntingan atau tombol hapus pada UI, serta tidak boleh ada metode API `POST`, `PUT`, `PATCH`, atau `DELETE` untuk data log aktivitas (selain pencatatan otomatis di backend).

### E. Alur Pelaporan & Penyelesaian Insiden
1. **Pelaporan Kerusakan**: Form insiden wajib menyertakan **jumlah pcs yang rusak** (`quantity`, default 1). Sejumlah itu dipindah dari `activeQty` ke `brokenQty` (pemindahan dibatasi isi bucket Aktif, sehingga pcs yang sudah tercatat rusak tidak dihitung dua kali).
   - **Selama masih ada `activeQty`, status aset tetap `ACTIVE`** — hanya jumlah stok siap pakainya yang berkurang. Status baru menjadi `BROKEN` ketika seluruh stok habis dinyatakan rusak.
   - Validasi: `quantity` ≤ `quantity − reservedQty − retiredQty`. Stok yang sedang diajukan BAP dan stok pensiun tidak dapat dilaporkan rusak (`400`).
2. **Penyelesaian Insiden** — endpoint `PUT /api/incidents/[id]` bersifat multi-aksi (`action`):
   - `propose` (`DIVISION_STAFF`): mengajukan penyelesaian. Menyimpan `pendingSolution` + `pendingAssetStatus` dan menyetel `resolveStatus = PENDING_REVIEW`. Status aset **belum** berubah.
   - `approve` (Admin divisi / Super Admin): menyetujui pengajuan. Solusi dan status aset yang diusulkan diterapkan di dalam satu transaksi.
   - `reject` (Admin divisi / Super Admin): menolak pengajuan; field pending dibersihkan dan insiden dapat diajukan ulang.
   - `resolve` (Admin divisi / Super Admin): menyelesaikan langsung tanpa melalui pengajuan.
3. **Aturan Umum Penyelesaian**: solusi perbaikan wajib diisi. Status yang dipilih menentukan **bucket tujuan** perpindahan `incident.quantity` pcs dari `brokenQty`:
   - `ACTIVE`: pcs kembali ke stok siap pakai (`activeQty`).
   - `REPAIR`: pcs pindah ke `repairQty` (sedang diperbaiki/servis).
   - `RETIRED`: pcs pindah ke `retiredQty` (tidak digunakan lagi, masih tercatat sebagai milik).
   - `BROKEN`: pcs tetap di `brokenQty` (diagnosa selesai, perbaikan belum tuntas).
   Pemindahan selalu dibatasi isi `brokenQty` sehingga tidak pernah menghasilkan angka negatif.
4. **Penguncian BAP**: `approve` dan `resolve` ditolak ketika status aset `BAP_PENDING` atau `BAP` — yaitu ketika **seluruh sisa stok** terkunci pengajuan BAP atau stok sudah habis (lihat §4.B.2). BAP parsial **tidak** memblokir resolusi insiden atas pcs lain yang masih ada.
5. **Penghapusan insiden** (`DELETE`, Super Admin): insiden yang **belum** diselesaikan mengembalikan `incident.quantity` pcs dari `brokenQty` ke `activeQty`. Insiden yang sudah selesai tidak memindahkan apa pun (pcs-nya sudah dipindah saat resolusi).

---

## 5. Panduan Implementasi & Keamanan (Senior Developer Checklist)
- [ ] **`db` dari Konteks Request**: Route memakai `requireUserScope(request)`, halaman server memakai `getPageContext()`. Jangan pernah mengimpor `@/lib/prisma`/`@/lib/tenant-db` atau memakai SQL mentah — `npm run lint` wajib bersih.
- [ ] **Resep Route**: panggil konteks paling awal ➡️ guard peran ➡️ guard akses (`assetAccessDenied()`/`divisionAccessError()`) ➡️ validasi bisnis ➡️ mutasi (transaksi bila lebih dari satu tulis) ➡️ `writeActivityLog(ctx, …)` ➡️ respons.
- [ ] **Cakupan Lewat Helper `scope.ts`**: Jangan pernah membaca `user.branches`/`user.divisionId` mentah untuk membangun `where`. Gunakan `assetScopeWhere()`, `assetRelationScopeWhere()`, `transferScopeWhere()`, `effectiveBranchFilter()`, `effectiveDivisionFilter()`, dan `assetAccessDenied()` agar sumbu divisi & outlet selalu terpasang bersamaan.
- [ ] **`organizationId` Eksplisit pada Create**: tulis `organizationId: user.organizationId` pada setiap `create`, dan jangan pernah mengambil `organizationId` dari body/query klien.
- [ ] **Model Baru Wajib Ber-tenant**: setiap model baru (kecuali `Organization`) wajib punya `organizationId`, `@@unique([organizationId, id])` bila menjadi target relasi, dan FK komposit `(organizationId, …)` untuk relasi wajib. Integration test `tests/integration/tenant-db.test.ts` memeriksa kolom ini.
- [ ] **Referensi dari Payload Divalidasi Lewat Client Tenant**: ID kategori/cabang/divisi/pengguna di body dicari lewat `db` — milik organisasi lain tidak ditemukan ➡️ `400`, bukan diteruskan ke database.
- [ ] **Guard Dipasang Sebelum Validasi Lain**: Pemeriksaan akses organisasi/divisi/outlet wajib dijalankan **sebelum** validasi bisnis yang pesannya memuat detail data (mis. jumlah stok pada persetujuan BAP), agar isi data outlet lain tidak bocor lewat pesan galat.
- [ ] **Next.js Caching Gotchas**: Wajib ekspor `export const dynamic = "force-dynamic"` di setiap API endpoint dinamis yang membaca cookies/headers untuk mencegah cache statis Next.js.
- [ ] **Transaksi Database**: Mutasi persetujuan Transfer dan BAP harus dibungkus dengan `db.$transaction` (client tenant tetap berlaku di dalamnya).
- [ ] **Kompresi File BAP**: Gunakan library `sharp` di server-side sebelum menyimpan file gambar BAP ke `<UPLOAD_ROOT>/bap/[Year]/[Month]/[Hash].webp` (`src/lib/uploads.ts`; `fileUrl` = `/uploads/bap/...`).
- [ ] **Berkas Unggahan Tidak Pernah di `public/`**: dokumen BAP disimpan di `UPLOAD_DIR` (bawaan `uploads/`) dan dibuka lewat `/uploads/...`, yang di-rewrite (`beforeFiles`, `next.config.ts`) ke `GET /api/uploads/[...path]`. Route itu mencari `Bap` lewat `db` (organisasi lain ➡️ `404`) lalu `assetAccessDenied()` atas aset pemiliknya (divisi/outlet lain ➡️ `403`). Jangan menambahkan `/uploads` ke `SKIP_PATTERNS` di `src/proxy.ts`, dan jangan menulis unggahan ke `public/` — Next.js akan melayaninya tanpa cek akses (dan, di `next start`, hanya berkas yang sudah ada saat server menyala).
- [ ] **Penanganan Tanggal**: Tanggal disimpan dalam UTC dan diformat ke WIB (UTC+7) pada saat rendering frontend.
- [ ] **Pencegahan Mutasi Activity Log**: Pastikan API `/api/activity-logs` hanya melayani metode `GET` untuk mengambil data log. Tolak metode `POST`, `PUT`, `PATCH`, dan `DELETE` dengan status `405 Method Not Allowed`.
- [ ] **Logger Utility Terpusat**: Gunakan `writeActivityLog(ctx, action, details, request)` (`src/lib/logger.ts`) — `organizationId` dan identitas pelaku diambil dari konteks request, dan alamat IP diturunkan sendiri oleh helper dari header `cf-connecting-ip` (diisi Cloudflare Tunnel), lalu `x-forwarded-for`.
- [ ] **Header Identitas Tidak Boleh Dipercaya**: header `x-user-*` (`x-user-id`, `x-user-org`, `x-user-role`, `x-user-name`, `x-user-username`) **hanya** boleh diisi oleh middleware (`src/proxy.ts`), yang wajib menghapusnya dari setiap request masuk sebelum percabangan apa pun. Jangan pernah melewati (bypass) middleware berdasarkan header yang dapat dikirim klien (mis. `x-next-prerender`) — gunakan env var server-side seperti `NEXT_PHASE`.
- [ ] **Guard Atomik untuk Persetujuan**: Mutasi approve/reject (BAP, Transfer) wajib memakai `updateMany({ where: { id, status: "PENDING" } })` di dalam transaksi dan memeriksa `count === 0`, agar dua persetujuan bersamaan tidak sama-sama lolos (TOCTOU).
- [ ] **Riwayat BAP Bersifat Append-Only**: Relasi `Asset` ↔ `Bap` adalah one-to-many. Dokumen BAP yang sudah `APPROVED` **tidak boleh** dihapus atau ditimpa oleh pengajuan baru — aset massal dapat di-BAP secara bertahap dan setiap dokumen adalah bukti penghapusan.
- [ ] **Mutasi Stok Lewat Helper**: Jangan pernah menulis kolom `activeQty`/`brokenQty`/`repairQty`/`retiredQty`/`reservedQty`/`status` secara manual. Gunakan `moveStock()`, `removeStock()`, `initialStock()`, lalu tulis dengan `stockUpdateData()` (`src/lib/stock.ts`) agar invariant total stok dan status turunan selalu konsisten.
- [ ] **Hitungan Agregat dalam Satuan pcs**: Statistik kondisi (dashboard, halaman Cabang) wajib menjumlahkan bucket stok (`_sum`), bukan menghitung baris aset per `status`. Item dengan 92 pcs aktif + 8 pcs rusak berstatus `ACTIVE`, sehingga hitungan per baris akan menyembunyikan kerusakan sebagian.
- [ ] **Deteksi Pengajuan BAP Lewat Baris `Bap`**: Tombol persetujuan dan hitungan "BAP menunggu" harus memeriksa `Bap.status = PENDING`, **bukan** `Asset.status = BAP_PENDING` — BAP parsial menyisakan aset berstatus `ACTIVE`.
- [ ] **Validasi Resolusi Insiden**: Saat menyelesaikan insiden (`PUT /api/incidents/[id]`), pastikan status aset yang dikirim divalidasi terhadap daftar status yang diperbolehkan (`ACTIVE`, `REPAIR`, `RETIRED`, `BROKEN`).
- [ ] **Respon Konsisten**:
  - Sukses: `{ "success": true, "data": ..., "message": "..." }`
  - Gagal: `{ "success": false, "error": "...", "message": "..." }`

---

## 6. Protokol Verifikasi & Skenario Pengujian (Senior QA Tester Checklist)
Jalankan seluruh lapisan pengujian sebelum menyatakan perubahan selesai:
```bash
npm run typecheck && npm run lint && npm run build
npm run test:unit          # fungsi murni scope.ts & utils.ts (node:test)
npm run test:integration   # isolasi client tenant terhadap database pengembangan
npx prisma db seed         # data bersih; APP_MODE="saas" membuat organisasi kedua (uji-b)
npm run qa                 # QA API & integrasi — server dev harus berjalan di :3000
QA_ONLY=transfers npm run qa   # satu suite: auth, divisions, assets, branches, users, transfers, bap, incidents, activity, mdm
```
Dengan Docker (`docs/docker.md`): `DEV_APP_MODE=saas` di `docker/.env` ➡️ `docker-dev.bat` ➡️ `docker-dev.bat seed`, lalu jalankan QA dari host dengan `DATABASE_URL="postgresql://postgres:postgres@localhost:55432/inventory?schema=public"` — QA runner menulis langsung ke database, jadi jangan arahkan ke database lain.

QA runner membutuhkan `APP_MODE="saas"`. Akun uji: kode organisasi `demo` (lihat README) dan `uji-b` (`superadmin`, `admin_it` — username sengaja sama dengan organisasi `demo`).

### A. Pengujian Keamanan Sesi & RBAC
- **[TC-AUTH-01]** Request tanpa cookie yang memalsukan header identitas (`x-user-role: SUPER_ADMIN` disertai `x-next-prerender`) **harus** ditolak `401`/`403`.
- **[TC-AUTH-02]** Token bertanda tangan sah berformat lama (peran `ADMIN_IT` atau tanpa `organizationId`) ➡️ API `401`, halaman dialihkan ke `/login`, cookie dihapus.
- **[TC-RBAC-01]** Staf (`DIVISION_STAFF`) tidak dapat mengedit spesifikasi aset (`403`).
- **[TC-RBAC-02]** Staf tidak dapat menyetujui/menolak BAP (`403`).
- **[TC-RBAC-03]** Staf tidak dapat menyetujui/menolak transfer aset (`403`).
- **[TC-RBAC-04]** Pengguna non-Super Admin diblokir dari API `/api/activity-logs` maupun halaman `/activity-logs` (`403`).

### B. Pengujian Isolasi Organisasi (Tenant)
- **[TC-ORG-01]** `GET /api/assets` sebagai pengguna `demo` tidak memuat aset `uji-b`; `pagination.total` hanya menghitung `demo`.
- **[TC-ORG-02]** `GET`/`PUT`/`DELETE /api/assets/[id-uji-b]` sebagai Super Admin `demo` ➡️ `404` tanpa data.
- **[TC-ORG-03]** `POST /api/assets` dengan `categoryId`/`branchId` milik `uji-b` ➡️ `400`, tidak ada baris dibuat.
- **[TC-ORG-04]** Transfer dengan `toBranchId` milik `uji-b` ➡️ `400`.
- **[TC-ORG-05]** Persetujuan transfer (a) dan BAP (b) atas ID milik `uji-b` ➡️ `404`, data & reservasi tidak berubah.
- **[TC-ORG-06]** Kode organisasi menentukan akun (username sama di dua organisasi); kode salah/tidak terdaftar ➡️ `401` dengan pesan generik yang sama.
- **[TC-ORG-07]** Log aktivitas hanya memuat organisasi sendiri.

### C. Pengujian Pemisahan Divisi & Kelola Divisi
- **[TC-SEP-01]** Admin IT diblokir dari aset divisi Kitchen (`403`, cross-division).
- **[TC-SEP-02]** Admin Kitchen diblokir dari aset divisi IT (`403`).
- **[TC-SEP-03]** `SUPER_ADMIN` dapat melihat dan mengelola aset seluruh divisi.
- **[TC-DIV-01]** CRUD divisi hanya `SUPER_ADMIN` (admin divisi & staf `403`).
- **[TC-DIV-02]** Admin divisi mengelola kategori divisinya sendiri; kategori divisi lain `403`.
- **[TC-DIV-03]** Membuat/mengubah aset dengan kategori dari divisi lain ➡️ `400`.
- **[TC-DIV-04]** Divisi/kategori (a) dan cabang (b) yang masih berisi tidak dapat dihapus (`409` beserta jumlah penghalang); yang kosong dapat dihapus.

### D. Pengujian Pemisahan Outlet & Penugasan Pengguna
- **[TC-BR-01]** `GET /api/assets` sebagai `admin_it_jakarta` tidak memuat aset outlet Bogor; `pagination.total` hanya menghitung outletnya.
- **[TC-BR-02]** `GET /api/assets/[id]` atas aset outlet lain ➡️ `403` dengan error `"Unauthorized cross-branch access detected."`.
- **[TC-BR-03]** `POST /api/assets` dengan `branchId` outlet lain ➡️ `403`; tanpa `branchId` aset dibuat di satu-satunya outlet pengguna, sedangkan pemegang beberapa outlet ➡️ `400`.
- **[TC-BR-04]** `?branchId=<outlet-lain>` **diabaikan** untuk pengguna ber-outlet — hasilnya tetap aset outletnya sendiri.
- **[TC-BR-05]** `POST /api/incidents` atas aset outlet lain ➡️ `403`, tidak ada bucket stok yang berubah.
- **[TC-BR-06]** `GET /api/branches/[id]` atas cabang lain ➡️ `403`.
- **[TC-USR-01]** Akun non-Super Admin tanpa divisi atau tanpa outlet ditolak `400`; Super Admin wajib email.
- **[TC-USR-02]** Penugasan dicabut setelah login ➡️ seluruh API `403` (kecuali logout & me), `/api/auth/me` ➡️ `access: "unassigned"`, login berikutnya `403`.
- **[TC-USR-03]** Staf multi-outlet (`teknisi_engineering`) melihat aset divisinya di Bogor & Jakarta Selatan, tidak di Bandung.
- **[TC-USR-04]** Super Admin terakhir organisasi tidak dapat diturunkan (`400`).

### E. Pengujian Transfer Antar-Outlet
- **[TC-MUT-01]** Pengajuan membuat transfer `PENDING`; persetujuan memindahkan `Asset.branchId` di dalam satu transaksi.
- **[TC-MUT-02]** Penolakan transfer tidak memindahkan cabang aset dan hanya mengubah status menjadi `REJECTED`.
- **[TC-TRF-01]** Outlet **tujuan** dapat melihat transfer masuk tetapi ditolak `403` saat menyetujuinya.
- **[TC-TRF-02]** Outlet **asal** dapat menolak permintaan transfernya.
- **[TC-TRF-05]** Admin pemegang outlet asal **dan** tujuan (`admin_engineering`) dapat menyetujui mutasinya.

### F. Pengujian Integritas Alur BAP & Berkas
- **[TC-BAP-01]** Aset `BAP_PENDING` (seluruh sisa stok dipesan) terkunci dari penyuntingan spesifikasi dan mutasi lokasi.
- **[TC-BAP-02]** Persetujuan BAP mengurangi kuantitas; status menjadi `BAP` hanya ketika sisa kuantitas 0.
- **[TC-BAP-03]** BAP parsial (mis. 5 dari 50 pcs) **tidak** mengunci aset: status tetap `ACTIVE`, `reservedQty` bertambah, sisa stok tetap dapat dipakai.
- **[TC-BAP-04]** Penolakan BAP mengembalikan pcs ke bucket `sourceCondition` semula.
- **[TC-FILE-01]** PDF > 5MB ditolak `400`; PDF ≤ 5MB diterima.
- **[TC-FILE-02]** Gambar dikompresi server ke WebP, dimensi ≤ 1920px, disimpan di struktur `YYYY/MM`.
- **[TC-FILE-03]** Dokumen BAP mengikuti cakupan asetnya: pemilik cakupan & Super Admin `200`; tanpa sesi ➡️ dialihkan ke `/login` (`/api/uploads` ➡️ `401`); divisi lain & outlet lain `403`; organisasi lain `404`; path traversal `404`.

### G. Pengujian Resolusi Insiden & Stok per Kondisi
- **[TC-INC-01]** Menyelesaikan insiden dengan status aset `BROKEN` tersimpan dan diterapkan ke aset.
- **[TC-INC-02]** Staf ditolak **tepat `403`** saat `action: "approve"` atas insiden nyata di cakupannya, dan insiden tidak berubah.
- **[TC-STOCK-01]** Melaporkan 8 pcs rusak dari 50 pcs menyisakan `activeQty = 42`, `brokenQty = 8`, status **tetap `ACTIVE`**.
- **[TC-STOCK-02]** Menyelesaikan insiden tersebut dengan status `ACTIVE` mengembalikan pcs ke `activeQty`.
- **[TC-STOCK-03]** Jumlah rusak melebihi stok tersedia, `status` manual pada item ber-stok banyak, dan total stok tidak valid ditolak `400`; invariant stok tetap utuh.

### H. Pengujian Activity Log & MDM
- **[TC-ACT-01]** `SUPER_ADMIN` berhasil memuat daftar log.
- **[TC-ACT-02]** Non-Super Admin ditolak `403` saat memuat log.
- **[TC-ACT-03]** / **[TC-ACT-04]** `POST`/`PUT`/`PATCH`/`DELETE` ke `/api/activity-logs` ➡️ `405 Method Not Allowed`.
- **[TC-MDM-01]** Seluruh route MDM ➡️ `404`.

### I. Pengujian di Luar QA Runner
- **Unit test** (`tests/unit/`): `resolveScope()` fail closed (termasuk peran tak dikenal), helper cakupan & filter, `validateAssignment()`, `roleLabel()`, validasi username/email/kode organisasi.
- **Integration test** (`tests/integration/tenant-db.test.ts`): dua organisasi sementara — setiap operasi client tenant (termasuk di dalam `$transaction`) tidak pernah membaca/mengubah baris organisasi lain, FK komposit menolak referensi lintas organisasi, dan setiap model selain `Organization` memiliki `organizationId`.
- **Smoke test `self-hosted`**: `APP_MODE="self-hosted"` + seed ulang ➡️ halaman login tanpa kolom kode organisasi, login tanpa kode, buat divisi ➡️ kategori ➡️ aset. Kembalikan ke `saas` dan seed ulang setelahnya.
- **Docker satu kontainer** (`docs/docker.md`): perubahan pada startup, migrasi, atau seed wajib dicoba lewat `docker-dev.bat` (data demo, hot reload) **dan** `docker-prod.bat` (database kosong ➡️ `SEED_MODE=bootstrap`: satu organisasi + Super Admin, tidak pernah menghapus data). Uji di volume bersih: `docker compose -f docker/compose.<mode>.yml down -v`. Perubahan pada tunnel diuji lewat `docker-tunnel.bat` (alamat publik, login lewat HTTPS, `docker-prod.bat url`) dan dengan token yang salah (aplikasi tetap jalan, cloudflared dicoba ulang).

---

## 7. Panduan UI/UX & Estetika Tampilan Premium (Aesthetics Guide)
Setiap kali memodifikasi atau membuat antarmuka (UI/UX) pada sistem Inventory, ikuti standar visual modern berikut untuk menghasilkan tampilan premium yang memikat (WOW Effect):

### A. Palet Warna Terkurasi & Konsisten
- **Hindari Warna Dasar Monoton**: Jangan gunakan warna HTML murni (`red`, `blue`, `green`, `black`). Selalu manfaatkan palet warna dari variabel CSS (`globals.css`) atau kelas warna Slate/Indigo terstruktur dari Tailwind:
  - **Primary Indigo & Slate**: Gunakan `var(--primary)` (`#4f46e5`), hover `var(--primary-hover)` (`#4338ca`), dan light `var(--primary-light)` (`#e0e7ff`).
  - **Latar Belakang Bersih**: Gunakan `#f8fafc` (`bg-slate-50`) untuk area konten utama, dan warna putih bersih (`bg-white`) untuk kartu/kontainer.
  - **Status Badge**:
    - `ACTIVE`: Badge hijau pastel (`bg-emerald-50 text-emerald-700 border border-emerald-200/60`).
    - `BROKEN`: Badge merah pastel (`bg-rose-50 text-rose-700 border border-rose-200/60`).
    - `REPAIR`: Badge kuning/amber pastel (`bg-amber-50 text-amber-700 border border-amber-200/60`).
    - `RETIRED`: Badge abu-abu pastel (`bg-slate-100 text-slate-700 border border-slate-200`).
    - `BAP_PENDING`: Badge ungu pastel (`bg-violet-50 text-violet-700 border border-violet-200/60`).
    - `BAP`: Badge merah tua/maroon pastel (`bg-red-50 text-red-700 border border-red-200/60`).

### B. Tipografi & Hierarki Informasi
- **Font Modern**: Pastikan font menggunakan *Geist Sans*, *Inter*, atau *Outfit* (tanpa fallback sans-serif bawaan browser yang kaku).
- **Hierarki Jelas**: Gunakan kombinasi `font-semibold` atau `font-bold` dengan warna teks Slate gelap (misalnya `text-slate-800` atau `text-slate-900`) untuk judul utama, dan Slate abu-abu (`text-slate-500` atau `text-slate-400`) untuk teks deskripsi atau label kecil.
- **Label Form**: Gunakan huruf kapital kecil (uppercase) dengan tracking renggang untuk label form (mis. `text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5`).

### C. Efek Visual Premium (Aesthetics & Borders)
- **Sudut Melengkung (Borders)**: Gunakan sudut melengkung yang konsisten pada semua elemen UI:
  - Card/Kontainer utama: `rounded-xl` atau `rounded-2xl` (`var(--border-radius-lg)`).
  - Tombol, input, dropdown: `rounded-lg` atau `rounded-xl` (`var(--border-radius-md)`).
- **Soft Shadows & Depth**: Tambahkan bayangan lembut untuk memberikan kedalaman visual:
  - Elemen mengambang (dropdown, modal): `shadow-lg` atau `shadow-xl`.
  - Card daftar/filter: `shadow-xs` atau `shadow-sm` dengan border tipis `border border-slate-200/80`.
- **Efek Glassmorphism**: Pada halaman login atau modal pop-up, terapkan efek transparansi dengan blur:
  ```css
  backdrop-filter: blur(8px);
  background-color: rgba(255, 255, 255, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.2);
  ```

### D. Kedinamisan & Mikro-Animasi (Interactive State)
- **Transisi Halus**: Semua elemen interaktif (tombol, baris tabel, tautan navigasi, ikon toggle) wajib menggunakan kelas transisi: `transition-all duration-200 ease-in-out`.
- **Hover & Active States**:
  - Tombol Utama: Hover harus menggelap secara halus (contoh: `bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98]`).
  - Baris Tabel: Gunakan `.data-table-row-clickable:hover` atau `hover:bg-slate-50` untuk visualisasi interaksi baris.
  - Sidebar Links: Tautkan status aktif dengan gradient horizontal lembut: `bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold shadow-md shadow-indigo-500/10`.
- **Loading & Processing**: Tombol saat mengirim formulir atau memproses aksi wajib dinonaktifkan (`disabled:opacity-50 disabled:cursor-not-allowed`) dan menampilkan spinner berputar (`animate-spin`).

### E. Penanganan Layout Responsif & Grid
- **Tabel Anti-Pecah**: Selalu bungkus tabel data di dalam kelas `.data-table-wrapper` dengan properti `overflow-x: auto` agar responsif pada resolusi layar perangkat mobile.
- **Navigasi Ponsel (< 768px)**: Sidebar menjadi laci off-canvas yang dibuka tombol ☰ di Header (tertutup lewat ✕, backdrop, Escape, atau berpindah halaman); konten di belakangnya `inert` selama laci terbuka. Batas media query di `globals.css` **wajib** sama dengan `MOBILE_MEDIA_QUERY` (`src/lib/use-media-query.ts`). Atur tampil/sembunyi elemen ber-kelas kustom (mis. `.header-menu-btn`) di `globals.css`, bukan dengan utilitas `md:hidden` — CSS kustom di luar `@layer` mengalahkan utilitas Tailwind v4.
- **Empty States yang Menarik**: Jangan biarkan ruang kosong saat data tidak ditemukan. Gunakan kontainer `.data-table-empty` dengan ikon besar yang semi-transparan, pesan penjelasan yang ramah, dan tombol Call-to-Action (CTA) di bawahnya untuk memandu pengguna.
- **Filter Bar Kompak**: Sediakan filter bar responsif yang menggunakan Flexbox atau Grid (mis. `flex flex-wrap gap-3 items-end`) agar dapat menyesuaikan dengan lebar layar.

### F. Validasi Form & Input State
- **Focus Ring**: Indikasikan fokus input secara jelas menggunakan ring bercahaya lembut (contoh: `focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500`).
- **Error Visual Feedback**: Apabila input tidak valid, ubah border menjadi merah (`border-red-400 focus:ring-red-500/20`) dan tampilkan pesan kesalahan kecil di bawah input menggunakan warna merah soft (`text-red-500 text-xs mt-1`).
