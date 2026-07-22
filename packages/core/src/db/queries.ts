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
  inputs_json?: string | null;
}

export function insertRun(db: Database, r: InsertRunInput): number {
  const row = db
    .query(
      `INSERT INTO runs (project, job, fire_time, started_at, schedule, status, is_test, inputs_json)
       VALUES (?, ?, ?, ?, ?, 'running', ?, ?) RETURNING id`
    )
    .get(
      r.project, r.job, r.fire_time, r.started_at, r.schedule, r.is_test ? 1 : 0,
      r.inputs_json ?? null,
    ) as { id: number };
  return row.id;
}

export interface FinishRunInput {
  status: RunStatus;
  exit_code: number | null;
  cost_usd: number | null;
  summary: string | null;
  ended_at: number;
  /** Token usage from the claude `result` event. All optional — only the
   *  success path populates them; pre-claude terminal states (config_error,
   *  skipped_*, etc.) leave them null. */
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_tokens?: number | null;
  cache_read_tokens?: number | null;
}

export function finishRun(db: Database, id: number, f: FinishRunInput): void {
  db.query(
    `UPDATE runs SET status=?, exit_code=?, cost_usd=?, summary=?, ended_at=?,
       input_tokens=?, output_tokens=?, cache_creation_tokens=?, cache_read_tokens=?
     WHERE id=?`
  ).run(
    f.status, f.exit_code, f.cost_usd, f.summary, f.ended_at,
    f.input_tokens ?? null, f.output_tokens ?? null,
    f.cache_creation_tokens ?? null, f.cache_read_tokens ?? null,
    id,
  );
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
  pid: number | null;
  input_tokens: number | null; output_tokens: number | null;
  cache_creation_tokens: number | null; cache_read_tokens: number | null;
  inputs_json: string | null;
  /** Number of consecutive preflight skips this row represents (>= 1). On a
   *  collapsed row, started_at is the streak's first skip while fire_time /
   *  ended_at reflect the most recent one. Always 1 for other statuses. */
  skip_count: number;
}

/**
 * Collapse a just-finished skipped_preflight run into the previous row when
 * that row is itself a preflight skip for the same (project, job, is_test).
 * The NEW row survives (so its id — already handed to onStart — stays valid):
 * it inherits the streak's first started_at and accumulated skip_count; the
 * previous row and its events are deleted. Returns true when a collapse
 * happened.
 */
export function collapsePreflightSkip(db: Database, runId: number): boolean {
  return db.transaction(() => {
    const cur = db
      .query(
        `SELECT project, job, is_test FROM runs
         WHERE id=? AND status='skipped_preflight'`
      )
      .get(runId) as { project: string; job: string; is_test: number } | null;
    if (!cur) return false;
    const prev = db
      .query(
        `SELECT id, status, is_test, started_at, skip_count FROM runs
         WHERE project=? AND job=? AND id<>?
         ORDER BY started_at DESC, id DESC LIMIT 1`
      )
      .get(cur.project, cur.job, runId) as
      | { id: number; status: string; is_test: number; started_at: number; skip_count: number }
      | null;
    if (!prev || prev.status !== "skipped_preflight" || prev.is_test !== cur.is_test) {
      return false;
    }
    db.query(`UPDATE runs SET skip_count=?, started_at=? WHERE id=?`)
      .run(prev.skip_count + 1, prev.started_at, runId);
    db.query(`DELETE FROM events WHERE run_id=?`).run(prev.id);
    db.query(`DELETE FROM runs WHERE id=?`).run(prev.id);
    return true;
  })();
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
  // COALESCE(ended_at, started_at): a collapsed skip row's started_at is the
  // streak's FIRST skip and can age past the cutoff while the row still
  // tracks current activity — reap on last-activity time instead.
  const r = db
    .query(`DELETE FROM runs WHERE project=? AND job=? AND COALESCE(ended_at, started_at) < ?`)
    .run(project, job, cutoffMs);
  return Number(r.changes);
}

// ---------------------------------------------------------------------------
// Favorites
// ---------------------------------------------------------------------------

export function listFavorites(db: Database): string[] {
  return (db.query("SELECT project FROM favorites ORDER BY project").all() as Array<{ project: string }>)
    .map((r) => r.project);
}

export function setFavorite(db: Database, project: string): void {
  db.query("INSERT OR IGNORE INTO favorites (project, created_at) VALUES (?, ?)")
    .run(project, Date.now());
}

export function unsetFavorite(db: Database, project: string): void {
  db.query("DELETE FROM favorites WHERE project = ?").run(project);
}

// ---------------------------------------------------------------------------
// Dashboard aggregations
// ---------------------------------------------------------------------------

export type StatusCounts = Record<RunStatus, number>;

const ALL_STATUSES: RunStatus[] = [
  "running", "success", "failure", "timeout",
  "interrupted", "abandoned",
  "skipped_preflight", "skipped_overlap", "config_error",
];

/** Statuses that count as "real activity" — both skip statuses are excluded. */
const ACTIVE_STATUSES: RunStatus[] = [
  "success", "failure", "timeout",
  "interrupted", "abandoned", "config_error",
];

function zeroCounts(): StatusCounts {
  const out = {} as StatusCounts;
  for (const s of ALL_STATUSES) out[s] = 0;
  return out;
}

