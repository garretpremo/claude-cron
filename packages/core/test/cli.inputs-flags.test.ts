import { describe, expect, test } from "bun:test";
import { parseInputFlags } from "../src/cli";

describe("parseInputFlags", () => {
  test("repeated --input flags", () => {
    expect(parseInputFlags(["--input", "TICKER=NVDA", "--input", "REQUEST_ID=abc"]))
      .toEqual({ TICKER: "NVDA", REQUEST_ID: "abc" });
  });
  test("--input-json merges", () => {
    expect(parseInputFlags(["--input", "TICKER=NVDA", "--input-json", '{"REQUEST_ID":"abc"}']))
      .toEqual({ TICKER: "NVDA", REQUEST_ID: "abc" });
  });
  test("--input-json overrides --input on collision", () => {
    expect(parseInputFlags(["--input", "TICKER=NVDA", "--input-json", '{"TICKER":"AAPL"}']))
      .toEqual({ TICKER: "AAPL" });
  });
  test("malformed --input rejected (no =)", () => {
    expect(() => parseInputFlags(["--input", "TICKER"])).toThrow(/K=V/);
  });
  test("malformed --input-json rejected", () => {
    expect(() => parseInputFlags(["--input-json", "{not json"])).toThrow(/JSON/);
  });
  test("--input-json non-object rejected", () => {
    expect(() => parseInputFlags(["--input-json", '"string"'])).toThrow(/object/);
  });
  test("--input-json with non-string value rejected", () => {
    expect(() => parseInputFlags(["--input-json", '{"K": 42}'])).toThrow(/must be a string/);
  });
  test("empty argv → empty map", () => {
    expect(parseInputFlags([])).toEqual({});
  });
});
