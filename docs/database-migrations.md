# Database migrations and initialization

Reviewed 2026-10-26. The normal initialization procedure remains for a new empty database. A separate, narrowly scoped reset procedure is prepared for the existing `ucegcom_helpdesk` name, but it has not been run. No database connection or migration was performed while preparing this document.

## Scope and current state

The SQL files under `migrations/` create a new schema only. They contain no copied profiles, tickets, assets, category values, settings, attachments or other legacy records. A few fixed application role/permission/status/priority values are inserted as schema reference data. The old SQL dump is not imported. The regular `db:migrate` runner continues to refuse `ucegcom_helpdesk`.

The runner uses a separate `MIGRATOR_DATABASE_URL`, verifies the connected database and server hostname, serializes execution with a MariaDB advisory lock, checks migration sequence/checksum history, and records each migration after its statements complete. The application runtime uses `DATABASE_URL` and should be granted only the DML privileges its future routes need. Do not point the runtime credential at a production database before the application is approved.

## Read-only target diagnostic

`npm run db:diagnose` is separate from migration and reset. It connects only to the fixed `ucegcom_helpdesk` target at `s1478.lon1.mysecurecloudhost.com:3306`, runs one `SELECT DATABASE(), @@hostname, @@port, VERSION()` query, verifies the confirmed identity/version, prints only those non-secret values, and closes the connection. It imports no migrations and performs no DDL or DML. It refuses if the TLS setting is unset, if `NODE_TLS_REJECT_UNAUTHORIZED=0`, or if any returned identity differs. With confirmed TLS, run without flags. If TLS is explicitly confirmed unavailable/not required, `MARIADB_TLS=false` requires the explicit `--approve-no-tls` flag; this uses plaintext and should be treated as a security trade-off, not a silent fallback.

## Before initialization

1. Obtain explicit approval from the database owner for the exact new database and the exact initialization window. Confirm the intended database name is `uppingham_helpdesk`; do not use the legacy database.
2. Confirm database identity independently in the hosting panel/provider console: database name, host, account, server product/version and maintenance tier. Confirm that the hostname matches the value the operator will pass to the migration command. Do not infer identity from a copied connection string alone.
3. Confirm this database is new and empty, or obtain and verify a current backup with a documented restore method. For any non-empty database, stop and review its contents and migration compatibility before proceeding; this initial runner is for a fresh schema, not adoption of an existing schema.
4. Create separate least-privilege accounts. The runtime account should receive only required `SELECT`, `INSERT`, `UPDATE` and narrowly needed `DELETE` privileges. The migrator account needs schema DDL and migration-ledger privileges only for the target schema. Do not grant global privileges. Store credentials in the host's secret/environment settings, not source control, shell history, command arguments or logs.
5. Confirm the host's TLS requirement and configure `MARIADB_TLS` accordingly. Confirm network ACLs, TLS certificate validation behavior, connection quotas and backup policy with the host. The example connection strings are placeholders, not working credentials.
6. Review the exact committed migration files and checksums. Test first against a disposable isolated database using the same MariaDB product/version. Confirm the backup/restore path before any production initialization.

## Explicit command gate

After approval and identity/backup checks, provide the migrator credential through the protected environment and invoke the runner with the exact approved database and server hostname, for example:

```sh
npm run db:migrate -- --approve-database uppingham_helpdesk --approve-server db-host.example --backup-confirmed
```

The example hostname is illustrative. Substitute only the independently verified hostname. The runner logs the database name, host and server version after connection; it does not log credentials or SQL values. If the identity check fails, stop. Never use this command against `ucegcom_helpdesk` or while investigating the old dump.

Afterward, verify the schema migration ledger and expected tables using an approved read-only account, take a new backup, record the migration IDs/checksums and host version, and remove/unset the migrator credential. Do not grant the runtime account DDL permissions.

## DDL failure and rollback limits

MariaDB DDL statements cause implicit commits. A migration consisting of multiple `CREATE TABLE`/`ALTER TABLE` statements is not an atomic transaction: a failure can leave earlier statements applied while the migration ledger row is absent. The runner stops and does not attempt destructive cleanup. Do not blindly rerun a partially applied migration or edit a migration whose checksum may already be recorded. Stop, inspect actual schema and ledger state, preserve a backup, and prepare a reviewed forward-repair migration or restore from backup under the database owner's approval. “Rollback” means a tested restore or a separately authored forward change; it is not automatic SQL transaction rollback.

No destructive `DROP` or `TRUNCATE` statements are present in the initial migrations. This does not remove the need for a verified backup and approval.

## Prepared legacy-database reset (not executed)

