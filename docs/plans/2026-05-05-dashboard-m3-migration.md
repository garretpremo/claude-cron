# Dashboard M3 Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure claude-cron into a 3-package Bun workspace and rewrite the dashboard on top of `bun-svelte-m3e-template` (SvelteKit + Material 3 Expressive), with a typed zod-route-registry contract layer and server-side favorites.

**Architecture:** 3 packages — `@claude-cron/core` (CLI + executor + db), `@claude-cron/server` (Bun.serve + zod contract + OpenAPI), `@claude-cron/web` (SvelteKit PWA). 7 phases on a single feature branch (`m3-migration`), each ending in a green commit. CLI never breaks during the migration.

**Tech Stack:** Bun ≥ 1.1, TypeScript, zod, SvelteKit, Material 3 Expressive (`@material/web`), `@vite-pwa/sveltekit`, Scalar, Playwright.

**Spec:** `docs/specs/2026-05-05-dashboard-m3-migration-design.md`

---

## Pre-flight

Before Phase 1, create the feature branch and confirm the working tree is clean.

- [ ] **Step 1: Confirm clean working tree**

```bash
git status
```

Expected: `nothing to commit, working tree clean` on `main`.

- [ ] **Step 2: Cut feature branch**

```bash
git checkout -b m3-migration
```

- [ ] **Step 3: Confirm baseline tests pass**

```bash
bun test && bun run typecheck
```

Expected: all ~95 tests pass; typecheck reports no errors. This is the green baseline every phase must preserve.

---

## Phase 1: Restructure into 3-package workspace

**Outcome:** All existing code lives under `packages/{core,server}/src/`. CLI and dashboard behave identically. Tests + typecheck pass.

### Task 1.1: Create workspace skeleton

**Files:**
- Create: `packages/core/`, `packages/server/`, `packages/web/` (web populated later)
- Modify: `package.json` (root)
- Create: `tsconfig.base.json`

- [ ] **Step 1: Create package directories**

```bash
mkdir -p packages/core/src packages/server/src packages/web
```

- [ ] **Step 2: Rewrite root `package.json` as workspace coordinator**

Replace `package.json` with:

```json
{
  "name": "claude-cron-workspace",
  "private": true,
  "type": "module",
  "workspaces": ["packages/*"],
  "scripts": {
    "test": "bun test",
    "typecheck": "bun run --filter '*' typecheck",
    "build": "bun run --filter @claude-cron/web build",
    "dev": "bun run --filter @claude-cron/server dev & bun run --filter @claude-cron/web dev",
    "install:global": "bun run build && bun run --filter @claude-cron/core install:global"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5.5.0"
  }
}
```

- [ ] **Step 3: Create shared `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "allowImportingTsExtensions": false,
    "verbatimModuleSyntax": false,
    "types": ["bun-types"]
  }
}
```

### Task 1.2: Create `@claude-cron/core` package

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`

- [ ] **Step 1: Write `packages/core/package.json`**

```json
{
  "name": "@claude-cron/core",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "bin": { "claude-cron": "./src/cli.ts" },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "install:global": "chmod +x src/cli.ts && mkdir -p $HOME/.bun/bin && ln -sf \"$PWD/src/cli.ts\" \"$HOME/.bun/bin/claude-cron\" && echo 'claude-cron installed at' $HOME/.bun/bin/claude-cron"
  },
  "dependencies": {
    "commander": "^12.1.0",
    "zod": "^3.23.0",
    "yaml": "^2.5.0",
    "@iarna/toml": "^2.2.5",
    "cron-parser": "^4.9.0"
  }
}
```

- [ ] **Step 2: Write `packages/core/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*", "test/**/*"]
}
```

### Task 1.3: Create `@claude-cron/server` package

**Files:**
- Create: `packages/server/package.json`
- Create: `packages/server/tsconfig.json`

- [ ] **Step 1: Write `packages/server/package.json`**

```json
{
  "name": "@claude-cron/server",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "dev": "bun --watch src/dev-entry.ts"
  },
  "dependencies": {
    "@claude-cron/core": "workspace:*",
    "zod": "^3.23.0"
  }
}
```

- [ ] **Step 2: Write `packages/server/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*", "test/**/*"]
}
```

### Task 1.4: Move `core` source files

**Files:** all source from `src/` except `src/server/`.

- [ ] **Step 1: Move directories**

```bash
git mv src/cli.ts        packages/core/src/cli.ts
git mv src/commands      packages/core/src/commands
git mv src/cron          packages/core/src/cron
git mv src/db            packages/core/src/db
git mv src/executor      packages/core/src/executor
git mv src/job           packages/core/src/job
git mv src/util          packages/core/src/util
```

- [ ] **Step 2: Create `packages/core/src/index.ts`** (barrel for what `@claude-cron/server` consumes)

```ts
export { openDb } from "./db/connection";
export * as queries from "./db/queries";
export type { Job } from "./job/schema";
export { JobSchema } from "./job/schema";
export { loadJob } from "./job/loader";
export { listProjects, getProject } from "./job/registry";
export { runJob } from "./executor/run";
export { paths } from "./util/paths";
```

(If any of these symbols are imported under different paths in `src/server/`, adjust this barrel after Task 1.5 reveals which.)

### Task 1.5: Move `server` source files and update imports

**Files:** `src/server/` → `packages/server/src/`. All controller/service imports of `../db`, `../executor`, etc. switch to `@claude-cron/core`.

- [ ] **Step 1: Move server tree**

```bash
git mv src/server/* packages/server/src/
rmdir src/server src
```

- [ ] **Step 2: Rewrite imports in `packages/server/src/**/*.ts`**

For each file, replace relative climbs into core with the package import. Pattern:

```diff
- import { openDb } from "../../db/connection";
+ import { openDb } from "@claude-cron/core";
```

Find all candidates:

```bash
grep -rn "from \"\.\." packages/server/src
```

Update each one to use the `@claude-cron/core` barrel.

### Task 1.6: Move tests into per-package directories

**Files:** `test/` → split between `packages/core/test/` and `packages/server/test/`.

- [ ] **Step 1: Split test files by ownership**

Tests for executor / cron / db / job / util go under `packages/core/test/`; tests touching the dashboard server go under `packages/server/test/`. Inspect each test to decide:

```bash
ls test/
```

Move with `git mv`. Example:

```bash
git mv test/executor.run.test.ts packages/core/test/
git mv test/cron.sync.test.ts    packages/core/test/
# ...
```

Server-related tests (e.g., anything currently importing from `src/server/`) move to `packages/server/test/`.

- [ ] **Step 2: Update test imports**

Same pattern as Task 1.5: replace relative `../src/...` paths with `@claude-cron/core` or relative-within-package paths.

- [ ] **Step 3: Update `test/fixtures/` placement**

```bash
git mv test/fixtures packages/core/test/fixtures
```

(Both packages can reference it via relative path; if the server tests need it, add a symlink or copy. Prefer relative path: `../core/test/fixtures/...`.)

### Task 1.7: Update `bun run install:global`

The root script (`bun run install:global`) now delegates to the core package. Confirm by running:

- [ ] **Step 1: Test workspace install**

```bash
bun install
```

Expected: workspace links resolve, `node_modules/@claude-cron/core` exists as a symlink.

- [ ] **Step 2: Run `install:global` and verify CLI**

```bash
bun run install:global
~/.bun/bin/claude-cron --help
```

Expected: CLI prints help, all subcommands listed.

### Task 1.8: Verify Phase 1 green

- [ ] **Step 1: Run tests**

```bash
bun test
```

Expected: all tests pass. If any fail because of stale imports, fix the imports until green.

- [ ] **Step 2: Run typecheck**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Step 3: Manual smoke — list a registered project**

```bash
claude-cron list
claude-cron status
```

Expected: matches pre-restructure output.

- [ ] **Step 4: Commit Phase 1**

```bash
git add -A
git commit -m "refactor: restructure into @claude-cron/{core,server} workspace

No behavior change. Splits the existing src/ into two workspace
packages: @claude-cron/core (CLI + executor + db + cron + job loader)
and @claude-cron/server (Bun.serve dashboard API). Tests + typecheck
green. CLI behavior unchanged."
```

---

## Phase 2: Zod-contract scaffold

**Outcome:** A route-registry pattern + OpenAPI generator + Scalar UI mounted at `/docs`. No new endpoints yet; existing routes still wired the old way. New scaffolding compiles and is exercised by a smoke test.

### Task 2.1: Add Scalar dependency

**Files:** `packages/server/package.json`

- [ ] **Step 1: Install Scalar**

```bash
bun add --filter @claude-cron/server @scalar/api-reference
```

- [ ] **Step 2: Verify install**

```bash
bun install
ls packages/server/node_modules/@scalar/api-reference
```

Expected: package present.

### Task 2.2: Define the route descriptor and registry

**Files:**
- Create: `packages/server/src/contract/define-route.ts`
- Create: `packages/server/src/contract/registry.ts`
- Test: `packages/server/test/contract.registry.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/server/test/contract.registry.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test, expect failure**

```bash
bun test packages/server/test/contract.registry.test.ts
```

Expected: FAIL — modules don't exist.

- [ ] **Step 3: Implement `define-route.ts`**

```ts
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
```

- [ ] **Step 4: Implement `registry.ts`**

```ts
import type { RouteDescriptor } from "./define-route";

export class Registry {
  private routes: RouteDescriptor[] = [];

  add(r: RouteDescriptor): void {
    const dup = this.routes.find(
      (x) => x.path === r.path && x.method === r.method
    );
    if (dup) throw new Error(`duplicate route: ${r.method} ${r.path}`);
    this.routes.push(r);
  }

  all(): readonly RouteDescriptor[] {
    return this.routes;
  }
}
```

- [ ] **Step 5: Run test, expect pass**

```bash
bun test packages/server/test/contract.registry.test.ts
```

Expected: PASS.

### Task 2.3: Build a Bun.serve adapter that runs registered routes