/**
 * Returns a status→count map for runs active in the window (last activity —
 * COALESCE(ended_at, started_at) — at or after `since`). skipped_preflight
 * rows count as their skip_count. Windowing on last activity keeps a long
 * skip streak (whose started_at predates the window) visible; the trade-off
 * is that a streak's full count attributes to any window containing its
 * latest skip. If `project` is given, scopes counts to that project.
 * Statuses with zero counts are still present in the returned object.
 */
export function getCountsSince(
  db: Database, since: number, project?: string
): StatusCounts {
  const out = zeroCounts();
  const select = `SELECT status,
       SUM(CASE WHEN status='skipped_preflight' THEN skip_count ELSE 1 END) AS n
     FROM runs`;
  const rows = project
    ? db.query(
        `${select} WHERE COALESCE(ended_at, started_at) >= ? AND project = ? GROUP BY status`
      ).all(since, project) as Array<{ status: RunStatus; n: number }>
    : db.query(
        `${select} WHERE COALESCE(ended_at, started_at) >= ? GROUP BY status`
      ).all(since) as Array<{ status: RunStatus; n: number }>;
  for (const r of rows) out[r.status] = r.n;
  return out;
}

/** Returns RunRows for runs with status='running', most recent first. */
export function getRunningRuns(db: Database): RunRow[] {
  return db
    .query(`SELECT * FROM runs WHERE status='running' ORDER BY started_at DESC`)
    .all() as RunRow[];
}

export interface ProjectActivityRow {
  project: string;
  active_count: number;
  last_started: number;
}

/**
 * Top projects by activity (excluding both skip statuses) in the window
 * starting at `since`. Ordered by active_count DESC, last_started DESC.
 */
export function getTopProjectsByActivity(
  db: Database, since: number, limit: number
): ProjectActivityRow[] {
  const placeholders = ACTIVE_STATUSES.map(() => "?").join(",");
  return db
    .query(
      `SELECT project,
              COUNT(*) AS active_count,
              MAX(started_at) AS last_started
       FROM runs
       WHERE started_at >= ?
         AND status IN (${placeholders})
       GROUP BY project
       HAVING active_count > 0
       ORDER BY active_count DESC, last_started DESC
       LIMIT ?`
    )
    .all(since, ...ACTIVE_STATUSES, limit) as ProjectActivityRow[];
}

export interface JobActivityRow {
  project: string;
  job: string;
  success_count: number;
  failure_count: number;
  skipped_count: number;
  last_started: number;
}

/**
 * Top (project, job) pairs by success+failure count in the window (last
 * activity at or after `since` — see getCountsSince for why). Skipped count
 * is reported separately for context (collapsed skipped_preflight rows count
 * as their skip_count) but does NOT factor into ranking or the inclusion
 * filter. Filters jobs with success+failure == 0.
 */
export function getTopJobsByActivity(
  db: Database, since: number, limit: number, project?: string
): JobActivityRow[] {
  const where = project
    ? "COALESCE(ended_at, started_at) >= ? AND project = ?"
    : "COALESCE(ended_at, started_at) >= ?";
  const args: Array<string | number> = project ? [since, project] : [since];
  return db
    .query(
      `SELECT project, job,
              SUM(CASE WHEN status='success' THEN 1 ELSE 0 END) AS success_count,
              SUM(CASE WHEN status='failure' THEN 1 ELSE 0 END) AS failure_count,
              SUM(CASE WHEN status='skipped_preflight' THEN skip_count
                       WHEN status='skipped_overlap' THEN 1 ELSE 0 END) AS skipped_count,
              MAX(started_at) AS last_started
       FROM runs
       WHERE ${where}
       GROUP BY project, job
       HAVING (success_count + failure_count) > 0
       ORDER BY (success_count + failure_count) DESC, last_started DESC
       LIMIT ?`
    )
    .all(...args, limit) as JobActivityRow[];
}

export interface JobStatsResult {
  counts: Array<{ status: RunStatus; n: number }>;
  totals: { i: number; o: number; c: number };
  last_run: RunRow | null;
}

/**
 * Per-job stats for runs active since `since` (last activity — see
 * getCountsSince): status histogram (collapsed skipped_preflight rows count
 * as their skip_count), token+cost totals, and the single most-recent run
 * (regardless of status).
 */
export function getJobStatsSince(
  db: Database, project: string, job: string, since: number
): JobStatsResult {
  const counts = db
    .query(
      `SELECT status,
              SUM(CASE WHEN status='skipped_preflight' THEN skip_count ELSE 1 END) AS n
       FROM runs
       WHERE project=? AND job=? AND COALESCE(ended_at, started_at) >= ?
       GROUP BY status`
    )
    .all(project, job, since) as Array<{ status: RunStatus; n: number }>;

  const totalsRow = db
    .query(
      `SELECT COALESCE(SUM(input_tokens), 0)  AS i,
              COALESCE(SUM(output_tokens), 0) AS o,
              COALESCE(SUM(cost_usd), 0)      AS c
       FROM runs
       WHERE project=? AND job=? AND COALESCE(ended_at, started_at) >= ?`
    )
    .get(project, job, since) as { i: number; o: number; c: number };

  const last_run = db
    .query(
      `SELECT * FROM runs
       WHERE project=? AND job=?
       ORDER BY started_at DESC LIMIT 1`
    )
    .get(project, job) as RunRow | null;

  return { counts, totals: totalsRow, last_run };
}
