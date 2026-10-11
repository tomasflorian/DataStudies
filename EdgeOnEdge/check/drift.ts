// A check: does the walk still answer the same? It builds the pile the way eoe.ts does,
// with every layer loaded, asks the walk a fixed set of questions, and keeps a short hash
// of each answer.
//
//   node check/drift.ts --save    remember today's answers in check/drift.json (not in git)
//   node check/drift.ts           ask again, and list every question whose answer moved
//
// The questions: the switches; every kind, with everything switched on and with each
// vocabulary alone; a reading from each kind; every one-step reading from there; where the
// first cell of each was read from; and a few searches. Run it from the repository root.
//
// Answers are compared by what they say, not by line ids: a line id in an answer is replaced
// by the line's two ends, references unfolded, so writing the same lines differently (another
// order, another id) does not count as drift unless the answers themselves change.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { End } from "../core/lines.ts";
import { buildPile } from "../eoe.ts";
import { walkOf, type Walk } from "../walk/walk.ts";

const SAVED = "check/drift.json";
const hash = (answer: unknown) => createHash("sha256").update(JSON.stringify(answer)).digest("hex").slice(0, 16);
// What a reading says, and nothing about how the answer happens to be shaped: its columns,
// its cells, and what it offers next.
const said = (reading: ReturnType<Walk["view"]>) => ({
  columns: reading.columns.map(({ label, parent }) => [label, parent]),
  rows: reading.rows.map((cells) => cells.map((cell) => cell && [cell.v, [...cell.kinds].sort(), cell.rels.map((rel) => JSON.stringify(endsOf(rel))).sort()])),
  offers: reading.offers.map(({ step, count, of, kinds, tag }) => [step.label, step.parent, count, of, kinds, tag]),
});

const kept = buildPile().kept;
const walk = walkOf(kept);
// A line by its ends, references unfolded: what it says, whatever its id.
const lineById = new Map(kept.map((line) => [line[1], line] as const));
function endsOf(end: End, depth = 0): unknown {
  const line = typeof end === "number" ? lineById.get(end) : undefined;
  return line && depth < 8 ? [endsOf(line[0], depth + 1), endsOf(line[2], depth + 1)] : end;
}
const answers: Record<string, string> = {};
const vocabularies = walk.tags().map((one) => one.tag);
answers["switches"] = hash(walk.tags());
for (const query of ["root", "paris", "10.2", "a", "sshd"]) answers[`find ${query}`] = hash(walk.find(query));
for (const tags of [undefined, ...vocabularies.map((one) => [one])]) {
  const on = tags ? tags[0] : "all";
  const kinds = walk.kinds(tags);
  answers[`${on} · kinds`] = hash(kinds);
  for (const { kind } of kinds) {
    const start = { start: { kind }, steps: [], focus: 0, tags };
    const first = walk.view(start);
    answers[`${on} · ${kind}`] = hash(said(first));
    for (const offer of first.offers) {
      const reading = walk.view({ ...start, steps: [offer.step], focus: 1 });
      answers[`${on} · ${kind} → ${offer.step.label}`] = hash(said(reading));
      const row = reading.rows.find((cells) => cells[1]);
      if (row) answers[`${on} · ${kind} → ${offer.step.label} · read from`] = hash(walk.path([{ from: row[0]!.v, rels: row[1]!.rels }], row[1]!.v));
    }
  }
}

if (process.argv.includes("--save")) {
  writeFileSync(SAVED, JSON.stringify(answers, null, 0));
  console.log(`saved ${Object.keys(answers).length} answers to ${SAVED}`);
} else if (!existsSync(SAVED)) {
  console.error(`nothing saved yet: run  node check/drift.ts --save  first`);
  process.exit(2);
} else {
  const saved: Record<string, string> = JSON.parse(readFileSync(SAVED, "utf8"));
  const moved = Object.keys({ ...saved, ...answers }).filter((question) => saved[question] !== answers[question]);
  console.log(`${Object.keys(answers).length} questions, ${moved.length} moved`);
  for (const question of moved.slice(0, 40))
    console.log(`  ${question}${!(question in saved) ? "  (new)" : !(question in answers) ? "  (gone)" : ""}`);
  if (moved.length > 40) console.log(`  … and ${moved.length - 40} more`);
  process.exitCode = moved.length ? 1 : 0;
}
