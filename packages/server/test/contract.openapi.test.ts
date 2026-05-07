import { describe, it, expect } from "bun:test";
import { z } from "zod";
import { Registry } from "../src/contract/registry";
import { defineRoute } from "../src/contract/define-route";
import { generateOpenApi } from "../src/contract/openapi";

describe("generateOpenApi", () => {
  it("produces an OpenAPI 3.1 doc with operations and schemas", () => {
    const r = new Registry();
    r.add(defineRoute({
      path: "/api/foo",
      method: "GET",
      input: z.object({ q: z.string() }),
      output: z.object({ items: z.array(z.string()) }),
      handler: () => ({ items: [] }),
    }));
    const doc = generateOpenApi(r, { title: "claude-cron", version: "0.1.0" });
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.paths["/api/foo"]?.get).toBeDefined();
  });
});
