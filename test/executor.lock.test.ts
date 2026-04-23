import { expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { acquireLock } from "../src/executor/lock";

test("acquires and releases a lock", async () => {
  const dir = mkdtempSync(join(tmpdir(), "lock-"));
  const path = join(dir, "a.lock");
  const lock = await acquireLock(path);
  expect(lock).not.toBeNull();

  // Second acquisition should fail while first is held
  const second = await acquireLock(path);
  expect(second).toBeNull();

  await lock!.release();

  // Now re-acquire
  const third = await acquireLock(path);
  expect(third).not.toBeNull();
  await third!.release();
});
