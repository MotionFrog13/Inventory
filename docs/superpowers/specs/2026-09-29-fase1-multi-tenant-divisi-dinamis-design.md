# Fase 1 — Fondasi Multi-Tenant & Divisi Dinamis

- **Tanggal:** 2026-09-29
- **Status:** Desain disetujui per bagian dalam sesi brainstorming; menunggu review dokumen.
- **Konteks:** Aplikasi ini akan menjadi aplikasi open source yang bisa di-install sendiri (self-hosted) maupun dijalankan sebagai layanan (SaaS). Dokumen ini hanya mencakup Fase 1 dari roadmap di §3.

---

## 1. Latar Belakang

Kondisi saat ini:

- Divisi hanya `IT` dan `KITCHEN` (enum `InventoryType`). Peran menggabungkan tingkat akses dan divisi (`SUPER_ADMIN`, `ADMIN_IT`, `ADMIN_KITCHEN`, `IT_SUPPORT`, `KITCHEN`). Tipe aset adalah enum `AssetType`. Ketiganya tertulis langsung di sekitar 30 file.
- Setiap pengguna selain Super Admin terikat ke tepat satu outlet (`User.branchId`).
- Hanya ada satu organisasi (perusahaan pemilik awal); tidak ada konsep tenant.
- Logika akses sudah terpusat di `src/lib/scope.ts`. Pola fail-closed, guard atomik persetujuan, dan model stok per kondisi sudah matang — semuanya dipertahankan (§6.8).

## 2. Tujuan Fase 1

1. Setiap data milik tepat satu `Organization`, dan isolasi antar-organisasi tidak bergantung pada disiplin penulis route.
2. Divisi dan kategori menjadi data yang dikelola pengguna, bukan enum.
3. Peran menjadi tiga tingkat — `SUPER_ADMIN`, `DIVISION_ADMIN`, `DIVISION_STAFF` — ditambah penugasan divisi.
4. Pengguna dapat ditugaskan ke satu atau beberapa outlet.
5. Login mendukung mode self-hosted dan SaaS.
6. Semua fitur yang ada (aset, stok, BAP, transfer, insiden, activity log, laporan, cabang) tetap berjalan dengan model baru.

## 3. Roadmap

| Fase | Isi |
|---|---|
| **1** (dokumen ini) | Organization, divisi & kategori dinamis, 3 tingkat peran, multi-outlet, client database terikat organisasi, login baru |
| 2 | Tiket perbaikan lintas divisi: divisi penangan per kategori (`Category.handlerDivisionId`), penugasan teknisi, status progres, verifikasi pelapor, SLA. Menggantikan `Incident`. Siapa yang boleh mengatur divisi penangan diputuskan di desain Fase 2. |
| 3 | Siap open source: nama/logo/zona waktu/bahasa yang bisa diatur, wizard setup (menggantikan akun seed ber-password tetap), rate limit login, file upload keluar dari `public/` dan disajikan lewat route yang mengecek akses (path per organisasi), `LICENSE`, dokumentasi EN/ID, `SECURITY.md` |
| 4 | Distribusi: Docker image (`output: "standalone"`), compose produksi (tanpa port database/pgAdmin terbuka, HTTPS lewat reverse proxy), panduan backup, CI |
| 5 | SaaS: pendaftaran organisasi publik, verifikasi email & reset password (SMTP), kuota, admin platform untuk operator, penangguhan & penghapusan organisasi |
| MDM | Desain ulang terpisah, belum dijadwalkan: aktivasi per divisi, token enrollment per divisi, agent |

**Aturan rilis:** mode `saas` tidak boleh dibuka untuk publik sebelum Fase 3 dan Fase 5 selesai.

## 4. Keputusan Desain

| # | Keputusan | Pilihan | Alasan |
|---|---|---|---|
| D1 | Model distribusi | Satu kode untuk self-hosted dan SaaS | Keputusan pemilik proyek |
| D2 | Data lama | Di-reset; seluruh migrasi lama diganti satu migrasi awal | Instalasi yang ada masih uji coba |
| D3 | Identitas login | Email (unik global) **atau** kode organisasi + username (unik per organisasi) | Staf outlet sering tidak punya email kerja |
| D4 | Penugasan outlet | Banyak outlet per pengguna (`UserBranch`) | Teknisi dan admin wilayah melayani beberapa cabang |
| D5 | Routing tiket | Per kategori, diterapkan di Fase 2 | Tablet POS milik Kitchen ditangani IT |
| D6 | Isolasi antar-organisasi | Client Prisma terikat organisasi + FK komposit + ESLint | Tidak bisa terlupa oleh kontributor; tanpa beban operasional RLS |
| D7 | Respons atas data organisasi lain | `404` | Tidak membocorkan keberadaan data |
| D8 | MDM | Dinonaktifkan di Fase 1 | Token aktivasi global tidak aman untuk multi-tenant; perlu desain ulang |
| D9 | Kelola kategori | SUPER_ADMIN, dan DIVISION_ADMIN untuk divisinya sendiri | Keputusan pemilik proyek |
| D10 | Kelola divisi, cabang, pengguna | SUPER_ADMIN saja | Sama seperti sekarang |
| D11 | Subdomain per organisasi | Tidak di Fase 1 | Dicatat untuk pengembangan berikutnya (§15) |

