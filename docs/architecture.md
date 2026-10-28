# Architecture and compatibility decisions

## Current implementation update (2026-10-26)

The ticket domain has bounded validation and the status transitions defined by migration `0001`. Its repository loads active permissions from MariaDB, uses parameterized operations and row locks, scopes requester reads, filters internal notes/activity, and writes history/audit rows transactionally. Asset services add permission-checked inventory, creation, assignment and retirement with lifecycle validation, history, and audit. The report service returns aggregate ticket status counts only; notification operations are scoped to the recipient; the admin service currently reads reference data only. Fake-connection tests cover the authorization boundary. Route Handler shells for these features return `503 authentication_unavailable` before calling services until trusted Entra sessions and database-backed identity resolution are connected. The pages show unavailable states and do not fetch records.

Auth.js remains the candidate because official `next-auth@5.0.0-beta.32` package metadata lists peer ranges including Next 16 and React 19, and the package documents a Microsoft Entra ID provider. The npm `beta` tag resolves to that version, while stable `latest` is v4. The v5 package is still beta. GitHub advisories published 2026-07-20 list beta.32 as patched for cited issues affecting beta.31 and earlier. It was not installed because `npm ping`, metadata, and audit requests failed with `ENOTFOUND registry.npmjs.org`; its tarball, full dependency tree, and project audit remain unverified. Do not hand-edit the lockfile or implement a custom OAuth/OIDC protocol as a substitute.

Reviewed 2026-10-26. This document records the current implementation, official compatibility evidence, proposed design, and unresolved host-dependent choices. The initial schema, migration tooling, and ticket service layer are present; no live database was accessed and authentication remains unimplemented.

## Verified project state

- Runtime used for Stage 1 validation: Node.js `v24.21.0`, npm `11.19.0`, Windows x64.
- Installed direct dependencies (`npm ls --depth=0`): Next.js `16.4.3`, React `19.3.1`, React DOM `19.3.1`, Tailwind CSS `4.3.3`, `@tailwindcss/postcss` `4.3.3`, TypeScript `5.9.3`, `@types/node` `22.20.5`, `@types/react` `19.3.0`, `@types/react-dom` `19.3.0`, `eslint-config-next` `16.4.3`, ESLint `9.39.5`.
- The installed Next package declares Node `>=20.9.0`; `package.json` currently declares `>=20.9.0 <25`.
- `next.config.ts` sets `basePath: "/helpdesk"`. Next applies this at build time. The production build script uses `next build --webpack`; Webpack build and local production routes/assets passed Stage 1 checks. This is local evidence only.
- `mariadb@3.5.4` is an exact runtime dependency. Its official package metadata requires Node `>=20.0.0`; the project engine range (`>=20.9.0 <25`) and local Node `24.21.0` satisfy that requirement. No ORM or authentication package is installed.
- `src/server/db/pool.ts` defines a lazy bounded MariaDB pool; `src/server/db/transaction.ts` provides a transaction wrapper. They are infrastructure only and are not imported by pages/routes. No DB credentials were added.
- `migrations/0001_*` through `0004_*` define a fresh schema and static role/permission/status/priority reference values, including a forward grant for technician internal notes. `scripts/migrate.mjs` and `scripts/migration-utils.mjs` provide explicit, ordered/checksummed migration application. The runner was not invoked; no database was contacted.
- `.env.example` contains placeholders only. Runtime credentials must remain server-only and out of client bundles, source control, and logs.

## Node.js recommendation

**Recommended cPanel selection: Node.js `24.22.1`.** This is a recommendation, not a host change.