**Files:**
- Create: `packages/server/src/contract/adapter.ts`
- Test: `packages/server/test/contract.adapter.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
    const handler = routes["/api/echo/:msg"] as (req: { url: string; params: Record<string, string> }) => Promise<Response>;
    const res = await handler({ url: "http://x/api/echo/hi", params: { msg: "hi" } });
    expect(await res.json()).toEqual({ msg: "HI" });
  });
});
```

- [ ] **Step 2: Run test, expect failure**

```bash
bun test packages/server/test/contract.adapter.test.ts
```

- [ ] **Step 3: Implement `adapter.ts`**

```ts
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
        // Merge GET into existing object form
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

function makeHandler<I, O>(route: RouteDescriptor): BunHandler {
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
```

- [ ] **Step 4: Run test, expect pass**

```bash
bun test packages/server/test/contract.adapter.test.ts
```

### Task 2.4: OpenAPI generator

**Files:**
- Create: `packages/server/src/contract/openapi.ts`
- Test: `packages/server/test/contract.openapi.test.ts`

- [ ] **Step 1: Install `zod-to-json-schema`**

```bash
bun add --filter @claude-cron/server zod-to-json-schema
```

- [ ] **Step 2: Write the failing test**

```ts
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
```

- [ ] **Step 3: Implement `openapi.ts`**

```ts
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
    paths[r.path] ??= {};
    paths[r.path][r.method.toLowerCase()] = {
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
  // Minimal extraction: treat all properties as query params unless { in: "path" } is hinted later.
  const s = jsonSchema as { properties?: Record<string, unknown>; required?: string[] } | undefined;
  if (!s?.properties) return [];
  const required = new Set(s.required ?? []);
  return Object.entries(s.properties).map(([name, schema]) => ({
    name, in: "query" as const, required: required.has(name), schema,
  }));
}
```

- [ ] **Step 4: Run test, expect pass**

```bash
bun test packages/server/test/contract.openapi.test.ts
```

### Task 2.5: Mount Scalar at `/docs` and `/openapi.json`

**Files:**
- Modify: `packages/server/src/index.ts`
- Create: `packages/server/src/contract/index.ts` (barrel)

- [ ] **Step 1: Write `packages/server/src/contract/index.ts`**

```ts
export { defineRoute } from "./define-route";
export type { RouteDescriptor, HandlerCtx } from "./define-route";
export { Registry } from "./registry";
export { toBunRoutes } from "./adapter";
export { generateOpenApi } from "./openapi";
```

- [ ] **Step 2: Modify `packages/server/src/index.ts` to mount the routes**

Add (without removing existing routes yet — registry is empty for now):

```ts
import { Registry, toBunRoutes, generateOpenApi } from "./contract";

// Inside startServer, before the Bun.serve call:
const registry = new Registry();
// (Phase 3 will populate the registry with route descriptors.)
const contractRoutes = toBunRoutes(registry);
const openapi = generateOpenApi(registry, { title: "claude-cron", version: "0.1.0" });

// In the Bun.serve routes map, add:
"/openapi.json": () => Response.json(openapi),
"/docs": () => new Response(scalarHtml(), { headers: { "content-type": "text/html" } }),
...contractRoutes,
```

Add a small `scalarHtml()` helper:

```ts
function scalarHtml(): string {
  return `<!doctype html><html><head><title>claude-cron API</title></head>
<body><script id="api-reference" data-url="/openapi.json"></script>
<script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script></body></html>`;
}
```

### Task 2.6: Verify Phase 2 green

- [ ] **Step 1: Run tests**

```bash
bun test
```

Expected: all tests pass (existing + 3 new contract tests).

- [ ] **Step 2: Smoke test the docs page**

```bash
claude-cron serve &
SERVE_PID=$!
sleep 1
curl -s http://127.0.0.1:8787/openapi.json | head -5
curl -s http://127.0.0.1:8787/docs | head -5
kill $SERVE_PID
```

Expected: `/openapi.json` returns valid JSON (paths object is empty for now), `/docs` returns the Scalar HTML.

- [ ] **Step 3: Commit Phase 2**

```bash
git add -A
git commit -m "feat(server): zod-route-registry contract scaffold

Adds defineRoute/Registry/Bun-serve adapter/OpenAPI generator under
packages/server/src/contract/. Mounts Scalar UI at /docs and the spec
at /openapi.json. No existing routes refactored yet — registry is
empty in this commit."
```

---

## Phase 3: Refactor existing routes through the contract

**Outcome:** Every existing route is defined via `defineRoute()` and registered. API surface unchanged. Tests pass.

### Task 3.1: Define DTO schemas in zod

**Files:**
- Create: `packages/server/src/contract/schemas.ts`

The current DTOs live in `packages/server/src/dto.ts` as TypeScript types. Mirror them as zod schemas.

- [ ] **Step 1: Read the existing DTO file**

```bash
cat packages/server/src/dto.ts
```

- [ ] **Step 2: Write `packages/server/src/contract/schemas.ts`**

For each existing DTO, write the zod equivalent. Pattern:

```ts
import { z } from "zod";

export const RunStatus = z.enum([
  "running", "success", "failure", "timeout", "interrupted",
  "abandoned", "skipped_preflight", "skipped_overlap", "config_error",
]);

export const RunDTO = z.object({
  id: z.number().int(),
  project: z.string(),
  job: z.string(),
  status: RunStatus,
  started_at: z.number(),
  ended_at: z.number().nullable(),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  input_tokens: z.number().int().nullable(),
  output_tokens: z.number().int().nullable(),
  cache_creation_tokens: z.number().int().nullable(),
  cache_read_tokens: z.number().int().nullable(),
  is_test: z.boolean(),
  coalesced_count: z.number().int().optional(),
});

export const ProjectDTO = z.object({
  name: z.string(),
  path: z.string(),
});

export const JobDTO = z.object({
  project: z.string(),
  name: z.string(),
  schedule: z.string(),
  enabled: z.boolean(),
  description: z.string().nullable(),
});

export const StatusDTO = z.object({
  health: z.enum(["healthy", "degraded", "unhealthy"]),
  abandoned_runs: z.number().int(),
  recent_failures: z.number().int(),
  prelude_ok: z.boolean(),
});

// Keep the existing TypeScript types for backwards compat:
export type RunDTO = z.infer<typeof RunDTO>;
export type ProjectDTO = z.infer<typeof ProjectDTO>;
export type JobDTO = z.infer<typeof JobDTO>;
export type StatusDTO = z.infer<typeof StatusDTO>;
```

(Confirm field set against the actual `dto.ts` — if any field has a different name or nullability, match the source of truth.)

- [ ] **Step 3: Re-export from old location for compat**

Replace contents of `packages/server/src/dto.ts` with:

```ts
export * from "./contract/schemas";
```

- [ ] **Step 4: Run typecheck**

```bash
bun run typecheck
```

Fix any field-mismatch errors by aligning the zod schemas with what existing controllers actually return.

### Task 3.2: Refactor read-only endpoints (5 routes)

**Files:**
- Modify: `packages/server/src/index.ts`
- Modify (or create siblings): `packages/server/src/controllers/{projects,runs,status}.ts`

The 5 read endpoints to refactor: `/api/projects`, `/api/projects/:project`, `/api/projects/:project/jobs`, `/api/projects/:project/jobs/:job`, `/api/status`.

For each, replace the inline route in `index.ts` with a `defineRoute()` call registered to the `Registry`. Pattern (one example, apply to all 5):

- [ ] **Step 1: Move `/api/projects` into a route descriptor**

Add to `packages/server/src/controllers/projects.ts` (or a new `routes/projects.ts`):

```ts
import { z } from "zod";
import { defineRoute } from "../contract";
import { ProjectDTO } from "../contract/schemas";

export function projectsListRoute(controller: ProjectsController) {
  return defineRoute({
    path: "/api/projects",
    method: "GET",
    input: z.object({}),
    output: z.array(ProjectDTO),
    handler: () => controller.list().then((res) => res.json()) as Promise<ProjectDTO[]>,
  });
}
```

(If `controller.list()` already returns a `Response`, factor a private helper that returns the data and have both call it.)

- [ ] **Step 2: Register in `index.ts`**

```ts
registry.add(projectsListRoute(projects));
```

Remove the corresponding inline route from the `routes:` map.

- [ ] **Step 3: Run tests after each route migrated**

```bash
bun test packages/server/test
```