---

## 5. Model Data

### 5.1 Skema

Hanya kolom baru/berubah yang ditulis; kolom lain tetap seperti `prisma/schema.prisma` sekarang.

```prisma
model Organization {
  id        String   @id @default(cuid())
  name      String
  slug      String   @unique // "kode organisasi" saat login — ^[a-z0-9-]{3,32}$
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Division {
  id             String       @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id])
  name           String
  description    String?
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  @@unique([organizationId, id])   // target FK komposit
  @@unique([organizationId, name])
}

model Category {
  id             String   @id @default(cuid())
  organizationId String
  divisionId     String
  division       Division @relation(fields: [organizationId, divisionId], references: [organizationId, id], onDelete: Cascade)
  name           String
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@unique([organizationId, id])
  @@unique([divisionId, id])       // target FK komposit Asset(divisionId, categoryId)
  @@unique([divisionId, name])
}

model Branch {
  // kolom lama tetap: name, location, mapUrl, createdAt, updatedAt
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id])

  @@unique([organizationId, id])
  @@unique([organizationId, name])
}

model User {
  id             String       @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id])
  email          String?      @unique // wajib untuk SUPER_ADMIN (validasi aplikasi)
  username       String               // ^[a-z0-9._-]{3,32}$ — tanpa "@"
  password       String
  name           String
  role           Role
  divisionId     String?              // null hanya untuk SUPER_ADMIN
  // Restrict eksplisit: default Prisma untuk relasi opsional adalah SetNull,
  // yang akan diam-diam mengunci pengguna bila divisinya terhapus.
  division       Division?    @relation(fields: [divisionId], references: [id], onDelete: Restrict)
  branches       UserBranch[]
  createdAt      DateTime     @default(now())
  // DIHAPUS: branchId

  @@unique([organizationId, id])
  @@unique([organizationId, username])
}

model UserBranch {
  organizationId String
  userId         String
  branchId       String
  user           User   @relation(fields: [organizationId, userId], references: [organizationId, id], onDelete: Cascade)
  branch         Branch @relation(fields: [organizationId, branchId], references: [organizationId, id])

  @@id([userId, branchId])
  @@index([organizationId, branchId])
}

model Asset {
  // kolom lama tetap: name, serialNumber, brand, model, specs, purchaseDate,
  // warrantyDate, status (turunan), quantity + 5 bucket stok, photoUrl, notes
  // DIHAPUS: type (AssetType), inventory (InventoryType)
  organizationId String
  divisionId     String
  categoryId     String
  branchId       String
  division       Division @relation(fields: [organizationId, divisionId], references: [organizationId, id])
  category       Category @relation(fields: [divisionId, categoryId], references: [divisionId, id])
  branch         Branch   @relation(fields: [organizationId, branchId], references: [organizationId, id])

  @@unique([organizationId, id])
  @@unique([categoryId, serialNumber]) // cadangan validasi aplikasi; NULL boleh berulang
  @@index([organizationId, divisionId, branchId])
  @@index([status])
}

// Contoh pola untuk tabel yang menggantung pada aset:
model Transfer {
  organizationId String
  asset          Asset  @relation(fields: [organizationId, assetId], references: [organizationId, id])
  fromBranch     Branch @relation("FromBranch", fields: [organizationId, fromBranchId], references: [organizationId, id])
  toBranch       Branch @relation("ToBranch", fields: [organizationId, toBranchId], references: [organizationId, id])
  requestedBy    User   @relation("TransferRequestedBy", fields: [organizationId, requestedById], references: [organizationId, id])
  approvedBy     User?  @relation("TransferApprovedBy", fields: [approvedById], references: [id]) // opsional → FK biasa
}

model ActivityLog {
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id])
  userId         String?
  user           User?        @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([organizationId, createdAt])
}

enum Role {
  SUPER_ADMIN
  DIVISION_ADMIN
  DIVISION_STAFF
}
// DIHAPUS: enum InventoryType, enum AssetType
```

Pola yang sama untuk tabel lain:

| Tabel | Relasi FK komposit `(organizationId, …)` | Relasi FK biasa (opsional) |
|---|---|---|
| `Bap` | `asset` (onDelete Cascade), `requestedBy` | `approvedBy` |
| `Transfer` | `asset`, `fromBranch`, `toBranch`, `requestedBy` | `approvedBy` |
| `Incident` | `asset` | — |
| `MdmDevice` | `asset` (onDelete Cascade); tambah `@@unique([organizationId, id])` | — |
| `MdmCommand` | `mdmDevice` (onDelete Cascade) | — |

### 5.2 Aturan Model

