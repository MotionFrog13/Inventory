# Rencana Implementasi Fase 1 — Fondasi Multi-Tenant & Divisi Dinamis

> **Untuk pelaksana:** kerjakan task **berurutan**. Centang langkah (`- [ ]` → `- [x]`) saat selesai dan commit di akhir setiap task. Jangan lanjut ke task berikutnya bila langkah verifikasi gagal — perbaiki dulu.

**Spec:** [docs/superpowers/specs/2026-09-29-fase1-multi-tenant-divisi-dinamis-design.md](../specs/2026-09-29-fase1-multi-tenant-divisi-dinamis-design.md)

**Tujuan:** setiap data milik tepat satu `Organization`; divisi & kategori menjadi data yang dikelola pengguna; peran menjadi 3 tingkat + divisi; pengguna bisa memegang beberapa outlet; login mendukung mode self-hosted dan SaaS — tanpa mematahkan fitur yang sudah ada.

**Arsitektur singkat:** `db` (client Prisma yang terikat organisasi lewat Prisma Client Extension) hanya bisa diperoleh dari `requireUserScope()` / `getPageContext()`, yang lebih dulu menjalankan pengecekan fail-closed. Relasi wajib memakai FK komposit `(organizationId, …)` sehingga database menolak referensi lintas organisasi. Divisi & outlet tetap dibatasi helper `src/lib/scope.ts`. ESLint melarang jalan pintas ke client mentah.

**Tech stack:** Next.js 16.2 (App Router, `src/proxy.ts`), Prisma 7.8 + `@prisma/adapter-pg`, PostgreSQL, TypeScript, Tailwind v4. Pengujian: `node:test` lewat `ts-node` (tanpa dependency baru), integration test terhadap database pengembangan, dan QA runner HTTP (`qa-test-runner.ts`).

---

## Hasil Verifikasi Saat Perencanaan

| Hal | Hasil |
|---|---|
| Skema dengan FK komposit yang berbagi `organizationId` | `prisma validate` dan `prisma generate` lolos (Prisma 7.8.0) |
| Nested create `User` → `UserBranch` | `UserBranchUncheckedCreateWithoutUserInput` hanya berisi `branchId` — `organizationId` diwarisi induk |
| Tipe input `create` | Tetap mewajibkan `organizationId` → route menulisnya eksplisit; extension tetap menimpanya |
| `createManyAndReturn` / `updateManyAndReturn` | Ada di Prisma 7 → wajib ditangani extension |
| Unit test tanpa dependency baru | `node --require ts-node/register --test <file>` berjalan dengan `tsconfig.json` proyek |
| Prisma 7 CLI | `migrate reset` tidak lagi menjalankan seed; `migrate dev` tetap menjalankan generate |
| `forbidden()` Next.js 16 | Masih eksperimental (`experimental.authInterrupts`) → tidak dipakai |

---

## Konvensi Pelaksanaan

- **Branch:** `feat/fase1-multi-tenant-divisi` (sudah dibuat; spec ada di commit `937449f`).
- **Next.js 16:** sebelum menulis kode route handler, proxy, atau halaman, baca panduan terkait di `node_modules/next/dist/docs/01-app/` (sesuai `AGENTS.md`).
- **Build rusak sementara itu normal.** Task 1 menghapus enum lama sehingga banyak berkas tidak lolos tipe sampai dimigrasikan. Setiap task memeriksa tipe **hanya untuk area yang disentuhnya**:
  ```bash
  npx tsc --noEmit 2>&1 | grep -E "<pola path task>"
  ```
  Output kosong = lolos. `npm run typecheck` penuh baru wajib hijau di Task 20.
- **Server dev untuk QA:** `.env` berisi `APP_MODE="saas"` (Task 4). Jalankan `npm run dev` di latar belakang; QA runner: `QA_ONLY=<suite> npm run qa`.
  - **Jangan membuka halaman sebelum Task 15** (termasuk untuk menunggu server siap — tunggu lewat `GET /api/auth/me` yang membalas 401). Layout lama masih mengimpor ekspor yang sudah dihapus; begitu Turbopack mengompilasinya, galat kompilasi itu disajikan untuk **semua** request, termasuk route API. Bila terlanjur, hentikan proses `node …\next\dist\server\lib\start-server.js` proyek ini (menghentikan `npm` saja tidak cukup di Windows) lalu jalankan ulang.
  - **Route lama yang gagal dikompilasi juga "meracuni" server** (mis. saat menjalankan tes "gagal dulu"). Racun hilang tanpa restart begitu berkas route diperbaiki **dan route itu diminta ulang** (Turbopack baru mengompilasi ulang saat route diminta) — cukup jalankan ulang suite-nya setelah implementasi.
- **`$SCRATCH`** pada perintah contoh = folder scratch pelaksana (di luar proyek) untuk berkas sementara seperti cookie jar `curl`.
- **Pesan commit:** `<tipe>(<area>): <ringkasan>` dalam bahasa Indonesia, diakhiri baris
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Gaya kode:** ikuti gaya berkas sekitar — komentar berbahasa Indonesia yang menjelaskan *alasan*, respons `{ success, data | error, message }` lewat `successResponse`/`errorResponse`, `export const dynamic = "force-dynamic"` di setiap route.

---

## Peta Berkas

| Berkas | Aksi | Task |
|---|---|---|
| `prisma/schema.prisma` | Tulis ulang | 1 |
| `prisma/migrations/**` | Hapus seluruhnya, ganti migrasi `init` | 1 |
| `package.json` | Tambah skrip `test:unit`, `test:integration` | 2, 3 |
| `tests/unit/utils.test.ts`, `tests/unit/scope.test.ts` | Baru | 2 |
| `src/lib/utils.ts` | Ubah (peran, label, validator) | 2 |
| `src/lib/scope.ts` | Tulis ulang | 2 |
| `src/lib/tenant-db.ts`, `src/lib/db-errors.ts` | Baru | 3 |
| `tests/integration/tenant-db.test.ts` | Baru | 3 |
| `prisma/seed.ts` | Tulis ulang | 4 |
| `src/lib/app-mode.ts` | Baru | 5 |
| `src/lib/jwt.ts`, `src/lib/auth.ts`, `src/lib/logger.ts`, `src/proxy.ts` | Tulis ulang | 5 |
| `src/app/api/auth/{login,logout,me}/route.ts` | Tulis ulang | 5 |
| `src/app/login/page.tsx`, `src/app/login/LoginForm.tsx` | Ubah / baru | 5 |
| `qa-test-runner.ts`, `qa/context.ts`, `qa/suites/*.ts` | Restrukturisasi / baru | 6–14 |
| `src/app/api/divisions/**`, `src/app/api/categories/[id]/route.ts` | Baru | 7 |
| `src/app/api/assets/route.ts`, `src/app/api/assets/[id]/route.ts` | Ubah | 8 |
| `src/app/api/branches/route.ts`, `src/app/api/branches/[id]/route.ts` | Ubah | 9 |
| `src/lib/users.ts` | Baru | 10 |
| `src/app/api/users/route.ts`, `src/app/api/users/[id]/route.ts` | Tulis ulang | 10 |
| `src/app/api/assets/[id]/transfer/route.ts`, `src/app/api/transfers/**` | Ubah | 11 |
| `src/app/api/assets/[id]/bap/**` | Ubah | 12 |
| `src/app/api/incidents/**`, `src/app/api/reports/**`, `src/app/api/activity-logs/route.ts` | Ubah | 13 |
| `src/lib/mdm.ts`, 4 route MDM | Baru / ganti stub | 14 |
| `src/components/{AppLayoutClient,Sidebar,Header}.tsx` | Ubah | 15 |
| `src/app/page.tsx`, `src/app/assets/page.tsx`, `src/app/assets/[id]/{page,AssetDetailClient}.tsx`, `src/app/assets/[id]/edit/{page,EditAssetForm}.tsx`, `src/app/branches/[id]/page.tsx`, `src/app/transfers/page.tsx` | Ubah | 16 |
| `src/app/assets/new/page.tsx`, `src/app/users/page.tsx`, `src/app/incidents/page.tsx`, `src/app/reports/page.tsx`, `src/app/branches/page.tsx` | Ubah | 17 |
| `src/app/divisions/page.tsx` | Baru | 18 |
| `eslint.config.mjs` | Ubah | 19 |
| `CLAUDE.md`, `AGENTS.md`, `QA.md`, `README.md`, `CHANGELOG.md`, `get-started.md` | Ubah | 21 |

---

## Resep Konversi Route API (dipakai Task 7–14)

Terapkan pada setiap handler route yang disentuh, **lalu** perubahan khusus yang disebut di task-nya:

1. **Konteks di baris pertama handler** — gantikan pasangan `getAuthUser(request)` + `requireUserScope(request)`:
   ```ts
   const ctx = await requireUserScope(request);
   if (!ctx.ok) return ctx.response;
   const { db, scope, user } = ctx;
   ```
2. Hapus `import { prisma } from "@/lib/prisma"`. Semua `prisma.` → `db.` (termasuk `db.$transaction(async (tx) => …)`).
3. `authUser.role` → `user.role`; `authUser.userId` → `user.id`; `authUser.name` → `user.name`; `authUser.username` → `user.username`.
4. Hapus blok `verifyUserExists(...)` — konteks sudah menjamin pengguna ada di database.
5. `writeActivityLog(authUser.userId, authUser.username, ACTION, details, request)` → `writeActivityLog(ctx, ACTION, details, request)`.
6. Setiap `db.<model>.create({ data })` menambahkan `organizationId: user.organizationId` (wajib menurut tipe; extension tetap menimpanya).
7. Kolom aset: `inventory` → `divisionId`, `type` → `categoryId`. Tampilan nama memakai `division: { select: { id: true, name: true } }` dan `category: { select: { id: true, name: true } }`.
8. Pesan `"Unauthorized cross-inventory access detected."` → `"Unauthorized cross-division access detected."` (gunakan helper `divisionAccessError`/`assetAccessError`, jangan menulis string manual).
9. Urutan pemeriksaan tetap: guard akses **sebelum** validasi bisnis yang pesannya memuat detail data.

---

## Task 1: Skema Baru & Migrasi Awal

**Berkas:** `prisma/schema.prisma` (tulis ulang), `prisma/migrations/**` (hapus, lalu `init`).

> ⚠️ Langkah ini **menghapus seluruh data** di database pengembangan. Disetujui pada keputusan D2 (instalasi masih uji coba).

- [x] **1.1 Ganti `prisma/schema.prisma` seluruhnya:**

```prisma
// Prisma Schema — Asset & Device Inventory (multi-tenant)
// Lihat CLAUDE.md untuk dokumentasi model data lengkap.

datasource db {
  provider = "postgresql"
}

generator client {
  provider = "prisma-client-js"
}

// ─────────────────────────────────────────────────────────────────────────
// ISOLASI ORGANISASI (multi-tenant)
// Setiap model KECUALI Organization wajib punya `organizationId`. Client
// tenant (src/lib/tenant-db.ts) menyuntikkan kolom ini ke setiap query, dan
// relasi wajib memakai FK komposit (organizationId, …) sehingga database
// sendiri menolak referensi lintas organisasi. Model baru WAJIB mengikuti pola
// ini — tests/integration/tenant-db.test.ts memeriksanya.
// ─────────────────────────────────────────────────────────────────────────

model Organization {
  id           String        @id @default(cuid())
  name         String
  slug         String        @unique // "kode organisasi" saat login — ^[a-z0-9-]{3,32}$
  divisions    Division[]
  branches     Branch[]
  users        User[]
  activityLogs ActivityLog[]
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt
}

// Divisi (dikelola Super Admin) — mis. IT, Kitchen, Engineering
model Division {
  id             String       @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id])
  name           String
  description    String?
  categories     Category[]
  users          User[]
  assets         Asset[]
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  @@unique([organizationId, id]) // target FK komposit
  @@unique([organizationId, name])
}

// Kategori aset di dalam satu divisi (Super Admin, atau Admin divisi tersebut)
model Category {
  id             String   @id @default(cuid())
  organizationId String
  divisionId     String
  division       Division @relation(fields: [organizationId, divisionId], references: [organizationId, id], onDelete: Cascade)
  name           String
  assets         Asset[]
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@unique([organizationId, id])
  @@unique([divisionId, id]) // target FK komposit Asset(divisionId, categoryId)
  @@unique([divisionId, name])
}

// Cabang / outlet
model Branch {
  id             String       @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id])
  name           String       // Contoh: "Bogor (Pusat)"
  location       String       // Alamat lengkap cabang
  mapUrl         String?      // URL Google Maps Embed
  assets         Asset[]
  userBranches   UserBranch[]
  transfersFrom  Transfer[]   @relation("FromBranch")
  transfersTo    Transfer[]   @relation("ToBranch")
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  @@unique([organizationId, id])
  @@unique([organizationId, name])
}

// Perangkat / Aset — satu baris = satu item ber-stok (mis. 100 pcs sumpit)
model Asset {
  id             String      @id @default(cuid())
  organizationId String
  divisionId     String      // Divisi pemilik — tidak dapat diubah setelah dibuat
  categoryId     String      // Kategori di divisi yang sama (dijamin FK komposit)
  branchId       String      // Lokasi aset saat ini
  division       Division    @relation(fields: [organizationId, divisionId], references: [organizationId, id])
  category       Category    @relation(fields: [divisionId, categoryId], references: [divisionId, id])
  branch         Branch      @relation(fields: [organizationId, branchId], references: [organizationId, id])
  name           String      // Contoh: "Laptop Dell Latitude 3420"
  serialNumber   String?     // Unik per kategori
  brand          String?
  model          String?
  specs          String?
  purchaseDate   DateTime?
  warrantyDate   DateTime?   // Tanggal garansi berakhir
  // Status headline — DITURUNKAN dari komposisi stok oleh `deriveAssetStatus()`
  // (src/lib/stock.ts). Jangan diset manual di route baru.
  status         AssetStatus
  // Invariant: quantity = activeQty + brokenQty + repairQty + retiredQty + reservedQty
  quantity       Int         @default(1)
  activeQty      Int         @default(1)
  brokenQty      Int         @default(0)
  repairQty      Int         @default(0)
  retiredQty     Int         @default(0)
  reservedQty    Int         @default(0) // Terkunci pengajuan BAP (PENDING)
  photoUrl       String?
  notes          String?
  incidents      Incident[]
  transfers      Transfer[]
  baps           Bap[]
  mdm            MdmDevice?
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt

  @@unique([organizationId, id])
  @@unique([categoryId, serialNumber]) // cadangan validasi aplikasi; NULL boleh berulang
  @@index([organizationId, divisionId, branchId])
  @@index([branchId])
  @@index([status])
}

// BAP (Berita Acara Pemeriksaan) — riwayat append-only, one-to-many per aset
model Bap {
  id              String         @id @default(cuid())
  organizationId  String
  assetId         String
  asset           Asset          @relation(fields: [organizationId, assetId], references: [organizationId, id], onDelete: Cascade)
  quantity        Int            @default(1)
  sourceCondition StockCondition @default(ACTIVE) // Bucket asal — tujuan pengembalian saat ditolak
  fileUrl         String
  status          BapStatus      @default(PENDING)
  previousStatus  AssetStatus    @default(ACTIVE)
  notes           String?
  requestedById   String
  requestedBy     User           @relation("BapRequestedBy", fields: [organizationId, requestedById], references: [organizationId, id])
  approvedById    String?
  approvedBy      User?          @relation("BapApprovedBy", fields: [approvedById], references: [id]) // opsional → FK biasa, divalidasi aplikasi
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt

  @@index([assetId])
  @@index([assetId, status])
  @@index([requestedById])
  @@index([approvedById])
}

// MDM — dinonaktifkan selama Fase 1 (route membalas 404); tabel dipertahankan
// agar desain ulang tidak perlu mengubah tabel inti.
model MdmDevice {
  id               String       @id @default(cuid())
  organizationId   String
  assetId          String       @unique
  asset            Asset        @relation(fields: [organizationId, assetId], references: [organizationId, id], onDelete: Cascade)
  udid             String       @unique
  deviceToken      String       @unique
  osVersion        String?
  lastCheckIn      DateTime?
  isCompliant      Boolean      @default(true)
  batteryLevel     Int?
  storageTotal     BigInt?
  storageUsed      BigInt?
  encryptionActive Boolean      @default(false)
  isJailbroken     Boolean      @default(false)
  mdmStatus        MdmStatus    @default(ENROLLED)
  commands         MdmCommand[]
  createdAt        DateTime     @default(now())
  updatedAt        DateTime     @updatedAt

  @@unique([organizationId, id])
  @@unique([organizationId, assetId])
}

model MdmCommand {
  id             String        @id @default(cuid())
  organizationId String
  mdmDeviceId    String
  mdmDevice      MdmDevice     @relation(fields: [organizationId, mdmDeviceId], references: [organizationId, id], onDelete: Cascade)
  commandType    CommandType
  status         CommandStatus @default(PENDING)
  requestedBy    String
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt

  @@index([mdmDeviceId])
}

// Mutasi / Transfer antar cabang (persetujuan hanya oleh outlet asal)
model Transfer {
  id             String         @id @default(cuid())
  organizationId String
  assetId        String
  asset          Asset          @relation(fields: [organizationId, assetId], references: [organizationId, id])
  fromBranchId   String
  fromBranch     Branch         @relation("FromBranch", fields: [organizationId, fromBranchId], references: [organizationId, id])
  toBranchId     String
  toBranch       Branch         @relation("ToBranch", fields: [organizationId, toBranchId], references: [organizationId, id])
  reason         String
  status         TransferStatus @default(PENDING)
  requestedById  String
  requestedBy    User           @relation("TransferRequestedBy", fields: [organizationId, requestedById], references: [organizationId, id])
  approvedById   String?
  approvedBy     User?          @relation("TransferApprovedBy", fields: [approvedById], references: [id])
  transferredAt  DateTime       @default(now())
  updatedAt      DateTime       @updatedAt

  @@index([assetId])
  @@index([fromBranchId])
  @@index([toBranchId])
  @@index([requestedById])
  @@index([approvedById])
}

// Riwayat Insiden / Kerusakan (digantikan Ticket di Fase 2)
model Incident {
  id                 String    @id @default(cuid())
  organizationId     String
  assetId            String
  asset              Asset     @relation(fields: [organizationId, assetId], references: [organizationId, id])
  quantity           Int       @default(1)
  description        String
  solution           String?
  resolveStatus      String?   // null | "PENDING_REVIEW" | "APPROVED" | "REJECTED"
  pendingSolution    String?
  pendingAssetStatus String?
  proposedBy         String?
  proposedAt         DateTime?
  reportedAt         DateTime  @default(now())
  resolvedAt         DateTime?
  handledBy          String?

  @@index([assetId])
}

model User {
  id                 String        @id @default(cuid())
  organizationId     String
  organization       Organization  @relation(fields: [organizationId], references: [id])
  email              String?       @unique // huruf kecil; wajib untuk SUPER_ADMIN (validasi aplikasi)
  username           String        // ^[a-z0-9._-]{3,32}$ — unik per organisasi
  password           String        // bcrypt hash
  name               String
  role               Role          @default(DIVISION_STAFF)
  // NULL hanya sah untuk SUPER_ADMIN; peran lain tanpa divisi ⇒ akses DITOLAK
  // (fail closed, lihat resolveScope()). Restrict eksplisit: default Prisma
  // untuk relasi opsional (SetNull) akan diam-diam mengunci pengguna bila
  // divisinya terhapus.
  divisionId         String?
  division           Division?     @relation(fields: [divisionId], references: [id], onDelete: Restrict)
  branches           UserBranch[]  // outlet penugasan; kosong hanya untuk SUPER_ADMIN
  bapsRequested      Bap[]         @relation("BapRequestedBy")
  bapsApproved       Bap[]         @relation("BapApprovedBy")
  transfersRequested Transfer[]    @relation("TransferRequestedBy")
  transfersApproved  Transfer[]    @relation("TransferApprovedBy")
  activityLogs       ActivityLog[]
  createdAt          DateTime      @default(now())

  @@unique([organizationId, id])
  @@unique([organizationId, username])
  @@index([divisionId])
}

// Penugasan pengguna ke satu atau beberapa outlet
model UserBranch {
  organizationId String
  userId         String
  branchId       String
  user           User   @relation(fields: [organizationId, userId], references: [organizationId, id], onDelete: Cascade)
  branch         Branch @relation(fields: [organizationId, branchId], references: [organizationId, id])

  @@id([userId, branchId])
  @@index([organizationId, branchId])
}

// Activity Log (hanya SUPER_ADMIN organisasi tersebut; read-only)
model ActivityLog {
  id             String       @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id])
  userId         String?
  user           User?        @relation(fields: [userId], references: [id], onDelete: SetNull)
  username       String       // Fallback jika user dihapus
  action         String
  details        String
  ipAddress      String?
  createdAt      DateTime     @default(now())

  @@index([organizationId, createdAt])
  @@index([userId])
  @@index([action])
}

enum Role {
  SUPER_ADMIN
  DIVISION_ADMIN
  DIVISION_STAFF
}

enum AssetStatus {
  ACTIVE      // Normal, berfungsi baik
  BROKEN      // Rusak, menunggu tindakan
  REPAIR      // Sedang dalam perbaikan/servis
  RETIRED     // Sudah tidak digunakan
  BAP_PENDING // Seluruh sisa stok terkunci pengajuan BAP
  BAP         // Stok habis dihapus melalui BAP
}

enum BapStatus {
  PENDING
  APPROVED
  REJECTED
}

// Kondisi stok — sub-himpunan AssetStatus yang benar-benar menampung pcs.
enum StockCondition {
  ACTIVE
  BROKEN
  REPAIR
  RETIRED
}

enum TransferStatus {
  PENDING
  APPROVED
  REJECTED
}

enum MdmStatus {
  ENROLLED
  UNENROLLED
  WIPED
}

enum CommandType {
  LOCK
  WIPE
  REBOOT
  SYNC
}

enum CommandStatus {
  PENDING
  SENT
  SUCCESS
  FAILED
}
```

- [x] **1.2 Rapikan & validasi skema:**
  ```bash
  npx prisma format
  npx prisma validate
  ```
  Harapan: `The schema at prisma\schema.prisma is valid 🚀`.

- [x] **1.3 Hapus migrasi lama, reset database, buat migrasi awal:**
  ```bash
  rm -rf prisma/migrations
  npx prisma migrate reset --force
  npx prisma migrate dev --name init
  npx prisma generate
  ```
  Harapan: folder baru `prisma/migrations/<timestamp>_init/` berisi `migration.sql`, `migration_lock.toml` dibuat ulang, pesan `Your database is now in sync with your schema`, lalu `Generated Prisma Client`.

  > **Catatan eksekusi (2026-09-29):**
  > - Prisma 7 menolak `migrate reset` yang dijalankan agen AI kecuali variabel `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` berisi teks persis pesan persetujuan pengguna **untuk aksi itu** — persetujuan umum ("mulai task 1") tidak dihitung. Minta persetujuan eksplisit sebelum setiap reset database.
  > - `migrate dev` tidak menampilkan `Generated Prisma Client`, jadi `npx prisma generate` dijalankan terpisah.
  > - Hasil: migrasi `20260929104530_init`.

- [x] **1.4 Pastikan FK komposit benar-benar ada di SQL:**
  ```bash
  grep -c 'FOREIGN KEY ("organizationId", "branchId") REFERENCES "Branch"("organizationId", "id")' prisma/migrations/*_init/migration.sql
  grep -c 'FOREIGN KEY ("divisionId", "categoryId") REFERENCES "Category"("divisionId", "id")' prisma/migrations/*_init/migration.sql
  npx prisma migrate status
  ```
  Harapan: angka ≥ 1 untuk keduanya; status `Database schema is up to date!`.

- [x] **1.5 Commit:**
  ```bash
  git add prisma/schema.prisma prisma/migrations
  git commit -m "feat(db): skema multi-tenant dengan divisi & kategori dinamis" -m "Organization sebagai tenant, FK komposit (organizationId, …) pada relasi wajib, peran 3 tingkat, penugasan multi-outlet (UserBranch). Migrasi lama diganti satu migrasi init." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

---

## Task 2: Harness Unit Test, `utils.ts`, dan `scope.ts` (TDD)

**Berkas:** `package.json`, `tests/unit/utils.test.ts` (baru), `tests/unit/scope.test.ts` (baru), `src/lib/utils.ts`, `src/lib/scope.ts`.

- [x] **2.1 Tambah skrip di `package.json` (`scripts`):**
  ```json
  "test:unit": "node --require ts-node/register --test \"tests/unit/**/*.test.ts\""
  ```

- [x] **2.2 Tulis `tests/unit/utils.test.ts` (gagal dulu):**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  VALID_ROLES,
  branchScopeLabel,
  divisionScopeLabel,
  isAdminRole,
  isValidEmail,
  isValidOrgSlug,
  isValidUsername,
  normalizeEmail,
  normalizeName,
  roleLabel,
} from "../../src/lib/utils";

test("VALID_ROLES berisi tiga tingkat peran", () => {
  assert.deepEqual([...VALID_ROLES], ["SUPER_ADMIN", "DIVISION_ADMIN", "DIVISION_STAFF"]);
});

test("roleLabel menggabungkan tingkat peran dan nama divisi", () => {
  assert.equal(roleLabel("SUPER_ADMIN", "IT"), "Super Admin");
  assert.equal(roleLabel("DIVISION_ADMIN", "Kitchen"), "Admin Kitchen");
  assert.equal(roleLabel("DIVISION_STAFF", "Engineering"), "Staf Engineering");
  assert.equal(roleLabel("DIVISION_ADMIN", null), "Admin Divisi");
  assert.equal(roleLabel("DIVISION_STAFF"), "Staf Divisi");
});

test("isAdminRole hanya untuk SUPER_ADMIN dan DIVISION_ADMIN", () => {
  assert.equal(isAdminRole("SUPER_ADMIN"), true);
  assert.equal(isAdminRole("DIVISION_ADMIN"), true);
  assert.equal(isAdminRole("DIVISION_STAFF"), false);
  assert.equal(isAdminRole("ADMIN_IT"), false); // peran lama tidak dikenali
  assert.equal(isAdminRole(null), false);
});

test("isValidUsername: huruf kecil, angka, . _ -, 3–32 karakter, tanpa @", () => {
  assert.equal(isValidUsername("admin_it"), true);
  assert.equal(isValidUsername("a.b-c_1"), true);
  assert.equal(isValidUsername("ab"), false);
  assert.equal(isValidUsername("Admin"), false);
  assert.equal(isValidUsername("user@demo"), false);
  assert.equal(isValidUsername("a".repeat(33)), false);
});

test("isValidOrgSlug: huruf kecil, angka, tanda hubung, 3–32 karakter", () => {
  assert.equal(isValidOrgSlug("demo"), true);
  assert.equal(isValidOrgSlug("uji-b"), true);
  assert.equal(isValidOrgSlug("ab"), false);
  assert.equal(isValidOrgSlug("Demo"), false);
  assert.equal(isValidOrgSlug("uji_b"), false);
});

test("normalizeEmail dan isValidEmail", () => {
  assert.equal(normalizeEmail("  Admin@Demo.Local "), "admin@demo.local");
  assert.equal(normalizeEmail(""), null);
  assert.equal(normalizeEmail(undefined), null);
  assert.equal(isValidEmail("admin@demo.local"), true);
  assert.equal(isValidEmail("admin@demo"), false);
});

test("normalizeName merapikan spasi dan membatasi panjang", () => {
  assert.equal(normalizeName("  Tablet   POS "), "Tablet POS");
  assert.equal(normalizeName("   "), null);
  assert.equal(normalizeName("x".repeat(61)), null);
  assert.equal(normalizeName(42), null);
});

test("label cakupan divisi & outlet", () => {
  const org = { name: "Demo Resto" };
  assert.equal(divisionScopeLabel({ division: null }), "Semua Divisi");
  assert.equal(divisionScopeLabel({ division: { name: "Kitchen" } }), "Kitchen");
  assert.equal(branchScopeLabel({ role: "SUPER_ADMIN", branches: [], organization: org }), "seluruh cabang Demo Resto");
  assert.equal(branchScopeLabel({ role: "DIVISION_ADMIN", branches: [{ name: "Bogor" }], organization: org }), "outlet Bogor");
  assert.equal(
    branchScopeLabel({ role: "DIVISION_STAFF", branches: [{ name: "Bogor" }, { name: "Jakarta" }], organization: org }),
    "2 outlet (Bogor, Jakarta)"
  );
});
```

