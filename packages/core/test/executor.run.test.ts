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

test("token usage from result event is recorded", async () => {
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

  const env = {
    MOCK_CLAUDE_INPUT_TOKENS: "21",
    MOCK_CLAUDE_OUTPUT_TOKENS: "5843",
    MOCK_CLAUDE_CACHE_CREATION_TOKENS: "54534",
    MOCK_CLAUDE_CACHE_READ_TOKENS: "841416",
  };
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
  try {
    const result = await executeRun({
      db, project: "p", jobFile: jobPath,
      lockPath: join(dir, "locks/p--j.lock"),
      extraPath: mcDir,
      isTest: false,
    });
    expect(result.terminalStatus).toBe("success");
    const row = getRecentRuns(db, "p", "j", 1)[0]!;
    expect(row.input_tokens).toBe(21);
    expect(row.output_tokens).toBe(5843);
    expect(row.cache_creation_tokens).toBe(54534);
    expect(row.cache_read_tokens).toBe(841416);
  } finally {
    for (const k of Object.keys(env)) delete process.env[k];
  }
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

test("pid is recorded on run row after claude spawns", async () => {
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

  await executeRun({
    db, project: "p", jobFile: jobPath,
    lockPath: join(dir, "locks/p--j.lock"),
    extraPath: mcDir, isTest: false,
  });

  const row = db.query("SELECT pid FROM runs WHERE status='success' LIMIT 1").get() as any;
  expect(row.pid).toBeGreaterThan(0);
});

test("inputs map flows into prompt_cmd subprocess env", async () => {
  const { dir, db } = fresh();
  const mcDir = mockClaudeDir();

  mkdirSync(join(dir, "project/.claude-jobs"));
  const jobPath = join(dir, "project/.claude-jobs/j.yaml");
  writeFileSync(jobPath, `
name: j
schedule: "*/5 * * * *"
inputs:
  enabled: true
claude:
  prompt_cmd: 'echo "ticker=$CC_INPUT_TICKER"'
  allowed_tools: []
  permission_mode: auto
cwd: "."
timeout: 5s
logging: { retention_days: 30 }
`);

  const result = await executeRun({
    db, project: "p", jobFile: jobPath,
    lockPath: join(dir, "locks/p--j.lock"),
    extraPath: mcDir, isTest: false,
    inputs: { TICKER: "NVDA" },
  });

  expect(result.terminalStatus).toBe("success");

  // Find the prompt_cmd event and verify the resolved prompt contains the injected value.
  const events = db.query(
    "SELECT * FROM events WHERE run_id = ? ORDER BY seq"
  ).all(result.runId!) as any[];
  const promptCmdEvent = events.find((e: any) => e.event_type === "prompt_cmd");
  expect(promptCmdEvent).toBeDefined();
  const payload = JSON.parse(promptCmdEvent.payload);
  expect(payload.prompt).toBe("ticker=NVDA");
});

test("SIGTERM to child produces status=interrupted", async () => {
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
  extra_args: ["--block"]
cwd: "."
timeout: 30s
logging: { retention_days: 30 }
`);

  const runPromise = executeRun({
    db, project: "p", jobFile: jobPath,
    lockPath: join(dir, "locks/p--j.lock"),
    extraPath: mcDir, isTest: false,
  });

  // Poll for the pid to be populated, then SIGTERM the mock claude.
  let pid: number | null = null;
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const row = db.query("SELECT pid FROM runs WHERE status='running'").get() as any;
    if (row?.pid) { pid = row.pid; break; }
    await new Promise((r) => setTimeout(r, 50));
  }
  expect(pid).not.toBeNull();
  process.kill(pid!, "SIGTERM");

  const result = await runPromise;
  expect(result.terminalStatus).toBe("interrupted");
});
