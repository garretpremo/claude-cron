import { resolve } from "node:path";
import { PROJECTS_TOML, GLOBAL_DIR, DB_PATH, jobsDir } from "../util/paths";
import { readRegistry, findByPath } from "../job/registry";
import { loadJobsFromDir } from "../job/loader";
import { openDb } from "../db/connection";
import { getRecentRuns } from "../db/queries";

export interface ListOpts {
  project?: string;
  global?: boolean;
  all?: boolean;
  json?: boolean;
}

export async function cmdList(opts: ListOpts): Promise<void> {
  const reg = readRegistry(PROJECTS_TOML);
  const db = openDb(DB_PATH);
  const rows: any[] = [];

  const addFor = (project: string, dir: string) => {
    const r = loadJobsFromDir(dir);
    for (const { file, job } of r.loaded) {
      const [last] = getRecentRuns(db, project, job.name, 1);
      rows.push({
        project, job: job.name, schedule: job.schedule,
        enabled: job.enabled,
        last_run: last?.started_at ?? null,
        last_status: last?.status ?? null,
        file,
      });
    }
    for (const err of r.errors) {
      rows.push({ project, error: err.message, file: err.file });
    }
  };

  if (opts.global) {
    addFor("global", GLOBAL_DIR);
  } else if (opts.all) {
    for (const p of reg.projects) addFor(p.name, jobsDir(p.path));
    addFor("global", GLOBAL_DIR);
  } else if (opts.project) {
    const p = reg.projects.find((x) => x.name === opts.project);
    if (!p) throw new Error(`No such project: ${opts.project}`);
    addFor(p.name, jobsDir(p.path));
  } else {
    const p = findByPath(reg, resolve(process.cwd()));
    if (!p) throw new Error("Not inside a registered project. Use --project, --global, or --all.");
    addFor(p.name, jobsDir(p.path));
  }

  db.close();

  if (opts.json) {
    process.stdout.write(JSON.stringify(rows, null, 2) + "\n");
    return;
  }

  for (const r of rows) {
    if (r.error) {
      console.log(`  [${r.project}] ERROR: ${r.file}: ${r.error}`);
    } else {
      const when = r.last_run ? new Date(r.last_run).toISOString() : "never";
      const status = r.last_status ?? "—";
      const state = r.enabled ? "" : " (disabled)";
      console.log(
        `  [${r.project}/${r.job}] ${r.schedule}${state}  last=${when} status=${status}`
      );
    }
  }
}
