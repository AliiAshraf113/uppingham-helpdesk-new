import mariadb from "mariadb";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseResetTarget, RESET_DATABASE, RESET_PORT, ResetGuardError } from "./reset-safety.mjs";

const EXPECTED_HOST = "s1478.lon1.mysecurecloudhost.com";

function parseArguments(argv) {
  if (argv.length === 0) return { approveNoTls: false };
  if (argv.length === 1 && argv[0] === "--approve-no-tls") return { approveNoTls: true };
  throw new ResetGuardError("Only --approve-no-tls is accepted by the read-only connection diagnostic.");
}

async function diagnose(approveNoTls) {
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
    throw new ResetGuardError("NODE_TLS_REJECT_UNAUTHORIZED=0 is forbidden for this diagnostic.");
  }
  const target = parseResetTarget(process.env.MIGRATOR_DATABASE_URL, EXPECTED_HOST, approveNoTls);
  const connection = await mariadb.createConnection(target.config);
  try {
    const rows = await connection.query(
      "SELECT DATABASE() AS database_name, @@hostname AS server_name, @@port AS server_port, VERSION() AS server_version",
    );
    const identity = rows[0];
    if (
      identity.database_name !== RESET_DATABASE ||
      identity.server_name.toLowerCase() !== EXPECTED_HOST.toLowerCase() ||
      Number(identity.server_port) !== RESET_PORT ||
      !String(identity.server_version).startsWith("10.6.28-MariaDB")
    ) {
      throw new ResetGuardError("Connected server identity does not match the confirmed database, hostname, port, and MariaDB version.");
    }
    console.log(`Read-only connection verified: database=${identity.database_name} host=${identity.server_name} port=${identity.server_port} version=${identity.server_version}`);
  } finally {
    await connection.end();
  }
}

async function main() {
  const { approveNoTls } = parseArguments(process.argv.slice(2));
  await diagnose(approveNoTls);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  main().catch((error) => {
    const code = typeof error?.code === "string" ? error.code : undefined;
    const message = error instanceof ResetGuardError
      ? error.message
      : "Read-only database diagnostic failed; credentials were not logged.";
    console.error(message, ...(code ? [{ code }] : []));
    process.exitCode = 1;
  });
}
