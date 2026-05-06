import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BEGIN = (name: string) => `# BEGIN claude-cron:${name}`;
const END = (name: string) => `# END claude-cron:${name}`;

export interface SpliceOptions {
  removeIfEmpty?: boolean;
}

export function spliceBlock(
  source: string, name: string, lines: string[], opts: SpliceOptions = {}
): string {
  const begin = BEGIN(name);
  const end = END(name);
  const src = source.split("\n");

  const beginIdx = src.indexOf(begin);
  const endIdx = src.indexOf(end);

  const newBlock =
    opts.removeIfEmpty && lines.length === 0
      ? []
      : [begin, ...lines, end];

  if (beginIdx === -1 || endIdx === -1 || endIdx < beginIdx) {
    // Append new block
    const trimmed = src.length > 0 && src.at(-1) === "" ? src.slice(0, -1) : src;
    return [...trimmed, ...(newBlock.length ? ["", ...newBlock] : []), ""].join("\n");
  }

  // Replace in place
  const before = src.slice(0, beginIdx);
  const after = src.slice(endIdx + 1);
  return [...before, ...newBlock, ...after].join("\n");
}

export function readCrontab(): string {
  const r = spawnSync("crontab", ["-l"], { encoding: "utf8" });
  if (r.status === 0) return r.stdout;
  // Empty crontab typically exits nonzero with "no crontab for ..." on stderr.
  if (/no crontab/i.test(r.stderr)) return "";
  throw new Error(`crontab -l failed: ${r.stderr}`);
}

export function writeCrontab(content: string): void {
  const tmp = join(tmpdir(), `claude-cron-crontab-${process.pid}`);
  writeFileSync(tmp, content);
  const r = spawnSync("crontab", [tmp]);
  if (r.status !== 0) {
    throw new Error(`crontab install failed: ${r.stderr?.toString() ?? ""}`);
  }
}

export function diffLines(a: string, b: string): string {
  const al = a.split("\n");
  const bl = b.split("\n");
  const out: string[] = [];
  const max = Math.max(al.length, bl.length);
  for (let i = 0; i < max; i++) {
    if (al[i] === bl[i]) continue;
    if (al[i] !== undefined) out.push(`- ${al[i]}`);
    if (bl[i] !== undefined) out.push(`+ ${bl[i]}`);
  }
  return out.join("\n");
}
