import { expect, test } from "bun:test";
import { resolvePrompt } from "../src/executor/prompt";

test("literal prompt pass-through", async () => {
  const r = await resolvePrompt({
    claude: { prompt: "hi there", prompt_cmd: null } as any,
    cwd: "/tmp",
    timeoutMs: 5_000,
  });
  expect(r.prompt).toBe("hi there");
  expect(r.fromCmd).toBe(false);
});

test("prompt_cmd returns stdout", async () => {
  const r = await resolvePrompt({
    claude: { prompt: null, prompt_cmd: "echo /review-issue 42" } as any,
    cwd: "/tmp",
    timeoutMs: 5_000,
  });
  expect(r.prompt).toBe("/review-issue 42");
  expect(r.fromCmd).toBe(true);
});

test("empty prompt_cmd stdout → error", async () => {
  await expect(
    resolvePrompt({
      claude: { prompt: null, prompt_cmd: "printf ''" } as any,
      cwd: "/tmp",
      timeoutMs: 5_000,
    })
  ).rejects.toThrow(/empty/);
});

test("nonzero prompt_cmd → error", async () => {
  await expect(
    resolvePrompt({
      claude: { prompt: null, prompt_cmd: "exit 1" } as any,
      cwd: "/tmp",
      timeoutMs: 5_000,
    })
  ).rejects.toThrow();
});

test("env vars are visible to prompt_cmd subprocess", async () => {
  const r = await resolvePrompt({
    claude: { prompt: null, prompt_cmd: 'echo "ticker=$CC_INPUT_TICKER"' } as any,
    cwd: "/tmp",
    timeoutMs: 5_000,
    env: { CC_INPUT_TICKER: "NVDA" },
  });
  expect(r.prompt).toBe("ticker=NVDA");
  expect(r.fromCmd).toBe(true);
});
