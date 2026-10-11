#!/usr/bin/env node
// serve.ts — optional, read-only window onto an atom file.
//
// The pile is FILE, not this process. This adapter watches the file, serves the
// viewer, and tells connected browsers to reload when its contents change. It
// has no ingestion, merge, dedupe, or delete API.

import { createServer, type ServerResponse } from "node:http";
import { existsSync, readFile, readFileSync, watchFile } from "node:fs";
import { dirname, extname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8000;
const FILE = process.env.RFG_PILE_FILE ?? join(ROOT, "pile.atoms");
const readers = new Set<ServerResponse>();

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".atoms": "text/plain; charset=utf-8",
};

function lines(): string[] {
  if (!existsSync(FILE)) return [];
  return [...new Set(readFileSync(FILE, "utf8").split("\n").map(x => x.trim()).filter(Boolean))];
}

function replay(res: ServerResponse): void {
  for (const line of lines()) res.write(`data: ${line}\n\n`);
}

watchFile(FILE, { interval: 250 }, (now, before) => {
  if (now.mtimeMs === before.mtimeMs && now.size === before.size) return;
  for (const res of readers) res.write("event: reset\ndata: \n\n");
});

const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
  if (url === "/atoms") {
    if (req.method !== "GET") { res.writeHead(405, { allow: "GET" }).end("read only\n"); return; }
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
    replay(res); readers.add(res);
    const ping = setInterval(() => res.write(": ping\n\n"), 25000);
    req.on("close", () => { clearInterval(ping); readers.delete(res); });
    return;
  }
  const file = join(ROOT, url === "/" ? "/graph.html" : url);
  if (!file.startsWith(ROOT + sep)) { res.writeHead(403).end("outside the project"); return; }
  readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end("no such file: " + url); return; }
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" }).end(data);
  });
});

server.listen(PORT, () => console.log(`viewer: ${FILE}\n        http://localhost:${PORT}`));
