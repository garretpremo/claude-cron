import { expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { openDb } from "@claude-cron/core";
import { listRuns, getRunWithEvents } from "../../src/services/run-service";
import { seedRun, seedEvents } from "../fixtures/seed";

function fresh() {
  const dir = mkdtempSync(join(tmpdir(), "rs-"));
  return openDb(join(dir, "h.db"));
}

test("listRuns empty", () => {
  const db = fresh();
  const r = listRuns(db, { limit: 50, offset: 0 });
  expect(r.runs).toEqual([]);
  expect(r.total).toBe(0);
});

test("listRuns pagination + total", () => {
  const db = fresh();
  for (let i = 0; i < 75; i++) {
    seedRun(db, { project: "p", job: "j", started_at: i },
      { status: "success", ended_at: i + 1, cost_usd: 0.01 });
  }
  const r = listRuns(db, { limit: 10, offset: 0 });
  expect(r.total).toBe(75);
  expect(r.runs.length).toBe(10);
  const r2 = listRuns(db, { limit: 10, offset: 70 });
  expect(r2.runs.length).toBe(5);
});

test("listRuns filters by project, job, status", () => {
  const db = fresh();
  seedRun(db, { project: "a", job: "j", started_at: 1 }, { status: "success" });
  seedRun(db, { project: "a", job: "k", started_at: 2 }, { status: "failure" });
  seedRun(db, { project: "b", job: "j", started_at: 3 }, { status: "success" });

  expect(listRuns(db, { project: ["a"], limit: 50, offset: 0 }).runs.length).toBe(2);
  expect(listRuns(db, { project: ["a"], job: "j", limit: 50, offset: 0 }).runs.length).toBe(1);
  expect(listRuns(db, { project: ["a", "b"], limit: 50, offset: 0 }).runs.length).toBe(3);
  expect(listRuns(db, { status: ["success"], limit: 50, offset: 0 }).runs.length).toBe(2);
  expect(listRuns(db, { status: ["success", "failure"], limit: 50, offset: 0 }).runs.length).toBe(3);
});

test("listRuns returns is_test as boolean", () => {
  const db = fresh();
  seedRun(db, { project: "p", job: "j", is_test: true }, { status: "success" });
  const r = listRuns(db, { limit: 10, offset: 0 });
  expect(r.runs[0]!.is_test).toBe(true);
});

test("listRuns derives duration_ms", () => {
  const db = fresh();
  seedRun(db, { project: "p", job: "j", started_at: 1000 },
    { status: "success", ended_at: 1500 });
  const r = listRuns(db, { limit: 10, offset: 0 });
  expect(r.runs[0]!.duration_ms).toBe(500);
});

test("listRuns exposes skip_count as coalesced_count", () => {
  const db = fresh();
  // Rows arrive pre-collapsed from the DB (executor/migration); the service
  // just surfaces skip_count. skip_count=1 must NOT set coalesced_count.
  seedRun(db, { project: "p", job: "j", started_at: 1000 },
    { status: "skipped_preflight", ended_at: 5000, skip_count: 123 });
  seedRun(db, { project: "p", job: "j", started_at: 6000 },
    { status: "success", ended_at: 6500 });
  seedRun(db, { project: "p", job: "j", started_at: 7000 },
    { status: "skipped_preflight", ended_at: 7100 });

  const r = listRuns(db, { project: ["p"], job: "j", limit: 10, offset: 0 });
  expect(r.runs.map((x) => x.status)).toEqual([
    "skipped_preflight", "success", "skipped_preflight",
  ]);
  expect(r.runs.map((x) => x.coalesced_count)).toEqual([undefined, undefined, 123]);
  expect(r.total).toBe(3);
});

test("listRuns orders by last activity so collapsed rows surface at their latest skip", () => {
  const db = fresh();
  // Streak began at 1000 (started_at) but last skipped at 9000 — it must
  // rank above the success that ended at 5000.
  seedRun(db, { project: "p", job: "j", started_at: 1000 },
    { status: "skipped_preflight", ended_at: 9000, skip_count: 40 });
  seedRun(db, { project: "p", job: "k", started_at: 4000 },
    { status: "success", ended_at: 5000 });

  const r = listRuns(db, { limit: 10, offset: 0 });
  expect(r.runs.map((x) => x.job)).toEqual(["j", "k"]);
});

test("listRuns since filters on last activity, not streak start", () => {
  const db = fresh();
  // Streak started before the window but is still actively skipping.
  seedRun(db, { project: "p", job: "j", started_at: 1000 },
    { status: "skipped_preflight", ended_at: 9000, skip_count: 40 });
  // Genuinely old run — excluded.
  seedRun(db, { project: "p", job: "k", started_at: 1000 },
    { status: "success", ended_at: 1100 });

  const r = listRuns(db, { since: 5000, limit: 10, offset: 0 });
  expect(r.runs.map((x) => x.job)).toEqual(["j"]);
  expect(r.total).toBe(1);
});

test("getRunWithEvents includes ordered events with parsed payload", () => {
  const db = fresh();
  const id = seedRun(db, { project: "p", job: "j" }, { status: "running" });
  seedEvents(db, id, [["start", { project: "p" }], ["preflight", { ok: true }]]);
  const run = getRunWithEvents(db, id);
  expect(run).not.toBeNull();
  expect(run!.events.length).toBe(2);
  expect(run!.events[0]!.type).toBe("start");
  expect((run!.events[0]!.payload as any).project).toBe("p");
});

test("getRunWithEvents returns null for unknown run", () => {
  expect(getRunWithEvents(fresh(), 9999)).toBeNull();
});

test("toRunDTO round-trips inputs_json", () => {
  const db = fresh();
  const inputs = JSON.stringify({ TICKER: "NVDA", COUNT: "5" });
  const id = seedRun(db, { project: "p", job: "j", inputs_json: inputs }, { status: "success" });
  const run = getRunWithEvents(db, id);
  expect(run).not.toBeNull();
  expect(run!.inputs_json).toBe(inputs);
});

test("toRunDTO inputs_json is null when not set", () => {
  const db = fresh();
  const id = seedRun(db, { project: "p", job: "j" }, { status: "success" });
  const run = getRunWithEvents(db, id);
  expect(run!.inputs_json).toBeNull();
});
