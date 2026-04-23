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
  expect(version.version).toBe(1);
  db.close();
});
