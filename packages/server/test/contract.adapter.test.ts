import { describe, it, expect } from "bun:test";
import { z } from "zod";
import { Registry } from "../src/contract/registry";
import { defineRoute } from "../src/contract/define-route";
import { toBunRoutes } from "../src/contract/adapter";

describe("toBunRoutes", () => {
  it("produces a Bun.serve routes map that validates and dispatches", async () => {
    const r = new Registry();
    r.add(defineRoute({
      path: "/api/echo/:msg",
      method: "GET",
      input: z.object({ msg: z.string() }),
      output: z.object({ msg: z.string() }),
      handler: (input) => ({ msg: input.msg.toUpperCase() }),
    }));
    const routes = toBunRoutes(r);
    const handler = routes["/api/echo/:msg"] as (req: Request & { params: Record<string, string> }) => Promise<Response>;
    const fakeReq = Object.assign(new Request("http://x/api/echo/hi"), { params: { msg: "hi" } }) as Request & { params: Record<string, string> };
    const res = await handler(fakeReq);
    expect(await res.json()).toEqual({ msg: "HI" });
  });
});
