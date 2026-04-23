import { expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { openDb } from "../../../src/db/connection";
import { listRuns, getRunWithEvents } from "../../../src/server/services/run-service";
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

  expect(listRuns(db, { project: "a", limit: 50, offset: 0 }).runs.length).toBe(2);
  expect(listRuns(db, { project: "a", job: "j", limit: 50, offset: 0 }).runs.length).toBe(1);
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
