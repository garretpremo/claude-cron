import { expect, test } from "bun:test";
import { loadJobsFromDir } from "../src/job/loader";
import { join } from "node:path";

const FIX = join(import.meta.dir, "fixtures/jobs");

test("loads valid job", () => {
  const result = loadJobsFromDir(FIX);
  const good = result.loaded.find((j) => j.job.name === "review");
  expect(good).toBeDefined();
  expect(good!.job.schedule).toBe("*/5 * * * *");
});

test("captures invalid job as error, not throw", () => {
  const result = loadJobsFromDir(FIX);
  expect(result.errors.length).toBe(1);
  expect(result.errors[0]!.file).toMatch(/bad\.yaml$/);
});

test("missing dir returns empty", () => {
  const result = loadJobsFromDir("/non/existent");
  expect(result.loaded).toEqual([]);
  expect(result.errors).toEqual([]);
});