Expected: all green. If an existing test asserts a Response shape that the contract adapter changes (it shouldn't — both produce JSON), update test expectations.

- [ ] **Step 4: Repeat for the other 4 GET routes**

Apply the same pattern to:
- `/api/projects/:project`
- `/api/projects/:project/jobs`
- `/api/projects/:project/jobs/:job`
- `/api/status`

For path params, the schema includes them as fields (e.g., `input: z.object({ project: z.string() })`).

### Task 3.3: Refactor `/api/runs` and `/api/runs/:id`

**Files:**
- Modify: `packages/server/src/index.ts`
- Modify: controllers/routes for runs

The `/api/runs` route has query-string filters (project, job, status, since, until, coalesce, limit). All become input-schema fields.

- [ ] **Step 1: Define the runs-list route**

```ts
import { z } from "zod";
import { defineRoute } from "../contract";
import { RunDTO, RunStatus } from "../contract/schemas";

export function runsListRoute(controller: RunsController) {
  return defineRoute({
    path: "/api/runs",
    method: "GET",
    input: z.object({
      project: z.string().optional(),
      job: z.string().optional(),
      status: RunStatus.optional(),
      since: z.coerce.number().int().optional(),
      until: z.coerce.number().int().optional(),
      limit: z.coerce.number().int().min(1).max(500).default(100),
      coalesce: z.literal("skipped_preflight").optional(),
    }),
    output: z.array(RunDTO),
    handler: (input) => controller.listFiltered(input),
  });
}
```

- [ ] **Step 2: Register and remove inline**

Same as Task 3.2 step 2.

- [ ] **Step 3: Define `/api/runs/:id`**

```ts
export function runGetRoute(controller: RunsController) {
  return defineRoute({
    path: "/api/runs/:id",
    method: "GET",
    input: z.object({ id: z.coerce.number().int() }),
    output: RunDTO.extend({ events: z.array(z.unknown()) }), // refine event shape later
    handler: (input) => controller.getDetail(input.id),
  });
}
```

### Task 3.4: SSE stream stays inline

**Files:** `packages/server/src/index.ts`

The contract adapter only handles JSON request/response. SSE (`/api/runs/:id/stream`) is a long-lived response stream and stays inline in the `routes:` map. Document this in a comment.

- [ ] **Step 1: Add a comment in `index.ts`**

```ts
// `/api/runs/:id/stream` is SSE — kept outside the contract adapter
// because the response is a stream, not JSON.
"/api/runs/:id/stream": (req) => stream.stream(req.params.id),
```

### Task 3.5: Refactor POST action endpoints

**Files:** `packages/server/src/index.ts`, action route files.

The 4 action endpoints: enable, disable, run, stop. Each is a POST.

- [ ] **Step 1: Define enable/disable/run/stop routes**

```ts
import { z } from "zod";
import { defineRoute } from "../contract";

export function jobEnableRoute(controller: ActionsController) {
  return defineRoute({
    path: "/api/projects/:project/jobs/:job/enable",
    method: "POST",
    input: z.object({ project: z.string(), job: z.string() }),
    output: z.object({ ok: z.literal(true) }),
    handler: (i) => controller.enable(i.project, i.job).then(() => ({ ok: true as const })),
  });
}
// (analogous for disable, run, stop)
```

For run-now the output is `{ ok: true; run_id: number }`.

- [ ] **Step 2: Register all 4**

In `index.ts`:

```ts
registry.add(jobEnableRoute(actions));
registry.add(jobDisableRoute(actions));
registry.add(jobRunRoute(actions));
registry.add(runStopRoute(actions));
```

Remove the corresponding inline POSTs.

### Task 3.6: Verify Phase 3 green

- [ ] **Step 1: Run tests**

```bash
bun test
```

- [ ] **Step 2: Run typecheck**

```bash
bun run typecheck
```

- [ ] **Step 3: Smoke — exercise each endpoint**

```bash
claude-cron serve &
SERVE_PID=$!
sleep 1
curl -s http://127.0.0.1:8787/api/projects | head -3
curl -s http://127.0.0.1:8787/api/runs?limit=5 | head -3
curl -s http://127.0.0.1:8787/api/status | head -3
curl -s http://127.0.0.1:8787/openapi.json | grep -o '"paths":' | head -1
kill $SERVE_PID
```

Expected: all return valid JSON; `/openapi.json` now lists all 11 routes (5 GET projects + 2 GET runs + 4 POST actions + 1 status — minus stream).

- [ ] **Step 4: Commit Phase 3**

```bash
git add -A
git commit -m "refactor(server): wire existing routes through zod contract

Every JSON route now has explicit input/output zod schemas via
defineRoute(). Registry-generated OpenAPI now describes the full API
surface. SSE stream stays inline as before. No behavioral change."
```

---

## Phase 4: Schema v4 + new endpoints

**Outcome:** Schema migrated to v4 with `favorites` table. Three new dashboard-aggregation endpoints and three favorites endpoints land, fully tested. OpenAPI updates reflect them.

### Task 4.1: Schema migration v4

**Files:**
- Create: `packages/core/src/db/migrations/004-favorites.sql`
- Modify: `packages/core/src/db/connection.ts`
- Test: `packages/core/test/db.connection.test.ts`

- [ ] **Step 1: Write failing test for v4 migration**

Add to `packages/core/test/db.connection.test.ts`:

```ts
it("applies migration 004 (favorites)", () => {
  const tmp = `/tmp/cc-mig-${Date.now()}.db`;
  const db = openDb(tmp);
  const v = db.query("SELECT version FROM schema_version").get() as { version: number };
  expect(v.version).toBe(4);
  // Table exists and is empty
  const cols = db.query("PRAGMA table_info(favorites)").all() as Array<{ name: string }>;
  expect(cols.map((c) => c.name).sort()).toEqual(["created_at", "project"]);
  db.close();
  require("fs").unlinkSync(tmp);
});
```

- [ ] **Step 2: Run test, expect failure**

```bash
bun test packages/core/test/db.connection.test.ts -t "favorites"
```

Expected: FAIL — `version` is still 3, no `favorites` table.

- [ ] **Step 3: Create the migration file**

`packages/core/src/db/migrations/004-favorites.sql`:

```sql
CREATE TABLE IF NOT EXISTS favorites (
  project TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);
```

- [ ] **Step 4: Bump CURRENT_VERSION**

In `packages/core/src/db/connection.ts`, change:

```ts
const CURRENT_VERSION = 4;
```

- [ ] **Step 5: Run test, expect pass**

```bash
bun test packages/core/test/db.connection.test.ts -t "favorites"
```

### Task 4.2: Favorites queries

**Files:**
- Modify: `packages/core/src/db/queries.ts` (add favorites helpers)
- Test: `packages/core/test/db.queries.test.ts`

- [ ] **Step 1: Write failing test**

```ts
describe("favorites", () => {
  it("listFavorites + setFavorite + unsetFavorite roundtrip", () => {
    const db = openInMemoryDb();
    expect(listFavorites(db)).toEqual([]);
    setFavorite(db, "proj-a");
    setFavorite(db, "proj-b");
    expect(listFavorites(db).sort()).toEqual(["proj-a", "proj-b"]);
    setFavorite(db, "proj-a"); // idempotent
    expect(listFavorites(db).sort()).toEqual(["proj-a", "proj-b"]);
    unsetFavorite(db, "proj-a");
    expect(listFavorites(db)).toEqual(["proj-b"]);
    unsetFavorite(db, "missing"); // idempotent
  });
});
```

- [ ] **Step 2: Implement queries**

Append to `packages/core/src/db/queries.ts`:

```ts
export function listFavorites(db: Database): string[] {
  return (db.query("SELECT project FROM favorites ORDER BY project").all() as Array<{ project: string }>)
    .map((r) => r.project);
}

export function setFavorite(db: Database, project: string): void {
  db.query("INSERT OR IGNORE INTO favorites (project, created_at) VALUES (?, ?)")
    .run(project, Date.now());
}

export function unsetFavorite(db: Database, project: string): void {
  db.query("DELETE FROM favorites WHERE project = ?").run(project);
}
```

- [ ] **Step 3: Run test, expect pass**

```bash
bun test packages/core/test/db.queries.test.ts -t "favorites"
```

### Task 4.3: Favorites endpoints

**Files:**
- Create: `packages/server/src/controllers/favorites.ts`
- Modify: `packages/server/src/index.ts`
- Test: `packages/server/test/favorites.routes.test.ts`

- [ ] **Step 1: Write the failing route test**

```ts
import { describe, it, expect } from "bun:test";
import { startTestServer } from "./helpers/server"; // helper to be added in Task 4.7

describe("/api/favorites", () => {
  it("PUT then GET returns the favorite", async () => {
    const { url, close } = await startTestServer();
    await fetch(`${url}/api/favorites/proj-a`, { method: "PUT" });
    const res = await fetch(`${url}/api/favorites`);
    expect(await res.json()).toEqual({ favorites: ["proj-a"] });
    await close();
  });
});
```

- [ ] **Step 2: Implement controller**

`packages/server/src/controllers/favorites.ts`:

```ts
import type { Database } from "bun:sqlite";
import { listFavorites, setFavorite, unsetFavorite } from "@claude-cron/core";

export function favoritesController(db: Database) {
  return {
    list: () => ({ favorites: listFavorites(db) }),
    set: (project: string) => { setFavorite(db, project); return { ok: true as const }; },
    unset: (project: string) => { unsetFavorite(db, project); return { ok: true as const }; },
  };
}
```

- [ ] **Step 3: Define routes**

Add to a new `packages/server/src/routes/favorites.ts`:

```ts
import { z } from "zod";
import { defineRoute } from "../contract";

export function favoritesRoutes(c: ReturnType<typeof favoritesController>) {
  return [
    defineRoute({
      path: "/api/favorites",
      method: "GET",
      input: z.object({}),
      output: z.object({ favorites: z.array(z.string()) }),
      handler: () => c.list(),
    }),
    defineRoute({
      path: "/api/favorites/:project",
      method: "PUT",
      input: z.object({ project: z.string().min(1) }),
      output: z.object({ ok: z.literal(true) }),
      handler: (i) => c.set(i.project),
    }),
    defineRoute({
      path: "/api/favorites/:project",
      method: "DELETE",
      input: z.object({ project: z.string().min(1) }),
      output: z.object({ ok: z.literal(true) }),
      handler: (i) => c.unset(i.project),
    }),
  ];
}
```

- [ ] **Step 4: Register in `index.ts`**

```ts
const favorites = favoritesController(opts.db);
for (const r of favoritesRoutes(favorites)) registry.add(r);
```

### Task 4.4: Dashboard aggregation queries

**Files:**
- Modify: `packages/core/src/db/queries.ts`
- Test: `packages/core/test/db.queries.test.ts`

We need three aggregation helpers:
1. `getCountsSince(db, since)` → `{ success, failure, timeout, interrupted, abandoned, skipped_preflight, skipped_overlap, config_error }`.
2. `getRunningRuns(db)` → array of `RunDTO` for runs with `status = 'running'`.
3. `getTopProjectsByActivity(db, since, limit)` and `getTopJobsByActivity(db, since, limit)` — ordered by `success+failure` count, both skips excluded.

- [ ] **Step 1: Write failing tests**

```ts
describe("dashboard aggregations", () => {
  const since = Date.now() - 24 * 3600 * 1000;

  it("getCountsSince groups runs by status", () => {
    const db = seedRuns([
      { status: "success", started_at: since + 1000 },
      { status: "success", started_at: since + 2000 },
      { status: "failure", started_at: since + 3000 },
      { status: "skipped_preflight", started_at: since + 4000 },
      { status: "success", started_at: since - 60_000 }, // outside window
    ]);
    const c = getCountsSince(db, since);
    expect(c.success).toBe(2);
    expect(c.failure).toBe(1);
    expect(c.skipped_preflight).toBe(1);
  });

  it("getTopProjectsByActivity excludes both skips", () => {
    const db = seedRuns([
      { project: "p1", status: "success", started_at: since + 1000 },
      { project: "p1", status: "success", started_at: since + 2000 },
      { project: "p2", status: "success", started_at: since + 3000 },
      { project: "p2", status: "failure", started_at: since + 4000 },
      { project: "p2", status: "skipped_preflight", started_at: since + 5000 },
      { project: "p2", status: "skipped_overlap",   started_at: since + 6000 },
    ]);
    const top = getTopProjectsByActivity(db, since, 8);
    expect(top.map((t) => t.project)).toEqual(["p2", "p1"]); // both have 2; p2 first by recency
  });
});
```

(Adjust `seedRuns` helper or use an existing one in the test suite.)

- [ ] **Step 2: Implement the queries**

```ts
const ALL_STATUSES = ["success","failure","timeout","interrupted","abandoned","skipped_preflight","skipped_overlap","config_error"] as const;

export function getCountsSince(db: Database, since: number): Record<typeof ALL_STATUSES[number], number> {
  const rows = db.query(
    "SELECT status, COUNT(*) AS n FROM runs WHERE started_at >= ? GROUP BY status"
  ).all(since) as Array<{ status: string; n: number }>;
  const out = Object.fromEntries(ALL_STATUSES.map((s) => [s, 0])) as Record<typeof ALL_STATUSES[number], number>;
  for (const r of rows) if (r.status in out) (out as Record<string, number>)[r.status] = r.n;
  return out;
}

export function getRunningRuns(db: Database): RunDTO[] {
  return db.query(
    "SELECT * FROM runs WHERE status = 'running' ORDER BY started_at DESC"
  ).all() as RunDTO[];
}

export function getTopProjectsByActivity(db: Database, since: number, limit: number) {
  return db.query(
    `SELECT project,
            SUM(CASE WHEN status IN ('success','failure','timeout','interrupted','abandoned','config_error') THEN 1 ELSE 0 END) AS active_count,
            MAX(started_at) AS last_started
       FROM runs
      WHERE started_at >= ?
      GROUP BY project
     HAVING active_count > 0
      ORDER BY active_count DESC, last_started DESC
      LIMIT ?`
  ).all(since, limit) as Array<{ project: string; active_count: number; last_started: number }>;
}

export function getTopJobsByActivity(db: Database, since: number, limit: number) {
  return db.query(
    `SELECT project, job,
            SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success_count,
            SUM(CASE WHEN status = 'failure' THEN 1 ELSE 0 END) AS failure_count,
            SUM(CASE WHEN status IN ('skipped_preflight','skipped_overlap') THEN 1 ELSE 0 END) AS skipped_count,
            MAX(started_at) AS last_started
       FROM runs
      WHERE started_at >= ?
      GROUP BY project, job
     HAVING (success_count + failure_count) > 0
      ORDER BY (success_count + failure_count) DESC, last_started DESC
      LIMIT ?`
  ).all(since, limit) as Array<{ project: string; job: string; success_count: number; failure_count: number; skipped_count: number; last_started: number }>;
}
```

- [ ] **Step 3: Run tests, expect pass**

```bash
bun test packages/core/test/db.queries.test.ts -t "dashboard"
```

### Task 4.5: Dashboard endpoint

**Files:**
- Create: `packages/server/src/controllers/dashboard.ts`
- Create: `packages/server/src/routes/dashboard.ts`
- Modify: `packages/server/src/index.ts`
- Test: `packages/server/test/dashboard.routes.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
describe("/api/dashboard", () => {
  it("returns counts, running, top_projects, top_jobs", async () => {
    const { url, db, close } = await startTestServer();
    seedRuns(db, /* fixture: 3 success, 1 failure, 2 skipped, across 2 projects/jobs */);
    const res = await fetch(`${url}/api/dashboard?since=24h`);
    const body = await res.json();
    expect(body.counts.success).toBe(3);
    expect(body.counts.failure).toBe(1);
    expect(body.top_projects).toHaveLength(2);
    expect(body.top_jobs.length).toBeLessThanOrEqual(8);
    await close();
  });
});
```

- [ ] **Step 2: Implement controller**

```ts
import type { Database } from "bun:sqlite";
import { getCountsSince, getRunningRuns, getTopProjectsByActivity, getTopJobsByActivity } from "@claude-cron/core";

const SINCE_TO_MS: Record<"24h" | "7d" | "30d", number> = {
  "24h": 24 * 3600 * 1000,
  "7d":  7 * 24 * 3600 * 1000,
  "30d": 30 * 24 * 3600 * 1000,
};

export function dashboardController(db: Database) {
  return {
    global: (since: keyof typeof SINCE_TO_MS) => {
      const sinceMs = Date.now() - SINCE_TO_MS[since];
      return {
        counts: getCountsSince(db, sinceMs),
        running: getRunningRuns(db),
        top_projects: getTopProjectsByActivity(db, sinceMs, 8),
        top_jobs:     getTopJobsByActivity(db, sinceMs, 8),
      };
    },
    project: (project: string, since: keyof typeof SINCE_TO_MS) => {
      const sinceMs = Date.now() - SINCE_TO_MS[since];
      return {
        counts: getCountsSince(db, sinceMs), // TODO: scope to project
        running: getRunningRuns(db).filter((r) => r.project === project),
        top_jobs: getTopJobsByActivity(db, sinceMs, 8).filter((j) => j.project === project),
      };
    },
  };
}
```

(Note: `counts` should be project-scoped in the project variant. Add a `project` parameter to `getCountsSince` or write a sibling `getCountsForProjectSince` — pick whichever is cleaner.)

- [ ] **Step 3: Define routes**

```ts
import { z } from "zod";
import { defineRoute } from "../contract";

const Since = z.enum(["24h", "7d", "30d"]).default("24h");

const Counts = z.object({
  success: z.number().int(), failure: z.number().int(), timeout: z.number().int(),
  interrupted: z.number().int(), abandoned: z.number().int(),
  skipped_preflight: z.number().int(), skipped_overlap: z.number().int(),
  config_error: z.number().int(),
});

const ProjectActivity = z.object({
  project: z.string(),
  active_count: z.number().int(),
  last_started: z.number(),
});

const JobActivity = z.object({
  project: z.string(),
  job: z.string(),
  success_count: z.number().int(),
  failure_count: z.number().int(),
  skipped_count: z.number().int(),
  last_started: z.number(),
});

export function dashboardRoutes(c: ReturnType<typeof dashboardController>) {
  return [
    defineRoute({
      path: "/api/dashboard",
      method: "GET",
      input: z.object({ since: Since }),
      output: z.object({
        counts: Counts,
        running: z.array(RunDTO),
        top_projects: z.array(ProjectActivity).max(8),
        top_jobs: z.array(JobActivity).max(8),
      }),
      handler: (i) => c.global(i.since),
    }),
    defineRoute({
      path: "/api/projects/:project/dashboard",
      method: "GET",
      input: z.object({ project: z.string(), since: Since }),
      output: z.object({
        counts: Counts,
        running: z.array(RunDTO),
        top_jobs: z.array(JobActivity).max(8),
      }),
      handler: (i) => c.project(i.project, i.since),
    }),
  ];
}
```

- [ ] **Step 4: Register and run tests**

```bash
bun test packages/server/test/dashboard.routes.test.ts
```

### Task 4.6: Job stats endpoint

**Files:**
- Modify: `packages/core/src/db/queries.ts`
- Modify: `packages/server/src/controllers/dashboard.ts`
- Modify: `packages/server/src/routes/dashboard.ts`

- [ ] **Step 1: Add `getJobStatsSince(db, project, job, since)`**

Returns `{ counts, last_run, total_input_tokens, total_output_tokens, total_cost_usd }`.

```ts
export function getJobStatsSince(db: Database, project: string, job: string, since: number) {
  const counts = db.query(
    "SELECT status, COUNT(*) n FROM runs WHERE project = ? AND job = ? AND started_at >= ? GROUP BY status"
  ).all(project, job, since) as Array<{ status: string; n: number }>;

  const tokens = db.query(
    `SELECT COALESCE(SUM(input_tokens),0) AS i, COALESCE(SUM(output_tokens),0) AS o,
            COALESCE(SUM(cost_usd),0) AS c
       FROM runs WHERE project = ? AND job = ? AND started_at >= ?`
  ).get(project, job, since) as { i: number; o: number; c: number };

  const last = db.query(
    "SELECT * FROM runs WHERE project = ? AND job = ? ORDER BY started_at DESC LIMIT 1"
  ).get(project, job) as RunDTO | null;

  return { counts, totals: tokens, last_run: last };
}
```

- [ ] **Step 2: Define `/api/projects/:project/jobs/:job/stats`**

```ts
defineRoute({
  path: "/api/projects/:project/jobs/:job/stats",
  method: "GET",
  input: z.object({ project: z.string(), job: z.string(), since: Since }),
  output: z.object({
    counts: z.array(z.object({ status: RunStatus, n: z.number().int() })),
    totals: z.object({ i: z.number().int(), o: z.number().int(), c: z.number() }),
    last_run: RunDTO.nullable(),
  }),
  handler: (i) => /* delegate to controller */,
});
```

- [ ] **Step 3: Test + register**

### Task 4.7: Add a `startTestServer` helper

**Files:**
- Create: `packages/server/test/helpers/server.ts`

The Phase 4 tests reference `startTestServer`. Implement once and reuse.

- [ ] **Step 1: Write the helper**

```ts
import { Database } from "bun:sqlite";
import { openDb } from "@claude-cron/core";
import { startServer } from "../../src";

export async function startTestServer(): Promise<{ url: string; db: Database; close: () => Promise<void> }> {
  const tmp = `/tmp/cc-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`;
  const db = openDb(tmp);
  const registryPath = `/tmp/cc-registry-${Date.now()}.toml`;
  await Bun.write(registryPath, "");
  const { server, shutdown } = startServer({ db, registryPath, port: 0, host: "127.0.0.1" });
  const url = `http://127.0.0.1:${server.port}`;
  return {
    url,
    db,
    close: async () => {
      shutdown();
      await Bun.file(tmp).delete().catch(() => {});
      await Bun.file(registryPath).delete().catch(() => {});
    },
  };
}
```

### Task 4.8: Verify Phase 4 green

- [ ] **Step 1: Tests + typecheck**

```bash
bun test
bun run typecheck
```

- [ ] **Step 2: Smoke**

```bash
claude-cron serve &
SERVE_PID=$!
sleep 1
curl -s "http://127.0.0.1:8787/api/dashboard?since=24h" | head -c 200
curl -s "http://127.0.0.1:8787/api/favorites" | head
kill $SERVE_PID
```

- [ ] **Step 3: Commit Phase 4**

```bash
git add -A
git commit -m "feat(server): dashboard aggregations + favorites + schema v4

