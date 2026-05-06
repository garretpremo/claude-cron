import type { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { readRegistry } from "@claude-cron/core";
import { readCrontab } from "@claude-cron/core";
import { PROJECTS_TOML, DB_PATH, SECRETS_ENV, ROOT } from "@claude-cron/core";
import { json } from "../http/response";
import { toErrorResponse } from "../http/errors";
import type { StatusDTO } from "../dto";

export function statusController(db: Database) {
  return {
    get: () => {
      try {
        const problems: string[] = [];
        if (!existsSync(ROOT)) problems.push("~/.claude-cron does not exist");
        if (!existsSync(PROJECTS_TOML)) problems.push("projects.toml missing");
        if (!existsSync(SECRETS_ENV)) problems.push("secrets.env missing");
        if (!existsSync(DB_PATH)) problems.push("history.db missing");

        let preludeOk = false;
        try {
          preludeOk = readCrontab().includes("# BEGIN claude-cron:prelude");
          if (!preludeOk) problems.push("crontab missing prelude block");
        } catch (e) {
          problems.push(`crontab -l failed: ${e instanceof Error ? e.message : String(e)}`);
        }

        const reg = existsSync(PROJECTS_TOML) ? readRegistry(PROJECTS_TOML) : { projects: [] };
        const abandoned = db
          .query("SELECT COUNT(*) as n FROM runs WHERE status='abandoned'").get() as { n: number };
        const failures = db
          .query("SELECT COUNT(*) as n FROM runs WHERE status IN ('failure','timeout') AND started_at > ?")
          .get(Date.now() - 24 * 3600_000) as { n: number };

        const dto: StatusDTO = {
          healthy: problems.length === 0,
          problems,
          projects: reg.projects.length,
          abandoned_all_time: abandoned.n,
          failures_24h: failures.n,
          prelude_ok: preludeOk,
        };
        return json(dto);
      } catch (e) { return toErrorResponse(e); }
    },
  };
}
