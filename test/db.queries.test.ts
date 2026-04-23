import { expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { openDb } from "../src/db/connection";
import {
  insertRun, finishRun, appendEvent, abandonStaleRuns,
  getRecentRuns, deleteOldRuns
} from "../src/db/queries";

function freshDb() {
  const dir = mkdtempSync(join(tmpdir(), "cc-"));
  return openDb(join(dir, "h.db"));
}

test("insertRun → getRecentRuns", () => {
  const db = freshDb();
  const id = insertRun(db, {
    project: "p", job: "j", fire_time: 1, started_at: 2,
    schedule: "*/5 * * * *", is_test: false,
  });
  expect(id).toBeGreaterThan(0);
  const recent = getRecentRuns(db, "p", "j", 5);
  expect(recent.length).toBe(1);
  expect(recent[0]!.status).toBe("running");
});

test("finishRun updates row", () => {
  const db = freshDb();
  const id = insertRun(db, {
    project: "p", job: "j", fire_time: 1, started_at: 2,
    schedule: "*/5 * * * *", is_test: false,
  });
  finishRun(db, id, {
    status: "success", exit_code: 0, cost_usd: 0.01,
    summary: "ok", ended_at: 100,
  });
  const row = getRecentRuns(db, "p", "j", 1)[0]!;
  expect(row.status).toBe("success");
  expect(row.ended_at).toBe(100);
});

test("appendEvent writes with seq", () => {
  const db = freshDb();
  const id = insertRun(db, {
    project: "p", job: "j", fire_time: 1, started_at: 2,
    schedule: "*/5 * * * *", is_test: false,
  });
  appendEvent(db, id, 0, 10, "start", { hello: "world" });
  appendEvent(db, id, 1, 20, "end", { status: "success" });
  const events = db.query("SELECT * FROM events WHERE run_id=? ORDER BY seq").all(id) as any[];
  expect(events.length).toBe(2);
  expect(JSON.parse(events[0]!.payload).hello).toBe("world");
});

test("abandonStaleRuns", () => {
  const db = freshDb();
  insertRun(db, {
    project: "p", job: "j", fire_time: 1, started_at: 100,
    schedule: "*", is_test: false,
  });
  // Nothing old enough:
  const count = abandonStaleRuns(db, 200, 10_000);
  expect(count).toBe(0);

  // Now make it old:
  db.query("UPDATE runs SET started_at = 0").run();
  const count2 = abandonStaleRuns(db, 1_000_000, 10_000);
  expect(count2).toBe(1);
  const row = getRecentRuns(db, "p", "j", 1)[0]!;
  expect(row.status).toBe("abandoned");
});

test("deleteOldRuns cascades events", () => {
  const db = freshDb();
  const id = insertRun(db, {
    project: "p", job: "j", fire_time: 1, started_at: 1,
    schedule: "*", is_test: false,
  });
  appendEvent(db, id, 0, 1, "start", {});
  deleteOldRuns(db, "p", "j", 1_000_000);
  const runs = db.query("SELECT COUNT(*) as n FROM runs").get() as any;
  const evs  = db.query("SELECT COUNT(*) as n FROM events").get() as any;
  expect(runs.n).toBe(0);
  expect(evs.n).toBe(0);
});
