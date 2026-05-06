import type { Database } from "bun:sqlite";
import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { readRegistry } from "@claude-cron/core";
import { jobsDir, lockPath } from "@claude-cron/core";
import { getJob } from "./job-service";
import { HttpError } from "../http/errors";
import { executeRun } from "@claude-cron/core";
import type { RunDTO, RunStatus, JobDetailDTO } from "../dto";

const ENABLED_LINE = /^(\s*enabled:\s*)(true|false)(\s*(?:#.*)?)$/m;
const SCHEDULE_LINE = /^(\s*schedule:\s*.+)$/m;

type SyncFn = (project: string) => Promise<void>;

export async function enableJob(
  db: Database, registryPath: string, project: string, jobName: string, sync: SyncFn,
): Promise<JobDetailDTO> {
  return setEnabled(db, registryPath, project, jobName, true, sync);
}

export async function disableJob(
  db: Database, registryPath: string, project: string, jobName: string, sync: SyncFn,
): Promise<JobDetailDTO> {
  return setEnabled(db, registryPath, project, jobName, false, sync);
}

async function setEnabled(
  db: Database, registryPath: string, project: string, jobName: string,
  target: boolean, sync: SyncFn,
): Promise<JobDetailDTO> {
  const reg = readRegistry(registryPath);
  const p = reg.projects.find((x) => x.name === project);
  if (!p) throw new HttpError(404, `Project ${project} not registered`, "NOT_FOUND");
  const file = join(jobsDir(p.path), `${jobName}.yaml`);
  if (!existsSync(file)) {
    throw new HttpError(404, `Job ${project}/${jobName} not found`, "NOT_FOUND");
  }

  const raw = readFileSync(file, "utf8");
  let parsed: any;
  try { parsed = YAML.parse(raw); }
  catch (e: any) {
    throw new HttpError(500, `YAML parse error: ${e.message}`, "YAML_INVALID");
  }
  const current = parsed?.enabled ?? true;

  if (current === target) {
    await sync(project);
    const dto = getJob(db, registryPath, project, jobName);
    if (!dto) throw new HttpError(500, "Job vanished after sync", "NOT_FOUND");
    return dto;
  }

  let next: string;
  if (ENABLED_LINE.test(raw)) {
    next = raw.replace(ENABLED_LINE, `$1${target}$3`);
  } else if (SCHEDULE_LINE.test(raw)) {
    next = raw.replace(SCHEDULE_LINE, `$1\nenabled: ${target}`);
  } else {
    next = `${raw.replace(/\n*$/, "")}\nenabled: ${target}\n`;
  }

  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, next);
  renameSync(tmp, file);

  await sync(project);
  const dto = getJob(db, registryPath, project, jobName);
  if (!dto) throw new HttpError(500, "Job vanished after sync", "NOT_FOUND");
  return dto;
}

interface StopRunOpts {
  killFn?: (pid: number, signal: NodeJS.Signals | number) => boolean;
}

export function stopRun(db: Database, runId: number, opts: StopRunOpts = {}): RunDTO {
  const row = db.query("SELECT * FROM runs WHERE id=?").get(runId) as any;
  if (!row) throw new HttpError(404, "Run not found", "NOT_FOUND");
  if (row.status !== "running") {
    throw new HttpError(409, `CANNOT_STOP_COMPLETED_RUN: run status is ${row.status}`, "CANNOT_STOP_COMPLETED_RUN");
  }
  if (!row.pid) {
    throw new HttpError(409, "NO_PID_YET: run has no pid yet", "NO_PID_YET");
  }
  const kill = opts.killFn ?? process.kill.bind(process);
  try {
    kill(row.pid, "SIGTERM");
  } catch (e: any) {
    if (e.code === "ESRCH") {
      throw new HttpError(409, "Process no longer exists", "PROCESS_GONE");
    }
    throw e;
  }
  return {
    id: row.id, project: row.project, job: row.job,
    status: row.status as RunStatus,
    started_at: row.started_at, ended_at: row.ended_at,
    duration_ms: row.ended_at !== null ? row.ended_at - row.started_at : null,
    exit_code: row.exit_code, cost_usd: row.cost_usd, summary: row.summary,
    schedule: row.schedule,
    is_test: row.is_test === 1,
    pid: row.pid,
    input_tokens: row.input_tokens ?? null,
    output_tokens: row.output_tokens ?? null,
    cache_creation_tokens: row.cache_creation_tokens ?? null,
    cache_read_tokens: row.cache_read_tokens ?? null,
  };
}

/**
 * Kick off a job immediately (manual trigger from the dashboard). Returns as
 * soon as the run row exists in the DB — does NOT wait for claude to finish.
 * The run continues in the same process; its events stream into the DB and
 * SSE subscribers see them live.
 */
export function runJobNow(
  db: Database, registryPath: string, project: string, jobName: string,
): Promise<{ run_id: number }> {
  const reg = readRegistry(registryPath);
  const p = reg.projects.find((x) => x.name === project);
  if (!p) throw new HttpError(404, `Project ${project} not registered`, "NOT_FOUND");
  const jobFile = join(jobsDir(p.path), `${jobName}.yaml`);
  if (!existsSync(jobFile)) {
    throw new HttpError(404, `Job ${project}/${jobName} not found`, "NOT_FOUND");
  }

  return new Promise<{ run_id: number }>((resolve, reject) => {
    let settled = false;
    executeRun({
      db, project,
      jobFile,
      lockPath: lockPath(project, jobName),
      isTest: false,
      onStart: (id) => {
        if (settled) return;
        settled = true;
        resolve({ run_id: id });
      },
    }).catch((e) => {
      // executeRun is designed to catch its own errors and surface them via
      // the run row; if we get here it's an unexpected failure before onStart.
      if (!settled) {
        settled = true;
        reject(e);
      }
    });
  });
}