Adds GET /api/dashboard, GET /api/projects/:project/dashboard,
GET /api/projects/:project/jobs/:job/stats, and favorites CRUD.
Schema v4 introduces a favorites table. Both skip statuses are
excluded from activity ranking. New queries fully tested."
```

---

## Phase 5: Scaffold `@claude-cron/web`

**Outcome:** SvelteKit + M3E project under `packages/web/` with empty pages, AppShell with sidebar nav, theme/scheme stores, the lifted Settings page, and a typed `apiClient` import working.

### Task 5.1: Initialize SvelteKit

**Files:**
- Create: `packages/web/package.json`
- Create: `packages/web/svelte.config.js`
- Create: `packages/web/vite.config.ts`
- Create: `packages/web/tsconfig.json`
- Create: `packages/web/src/app.html`, `app.d.ts`

- [ ] **Step 1: Use the template repo as the source for these files**

The fastest path is to copy the relevant scaffolding from `bun-svelte-m3e-template`. Clone it locally to a sibling directory:

```bash
git clone git@github.com:garretpremo/bun-svelte-m3e-template.git /tmp/m3e-template
```

Copy the web package skeleton:

```bash
cp -r /tmp/m3e-template/packages/web/{svelte.config.js,vite.config.ts,tsconfig.json} packages/web/
cp -r /tmp/m3e-template/packages/web/src/{app.html,app.d.ts,app.css} packages/web/src/
```

Adjust the package name in the copied files from `@app/web` to `@claude-cron/web`.

- [ ] **Step 2: Write `packages/web/package.json`**

```json
{
  "name": "@claude-cron/web",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "preview": "vite preview",
    "typecheck": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json"
  },
  "dependencies": {
    "@claude-cron/server": "workspace:*",
    "@material/web": "^2.0.0"
  },
  "devDependencies": {
    "@sveltejs/adapter-static": "^3.0.0",
    "@sveltejs/kit": "^2.5.0",
    "@sveltejs/vite-plugin-svelte": "^4.0.0",
    "svelte": "^5.0.0",
    "svelte-check": "^4.0.0",
    "typescript": "^5.5.0",
    "vite": "^5.4.0",
    "@vite-pwa/sveltekit": "^0.6.0"
  }
}
```

- [ ] **Step 3: Configure SvelteKit for static output**

In `svelte.config.js`, ensure `adapter-static` is configured:

```js
import adapter from "@sveltejs/adapter-static";

