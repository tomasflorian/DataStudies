#!/usr/bin/env node
// ASK — every tree that holds a text, in full or from --depth steps above it, with --anchor
// hung from the text itself, with --triples one function:label:"value" per line (SPEC.md,
// section 5). The one file here that reads and
// writes files: the raw files and tables in, the forest built in memory.
//
//   node entwine/ask.ts 10.2.14.7       the trees holding "10.2.14.7", as outlines
//   node entwine/ask.ts 10.2.14.7 --depth 3
//                                       from each "10.2.14.7", up 3 and down: its line, say
//   node entwine/ask.ts 10.2.14.7 --depth 3 --anchor
//                                       the same, each "10.2.14.7" first, its line below it
//   node entwine/ask.ts 10.2.14.7 --depth 3 --triples
//                                       its line as ::"…", regex:ip:"10.2.14.7" under it
//   node entwine/ask.ts --write         also write forest/tree.jsonl and forest/strings.jsonl

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { anchored, indexOf, number, parseOutline, printLines, printTriples, serialize, topDown, viewsOf } from "./forest.ts";
import { cutAll, parseTable } from "./table.ts";

const here = new URL("./", import.meta.url);
const args = process.argv.slice(2);
const write = args.includes("--write");
const anchor = args.includes("--anchor");
const triples = args.includes("--triples");
const depthAt = args.indexOf("--depth");
const depthText = depthAt === -1 ? undefined : args[depthAt + 1];
const depth = depthText === undefined ? Infinity : Number(depthText);
const text = args.find((arg, i) => !arg.startsWith("--") && !(depthAt !== -1 && i === depthAt + 1));
if ((text === undefined && !write) || (depthAt !== -1 && !(Number.isInteger(depth) && depth >= 0))) {
  console.error("usage: node entwine/ask.ts TEXT [--depth N] [--anchor] [--triples] [--write]");
  process.exit(1);
}

// Every table on every file whose hint it reads: one tree each.
const filesIn = (folder: string) => readdirSync(new URL(folder, here)).sort();
const tables = filesIn("tables/").map((name) => parseTable(name, readFileSync(new URL(`tables/${name}`, here), "utf8")));
const files = filesIn("raw/").map((name) => ({ path: `raw/${name}`, text: readFileSync(new URL(`raw/${name}`, here), "utf8") }));
const forest = number(cutAll(tables, files).map(parseOutline));

if (write) {
  const written = serialize(forest);
  mkdirSync(new URL("forest/", here), { recursive: true });
  writeFileSync(new URL("forest/tree.jsonl", here), written.tree);
  writeFileSync(new URL("forest/strings.jsonl", here), written.strings);
}

if (text !== undefined) {
  const index = indexOf(forest);
  if (!index.idsOf.has(text)) {
    console.error(`no occurrence of ${JSON.stringify(text)}`);
    process.exit(1);
  }
  // From each occurrence, up --depth steps (to the root without it), then everything below.
  const order = anchor ? anchored : topDown;
  const print = triples ? printTriples : printLines;
  console.log(viewsOf(index, text, depth, anchor).map((view) => print(order(view))).join("\n\n"));
}