1. Setiap tabel kecuali `Organization` punya `organizationId`. Nilainya tidak pernah diambil dari input klien (§6.1).
2. Relasi wajib memakai FK komposit, sehingga database menolak referensi ke organisasi lain dan kategori dari divisi lain. Relasi opsional (`User.divisionId`, `Bap.approvedById`, `Transfer.approvedById`, `ActivityLog.userId`) memakai FK biasa dan divalidasi aplikasi dengan mencarinya lewat client tenant — ID milik organisasi lain tidak ditemukan dan ditolak `400`.
3. Label peran dibentuk `roleLabel(role, divisionName)`: "Super Admin", "Admin {divisi}", "Staf {divisi}". Bila divisi kosong (akun belum ditugaskan): "Admin Divisi" / "Staf Divisi".
4. Model stok tidak berubah: `src/lib/stock.ts`, invariant `quantity = activeQty + brokenQty + repairQty + retiredQty + reservedQty`, status turunan, dan reservasi BAP.
5. Divisi sebuah aset tidak bisa diubah setelah dibuat. Kategori hanya bisa diganti ke kategori lain di divisi yang sama (dijamin FK `(divisionId, categoryId)`).
6. Aturan hapus:
   - **Kategori**: hanya bila tidak ada aset; selain itu `409` beserta jumlah aset.
   - **Divisi**: hanya bila tidak ada aset dan pengguna; kategori kosongnya ikut terhapus (Cascade). Selain itu `409` beserta jumlah aset/pengguna.
   - **Cabang**: hanya bila tidak ada aset dan pengguna yang ditugaskan; selain itu `409`.
   - **Pengguna**: SUPER_ADMIN tidak bisa menghapus dirinya sendiri (sudah ada). **Baru:** `PUT /api/users/[id]` yang menurunkan SUPER_ADMIN terakhir di organisasi ditolak `400`.
7. Nomor seri unik per kategori: validasi aplikasi dengan pesan yang jelas, dan unique constraint sebagai cadangan.
8. Nama unik: divisi per organisasi, kategori per divisi, cabang per organisasi.

---

## 6. Kontrol Akses

### 6.1 Client Terikat Organisasi (`src/lib/tenant-db.ts`)

`tenantDb(organizationId)` mengembalikan client Prisma yang diperluas (Prisma Client Extension, `$allModels.$allOperations`):

| Operasi | Perlakuan |
|---|---|
| `findUnique(OrThrow)`, `findFirst(OrThrow)`, `findMany`, `count`, `aggregate`, `groupBy` | `where = { ...where, organizationId }` |
| `update`, `updateMany`, `updateManyAndReturn`, `delete`, `deleteMany` | `where = { ...where, organizationId }` |
| `create` | `data = { ...data, organizationId }` |
| `createMany`, `createManyAndReturn` | `organizationId` disuntikkan ke setiap item |
| `upsert` | `where` dan `create` disuntik |
| Operasi lain | dilempar error (fail closed) |

- Model `Organization`: client tenant hanya boleh `findUnique`/`findFirst`, dengan syarat tambahan `AND: [{ id: organizationId }]` sehingga ID organisasi lain menghasilkan `null`. Operasi lain dilempar error.
- Nilai `organizationId` yang dikirim route di `where`/`create` selalu ditimpa. Tipe input `create` Prisma tetap mewajibkan `organizationId` (extension tidak mengubah tipe), jadi route menulis `organizationId: user.organizationId` secara eksplisit.
- `update`, `updateMany`, `updateManyAndReturn`, dan bagian `update` pada `upsert` yang memuat `organizationId` di `data` dilempar error — baris tidak boleh dipindah ke organisasi lain.
- Penulisan memakai FK skalar (`branchId: "…"`), bukan `connect`.
- Nested create hanya untuk tabel anak yang relasinya ke induk memakai FK komposit (mis. `UserBranch` dari `User`), sehingga `organizationId` diwarisi dari induk.
- Aturan di atas wajib tetap berlaku di dalam `db.$transaction([...])` dan `db.$transaction(async (tx) => …)` (lima route memakai transaksi interaktif: pengajuan/persetujuan/penolakan BAP, persetujuan transfer, perintah MDM). Diverifikasi spike §14.1.

### 6.2 Konteks Request (`src/lib/auth.ts`)

```ts
// Route handler
const ctx = await requireUserScope(request);
if (!ctx.ok) return ctx.response;        // 401 / 403
const { db, scope, user } = ctx;

// Halaman server
const ctx = await getPageContext();
if (!ctx) return <AccessDenied message={UNASSIGNED_MESSAGE} />;
```

- Keduanya membaca pengguna dari database setiap request (id dari token, beserta divisi dan outlet). Jika `user.organizationId` berbeda dari `organizationId` di token, balas `401`.
- `resolveScope()` mengembalikan `null` → API `403`, halaman `<AccessDenied />`.
- `db` hanya bisa diperoleh dari kedua fungsi ini. Route yang melewati pengecekan tidak punya akses database.
- `/api/auth/logout` dan `/api/auth/me` tidak memakai `requireUserScope()`, sehingga tetap bisa diakses akun tanpa penugasan. `/api/auth/me` mengembalikan `access: "ok" | "unassigned"`; shell aplikasi (`AppLayoutClient`) menampilkan `<AccessDenied />` beserta tombol keluar di semua halaman bila `unassigned`.
- `forbidden()` Next.js 16 masih eksperimental (`experimental.authInterrupts`) sehingga tidak dipakai; penolakan halaman tetap memakai `<AccessDenied />`.

