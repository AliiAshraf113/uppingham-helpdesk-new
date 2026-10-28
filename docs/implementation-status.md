# Implementation status

Reviewed and updated 2026-10-26. This is an implementation report, not a production-readiness declaration.

## Existing and newly implemented

- Next.js 16.4.3 App Router, React, Tailwind CSS v4, `/helpdesk` base path, Passenger `server.js`, MariaDB Connector 3.5.4, and the existing guarded migration runner are present.
- Four migrations define identity/roles, reference data, assets, tickets, status transitions, SLA snapshots, comments, audit/activity, notifications, attachment metadata, and the IT technician internal-note permission grant. They have not been run against any database in this work.
- The health endpoint is a minimal application liveness response. It does not test database readiness.
- This update adds a ticket domain module with bounded input/search validation and the status transition matrix from migration `0001`.
- The ticket repository implements parameterized creation/listing, assignment, status transitions, details, public comments and internal notes. Each operation loads permissions from the current active-user/database role rows; mutation entry points use the existing transaction helper and write ticket activity/audit rows. Requester detail queries exclude internal notes and internal-only activity.
- Auth.js `5.0.0-beta.32` is locked and installed. `auth.ts` configures the single-tenant Microsoft Entra OIDC provider, encrypted JWT session cookies, the `/helpdesk/api/auth` base path, an eight-hour maximum session age, and fail-closed runtime environment validation. OIDC `tid`, `oid`, and `iss` claims are checked after Auth.js verifies the ID token; sign-in is allowed only for an already-linked active local account with active database roles. The provider requests only `openid profile`; no Graph profile-photo or email access is needed for authorization.
- The signed session contains only verified tenant/object/issuer claims and a session-version snapshot; no local user ID, roles, or permissions are trusted from the browser. Every protected server request resolves identity through MariaDB, verifies the current session version, and loads current roles/permissions from database assignments. Missing configuration returns 503, missing/invalid sessions return 401, and disabled/unlinked identities fail closed.
- Ticket API handlers for list/create/detail/status/assignment/comments now use the real Auth.js session-to-local-principal path. Mutation handlers retain same-origin and bounded JSON validation. Service-level authorization enforces requester scope, role permissions, lifecycle, and internal-note visibility.
- Asset services now provide permission-checked listing, creation, assignment and retirement with validation, row locks, history and audit writes. Reports expose only aggregate ticket counts after `report.read`; notifications are recipient-scoped and can be marked read; administration currently reads reference data after `settings.manage`. No service was connected to a live database.
- Asset, report, notification and admin API handlers also use the shared authenticated principal. Their service layers remain incremental. Tickets now has protected list/search/status filtering and creation UI, a protected ticket detail/conversation view, status/assignment/reply/internal-note controls, and explicit authentication, permission, empty, and service-error states. These flows have not been tested against a live database or actual Entra tenant.
- Offline tests exercise Auth.js configuration validation, verified claim mapping, missing/stale sessions, account linking and database role resolution, ticket route failures, requester scope, role failures, public/internal comment visibility, assignment, bound SQL values, and audit writes through fake connections.

## Still missing

- Live Entra tenant sign-in, callback registration, local account provisioning, real database role resolution, session revocation, and cPanel cookie/proxy behavior have not been exercised. Without valid runtime environment values, the app correctly returns `503 authentication_unavailable`.
- Ticket UI/API logic is implemented but needs integration testing with a disposable MariaDB database and Entra test tenant. Asset UI workflows, attachments, SLA calculations, notification generation/delivery, report filters/exports, and administrative mutations remain incomplete.
- No live Entra sign-in, database integration, cPanel Passenger, or deployment test has occurred.

## Security and data boundaries

- This work did not connect to MariaDB, run migrations/resets, use production credentials, modify hosting, or deploy/upload/create an archive.
- Do not expose the current routes as a Helpdesk before authentication is implemented. Never pass a browser-provided user ID or role to the service; use an active identity and roles loaded from the database after validating an Entra session.
- SQL values in the new repository use connector bind parameters; search/status/order clauses are selected from fixed server code. Ticket descriptions are plain text and must be rendered escaped by React.
- The runtime database, migrator separation, exact new database target, TLS configuration, private storage path, Entra tenant/group policy, and host process limits still require operator verification.

## Checks and remaining blockers

- Offline `npm test`: 40 tests passed through fake connections; no live MariaDB tests were run.
- `npm run typecheck`: passed after the Auth.js and ticket UI changes.
- `npm run lint`: rerun after final changes; see current turn report.
- `npm run build`: rerun after final changes; Windows `.next` EPERM has previously been intermittent and its cause is unconfirmed.
- cPanel behavior has not been tested. The cPanel clone previously used the WASM SWC fallback and limited concurrency but did not prove HTTP application behavior.
- Registry execution capability: tool inventory exposes the Codex sandbox command runner, but no supported bridge to the user's normal PowerShell process. The Windows UI automation skill also prohibits sending terminal commands through the UI. Therefore the user's normal-PowerShell `nslookup`, TCP 443 and `npm ping PONG` results cannot be executed or independently reproduced from this Codex session. In this environment, `npm ping` and Node `dns.lookup` return `ENOTFOUND`; no DNS/proxy/security settings were changed. The npm offline cache has no cached `next-auth` metadata (`ENOTCACHED`). `npm audit` could not retrieve advisories; no dependency was installed.
- Package versions: `next-auth@5.0.0-beta.32`, `@auth/core@0.41.3`, `next@16.4.3`, `react@19.3.1`, and `react-dom@19.3.1`. The user reports `npm audit` returned zero vulnerabilities after installation in normal PowerShell. This Codex execution environment still cannot resolve `registry.npmjs.org`; its own `npm ping --fetch-retries=0` returned `ENOTFOUND`. An audit from this environment could not contact the registry.
- **Next blocker:** supply and securely configure actual Entra app settings plus local database identity/role rows, then test sign-in and workflows against a disposable integration environment. Production database access, hosting settings, deployment, and cPanel verification remain intentionally untouched. The Windows build must also pass or be verified in a comparable Linux build environment.
