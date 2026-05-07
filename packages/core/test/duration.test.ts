import { expect, test, describe } from "bun:test";
import { parseDuration, DurationParseError } from "../src/util/duration";

describe("parseDuration", () => {
  test("seconds", () => expect(parseDuration("30s")).toBe(30_000));
  test("minutes", () => expect(parseDuration("5m")).toBe(300_000));
  test("hours",   () => expect(parseDuration("2h")).toBe(7_200_000));
  test("days",    () => expect(parseDuration("1d")).toBe(86_400_000));

  test("rejects empty", () => {
    expect(() => parseDuration("")).toThrow(DurationParseError);
  });
  test("rejects missing unit", () => {
    expect(() => parseDuration("30")).toThrow(DurationParseError);
  });
  test("rejects unknown unit", () => {
    expect(() => parseDuration("30x")).toThrow(DurationParseError);
  });
  test("rejects negative", () => {
    expect(() => parseDuration("-1m")).toThrow(DurationParseError);
  });
  test("rejects fractional", () => {
    expect(() => parseDuration("1.5m")).toThrow(DurationParseError);
  });
});
