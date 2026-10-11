// MonoFlow 5 (simple) — streaming branching-entropy segmentation.
//
// One left-to-right pass. At each character the boundary signal is read
// from the model built from strictly-earlier characters, and only THEN is
// the character folded into the counts. Test, then train — so the signal
// is always honest (never scored against a model that has already seen it).
//
// Boundaries are surprise spikes. The robust form of "spike" is a RISE in
// branching entropy: inside a word each next character is predictable, so
// the branching entropy of the running context falls; at a word edge the
// word is complete and many things can follow, so it jumps up. We cut on
// that jump — a relative signal, so it survives the model warming up (an
// absolute threshold cannot: early on every context is unseen and looks
// maximally surprising).
//
// One short context length: short contexts recur often enough to give a
// reliable branching entropy.
//
// Success = character coverage: fraction of input characters that land
// inside a real dictionary word. Junk cannot hide in short tokens.

declare const process: { argv: string[] };
declare const require: (m: string) => any;

const { readFileSync, existsSync } = require("node:fs");

type Emitted = { text: string; start: number };

function numArg(name: string, fallback: number): number {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  const val = hit?.split("=")[1];
  return val === undefined ? fallback : Number(val);
}

function textArg(name: string): string | undefined {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit?.slice(`--${name}=`.length);
}

function resolvePath(file: string): string {
  if (file.includes("/") || file.includes("\\")) return file;
  const inCorpus = `corpus/${file}`;
  return existsSync(inCorpus) ? inCorpus : file;
}

const branchingContextLength = numArg("ent-order", 3); // context length for the entropy signal
const cutThreshold = numArg("margin", 0.8);    // bits of entropy RISE that cut
const minTokenLength = numArg("min-len", 2);   // shortest token a cut may end
const showChars = numArg("show", 300);
const dictPath = textArg("dict") ?? "/usr/share/dict/american-english";
const keepRaw = process.argv.includes("--raw");
const warmPath = textArg("warm");           // prime the model on this text first
const freeze = process.argv.includes("--freeze"); // stop learning on the target
const file = process.argv.slice(2).find(a => !a.startsWith("--"));

if (file === undefined) {
  throw new Error(
    "usage: monoflow5.ts <file> [--warm=FILE] [--freeze]"
    + " [--ent-order=3] [--margin=0.8] [--min-len=2] [--raw] [--show=300]",
  );
}

// Default: strip to lowercase a-z, no spaces — the hard task, recovering
// words from an unbroken letter stream. --raw keeps everything.
function normalize(value: string): string {
  const lower = value.toLowerCase().replace(/[\r\n]/g, "");
  return keepRaw ? lower : lower.replace(/[^a-z]/g, "");
}

const input = normalize(String(readFileSync(resolvePath(file), "utf8")));
const log2 = (x: number): number => Math.log(x) / Math.log(2);

// A char model at a given context length: counts of context -> next char.
function model() {
  const successors = new Map<string, Map<string, number>>();
  const contextTotals = new Map<string, number>();
  return {
    // Folds one transition in (the "train" half).
    learn(ctx: string, c: string): void {
      let row = successors.get(ctx);
      if (row === undefined) { row = new Map(); successors.set(ctx, row); }
      row.set(c, (row.get(c) ?? 0) + 1);
      contextTotals.set(ctx, (contextTotals.get(ctx) ?? 0) + 1);
    },
    // Branching entropy of ctx: spread of what follows it, in bits.
    entropy(ctx: string): number {
      const row = successors.get(ctx);
      const contextTotal = contextTotals.get(ctx) ?? 0;
      if (row === undefined || contextTotal === 0) return 0;
      let entropy = 0;
      for (const successorCount of row.values()) {
        const p = successorCount / contextTotal;
        entropy -= p * log2(p);
      }
      return entropy;
    },
  };
}

const branchingModel = model();

