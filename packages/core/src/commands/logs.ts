import { resolve } from "node:path";
import { DB_PATH, PROJECTS_TOML } from "../util/paths";
import { openDb } from "../db/connection";
import { readRegistry, findByPath } from "../job/registry";

export interface LogsOpts {
  target: string;
  last?: number;
  tail?: boolean;
  json?: boolean;
}

export async function cmdLogs(opts: LogsOpts): Promise<void> {
  const { project, job } = resolveTarget(opts.target);
  const db = openDb(DB_PATH);
  const limit = opts.last ?? 10;

  const rows = db
    .query(
      `SELECT id, started_at, ended_at, status, exit_code, cost_usd, summary, skip_count
       FROM runs WHERE project=? AND job=? ORDER BY started_at DESC LIMIT ?`
    )
    .all(project, job, limit) as any[];

  if (opts.json) {
    if (rows.length === 0) { console.log("[]"); return; }
    const id = rows[0].id;
    const events = db
      .query(`SELECT seq, ts, event_type, payload FROM events WHERE run_id=? ORDER BY seq`)
      .all(id) as any[];
    console.log(JSON.stringify({ run: rows[0], events }, null, 2));
    return;
  }

  if (opts.tail) {
    const last = rows[0];
    if (!last) { console.log("No runs yet."); return; }
    let seq = 0;
    console.log(`Tailing run #${last.id} (${last.status})...`);
    while (true) {
      const events = db
        .query(`SELECT seq, ts, event_type, payload FROM events WHERE run_id=? AND seq >= ? ORDER BY seq`)
        .all(last.id, seq) as any[];
      for (const e of events) {
        console.log(`[${new Date(e.ts).toISOString()}] ${e.event_type}: ${e.payload}`);
        seq = e.seq + 1;
      }
      const state = db.query("SELECT status FROM runs WHERE id=?").get(last.id) as any;
      if (state.status !== "running") break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    return;
  }

  for (const r of rows) {
    const collapsed = r.skip_count > 1;
    // Collapsed skip rows span first→latest skip; a duration is meaningless.
    const when = new Date(collapsed && r.ended_at ? r.ended_at : r.started_at).toISOString();
    const duration = collapsed ? "—" : r.ended_at ? `${r.ended_at - r.started_at}ms` : "—";
    const cost = r.cost_usd != null ? `$${r.cost_usd.toFixed(4)}` : "";
    const status = collapsed ? `${r.status} ×${r.skip_count}` : r.status;
    console.log(`#${r.id}  ${when}  ${status}  ${duration}  ${cost}`);
  }
}

function resolveTarget(s: string): { project: string; job: string } {
  if (s.includes("/")) {
    const parts = s.split("/");
    const [p, j] = parts;
    if (!p || !j || parts.length !== 2) throw new Error(`Invalid target: ${s}`);
    return { project: p, job: j };
  }
  const reg = readRegistry(PROJECTS_TOML);
  const p = findByPath(reg, resolve(process.cwd()));
  if (!p) throw new Error(`Bare job "${s}" but cwd is not a registered project.`);
  return { project: p.name, job: s };
}
