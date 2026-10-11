#!/usr/bin/env node
// scenarios.ts — replay saved sessions and print them as text you can diff.
//
//   ./scenarios.ts > check/scenarios.txt
//   git diff check/scenarios.txt          did anything move?
//
// A scenario is a SESSION — the commands you typed, kept by `save <name>`. So
// this drives the real shell through its own front door and covers path
// resolution, matching, the tree, the menus and the table, not just the engine.
//
// It runs against whatever is in pile/introduced, cut fresh as sw.ts starts,
// deliberately: add a line and the diff shows which readings it changed, which
// is worth as much as the regression.
//
// THE QUERY ROUND TRIP. Every saved reading is also asked for as a query, and
// that query run through ./read.ts has to draw exactly the table the shell drew
// — so the one-line form of a reading cannot drift from the reading. A changed
// pile moves both sides together and never trips this; only a disagreement
// between the shell and read.ts does. It is said on stderr, so the transcript is
// still only ever what the shell said, and a disagreement fails the run.

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const HERE = import.meta.dirname;
const DIR = join(HERE, "scenarios");
const SW = join(HERE, "sw.ts");
const READ = join(HERE, "read.ts");
const BIG = 64 * 1024 * 1024;
const files = existsSync(DIR) ? readdirSync(DIR).filter(n => n.endsWith(".sw")).sort() : [];

if (!files.length) {
  console.log("no scenarios yet — play in `./sw.ts`, then `save <name>`.");
  process.exit(0);
}

let same = 0;
const empty: string[] = [];
const differ: string[] = [];

for (const file of files) {
  const name = file.replace(/\.sw$/, "");
  const script = readFileSync(join(DIR, file), "utf8");

  // On stdin, exactly as piping commands by hand does — nothing the shell
  // knows is a test.
  const out = execFileSync(process.execPath, [SW], { input: script, encoding: "utf8", maxBuffer: BIG });
  console.log(`=== ${name} ===\n`);
  console.log(out.replace(/\n+$/, "") + "\n");

  // The same session, then `query` and `table`, in a run of its own.
  const probe = execFileSync(process.execPath, [SW], {
    input: script.replace(/\n*$/, "\n") + "query\ntable\n", encoding: "utf8", maxBuffer: BIG,
  }).split("\n");
  const said = probe[probe.lastIndexOf("$ query") + 1] ?? "";
  if (said.trim() === "nothing named") { empty.push(name); continue; }
  const cmd = said.match(/^  \.\/read\.ts '(.*)'$/);
  if (!cmd) { differ.push(`  ${name}: query said ${JSON.stringify(said.trim())}`); continue; }

  const t = probe.lastIndexOf("$ table");
  const end = probe.indexOf("", t + 1);
  const drawn = probe.slice(t + 1, end < 0 ? undefined : end).join("\n").trimEnd();

  const r = spawnSync(process.execPath, [READ, cmd[1]],
    { encoding: "utf8", maxBuffer: BIG });
  if (r.status === 0 && r.stdout.trimEnd() === drawn) same++;
  else differ.push(`  ${name}: ${said.trim()}\n` +
    (r.status === 0 ? "    drew a different table than the shell" : r.stderr.trimEnd()));
}

console.error(`  query round trip · ${same} drew the shell's table` +
  (empty.length ? ` · ${empty.length} ended with no reading (${empty.join(", ")})` : "") +
  (differ.length ? ` · ${differ.length} did not` : ""));
if (differ.length) {
  console.error(differ.join("\n"));
  process.exitCode = 1;
}
