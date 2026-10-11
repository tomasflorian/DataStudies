#!/usr/bin/env node
// RUNG 11 — form: a record form, at the very end. The pile stays as it came; a form reads
// it as cards — one per string found as the form's word — each field filled from wherever
// the pile says it, across files, with the reading that filled it. A card missing a field
// it needs is disregarded, and counted.
//
// A form file:
//   form     machine                 its name
//   each     host@IT                 one card per string found as this word; @vocabulary is
//                                    optional, as in the tunings: host@IT leaves the party
//                                    plan's host out
//   ip       find ip        need     a field: its name, how it is filled, and optionally
//   dns      whole=zone-record         need   a card without it is disregarded
//   logins   beside:user    many       many   a list is expected; otherwise more than one
//                                             value is flagged, not silently picked
//
// How a field is filled: `find WORD` — the search of SPEC.md section 8, with its rules, --slack and
// --hops — or moves: whole, part, and beside (whole then part). `move:word` keeps the steps
// whose line says the part is word; `move=word` keeps the steps that land on something
// found as word. It needs only core/: the pile is walked with core/moves.ts.
//
//   ./rungs/11-form.ts forms/machine.form demo/layers/*.eoe                 every machine
//   ./rungs/11-form.ts forms/machine.form backup demo/layers/*.eoe          only cards naming "backup"
//   ./rungs/11-form.ts forms/person.form demo/layers/*.eoe                  every person
//   ./rungs/11-form.ts forms/person.form --slack=1 demo/layers/*.eoe        nearest weak readings for empty finds

import { readFileSync } from "node:fs";
import { check, index, parse, union } from "../core/lines.ts";
import { FILE_WORD, SEEN, SYSTEM, VOCABULARY } from "../core/markers.ts";
import { movesOf, narrowed } from "../core/moves.ts";

// ── the arguments: a .form, .eoe files (or stdin), --flags, and anything else filters cards
const args = process.argv.slice(2);
const formPath = args.find((arg) => arg.endsWith(".form"));
if (!formPath || args.includes("--help")) {
  const source = readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(1);
  console.log(source.slice(0, source.findIndex((line) => !line.startsWith("//"))).map((line) => line.replace(/^\/\/ ?/, "")).join("\n"));
  process.exit(args.includes("--help") ? 0 : 1);
}
const pilePaths = args.filter((arg) => arg.endsWith(".eoe"));
const cardFilters = args.filter((arg) => !arg.endsWith(".form") && !arg.endsWith(".eoe") && !arg.startsWith("--"));
const flagValue = (name: string, fallback: number) => Number(args.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1] ?? fallback);
const maxHops = flagValue("hops", 4), maxSlack = flagValue("slack", 0);

// ── the pile, as 0-pile reads it
const texts = pilePaths.length ? pilePaths.map((path) => ({ text: readFileSync(path, "utf8"), source: path })) : [{ text: readFileSync("/dev/stdin", "utf8"), source: "stdin" }];
const parsed = texts.map(({ text, source }) => parse(text, source));
for (const problem of parsed.flatMap((one) => one.problems)) console.error(problem);
const lineIndex = index(check(union(...parsed.map((one) => one.lines))).kept);

