import type { Database } from "bun:sqlite";
import { projectsController } from "./controllers/projects";
import { runsController } from "./controllers/runs";
import { streamController } from "./controllers/stream";
import { actionsController } from "./controllers/actions";
import { statusController } from "./controllers/status";
import { staticController } from "./controllers/static";
import { toErrorResponse } from "./http/errors";

export interface StartServerOpts {
  db: Database;
  registryPath: string;
  port: number;
  host: string;
}

export function startServer(opts: StartServerOpts) {
  const projects = projectsController(opts.db, opts.registryPath);
  const runs     = runsController(opts.db);
  const stream   = streamController(opts.db);
  const actions  = actionsController(opts.db, opts.registryPath);
  const status   = statusController(opts.db);
  const statik   = staticController();

  const server = Bun.serve({
    port: opts.port,
    hostname: opts.host,
    routes: {
      "/": () => statik.index(),
      "/assets/*": (req) => {
        const url = new URL(req.url);
        return statik.asset(url.pathname.replace(/^\/assets\//, ""));
      },

      "/api/projects": () => projects.list(),
      "/api/projects/:project": (req) => projects.get(req.params.project),
      "/api/projects/:project/jobs": (req) => projects.listJobs(req.params.project),
      "/api/projects/:project/jobs/:job": (req) =>
        projects.getJob(req.params.project, req.params.job),

      "/api/runs": (req) => runs.list(new URL(req.url)),
      "/api/runs/:id": (req) => runs.get(req.params.id),
      "/api/runs/:id/stream": (req) => stream.stream(req.params.id),

      "/api/projects/:project/jobs/:job/enable": {
        POST: (req) => actions.enable(req.params.project, req.params.job),
      },
      "/api/projects/:project/jobs/:job/disable": {
        POST: (req) => actions.disable(req.params.project, req.params.job),
      },
      "/api/runs/:id/stop": {
        POST: (req) => actions.stop(req.params.id),
      },

      "/api/status": () => status.get(),
    },
    fetch(_req) {
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