The separate `npm run db:reset` command is fixed to the exact database name `ucegcom_helpdesk` and port `3306`. It does not change or relax `db:migrate`. It accepts no alternate database name, requires `MIGRATOR_DATABASE_URL` to name the same exact database and have the same host as `--approve-server`, then verifies `DATABASE()`, `@@hostname`, and `@@port` after connecting. `MARIADB_TLS` must be explicitly set to `true` or `false`; unset/other values refuse before connection. `false` additionally requires `--approve-no-tls`, so an unconfirmed default cannot silently use plaintext. It also requires `--approve-database ucegcom_helpdesk`, `--reset-existing-database`, and an interactive typed confirmation. The operator must choose exactly one data authorization mode: (a) `--backup-evidence <file>` with a recent signed backup/restore evidence record, or (b) `--data-disposable`, which explicitly authorizes permanent loss and skips the backup-evidence gate. The disposable mode requires typing `RESET ucegcom_helpdesk ON <host> DATA DISPOSABLE`; backup mode requires `RESET ucegcom_helpdesk ON <host>`.

In backup mode, before connecting, reset mode verifies that the evidence identifies this source database and host, a successful restore into a separate scratch database on the same server, a verifier, and a timestamp within 24 hours. It checks that the referenced backup artifact exists and that its byte count and SHA-256 digest match the evidence. The evidence must also carry a valid Ed25519 signature over all fields except the signature itself. The expected verifier ID and public key must be independently configured in the protected reset process environment as `RESET_BACKUP_VERIFIER_ID` and `RESET_BACKUP_VERIFIER_PUBLIC_KEY`; the evidence signer must be a different authorized person who reviewed the restore. A bare `restoreSucceeded: true`, a filename, or an unsigned/edited JSON file cannot pass validation. The backup must be taken after application writes are quiesced and immediately before the reset so the restored backup is current. In disposable mode, this evidence is not required: `--data-disposable` and the stronger typed confirmation record the user's explicit authorization to lose all existing data. Target/server checks, unexpected-object refusal, and interactive confirmation remain mandatory in both modes.

After identity verification and acquiring the migration advisory lock, reset mode reads `information_schema`. It refuses to proceed if any view or unrecognized table exists. The only removable objects are the fourteen legacy tables below, the new schema tables generated from this repository's migration files, and `schema_migrations`. It disables foreign-key checks for the session and issues an individual `DROP TABLE` for each recognized existing table. It does not drop the database, change accounts/grants, delete files, or import the old SQL dump. It then recreates the migration ledger, applies all ordered migration files in this project's `migrations/` directory, and records their checksums. Migration `0004_technician_internal_notes.sql` grants active IT technicians internal-note read/create permissions; it has not been applied.

The legacy tables and all rows they contain that would be removed are:

`profiles`, `tickets`, `ticket_comments`, `ticket_activity`, `assets`, `asset_history`, `notifications`, `sla_policies`, `ticket_categories`, `ticket_subcategories`, `buildings`, `system_settings`, `ticket_attachments`, and `ticket_upload_reservations`.

Any already-created new-schema tables in that same database, and any old `schema_migrations` ledger, are also removed before fresh initialization. The new schema includes only its fixed application reference values; it does not preserve or migrate old users, tickets, assets, uploads, settings, notifications or other personal data. Other unrelated tables, views, or unexpected objects cause a refusal before any table is dropped. Stored routines/events are not explicitly removed by this procedure and should be inspected during preflight; if present, stop and revise the procedure rather than assuming they are part of this application.

### Backup verification evidence

Before reset, the operator must:

1. Stop/quiesce all application writers and take a fresh logical dump of `ucegcom_helpdesk` to protected storage outside the project directory. Preserve it as the rollback source.
2. Compute the dump's byte length and SHA-256 digest (for example, PowerShell `Get-Item` and `Get-FileHash -Algorithm SHA256`). Keep the backup file readable by the reset process; the runner hashes it as a stream and does not print its contents.
3. In cPanel, open **Database Wizard** (called **Database Wizard** in newer versions, or **MySQL Database Wizard** in older versions), create a separate scratch database named `ucegcom_helpdesk_restore_YYYYMMDD_suffix`, and record its full actual name. cPanel may prepend the account prefix; the reset evidence validator accepts either the exact name or a cPanel prefix followed by that name. Create a temporary database user through the wizard and grant it privileges only on this scratch database. Do not reuse a production or migration user. If the account cannot create a second database, ask the provider to provision an isolated scratch database; do not use the target database for the restore test.
4. After inspecting the SQL export for database-level `CREATE DATABASE`, `DROP DATABASE`, and `USE` statements and confirming its target cannot switch to `ucegcom_helpdesk`, select only the scratch database in phpMyAdmin and import the export there. If the export contains statements that can switch/drop databases or its completeness is uncertain, stop and obtain a clean backup/export from the provider before import. Verify import exit/status, run the provider's integrity/check command, and compare expected table/row counts with a captured source inventory. Do not restore over either the source or the intended new schema.
5. Create a JSON evidence record matching this shape, with actual values and a UTC ISO timestamp. The reviewer signs the canonical JSON after all fields are final. The canonical form is generated by the project's `canonicalizeEvidence` helper, which sorts object keys recursively. Add the detached Ed25519 signature as base64 in `signature` and set `signatureAlgorithm` to `Ed25519` before signing; the signature covers `signatureAlgorithm` and every other evidence field, but excludes only the `signature` field.