- [x] **2.3 Tulis `tests/unit/scope.test.ts` (gagal dulu):**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assetAccessError,
  assetRelationScopeWhere,
  assetScopeWhere,
  canApproveTransfer,
  canManageCategories,
  canViewTransfer,
  effectiveBranchFilter,
  effectiveDivisionFilter,
  resolveScope,
  transferScopeWhere,
  validateAssignment,
  type UserScope,
} from "../../src/lib/scope";

const ORG = "org-1";
const superAdmin = { role: "SUPER_ADMIN", organizationId: ORG, divisionId: null, branches: [] };
const admin = {
  role: "DIVISION_ADMIN",
  organizationId: ORG,
  divisionId: "div-it",
  branches: [{ id: "br-a" }, { id: "br-b" }],
};
const superScope = resolveScope(superAdmin) as UserScope;
const adminScope = resolveScope(admin) as UserScope;

test("resolveScope: SUPER_ADMIN lintas divisi & outlet, tetap di organisasinya", () => {
  assert.deepEqual(superScope, { organizationId: ORG, divisionId: null, branchIds: null });
});

test("resolveScope: admin divisi terikat divisi dan outletnya", () => {
  assert.deepEqual(adminScope, { organizationId: ORG, divisionId: "div-it", branchIds: ["br-a", "br-b"] });
});

test("resolveScope: tanpa divisi atau tanpa outlet ditolak (fail closed)", () => {
  assert.equal(resolveScope({ ...admin, divisionId: null }), null);
  assert.equal(resolveScope({ ...admin, branches: [] }), null);
});

test("resolveScope: peran tak dikenal ditolak", () => {
  assert.equal(resolveScope({ ...admin, role: "ADMIN_IT" }), null);
});

test("assetScopeWhere & assetRelationScopeWhere", () => {
  assert.deepEqual(assetScopeWhere(adminScope), { divisionId: "div-it", branchId: { in: ["br-a", "br-b"] } });
  assert.deepEqual(assetScopeWhere(superScope), {});
  assert.deepEqual(assetRelationScopeWhere(adminScope), {
    asset: { divisionId: "div-it", branchId: { in: ["br-a", "br-b"] } },
  });
  assert.deepEqual(assetRelationScopeWhere(superScope), {});
});

test("transferScopeWhere: divisi lewat aset + kedua sisi outlet, dibungkus AND", () => {
  assert.deepEqual(transferScopeWhere(adminScope), {
    AND: [
      { asset: { divisionId: "div-it" } },
      { OR: [{ fromBranchId: { in: ["br-a", "br-b"] } }, { toBranchId: { in: ["br-a", "br-b"] } }] },
    ],
  });
  assert.deepEqual(transferScopeWhere(superScope), {});
});

test("canViewTransfer & canApproveTransfer", () => {
  const incoming = { fromBranchId: "br-x", toBranchId: "br-a" };
  const outgoing = { fromBranchId: "br-b", toBranchId: "br-x" };
  assert.equal(canViewTransfer(adminScope, incoming), true);
  assert.equal(canApproveTransfer(adminScope, incoming), false); // hanya outlet asal
  assert.equal(canApproveTransfer(adminScope, outgoing), true);
  assert.equal(canViewTransfer(adminScope, { fromBranchId: "br-x", toBranchId: "br-y" }), false);
  assert.equal(canApproveTransfer(superScope, incoming), true);
});

test("assetAccessError membedakan divisi dan outlet", () => {
  assert.equal(assetAccessError(adminScope, { divisionId: "div-it", branchId: "br-a" }), null);
  assert.equal(
    assetAccessError(adminScope, { divisionId: "div-kitchen", branchId: "br-a" })?.error,
    "Unauthorized cross-division access detected."
  );
  assert.equal(
    assetAccessError(adminScope, { divisionId: "div-it", branchId: "br-x" })?.error,
    "Unauthorized cross-branch access detected."
  );
  assert.equal(assetAccessError(superScope, { divisionId: "div-kitchen", branchId: "br-x" }), null);
});

test("effectiveBranchFilter tidak pernah memperluas akses", () => {
  assert.deepEqual(effectiveBranchFilter(adminScope, "br-b"), ["br-b"]);
  assert.deepEqual(effectiveBranchFilter(adminScope, "br-x"), ["br-a", "br-b"]); // outlet asing diabaikan
  assert.deepEqual(effectiveBranchFilter(adminScope, null), ["br-a", "br-b"]);
  assert.deepEqual(effectiveBranchFilter(superScope, "br-x"), ["br-x"]);
  assert.equal(effectiveBranchFilter(superScope, null), undefined);
});

test("effectiveDivisionFilter hanya dihormati untuk SUPER_ADMIN", () => {
  assert.equal(effectiveDivisionFilter(adminScope, "div-kitchen"), "div-it");
  assert.equal(effectiveDivisionFilter(superScope, "div-kitchen"), "div-kitchen");
  assert.equal(effectiveDivisionFilter(superScope, ""), undefined);
});

test("canManageCategories: SUPER_ADMIN, atau DIVISION_ADMIN divisinya sendiri", () => {
  assert.equal(canManageCategories("SUPER_ADMIN", superScope, "div-kitchen"), true);
  assert.equal(canManageCategories("DIVISION_ADMIN", adminScope, "div-it"), true);
  assert.equal(canManageCategories("DIVISION_ADMIN", adminScope, "div-kitchen"), false);
  const staffScope = { ...adminScope };
  assert.equal(canManageCategories("DIVISION_STAFF", staffScope, "div-it"), false);
});

test("validateAssignment mengikuti peran final", () => {
  assert.deepEqual(validateAssignment("SUPER_ADMIN", "div-it", ["br-a"]), { ok: true, divisionId: null, branchIds: [] });
  assert.equal(validateAssignment("DIVISION_STAFF", "", ["br-a"]).ok, false);
  assert.equal(validateAssignment("DIVISION_STAFF", "div-it", []).ok, false);
  assert.equal(validateAssignment("DIVISION_STAFF", "div-it", "br-a").ok, false);
  assert.deepEqual(validateAssignment("DIVISION_ADMIN", "div-it", ["br-a", "br-a", "br-b"]), {
    ok: true,
    divisionId: "div-it",
    branchIds: ["br-a", "br-b"],
  });
});
```

- [x] **2.4 Jalankan dan pastikan gagal:**
  ```bash
  npm run test:unit
  ```
  Harapan: gagal kompilasi/impor (`roleLabel`, `canManageCategories`, dst. belum ada).

- [x] **2.5 Ubah `src/lib/utils.ts`:**
  - **Hapus** seluruhnya: `getInventoryForRole`, `ROLE_LABELS`, `ASSET_TYPE_LABELS`, `IT_ASSET_TYPES`, `KITCHEN_ASSET_TYPES`, `ASSET_TYPES_BY_INVENTORY`, `getAssetTypeOptions`, serta `isAdminRole` dan `VALID_ROLES` versi lama.
  - Pertahankan fungsi lain (`formatDate`, `successResponse`, `errorResponse`, `parsePagination`, `isSuperAdmin`, label/warna status, dst.).
  - **Tambahkan** di bagian bawah:

```ts
/**
 * Tiga tingkat peran. Divisi TIDAK lagi dikodekan di dalam peran — divisi
 * adalah data (`User.divisionId`) yang dikelola Super Admin.
 */
export const VALID_ROLES = ["SUPER_ADMIN", "DIVISION_ADMIN", "DIVISION_STAFF"] as const;
export type RoleTier = (typeof VALID_ROLES)[number];

/** Label tingkat peran untuk pilihan di form (tanpa nama divisi). */
export const ROLE_TIER_LABELS: Record<RoleTier, string> = {
  SUPER_ADMIN: "Super Admin",
  DIVISION_ADMIN: "Admin Divisi",
  DIVISION_STAFF: "Staf Divisi",
};

/**
 * Label peran lengkap: "Super Admin", "Admin Kitchen", "Staf Engineering".
 * Akun yang belum punya divisi tampil generik.
 */
export function roleLabel(role: string, divisionName?: string | null): string {
  if (role === "SUPER_ADMIN") return ROLE_TIER_LABELS.SUPER_ADMIN;
  if (role === "DIVISION_ADMIN") {
    return divisionName ? `Admin ${divisionName}` : ROLE_TIER_LABELS.DIVISION_ADMIN;
  }
  if (role === "DIVISION_STAFF") {
    return divisionName ? `Staf ${divisionName}` : ROLE_TIER_LABELS.DIVISION_STAFF;
  }
  return role;
}

/** Tingkat admin: boleh mengelola aset dan menyetujui/menolak pengajuan. */
export function isAdminRole(role?: string | null): boolean {
  return role === "SUPER_ADMIN" || role === "DIVISION_ADMIN";
}

/** Username: huruf kecil, angka, titik, garis bawah, tanda hubung — tanpa "@". */
export const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;
/** Kode organisasi (slug) untuk login mode SaaS. */
export const ORG_SLUG_PATTERN = /^[a-z0-9-]{3,32}$/;

export function isValidUsername(value: unknown): value is string {
  return typeof value === "string" && USERNAME_PATTERN.test(value);
}

export function isValidOrgSlug(value: unknown): value is string {
  return typeof value === "string" && ORG_SLUG_PATTERN.test(value);
}

/** Email disimpan huruf kecil tanpa spasi; string kosong berarti "tidak ada". */
export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email === "" ? null : email;
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Nama divisi/kategori: spasi dirapikan, 1–`maxLength` karakter. `null` bila
 * tidak valid agar pemanggil membalas 400.
 */
export function normalizeName(value: unknown, maxLength = 60): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/\s+/g, " ");
  return name.length === 0 || name.length > maxLength ? null : name;
}

/**
 * Bentuk data sesi yang dikirim `/api/auth/me` ke komponen klien (Sidebar,
 * Header, form). Didefinisikan di sini karena src/lib/auth.ts tidak boleh
 * diimpor dari komponen klien.
 */
export interface SessionUserView {
  id: string;
  username: string;
  name: string;
  email: string | null;
  role: string;
  roleLabel: string;
  organization: { id: string; name: string; slug: string };
  division: { id: string; name: string } | null;
  branches: { id: string; name: string }[];
  access: "ok" | "unassigned";
}

/** "Kitchen", atau "Semua Divisi" untuk SUPER_ADMIN. */
export function divisionScopeLabel(user: { division: { name: string } | null }): string {
  return user.division?.name ?? "Semua Divisi";
}

/**
 * Cakupan wilayah untuk subtitle halaman — angka pada kartu tidak boleh salah
 * dibaca sebagai angka seluruh organisasi ketika pengguna terikat outlet.
 */
export function branchScopeLabel(user: {
  role: string;
  branches: { name: string }[];
  organization: { name: string };
}): string {
  if (isSuperAdmin(user.role)) return `seluruh cabang ${user.organization.name}`;
  if (user.branches.length === 1) return `outlet ${user.branches[0].name}`;
  return `${user.branches.length} outlet (${user.branches.map((b) => b.name).join(", ")})`;
}
```

- [x] **2.6 Tulis ulang `src/lib/scope.ts` seluruhnya:**

```ts
// Hanya tipe — menjaga modul ini tetap ringan sehingga aman diimpor dari
// komponen klien maupun server tanpa menyeret Prisma ke bundle browser.
import type { Prisma } from "@prisma/client";
import { errorResponse, isSuperAdmin } from "./utils";

/**
 * Cakupan data satu pengguna — sumber kebenaran tunggal untuk TIGA sumbu
 * pembatasan yang berlaku bersamaan:
 *
 *   1. Organisasi (`organizationId`) — ditegakkan client tenant
 *      (src/lib/tenant-db.ts); helper di file ini TIDAK menambahkannya lagi.
 *   2. Divisi     (`divisionId`)
 *   3. Outlet     (`branchIds`)
 *
 * `null` pada divisi/outlet berarti "tanpa batasan pada sumbu itu" dan hanya
 * SUPER_ADMIN yang memperolehnya. Peran lain tanpa divisi atau tanpa outlet
 * ditolak di `resolveScope()` — bukan diperlakukan sebagai akses penuh.
 */
export interface UserScope {
  organizationId: string;
  divisionId: string | null;
  branchIds: string[] | null;
}

/**
 * Identitas minimum untuk menurunkan cakupan. Isi dengan data dari DATABASE
 * (lihat requireUserScope()/getPageContext() di src/lib/auth.ts), bukan dari
 * payload JWT yang membeku saat login.
 */
export interface ScopedIdentity {
  role: string;
  organizationId: string;
  divisionId: string | null;
  branches: { id: string }[];
}

export const UNASSIGNED_MESSAGE =
  "Akun Anda belum ditugaskan ke divisi dan outlet. Hubungi Super Admin.";

const CROSS_DIVISION_ERROR = "Unauthorized cross-division access detected.";
const CROSS_BRANCH_ERROR = "Unauthorized cross-branch access detected.";

/**
 * Turunkan cakupan data dari identitas pengguna. `null` = akses DITOLAK
 * (fail closed) — pemanggil wajib memperlakukannya sebagai penolakan.
 */
export function resolveScope(user: ScopedIdentity): UserScope | null {
  if (isSuperAdmin(user.role)) {
    return { organizationId: user.organizationId, divisionId: null, branchIds: null };
  }

  // Peran yang tidak dikenal (mis. token lama "ADMIN_IT") tidak pernah
  // memperoleh cakupan apa pun.
  if (user.role !== "DIVISION_ADMIN" && user.role !== "DIVISION_STAFF") return null;

  const branchIds = user.branches.map((branch) => branch.id);
  if (!user.divisionId || branchIds.length === 0) return null;

  return { organizationId: user.organizationId, divisionId: user.divisionId, branchIds };
}

/** Filter Prisma untuk tabel `Asset` — divisi + outlet. */
export function assetScopeWhere(scope: UserScope): Prisma.AssetWhereInput {
  return {
    ...(scope.divisionId ? { divisionId: scope.divisionId } : {}),
    ...(scope.branchIds ? { branchId: { in: scope.branchIds } } : {}),
  };
}

/** Filter untuk tabel yang menggantung pada aset (Incident, Bap). */
export function assetRelationScopeWhere(
  scope: UserScope
): { asset: Prisma.AssetWhereInput } | Record<string, never> {
  const where = assetScopeWhere(scope);
  return Object.keys(where).length > 0 ? { asset: where } : {};
}

/**
 * Filter untuk tabel `Transfer`: divisi lewat aset, outlet pada KEDUA sisi
 * mutasi (keluar dari maupun masuk ke outlet pengguna). Dibungkus `AND` agar
 * `OR` milik pemanggil (mis. pencarian) tidak menimpanya.
 */
export function transferScopeWhere(scope: UserScope): Prisma.TransferWhereInput {
  const parts: Prisma.TransferWhereInput[] = [];
  if (scope.divisionId) parts.push({ asset: { divisionId: scope.divisionId } });
  if (scope.branchIds) {
    parts.push({
      OR: [
        { fromBranchId: { in: scope.branchIds } },
        { toBranchId: { in: scope.branchIds } },
      ],
    });
  }
  return parts.length > 0 ? { AND: parts } : {};
}

/** Boleh MELIHAT transfer bila salah satu sisinya outlet pengguna. */
export function canViewTransfer(
  scope: UserScope,
  transfer: { fromBranchId: string; toBranchId: string }
): boolean {
  if (!scope.branchIds) return true;
  return (
    scope.branchIds.includes(transfer.fromBranchId) ||
    scope.branchIds.includes(transfer.toBranchId)
  );
}

/**
 * Boleh MENYETUJUI/MENOLAK transfer hanya bila outlet ASAL milik pengguna —
 * cabang tujuan tidak boleh menarik aset cabang lain lewat persetujuannya sendiri.
 */
export function canApproveTransfer(scope: UserScope, transfer: { fromBranchId: string }): boolean {
  if (!scope.branchIds) return true;
  return scope.branchIds.includes(transfer.fromBranchId);
}

/** Penolakan bila data milik divisi lain; `null` = diizinkan. */
export function divisionAccessError(
  scope: UserScope,
  divisionId: string
): { error: string; message: string } | null {
  if (scope.divisionId && divisionId !== scope.divisionId) {
    return { error: CROSS_DIVISION_ERROR, message: "Akses ditolak" };
  }
  return null;
}

/**
 * Guard satu aset — memeriksa divisi lalu outlet. Pesan sengaja dibedakan agar
 * log & QA dapat memastikan penolakan berasal dari aturan yang benar.
 */
export function assetAccessError(
  scope: UserScope,
  asset: { divisionId: string; branchId: string }
): { error: string; message: string } | null {
  const division = divisionAccessError(scope, asset.divisionId);
  if (division) return division;
  if (scope.branchIds && !scope.branchIds.includes(asset.branchId)) {
    return { error: CROSS_BRANCH_ERROR, message: "Akses ditolak" };
  }
  return null;
}

/** Versi siap-pakai `assetAccessError()` untuk route handler (403 atau null). */
export function assetAccessDenied(
  scope: UserScope,
  asset: { divisionId: string; branchId: string }
): Response | null {
  const denied = assetAccessError(scope, asset);
  return denied ? errorResponse(denied.error, denied.message, 403) : null;
}

/** Kelola kategori: SUPER_ADMIN, atau DIVISION_ADMIN untuk divisinya sendiri. */
export function canManageCategories(role: string, scope: UserScope, divisionId: string): boolean {
  if (isSuperAdmin(role)) return true;
  return role === "DIVISION_ADMIN" && scope.divisionId === divisionId;
}

/**
 * Validasi penugasan saat membuat/mengubah akun, terhadap peran FINAL:
 *   • SUPER_ADMIN → divisi & outlet SELALU dikosongkan.
 *   • peran lain  → divisi dan minimal satu outlet WAJIB (akun tanpa keduanya
 *     terkunci total). Keberadaan ID dicek pemanggil lewat client tenant.
 */
export function validateAssignment(
  role: string,
  divisionId: unknown,
  branchIds: unknown
): { ok: true; divisionId: string | null; branchIds: string[] } | { ok: false; message: string } {
  if (isSuperAdmin(role)) return { ok: true, divisionId: null, branchIds: [] };

  if (typeof divisionId !== "string" || divisionId.trim() === "") {
    return {
      ok: false,
      message: "Divisi wajib dipilih untuk peran selain Super Admin — akun tanpa divisi tidak dapat mengakses data apa pun.",
    };
  }
  if (
    !Array.isArray(branchIds) ||
    branchIds.length === 0 ||
    branchIds.some((id) => typeof id !== "string" || id.trim() === "")
  ) {
    return {
      ok: false,
      message: "Minimal satu outlet wajib dipilih untuk peran selain Super Admin — akun tanpa outlet tidak dapat mengakses data apa pun.",
    };
  }
  return { ok: true, divisionId, branchIds: [...new Set(branchIds as string[])] };
}

/**
 * Outlet sebagai filter tampilan (`?branchId=`). Nilai dari klien hanya
 * dihormati bila outlet itu milik pengguna; selain itu DIABAIKAN dan pengguna
 * melihat seluruh outletnya — filter UI tidak boleh memperluas akses.
 * `undefined` = tanpa filter (hanya SUPER_ADMIN tanpa pilihan).
 */
export function effectiveBranchFilter(
  scope: UserScope,
  requested?: string | null
): string[] | undefined {
  if (!scope.branchIds) return requested ? [requested] : undefined;
  if (requested && scope.branchIds.includes(requested)) return [requested];
  return scope.branchIds;
}

/** Divisi sebagai filter tampilan (`?divisionId=`) — hanya untuk SUPER_ADMIN. */
export function effectiveDivisionFilter(
  scope: UserScope,
  requested?: string | null
): string | undefined {
  return scope.divisionId ?? (requested || undefined);
}
```

- [x] **2.7 Jalankan unit test sampai hijau:**
  ```bash
  npm run test:unit
  ```
  Harapan: semua test `✔`, `ℹ fail 0`.

- [x] **2.8 Cek tipe untuk area ini:**
  ```bash
  npx tsc --noEmit 2>&1 | grep -E "src/lib/(utils|scope)\.ts|tests/unit"
  ```
  Harapan: kosong.

- [x] **2.9 Commit:**
  ```bash
  git add package.json tests/unit src/lib/utils.ts src/lib/scope.ts
  git commit -m "feat(scope): cakupan 3 lapis (organisasi, divisi, outlet) + unit test" -m "Peran 3 tingkat, label peran dinamis, validator username/slug/email, dan helper scope berbasis divisionId + branchIds. Harness node:test lewat ts-node tanpa dependency baru." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

---

## Task 3: Client Tenant + Integration Test (Gerbang Spike)

**Berkas:** `src/lib/tenant-db.ts` (baru), `src/lib/db-errors.ts` (baru), `tests/integration/tenant-db.test.ts` (baru), `package.json`.

Task ini sekaligus membuktikan poin spike §14.1 yang butuh database (extension di dalam transaksi, `findUnique` lintas organisasi). **Bila test transaksi gagal karena extension tidak berlaku di `tx`, lakukan langkah 3.6 sebelum lanjut.**

- [x] **3.1 Tambah skrip di `package.json`:**
  ```json
  "test:integration": "node --env-file=.env --require ts-node/register --test --test-force-exit \"tests/integration/**/*.test.ts\""
  ```

- [x] **3.2 Tulis `src/lib/db-errors.ts`:**

```ts
import { Prisma } from "@prisma/client";

// Kode galat Prisma yang dipetakan route ke respons 4xx. Dipisah dari
// utils.ts karena modul itu juga diimpor komponen klien.

/** Pelanggaran unique constraint (mis. nama divisi ganda) → 409. */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** Pelanggaran foreign key (mis. referensi lintas organisasi). */
export function isForeignKeyViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003";
}

/** Baris yang diubah/dihapus tidak ditemukan dalam cakupan client. */
export function isRecordNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}
```

- [x] **3.3 Tulis `tests/integration/tenant-db.test.ts` (gagal dulu):**

```ts
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { prisma } from "../../src/lib/prisma";
import { tenantDb } from "../../src/lib/tenant-db";
import { isForeignKeyViolation, isRecordNotFound, isUniqueViolation } from "../../src/lib/db-errors";

// Dua organisasi sementara dengan ID unik per run — tidak menyentuh data seed.
const RUN = Date.now().toString(36);

interface Fixture {
  org: string;
  division: string;
  category: string;
  branch1: string;
  branch2: string;
  user: string;
  asset: string;
}

function fixtureIds(tag: string): Fixture {
  const p = `it-${RUN}-${tag}`;
  return {
    org: `${p}-org`,
    division: `${p}-div`,
    category: `${p}-cat`,
    branch1: `${p}-br1`,
    branch2: `${p}-br2`,
    user: `${p}-user`,
    asset: `${p}-asset`,
  };
}

const A = fixtureIds("a");
const B = fixtureIds("b");

async function createFixture(f: Fixture) {
  await prisma.organization.create({ data: { id: f.org, name: `Org ${f.org}`, slug: f.org } });
  await prisma.division.create({ data: { id: f.division, organizationId: f.org, name: "IT" } });
  await prisma.category.create({
    data: { id: f.category, organizationId: f.org, divisionId: f.division, name: "Laptop" },
  });
  await prisma.branch.createMany({
    data: [
      { id: f.branch1, organizationId: f.org, name: "Outlet 1", location: "-" },
      { id: f.branch2, organizationId: f.org, name: "Outlet 2", location: "-" },
    ],
  });
  // Nested create: UserBranch harus mewarisi organizationId dari User.
  await prisma.user.create({
    data: {
      id: f.user,
      organizationId: f.org,
      username: "admin",
      password: "x",
      name: "Admin",
      role: "DIVISION_ADMIN",
      divisionId: f.division,
      branches: { create: [{ branchId: f.branch1 }] },
    },
  });
  await prisma.asset.create({
    data: {
      id: f.asset,
      organizationId: f.org,
      divisionId: f.division,
      categoryId: f.category,
      branchId: f.branch1,
      name: "Laptop Uji",
      status: "ACTIVE",
      quantity: 1,
      activeQty: 1,
    },
  });
}

async function removeFixture(f: Fixture) {
  const where = { organizationId: f.org };
  await prisma.transfer.deleteMany({ where });
  await prisma.asset.deleteMany({ where });
  await prisma.userBranch.deleteMany({ where });
  await prisma.user.deleteMany({ where });
  await prisma.category.deleteMany({ where });
  await prisma.division.deleteMany({ where });
  await prisma.branch.deleteMany({ where });
  await prisma.organization.deleteMany({ where: { id: f.org } });
}

describe("tenantDb — isolasi antar-organisasi", () => {
  const dbA = tenantDb(A.org);

  before(async () => {
    await createFixture(A);
    await createFixture(B);
  });

  after(async () => {
    await removeFixture(A);
    await removeFixture(B);
    await prisma.$disconnect();
  });

  test("setiap model selain Organization punya kolom organizationId", () => {
    const enums = Prisma as unknown as Record<string, Record<string, string> | undefined>;
    for (const model of Object.values(Prisma.ModelName)) {
      if (model === "Organization") continue;
      assert.ok(enums[`${model}ScalarFieldEnum`]?.organizationId, `${model} tidak punya organizationId`);
    }
  });

  test("baca hanya melihat organisasi sendiri", async () => {
    const assets = await dbA.asset.findMany();
    assert.deepEqual(assets.map((a) => a.id), [A.asset]);
    assert.equal(await dbA.asset.count(), 1);
    assert.equal(await dbA.asset.findUnique({ where: { id: B.asset } }), null);
    assert.equal(await dbA.asset.findFirst({ where: { id: B.asset } }), null);
    // organizationId dari pemanggil ditimpa — tetap menghitung milik A.
    assert.equal(await dbA.branch.count({ where: { organizationId: B.org } }), 2);
  });

  test("agregasi dan groupBy terbatas pada organisasi sendiri", async () => {
    const sum = await dbA.asset.aggregate({ _sum: { quantity: true } });
    assert.equal(sum._sum.quantity, 1);
    const groups = await dbA.asset.groupBy({ by: ["branchId"], _count: { id: true } });
    assert.deepEqual(groups.map((g) => g.branchId), [A.branch1]);
  });

  test("ubah/hapus baris organisasi lain tidak berpengaruh", async () => {
    await assert.rejects(dbA.asset.update({ where: { id: B.asset }, data: { name: "Dibajak" } }), isRecordNotFound);
    await assert.rejects(dbA.asset.delete({ where: { id: B.asset } }), isRecordNotFound);
    assert.equal((await dbA.asset.updateMany({ where: { id: B.asset }, data: { name: "Dibajak" } })).count, 0);
    assert.equal((await dbA.asset.deleteMany({ where: { id: B.asset } })).count, 0);
    const assetB = await prisma.asset.findUniqueOrThrow({ where: { id: B.asset } });
    assert.equal(assetB.name, "Laptop Uji");
  });

  test("create memakai organisasi sendiri walau pemanggil mengirim organisasi lain", async () => {
    const created = await dbA.division.create({ data: { organizationId: B.org, name: `Divisi ${RUN}` } });
    assert.equal(created.organizationId, A.org);
    await prisma.division.delete({ where: { id: created.id } });
  });

  test("update tidak boleh memindahkan baris ke organisasi lain", async () => {
    await assert.rejects(
      dbA.division.update({ where: { id: A.division }, data: { organizationId: B.org } }),
      /tidak boleh diubah/
    );
  });

  test("berlaku di dalam transaksi interaktif", async () => {
    await dbA.$transaction(async (tx) => {
      assert.equal(await tx.asset.findUnique({ where: { id: B.asset } }), null);
      assert.equal((await tx.asset.updateMany({ where: { id: B.asset }, data: { name: "Dibajak" } })).count, 0);
      assert.equal(await tx.asset.count(), 1);
    });
  });

  test("berlaku di dalam transaksi array", async () => {
    const [count, found] = await dbA.$transaction([
      dbA.asset.count(),
      dbA.asset.findUnique({ where: { id: B.asset } }),
    ]);
    assert.equal(count, 1);
    assert.equal(found, null);
  });

  test("nested create mewarisi organizationId dari induk", async () => {
    const link = await prisma.userBranch.findFirstOrThrow({ where: { userId: A.user } });
    assert.equal(link.organizationId, A.org);
  });

  test("FK komposit menolak referensi lintas organisasi", async () => {
    await assert.rejects(
      prisma.transfer.create({
        data: {
          organizationId: A.org,
          assetId: A.asset,
          fromBranchId: A.branch1,
          toBranchId: B.branch1,
          reason: "uji",
          requestedById: A.user,
        },
      }),
      isForeignKeyViolation
    );
    await assert.rejects(
      prisma.asset.create({
        data: {
          organizationId: A.org,
          divisionId: A.division,
          categoryId: B.category,
          branchId: A.branch1,
          name: "Kategori salah",
          status: "ACTIVE",
        },
      }),
      isForeignKeyViolation
    );
  });

  test("pelanggaran unique memakai kode P2002", async () => {
    await assert.rejects(dbA.division.create({ data: { organizationId: A.org, name: "IT" } }), isUniqueViolation);
  });

  test("Organization: hanya organisasi sendiri yang terbaca, tulis ditolak", async () => {
    assert.equal(await dbA.organization.findUnique({ where: { id: B.org } }), null);
    assert.equal((await dbA.organization.findUnique({ where: { id: A.org } }))?.id, A.org);
    await assert.rejects(dbA.organization.update({ where: { id: A.org }, data: { name: "x" } }), /tidak diizinkan/);
  });
});
```

