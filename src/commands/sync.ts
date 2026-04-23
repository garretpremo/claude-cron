import { resolve } from "node:path";
import { PROJECTS_TOML, GLOBAL_DIR, jobsDir } from "../util/paths";
import { readRegistry, findByName, findByPath } from "../job/registry";
import { loadJobsFromDir } from "../job/loader";
import { renderCronLine } from "../cron/render";
import { readCrontab, writeCrontab, spliceBlock, diffLines } from "../cron/sync";

export interface SyncOpts {
  project?: string;
  global?: boolean;
  dryRun?: boolean;
}

export async function cmdSync(opts: SyncOpts): Promise<void> {
  const reg = readRegistry(PROJECTS_TOML);
  // process.argv[1] holds the invoked script path; when installed via `bun link`
  // this is the symlink path to the CLI entry. For sync, we write exactly that.
  const binaryPath = process.argv[1] ?? "claude-cron";

  let name: string;
  let dir: string;
  if (opts.global) {
    name = "global";
    dir = GLOBAL_DIR;
  } else {
    const resolved = opts.project
      ? findByName(reg, opts.project)
      : findByPath(reg, resolve(process.cwd()));
    if (!resolved) throw new Error("Project not identified. Use --project, --global, or run from inside a registered project.");
    name = resolved.name;
    dir = jobsDir(resolved.path);
  }

  const r = loadJobsFromDir(dir);
  if (r.errors.length > 0) {
    for (const e of r.errors) console.error(`  [parse error] ${e.file}: ${e.message}`);
    throw new Error(`Refusing to sync — ${r.errors.length} job file(s) invalid.`);
  }

  const enabled = r.loaded.filter(({ job }) => job.enabled);
  const disabled = r.loaded.length - enabled.length;
  const lines = enabled.map(({ job }) =>
    renderCronLine({ project: name, job, binaryPath })
  );

  const current = readCrontab();
  const next = spliceBlock(current, name, lines);

  if (opts.dryRun) {
    console.log(diffLines(current, next));
    return;
  }

  writeCrontab(next);
  const suffix = disabled > 0 ? ` (${disabled} disabled, skipped)` : "";
  console.log(`Synced ${lines.length} job(s) into block ${name}${suffix}.`);
}
