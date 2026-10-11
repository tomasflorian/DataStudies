// WALK — the page and its questions, over HTTP. The one impure file in walk/.
//
// The server holds a pile as lines always loaded, and chips: layers a reader switches on and
// off. Every question names the chips that are on; the walk for each set of chips is built
// the first time it is asked for, from exactly those lines, and kept. Nothing below this
// file knows which chips there are.
//
//   /                 the page (page/), and its scripts and style
//   /api/info         the title, the chips, and the tunings' aliases
//   /api/tags         the switches              /api/kinds   where a reading can start
//   /api/find         strings holding a text    /api/view    a reading   /api/path   a cell's lines

import { createServer, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { check, union, type Line } from "../core/lines.ts";
import { walkOf, type Walk } from "./walk.ts";

export type Chip = { name: string; label: string; lines: Line[] };
export type Served = { title: string; always: Line[]; chips: Chip[]; aliases: Record<string, string> };

const PAGE = new URL("./page/", import.meta.url);
const MEDIA: Record<string, string> = { html: "text/html; charset=utf-8", js: "text/javascript; charset=utf-8", css: "text/css; charset=utf-8" };

export function serve(served: Served, port: number) {
  const walks = new Map<string, Walk>();
  // The walk for these chips — every chip, when none are named.
  const walkFor = (layers?: string[]) => {
    const on = served.chips.filter((chip) => !layers || layers.includes(chip.name));
    const key = on.map((chip) => chip.name).join(",");
    if (!walks.has(key)) walks.set(key, walkOf(check(union(served.always, ...on.map((chip) => chip.lines))).kept));
    return walks.get(key)!;
  };
  const json = (res: ServerResponse, body: unknown) => res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(body));
  const file = (res: ServerResponse, name: string) =>
    res.writeHead(200, { "content-type": MEDIA[name.split(".").at(-1)!] }).end(readFileSync(new URL(name, PAGE)));

  createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    let body = "";
    for await (const chunk of req) body += chunk;
    try {
      const listed = (name: string) => { const value = url.searchParams.get(name); return value === null ? undefined : value.split(",").filter(Boolean); };
      const asked = body ? JSON.parse(body) : {};
      const walk = walkFor(listed("layers") ?? asked.layers);
      switch (url.pathname) {
        case "/api/info": return json(res, { title: served.title, aliases: served.aliases, chips: served.chips.map(({ name, label, lines }) => ({ name, label, lines: lines.length })) });
        case "/api/tags": return json(res, walk.tags());
        case "/api/kinds": return json(res, walk.kinds(listed("tags"), Number(url.searchParams.get("threshold")) || 2, url.searchParams.get("find") || undefined));
        case "/api/find": return json(res, walk.find(url.searchParams.get("q") ?? ""));
        case "/api/view": return json(res, walk.view(asked));
        case "/api/path": return json(res, walk.path(asked.steps, asked.value));
        case "/": return file(res, "index.html");
      }
      const asset = /^\/([\w-]+\.(?:js|css))$/.exec(url.pathname);
      if (asset) return file(res, asset[1]);
      res.writeHead(404).end();
    } catch (e) {
      res.writeHead(400, { "content-type": "text/plain" }).end(String(e));
    }
  }).listen(port, () => console.log(`walking http://localhost:${port}  (Ctrl-C to stop)`));
}