- [x] **3.4 Jalankan dan pastikan gagal:**
  ```bash
  npm run test:integration
  ```
  Harapan: gagal impor `../../src/lib/tenant-db`.

- [x] **3.5 Tulis `src/lib/tenant-db.ts`:**

```ts
import { prisma } from "./prisma";

/**
 * Client database yang terikat ke SATU organisasi (tenant).
 *
 * Sumbu isolasi organisasi ditegakkan di sini — bukan di setiap route — agar
 * route baru tidak mungkin lupa memasangnya. Setiap operasi pada model tenant
 * (semua model kecuali Organization) mendapat `organizationId` di `where` atau
 * `data`; operasi yang tidak dikenali dilempar error (fail closed).
 *
 * Route TIDAK memanggil fungsi ini langsung: `db` diperoleh dari
 * `requireUserScope()` / `getPageContext()` (src/lib/auth.ts) yang lebih dulu
 * memastikan pengguna sah dan sudah ditugaskan. ESLint melarang impor modul ini
 * di luar daftar pengecualian (eslint.config.mjs).
 *
 * Catatan tipe: extension tidak mengubah tipe input Prisma, sehingga `create`
 * tetap mewajibkan `organizationId`. Tulis `organizationId: user.organizationId`
 * secara eksplisit — nilainya tetap ditimpa di sini.
 */

type QueryArgs = {
  where?: Record<string, unknown>;
  data?: unknown;
  create?: Record<string, unknown>;
  update?: unknown;
  [key: string]: unknown;
};

/** Operasi yang cukup dibatasi lewat `where`. */
const WHERE_SCOPED = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "delete",
  "deleteMany",
]);

/** Operasi ubah — dibatasi `where`, dan `data` tidak boleh memindahkan organisasi. */
const UPDATE_SCOPED = new Set(["update", "updateMany", "updateManyAndReturn"]);

const ORGANIZATION_READS = new Set(["findUnique", "findUniqueOrThrow", "findFirst", "findFirstOrThrow"]);

function assertNoOrganizationChange(model: string, data: unknown): void {
  if (data !== null && typeof data === "object" && "organizationId" in data) {
    throw new Error(`tenantDb: ${model}.organizationId tidak boleh diubah`);
  }
}

/** Tambahkan syarat ke `AND` tanpa membuang `AND` milik pemanggil. */
function withAnd(where: Record<string, unknown> | undefined, condition: Record<string, unknown>) {
  const existing = where?.AND;
  const and = Array.isArray(existing) ? existing : existing ? [existing] : [];
  return { ...where, AND: [...and, condition] };
}

export function tenantDb(organizationId: string) {
  if (!organizationId) {
    throw new Error("tenantDb: organizationId wajib diisi");
  }

  return prisma.$extends({
    name: "tenant-isolation",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const a = (args ?? {}) as QueryArgs;
          const run = (next: QueryArgs) => query(next as unknown as typeof args);

          if (model === "Organization") {
            if (!ORGANIZATION_READS.has(operation)) {
              throw new Error(`tenantDb: operasi ${operation} pada Organization tidak diizinkan`);
            }
            // AND — bukan menimpa `id` — agar ID organisasi lain menghasilkan null.
            return run({ ...a, where: withAnd(a.where, { id: organizationId }) });
          }

          if (WHERE_SCOPED.has(operation)) {
            return run({ ...a, where: { ...a.where, organizationId } });
          }
          if (UPDATE_SCOPED.has(operation)) {
            assertNoOrganizationChange(model, a.data);
            return run({ ...a, where: { ...a.where, organizationId } });
          }
          if (operation === "create") {
            return run({ ...a, data: { ...(a.data as object), organizationId } });
          }
          if (operation === "createMany" || operation === "createManyAndReturn") {
            const rows = Array.isArray(a.data) ? a.data : [a.data];
            return run({ ...a, data: rows.map((row) => ({ ...(row as object), organizationId })) });
          }
          if (operation === "upsert") {
            assertNoOrganizationChange(model, a.update);
            return run({
              ...a,
              where: { ...a.where, organizationId },
              create: { ...a.create, organizationId },
            });
          }

          throw new Error(`tenantDb: operasi ${operation} pada ${model} belum ditangani`);
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof tenantDb>;
```

- [x] **3.6 Jalankan integration test sampai hijau:**
  ```bash
  npm run test:integration
  ```
  Harapan: semua test `✔`, `ℹ fail 0`.

  **Bila test "transaksi interaktif" gagal** (extension tidak berlaku pada `tx`): tambahkan komponen `client` pada `$extends` yang menimpa `$transaction` untuk callback — bungkus `tx` dengan `Proxy` yang meneruskan setiap panggilan `tx.<model>.<operasi>(args)` lewat logika yang sama (ekstrak logika `$allOperations` ke fungsi `scopeArgs(model, operation, args)` lalu panggil `tx[model][operation](scopeArgs(...))`). Jalankan ulang sampai hijau, lalu catat perubahan ini di §14.1 spec.

- [x] **3.7 Cek tipe:**
  ```bash
  npx tsc --noEmit 2>&1 | grep -E "src/lib/(tenant-db|db-errors)\.ts|tests/integration"
  ```
  Harapan: kosong.

- [x] **3.8 Commit:**
  ```bash
  git add package.json src/lib/tenant-db.ts src/lib/db-errors.ts tests/integration
  git commit -m "feat(db): client Prisma terikat organisasi + integration test isolasi" -m "Extension menyuntikkan organizationId ke setiap operasi, menolak perpindahan organisasi dan operasi tak dikenal. Test membuktikan isolasi di dalam transaksi, nested create, dan FK komposit." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

---

## Task 4: Seed Baru

**Berkas:** `prisma/seed.ts` (tulis ulang), `.env` (lokal, tidak di-commit).

- [x] **4.1 Tambahkan ke `.env` (pengembangan & QA):**
  ```env
  # self-hosted (default) | saas — lihat src/lib/app-mode.ts
  APP_MODE="saas"
  ```

- [x] **4.2 Tulis ulang `prisma/seed.ts` seluruhnya:**

```ts
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import "dotenv/config";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

type Condition = "ACTIVE" | "BROKEN" | "REPAIR" | "RETIRED";

// Stok awal: seluruh kuantitas masuk ke satu bucket sesuai kondisi, menjaga
// invariant quantity = active + broken + repair + retired + reserved. Logika
// yang sama dipakai runtime di `initialStock()` (src/lib/stock.ts) — disalin
// agar seed tidak bergantung pada alias path "@/" saat dijalankan ts-node.
function stockFor(status: Condition, quantity = 1) {
  return {
    status,
    quantity,
    activeQty: status === "ACTIVE" ? quantity : 0,
    brokenQty: status === "BROKEN" ? quantity : 0,
    repairQty: status === "REPAIR" ? quantity : 0,
    retiredQty: status === "RETIRED" ? quantity : 0,
    reservedQty: 0,
  };
}

const DAY = 24 * 60 * 60 * 1000;
const fromNow = (days: number) => new Date(Date.now() + days * DAY);

// Urutan hapus mengikuti ketergantungan FK (anak lebih dulu).
async function wipe() {
  await prisma.activityLog.deleteMany();
  await prisma.bap.deleteMany();
  await prisma.mdmCommand.deleteMany();
  await prisma.mdmDevice.deleteMany();
  await prisma.transfer.deleteMany();
  await prisma.incident.deleteMany();
  await prisma.asset.deleteMany();
  await prisma.userBranch.deleteMany();
  await prisma.user.deleteMany();
  await prisma.category.deleteMany();
  await prisma.division.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.organization.deleteMany();
}

interface SeedUser {
  id: string;
  username: string;
  name: string;
  role: Role;
  divisionId: string | null;
  branchIds: string[];
  email?: string;
  staff?: boolean; // password staff123, selain itu admin123
}

interface SeedAsset {
  id: string;
  divisionId: string;
  categoryId: string;
  branchId: string;
  name: string;
  serialNumber: string | null;
  brand: string;
  model: string;
  specs: string;
  purchaseDate: Date;
  warrantyDate: Date | null;
  stock: ReturnType<typeof stockFor>;
}

// ── Organisasi demo ────────────────────────────────────────────────────────
const DEMO = "org-demo";

const DEMO_DIVISIONS = [
  { id: "div-it", name: "IT", description: "Perangkat IT, jaringan, dan POS" },
  { id: "div-kitchen", name: "Kitchen", description: "Peralatan dapur" },
  { id: "div-engineering", name: "Engineering", description: "Fasilitas gedung, listrik, dan mesin" },
];

// [id, divisionId, name]
const DEMO_CATEGORIES: [string, string, string][] = [
  ["cat-it-laptop", "div-it", "Laptop"],
  ["cat-it-pc", "div-it", "PC"],
  ["cat-it-printer", "div-it", "Printer"],
  ["cat-it-cctv", "div-it", "CCTV"],
  ["cat-it-router", "div-it", "Router"],
  ["cat-it-switch", "div-it", "Switch"],
  ["cat-it-ups", "div-it", "UPS"],
  ["cat-it-tablet-pos", "div-it", "Tablet POS"],
  ["cat-it-lainnya", "div-it", "Lain-lain"],
  ["cat-kitchen-chiller", "div-kitchen", "Chiller"],
  ["cat-kitchen-freezer", "div-kitchen", "Freezer"],
  ["cat-kitchen-kompor", "div-kitchen", "Kompor"],
  ["cat-kitchen-oven", "div-kitchen", "Oven"],
  ["cat-kitchen-deep-fryer", "div-kitchen", "Deep Fryer"],
  ["cat-kitchen-blender", "div-kitchen", "Blender"],
  ["cat-kitchen-rice-cooker", "div-kitchen", "Rice Cooker"],
  ["cat-kitchen-lainnya", "div-kitchen", "Lain-lain"],
  ["cat-eng-genset", "div-engineering", "Genset"],
  ["cat-eng-ac", "div-engineering", "AC"],
  ["cat-eng-pompa-air", "div-engineering", "Pompa Air"],
  ["cat-eng-panel-listrik", "div-engineering", "Panel Listrik"],
  ["cat-eng-lainnya", "div-engineering", "Lain-lain"],
];

const DEMO_USERS: SeedUser[] = [
  { id: "user-superadmin", username: "superadmin", name: "Super Administrator", role: "SUPER_ADMIN", divisionId: null, branchIds: [], email: "superadmin@demo.local" },
  { id: "user-admin-it", username: "admin_it", name: "Admin IT Bogor", role: "DIVISION_ADMIN", divisionId: "div-it", branchIds: ["branch-bogor"] },
  { id: "user-staff-it", username: "staff_it", name: "Staf IT Bogor", role: "DIVISION_STAFF", divisionId: "div-it", branchIds: ["branch-bogor"], staff: true },
  { id: "user-admin-it-jakarta", username: "admin_it_jakarta", name: "Admin IT Jakarta Selatan", role: "DIVISION_ADMIN", divisionId: "div-it", branchIds: ["branch-jakarta"] },
  { id: "user-admin-kitchen", username: "admin_kitchen", name: "Admin Kitchen Bogor", role: "DIVISION_ADMIN", divisionId: "div-kitchen", branchIds: ["branch-bogor"] },
  { id: "user-staff-kitchen", username: "staff_kitchen", name: "Staf Kitchen Bogor", role: "DIVISION_STAFF", divisionId: "div-kitchen", branchIds: ["branch-bogor"], staff: true },
  { id: "user-admin-engineering", username: "admin_engineering", name: "Admin Engineering", role: "DIVISION_ADMIN", divisionId: "div-engineering", branchIds: ["branch-bogor", "branch-jakarta"] },
  { id: "user-teknisi-engineering", username: "teknisi_engineering", name: "Teknisi Engineering", role: "DIVISION_STAFF", divisionId: "div-engineering", branchIds: ["branch-bogor", "branch-jakarta"], staff: true },
];

const DEMO_ASSETS: SeedAsset[] = [
  // IT
  { id: "asset-laptop-dell-bogor", divisionId: "div-it", categoryId: "cat-it-laptop", branchId: "branch-bogor", name: "Laptop Dell Latitude 3420", serialNumber: "DL-LAT-3420-001", brand: "Dell", model: "Latitude 3420", specs: "Intel Core i5-1135G7, 8GB RAM, 256GB SSD", purchaseDate: new Date("2024-01-15"), warrantyDate: fromNow(365), stock: stockFor("ACTIVE") },
  { id: "asset-printer-hp-bogor", divisionId: "div-it", categoryId: "cat-it-printer", branchId: "branch-bogor", name: "Printer HP LaserJet Pro M404dn", serialNumber: "HP-LJP-M404-001", brand: "HP", model: "LaserJet Pro M404dn", specs: "Monochrome, Duplex, Network", purchaseDate: new Date("2023-06-20"), warrantyDate: fromNow(30), stock: stockFor("ACTIVE") },
  { id: "asset-cctv-bogor", divisionId: "div-it", categoryId: "cat-it-cctv", branchId: "branch-bogor", name: "CCTV Hikvision DS-2CD2143G2-I", serialNumber: "HK-CCTV-2143-001", brand: "Hikvision", model: "DS-2CD2143G2-I", specs: "4MP, WDR, IR 30m, PoE", purchaseDate: new Date("2023-03-10"), warrantyDate: fromNow(-30), stock: stockFor("ACTIVE") },
  { id: "asset-pc-lenovo-bogor", divisionId: "div-it", categoryId: "cat-it-pc", branchId: "branch-bogor", name: "PC Lenovo ThinkCentre M70s", serialNumber: "LN-TC-M70S-001", brand: "Lenovo", model: "ThinkCentre M70s", specs: "Intel Core i3-10100, 4GB RAM, 1TB HDD", purchaseDate: new Date("2022-11-01"), warrantyDate: fromNow(-30), stock: stockFor("BROKEN") },
  { id: "asset-router-mikrotik-jkt", divisionId: "div-it", categoryId: "cat-it-router", branchId: "branch-jakarta", name: "Router MikroTik RB750Gr3", serialNumber: "MK-RB750-001", brand: "MikroTik", model: "RB750Gr3", specs: "5x Gigabit Ethernet, RouterOS L4", purchaseDate: new Date("2024-02-01"), warrantyDate: fromNow(365), stock: stockFor("ACTIVE") },
  { id: "asset-laptop-asus-jkt", divisionId: "div-it", categoryId: "cat-it-laptop", branchId: "branch-jakarta", name: "Laptop ASUS VivoBook 14", serialNumber: "AS-VB14-001", brand: "ASUS", model: "VivoBook 14 X1404VA", specs: "Intel Core i5-1335U, 16GB RAM, 512GB SSD", purchaseDate: new Date("2024-03-20"), warrantyDate: fromNow(365), stock: stockFor("REPAIR") },
  { id: "asset-ups-bandung", divisionId: "div-it", categoryId: "cat-it-ups", branchId: "branch-bandung", name: "UPS APC Back-UPS 1100VA", serialNumber: "APC-BUP-1100-001", brand: "APC", model: "Back-UPS BX1100LI-MS", specs: "1100VA/550W, 4 outlet", purchaseDate: new Date("2024-01-10"), warrantyDate: fromNow(365), stock: stockFor("ACTIVE") },
  { id: "asset-kabel-lan-bogor", divisionId: "div-it", categoryId: "cat-it-lainnya", branchId: "branch-bogor", name: "Kabel LAN Cat6 3m", serialNumber: null, brand: "Belden", model: "Cat6 UTP 3m", specs: "UTP Cat6, panjang 3 meter, konektor RJ45", purchaseDate: new Date("2026-01-05"), warrantyDate: null, stock: stockFor("ACTIVE", 50) },
  { id: "asset-tablet-pos-bogor", divisionId: "div-it", categoryId: "cat-it-tablet-pos", branchId: "branch-bogor", name: "Tablet POS Samsung Galaxy Tab A9", serialNumber: "SM-TAB-A9-001", brand: "Samsung", model: "Galaxy Tab A9+", specs: "11 inci, 4GB RAM, dipakai kasir & dapur", purchaseDate: new Date("2025-09-01"), warrantyDate: fromNow(200), stock: stockFor("ACTIVE", 2) },
  // Kitchen
  { id: "asset-chiller-bogor", divisionId: "div-kitchen", categoryId: "cat-kitchen-chiller", branchId: "branch-bogor", name: "Chiller GEA 1200L", serialNumber: "GEA-CH-1200-001", brand: "GEA", model: "Chiller 1200L", specs: "Kapasitas 1200 liter, suhu -2°C s/d 8°C", purchaseDate: new Date("2023-05-10"), warrantyDate: fromNow(365), stock: stockFor("ACTIVE", 2) },
  { id: "asset-freezer-jkt", divisionId: "div-kitchen", categoryId: "cat-kitchen-freezer", branchId: "branch-jakarta", name: "Freezer Panasonic SCR-T49", serialNumber: "PAN-FRZ-T49-001", brand: "Panasonic", model: "SCR-T49", specs: "Kapasitas 490 liter, Deep Freezer", purchaseDate: new Date("2024-01-01"), warrantyDate: fromNow(60), stock: stockFor("ACTIVE") },
  { id: "asset-ricecooker-bandung", divisionId: "div-kitchen", categoryId: "cat-kitchen-rice-cooker", branchId: "branch-bandung", name: "Rice Cooker Miyako 10L", serialNumber: null, brand: "Miyako", model: "MRC-10L", specs: "Kapasitas 10 liter, stainless steel", purchaseDate: new Date("2023-08-01"), warrantyDate: fromNow(-30), stock: stockFor("ACTIVE", 5) },
  // Barang habis pakai ber-stok besar: 100 pcs sumpit, 8 di antaranya patah.
  { id: "asset-sumpit-jkt", divisionId: "div-kitchen", categoryId: "cat-kitchen-lainnya", branchId: "branch-jakarta", name: "Sumpit Kayu Reusable", serialNumber: null, brand: "Generic", model: "Sumpit Kayu 23cm", specs: "Kayu birch, panjang 23cm, reusable", purchaseDate: new Date("2026-02-01"), warrantyDate: null, stock: { ...stockFor("ACTIVE", 100), activeQty: 92, brokenQty: 8 } },
  // Engineering — tersebar di ketiga outlet (TC-USR-03, TC-TRF-05)
  { id: "asset-genset-bogor", divisionId: "div-engineering", categoryId: "cat-eng-genset", branchId: "branch-bogor", name: "Genset Perkins 20 kVA", serialNumber: "PK-GEN-20-001", brand: "Perkins", model: "404D-22G", specs: "20 kVA, silent type", purchaseDate: new Date("2022-07-01"), warrantyDate: fromNow(-120), stock: stockFor("ACTIVE") },
  { id: "asset-ac-bogor", divisionId: "div-engineering", categoryId: "cat-eng-ac", branchId: "branch-bogor", name: "AC Daikin 2 PK", serialNumber: "DK-AC-2PK-BGR", brand: "Daikin", model: "FTKC50", specs: "2 PK, inverter", purchaseDate: new Date("2024-05-01"), warrantyDate: fromNow(300), stock: stockFor("ACTIVE", 2) },
  { id: "asset-ac-jkt", divisionId: "div-engineering", categoryId: "cat-eng-ac", branchId: "branch-jakarta", name: "AC Daikin 2 PK", serialNumber: "DK-AC-2PK-JKT", brand: "Daikin", model: "FTKC50", specs: "2 PK, inverter", purchaseDate: new Date("2024-05-01"), warrantyDate: fromNow(300), stock: stockFor("ACTIVE", 3) },
  { id: "asset-pompa-bandung", divisionId: "div-engineering", categoryId: "cat-eng-pompa-air", branchId: "branch-bandung", name: "Pompa Air Grundfos", serialNumber: "GF-PMP-001", brand: "Grundfos", model: "CM5-4", specs: "Pompa booster 0,75 kW", purchaseDate: new Date("2023-02-01"), warrantyDate: fromNow(-60), stock: stockFor("ACTIVE") },
];

async function createUsers(organizationId: string, users: SeedUser[], adminHash: string, staffHash: string) {
  for (const u of users) {
    await prisma.user.create({
      data: {
        id: u.id,
        organizationId,
        username: u.username,
        name: u.name,
        role: u.role,
        email: u.email ?? null,
        password: u.staff ? staffHash : adminHash,
        divisionId: u.divisionId,
        // Nested create: organizationId UserBranch diwarisi dari User.
        branches: { create: u.branchIds.map((branchId) => ({ branchId })) },
      },
    });
  }
}

async function seedDemo(adminHash: string, staffHash: string) {
  await prisma.organization.create({ data: { id: DEMO, name: "Demo Resto", slug: "demo" } });

  await prisma.branch.createMany({
    data: [
      { id: "branch-bogor", organizationId: DEMO, name: "Bogor (Pusat)", location: "Jl. Pajajaran No. 123, Bogor, Jawa Barat 16143" },
      { id: "branch-jakarta", organizationId: DEMO, name: "Jakarta Selatan", location: "Jl. Sudirman Kav. 52-53, Jakarta Selatan, DKI Jakarta 12190" },
      { id: "branch-bandung", organizationId: DEMO, name: "Bandung", location: "Jl. Braga No. 45, Bandung, Jawa Barat 40111" },
    ],
  });

  await prisma.division.createMany({ data: DEMO_DIVISIONS.map((d) => ({ ...d, organizationId: DEMO })) });
  await prisma.category.createMany({
    data: DEMO_CATEGORIES.map(([id, divisionId, name]) => ({ id, divisionId, name, organizationId: DEMO })),
  });

  await createUsers(DEMO, DEMO_USERS, adminHash, staffHash);

  for (const { stock, ...asset } of DEMO_ASSETS) {
    await prisma.asset.create({ data: { ...asset, ...stock, organizationId: DEMO } });
  }

  await prisma.incident.createMany({
    data: [
      { id: "incident-pc-bogor", organizationId: DEMO, assetId: "asset-pc-lenovo-bogor", quantity: 1, description: "PC tidak bisa menyala. Indikator power mati total, sudah dicoba ganti kabel power.", reportedAt: new Date("2025-06-10"), handledBy: "Teknisi IT" },
      { id: "incident-laptop-jkt", organizationId: DEMO, assetId: "asset-laptop-asus-jkt", quantity: 1, description: "Layar laptop berkedip-kedip dan kadang mati. Kemungkinan masalah pada kabel flex display.", reportedAt: new Date("2025-06-15"), handledBy: "Teknisi IT" },
      { id: "incident-sumpit-jkt", organizationId: DEMO, assetId: "asset-sumpit-jkt", quantity: 8, description: "8 pcs sumpit patah setelah dipakai pada jam sibuk akhir pekan.", reportedAt: new Date("2026-08-01"), handledBy: "Staf Kitchen" },
    ],
  });

  await prisma.transfer.create({
    data: {
      id: "transfer-sample-001",
      organizationId: DEMO,
      assetId: "asset-router-mikrotik-jkt",
      fromBranchId: "branch-jakarta",
      toBranchId: "branch-bandung",
      reason: "Permintaan mutasi operasional — jaringan Bandung perlu upgrade",
      status: "PENDING",
      requestedById: "user-admin-it-jakarta",
      transferredAt: new Date("2026-06-20"),
    },
  });
}

// ── Organisasi uji kedua (hanya mode saas) — membuktikan isolasi tenant ────
const UJI_B = "org-uji-b";

async function seedOrgB(adminHash: string) {
  await prisma.organization.create({ data: { id: UJI_B, name: "Org Uji B", slug: "uji-b" } });
  await prisma.branch.createMany({
    data: [
      { id: "branch-b1", organizationId: UJI_B, name: "Outlet B1", location: "Alamat uji B1" },
      { id: "branch-b2", organizationId: UJI_B, name: "Outlet B2", location: "Alamat uji B2" },
    ],
  });
  await prisma.division.create({ data: { id: "div-b-it", organizationId: UJI_B, name: "IT" } });
  await prisma.category.create({ data: { id: "cat-b-laptop", organizationId: UJI_B, divisionId: "div-b-it", name: "Laptop" } });

  // Username SAMA dengan organisasi demo — login wajib memilih akun lewat kode organisasi.
  await createUsers(
    UJI_B,
    [
      { id: "user-b-superadmin", username: "superadmin", name: "Super Admin Org B", role: "SUPER_ADMIN", divisionId: null, branchIds: [], email: "superadmin@uji-b.local" },
      { id: "user-b-admin-it", username: "admin_it", name: "Admin IT Org B", role: "DIVISION_ADMIN", divisionId: "div-b-it", branchIds: ["branch-b1"] },
    ],
    adminHash,
    adminHash
  );

  // 5 pcs: 4 aktif + 1 dipesan BAP PENDING (invariant tetap terjaga).
  await prisma.asset.create({
    data: {
      id: "asset-b-laptop",
      organizationId: UJI_B,
      divisionId: "div-b-it",
      categoryId: "cat-b-laptop",
      branchId: "branch-b1",
      name: "Laptop Org B",
      serialNumber: "B-LAPTOP-001",
      ...stockFor("ACTIVE", 5),
      activeQty: 4,
      reservedQty: 1,
    },
  });
  await prisma.transfer.create({
    data: {
      id: "transfer-b-001",
      organizationId: UJI_B,
      assetId: "asset-b-laptop",
      fromBranchId: "branch-b1",
      toBranchId: "branch-b2",
      reason: "Uji isolasi organisasi",
      status: "PENDING",
      requestedById: "user-b-admin-it",
    },
  });
  await prisma.bap.create({
    data: {
      id: "bap-b-001",
      organizationId: UJI_B,
      assetId: "asset-b-laptop",
      quantity: 1,
      sourceCondition: "ACTIVE",
      fileUrl: "/uploads/bap/seed/uji-b.pdf",
      status: "PENDING",
      previousStatus: "ACTIVE",
      requestedById: "user-b-admin-it",
    },
  });
}

