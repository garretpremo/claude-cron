import { expect, test } from "bun:test";
import { buildClaudeArgv } from "../src/executor/claude";
import { JobSchema } from "../src/job/schema";

const job = JobSchema.parse({
  name: "j",
  schedule: "*/5 * * * *",
  claude: {
    prompt: "hello",
    allowed_tools: ["Read", "Bash(gh *)"],
    permission_mode: "auto",
  },
});

test("always-applied flags present", () => {
  const argv = buildClaudeArgv({ job, prompt: "hi", cwdAbsolute: "/p" });
  expect(argv).toContain("--print");
  expect(argv).toContain("--no-session-persistence");
  expect(argv).toContain("--output-format");
  expect(argv).toContain("stream-json");
  expect(argv).toContain("--verbose");
  expect(argv).toContain("--add-dir");
  expect(argv).toContain("/p");
});

test("allowed_tools becomes space-joined string", () => {
  const argv = buildClaudeArgv({ job, prompt: "hi", cwdAbsolute: "/p" });
  const i = argv.indexOf("--allowed-tools");
  expect(i).toBeGreaterThan(-1);
  expect(argv[i + 1]).toBe("Read Bash(gh *)");
});

test("prompt is the final positional", () => {
  const argv = buildClaudeArgv({ job, prompt: "final prompt", cwdAbsolute: "/p" });
  expect(argv.at(-1)).toBe("final prompt");
});

test("--bare added for api_key auth", () => {
  const apiJob = JobSchema.parse({
    ...job, auth: "api_key",
    claude: { prompt: "hi", allowed_tools: [], permission_mode: "auto" },
  });
  const argv = buildClaudeArgv({ job: apiJob, prompt: "hi", cwdAbsolute: "/p" });
  expect(argv).toContain("--bare");
});

test("no --bare for subscription auth", () => {
  const argv = buildClaudeArgv({ job, prompt: "hi", cwdAbsolute: "/p" });
  expect(argv).not.toContain("--bare");
});

test("agent / model / append_system_prompt passed through when set", () => {
  const full = JobSchema.parse({
    ...job,
    claude: {
      prompt: "x",
      allowed_tools: [],
      permission_mode: "auto",
      agent: "reviewer",
      model: "opus",
      append_system_prompt: "be terse",
    },
  });
  const argv = buildClaudeArgv({ job: full, prompt: "x", cwdAbsolute: "/p" });
  expect(argv).toContain("--agent"); expect(argv).toContain("reviewer");
  expect(argv).toContain("--model"); expect(argv).toContain("opus");
  expect(argv).toContain("--append-system-prompt"); expect(argv).toContain("be terse");
});
