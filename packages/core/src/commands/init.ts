import { mkdirSync, existsSync, writeFileSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import {
  ROOT, GLOBAL_DIR, LOCKS_DIR, SECRETS_ENV, DB_PATH,
} from "../util/paths";
import { openDb } from "../db/connection";
import { readCrontab, writeCrontab, spliceBlock } from "../cron/sync";

export async function cmdInit(): Promise<void> {
  mkdirSync(ROOT, { recursive: true });
  mkdirSync(GLOBAL_DIR, { recursive: true });
  mkdirSync(LOCKS_DIR, { recursive: true });

  if (!existsSync(SECRETS_ENV)) {
    writeFileSync(
      SECRETS_ENV,
      "# Set ANTHROPIC_API_KEY here for jobs with auth: api_key\n# ANTHROPIC_API_KEY=sk-...\n",
      { mode: 0o600 }
    );
    chmodSync(SECRETS_ENV, 0o600);
  }

  const db = openDb(DB_PATH);
  db.close();

  // Write prelude block to crontab
  const bunBin = process.execPath;
  const preludeLines = [
    `PATH=${process.env.PATH ?? ""}`,
    `HOME=${homedir()}`,
    `SHELL=${process.env.SHELL ?? "/bin/bash"}`,
    process.env.DBUS_SESSION_BUS_ADDRESS
      ? `DBUS_SESSION_BUS_ADDRESS=${process.env.DBUS_SESSION_BUS_ADDRESS}`
      : "# DBUS_SESSION_BUS_ADDRESS (not detected; needed for keyring access from cron)",
    process.env.XDG_RUNTIME_DIR
      ? `XDG_RUNTIME_DIR=${process.env.XDG_RUNTIME_DIR}`
      : "# XDG_RUNTIME_DIR (not detected)",
  ];

  const current = readCrontab();
  let next = spliceBlock(current, "prelude", preludeLines);
  next = spliceBlock(next, "global", []);
  writeCrontab(next);

  console.log(`claude-cron initialised.`);
  console.log(`  state:   ${ROOT}`);
  console.log(`  db:      ${DB_PATH}`);
  console.log(`  secrets: ${SECRETS_ENV}`);
  console.log(`  bun:     ${bunBin}`);
  console.log(`Crontab prelude + empty global block installed.`);
}
