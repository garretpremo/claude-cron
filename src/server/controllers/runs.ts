import type { Database } from "bun:sqlite";
import { listRuns, getRunWithEvents } from "../services/run-service";
import { json } from "../http/response";
import { HttpError, toErrorResponse } from "../http/errors";
import { parseIntParam, parseStringParam, parseCSVParam } from "../http/query";

export function runsController(db: Database) {
  return {
    list: (url: URL) => {
      try {
        const q = url.searchParams;
        return json(
          listRuns(db, {
            project: parseStringParam(q.get("project") ?? undefined),
            job: parseStringParam(q.get("job") ?? undefined),
            status: parseCSVParam(q.get("status") ?? undefined),
            is_test: q.get("is_test") === "true" ? true
              : q.get("is_test") === "false" ? false : undefined,
            limit: parseIntParam(q.get("limit") ?? undefined, 50, 500),
            offset: parseIntParam(q.get("offset") ?? undefined, 0),
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
