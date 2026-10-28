# Operations and backup

## Current limits

No production deployment or database access was performed. The app has not passed an actual cPanel/Passenger HTTP test. Never run the legacy reset as part of routine release or startup.

## Database operation boundary

Use the intended new database `ucegcom_uppingham_helpdesk`, never the legacy `ucegcom_helpdesk`. Before any schema initialization, verify the database name and server identity using the documented read-only diagnostic, confirm a valid backup or explicitly disposable empty database, separate a least-privilege runtime identity from the migration identity, and obtain explicit operator approval. Migrations run only as a separate manual command; never from build or startup. MariaDB DDL can implicitly commit, so a failed migration may need a forward repair rather than rollback.

## Backup and restore requirements

- The database administrator must schedule encrypted database backups and retain copies outside the hosting account. Record backup time, database/server identity, byte count, and SHA-256 digest.
- Rehearse restoration into an independently named disposable database on the intended MariaDB family/version. Review table counts and application invariants without copying old personal data into this new project.
- Keep private attachment storage in an account-owned directory outside every public web root; include it in an access-controlled backup plan and test restore permissions and ownership.
- Record who verified the restore and where evidence is stored. A filename or self-asserted success flag is not evidence of a valid restore.

## Restart and rollback

Before deployment is separately approved, capture the deployed source revision and cPanel application settings. A release rollback restores the prior application files and matching environment settings; it does not reverse DDL. Database recovery requires a reviewed forward migration or explicit restore plan. Do not change application root `/home/ucegcom/helpdesk`, public URL `/helpdesk`, runtime selection, or Passenger startup through this document.
