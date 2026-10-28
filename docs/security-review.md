# Security review

Reviewed 2026-10-26. This is an interim code review, not a penetration test or production security approval.

## Implemented controls

- New ticket inputs and list filters have bounded server-side validation.
- Permission decisions are loaded from active user/role/permission rows; request payloads do not carry roles. SQL values for ticket repository operations are parameterized. Dynamic predicates are fixed code branches, not user-provided SQL fragments.
- Ticket creation writes activity and audit records within the same caller-owned transaction. Status transitions lock the ticket row, enforce the migration-defined transition matrix, and write activity/audit records.
- Ticket list/detail queries scope users without `ticket.read.all` to their own requester ID. Service actor input contains only the authenticated internal user ID; permissions are queried from MariaDB for each operation.
- No secrets, live database access, data reset, migration execution, or deployment occurred.
- Protected ticket Route Handlers return only `503 authentication_unavailable` while the Auth.js adapter is absent; tests verify that the service layer is not reached. Mutation handlers enforce same-origin `Origin`, JSON content type, and a 32 KiB streaming body limit.
- A separate identity resolver checks configured tenant, issuer, and Entra object ID, then requires a pre-provisioned active local identity with active DB roles. It ignores extra session `userId`/`roles` fields. It does not validate provider tokens and must only receive Auth.js-verified claims.

## Critical incomplete controls

- Auth.js authentication is not implemented. Route handlers cannot yet resolve sessions; they fail closed with 503. Before enabling them, connect Auth.js-verified `tid`/`oid`/`iss` to the local identity resolver and use current DB permissions on every request.
- No rate limiting, attachment storage/download, asset APIs, reporting authorization, or admin audit UI exists. Comment visibility is enforced in repository queries and covered by offline tests.
- There is no live database test; transaction behavior is covered only by the existing helper and fake-connection unit tests.
- Ticket and asset repositories enforce database-backed permissions and ownership/lifecycle checks; narrow report, notification, and admin-reference services are also present. Their API handlers fail closed with 503 until Auth.js is connected, and the pages show explicit unavailable states without data requests. No data workflow is yet reachable by users.

## Deployment posture

Do not deploy this intermediate implementation. Keep production `/helpdesk` and the database untouched. The previously rejected ZIP signature remains unresolved; do not create/re-upload an archive to avoid scanning. Resolve Auth.js dependency installation, complete authorization and the functional UI, test on isolated MariaDB/cPanel clone, obtain scanner review, and explicitly approve deployment as separate steps.

## Dependency advisory status

`npm audit --registry=https://registry.npmjs.org/` failed because the registry's advisory endpoint could not resolve (`ENOTFOUND registry.npmjs.org`). This is an unavailable result, not a zero-vulnerability result. The existing lockfile was not changed. Re-run `npm audit` after registry connectivity returns, before selecting/installing the authentication package.
