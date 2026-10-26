import { createHash, verify as verifySignature } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";

export const RESET_DATABASE = "ucegcom_helpdesk";
export const RESET_PORT = 3306;
const RESTORE_DATABASE_PATTERN = /^(?:[a-z0-9][a-z0-9_]*_)?ucegcom_helpdesk_restore_[0-9]{8}_[a-z0-9]{4,12}$/;
const MAX_BACKUP_AGE_MS = 24 * 60 * 60 * 1000;

export class ResetGuardError extends Error {}

export function canonicalizeEvidence(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalizeEvidence).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalizeEvidence(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function parseResetTarget(rawUrl, expectedHost, approveNoTls = false) {
  if (!rawUrl) throw new ResetGuardError("MIGRATOR_DATABASE_URL is required; its value was not logged.");
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ResetGuardError("MIGRATOR_DATABASE_URL is malformed; its value was not logged.");
  }
  if (url.protocol !== "mysql:" && url.protocol !== "mariadb:") {
    throw new ResetGuardError("MIGRATOR_DATABASE_URL must use mysql: or mariadb:.");
  }
  let database;
  try {
    database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  } catch {
    throw new ResetGuardError("MIGRATOR_DATABASE_URL database path is malformed.");
  }
  if (database !== RESET_DATABASE) {
    throw new ResetGuardError(`Reset mode accepts only the exact database ${RESET_DATABASE}.`);
  }
  const port = url.port ? Number(url.port) : RESET_PORT;
  if (port !== RESET_PORT) throw new ResetGuardError(`Reset mode accepts only MariaDB port ${RESET_PORT}.`);
  if (!expectedHost || expectedHost.startsWith("-") || url.hostname.toLowerCase() !== expectedHost.toLowerCase()) {
    throw new ResetGuardError("Connection URL hostname must exactly match the separately approved host.");
  }
  const tlsSetting = process.env.MARIADB_TLS;
  if (tlsSetting !== "true" && tlsSetting !== "false") {
    throw new ResetGuardError("MARIADB_TLS must be explicitly set to true or false after confirming the provider's TLS requirement.");
  }
  if (tlsSetting === "false" && !approveNoTls) {
    throw new ResetGuardError("MARIADB_TLS=false requires --approve-no-tls after the provider confirms TLS is not required or supported.");
  }
  if (tlsSetting === "true" && approveNoTls) {
    throw new ResetGuardError("Do not pass --approve-no-tls when MARIADB_TLS=true.");
  }
  return {
    host: url.hostname,
    database,
    config: {
      host: url.hostname,
      port,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database,
      connectTimeout: 10_000,
      multipleStatements: false,
      ...(tlsSetting === "true" ? { ssl: true } : {}),
    },
  };
}

export async function validateBackupEvidence(evidencePath, expectedHost) {
  if (!evidencePath) throw new ResetGuardError("A backup verification evidence file is required.");
  let evidence;
  try {
    evidence = JSON.parse(await readFile(evidencePath, "utf8"));
  } catch {
    throw new ResetGuardError("Backup evidence could not be read as JSON; no reset was performed.");
  }

  const verifiedAt = Date.parse(evidence.verifiedAt);
  if (evidence.sourceDatabase !== RESET_DATABASE || evidence.sourceServer !== expectedHost) {
    throw new ResetGuardError("Backup evidence must identify the exact source database and approved server.");
  }
  if (!RESTORE_DATABASE_PATTERN.test(evidence.restoreTestDatabase ?? "") || evidence.restoreTestDatabase === RESET_DATABASE) {
    throw new ResetGuardError("Backup evidence must identify a separate scratch restore database.");
  }
  if (evidence.restoreTestServer !== expectedHost || evidence.restoreSucceeded !== true) {
    throw new ResetGuardError("Backup evidence must record a successful restore test on the approved server in a separate scratch database.");
  }
  if (!evidence.verifiedBy || typeof evidence.verifiedBy !== "string" || !Number.isFinite(verifiedAt) ||
      verifiedAt > Date.now() || Date.now() - verifiedAt > MAX_BACKUP_AGE_MS) {
    throw new ResetGuardError("Backup evidence must name its verifier and be no more than 24 hours old.");
  }
  if (typeof evidence.backupPath !== "string" || !evidence.backupPath ||
      !/^[a-f0-9]{64}$/.test(evidence.backupSha256 ?? "") || !Number.isSafeInteger(evidence.backupBytes) || evidence.backupBytes <= 0) {
    throw new ResetGuardError("Backup evidence must contain a backup path, SHA-256 digest, and positive byte count.");
  }
  const verifierId = process.env.RESET_BACKUP_VERIFIER_ID;
  const publicKey = process.env.RESET_BACKUP_VERIFIER_PUBLIC_KEY;
  if (!verifierId || !publicKey || evidence.verifiedBy !== verifierId || evidence.signatureAlgorithm !== "Ed25519" ||
      typeof evidence.signature !== "string") {
    throw new ResetGuardError("Evidence must be signed by the independently configured reset backup verifier.");
  }
  const signedFields = { ...evidence };
  delete signedFields.signature;
  let signatureValid = false;
  try {
    signatureValid = verifySignature(null, Buffer.from(canonicalizeEvidence(signedFields), "utf8"), publicKey, Buffer.from(evidence.signature, "base64"));
  } catch {
    signatureValid = false;
  }
  if (!signatureValid) throw new ResetGuardError("Backup evidence signature is invalid; no reset was performed.");

  let backupHash;
  try {
    const backupStat = await stat(evidence.backupPath);
    if (!backupStat.isFile() || backupStat.size !== evidence.backupBytes) {
      throw new Error("backup size mismatch");
    }
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(evidence.backupPath)) hash.update(chunk);
    backupHash = hash.digest("hex");
  } catch {
    throw new ResetGuardError("The backup file is unavailable or its size does not match the evidence.");
  }
  if (backupHash !== evidence.backupSha256) {
    throw new ResetGuardError("The backup file SHA-256 does not match the verification evidence.");
  }
  return evidence;
}

export function validateResetArguments(argv) {
  const options = { database: null, server: null, evidence: null, dataDisposable: false, approveNoTls: false, confirmation: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--approve-database") options.database = argv[++index] ?? null;
    else if (arg === "--approve-server") options.server = argv[++index] ?? null;
    else if (arg === "--backup-evidence") options.evidence = argv[++index] ?? null;
    else if (arg === "--data-disposable") options.dataDisposable = true;
    else if (arg === "--approve-no-tls") options.approveNoTls = true;
    else if (arg === "--reset-existing-database") options.confirmation = true;
    else throw new ResetGuardError(`Unknown reset option: ${arg}`);
  }
  if (options.database !== RESET_DATABASE) throw new ResetGuardError(`Reset mode accepts only --approve-database ${RESET_DATABASE}.`);
  if (!options.server || options.server.startsWith("-")) throw new ResetGuardError("Pass the exact independently verified host with --approve-server.");
  if (Boolean(options.evidence) === options.dataDisposable) {
    throw new ResetGuardError("Choose exactly one: --backup-evidence <file> or explicit --data-disposable authorization.");
  }
  if (!options.confirmation) throw new ResetGuardError("Reset requires the explicit --reset-existing-database argument.");
  return options;
}

export function resetConfirmationPhrase(database, server, dataDisposable) {
  return `RESET ${database} ON ${server}${dataDisposable ? " DATA DISPOSABLE" : ""}`;
}
