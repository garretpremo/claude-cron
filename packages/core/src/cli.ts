#!/usr/bin/env bun
import { Command } from "commander";
import { cmdInit } from "./commands/init";
import { cmdRegister } from "./commands/register";
import { cmdUnregister } from "./commands/unregister";
import { cmdList } from "./commands/list";
import { cmdRun } from "./commands/run";
import { cmdTest } from "./commands/test";
import { cmdSync } from "./commands/sync";
import { cmdLogs } from "./commands/logs";
import { cmdStatus } from "./commands/status";
import { cmdServe } from "./commands/serve";

export function parseInputFlags(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--input") {
      const next = argv[++i];
      if (!next || !next.includes("=")) {
        throw new Error(`--input expects K=V (got '${next}')`);
      }
      const idx = next.indexOf("=");
      out[next.slice(0, idx)] = next.slice(idx + 1);
    } else if (argv[i] === "--input-json") {
      const next = argv[++i];
      let parsed: unknown;
      try { parsed = JSON.parse(next ?? ""); }
      catch { throw new Error(`--input-json: invalid JSON`); }
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error(`--input-json: must be a JSON object`);
      }
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v !== "string") throw new Error(`--input-json: value for '${k}' must be a string`);
        out[k] = v;
      }
    }
  }
  return out;
}

const program = new Command();
program.name("claude-cron").version("0.1.0");

program.command("init")
  .description("First-time setup")
  .action(async () => { await cmdInit(); });

program.command("register [path]")
  .description("Register a project (default: cwd)")
  .option("--name <name>", "Override project name")
  .option("--allow-empty", "Skip .claude-jobs existence check")
  .action(async (path, o) => {
    await cmdRegister({ path, name: o.name, allowEmpty: o.allowEmpty });
  });

program.command("unregister <target>")
  .description("Remove a project from the registry (by name or path). Also removes the managed crontab block by default.")
  .option("--keep-crontab", "Leave the managed crontab block in place")
  .action(async (target, o) => { await cmdUnregister({ target, keepCrontab: o.keepCrontab }); });

program.command("list")
  .description("List jobs")
  .option("--project <name>")
  .option("--global")
  .option("--all")
  .option("--json")
  .action(async (o) => { await cmdList(o); });

program.command("run <target>")
  .description("Execute a job. target = <project>/<job> or bare <job>")
  .option("--force", "Skip preflight")
  .option("--input <kv>", "Per-trigger input as K=V (repeatable)", (v, prev: string[]) => [...prev, v], [] as string[])
  .option("--input-json <json>", "Per-trigger inputs as a JSON object")
  .action(async (target, o) => {
    let inputs: Record<string, string> | undefined;
    try {
      const argv: string[] = [];
      for (const kv of (o.input as string[] ?? [])) argv.push("--input", kv);
      if (o.inputJson) argv.push("--input-json", o.inputJson);
      const parsed = parseInputFlags(argv);
      if (Object.keys(parsed).length > 0) inputs = parsed;
    } catch (e) {
      console.error((e as Error).message);
      process.exit(2);
    }
    const code = await cmdRun({ target, force: o.force, inputs });
    process.exit(code);
  });

program.command("test <target>")
  .description("Execute a job in test mode (marks run as is_test)")
  .option("--skip-preflight")
  .option("--dry-run")
  .option("--input <kv>", "Per-trigger input as K=V (repeatable)", (v, prev: string[]) => [...prev, v], [] as string[])
  .option("--input-json <json>", "Per-trigger inputs as a JSON object")
  .action(async (target, o) => {
    let inputs: Record<string, string> | undefined;
    try {
      const argv: string[] = [];
      for (const kv of (o.input as string[] ?? [])) argv.push("--input", kv);
      if (o.inputJson) argv.push("--input-json", o.inputJson);
      const parsed = parseInputFlags(argv);
      if (Object.keys(parsed).length > 0) inputs = parsed;
    } catch (e) {
      console.error((e as Error).message);
      process.exit(2);
    }
    const code = await cmdTest({ target, force: o.skipPreflight, inputs });
    process.exit(code);
  });

program.command("sync [project]")
  .description("Rewrite a managed crontab block (or remove it with --remove)")
  .option("--global")
  .option("--dry-run")
  .option("--remove", "Delete the managed crontab block for <project> (or --global). Does not require the project to still be registered.")
  .action(async (project, o) => {
    await cmdSync({ project, global: o.global, dryRun: o.dryRun, remove: o.remove });
  });

program.command("logs <target>")
  .description("Show run history for a job")
  .option("--tail")
  .option("--last <n>", "Number of runs", (v) => parseInt(v, 10))
  .option("--json")
  .action(async (target, o) => {
    await cmdLogs({ target, tail: o.tail, last: o.last, json: o.json });
  });

program.command("status")
  .description("Health check")
  .action(async () => { await cmdStatus(); });

program.command("serve")
  .description("Start the local dashboard + JSON API")
  .option("--port <n>", "Port (default 8787)", (v) => parseInt(v, 10))
  .option("--host <h>", "Host (default 127.0.0.1)")
  .option("--allow-public", "Allow non-loopback bind (dashboard has NO auth)")
  .action(async (o) => { await cmdServe({ port: o.port, host: o.host, allowPublic: o.allowPublic }); });

if (import.meta.main) {
  program.parseAsync().catch((e) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
