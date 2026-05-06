import { expect, test } from "bun:test";
import { spliceBlock } from "../src/cron/sync";

test("inserts new block at end", () => {
  const before = "# user line\n* * * * * other\n";
  const after = spliceBlock(before, "apijack", ["*/5 * * * * claude-cron run apijack/a"]);
  expect(after).toContain("# BEGIN claude-cron:apijack");
  expect(after).toContain("# END claude-cron:apijack");
  expect(after).toContain("*/5 * * * * claude-cron run apijack/a");
  expect(after).toContain("* * * * * other"); // preserved
});

test("replaces existing block in place", () => {
  const before = [
    "* * * * * user",
    "# BEGIN claude-cron:apijack",
    "* * * * * old",
    "# END claude-cron:apijack",
    "* * * * * trailing",
    "",
  ].join("\n");
  const after = spliceBlock(before, "apijack", ["*/1 * * * * new"]);
  expect(after).toContain("*/1 * * * * new");
  expect(after).not.toContain("* * * * * old");
  expect(after).toContain("* * * * * user");
  expect(after).toContain("* * * * * trailing");
});

test("empty lines produce an empty block", () => {
  const before = "";
  const after = spliceBlock(before, "global", []);
  expect(after).toMatch(/# BEGIN claude-cron:global\n# END claude-cron:global/);
});

test("removing a block: empty lines", () => {
  const before = [
    "# BEGIN claude-cron:dead",
    "* * * * * old",
    "# END claude-cron:dead",
  ].join("\n");
  const after = spliceBlock(before, "dead", [], { removeIfEmpty: true });
  expect(after).not.toContain("claude-cron:dead");
});
