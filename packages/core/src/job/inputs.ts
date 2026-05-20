const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const MAX_KEYS = 64;
const MAX_VALUE_BYTES = 4096;

export function validateInputs(raw: Record<string, string>): Record<string, string> {
  const keys = Object.keys(raw);
  if (keys.length > MAX_KEYS) {
    throw new Error(`inputs: max 64 keys (got ${keys.length})`);
  }
  for (const k of keys) {
    if (!KEY_RE.test(k)) {
      throw new Error(`inputs: key '${k}' is not env-var-safe (must match /^[A-Z][A-Z0-9_]*$/)`);
    }
    const v = raw[k];
    if (typeof v !== "string") {
      throw new Error(`inputs: value for '${k}' is not a string`);
    }
    if (Buffer.byteLength(v, "utf8") > MAX_VALUE_BYTES) {
      throw new Error(`inputs: value for '${k}' exceeds 4 KB (4096 bytes)`);
    }
  }
  return { ...raw };
}