// Optional pre-warm: train the model on another text first (counts only —
// not segmented, not in the metric). This installs a prior; how well it
// helps depends on how much its structure overlaps the target.
if (warmPath !== undefined) {
  const warmText = normalize(String(readFileSync(resolvePath(warmPath), "utf8")));
  let warmBranchingContext = "";
  for (const c of warmText) {
    branchingModel.learn(warmBranchingContext, c);
    warmBranchingContext = (warmBranchingContext + c).slice(-branchingContextLength);
  }
}

// ---- the streaming pass over the target (fresh window, warm counts) ----
const tokens: Emitted[] = [];
let currentToken = "";
let currentTokenStart = 0;
let branchingContext = "";         // last `branchingContextLength` chars
let previousBranchingEntropy = 0;  // entropy at the previous position

for (let i = 0; i < input.length; i++) {
  const c = input[i];

  // TEST: read the entropy signal from past counts only.
  const branchingEntropy = branchingModel.entropy(branchingContext);

  // Cut when branching entropy RISES past the previous step by `cutThreshold`:
  // the running context just became a complete unit.
  if (
    currentToken.length >= minTokenLength
    && branchingEntropy - previousBranchingEntropy > cutThreshold
  ) {
    tokens.push({ text: currentToken, start: currentTokenStart });
    currentToken = "";
    currentTokenStart = i;
  }

  // TRAIN: fold c in, after reading (skipped under --freeze).
  if (!freeze) {
    branchingModel.learn(branchingContext, c);
  }

  currentToken += c;
  previousBranchingEntropy = branchingEntropy;
  branchingContext = (branchingContext + c).slice(-branchingContextLength);
}
if (currentToken.length > 0) {
  tokens.push({ text: currentToken, start: currentTokenStart });
}

// ---- character-coverage metric ----
let dictionary: Set<string> | undefined;
if (existsSync(dictPath)) {
  dictionary = new Set(
    String(readFileSync(dictPath, "utf8"))
      .split(/\r?\n/)
      .map((w: string) => w.trim().toLowerCase())
      .filter((w: string) => w.length > 0),
  );
}

const total = input.length;
const buckets = 10;
const coveredPerDecile = new Array(buckets).fill(0);
const totalPerDecile = new Array(buckets).fill(0);
let coveredCharCount = 0;
let dictionaryTokenCount = 0;

for (const token of tokens) {
  const isWord = dictionary?.has(token.text) ?? false;
  if (isWord) { coveredCharCount += token.text.length; dictionaryTokenCount++; }
  for (let k = 0; k < token.text.length; k++) {
    const b = Math.min(buckets - 1, Math.floor(((token.start + k) / total) * buckets));
    totalPerDecile[b]++;
    if (isWord) coveredPerDecile[b]++;
  }
}

const pct = (n: number, d: number): string =>
  d === 0 ? "  0.0" : (100 * n / d).toFixed(1).padStart(5);

// ---- report ----
console.log(`file        ${resolvePath(file)}  (${total} chars)`);
console.log(`params      ent-order=${branchingContextLength} `
  + `margin=${cutThreshold} min-len=${minTokenLength}`
  + `${keepRaw ? " raw" : ""}`);
if (warmPath !== undefined) {
  console.log(`warmup      ${resolvePath(warmPath)}`
    + `${freeze ? " (frozen: no learning on target)" : " (then keeps learning)"}`);
}
console.log(`tokens      ${tokens.length}`);

if (dictionary === undefined) {
  console.log(`coverage    (dictionary not found at ${dictPath})`);
} else {
  console.log(`coverage    ${pct(coveredCharCount, total)}%  `
    + `(${coveredCharCount}/${total} chars inside dictionary words)`);
  console.log(`precision   ${pct(dictionaryTokenCount, tokens.length)}%  `
    + `(${dictionaryTokenCount}/${tokens.length} tokens are words)`);
  const curve = coveredPerDecile
    .map((covered, i) => pct(covered, totalPerDecile[i]).trim())
    .join(" ");
  console.log(`learn curve ${curve}   (coverage % across 10 stream deciles)`);
}

const preview = tokens
  .filter(token => token.start < showChars)
  .map(token => token.text)
  .join("|");
console.log(`segmentation ${preview}${input.length > showChars ? " …" : ""}`);

export {};
