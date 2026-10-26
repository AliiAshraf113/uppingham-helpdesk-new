import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const MIGRATION_NAME = /^(\d{4})_([a-z0-9][a-z0-9_-]*)\.sql$/;

export async function discoverMigrations(directory) {
  const names = (await readdir(directory)).filter((name) => name.endsWith(".sql"));
  const parsed = names.map((name) => {
    const match = MIGRATION_NAME.exec(name);
    if (!match) throw new Error(`Invalid migration filename: ${name}`);
    return { name, sequence: Number(match[1]), id: name.slice(0, -4) };
  }).sort((left, right) => left.sequence - right.sequence);

  for (let index = 0; index < parsed.length; index += 1) {
    if (parsed[index].sequence !== index + 1) {
      throw new Error(`Migration sequence must be contiguous from 0001; found ${parsed[index].name}`);
    }
    if (index > 0 && parsed[index - 1].sequence === parsed[index].sequence) {
      throw new Error(`Duplicate migration sequence: ${parsed[index].name}`);
    }
  }

  return Promise.all(parsed.map(async ({ name, id }) => {
    const sql = await readFile(path.join(directory, name), "utf8");
    return {
      id,
      name,
      sql,
      checksum: createHash("sha256").update(sql, "utf8").digest("hex"),
    };
  }));
}

export function planMigrations(migrations, appliedRows) {
  const byId = new Map(migrations.map((migration) => [migration.id, migration]));
  if (byId.size !== migrations.length) throw new Error("Migration IDs must be unique.");

  const applied = new Map();
  for (const row of appliedRows) {
    const id = row.migration_id;
    if (applied.has(id)) throw new Error(`Duplicate migration record: ${id}`);
    if (!byId.has(id)) throw new Error(`Applied migration is missing from the project: ${id}`);
    if (row.checksum !== byId.get(id).checksum) throw new Error(`Applied migration checksum changed: ${id}`);
    applied.set(id, row.checksum);
  }

  let foundPending = false;
  const pending = [];
  for (const migration of migrations) {
    if (applied.has(migration.id)) {
      if (foundPending) throw new Error(`Migration history is out of order at ${migration.id}`);
    } else {
      foundPending = true;
      pending.push(migration);
    }
  }
  return pending;
}

export function splitSqlStatements(sql) {
  const statements = [];
  let buffer = "";
  let quote = null;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];

    if (lineComment) {
      if (char === "\n") {
        lineComment = false;
        buffer += "\n";
      }
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        buffer += " ";
        index += 1;
      }
      continue;
    }

    if (quote !== null) {
      buffer += char;
      if (char === "\\" && quote !== "`") {
        if (next !== undefined) buffer += sql[++index];
      } else if (char === quote) {
        if (next === quote) buffer += sql[++index];
        else quote = null;
      }
      continue;
    }

    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      buffer += char;
    } else if (char === "#" || (char === "-" && next === "-" && /\s/.test(sql[index + 2] ?? ""))) {
      lineComment = true;
      if (char === "-") index += 1;
    } else if (char === "/" && next === "*") {
      blockComment = true;
      index += 1;
    } else if (char === ";") {
      const statement = buffer.trim();
      if (statement) statements.push(statement);
      buffer = "";
    } else {
      buffer += char;
    }
  }

  if (quote !== null || blockComment) throw new Error("Unterminated quote or block comment in migration SQL.");
  const finalStatement = buffer.trim();
  if (finalStatement) statements.push(finalStatement);
  return statements;
}