async function main() {
  // PENGAMAN: seed ini menghapus SELURUH data termasuk organisasi, pengguna,
  // dan audit log. Jalankan hanya di development/QA. Untuk menimpa pengaman
  // ini secara sadar, set ALLOW_DESTRUCTIVE_SEED=true.
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DESTRUCTIVE_SEED !== "true") {
    throw new Error(
      "Seed dibatalkan: NODE_ENV=production. Seed ini menghapus seluruh data. " +
        "Set ALLOW_DESTRUCTIVE_SEED=true hanya jika Anda benar-benar bermaksud mengosongkan database ini."
    );
  }

  const saas = process.env.APP_MODE === "saas";
  console.log(`🌱 Seeding database (APP_MODE=${saas ? "saas" : "self-hosted"})...`);
  await wipe();

  const adminHash = await bcrypt.hash("admin123", 12);
  const staffHash = await bcrypt.hash("staff123", 12);

  await seedDemo(adminHash, staffHash);
  console.log(`✅ Organisasi "Demo Resto" (kode: demo): 3 outlet, 3 divisi, ${DEMO_CATEGORIES.length} kategori, ${DEMO_USERS.length} pengguna, ${DEMO_ASSETS.length} aset`);

  if (saas) {
    await seedOrgB(adminHash);
    console.log('✅ Organisasi "Org Uji B" (kode: uji-b) untuk uji isolasi');
  }

  console.log("\nAkun (kode organisasi: demo) — password admin123 / staff123:");
  for (const u of DEMO_USERS) {
    console.log(`  ${u.username.padEnd(20)} ${u.staff ? "staff123" : "admin123"}  ${u.role}`);
  }
  if (saas) console.log("\nAkun (kode organisasi: uji-b): superadmin / admin123, admin_it / admin123");
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
```

- [x] **4.3 Jalankan seed:**
  ```bash
  npx prisma db seed
  ```
  Harapan: baris `✅ Organisasi "Demo Resto" ... 17 aset` dan `✅ Organisasi "Org Uji B"`, lalu daftar akun.

  > **Catatan eksekusi (2026-09-29):** perintah seed lama di `prisma.config.ts` (`node -e "…" && npx ts-node prisma/seed.ts`) ternyata **tidak pernah menjalankan seed** — Prisma 7 mengeksekusinya tanpa shell sehingga hanya `node -e` yang jalan, lalu tetap melapor "executed". Diganti `node --require ts-node/register prisma/seed.ts`; terverifikasi dari `createdAt` organisasi yang diperbarui setelah `npx prisma db seed`.

- [x] **4.4 Integration test tetap hijau di atas data seed:**
  ```bash
  npm run test:integration
  ```

- [x] **4.5 Cek tipe & commit:**
  ```bash
  npx tsc --noEmit 2>&1 | grep -E "prisma/seed\.ts"
  git add prisma/seed.ts
  git commit -m "feat(seed): organisasi demo dengan divisi IT, Kitchen, Engineering" -m "ID deterministik untuk QA, akun multi-outlet, dan organisasi uji kedua (mode saas) dengan transfer & BAP PENDING untuk membuktikan isolasi." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

---

## Task 5: Autentikasi Inti

**Berkas:** `src/lib/app-mode.ts` (baru), `src/lib/jwt.ts`, `src/lib/auth.ts`, `src/lib/logger.ts`, `src/proxy.ts`, `src/app/api/auth/{login,logout,me}/route.ts`, `src/app/login/page.tsx`, `src/app/login/LoginForm.tsx` (baru).

- [x] **5.1 `src/lib/app-mode.ts`:**

```ts
export type AppMode = "self-hosted" | "saas";

/**
 * Mode instalasi (env `APP_MODE`). Nilai selain "saas" diperlakukan
 * self-hosted: satu organisasi, login tanpa kode organisasi.
 */
export function getAppMode(): AppMode {
  return process.env.APP_MODE === "saas" ? "saas" : "self-hosted";
}
```

- [x] **5.2 `src/lib/jwt.ts`** — ganti interface `JwtPayload` (fungsi `signToken`/`verifyToken` tetap):

```ts
export interface JwtPayload {
  userId: string;
  /**
   * Organisasi pemilik akun. Token tanpa field ini (format sebelum
   * multi-tenant) dianggap tidak valid oleh middleware — pengguna login ulang.
   */
  organizationId: string;
  username: string;
  role: string;
  name: string;
}
```

- [x] **5.3 Tulis ulang `src/lib/auth.ts` seluruhnya:**

```ts
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { tenantDb, type TenantDb } from "./tenant-db";
import { signToken, verifyToken } from "./jwt";
import type { JwtPayload } from "./jwt";
import { UNASSIGNED_MESSAGE, resolveScope, type UserScope } from "./scope";
import { errorResponse } from "./utils";

// Sengaja TIDAK me-reexport `prisma` maupun `tenantDb`: keduanya hanya boleh
// dipakai di balik pengecekan akses di bawah (lihat eslint.config.mjs).
export { signToken, verifyToken };
export type { JwtPayload, TenantDb };

/** Kolom pengguna yang dibaca SETIAP request — sumber cakupan divisi & outlet. */
const SESSION_USER_SELECT = {
  id: true,
  organizationId: true,
  username: true,
  name: true,
  email: true,
  role: true,
  divisionId: true,
  division: { select: { id: true, name: true } },
  branches: {
    select: { branch: { select: { id: true, name: true } } },
    orderBy: { branch: { name: "asc" } },
  },
  organization: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.UserSelect;

export interface SessionUser {
  id: string;
  organizationId: string;
  username: string;
  name: string;
  email: string | null;
  role: string;
  divisionId: string | null;
  division: { id: string; name: string } | null;
  branches: { id: string; name: string }[];
  organization: { id: string; name: string; slug: string };
}

/** Konteks request terautentikasi: satu-satunya jalan memperoleh `db`. */
export interface RequestContext {
  db: TenantDb;
  scope: UserScope;
  user: SessionUser;
}

/**
 * Muat pengguna dari DATABASE. `organizationId` ikut disaring: token yang
 * membawa organisasi berbeda dari baris pengguna diperlakukan tidak valid.
 */
async function loadSessionUser(userId: string, organizationId: string): Promise<SessionUser | null> {
  const row = await prisma.user.findFirst({
    where: { id: userId, organizationId },
    select: SESSION_USER_SELECT,
  });
  if (!row) return null;
  return { ...row, branches: row.branches.map((link) => link.branch) };
}

/** Ambil token JWT dari cookie HttpOnly (async di Next.js 16). */
export async function getTokenFromCookies(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    return cookieStore.get("token")?.value ?? null;
  } catch {
    // cookies() melempar saat build/prerender statis
    return null;
  }
}

/**
 * Pengguna sesi dari cookie — dipakai `/api/auth/me` dan halaman. TIDAK
 * memeriksa penugasan; gunakan `getPageContext()` untuk membaca data.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = await getTokenFromCookies();
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload?.organizationId) return null;
  try {
    return await loadSessionUser(payload.userId, payload.organizationId);
  } catch {
    return null;
  }
}

/**
 * Konteks untuk halaman server. `null` = tidak terautentikasi ATAU belum
 * ditugaskan — halaman merender `<AccessDenied />` (middleware sudah
 * mengalihkan pengguna tanpa cookie ke /login).
 */
export async function getPageContext(): Promise<RequestContext | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const scope = resolveScope(user);
  if (!scope) return null;
  return { db: tenantDb(user.organizationId), scope, user };
}

/**
 * Identitas dari header yang diisi middleware (src/proxy.ts). Header ini
 * dibuang dari setiap request masuk sebelum diisi, sehingga tidak dapat
 * dipalsukan klien.
 */
export function getAuthUser(request: NextRequest): {
  userId: string;
  organizationId: string;
  role: string;
  name: string;
  username: string;
} | null {
  const userId = request.headers.get("x-user-id");
  const organizationId = request.headers.get("x-user-org");
  const role = request.headers.get("x-user-role");
  const name = request.headers.get("x-user-name");
  const username = request.headers.get("x-user-username");
  if (!userId || !organizationId || !role || !name) return null;
  return { userId, organizationId, role, name, username: username || "" };
}

/**
 * Konteks untuk route handler, dibaca dari DATABASE setiap request sehingga
 * perubahan peran/penugasan langsung berlaku tanpa menunggu token kedaluwarsa.
 *
 * ```ts
 * const ctx = await requireUserScope(request);
 * if (!ctx.ok) return ctx.response;
 * const { db, scope, user } = ctx;
 * ```
 */
export async function requireUserScope(
  request: NextRequest
): Promise<({ ok: true } & RequestContext) | { ok: false; response: Response }> {
  const authUser = getAuthUser(request);
  if (!authUser) {
    return { ok: false, response: errorResponse("Unauthorized", "Token tidak valid", 401) };
  }

  const user = await loadSessionUser(authUser.userId, authUser.organizationId);
  if (!user) {
    return { ok: false, response: errorResponse("Unauthorized", "User tidak ditemukan di database", 401) };
  }

  const scope = resolveScope(user);
  if (!scope) {
    return { ok: false, response: errorResponse("Akses ditolak", UNASSIGNED_MESSAGE, 403) };
  }

  return { ok: true, db: tenantDb(user.organizationId), scope, user };
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
```

- [x] **5.4 Tulis ulang `src/lib/logger.ts`:**

```ts
import type { NextRequest } from "next/server";
import type { TenantDb } from "./tenant-db";

/**
 * Pelaku aktivitas. `RequestContext` dari requireUserScope() sudah memenuhi
 * bentuk ini, sehingga route cukup memanggil `writeActivityLog(ctx, …)`.
 */
export interface ActivityActor {
  db: TenantDb;
  user: { id: string | null; username: string; organizationId: string };
}

/**
 * Catat log aktivitas ke organisasi pelaku. IP diturunkan dari header
 * `x-forwarded-for` / `x-real-ip` bila `request` diberikan.
 */
export async function writeActivityLog(
  actor: ActivityActor,
  action: string,
  details: string,
  request?: NextRequest
) {
  try {
    let ipAddress: string | null = null;
    if (request) {
      ipAddress = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null;
      if (ipAddress && ipAddress.includes(",")) {
        ipAddress = ipAddress.split(",")[0].trim();
      }
    }

    await actor.db.activityLog.create({
      data: {
        organizationId: actor.user.organizationId,
        userId: actor.user.id,
        username: actor.user.username,
        action,
        details,
        ipAddress,
      },
    });
  } catch (error) {
    console.error("Gagal mencatat log aktivitas:", error);
  }
}
```

- [x] **5.5 Tulis ulang `src/proxy.ts` seluruhnya:**

```ts
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "./lib/jwt";
import { VALID_ROLES } from "./lib/utils";

// Routes yang tidak memerlukan autentikasi (cookie JWT)
const PUBLIC_PATHS = ["/login", "/api/auth/login"];

// Routes MDM device agent — melewati cookie auth. Selama Fase 1 route ini
// hanya membalas 404 (fitur MDM dinonaktifkan, lihat src/lib/mdm.ts).
const MDM_DEVICE_PATHS = ["/api/mdm/enroll", "/api/mdm/check-in"];

// Static file patterns yang di-skip
const SKIP_PATTERNS = [
  "/_next",
  "/_global-error",
  "/_not-found",
  "/favicon.ico",
  "/icons",
  "/images",
  "/uploads",
];

// Header identitas yang HANYA boleh diisi oleh middleware ini.
// Wajib dibuang dari setiap request masuk agar klien tidak bisa memalsukan sesi.
const IDENTITY_HEADERS = ["x-user-id", "x-user-org", "x-user-role", "x-user-name", "x-user-username"];

function invalidSession(request: NextRequest, pathname: string) {
  const response = pathname.startsWith("/api/")
    ? NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
          message: "Sesi Anda sudah tidak berlaku. Silakan masuk kembali.",
        },
        { status: 401 }
      )
    : NextResponse.redirect(new URL("/login", request.url));
  response.cookies.delete("token");
  return response;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Buang header identitas bawaan klien SEBELUM percabangan apa pun.
  const requestHeaders = new Headers(request.headers);
  for (const header of IDENTITY_HEADERS) {
    requestHeaders.delete(header);
  }
  const sanitized = () => NextResponse.next({ request: { headers: requestHeaders } });

  // Hanya bergantung pada env var server-side — header `x-next-prerender`
  // dapat dikirim siapa pun sehingga tidak dapat dipercaya.
  if (process.env.NEXT_PHASE === "phase-production-build") return sanitized();
  if (SKIP_PATTERNS.some((pattern) => pathname.startsWith(pattern))) return sanitized();
  if (MDM_DEVICE_PATHS.some((path) => pathname.startsWith(path))) return sanitized();
  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) return sanitized();

  const token = request.cookies.get("token")?.value;
  if (!token) {
    if (!pathname.startsWith("/api/")) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return NextResponse.json(
      { success: false, error: "Unauthorized", message: "Token tidak ditemukan" },
      { status: 401 }
    );
  }

  // Token wajib: tanda tangan sah, peran termasuk 3 tingkat yang berlaku, dan
  // memuat organisasi. Token format lama (peran ADMIN_IT/KITCHEN, atau tanpa
  // organizationId) dianggap tidak valid — pengguna login ulang, bukan diteruskan.
  const payload = verifyToken(token);
  if (
    !payload ||
    !(VALID_ROLES as readonly string[]).includes(payload.role) ||
    typeof payload.organizationId !== "string" ||
    payload.organizationId === ""
  ) {
    return invalidSession(request, pathname);
  }

  // Activity log hanya untuk SUPER_ADMIN (pemeriksaan dini; route juga
  // memeriksa peran dari database).
  if (pathname.startsWith("/activity-logs") || pathname.startsWith("/api/activity-logs")) {
    if (payload.role !== "SUPER_ADMIN") {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { success: false, error: "Akses ditolak", message: "Akses ditolak" },
          { status: 403 }
        );
      }
      return new NextResponse("Akses ditolak", { status: 403 });
    }
  }

  // Divisi & outlet TIDAK diperiksa di sini: penugasan bisa berubah setelah
  // login, jadi pengecekannya dibaca dari database oleh requireUserScope() /
  // getPageContext() / /api/auth/me pada setiap request (fail closed).
  requestHeaders.set("x-user-id", payload.userId);
  requestHeaders.set("x-user-org", payload.organizationId);
  requestHeaders.set("x-user-role", payload.role);
  requestHeaders.set("x-user-name", payload.name);
  requestHeaders.set("x-user-username", payload.username);

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [x] **5.6 Tulis ulang `src/app/api/auth/login/route.ts`:**

```ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { tenantDb } from "@/lib/tenant-db";
import { comparePassword, signToken } from "@/lib/auth";
import { errorResponse, successResponse } from "@/lib/utils";
import { UNASSIGNED_MESSAGE, resolveScope } from "@/lib/scope";
import { writeActivityLog } from "@/lib/logger";
import { getAppMode } from "@/lib/app-mode";

export const dynamic = "force-dynamic";

// Hash bcrypt (cost 12) atas string acak yang sudah dibuang — tidak ada password
// yang cocok dengannya. Dibandingkan saat akun tidak ditemukan agar waktu respons
// setara dengan "password salah", sehingga penyerang tidak bisa menebak kode
// organisasi atau username yang valid dari lamanya respons.
const TIMING_EQUALIZER_HASH = "$2b$12$V1H6kwWLrOmHqyNjqOhXbe6lojTVqhyKPLgiu4D2vsClP5t4rtaJ.";

// Satu pesan untuk SEMUA kegagalan kredensial (organisasi, pengguna, password).
const INVALID_CREDENTIALS = "Email/username atau password salah";

const LOGIN_USER_SELECT = {
  id: true,
  organizationId: true,
  username: true,
  name: true,
  role: true,
  password: true,
  divisionId: true,
  branches: { select: { branchId: true } },
} as const;

class SelfHostedOrganizationError extends Error {}

async function findLoginUser(identifier: string, orgCode: string) {
  // Username tidak boleh memuat "@", jadi "@" selalu berarti email (unik global).
  if (identifier.includes("@")) {
    return prisma.user.findUnique({ where: { email: identifier }, select: LOGIN_USER_SELECT });
  }

  let organizationId: string | null;
  if (getAppMode() === "saas") {
    if (!orgCode) return null;
    const org = await prisma.organization.findUnique({ where: { slug: orgCode }, select: { id: true } });
    organizationId = org?.id ?? null;
  } else {
    // Self-hosted = tepat satu organisasi. Selain itu konfigurasinya rusak —
    // tolak (fail closed) daripada menebak organisasi.
    const orgs = await prisma.organization.findMany({ select: { id: true }, take: 2 });
    if (orgs.length !== 1) throw new SelfHostedOrganizationError();
    organizationId = orgs[0].id;
  }
  if (!organizationId) return null;

  return prisma.user.findUnique({
    where: { organizationId_username: { organizationId, username: identifier } },
    select: LOGIN_USER_SELECT,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    // `username` diterima sebagai alias `identifier` untuk klien lama.
    const identifier = String(body.identifier ?? body.username ?? "").trim().toLowerCase();
    const password = typeof body.password === "string" ? body.password : "";
    const orgCode = String(body.orgCode ?? "").trim().toLowerCase();

    if (!identifier || !password) {
      return errorResponse("Email/username dan password wajib diisi", "Validasi gagal", 400);
    }

    let user;
    try {
      user = await findLoginUser(identifier, orgCode);
    } catch (error) {
      if (error instanceof SelfHostedOrganizationError) {
        console.error("APP_MODE=self-hosted namun jumlah organisasi di database bukan satu.");
        return errorResponse(
          "Instalasi self-hosted harus memiliki tepat satu organisasi",
          "Konfigurasi tidak valid",
          503
        );
      }
      throw error;
    }

    const passwordValid = await comparePassword(password, user?.password ?? TIMING_EQUALIZER_HASH);
    if (!user || !passwordValid) {
      return errorResponse(INVALID_CREDENTIALS, "Login gagal", 401);
    }

    const scope = resolveScope({ ...user, branches: user.branches.map((b) => ({ id: b.branchId })) });
    if (!scope) {
      return errorResponse(UNASSIGNED_MESSAGE, "Login gagal", 403);
    }

    const token = signToken({
      userId: user.id,
      organizationId: user.organizationId,
      username: user.username,
      role: user.role,
      name: user.name,
    });

    const response = successResponse(
      { id: user.id, username: user.username, name: user.name, role: user.role },
      "Login berhasil"
    );

    const cookieOptions = [`token=${token}`, "HttpOnly", "Path=/", `Max-Age=${60 * 60 * 8}`, "SameSite=Lax"];
    if (process.env.NODE_ENV === "production") {
      cookieOptions.push("Secure");
    }
    response.headers.set("Set-Cookie", cookieOptions.join("; "));

    await writeActivityLog(
      {
        db: tenantDb(user.organizationId),
        user: { id: user.id, username: user.username, organizationId: user.organizationId },
      },
      "LOGIN",
      `Pengguna ${user.username} (${user.role}) berhasil masuk`,
      request
    );

    return response;
  } catch (error) {
    console.error("Login error:", error);
    return errorResponse("Terjadi kesalahan server", "Login gagal", 500);
  }
}
```

- [x] **5.7 Tulis ulang `src/app/api/auth/me/route.ts`:**

```ts
import { getSessionUser } from "@/lib/auth";
import { resolveScope } from "@/lib/scope";
import { errorResponse, roleLabel, successResponse } from "@/lib/utils";

export const dynamic = "force-dynamic";

// Tetap dapat diakses akun yang BELUM ditugaskan (tidak memakai
// requireUserScope) agar shell aplikasi bisa menampilkan penolakan dan
// tombol keluar, alih-alih pengguna terjebak di sesinya.
export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return errorResponse("Tidak terautentikasi", "Gagal", 401);
    }

    return successResponse(
      {
        ...user,
        roleLabel: roleLabel(user.role, user.division?.name),
        access: resolveScope(user) ? "ok" : "unassigned",
      },
      "Data user berhasil diambil"
    );
  } catch (error) {
    console.error("Get current user error:", error);
    return errorResponse("Terjadi kesalahan server", "Gagal", 500);
  }
}
```

- [x] **5.8 `src/app/api/auth/logout/route.ts`** — ubah hanya blok log (impor `tenantDb` dari `@/lib/tenant-db`):

```ts
    if (authUser) {
      await writeActivityLog(
        {
          db: tenantDb(authUser.organizationId),
          user: { id: authUser.userId, username: authUser.username, organizationId: authUser.organizationId },
        },
        "LOGOUT",
        `Pengguna ${authUser.username} berhasil keluar`,
        request
      );
    }
```

- [x] **5.9 Halaman login.** Pindahkan isi `src/app/login/page.tsx` ke `src/app/login/LoginForm.tsx` (komponen klien) dengan perubahan di bawah, lalu ganti `page.tsx` dengan pembungkus server:

  `src/app/login/page.tsx`:
```tsx
import { getAppMode } from "@/lib/app-mode";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

// Mode dibaca di server agar klien tidak perlu endpoint tambahan: mode SaaS
// menampilkan kolom kode organisasi, self-hosted menyembunyikannya.
export default function LoginPage() {
  return <LoginForm mode={getAppMode()} />;
}
```

  Perubahan di `LoginForm.tsx` (sisanya — markup kartu, logo, gaya — tetap dari halaman lama):
```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { AppMode } from "@/lib/app-mode";

const LAST_ORG_KEY = "lastOrgCode";

export default function LoginForm({ mode }: { mode: AppMode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [orgCode, setOrgCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Kode organisasi: dari tautan `/login?org=demo`, atau yang terakhir dipakai.
  useEffect(() => {
    const fromLink = searchParams.get("org");
    let remembered: string | null = null;
    try {
      remembered = localStorage.getItem(LAST_ORG_KEY);
    } catch {
      // localStorage bisa tidak tersedia (mode privat)
    }
    setOrgCode((fromLink || remembered || "").toLowerCase());
  }, [searchParams]);

  // Login dengan email tidak butuh kode organisasi (email unik global).
  const needsOrgCode = mode === "saas" && !identifier.includes("@");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier || !password || (needsOrgCode && !orgCode)) {
      setError(needsOrgCode ? "Kode organisasi, username, dan password wajib diisi" : "Username/email dan password wajib diisi");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password, orgCode: needsOrgCode ? orgCode : undefined }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        setError(data.error || "Email/username atau password salah");
        setLoading(false);
        return;
      }
      if (needsOrgCode) {
        try {
          localStorage.setItem(LAST_ORG_KEY, orgCode);
        } catch {
          // abaikan
        }
      }
      router.push("/");
      router.refresh();
    } catch (err) {
      console.error("Login request error:", err);
      setError("Terjadi kesalahan koneksi server");
      setLoading(false);
    }
  };

  // …markup lama. Ubah field formulir:
  //  • Bila `needsOrgCode`: tampilkan input "Kode Organisasi" (value=orgCode,
  //    onChange → setOrgCode(value.toLowerCase()), placeholder "mis. demo")
  //    DI ATAS field identitas.
  //  • Field "Username" → label "Username atau Email", value=identifier,
  //    onChange → setIdentifier.
}
```

- [x] **5.10 Cek tipe area auth:**
  ```bash
  npx tsc --noEmit 2>&1 | grep -E "src/lib/(app-mode|jwt|auth|logger)\.ts|src/proxy\.ts|src/app/api/auth|src/app/login"
  ```
  Harapan: kosong.

- [x] **5.11 Uji manual dengan server dev** (jalankan `npm run dev` di latar belakang; `$SCRATCH` = folder scratch sesi):
  ```bash
  curl -s -c "$SCRATCH/demo.txt" -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"identifier":"superadmin","password":"admin123","orgCode":"demo"}'
  curl -s -b "$SCRATCH/demo.txt" http://localhost:3000/api/auth/me
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"identifier":"superadmin","password":"admin123","orgCode":"tidak-ada"}'
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"identifier":"superadmin@uji-b.local","password":"admin123"}'
  ```
  Harapan: login `success: true`; `me` memuat `"organization":{"id":"org-demo",...,"slug":"demo"}` dan `"access":"ok"`; kode organisasi salah → `401`; login email org B → `200`.

- [x] **5.12 Commit:**
  ```bash
  git add src/lib/app-mode.ts src/lib/jwt.ts src/lib/auth.ts src/lib/logger.ts src/proxy.ts src/app/api/auth src/app/login
  git commit -m "feat(auth): login per organisasi, konteks request berbasis database" -m "Login dengan email atau kode organisasi + username, pesan & waktu gagal seragam, JWT membawa organizationId, dan requireUserScope()/getPageContext() sebagai satu-satunya sumber db." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

---

## Task 6: Restrukturisasi QA Runner + Suite `auth`

**Berkas:** `qa-test-runner.ts` (tulis ulang sebagai entry), `qa/context.ts` (baru), `qa/suites/*.ts` (baru).

Runner lama (1.235 baris, satu fungsi) dipecah menjadi konteks bersama + suite per domain agar setiap task berikutnya bisa menjalankan suite-nya sendiri. Kode test lama diambil dari `git show master:qa-test-runner.ts`.

**Pemetaan akun lama → baru** (kunci sesi dipakai `headersFor(...)`):

| Kunci lama | Kunci baru | Akun (kode org / username / password) |
|---|---|---|
| `SUPER_ADMIN` | `SUPER_ADMIN` | demo / superadmin / admin123 |
| `ADMIN_IT` | `ADMIN_IT` | demo / admin_it / admin123 |
| `IT_SUPPORT` | `STAFF_IT` | demo / staff_it / staff123 |
| `ADMIN_KITCHEN` | `ADMIN_KITCHEN` | demo / admin_kitchen / admin123 |
| `KITCHEN` | `STAFF_KITCHEN` | demo / staff_kitchen / staff123 |
| `ADMIN_IT_JAKARTA` | `ADMIN_IT_JAKARTA` | demo / admin_it_jakarta / admin123 |
| — | `ADMIN_ENGINEERING` | demo / admin_engineering / admin123 |
| — | `TEKNISI_ENGINEERING` | demo / teknisi_engineering / staff123 |
| — | `B_SUPER_ADMIN` | uji-b / superadmin / admin123 |
| — | `B_ADMIN_IT` | uji-b / admin_it / admin123 |

**Pemetaan payload lama → baru** (untuk test yang dipindahkan): `type: "LAPTOP"` → `categoryId: "cat-it-laptop"`, `PRINTER` → `cat-it-printer`, `PC` → `cat-it-pc`, `CCTV` → `cat-it-cctv`, `ROUTER` → `cat-it-router`, `UPS` → `cat-it-ups`, `OTHER` (IT) → `cat-it-lainnya`, `CHILLER` → `cat-kitchen-chiller`, `FREEZER` → `cat-kitchen-freezer`, `RICE_COOKER` → `cat-kitchen-rice-cooker`, `OTHER` (Kitchen) → `cat-kitchen-lainnya`; `inventory: "IT"` → `divisionId: "div-it"` (hanya pada request SUPER_ADMIN), `"KITCHEN"` → `"div-kitchen"`. Pemeriksaan respons `asset.type`/`asset.inventory` → `asset.categoryId`/`asset.divisionId`.

- [x] **6.1 Tulis `qa/context.ts`:**