`user` yang dikembalikan: `{ id, organizationId, username, name, email, role, divisionId, division: { id, name } | null, branches: { id, name }[], organization: { id, name, slug } }`.

### 6.3 Cakupan 3 Lapis (`src/lib/scope.ts`)

```ts
interface UserScope {
  organizationId: string;      // selalu terisi
  divisionId: string | null;   // null = semua divisi — hanya SUPER_ADMIN
  branchIds: string[] | null;  // null = semua outlet — hanya SUPER_ADMIN
}
```

`resolveScope(user)`:
- `SUPER_ADMIN` → `{ organizationId, divisionId: null, branchIds: null }`.
- Peran lain tanpa divisi **atau** tanpa outlet → `null` (ditolak).
- Peran lain → `{ organizationId, divisionId, branchIds }`.

Helper tidak menambahkan `organizationId` karena sudah dijamin client tenant:

| Helper | Perilaku |
|---|---|
| `assetScopeWhere(scope)` | `{ divisionId?, branchId: { in: branchIds }? }` |
| `assetRelationScopeWhere(scope)` | `{ asset: assetScopeWhere(scope) }` |
| `transferScopeWhere(scope)` | `asset.divisionId` + `OR [fromBranchId ∈ branchIds, toBranchId ∈ branchIds]` |
| `canViewTransfer(scope, t)` | salah satu sisi transfer ∈ `branchIds` |
| `canApproveTransfer(scope, t)` | `fromBranchId ∈ branchIds` |
| `assetAccessError/Denied(scope, asset)` | cek `divisionId`, lalu `branchId ∈ branchIds`; `403` |
| `effectiveBranchFilter(scope, requested)` | SUPER_ADMIN: `requested` atau semua. Lainnya: `[requested]` bila outlet itu miliknya, selain itu semua `branchIds` |
| `effectiveDivisionFilter(scope, requested)` | SUPER_ADMIN: `requested` atau semua. Lainnya: selalu divisinya |
| `validateAssignment(role, divisionId, branchIds)` | SUPER_ADMIN → divisi `null`, tanpa outlet. Lainnya → divisi dan minimal satu outlet wajib; keberadaannya dicek pemanggil lewat client tenant |

Pesan galat: `"Unauthorized cross-division access detected."` (menggantikan cross-inventory) dan `"Unauthorized cross-branch access detected."` (tetap), dengan message `"Akses ditolak"`.

### 6.4 Kode Respons

| Kasus | Respons |
|---|---|
| Data milik organisasi lain | `404` tidak ditemukan |
| Data divisi/outlet lain dalam organisasi sendiri | `403` "Akses ditolak" |
| ID kategori/cabang/divisi/pengguna milik organisasi lain di payload | `400` (tidak ditemukan oleh client tenant) |
| Akun non-SUPER_ADMIN tanpa divisi atau outlet | API `403`, halaman `<AccessDenied />`, login `403` |

### 6.5 Matriks Peran

| Aksi | SUPER_ADMIN | DIVISION_ADMIN | DIVISION_STAFF |
|---|---|---|---|
| Lihat aset, insiden, BAP, transfer | Semua | Divisi + outletnya | Divisi + outletnya |
| Tambah/edit aset | ✓ | ✓ (divisi + outletnya) | ✗ |
| Lapor insiden, ajukan BAP/transfer | ✓ | ✓ | ✓ |
| Setujui/tolak BAP & penyelesaian insiden | ✓ | ✓ (divisinya) | ✗ |
| Setujui/tolak transfer | ✓ | ✓ (outlet asal ∈ outletnya) | ✗ |
| Tambah/ubah/hapus kategori | ✓ | ✓ (divisinya) | ✗ |
| Tambah/ubah/hapus divisi, cabang, pengguna | ✓ | ✗ | ✗ |
| Activity log | ✓ | ✗ | ✗ |
| Hapus insiden | ✓ | ✗ | ✗ |

`isAdminRole(role)` = `SUPER_ADMIN` atau `DIVISION_ADMIN`.

### 6.6 ESLint (`eslint.config.mjs`)

- `no-restricted-imports`:
  - `@/lib/prisma` dan pola `**/lib/prisma`, serta `PrismaClient` dari `@prisma/client` (impor tipe `Prisma` tetap boleh).
  - `@/lib/tenant-db` dan pola `**/lib/tenant-db` — route yang memanggil `tenantDb()` sendiri dapat memilih organisasi sembarang dan melewati pengecekan akses.
- `no-restricted-syntax`: `$queryRaw`, `$executeRaw`, `$queryRawUnsafe`, `$executeRawUnsafe`.
- Pengecualian hanya untuk: `src/lib/prisma.ts`, `src/lib/tenant-db.ts`, `src/lib/auth.ts`, `src/app/api/auth/**`, `prisma/seed.ts`, `qa-test-runner.ts`.

### 6.7 Activity Log

- `writeActivityLog(db, actor, action, details, request)` — `organizationId` berasal dari client tenant; logger tidak mengimpor prisma mentah.
- Hanya SUPER_ADMIN, dan hanya log organisasinya sendiri. API tetap hanya `GET`; metode lain `405`.