export default {
  kit: {
    adapter: adapter({ pages: "dist", assets: "dist", fallback: "index.html" }),
  },
};
```

- [ ] **Step 4: Configure dev proxy in `vite.config.ts`**

```ts
import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
        ws: false,
        // SSE works through the proxy without special config in vite 5+
      },
    },
  },
});
```

- [ ] **Step 5: Install and verify**

```bash
bun install
bun run --filter @claude-cron/web dev &
DEV_PID=$!
sleep 5
curl -s http://127.0.0.1:5173 | head -3
kill $DEV_PID
```

Expected: HTML response from vite dev server.

### Task 5.2: AppShell + sidebar + topbar

**Files:**
- Create: `packages/web/src/lib/components/AppShell.svelte`
- Create: `packages/web/src/lib/components/Sidebar.svelte`
- Create: `packages/web/src/lib/components/Topbar.svelte`
- Modify: `packages/web/src/routes/+layout.svelte`

- [ ] **Step 1: Copy AppShell pattern from template**

The template has an AppShell pattern; lift its file and rename brand text from "App" to "claude-cron". Reference `/tmp/m3e-template/packages/web/src/lib/components/AppShell.svelte`.

- [ ] **Step 2: Wire sidebar nav items**

Three top-level nav items: Dashboard (`/`), Activity (`/activity`), Settings (`/settings`).

```svelte
<script lang="ts">
  import { page } from "$app/stores";
  const items = [
    { label: "Dashboard", href: "/", icon: "dashboard" },
    { label: "Activity",  href: "/activity", icon: "history" },
    { label: "Settings",  href: "/settings", icon: "settings" },
  ];
</script>

