import { expect, test } from "bun:test";
import { renderCronLine } from "../src/cron/render";
import { JobSchema } from "../src/job/schema";

const job = JobSchema.parse({
  name: "review",
  schedule: "*/5 * * * *",
  claude: { prompt: "x", allowed_tools: [], permission_mode: "auto" },
});

test("renders enabled job", () => {
  const line = renderCronLine({
    project: "apijack", job,
    binaryPath: "/home/u/.bun/bin/claude-cron",
  });
  expect(line).toBe(
    "*/5 * * * * /home/u/.bun/bin/claude-cron run apijack/review"
  );
});

test("disabled job renders as comment", () => {
  const line = renderCronLine({
    project: "apijack", job: { ...job, enabled: false },
    binaryPath: "/bin/claude-cron",
  });
  expect(line.startsWith("# disabled:")).toBe(true);
});
