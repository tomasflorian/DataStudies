// MonoFlow 6 — boundary-constrained BPE (cut + merge hybrid).
//
// The merge side of MonoFlow, fenced by the cut side. Two stages:
//
//   1. CUT (streaming): a single prequential pass marks high-confidence
//      boundaries — positions where branching entropy spikes hard (a big
//      RISE, controlled by --boundary-margin). These are "a word almost
//      certainly ends here."
//
//   2. MERGE (block, BPE): repeatedly merge the most frequent adjacent pair,
//      exactly like Byte-Pair Encoding — EXCEPT a merge is forbidden if the
//      two tokens meet at a boundary. So BPE builds words up freely inside a
//      region but can never glue across a likely word edge (plain BPE will
//      happily merge the `e·c` across "the·cat"; this cannot).
//
// Idea: plain BPE ~45% word coverage is capped partly by cross-boundary
// merges. Only the strongest, sparsest boundaries are used, so real merges
// are rarely blocked. --plain drops the fence (= vanilla BPE) for A/B.
//
// Block/multi-pass, so it trades monoflow5's streaming for BPE-style quality.
// Success = clean coverage: chars inside dictionary words of length >= min-word
// (the >=3 floor dodges the polluted 1-2 char dictionary entries).

declare const process: { argv: string[] };
declare const require: (m: string) => any;
const { readFileSync, existsSync } = require("node:fs");

type Token = { text: string; start: number };

function numArg(name: string, fallback: number): number {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit === undefined ? fallback : Number(hit.split("=")[1]);
}
function textArg(name: string): string | undefined {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit?.slice(`--${name}=`.length);
}
function resolvePath(f: string): string {
  return existsSync(`corpus/${f}`) ? `corpus/${f}` : f;
}

const merges = numArg("merges", 1500);              // BPE merge steps
const boundaryMargin = numArg("boundary-margin", 2); // entropy RISE that fences
const branchingContextLength = numArg("ent-order", 3);
const minWordLength = numArg("min-word", 3);        // clean-coverage floor
const showChars = numArg("show", 300);
const dictPath = textArg("dict") ?? "/usr/share/dict/american-english";
const plain = process.argv.includes("--plain");     // drop the fence = vanilla BPE
const file = process.argv.slice(2).find(a => !a.startsWith("--"));

if (file === undefined) {
  throw new Error(
    "usage: monoflow6.ts <file> [--merges=1000] [--boundary-margin=2]"
    + " [--ent-order=3] [--min-word=3] [--plain] [--show=300]",
  );
}

const input = String(readFileSync(resolvePath(file), "utf8"))
  .toLowerCase().replace(/[^a-z]/g, ""); // a-z only, the hard spaceless task
const log2 = (x: number): number => Math.log(x) / Math.log(2);

// ---- stage 1: branching-entropy boundaries (streaming, prequential) ----
// Returns the set of character offsets that a merge may not cross.
function boundaries(text: string): Set<number> {
  const successors = new Map<string, Map<string, number>>();
  const totals = new Map<string, number>();
  const entropy = (ctx: string): number => {
    const row = successors.get(ctx);
    const total = totals.get(ctx) ?? 0;
    if (row === undefined || total === 0) return 0;
    let h = 0;
    for (const n of row.values()) { const p = n / total; h -= p * log2(p); }
    return h;
  };
  const cuts = new Set<number>();
  let context = "";
  let previous = 0;
  for (let i = 0; i < text.length; i++) {
    const h = entropy(context);
    if (h - previous > boundaryMargin) cuts.add(i); // boundary before i
    let row = successors.get(context);
    if (row === undefined) { row = new Map(); successors.set(context, row); }
    row.set(text[i], (row.get(text[i]) ?? 0) + 1);
    totals.set(context, (totals.get(context) ?? 0) + 1);
    context = (context + text[i]).slice(-branchingContextLength);
    previous = h;
  }
  return cuts;
}

const fence = plain ? new Set<number>() : boundaries(input);

// ---- stage 2: boundary-constrained BPE ----
const SEP = " ";
let seq: Token[] = [...input].map((c, i) => ({ text: c, start: i }));
// A junction may be merged unless the right token starts on a fence offset.
const mergeable = (right: Token): boolean => !fence.has(right.start);

for (let step = 0; step < merges; step++) {
  const counts = new Map<string, number>();
  for (let i = 0; i < seq.length - 1; i++) {
    if (!mergeable(seq[i + 1])) continue;
    const key = seq[i].text + SEP + seq[i + 1].text;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best = "";
  let bestCount = 1; // need a pair seen at least twice to be worth merging
  for (const [k, c] of counts) if (c > bestCount) { bestCount = c; best = k; }
  if (best === "") break;

  const [a, b] = best.split(SEP);
  const next: Token[] = [];
  for (let i = 0; i < seq.length;) {
    if (i < seq.length - 1 && seq[i].text === a && seq[i + 1].text === b && mergeable(seq[i + 1])) {
      next.push({ text: a + b, start: seq[i].start });
      i += 2;
    } else {
      next.push(seq[i]);
      i++;
    }
  }
  seq = next;
}

// ---- clean-coverage metric ----
let dictionary: Set<string> | undefined;
if (existsSync(dictPath)) {
  dictionary = new Set(
    String(readFileSync(dictPath, "utf8"))
      .split(/\r?\n/).map((w: string) => w.trim().toLowerCase()).filter(Boolean),
  );
}

let coveredChars = 0;
let wordTokens = 0;
let totalLen = 0;
for (const t of seq) {
  totalLen += t.text.length;
  if (t.text.length >= minWordLength && dictionary?.has(t.text)) {
    coveredChars += t.text.length;
    wordTokens++;
  }
}
const pct = (n: number, d: number): string => d === 0 ? "0.0" : (100 * n / d).toFixed(1);

// ---- report ----
console.log(`file        ${resolvePath(file)}  (${input.length} chars, a-z)`);
console.log(plain
  ? `params      merges=${merges} PLAIN (no boundary fence) min-word=${minWordLength}`
  : `params      merges=${merges} boundary-margin=${boundaryMargin} `
    + `ent-order=${branchingContextLength} min-word=${minWordLength}`);
if (!plain) {
  console.log(`boundaries  ${fence.size}  (1 per ${(input.length / fence.size).toFixed(1)} chars)`);
}
console.log(`tokens      ${seq.length}  (mean-len ${(totalLen / seq.length).toFixed(2)})`);
if (dictionary === undefined) {
  console.log(`coverage    (dictionary not found at ${dictPath})`);
} else {
  console.log(`coverage    ${pct(coveredChars, input.length)}%  `
    + `(chars inside dictionary words of length >= ${minWordLength})`);
  console.log(`precision   ${pct(wordTokens, seq.length)}%  (tokens that are words)`);
}

const preview = seq.filter(t => t.start < showChars).map(t => t.text).join("|");
console.log(`segmentation ${preview}${input.length > showChars ? " …" : ""}`);

export {};