Next.js 16 requires Node `20.9.0` or newer and no longer supports Node 18. The exact installed Next 16.4.3 package also declares `node: >=20.9.0`. Of the cPanel menu choices, Node 18.20.8 is below the requirement; Node 20.20.2 satisfies the framework minimum but the Node project now marks the 20 line EOL; Node 22.23.4 and 24.22.1 are published LTS releases. Node 24.22.1 is the newest LTS option in the supplied menu and stays within this package's `<25` engine range. It is also the same major as the locally validated Node 24.21.0. The Node 24 LTS line is scheduled for support through April 2028. These facts make 24.22.1 the best fit; they do not prove Passenger, the provider's Linux image, or native build/runtime behavior.

Before selecting it, resolve the CloudLinux `node_modules` location warning without removing or relocating any existing server files. Confirm the provider exposes the exact binary/version to dependency installation, build, and Passenger. Use the Selector-managed install/build controls; run `npm ci` only if the provider confirms it is supported for that virtual environment. Do not change the panel selection based on local assumptions.

## Database plan: MariaDB 10.6.28

### Recommended access layer (installed; no database used)

Use the official MariaDB Connector/Node.js Promise API (`mariadb`) directly rather than adding an ORM in the first implementation. Version `3.5.4` is pinned and lockfile-resolved. Its official package metadata requires Node `>=20.0.0`; it provides TypeScript definitions, pooling, placeholders, `execute()` and transactions. This fits the project's Node 24 choice and MariaDB target while keeping SQL/schema behavior explicit. `npm audit` should be rerun when the lockfile changes, and cPanel Linux install/runtime compatibility remains unverified.

### Query and connection rules

- Use a single process-wide bounded pool, initialized lazily on the Node server. Set a finite `connectionLimit` after confirming the host's per-database connection quota and expected Passenger process count; account for concurrent processes/restarts when calculating the total. Emit safe operational metrics, never passwords or SQL values.
- Prefer `pool.query(sql, values)` for one-off parameterized statements. Use `connection.execute(sql, values)` for frequently repeated prepared statements. Bind all values; identifiers/order clauses must come from a closed server-side allowlist because bind parameters do not represent SQL identifiers. Keep multi-statement mode disabled.
- For a multi-step business operation, acquire one pool connection, begin an InnoDB transaction, execute all related DML on that connection, commit on success, rollback on any failure, and release in `finally`. Do not keep transactions open during network calls, email delivery, or file streaming.
- Use InnoDB for transactional tables, foreign keys and constraints. Runtime DB credentials should have only required DML privileges. Use a separate migration identity for schema changes, if the host permits it.

### Migration plan

Use ordered, reviewable SQL migration files plus a small Node runner and migration ledger (migration ID, checksum, applied timestamp and runner version). Apply in order, stop on first failure, detect modified checksums, and serialize migration execution with a MariaDB advisory lock. The runner requires separate `MIGRATOR_DATABASE_URL`, explicit approved database and exact host arguments, and a backup confirmation. It verifies `DATABASE()` and `@@hostname` before DDL and refuses the known legacy database name. It is an operator-invoked tool, not an app-start hook. Fresh initialization and repeat/no-op behavior still need verification against an isolated disposable MariaDB 10.6 instance; none was available/used in this task.

MariaDB 10.6 has atomicity for supported individual DDL statements, but DDL statements cause implicit commits; a sequence of `CREATE`/`ALTER` statements is not one rollbackable transaction. Treat a failed multi-statement migration as potentially partially applied: stop, inspect recorded and actual schema state, then repair with an explicit forward migration or documented manual recovery. Do not promise automatic rollback for DDL. Test data changes separately from DDL and document backup/restore recovery.

### Database lifecycle blocker

MariaDB Community Server 10.6 reached end of maintenance on 2026-07-06; the MariaDB announcement describes 10.6.28 as the final 10.6 release (2026-08-13). That means no further community fixes/security updates for the branch after EOL. Before production use, the school/host must confirm either that this is a supported Enterprise 10.6 service with applicable maintenance, or authorize a move to a maintained MariaDB series. The app can be developed against 10.6.28 in an isolated test database, but this documentation does not endorse an unmaintained community database as a production security posture.

## Microsoft Entra ID, Auth.js and authorization plan

