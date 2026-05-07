import type { Database } from "bun:sqlite";
import { z } from "zod";
import { defineRoute } from "../contract";
import {
  ProjectDTOSchema,
  JobSummaryDTOSchema,
  JobDetailDTOSchema,
} from "../contract/schemas";
import { listProjects, getProject } from "../services/project-service";
import { listJobs, getJob } from "../services/job-service";
import { HttpError } from "../http/errors";

export interface ProjectDeps {
  db: Database;
  registryPath: string;
}

export function projectsListRoute(deps: ProjectDeps) {
  return defineRoute({
    path: "/api/projects",
    method: "GET",
    input: z.object({}),
    output: z.array(ProjectDTOSchema),
    handler: () => listProjects(deps.db, deps.registryPath),
  });
}

export function projectGetRoute(deps: ProjectDeps) {
  return defineRoute({
    path: "/api/projects/:project",
    method: "GET",
    input: z.object({ project: z.string() }),
    output: ProjectDTOSchema,
    handler: ({ project }) => {
      const p = getProject(deps.db, deps.registryPath, project);
      if (!p) throw new HttpError(404, `Project ${project} not found`, "NOT_FOUND");
      return p;
    },
  });
}

export function projectJobsListRoute(deps: ProjectDeps) {
  return defineRoute({
    path: "/api/projects/:project/jobs",
    method: "GET",
    input: z.object({ project: z.string() }),
    output: z.array(JobSummaryDTOSchema),
    handler: ({ project }) => {
      const p = getProject(deps.db, deps.registryPath, project);
      if (!p) throw new HttpError(404, `Project ${project} not found`, "NOT_FOUND");
      return listJobs(deps.db, deps.registryPath, project);
    },
  });
}

export function projectJobGetRoute(deps: ProjectDeps) {
  return defineRoute({
    path: "/api/projects/:project/jobs/:job",
    method: "GET",
    input: z.object({ project: z.string(), job: z.string() }),
    output: JobDetailDTOSchema,
    handler: ({ project, job }) => {
      const j = getJob(deps.db, deps.registryPath, project, job);
      if (!j) throw new HttpError(404, `Job ${project}/${job} not found`, "NOT_FOUND");
      return j;
    },
  });
}
