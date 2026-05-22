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
  expect(version.version).toBe(5);
  db.close();
});

test("openDb migrates existing v1 DB forward (adds pid, token, and inputs_json columns)", () => {
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
  expect(names).toContain("input_tokens");
  expect(names).toContain("output_tokens");
  expect(names).toContain("cache_creation_tokens");
  expect(names).toContain("cache_read_tokens");
  expect(names).toContain("inputs_json");

  const version = db.query("SELECT version FROM schema_version").get() as any;
  expect(version.version).toBe(5);
  db.close();
});

test("openDb on fresh DB creates current schema with pid + tokens", () => {
  const dir = mkdtempSync(join(tmpdir(), "fresh-"));
  const db = openDb(join(dir, "h.db"));
  const cols = db.query("PRAGMA table_info(runs)").all() as { name: string }[];
  const names = cols.map((c) => c.name);
  expect(names).toContain("pid");
  expect(names).toContain("output_tokens");
  db.close();
});

test("openDb on fresh DB creates favorites table at v4", () => {
  const dir = mkdtempSync(join(tmpdir(), "fav-"));
  const db = openDb(join(dir, "h.db"));

  const tables = db
    .query("SELECT name FROM sqlite_master WHERE type='table' AND name='favorites'")
    .all() as { name: string }[];
  expect(tables.length).toBe(1);

  const cols = db.query("PRAGMA table_info(favorites)").all() as { name: string }[];
  const names = cols.map((c) => c.name).sort();
  expect(names).toEqual(["created_at", "project"]);

  const version = db.query("SELECT version FROM schema_version").get() as any;
  expect(version.version).toBe(5);
  db.close();
});
