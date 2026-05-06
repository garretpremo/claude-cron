import { zodToJsonSchema } from "zod-to-json-schema";
import type { Registry } from "./registry";

export function generateOpenApi(
  registry: Registry,
  meta: { title: string; version: string }
): {
  openapi: string;
  info: { title: string; version: string };
  paths: Record<string, Record<string, unknown>>;
} {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const r of registry.all()) {
    const inputSchema = zodToJsonSchema(r.input, { target: "openApi3" });
    const outputSchema = zodToJsonSchema(r.output, { target: "openApi3" });
    const pathItem = (paths[r.path] ??= {});
    pathItem[r.method.toLowerCase()] = {
      summary: r.description ?? `${r.method} ${r.path}`,
      parameters: r.method === "GET" ? extractParams(inputSchema) : undefined,
      requestBody: r.method !== "GET"
        ? { content: { "application/json": { schema: inputSchema } }, required: true }
        : undefined,
      responses: {
        "200": { description: "ok", content: { "application/json": { schema: outputSchema } } },
        "400": { description: "invalid input" },
      },
    };
  }
  return { openapi: "3.1.0", info: meta, paths };
}

function extractParams(jsonSchema: unknown): Array<{ name: string; in: "query" | "path"; required: boolean; schema: unknown }> {
  const s = jsonSchema as { properties?: Record<string, unknown>; required?: string[] } | undefined;
  if (!s?.properties) return [];
  const required = new Set(s.required ?? []);
  return Object.entries(s.properties).map(([name, schema]) => ({
    name, in: "query" as const, required: required.has(name), schema,
  }));
}
