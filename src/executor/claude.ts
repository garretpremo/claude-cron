import type { Job } from "../job/schema";

export interface BuildClaudeArgvInput {
  job: Job;
  prompt: string;
  cwdAbsolute: string;
}

export function buildClaudeArgv(i: BuildClaudeArgvInput): string[] {
  const { job, prompt, cwdAbsolute } = i;
  const c = job.claude;
  const argv: string[] = ["claude"];

  // Always-applied
  argv.push("--print");
  argv.push("--no-session-persistence");
  argv.push("--output-format", "json");
  argv.push("--add-dir", cwdAbsolute);
  argv.push("--permission-mode", c.permission_mode);

  if (job.auth === "api_key") argv.push("--bare");
  if (c.agent) argv.push("--agent", c.agent);
  if (c.model) argv.push("--model", c.model);
  if (c.append_system_prompt) argv.push("--append-system-prompt", c.append_system_prompt);

  if (c.allowed_tools.length > 0) {
    argv.push("--allowed-tools", c.allowed_tools.join(" "));
  }
  if (c.disallowed_tools.length > 0) {
    argv.push("--disallowed-tools", c.disallowed_tools.join(" "));
  }

  if (job.auth === "api_key" && c.max_budget_usd !== null) {
    argv.push("--max-budget-usd", String(c.max_budget_usd));
  }

  argv.push(...c.extra_args);

  argv.push(prompt); // final positional
  return argv;
}
