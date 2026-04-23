import type { Database } from "bun:sqlite";
import type {
  RunDTO, RunWithEventsDTO, EventDTO, PaginatedRunsDTO, RunStatus, EventType,
} from "../dto";

export interface ListRunsOpts {
  project?: string;
  job?: string;
  status?: string[];
  is_test?: boolean;
  limit: number;
  offset: number;
}

interface RunRow {
  id: number; project: string; job: string;
  fire_time: number; started_at: number; ended_at: number | null;
  status: RunStatus;
  exit_code: number | null; cost_usd: number | null; summary: string | null;
  schedule: string; is_test: number; pid: number | null;
}

function toRunDTO(r: RunRow): RunDTO {
  return {
    id: r.id, project: r.project, job: r.job,
    status: r.status,
    started_at: r.started_at, ended_at: r.ended_at,
    duration_ms: r.ended_at !== null ? r.ended_at - r.started_at : null,
    exit_code: r.exit_code, cost_usd: r.cost_usd, summary: r.summary,
    schedule: r.schedule,
    is_test: r.is_test === 1,
    pid: r.pid,
  };
}

export function listRuns(db: Database, opts: ListRunsOpts): PaginatedRunsDTO {
  const wheres: string[] = [];
  const args: (string | number)[] = [];
  if (opts.project) { wheres.push("project = ?"); args.push(opts.project); }
  if (opts.job) { wheres.push("job = ?"); args.push(opts.job); }
  if (opts.status && opts.status.length > 0) {
    wheres.push(`status IN (${opts.status.map(() => "?").join(",")})`);
    args.push(...opts.status);
  }
  if (opts.is_test !== undefined) { wheres.push("is_test = ?"); args.push(opts.is_test ? 1 : 0); }
  const whereSql = wheres.length > 0 ? `WHERE ${wheres.join(" AND ")}` : "";

  const total = (db
    .query(`SELECT COUNT(*) as n FROM runs ${whereSql}`)
    .get(...args) as { n: number }).n;

  const rows = db
    .query(
      `SELECT * FROM runs ${whereSql} ORDER BY started_at DESC LIMIT ? OFFSET ?`
    )
    .all(...args, opts.limit, opts.offset) as RunRow[];

  return {
    runs: rows.map(toRunDTO),
    total,
    limit: opts.limit,
    offset: opts.offset,
  };
}

export function getRunWithEvents(db: Database, id: number): RunWithEventsDTO | null {
  const row = db.query("SELECT * FROM runs WHERE id=?").get(id) as RunRow | null;
  if (!row) return null;
  const eventRows = db
    .query("SELECT seq, ts, event_type, payload FROM events WHERE run_id=? ORDER BY seq")
    .all(id) as { seq: number; ts: number; event_type: EventType; payload: string }[];
  const events: EventDTO[] = eventRows.map((e) => ({
    seq: e.seq,
    ts: e.ts,
    type: e.event_type,
    payload: safeParse(e.payload),
  }));
  return { ...toRunDTO(row), events };
}

export function pollNewEvents(
  db: Database, runId: number, afterSeq: number
): EventDTO[] {
  const rows = db
    .query(`SELECT seq, ts, event_type, payload FROM events
            WHERE run_id=? AND seq > ? ORDER BY seq`)
    .all(runId, afterSeq) as { seq: number; ts: number; event_type: EventType; payload: string }[];
  return rows.map((e) => ({
    seq: e.seq, ts: e.ts, type: e.event_type,
    payload: safeParse(e.payload),
  }));
}

export function getRunStatus(db: Database, runId: number): RunStatus | null {
  const row = db.query("SELECT status FROM runs WHERE id=?").get(runId) as
    { status: RunStatus } | null;
  return row?.status ?? null;
}

function safeParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return s; }
}