### 6.8 Aturan yang Tidak Berubah

- Guard akses dijalankan sebelum validasi bisnis yang pesannya memuat detail data.
- Persetujuan BAP/transfer memakai `updateMany({ where: { id, status: "PENDING" } })` di dalam transaksi dan memeriksa `count === 0`.
- Riwayat BAP append-only; satu pengajuan `PENDING` per aset.
- Mutasi stok hanya lewat helper `stock.ts`; statistik kondisi menjumlahkan bucket (`_sum`) dalam satuan pcs.
- Deteksi "BAP menunggu" lewat baris `Bap.status = PENDING`.
- Validasi status resolusi insiden (`ACTIVE`, `REPAIR`, `RETIRED`, `BROKEN`).
- `export const dynamic = "force-dynamic"` di setiap route dinamis; format respons `{ success, data | error, message }`.
- Header `x-user-*` dari klien dibuang middleware sebelum percabangan apa pun; tidak ada bypass berdasarkan header yang bisa dikirim klien.

---

## 7. Autentikasi, JWT & Middleware

### 7.1 `APP_MODE`

Env baru `APP_MODE` = `self-hosted` (default) atau `saas`. Di Fase 1 mode ini hanya memengaruhi login.

| | `self-hosted` | `saas` |
|---|---|---|
| Form login | "Username atau email" + password | Email + password, **atau** kode organisasi + username + password |
| Resolusi organisasi | Satu-satunya organisasi di database. Bila jumlahnya bukan satu, login ditolak `503` "Instalasi self-hosted harus memiliki tepat satu organisasi" (fail closed) | Dari email, atau dari `Organization.slug` |
| Kemudahan | – | `/login?org=demo` mengisi kode organisasi; kode terakhir diingat di `localStorage` |

### 7.2 Validasi Akun

- Username: `^[a-z0-9._-]{3,32}$`, tanpa `@`, unik per organisasi. Karena username tidak boleh memuat `@`, input yang memuat `@` selalu diperlakukan sebagai email.
- Email: unik global; wajib untuk SUPER_ADMIN, opsional untuk peran lain.
- Kode organisasi (`slug`): `^[a-z0-9-]{3,32}$`, unik global.

### 7.3 Alur Login (`POST /api/auth/login`)

Body: `{ identifier, password, orgCode? }`.

1. `identifier` memuat `@` → cari pengguna berdasarkan email.
2. Selain itu → tentukan organisasi (§7.1), lalu cari `(organizationId, username)`.
3. Bandingkan password. Bila pengguna tidak ditemukan, tetap jalankan `bcrypt.compare` terhadap hash dummy agar waktu respons setara.
4. Semua kegagalan pada langkah 1–3 dibalas `401` dengan pesan yang sama: "Email/username atau password salah".
5. `resolveScope(user)` bernilai `null` → `403` dengan pesan akun belum ditugaskan.
6. Terbitkan JWT dan cookie (atribut cookie sama seperti sekarang), lalu catat `LOGIN` lewat `tenantDb(user.organizationId)`.

### 7.4 JWT

- Payload: `{ userId, organizationId, role, name, username }`. `branchId` dihapus dari token.
- Token tanpa `organizationId` atau dengan peran di luar enum `Role` baru dianggap tidak valid: cookie dihapus, API `401`, halaman dialihkan ke `/login`.

### 7.5 Middleware (`src/proxy.ts`)

- Header identitas yang dibuang: `x-user-id`, `x-user-role`, `x-user-name`, `x-user-username`, `x-user-org` (`x-user-branch` dihapus).
- Middleware memverifikasi tanda tangan token, peran, dan keberadaan `organizationId`, lalu mengisi header identitas. Gerbang `/activity-logs` dan `/api/activity-logs` khusus SUPER_ADMIN tetap ada.
- Pengecekan divisi/outlet dipindah dari middleware ke `requireUserScope()`/`getPageContext()`/`/api/auth/me` (§6.2), yang membaca database sehingga perubahan penugasan langsung berlaku.
- `getAuthUser(request)` mengembalikan `{ userId, organizationId, role, name, username }`.

---

## 8. API

