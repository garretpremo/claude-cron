import type { z } from "zod";
import type { RouteDescriptor } from "./define-route";

export class Registry {
  private routes: RouteDescriptor[] = [];

  add<I extends z.ZodTypeAny, O extends z.ZodTypeAny>(r: RouteDescriptor<I, O>): void {
    const dup = this.routes.find(
      (x) => x.path === r.path && x.method === r.method
    );
    if (dup) throw new Error(`duplicate route: ${r.method} ${r.path}`);
    this.routes.push(r as unknown as RouteDescriptor);
  }

  all(): readonly RouteDescriptor[] {
    return this.routes;
  }
}
