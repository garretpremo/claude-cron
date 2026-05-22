import { existsSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { PROJECTS_TOML, DB_PATH, GLOBAL_DIR, SECRETS_ENV, LOCKS_DIR, jobsDir } from "../util/paths";
import { readRegistry, findByPath, findByName } from "../job/registry";
import { openDb } from "../db/connection";
import { executeRun } from "../executor/run";
import { validateInputs } from "../job/inputs";

export interface RunOpts {
  target: string;  // "project/job" or bare "job"
  force?: boolean;
  isTest?: boolean;
  inputs?: Record<string, string>;
  /** Path overrides for testing — not intended for production use. */
  _paths?: {
    projectsToml?: string;
    dbPath?: string;
    locksDir?: string;
    secretsEnv?: string;
    globalDir?: string;
    extraPath?: string;
  };
}

export async function cmdRun(opts: RunOpts): Promise<number> {
  const p = opts._paths ?? {};
  const projectsToml = p.projectsToml ?? PROJECTS_TOML;
  const dbPath = p.dbPath ?? DB_PATH;
  const locksDir = p.locksDir ?? LOCKS_DIR;
  const secretsEnv = p.secretsEnv ?? SECRETS_ENV;
  const globalDir = p.globalDir ?? GLOBAL_DIR;

  // Validate inputs at the boundary before touching the DB
  if (opts.inputs && Object.keys(opts.inputs).length > 0) {
    try {
      validateInputs(opts.inputs);
    } catch (e) {
      process.stderr.write(`error: ${e instanceof Error ? e.message : String(e)}\n`);
      return 2;
    }
  }

  const { project, job } = resolveTarget(opts.target, projectsToml);
  const reg = readRegistry(projectsToml);

  let jobFile: string;
  if (project === "global") {
    jobFile = join(globalDir, `${job}.yaml`);
  } else {
    const proj = findByName(reg, project);
    if (!proj) throw new Error(`Project not registered: ${project}`);
    jobFile = join(jobsDir(proj.path), `${job}.yaml`);
  }

  if (!existsSync(jobFile)) {
    throw new Error(`Job file not found: ${jobFile}`);
  }

  // Load secrets.env into process.env if it exists
  if (existsSync(secretsEnv)) {
    const raw = readFileSync(secretsEnv, "utf8");
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

  const db = openDb(dbPath);
  try {
    const result = await executeRun({
      db, project, jobFile,
      lockPath: join(locksDir, `${project}--${job}.lock`),
      extraPath: p.extraPath,
      isTest: !!opts.isTest,
      inputs: opts.inputs,
    });
    return result.exitCode;
  } finally {
    db.close();
  }
}

function resolveTarget(s: string, projectsToml: string): { project: string; job: string } {
  if (s.includes("/")) {
    const parts = s.split("/");
    if (parts.length !== 2) throw new Error(`Invalid target: ${s}`);
    const [p, j] = parts;
    if (!p || !j) throw new Error(`Invalid target: ${s}`);
    return { project: p, job: j };
  }
  // Bare job name: resolve project from cwd registry
  const reg = readRegistry(projectsToml);
  const p = findByPath(reg, resolve(process.cwd()));
  if (!p) {
    throw new Error(`Bare job name "${s}" but cwd is not a registered project. Use <project>/<job>.`);
  }
  return { project: p.name, job: s };
}
