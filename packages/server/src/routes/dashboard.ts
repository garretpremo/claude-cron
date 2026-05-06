import type { Database } from "bun:sqlite";
import { z } from "zod";
import { defineRoute } from "../contract";
import {
  DashboardDTOSchema,
  ProjectDashboardDTOSchema,
  JobStatsDTOSchema,
  SinceSchema,
} from "../contract/schemas";
import {
  globalDashboard,
  projectDashboard,
  jobStats,
} from "../services/dashboard-service";
import { getProject } from "../services/project-service";
import { HttpError } from "../http/errors";

export interface DashboardDeps {
  db: Database;
  registryPath: string;
}

export function dashboardGlobalRoute(deps: DashboardDeps) {
  return defineRoute({
    path: "/api/dashboard",
    method: "GET",
    input: z.object({ since: SinceSchema }),
    output: DashboardDTOSchema,
    handler: ({ since }) => globalDashboard(deps.db, since),
  });
}

export function dashboardProjectRoute(deps: DashboardDeps) {
  return defineRoute({
    path: "/api/projects/:project/dashboard",
    method: "GET",
    input: z.object({
      project: z.string(),
      since: SinceSchema,
    }),
    output: ProjectDashboardDTOSchema,
    handler: ({ project, since }) => {
      const p = getProject(deps.db, deps.registryPath, project);
      if (!p) throw new HttpError(404, `Project ${project} not found`, "NOT_FOUND");
      return projectDashboard(deps.db, project, since);
    },
  });
}

export function jobStatsRoute(deps: DashboardDeps) {
  return defineRoute({
    path: "/api/projects/:project/jobs/:job/stats",
    method: "GET",
    input: z.object({
      project: z.string(),
      job: z.string(),
      since: SinceSchema,
    }),
    output: JobStatsDTOSchema,
    handler: ({ project, job, since }) => {
      const p = getProject(deps.db, deps.registryPath, project);
      if (!p) throw new HttpError(404, `Project ${project} not found`, "NOT_FOUND");
      return jobStats(deps.db, project, job, since);
    },
  });
}
