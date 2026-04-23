import { existsSync } from "node:fs";
import { PROJECTS_TOML, DB_PATH, SECRETS_ENV, ROOT } from "../util/paths";
import { readRegistry } from "../job/registry";
import { openDb } from "../db/connection";
import { readCrontab } from "../cron/sync";

export async function cmdStatus(): Promise<void> {
  const problems: string[] = [];
  if (!existsSync(ROOT)) problems.push("~/.claude-cron does not exist; run `claude-cron init`");
  if (!existsSync(PROJECTS_TOML)) problems.push("projects.toml missing");
  if (!existsSync(SECRETS_ENV)) problems.push("secrets.env missing");
  if (!existsSync(DB_PATH)) problems.push("history.db missing");

  let preludeOk = false;
  try {
    const crontab = readCrontab();
    preludeOk = crontab.includes("# BEGIN claude-cron:prelude");
    if (!preludeOk) problems.push("crontab missing prelude block");
  } catch (e) {
    problems.push(`crontab -l failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  const reg = existsSync(PROJECTS_TOML) ? readRegistry(PROJECTS_TOML) : { projects: [] };
  console.log(`claude-cron status`);
  console.log(`  projects registered: ${reg.projects.length}`);
  for (const p of reg.projects) {
    console.log(`    - ${p.name} (${p.path})`);
  }

  if (existsSync(DB_PATH)) {
    const db = openDb(DB_PATH);
    const abandoned = db.query("SELECT COUNT(*) as n FROM runs WHERE status='abandoned'").get() as any;
    const failures = db
      .query("SELECT COUNT(*) as n FROM runs WHERE status IN ('failure','timeout') AND started_at > ?")
      .get(Date.now() - 24 * 3600_000) as any;
    console.log(`  abandoned runs (all time): ${abandoned.n}`);
    console.log(`  failures in last 24h:       ${failures.n}`);
    db.close();
  }

  console.log(`  crontab prelude: ${preludeOk ? "ok" : "MISSING"}`);

  if (problems.length === 0) {
    console.log("\nAll green.");
  } else {
    console.log("\nIssues:");
    for (const p of problems) console.log(`  - ${p}`);
    process.exitCode = 1;
  }
}
