import type { Database } from "bun:sqlite";
import {
  enableJob, disableJob, stopRun, runJobNow,
} from "../services/action-service";
import { json } from "../http/response";
import { HttpError, toErrorResponse } from "../http/errors";
import { cmdSync } from "../../commands/sync";

type SyncFn = (project: string) => Promise<void>;

const realSync: SyncFn = async (project: string) => {
  await cmdSync({ project });
};

export function actionsController(
  db: Database, registryPath: string, sync: SyncFn = realSync
) {
  return {
    enable: async (project: string, job: string) => {
      try {
        return json(await enableJob(db, registryPath, project, job, sync));
      } catch (e) { return toErrorResponse(e); }
    },
    disable: async (project: string, job: string) => {
      try {
        return json(await disableJob(db, registryPath, project, job, sync));
      } catch (e) { return toErrorResponse(e); }
    },
    stop: (runIdRaw: string) => {
      try {
        const id = Number(runIdRaw);
        if (!Number.isInteger(id) || id <= 0) {
          throw new HttpError(400, "Invalid run id", "BAD_ID");
        }
        return json(stopRun(db, id));
      } catch (e) { return toErrorResponse(e); }
    },
    run: async (project: string, job: string) => {
      try {
        return json(await runJobNow(db, registryPath, project, job));
      } catch (e) { return toErrorResponse(e); }
    },
  };
}