- Use Auth.js for Next.js with its built-in Microsoft Entra ID OIDC provider. Restrict the issuer to the school's single tenant; do not use the `/common` issuer for this internal school portal.
- Use verified Entra `tid` plus immutable `oid` as the external identity key. Do not key users or authorize access by mutable email, UPN, display name or browser-supplied IDs.
- Persist internal user profiles and role/permission mappings in MariaDB. Initial roles: Admin, IT Technician, Staff/Requester. Model permissions separately from roles so Auditor/Manager and department/asset-custodian permissions can be added. The Entra allowlist controls admission/bootstrap; MariaDB is the authority for current active state and app permissions. Decide and document whether allowlisted groups synchronize roles or only permit sign-in before implementation.
- Proposed session: Auth.js encrypted JWT/JWE cookie, server-only secret, HTTPS-only `Secure`, `HttpOnly`, `SameSite=Lax`, short bounded lifetime, built-in state/PKCE/CSRF protections. Expose only a minimal internal user ID to the client; never return Entra access/refresh tokens or trust a client-carried role. On every protected Route Handler, Server Action, download, and server data operation, validate the Auth.js session, load the active internal user and current permissions from MariaDB, and authorize against server-loaded record ownership. An optional Next `proxy.ts` can redirect unauthenticated page navigation but is not an authorization boundary.
- Disable/revoke must take effect by database re-check; consider a per-user session version/revocation marker. Decide the session lifetime, forced-revocation behavior, Entra group-overage strategy and whether any Graph permission is acceptable. Fail closed on missing/overage group evidence unless the approved Graph lookup succeeds.
- Auth.js documents `AUTH_URL` path and `basePath` support. The exact API route and redirect must be tested with Next `basePath` before registering the Entra app. Expected external callback is likely `https://<canonical-host>/helpdesk/api/auth/callback/microsoft-entra-id`; confirm the actual generated URL in a real OIDC test and then register that exact HTTPS redirect URI. Auth.js `basePath`, `AUTH_URL`, Next's build-time `/helpdesk`, cookie path and logout redirects must agree. Do not assume root-path examples work unchanged.
- Credentials: use the Auth.js-documented `AUTH_MICROSOFT_ENTRA_ID_ID`, `_SECRET`, `_ISSUER`, `AUTH_SECRET` names in hosting secrets only. Do not put secrets in `.env.example` with real values.

## Private attachment storage plan

- Persist attachment bytes on the same account-owned filesystem, in a configured directory outside both `public_html` and the app's static/public directory. The sample `.env.example` path is illustrative, not verified or safe to use as-is. Obtain the real home path, filesystem, quota, backup policy and access rights from the provider.
- Directory owner must be the app's cPanel account. Target directory permissions `0700`, file permissions `0600` (subject to host's supported mode semantics); prevent Apache/Passenger static serving and directory listing. Do not depend on symlinks or an unverified `open_basedir` exception. At startup, reject a missing, public-web-root, non-directory, wrongly-owned/unwritable path where those checks are available.
- Use server-generated cryptographically random storage keys; keep the original display filename only as sanitized metadata. Never join a client path into filesystem paths. Canonicalize the configured root and resolved target, enforce containment, disallow symlinks, and use exclusive creation.
- Define a configurable maximum byte count and enforce it while streaming (and at the reverse proxy if configurable), not only from `Content-Length`. Use an allowlist of approved extensions and detected file signatures/MIME; reject mismatches, executable/script formats, empty/oversized files and unsafe filenames. The school must approve the actual file types/size limit and decide whether malware scanning is available.
- Upload workflow should reserve metadata, stream to a temporary private filename with byte counting, finalize atomically, and clean up partial/orphan files on failure. Store metadata and ticket relationship in MariaDB. Downloads go through an authenticated Node route that reloads the related record and authorizes the requester/technician/admin before opening the file. Return safe `Content-Disposition`, `X-Content-Type-Options: nosniff`, no-store, and no public URL. Test traversal, symlink, unauthorized, stale metadata, missing file and concurrent access cases.

