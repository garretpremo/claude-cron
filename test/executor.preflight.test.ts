import { expect, test } from "bun:test";
import { runPreflight } from "../src/executor/preflight";

test("zero-exit script → proceed=true", async () => {
  const r = await runPreflight({ run: "exit 0", timeoutMs: 5_000, cwd: "/tmp" });
  expect(r.proceed).toBe(true);
  expect(r.exitCode).toBe(0);
});

test("nonzero-exit → proceed=false", async () => {
  const r = await runPreflight({ run: "exit 1", timeoutMs: 5_000, cwd: "/tmp" });
  expect(r.proceed).toBe(false);
  expect(r.exitCode).toBe(1);
});

test("captures stdout/stderr", async () => {
  const r = await runPreflight({
    run: "echo hello; echo err 1>&2; exit 0",
    timeoutMs: 5_000, cwd: "/tmp",
  });
  expect(r.stdout.trim()).toBe("hello");
  expect(r.stderr.trim()).toBe("err");
});

test("timeout kills the process", async () => {
  const start = Date.now();
  const r = await runPreflight({
    run: "sleep 10", timeoutMs: 200, cwd: "/tmp",
  });
  expect(r.proceed).toBe(false);
  expect(r.timedOut).toBe(true);
  expect(Date.now() - start).toBeLessThan(5_000);
});
