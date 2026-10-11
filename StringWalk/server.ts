#!/usr/bin/env node
// server.ts — the session, over HTTP.
//
//   ./server.ts
//   ./server.ts --port 7474
//   ./server.ts --introduce <(pass show work/records | ./any2pile.ts)
//
// THE SAME STATE MACHINE sw.ts RUNS, reachable from a browser. It holds a pile and
// no sessions: every POST /step brings the session it is about, and gets back the
// session after the command and the view of it. A restart loses nothing a client
// had, and a request sent twice gets the same answer twice. api.ts is the
// contract, and says what each route takes and gives.
//
// IT CUTS ONCE, AT START, with whatever it was told to introduce.
//
// TAXONOMIES ARE HANDED OUT, NOT HELD. A page needs the files to show a reader
// their names, so the server lists taxonomies/ and serves its files as they are.
// Nothing the engine does depends on them; a request's `groups` is a client asking
// how many values its own names reach, and is gone with the answer.
//
// LOCALHOST, NO TOKEN. Anything on this machine can ask it for the pile, a web
// page in a browser included, and nothing is encrypted on the way.

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { build } from "./stringwalk.ts";
import { cut, takeFlags, timing } from "./cut.ts";
import { open, step, view, EMPTY, type Command, type Groups, type Session } from "./session.ts";

const HERE = import.meta.dirname;
const GUI = join(HERE, "gui");
const TAXONOMIES = join(HERE, "taxonomies");
const LIMIT = 1024 * 1024;
const USAGE = "./server.ts [--introduce <file>] [--port <n>] [--debug] [--timing]";

const refuse = (text: string): never => {
  console.error(`  ${text}`);
  process.exit(1);
};

const argv = process.argv;
const flags = (() => {
  try { return takeFlags(argv); }
  catch (e) { return refuse((e as Error).message); }
})();

let port = 7474;
for (let i = 2; i < argv.length; i++) {
  const a = argv[i];
  if (a !== "--port" && !a.startsWith("--port=")) continue;
  const eq = a.startsWith("--port=");
  port = Number(eq ? a.slice("--port=".length) : argv[i + 1]);
  argv.splice(i--, eq ? 1 : 2);
  if (!Number.isInteger(port) || port < 1 || port > 65535) refuse(`--port <number> · ${USAGE}`);
}
if (argv.length > 2) refuse(`there is no option ${argv[2]} · ${USAGE}`);

const time = timing(flags.timing);
time.lap("start node, load server.ts");
const ctx = (() => {
  try {
    const piles = cut(flags, time).piles;
    return open(build([...piles.keys()].sort().flatMap(n => piles.get(n)!)));
  } catch (e) { return refuse((e as Error).message); }
})();
time.lap("index the cut");

const send = (res: ServerResponse, status: number, body: unknown): void => {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
};

// A request that is not the shape api.ts describes, said the way any message is.
const problem = (text: string) => ({ message: { text, in: "request", at: null, suggest: [] } });

const isSession = (s: unknown): s is Session =>
  typeof s === "object" && s !== null &&
  typeof (s as Session).query === "string" && typeof (s as Session).focus === "string";

const isGroups = (g: unknown): g is Groups =>
  typeof g === "object" && g !== null && !Array.isArray(g) &&
  Object.values(g).every(v => Array.isArray(v) && v.every(k => typeof k === "string"));

function stepRequest(req: IncomingMessage, res: ServerResponse): void {
  let body = "";
  let over = false;
  req.setEncoding("utf8");
  req.on("data", (chunk: string) => {
    if (over) return;
    body += chunk;
    if (body.length > LIMIT) { over = true; send(res, 413, problem("a request is at most a megabyte")); }
  });
  req.on("end", () => {
    if (over) return;
    let asked: unknown;
    try { asked = JSON.parse(body || "{}"); }
    catch { return send(res, 400, problem("the body is not JSON")); }
    if (typeof asked !== "object" || asked === null || Array.isArray(asked))
      return send(res, 400, problem("a request is { \"session\": {…}, \"command\": {…}, \"groups\": {…} }"));
    const { session = EMPTY, command = null, groups = {} } =
      asked as { session?: unknown; command?: unknown; groups?: unknown };
    if (!isSession(session))
      return send(res, 400, problem("a session is { \"query\": text, \"focus\": text }"));
    if (!isGroups(groups))
      return send(res, 400, problem("groups are { \"name\": [\"kind\", …] }"));
    const r = step(ctx, session, command as Command | null);
    send(res, 200, { session: r.session, view: view(ctx, r.session, r.message, groups) });
  });
}

// THE PAGE is gui/index.html and what `npm run build` compiled into gui/dist, and
// the taxonomies are taxonomies/*.pile. Only files under those two directories
// with one of these types are served, and a path that climbs out gets nothing —
// the TypeScript source is never sent.
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".pile": "text/plain; charset=utf-8",
};

function serveFile(res: ServerResponse, dir: string, relative: string, types: string[]): boolean {
  const file = resolve(dir, decodeURIComponent(relative));
  const type = TYPES[extname(file)];
  if (!type || !types.includes(extname(file)) || !file.startsWith(dir + sep) ||
      !existsSync(file) || !statSync(file).isFile()) return false;
  res.writeHead(200, { "content-type": type, "cache-control": "no-store" });
  res.end(readFileSync(file));
  return true;
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;
  if (path === "/step" && req.method === "POST") return stepRequest(req, res);
  if (req.method === "GET" && path === "/taxonomies/") {
    const names = existsSync(TAXONOMIES)
      ? readdirSync(TAXONOMIES).filter(n => n.endsWith(".pile")).map(n => n.slice(0, -5)).sort() : [];
    return send(res, 200, { taxonomies: names });
  }
  if (req.method === "GET" && path.startsWith("/taxonomies/") &&
      serveFile(res, TAXONOMIES, path.slice("/taxonomies/".length), [".pile"])) return;
  if (req.method === "GET" &&
      serveFile(res, GUI, path === "/" ? "index.html" : path.slice(1), [".html", ".css", ".js", ".map"])) return;
  send(res, 404, problem(`nothing at ${req.method} ${path} · POST /step, GET /taxonomies/, GET /`));
});

server.on("error", e => refuse(e.message));
server.listen(port, "127.0.0.1", () => {
  time.lap("listen");
  time.print();
  console.log(`  listening on http://127.0.0.1:${port}/ · ${ctx.summary.lines} lines`);
});