```ts
import "dotenv/config";
import fs from "fs";
import path from "path";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

export const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

export interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  notes: string;
}

export const testResults: TestResult[] = [];

export function recordResult(id: string, name: string, passed: boolean, notes: string) {
  testResults.push({ id, name, passed, notes });
  const status = passed ? "\x1b[32m✔ PASS\x1b[0m" : "\x1b[31m✘ FAIL\x1b[0m";
  console.log(`[${id}] ${name} - ${status} (${notes})`);
}

/** Jalankan satu kasus uji; error tak terduga dicatat sebagai FAIL, bukan crash. */
export async function runTest(
  id: string,
  name: string,
  fn: () => Promise<{ passed: boolean; notes: string }>
) {
  try {
    const { passed, notes } = await fn();
    recordResult(id, name, passed, notes);
  } catch (err) {
    recordResult(id, name, false, err instanceof Error ? err.message : String(err));
  }
}

export async function safeJson(res: Response) {
  try {
    return JSON.parse(await res.text());
  } catch {
    return null;
  }
}

// ── Akun seed (prisma/seed.ts, APP_MODE=saas) ─────────────────────────────
export const ACCOUNTS = {
  SUPER_ADMIN: { org: "demo", username: "superadmin", password: "admin123" },
  ADMIN_IT: { org: "demo", username: "admin_it", password: "admin123" },
  STAFF_IT: { org: "demo", username: "staff_it", password: "staff123" },
  ADMIN_IT_JAKARTA: { org: "demo", username: "admin_it_jakarta", password: "admin123" },
  ADMIN_KITCHEN: { org: "demo", username: "admin_kitchen", password: "admin123" },
  STAFF_KITCHEN: { org: "demo", username: "staff_kitchen", password: "staff123" },
  ADMIN_ENGINEERING: { org: "demo", username: "admin_engineering", password: "admin123" },
  TEKNISI_ENGINEERING: { org: "demo", username: "teknisi_engineering", password: "staff123" },
  B_SUPER_ADMIN: { org: "uji-b", username: "superadmin", password: "admin123" },
  B_ADMIN_IT: { org: "uji-b", username: "admin_it", password: "admin123" },
} as const;

export type AccountKey = keyof typeof ACCOUNTS;

const cookies: Partial<Record<AccountKey, string>> = {};

export function loginAs(orgCode: string, identifier: string, password: string) {
  return fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password, orgCode }),
  });
}

export function tokenCookie(res: Response): string | null {
  const match = res.headers.get("set-cookie")?.match(/token=([^;]+)/);
  return match ? `token=${match[1]}` : null;
}

export async function loginAll() {
  for (const key of Object.keys(ACCOUNTS) as AccountKey[]) {
    const account = ACCOUNTS[key];
    const res = await loginAs(account.org, account.username, account.password);
    const cookie = tokenCookie(res);
    if (!res.ok || !cookie) {
      throw new Error(
        `Login gagal untuk ${key} (${account.org}/${account.username}): status ${res.status}. ` +
          "Pastikan server berjalan dengan APP_MODE=saas dan seed sudah dijalankan ulang."
      );
    }
    cookies[key] = cookie;
  }
}

export function headersFor(key: AccountKey, extra: Record<string, string> = {}) {
  return { Cookie: cookies[key] ?? "", ...extra };
}

export function jsonHeaders(key: AccountKey) {
  return headersFor(key, { "Content-Type": "application/json" });
}

// ── Fixture berkas untuk uji unggah BAP ──────────────────────────────────
const FIXTURE_DIR = path.join(process.cwd(), "test-fixtures");

export const fixtures = {
  image: path.join(FIXTURE_DIR, "test-image.png"),
  smallPdf: path.join(FIXTURE_DIR, "test-small.pdf"),
  largePdf: path.join(FIXTURE_DIR, "test-large.pdf"),
};

export function setupFixtures() {
  fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  // PNG 1x1 transparan dibuat dinamis agar tidak bergantung pada path lokal
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
  fs.writeFileSync(fixtures.image, Buffer.from(png, "base64"));
  fs.writeFileSync(fixtures.smallPdf, "%PDF-1.4 ... dummy small pdf file content");
  const large = Buffer.alloc(5.2 * 1024 * 1024);
  large.write("%PDF-1.4 ... dummy large pdf file content");
  fs.writeFileSync(fixtures.largePdf, large);
}

export function cleanupFixtures() {
  fs.rmSync(FIXTURE_DIR, { recursive: true, force: true });
}

// ── Akses database langsung ──────────────────────────────────────────────
// HANYA untuk skenario yang sengaja tidak bisa dibuat lewat API (mis. akun
// yang penugasannya dicabut setelah login) dan untuk membandingkan hitungan.
let pool: Pool | null = null;
let client: PrismaClient | null = null;

export function qaDb(): PrismaClient {
  if (!client) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    client = new PrismaClient({ adapter: new PrismaPg(pool) });
  }
  return client;
}

export async function closeQaDb() {
  await client?.$disconnect();
  await pool?.end();
}
```

- [x] **6.2 Tulis ulang `qa-test-runner.ts` sebagai entry:**

```ts
import { BASE_URL, cleanupFixtures, closeQaDb, loginAll, setupFixtures, testResults } from "./qa/context";
import * as activity from "./qa/suites/activity";
import * as assets from "./qa/suites/assets";
import * as auth from "./qa/suites/auth";
import * as bap from "./qa/suites/bap";
import * as branches from "./qa/suites/branches";
import * as divisions from "./qa/suites/divisions";
import * as incidents from "./qa/suites/incidents";
import * as mdm from "./qa/suites/mdm";
import * as transfers from "./qa/suites/transfers";
import * as users from "./qa/suites/users";

// Urutan penting: suite belakangan mengandalkan route yang diuji lebih dulu.
const SUITES: Record<string, () => Promise<void>> = {
  auth: auth.run,
  divisions: divisions.run,
  assets: assets.run,
  branches: branches.run,
  users: users.run,
  transfers: transfers.run,
  bap: bap.run,
  incidents: incidents.run,
  activity: activity.run,
  mdm: mdm.run,
};

async function main() {
  console.log("\x1b[36m==================================================\x1b[0m");
  console.log("\x1b[36m🚀 RUNNING ASSET & INVENTORY INTEGRATION QA\x1b[0m");
  console.log("\x1b[36m==================================================\x1b[0m");

  try {
    await fetch(`${BASE_URL}/api/auth/me`);
  } catch {
    console.error(`\n❌ Tidak dapat terhubung ke server di ${BASE_URL}. Jalankan \`npm run dev\` lebih dulu.\n`);
    process.exit(1);
  }

  // `QA_ONLY=auth,assets` menjalankan sebagian suite.
  const only = (process.env.QA_ONLY ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const unknown = only.filter((name) => !(name in SUITES));
  if (unknown.length > 0) {
    console.error(`❌ Suite tidak dikenal: ${unknown.join(", ")}. Pilihan: ${Object.keys(SUITES).join(", ")}`);
    process.exit(1);
  }

  setupFixtures();
  try {
    await loginAll();
    for (const [name, run] of Object.entries(SUITES)) {
      if (only.length > 0 && !only.includes(name)) continue;
      console.log(`\n\x1b[36m▶ Suite: ${name}\x1b[0m`);
      await run();
    }
  } finally {
    cleanupFixtures();
    await closeQaDb();
  }

  console.log("\n\x1b[36m📊 SUMMARY QA TEST RESULTS\x1b[0m");
  console.table(
    testResults.map((r) => ({ ID: r.id, "Test Name": r.name, Status: r.passed ? "PASSED" : "FAILED", Notes: r.notes }))
  );

  const allPassed = testResults.length > 0 && testResults.every((r) => r.passed);
  console.log(allPassed ? "\n\x1b[32m✔ ALL INTEGRATION QA TESTS PASSED\x1b[0m\n" : "\n\x1b[31m✘ SOME INTEGRATION QA TESTS FAILED\x1b[0m\n");
  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error("\n\x1b[31m✘ QA RUNNER CRASHED:\x1b[0m", err);
  process.exit(1);
});
```

- [x] **6.3 Buat kerangka suite.** Untuk `divisions`, `assets`, `branches`, `users`, `transfers`, `bap`, `incidents`, `activity`, `mdm` buat `qa/suites/<nama>.ts` berisi kerangka berikut (diisi pada task masing-masing):

```ts
export async function run() {
  // Diisi pada task migrasi route terkait (lihat rencana Fase 1).
}
```

- [x] **6.4 Tulis `qa/suites/auth.ts`:**
  - **Pindahkan AUTH-01** dari runner lama apa adanya, tambahkan `"x-user-org": "org-demo"` ke header palsunya.
  - Tambahkan ORG-06:

```ts
import { BASE_URL, headersFor, loginAs, runTest, safeJson } from "../context";

export async function run() {
  // AUTH-01 — dipindahkan dari runner lama (header palsu + x-user-org)

  await runTest("ORG-06", "Kode organisasi menentukan akun; username sama di dua organisasi", async () => {
    const meDemo = await safeJson(await fetch(`${BASE_URL}/api/auth/me`, { headers: headersFor("SUPER_ADMIN") }));
    const meB = await safeJson(await fetch(`${BASE_URL}/api/auth/me`, { headers: headersFor("B_SUPER_ADMIN") }));
    // admin_kitchen hanya ada di demo; kode organisasi "tidak-ada" tidak terdaftar.
    const wrongOrg = await loginAs("uji-b", "admin_kitchen", "admin123");
    const missingOrg = await loginAs("tidak-ada", "superadmin", "admin123");
    const wrongOrgBody = await safeJson(wrongOrg);
    const missingOrgBody = await safeJson(missingOrg);

    const passed =
      meDemo?.data?.organization?.slug === "demo" &&
      meB?.data?.organization?.slug === "uji-b" &&
      meDemo?.data?.id !== meB?.data?.id &&
      wrongOrg.status === 401 &&
      missingOrg.status === 401 &&
      wrongOrgBody?.error === missingOrgBody?.error;

    return {
      passed,
      notes: `demo=${meDemo?.data?.organization?.slug} B=${meB?.data?.organization?.slug} wrongOrg=${wrongOrg.status} missingOrg=${missingOrg.status}`,
    };
  });
}
```

- [x] **6.5 Jalankan suite auth** (server dev berjalan, seed mode saas):
  ```bash
  QA_ONLY=auth npm run qa
  ```
  Harapan: `AUTH-01` dan `ORG-06` PASS, keluar dengan kode 0.

- [x] **6.6 Commit:**
  ```bash
  git add qa-test-runner.ts qa
  git commit -m "test(qa): pecah runner menjadi konteks + suite per domain" -m "Login per organisasi, QA_ONLY untuk menjalankan sebagian suite, akses database langsung hanya untuk skenario yang tidak bisa dibuat lewat API. Suite auth: AUTH-01, ORG-06." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

---

## Task 7: API Divisi & Kategori

**Berkas baru:** `src/app/api/divisions/route.ts`, `src/app/api/divisions/[id]/route.ts`, `src/app/api/divisions/[id]/categories/route.ts`, `src/app/api/categories/[id]/route.ts`; `qa/suites/divisions.ts`.

- [x] **7.1 Tulis test di `qa/suites/divisions.ts` (gagal dulu):**

```ts
import { BASE_URL, headersFor, jsonHeaders, runTest, safeJson } from "../context";

const stamp = () => Date.now().toString(36);

export async function run() {
  await runTest("DIV-01", "Hanya Super Admin yang dapat mengelola divisi", async () => {
    const post = (key: "ADMIN_IT" | "STAFF_IT") =>
      fetch(`${BASE_URL}/api/divisions`, { method: "POST", headers: jsonHeaders(key), body: JSON.stringify({ name: `QA ${stamp()}` }) });
    const statuses = [
      (await post("ADMIN_IT")).status,
      (await post("STAFF_IT")).status,
      (await fetch(`${BASE_URL}/api/divisions/div-it`, { method: "PUT", headers: jsonHeaders("ADMIN_IT"), body: JSON.stringify({ name: "IT Baru" }) })).status,
      (await fetch(`${BASE_URL}/api/divisions/div-it`, { method: "DELETE", headers: headersFor("ADMIN_IT") })).status,
    ];
    return { passed: statuses.every((s) => s === 403), notes: `status: ${statuses.join(", ")}` };
  });

  await runTest("DIV-02", "Admin divisi mengelola kategori divisinya sendiri saja", async () => {
    const name = `QA Kategori ${stamp()}`;
    const created = await fetch(`${BASE_URL}/api/divisions/div-it/categories`, { method: "POST", headers: jsonHeaders("ADMIN_IT"), body: JSON.stringify({ name }) });
    const createdBody = await safeJson(created);
    const id = createdBody?.data?.id;
    const renamed = await fetch(`${BASE_URL}/api/categories/${id}`, { method: "PUT", headers: jsonHeaders("ADMIN_IT"), body: JSON.stringify({ name: `${name} 2` }) });
    const removed = await fetch(`${BASE_URL}/api/categories/${id}`, { method: "DELETE", headers: headersFor("ADMIN_IT") });
    const foreignCreate = await fetch(`${BASE_URL}/api/divisions/div-kitchen/categories`, { method: "POST", headers: jsonHeaders("ADMIN_IT"), body: JSON.stringify({ name }) });
    const foreignRename = await fetch(`${BASE_URL}/api/categories/cat-kitchen-oven`, { method: "PUT", headers: jsonHeaders("ADMIN_IT"), body: JSON.stringify({ name: "Oven Dibajak" }) });
    const staffCreate = await fetch(`${BASE_URL}/api/divisions/div-it/categories`, { method: "POST", headers: jsonHeaders("STAFF_IT"), body: JSON.stringify({ name }) });
    const passed =
      created.status === 201 && renamed.status === 200 && removed.status === 200 &&
      foreignCreate.status === 403 && foreignRename.status === 403 && staffCreate.status === 403;
    return {
      passed,
      notes: `create=${created.status} rename=${renamed.status} delete=${removed.status} kitchenCreate=${foreignCreate.status} kitchenRename=${foreignRename.status} staff=${staffCreate.status}`,
    };
  });

  await runTest("DIV-04a", "Divisi/kategori yang masih berisi tidak dapat dihapus (409); divisi kosong bisa", async () => {
    const division = await fetch(`${BASE_URL}/api/divisions/div-it`, { method: "DELETE", headers: headersFor("SUPER_ADMIN") });
    const category = await fetch(`${BASE_URL}/api/categories/cat-it-laptop`, { method: "DELETE", headers: headersFor("SUPER_ADMIN") });
    const empty = await safeJson(await fetch(`${BASE_URL}/api/divisions`, { method: "POST", headers: jsonHeaders("SUPER_ADMIN"), body: JSON.stringify({ name: `QA Divisi ${stamp()}` }) }));
    const emptyDelete = await fetch(`${BASE_URL}/api/divisions/${empty?.data?.id}`, { method: "DELETE", headers: headersFor("SUPER_ADMIN") });
    const passed = division.status === 409 && category.status === 409 && emptyDelete.status === 200;
    return { passed, notes: `divisi=${division.status} kategori=${category.status} divisiKosong=${emptyDelete.status}` };
  });
}
```

- [x] **7.2 Jalankan dan pastikan gagal:** `QA_ONLY=divisions npm run qa` → DIV-01/02/04a FAIL (404 route belum ada).

- [x] **7.3 `src/app/api/divisions/route.ts`:**

```ts
import { NextRequest } from "next/server";
import { requireUserScope } from "@/lib/auth";
import { assetScopeWhere } from "@/lib/scope";
import { errorResponse, isSuperAdmin, normalizeName, successResponse } from "@/lib/utils";
import { isUniqueViolation } from "@/lib/db-errors";
import { writeActivityLog } from "@/lib/logger";

export const dynamic = "force-dynamic";

// GET /api/divisions — SUPER_ADMIN: semua divisi; peran lain: divisinya sendiri.
// Hitungan aset mengikuti cakupan outlet pengguna agar jumlah aset outlet lain
// tidak bocor; hitungan pengguna hanya untuk SUPER_ADMIN.
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireUserScope(request);
    if (!ctx.ok) return ctx.response;
    const { db, scope, user } = ctx;

    const assetWhere = assetScopeWhere(scope);
    const divisions = await db.division.findMany({
      where: scope.divisionId ? { id: scope.divisionId } : undefined,
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        description: true,
        categories: {
          orderBy: { name: "asc" },
          select: { id: true, name: true, _count: { select: { assets: { where: assetWhere } } } },
        },
        _count: {
          select: {
            assets: { where: assetWhere },
            ...(isSuperAdmin(user.role) ? { users: true } : {}),
          },
        },
      },
    });

    return successResponse(divisions, "Daftar divisi berhasil diambil");
  } catch (error) {
    console.error("Get divisions error:", error);
    return errorResponse("Terjadi kesalahan server", "Gagal mengambil data divisi", 500);
  }
}

// POST /api/divisions — Tambah divisi (SUPER_ADMIN)
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireUserScope(request);
    if (!ctx.ok) return ctx.response;
    const { db, user } = ctx;

    if (!isSuperAdmin(user.role)) {
      return errorResponse("Akses ditolak", "Hanya Super Admin yang dapat menambah divisi", 403);
    }

    const body = await request.json().catch(() => ({}));
    const name = normalizeName(body.name);
    if (!name) {
      return errorResponse("Nama divisi wajib diisi (maksimal 60 karakter)", "Validasi gagal", 400);
    }
    const description =
      typeof body.description === "string" && body.description.trim() ? body.description.trim() : null;

    const division = await db.division.create({
      data: { organizationId: user.organizationId, name, description },
    });

    await writeActivityLog(ctx, "CREATE_DIVISION", `Menambahkan divisi "${division.name}" (ID: ${division.id})`, request);
    return successResponse(division, "Divisi berhasil ditambahkan", 201);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return errorResponse("Nama divisi sudah dipakai", "Validasi gagal", 409);
    }
    console.error("Create division error:", error);
    return errorResponse("Terjadi kesalahan server", "Gagal menambah divisi", 500);
  }
}
```

- [x] **7.4 `src/app/api/divisions/[id]/route.ts`** — `PUT` (ganti nama/deskripsi) dan `DELETE`, keduanya SUPER_ADMIN:

```ts
import { NextRequest } from "next/server";
import { requireUserScope } from "@/lib/auth";
import { errorResponse, isSuperAdmin, normalizeName, successResponse } from "@/lib/utils";
import { isUniqueViolation } from "@/lib/db-errors";
import { writeActivityLog } from "@/lib/logger";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// PUT /api/divisions/[id] — Ganti nama/deskripsi divisi (SUPER_ADMIN)
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const ctx = await requireUserScope(request);
    if (!ctx.ok) return ctx.response;
    const { db, user } = ctx;

    if (!isSuperAdmin(user.role)) {
      return errorResponse("Akses ditolak", "Hanya Super Admin yang dapat mengubah divisi", 403);
    }

    const { id } = await params;
    const existing = await db.division.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!existing) return errorResponse("Divisi tidak ditemukan", "Gagal", 404);

    const body = await request.json().catch(() => ({}));
    const name = body.name === undefined ? undefined : normalizeName(body.name);
    if (name === null) {
      return errorResponse("Nama divisi wajib diisi (maksimal 60 karakter)", "Validasi gagal", 400);
    }
    const description =
      body.description === undefined
        ? undefined
        : typeof body.description === "string" && body.description.trim()
          ? body.description.trim()
          : null;

    const division = await db.division.update({
      where: { id },
      data: { ...(name !== undefined && { name }), ...(description !== undefined && { description }) },
    });

    await writeActivityLog(ctx, "UPDATE_DIVISION", `Mengubah divisi "${existing.name}" → "${division.name}" (ID: ${id})`, request);
    return successResponse(division, "Divisi berhasil diperbarui");
  } catch (error) {
    if (isUniqueViolation(error)) {
      return errorResponse("Nama divisi sudah dipakai", "Validasi gagal", 409);
    }
    console.error("Update division error:", error);
    return errorResponse("Terjadi kesalahan server", "Gagal memperbarui divisi", 500);
  }
}

// DELETE /api/divisions/[id] — Hapus divisi kosong (SUPER_ADMIN). Kategori
// kosongnya ikut terhapus lewat onDelete: Cascade.
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const ctx = await requireUserScope(request);
    if (!ctx.ok) return ctx.response;
    const { db, user } = ctx;

    if (!isSuperAdmin(user.role)) {
      return errorResponse("Akses ditolak", "Hanya Super Admin yang dapat menghapus divisi", 403);
    }

    const { id } = await params;
    const division = await db.division.findUnique({
      where: { id },
      select: { name: true, _count: { select: { assets: true, users: true } } },
    });
    if (!division) return errorResponse("Divisi tidak ditemukan", "Gagal", 404);

    const { assets, users } = division._count;
    if (assets > 0 || users > 0) {
      return errorResponse(
        `Divisi masih memiliki ${assets} aset dan ${users} pengguna. Pindahkan atau hapus terlebih dahulu.`,
        "Gagal menghapus divisi",
        409
      );
    }

    await db.division.delete({ where: { id } });
    await writeActivityLog(ctx, "DELETE_DIVISION", `Menghapus divisi "${division.name}" (ID: ${id})`, request);
    return successResponse(null, "Divisi berhasil dihapus");
  } catch (error) {
    console.error("Delete division error:", error);
    return errorResponse("Terjadi kesalahan server", "Gagal menghapus divisi", 500);
  }
}
```

- [x] **7.5 `src/app/api/divisions/[id]/categories/route.ts`** — `POST`:

```ts
import { NextRequest } from "next/server";
import { requireUserScope } from "@/lib/auth";
import { canManageCategories } from "@/lib/scope";
import { errorResponse, normalizeName, successResponse } from "@/lib/utils";
import { isUniqueViolation } from "@/lib/db-errors";
import { writeActivityLog } from "@/lib/logger";

export const dynamic = "force-dynamic";

// POST /api/divisions/[id]/categories — Tambah kategori
// (SUPER_ADMIN, atau DIVISION_ADMIN divisi tersebut)
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireUserScope(request);
    if (!ctx.ok) return ctx.response;
    const { db, scope, user } = ctx;

    const { id: divisionId } = await params;
    // Hak akses diperiksa SEBELUM keberadaan divisi agar admin divisi lain
    // tidak bisa memetakan ID divisi mana yang ada.
    if (!canManageCategories(user.role, scope, divisionId)) {
      return errorResponse("Akses ditolak", "Anda hanya dapat mengelola kategori di divisi Anda sendiri", 403);
    }

    const division = await db.division.findUnique({ where: { id: divisionId }, select: { id: true, name: true } });
    if (!division) return errorResponse("Divisi tidak ditemukan", "Gagal", 404);

    const body = await request.json().catch(() => ({}));
    const name = normalizeName(body.name);
    if (!name) {
      return errorResponse("Nama kategori wajib diisi (maksimal 60 karakter)", "Validasi gagal", 400);
    }

    const category = await db.category.create({
      data: { organizationId: user.organizationId, divisionId, name },
    });

    await writeActivityLog(ctx, "CREATE_CATEGORY", `Menambahkan kategori "${name}" di divisi "${division.name}"`, request);
    return successResponse(category, "Kategori berhasil ditambahkan", 201);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return errorResponse("Nama kategori sudah dipakai di divisi ini", "Validasi gagal", 409);
    }
    console.error("Create category error:", error);
    return errorResponse("Terjadi kesalahan server", "Gagal menambah kategori", 500);
  }
}
```

- [x] **7.6 `src/app/api/categories/[id]/route.ts`** — `PUT` & `DELETE`:

```ts
import { NextRequest } from "next/server";
import { requireUserScope } from "@/lib/auth";
import { canManageCategories } from "@/lib/scope";
import { errorResponse, isSuperAdmin, normalizeName, successResponse } from "@/lib/utils";
import { isUniqueViolation } from "@/lib/db-errors";
import { writeActivityLog } from "@/lib/logger";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// PUT /api/categories/[id] — Ganti nama kategori
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const ctx = await requireUserScope(request);
    if (!ctx.ok) return ctx.response;
    const { db, scope, user } = ctx;

    const { id } = await params;
    const category = await db.category.findUnique({ where: { id }, select: { id: true, name: true, divisionId: true } });
    if (!category) return errorResponse("Kategori tidak ditemukan", "Gagal", 404);
    if (!canManageCategories(user.role, scope, category.divisionId)) {
      return errorResponse("Akses ditolak", "Anda hanya dapat mengelola kategori di divisi Anda sendiri", 403);
    }

    const body = await request.json().catch(() => ({}));
    const name = normalizeName(body.name);
    if (!name) {
      return errorResponse("Nama kategori wajib diisi (maksimal 60 karakter)", "Validasi gagal", 400);
    }

    const updated = await db.category.update({ where: { id }, data: { name } });
    await writeActivityLog(ctx, "UPDATE_CATEGORY", `Mengubah kategori "${category.name}" → "${name}" (ID: ${id})`, request);
    return successResponse(updated, "Kategori berhasil diperbarui");
  } catch (error) {
    if (isUniqueViolation(error)) {
      return errorResponse("Nama kategori sudah dipakai di divisi ini", "Validasi gagal", 409);
    }
    console.error("Update category error:", error);
    return errorResponse("Terjadi kesalahan server", "Gagal memperbarui kategori", 500);
  }
}

// DELETE /api/categories/[id] — Hapus kategori yang belum dipakai aset
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const ctx = await requireUserScope(request);
    if (!ctx.ok) return ctx.response;
    const { db, scope, user } = ctx;

    const { id } = await params;
    const category = await db.category.findUnique({
      where: { id },
      select: { name: true, divisionId: true, _count: { select: { assets: true } } },
    });
    if (!category) return errorResponse("Kategori tidak ditemukan", "Gagal", 404);
    if (!canManageCategories(user.role, scope, category.divisionId)) {
      return errorResponse("Akses ditolak", "Anda hanya dapat mengelola kategori di divisi Anda sendiri", 403);
    }

    if (category._count.assets > 0) {
      // Jumlah hanya untuk SUPER_ADMIN: admin divisi terikat outlet, dan
      // hitungan ini mencakup aset di outlet lain.
      const detail = isSuperAdmin(user.role) ? ` (${category._count.assets} aset)` : "";
      return errorResponse(
        `Kategori masih dipakai aset${detail}. Ubah kategori aset tersebut terlebih dahulu.`,
        "Gagal menghapus kategori",
        409
      );
    }

    await db.category.delete({ where: { id } });
    await writeActivityLog(ctx, "DELETE_CATEGORY", `Menghapus kategori "${category.name}" (ID: ${id})`, request);
    return successResponse(null, "Kategori berhasil dihapus");
  } catch (error) {
    console.error("Delete category error:", error);
    return errorResponse("Terjadi kesalahan server", "Gagal menghapus kategori", 500);
  }
}
```

- [x] **7.7 Jalankan suite sampai hijau:** `QA_ONLY=divisions npm run qa` → DIV-01, DIV-02, DIV-04a PASS.

- [x] **7.8 Cek tipe & commit:**
  ```bash
  npx tsc --noEmit 2>&1 | grep -E "src/app/api/(divisions|categories)"
  git add src/app/api/divisions src/app/api/categories qa/suites/divisions.ts
  git commit -m "feat(api): kelola divisi & kategori" -m "Divisi khusus Super Admin; kategori oleh Super Admin atau admin divisinya. Hapus hanya bila kosong (409 bila masih berisi)." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

---

## Task 8: API Aset

**Berkas:** `src/app/api/assets/route.ts`, `src/app/api/assets/[id]/route.ts`, `qa/suites/assets.ts`.

- [x] **8.1 Isi `qa/suites/assets.ts`:**
  - **Pindahkan** RBAC-01 (`IT_SUPPORT` → `STAFF_IT`), SEP-01, SEP-02, SEP-03, BR-01, BR-02, BR-03, BR-04 dari runner lama; sesuaikan payload dengan tabel pemetaan Task 6 (BR-03 mengirim `categoryId: "cat-it-laptop"`).
  - Tambahkan (impor `BASE_URL, headersFor, jsonHeaders, qaDb, runTest, safeJson` dari `../context`):

```ts
  await runTest("DIV-03", "Kategori dari divisi lain ditolak saat membuat maupun mengubah aset", async () => {
    const create = await fetch(`${BASE_URL}/api/assets`, {
      method: "POST",
      headers: jsonHeaders("SUPER_ADMIN"),
      body: JSON.stringify({ name: "QA Salah Kategori", divisionId: "div-it", categoryId: "cat-kitchen-chiller", branchId: "branch-bogor", status: "ACTIVE" }),
    });
    const update = await fetch(`${BASE_URL}/api/assets/asset-laptop-dell-bogor`, {
      method: "PUT",
      headers: jsonHeaders("ADMIN_IT"),
      body: JSON.stringify({ categoryId: "cat-kitchen-chiller" }),
    });
    return { passed: create.status === 400 && update.status === 400, notes: `create=${create.status} update=${update.status}` };
  });

  await runTest("ORG-01", "Daftar aset tidak pernah memuat aset organisasi lain", async () => {
    const body = await safeJson(await fetch(`${BASE_URL}/api/assets?limit=100`, { headers: headersFor("SUPER_ADMIN") }));
    const ids: string[] = (body?.data?.assets ?? []).map((a: { id: string }) => a.id);
    const demoTotal = await qaDb().asset.count({ where: { organizationId: "org-demo" } });
    const passed = !ids.includes("asset-b-laptop") && body?.data?.pagination?.total === demoTotal;
    return { passed, notes: `total=${body?.data?.pagination?.total} (demo=${demoTotal}), memuat B: ${ids.includes("asset-b-laptop")}` };
  });

  await runTest("ORG-02", "Aset organisasi lain: GET/PUT/DELETE membalas 404 tanpa data", async () => {
    const url = `${BASE_URL}/api/assets/asset-b-laptop`;
    const get = await fetch(url, { headers: headersFor("SUPER_ADMIN") });
    const getBody = await safeJson(get);
    const put = await fetch(url, { method: "PUT", headers: jsonHeaders("SUPER_ADMIN"), body: JSON.stringify({ name: "Dibajak" }) });
    const del = await fetch(url, { method: "DELETE", headers: headersFor("SUPER_ADMIN") });
    const stillThere = await safeJson(await fetch(url, { headers: headersFor("B_SUPER_ADMIN") }));
    const passed =
      get.status === 404 && getBody?.data == null && put.status === 404 && del.status === 404 &&
      stillThere?.data?.name === "Laptop Org B";
    return { passed, notes: `get=${get.status} put=${put.status} delete=${del.status} B masih ada: ${stillThere?.data?.name}` };
  });

  await runTest("ORG-03", "Kategori/cabang organisasi lain di payload ditolak 400 tanpa membuat baris", async () => {
    const name = `QA Lintas Org ${Date.now().toString(36)}`;
    const badCategory = await fetch(`${BASE_URL}/api/assets`, {
      method: "POST",
      headers: jsonHeaders("SUPER_ADMIN"),
      body: JSON.stringify({ name, divisionId: "div-it", categoryId: "cat-b-laptop", branchId: "branch-bogor", status: "ACTIVE" }),
    });
    const badBranch = await fetch(`${BASE_URL}/api/assets`, {
      method: "POST",
      headers: jsonHeaders("SUPER_ADMIN"),
      body: JSON.stringify({ name, divisionId: "div-it", categoryId: "cat-it-laptop", branchId: "branch-b1", status: "ACTIVE" }),
    });
    const leaked = await qaDb().asset.count({ where: { name } });
    const passed = badCategory.status === 400 && badBranch.status === 400 && leaked === 0;
    return { passed, notes: `kategori=${badCategory.status} cabang=${badBranch.status} baris=${leaked}` };
  });

  await runTest("USR-03", "Staf multi-outlet melihat aset divisinya di semua outletnya saja", async () => {
    const body = await safeJson(await fetch(`${BASE_URL}/api/assets?limit=100`, { headers: headersFor("TEKNISI_ENGINEERING") }));
    const assets: { id: string; divisionId: string }[] = body?.data?.assets ?? [];
    const ids = assets.map((a) => a.id);
    const passed =
      ids.includes("asset-genset-bogor") && ids.includes("asset-ac-jkt") &&
      !ids.includes("asset-pompa-bandung") && assets.every((a) => a.divisionId === "div-engineering");
    return { passed, notes: `aset: ${ids.join(", ")}` };
  });
