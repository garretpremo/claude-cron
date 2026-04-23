import { DB_PATH, PROJECTS_TOML } from "../util/paths";
import { openDb } from "../db/connection";
import { startServer } from "../server";

export interface ServeOpts {
  port?: number;
  host?: string;
}

export async function cmdServe(opts: ServeOpts = {}): Promise<void> {
  const port = opts.port ?? 8787;
  const host = opts.host ?? "127.0.0.1";

  const db = openDb(DB_PATH);
  const { server } = startServer({ db, registryPath: PROJECTS_TOML, port, host });
  console.log(`claude-cron serving at http://${server.hostname}:${server.port}`);
  console.log(`Press Ctrl-C to stop.`);

  // Keep event loop alive
  await new Promise(() => {});
}
