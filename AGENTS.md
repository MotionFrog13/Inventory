<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Inventory Coding Rules

All agents and developers working on this codebase must adhere to the following architectural and business rules. `CLAUDE.md` is the detailed rulebook; this file is the short version.

### 1. Data Separation — Three Axes: Organization × Division × Outlet
The app is multi-tenant. Every access is restricted along **three axes that apply simultaneously**:

- **Organization (tenant):** every row belongs to one `Organization`. Enforced by the
  tenant-bound Prisma client `tenantDb(organizationId)` (`src/lib/tenant-db.ts`) **and**
  composite foreign keys `(organizationId, …)` in the database.
- **Division:** `User.divisionId`. Divisions and their categories are dynamic (created in the
  UI), not enums.
- **Outlet:** a user's assigned branches via `UserBranch` — a user may hold **several** outlets.

Division and outlet scope come from `resolveScope()` in `src/lib/scope.ts`, the single source
of truth — never compute these filters by hand.

#### 1a. Database access only through the request context
```ts
const ctx = await requireUserScope(request);   // route handlers
if (!ctx.ok) return ctx.response;
const { db, scope, user } = ctx;

const ctx = await getPageContext();            // server pages; null => <AccessDenied />
```
- Both read the user (role, division, outlets) **from the database on every request**; the role
  inside the JWT is never used for authorization.
- ESLint forbids importing `@/lib/prisma`, value imports from `@/lib/tenant-db`, `PrismaClient`,
  and `$queryRaw`/`$executeRaw`/`$queryRawUnsafe`/`$executeRawUnsafe` outside the allowlist in
  `eslint.config.mjs` (`src/lib/prisma.ts`, `src/lib/tenant-db.ts`, `src/lib/auth.ts`,
  `src/app/api/auth/**`, `prisma/seed.ts`, `qa-test-runner.ts`, `qa/**`, `tests/**`).
  Do not add exceptions.
- `create` calls still write `organizationId: user.organizationId` explicitly; never take
  `organizationId` from client input. Write foreign keys as scalars, not `connect`.
- Every new model (except `Organization`) needs `organizationId` and composite FKs for its
  required relations.

#### 1b. Scope helpers and response codes
- Filter with `assetScopeWhere()`, `assetRelationScopeWhere()`, `transferScopeWhere()`; guard a
  single asset with `assetAccessDenied()` (division, then outlet).
- Other organization's data ⇒ **`404`**. Other division ⇒ `403` `"Unauthorized cross-division access detected."`.
  Other outlet ⇒ `403` `"Unauthorized cross-branch access detected."`. Another organization's
  IDs in a payload ⇒ `400`.
- Client-supplied `?branchId=` / `?divisionId=` are never trusted: `effectiveBranchFilter()` and
  `effectiveDivisionFilter()` only narrow, never widen, access.

#### 1c. Assignment is fail-closed
- A non-`SUPER_ADMIN` without a division **or** without an outlet gets `resolveScope() === null`
  ⇒ API `403`, pages `<AccessDenied />`, login `403`. Only `/api/auth/logout` and `/api/auth/me`
  stay reachable (`/api/auth/me` returns `access: "unassigned"`).
- JWT payload: `{ userId, organizationId, username, role, name }`. A token without
  `organizationId`, or with a role outside the three tiers (e.g. pre-2.0 `ADMIN_IT`), is invalid:
  cookie cleared, API `401`, pages redirect to `/login` (`src/proxy.ts`).
- `POST`/`PUT /api/users` validate against the **final** role with `validateAssignment()`.
  `SUPER_ADMIN` always ends with no division and no outlets and must have an email; the last
  `SUPER_ADMIN` of an organization cannot be demoted.

#### 1d. Cross-outlet transfers
- **View:** users see transfers on **both** sides (out of and into their outlets) — `transferScopeWhere()`.
- **Request:** only for assets in one of their outlets; the destination may be any branch of the
  same organization.
- **Approve/Reject:** **origin outlet only** (`canApproveTransfer()`). The destination outlet must
  not be able to pull another branch's asset by approving its own request.

#### 1e. Server pages need their own guard
Pages that query Prisma directly (`/`, `/assets`, `/assets/[id]`, `/assets/[id]/edit`,
`/branches/[id]`, `/transfers`) must call `getPageContext()` themselves — middleware alone
cannot know which rows the page reads. Render refusals with `<AccessDenied />`.

### 2. Role-Based Access Control (RBAC)
Three tiers; labels are built from tier + division name (`roleLabel()`: "Admin Kitchen", "Staf IT").
- **`SUPER_ADMIN`**: everything inside its own organization — divisions, categories, branches,
  users, all assets, all approvals, activity log.
- **`DIVISION_ADMIN`**: assets, incidents, transfers, and BAP of its division in its outlets;
  approves BAP, incident resolutions, and transfers (origin outlet); manages its division's
  categories. Cannot manage divisions, branches, or users.
- **`DIVISION_STAFF`**: view assets, report incidents, propose resolutions, request transfers,
  submit BAP. **Strictly prohibited from editing asset specifications or approving anything.**

