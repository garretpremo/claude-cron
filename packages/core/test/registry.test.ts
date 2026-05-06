import { expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import {
  readRegistry, writeRegistry,
  addProject, removeProject, findByPath, findByName
} from "../src/job/registry";

function tempPath() {
  return join(mkdtempSync(join(tmpdir(), "reg-")), "projects.toml");
}

test("reads empty registry from missing file", () => {
  const reg = readRegistry("/non/existent/path.toml");
  expect(reg.projects).toEqual([]);
});

test("add + read round-trip", () => {
  const p = tempPath();
  const reg = addProject(readRegistry(p), {
    name: "apijack", path: "/home/garret/projects/apijack", registered_at: 100,
  });
  writeRegistry(p, reg);
  const again = readRegistry(p);
  expect(again.projects.length).toBe(1);
  expect(again.projects[0]!.name).toBe("apijack");
});

test("duplicate name throws", () => {
  let reg = addProject({ projects: [] }, { name: "a", path: "/x", registered_at: 1 });
  expect(() =>
    addProject(reg, { name: "a", path: "/y", registered_at: 2 })
  ).toThrow(/already registered/);
});

test("removeProject by name", () => {
  let reg = addProject({ projects: [] }, { name: "a", path: "/x", registered_at: 1 });
  reg = removeProject(reg, "a");
  expect(reg.projects.length).toBe(0);
});

test("findByPath resolves", () => {
  const reg = addProject({ projects: [] }, {
    name: "a", path: "/home/x/proj", registered_at: 1,
  });
  expect(findByPath(reg, "/home/x/proj")?.name).toBe("a");
  expect(findByPath(reg, "/home/x/proj/src/sub")?.name).toBe("a"); // descendant
  expect(findByPath(reg, "/elsewhere")).toBeUndefined();
});
