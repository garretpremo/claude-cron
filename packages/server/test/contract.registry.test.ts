import { describe, it, expect } from "bun:test";
import { z } from "zod";
import { defineRoute } from "../src/contract/define-route";
import { Registry } from "../src/contract/registry";

describe("Registry", () => {
  it("collects routes and rejects duplicate (path, method)", () => {
    const r = new Registry();
    const a = defineRoute({
      path: "/api/foo",
      method: "GET",
      input: z.object({}),
      output: z.object({ ok: z.literal(true) }),
      handler: () => ({ ok: true as const }),
    });
    r.add(a);
    expect(r.all()).toHaveLength(1);
    expect(() => r.add(a)).toThrow(/duplicate/i);
  });
});
