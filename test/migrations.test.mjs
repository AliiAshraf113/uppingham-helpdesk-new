import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";
import { discoverMigrations, planMigrations, splitSqlStatements } from "../scripts/migration-utils.mjs";
import { canonicalizeEvidence, parseResetTarget, RESET_DATABASE, RESET_PORT, resetConfirmationPhrase, validateBackupEvidence, validateResetArguments } from "../scripts/reset-safety.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDirectory = path.join(projectRoot, "migrations");

test("migration files are contiguous, sorted and checksummed", async () => {
  const migrations = await discoverMigrations(migrationsDirectory);
  assert.deepEqual(migrations.map(({ id }) => id), [
    "0001_identity_and_reference",
    "0002_assets_and_tickets",
    "0003_history_comments_files_notifications",
  ]);
  assert.ok(migrations.every(({ checksum }) => /^[a-f0-9]{64}$/.test(checksum)));
});

test("migration plan applies only pending files and is a no-op after all are recorded", async () => {
  const migrations = await discoverMigrations(migrationsDirectory);
  const applied = migrations.slice(0, 2).map(({ id, checksum }) => ({ migration_id: id, checksum }));
  assert.deepEqual(planMigrations(migrations, applied).map(({ id }) => id), ["0003_history_comments_files_notifications"]);
  assert.deepEqual(planMigrations(migrations, migrations.map(({ id, checksum }) => ({ migration_id: id, checksum }))), []);
});

test("migration plan refuses changed, missing and out-of-order history", async () => {
  const migrations = await discoverMigrations(migrationsDirectory);
  assert.throws(() => planMigrations(migrations, [{ migration_id: migrations[0].id, checksum: "0".repeat(64) }]), /checksum changed/);
  assert.throws(() => planMigrations(migrations, [{ migration_id: "0009_removed", checksum: "0".repeat(64) }]), /missing from the project/);
  assert.throws(() => planMigrations(migrations, [{ migration_id: migrations[1].id, checksum: migrations[1].checksum }]), /out of order/);
});

test("SQL splitter respects quoted semicolons and SQL comments", () => {
  const sql = "-- setup\nCREATE TABLE t (v VARCHAR(40) DEFAULT 'a;b'); # inline\nINSERT INTO t VALUES (\"x;y\"); /* tail; */ SELECT `semi;colon` FROM t;";
  assert.deepEqual(splitSqlStatements(sql), [
    "CREATE TABLE t (v VARCHAR(40) DEFAULT 'a;b')",
    'INSERT INTO t VALUES ("x;y")',
    "SELECT `semi;colon` FROM t",
  ]);
});

