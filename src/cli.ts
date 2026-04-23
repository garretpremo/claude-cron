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
  .description("Remove a project from the registry (by name or path)")
  .action(async (target) => { await cmdUnregister({ target }); });

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
  .action(async (target, o) => {
    const code = await cmdRun({ target, force: o.force });
    process.exit(code);
  });

program.command("test <target>")
  .description("Execute a job in test mode (marks run as is_test)")
  .option("--skip-preflight")
  .option("--dry-run")
  .action(async (target, o) => {
    const code = await cmdTest({ target, force: o.skipPreflight });
    process.exit(code);
  });

program.command("sync [project]")
  .description("Rewrite a managed crontab block")
  .option("--global")
  .option("--dry-run")
  .action(async (project, o) => {
    await cmdSync({ project, global: o.global, dryRun: o.dryRun });
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
  .action(async (o) => { await cmdServe({ port: o.port, host: o.host }); });

program.parseAsync().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
