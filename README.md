<div align="center">

<img src="public/logo.svg" alt="Inventory logo" width="88" height="88" />

# Inventory

**Open-source asset & inventory management for organizations with many divisions and outlets.**

Track every item by condition, move stock between outlets with approvals, write off assets with a documented report, and handle damage tickets — all scoped per organization, division, and outlet.

[![License: AGPL v3](https://img.shields.io/badge/license-AGPL--3.0-4f46e5.svg)](LICENSE)
[![CI](https://github.com/MotionFrog13/Inventory/actions/workflows/ci.yml/badge.svg)](https://github.com/MotionFrog13/Inventory/actions/workflows/ci.yml)
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
- **Write-offs with evidence (BAP)** — submit a disposal report with a PDF or photo (images are compressed server-side to WebP). Documents are stored outside the web root and only open for users who can see the asset. Only the submitted pieces are reserved, the rest stays usable; approval removes them for good, rejection returns them to their original bucket.
- **Incident tickets** — report broken pieces, let staff propose a fix, and let admins approve or resolve directly. The chosen outcome decides where the pieces go (active, repair, retired).
- **Reports & alerts** — per-division and per-category distribution, monthly incident trends, warranty expiry, and SLA-overdue tickets on the dashboard.
- **Activity log** — automatic, read-only audit trail visible to the Super Admin of each organization.
- **Responsive** — works on phones, with an off-canvas navigation drawer.
- **Runs anywhere, no server needed** — one Docker container (PostgreSQL included) started with a double-click, for development or production. Publish it from your own computer over HTTPS with the built-in Cloudflare Tunnel — no VPS or cloud hosting.

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
- Docker: one container with Node.js 24 + PostgreSQL 15, optional [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) (`cloudflared`)

## Quick start

### Install for everyday use — Docker only

Install and start Docker Desktop (Windows/macOS), or Docker Engine with Compose **2.20+** (Linux). Internet is needed for the initial image build; local use afterwards does not need Google Fonts or a cloud account. No local Node.js, PostgreSQL, `.env`, or manual migration is required.

Download and extract the [source ZIP](https://github.com/MotionFrog13/Inventory/archive/refs/heads/master.zip), then double-click **`docker-prod.bat`** on Windows. On macOS/Linux, run `bash docker/launch.sh prod` in the extracted folder. The launcher builds the image, starts the app and database, shows the generated admin password, and opens the browser.

With Git and a terminal, the equivalent installation is:

```bash
git clone https://github.com/MotionFrog13/Inventory.git
cd Inventory
docker compose up -d --build --wait --wait-timeout 600
docker compose logs app
```

Open **http://localhost:8000**. Sign in as **`superadmin`**, using the random password marked **`Password Super Admin pertama`** in the logs. Change it in **Pengguna**, then create your divisions, categories, outlets and users. Production starts with one organization and one admin, with no demo assets. The first build can take several minutes depending on your connection and computer; wait for the container to become healthy.

Subsequent starts keep the same accounts, database, uploads and secrets in the `inventory_data` volume. Do not delete this volume or use `down -v` on a real installation. [Panduan instalasi Bahasa Indonesia](INSTALL.md) · [Docker, backups and HTTPS](docs/docker.md).

| Task | Command |
|---|---|
| Start again | `docker compose up -d --wait --wait-timeout 600` |
| Stop (keep data) | `docker compose down` |
| Check status / logs | `docker compose ps` / `docker compose logs --tail 100 app` |
| Update (back up first) | `git pull --ff-only`, then `docker compose up -d --build --wait --wait-timeout 600` |

If port 8000 is busy, copy `docker/.env.example` to `docker/.env`, set `PROD_PORT=8001`, and start again at http://localhost:8001. To choose your organization and admin details, edit that file **before the first start**. These bootstrap settings do not rename an existing organization or reset its password.

### Docker development and public access

PostgreSQL and the app run together in a single container; only Docker is required.

| | Development | Production | Production + public URL |
|---|---|---|---|
| Windows (double-click) | `docker-dev.bat` | `docker-prod.bat` | `docker-tunnel.bat` |
| macOS / Linux | `bash docker/launch.sh dev` | `bash docker/launch.sh prod` | `bash docker/launch.sh prod tunnel` |
| URL | http://localhost:3000 | http://localhost:8000 | a temporary `https://<random>.trycloudflare.com`, or your own domain |
| What runs | `next dev` on your working copy, hot reload, demo data | `next build` + `next start`, one organization and a Super Admin whose random password is printed in the container log | the production container plus Cloudflare Tunnel |

Secrets (JWT, database password) are generated on first start and kept in a Docker volume. See [docs/docker.md](docs/docker.md) (Bahasa Indonesia) for settings, backups, and HTTPS.

**Public access without a server.** Production mode can be published over HTTPS straight from your own computer with Cloudflare Tunnel, built into the container — no VPS, public IP, or router port forwarding. `docker-tunnel.bat` needs no account and gives a temporary address that changes on every restart, which suits trials. For daily use, create a tunnel in Cloudflare Zero Trust for your own domain and put its token in `docker/.env` (`CLOUDFLARE_TUNNEL_TOKEN`); `docker-prod.bat` then starts it automatically. Your computer has to stay on, and the login page becomes reachable from the internet — read [Security notes](#security-notes) first.

### Manual setup

**Requirements:** Node.js 20.19+, 22.12+ or 24+ · PostgreSQL 15+ (or Docker)

```bash
git clone https://github.com/MotionFrog13/Inventory.git
cd Inventory
npm ci
cp .env.example .env          # then set JWT_SECRET to a long random string
docker compose -f docker/compose.db.yml up -d --wait # optional: local PostgreSQL
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

All settings live in `.env` (see [`.env.example`](.env.example)). The Docker setup reads `docker/.env` instead and generates its own secrets — see [`docker/.env.example`](docker/.env.example) and [docs/docker.md](docs/docker.md).

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `JWT_SECRET` | yes | Secret used to sign session tokens — use a long random value |
| `JWT_EXPIRES_IN` | no | Session lifetime, default `8h` |
| `APP_MODE` | no | `self-hosted` (default) or `saas` |
| `ALLOW_DESTRUCTIVE_SEED` | no | Allow the demo seed to wipe a database when `NODE_ENV=production` |
| `UPLOAD_DIR` | no | Where write-off documents are stored, default `uploads/` in the project folder |

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
npm run qa                   # HTTP scenarios — needs `npm run dev` and APP_MODE="saas"
npm run test:install         # isolated production Docker install + persistence smoke test
QA_ONLY=transfers npm run qa # a single suite
```

The full test catalogue and the architecture rules contributors must follow are in [CLAUDE.md](CLAUDE.md) (Bahasa Indonesia) and [AGENTS.md](AGENTS.md) (English).

## Project structure

```
prisma/            schema, migrations, demo seed (+ production bootstrap mode)
src/app/           pages (App Router) and API routes (src/app/api)
src/components/    shared UI (shell, sidebar, header, access denied)
src/lib/           auth & request context, scope rules, tenant client, stock & upload helpers
qa/, tests/        HTTP QA suites, unit and integration tests
docker/            single-container entrypoint, compose files (dev/prod), launchers
docs/              Docker guide, design spec, implementation plan, screenshots
uploads/           write-off documents (created at runtime, not in git)
Dockerfile         image targets `dev` and `prod`
docker-*.bat       one-click launchers for Windows (dev, prod, tunnel)
```

## Security notes

Known limitations of the current release — see [SECURITY.md](SECURITY.md) for how to report a vulnerability:

- Login is throttled per process (10 attempts per login identifier in 15 minutes and 120 attempts overall per minute). Counters reset on restart and are not shared between instances; username and email aliases have separate counters. Use HTTPS and an edge/shared rate limiter for production — with Cloudflare Tunnel, add a Cloudflare rate limiting rule for `/api/auth/login` or protect the site with Cloudflare Access. Password reset and email verification are not implemented yet.
- `saas` mode has no public sign-up and is **not** ready for hosting untrusted organizations.

## Roadmap

1. ✅ **Foundation** — organizations, dynamic divisions & categories, three role tiers, multi-outlet users, tenant-bound database client.
2. **Cross-division repair tickets** — route a category's tickets to a handling division (e.g. Engineering), assign technicians, track progress and SLA.
3. **Open-source readiness** — ✅ automatic production bootstrap and login rate limiting; setup wizard, configurable name/logo/time zone, English & Indonesian UI still planned.
4. **Distribution** — ✅ single-container Docker installation, CI, clean-install testing, backup guide and built-in Cloudflare Tunnel ([docs/docker.md](docs/docker.md)); a published image is still planned.
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
- **Dokumen BAP terlindungi**: disimpan di luar folder publik dan hanya dapat dibuka pengguna yang berhak atas asetnya.
- **Docker satu kontainer, satu klik** (PostgreSQL sudah termasuk) untuk pengembangan dan produksi, serta **akses publik tanpa VPS** lewat Cloudflare Tunnel bawaan.

**Mulai cepat:** [unduh ZIP](https://github.com/MotionFrog13/Inventory/archive/refs/heads/master.zip), ekstrak, lalu klik dua kali `docker-prod.bat`. PostgreSQL, migrasi, organisasi, dan akun admin dengan password acak disiapkan otomatis. Buka http://localhost:8000 dan gunakan password dari launcher. [Panduan instalasi Bahasa Indonesia](INSTALL.md) mencakup login pertama, pengaturan port, update dan penanganan masalah. Untuk pengembangan gunakan `docker-dev.bat`; akses publik HTTPS tersedia lewat `docker-tunnel.bat` ([panduan Docker](docs/docker.md)). Aturan arsitektur dan katalog pengujian ada di [CLAUDE.md](CLAUDE.md).

**Lisensi:** [AGPL-3.0](LICENSE). Bebas dipakai, dimodifikasi, dan di-host sendiri. Bila versi modifikasinya disediakan sebagai layanan daring, kode sumbernya wajib dibagikan dengan lisensi yang sama.
