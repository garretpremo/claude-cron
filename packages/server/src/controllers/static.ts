import { readFileSync, existsSync } from "node:fs";
import { join, extname, resolve } from "node:path";

// packages/server/src/controllers/static.ts -> packages/web/dist
const WEB_DIR = resolve(import.meta.dir, "..", "..", "..", "web", "dist");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".mjs":  "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".ico":  "image/x-icon",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif":  "image/gif",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf":  "font/ttf",
  ".map":  "application/json; charset=utf-8",
};

function buildMissing(): Response {
  const body =
    "claude-cron web bundle not found.\n\n" +
    "Run `bun run build` from the repo root to build the SvelteKit dashboard,\n" +
    "or `bun run install:global` to build and (re)install the CLI.\n";
  return new Response(body, {
    status: 503,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

function serveFile(absPath: string, immutable = false): Response {
  if (!existsSync(absPath)) {
    return new Response("Not Found", { status: 404 });
  }
  const data = readFileSync(absPath);
  const type = MIME[extname(absPath).toLowerCase()] ?? "application/octet-stream";
  const headers: Record<string, string> = { "content-type": type };
  if (immutable) {
    // SvelteKit's _app/immutable assets are content-hashed.
    headers["cache-control"] = "public, max-age=31536000, immutable";
  }
  return new Response(data, { headers });
}

export function staticController() {
  const ready = existsSync(WEB_DIR) && existsSync(join(WEB_DIR, "index.html"));
  if (!ready) {
    // Don't fail the boot; surface the issue per-request so dev can iterate.
    console.warn(`[static] ${WEB_DIR} not found. Run \`bun run build\` first.`);
  }

  const indexPath = join(WEB_DIR, "index.html");
  const webDirAbs = resolve(WEB_DIR);

  function asset(subPath: string): Response {
    if (!ready) return buildMissing();
    // Prevent path traversal.
    const safe = subPath.replace(/\.\.+/g, "");
    const full = resolve(WEB_DIR, safe);
    if (!full.startsWith(webDirAbs)) {
      return new Response("Forbidden", { status: 403 });
    }
    if (!existsSync(full)) {
      return new Response("Not Found", { status: 404 });
    }
    const immutable = subPath.startsWith("_app/immutable/");
    return serveFile(full, immutable);
  }

  return {
    ready,
    webDir: WEB_DIR,
    index: () => (ready ? serveFile(indexPath) : buildMissing()),
    asset,
    fallback: () => (ready ? serveFile(indexPath) : buildMissing()),
  };
}
