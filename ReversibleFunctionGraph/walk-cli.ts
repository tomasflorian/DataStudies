#!/usr/bin/env node
// walk-cli.ts — the walk tab, without the tab.
//
// It reads the same atom file the viewer fetches, and walks it the same way. The
// walk is never stored anywhere, so reading it from a terminal is how it stays
// checkable.
//
//   npx tsx walk-cli.ts combined emp                  # anchor column, and what it offers
//   npx tsx walk-cli.ts combined emp rev_emp date +hours
//   npx tsx walk-cli.ts combined word rev_word word
//
// The name is looked up in snapshots/ as <name>.atoms, or give it a path.
//
// Steps read left to right. A step hangs off the previous one; a step written
// with a leading + hangs off the same parent as the previous one, which is how
// you branch:
//
//   rev_emp date +hours     ->  date() via rev_emp()  and  hours() via rev_emp()
//                               two branches of one step, pairing at the record

import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as WALK from "./walk.js";
import type { Atom } from "./expand.js";

const here = dirname(fileURLToPath(import.meta.url));

const [file, anchor, ...steps] = process.argv.slice(2);
if (!file || !anchor) {
  console.error("usage: npx tsx walk-cli.ts <atomfile|path> <anchorFn> [step ...]");
  console.error("       a step is fn or rev_fn; prefix + to branch off the same parent");
  process.exit(1);
}

const p = existsSync(file) ? file : join(here, "snapshots", file + ".atoms");
if (!existsSync(p)) { console.error("no such atom file: " + p); process.exit(1); }
const atoms: Atom[] = readFileSync(p, "utf8")
  .split("\n").filter(l => l.trim()).map(l => JSON.parse(l) as Atom);
const index = WALK.buildIndex(atoms);

if (!WALK.anchorFunctions(index).includes(anchor)) {
  console.error(`no function "${anchor}" produced anything here.`);
  console.error("functions: " + WALK.anchorFunctions(index).join(", "));
  process.exit(1);
}

const tree = WALK.newTree(anchor);
let last = tree.header, parent = tree.header;
for (const raw of steps) {
  const branch = raw[0] === "+";
  const name = branch ? raw.slice(1) : raw;
  const dir = name.startsWith("rev_") ? "rev" : "fwd";
  const fn = name.replace(/^rev_/, "").replace(/\(\)$/, "");
  const under = branch ? parent : last;
  const child = WALK.addStep(tree, under, { dir, fn });
  if (!child) { console.error(`cannot add ${name} under ${under}`); process.exit(1); }
  parent = under;
  last = child.header;
}

const t = WALK.tabulate(index, tree, { maxRows: Number(process.env.WALK_MAX) || 2000 });

const cell = (r: WALK.Row, c: string): string => WALK.qualified(r[c]);
const w = t.columns.map(c => Math.max(c.length, ...t.rows.map(r => cell(r, c).length)));
console.log(t.columns.map((c, i) => c.padEnd(w[i])).join(" | "));
console.log(w.map(x => "-".repeat(x)).join("-+-"));
for (const r of t.rows) console.log(t.columns.map((c, i) => cell(r, c).padEnd(w[i])).join(" | "));
console.log(`\n${t.rows.length} row(s), ${t.columns.length} column(s)` +
            (t.capped ? " — CAPPED" : ""));

// what the last column can reach, so you know what to tick next
const leafValues = [...new Set(t.rows.map(r => r[last]?.value).filter(Boolean))];
const offers = new Set<string>();
for (const v of leafValues) for (const s of WALK.stepsFrom(index, v)) offers.add(WALK.stepName(s));
if (offers.size) console.log(`from ${last}: ` + [...offers].sort().join(" "));