```

- [x] **8.2 Jalankan dan pastikan gagal:** `QA_ONLY=assets npm run qa`.

- [x] **8.3 `src/app/api/assets/route.ts`** — terapkan resep, lalu:

  **Impor:** `requireUserScope` dari `@/lib/auth`; `effectiveBranchFilter`, `effectiveDivisionFilter` dari `@/lib/scope`; `isUniqueViolation` dari `@/lib/db-errors`; dari `@/lib/utils` buang `ASSET_TYPES_BY_INVENTORY` (sisanya tetap).

  **GET** — ganti pembentukan `where` dan `include`:
```ts
    const where: Prisma.AssetWhereInput = {};

    // Divisi & outlet: nilai dari klien hanya mempersempit, tidak pernah memperluas.
    const divisionFilter = effectiveDivisionFilter(scope, searchParams.get("divisionId"));
    if (divisionFilter) where.divisionId = divisionFilter;
    const branchFilter = effectiveBranchFilter(scope, searchParams.get("branchId"));
    if (branchFilter) where.branchId = { in: branchFilter };

    const categoryId = searchParams.get("categoryId");
    if (categoryId) where.categoryId = categoryId;
    if (status) where.status = status as Prisma.EnumAssetStatusFilter["equals"];
    // `search` tetap seperti sebelumnya (OR pada name/serialNumber/brand/model)
```
```ts
        include: {
          branch: { select: { id: true, name: true } },
          division: { select: { id: true, name: true } },
          category: { select: { id: true, name: true } },
          baps: { select: { id: true, status: true, quantity: true }, orderBy: { createdAt: "desc" }, take: 1 },
        },
```
  Hapus parameter `type` dan `inventory`.

  **POST** — ganti seluruh isi handler:
```ts
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireUserScope(request);
    if (!ctx.ok) return ctx.response;
    const { db, scope, user } = ctx;

    if (!isAdminRole(user.role)) {
      return errorResponse("Akses ditolak", "Hanya admin yang dapat menambahkan aset", 403);
    }

    const body = await request.json();
    const { name, categoryId, serialNumber, brand, model, specs, purchaseDate, warrantyDate, status, quantity, photoUrl, notes } = body;

    // Divisi: admin divisi selalu divisinya sendiri — nilai berbeda DITOLAK
    // (bukan diam-diam ditimpa) agar salah pilih terlihat jelas.
    const divisionId: string | undefined = scope.divisionId ? body.divisionId || scope.divisionId : body.divisionId;
    if (scope.divisionId && divisionId !== scope.divisionId) {
      return errorResponse("Anda hanya dapat menambahkan aset di divisi Anda sendiri.", "Akses ditolak", 403);
    }

    // Outlet: harus salah satu outlet pengguna. Pengguna ber-outlet tunggal
    // tidak perlu mengirimnya; pemegang beberapa outlet wajib memilih.
    let branchId: string | undefined = body.branchId || undefined;
    if (scope.branchIds) {
      if (!branchId && scope.branchIds.length === 1) branchId = scope.branchIds[0];
      if (branchId && !scope.branchIds.includes(branchId)) {
        return errorResponse("Anda hanya dapat menambahkan aset di outlet Anda sendiri.", "Akses ditolak", 403);
      }
    }

    if (!name || !divisionId || !categoryId || !branchId || !status) {
      return errorResponse("Nama, divisi, kategori, outlet, dan kondisi stok awal wajib diisi", "Validasi gagal", 400);
    }

    // Kategori wajib milik divisi aset; client tenant sekaligus menolak ID
    // milik organisasi lain. FK komposit (divisionId, categoryId) adalah
    // jaring pengaman terakhir di database.
    const category = await db.category.findFirst({ where: { id: categoryId, divisionId }, select: { id: true, name: true } });
    if (!category) {
      return errorResponse("Kategori tidak ditemukan di divisi ini", "Validasi gagal", 400);
    }
    const branch = await db.branch.findUnique({ where: { id: branchId }, select: { id: true } });
    if (!branch) {
      return errorResponse("Cabang tidak ditemukan", "Validasi gagal", 400);
    }

    // Validasi status awal & stok awal — sama seperti sebelumnya
    // (isStockCondition(status), initialQuantity ≥ 1).

    if (serialNumber) {
      const existing = await db.asset.findFirst({ where: { serialNumber, categoryId }, select: { id: true } });
      if (existing) {
        return errorResponse(`Serial number "${serialNumber}" sudah terdaftar untuk kategori ${category.name}`, "Validasi gagal", 400);
      }
    }

    const asset = await db.asset.create({
      data: {
        organizationId: user.organizationId,
        divisionId,
        categoryId,
        branchId,
        name,
        serialNumber: serialNumber || null,
        brand: brand || null,
        model: model || null,
        specs: specs || null,
        purchaseDate: purchaseDate ? new Date(purchaseDate) : null,
        warrantyDate: warrantyDate ? new Date(warrantyDate) : null,
        ...stockUpdateData(initialStock(initialQuantity, status)),
        photoUrl: photoUrl || null,
        notes: notes || null,
      },
      include: {
        branch: { select: { id: true, name: true } },
        division: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
      },
    });

    await writeActivityLog(
      ctx,
      "CREATE_ASSET",
      `Menambahkan aset baru: "${asset.name}" (ID: ${asset.id}, Divisi: ${asset.division.name}, Kategori: ${asset.category.name}, Outlet: ${asset.branch.name}, Stok awal: ${asset.quantity} pcs ${status})`,
      request
    );

    return successResponse(asset, "Aset berhasil ditambahkan", 201);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return errorResponse("Serial number sudah terdaftar untuk kategori ini", "Validasi gagal", 400);
    }
    console.error("Create asset error:", error);
    return errorResponse("Terjadi kesalahan server", "Gagal menambah aset", 500);
  }
}
```
  (Salin utuh blok validasi `isStockCondition(status)` dan `initialQuantity` dari versi lama ke posisi komentar di atas.)

- [x] **8.4 `src/app/api/assets/[id]/route.ts`** — terapkan resep pada GET/PUT/DELETE, lalu:
  - **GET:** `include` tambahkan `division`/`category` (`select: { id, name }`); **hapus** `mdm` (MDM nonaktif). `assetAccessDenied(scope, asset)` tetap setelah pengecekan `!asset → 404`.
  - **PUT:** `select` memakai `divisionId: true, categoryId: true` (ganti `inventory`, `type`). Ambil `categoryId` (bukan `type`) dari body. Ganti blok validasi tipe dengan:
```ts
    // Divisi aset tidak dapat diubah; kategori hanya dalam divisi yang sama.
    if (body.divisionId !== undefined && body.divisionId !== existingAsset.divisionId) {
      return errorResponse("Divisi aset tidak dapat diubah", "Validasi gagal", 400);
    }
    if (categoryId !== undefined && categoryId !== existingAsset.categoryId) {
      const category = await db.category.findFirst({
        where: { id: categoryId, divisionId: existingAsset.divisionId },
        select: { id: true },
      });
      if (!category) {
        return errorResponse("Kategori tidak ditemukan di divisi aset ini", "Validasi gagal", 400);
      }
    }
```
    Validasi serial: `where: { serialNumber, categoryId: categoryId ?? existingAsset.categoryId, NOT: { id } }`. Data update: `...(categoryId !== undefined && { categoryId })` menggantikan `type`. Tambahkan `isUniqueViolation` → 400 di `catch`.
  - **DELETE:** resep saja (transaksi tetap menghapus incident, transfer, bap, mdmDevice lalu aset).

- [x] **8.5 Jalankan suite sampai hijau:** `QA_ONLY=assets npm run qa` → RBAC-01, SEP-01..03, BR-01..04, DIV-03, ORG-01..03, USR-03 PASS.

- [x] **8.6 Cek tipe & commit:**
  ```bash
  npx tsc --noEmit 2>&1 | grep -E "src/app/api/assets/(route|\[id\]/route)\.ts"
  git add src/app/api/assets/route.ts "src/app/api/assets/[id]/route.ts" qa/suites/assets.ts
  git commit -m "feat(api): aset berbasis divisi & kategori dinamis" -m "Filter divisi/kategori/outlet yang tidak bisa memperluas akses, validasi kategori per divisi, outlet dari daftar penugasan pengguna, dan 404 untuk aset organisasi lain." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

---

## Task 9: API Cabang

**Berkas:** `src/app/api/branches/route.ts`, `src/app/api/branches/[id]/route.ts`, `qa/suites/branches.ts`.

- [x] **9.1 Isi `qa/suites/branches.ts`:** pindahkan **BR-06**; tambahkan:

```ts
  await runTest("DIV-04b", "Cabang yang masih punya aset/pengguna tidak dapat dihapus (409)", async () => {
    const res = await fetch(`${BASE_URL}/api/branches/branch-bandung`, { method: "DELETE", headers: headersFor("SUPER_ADMIN") });
    const body = await safeJson(res);
    return { passed: res.status === 409, notes: `status=${res.status} ${body?.error ?? ""}` };
  });
```

- [x] **9.2 Jalankan dan pastikan gagal:** `QA_ONLY=branches npm run qa`.

- [x] **9.3 `src/app/api/branches/route.ts`** — resep, lalu:
  - GET: `where: scope.branchIds && !listAllBranches ? { id: { in: scope.branchIds } } : undefined`.
  - POST: `data: { organizationId: user.organizationId, name, location, mapUrl }`; `catch` → `isUniqueViolation` ⇒ `409 "Nama cabang sudah dipakai"`.

- [x] **9.4 `src/app/api/branches/[id]/route.ts`** — resep, lalu:
  - GET: `if (scope.branchIds && !scope.branchIds.includes(id))` → 403 `"Unauthorized cross-branch access detected."`; `select` aset ganti `type`/`inventory` dengan `categoryId`, `divisionId`, `category: { select: { name: true } }`, `division: { select: { name: true } }`.
  - PUT: `isUniqueViolation` ⇒ 409; cabang tidak ditemukan ⇒ 404 (cek `findUnique` sebelum update).
  - DELETE: ganti pemeriksaan aset dengan:
```ts
    const branch = await db.branch.findUnique({
      where: { id },
      select: { name: true, _count: { select: { assets: true, userBranches: true } } },
    });
    if (!branch) return errorResponse("Cabang tidak ditemukan", "Gagal", 404);

    const { assets, userBranches } = branch._count;
    if (assets > 0 || userBranches > 0) {
      return errorResponse(
        `Cabang masih memiliki ${assets} aset dan ${userBranches} pengguna yang ditugaskan. Pindahkan terlebih dahulu.`,
        "Gagal menghapus cabang",
        409
      );
    }
```

- [x] **9.5 Jalankan suite sampai hijau**, cek tipe (`grep -E "src/app/api/branches"`), commit:
  ```bash
  git add src/app/api/branches qa/suites/branches.ts
  git commit -m "feat(api): cabang per organisasi dengan penugasan multi-outlet" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

---

## Task 10: API Pengguna

**Berkas:** `src/lib/users.ts` (baru), `src/app/api/users/route.ts`, `src/app/api/users/[id]/route.ts`, `qa/suites/users.ts`.

- [x] **10.1 Isi `qa/suites/users.ts` (impor tambahan: `loginAs, tokenCookie, qaDb`):**

```ts
  await runTest("USR-01", "Akun non-Super Admin wajib punya divisi dan outlet; Super Admin wajib email", async () => {
    const base = { username: `qa_${Date.now().toString(36)}`, name: "QA", password: "staff123" };
    const post = (payload: object) =>
      fetch(`${BASE_URL}/api/users`, { method: "POST", headers: jsonHeaders("SUPER_ADMIN"), body: JSON.stringify({ ...base, ...payload }) });
    const noBranch = await post({ role: "DIVISION_STAFF", divisionId: "div-it", branchIds: [] });
    const noDivision = await post({ role: "DIVISION_STAFF", branchIds: ["branch-bogor"] });
    const superNoEmail = await post({ role: "SUPER_ADMIN" });
    const statuses = [noBranch.status, noDivision.status, superNoEmail.status];
    return { passed: statuses.every((s) => s === 400), notes: `status: ${statuses.join(", ")}` };
  });

  await runTest("USR-02", "Penugasan dicabut setelah login: API 403, me unassigned, login ulang 403", async () => {
    const username = `qa_unassigned_${Date.now().toString(36)}`;
    const created = await safeJson(
      await fetch(`${BASE_URL}/api/users`, {
        method: "POST",
        headers: jsonHeaders("SUPER_ADMIN"),
        body: JSON.stringify({ username, name: "QA Unassigned", password: "staff123", role: "DIVISION_STAFF", divisionId: "div-it", branchIds: ["branch-bogor"] }),
      })
    );
    const userId: string | undefined = created?.data?.id;
    if (!userId) throw new Error(`Gagal membuat pengguna uji: ${JSON.stringify(created)}`);

    try {
      const cookie = tokenCookie(await loginAs("demo", username, "staff123"));
      if (!cookie) throw new Error("Login awal gagal");

      // Dicabut langsung di database — API sengaja menolak akun tanpa outlet.
      await qaDb().userBranch.deleteMany({ where: { userId } });

      const assets = await fetch(`${BASE_URL}/api/assets`, { headers: { Cookie: cookie } });
      const me = await safeJson(await fetch(`${BASE_URL}/api/auth/me`, { headers: { Cookie: cookie } }));
      const logout = await fetch(`${BASE_URL}/api/auth/logout`, { method: "POST", headers: { Cookie: cookie } });
      const relogin = await loginAs("demo", username, "staff123");

      const passed = assets.status === 403 && me?.data?.access === "unassigned" && logout.status === 200 && relogin.status === 403;
      return { passed, notes: `assets=${assets.status} me.access=${me?.data?.access} logout=${logout.status} relogin=${relogin.status}` };
    } finally {
      await fetch(`${BASE_URL}/api/users/${userId}`, { method: "DELETE", headers: headersFor("SUPER_ADMIN") });
    }
  });

  await runTest("USR-04", "Super Admin terakhir organisasi tidak dapat diturunkan", async () => {
    const res = await fetch(`${BASE_URL}/api/users/user-superadmin`, {
      method: "PUT",
      headers: jsonHeaders("SUPER_ADMIN"),
      body: JSON.stringify({ role: "DIVISION_ADMIN", divisionId: "div-it", branchIds: ["branch-bogor"] }),
    });
    const body = await safeJson(res);
    return { passed: res.status === 400, notes: `status=${res.status} ${body?.error ?? ""}` };
  });
```

- [x] **10.2 Jalankan dan pastikan gagal:** `QA_ONLY=users npm run qa`.

- [x] **10.3 `src/lib/users.ts`:**

```ts
import type { Prisma } from "@prisma/client";
import type { TenantDb } from "./tenant-db";
import { roleLabel } from "./utils";

/** Kolom pengguna yang aman dikirim ke klien (tanpa hash password). */
export const USER_PUBLIC_SELECT = {
  id: true,
  username: true,
  name: true,
  email: true,
  role: true,
  divisionId: true,
  division: { select: { id: true, name: true } },
  branches: {
    select: { branch: { select: { id: true, name: true } } },
    orderBy: { branch: { name: "asc" } },
  },
  createdAt: true,
} satisfies Prisma.UserSelect;

type PublicUserRow = Prisma.UserGetPayload<{ select: typeof USER_PUBLIC_SELECT }>;

export function toPublicUser(row: PublicUserRow) {
  return {
    ...row,
    branches: row.branches.map((link) => link.branch),
    roleLabel: roleLabel(row.role, row.division?.name),
  };
}

/**
 * Pastikan divisi & outlet penugasan ada di organisasi pengguna. Client tenant
 * membuat ID milik organisasi lain "tidak ditemukan" → 400.
 */
export async function assignmentRefsError(
  db: TenantDb,
  divisionId: string | null,
  branchIds: string[]
): Promise<string | null> {
  if (divisionId) {
    const division = await db.division.findUnique({ where: { id: divisionId }, select: { id: true } });
    if (!division) return "Divisi tidak ditemukan";
  }
  if (branchIds.length > 0) {
    const found = await db.branch.count({ where: { id: { in: branchIds } } });
    if (found !== branchIds.length) return "Outlet tidak ditemukan";
  }
  return null;
}
```

- [x] **10.4 Tulis ulang `src/app/api/users/route.ts`:**

```ts
import { NextRequest } from "next/server";
import type { Role } from "@prisma/client";
import { hashPassword, requireUserScope } from "@/lib/auth";
import { validateAssignment } from "@/lib/scope";
import { USER_PUBLIC_SELECT, assignmentRefsError, toPublicUser } from "@/lib/users";
import { isUniqueViolation } from "@/lib/db-errors";
import { writeActivityLog } from "@/lib/logger";
import {
  VALID_ROLES,
  errorResponse,
  isSuperAdmin,
  isValidEmail,
  isValidUsername,
  normalizeEmail,
  successResponse,
} from "@/lib/utils";

export const dynamic = "force-dynamic";

// GET /api/users — Daftar pengguna organisasi (SUPER_ADMIN)
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireUserScope(request);
    if (!ctx.ok) return ctx.response;
    const { db, user } = ctx;

    if (!isSuperAdmin(user.role)) {
      return errorResponse("Akses ditolak", "Hanya Super Admin yang dapat melihat daftar pengguna", 403);
    }

    const users = await db.user.findMany({ select: USER_PUBLIC_SELECT, orderBy: { createdAt: "asc" } });
    return successResponse(users.map(toPublicUser), "Daftar pengguna berhasil diambil");
  } catch (error) {
    console.error("Get users error:", error);
    return errorResponse("Terjadi kesalahan server", "Gagal mengambil data pengguna", 500);
  }
}

// POST /api/users — Tambah pengguna (SUPER_ADMIN)
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireUserScope(request);
    if (!ctx.ok) return ctx.response;
    const { db, user } = ctx;

    if (!isSuperAdmin(user.role)) {
      return errorResponse("Akses ditolak", "Hanya Super Admin yang dapat menambah pengguna", 403);
    }

    const body = await request.json();
    const username = String(body.username ?? "").trim().toLowerCase();
    const name = String(body.name ?? "").trim();
    const password = typeof body.password === "string" ? body.password : "";
    const role = body.role;
    const email = normalizeEmail(body.email);

    if (!username || !name || !password || !role) {
      return errorResponse("Username, nama, password, dan peran wajib diisi", "Validasi gagal", 400);
    }
    if (!isValidUsername(username)) {
      return errorResponse(
        "Username hanya boleh huruf kecil, angka, titik, garis bawah, dan tanda hubung (3–32 karakter)",
        "Validasi gagal",
        400
      );
    }
    if (password.length < 6) {
      return errorResponse("Password minimal 6 karakter", "Validasi gagal", 400);
    }
    if (!(VALID_ROLES as readonly string[]).includes(role)) {
      return errorResponse(`Peran tidak valid. Pilihan: ${VALID_ROLES.join(", ")}`, "Validasi gagal", 400);
    }
    if (email && !isValidEmail(email)) {
      return errorResponse("Format email tidak valid", "Validasi gagal", 400);
    }
    if (isSuperAdmin(role) && !email) {
      return errorResponse("Email wajib diisi untuk Super Admin", "Validasi gagal", 400);
    }

    const assignment = validateAssignment(role, body.divisionId, body.branchIds);
    if (!assignment.ok) return errorResponse(assignment.message, "Validasi gagal", 400);

    const refError = await assignmentRefsError(db, assignment.divisionId, assignment.branchIds);
    if (refError) return errorResponse(refError, "Validasi gagal", 400);

    const created = await db.user.create({
      data: {
        organizationId: user.organizationId,
        username,
        name,
        email,
        role: role as Role,
        password: await hashPassword(password),
        divisionId: assignment.divisionId,
        // organizationId UserBranch diwarisi dari User (FK komposit).
        branches: { create: assignment.branchIds.map((branchId) => ({ branchId })) },
      },
      select: USER_PUBLIC_SELECT,
    });

    const result = toPublicUser(created);
    await writeActivityLog(
      ctx,
      "CREATE_USER",
      `Membuat pengguna "${result.username}" (${result.roleLabel}, Outlet: ${result.branches.map((b) => b.name).join(", ") || "Semua outlet"})`,
      request
    );
    return successResponse(result, "Pengguna berhasil ditambahkan", 201);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return errorResponse("Username atau email sudah digunakan", "Validasi gagal", 409);
    }
    console.error("Create user error:", error);
    return errorResponse("Terjadi kesalahan server", "Gagal menambah pengguna", 500);
  }
}
```

- [x] **10.5 Tulis ulang `src/app/api/users/[id]/route.ts`:**

```ts
import { NextRequest } from "next/server";
import type { Role } from "@prisma/client";
import { hashPassword, requireUserScope } from "@/lib/auth";
import { validateAssignment } from "@/lib/scope";
import { USER_PUBLIC_SELECT, assignmentRefsError, toPublicUser } from "@/lib/users";
import { isUniqueViolation } from "@/lib/db-errors";
import { writeActivityLog } from "@/lib/logger";
import {
  VALID_ROLES,
  errorResponse,
  isSuperAdmin,
  isValidEmail,
  isValidUsername,
  normalizeEmail,
  successResponse,
} from "@/lib/utils";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// PUT /api/users/[id] — Ubah pengguna (SUPER_ADMIN)
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const ctx = await requireUserScope(request);
    if (!ctx.ok) return ctx.response;
    const { db, user } = ctx;

    if (!isSuperAdmin(user.role)) {
      return errorResponse("Akses ditolak", "Hanya Super Admin yang dapat mengedit pengguna", 403);
    }

    const { id } = await params;
    const existing = await db.user.findUnique({
      where: { id },
      select: { id: true, role: true, email: true, divisionId: true, branches: { select: { branchId: true } } },
    });
    if (!existing) return errorResponse("Pengguna tidak ditemukan", "Gagal", 404);

    const body = await request.json();

    const finalRole: string = body.role ?? existing.role;
    if (!(VALID_ROLES as readonly string[]).includes(finalRole)) {
      return errorResponse(`Peran tidak valid. Pilihan: ${VALID_ROLES.join(", ")}`, "Validasi gagal", 400);
    }

    let username: string | undefined;
    if (body.username !== undefined) {
      username = String(body.username).trim().toLowerCase();
      if (!isValidUsername(username)) {
        return errorResponse(
          "Username hanya boleh huruf kecil, angka, titik, garis bawah, dan tanda hubung (3–32 karakter)",
          "Validasi gagal",
          400
        );
      }
    }

    const email = body.email === undefined ? existing.email : normalizeEmail(body.email);
    if (email && !isValidEmail(email)) {
      return errorResponse("Format email tidak valid", "Validasi gagal", 400);
    }
    if (isSuperAdmin(finalRole) && !email) {
      return errorResponse("Email wajib diisi untuk Super Admin", "Validasi gagal", 400);
    }

    // Penugasan divalidasi terhadap peran FINAL — menurunkan Super Admin tanpa
    // divisi/outlet akan menghasilkan akun yang langsung terkunci.
    const assignment = validateAssignment(
      finalRole,
      body.divisionId === undefined ? existing.divisionId : body.divisionId,
      body.branchIds === undefined ? existing.branches.map((b) => b.branchId) : body.branchIds
    );
    if (!assignment.ok) return errorResponse(assignment.message, "Validasi gagal", 400);

    const refError = await assignmentRefsError(db, assignment.divisionId, assignment.branchIds);
    if (refError) return errorResponse(refError, "Validasi gagal", 400);

    // Organisasi tidak boleh kehilangan Super Admin terakhirnya — pada mode
    // SaaS tidak ada operator yang dapat memulihkannya.
    if (existing.role === "SUPER_ADMIN" && !isSuperAdmin(finalRole)) {
      const others = await db.user.count({ where: { role: "SUPER_ADMIN", id: { not: id } } });
      if (others === 0) {
        return errorResponse("Organisasi harus memiliki minimal satu Super Admin", "Validasi gagal", 400);
      }
    }

    let hashedPassword: string | undefined;
    if (body.password) {
      if (String(body.password).length < 6) {
        return errorResponse("Password minimal 6 karakter", "Validasi gagal", 400);
      }
      hashedPassword = await hashPassword(String(body.password));
    }

    const updated = await db.user.update({
      where: { id },
      data: {
        ...(body.name && { name: String(body.name).trim() }),
        ...(username && { username }),
        ...(hashedPassword && { password: hashedPassword }),
        email,
        role: finalRole as Role,
        divisionId: assignment.divisionId,
        // Ganti seluruh penugasan outlet dalam satu operasi.
        branches: {
          deleteMany: {},
          create: assignment.branchIds.map((branchId) => ({ branchId })),
        },
      },
      select: USER_PUBLIC_SELECT,
    });

    const result = toPublicUser(updated);
    await writeActivityLog(
      ctx,
      "UPDATE_USER",
      `Memperbarui pengguna "${result.username}" (${result.roleLabel}, Outlet: ${result.branches.map((b) => b.name).join(", ") || "Semua outlet"})`,
      request
    );
    return successResponse(result, "Pengguna berhasil diperbarui");
  } catch (error) {
    if (isUniqueViolation(error)) {
      return errorResponse("Username atau email sudah digunakan", "Validasi gagal", 409);
    }
    console.error("Update user error:", error);
    return errorResponse("Terjadi kesalahan server", "Gagal memperbarui pengguna", 500);
  }
}

