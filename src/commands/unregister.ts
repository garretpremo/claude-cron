import { resolve } from "node:path";
import { PROJECTS_TOML } from "../util/paths";
import { readRegistry, writeRegistry, removeProject, findByPath, findByName } from "../job/registry";

export interface UnregisterOpts {
  target: string; // name or path
}

export async function cmdUnregister(opts: UnregisterOpts): Promise<void> {
  const reg = readRegistry(PROJECTS_TOML);
  const match = findByName(reg, opts.target) ?? findByPath(reg, resolve(opts.target));
  if (!match) throw new Error(`No project matches ${opts.target}`);
  writeRegistry(PROJECTS_TOML, removeProject(reg, match.name));
  console.log(`Unregistered ${match.name}. NOTE: Run \`claude-cron sync ${match.name}\` to clear its crontab block.`);
}
