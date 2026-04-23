import { expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { mkdtempSync, writeFileSync, mkdirSync, symlinkSync } from "node:fs";
import { openDb } from "../src/db/connection";
import { getRecentRuns } from "../src/db/queries";
import { executeRun } from "../src/executor/run";

function fresh() {
  const dir = mkdtempSync(join(tmpdir(), "run-"));
  mkdirSync(join(dir, "project"), { recursive: true });
  mkdirSync(join(dir, "locks"), { recursive: true });
  const db = openDb(join(dir, "h.db"));
  return { dir, db };
}

function mockClaudeDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "mc-"));
  const srcMock = resolve(import.meta.dir, "fixtures/mock-claude.sh");
  const destClaude = join(dir, "claude");
  symlinkSync(srcMock, destClaude);
  return dir;
}

test("happy path: preflight passes, claude succeeds, run is recorded", async () => {
  const { dir, db } = fresh();
  const mcDir = mockClaudeDir();

  mkdirSync(join(dir, "project/.claude-jobs"));
  const jobPath = join(dir, "project/.claude-jobs/j.yaml");
  writeFileSync(jobPath, `
name: j
schedule: "*/5 * * * *"
preflight:
  run: "exit 0"
  timeout: 5s
claude:
  prompt: "hello"
  allowed_tools: []
  permission_mode: auto
cwd: "."
timeout: 5s
logging: { retention_days: 30 }
`);

  const result = await executeRun({
    db,
    project: "p",
    jobFile: jobPath,
    lockPath: join(dir, "locks/p--j.lock"),
    extraPath: mcDir,
    isTest: false,
  });

  expect(result.terminalStatus).toBe("success");
  const rows = getRecentRuns(db, "p", "j", 1);
  expect(rows[0]!.status).toBe("success");
  expect(rows[0]!.cost_usd).toBe(0.01);
});

test("preflight skip: claude never invoked", async () => {
  const { dir, db } = fresh();
  const mcDir = mockClaudeDir();

  mkdirSync(join(dir, "project/.claude-jobs"));
  const jobPath = join(dir, "project/.claude-jobs/j.yaml");
  writeFileSync(jobPath, `
name: j
schedule: "*/5 * * * *"
preflight:
  run: "exit 1"
  timeout: 5s
claude:
  prompt: "hello"
  allowed_tools: []
  permission_mode: auto
cwd: "."
timeout: 5s
logging: { retention_days: 30 }
`);

  const result = await executeRun({
    db, project: "p", jobFile: jobPath,
    lockPath: join(dir, "locks/p--j.lock"),
    extraPath: mcDir,
    isTest: false,
  });

  expect(result.terminalStatus).toBe("skipped_preflight");
});

test("overlap skip: second invocation with lock held", async () => {
  const { dir, db } = fresh();
  const mcDir = mockClaudeDir();

  mkdirSync(join(dir, "project/.claude-jobs"));
  const jobPath = join(dir, "project/.claude-jobs/j.yaml");
  writeFileSync(jobPath, `
name: j
schedule: "*/5 * * * *"
claude:
  prompt: "hi"
  allowed_tools: []
  permission_mode: auto
cwd: "."
timeout: 5s
logging: { retention_days: 30 }
`);

  const lockPath = join(dir, "locks/p--j.lock");

  const { acquireLock } = await import("../src/executor/lock");
  const held = await acquireLock(lockPath);
  expect(held).not.toBeNull();

  const result = await executeRun({
    db, project: "p", jobFile: jobPath, lockPath,
    extraPath: mcDir, isTest: false,
  });

  expect(result.terminalStatus).toBe("skipped_overlap");
  await held!.release();
});