// DELETE /api/users/[id] — Hapus pengguna (SUPER_ADMIN, bukan diri sendiri)
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const ctx = await requireUserScope(request);
    if (!ctx.ok) return ctx.response;
    const { db, user } = ctx;

    if (!isSuperAdmin(user.role)) {
      return errorResponse("Akses ditolak", "Hanya Super Admin yang dapat menghapus pengguna", 403);
    }

    const { id } = await params;
    if (id === user.id) {
      return errorResponse("Tidak dapat menghapus akun Anda sendiri", "Validasi gagal", 400);
    }

    const existing = await db.user.findUnique({ where: { id }, select: { username: true } });
    if (!existing) return errorResponse("Pengguna tidak ditemukan", "Gagal", 404);

    await db.user.delete({ where: { id } });
    await writeActivityLog(ctx, "DELETE_USER", `Menghapus pengguna "${existing.username}" (ID: ${id})`, request);
    return successResponse(null, "Pengguna berhasil dihapus");
  } catch (error) {
    console.error("Delete user error:", error);
    return errorResponse("Terjadi kesalahan server", "Gagal menghapus pengguna", 500);
  }
}
```

- [x] **10.6 Jalankan suite sampai hijau:** `QA_ONLY=users npm run qa` → USR-01, USR-02, USR-04 PASS.

- [x] **10.7 Cek tipe & commit:**
  ```bash
  npx tsc --noEmit 2>&1 | grep -E "src/lib/users\.ts|src/app/api/users"
  git add src/lib/users.ts src/app/api/users qa/suites/users.ts
  git commit -m "feat(api): pengguna dengan divisi, multi-outlet, dan email" -m "Penugasan divalidasi terhadap peran final dan organisasi pengguna; Super Admin terakhir tidak dapat diturunkan." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

---

## Task 11: API Transfer

**Berkas:** `src/app/api/assets/[id]/transfer/route.ts`, `src/app/api/transfers/route.ts`, `src/app/api/transfers/[id]/{approve,reject}/route.ts`, `qa/suites/transfers.ts`.

- [x] **11.1 Isi `qa/suites/transfers.ts`:** pindahkan **RBAC-03** (`IT_SUPPORT` → `STAFF_IT`), **MUT-01**, **MUT-02**, **TRF-01**, **TRF-02**. *(Catatan eksekusi: MUT-01 lama memindahkan `asset-ups-bandung` ke Bogor tanpa mengembalikannya sehingga suite hanya lulus sekali per seed — ditambahkan blok `finally` yang memutasi aset kembali ke Bandung.)* Tambahkan:

```ts
  await runTest("TRF-05", "Admin pemegang outlet asal & tujuan dapat menyetujui mutasinya", async () => {
    const move = async (from: string, to: string) => {
      const req = await safeJson(
        await fetch(`${BASE_URL}/api/assets/asset-ac-bogor/transfer`, {
          method: "POST",
          headers: jsonHeaders("ADMIN_ENGINEERING"),
          body: JSON.stringify({ toBranchId: to, reason: `QA ${from} → ${to}` }),
        })
      );
      const approve = await fetch(`${BASE_URL}/api/transfers/${req?.data?.id}/approve`, { method: "POST", headers: headersFor("ADMIN_ENGINEERING") });
      return approve.status;
    };
    const approved = await move("branch-bogor", "branch-jakarta");
    const moved = await safeJson(await fetch(`${BASE_URL}/api/assets/asset-ac-bogor`, { headers: headersFor("ADMIN_ENGINEERING") }));
    const restored = await move("branch-jakarta", "branch-bogor"); // kembalikan untuk run berikutnya
    const passed = approved === 200 && moved?.data?.branchId === "branch-jakarta" && restored === 200;
    return { passed, notes: `approve=${approved} branch=${moved?.data?.branchId} restore=${restored}` };
  });

  await runTest("ORG-04", "Tujuan transfer milik organisasi lain ditolak 400", async () => {
    const res = await fetch(`${BASE_URL}/api/assets/asset-laptop-dell-bogor/transfer`, {
      method: "POST",
      headers: jsonHeaders("ADMIN_IT"),
      body: JSON.stringify({ toBranchId: "branch-b1", reason: "QA lintas organisasi" }),
    });
    return { passed: res.status === 400, notes: `status=${res.status}` };
  });

  await runTest("ORG-05a", "Persetujuan transfer organisasi lain: 404 dan data tidak berubah", async () => {
    const approve = await fetch(`${BASE_URL}/api/transfers/transfer-b-001/approve`, { method: "POST", headers: headersFor("SUPER_ADMIN") });
    const reject = await fetch(`${BASE_URL}/api/transfers/transfer-b-001/reject`, { method: "POST", headers: headersFor("SUPER_ADMIN") });
    const list = await safeJson(await fetch(`${BASE_URL}/api/transfers?status=PENDING`, { headers: headersFor("B_SUPER_ADMIN") }));
    const stillPending = (list?.data?.transfers ?? []).some((t: { id: string }) => t.id === "transfer-b-001");
    const passed = approve.status === 404 && reject.status === 404 && stillPending;
    return { passed, notes: `approve=${approve.status} reject=${reject.status} masih PENDING=${stillPending}` };
  });
```

- [x] **11.2 Jalankan dan pastikan gagal:** `QA_ONLY=transfers npm run qa`.

- [x] **11.3 Terapkan resep di keempat route, lalu:**
  - `assets/[id]/transfer`: `select` aset `{ id, branchId, name, status, divisionId }`; cabang tujuan lewat `db.branch.findUnique` (ID organisasi lain → `null` → 400 "Cabang tujuan tidak ditemukan"); `create` menambah `organizationId: user.organizationId`, `requestedById: user.id`.
  - `transfers` (GET): `include.asset` → `{ select: { id: true, name: true, divisionId: true, division: { select: { name: true } }, category: { select: { name: true } } } }`.
  - `transfers/[id]/approve` & `reject`: impor `divisionAccessError` dari `@/lib/scope`; `include.asset` pilih `{ id, name, divisionId }`; ganti blok cek inventaris dengan:
```ts
    const divisionDenied = divisionAccessError(scope, transfer.asset.divisionId);
    if (divisionDenied) return errorResponse(divisionDenied.error, divisionDenied.message, 403);
```
    `approvedById: user.id` di `updateMany`. Pemeriksaan `canApproveTransfer` dan guard atomik tetap.

- [x] **11.4 Jalankan suite sampai hijau**, cek tipe (`grep -E "src/app/api/(transfers|assets/\[id\]/transfer)"`), commit:
  ```bash
  git add src/app/api/transfers "src/app/api/assets/[id]/transfer" qa/suites/transfers.ts
  git commit -m "feat(api): transfer dengan cakupan divisi & multi-outlet" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

---

## Task 12: API BAP

**Berkas:** `src/app/api/assets/[id]/bap/route.ts`, `.../bap/approve/route.ts`, `.../bap/reject/route.ts`, `qa/suites/bap.ts`.

- [x] **12.1 Isi `qa/suites/bap.ts`:** pindahkan **RBAC-02** (`STAFF_IT`), **BAP-01**, **BAP-02**, **BAP-03**, **BAP-04**, **FILE-01**, **FILE-02** (fixture memakai `fixtures.image`, `fixtures.smallPdf`, `fixtures.largePdf` dari `../context`). *(Catatan eksekusi: agar suite dapat diulang tanpa seed ulang — BAP-01/02 dan FILE-02 kini memakai aset uji unit tunggal yang dibuat setiap run lalu dihapus, bukan menghabiskan `asset-printer-hp-bogor`; FILE-01 menolak kembali BAP PDF kecil yang dibuatnya agar laptop Dell tidak tertinggal `BAP_PENDING`; helper `readAsset` & `invariantHolds` dipindah ke `qa/context.ts` karena dipakai juga oleh suite insiden.)* Tambahkan:

```ts
  await runTest("ORG-05b", "Persetujuan BAP organisasi lain: 404 dan reservasi tetap", async () => {
    const approve = await fetch(`${BASE_URL}/api/assets/asset-b-laptop/bap/approve`, { method: "POST", headers: headersFor("SUPER_ADMIN") });
    const reject = await fetch(`${BASE_URL}/api/assets/asset-b-laptop/bap/reject`, { method: "POST", headers: headersFor("SUPER_ADMIN") });
    const asset = await safeJson(await fetch(`${BASE_URL}/api/assets/asset-b-laptop`, { headers: headersFor("B_SUPER_ADMIN") }));
    const passed =
      approve.status === 404 && reject.status === 404 &&
      asset?.data?.reservedQty === 1 && asset?.data?.baps?.[0]?.status === "PENDING";
    return { passed, notes: `approve=${approve.status} reject=${reject.status} reserved=${asset?.data?.reservedQty} bap=${asset?.data?.baps?.[0]?.status}` };
  });
```

- [x] **12.2 Jalankan dan pastikan gagal:** `QA_ONLY=bap npm run qa`.

- [x] **12.3 Terapkan resep di ketiga route**, lalu: `select` aset `inventory` → `divisionId`; `tx.bap.create` menambah `organizationId: user.organizationId`, `requestedById: user.id`; `approvedById: user.id` di `updateMany`. Urutan guard (akses sebelum validasi stok) dan guard atomik tetap.

- [x] **12.4 Jalankan suite sampai hijau**, cek tipe (`grep -E "src/app/api/assets/\[id\]/bap"`), commit:
  ```bash
  git add "src/app/api/assets/[id]/bap" qa/suites/bap.ts
  git commit -m "feat(api): BAP dengan cakupan organisasi & divisi" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

---

## Task 13: API Insiden, Laporan, Activity Log

**Berkas:** `src/app/api/incidents/route.ts`, `src/app/api/incidents/[id]/route.ts`, `src/app/api/reports/{summary,monthly,warranty}/route.ts`, `src/app/api/activity-logs/route.ts`, `qa/suites/incidents.ts`, `qa/suites/activity.ts`.

- [x] **13.1 Isi suite:**
  - `qa/suites/incidents.ts`: pindahkan **INC-01**, **INC-02** (`STAFF_IT`), **BR-05**, **STOCK-01**, **STOCK-02**, **STOCK-03**, serta pembersihan `stockIncidentId` dari blok "Clean up" runner lama ke akhir `run()`.
  - `qa/suites/activity.ts`: pindahkan **ACT-01..04** dan **RBAC-04**.
  - *(Catatan eksekusi: INC-01 kini mengembalikan `asset-cctv-bogor` ke `ACTIVE` di blok `finally` agar transisi ACTIVE → BROKEN tetap teruji pada run berikutnya. Ditambahkan **ORG-07** — log aktivitas Super Admin tidak memuat log organisasi lain; tes ini gagal pada route lama yang memakai client Prisma mentah, membuktikan kebocoran nyata sebelum migrasi.)*

- [x] **13.2 Jalankan dan pastikan gagal:** `QA_ONLY=incidents,activity npm run qa`.

- [x] **13.3 Terapkan resep, lalu:**
  - `incidents` (GET/POST) dan `incidents/[id]`: `include.asset.select` ganti `type`/`inventory` dengan `divisionId: true, category: { select: { name: true } }, division: { select: { name: true } }`; `getIncidentWithAccess(db, id, scope)` menerima `db`; `create` menambah `organizationId: user.organizationId`; `isAdminRole(user.role)`.
  - `reports/summary`: ganti `groupBy` per `type` dengan:
```ts
      db.asset.groupBy({ by: ["categoryId"], where: activeAssetFilter, _count: { id: true }, orderBy: { _count: { id: "desc" } } }),
      db.asset.groupBy({ by: ["divisionId"], where: activeAssetFilter, _count: { id: true } }),
```
    lalu muat nama:
```ts
    const [categoryNames, divisionNames] = await Promise.all([
      db.category.findMany({ where: { id: { in: assetsByCategory.map((g) => g.categoryId) } }, select: { id: true, name: true } }),
      db.division.findMany({ where: { id: { in: assetsByDivision.map((g) => g.divisionId) } }, select: { id: true, name: true } }),
    ]);
    const nameOf = (rows: { id: string; name: string }[], id: string) => rows.find((r) => r.id === id)?.name ?? id;
```
    Respons: `assetsByCategory: [{ categoryId, name, count }]`, `assetsByDivision: [{ divisionId, name, count }]` (menggantikan `assetsByType`). Filter cabang: `scope.branchIds ? { id: { in: scope.branchIds } } : undefined`.
  - `reports/warranty`: `include` tambahkan `category: { select: { name: true } }`, `division: { select: { name: true } }`.
  - `activity-logs` (GET): ganti `getAuthUser` + raw prisma dengan `requireUserScope`; tolak `user.role !== "SUPER_ADMIN"` → 403 `"Akses ditolak"`; query lewat `db.activityLog`. Handler 405 tetap.

- [x] **13.4 Jalankan suite sampai hijau**, cek tipe (`grep -E "src/app/api/(incidents|reports|activity-logs)"`), commit:
  ```bash
  git add src/app/api/incidents src/app/api/reports src/app/api/activity-logs qa/suites/incidents.ts qa/suites/activity.ts
  git commit -m "feat(api): insiden, laporan per divisi/kategori, activity log per organisasi" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

---

## Task 14: Nonaktifkan MDM

**Berkas:** `src/lib/mdm.ts` (baru), `src/app/api/mdm/enroll/route.ts`, `src/app/api/mdm/check-in/route.ts`, `src/app/api/assets/[id]/mdm/route.ts`, `src/app/api/assets/[id]/mdm/command/route.ts`, `qa/suites/mdm.ts`.

- [x] **14.1 Isi `qa/suites/mdm.ts`:**

```ts
import { BASE_URL, headersFor, jsonHeaders, runTest } from "../context";

