import { describe, expect, test } from "bun:test";
import { JobSchema } from "../../src/job/schema";

const base = {
  name: "x",
  schedule: "*/5 * * * *",
  claude: { prompt: "/foo", allowed_tools: [], permission_mode: "auto" as const },
};

describe("JobSchema inputs block", () => {
  test("omitted inputs defaults to { enabled: false }", () => {
    const parsed = JobSchema.parse(base);
    expect(parsed.inputs).toEqual({ enabled: false });
  });
  test("inputs.enabled: true is honored", () => {
    const parsed = JobSchema.parse({ ...base, inputs: { enabled: true } });
    expect(parsed.inputs.enabled).toBe(true);
  });
  test("inputs is type-safe — unknown fields rejected", () => {
    expect(() => JobSchema.parse({ ...base, inputs: { enabled: true, bogus: 1 } })).toThrow();
  });
});
