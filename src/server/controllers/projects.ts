import type { Database } from "bun:sqlite";
import { listProjects, getProject } from "../services/project-service";
import { listJobs, getJob } from "../services/job-service";
import { json } from "../http/response";
import { HttpError, toErrorResponse } from "../http/errors";

export function projectsController(db: Database, registryPath: string) {
  return {
    list: () => {
      try { return json(listProjects(db, registryPath)); }
      catch (e) { return toErrorResponse(e); }
    },
    get: (project: string) => {
      try {
        const p = getProject(db, registryPath, project);
        if (!p) throw new HttpError(404, `Project ${project} not found`, "NOT_FOUND");
        return json(p);
      } catch (e) { return toErrorResponse(e); }
    },
    listJobs: (project: string) => {
      try {
        const p = getProject(db, registryPath, project);
        if (!p) throw new HttpError(404, `Project ${project} not found`, "NOT_FOUND");
        return json(listJobs(db, registryPath, project));
      } catch (e) { return toErrorResponse(e); }
    },
    getJob: (project: string, jobName: string) => {
      try {
        const j = getJob(db, registryPath, project, jobName);
        if (!j) throw new HttpError(404, `Job ${project}/${jobName} not found`, "NOT_FOUND");
        return json(j);
      } catch (e) { return toErrorResponse(e); }
    },
  };
}