| Endpoint | Perubahan |
|---|---|
| `POST /api/auth/login` | Body `{ identifier, password, orgCode? }` (§7.3) |
| `GET /api/auth/me` | `{ id, username, name, email, role, roleLabel, organization, division, branches, access }` |
| `GET /api/divisions` | **Baru.** SUPER_ADMIN: semua divisi; peran lain: divisinya sendiri. Masing-masing beserta kategorinya |
| `POST /api/divisions`, `PUT`/`DELETE /api/divisions/[id]` | **Baru.** SUPER_ADMIN saja |
| `POST /api/divisions/[id]/categories` | **Baru.** SUPER_ADMIN, atau DIVISION_ADMIN divisi tersebut |
| `PUT`/`DELETE /api/categories/[id]` | **Baru.** SUPER_ADMIN, atau DIVISION_ADMIN divisi kategori tersebut; admin divisi lain dan staf `403` |
| `GET`/`POST /api/users`, `PUT /api/users/[id]` | Field `divisionId`, `branchIds[]`, `email`; `branchId` dihapus. Validasi `validateAssignment()` terhadap peran final; aturan SUPER_ADMIN terakhir (§5.2) |
| `GET /api/assets` | Query `?divisionId=` (SUPER_ADMIN), `?categoryId=`, `?branchId=` (§6.3). `?inventory=` dan `?type=` dihapus |
| `POST /api/assets` | Body `categoryId`; `divisionId` wajib untuk SUPER_ADMIN. DIVISION_ADMIN dengan `divisionId` berbeda dari divisinya → `403`. `branchId` harus salah satu outlet pengguna (`403` bila bukan); tanpa `branchId`: otomatis bila pengguna punya satu outlet, `400` bila punya beberapa |
| `PUT /api/assets/[id]` | `categoryId` hanya dalam divisi yang sama; `type`/`inventory` dihapus |
| `GET /api/branches` | Outlet milik pengguna (bisa lebih dari satu); `?all=1` tetap untuk daftar tujuan transfer dan penugasan pengguna |
| `GET /api/branches/[id]` | `403` bila cabang bukan outlet pengguna; `404` bila milik organisasi lain |
| `GET /api/reports/*` | Dikelompokkan per divisi/kategori, bukan per `AssetType` |
| `/api/mdm/enroll`, `/api/mdm/check-in`, `/api/assets/[id]/mdm`, `/api/assets/[id]/mdm/command` | Selalu `404` (§10) |

Endpoint lain (BAP, transfer, insiden, activity log) tidak berubah bentuknya; hanya cakupan dan client database-nya yang diganti.

---

## 9. Antarmuka

**Halaman `/divisions`:**
- SUPER_ADMIN: daftar semua divisi yang bisa dibuka untuk melihat kategorinya; tambah/ganti nama/hapus divisi dan kategori.
- DIVISION_ADMIN: hanya divisinya; tambah/ganti nama/hapus kategori. Tombol kelola divisi tidak tampil.
- Penghapusan yang ditolak `409` menampilkan jumlah aset/pengguna yang menghalangi.
- Sidebar: "Divisi & Kategori" untuk SUPER_ADMIN, "Kategori" untuk DIVISION_ADMIN, tidak tampil untuk staf.

**Form pengguna (`/users`):**
- Pilihan peran: Super Admin / Admin Divisi / Staf Divisi.
- Pilihan divisi dan daftar centang outlet (minimal satu) disembunyikan bila peran Super Admin.
- Email wajib untuk Super Admin.
- Daftar pengguna menampilkan label peran ("Admin Kitchen") dan outlet sebagai chip.

**Form aset (tambah & edit):**
- SUPER_ADMIN memilih Divisi, lalu daftar Kategori menyesuaikan (menggantikan dropdown "Jenis Inventaris").
- DIVISION_ADMIN: divisi tampil sebagai label mati; memilih kategori dari divisinya.
- Outlet: satu outlet → label mati; beberapa outlet → pilih dari outletnya; SUPER_ADMIN → semua outlet.
- Edit: divisi hanya ditampilkan; kategori hanya dari divisi yang sama.
- Divisi tanpa kategori → pesan kosong; untuk SUPER_ADMIN dan DIVISION_ADMIN disertai tautan ke `/divisions`.
- Staf tetap melihat "Akses Ditolak" di `/assets/new` dan `/assets/[id]/edit`.

**Daftar aset:** filter Divisi (SUPER_ADMIN), Kategori (mengikuti divisi), Outlet (hanya outlet milik pengguna; label mati bila satu), Status.

**Dashboard, Cabang, Laporan:** kartu IT vs Kitchen diganti statistik per divisi yang dibaca dari database; pengguna divisi hanya melihat divisinya. Hitungan tetap dalam pcs (`_sum` bucket).

**Sidebar & judul:** nama organisasi di header Sidebar (logo dan nama aplikasi tetap sampai Fase 3); subtitle memakai nama divisi pengguna atau "Semua Divisi" untuk SUPER_ADMIN; Header memakai `roleLabel`.

**Login:** sesuai §7.1.

Halaman Transfer, Insiden, BAP, dan detail aset hanya mengganti label `inventory`/`type` dengan nama divisi/kategori.

---

## 10. MDM

- Semua route MDM (§8) diganti stub yang selalu membalas `404`. Kode lama tetap ada di riwayat git sebagai referensi desain ulang.
- Tidak ada UI MDM yang perlu disembunyikan (MDM saat ini hanya berupa route API).
- Tabel `MdmDevice` dan `MdmCommand` tetap ada dengan `organizationId` dan FK komposit (§5.1), agar desain ulang tidak perlu mengubah tabel inti.
- `DEVICE_ACTIVATION_TOKEN` dihapus dari dokumentasi env.

---

## 11. Migrasi & Seed

**Migrasi:** seluruh isi `prisma/migrations/` dihapus dan diganti satu migrasi awal `init` yang dibangkitkan dari skema baru. Database pengembangan dibangun ulang dengan `npx prisma migrate reset`.