## `/helpdesk`, Webpack and cPanel/Passenger

- Verified in current config: `basePath: "/helpdesk"`; Next's official docs say this is build-time configuration and prefixes `next/link` navigation and Next-managed routes/assets. Stage 1 production HTTP checks confirmed the pages, static assets and health endpoint at `/helpdesk` locally. Any raw fetch, `public/` asset URL, Auth.js endpoint, callback/logout URL or email link must be explicitly audited for prefix correctness.
- The package build command is `next build --webpack` because the default Turbopack build reproducibly panicked in the validated Windows environment during CSS child-process startup. Webpack avoids that issue, but the current local build attempt still fails intermittently with `EPERM` while creating `.next/types/app/reports`; direct create/remove probes in that directory succeed, so the underlying Next/Windows failure remains unresolved. A prior Stage 1 build passed, but that does not make the current failure a pass. Verify a clean Linux production build on cPanel; do not infer Linux compatibility from Windows.
- The user confirmed the existing CloudLinux Node.js Selector app root `/home/ucegcom/helpdesk`, URL `/helpdesk`, virtual environment `/home/ucegcom/nodevenv/helpdesk/20`, Node `20.20.2`, npm `10.8.2`, and startup filename `server.js`. The local startup source is aligned to `server.js` and uses a single CommonJS Passenger server with Next's custom-server API. Next's standard `next start` CLI also reads `PORT`, but CloudLinux's configured startup-file runner starts the named `.js` file rather than the npm script. Node `24.22.1` meets the project and dependency engine requirements and is preferred over the EOL Node 20 line, but changing versions causes CloudLinux to reinstall app packages. The user reports both an app-root `node_modules` directory and a virtual-environment module directory; their exact ownership/symlink relationship is unverified, so do not remove either until inspected.
- Required host confirmations: cPanel/WHM version and UI (Application Manager vs Web Apps), Node runtime availability to build and start, Passenger version/process contract, build command and working directory, Node/npm package install behavior, filesystem permissions and private path, environment variable handling/restart behavior, database host/version/maintenance tier/connection quota/TLS, proxy upload/body/timeout limits, backups and restore, outbound HTTPS to Entra, and canonical HTTPS hostname.

## Implementation sequence and acceptance criteria

1. **Database foundation (current stage)** — confirm database support tier/version; implement InnoDB entities/indexes/FKs, the pinned connector, versioned migrations, grant split and transaction helper. Completed offline: schema/runner/tests are added and the migration runner is guarded. Acceptance still outstanding: run migrations and repeat/no-op against a disposable isolated MariaDB version approved for development; add integration checks for parameter binding, pool behavior, transaction rollback, locking and failure recovery; review grants with the actual host. No production connection may be used.
2. **Authentication/authorization** — implement Auth.js Entra OIDC, tenant issuer, identity mapping, profile/role schema, allowlist and server authorization helpers. Pass: exact `/helpdesk` callback verified against registered Entra app; tests for invalid issuer/claims, missing/overage groups, inactive account, role changes, session expiry/revocation, protected API and forged client role; only HTTPS secure session cookie in production.
3. **Ticket workflows** — implement creation/reference allocation, assignment, status transitions, resolution/reopen, filters/paging and timeline. Pass: concurrency-safe unique references; permission and transition matrix tests; all writes audited; server-side authorization for every mutation/list/detail/export; no placeholder counts.
4. **Comments and attachments** — implement public/internal note policy, immutable notes, private file lifecycle and authorized download. Pass: public response/search/export/notification tests cannot contain internal notes; policy-specific note reads/writes; traversal/symlink/size/type/MIME/unauthed download and partial-upload cleanup tests.
5. **Asset lifecycle** — CRUD/import/assign/transfer/history, ticket linking and retirement. Pass: retired assets cannot be assigned; concurrent assignment rules; actor/reason/timestamp history; CSV import validation and export authorization.
6. **Settings and SLA** — categories/location/reference values, status transitions, priority policy snapshots, business calendars/holidays/pauses. Pass: elapsed/business-time boundary tests, DST/holiday cases, pause policy tests, policy edits do not silently rewrite existing ticket deadlines; disabled references remain readable historically.
7. **Notifications and reports** — durable idempotent in-app events, optional explicit email, operational metrics/CSV exports. Pass: recipient matrix and duplicate-delivery tests; internal notes never leave to requester; SLA/response metrics computed from real rows; filters and export authorization enforced.
8. **Audit and production readiness** — append-only protected sensitive event stream, backups/restore, least privilege, security and host verification. Pass: tamper/permission tests; secrets/attachments excluded from logs; restore rehearsal; clean Linux build and production-mode cPanel/Passenger test on confirmed runtime; security audit and all integration tests pass before deployment planning.

