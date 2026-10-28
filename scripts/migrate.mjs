import mariadb from "mariadb";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { discoverMigrations, planMigrations, splitSqlStatements } from "./migration-utils.mjs";

const EXPECTED_NEW_DATABASE = "ucegcom_uppingham_helpdesk";
const LOCK_NAME = "ucegcom_uppingham_helpdesk_schema_migrations";
const MIGRATIONS_DIRECTORY = fileURLToPath(new URL("../migrations/", import.meta.url));

class MigrationGuardError extends Error {}

function parseArguments(argv) {
  const options = { database: null, server: null, backupConfirmed: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--approve-database") options.database = argv[++index] ?? null;
    else if (argument === "--approve-server") options.server = argv[++index] ?? null;
    else if (argument === "--backup-confirmed") options.backupConfirmed = true;
    else throw new MigrationGuardError(`Unknown migration option: ${argument}`);
  }
  if (options.database !== EXPECTED_NEW_DATABASE) {
    throw new MigrationGuardError(`Pass --approve-database ${EXPECTED_NEW_DATABASE} only after confirming the intended new database.`);
  }
  if (!options.server || options.server.startsWith("-")) {
    throw new MigrationGuardError("Pass --approve-server with the exact database server hostname verified by the operator.");
  }
  if (!options.backupConfirmed) {
    throw new MigrationGuardError("Pass --backup-confirmed only after verifying a current backup or confirming this is a disposable empty database.");
  }
  return options;
}

function parseDatabaseUrl(rawUrl) {
  if (!rawUrl) throw new Error("MIGRATOR_DATABASE_URL is required; the runtime database URL is not used for migrations.");
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new MigrationGuardError("MIGRATOR_DATABASE_URL is malformed; its value was not logged.");
  }
  if (url.protocol !== "mysql:" && url.protocol !== "mariadb:") {
    throw new MigrationGuardError("MIGRATOR_DATABASE_URL must use the mysql: or mariadb: scheme.");
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!database || database.includes("/")) throw new MigrationGuardError("MIGRATOR_DATABASE_URL must identify exactly one database.");
  if (database.toLowerCase() === "ucegcom_helpdesk") {
    throw new MigrationGuardError("The legacy ucegcom_helpdesk database is forbidden as a migration target.");
  }
  return {
    database,
    config: {
      host: url.hostname,
      port: url.port ? Number(url.port) : 3306,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database,
      connectTimeout: 10_000,
      multipleStatements: false,
      ...(process.env.MARIADB_TLS === "true" ? { ssl: true } : {}),
    },
  };
}

async function applyMigrations(options) {
  const target = parseDatabaseUrl(process.env.MIGRATOR_DATABASE_URL);
  if (target.database !== options.database) {
    throw new MigrationGuardError("The database in MIGRATOR_DATABASE_URL does not match the approved database name.");
  }

  const migrations = await discoverMigrations(MIGRATIONS_DIRECTORY);
  const connection = await mariadb.createConnection(target.config);
  let lockHeld = false;

  try {
    const [identity] = await connection.query(
      "SELECT DATABASE() AS database_name, @@hostname AS server_name, VERSION() AS server_version",
    );
    if (identity.database_name !== options.database) {
      throw new MigrationGuardError("Connected database name does not match the approved target.");
    }
    if (identity.server_name !== options.server) {
      throw new MigrationGuardError("Connected database server does not match the server approved by the operator.");
    }
    console.log(`Verified target database=${identity.database_name} server=${identity.server_name} version=${identity.server_version}`);

    const [lockResult] = await connection.query("SELECT GET_LOCK(?, 30) AS acquired", [LOCK_NAME]);
    if (Number(lockResult.acquired) !== 1) throw new MigrationGuardError("Could not acquire the migration lock.");
    lockHeld = true;

    await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      migration_id VARCHAR(120) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      checksum CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      runner_version VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (migration_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    const appliedRows = await connection.query("SELECT migration_id, checksum FROM schema_migrations ORDER BY migration_id");
    const pending = planMigrations(migrations, appliedRows);
    if (pending.length === 0) {
      console.log("Schema is already current; no migration statements were executed.");
      return;
    }

    for (const migration of pending) {
      console.log(`Applying ${migration.id}`);
      for (const statement of splitSqlStatements(migration.sql)) {
        await connection.query(statement);
      }
      await connection.query(
        "INSERT INTO schema_migrations (migration_id, checksum, runner_version) VALUES (?, ?, ?)",
        [migration.id, migration.checksum, "1"],
      );
      console.log(`Recorded ${migration.id}`);
    }
  } finally {
    if (lockHeld) {
      try {
        await connection.query("SELECT RELEASE_LOCK(?)", [LOCK_NAME]);
      } catch {
        // Connection close releases a MariaDB named lock; do not log connection details.
      }
    }
    await connection.end();
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  await applyMigrations(options);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  main().catch((error) => {
    const code = typeof error?.code === "string" ? error.code : undefined;
    const message = error instanceof MigrationGuardError ? error.message : "Database migration failed; no credentials or SQL were logged.";
    console.error(message, ...(code ? [{ code }] : []));
    process.exitCode = 1;
  });
}

export {
  EXPECTED_NEW_DATABASE,
  LOCK_NAME,
  MigrationGuardError,
  parseArguments,
  parseDatabaseUrl,
  applyMigrations,
};