**Seed (`prisma/seed.ts`)** — organisasi "Demo Resto" (kode `demo`), outlet Bogor (Pusat), Jakarta Selatan, Bandung:

| Divisi | Kategori |
|---|---|
| IT | Laptop, PC, Printer, CCTV, Router, Switch, UPS, Tablet POS, Lain-lain |
| Kitchen | Chiller, Freezer, Kompor, Oven, Deep Fryer, Blender, Rice Cooker, Lain-lain |
| Engineering | Genset, AC, Pompa Air, Panel Listrik, Lain-lain |

| Username | Peran | Divisi | Outlet |
|---|---|---|---|
| `superadmin` (dengan email) | SUPER_ADMIN | – | – |
| `admin_it` | DIVISION_ADMIN | IT | Bogor |
| `staff_it` | DIVISION_STAFF | IT | Bogor |
| `admin_it_jakarta` | DIVISION_ADMIN | IT | Jakarta Selatan |
| `admin_kitchen` | DIVISION_ADMIN | Kitchen | Bogor |
| `staff_kitchen` | DIVISION_STAFF | Kitchen | Bogor |
| `admin_engineering` | DIVISION_ADMIN | Engineering | Bogor + Jakarta Selatan |
| `teknisi_engineering` | DIVISION_STAFF | Engineering | Bogor + Jakarta Selatan |

- Aset contoh yang ada dipetakan ke kategori baru. Ditambah aset Engineering di **ketiga** outlet (dibutuhkan TC-USR-03 dan TC-TRF-05).
- Password pengembangan tetap sederhana dan dicetak di akhir seed, sampai wizard setup Fase 3 menggantikannya.
- Bila `APP_MODE=saas`, seed juga membuat organisasi "Org Uji B" (kode `uji-b`) dengan dua outlet, satu divisi IT, satu kategori, satu aset, dan akun `superadmin` serta `admin_it` — username yang **sama** dengan organisasi pertama. Aset tersebut memiliki satu transfer dan satu BAP berstatus `PENDING`, sehingga TC-ORG-05 membuktikan isolasi atas baris yang benar-benar ada, bukan sekadar data kosong.

---

## 12. Pengujian

**Unit test** (`npm run test:unit`, `node:test` lewat ts-node — tanpa dependency baru): fungsi murni di `scope.ts` dan `utils.ts`.

**Integration test client tenant** (`npm run test:integration`, terhadap database pengembangan): membuat dua organisasi sementara lalu membuktikan setiap operasi client tenant — termasuk di dalam `$transaction` — tidak pernah membaca atau mengubah baris organisasi lain, FK komposit menolak referensi lintas organisasi, dan setiap model selain `Organization` memiliki `organizationId`.

`qa-test-runner.ts` dijalankan dengan `APP_MODE=saas` dan berhenti di awal bila mode berbeda. Login memakai kode organisasi `demo` atau `uji-b`.

**TC lama yang ditulis ulang:** RBAC, pemisahan divisi (sebelumnya SEP), outlet (BR), transfer (TRF), BAP, insiden (INC), stok (STOCK), sesi (AUTH), dan activity log (ACT) — memakai peran, divisi, dan akun seed baru. Pesan cross-inventory diganti cross-division.

**TC baru:**

| ID | Skenario | Harapan |
|---|---|---|
| TC-ORG-01 | `GET /api/assets` sebagai pengguna `demo` | Tidak ada aset `uji-b`; `pagination.total` hanya menghitung `demo` |
| TC-ORG-02 | `GET`/`PUT`/`DELETE /api/assets/[id-uji-b]` sebagai SUPER_ADMIN `demo` | `404`, tanpa data |
| TC-ORG-03 | `POST /api/assets` dengan `categoryId` atau `branchId` milik `uji-b` | `400`; tidak ada baris dibuat |
| TC-ORG-04 | `POST /api/assets/[id]/transfer` dengan `toBranchId` milik `uji-b` | `400` |
| TC-ORG-05 | Persetujuan BAP dan transfer atas ID milik `uji-b` (route bertransaksi interaktif) | `404`; tidak ada data berubah |
| TC-ORG-06 | Login `demo` + `superadmin` dan `uji-b` + `superadmin` | Masing-masing masuk ke akun organisasinya; kode organisasi salah → `401` dengan pesan generik |
| TC-DIV-01 | CRUD divisi sebagai DIVISION_ADMIN atau staf | `403` |
| TC-DIV-02 | CRUD kategori divisi sendiri sebagai DIVISION_ADMIN | Berhasil; kategori divisi lain `403` |
| TC-DIV-03 | Buat/ubah aset dengan kategori dari divisi lain | `400` |
| TC-DIV-04 | Hapus divisi/kategori/cabang yang masih berisi | `409` beserta jumlah penghalang |
| TC-USR-01 | Buat akun non-SUPER_ADMIN tanpa divisi atau tanpa outlet | `400` |
| TC-USR-02 | Penugasan dicabut setelah login | Semua API `403` (kecuali logout & me), `/api/auth/me` → `access: "unassigned"`, login berikutnya `403` |
| TC-USR-03 | Staf multi-outlet (`teknisi_engineering`) | Melihat aset Engineering di Bogor dan Jakarta Selatan, tidak di Bandung |
| TC-USR-04 | Turunkan SUPER_ADMIN terakhir organisasi | `400` |
| TC-TRF-05 | `admin_engineering` (Bogor + Jakarta Selatan) mengajukan lalu menyetujui transfer aset Engineering Bogor → Jakarta Selatan | Berhasil; aset pindah ke Jakarta Selatan |
| TC-MDM-01 | Semua route MDM | `404` |

