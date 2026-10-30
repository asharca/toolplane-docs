import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("../out/", import.meta.url)));
const base = "/toolplane-docs";
const port = Number(process.env.PORT || 3108);
const host = process.env.HOST || "127.0.0.1";
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".md": "text/markdown; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8", ".yml": "text/plain; charset=utf-8" };
createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url || "/", `http://${host}:${port}`).pathname);
    if (pathname === "/" || pathname === base) { response.writeHead(302, { location: `${base}/` }).end(); return; }
    if (!pathname.startsWith(`${base}/`)) { response.writeHead(404).end("Not found"); return; }
    const relative = pathname.slice(base.length + 1);
    let file = path.resolve(root, relative);
    if (file !== root && !file.startsWith(`${root}${path.sep}`)) { response.writeHead(404).end("Not found"); return; }
    try {
      if ((await stat(file)).isDirectory()) file = path.join(file, "index.html");
    } catch {
      // Next static route handlers export an extensionless route as search.json.
      try { await stat(`${file}.json`); file = `${file}.json`; } catch { file = path.join(root, "404.html"); response.statusCode = 404; }
    }
    response.setHeader("content-type", types[path.extname(file)] || "application/octet-stream");
    const content = await readFile(file);
    response.end(request.method === "HEAD" ? undefined : content);
  } catch { response.writeHead(404).end("Not found"); }
}).listen(port, host, () => console.log(`Static Pages preview: http://${host}:${port}${base}/`));
