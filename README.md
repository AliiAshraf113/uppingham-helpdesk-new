# Uppingham IT Helpdesk

Clean implementation scaffold for the internal school IT service desk.

## Local development

Use Node.js `>=20.9.0 <25` and npm. Node.js `20.20.2` satisfies the Next.js 16.4.3 minimum, although the Node.js 20 release line is end-of-life; use a maintained Node.js LTS release (preferably the host's 24.x option) for production. Install the lockfile-resolved dependencies with:

```sh
npm ci
npm run dev
```

The local app is served below `/helpdesk` (for example, `http://localhost:3000/helpdesk`). The Stage 1 UI and health endpoint do not require environment variables. Copy `.env.example` to `.env.local` only when later stages need local database or authentication configuration; keep real secrets out of source control.

## Validation

```sh
npm run typecheck
npm run lint
npm run build
npm start
```

`npm start` uses `server.js`, matching the confirmed CloudLinux Passenger startup-file setting. It starts Next.js through its custom-server API and reads Passenger's `PORT` value when present. Development still uses `next dev`. Next.js documents trade-offs for custom servers; this adapter is used because the existing cPanel application is configured to start `server.js`.

## cPanel deployment preparation

The existing cPanel application uses root `/home/ucegcom/helpdesk`, URL `/helpdesk`, CloudLinux Node.js Selector, and startup file `server.js`. Keep those settings unchanged. The previous ZIP was rejected by the hosting scanner; do not rebuild or upload another ZIP until the provider reviews the alert and approves a source-transfer method. The project packaging script excludes `node_modules`, but a source archive still contains the Passenger JavaScript startup file.

Do not upload local `node_modules`. CloudLinux manages dependencies in its per-application virtual environment; use the existing Node.js Selector application's dependency-install action and run the build from that selected environment. Inspect any existing app-root `node_modules` object before a version switch and do not remove it until its type and ownership by the Selector are confirmed. See [docs/cpanel-compatibility-checklist.md](docs/cpanel-compatibility-checklist.md) for the read-only inspection and deployment sequence. Database initialization remains separate.

`npm test` runs the offline Node.js test suite for migration ordering, checksums, statement splitting and schema invariants. It does not connect to MariaDB. `npm run db:migrate` is an operator-only schema command and is intentionally excluded from routine validation and app startup.

`npm run db:diagnose` performs a read-only identity query against the fixed database target to verify `DATABASE()`, `@@hostname`, `@@port`, and MariaDB version. It never runs migrations or writes data. Set `MIGRATOR_DATABASE_URL` and an explicit, confirmed `MARIADB_TLS` value in the process environment first; see [docs/database-migrations.md](docs/database-migrations.md).

`npm run db:reset` is a separate destructive, fixed-target procedure for the existing `ucegcom_helpdesk` database. It requires exact database/host/port identity, an explicit TLS choice (and `--approve-no-tls` for confirmed plaintext), an explicit choice between signed backup evidence and `--data-disposable`, and an interactive typed confirmation. It is not part of routine validation; see [docs/database-migrations.md](docs/database-migrations.md). Do not run it without separate approval.

`npm run build` uses Next.js's Webpack bundler. The default Turbopack build previously exited with a child-process panic while processing `src/app/globals.css` in Windows. Current Windows builds can also fail with `EPERM` while creating a nested `.next` route/type directory; this remains under investigation and is not evidence of a cPanel/Linux permissions problem. `npm test` covers offline schema and migration safety checks; it does not require MariaDB.

Stage 1 was validated locally with Node.js `v24.21.0` and npm `11.19.0`: clean `npm ci`, typecheck, lint, a Webpack production build, and production HTTP checks passed. `/helpdesk` and the tickets, assets, reports and settings pages returned 200; the health endpoint returned `{"status":"ok","stage":1}` at `/helpdesk/api/health`; eight generated CSS/JS assets returned 200; and `/api/health` returned 404 as expected. `npm audit` reported zero vulnerabilities for the generated lockfile on 2026-10-26.

ESLint `9.39.5` is retained because Next.js's bundled ESLint plugins declare peer compatibility through ESLint 9; npm marks the ESLint 9 release line as no longer supported. The next compatible Next.js lint-plugin release should be reviewed before moving ESLint to 10. The cPanel Node runtime, Passenger startup method, and production host configuration remain unverified.

The application is configured for the `/helpdesk` base path. Stage 1 includes only the shell, route placeholders and health endpoint; it has no authentication, database, real ticket data, or production workflows.

See [docs/architecture.md](docs/architecture.md) for schema decisions and boundaries, [docs/database-migrations.md](docs/database-migrations.md) for the guarded migration procedure, and [docs/cpanel-compatibility-checklist.md](docs/cpanel-compatibility-checklist.md) for unresolved hosting checks.
