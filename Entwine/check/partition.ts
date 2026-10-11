#!/usr/bin/env node
// PARTITION CHECK — does an answer depend on how the files were cut into trees?
//
//   node entwine/check/partition.ts
//
// The same records are cut three ways: the raw files as they are, two records to a file, and
// one record to a file (the file's first line, its hint, kept on each). Every ask is run on
// all three. An answer that changes is one the tree size decided, not the data.
//
// A second table counts, for a few texts, how many trees hold them: the number of trees a
// jump from that text lands in.
//
// The one file here that reads files: raw/ and tables/ in, the report out.

import { readdirSync, readFileSync } from "node:fs";
import { climb, indexOf, number, parseOutline, printLines, topDown, viewsOf, type Index } from "../forest.ts";
import { cutAll, parseTable } from "../table.ts";

type File = { path: string; text: string };

const here = new URL("../", import.meta.url);
const filesIn = (folder: string) => readdirSync(new URL(folder, here)).sort();
const tables = filesIn("tables/").map((name) => parseTable(name, readFileSync(new URL(`tables/${name}`, here), "utf8")));
const raw: File[] = filesIn("raw/").map((name) => ({ path: `raw/${name}`, text: readFileSync(new URL(`raw/${name}`, here), "utf8") }));

// Each file's records, size to a file, the hint line kept on each. Blank lines are dropped.
function chunked(files: File[], size: number): File[] {
  return files.flatMap((file) => {
    const [hint, ...rest] = file.text.split("\n");
    const records = rest.filter((line) => line.trim());
    const chunks = Array.from({ length: Math.ceil(records.length / size) }, (_, i) => records.slice(i * size, (i + 1) * size));
    return chunks.map((chunk, i) => ({ path: `${file.path}#${i + 1}`, text: [hint, ...chunk].join("\n") + "\n" }));
  });
}

const cuttings: { name: string; files: File[] }[] = [
  { name: "as is", files: raw },
  { name: "2 per file", files: chunked(raw, 2) },
  { name: "1 per file", files: chunked(raw, 1) },
];
const indexes = cuttings.map(({ files }) => indexOf(number(cutAll(tables, files).map(parseOutline))));

// An answer: every view ask would print, in a fixed order, so two runs compare as strings.
const answer = (index: Index, text: string, depth: number) =>
  viewsOf(index, text, depth)
    .map((view) => printLines(topDown(view)))
    .sort()
    .join("\n\n");
const treesHolding = (index: Index, text: string) => new Set((index.idsOf.get(text) ?? []).map((id) => climb(index, id))).size;

const QUERIES = ["10.2.14.7", "backup-03", "build-01", "root", "sshd", "ip", "host"];
const DEPTHS = [0, 1, 2, 3, 4, 5, 6, Infinity];
const pad = (text: string, width: number) => text.padEnd(width);

console.log("Cuttings (the same records each time):");
const treeCount = (index: Index) => [...index.stringOf.keys()].filter((id) => !index.parentOf.has(id)).length;
cuttings.forEach(({ name, files }, i) => console.log(`  ${pad(name, 12)} ${pad(String(files.length), 3)} files  →  ${treeCount(indexes[i])} trees`));

console.log("\nask TEXT --depth N: = same answer in all three cuttings, ≠ not");
console.log(`  ${pad("", 12)} ${DEPTHS.map((depth) => pad(depth === Infinity ? "all" : String(depth), 4)).join("")}`);
for (const text of QUERIES) {
  const cells = DEPTHS.map((depth) => {
    const [first, ...others] = indexes.map((index) => answer(index, text, depth));
    return others.every((other) => other === first) ? "=" : "≠";
  });
  console.log(`  ${pad(text, 12)} ${cells.map((cell) => pad(cell, 4)).join("")}`);
}

console.log("\nTrees holding each text (where a jump from it can land):");
console.log(`  ${pad("", 16)} ${cuttings.map(({ name }) => pad(name, 12)).join("")}`);
for (const text of ["10.2.14.7", "backup-03", "build-01", "root", "sshd", "203.0.113.50"])
  console.log(`  ${pad(text, 16)} ${indexes.map((index) => pad(String(treesHolding(index, text)), 12)).join("")}`);
