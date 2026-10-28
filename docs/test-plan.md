# Test plan

## Offline tests

Run `npm test`. Tests are safe without `DATABASE_URL`; they cover migration checksum/order/safety, ticket validation/transitions/authorization, trusted identity mapping, fail-closed API shells, request validation, and fake connection writes. They must not connect to production or any live database.

## Static and build checks

Run `npm run typecheck`, `npm run lint`, and `npm run build` separately. The suite now includes fake-connection tests for ticket and asset authorization/lifecycle behavior, report permission checks, recipient-scoped notification access, admin reference read gates, transaction rollback, and API fail-closed responses. These do not substitute for live MariaDB integration. Build failures from Windows `.next` EPERM should be recorded exactly and must not be relabeled as a code pass. The cPanel native SWC/GLIBC issue and WASM fallback are host-specific and require the separate clone.

## Required future test suites

- Auth.js callback/session and tenant/claim validation using safe provider mocks; inactive identity, missing claims, group overage, role changes, expiration, open redirect, and base-path callback.
- API/page denial without session, denial for inactive user, DB-loaded role checks, requester record isolation, and forged client user/role attempts.
- Database-isolated tests for create/list/detail, concurrent unique ticket numbers, transitions, assignments, public/internal comment filtering, audit writes, transaction rollback, and migration installation/repeat behavior.
- Attachment tests for size/type/signature validation, traversal/symlink protection, private permissions, partial-upload cleanup, and authorized downloads.
- Asset lifecycle, report filters/exports, SLA/holiday/time-zone boundaries, notification deduplication, and admin settings authorization.
- Production HTTP tests under the real `/helpdesk` base path on a disposable cPanel clone, followed by separate host/security approval.

## External tests not performed

No real Entra tenant, MariaDB server, cPanel Passenger process, scanner, or production HTTP endpoint was contacted in this implementation pass.
