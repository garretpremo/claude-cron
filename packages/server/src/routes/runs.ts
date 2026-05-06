import type { Database } from "bun:sqlite";
import { z } from "zod";
import { defineRoute } from "../contract";
import {
  PaginatedRunsDTOSchema,
  RunWithEventsDTOSchema,
  RunStatusSchema,
} from "../contract/schemas";
import { listRuns, getRunWithEvents } from "../services/run-service";
import { HttpError } from "../http/errors";

export interface RunsDeps {
  db: Database;
}

const TrimmedString = z
  .string()
  .optional()
  .transform((s) => {
    if (s === undefined) return undefined;
    const t = s.trim();
    return t === "" ? undefined : t;
  });

const StatusCsv = z
  .string()
  .optional()
  .transform((raw, ctx) => {
    if (!raw) return undefined;
    const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) return undefined;
    for (const p of parts) {
      if (!RunStatusSchema.safeParse(p).success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `invalid status: ${p}`,
        });
        return z.NEVER;
      }
    }
    return parts as z.infer<typeof RunStatusSchema>[];
  });

const TriBool = z
  .enum(["true", "false"])
  .optional()
  .transform((s) => (s === undefined ? undefined : s === "true"));

const NonNegativeInt = (fallback: number, max?: number) =>
  z
    .string()
    .optional()
    .transform((raw) => {
      if (raw === undefined) return fallback;
      const n = Number(raw);
      if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return fallback;
      if (max !== undefined && n > max) return max;
      return n;
    });

export function runsListRoute(deps: RunsDeps) {
  return defineRoute({
    path: "/api/runs",
    method: "GET",
    input: z.object({
      project: TrimmedString,
      job: TrimmedString,
      status: StatusCsv,
      is_test: TriBool,
      limit: NonNegativeInt(50, 500),
      offset: NonNegativeInt(0),
      coalesce: z.literal("skipped_preflight").optional(),
    }),
    output: PaginatedRunsDTOSchema,
    handler: (input) =>
      listRuns(deps.db, {
        project: input.project,
        job: input.job,
        status: input.status,
        is_test: input.is_test,
        limit: input.limit,
        offset: input.offset,
        coalesce: input.coalesce,
      }),
  });
}

export function runGetRoute(deps: RunsDeps) {
  return defineRoute({
    path: "/api/runs/:id",
    method: "GET",
    input: z.object({
      id: z.coerce.number().int().positive(),
    }),
    output: RunWithEventsDTOSchema,
    handler: ({ id }) => {
      const r = getRunWithEvents(deps.db, id);
      if (!r) throw new HttpError(404, `Run ${id} not found`, "NOT_FOUND");
      return r;
    },
  });
}
