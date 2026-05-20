import { describe, expect, test } from "bun:test";
import { maskSensitiveInputs } from "../src/util/mask-sensitive-inputs";

describe("maskSensitiveInputs", () => {
  test("masks keys containing TOKEN/SECRET/KEY", () => {
    expect(maskSensitiveInputs({ TICKER: "NVDA", API_TOKEN: "abc", SECRET_KEY: "xyz" }))
      .toEqual({ TICKER: "NVDA", API_TOKEN: "****", SECRET_KEY: "****" });
  });
  test("does not mask innocuous keys", () => {
    expect(maskSensitiveInputs({ TICKER: "NVDA", REQUEST_ID: "abc" }))
      .toEqual({ TICKER: "NVDA", REQUEST_ID: "abc" });
  });
  test("empty map", () => {
    expect(maskSensitiveInputs({})).toEqual({});
  });
  test("KEY alone is sensitive", () => {
    expect(maskSensitiveInputs({ KEY: "x" })).toEqual({ KEY: "****" });
  });
});
