import type { Database } from "bun:sqlite";
import {
  getCountsSince,
  getRunningRuns,
  getTopProjectsByActivity,
  getTopJobsByActivity,
  getJobStatsSince,
  readRegistry,
} from "@claude-cron/core";
import type {
  DashboardDTO,
  ProjectDashboardDTO,
  Counts,
  Since,
  JobStatsDTO,
} from "../contract/schemas";
import { toRunDTO } from "./run-service";

const TOP_LIMIT = 8;

const SINCE_MS: Record<Since, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d":  7  * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

function sinceTimestamp(since: Since): number {
  return Date.now() - SINCE_MS[since];
}

function asCounts(c: ReturnType<typeof getCountsSince>): Counts {
  return {
    running: c.running,
    success: c.success,
    failure: c.failure,
    timeout: c.timeout,
    interrupted: c.interrupted,
    abandoned: c.abandoned,
    skipped_preflight: c.skipped_preflight,
    skipped_overlap: c.skipped_overlap,
    config_error: c.config_error,
  };
}

export function globalDashboard(
  db: Database,
  registryPath: string,
  since: Since,
): DashboardDTO {
  const ts = sinceTimestamp(since);
  // Drop activity rows for projects no longer in the registry — orphan run
  // history is still queryable via /api/runs (the global firehose) but should
  // not appear on the dashboard, where every panel is a click target into a
  // page that requires the project to exist.
  const registered = new Set(readRegistry(registryPath).projects.map((p) => p.name));
  const top_projects = getTopProjectsByActivity(db, ts, TOP_LIMIT * 4)
    .filter((p) => registered.has(p.project))
    .slice(0, TOP_LIMIT);
  const top_jobs = getTopJobsByActivity(db, ts, TOP_LIMIT * 4)
    .filter((j) => registered.has(j.project))
    .slice(0, TOP_LIMIT);
  const running = getRunningRuns(db).filter((r) => registered.has(r.project));
  return {
    counts: asCounts(getCountsSince(db, ts)),
    running: running.map(toRunDTO),
    top_projects,
    top_jobs,
  };
}

export function projectDashboard(
  db: Database, project: string, since: Since
): ProjectDashboardDTO {
  const ts = sinceTimestamp(since);
  const running = getRunningRuns(db).filter((r) => r.project === project);
  return {
    counts: asCounts(getCountsSince(db, ts, project)),
    running: running.map(toRunDTO),
    top_jobs: getTopJobsByActivity(db, ts, TOP_LIMIT, project),
  };
}

export function jobStats(
  db: Database, project: string, job: string, since: Since
): JobStatsDTO {
  const ts = sinceTimestamp(since);
  const result = getJobStatsSince(db, project, job, ts);
  return {
    counts: result.counts,
    totals: result.totals,
    last_run: result.last_run ? toRunDTO(result.last_run) : null,
  };
}
