import { z } from "zod";
import { JobSchema } from "@claude-cron/core";

export const RunStatusSchema = z.enum([
  "running",
  "success",
  "failure",
  "timeout",
  "interrupted",
  "abandoned",
  "skipped_preflight",
  "skipped_overlap",
  "config_error",
]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const EventTypeSchema = z.enum([
  "start",
  "preflight",
  "prompt_cmd",
  "claude_stdout",
  "claude_stderr",
  "end",
]);
export type EventType = z.infer<typeof EventTypeSchema>;

export const ProjectDTOSchema = z.object({
  name: z.string(),
  path: z.string(),
  registered_at: z.number(),
  job_count: z.number().int(),
  last_run_at: z.number().nullable(),
});
export type ProjectDTO = z.infer<typeof ProjectDTOSchema>;

const JobLastRunSchema = z
  .object({
    id: z.number().int(),
    started_at: z.number(),
    status: RunStatusSchema,
  })
  .nullable();

const JobRecentRunsSchema = z.object({
  total: z.number().int(),
  successes: z.number().int(),
  failures: z.number().int(),
  skipped: z.number().int(),
});

export const JobSummaryDTOSchema = z.object({
  project: z.string(),
  name: z.string(),
  schedule: z.string(),
  enabled: z.boolean(),
  description: z.string().nullable(),
  last_run: JobLastRunSchema,
  recent_runs: JobRecentRunsSchema,
});
export type JobSummaryDTO = z.infer<typeof JobSummaryDTOSchema>;

export const JobDetailDTOSchema = JobSummaryDTOSchema.extend({
  file: z.string(),
  yaml: z.string(),
  config: JobSchema,
});
export type JobDetailDTO = z.infer<typeof JobDetailDTOSchema>;

export const RunDTOSchema = z.object({
  id: z.number().int(),
  project: z.string(),
  job: z.string(),
  status: RunStatusSchema,
  started_at: z.number(),
  ended_at: z.number().nullable(),
  duration_ms: z.number().int().nullable(),
  exit_code: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  summary: z.string().nullable(),
  schedule: z.string(),
  is_test: z.boolean(),
  pid: z.number().int().nullable(),
  input_tokens: z.number().int().nullable(),
  output_tokens: z.number().int().nullable(),
  cache_creation_tokens: z.number().int().nullable(),
  cache_read_tokens: z.number().int().nullable(),
  coalesced_count: z.number().int().optional(),
});
export type RunDTO = z.infer<typeof RunDTOSchema>;

export const EventDTOSchema = z.object({
  seq: z.number().int(),
  ts: z.number(),
  type: EventTypeSchema,
  payload: z.unknown(),
});
export type EventDTO = z.infer<typeof EventDTOSchema>;

export const RunWithEventsDTOSchema = RunDTOSchema.extend({
  events: z.array(EventDTOSchema),
});
export type RunWithEventsDTO = z.infer<typeof RunWithEventsDTOSchema>;

export const PaginatedRunsDTOSchema = z.object({
  runs: z.array(RunDTOSchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
});
export type PaginatedRunsDTO = z.infer<typeof PaginatedRunsDTOSchema>;

export const StatusDTOSchema = z.object({
  healthy: z.boolean(),
  problems: z.array(z.string()),
  projects: z.number().int(),
  abandoned_all_time: z.number().int(),
  failures_24h: z.number().int(),
  prelude_ok: z.boolean(),
});
export type StatusDTO = z.infer<typeof StatusDTOSchema>;

export const ErrorDTOSchema = z.object({
  error: z.string(),
  code: z.string(),
  details: z.unknown().optional(),
});
export type ErrorDTO = z.infer<typeof ErrorDTOSchema>;
