import type { Database } from "bun:sqlite";
import { listRuns, getRunWithEvents } from "../services/run-service";
import { json } from "../http/response";
import { HttpError, toErrorResponse } from "../http/errors";
import { parseIntParam, parseStringParam, parseCSVParam } from "../http/query";
import type { RunStatus } from "../dto";

const COALESCE_ALLOWED: ReadonlySet<RunStatus> = new Set(["skipped_preflight"]);

export function runsController(db: Database) {
  return {
    list: (url: URL) => {
      try {
        const q = url.searchParams;
        const coalesceRaw = parseStringParam(q.get("coalesce") ?? undefined);
        let coalesce: RunStatus | undefined;
        if (coalesceRaw !== undefined) {
          if (!COALESCE_ALLOWED.has(coalesceRaw as RunStatus)) {
            throw new HttpError(
              400,
              `coalesce must be one of: ${[...COALESCE_ALLOWED].join(", ")}`,
              "BAD_COALESCE",
            );
          }
          coalesce = coalesceRaw as RunStatus;
        }
        return json(
          listRuns(db, {
            project: parseStringParam(q.get("project") ?? undefined),
            job: parseStringParam(q.get("job") ?? undefined),
            status: parseCSVParam(q.get("status") ?? undefined),
            is_test: q.get("is_test") === "true" ? true
              : q.get("is_test") === "false" ? false : undefined,
            limit: parseIntParam(q.get("limit") ?? undefined, 50, 500),
            offset: parseIntParam(q.get("offset") ?? undefined, 0),
            coalesce,
          })
        );
      } catch (e) { return toErrorResponse(e); }
    },
    get: (idRaw: string) => {
      try {
        const id = Number(idRaw);
        if (!Number.isInteger(id) || id <= 0) {
          throw new HttpError(400, "Invalid run id", "BAD_ID");
        }
        const r = getRunWithEvents(db, id);
        if (!r) throw new HttpError(404, `Run ${id} not found`, "NOT_FOUND");
        return json(r);
      } catch (e) { return toErrorResponse(e); }
    },
  };
}