`isAdminRole(role)` = `SUPER_ADMIN` or `DIVISION_ADMIN`.

### 3. BAP (Berita Acara Pemeriksaan) Workflow
- A BAP request carries a quantity and a source stock bucket; those pcs move into `reservedQty`.
  Only the reserved pcs are locked — the rest of the stock stays usable, reportable, and
  transferable. The asset is fully locked (`BAP_PENDING`) only when **all** remaining stock is
  reserved.
- One `PENDING` BAP per asset at a time; BAP history is append-only.
- Approve/Reject buttons check `Bap.status = PENDING` (not `Asset.status`) and appear only for
  `DIVISION_ADMIN` of that division or `SUPER_ADMIN`.
- Approval removes the pcs from `reservedQty` and `quantity`; the asset becomes `BAP` only when
  total stock reaches 0. Rejection returns the pcs to their **source** bucket.
- Use `db.$transaction` with `updateMany({ where: { id, status: "PENDING" } })` + `count === 0`
  checks; mutate stock only through `src/lib/stock.ts`.
- BAP documents follow the owning asset's access rules (see §6 Serving) — never store them in
  `public/`.

### 4. MDM (Mobile Device Management) — Disabled
- All MDM routes (`/api/mdm/enroll`, `/api/mdm/check-in`, `/api/assets/[id]/mdm`,
  `/api/assets/[id]/mdm/command`) are stubs that always return `404` until MDM is redesigned per
  division. The old implementation is in git history.
- The `MdmDevice` and `MdmCommand` tables remain (tenant-scoped). `DEVICE_ACTIVATION_TOKEN` is no
  longer used. Do not add MDM features before the redesign is approved.

### 5. Mutation/Transfer Approval Workflow
- **Transfer Request**: Initiating a transfer does NOT immediately change the asset's `branchId`. Instead, it creates a `Transfer` record with status `PENDING`.
- **Admin Approval**: Only `SUPER_ADMIN` or the `DIVISION_ADMIN` of the origin outlet can approve or reject a transfer request.
- **Database Consistency**: When a transfer is approved, update the `Transfer` status to `APPROVED` and update the `Asset`'s `branchId` to the target branch inside `db.$transaction`.
- **Access Control**: Staff (`DIVISION_STAFF`) can only request transfers but cannot approve or reject them.

### 6. File Upload and Compression Rules
- **Image Compression**: All uploaded images for BAP documents (PNG, JPEG, WebP) must be compressed on the server side (e.g., using `sharp` library) before saving. Convert images to WebP format with a quality setting of 75% and resize them to a maximum dimension of 1920px (width or height) to preserve storage.
- **PDF Optimization**: PDF uploads must have a strict size limit (e.g., maximum 5MB) and be processed/streamlined before storage to prevent storage exhaustion.
- **Storage Structure**: Save files under `<UPLOAD_ROOT>/bap/` (`src/lib/uploads.ts`; `UPLOAD_DIR`, default `uploads/` — never `public/`) grouped by year/month folders (e.g., `bap/2026/07/`) using unique, randomized/hashed filenames to avoid name collisions. `Bap.fileUrl` is `/uploads/bap/YYYY/MM/<uuid>.(pdf|webp)`.
- **Serving**: `/uploads/*` is rewritten (`beforeFiles`, `next.config.ts`) to `GET /api/uploads/[...path]`, which finds the `Bap` through the tenant `db` (other organization → `404`) and applies `assetAccessDenied()` to its asset (other division/outlet → `403`). Do not add `/uploads` back to the proxy's `SKIP_PATTERNS`.

### 7. Verification
Run `npm run typecheck && npm run lint && npm run build`, `npm run test:unit`,
`npm run test:integration`, then reseed (`npx prisma db seed`) and `npm run qa` against the dev
server with `APP_MODE="saas"`. See `CLAUDE.md` §6 for the test case catalogue. With Docker, set
`DEV_APP_MODE=saas` in `docker/.env`, start `docker-dev.bat`, run `docker-dev.bat seed`, and point the
QA runner's `DATABASE_URL` at the container database (`localhost:55432`) — never at another database.

### 8. Docker (single container)
`Dockerfile` (targets `dev`/`prod`) runs PostgreSQL and Next.js in one container, orchestrated by
`docker/entrypoint.sh`; launchers are `docker-dev.bat`, `docker-prod.bat`, and `docker/launch.sh`
(see `docs/docker.md`). On an empty database, dev runs the demo seed and prod runs
`SEED_MODE=bootstrap npx prisma db seed`, which never wipes data and creates one organization plus
its first Super Admin. Changes to startup, migrations, or seeding must keep both modes working.
Prod can also run Cloudflare Tunnel inside the same container (`docker-tunnel.bat` for a quick
tunnel, or `CLOUDFLARE_TUNNEL_TOKEN` for a named tunnel); the entrypoint supervises `cloudflared`
separately so a tunnel failure never stops the app, and the token is never passed to Next.js.
