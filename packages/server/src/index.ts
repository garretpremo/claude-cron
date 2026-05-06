import type { Database } from "bun:sqlite";
import { streamController } from "./controllers/stream";
import { staticController } from "./controllers/static";
import { toErrorResponse } from "./http/errors";
import { Registry, toBunRoutes, generateOpenApi } from "./contract";
import {
  projectsListRoute,
  projectGetRoute,
  projectJobsListRoute,
  projectJobGetRoute,
} from "./routes/projects";
import { runsListRoute, runGetRoute } from "./routes/runs";
import { statusGetRoute } from "./routes/status";
import {
  jobEnableRoute,
  jobDisableRoute,
  jobRunRoute,
  runStopRoute,
} from "./routes/actions";
import {
  favoritesListRoute,
  favoriteSetRoute,
  favoriteUnsetRoute,
} from "./routes/favorites";
import {
  dashboardGlobalRoute,
  dashboardProjectRoute,
  jobStatsRoute,
} from "./routes/dashboard";

export interface StartServerOpts {
  db: Database;
  registryPath: string;
  port: number;
  host: string;
}

export function startServer(opts: StartServerOpts) {
  const stream = streamController(opts.db);
  const statik = staticController();

  const registry = new Registry();
  const projectDeps = { db: opts.db, registryPath: opts.registryPath };
  const runsDeps = { db: opts.db };
  const actionsDeps = { db: opts.db, registryPath: opts.registryPath };

  registry.add(projectsListRoute(projectDeps));
  registry.add(projectGetRoute(projectDeps));
  registry.add(projectJobsListRoute(projectDeps));
  registry.add(projectJobGetRoute(projectDeps));

  registry.add(runsListRoute(runsDeps));
  registry.add(runGetRoute(runsDeps));

  registry.add(statusGetRoute({ db: opts.db }));

  registry.add(jobEnableRoute(actionsDeps));
  registry.add(jobDisableRoute(actionsDeps));
  registry.add(jobRunRoute(actionsDeps));
  registry.add(runStopRoute(actionsDeps));

  const favoritesDeps = { db: opts.db };
  registry.add(favoritesListRoute(favoritesDeps));
  registry.add(favoriteSetRoute(favoritesDeps));
  registry.add(favoriteUnsetRoute(favoritesDeps));

  const dashboardDeps = { db: opts.db, registryPath: opts.registryPath };
  registry.add(dashboardGlobalRoute(dashboardDeps));
  registry.add(dashboardProjectRoute(dashboardDeps));
  registry.add(jobStatsRoute(dashboardDeps));

  const contractRoutes = toBunRoutes(registry);
  const openapi = generateOpenApi(registry, { title: "claude-cron", version: "0.1.0" });

  const server = Bun.serve({
    port: opts.port,
    hostname: opts.host,
    routes: {
      "/": () => statik.index(),
      // SvelteKit immutable app dir.
      "/_app/*": (req) => {
        const url = new URL(req.url);
        return statik.asset(url.pathname.replace(/^\/+/, ""));
      },
      // Legacy asset path kept so any existing deep-links still resolve.
      "/assets/*": (req) => {
        const url = new URL(req.url);
        return statik.asset(url.pathname.replace(/^\/assets\//, ""));
      },
      "/favicon.png": () => statik.asset("favicon.png"),
      "/favicon.ico": () => statik.asset("favicon.ico"),

      // SSE — kept outside the contract registry. The contract adapter only
      // handles JSON request/response; this endpoint is a long-lived stream.
      "/api/runs/:id/stream": (req) => stream.stream(req.params.id),

      "/openapi.json": () => Response.json(openapi),
      "/docs": () => new Response(scalarHtml(), { headers: { "content-type": "text/html" } }),
      ...contractRoutes,
    },
    fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;
      // /api/* paths that didn't match a registered route -> 404.
      if (path.startsWith("/api/")) {
        return new Response("Not found", { status: 404 });
      }
      // SPA fallback: any other GET serves index.html so the client router
      // can resolve client-side routes (e.g. /projects/foo/jobs/bar).
      if (req.method === "GET" || req.method === "HEAD") {
        return statik.fallback();
      }
      return new Response("Not found", { status: 404 });
    },
    error(err) {
      return toErrorResponse(err);
    },
  });

  const shutdown = () => {
    try { server.stop(true); } catch {}
    try { opts.db.close(); } catch {}
  };
  process.once("SIGINT", () => { shutdown(); process.exit(0); });
  process.once("SIGTERM", () => { shutdown(); process.exit(0); });

  return { server, shutdown };
}

function scalarHtml(): string {
  return `<!doctype html><html><head><title>claude-cron API</title></head>
<body><script id="api-reference" data-url="/openapi.json"></script>
<script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script></body></html>`;
}
