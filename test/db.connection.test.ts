import { expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { openDb } from "../src/db/connection";

test("openDb creates schema and sets WAL", () => {
  const dir = mkdtempSync(join(tmpdir(), "claude-cron-db-"));
  const db = openDb(join(dir, "h.db"));
  const tables = db
    .query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all() as { name: string }[];
  const names = tables.map((t) => t.name);
  expect(names).toContain("projects");
  expect(names).toContain("runs");
  expect(names).toContain("events");

  const journal = db.query("PRAGMA journal_mode").get() as any;
  expect(String(journal.journal_mode).toLowerCase()).toBe("wal");

  const version = db.query("SELECT version FROM schema_version").get() as any;
  expect(version.version).toBe(2);
  db.close();
});

test("openDb migrates existing v1 DB to v2 (adds runs.pid column)", () => {
  const dir = mkdtempSync(join(tmpdir(), "mig-"));
  const path = join(dir, "h.db");

  // Manually create a v1-shape DB (no pid column, schema_version=1)
  {
    const { Database } = require("bun:sqlite");
    const db = new Database(path, { create: true });
    db.exec("CREATE TABLE schema_version (version INTEGER PRIMARY KEY)");
    db.exec("INSERT INTO schema_version VALUES (1)");
    db.exec(`
      CREATE TABLE runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project TEXT NOT NULL, job TEXT NOT NULL,
        fire_time INTEGER NOT NULL, started_at INTEGER NOT NULL,
        ended_at INTEGER,
        status TEXT NOT NULL,
        exit_code INTEGER, cost_usd REAL, summary TEXT,
        schedule TEXT, is_test INTEGER NOT NULL DEFAULT 0
      )`);
    db.close();
  }

  const db = openDb(path);
  const cols = db.query("PRAGMA table_info(runs)").all() as { name: string }[];
  const names = cols.map((c) => c.name);
  expect(names).toContain("pid");

  const version = db.query("SELECT version FROM schema_version").get() as any;
  expect(version.version).toBe(2);
  db.close();
});

test("openDb on fresh DB creates v2 schema including runs.pid", () => {
  const dir = mkdtempSync(join(tmpdir(), "fresh-"));
  const db = openDb(join(dir, "h.db"));
  const cols = db.query("PRAGMA table_info(runs)").all() as { name: string }[];
  expect(cols.map((c) => c.name)).toContain("pid");
  db.close();
});
