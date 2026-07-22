import type { Database } from "bun:sqlite";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { InsertRunInput, EventType, RunStatus } from "@claude-cron/core";
import { insertRun, appendEvent, finishRun } from "@claude-cron/core";
import {
  writeRegistry, addProject, readRegistry,
  type ProjectEntry,
} from "@claude-cron/core";

export interface SeedRunOpts {
  status?: RunStatus;
  ended_at?: number;
  cost_usd?: number | null;
  summary?: string | null;
  exit_code?: number | null;
  pid?: number | null;
  /** Seeds a collapsed skipped_preflight row representing N consecutive skips. */
  skip_count?: number;
}

export function seedRun(
  db: Database,
  base: Partial<InsertRunInput> & { project?: string; job?: string },
  opts: SeedRunOpts = {}
): number {
  const input: InsertRunInput = {
    project: base.project ?? "p",
    job: base.job ?? "j",
    fire_time: base.fire_time ?? Date.now(),
    started_at: base.started_at ?? Date.now(),
    schedule: base.schedule ?? "* * * * *",
    is_test: base.is_test ?? false,
    inputs_json: base.inputs_json ?? null,
  };
  const id = insertRun(db, input);
  if (opts.pid !== undefined && opts.pid !== null) {
    db.query("UPDATE runs SET pid=? WHERE id=?").run(opts.pid, id);
  }
  if (opts.status && opts.status !== "running") {
    finishRun(db, id, {
      status: opts.status,
      exit_code: opts.exit_code ?? 0,
      cost_usd: opts.cost_usd ?? null,
      summary: opts.summary ?? null,
      ended_at: opts.ended_at ?? Date.now(),
    });
  }
  if (opts.skip_count !== undefined) {
    db.query("UPDATE runs SET skip_count=? WHERE id=?").run(opts.skip_count, id);
  }
  return id;
}

export function seedEvents(
  db: Database,
  runId: number,
  entries: Array<[EventType, unknown]>
): void {
  const startTs = Date.now();
  entries.forEach(([type, payload], i) => {
    appendEvent(db, runId, i, startTs + i, type, payload);
  });
}

export function seedProject(
  registryPath: string,
  p: Omit<ProjectEntry, "registered_at"> & { registered_at?: number }
): void {
  const reg = addProject(readRegistry(registryPath), {
    ...p,
    registered_at: p.registered_at ?? Date.now(),
  });
  writeRegistry(registryPath, reg);
}

export function seedJobFile(
  projectPath: string,
  jobName: string,
  yamlBody: string
): string {
  const dir = join(projectPath, ".claude-jobs");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${jobName}.yaml`);
  writeFileSync(file, yamlBody);
  return file;
}
