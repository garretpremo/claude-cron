export function parseIntParam(raw: string | undefined, fallback: number, max?: number): number {
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return fallback;
  if (max !== undefined && n > max) return max;
  return n;
}

export function parseCSVParam(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined;
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}

export function parseStringParam(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const t = raw.trim();
  return t === "" ? undefined : t;
}
