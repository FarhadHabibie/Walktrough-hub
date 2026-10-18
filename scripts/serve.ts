/**
 * Minimal static file server for the exported app (`out/`) — the desktop
 * replacement for `next start` now that the app is a static SPA.
 *
 *   npm run build && npm start -- -p 3765
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchGamefaq, hasCurl } from "./gamefaqs.ts";

const root = fileURLToPath(new URL("../out/", import.meta.url));

const args = process.argv.slice(2);
function argValue(flag: string): string | null {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}
const port = Number(
  argValue("-p") ?? argValue("--port") ?? process.env.PORT ?? 3765,
);

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

function notFound(res: import("node:http").ServerResponse): void {
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("not found");
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    let pathname = decodeURIComponent(url.pathname);

    // GameFAQs helper (desktop-only): the app has no CORS access to
    // gamefaqs.gamespot.com, but this little server runs on the same machine.
    if (pathname === "/api/gamefaqs/ping") {
      const ok = await hasCurl();
      res.writeHead(ok ? 200 : 503, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify({ ok }));
      return;
    }
    if (pathname === "/api/gamefaqs/fetch") {
      const q = url.searchParams.get("q")?.trim() ?? "";
      const json = (status: number, payload: unknown) => {
        res.writeHead(status, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        });
        res.end(JSON.stringify(payload));
      };
      if (q.length < 2) {
        json(400, { error: "parameter q wajib (nama game)" });
        return;
      }
      try {
        json(200, await fetchGamefaq(q));
      } catch (err) {
        json(502, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      return;
    }

    if (pathname.endsWith("/")) pathname += "index.html";

    const resolved = path.normalize(path.join(root, pathname));
    if (!resolved.startsWith(root)) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("forbidden");
      return;
    }

    let file: string | null = null;
    try {
      const st = await stat(resolved);
      if (st.isFile()) {
        file = resolved;
      } else if (st.isDirectory()) {
        try {
          const idx = path.join(resolved, "index.html");
          if ((await stat(idx)).isFile()) file = idx;
        } catch {
          // fall through to the SPA fallback
        }
      }
    } catch {
      // missing — fall through
    }

    if (!file) {
      // SPA fallback: navigations get the app shell, assets get a real 404.
      const acceptsHtml = (req.headers.accept ?? "").includes("text/html");
      if (acceptsHtml) {
        file = path.join(root, "index.html");
      } else {
        notFound(res);
        return;
      }
    }

    const data = await readFile(file);
    const ext = path.extname(file).toLowerCase();
    const isHashed = file.includes(`${path.sep}_next${path.sep}`);
    res.writeHead(200, {
      "Content-Type": MIME[ext] ?? "application/octet-stream",
      "Cache-Control": isHashed
        ? "public, max-age=31536000, immutable"
        : "no-cache",
      "Content-Length": data.byteLength,
    });
    if (req.method === "HEAD") res.end();
    else res.end(data);
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(`server error: ${err instanceof Error ? err.message : String(err)}`);
  }
});

server.listen(port, () => {
  console.log(`WalkthroughHub (static) → http://localhost:${port}`);
});
