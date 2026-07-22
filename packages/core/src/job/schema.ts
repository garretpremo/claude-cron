import { z } from "zod";
import parser from "cron-parser";
import { parseDuration } from "../util/duration";

const Duration = z.string().refine(
  (s) => {
    try { parseDuration(s); return true; } catch { return false; }
  },
  { message: "invalid duration (expected <n>[s|m|h|d])" }
);

const Cron = z.string().refine(
  (s) => {
    try { parser.parseExpression(s); return true; } catch { return false; }
  },
  { message: "invalid cron expression" }
);

// All blocks are .strict(): an unknown key is a config error, not a silent
// no-op. (A top-level `model:` used to be stripped by zod, so the job ran on
// the default model with no indication the pin was ignored.)
const PreflightSchema = z.object({
  run: z.string().min(1),
  timeout: Duration.default("30s"),
}).strict();

const ClaudeSchema = z
  .object({
    prompt: z.string().nullable().default(null),
    prompt_cmd: z.string().nullable().default(null),
    agent: z.string().nullable().default(null),
    append_system_prompt: z.string().nullable().default(null),
    allowed_tools: z.array(z.string()).default([]),
    disallowed_tools: z.array(z.string()).default([]),
    permission_mode: z
      .enum(["auto", "acceptEdits", "bypassPermissions", "default", "dontAsk", "plan"])
      .default("auto"),
    model: z.string().nullable().default(null),
    max_budget_usd: z.number().positive().nullable().default(null),
    extra_args: z.array(z.string()).default([]),
  })
  .strict()
  .refine(
    (c) => (c.prompt === null) !== (c.prompt_cmd === null),
    { message: "exactly one of claude.prompt or claude.prompt_cmd must be set" }
  );

const LoggingSchema = z.object({
  retention_days: z.number().int().positive().default(30),
}).strict();

export const JobSchema = z.object({
  name: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/, "name must be kebab/snake"),
  description: z.string().nullable().default(null),
  schedule: Cron,
  enabled: z.boolean().default(true),
  auth: z.enum(["subscription", "api_key"]).default("subscription"),
  preflight: PreflightSchema.nullable().default(null),
  claude: ClaudeSchema,
  // inner .default(false): fills enabled when inputs:{} is provided without it
  // outer .default({enabled:false}): fills the whole block when inputs is omitted
  inputs: z
    .object({
      enabled: z.boolean().default(false),
    })
    .strict()
    .default({ enabled: false }),
  cwd: z.string().default("."),
  timeout: Duration.default("10m"),
  logging: LoggingSchema.default({}),
}).strict();

export type Job = z.infer<typeof JobSchema>;
