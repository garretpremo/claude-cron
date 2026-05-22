import { expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { openDb } from "../src/db/connection";
import {
  insertRun, finishRun, appendEvent, abandonStaleRuns,
  getRecentRuns, deleteOldRuns,
  listFavorites, setFavorite, unsetFavorite,
  getCountsSince, getRunningRuns,
  getTopProjectsByActivity, getTopJobsByActivity,
  getJobStatsSince,
  type RunStatus,
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

// ---------------------------------------------------------------------------
// Favorites
// ---------------------------------------------------------------------------

test("favorites: empty list, set, idempotent set, unset, idempotent unset", () => {
  const db = freshDb();
  expect(listFavorites(db)).toEqual([]);

  setFavorite(db, "alpha");
  setFavorite(db, "beta");
  expect(listFavorites(db)).toEqual(["alpha", "beta"]);

  // Idempotent set: no error, no duplicate.
  setFavorite(db, "alpha");
  expect(listFavorites(db)).toEqual(["alpha", "beta"]);

  unsetFavorite(db, "alpha");
  expect(listFavorites(db)).toEqual(["beta"]);

  // Idempotent unset: removing something not present is a no-op.
  unsetFavorite(db, "alpha");
  expect(listFavorites(db)).toEqual(["beta"]);
});

// ---------------------------------------------------------------------------
// Dashboard aggregation queries
// ---------------------------------------------------------------------------

function seedRun(db: any, opts: {
  project: string; job: string; started_at: number; status: RunStatus;
  input_tokens?: number; output_tokens?: number; cost_usd?: number;
}): number {
  const id = insertRun(db, {
    project: opts.project, job: opts.job,
    fire_time: opts.started_at, started_at: opts.started_at,
    schedule: "* * * * *", is_test: false,
  });
  if (opts.status !== "running") {
    finishRun(db, id, {
      status: opts.status,
      exit_code: opts.status === "success" ? 0 : 1,
      cost_usd: opts.cost_usd ?? null,
      summary: null,
      ended_at: opts.started_at + 1000,
      input_tokens: opts.input_tokens ?? null,
      output_tokens: opts.output_tokens ?? null,
    });
  }
  return id;
}

test("getCountsSince returns zero-padded histogram, project-scoped", () => {
  const db = freshDb();
  const since = 1000;
  seedRun(db, { project: "a", job: "j", started_at: 1500, status: "success" });
  seedRun(db, { project: "a", job: "j", started_at: 1600, status: "failure" });
  seedRun(db, { project: "a", job: "j", started_at: 1700, status: "skipped_preflight" });
  seedRun(db, { project: "b", job: "j", started_at: 1800, status: "success" });
  // Before window — excluded.
  seedRun(db, { project: "a", job: "j", started_at: 500, status: "success" });

  const all = getCountsSince(db, since);
  expect(all.success).toBe(2);
  expect(all.failure).toBe(1);
  expect(all.skipped_preflight).toBe(1);
  expect(all.skipped_overlap).toBe(0);
  expect(all.timeout).toBe(0);
  expect(all.config_error).toBe(0);

  const aOnly = getCountsSince(db, since, "a");
  expect(aOnly.success).toBe(1);
  expect(aOnly.failure).toBe(1);
  expect(aOnly.skipped_preflight).toBe(1);
});

test("getRunningRuns returns only running rows, newest first", () => {
  const db = freshDb();
  seedRun(db, { project: "a", job: "j", started_at: 100, status: "success" });
  insertRun(db, {
    project: "a", job: "j", fire_time: 200, started_at: 200,
    schedule: "*", is_test: false,
  });
  insertRun(db, {
    project: "b", job: "k", fire_time: 300, started_at: 300,
    schedule: "*", is_test: false,
  });

  const running = getRunningRuns(db);
  expect(running.length).toBe(2);
  expect(running[0]!.project).toBe("b"); // newest first
  expect(running[1]!.project).toBe("a");
  expect(running.every((r) => r.status === "running")).toBe(true);
});

test("getTopProjectsByActivity excludes both skip statuses", () => {
  const db = freshDb();
  const since = 0;
  // Project a: 2 active, 1 skip
  seedRun(db, { project: "a", job: "j", started_at: 100, status: "success" });
  seedRun(db, { project: "a", job: "j", started_at: 200, status: "failure" });
  seedRun(db, { project: "a", job: "j", started_at: 250, status: "skipped_preflight" });
  // Project b: 1 active, 5 skips (skips must NOT bump it above a)
  seedRun(db, { project: "b", job: "j", started_at: 300, status: "success" });
  for (let i = 0; i < 5; i++) {
    seedRun(db, { project: "b", job: "j", started_at: 310 + i, status: "skipped_overlap" });
  }
  // Project c: skips only — must be excluded entirely.
  seedRun(db, { project: "c", job: "j", started_at: 400, status: "skipped_preflight" });

  const top = getTopProjectsByActivity(db, since, 10);
  expect(top.length).toBe(2);
  expect(top[0]!.project).toBe("a");
  expect(top[0]!.active_count).toBe(2);
  expect(top[1]!.project).toBe("b");
  expect(top[1]!.active_count).toBe(1);
});

test("getTopJobsByActivity ranks by success+failure, reports skipped separately", () => {
  const db = freshDb();
  const since = 0;
  // p/j1: 2 success, 1 failure, 4 skips
  seedRun(db, { project: "p", job: "j1", started_at: 100, status: "success" });
  seedRun(db, { project: "p", job: "j1", started_at: 110, status: "success" });
  seedRun(db, { project: "p", job: "j1", started_at: 120, status: "failure" });
  for (let i = 0; i < 4; i++) {
    seedRun(db, { project: "p", job: "j1", started_at: 130 + i, status: "skipped_preflight" });
  }
  // p/j2: 1 success
  seedRun(db, { project: "p", job: "j2", started_at: 200, status: "success" });
  // p/j3: only skips — excluded.
  seedRun(db, { project: "p", job: "j3", started_at: 300, status: "skipped_overlap" });

  const top = getTopJobsByActivity(db, since, 10);
  expect(top.length).toBe(2);
  expect(top[0]!.job).toBe("j1");
  expect(top[0]!.success_count).toBe(2);
  expect(top[0]!.failure_count).toBe(1);
  expect(top[0]!.skipped_count).toBe(4);
  expect(top[1]!.job).toBe("j2");
});

test("getJobStatsSince returns counts, totals, last_run", () => {
  const db = freshDb();
  const since = 0;
  seedRun(db, {
    project: "p", job: "j", started_at: 100, status: "success",
    input_tokens: 1000, output_tokens: 200, cost_usd: 0.05,
  });
  seedRun(db, {
    project: "p", job: "j", started_at: 200, status: "failure",
    input_tokens: 500, output_tokens: 100, cost_usd: 0.02,
  });
  seedRun(db, {
    project: "p", job: "j", started_at: 300, status: "skipped_preflight",
  });
  // Different job — excluded.
  seedRun(db, {
    project: "p", job: "other", started_at: 400, status: "success",
    input_tokens: 9999, output_tokens: 9999, cost_usd: 99,
  });

  const stats = getJobStatsSince(db, "p", "j", since);
  const byStatus = Object.fromEntries(stats.counts.map((r) => [r.status, r.n]));
  expect(byStatus.success).toBe(1);
  expect(byStatus.failure).toBe(1);
  expect(byStatus.skipped_preflight).toBe(1);

  expect(stats.totals.i).toBe(1500);
  expect(stats.totals.o).toBe(300);
  expect(stats.totals.c).toBeCloseTo(0.07);

  expect(stats.last_run?.started_at).toBe(300);
  expect(stats.last_run?.status).toBe("skipped_preflight");
});

test("getJobStatsSince returns null last_run when no runs exist", () => {
  const db = freshDb();
  const stats = getJobStatsSince(db, "p", "j", 0);
  expect(stats.counts).toEqual([]);
  expect(stats.totals).toEqual({ i: 0, o: 0, c: 0 });
  expect(stats.last_run).toBeNull();
});

test("runs.inputs_json round-trip — null default + JSON stored/read", () => {
  const db = freshDb();

  // Without inputs_json — should default to null.
  insertRun(db, {
    project: "p", job: "j", fire_time: 1, started_at: 1,
    schedule: "*/5 * * * *", is_test: false,
  });
  const row1 = getRecentRuns(db, "p", "j", 1)[0]!;
  expect(row1.inputs_json).toBeNull();

  // With inputs_json — should round-trip through JSON.
  const id2 = insertRun(db, {
    project: "p", job: "j", fire_time: 2, started_at: 2,
    schedule: "*/5 * * * *", is_test: false,
    inputs_json: JSON.stringify({ TICKER: "NVDA", REQUEST_ID: "abc" }),
  });
  const rows = getRecentRuns(db, "p", "j", 2);
  const row2 = rows.find((r) => r.id === id2)!;
  expect(JSON.parse(row2.inputs_json!)).toEqual({ TICKER: "NVDA", REQUEST_ID: "abc" });
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
