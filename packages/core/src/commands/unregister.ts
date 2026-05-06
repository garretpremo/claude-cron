import { resolve } from "node:path";
import { PROJECTS_TOML } from "../util/paths";
import { readRegistry, writeRegistry, removeProject, findByPath, findByName } from "../job/registry";
import { readCrontab, writeCrontab, spliceBlock } from "../cron/sync";

export interface UnregisterOpts {
  target: string; // name or path
  keepCrontab?: boolean;
}

export async function cmdUnregister(opts: UnregisterOpts): Promise<void> {
  const reg = readRegistry(PROJECTS_TOML);
  const match = findByName(reg, opts.target) ?? findByPath(reg, resolve(opts.target));
  if (!match) throw new Error(`No project matches ${opts.target}`);
  writeRegistry(PROJECTS_TOML, removeProject(reg, match.name));

  if (opts.keepCrontab) {
    console.log(`Unregistered ${match.name}. Crontab block preserved — run \`claude-cron sync --remove ${match.name}\` to clean it up later.`);
    return;
  }

  // Default: remove this project's managed crontab block entirely.
  try {
    const current = readCrontab();
    const next = spliceBlock(current, match.name, [], { removeIfEmpty: true });
    if (next !== current) {
      writeCrontab(next);
      console.log(`Unregistered ${match.name} and removed its crontab block.`);
    } else {
      console.log(`Unregistered ${match.name}. (No crontab block found to remove.)`);
    }
  } catch (e) {
    console.log(`Unregistered ${match.name}, but failed to clean crontab: ${e instanceof Error ? e.message : e}`);
    console.log(`Run \`claude-cron sync --remove ${match.name}\` manually.`);
  }
}
