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

test("listRuns coalesce=skipped_preflight collapses consecutive runs", () => {
  const db = fresh();
  // Seed in chronological order; listRuns returns DESC by started_at.
  // Sequence (oldest → newest): SP, SP, SP, SUCCESS, SP, SP, SUCCESS, SP
  // After DESC: SP, SUCCESS, SP, SP, SUCCESS, SP, SP, SP
  // Coalesced groups: [SP×1, SUCCESS, SP×2, SUCCESS, SP×3]  (5 groups)
  const seq: ("skipped_preflight" | "success")[] = [
    "skipped_preflight", "skipped_preflight", "skipped_preflight",
    "success",
    "skipped_preflight", "skipped_preflight",
    "success",
    "skipped_preflight",
  ];
  for (let i = 0; i < seq.length; i++) {
    seedRun(db, { project: "p", job: "j", started_at: i * 1000 },
      { status: seq[i], ended_at: i * 1000 + 1 });
  }

  const r = listRuns(db, {
    project: ["p"], job: "j",
    limit: 10, offset: 0, coalesce: "skipped_preflight",
  });
  expect(r.runs.length).toBe(5);
  expect(r.runs.map((x) => x.status)).toEqual([
    "skipped_preflight", "success", "skipped_preflight", "success", "skipped_preflight",
  ]);
  expect(r.runs.map((x) => x.coalesced_count ?? 1)).toEqual([1, 1, 2, 1, 3]);
  // total still reflects raw row count, not group count.
  expect(r.total).toBe(8);
});

test("listRuns coalesce respects limit and only counts groups", () => {
  const db = fresh();
  // 250 consecutive skipped_preflight then 1 success — limit=2 should
  // return [SP×250, success], proving the count survives chunked fetches.
  for (let i = 0; i < 250; i++) {
    seedRun(db, { project: "p", job: "j", started_at: i + 1 },
      { status: "skipped_preflight", ended_at: i + 2 });
  }
  seedRun(db, { project: "p", job: "j", started_at: 251 },
    { status: "success", ended_at: 252 });

  const r = listRuns(db, {
    project: ["p"], job: "j",
    limit: 2, offset: 0, coalesce: "skipped_preflight",
  });
  expect(r.runs.length).toBe(2);
  expect(r.runs[0]!.status).toBe("success");
  expect(r.runs[0]!.coalesced_count).toBeUndefined();
  expect(r.runs[1]!.status).toBe("skipped_preflight");
  expect(r.runs[1]!.coalesced_count).toBe(250);
});

test("listRuns coalesce does not cross (project, job) boundaries", () => {
  const db = fresh();
  // Activity view: runs from two different jobs interleaved by time.
  // SP rows from a/j and b/k must NOT collapse together even though both
  // have status skipped_preflight and are temporally adjacent.
  // Chronological (oldest → newest):
  //   a/j SP, a/j SP, b/k SP, a/j SP
  // DESC order returned: a/j SP, b/k SP, a/j SP, a/j SP
  // Expected groups (no cross-job merge): a/j×1, b/k×1, a/j×2
  seedRun(db, { project: "a", job: "j", started_at: 1 }, { status: "skipped_preflight", ended_at: 2 });
  seedRun(db, { project: "a", job: "j", started_at: 2 }, { status: "skipped_preflight", ended_at: 3 });
  seedRun(db, { project: "b", job: "k", started_at: 3 }, { status: "skipped_preflight", ended_at: 4 });
  seedRun(db, { project: "a", job: "j", started_at: 4 }, { status: "skipped_preflight", ended_at: 5 });

  const r = listRuns(db, { limit: 10, offset: 0, coalesce: "skipped_preflight" });
  expect(r.runs.length).toBe(3);
  expect(r.runs.map((x) => `${x.project}/${x.job}`)).toEqual(["a/j", "b/k", "a/j"]);
  expect(r.runs.map((x) => x.coalesced_count ?? 1)).toEqual([1, 1, 2]);
});

test("listRuns coalesce only collapses the targeted status", () => {
  const db = fresh();
  // Three consecutive failures should NOT coalesce when coalesce=skipped_preflight.
  for (let i = 0; i < 3; i++) {
    seedRun(db, { project: "p", job: "j", started_at: i },
      { status: "failure", ended_at: i + 1 });
  }
  const r = listRuns(db, {
    project: ["p"], job: "j",
    limit: 10, offset: 0, coalesce: "skipped_preflight",
  });
  expect(r.runs.length).toBe(3);
  for (const x of r.runs) expect(x.coalesced_count).toBeUndefined();
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
