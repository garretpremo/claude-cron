export class DurationParseError extends Error {}

const UNITS: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

const DURATION_RE = /^(\d+)(s|m|h|d)$/;

export function parseDuration(input: string): number {
  const m = DURATION_RE.exec(input);
  if (!m) {
    throw new DurationParseError(
      `Invalid duration ${JSON.stringify(input)}; expected <n>[s|m|h|d]`
    );
  }
  const n = Number(m[1]);
  const mult = UNITS[m[2]!]!;
  return n * mult;
}