<nav>
  {#each items as item}
    <a href={item.href} class:active={$page.url.pathname === item.href}>
      <md-icon>{item.icon}</md-icon> {item.label}
    </a>
  {/each}
</nav>
```

- [ ] **Step 3: Topbar with breadcrumb**

Show "claude-cron" wordmark on left. When at `/projects/:project` or deeper, show breadcrumb: `claude-cron / project / job`.

### Task 5.3: Theme + scheme stores and Settings page

**Files:**
- Create: `packages/web/src/lib/stores/theme.ts`
- Create: `packages/web/src/routes/settings/+page.svelte`

- [ ] **Step 1: Lift the settings page from the template**

```bash
cp /tmp/m3e-template/packages/web/src/routes/settings/+page.svelte packages/web/src/routes/settings/+page.svelte
cp /tmp/m3e-template/packages/web/src/lib/stores/theme.ts packages/web/src/lib/stores/theme.ts
```

- [ ] **Step 2: Set defaults to Dark + Indigo**

In `theme.ts`, change the default initial values:

```ts
const DEFAULT_THEME = "indigo";
const DEFAULT_SCHEME: "light" | "dark" = "dark";
```

- [ ] **Step 3: Verify settings page renders**

```bash
bun run --filter @claude-cron/web dev &
sleep 5
curl -s http://127.0.0.1:5173/settings | grep -o "Theme" | head -1
kill %1
```

Expected: page renders the Theme section.

### Task 5.4: Empty page stubs

**Files:**
- Create: `packages/web/src/routes/+page.svelte` (Dashboard)
- Create: `packages/web/src/routes/activity/+page.svelte`
- Create: `packages/web/src/routes/projects/[project]/+page.svelte`
- Create: `packages/web/src/routes/projects/[project]/jobs/[job]/+page.svelte`

- [ ] **Step 1: Create placeholder content for each page**

Each file:

```svelte
<script lang="ts">
  import { page } from "$app/stores";
</script>

<h1>Dashboard (placeholder)</h1>
<pre>{JSON.stringify($page.params, null, 2)}</pre>
```

(Adjust title per page.)

### Task 5.5: Wire typed apiClient

**Files:**
- Create: `packages/web/src/lib/api.ts`

- [ ] **Step 1: Build a thin typed wrapper around the contract**

```ts
import type { Registry } from "@claude-cron/server/contract";
// Until contract exports a real apiClient, hand-roll the calls and rely on
// the schemas exported from @claude-cron/server/contract for types.
import type { z } from "zod";
import * as schemas from "@claude-cron/server/contract/schemas";

export const api = {
  dashboard: {
    global: async (since: "24h" | "7d" | "30d" = "24h"): Promise<{
      counts: z.infer<typeof schemas.Counts>;
      running: z.infer<typeof schemas.RunDTO>[];
      top_projects: { project: string; active_count: number; last_started: number }[];
      top_jobs: { project: string; job: string; success_count: number; failure_count: number; skipped_count: number; last_started: number }[];
    }> => (await fetch(`/api/dashboard?since=${since}`)).json(),
    project: async (project: string, since = "24h") =>
      (await fetch(`/api/projects/${project}/dashboard?since=${since}`)).json(),
    jobStats: async (project: string, job: string, since = "24h") =>
      (await fetch(`/api/projects/${project}/jobs/${job}/stats?since=${since}`)).json(),
  },
  favorites: {
    list: async (): Promise<{ favorites: string[] }> => (await fetch("/api/favorites")).json(),
    set: (project: string) => fetch(`/api/favorites/${project}`, { method: "PUT" }),
    unset: (project: string) => fetch(`/api/favorites/${project}`, { method: "DELETE" }),
  },
  runs: {
    list: async (params: Record<string, string> = {}) => {
      const q = new URLSearchParams(params).toString();
      return (await fetch(`/api/runs?${q}`)).json();
    },
    get: async (id: number) => (await fetch(`/api/runs/${id}`)).json(),
    streamUrl: (id: number) => `/api/runs/${id}/stream`,
    stop: (id: number) => fetch(`/api/runs/${id}/stop`, { method: "POST" }),
  },
  projects: {
    list: async () => (await fetch("/api/projects")).json(),
    get: async (project: string) => (await fetch(`/api/projects/${project}`)).json(),
    listJobs: async (project: string) => (await fetch(`/api/projects/${project}/jobs`)).json(),
    getJob: async (project: string, job: string) =>
      (await fetch(`/api/projects/${project}/jobs/${job}`)).json(),
    enableJob: (project: string, job: string) =>
      fetch(`/api/projects/${project}/jobs/${job}/enable`, { method: "POST" }),
    disableJob: (project: string, job: string) =>
      fetch(`/api/projects/${project}/jobs/${job}/disable`, { method: "POST" }),
    runJob: (project: string, job: string) =>
      fetch(`/api/projects/${project}/jobs/${job}/run`, { method: "POST" }),
  },
};
```

(In a follow-up the contract layer can export a generated client; this hand-rolled wrapper is typed against the same zod schemas.)

### Task 5.6: Verify Phase 5 green

- [ ] **Step 1: Build the web package**

```bash
bun run --filter @claude-cron/web build
ls packages/web/dist/
```

Expected: `index.html`, `_app/`, etc.

- [ ] **Step 2: Tests + typecheck**

```bash
bun test
bun run typecheck
```

- [ ] **Step 3: Commit Phase 5**

```bash
git add -A
git commit -m "feat(web): scaffold SvelteKit + M3E web package

Lifts AppShell, theme stores, and settings page from
bun-svelte-m3e-template. Empty page stubs for Dashboard, Activity,
Project, and Job views. Sidebar nav, dark + indigo defaults, typed
apiClient against @claude-cron/server contract schemas."
```

---

## Phase 6: Build the pages

**Outcome:** All pages and reusable components implemented and wired to the API. Live SSE updates working. Favorites and filters persist.

Each task here ends with a green test/typecheck. Subagents should verify dev-mode rendering at each step (vite dev + bun.serve concurrent).

### Task 6.1: Reusable components — `StatCardsRow`

**Files:**
- Create: `packages/web/src/lib/components/StatCardsRow.svelte`

- [ ] **Step 1: Implement**

```svelte
<script lang="ts">
  export let cards: Array<{ label: string; value: string | number; color?: string; delta?: string }>;
</script>

<div class="row">
  {#each cards as card}
    <md-elevated-card class="stat-card">
      <div class="value" style:color={card.color ?? "var(--md-sys-color-primary)"}>{card.value}</div>
      <div class="label">{card.label}</div>
      {#if card.delta}<div class="delta">{card.delta}</div>{/if}
    </md-elevated-card>
  {/each}
</div>

<style>
  .row { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 1rem; }
  .stat-card { padding: 1rem; }
  .value { font-size: 2.5rem; font-weight: 600; line-height: 1; }
  .label { font-size: 0.875rem; opacity: 0.75; margin-top: 0.5rem; }
  .delta { font-size: 0.75rem; margin-top: 0.25rem; opacity: 0.6; }
</style>
```

### Task 6.2: Reusable components — `RunningJobsRow` + `RunningJobCard`

**Files:**
- Create: `packages/web/src/lib/components/RunningJobsRow.svelte`
- Create: `packages/web/src/lib/components/RunningJobCard.svelte`
- Create: `packages/web/src/lib/stores/run-stream.ts`

- [ ] **Step 1: Implement the per-run SSE store**

```ts
// packages/web/src/lib/stores/run-stream.ts
import { writable } from "svelte/store";

export interface RunEvent { type: string; payload: unknown; ts: number; }

export function runStream(runId: number) {
  const events = writable<RunEvent[]>([]);
  const es = new EventSource(`/api/runs/${runId}/stream`);
  es.onmessage = (msg) => {
    const ev = JSON.parse(msg.data) as RunEvent;
    events.update((cur) => [...cur, ev].slice(-3)); // FIFO phaseout: keep last 3
  };
  es.onerror = () => es.close(); // run ended or network gone
  return { events, close: () => es.close() };
}
```

- [ ] **Step 2: Implement `RunningJobCard`**

```svelte
<script lang="ts">
  import { onDestroy } from "svelte";
  import { runStream } from "$lib/stores/run-stream";
  import { goto } from "$app/navigation";

  export let runId: number;
  export let project: string;
  export let job: string;
  export let startedAt: number;

  const { events, close } = runStream(runId);
  onDestroy(close);

  function open() {
    goto(`/projects/${project}/jobs/${job}?run=${runId}`);
  }
</script>

<md-outlined-card class="card" on:click={open} role="button" tabindex="0">
  <header>
    <div class="title">{project} / {job}</div>
    <div class="status-pulse" />
  </header>
  <div class="started">started {timeAgo(startedAt)}</div>
  <ul class="events">
    {#each $events as ev}
      <li>{summarize(ev)}</li>
    {/each}
  </ul>
</md-outlined-card>

<script lang="ts" module>
  function timeAgo(ts: number): string {
    const sec = Math.floor((Date.now() - ts) / 1000);
    if (sec < 60) return `${sec}s ago`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
    return `${Math.floor(sec / 3600)}h ago`;
  }

  function summarize(ev: { type: string; payload: unknown }): string {
    if (ev.type === "tool_use") return `→ ${(ev.payload as { name?: string }).name ?? "tool"}`;
    if (ev.type === "assistant") return "assistant text";
    return ev.type;
  }
</script>

<style>
  .card { padding: 1rem; min-width: 280px; cursor: pointer; }
  .title { font-weight: 600; }
  .status-pulse {
    width: 10px; height: 10px; border-radius: 50%;
    background: var(--md-sys-color-primary);
    animation: pulse 1.5s ease-in-out infinite;
  }
  @keyframes pulse { 0%,100%{opacity:0.3} 50%{opacity:1} }
  .events { font-size: 0.75rem; font-family: monospace; opacity: 0.85; }
</style>
```

- [ ] **Step 3: Implement `RunningJobsRow`**

```svelte
<script lang="ts">
  import RunningJobCard from "./RunningJobCard.svelte";
  export let running: Array<{ id: number; project: string; job: string; started_at: number }>;
</script>

{#if running.length > 0}
  <section class="running-row">
    <h2>Running now</h2>
    <div class="scroll-track">
      {#each running as run (run.id)}
        <RunningJobCard runId={run.id} project={run.project} job={run.job} startedAt={run.started_at} />
      {/each}
    </div>
  </section>
{/if}

<style>
  .running-row { margin: 1.5rem 0; }
  .scroll-track {
    display: flex; gap: 1rem; overflow-x: auto; padding-bottom: 0.5rem;
  }
</style>
```

### Task 6.3: Reusable components — `ProjectPanel` + `JobPanel`

**Files:**
- Create: `packages/web/src/lib/components/ProjectPanel.svelte`
- Create: `packages/web/src/lib/components/JobPanel.svelte`

- [ ] **Step 1: Implement `ProjectPanel`**

```svelte
<script lang="ts">
  import { goto } from "$app/navigation";
  import { api } from "$lib/api";
  export let project: string;
  export let activeCount: number;
  export let isFavorite: boolean;
  export let onFavoriteChange: (project: string, next: boolean) => void;

  async function toggleFavorite(e: Event) {
    e.stopPropagation();
    const next = !isFavorite;
    onFavoriteChange(project, next); // optimistic
    if (next) await api.favorites.set(project);
    else      await api.favorites.unset(project);
  }
</script>

<md-elevated-card class="panel" on:click={() => goto(`/projects/${project}`)} role="button" tabindex="0">
  <header>
    <h3>{project}</h3>
    <md-icon-button class="star" on:click={toggleFavorite} aria-label="favorite">
      <md-icon>{isFavorite ? "star" : "star_border"}</md-icon>
    </md-icon-button>
  </header>
  <div class="activity">{activeCount} runs (24h)</div>
</md-elevated-card>

<style>
  .panel { padding: 1rem; cursor: pointer; }
  header { display: flex; justify-content: space-between; align-items: start; }
  .star { opacity: 0.6; }
  .star:hover { opacity: 1; }
</style>
```

- [ ] **Step 2: Implement `JobPanel`**

```svelte
<script lang="ts">
  import { goto } from "$app/navigation";
  export let project: string;
  export let job: string;
  export let success: number;
  export let failure: number;
  export let skipped: number;
</script>

<md-elevated-card class="panel" on:click={() => goto(`/projects/${project}/jobs/${job}`)} role="button" tabindex="0">
  <h3>{job}</h3>
  <div class="project">{project}</div>
  <div class="stats">
    <span class="success">{success}</span>
    <span class="skipped">{skipped}</span>
    <span class="failure">{failure}</span>
  </div>
</md-elevated-card>

<style>
  .panel { padding: 1rem; cursor: pointer; }
  .project { font-size: 0.75rem; opacity: 0.7; }
  .stats { display: flex; gap: 1rem; margin-top: 0.5rem; font-weight: 600; }
  .success { color: var(--md-sys-color-tertiary); }
  .skipped { opacity: 0.6; }
  .failure { color: var(--md-sys-color-error); }
</style>
```

### Task 6.4: Reusable components — `RunsTable`

**Files:**
- Create: `packages/web/src/lib/components/RunsTable.svelte`

- [ ] **Step 1: Implement**

```svelte
<script lang="ts">
  import { goto } from "$app/navigation";
  export let rows: Array<{ id: number; project: string; job: string; status: string; started_at: number; duration_ms: number | null; cost_usd: number | null; coalesced_count?: number }>;
  export let showProject = true;
  export let showJob = true;
  export let onRowClick: (id: number) => void = (id) => {
    const url = new URL(window.location.href);
    url.searchParams.set("run", String(id));
    goto(url.toString(), { replaceState: false });
  };
</script>

<table class="runs">
  <thead>
    <tr>
      <th>time</th>
      {#if showProject}<th>project</th>{/if}
      {#if showJob}<th>job</th>{/if}
      <th>status</th>
      <th>duration</th>
      <th>$</th>
    </tr>
  </thead>
  <tbody>
    {#each rows as r (r.id)}
      <tr on:click={() => onRowClick(r.id)} class={r.status}>
        <td>{new Date(r.started_at).toLocaleTimeString()}</td>
        {#if showProject}<td>{r.project}</td>{/if}
        {#if showJob}<td>{r.job}</td>{/if}
        <td>
          <md-chip>{r.status}</md-chip>
          {#if r.coalesced_count}<span class="x">×{r.coalesced_count}</span>{/if}
        </td>
        <td>{r.duration_ms != null ? r.duration_ms + "ms" : "—"}</td>
        <td>{r.cost_usd != null ? "$" + r.cost_usd.toFixed(4) : "—"}</td>
      </tr>
    {/each}
  </tbody>
</table>

<style>
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 0.5rem; }
  tbody tr:hover { background: var(--md-sys-color-surface-container); cursor: pointer; }
  tr.running td:first-child::before {
    content: ""; display: inline-block; width: 8px; height: 8px;
    background: var(--md-sys-color-primary); border-radius: 50%;
    margin-right: 0.5rem; animation: pulse 1.5s ease-in-out infinite;
  }
</style>
```

### Task 6.5: Reusable components — `RunPopover`

**Files:**
- Create: `packages/web/src/lib/components/RunPopover.svelte`

- [ ] **Step 1: Implement as M3E dialog**

```svelte
<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { api } from "$lib/api";
  import { runStream } from "$lib/stores/run-stream";
  export let runId: number;
  export let onClose: () => void;

  let detail: any = null;
  let live: ReturnType<typeof runStream> | null = null;

  onMount(async () => {
    detail = await api.runs.get(runId);
    if (detail?.status === "running") live = runStream(runId);
  });
  onDestroy(() => live?.close());
</script>

<md-dialog open on:close={onClose}>
  <header slot="headline">Run #{runId}</header>
  <div slot="content">
    {#if detail}
      <div>{detail.project} / {detail.job}</div>
      <div>status: <md-chip>{detail.status}</md-chip></div>
      <div>tokens: in {detail.input_tokens ?? "—"} / out {detail.output_tokens ?? "—"} (cache: {detail.cache_creation_tokens ?? 0} created, {detail.cache_read_tokens ?? 0} read)</div>
      <div>cost: {detail.cost_usd != null ? "$" + detail.cost_usd.toFixed(4) : "—"}</div>
      <pre class="events">
{#each (detail.events ?? []) as ev}
{ev.type}: {JSON.stringify(ev.payload).slice(0, 200)}
{/each}
{#if live}
  {#each $live.events as ev}
    LIVE {ev.type}: {JSON.stringify(ev.payload).slice(0, 200)}
  {/each}
{/if}
      </pre>
    {:else}
      Loading…
    {/if}
  </div>
  <md-text-button slot="actions" on:click={onClose}>Close</md-text-button>
</md-dialog>
```

### Task 6.6: Dashboard page

**Files:**
- Modify: `packages/web/src/routes/+page.svelte`

- [ ] **Step 1: Implement**

```svelte
<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { api } from "$lib/api";
  import StatCardsRow from "$lib/components/StatCardsRow.svelte";
  import RunningJobsRow from "$lib/components/RunningJobsRow.svelte";
  import ProjectPanel from "$lib/components/ProjectPanel.svelte";
  import JobPanel from "$lib/components/JobPanel.svelte";

  let data: Awaited<ReturnType<typeof api.dashboard.global>> | null = null;
  let favorites = new Set<string>();
  let pollHandle: ReturnType<typeof setInterval> | null = null;

  async function refresh() {
    [data, { favorites }] = await Promise.all([
      api.dashboard.global("24h"),
      api.favorites.list().then((r) => ({ favorites: new Set(r.favorites) })),
    ]);
  }

  function startPolling() {
    if (pollHandle) return;
    pollHandle = setInterval(refresh, 10_000);
  }
  function stopPolling() {
    if (pollHandle) { clearInterval(pollHandle); pollHandle = null; }
  }
  function onVisibility() {
    if (document.hidden) stopPolling();
    else { refresh(); startPolling(); }
  }

  onMount(() => {
    refresh().then(startPolling);
    document.addEventListener("visibilitychange", onVisibility);
  });
  onDestroy(() => {
    stopPolling();
    document.removeEventListener("visibilitychange", onVisibility);
  });

  function onFavoriteChange(project: string, next: boolean) {
    if (next) favorites.add(project); else favorites.delete(project);
    favorites = new Set(favorites);
  }

  $: sortedProjects = data
    ? data.top_projects.slice().sort((a, b) => {
        const af = favorites.has(a.project), bf = favorites.has(b.project);
        if (af !== bf) return af ? -1 : 1;
        return b.active_count - a.active_count;
      })
    : [];
</script>

{#if data}
  <h1>Dashboard</h1>

  <StatCardsRow cards={[
    { label: "Successful", value: data.counts.success, color: "var(--md-sys-color-tertiary)" },
    { label: "Failed",     value: data.counts.failure, color: "var(--md-sys-color-error)" },
    { label: "Skipped",    value: data.counts.skipped_preflight + data.counts.skipped_overlap },
    { label: "Running",    value: data.running.length, color: "var(--md-sys-color-primary)" },
  ]} />

  <RunningJobsRow running={data.running} />

  <h2>Projects</h2>
  <div class="grid">
    {#each sortedProjects as p}
      <ProjectPanel project={p.project} activeCount={p.active_count}
                    isFavorite={favorites.has(p.project)}
                    {onFavoriteChange} />
    {/each}
  </div>

  <h2>Recent activity <a href="/activity" class="see-all">View all →</a></h2>
  <div class="grid">
    {#each data.top_jobs as j}
      <JobPanel project={j.project} job={j.job}
                success={j.success_count}
                failure={j.failure_count}
                skipped={j.skipped_count} />
    {/each}
  </div>
{:else}
  Loading…
{/if}

<style>
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem; }
  .see-all { font-size: 0.875rem; font-weight: 400; margin-left: 1rem; }
</style>
```

### Task 6.7: Activity page

**Files:**
- Modify: `packages/web/src/routes/activity/+page.svelte`

- [ ] **Step 1: Implement**

```svelte
<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import { api } from "$lib/api";
  import RunsTable from "$lib/components/RunsTable.svelte";
  import RunPopover from "$lib/components/RunPopover.svelte";
  import { page } from "$app/stores";

  type Filters = { project?: string; job?: string; status?: string };
  const KEY = "claude-cron:filters:activity";

  let rows: any[] = [];
  let projects: string[] = [];
  let filters: Filters = browser ? JSON.parse(localStorage.getItem(KEY) ?? "{}") : {};

  async function refresh() {
    rows = await api.runs.list({ ...filters, limit: "200" });
  }

  $: if (browser) localStorage.setItem(KEY, JSON.stringify(filters));
  $: filters && refresh();

  onMount(async () => {
    projects = (await api.projects.list()).map((p: any) => p.name);
    refresh();
  });

  $: openRunId = $page.url.searchParams.get("run");

  function closePopover() {
    const url = new URL(window.location.href);
    url.searchParams.delete("run");
    history.replaceState(null, "", url.toString());
    openRunId = null;
  }
</script>

<h1>Activity</h1>

<div class="filters">
  <select bind:value={filters.project}>
    <option value={undefined}>all projects</option>
    {#each projects as p}<option value={p}>{p}</option>{/each}
  </select>
  <select bind:value={filters.status}>
    <option value={undefined}>all statuses</option>
    {#each ["success","failure","timeout","skipped_preflight","running"] as s}
      <option value={s}>{s}</option>
    {/each}
  </select>
  <md-text-button on:click={() => filters = {}}>Clear</md-text-button>
</div>

<RunsTable {rows} />

{#if openRunId}
  <RunPopover runId={Number(openRunId)} onClose={closePopover} />
{/if}
```

### Task 6.8: Project view

**Files:**
- Modify: `packages/web/src/routes/projects/[project]/+page.svelte`

- [ ] **Step 1: Implement**

```svelte
<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { page } from "$app/stores";
  import { api } from "$lib/api";
  import StatCardsRow from "$lib/components/StatCardsRow.svelte";
  import RunningJobsRow from "$lib/components/RunningJobsRow.svelte";
  import JobPanel from "$lib/components/JobPanel.svelte";

  $: project = $page.params.project;
  let data: any = null;
  let pollHandle: ReturnType<typeof setInterval> | null = null;

  async function refresh() { data = await api.dashboard.project(project, "24h"); }
  onMount(() => { refresh(); pollHandle = setInterval(refresh, 10_000); });
  onDestroy(() => pollHandle && clearInterval(pollHandle));
</script>

{#if data}
  <h1>{project}</h1>
  <StatCardsRow cards={[
    { label: "Successful", value: data.counts.success, color: "var(--md-sys-color-tertiary)" },
    { label: "Failed",     value: data.counts.failure, color: "var(--md-sys-color-error)" },
    { label: "Skipped",    value: data.counts.skipped_preflight + data.counts.skipped_overlap },
    { label: "Running",    value: data.running.length, color: "var(--md-sys-color-primary)" },
  ]} />

  <RunningJobsRow running={data.running} />

  <h2>Jobs</h2>
  <div class="grid">
    {#each data.top_jobs as j}
      <JobPanel project={j.project} job={j.job}
                success={j.success_count}
                failure={j.failure_count}
                skipped={j.skipped_count} />
    {/each}
  </div>
{/if}

<style>
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem; }
</style>
```

### Task 6.9: Job view

**Files:**
- Modify: `packages/web/src/routes/projects/[project]/jobs/[job]/+page.svelte`

- [ ] **Step 1: Implement**

```svelte
<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { browser } from "$app/environment";
  import { page } from "$app/stores";
  import { api } from "$lib/api";
  import StatCardsRow from "$lib/components/StatCardsRow.svelte";
  import RunsTable from "$lib/components/RunsTable.svelte";
  import RunPopover from "$lib/components/RunPopover.svelte";

  $: project = $page.params.project;
  $: job     = $page.params.job;
  $: filterKey = `claude-cron:filters:job:${project}:${job}`;

  let stats: any = null;
  let rows: any[] = [];
  let filters: { status?: string } = browser ? JSON.parse(localStorage.getItem(filterKey) ?? "{}") : {};

  async function refresh() {
    [stats, rows] = await Promise.all([
      api.dashboard.jobStats(project, job, "24h"),
      api.runs.list({ project, job, ...filters, limit: "200" }),
    ]);
    // Pin running runs to top
    rows.sort((a, b) => (a.status === "running" ? -1 : 0) - (b.status === "running" ? -1 : 0));
  }

  $: if (browser) localStorage.setItem(filterKey, JSON.stringify(filters));
  $: filters && refresh();

  let pollHandle: ReturnType<typeof setInterval> | null = null;
  onMount(() => { refresh(); pollHandle = setInterval(refresh, 10_000); });
  onDestroy(() => pollHandle && clearInterval(pollHandle));

  $: openRunId = $page.url.searchParams.get("run");
  function closePopover() {
    const url = new URL(window.location.href);
    url.searchParams.delete("run");
    history.replaceState(null, "", url.toString());
    openRunId = null;
  }

  async function runNow() {
    await api.projects.runJob(project, job);
    await refresh();
  }
</script>

{#if stats}
  <header class="job-header">
    <h1>{project} / {job}</h1>
    <div class="actions">
      <md-filled-button on:click={runNow}>Run now</md-filled-button>
      <md-text-button on:click={() => /* toggle enable */ null}>Disable</md-text-button>
      <md-text-button on:click={() => /* open YAML drawer */ null}>View YAML</md-text-button>
    </div>
  </header>

  <StatCardsRow cards={[
    { label: "Successful", value: stats.totals.success ?? 0, color: "var(--md-sys-color-tertiary)" },
    { label: "Failed", value: stats.totals.failure ?? 0, color: "var(--md-sys-color-error)" },
    { label: "Tokens (in)", value: stats.totals.i },
    { label: "Cost", value: "$" + (stats.totals.c).toFixed(4) },
  ]} />

  <RunsTable {rows} showProject={false} showJob={false} />

  {#if openRunId}
    <RunPopover runId={Number(openRunId)} onClose={closePopover} />
  {/if}
{/if}
```

(Enable/disable and YAML drawer are deferred polish — leave the buttons stubbed; the migration's primary goal is the IA, not Phase-2 feature parity for those specific buttons. Track as a follow-up issue if not implemented before merge.)

### Task 6.10: Verify Phase 6 green

- [ ] **Step 1: Run dev concurrently and click through**

```bash
bun run dev
```

In the browser at `http://localhost:5173`:
- Dashboard loads, shows stat cards, project + job panels.
- Drill into a project → project view.
- Drill into a job → job view, runs table populated.
- Click a row → popover opens with `?run=<id>` in URL.
- Reload with `?run=<id>` → popover opens.
- Toggle a project favorite → reload, favorite persists.

- [ ] **Step 2: Tests + typecheck**

```bash
bun test
bun run typecheck
bun run --filter @claude-cron/web build
```

- [ ] **Step 3: Commit Phase 6**

```bash
git add -A
git commit -m "feat(web): implement Dashboard, Activity, Project, Job pages

Reusable StatCardsRow, RunningJobsRow, ProjectPanel, JobPanel,
RunsTable, RunPopover. Per-run SSE store with FIFO event phaseout
on running cards. Favorites server-side with optimistic UI. Filter
state persists per-page via localStorage. 10s polling pauses while
tab is hidden. Run popover deep-linkable via ?run=<id>."
```

---

## Phase 7: Cutover

**Outcome:** Old `src/server/public/` deleted. Bun.serve serves the new web build. Manual smokes pass. Playwright e2e green. Master ready to merge.

### Task 7.1: Wire static-serving to `packages/web/dist`

**Files:**
- Modify: `packages/server/src/controllers/static.ts`
- Modify: `packages/server/src/index.ts`

- [ ] **Step 1: Update the static controller path**

```diff
- const STATIC_DIR = join(import.meta.dir, "..", "public");
+ const STATIC_DIR = join(import.meta.dir, "..", "..", "..", "web", "dist");
```

(Adjust the relative climb to land at `packages/web/dist/`.)

- [ ] **Step 2: Add SPA fallback**

For any non-`/api/*`, non-`/openapi.json`, non-`/docs` path that doesn't match a static asset, serve `index.html` so SvelteKit's client-side router can take over.

```ts
fetch(req) {
  const url = new URL(req.url);
  if (url.pathname.startsWith("/api/") || url.pathname === "/openapi.json" || url.pathname === "/docs") {
    return new Response("Not found", { status: 404 });
  }
  // SPA fallback
  return statik.fallback();
}
```

Where `statik.fallback()` reads `dist/index.html`.

### Task 7.2: Delete old public assets

**Files:** `packages/server/src/public/` (the legacy SPA).

- [ ] **Step 1: Delete**

```bash
git rm -r packages/server/src/public/
```

### Task 7.3: Update install:global

**Files:** Root `package.json` (already updated in Phase 1 to delegate). Verify it now triggers a build.

- [ ] **Step 1: Test install:global from a fresh state**

```bash
rm -rf packages/web/dist
bun run install:global
```

Expected: `bun run build` runs first, produces `packages/web/dist/`, then symlinks the CLI.

- [ ] **Step 2: Verify the running dashboard serves the new UI**

```bash
claude-cron serve &
sleep 1
curl -s http://127.0.0.1:8787/ | grep -o "claude-cron" | head -1
kill %1
```

Expected: response contains the wordmark from the SvelteKit-built index.html.

### Task 7.4: Playwright e2e

**Files:**
- Create: `packages/web/playwright.config.ts`
- Create: `packages/web/e2e/dashboard.spec.ts`
- Create: `packages/web/e2e/run-popover.spec.ts`
- Create: `packages/web/e2e/favorites.spec.ts`
- Create: `packages/web/e2e/theme.spec.ts`
- Create: `packages/web/e2e/sse.spec.ts`
- Create: `packages/web/e2e/fixtures.ts` (DB seed helpers)

- [ ] **Step 1: Install Playwright**

```bash
bun add --dev --filter @claude-cron/web @playwright/test
bun x --filter @claude-cron/web playwright install --with-deps chromium
```

- [ ] **Step 2: Configure**

```ts
// packages/web/playwright.config.ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  webServer: [{
    command: "bun run --filter @claude-cron/server dev",
    url: "http://127.0.0.1:8787/api/status",
    reuseExistingServer: !process.env.CI,
  }, {
    command: "bun run --filter @claude-cron/web preview",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
  }],
  use: { baseURL: "http://127.0.0.1:4173" },
});
```

- [ ] **Step 3: Write the 5 specs**

Smoke set covering: dashboard renders, drill-down nav, run popover open via click + via `?run=<id>`, favorites persist after reload, theme/scheme toggle persists, SSE updates RunningJobCard. Use direct DB inserts in `fixtures.ts` (open a tmp DB, insert canned project/job/run/event rows, point the server at it via a config override).

Example `fixtures.ts`:

```ts
import { Database } from "bun:sqlite";
import { openDb } from "@claude-cron/core";

export function seedFixtures(dbPath: string) {
  const db = openDb(dbPath);
  // ... insert one project, one job, several runs of mixed status, one running run with events ...
  return db;
}
```

- [ ] **Step 4: Run e2e**

```bash
bun run --filter @claude-cron/web e2e
```

Expected: all 5 specs pass.

### Task 7.5: Update README and CLAUDE.md

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update README "Install" and "Project layout" sections**

Reflect the new workspace, the build step, and `packages/` directory.

```markdown
## Install

There is no npm/Homebrew package yet. Install from source:

```bash
git clone https://github.com/garretpremo/claude-cron ~/projects/claude-cron
cd ~/projects/claude-cron
bun install
bun run install:global   # builds the web bundle, then symlinks packages/core/src/cli.ts into ~/.bun/bin
claude-cron --help
```
```

Add a note explaining the build-step requirement.

Update "Project layout":

```markdown
## Project layout

- `docs/specs/`, `docs/plans/` — design docs.
- `packages/core/` — CLI + executor + db + cron + job loader. Framework-free.
- `packages/server/` — Bun.serve dashboard API + zod contract + OpenAPI/Scalar.
- `packages/web/` — SvelteKit + M3E PWA dashboard.
- `skills/` — Claude Code skills bundled with the project.
- `CLAUDE.md` — guidance for AI assistants working in this repo.
```

- [ ] **Step 2: Update CLAUDE.md**

Replace the "Architecture" section to reflect the 3-package layout, add a note about the new contract layer, and update the path to `src/db/schema.sql` → `packages/core/src/db/schema.sql`. Add notes about the `web/` package and where the dashboard's UI now lives.

### Task 7.6: Manual smoke per the README

- [ ] **Step 1: End-to-end smoke from the README**

Follow the existing README "Smoke test (manual)" flow with the new install. Expected: `register`, `list`, `sync --dry-run`, `test`, `logs` all work as before.

- [ ] **Step 2: Stop-running smoke**

Follow "Stop a running job from the dashboard" from the README, hitting the new dashboard. Expected: status transitions to `interrupted`.

- [ ] **Step 3: Theme persistence**

Open dashboard, change Settings → Theme to Sage. Reload. Theme persists.

### Task 7.7: Final commit and merge

- [ ] **Step 1: Final tests + typecheck + build**

```bash
bun test
bun run typecheck
bun run build
bun run --filter @claude-cron/web e2e
```

- [ ] **Step 2: Commit Phase 7**

```bash
git add -A
git commit -m "feat: cut over to SvelteKit + M3E dashboard

Bun.serve now serves the web bundle from packages/web/dist; legacy
src/server/public/ removed. install:global triggers a build first.
README and CLAUDE.md updated for the 3-package workspace layout.
Playwright e2e covers dashboard load, drill-down nav, run popover
deep-link, favorites persistence, theme persistence, and SSE
live-tail."
```

- [ ] **Step 3: Merge to main**

```bash
git checkout main
git merge --no-ff m3-migration
git push
```

(Or open a PR, depending on preferred workflow.)

---

## Self-review checklist

Coverage against the spec — every spec section should map to one or more tasks above:

- [x] Workspace structure (3-package) → Phase 1.
- [x] Build & install pipeline → Phase 1 + 7.
- [x] Routes / IA → Phase 6 (page implementations).
- [x] Configuration surface (job header actions) → Task 6.9 (stubbed) + follow-up note.
- [x] Activity exclusion rule → Task 4.4 (`getTopProjectsByActivity`, `getTopJobsByActivity`).
- [x] New endpoints → Phase 4.
- [x] Schema migration v4 → Task 4.1.
- [x] Contract layer → Phase 2 + 3.
- [x] Reusable components → Phase 6.
- [x] State management → Phase 6 (favorites in 6.3, filters in 6.7/6.9, theme in 5.3).
- [x] Live updates (per-run SSE × N) → Task 6.2.
- [x] Theming → Task 5.3.
- [x] Migration plan → Phase 1–7 mirror the spec's stages.
- [x] Testing → Per-phase + Task 7.4 Playwright suite.

Known follow-ups / out of scope for this plan:

- Job-view enable/disable toggle and "View YAML" drawer are stubbed in Task 6.9. They were Phase 2 features, not part of the new UX deliverable, but should be tracked as polish before the alpha graduation.
- A future task: replace the hand-rolled `apiClient` in `packages/web/src/lib/api.ts` with one generated from the contract registry (Task 5.5 note).
- Multiplexed SSE endpoint (`/api/stream?runs=...`) — deferred per spec.