---

## 13. Dokumentasi & Definisi Selesai

**Dokumentasi:**
- `CLAUDE.md`, `AGENTS.md`, `QA.md` ditulis ulang sesuai aturan baru (cakupan 3 lapis, `db` hanya dari konteks request, 404 vs 403, peran, kelola divisi/kategori, MDM nonaktif). Ketiganya adalah buku aturan proyek dan wajib benar sebelum Fase 2 dimulai.
- `README.md` diperbarui seperlunya: peran, akun seed, `APP_MODE`, dan hapus `DEVICE_ACTIVATION_TOKEN`. README open source lengkap di Fase 3.
- `CHANGELOG.md`: entri `2.0.0` (breaking change).

**Definisi selesai:**
- `npm run typecheck`, `npm run lint`, dan `npm run build` lolos; ESLint menolak impor `@/lib/prisma` dan `@/lib/tenant-db` di route.
- `npx prisma migrate reset` + seed berjalan di kedua mode.
- `npm run test:unit` dan `npm run test:integration` lolos.
- `qa-test-runner.ts` hijau seluruhnya dalam mode `saas`.
- Smoke test manual mode `self-hosted`: login tanpa kode organisasi, buat divisi, kategori, dan aset.

---

## 14. Risiko

### 14.1 Spike Verifikasi (langkah pertama implementasi)

Sebelum menyentuh route, buktikan pada Prisma 7 yang terpasang:

1. `prisma validate` dan `prisma generate` lolos untuk FK komposit yang berbagi kolom `organizationId` di beberapa relasi satu model.
2. Extension menyuntikkan `organizationId` di dalam `$transaction([...])` dan `$transaction(async (tx) => …)`.
3. Nested create `User` → `UserBranch` mewarisi `organizationId`.
4. `findUnique` dengan tambahan `organizationId` di `where` berjalan dan mengembalikan `null` untuk organisasi lain.

Bila salah satu gagal, desain disesuaikan sebelum implementasi dilanjutkan (mis. membungkus ulang `tx` secara eksplisit, atau menulis tabel anak tanpa nested create).

**Sudah terbukti saat perencanaan (2026-09-29):** poin 1 (`prisma validate` dan `prisma generate` lolos untuk skema §5.1 pada Prisma 7.8.0) dan poin 3 di tingkat tipe (`UserBranchUncheckedCreateWithoutUserInput` hanya berisi `branchId`). Poin 2 dan 4 butuh database dan menjadi bagian integration test client tenant.

**Seluruh spike lolos (2026-09-29, Task 3):** `tests/integration/tenant-db.test.ts` membuktikan poin 2 (extension berlaku di `$transaction` interaktif maupun array), poin 3 saat runtime (nested create `User` → `UserBranch` mewarisi `organizationId`), dan poin 4 (`findUnique` atas ID organisasi lain menghasilkan `null`). FK komposit menolak referensi lintas organisasi dengan kode `P2003`. Tidak diperlukan jalan cadangan untuk `tx`.

### 14.2 Risiko Lain

| Risiko | Mitigasi |
|---|---|
| Refactor menyentuh sekitar 40 file sekaligus | Rencana dipecah per irisan vertikal; penghapusan enum membuat TypeScript menandai setiap pemakaian lama; QA runner sebagai jaring pengaman |
| Kontributor melewati client tenant | ESLint (§6.6) dan `db` hanya tersedia dari konteks request |
| Beban query tambahan per request | Satu query pengguna beserta divisi dan outlet (sudah terjadi hari ini untuk `branchId`); PK `UserBranch` ter-index |
| Next.js 16 berbeda dari versi yang umum dikenal | Baca panduan terkait di `node_modules/next/dist/docs/` sebelum menulis kode (sesuai `AGENTS.md`) |

---

## 15. Catatan Pengembangan Berikutnya

- **Subdomain per organisasi** (mis. `demo.app.com`) untuk mode SaaS — menggantikan kolom kode organisasi; butuh wildcard DNS dan sertifikat wildcard.
- **PostgreSQL Row-Level Security** sebagai lapisan tambahan di atas client tenant untuk instance SaaS.
- **Desain ulang MDM** (lihat §3).
- **Pengatur routing tiket per kategori** diputuskan di desain Fase 2.
- **Backlog ide (belum dijadwalkan):** label QR per aset untuk lapor kerusakan, import CSV/Excel, notifikasi email/Telegram, template divisi saat setup, jadwal perawatan berkala, custom field per kategori, penyusutan nilai aset, arsip divisi (alternatif hapus), keanggotaan pengguna di beberapa divisi.
