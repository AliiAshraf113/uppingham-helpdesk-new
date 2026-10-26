import mariadb, { type Pool } from "mariadb";

declare global {
  // Reuse the pool across Next.js development reloads in the Node.js process.
  var __uppinghamHelpdeskDbPool: Pool | undefined;
}

function parseDatabaseUrl() {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL is required for database access.");

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("DATABASE_URL is malformed; its value was not logged.");
  }
  if (url.protocol !== "mysql:" && url.protocol !== "mariadb:") {
    throw new Error("DATABASE_URL must use the mysql: or mariadb: scheme.");
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!database || database.includes("/")) throw new Error("DATABASE_URL must identify exactly one database.");

  const limit = Number(process.env.DB_POOL_LIMIT ?? "5");
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
    throw new Error("DB_POOL_LIMIT must be an integer between 1 and 20.");
  }

  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
    connectionLimit: limit,
    connectTimeout: 10_000,
    multipleStatements: false,
    ...(process.env.MARIADB_TLS === "true" ? { ssl: true } : {}),
  };
}

export function getDbPool(): Pool {
  globalThis.__uppinghamHelpdeskDbPool ??= mariadb.createPool(parseDatabaseUrl());
  return globalThis.__uppinghamHelpdeskDbPool;
}
