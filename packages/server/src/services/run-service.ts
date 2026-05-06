import type { Database } from "bun:sqlite";
import type { RunRow } from "@claude-cron/core";
import type {
  RunDTO, RunWithEventsDTO, EventDTO, PaginatedRunsDTO, RunStatus, EventType,
} from "../dto";

export interface ListRunsOpts {
  project?: string[];
  job?: string;
  status?: string[];
  is_test?: boolean;
  /** Inclusive lower bound on `started_at` (epoch ms). */
  since?: number;
  limit: number;
  offset: number;
  /** When set, consecutive runs with this status collapse into a single
   *  leader row whose `coalesced_count` reflects the group size. Other
   *  statuses are never coalesced. */
  coalesce?: RunStatus;
}

export function toRunDTO(r: RunRow): RunDTO {
  return {
    id: r.id, project: r.project, job: r.job,
    status: r.status,
    started_at: r.started_at, ended_at: r.ended_at,
    duration_ms: r.ended_at !== null ? r.ended_at - r.started_at : null,
    exit_code: r.exit_code, cost_usd: r.cost_usd, summary: r.summary,
    schedule: r.schedule,
    is_test: r.is_test === 1,
    pid: r.pid,
    input_tokens: r.input_tokens,
    output_tokens: r.output_tokens,
    cache_creation_tokens: r.cache_creation_tokens,
    cache_read_tokens: r.cache_read_tokens,
  };
}

export function listRuns(db: Database, opts: ListRunsOpts): PaginatedRunsDTO {
  const wheres: string[] = [];
  const args: (string | number)[] = [];
  if (opts.project && opts.project.length > 0) {
    wheres.push(`project IN (${opts.project.map(() => "?").join(",")})`);
    args.push(...opts.project);
  }
  if (opts.job) { wheres.push("job = ?"); args.push(opts.job); }
  if (opts.status && opts.status.length > 0) {
    wheres.push(`status IN (${opts.status.map(() => "?").join(",")})`);
    args.push(...opts.status);
  }
  if (opts.is_test !== undefined) { wheres.push("is_test = ?"); args.push(opts.is_test ? 1 : 0); }
  if (opts.since !== undefined) { wheres.push("started_at >= ?"); args.push(opts.since); }
  const whereSql = wheres.length > 0 ? `WHERE ${wheres.join(" AND ")}` : "";

  const total = (db
    .query(`SELECT COUNT(*) as n FROM runs ${whereSql}`)
    .get(...args) as { n: number }).n;

  if (opts.coalesce) {
    const groups = fetchCoalescedGroups(db, whereSql, args, opts);
    return {
      runs: groups.map(({ leader, count }) => {
        const dto = toRunDTO(leader);
        if (count > 1) dto.coalesced_count = count;
        return dto;
      }),
      total,
      limit: opts.limit,
      offset: opts.offset,
    };
  }

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

const COALESCE_CHUNK = 200;

function fetchCoalescedGroups(
  db: Database, whereSql: string, args: (string | number)[], opts: ListRunsOpts,
): { leader: RunRow; count: number }[] {
  const target = opts.coalesce!;
  const groups: { leader: RunRow; count: number }[] = [];
  // Iterate the result set in chunks, stopping once the limit-th group is
  // known to be complete (i.e. we've started a (limit+1)-th group, or the
  // table is exhausted). Offset is honored as a row-offset starting point.
  let offset = opts.offset;
  while (groups.length <= opts.limit) {
    const rows = db
      .query(`SELECT * FROM runs ${whereSql} ORDER BY started_at DESC LIMIT ? OFFSET ?`)
      .all(...args, COALESCE_CHUNK, offset) as RunRow[];
    if (rows.length === 0) break;
    for (const r of rows) {
      const last = groups[groups.length - 1];
      // Coalesce only within a single (project, job) so the count remains
      // semantically "this job fired N consecutive skipped_preflight runs".
      if (
        last
        && last.leader.status === target && r.status === target
        && last.leader.project === r.project && last.leader.job === r.job
      ) {
        last.count++;
      } else {
        groups.push({ leader: r, count: 1 });
        if (groups.length > opts.limit) break;
      }
    }
    offset += rows.length;
  }
  return groups.slice(0, opts.limit);
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
