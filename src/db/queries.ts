import type { Database } from "bun:sqlite";

export type RunStatus =
  | "running" | "success" | "failure" | "timeout"
  | "interrupted" | "abandoned"
  | "skipped_preflight" | "skipped_overlap" | "config_error";

export type EventType =
  | "start" | "preflight" | "prompt_cmd"
  | "claude_stdout" | "claude_stderr" | "end";

export interface InsertRunInput {
  project: string;
  job: string;
  fire_time: number;
  started_at: number;
  schedule: string;
  is_test: boolean;
}

export function insertRun(db: Database, r: InsertRunInput): number {
  const row = db
    .query(
      `INSERT INTO runs (project, job, fire_time, started_at, schedule, status, is_test)
       VALUES (?, ?, ?, ?, ?, 'running', ?) RETURNING id`
    )
    .get(
      r.project, r.job, r.fire_time, r.started_at, r.schedule, r.is_test ? 1 : 0
    ) as { id: number };
  return row.id;
}

export interface FinishRunInput {
  status: RunStatus;
  exit_code: number | null;
  cost_usd: number | null;
  summary: string | null;
  ended_at: number;
}

export function finishRun(db: Database, id: number, f: FinishRunInput): void {
  db.query(
    `UPDATE runs SET status=?, exit_code=?, cost_usd=?, summary=?, ended_at=? WHERE id=?`
  ).run(f.status, f.exit_code, f.cost_usd, f.summary, f.ended_at, id);
}

export function appendEvent(
  db: Database, run_id: number, seq: number, ts: number,
  event_type: EventType, payload: unknown
): void {
  db.query(
    `INSERT INTO events (run_id, seq, ts, event_type, payload) VALUES (?, ?, ?, ?, ?)`
  ).run(run_id, seq, ts, event_type, JSON.stringify(payload));
}

export function abandonStaleRuns(db: Database, nowMs: number, thresholdMs: number): number {
  const cutoff = nowMs - thresholdMs;
  const result = db
    .query(
      `UPDATE runs SET status='abandoned', ended_at=? WHERE status='running' AND started_at < ?`
    )
    .run(nowMs, cutoff);
  return Number(result.changes);
}

export interface RunRow {
  id: number; project: string; job: string;
  fire_time: number; started_at: number; ended_at: number | null;
  status: RunStatus; exit_code: number | null; cost_usd: number | null;
  summary: string | null; schedule: string; is_test: number;
}

export function getRecentRuns(
  db: Database, project: string, job: string, limit: number
): RunRow[] {
  return db
    .query(
      `SELECT * FROM runs WHERE project=? AND job=? ORDER BY started_at DESC LIMIT ?`
    )
    .all(project, job, limit) as RunRow[];
}

export function deleteOldRuns(
  db: Database, project: string, job: string, cutoffMs: number
): number {
  const r = db
    .query(`DELETE FROM runs WHERE project=? AND job=? AND started_at < ?`)
    .run(project, job, cutoffMs);
  return Number(r.changes);
}
