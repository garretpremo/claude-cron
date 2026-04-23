import { Database } from "bun:sqlite";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const SCHEMA_PATH = new URL("./schema.sql", import.meta.url).pathname;
const CURRENT_VERSION = 1;

export function openDb(path: string): Database {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  const db = new Database(path, { create: true });
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("PRAGMA foreign_keys = ON");

  const schema = readFileSync(SCHEMA_PATH, "utf8");
  db.exec(schema);

  const row = db
    .query("SELECT version FROM schema_version LIMIT 1")
    .get() as { version: number } | null;
  if (!row) {
    db.query("INSERT INTO schema_version (version) VALUES (?)").run(CURRENT_VERSION);
  } else if (row.version !== CURRENT_VERSION) {
    throw new Error(
      `DB schema version ${row.version} does not match code version ${CURRENT_VERSION}`
    );
  }

  return db;
}
