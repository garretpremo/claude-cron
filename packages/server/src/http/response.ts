export function json<T>(data: T, init?: ResponseInit): Response {
  return Response.json(data, {
    headers: { "content-type": "application/json; charset=utf-8" },
    ...init,
  });
}

export function notFound(code: string, message: string): Response {
  return Response.json({ error: message, code }, { status: 404 });
}

export function badRequest(code: string, message: string, details?: unknown): Response {
  const body: { error: string; code: string; details?: unknown } = { error: message, code };
  if (details !== undefined) body.details = details;
  return Response.json(body, { status: 400 });
}

export function sseHeaders(): HeadersInit {
  return {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    "connection": "keep-alive",
  };
}
