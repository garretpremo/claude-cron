import { existsSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { PROJECTS_TOML, DB_PATH, GLOBAL_DIR, SECRETS_ENV, lockPath, jobsDir } from "../util/paths";
import { readRegistry, findByPath, findByName } from "../job/registry";
import { openDb } from "../db/connection";
import { executeRun } from "../executor/run";

export interface RunOpts {
  target: string;  // "project/job" or bare "job"
  force?: boolean;
  isTest?: boolean;
}

export async function cmdRun(opts: RunOpts): Promise<number> {
  const { project, job } = resolveTarget(opts.target);
  const reg = readRegistry(PROJECTS_TOML);

  let jobFile: string;
  if (project === "global") {
    jobFile = join(GLOBAL_DIR, `${job}.yaml`);
  } else {
    const p = findByName(reg, project);
    if (!p) throw new Error(`Project not registered: ${project}`);
    jobFile = join(jobsDir(p.path), `${job}.yaml`);
  }

  if (!existsSync(jobFile)) {
    throw new Error(`Job file not found: ${jobFile}`);
  }

  // Load secrets.env into process.env if it exists
  if (existsSync(SECRETS_ENV)) {
    const raw = readFileSync(SECRETS_ENV, "utf8");
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 0) continue;
      const key = t.slice(0, eq).trim();
      const val = t.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }

  const db = openDb(DB_PATH);
  try {
    const result = await executeRun({
      db, project, jobFile,
      lockPath: lockPath(project, job),
      isTest: !!opts.isTest,
    });
    return result.exitCode;
  } finally {
    db.close();
  }
}

function resolveTarget(s: string): { project: string; job: string } {
  if (s.includes("/")) {
    const parts = s.split("/");
    if (parts.length !== 2) throw new Error(`Invalid target: ${s}`);
    const [p, j] = parts;
    if (!p || !j) throw new Error(`Invalid target: ${s}`);
    return { project: p, job: j };
  }
  // Bare job name: resolve project from cwd registry
  const reg = readRegistry(PROJECTS_TOML);
  const p = findByPath(reg, resolve(process.cwd()));
  if (!p) {
    throw new Error(`Bare job name "${s}" but cwd is not a registered project. Use <project>/<job>.`);
  }
  return { project: p.name, job: s };
}