test("initial schema has independent identity, ticket, asset, SLA, audit and attachment domains", async () => {
  const migrations = await discoverMigrations(migrationsDirectory);
  const sql = migrations.map(({ sql }) => sql).join("\n");
  for (const table of [
    "app_users", "app_user_identities", "app_roles", "app_permissions", "app_user_roles",
    "departments", "buildings", "rooms", "ticket_categories", "ticket_subcategories",
    "ticket_status_transitions", "assets", "asset_history", "tickets", "ticket_comments",
    "ticket_activity", "audit_events", "sla_policies", "sla_policy_versions", "sla_policy_rules",
    "ticket_sla_snapshots", "notifications", "ticket_attachments", "ticket_upload_reservations",
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE ${table}\\s*\\(`), `missing table ${table}`);
  }
  assert.match(sql, /UNIQUE KEY uq_user_identity_provider_subject/);
  assert.match(sql, /visibility ENUM\('public', 'internal'\)/);
  assert.match(sql, /reservation_token_hash/);
  assert.match(sql, /retirement_reason/);
  assert.match(sql, /policy_snapshot_json/);
});

test("migrations contain no drop or truncate statements and all tables use InnoDB", async () => {
  const migrations = await discoverMigrations(migrationsDirectory);
  for (const migration of migrations) {
    const statements = splitSqlStatements(migration.sql);
    assert.ok(statements.length > 0, `${migration.id} has statements`);
    assert.ok(!statements.some((statement) => /^\s*(DROP|TRUNCATE)\b/i.test(statement)), `${migration.id} is non-destructive`);
    for (const statement of statements.filter((item) => /^CREATE TABLE\b/i.test(item))) {
      assert.match(statement, /\) ENGINE=InnoDB\b/i, `${migration.id} table must use InnoDB`);
    }
  }
});

test("reset target is fixed to the exact legacy database and separately approved host", () => {
  const originalTls = process.env.MARIADB_TLS;
  try {
    assert.equal(RESET_DATABASE, "ucegcom_helpdesk");
    assert.equal(RESET_PORT, 3306);
    assert.throws(() => parseResetTarget("mysql://user:secret@localhost:3306/other_database", "localhost"), /only the exact database/);
    assert.throws(() => parseResetTarget("mysql://user:secret@localhost:3306/ucegcom_helpdesk", "other-host"), /exactly match/);
    assert.throws(() => parseResetTarget("mysql://user:secret@localhost:3307/ucegcom_helpdesk", "localhost"), /port 3306/);
    assert.throws(() => parseResetTarget("mysql://user:secret@localhost:3306/ucegcom_helpdesk_copy", "localhost"), /only the exact database/);
    delete process.env.MARIADB_TLS;
    assert.throws(() => parseResetTarget("mysql://user:secret@localhost:3306/ucegcom_helpdesk", "localhost"), /explicitly set/);
    process.env.MARIADB_TLS = "true";
    const tlsTarget = parseResetTarget("mysql://user:secret@localhost:3306/ucegcom_helpdesk", "localhost");
    assert.equal(tlsTarget.database, RESET_DATABASE);
    assert.equal(tlsTarget.config.port, RESET_PORT);
    assert.equal(tlsTarget.config.ssl, true);
    assert.throws(() => parseResetTarget("mysql://user:secret@localhost:3306/ucegcom_helpdesk", "localhost", true), /Do not pass/);
    process.env.MARIADB_TLS = "false";
    assert.throws(() => parseResetTarget("mysql://user:secret@localhost:3306/ucegcom_helpdesk", "localhost"), /requires --approve-no-tls/);
    const plainTarget = parseResetTarget("mysql://user:secret@localhost:3306/ucegcom_helpdesk", "localhost", true);
    assert.equal("ssl" in plainTarget.config, false);
  } finally {
    if (originalTls === undefined) delete process.env.MARIADB_TLS;
    else process.env.MARIADB_TLS = originalTls;
  }
});

test("reset requires exact target, host, either backup or data-disposable authorization, and destructive confirmation", () => {
  assert.throws(() => validateResetArguments([]), /only --approve-database/);
  assert.throws(() => validateResetArguments([
    "--approve-database", RESET_DATABASE, "--approve-server", "localhost",
  ]), /Choose exactly one/);
  assert.throws(() => validateResetArguments([
    "--approve-database", RESET_DATABASE, "--approve-server", "localhost", "--backup-evidence", "backup.json",
  ]), /explicit --reset-existing-database/);
  assert.deepEqual(validateResetArguments([
    "--approve-database", RESET_DATABASE, "--approve-server", "localhost",
    "--backup-evidence", "backup.json", "--reset-existing-database",
  ]), {
    database: RESET_DATABASE, server: "localhost", evidence: "backup.json", dataDisposable: false, approveNoTls: false, confirmation: true,
  });
  assert.deepEqual(validateResetArguments([
    "--approve-database", RESET_DATABASE, "--approve-server", "localhost",
    "--data-disposable", "--reset-existing-database",
  ]), {
    database: RESET_DATABASE, server: "localhost", evidence: null, dataDisposable: true, approveNoTls: false, confirmation: true,
  });
  assert.throws(() => validateResetArguments([
    "--approve-database", RESET_DATABASE, "--approve-server", "localhost",
    "--backup-evidence", "backup.json", "--data-disposable", "--reset-existing-database",
  ]), /Choose exactly one/);
  assert.equal(resetConfirmationPhrase(RESET_DATABASE, "db-host", true), "RESET ucegcom_helpdesk ON db-host DATA DISPOSABLE");
});

test("reset backup evidence requires an independent valid Ed25519 signature, not a restore assertion", async () => {
  const temporaryDirectory = await mkdtemp(path.join(projectRoot, "test", ".reset-evidence-"));
  const evidencePath = path.join(temporaryDirectory, "evidence.json");
  const backupPath = path.join(temporaryDirectory, "backup.sql");
  const originalVerifierId = process.env.RESET_BACKUP_VERIFIER_ID;
  const originalVerifierKey = process.env.RESET_BACKUP_VERIFIER_PUBLIC_KEY;
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const verifierId = "independent-test-verifier";
  process.env.RESET_BACKUP_VERIFIER_ID = verifierId;
  process.env.RESET_BACKUP_VERIFIER_PUBLIC_KEY = publicKeyPem;

  try {
    const backup = Buffer.from("-- disposable test backup fixture\n", "utf8");
    await writeFile(backupPath, backup);
    const evidence = {
      sourceDatabase: RESET_DATABASE,
      sourceServer: "db-test-host",
      backupPath,
      backupBytes: backup.byteLength,
      backupSha256: createHash("sha256").update(backup).digest("hex"),
      restoreTestDatabase: "cpanelacct_ucegcom_helpdesk_restore_20261026_ab12",
      restoreTestServer: "db-test-host",
      restoreSucceeded: true,
      verifiedBy: verifierId,
      verifiedAt: new Date().toISOString(),
      signatureAlgorithm: "Ed25519",
    };
    evidence.signature = sign(null, Buffer.from(canonicalizeEvidence(evidence), "utf8"), privateKey).toString("base64");
    await writeFile(evidencePath, JSON.stringify(evidence));
    assert.equal((await validateBackupEvidence(evidencePath, "db-test-host")).restoreSucceeded, true);

    const forged = { ...evidence, verifiedAt: new Date(Date.now() - 1000).toISOString() };
    await writeFile(evidencePath, JSON.stringify(forged));
    await assert.rejects(validateBackupEvidence(evidencePath, "db-test-host"), /signature is invalid/);
  } finally {
    if (originalVerifierId === undefined) delete process.env.RESET_BACKUP_VERIFIER_ID;
    else process.env.RESET_BACKUP_VERIFIER_ID = originalVerifierId;
    if (originalVerifierKey === undefined) delete process.env.RESET_BACKUP_VERIFIER_PUBLIC_KEY;
    else process.env.RESET_BACKUP_VERIFIER_PUBLIC_KEY = originalVerifierKey;
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("database diagnostic is fixed-target and contains only the read-only identity query", async () => {
  const diagnostic = await readFile(path.join(projectRoot, "scripts", "diagnose-db-connection.mjs"), "utf8");
  const query = diagnostic.match(/connection\.query\(\s*"([^"]+)"/);
  assert.ok(query, "diagnostic query exists");
  assert.match(query[1], /^SELECT DATABASE\(\).*@@hostname.*@@port.*VERSION\(\)(?: AS [a-z_]+)?$/);
  assert.doesNotMatch(diagnostic, /\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)\b/i);
  assert.doesNotMatch(diagnostic, /migrate\.mjs|reset-database\.mjs/);
  assert.match(diagnostic, /s1478\.lon1\.mysecurecloudhost\.com/);
});