```json
{
  "sourceDatabase": "ucegcom_helpdesk",
  "sourceServer": "<verified @@hostname>",
  "backupPath": "<protected absolute backup file path>",
  "backupBytes": 123456,
  "backupSha256": "<64 lowercase hex characters>",
  "restoreTestDatabase": "ucegcom_helpdesk_restore_20261026_ab12",
  "restoreTestServer": "<verified @@hostname>",
  "restoreSucceeded": true,
  "verifiedBy": "<operator name or ID>",
  "verifiedAt": "2026-10-26T12:00:00.000Z",
  "signatureAlgorithm": "Ed25519",
  "signature": "<base64 detached signature from independent reviewer>"
}
```

The signer must be an independent database/backup reviewer, not the person preparing or running the reset. They must inspect the dump command exit status, scratch-restore command exit status, database identity for the scratch restore, integrity-check output, and source-versus-restored table/row-count comparison, then sign the final evidence. The reset operator must use the public key and verifier ID supplied through a separately controlled environment setting; they must not generate a replacement key to approve their own evidence. The runner independently verifies the signature and hashes the backup artifact. The signature proves who attested to the recorded evidence; the human review of actual restore outputs establishes that the restore happened.

### Command after separate approval only

Do not run either command as part of preparation. Before running, the database owner must separately approve this exact destructive operation; an operator must independently confirm the database name and server hostname from the hosting panel, confirm the application writers are stopped and no other service depends on this database, arrange a maintenance window, and verify that the selected data authorization mode reflects the owner's decision. Set `MIGRATOR_DATABASE_URL` through the protected environment. Do not include credentials in shell history or command arguments. Run interactively:

```sh
npm run db:reset -- --approve-database ucegcom_helpdesk --approve-server <verified-host> --data-disposable --reset-existing-database
```

Before the reset command, confirm the provider's TLS requirement. If TLS is required, set `MARIADB_TLS=true`; the runner requests connector TLS. If the provider explicitly confirms TLS is not required/supported, set `MARIADB_TLS=false` and add `--approve-no-tls` to the command. If TLS is unconfirmed, do not connect or proceed. The operator must then type `RESET ucegcom_helpdesk ON <verified-host> DATA DISPOSABLE` at the prompt. This command intentionally does not require a backup; use it only because the database owner has expressly accepted the data loss. For backup mode instead, replace `--data-disposable` with `--backup-evidence <protected-evidence.json>` and prepare the signed evidence described above; the typed prompt then omits `DATA DISPOSABLE`. Never run in a pipeline or non-interactive shell; reset mode refuses without a TTY. After completion, verify the table list, migration IDs/checksums, and schema with a read-only account before enabling any application access.

### Reset failure and DDL limits

The reset is destructive and cannot be transactionally rolled back. Each `DROP TABLE`, `CREATE TABLE`, and other DDL can implicitly commit. A failure during drops can leave some legacy tables/data removed; a failure during fresh migrations can leave an incomplete new schema and a partial migration ledger. The runner does not attempt restoration automatically. Stop immediately, preserve the verified backup, inspect actual database state, and only recover by an explicitly approved restore to the correct database or a reviewed repair. A restore itself is destructive and needs a separate approval. The source backup and scratch restore are the recovery basis; no transaction or automatic rollback is promised.

The reset runner and target-validation tests are prepared but have not been connected to MariaDB. Signed backup evidence is required; no evidence file has been created. No reset, migration, table drop, or privilege change has been performed.

For cPanel menu/version details, see the official [Database Wizard](https://docs.cpanel.net/cpanel/databases/mysql-database-wizard/), [Manage My Databases](https://docs.cpanel.net/cpanel/databases/mysql-databases/), and [Backup Wizard](https://docs.cpanel.net/cpanel/files/backup-wizard/) documentation. The provider may expose renamed interfaces or disable database creation/import features for the account.

## Offline checks in this repository

The ticket repository uses the existing ticket schema. A separate forward-only migration `0004_technician_internal_notes.sql` grants active IT technicians the two internal-note permissions; it has not been applied. Ticket creation, assignment, status changes and comments use the transaction wrapper, and activity/audit rows are written with the mutation. Fake-connection unit tests cover SQL binding and write ordering, but only an isolated MariaDB integration test can verify actual server semantics. No database connection or migration was run for this implementation.

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

These checks do not require a database. The test suite validates migration filenames/order/checksums, migration planning, SQL statement splitting and structural invariants. A real MariaDB integration pass against a disposable database is still required before any host initialization.
