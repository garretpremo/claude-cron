import type { Registry } from "./registry";
import type { RouteDescriptor } from "./define-route";

type BunHandler = (req: Request & { params: Record<string, string> }) => Promise<Response>;

export function toBunRoutes(registry: Registry): Record<string, BunHandler | Record<string, BunHandler>> {
  const out: Record<string, BunHandler | Record<string, BunHandler>> = {};
  for (const route of registry.all()) {
    const handler = makeHandler(route);
    const existing = out[route.path];
    if (route.method === "GET") {
      if (existing) {
        if (typeof existing === "function") out[route.path] = { GET: handler };
        else (existing as Record<string, BunHandler>).GET = handler;
      } else {
        out[route.path] = handler;
      }
    } else {
      if (!existing || typeof existing === "function") {
        out[route.path] = { [route.method]: handler, ...(typeof existing === "function" ? { GET: existing } : {}) };
      } else {
        (existing as Record<string, BunHandler>)[route.method] = handler;
      }
    }
  }
  return out;
}

function makeHandler(route: RouteDescriptor): BunHandler {
  return async (req) => {
    const url = new URL(req.url);
    const inputRaw: Record<string, unknown> = { ...req.params };
    for (const [k, v] of url.searchParams.entries()) inputRaw[k] = v;
    if (route.method !== "GET") {
      try {
        const body = await req.json();
        if (body && typeof body === "object") Object.assign(inputRaw, body);
      } catch { /* empty body OK */ }
    }
    const parsed = route.input.safeParse(inputRaw);
    if (!parsed.success) {
      return Response.json({ error: "invalid_input", issues: parsed.error.issues }, { status: 400 });
    }
    const result = await route.handler(parsed.data, { request: req, params: req.params });
    return Response.json(result);
  };
}
