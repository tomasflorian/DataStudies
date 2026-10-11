#!/usr/bin/env node
// shortstring.ts — a cutter that cuts nothing. Atom lines in, atom lines out.
//
//   cat check/scanned.atoms | npx tsx producers/shortstring.ts
//
// It marks the values that read like a word somebody typed rather than a
// generated string, a number, or a page of text:
//
//   ["IsShortString", "Home", "Home"]
//
// The self-returning shape isIP, hasFormat and isblob already use. It mints no
// new value — the answer is a node that was in the pile already — so it adds
// arrows and never boxes, and reaches its fixed point in one pass.
//
// THE RULE: shorter than ten characters, letters and digits only, and at least
// one letter.
//
//   length < 10               "Quillspec" yes, "Alice-hyperv" no
//   letters and digits only   "voip2016" yes, "Recovery\\" no, "PC." no, "(way" no
//   holds a letter            "2016" no, "((" no, "10.20.30.1" no
//
// A digit may sit anywhere in it. A special character disqualifies the value
// wherever it sits, edge or middle — so "hyper-v" and "doesn't" are out along
// with "Key:". If interior punctuation was meant to be allowed and only the
// edges refused, that is one line: strip the anchors and test the ends instead.
//
// WHAT IT RUNS ON: every value in the pile — every argument and every result.
// That is the most monotone selection there is, because nothing is ever left out
// on the strength of something else being present. The tempting narrowing,
// "every value except the blobs", is the trap: a value would stop being marked
// the moment something tagged it, and a bigger pile would produce fewer atoms.
// The blobs fall out on their own here, being rather longer than ten characters.
//
// It reads the pile to decide WHAT TO CALL and never to decide what the ANSWER
// is: the answer is a fact about the string by itself, so it comes out the same
// on anyone's pile.

import { parse, format } from "../expand.js";
import type { Atom } from "../expand.js";

const MAX = 10;
const isShortString = (v: string): boolean =>
  v.length < MAX && /^[\p{L}\p{N}]+$/u.test(v) && /\p{L}/u.test(v);

const text = await new Promise<string>(resolve => {
  let buf = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", d => (buf += d));
  process.stdin.on("end", () => resolve(buf));
});

let held: Atom[];
try { held = parse(text); }
catch (e) { console.error("not atom lines:", (e as Error).message); process.exit(1); }

// slot 0 is the function; everything after it is a value in some position
const values = [...new Set(held.flatMap(a => a.slice(1)))];
const out: Atom[] = values.filter(isShortString).map(v => ["IsShortString", v, v]);

process.stdout.write(out.length ? format(out) : "");
console.error(`${values.length} value(s) -> ${out.length} short string(s)`);
