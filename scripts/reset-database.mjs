import mariadb from "mariadb";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { discoverMigrations, splitSqlStatements } from "./migration-utils.mjs";
import { parseResetTarget, RESET_DATABASE, RESET_PORT, ResetGuardError, resetConfirmationPhrase, validateBackupEvidence, validateResetArguments } from "./reset-safety.mjs";

const LOCK_NAME = "uppingham_helpdesk_schema_migrations";
const MIGRATIONS_DIRECTORY = fileURLToPath(new URL("../migrations/", import.meta.url));
const LEGACY_TABLES = [
  "profiles", "tickets", "ticket_comments", "ticket_activity", "assets", "asset_history",
  "notifications", "sla_policies", "ticket_categories", "ticket_subcategories", "buildings",
  "system_settings", "ticket_attachments", "ticket_upload_reservations",
];

async function confirmReset(database, server, dataDisposable) {
  if (!stdin.isTTY || !stdout.isTTY) throw new ResetGuardError("Reset requires an interactive terminal for the final typed confirmation.");
  const prompt = createInterface({ input: stdin, output: stdout });
  try {
    const expected = resetConfirmationPhrase(database, server, dataDisposable);
    const dataWarning = dataDisposable ? " The user has authorized permanent loss of the existing data." : "";
    const answer = await prompt.question(`This will permanently remove application tables from ${database} on ${server}.${dataWarning} Type exactly: ${expected}\n> `);
    if (answer !== expected) throw new ResetGuardError("Typed reset confirmation did not match; nothing was changed.");
  } finally {
    prompt.close();
  }
}

async function getProjectTables(migrations) {
  const names = new Set(["schema_migrations", ...LEGACY_TABLES]);
  for (const migration of migrations) {
    for (const statement of splitSqlStatements(migration.sql)) {
      const match = /^\s*CREATE\s+TABLE\s+([a-zA-Z0-9_]+)\s*\(/i.exec(statement);
      if (match) names.add(match[1]);
    }
  }
  return names;
}

async function resetAndMigrate(options) {
  const target = parseResetTarget(process.env.MIGRATOR_DATABASE_URL, options.server, options.approveNoTls);
  const backup = options.dataDisposable ? null : await validateBackupEvidence(options.evidence, options.server);
  const migrations = await discoverMigrations(MIGRATIONS_DIRECTORY);
  const expectedTables = await getProjectTables(migrations);

  if (backup) {
    console.log(`Verified backup file digest (${backup.backupBytes} bytes), recorded restore test database=${backup.restoreTestDatabase}, verifier=${backup.verifiedBy}`);
  } else {
    console.log("Explicit data-disposable authorization selected; no backup evidence is required. All existing application data will be lost.");
  }
  await confirmReset(RESET_DATABASE, target.host, options.dataDisposable);

  const connection = await mariadb.createConnection(target.config);
  let lockHeld = false;
  let foreignKeyChecksDisabled = false;
  try {
    const [identity] = await connection.query(
      "SELECT DATABASE() AS database_name, @@hostname AS server_name, @@port AS server_port, VERSION() AS server_version",
    );
    if (identity.database_name !== RESET_DATABASE || identity.server_name.toLowerCase() !== options.server.toLowerCase() || Number(identity.server_port) !== RESET_PORT) {
      throw new ResetGuardError("Connected database/server identity does not match the exact reset approval.");
    }
    console.log(`Verified reset target database=${identity.database_name} server=${identity.server_name} version=${identity.server_version}`);

    const [lockResult] = await connection.query("SELECT GET_LOCK(?, 30) AS acquired", [LOCK_NAME]);
    if (Number(lockResult.acquired) !== 1) throw new ResetGuardError("Could not acquire the migration lock.");
    lockHeld = true;

    const objects = await connection.query(
      "SELECT TABLE_NAME AS object_name, TABLE_TYPE AS object_type FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME",
    );
    const unexpected = objects.filter(({ object_name, object_type }) => object_type !== "BASE TABLE" || !expectedTables.has(object_name));
    if (unexpected.length) {
      throw new ResetGuardError(`Reset refused because the database contains unrecognized schema objects (${unexpected.length}); inspect them manually. No objects were dropped.`);
    }

    // Recheck the backup artifact immediately before the first destructive DDL when backup mode is selected.
    if (!options.dataDisposable) await validateBackupEvidence(options.evidence, options.server);
    const existingTables = objects.map(({ object_name }) => object_name);
    await connection.query("SET FOREIGN_KEY_CHECKS=0");
    foreignKeyChecksDisabled = true;
    for (const table of existingTables) {
      // Names come only from information_schema and the checked project allowlist.
      await connection.query(`DROP TABLE \`${table}\``);
      console.log(`Removed table ${table}`);
    }
    await connection.query("SET FOREIGN_KEY_CHECKS=1");
    foreignKeyChecksDisabled = false;

    await connection.query(`CREATE TABLE schema_migrations (
      migration_id VARCHAR(120) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      checksum CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      runner_version VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (migration_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    for (const migration of migrations) {
      console.log(`Applying ${migration.id}`);
      for (const statement of splitSqlStatements(migration.sql)) await connection.query(statement);
      await connection.query(
        "INSERT INTO schema_migrations (migration_id, checksum, runner_version) VALUES (?, ?, ?)",
        [migration.id, migration.checksum, "1"],
      );
      console.log(`Recorded ${migration.id}`);
    }
    console.log("Reset and fresh-schema migration completed. Verify tables and checksums before restoring application access.");
  } finally {
    if (foreignKeyChecksDisabled) {
      try { await connection.query("SET FOREIGN_KEY_CHECKS=1"); } catch { /* close also ends the session */ }
    }
    if (lockHeld) {
      try { await connection.query("SELECT RELEASE_LOCK(?)", [LOCK_NAME]); } catch { /* close releases a named lock */ }
    }
    await connection.end();
  }
}

async function main() {
  const options = validateResetArguments(process.argv.slice(2));
  if (options.database !== RESET_DATABASE) throw new ResetGuardError("Reset target mismatch.");
  await resetAndMigrate(options);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  main().catch((error) => {
    const code = typeof error?.code === "string" ? error.code : undefined;
    const message = error instanceof ResetGuardError ? error.message : "Reset procedure failed; credentials and SQL were not logged. Inspect database state before any retry.";
    console.error(message, ...(code ? [{ code }] : []));
    process.exitCode = 1;
  });
}
