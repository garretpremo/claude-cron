import type { z } from "zod";

export interface RouteDescriptor<I extends z.ZodTypeAny = z.ZodTypeAny, O extends z.ZodTypeAny = z.ZodTypeAny> {
  path: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  input: I;
  output: O;
  handler: (input: z.infer<I>, ctx: HandlerCtx) => Promise<z.infer<O>> | z.infer<O>;
  description?: string;
}

export interface HandlerCtx {
  request: Request;
  params: Record<string, string>;
}

export function defineRoute<I extends z.ZodTypeAny, O extends z.ZodTypeAny>(
  desc: RouteDescriptor<I, O>
): RouteDescriptor<I, O> {
  return desc;
}
