import { expect, test, describe } from "bun:test";
import { JobSchema } from "../src/job/schema";

const minimal = {
  name: "j",
  schedule: "*/5 * * * *",
  claude: { prompt: "hi", allowed_tools: [], permission_mode: "auto" },
};

describe("JobSchema", () => {
  test("parses minimal job", () => {
    const parsed = JobSchema.parse(minimal);
    expect(parsed.name).toBe("j");
    expect(parsed.enabled).toBe(true);
    expect(parsed.auth).toBe("subscription");
    expect(parsed.logging.retention_days).toBe(30);
  });

  test("rejects prompt + prompt_cmd both set", () => {
    expect(() =>
      JobSchema.parse({
        ...minimal,
        claude: { ...minimal.claude, prompt: "a", prompt_cmd: "echo b" },
      })
    ).toThrow();
  });

  test("rejects neither prompt nor prompt_cmd", () => {
    expect(() =>
      JobSchema.parse({
        ...minimal,
        claude: { ...minimal.claude, prompt: null },
      })
    ).toThrow();
  });

  test("rejects invalid cron expression", () => {
    expect(() => JobSchema.parse({ ...minimal, schedule: "not a cron" })).toThrow();
  });

  test("rejects bad duration", () => {
    expect(() =>
      JobSchema.parse({ ...minimal, timeout: "forever" })
    ).toThrow();
  });

  test("omitted inputs defaults to { enabled: false }", () => {
    const parsed = JobSchema.parse(minimal);
    expect(parsed.inputs).toEqual({ enabled: false });
  });

  test("inputs.enabled: true is honored", () => {
    const parsed = JobSchema.parse({ ...minimal, inputs: { enabled: true } });
    expect(parsed.inputs.enabled).toBe(true);
  });

  test("rejects unknown fields (strict mode)", () => {
    expect(() =>
      JobSchema.parse({ ...minimal, inputs: { enabled: true, bogus: 1 } })
    ).toThrow();
  });
});
