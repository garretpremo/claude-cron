import { DB_PATH, PROJECTS_TOML } from "../util/paths";
import { openDb } from "../db/connection";
import { startServer } from "@claude-cron/server";

export interface ServeOpts {
  port?: number;
  host?: string;
  allowPublic?: boolean;
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

export async function cmdServe(opts: ServeOpts = {}): Promise<void> {
  const port = opts.port ?? 8787;
  const host = opts.host ?? "127.0.0.1";

  if (!LOOPBACK_HOSTS.has(host) && !opts.allowPublic) {
    throw new Error(
      `Refusing to bind ${host}: the dashboard has no authentication and exposes ` +
      `Run-now / stop endpoints that execute claude on demand. Re-run with ` +
      `--allow-public if you understand the risk and trust the network.`
    );
  }

  if (opts.allowPublic && !LOOPBACK_HOSTS.has(host)) {
    console.warn(
      `WARNING: dashboard bound to ${host} with --allow-public. There is no ` +
      `authentication. Anyone who can reach this host can trigger jobs.`
    );
  }

  const db = openDb(DB_PATH);
  const { server } = startServer({ db, registryPath: PROJECTS_TOML, port, host });
  console.log(`claude-cron serving at http://${server.hostname}:${server.port}`);
  console.log(`Press Ctrl-C to stop.`);

  // Keep event loop alive
  await new Promise(() => {});
}