export async function run() {
  await runTest("MDM-01", "Seluruh route MDM dinonaktifkan (404)", async () => {
    const statuses = [
      (await fetch(`${BASE_URL}/api/mdm/enroll`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status,
      (await fetch(`${BASE_URL}/api/mdm/check-in`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status,
      (await fetch(`${BASE_URL}/api/assets/asset-laptop-dell-bogor/mdm`, { headers: headersFor("SUPER_ADMIN") })).status,
      (await fetch(`${BASE_URL}/api/assets/asset-laptop-dell-bogor/mdm/command`, { method: "POST", headers: jsonHeaders("SUPER_ADMIN"), body: JSON.stringify({ commandType: "LOCK" }) })).status,
    ];
    return { passed: statuses.every((s) => s === 404), notes: `status: ${statuses.join(", ")}` };
  });
}
```

- [x] **14.2 `src/lib/mdm.ts`:**

```ts
import { errorResponse } from "./utils";

/**
 * MDM dinonaktifkan pada Fase 1: token aktivasi global tidak aman untuk
 * multi-tenant (perangkat organisasi A bisa terdaftar ke aset organisasi B).
 * Desain ulang (aktivasi & token per divisi, agent) dijadwalkan terpisah —
 * lihat docs/superpowers/specs/2026-09-29-fase1-multi-tenant-divisi-dinamis-design.md §10.
 * Kode lama tersedia di riwayat git sebagai referensi.
 */
export function mdmDisabledResponse(): Response {
  return errorResponse("Not Found", "Fitur MDM dinonaktifkan sementara", 404);
}
```

- [x] **14.3 Ganti keempat route** dengan stub (sesuaikan metode: `POST` untuk enroll, check-in, command; `GET` untuk `assets/[id]/mdm`):

```ts
import { mdmDisabledResponse } from "@/lib/mdm";

export const dynamic = "force-dynamic";

// Fitur MDM dinonaktifkan selama Fase 1 — lihat src/lib/mdm.ts.
export async function POST() {
  return mdmDisabledResponse();
}
```

- [x] **14.4 Jalankan suite sampai hijau** (`QA_ONLY=mdm npm run qa`), cek tipe (`grep -E "mdm"`), commit:
  ```bash
  git add src/lib/mdm.ts src/app/api/mdm "src/app/api/assets/[id]/mdm" qa/suites/mdm.ts
  git commit -m "chore(mdm): nonaktifkan route MDM sampai desain ulang multi-tenant" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

---

## Task 15: Shell Aplikasi (AppLayoutClient, Sidebar, Header)

**Berkas:** `src/components/AppLayoutClient.tsx`, `src/components/Sidebar.tsx`, `src/components/Header.tsx`.

> **Catatan eksekusi (2026-09-29): dikerjakan lebih awal, setelah Task 7.** Selama layout masih mengimpor ekspor yang sudah dihapus, setiap request ke route yang belum ada (mis. saat tes "gagal dulu" di Task 7) merender halaman 404 lewat layout itu, lalu Turbopack menyajikan galat kompilasinya ke semua request, termasuk route API. Task ini tidak bergantung pada task API lain, jadi dimajukan agar migrasi API berikutnya tidak perlu restart server berulang. Terverifikasi: `/login` dan halaman 404 dirender tanpa mengganggu route API.

- [x] **15.1 `AppLayoutClient.tsx`** — `AuthenticatedLayout` memakai `SessionUserView` (dari `@/lib/utils`) dan menolak akun tanpa penugasan di semua halaman:

```tsx
"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Sidebar from "./Sidebar";
import Header from "./Header";
import type { SessionUserView } from "@/lib/utils";

// Akun yang penugasannya dicabut setelah login: data tetap ditolak API (403),
// shell ini hanya memastikan pengguna melihat alasannya dan dapat keluar.
function UnassignedNotice() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="animate-fade-in flex items-center justify-center py-20">
      <div className="max-w-md w-full bg-white border border-slate-200/80 rounded-2xl shadow-sm p-8 text-center">
        <div className="text-5xl mb-3">🔒</div>
        <h1 className="text-xl font-bold text-slate-900">Akses Ditolak</h1>
        <p className="text-sm text-slate-500 mt-2 leading-relaxed">
          Akun Anda belum ditugaskan ke divisi dan outlet. Hubungi Super Admin.
        </p>
        <button
          onClick={logout}
          disabled={loading}
          className="mt-6 inline-flex items-center gap-2 bg-indigo-600 text-white font-semibold px-4 py-2.5 rounded-xl text-sm hover:bg-indigo-700 active:scale-[0.98] transition-all duration-200 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
          Keluar
        </button>
      </div>
    </div>
  );
}

function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";
  const [user, setUser] = useState<SessionUserView | null>(null);

  useEffect(() => {
    if (isLoginPage) return;
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((result) => {
        if (result?.success) setUser(result.data);
      })
      .catch((error) => console.error("Gagal mengambil data user:", error));
  }, [isLoginPage, pathname]);

  if (isLoginPage) {
    return <div className="min-h-screen w-full">{children}</div>;
  }

  return (
    <div className="app-container">
      <Sidebar user={user} />
      <div className="main-content-wrapper">
        <Header user={user} />
        <main className="main-content">{user?.access === "unassigned" ? <UnassignedNotice /> : children}</main>
      </div>
    </div>
  );
}

// `AppLayoutClient` (pembungkus mounted/SSR) tetap seperti sebelumnya.
```

- [x] **15.2 `Sidebar.tsx`** — props menjadi `{ user: SessionUserView | null }`; hapus `getInventoryForRole`; impor `divisionScopeLabel` dan tipe `SessionUserView` dari `@/lib/utils`:

```tsx
const SUPER_ADMIN_NAV_ITEMS: NavItem[] = [
  { label: "Divisi & Kategori", href: "/divisions", icon: "🗂️" },
  { label: "Pengguna", href: "/users", icon: "👤" },
  { label: "Log Aktivitas", href: "/activity-logs", icon: "📜" },
];

const DIVISION_ADMIN_NAV_ITEMS: NavItem[] = [
  { label: "Kategori", href: "/divisions", icon: "🗂️" },
];

// di dalam komponen:
  const adminItems =
    user?.role === "SUPER_ADMIN" ? SUPER_ADMIN_NAV_ITEMS
    : user?.role === "DIVISION_ADMIN" ? DIVISION_ADMIN_NAV_ITEMS
    : [];

  // Cakupan selalu terlihat agar angka antar divisi/outlet tidak tertukar.
  const branchLabel = !user
    ? ""
    : user.role === "SUPER_ADMIN"
      ? "Semua Outlet"
      : user.branches.length === 1
        ? user.branches[0].name
        : `${user.branches.length} outlet`;
  const scopeLine = user ? `${divisionScopeLabel(user)} · ${branchLabel}` : "";
```
  Di header sidebar: judul aplikasi lama tetap (branding Fase 3); ganti isi `sidebar-subtitle` dengan dua baris — `{user?.organization.name}` lalu `{scopeLine}` (baris kedua `text-[11px] text-slate-400`). Footer: `{user?.organization.name}` menggantikan nama perusahaan lama yang tertanam. Bagian admin di nav memakai `adminItems`.

- [x] **15.3 `Header.tsx`** — props `user: SessionUserView | null`; ganti `ROLE_LABELS[user.role]` dengan `user.roleLabel`; lencana outlet:
```tsx
  const branchBadge = !user
    ? ""
    : user.role === "SUPER_ADMIN"
      ? "Semua Outlet"
      : user.branches.map((b) => b.name).join(", ");
```
  (warna lencana: ungu untuk SUPER_ADMIN, indigo untuk lainnya — sama seperti sebelumnya.)

- [x] **15.4 Cek tipe & commit:**
  ```bash
  npx tsc --noEmit 2>&1 | grep -E "src/components/(AppLayoutClient|Sidebar|Header)"
  git add src/components/AppLayoutClient.tsx src/components/Sidebar.tsx src/components/Header.tsx
  git commit -m "feat(ui): shell aplikasi menampilkan organisasi, divisi, dan outlet pengguna" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

---

## Task 16: Halaman Server

**Berkas:** `src/app/page.tsx`, `src/app/assets/page.tsx`, `src/app/assets/[id]/page.tsx`, `src/app/assets/[id]/AssetDetailClient.tsx`, `src/app/assets/[id]/edit/page.tsx`, `src/app/assets/[id]/edit/EditAssetForm.tsx`, `src/app/branches/[id]/page.tsx`, `src/app/transfers/page.tsx`.

**Resep halaman server:** ganti `getCurrentUser()` + `resolveScope()` dengan
```tsx
  const ctx = await getPageContext();
  if (!ctx) {
    return <AccessDenied message={UNASSIGNED_MESSAGE} backHref="/login" backLabel="Kembali ke Halaman Masuk" />;
  }
  const { db, scope, user } = ctx;
```
lalu `prisma.` → `db.`, hapus impor `@/lib/prisma`, dan ganti label `ASSET_TYPE_LABELS[asset.type]` dengan `asset.category.name` (sertakan `category: { select: { name: true } }` pada query). Label cakupan memakai `divisionScopeLabel(user)` dan `branchScopeLabel(user)` dari `@/lib/utils`.

- [x] **16.1 Dashboard `src/app/page.tsx`:**
  - Resep; hitungan cabang: `db.branch.count({ where: scope.branchIds ? { id: { in: scope.branchIds } } : undefined })`.
  - Hapus `isKitchen`/`inventoryLabel`/`inventoryIcon`; subtitle: `` `Status real-time operasional aset ${divisionScopeLabel(user)} di ${branchScopeLabel(user)}.` ``; lencana "Inventaris: …" → "Divisi: {divisionScopeLabel(user)}", lencana outlet memakai daftar outlet.
  - Query `expiringAssets` & `brokenAssetsPending` tambahkan `category: { select: { name: true } }`.
  - **Baru — ringkasan per divisi untuk SUPER_ADMIN** (`scope.divisionId === null`):
```tsx
  const divisionBreakdown = scope.divisionId
    ? []
    : await db.asset.groupBy({
        by: ["divisionId"],
        where: assetScopeWhere(scope),
        _count: { id: true },
        _sum: { activeQty: true, brokenQty: true, repairQty: true },
      });
  const divisionNames = await db.division.findMany({ select: { id: true, name: true } });
```
    Render kartu "Ringkasan per Divisi" (tabel: Divisi, Item, Aktif pcs, Rusak pcs, Perbaikan pcs) di bawah grid statistik, hanya bila `divisionBreakdown.length > 0`. Gaya mengikuti kartu yang ada (`bg-white border border-slate-200 rounded-xl p-5 shadow-xs`, tabel dibungkus `overflow-x-auto`).

- [x] **16.2 Daftar aset `src/app/assets/page.tsx`:**
  - `SearchParams`: hapus `type`, `inventory`; tambah `divisionId`, `categoryId`.
  - `AssetListContent` menerima `ctx: RequestContext` (impor tipe dari `@/lib/auth`) menggantikan `scope`/`isKitchen`.
  - Pembentukan `where`: sama seperti GET `/api/assets` (Task 8.3) memakai `effectiveDivisionFilter`, `effectiveBranchFilter`, `categoryId`.
  - Data pendukung filter:
```tsx
    db.branch.findMany({
      where: scope.branchIds ? { id: { in: scope.branchIds } } : undefined,
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.division.findMany({
      where: scope.divisionId ? { id: scope.divisionId } : undefined,
      orderBy: { name: "asc" },
      select: { id: true, name: true, categories: { orderBy: { name: "asc" }, select: { id: true, name: true } } },
    }),
```
```tsx
  const divisionFilter = effectiveDivisionFilter(scope, searchParams.divisionId);
  const categoryOptions = divisionFilter
    ? divisions.find((d) => d.id === divisionFilter)?.categories ?? []
    : divisions.flatMap((d) => d.categories.map((c) => ({ id: c.id, name: `${c.name} (${d.name})` })));
```
  - Filter bar: select **Divisi** (`name="divisionId"`, hanya bila `!scope.divisionId`); select **Kategori** (`name="categoryId"`, opsi `categoryOptions`); **Cabang**: label mati bila `scope.branchIds?.length === 1`, selain itu select (opsi pertama "Semua Cabang" untuk SUPER_ADMIN / "Semua Outlet Saya" untuk pemegang beberapa outlet).
  - Kolom tabel "Tipe" → "Kategori": `{asset.category.name}`; untuk SUPER_ADMIN tambahkan baris kecil `{asset.division.name}` (`text-xs text-slate-400`). Query aset `include` tambahkan `division` & `category`.
  - Judul: `scope.divisionId ? \`Daftar Aset ${user.division?.name}\` : "Daftar Semua Aset"`; subtitle memakai `branchScopeLabel(user)`. Ikon kosong "📦".

- [x] **16.3 Detail aset `src/app/assets/[id]/page.tsx` + `AssetDetailClient.tsx`:**
  - Page: resep; `db.asset.findUnique` dengan `include` tambahan `division: { select: { name: true } }`, `category: { select: { name: true } }`; `!asset → notFound()` (termasuk aset organisasi lain); pesan `AccessDenied` untuk `"Unauthorized cross-division access detected."` → "Aset ini berada di luar cakupan divisi Anda."; cabang tujuan transfer `db.branch.findMany(...)`; kirim `categoryName: asset.category.name`, `divisionName: asset.division.name` (menggantikan `type`).
  - Client: interface `Asset` ganti `type` dengan `categoryName`, `divisionName`; `InfoRow` "Tipe" → dua baris "Divisi" & "Kategori"; `isAdmin` → `isAdminRole(userRole)` (impor dari `@/lib/utils`, hapus daftar peran yang ditulis manual).

- [x] **16.4 Edit aset `src/app/assets/[id]/edit/page.tsx` + `EditAssetForm.tsx`:**
  - Page: resep (ctx `null` → AccessDenied); staf tetap melihat panel "Akses Ditolak"; `db.asset.findUnique({ where: { id }, include: { division: { select: { name: true } } } })`; guard `assetAccessError`; kunci BAP tetap; muat
```tsx
  const [branches, categories] = await Promise.all([
    db.branch.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.category.findMany({ where: { divisionId: asset.divisionId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
```
    dan kirim `categories`, `divisionName={asset.division.name}` ke form.
  - Form: hapus `inventory`, `getAssetTypeOptions`, state `type`; tambah state `categoryId` (awal `asset.categoryId`); select **Kategori** dari prop `categories`; tampilkan **Divisi** sebagai label mati; payload PUT mengirim `categoryId`.

- [x] **16.5 Detail cabang `src/app/branches/[id]/page.tsx`:** resep; `scope.branchIds && !scope.branchIds.includes(id)` → AccessDenied cross-branch; query aset `select` ganti `type`/`inventory` dengan `category: { select: { name: true } }`, `division: { select: { name: true } }`; `!branch → notFound()`.

- [x] **16.6 Transfer `src/app/transfers/page.tsx`:** resep; `TransfersContent` menerima `ctx`; `include.asset` → `{ select: { id: true, name: true, category: { select: { name: true } }, division: { select: { name: true } } } }`; label `divisionText`/`isKitchen` diganti `divisionScopeLabel(user)` dan nama perusahaan lama diganti `branchScopeLabel(user)`.

- [x] **16.7 Cek tipe & uji manual** (server dev, login sebagai `superadmin`, `admin_it`, `teknisi_engineering`): dashboard, `/assets` (filter divisi/kategori/outlet), detail & edit aset, `/branches/branch-bogor`, `/transfers` tampil tanpa error; `admin_it` membuka `/assets/asset-chiller-bogor` → "Akses Ditolak"; `superadmin` demo membuka `/assets/asset-b-laptop` → halaman 404.
  ```bash
  npx tsc --noEmit 2>&1 | grep -E "src/app/(page|assets/page|assets/\[id\]|branches/\[id\]|transfers/page)"
  ```

- [x] **16.8 Commit:**
  ```bash
  git add src/app/page.tsx src/app/assets/page.tsx "src/app/assets/[id]" "src/app/branches/[id]/page.tsx" src/app/transfers/page.tsx
  git commit -m "feat(ui): halaman server memakai konteks request dan divisi/kategori dinamis" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

---

## Task 17: Halaman Klien

**Berkas:** `src/app/assets/new/page.tsx`, `src/app/users/page.tsx`, `src/app/incidents/page.tsx`, `src/app/reports/page.tsx`, `src/app/branches/page.tsx`.

- [x] **17.1 Tambah aset `src/app/assets/new/page.tsx`:**
  - Muat `Promise.all([fetch("/api/auth/me"), fetch("/api/divisions"), fetch("/api/branches")])`; simpan `me: SessionUserView`, `divisions` (`{ id, name, categories }[]`), `branches`.
  - Nilai awal: `divisionId = me.division?.id ?? ""`, `branchId = branches.length === 1 ? branches[0].id : ""`.
  - `isAdmin = isAdminRole(me?.role)` (hapus daftar peran manual); staf tetap melihat panel "Akses Ditolak".
  - SUPER_ADMIN: select **Divisi** (mengganti divisi mengosongkan `categoryId`). Admin divisi: label mati nama divisinya.
  - Select **Kategori** dari `divisions.find((d) => d.id === form.divisionId)?.categories`; bila kosong tampilkan pesan "Divisi ini belum memiliki kategori." + tautan ke `/divisions`.
  - **Outlet:** label mati bila `branches.length === 1` dan bukan SUPER_ADMIN; selain itu select dari `branches` (`/api/branches` sudah dibatasi cakupan).
  - Payload: hapus `type`/`inventory`; kirim `categoryId`, `branchId`, dan `divisionId` (hanya SUPER_ADMIN).
  - Judul: `` `Tambah Aset ${selectedDivision?.name ?? ""}` ``; placeholder netral ("Contoh: Laptop Dell Latitude 3420 / Chiller GEA 1200L").

- [x] **17.2 Pengguna `src/app/users/page.tsx`:**
  - Interface `User` mengikuti `toPublicUser` (`email`, `roleLabel`, `division`, `branches[]`); muat `/api/divisions` dan `/api/branches?all=1`.
  - Form tambah & edit: `role` default `DIVISION_STAFF`, opsi dari `ROLE_TIER_LABELS`; field **Email** (wajib bila Super Admin); bila bukan Super Admin: select **Divisi** dan daftar **checkbox Outlet** (minimal satu; tampilkan galat merah kecil bila kosong).
  - Payload: `{ name, username, email, password, role, divisionId, branchIds }`.
  - Tabel: kolom Peran memakai `user.roleLabel`; kolom Outlet menampilkan chip per outlet (Super Admin: "Semua outlet"); tambah kolom Email.
  - Kartu statistik: "Admin" = `SUPER_ADMIN` + `DIVISION_ADMIN`; "Staf" = `DIVISION_STAFF` (hapus daftar peran lama); hapus `ROLE_COLORS` per peran lama → warna per tingkat (ungu/indigo/biru).

- [x] **17.3 Insiden `src/app/incidents/page.tsx`:** interface `asset.type` → `asset.category: { name: string }`; label daftar & pemilih aset memakai `category.name`; `getInventoryForRole(userRole)` diganti nama divisi dari `/api/auth/me` (`me.division?.name ?? "semua divisi"`); `isAdminRole` tetap.

- [x] **17.4 Laporan `src/app/reports/page.tsx`:** `assetsByType` → `assetsByCategory` (tampilkan `item.name`); tambah blok "Aset per Divisi" bila `assetsByDivision.length > 1`; tabel garansi memakai `a.category?.name`; hapus impor `ASSET_TYPE_LABELS`.

- [x] **17.5 Cabang `src/app/branches/page.tsx`:** nama perusahaan lama → "organisasi Anda"; pesan galat hapus menampilkan `data.error` (sudah) — pastikan pesan 409 terbaca utuh.

- [x] **17.6 Cek tipe & uji manual:** tambah aset sebagai `superadmin` (pilih divisi Engineering → kategori AC) dan `admin_kitchen`; buat pengguna staf dua outlet; halaman insiden & laporan tampil.
  ```bash
  npx tsc --noEmit 2>&1 | grep -E "src/app/(assets/new|users|incidents|reports|branches/page)"
  ```

  > **Catatan eksekusi:** uji manual dijalankan lewat skrip HTTP (20 pemeriksaan: aset SA Engineering/AC & admin_kitchen, kategori divisi lain ditolak, staf dua outlet, naik/turun Super Admin, ringkasan laporan, kompilasi 5 halaman) dan pemeriksaan visual di browser. Tambahan di luar rencana: (1) nama kategori hanya unik per divisi, sehingga `assetsByCategory` di `/api/reports/summary` kini ikut mengirim `divisionName` dan ubin kategori menampilkannya untuk Super Admin (dua ubin "Lain-lain" sebelumnya tidak dapat dibedakan); (2) tabel Pengguna memakai padding ringkas + `whitespace-nowrap` dan kolom "Terdaftar" disembunyikan di bawah `2xl` agar kolom Aksi tidak terpotong pada layar 1280px; (3) metadata `src/app/layout.tsx` tidak lagi menyebut "Aset IT"/nama perusahaan lama (nama aplikasi tetap sampai Fase 3).

- [x] **17.7 Commit:**
  ```bash
  git add src/app/assets/new src/app/users src/app/incidents src/app/reports src/app/branches/page.tsx
  git commit -m "feat(ui): form aset & pengguna dengan divisi, kategori, dan multi-outlet" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

---

## Task 18: Halaman Divisi & Kategori

**Berkas:** `src/app/divisions/page.tsx` (baru).

- [x] **18.1 Tulis `src/app/divisions/page.tsx`:**

```tsx
"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import AccessDenied from "@/components/AccessDenied";
import type { SessionUserView } from "@/lib/utils";

interface CategoryRow {
  id: string;
  name: string;
  _count: { assets: number };
}

interface DivisionRow {
  id: string;
  name: string;
  description: string | null;
  categories: CategoryRow[];
  _count: { assets: number; users?: number };
}

type Modal =
  | { kind: "division"; division: DivisionRow | null } // null = tambah
  | { kind: "category"; divisionId: string; category: CategoryRow | null }
  | { kind: "delete-division"; division: DivisionRow }
  | { kind: "delete-category"; category: CategoryRow }
  | null;

const inputClass =
  "w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-200 ease-in-out";
const labelClass = "block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5";

export default function DivisionsPage() {
  const [me, setMe] = useState<SessionUserView | null>(null);
  const [divisions, setDivisions] = useState<DivisionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<Modal>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [meRes, divRes] = await Promise.all([
        fetch("/api/auth/me").then((r) => r.json()),
        fetch("/api/divisions").then((r) => r.json()),
      ]);
      if (meRes.success) setMe(meRes.data);
      if (divRes.success) setDivisions(divRes.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const isSuperAdmin = me?.role === "SUPER_ADMIN";
  const canManage = isSuperAdmin || me?.role === "DIVISION_ADMIN";

  function open(next: Modal) {
    setModal(next);
    setError(null);
    setName(
      next?.kind === "division" ? next.division?.name ?? ""
      : next?.kind === "category" ? next.category?.name ?? ""
      : ""
    );
    setDescription(next?.kind === "division" ? next.division?.description ?? "" : "");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!modal) return;

    let url = "";
    let method = "POST";
    let body: object | undefined;
    switch (modal.kind) {
      case "division":
        url = modal.division ? `/api/divisions/${modal.division.id}` : "/api/divisions";
        method = modal.division ? "PUT" : "POST";
        body = { name, description };
        break;
      case "category":
        url = modal.category ? `/api/categories/${modal.category.id}` : `/api/divisions/${modal.divisionId}/categories`;
        method = modal.category ? "PUT" : "POST";
        body = { name };
        break;
      case "delete-division":
        url = `/api/divisions/${modal.division.id}`;
        method = "DELETE";
        break;
      case "delete-category":
        url = `/api/categories/${modal.category.id}`;
        method = "DELETE";
        break;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Gagal menyimpan perubahan.");
        return;
      }
      setModal(null);
      await load();
    } catch {
      setError("Terjadi kesalahan jaringan.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!canManage) {
    return <AccessDenied message="Hanya Super Admin dan Admin Divisi yang dapat mengelola kategori." />;
  }

  const isDelete = modal?.kind === "delete-division" || modal?.kind === "delete-category";

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
            {isSuperAdmin ? "Divisi & Kategori" : `Kategori ${me?.division?.name ?? ""}`}
          </h1>
          <p className="text-slate-500 mt-1">
            {isSuperAdmin
              ? "Atur divisi organisasi Anda dan kategori aset di setiap divisi."
              : "Atur kategori aset di divisi Anda."}
          </p>
        </div>
        {isSuperAdmin && (
          <button
            onClick={() => open({ kind: "division", division: null })}
            className="bg-indigo-600 text-white font-semibold px-4 py-2.5 rounded-xl text-sm hover:bg-indigo-700 active:scale-[0.98] transition-all duration-200 ease-in-out shadow-sm"
          >
            + Tambah Divisi
          </button>
        )}
      </div>

      {divisions.length === 0 ? (
        <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs py-16 text-center">
          <div className="text-5xl mb-3 opacity-60">🗂️</div>
          <p className="font-semibold text-slate-700">Belum ada divisi</p>
          <p className="text-xs text-slate-400 mt-1">Tambahkan divisi pertama, mis. IT, Kitchen, atau Engineering.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {divisions.map((division) => (
            <div key={division.id} className="bg-white border border-slate-200/80 rounded-2xl shadow-xs p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">{division.name}</h2>
                  {division.description && <p className="text-sm text-slate-500 mt-0.5">{division.description}</p>}
                  <p className="text-xs text-slate-400 mt-1">
                    {division._count.assets} aset
                    {division._count.users !== undefined && ` · ${division._count.users} pengguna`}
                  </p>
                </div>
                {isSuperAdmin && (
                  <div className="flex gap-2 flex-shrink-0">
                    <button onClick={() => open({ kind: "division", division })} className="text-xs font-semibold text-indigo-600 hover:underline">Ubah</button>
                    <button onClick={() => open({ kind: "delete-division", division })} className="text-xs font-semibold text-rose-600 hover:underline">Hapus</button>
                  </div>
                )}
              </div>

              <div className="border-t border-slate-100 pt-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Kategori</p>
                  <button
                    onClick={() => open({ kind: "category", divisionId: division.id, category: null })}
                    className="text-xs font-semibold text-indigo-600 hover:underline"
                  >
                    + Tambah Kategori
                  </button>
                </div>
                {division.categories.length === 0 ? (
                  <p className="text-sm text-slate-400">Belum ada kategori — aset divisi ini belum bisa ditambahkan.</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {division.categories.map((category) => (
                      <li key={category.id} className="flex items-center justify-between py-2 hover:bg-slate-50 rounded-lg px-2 transition-all duration-200 ease-in-out">
                        <span className="text-sm text-slate-800">
                          {category.name}
                          <span className="text-xs text-slate-400 ml-2">{category._count.assets} aset</span>
                        </span>
                        <span className="flex gap-3">
                          <button onClick={() => open({ kind: "category", divisionId: division.id, category })} className="text-xs font-semibold text-indigo-600 hover:underline">Ubah</button>
                          <button onClick={() => open({ kind: "delete-category", category })} className="text-xs font-semibold text-rose-600 hover:underline">Hapus</button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50">
          <form
            onSubmit={submit}
            className="w-full max-w-md rounded-2xl shadow-xl p-6 space-y-4 border border-white/20"
            style={{ backdropFilter: "blur(8px)", backgroundColor: "rgba(255, 255, 255, 0.95)" }}
          >
            <h3 className="text-lg font-bold text-slate-900">
              {modal.kind === "division" && (modal.division ? "Ubah Divisi" : "Tambah Divisi")}
              {modal.kind === "category" && (modal.category ? "Ubah Kategori" : "Tambah Kategori")}
              {modal.kind === "delete-division" && `Hapus divisi "${modal.division.name}"?`}
              {modal.kind === "delete-category" && `Hapus kategori "${modal.category.name}"?`}
            </h3>

            {!isDelete && (
              <div>
                <label className={labelClass}>Nama</label>
                <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} className={inputClass} autoFocus />
              </div>
            )}
            {modal.kind === "division" && (
              <div>
                <label className={labelClass}>Deskripsi (opsional)</label>
                <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} />
              </div>
            )}
            {isDelete && (
              <p className="text-sm text-slate-500">Hanya bisa dihapus bila tidak ada aset{modal.kind === "delete-division" ? " maupun pengguna" : ""} yang memakainya.</p>
            )}

            {error && <p className="text-red-500 text-xs mt-1">{error}</p>}

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setModal(null)} className="flex-1 bg-slate-100 text-slate-700 font-semibold py-2.5 rounded-lg text-sm hover:bg-slate-200 transition-all duration-200 ease-in-out">
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className={`flex-1 inline-flex items-center justify-center gap-2 text-white font-semibold py-2.5 rounded-lg text-sm active:scale-[0.98] transition-all duration-200 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed ${isDelete ? "bg-rose-600 hover:bg-rose-700" : "bg-indigo-600 hover:bg-indigo-700"}`}
              >
                {saving && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {isDelete ? "Hapus" : "Simpan"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
```

- [x] **18.2 Uji manual:** sebagai `superadmin` tambah divisi "Housekeeping", tambah kategori "Vacuum", ubah nama, hapus kategori & divisi; hapus divisi IT → pesan 409 tampil. Sebagai `admin_kitchen`: hanya kartu Kitchen, tanpa tombol divisi. Sebagai `staff_kitchen`: "Akses Ditolak". Cek di lebar 375px (tanpa scroll horizontal).

  > **Catatan eksekusi:** seluruh alur diuji di browser (tambah/ubah/hapus divisi & kategori, 409 "Divisi masih memiliki 9 aset dan 3 pengguna", admin_kitchen hanya kartu Kitchen dengan hitungan aset outletnya, 375px `scrollWidth = innerWidth`). Pemeriksaan visual `staff_kitchen` tidak selesai karena pane browser tersembunyi (renderer berhenti); jalurnya diverifikasi lewat API (`POST` kategori → 403) dan guard `canManage` di halaman. Teks `message` 403 pada route kategori diganti menjadi "Hanya Super Admin atau Admin Divisi terkait yang dapat mengelola kategori ini" — teks lama menyesatkan untuk staf di divisinya sendiri. Temuan di luar cakupan: sidebar tidak menciut otomatis di layar ponsel (sudah begitu sebelum Fase 1).

- [x] **18.3 Cek tipe & commit:**
  ```bash
  npx tsc --noEmit 2>&1 | grep -E "src/app/divisions"
  git add src/app/divisions
  git commit -m "feat(ui): halaman kelola divisi & kategori" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

---

## Task 19: ESLint — Larangan Jalan Pintas ke Database

**Berkas:** `eslint.config.mjs`.

- [x] **19.1 Tambahkan blok aturan setelah blok `rules` yang ada:**

```js
// Berkas yang BOLEH memakai client Prisma mentah / tenantDb(). Di luar daftar
// ini, akses database wajib lewat `db` dari requireUserScope()/getPageContext()
// agar isolasi organisasi dan pengecekan fail-closed tidak bisa dilewati.
const RAW_DB_ALLOWLIST = [
  "src/lib/prisma.ts",
  "src/lib/tenant-db.ts",
  "src/lib/auth.ts",
  "src/app/api/auth/**",
  "prisma/seed.ts",
  "qa-test-runner.ts",
  "qa/**",
  "tests/**",
];
```
```js
  {
    files: ["**/*.{ts,tsx}"],
    ignores: RAW_DB_ALLOWLIST,
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@prisma/client",
              importNames: ["PrismaClient"],
              message: "Jangan membuat PrismaClient sendiri — gunakan `db` dari requireUserScope()/getPageContext().",
            },
          ],
          patterns: [
            {
              group: ["@/lib/prisma", "**/lib/prisma"],
              message: "Client Prisma mentah melewati isolasi organisasi. Gunakan `db` dari requireUserScope()/getPageContext().",
            },
            {
              group: ["@/lib/tenant-db", "**/lib/tenant-db"],
              allowTypeImports: true,
              message: "tenantDb() hanya dipanggil src/lib/auth.ts setelah pengecekan akses. Gunakan `db` dari konteks request.",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[property.name=/^\\$(queryRaw|executeRaw|queryRawUnsafe|executeRawUnsafe)$/]",
          message: "SQL mentah melewati client tenant dan dilarang.",
        },
      ],
    },
  },
```

- [x] **19.2 Buktikan aturan menangkap pelanggaran:**
  ```bash
  mkdir -p src/app/api/__lint_probe
  cat > src/app/api/__lint_probe/route.ts <<'EOF'
  import { prisma } from "@/lib/prisma";
  import { tenantDb } from "@/lib/tenant-db";
  export async function GET() {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json(Boolean(tenantDb("x")));
  }
  EOF
  npx eslint src/app/api/__lint_probe/route.ts; echo "exit=$?"
  rm -rf src/app/api/__lint_probe
  ```
  Harapan: 3 error (`no-restricted-imports` ×2, `no-restricted-syntax` ×1), `exit=1`.

- [x] **19.3 Seluruh proyek bersih:**
  ```bash
  npm run lint
  ```
  Harapan: tanpa error (peringatan lama boleh). Bila ada berkas di luar daftar pengecualian yang masih mengimpor `@/lib/prisma`, migrasikan dengan resep — jangan menambah pengecualian.

  > **Catatan eksekusi:** pola `"./prisma"` dan `"./tenant-db"` ditambahkan ke grup larangan — tanpa itu berkas baru di `src/lib` dapat melewati aturan lewat impor relatif. Dibuktikan dengan probe kedua di `src/lib`: `./prisma`, `./tenant-db` (impor nilai) dan `PrismaClient` tertangkap, sedangkan `import type { TenantDb }` dan namespace `Prisma` tetap lolos. Probe rencana: 3 error, `exit=1`. `npm run lint`: 0 error, 2 peringatan `<img>` lama.

- [x] **19.4 Commit:**
  ```bash
  git add eslint.config.mjs
  git commit -m "chore(lint): larang client Prisma mentah, tenantDb, dan SQL mentah di luar modul auth" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

---

## Task 20: Verifikasi Penuh

- [x] **20.1 Tipe, lint, build:**
  ```bash
  npm run typecheck && npm run lint && npm run build
  ```
  Harapan: ketiganya lolos. Sisa galat tipe = berkas yang terlewat — migrasikan dengan resep yang sesuai.

- [x] **20.2 Unit & integration test:**
  ```bash
  npm run test:unit && npm run test:integration
  ```

- [x] **20.3 QA penuh mode saas** (seed ulang dulu agar data bersih):
  ```bash
  npx prisma db seed
  npm run qa
  ```
  Harapan: seluruh kasus (lama + baru, ±50) PASS, keluar dengan kode 0.

- [x] **20.4 Smoke test mode self-hosted:** ubah `.env` menjadi `APP_MODE="self-hosted"`, jalankan `npx prisma db seed` (hanya organisasi demo), restart server dev. Buka `/login`: kolom kode organisasi **tidak** tampil; login `superadmin` / `admin123`; buat divisi "Housekeeping" + kategori "Vacuum"; tambah aset di kategori itu. Kembalikan `.env` ke `APP_MODE="saas"` dan seed ulang.

- [x] **20.5 Periksa sisa referensi lama:**
  ```bash
  grep -rnE "\"(ADMIN_IT|ADMIN_KITCHEN|IT_SUPPORT|KITCHEN)\"|InventoryType|AssetType|getInventoryForRole|ASSET_TYPE_LABELS|x-user-branch|DEVICE_ACTIVATION_TOKEN|verifyUserExists|getCurrentUser" src prisma
  ```
  Harapan: kosong. (Folder `qa/` sengaja tidak diperiksa: `ADMIN_IT`/`ADMIN_KITCHEN` di sana adalah kunci sesi, bukan nilai peran.)

  > **Catatan eksekusi (2026-09-30):** typecheck 0 galat, lint 0 galat (2 peringatan `<img>` lama), build lolos; unit 20/20, integration 12/12; QA penuh mode saas 52/52 PASS (diulang setelah perbaikan INC-02, tetap 52/52). Smoke test self-hosted dijalankan lewat HTTP (pane browser tersembunyi): 12/12 — halaman login tanpa kolom kode organisasi, login username tanpa kode & login email, divisi Housekeeping → kategori Vacuum → aset 2 pcs, halaman terkait 200. Kontrol di mode saas: kolom kode organisasi muncul dan login username tanpa kode ditolak 401. Grep sisa referensi hanya menemukan komentar yang disengaja di `src/lib/scope.ts` (contoh token lama). Temuan: INC-02 (sejak sebelum Fase 1) memakai ID insiden fiktif sehingga hanya membuktikan 404 dari cek keberadaan — diperkuat memakai `incident-pc-bogor` (cakupan STAFF_IT) dengan syarat tepat 403 dan insiden tidak berubah.

- [x] **20.6 Commit perbaikan yang muncul** (bila ada) dengan pesan `fix: …` sesuai temuan.

---

## Task 21: Dokumentasi

**Berkas:** `CLAUDE.md`, `AGENTS.md`, `QA.md`, `README.md`, `get-started.md`, `CHANGELOG.md`.

- [x] **21.1 `CLAUDE.md`** — tulis ulang bagian yang berubah (bahasa & gaya tetap):
  - **§2** judul menjadi "Pemisahan Data (Organisasi × Divisi × Outlet)". Isi:
    - Tiga sumbu dan sumbernya: organisasi → client tenant (`src/lib/tenant-db.ts`); divisi & outlet → `resolveScope()` (`src/lib/scope.ts`).
    - **`db` hanya dari `requireUserScope()` / `getPageContext()`**; larangan impor `@/lib/prisma` / `@/lib/tenant-db` dan SQL mentah (ESLint), daftar pengecualian.
    - Aturan fail-closed baru: non-SUPER_ADMIN tanpa divisi **atau** tanpa outlet → 403 (API), `<AccessDenied />` (halaman), 403 (login); dibaca dari DB setiap request.
    - Kode respons: organisasi lain 404; divisi/outlet lain 403 dengan `"Unauthorized cross-division access detected."` / `"Unauthorized cross-branch access detected."`; ID organisasi lain di payload 400.
    - Transfer (lihat kedua sisi; setujui hanya outlet asal ∈ `branchIds`), filter `?branchId=`/`?divisionId=` tidak memperluas akses.
    - Kelola divisi (SUPER_ADMIN), kategori (SUPER_ADMIN + DIVISION_ADMIN divisinya), pengguna & cabang (SUPER_ADMIN); aturan hapus 409; Super Admin terakhir.
    - Login per `APP_MODE`, JWT `{ userId, organizationId, role, name, username }`.
    - Aturan UI: form aset (divisi → kategori dinamis; outlet dari penugasan), sidebar per peran, subtitle dari nama divisi/outlet.
  - **§3** skema ringkas: Organization, Division, Category, Branch, User (+UserBranch), Asset (`divisionId`, `categoryId`), dan catatan "setiap model kecuali Organization punya `organizationId`; relasi wajib FK komposit".
  - **§4.C MDM**: dinonaktifkan (404) sampai desain ulang.
  - **§5 checklist**: ganti butir filter `inventory` dengan butir client tenant + resep route; tambah "create menulis `organizationId` eksplisit"; tambah "model baru wajib punya `organizationId` + FK komposit".
  - **§6**: ganti daftar TC dengan kasus baru (ORG, DIV, USR, TRF-05, MDM-01) dan penyesuaian peran; perintah `npm run test:unit`, `npm run test:integration`, `QA_ONLY=<suite> npm run qa`.

- [x] **21.2 `AGENTS.md`** — selaraskan §1–§2 dan §4 (MDM) dengan aturan di atas (bahasa Inggris, singkat).

- [x] **21.3 `QA.md`** — perbarui prompt QA (peran 3 tingkat, tiga sumbu isolasi, 404 lintas organisasi).

- [x] **21.4 `README.md` & `get-started.md`** — tabel peran & akun seed baru (kode organisasi `demo`, `uji-b` pada mode saas), variabel `APP_MODE`, hapus `DEVICE_ACTIVATION_TOKEN`, catatan MDM nonaktif, perintah test baru. README open source lengkap menunggu Fase 3.

- [x] **21.5 `CHANGELOG.md`** — tambahkan di atas:

```markdown
## [2.0.0] - 2026-09-29
### 💥 Breaking: Fondasi Multi-Tenant & Divisi Dinamis (Fase 1)
- **Organisasi (tenant)**: setiap data milik satu `Organization`. Isolasi ditegakkan client Prisma terikat organisasi (`src/lib/tenant-db.ts`) dan FK komposit `(organizationId, …)` di database. Data organisasi lain dijawab `404`.
- **Divisi & kategori dinamis**: enum `InventoryType` dan `AssetType` dihapus. Super Admin mengelola divisi; Super Admin dan Admin Divisi mengelola kategori (`/divisions`).
- **Peran 3 tingkat**: `SUPER_ADMIN`, `DIVISION_ADMIN`, `DIVISION_STAFF` + `User.divisionId`. Label seperti "Admin Kitchen" dibentuk dari tingkat + nama divisi.
- **Multi-outlet**: pengguna dapat ditugaskan ke beberapa outlet (`UserBranch`).
- **Login**: email, atau kode organisasi + username (`APP_MODE=saas`); mode self-hosted tanpa kode organisasi. Pesan & waktu gagal seragam.
- **MDM dinonaktifkan** (404) sampai desain ulang per divisi; `DEVICE_ACTIVATION_TOKEN` tidak dipakai lagi.
- **Pengujian**: unit test (`npm run test:unit`), integration test isolasi tenant (`npm run test:integration`), QA runner per suite (`QA_ONLY`).

> ⚠️ **Dampak**: migrasi lama diganti satu migrasi `init` — database harus di-reset (`npx prisma migrate reset`) lalu di-seed ulang. Semua pengguna wajib login ulang.
```

  > **Catatan eksekusi (2026-09-30):** saat menyusun katalog §6 ditemukan dua aturan terdokumentasi yang belum pernah diuji, lalu ditambahkan sebagai commit terpisah: **AUTH-02** (token bertanda tangan sah berformat lama → 401, cookie dihapus; dibuktikan dengan uji mutasi pada `src/proxy.ts`) dan perluasan **BR-03** (tanpa `branchId` → outlet tunggal pengguna; pemegang beberapa outlet → 400). AGENTS.md §3 & §5 ikut diselaraskan (nama peran lama & aturan BAP pra-model-stok). CHANGELOG memakai tanggal selesai 2026-09-30. Verifikasi akhir: typecheck & lint bersih, QA 53/53 setelah seed ulang dan 53/53 lagi tanpa seed ulang.

- [x] **21.6 Commit:**
  ```bash
  git add CLAUDE.md AGENTS.md QA.md README.md get-started.md CHANGELOG.md
  git commit -m "docs: aturan multi-tenant, divisi dinamis, dan pengujian Fase 1" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

---

## Setelah Fase 1

Tinjau hasil terhadap **Definisi Selesai** di spec §13, lalu mulai brainstorming **Fase 2 (tiket perbaikan lintas divisi)** — termasuk keputusan siapa yang boleh mengatur divisi penangan per kategori.
