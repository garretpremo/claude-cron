import { Database } from "bun:sqlite";
import { readFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const SCHEMA_PATH = new URL("./schema.sql", import.meta.url).pathname;
const MIGRATIONS_DIR = new URL("./migrations/", import.meta.url).pathname;
const CURRENT_VERSION = 5;

export function openDb(path: string): Database {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  const db = new Database(path, { create: true });
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("PRAGMA foreign_keys = ON");

  // Base schema (idempotent via CREATE TABLE IF NOT EXISTS)
  const schema = readFileSync(SCHEMA_PATH, "utf8");
  db.exec(schema);

  const row = db.query("SELECT version FROM schema_version LIMIT 1").get() as
    | { version: number }
    | null;
  if (!row) {
    db.query("INSERT INTO schema_version (version) VALUES (?)").run(1);
    applyMigrations(db, 1);
    return db;
  }

  applyMigrations(db, row.version);
  return db;
}

function applyMigrations(db: Database, fromVersion: number): void {
  if (fromVersion >= CURRENT_VERSION) return;
  if (fromVersion > CURRENT_VERSION) {
    throw new Error(
      `DB schema version ${fromVersion} is newer than code version ${CURRENT_VERSION}`
    );
  }

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{3}-.+\.sql$/.test(f))
    .sort();

  for (let v = fromVersion + 1; v <= CURRENT_VERSION; v++) {
    const prefix = String(v).padStart(3, "0") + "-";
    const file = files.find((f) => f.startsWith(prefix));
    if (!file) {
      throw new Error(`Missing migration for version ${v}`);
    }
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    db.transaction(() => {
      db.exec(sql);
      db.query("UPDATE schema_version SET version = ?").run(v);
    })();
  }
}
