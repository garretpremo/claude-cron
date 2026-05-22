import { expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { mkdtempSync, writeFileSync, mkdirSync, symlinkSync } from "node:fs";
import { addProject, writeRegistry } from "../src/job/registry";
import { openDb } from "../src/db/connection";
import { getRecentRuns } from "../src/db/queries";
import { cmdRun } from "../src/commands/run";

function fresh() {
  const dir = mkdtempSync(join(tmpdir(), "cmd-run-"));
  mkdirSync(join(dir, "project/.claude-jobs"), { recursive: true });
  mkdirSync(join(dir, "locks"), { recursive: true });

  const projectsToml = join(dir, "projects.toml");
  const dbPath = join(dir, "h.db");

  // Register the project
  const reg = addProject({ projects: [] }, {
    name: "p",
    path: join(dir, "project"),
    registered_at: Date.now(),
  });
  writeRegistry(projectsToml, reg);

  const db = openDb(dbPath);

  return { dir, db, projectsToml, dbPath };
}

function mockClaudeDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "mc-"));
  const srcMock = resolve(import.meta.dir, "fixtures/mock-claude.sh");
  const destClaude = join(dir, "claude");
  symlinkSync(srcMock, destClaude);
  return dir;
}

// Test A: cmdRun rejects inputs when job has inputs.enabled: false (default)
test("cmdRun: rejects inputs when job does not have inputs.enabled", async () => {
  const { dir, db, projectsToml, dbPath } = fresh();
  const mcDir = mockClaudeDir();

  const jobPath = join(dir, "project/.claude-jobs/j.yaml");
  writeFileSync(jobPath, `
name: j
schedule: "*/5 * * * *"
claude:
  prompt: "hello"
  allowed_tools: []
  permission_mode: auto
cwd: "."
timeout: 5s
logging: { retention_days: 30 }
`);

  const stderrChunks: string[] = [];
  const origWrite = process.stderr.write.bind(process.stderr);
  (process.stderr as any).write = (chunk: string) => { stderrChunks.push(chunk); return true; };

  let exitCode: number;
  try {
    exitCode = await cmdRun({
      target: "p/j",
      inputs: { TICKER: "NVDA" },
      _paths: { projectsToml, dbPath, locksDir: join(dir, "locks"), extraPath: mcDir },
    });
  } finally {
    (process.stderr as any).write = origWrite;
  }

  expect(exitCode).toBe(2);

  // Should have a config_error run row
  const rows = db.query("SELECT * FROM runs WHERE project='p' AND job='j'").all() as any[];
  expect(rows.length).toBe(1);
  expect(rows[0]!.status).toBe("config_error");

  // The row should persist what was attempted
  expect(rows[0]!.inputs_json).toBe(JSON.stringify({ TICKER: "NVDA" }));

  db.close();
});

// Test B: cmdRun accepts inputs when job has inputs.enabled: true and persists them
test("cmdRun: accepts inputs when inputs.enabled: true and persists inputs_json", async () => {
  const { dir, db, projectsToml, dbPath } = fresh();
  const mcDir = mockClaudeDir();

  const jobPath = join(dir, "project/.claude-jobs/j.yaml");
  writeFileSync(jobPath, `
name: j
schedule: "*/5 * * * *"
inputs:
  enabled: true
claude:
  prompt_cmd: 'echo "/echo $CC_INPUT_TICKER"'
  allowed_tools: []
  permission_mode: auto
cwd: "."
timeout: 5s
logging: { retention_days: 30 }
`);

  const exitCode = await cmdRun({
    target: "p/j",
    inputs: { TICKER: "NVDA" },
    _paths: { projectsToml, dbPath, locksDir: join(dir, "locks"), extraPath: mcDir },
  });

  expect(exitCode).toBe(0);

  const rows = getRecentRuns(db, "p", "j", 1);
  expect(rows[0]!.status).toBe("success");
  expect(rows[0]!.inputs_json).toBe(JSON.stringify({ TICKER: "NVDA" }));

  db.close();
});

// Test C: cmdRun rejects malformed input keys at the boundary (before executeRun)
test("cmdRun: rejects malformed input keys at boundary (before executeRun)", async () => {
  const { dir, db, projectsToml, dbPath } = fresh();
  const mcDir = mockClaudeDir();

  // Job with inputs.enabled: true — so the gate wouldn't block; only validateInputs would
  const jobPath = join(dir, "project/.claude-jobs/j.yaml");
  writeFileSync(jobPath, `
name: j
schedule: "*/5 * * * *"
inputs:
  enabled: true
claude:
  prompt: "hello"
  allowed_tools: []
  permission_mode: auto
cwd: "."
timeout: 5s
logging: { retention_days: 30 }
`);

  const stderrChunks: string[] = [];
  const origWrite = process.stderr.write.bind(process.stderr);
  (process.stderr as any).write = (chunk: string) => { stderrChunks.push(chunk); return true; };

  let exitCode: number;
  try {
    exitCode = await cmdRun({
      target: "p/j",
      inputs: { ticker: "NVDA" },  // lowercase — not env-var-safe
      _paths: { projectsToml, dbPath, locksDir: join(dir, "locks"), extraPath: mcDir },
    });
  } finally {
    (process.stderr as any).write = origWrite;
  }

  expect(exitCode).toBe(2);
  const stderrOutput = stderrChunks.join("");
  expect(stderrOutput).toMatch(/env-var-safe/);

  // validateInputs fires before executeRun → no run row should be created
  const rows = db.query("SELECT * FROM runs WHERE project='p' AND job='j'").all() as any[];
  expect(rows.length).toBe(0);

  db.close();
});
