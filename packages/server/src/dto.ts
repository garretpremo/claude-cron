import type { RunStatus, EventType } from "@claude-cron/core";
import type { Job } from "@claude-cron/core";

export type { RunStatus, EventType };

export interface ProjectDTO {
  name: string;
  path: string;
  registered_at: number;
  job_count: number;
  last_run_at: number | null;
}

export interface JobSummaryDTO {
  project: string;
  name: string;
  schedule: string;
  enabled: boolean;
  description: string | null;
  last_run: {
    id: number;
    started_at: number;
    status: RunStatus;
  } | null;
  recent_runs: {
    total: number;
    successes: number;
    failures: number;
    skipped: number;
  };
}

export interface JobDetailDTO extends JobSummaryDTO {
  file: string;
  yaml: string;
  config: Job;
}

export interface RunDTO {
  id: number;
  project: string;
  job: string;
  status: RunStatus;
  started_at: number;
  ended_at: number | null;
  duration_ms: number | null;
  exit_code: number | null;
  cost_usd: number | null;
  summary: string | null;
  schedule: string;
  is_test: boolean;
  pid: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_creation_tokens: number | null;
  cache_read_tokens: number | null;
  /** Set on the leader row when listRuns coalesced consecutive same-status
   *  runs. The leader is the most recent in the group. Absent or 1 = no
   *  coalescing. */
  coalesced_count?: number;
}

export interface EventDTO {
  seq: number;
  ts: number;
  type: EventType;
  payload: unknown;
}

export interface RunWithEventsDTO extends RunDTO {
  events: EventDTO[];
}

export interface PaginatedRunsDTO {
  runs: RunDTO[];
  total: number;
  limit: number;
  offset: number;
}

export interface StatusDTO {
  healthy: boolean;
  problems: string[];
  projects: number;
  abandoned_all_time: number;
  failures_24h: number;
  prelude_ok: boolean;
}

export interface ErrorDTO {
  error: string;
  code: string;
  details?: unknown;
}
