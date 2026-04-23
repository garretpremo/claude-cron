import { existsSync } from "node:fs";
import { resolve, basename } from "node:path";
import { PROJECTS_TOML, jobsDir } from "../util/paths";
import { readRegistry, writeRegistry, addProject } from "../job/registry";

export interface RegisterOpts {
  path?: string;
  name?: string;
  allowEmpty?: boolean;
}

export async function cmdRegister(opts: RegisterOpts): Promise<void> {
  const absPath = resolve(opts.path ?? process.cwd());
  const jdir = jobsDir(absPath);
  if (!existsSync(jdir) && !opts.allowEmpty) {
    throw new Error(`${jdir} does not exist. Create it first or pass --allow-empty.`);
  }
  const name = opts.name ?? basename(absPath);
  const reg = addProject(readRegistry(PROJECTS_TOML), {
    name, path: absPath, registered_at: Date.now(),
  });
  writeRegistry(PROJECTS_TOML, reg);
  console.log(`Registered ${name} → ${absPath}`);
}
