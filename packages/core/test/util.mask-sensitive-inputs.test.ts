import { describe, expect, test } from "bun:test";
import { maskSensitiveInputs, maskInputsJson } from "../src/util/mask-sensitive-inputs";

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

describe("maskInputsJson", () => {
  test("masks sensitive values in serialized json", () => {
    expect(maskInputsJson(JSON.stringify({ TICKER: "NVDA", API_TOKEN: "abc" })))
      .toBe(JSON.stringify({ TICKER: "NVDA", API_TOKEN: "****" }));
  });
  test("passes through null", () => {
    expect(maskInputsJson(null)).toBeNull();
  });
  test("passes through empty string", () => {
    expect(maskInputsJson("")).toBe("");
  });
});
