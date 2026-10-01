# Contributing to Inventory

Thanks for your interest in improving Inventory! Bug reports, documentation fixes, translations, and code contributions are all welcome.

## Before you start

- For anything larger than a small fix, please **open an issue first** so we can agree on the approach.
- Security problems must **not** be reported in public issues — see [SECURITY.md](SECURITY.md).
- The user interface is currently in Bahasa Indonesia. Keep new UI text consistent with it until translations land (see the roadmap in the [README](README.md#roadmap)).

## Development setup

Pick one of the two setups from the [Quick start](README.md#quick-start):

- **Docker (no local Node.js or PostgreSQL):** run `docker-dev.bat` on Windows or `bash docker/launch.sh dev` elsewhere. Your working copy is mounted into the container with hot reload, and the database is reachable from the host at `localhost:55432` (`postgres` / `postgres`). See [docs/docker.md](docs/docker.md).
- **On the host:** Node.js 20.19+/22.12+/24+ with your own PostgreSQL and `.env`.

The QA runner needs `APP_MODE="saas"` and fresh seed data so the second test organization exists. On the host, set it in `.env` and run `npx prisma db seed`. With Docker, set `DEV_APP_MODE=saas` in `docker/.env`, restart, and run `docker-dev.bat seed`. Then run the QA runner from the host with `DATABASE_URL` pointing at the container database, because some suites write to the database directly.

## Architecture rules

Inventory is multi-tenant, so a few rules are non-negotiable. The full rulebook is [CLAUDE.md](CLAUDE.md) (Bahasa Indonesia); [AGENTS.md](AGENTS.md) is a short English version.

- **Database access only through the request context.** API routes call `requireUserScope(request)`, server pages call `getPageContext()`, and use the `db` they return. Never import `@/lib/prisma` or `@/lib/tenant-db`, and never use raw SQL — ESLint enforces this.
- **Scope with the helpers in `src/lib/scope.ts`** (`assetScopeWhere`, `transferScopeWhere`, `assetAccessDenied`, …) instead of building division/outlet filters by hand.
- **Every new model needs `organizationId`** and composite foreign keys `(organizationId, …)` for its required relations.
- **Stock changes go through `src/lib/stock.ts`** so the invariant `quantity = active + broken + repair + retired + reserved` always holds.
- **Uploaded files never go to `public/`.** Store them through `src/lib/uploads.ts` (`UPLOAD_DIR`); they are served only by `/api/uploads`, which applies the owning asset's access check.
- Responses use `{ success, data | error, message }`; another organization's data answers `404`, another division/outlet answers `403`.

## Checks before opening a pull request

```bash
npm run typecheck
npm run lint
npm run build
npm run test:unit
npm run test:integration
npm run qa            # with `npm run dev` running and APP_MODE="saas"
```

Add or update tests for behavior you change — the QA suites live in `qa/suites/`, unit and integration tests in `tests/`.

If you touch the `Dockerfile`, `docker/`, startup, migrations, or seeding, also run `docker-dev.bat` and `docker-prod.bat` (or `docker/launch.sh dev|prod`) on a clean volume (`docker compose -f docker/compose.<mode>.yml down -v` first). For Cloudflare Tunnel changes, check `docker-tunnel.bat` and a deliberately wrong `CLOUDFLARE_TUNNEL_TOKEN`: the app must keep running. `.gitattributes` keeps `*.sh` files LF and `*.bat` files CRLF — keep it that way, or the container and the Windows launchers break.

## Commits and pull requests

- Keep pull requests focused on one change.
- Commit messages follow `type(scope): summary`, for example `feat(api): …`, `fix(ui): …`, `docs: …`, `test(qa): …`.
- Add an entry to [CHANGELOG.md](CHANGELOG.md) for user-facing changes.
- Include screenshots for UI changes (desktop and a phone width).

## License

By contributing, you agree that your contributions are licensed under the [GNU AGPL v3.0 or later](LICENSE), the same license as the project.
