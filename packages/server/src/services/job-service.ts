import type { Database } from "bun:sqlite";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { readRegistry, type ProjectEntry } from "@claude-cron/core";
import { loadJobsFromDir } from "@claude-cron/core";
import { jobsDir } from "@claude-cron/core";
import type { JobSummaryDTO, JobDetailDTO, RunStatus } from "../dto";
import { JobSchema } from "@claude-cron/core";
import YAML from "yaml";

const RECENT_WINDOW = 50;

function resolveProject(registryPath: string, projectName: string): ProjectEntry | null {
  const reg = readRegistry(registryPath);
  return reg.projects.find((p) => p.name === projectName) ?? null;
}

function buildSummary(
  db: Database, project: string, jobName: string, enabled: boolean,
  schedule: string, description: string | null
): JobSummaryDTO {
  const last = db
    .query(`SELECT id, started_at, status FROM runs
            WHERE project=? AND job=? ORDER BY started_at DESC LIMIT 1`)
    .get(project, jobName) as { id: number; started_at: number; status: RunStatus } | null;

  const recent = db
    .query(`SELECT status FROM runs WHERE project=? AND job=? ORDER BY started_at DESC LIMIT ?`)
    .all(project, jobName, RECENT_WINDOW) as { status: string }[];

  const counts = { total: recent.length, successes: 0, failures: 0, skipped: 0 };
  for (const r of recent) {
    if (r.status === "success") counts.successes++;
    else if (["failure", "timeout", "config_error", "abandoned"].includes(r.status)) counts.failures++;
    else if (r.status === "skipped_preflight" || r.status === "skipped_overlap") counts.skipped++;
  }

  return {
    project, name: jobName, schedule, enabled, description,
    last_run: last
      ? { id: last.id, started_at: last.started_at, status: last.status }
      : null,
    recent_runs: counts,
  };
}

export function listJobs(
  db: Database, registryPath: string, projectName: string
): JobSummaryDTO[] {
  const p = resolveProject(registryPath, projectName);
  if (!p) return [];
  const dir = jobsDir(p.path);
  if (!existsSync(dir)) return [];
  const r = loadJobsFromDir(dir);
  return r.loaded.map(({ job }) =>
    buildSummary(db, projectName, job.name, job.enabled, job.schedule, job.description)
  );
}

export function getJob(
  db: Database, registryPath: string, projectName: string, jobName: string
): JobDetailDTO | null {
  const p = resolveProject(registryPath, projectName);
  if (!p) return null;
  const file = join(jobsDir(p.path), `${jobName}.yaml`);
  if (!existsSync(file)) return null;
  let yaml: string;
  try {
    yaml = readFileSync(file, "utf8");
  } catch {
    return null;
  }
  const parsed = JobSchema.safeParse(YAML.parse(yaml));
  if (!parsed.success) return null;
  const config = parsed.data;
  const summary = buildSummary(
    db, projectName, config.name, config.enabled,
    config.schedule, config.description
  );
  return { ...summary, file, yaml, config };
}
