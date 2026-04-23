import { expect, test } from "bun:test";
import { HttpError, toErrorResponse } from "../../src/server/http/errors";

test("HttpError carries status + code", () => {
  const e = new HttpError(404, "Not found", "NOT_FOUND");
  expect(e.status).toBe(404);
  expect(e.code).toBe("NOT_FOUND");
  expect(e.message).toBe("Not found");
});

test("toErrorResponse wraps HttpError correctly", async () => {
  const r = toErrorResponse(new HttpError(409, "Already running", "CONFLICT"));
  expect(r.status).toBe(409);
  const body = await r.json();
  expect(body.error).toBe("Already running");
  expect(body.code).toBe("CONFLICT");
});

test("toErrorResponse wraps generic Error as 500", async () => {
  const r = toErrorResponse(new Error("kaboom"));
  expect(r.status).toBe(500);
  const body = await r.json();
  expect(body.error).toBe("kaboom");
  expect(body.code).toBe("INTERNAL");
});
