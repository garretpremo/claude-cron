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
