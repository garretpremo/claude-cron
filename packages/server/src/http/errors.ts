import type { ErrorDTO } from "../dto";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: string,
    public readonly details?: unknown
  ) {
    super(message);
  }
}

export function toErrorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    const body: ErrorDTO = { error: err.message, code: err.code };
    if (err.details !== undefined) body.details = err.details;
    return Response.json(body, { status: err.status });
  }
  const body: ErrorDTO = {
    error: err instanceof Error ? err.message : String(err),
    code: "INTERNAL",
  };
  return Response.json(body, { status: 500 });
}