## Official references

- [Next.js 16 upgrade guide and Node minimum](https://nextjs.org/docs/app/guides/upgrading/version-16)
- [Next.js installation requirements](https://nextjs.org/docs/app/getting-started/installation)
- [Next.js `basePath`](https://nextjs.org/docs/app/api-reference/config/next-config-js/basePath)
- [Next.js production deployment](https://nextjs.org/docs/app/getting-started/deploying)
- [Next.js CLI: `next start` and `PORT`](https://nextjs.org/docs/app/api-reference/cli/next)
- [Next.js custom server caveats](https://nextjs.org/docs/app/guides/custom-server)
- [Node.js release status](https://nodejs.org/en/about/previous-releases)
- [Node.js v24.22.1 LTS release (2026-10-21)](https://nodejs.org/en/blog/release/v24.22.1)
- [MariaDB Connector/Node.js guide and current release](https://mariadb.com/docs/connectors/mariadb-connector-nodejs/mariadb-connector-node-js-guide)
- [MariaDB Connector Promise API: execute, pool and transactions](https://mariadb.com/docs/connectors/mariadb-connector-nodejs/connector-nodejs-promise-api)
- [MariaDB Connector package metadata (version and supported Node engine)](https://www.npmjs.com/package/mariadb)
- [MariaDB transaction statements and implicit commits](https://mariadb.com/docs/server/reference/sql-statements/transactions/sql-statements-that-cause-an-implicit-commit)
- [MariaDB 10.6.28 final release announcement](https://mariadb.com/resources/blog/mariadb-community-server-10-6-28-now-available/)
- [MariaDB Community 10.6 end-of-maintenance announcement](https://mariadb.org/mariadb-server-10-6-reaches-end-of-life-on-july-6th/)
- [Auth.js Microsoft Entra ID provider](https://github.com/nextauthjs/next-auth/blob/main/docs/pages/getting-started/providers/microsoft-entra-id.mdx)
- [Auth.js resource protection](https://authjs.dev/getting-started/session-management/protecting)
- [Auth.js session and `basePath` reference](https://authjs.dev/reference/nextjs)
- [Microsoft Entra immutable `tid`/`oid` claims](https://learn.microsoft.com/en-us/entra/identity-platform/claims-validation)
- [Microsoft Entra group claim overage](https://learn.microsoft.com/en-us/entra/identity-platform/access-token-claims-reference)
- [Microsoft Entra redirect URI requirements](https://learn.microsoft.com/en-us/entra/identity-platform/reply-url)
- [cPanel Node.js application startup instructions](https://docs.cpanel.net/knowledge-base/web-services/how-to-install-a-node.js-application/)
- [cPanel Passenger application overview](https://docs.cpanel.net/knowledge-base/web-services/using-passenger-applications/)
- [cPanel Web Apps process controls](https://docs.cpanel.net/cpanel/meridian/websites/manage-a-nodejs-app/)
