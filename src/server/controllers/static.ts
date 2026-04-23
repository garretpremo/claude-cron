import { readFileSync, existsSync } from "node:fs";
import { join, extname, resolve } from "node:path";

const PUBLIC_DIR = new URL("../public/", import.meta.url).pathname;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".ico":  "image/x-icon",
};

function serveFile(absPath: string): Response {
  if (!existsSync(absPath)) {
    return new Response("Not Found", { status: 404 });
  }
  const data = readFileSync(absPath);
  const type = MIME[extname(absPath).toLowerCase()] ?? "application/octet-stream";
  return new Response(data, { headers: { "content-type": type } });
}

export function staticController() {
  return {
    index: () => serveFile(join(PUBLIC_DIR, "index.html")),
    asset: (subPath: string) => {
      // Prevent path traversal
      const safe = subPath.replace(/\.\.+/g, "");
      const full = resolve(PUBLIC_DIR, safe);
      if (!full.startsWith(resolve(PUBLIC_DIR))) {
        return new Response("Forbidden", { status: 403 });
      }
      return serveFile(full);
    },
  };
}
