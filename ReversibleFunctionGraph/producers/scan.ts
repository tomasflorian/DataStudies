#!/usr/bin/env node
// scan.ts — a cutter. Atom lines in, atom lines out, nothing read off disk.
//
//   cat check/after.atoms | npx tsx producers/scan.ts
//   npx tsx producers/scan.ts < pile.atoms | ./merge.sh pile.atoms
//
// This is the cutter the whole refactor was for. A Notes field was written down
// whole at intake because nobody knew what was in it; this reads what is in it,
// later, off the value already sitting in the pile. It is in TypeScript while
// the other cutter is in C#, which is the point — the pile cannot tell them
// apart and neither can the graph.
//
// WHAT IT RUNS ON. Two rules, and both are this cutter's own business — a
// cutter that reads its policy out of the pile is a cutter coordinating with
// other cutters, and nothing else here does that:
//
//   ipIn, emailIn, urlIn   values a `Notes` call produced
//   host                   values an `emailIn` or `urlIn` call produced
//
// The second rule is why running this TWICE finds more than running it once.
// On the first pass no urlIn atom exists yet, so `host` matches nothing. The
// pass writes some, and the next pass reads them. A third pass finds nothing new
// and that is the fixed point. Nobody scheduled those waves — they fall out of
// re-running, which is the whole scheduling story.
//
// ONE LINE PER FINDING. A note with two IPs is two lines, same function, same
// note:
//
//   ["ipIn", <the note>, "10.20.30.1"]
//   ["ipIn", <the note>, "10.20.30.7"]
//
// Walk `ipIn` forward from a note to reach its IPs; `rev_ipIn` back from an IP
// to reach the notes it sits in.
//
// `host` has one answer, because a URL has exactly one host. It is also where
// the collisions are: two different addresses,
//
//   alice@larkfield.example        in one record
//   pixvault@larkfield.example     in another
//
// land on ONE larkfield.example node, and nobody wrote that down.
//
// WHAT IT DOES NOT DO. It does not hunt bare hostnames in prose. `voipline.example`
// sitting in a note as plain text is a real finding this misses, and the rule
// that would catch it also catches `alice_larkfield.pfx`, `passwords.docx` and
// `desktop.ini` — guessing dressed as recognition. A host is taken only from a
// URL or an address, where the shape says so. Left for a cutter that can check a
// candidate against hosts the pile already knows, which is a different move.
//
// THE TWO RULES. Pure: no clock, no counter, no randomness — same atoms in, same
// atoms out. Monotone: it only ever asks what IS in the pile, never what is
// missing, so a bigger pile can only get you more and the order cutters run in
// does not change where they land.

import { parse, format, brokenNote } from "../expand.js";
import type { Atom } from "../expand.js";

// --- the recognisers ---------------------------------------------------------

const IP = /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z0-9-]+/g;
const URL = /https?:\/\/[^\s<>"']+/g;

// A URL at the end of a sentence swallows the full stop. Trailing punctuation is
// the writing around the URL, not part of it.
const trimTail = (s: string): string => s.replace(/[.,;:!?)\]}]+$/, "");

const find = (text: string, re: RegExp): string[] =>
  [...new Set((text.match(re) ?? []).map(trimTail))].filter(Boolean);

// One function per name, each returning every answer it has.
const ipIn = (note: string): string[] => find(note, IP);
const emailIn = (note: string): string[] => find(note, EMAIL);
const urlIn = (note: string): string[] => find(note, URL);

// The host of a URL or of an address. One answer or none.
function hostOf(value: string): string | null {
  const url = value.match(/^https?:\/\/([^/?#]+)/);
  if (url) return url[1].split("@").pop()!.split(":")[0] || null;
  if (/^[^\s@]+@[^\s@]+$/.test(value)) return value.split("@").pop()!.split(":")[0] || null;
  return null;
}

// --- read the pile -----------------------------------------------------------

const text = await new Promise<string>(resolve => {
  let buf = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", d => (buf += d));
  process.stdin.on("end", () => resolve(buf));
});

const { atoms: held, broken } = parse(text);
if (broken.length) console.error(brokenNote(broken, "scan"));

// The selection, and the whole of it. `producedBy` is one hop, and the hop is
// sitting in slot 0 of the line — no graph needed to read it.
const producedBy = (fn: string): string[] =>
  [...new Set(held.filter(a => a[0] === fn).map(a => a[2]))];

const notes = producedBy("Notes");
const found = [...new Set([...producedBy("emailIn"), ...producedBy("urlIn")])];

// --- write what is there -----------------------------------------------------

const out: Atom[] = [];
const seen = new Set<string>();
const add = (atom: Atom): void => {
  const key = JSON.stringify(atom);
  if (!seen.has(key)) { seen.add(key); out.push(atom); }
};

for (const note of notes) {
  for (const ip of ipIn(note)) add(["ipIn", note, ip]);
  for (const email of emailIn(note)) add(["emailIn", note, email]);
  for (const url of urlIn(note)) add(["urlIn", note, url]);
}

for (const value of found) {
  const host = hostOf(value);
  if (host) add(["host", value, host]);
}

process.stdout.write(out.length ? format(out) : "");
console.error(
  `${notes.length} note(s), ${found.length} address(es)/url(s) -> ` +
  `${out.length} atom(s): ` +
  ["ipIn", "emailIn", "urlIn", "host"].map(f => `${f} ${out.filter(a => a[0] === f).length}`).join(", "),
);
