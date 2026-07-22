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
  expect(version.version).toBe(6);
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
  expect(version.version).toBe(6);
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

test("migration 006 compacts historical skipped_preflight streaks", () => {
  const dir = mkdtempSync(join(tmpdir(), "compact-"));
  const path = join(dir, "h.db");

  // v1-shape DB seeded with interleaved runs; opening applies 002..006.
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
    db.exec(`
      CREATE TABLE events (
        run_id INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        seq INTEGER NOT NULL, ts INTEGER NOT NULL,
        event_type TEXT NOT NULL, payload TEXT NOT NULL,
        PRIMARY KEY (run_id, seq)
      )`);
    const ins = db.query(
      `INSERT INTO runs (project, job, fire_time, started_at, ended_at, status, schedule)
       VALUES (?, ?, ?, ?, ?, ?, '* * * * *') RETURNING id`
    );
    const ev = db.query(
      `INSERT INTO events (run_id, seq, ts, event_type, payload) VALUES (?, 0, ?, 'start', '{}')`
    );
    // p/j (oldest → newest): SP, SP, SP, success, SP, SP  — plus q/j: SP
    // (must not merge across projects).
    const rows: Array<[string, number, string]> = [
      ["p", 100, "skipped_preflight"],
      ["p", 200, "skipped_preflight"],
      ["p", 300, "skipped_preflight"],
      ["p", 400, "success"],
      ["p", 500, "skipped_preflight"],
      ["p", 600, "skipped_preflight"],
      ["q", 350, "skipped_preflight"],
    ];
    for (const [project, t, status] of rows) {
      const { id } = ins.get(project, "j", t, t, t + 10, status) as { id: number };
      ev.run(id, t);
    }
    db.close();
  }

  const db = openDb(path);
  const runs = db
    .query("SELECT project, started_at, ended_at, status, skip_count FROM runs ORDER BY project, started_at")
    .all() as any[];
  // p/j compacts to: [SP ×3 spanning 100..310], success, [SP ×2 spanning 500..610]; q/j untouched.
  expect(runs).toEqual([
    { project: "p", started_at: 100, ended_at: 310, status: "skipped_preflight", skip_count: 3 },
    { project: "p", started_at: 400, ended_at: 410, status: "success", skip_count: 1 },
    { project: "p", started_at: 500, ended_at: 610, status: "skipped_preflight", skip_count: 2 },
    { project: "q", started_at: 350, ended_at: 360, status: "skipped_preflight", skip_count: 1 },
  ]);
  // Events of absorbed rows are gone; each surviving run kept its own event.
  const orphans = db
    .query("SELECT COUNT(*) AS n FROM events WHERE run_id NOT IN (SELECT id FROM runs)")
    .get() as any;
  expect(orphans.n).toBe(0);
  const evCount = db.query("SELECT COUNT(*) AS n FROM events").get() as any;
  expect(evCount.n).toBe(4);
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
  expect(version.version).toBe(6);
  db.close();
});
