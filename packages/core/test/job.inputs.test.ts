import { describe, expect, test } from "bun:test";
import { validateInputs } from "../src/job/inputs";

describe("validateInputs", () => {
  test("accepts valid keys", () => {
    expect(validateInputs({ TICKER: "NVDA", REQUEST_ID: "abc" })).toEqual({
      TICKER: "NVDA",
      REQUEST_ID: "abc",
    });
  });
  test("rejects lowercase key", () => {
    expect(() => validateInputs({ ticker: "NVDA" })).toThrow(/env-var-safe/);
  });
  test("rejects key starting with digit", () => {
    expect(() => validateInputs({ "1FOO": "x" })).toThrow(/env-var-safe/);
  });
  test("rejects key with hyphen", () => {
    expect(() => validateInputs({ "FOO-BAR": "x" })).toThrow(/env-var-safe/);
  });
  test("rejects value > 4 KB", () => {
    expect(() => validateInputs({ K: "x".repeat(4097) })).toThrow(/4 ?KB|4096/);
  });
  test("rejects > 64 keys", () => {
    const big: Record<string, string> = {};
    for (let i = 0; i < 65; i++) big[`K${i}`] = "v";
    expect(() => validateInputs(big)).toThrow(/64 keys/);
  });
  test("empty map ok", () => {
    expect(validateInputs({})).toEqual({});
  });
});