// ── the form
type Field = { name: string; how: string[]; need: boolean; many: boolean };
const form = { name: "form", each: "", fields: [] as Field[] };
for (const raw of readFileSync(formPath, "utf8").split("\n")) {
  const tokens = raw.replace(/#.*/, "").trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) continue;
  const [key, ...rest] = tokens;
  if (key === "form") form.name = rest.join(" ");
  else if (key === "each") form.each = rest[0];
  else form.fields.push({ name: key, how: rest.filter((token) => token !== "need" && token !== "many"), need: rest.includes("need"), many: rest.includes("many") });
}
if (!form.each) { console.error(`${formPath}: no "each" line — what is one card of?`); process.exit(1); }

// ── words: what is said about a line, as word@vocabulary
// The whole pile, and "contains": the pile narrowed to the steps said to be seen.
const pile = movesOf(lineIndex);
const contains = narrowed(pile, SEEN);
const containsIds = new Set(contains.all().map(({ via }) => via));
const vocabularies = new Set(pile.down(VOCABULARY).map(({ to }) => to));
// The words said about a line are up from it; a sense is a line down from its vocabulary to
// its word. The pile's own words (eoe: seen, source …) are markers, not words the data was
// found as, so they are left out.
const wordsKnown = new Map<number, string[]>();
function wordsOn(lineId?: number): string[] {
  if (lineId === undefined) return [];
  if (!wordsKnown.has(lineId)) {
    const words = new Set<string>();
    for (const { to } of pile.up(lineId)) {
      const sense = pile.stepOf(to);
      if (sense && vocabularies.has(sense.from) && sense.from !== SYSTEM && typeof sense.to === "string") words.add(`${sense.to}@${sense.from}`);
    }
    wordsKnown.set(lineId, [...words].sort());
  }
  return wordsKnown.get(lineId)!;
}
const plain = (word: string) => word.slice(0, word.lastIndexOf("@"));
// "host" matches host in any vocabulary; "host@IT" only IT's.
const says = (words: string[], asked: string) => words.some((word) => (asked.includes("@") ? word === asked : plain(word) === asked));
const named = (words: string[]) => [...new Set(words.map(plain))].join("/") || "part";
// Everything a string was found as: the words on every line into it.
const foundAs = (someString: string) => pile.up(someString)
  .filter(({ via, to }) => containsIds.has(via) || to === FILE_WORD).flatMap(({ via }) => wordsOn(via));

// ── moves: whole (up:seen) and part (down:seen), along seen steps, never back the way they came
type Step = { to: string; via?: number; toward?: "up" | "down" };
const MOVES: Record<string, (from: Step) => Step[]> = {
  whole: (from) => contains.up(from.to).filter(({ via }) => via !== from.via).map(({ via, to }) => ({ to: String(to), via, toward: "up" })),
  part: (from) => contains.down(from.to).filter(({ via }) => via !== from.via).map(({ via, to }) => ({ to: String(to), via, toward: "down" })),
};
const PHRASES: Record<string, string[]> = { beside: ["whole", "part"] };

function next(from: Step, spec: string): Step[] {
  const at = spec.search(/[:=]/);
  const [name, narrowing, word] = at < 0 ? [spec, "", ""] : [spec.slice(0, at), spec[at], spec.slice(at + 1)];
  const chain = PHRASES[name] ?? [name];
  let steps = [from];
  chain.forEach((move, i) => {
    if (!MOVES[move]) throw new Error(`no move "${move}"; the moves are ${Object.keys(MOVES).join(" ")}, the phrases ${Object.keys(PHRASES).join(" ")}`);
    steps = steps.flatMap(MOVES[move]);
    if (i === chain.length - 1 && narrowing === ":") steps = steps.filter((step) => says(wordsOn(step.via), word));
    if (i === chain.length - 1 && narrowing === "=") steps = steps.filter((step) => says(foundAs(step.to), word));
  });
  return steps;
}
function walk(start: string, specs: string[]): Step[][] {
  let rows: Step[][] = [[{ to: start }]];
  for (const spec of specs) {
    rows = rows.flatMap((row) => {
      // a phrase takes several moves; keep the steps in between, for the evidence
      const at = spec.search(/[:=]/), name = at < 0 ? spec : spec.slice(0, at);
      if (!PHRASES[name]) return next(row.at(-1)!, spec).map((step) => [...row, step]);
      const firsts = PHRASES[name].slice(0, -1).reduce((partial, move) => partial.flatMap((path) => MOVES[move](path.at(-1)!).map((step) => [...path, step])), [row]);
      const lastMove = PHRASES[name].at(-1)! + (at < 0 ? "" : spec.slice(at));
      return firsts.flatMap((path) => next(path.at(-1)!, lastMove).map((step) => [...path, step]));
    });
  }
  return rows;
}

// ── find (SPEC.md, section 8): a hop is a peak through seen steps, up to a whole and down to
// another part of it; a string passed through
// keeps its word, no kind of whole twice; slack lets a reading break those rules K times
const kindOf = (whole: string) => named(foundAs(whole)) === "part" ? "whole" : named(foundAs(whole));
type Hop = { whole: Step; part: Step; kind: string; breaks: string[] };
function find(start: string, target: string) {
  for (let slack = 0; slack <= maxSlack; slack++) {
    type Partial = { at: string; cameIn?: string[]; visited: Set<string>; hops: Hop[]; breakCount: number };
    let frontier: Partial[] = [{ at: start, visited: new Set([start]), hops: [], breakCount: 0 }];
    for (let hopCount = 1; hopCount <= maxHops && frontier.length; hopCount++) {
      const answers: Partial[] = [], further: Partial[] = [];
      for (const reading of frontier) for (const whole of MOVES.whole({ to: reading.at })) {
        const leaving = wordsOn(whole.via), kind = kindOf(whole.to), breaks: string[] = [];
        if (reading.cameIn && !leaving.some((word) => reading.cameIn!.includes(word)))
          breaks.push(`${shortText(reading.at)} is ${named(reading.cameIn)} on the way in, ${named(leaving)} on the way out`);
        if (reading.hops.some((hop) => hop.kind === kind)) breaks.push(`a second ${kind} in one reading`);
        if (reading.breakCount + breaks.length > slack) continue;
        for (const part of MOVES.part(whole)) {
          if (reading.visited.has(part.to)) continue;
          const arriving = wordsOn(part.via);
          const longer = { at: part.to, cameIn: arriving, visited: new Set([...reading.visited, part.to]), hops: [...reading.hops, { whole, part, kind, breaks }], breakCount: reading.breakCount + breaks.length };
          (says(arriving, target) ? answers : further).push(longer);
        }
      }
      if (answers.length) return answers;
      frontier = further;
    }
  }
  return [];
}

// ── filling a card
const shortText = (text: string) => { const first = text.split("\n")[0]; return JSON.stringify(first.length > 44 ? first.slice(0, 44) + "…" : first); };
type Value = { value: string; evidence: string; readings: number };

function fill(field: Field, anchor: string): Value[] {
  const byValue = new Map<string, Value>();
  const add = (value: string, evidence: string) => {
    const known = byValue.get(value);
    if (known) known.readings++;
    else byValue.set(value, { value, evidence, readings: 1 });
  };
  if (field.how[0] === "find") {
    for (const reading of find(anchor, field.how[1]))
      add(reading.at, reading.hops.map(({ whole, part, kind, breaks }) =>
        `${breaks.map((broken) => `⚠ ${broken}; `).join("")}${named(wordsOn(whole.via))} in ${kind} ${shortText(whole.to)} → ${named(wordsOn(part.via))}`).join(" ⇒ "));
  } else {
    for (const row of walk(anchor, field.how))
      add(row.at(-1)!.to, row.slice(1).map((step) =>
        step.toward === "up" ? `${named(wordsOn(step.via))} in ${shortText(step.to)}` : `→ ${named(wordsOn(step.via))}`).join(" "));
  }
  return [...byValue.values()];
}

// ── the cards: one per string found as the form's word
const anchors = [...new Set(contains.all().filter(({ via }) => says(wordsOn(via), form.each)).map(({ to }) => String(to)))]
  .filter((anchor) => !cardFilters.length || cardFilters.some((filter) => anchor.includes(filter))).sort();

const nameWidth = Math.max(...form.fields.map((field) => field.name.length));
const filled = new Map(form.fields.map((field) => [field.name, 0]));
const disregarded: { anchor: string; missing: string[] }[] = [];
let shown = 0;

for (const anchor of anchors) {
  const values = form.fields.map((field) => ({ field, found: fill(field, anchor) }));
  const missing = values.filter(({ field, found }) => field.need && !found.length).map(({ field }) => field.name);
  if (missing.length) { disregarded.push({ anchor, missing }); continue; }
  shown++;
  console.log(`\n── ${form.name}: ${anchor}`);
  for (const { field, found } of values) {
    if (found.length) filled.set(field.name, filled.get(field.name)! + 1);
    const label = field.name.padEnd(nameWidth);
    if (!found.length) { console.log(`  ${label}  —`); continue; }
    found.forEach(({ value, evidence, readings }, i) => {
      const more = readings > 1 ? `  (+${readings - 1} more reading${readings > 2 ? "s" : ""})` : "";
      console.log(`  ${i ? " ".repeat(nameWidth) : label}  ${shortText(value).padEnd(24)}  ${evidence}${more}`);
    });
    if (!field.many && found.length > 1) console.log(`  ${" ".repeat(nameWidth)}  ⚠ ${found.length} values where the form expects one`);
  }
}

const fillRates = form.fields.map((field) => `${field.name} ${filled.get(field.name)}/${shown}`).join(", ");
console.log(`\n${shown} ${form.name} card(s) from ${anchors.length} string(s) found as ${form.each}; filled: ${fillRates}`);
if (disregarded.length) {
  const listed = disregarded.slice(0, 12).map(({ anchor, missing }) => `${anchor} (no ${missing.join(", ")})`).join(", ");
  console.log(`${disregarded.length} disregarded: ${listed}${disregarded.length > 12 ? ", …" : ""}`);
}
