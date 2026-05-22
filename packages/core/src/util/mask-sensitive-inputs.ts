const SENSITIVE = /TOKEN|SECRET|KEY/;

/**
 * Mask values of keys whose name suggests a secret-ish payload.
 * UI convenience only — secrets do not belong in `inputs`; see
 * ~/.claude-cron/secrets.env for that. This is defense in depth so a typo
 * doesn't shoulder-surf into the dashboard.
 */
export function maskSensitiveInputs(inputs: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(inputs)) {
    out[k] = SENSITIVE.test(k) ? "****" : v;
  }
  return out;
}

/**
 * Mask a serialized `inputs_json` payload, returning re-serialized JSON so a
 * sensitive value never crosses the wire to the dashboard. Pass-through for
 * null/empty.
 */
export function maskInputsJson(json: string | null): string | null {
  if (!json) return json;
  return JSON.stringify(maskSensitiveInputs(JSON.parse(json) as Record<string, string>));
}
