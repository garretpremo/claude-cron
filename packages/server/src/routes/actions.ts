import type { Database } from "bun:sqlite";
import { z } from "zod";
import { defineRoute } from "../contract";
import {
  enableJob,
  disableJob,
  stopRun,
  runJobNow,
} from "../services/action-service";
import { cmdSync } from "@claude-cron/core";

export type SyncFn = (project: string) => Promise<void>;

const realSync: SyncFn = async (project: string) => {
  await cmdSync({ project });
};

export interface ActionsDeps {
  db: Database;
  registryPath: string;
  sync?: SyncFn;
}

const OkSchema = z.object({ ok: z.literal(true) });
const OkRunIdSchema = z.object({
  ok: z.literal(true),
  run_id: z.number().int(),
});

export function jobEnableRoute(deps: ActionsDeps) {
  const sync = deps.sync ?? realSync;
  return defineRoute({
    path: "/api/projects/:project/jobs/:job/enable",
    method: "POST",
    input: z.object({ project: z.string(), job: z.string() }),
    output: OkSchema,
    handler: async ({ project, job }) => {
      await enableJob(deps.db, deps.registryPath, project, job, sync);
      return { ok: true as const };
    },
  });
}

export function jobDisableRoute(deps: ActionsDeps) {
  const sync = deps.sync ?? realSync;
  return defineRoute({
    path: "/api/projects/:project/jobs/:job/disable",
    method: "POST",
    input: z.object({ project: z.string(), job: z.string() }),
    output: OkSchema,
    handler: async ({ project, job }) => {
      await disableJob(deps.db, deps.registryPath, project, job, sync);
      return { ok: true as const };
    },
  });
}

export function jobRunRoute(deps: ActionsDeps) {
  return defineRoute({
    path: "/api/projects/:project/jobs/:job/run",
    method: "POST",
    input: z.object({
      project: z.string(),
      job:     z.string(),
      inputs:  z.record(z.string(), z.string()).optional(),
    }),
    output: OkRunIdSchema,
    handler: async ({ project, job, inputs }) => {
      const { run_id } = await runJobNow(deps.db, deps.registryPath, project, job, inputs);
      return { ok: true as const, run_id };
    },
  });
}

export function runStopRoute(deps: ActionsDeps) {
  return defineRoute({
    path: "/api/runs/:id/stop",
    method: "POST",
    input: z.object({ id: z.coerce.number().int().positive() }),
    output: OkSchema,
    handler: ({ id }) => {
      stopRun(deps.db, id);
      return { ok: true as const };
    },
  });
}
