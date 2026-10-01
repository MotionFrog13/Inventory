<div align="center">

<img src="public/logo.svg" alt="Inventory logo" width="88" height="88" />

# Inventory

**Open-source asset & inventory management for organizations with many divisions and outlets.**

Track every item by condition, move stock between outlets with approvals, write off assets with a documented report, and handle damage tickets — all scoped per organization, division, and outlet.

[![License: AGPL v3](https://img.shields.io/badge/license-AGPL--3.0-4f46e5.svg)](LICENSE)
![Next.js 16](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs)
![Prisma 7](https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15%2B-4169E1?logo=postgresql&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)

[Features](#features) · [Screenshots](#screenshots) · [Quick start](#quick-start) · [Configuration](#configuration) · [Roadmap](#roadmap) · [Ringkasan Bahasa Indonesia](#ringkasan-bahasa-indonesia)

</div>

![Dashboard](docs/screenshots/dashboard.png)

> [!NOTE]
> **Project status: early but working.** The core (multi-tenant isolation, roles, stock, transfers, write-offs, incidents) is implemented and covered by automated tests. It is ready for **self-hosted, single-organization** use. The user interface is currently in **Bahasa Indonesia**; translations are on the [roadmap](#roadmap). Please read [Security notes](#security-notes) before exposing an instance to the internet.

## Features

- **Multi-tenant by design** — every row belongs to an organization. Isolation is enforced twice: a tenant-bound Prisma client injects the organization into every query, and composite foreign keys `(organizationId, …)` make the database itself reject cross-tenant references. Another organization's data simply answers `404`.
- **Dynamic divisions & categories** — create divisions such as IT, Kitchen, Engineering, or Housekeeping, each with its own asset categories. No hard-coded asset types.
- **Three role tiers** — Super Admin, Division Admin, and Division Staff. Labels follow the division ("Admin Kitchen", "Staf IT"). Users can be assigned to **several outlets**; accounts without a division or outlet are denied everything (fail closed).
- **Stock by condition** — one item can hold many pieces split into *active*, *broken*, *in repair*, *retired*, and *reserved* buckets. The item status is derived from the buckets, so 92 working + 8 broken chopsticks still show as active.
- **Outlet transfers** — request a move to another outlet; only an admin of the **origin** outlet can approve, and the move is applied in a single database transaction.
- **Write-offs with evidence (BAP)** — submit a disposal report with a PDF or photo (images are compressed server-side to WebP). Only the submitted pieces are reserved, the rest stays usable; approval removes them for good, rejection returns them to their original bucket.
- **Incident tickets** — report broken pieces, let staff propose a fix, and let admins approve or resolve directly. The chosen outcome decides where the pieces go (active, repair, retired).
- **Reports & alerts** — per-division and per-category distribution, monthly incident trends, warranty expiry, and SLA-overdue tickets on the dashboard.
- **Activity log** — automatic, read-only audit trail visible to the Super Admin of each organization.
- **Responsive** — works on phones, with an off-canvas navigation drawer.

## Screenshots

| Assets | Asset detail with stock by condition |
|---|---|
| ![Asset list](docs/screenshots/assets.png) | ![Asset detail](docs/screenshots/asset-detail.png) |
| **Divisions & categories** | **Reports** |
| ![Divisions and categories](docs/screenshots/divisions.png) | ![Reports](docs/screenshots/reports.png) |
| **Login (SaaS mode)** | **Mobile** |
| ![Login](docs/screenshots/login.webp) | ![Mobile layout and navigation drawer](docs/screenshots/mobile.png) |

## Tech stack

- [Next.js 16](https://nextjs.org/) (App Router) & [React 19](https://react.dev/), TypeScript
- [Prisma 7](https://www.prisma.io/) with `@prisma/adapter-pg` and a tenant-bound client extension
- PostgreSQL 15+
- [Tailwind CSS v4](https://tailwindcss.com/)
- JWT sessions in HTTP-only cookies, bcrypt password hashing
- [sharp](https://sharp.pixelplumbing.com/) for server-side image compression
- Tests: `node:test` (unit & integration) and an HTTP QA runner

## Quick start

**Requirements:** Node.js 20.19+, 22.12+ or 24+ · PostgreSQL 15+ (or Docker)

```bash
git clone https://github.com/MotionFrog13/Inventory.git
cd Inventory
npm install
cp .env.example .env          # then set JWT_SECRET to a long random string
docker compose up -d          # optional: local PostgreSQL + pgAdmin
npx prisma migrate deploy     # create the schema
npx prisma db seed            # demo data — WIPES the whole database
npm run dev
```

Open http://localhost:3000 and sign in with a demo account:

| Username | Password | Role | Division | Outlets |
|---|---|---|---|---|
| `superadmin` (or `superadmin@demo.local`) | `admin123` | Super Admin | all | all |
| `admin_it` | `admin123` | Division Admin | IT | Bogor |
| `staff_it` | `staff123` | Division Staff | IT | Bogor |
| `admin_kitchen` | `admin123` | Division Admin | Kitchen | Bogor |
| `teknisi_engineering` | `staff123` | Division Staff | Engineering | Bogor + Jakarta Selatan |

In `saas` mode, enter the organization code **`demo`** together with a username (or just use an email address). The full list of demo accounts, plus step-by-step scenarios, is in [get-started.md](get-started.md) (Bahasa Indonesia).

> [!WARNING]
> The demo passwords are for development only. `npx prisma db seed` deletes **all** data and refuses to run with `NODE_ENV=production` unless `ALLOW_DESTRUCTIVE_SEED=true` is set.

## Configuration

All settings live in `.env` (see [`.env.example`](.env.example)).

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `JWT_SECRET` | yes | Secret used to sign session tokens — use a long random value |
| `JWT_EXPIRES_IN` | no | Session lifetime, default `8h` |
| `APP_MODE` | no | `self-hosted` (default) or `saas` |
| `ALLOW_DESTRUCTIVE_SEED` | no | Allow the demo seed to wipe a database when `NODE_ENV=production` |

### Deployment modes

| | `self-hosted` (default) | `saas` (experimental) |
|---|---|---|
| Organizations | exactly one — login is refused (`503`) if the database holds more or fewer | many |
| Login | username or email + password | email + password, **or** organization code + username + password |
| Extras | — | `/login?org=demo` pre-fills the organization code |

## Roles

| Action | Super Admin | Division Admin | Division Staff |
|---|---|---|---|
| View assets, incidents, write-offs, transfers | whole organization | own division in own outlets | own division in own outlets |
| Create / edit assets | ✓ | ✓ | — |
| Report incidents, request transfers & write-offs | ✓ | ✓ | ✓ |
| Approve write-offs & incident resolutions | ✓ | ✓ (own division) | — |
| Approve transfers | ✓ | ✓ (origin outlet) | — |
| Manage categories | ✓ | ✓ (own division) | — |
| Manage divisions, outlets, users; activity log | ✓ | — | — |

## Testing

```bash
npm run typecheck && npm run lint && npm run build
npm run test:unit            # pure functions (scope rules, validation)
npm run test:integration     # tenant isolation against the development database
npm run qa                   # 53 HTTP scenarios — needs `npm run dev` and APP_MODE="saas"
QA_ONLY=transfers npm run qa # a single suite
```

The full test catalogue and the architecture rules contributors must follow are in [CLAUDE.md](CLAUDE.md) (Bahasa Indonesia) and [AGENTS.md](AGENTS.md) (English).

## Project structure

```
prisma/            schema, migrations, demo seed
src/app/           pages (App Router) and API routes (src/app/api)
src/components/    shared UI (shell, sidebar, header, access denied)
src/lib/           auth & request context, scope rules, tenant client, stock helpers
qa/, tests/        HTTP QA suites, unit and integration tests
docs/              design spec, implementation plan, screenshots
```

## Security notes

Known limitations of the current release — see [SECURITY.md](SECURITY.md) for how to report a vulnerability:

- Uploaded write-off documents are stored under `public/uploads` with random file names and are served **without an access check**. Do not upload highly sensitive files yet.
- There is no login rate limiting, password reset, or email verification yet. Put the app behind a reverse proxy with rate limiting and HTTPS.
- `saas` mode has no public sign-up and is **not** ready for hosting untrusted organizations.

## Roadmap

1. ✅ **Foundation** — organizations, dynamic divisions & categories, three role tiers, multi-outlet users, tenant-bound database client.
2. **Cross-division repair tickets** — route a category's tickets to a handling division (e.g. Engineering), assign technicians, track progress and SLA.
3. **Open-source readiness** — setup wizard (replacing seeded accounts), configurable name/logo/time zone, English & Indonesian UI, login rate limiting, uploads served through access-checked routes.
4. **Distribution** — Docker image, production compose file, backup guide, CI.
5. **SaaS** — public sign-up, email verification & password reset, quotas, platform admin.

Mobile device management (MDM) is disabled until it is redesigned per division.

## Contributing

Contributions are welcome — please read [CONTRIBUTING.md](CONTRIBUTING.md) first. Changes to [CHANGELOG.md](CHANGELOG.md) are expected for user-facing work.

## About

Inventory grew out of the day-to-day needs of a multi-outlet food & beverage business: laptops and CCTV live next to chillers and stoves, every outlet has its own team, and nothing should move or disappear without someone signing off. The project is now a general-purpose, open-source system for any organization that manages physical assets across divisions and locations — restaurants, retail chains, hotels, schools, or offices.

Maintained by [@MotionFrog13](https://github.com/MotionFrog13) and contributors.

## License

Inventory is free software, licensed under the [GNU Affero General Public License v3.0 or later](LICENSE). You may use, modify, and self-host it freely; if you offer a modified version to users over a network, you must make your source code available to them under the same license.

---

## Ringkasan Bahasa Indonesia

**Inventory** adalah aplikasi open source untuk mengelola aset dan inventaris di organisasi yang memiliki banyak divisi dan outlet. Antarmukanya sudah berbahasa Indonesia.

**Fitur utama:**
- **Multi-tenant**: satu instalasi untuk satu organisasi (`self-hosted`) atau banyak organisasi (`saas`, masih eksperimental). Data antar-organisasi terisolasi ketat.
- **Divisi & kategori dinamis** (IT, Kitchen, Engineering, dll.) dengan tiga tingkat peran: Super Admin, Admin Divisi, dan Staf Divisi. Satu pengguna bisa memegang beberapa outlet.
- **Stok per kondisi** (aktif, rusak, perbaikan, pensiun, dipesan BAP). Status aset diturunkan otomatis dari komposisi stok.
- **Mutasi antar outlet** yang hanya bisa disetujui admin outlet asal.
- **BAP (Berita Acara Penghapusan)** dengan unggahan PDF/foto, reservasi parsial, dan persetujuan admin.
- **Tiket insiden** per jumlah pcs, laporan per divisi/kategori, peringatan garansi & SLA, serta log aktivitas.

**Mulai cepat:** ikuti langkah [Quick start](#quick-start) di atas, atau panduan lengkap berbahasa Indonesia di [get-started.md](get-started.md). Aturan arsitektur dan katalog pengujian ada di [CLAUDE.md](CLAUDE.md).

**Lisensi:** [AGPL-3.0](LICENSE). Bebas dipakai, dimodifikasi, dan di-host sendiri. Bila versi modifikasinya disediakan sebagai layanan daring, kode sumbernya wajib dibagikan dengan lisensi yang sama.
