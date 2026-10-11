#!/usr/bin/env node
// entropy.ts — a cutter. Which strings look like they were generated rather
// than written?
//
//   cat check/scanned.atoms | npx tsx producers/entropy.ts
//   npx tsx producers/entropy.ts --from Notes,Password
//
// This was `local/entropy.ts`, a tool that read a file and printed the fifty
// highest-scoring words to a terminal. Printing atoms instead puts the score in
// the graph, where it can be walked, sorted in the table, and collided with.
//
// TOP FIFTY HAD TO GO, AND THE REASON IS THE MONOTONE RULE.
//
// A rank is a fact about the rest of the pile. Add atoms and a word that was
// 50th is 51st, so a BIGGER pile produces FEWER findings — and then the graph
// depends on the order the cutters ran in, which is the one thing this design
// pays to avoid.
//
// AND NOTHING TOOK ITS PLACE. Every word is scored. A cut-off would have been
// monotone and still wrong: it decides what is interesting before anything has
// had a chance to collide, which is the decision this whole project defers.
// Nothing is thrown away here for looking like junk — a low score is a fact
// about a word, and "every word in the pile that scores 3.0" is a group worth
// being able to click. Entropy cannot tell a secret from a URL and is not
// trying to; it says look here, and looking is still yours.
//
// WHAT IT RUNS ON. Values produced by one of --from, which defaults to the
// fields worth reading. Positive selection, and it has to be: the tempting rule
// is "every value EXCEPT the blobs", and that one breaks the monotone rule,
// because a value would stop being scored the moment something tagged it
// isblob. A cutter may look at what is in the pile. Never at what is missing —
// and never at what is missing by way of what appeared.
//
// TWO FUNCTIONS OUT:
//
//   ["wordIn",  <the value>, "Kp9mVt2Xz7Lq4Rb", "Kp9mVt2Xz7Lq4Rb"]
//   ["entropy", "Kp9mVt2Xz7Lq4Rb", "4.0"]
//
// THE SCORE IS ROUNDED TO THE NEAREST HALF BIT, AND THAT IS THE WHOLE POINT.
// 3.9067 and 3.9068 are two nodes that nothing will ever meet at; "4.0" is one
// node with every generated-looking string in the pile hanging off it. A score
// nobody shares connects nothing, and connecting is what a node is for. Rounding
// is not a display choice here — it decides whether the fact can collide.
//
// The threshold below still reads the exact score, so the knob stays continuous
// while what gets written down is coarse.
//
// wordIn is membership, so a value with forty interesting words is forty calls
// and never one call with forty answers. entropy is the plain form — a word has
// one score — so the walk table can carry it as a column and sort on it.
//
// Splitting a value into words is arguably its own cutter, and if anything else
// ever wants words it should become one. It is here because nothing else wants
// them yet.

import { parse, format } from "../expand.js";
import type { Atom } from "../expand.js";

const argv = process.argv.slice(2);
const opt = (name: string, fallback: string): string => {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : fallback;
};

const FROM = opt("--from", "Notes,Password,Username").split(",").map(s => s.trim()).filter(Boolean);

// Shannon entropy over the characters of one string, in bits. Unchanged from the
// tool this came from.
function entropy(word: string): number {
  const counts = new Map<string, number>();
  for (const character of word) counts.set(character, (counts.get(character) ?? 0) + 1);
  let score = 0;
  for (const count of counts.values()) {
    const probability = count / word.length;
    score -= probability * Math.log2(probability);
  }
  return score;
}

const text = await new Promise<string>(resolve => {
  let buf = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", d => (buf += d));
  process.stdin.on("end", () => resolve(buf));
});

let held: Atom[];
try { held = parse(text); }
catch (e) { console.error("not atom lines:", (e as Error).message); process.exit(1); }

const values = [...new Set(
  held.filter(a => FROM.includes(a[0])).map(a => a[a.length - 1]),
)];

const out: Atom[] = [];
const seen = new Set<string>();
const add = (atom: Atom): void => {
  const key = JSON.stringify(atom);
  if (!seen.has(key)) { seen.add(key); out.push(atom); }
};

let looked = 0;
for (const value of values) {
  for (const word of new Set(value.split(/\s+/).filter(Boolean))) {
    looked++;
    const score = entropy(word);
    add(["wordIn", value, word, word]);
    add(["entropy", word, (Math.round(score * 2) / 2).toFixed(1)]);
  }
}

process.stdout.write(out.length ? format(out) : "");
console.error(
  `${values.length} value(s), ${looked} word(s) -> ${out.length} atom(s) in ` +
  `${new Set(out.filter(a => a[0] === "entropy").map(a => a[2])).size} bucket(s)`,
);
