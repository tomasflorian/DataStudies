#!/usr/bin/env node
// read.ts — one reading, one table, and nothing asked.
//
//   ./read.ts 'host resolves-to/account/ticket'
//   ./read.ts 'host resolves-to/(account/ticket, ip has-address)'
//   ./read.ts 'record username-of/notes~/ip'
//   ./read.ts 'flower{bugambilia, lilly, rose}*/itstuff{host, ip, url}/itstuff{host, ip, url}'
//   ./read.ts --taxonomy gardener 'flower*/itstuff/itstuff'
//   ./read.ts --introduce <(pass show work/records | ./any2pile.ts) 'password-record/username'
//
// A CLIENT OF THE SESSION. It asks session.ts for the view of one query — no
// command, the focus at the pile — and prints the table in it. The same view the
// shell and the server draw, so a query copied out of either draws the same
// table here.
//
// A TAXONOMY ONLY SPELLS THINGS OUT. With --taxonomy, a name it holds something
// under is written as the group of kinds it stands for before anything is asked:
// `itstuff` becomes `itstuff{host, ip, url, …}`. The reading is then the same as
// if you had typed the group yourself.
//
// STDOUT IS THE TABLE AND NOTHING ELSE. A mistake goes to stderr with a caret
// under where it is, and the exit code says it happened. Redirecting the table
// into a file writes whatever the pile held into it, in plain text.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { build } from "./stringwalk.ts";
import { drawTable } from "./text.ts";
import { cut, takeFlags, timing } from "./cut.ts";
import { open, view } from "./session.ts";
import { parseQuery, explain, QueryError } from "./query.ts";
import { expand, readTaxonomy } from "./taxonomy.ts";

const TAXONOMIES = join(import.meta.dirname, "taxonomies");
const USAGE = "usage: ./read.ts [--taxonomy <name>] [--introduce <file>] [--debug] [--timing] '<query>'";

const refuse = (...lines: string[]): never => {
  console.error(lines.join("\n"));
  process.exit(1);
};

// "read: " is six characters, and the caret line is indented to match.
const refuseAt = (text: string, at: number | null, message: string, suggest: string[]): never => {
  const more = message.includes("did you mean") ? [] : suggest.map(s => `     ${s}`);
  if (at === null) return refuse(`read: ${message}`, ...more);
  const [shown, caret, ...rest] = explain(text, at, message, more);
  return refuse(`read: ${shown}`, `      ${caret}`, ...rest);
};

const argv = process.argv;
const flags = (() => {
  try { return takeFlags(argv); }
  catch (e) { return refuse(`read: ${(e as Error).message}`); }
})();

let taxonomyName: string | null = null;
for (let i = 2; i < argv.length; i++) {
  const a = argv[i];
  if (a !== "--taxonomy" && !a.startsWith("--taxonomy=")) continue;
  const eq = a.startsWith("--taxonomy=");
  taxonomyName = eq ? a.slice("--taxonomy=".length) : argv[i + 1] ?? "";
  argv.splice(i--, eq ? 1 : 2);
  if (!taxonomyName) refuse("read: --taxonomy <name>");
}

const rest = argv.slice(2);
if (rest.some(a => a === "--schema" || a.startsWith("--schema=")))
  refuse("read: there are no schemas · --taxonomy <name> writes a taxonomy's names out as groups");
const unknown = rest.find(a => a.startsWith("--"));
if (unknown) refuse(`read: there is no option ${unknown}`, USAGE);
// More than one argument is nearly always a query the shell split on its
// spaces, so that is what gets said.
if (rest.length !== 1) refuse(rest.length ? "read: one query at a time · put it in single quotes" : USAGE);
if (rest[0].trimStart().startsWith("@"))
  refuse("read: a query no longer names a schema · --taxonomy <name> writes its names out as groups");

let text = rest[0];
if (taxonomyName) {
  const file = join(TAXONOMIES, `${taxonomyName}.pile`);
  if (!existsSync(file)) {
    const known = existsSync(TAXONOMIES)
      ? readdirSync(TAXONOMIES).filter(n => n.endsWith(".pile")).map(n => n.slice(0, -5)) : [];
    refuse(`read: there is no taxonomy named ${taxonomyName}` + (known.length ? ` · there is ${known.join(", ")}` : ""));
  }
  try { text = expand(readTaxonomy(taxonomyName, readFileSync(file, "utf8")), text); }
  catch (e) { refuse(`read: ${(e as Error).message}`); }
}

// A query that cannot be read is refused before anything is cut.
try { parseQuery(text); }
catch (e) {
  if (!(e instanceof QueryError)) throw e;
  refuseAt(text, e.at, e.message, e.suggest);
}

const time = timing(flags.timing);
time.lap("start node, load read.ts, read the query");

const ctx = (() => {
  try {
    const piles = cut(flags, time).piles;
    return open(build([...piles.keys()].sort().flatMap(n => piles.get(n)!)));
  } catch (e) { return refuse(`read: ${(e as Error).message}`); }
})();
time.lap("index the cut");

const shown = view(ctx, { query: text, focus: "" });
time.lap("the view", `${shown.columns.length} column(s) · ${shown.rows.length} row(s)`);
if (shown.message) refuseAt(text, shown.message.at, shown.message.text, shown.message.suggest);

console.log(drawTable(shown.columns, shown.rows).join("\n"));
time.lap("draw");
time.print();
