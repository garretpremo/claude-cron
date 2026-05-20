import { expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { openDb } from "@claude-cron/core";
import { runJobNow } from "../../src/services/action-service";
import { HttpError } from "../../src/http/errors";
import { seedProject, seedJobFile } from "../fixtures/seed";

function fresh() {
  const dir = mkdtempSync(join(tmpdir(), "as-inputs-"));
  const projectPath = join(dir, "p");
  mkdirSync(projectPath, { recursive: true });
  const registryPath = join(dir, "projects.toml");
  const db = openDb(join(dir, "h.db"));
  seedProject(registryPath, { name: "p", path: projectPath });
  return { dir, projectPath, registryPath, db };
}

const JOB_WITH_INPUTS_ENABLED = `name: j
schedule: "*/5 * * * *"
enabled: true
inputs:
  enabled: true
claude:
  prompt_cmd: echo "$CC_INPUT_TICKER"
  allowed_tools: []
  permission_mode: auto
`;

const JOB_WITHOUT_INPUTS = `name: j
schedule: "*/5 * * * *"
enabled: true
claude:
  prompt: "hi"
  allowed_tools: []
  permission_mode: auto
`;

// Test A: runJobNow accepts inputs on a job with inputs.enabled: true
test("runJobNow accepts inputs on a job with inputs.enabled: true", async () => {
  const { projectPath, registryPath, db } = fresh();
  seedJobFile(projectPath, "j", JOB_WITH_INPUTS_ENABLED);
  const result = await runJobNow(db, registryPath, "p", "j", { TICKER: "NVDA" });
  expect(result.run_id).toBeGreaterThan(0);
});

// Test B: runJobNow rejects inputs on a job without inputs.enabled
test("runJobNow rejects inputs on a job without inputs.enabled", async () => {
  const { projectPath, registryPath, db } = fresh();
  seedJobFile(projectPath, "j", JOB_WITHOUT_INPUTS);
  await expect(
    runJobNow(db, registryPath, "p", "j", { TICKER: "NVDA" })
  ).rejects.toMatchObject({ status: 400, code: "INPUTS_NOT_ENABLED" });
});

// Test C: runJobNow rejects malformed input keys (lowercase)
test("runJobNow rejects malformed input keys", async () => {
  const { projectPath, registryPath, db } = fresh();
  seedJobFile(projectPath, "j", JOB_WITH_INPUTS_ENABLED);
  await expect(
    runJobNow(db, registryPath, "p", "j", { ticker: "NVDA" })
  ).rejects.toMatchObject({ status: 400, code: "INVALID_INPUTS" });
  await expect(
    runJobNow(db, registryPath, "p", "j", { ticker: "NVDA" })
  ).rejects.toThrow(/env-var-safe/);
});

// Test D: runJobNow without inputs arg still works as before
test("runJobNow without inputs arg works as before", async () => {
  const { projectPath, registryPath, db } = fresh();
  seedJobFile(projectPath, "j", JOB_WITHOUT_INPUTS);
  const result = await runJobNow(db, registryPath, "p", "j");
  expect(result.run_id).toBeGreaterThan(0);
});
