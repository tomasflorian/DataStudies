#!/usr/bin/env node
// cut.ts — cut pile/introduced, in memory.
//
//   ./cut.ts                          cut, say what came out, keep nothing
//   ./cut.ts --debug                  and write the cut to pile/cut
//   ./cut.ts --debug=/dev/shm/sw      ...or somewhere else
//   ./cut.ts --introduce mine.pile    and one more pile, for this cut only
//   ./cut.ts --timing                 and how long each step took, on stderr
//
// ONE DIRECTORY IS KEPT, AND THE CUT IS NOT STORED AT ALL.
//
//   pile/introduced/   what nothing can regenerate: a raw document brought in
//                      whole, or lines a person wrote by hand. Kept.
//   the cut            what the reader reads. Built in memory every time, and
//                      gone with the process.
//
// Introducing is copying. It can only be wrong by copying wrong, which is why it
// is the one step whose output is kept. Cutting is interpretation, and it will
// be wrong sometimes — so a cutter's mistake is never a data problem, only a
// bug to fix before the next cut.
//
// A CUT starts from every introduced pile, then runs every cutter over what it
// holds until a round changes nothing. It always starts from empty: a cutter
// that reads its own old output can keep a line alive after the bug that wrote
// it is gone.
//
// A PILE IS A NAMED LIST OF LINES, NOT A FILE. The cut is a map from name to
// lines — `_rfg.pile`, `email.pile` — so the names still say who wrote what, and
// none of it needs a disk to say so.
//
// A CUTTER IS A FUNCTION. `cutters/email.ts` is the cutter `email`: it exports a
// function from every line of the cut to its own lines, kept as `email.pile`.
// Nothing registers it. Every round it is handed everything cut so far,
// including what it returned the round before, and its pile is replaced.
//
// IN MEMORY, SO A DOCUMENT IS ONE STRING. A document can sit in hundreds of
// lines — every record cut from it says where it came from — and handed to a
// function, each of those lines holds the same string rather than a copy of it.
// Through a pipe every line would be the whole document written out again, and
// read back in again, on every round: the cost grew with the square of the
// document. Every string is kept once, so equal text is always the same string,
// and every line is frozen, because a cutter is handed lines it must not change.
//
// It is loaded with require, so the whole cut stays one blocking run with no
// await in it, and it runs under plain node, which strips the types itself — so
// a cutter's local import is spelled with its real extension, `../stringwalk.ts`.
//
// ANY OTHER PROGRAM IS STILL A CUTTER. An executable file in cutters/ that is not
// .ts — `cutters/hosts.py` — is run as a process: every line of the cut on stdin
// as JSON, its own lines on stdout. It pays for the pipe that a function does not.
//
// NOT STORED, because a stored cut is a second copy of everything introduced,
// in plain text, still on disk after you stopped reading. The reader cuts on
// every start anyway, so a stored cut never saved anything.
//
// --debug WRITES IT, to pile/cut or to --debug=<dir>, cleared of .pile files
// first so a dump is never old and new mixed together. A cut that fails under
// --debug writes what it had when it failed, which is when you want to look.
// Every cut deletes pile/cut first, so a dump you forgot does not stay.
//
// THE UNDERSCORE. An introduced pile is named `_something.pile`, and a cutter
// may not be named `_anything`, so the two can never land on one name. That is
// all the underscore does: inside the cut every pile is read the same.
//
// INTRODUCED FOR ONE CUT. `--introduce mine.pile` is introduced exactly the way
// pile/introduced is — `_mine.pile` in the cut, run past every cutter — and
// simply not kept.

import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, statSync } from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { checkLine, parse, type Line } from "./stringwalk.ts";

const HERE = import.meta.dirname;
export const INTRODUCED = join(HERE, "pile", "introduced");
export const DEBUG = join(HERE, "pile", "cut");
const CUTTERS = join(HERE, "cutters");
const load = createRequire(import.meta.url);

// A cutter that mints new values out of its own output never stops changing.
const ROUNDS = 20;

const pilesIn = (dir: string): string[] =>
  existsSync(dir) ? readdirSync(dir).filter(n => n.endsWith(".pile")).sort() : [];

export interface Flags { introduce: string[]; debug: string | null; timing: boolean }

// `--introduce <path>` or `--introduce=<path>`, as many as given, and `--debug`
// or `--debug=<dir>`, taken out of argv so whatever reads the rest never sees
// them. One parser for cut.ts and sw.ts, so a flag cannot mean two things.
// `--debug` never takes the next argument: that is where sw.ts's script goes.
export function takeFlags(argv: string[]): Flags {
  const flags: Flags = { introduce: [], debug: null, timing: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--timing") { flags.timing = true; argv.splice(i--, 1); continue; }
    if (a === "--debug" || a.startsWith("--debug=")) {
      const dir = a.slice("--debug=".length);
      if (a !== "--debug" && !dir) throw new Error("--debug=<dir>, or --debug for pile/cut");
      flags.debug = a === "--debug" ? DEBUG : resolve(dir);
      argv.splice(i--, 1);
      continue;
    }
    const eq = a.startsWith("--introduce=");
    if (a !== "--introduce" && !eq) continue;
    const path = eq ? a.slice("--introduce=".length) : argv[i + 1];
    if (!path) throw new Error("--introduce <file>");
    argv.splice(i--, eq ? 1 : 2);
    flags.introduce.push(path);
  }
  return flags;
}

// A directory as a person would type it: relative when it is under here.
const shown = (dir: string): string => {
  const r = relative(process.cwd(), dir);
  return !r ? "." : r.startsWith("..") ? dir : r;
};

// Only .pile files are cleared, so pointing --debug at a directory that holds
// anything else costs nothing but the piles. Readable by you and nobody else.
// An introduced pile is written as the text it was read from; anything a cutter
// made is written a line at a time.
function dump(dir: string, piles: Map<string, readonly unknown[]>, texts: Map<string, string>): void {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  for (const n of pilesIn(dir)) rmSync(join(dir, n));
  for (const [n, lines] of piles)
    writeFileSync(join(dir, n), texts.get(n) ?? lines.map(l => JSON.stringify(l) + "\n").join(""),
      { mode: 0o600 });
}

// --timing. How long each step took, on stderr so a transcript never changes.
// A step is everything since the step before it, so the steps add up to the
// whole — and performance.now() counts from the moment node started, so the
// first step includes starting node and loading the code. An aside is there for
// scale: shown, run outside the steps, and left out of the total.
export interface Timing {
  lap(step: string, note?: string): void;
  aside(step: string, run: () => void): void;
  print(): void;
}

export function timing(on: boolean): Timing {
  const rows: { step: string; ms: number; note: string }[] = [];
  let last = 0;
  let total = 0;
  return {
    lap(step, note = "") {
      const now = performance.now();
      if (on) rows.push({ step, ms: now - last, note });
      total += now - last;
      last = now;
    },
    aside(step, run) {
      if (!on) return;
      const t = performance.now();
      run();
      const ms = performance.now() - t;
      rows.push({ step: `(${step})`, ms, note: "not in the total" });
      last += ms;
    },
    print() {
      if (!on) return;
      const w = Math.max(5, ...rows.map(r => r.step.length));
      const row = (step: string, ms: number, note: string) =>
        console.error(`  ${step.padEnd(w + 2)}${ms.toFixed(0).padStart(6)} ms   ${note}`.trimEnd());
      for (const r of rows) row(r.step, r.ms, r.note);
      row("total", total, "");
    },
  };
}

const chars = (n: number): string =>
  n < 1e6 ? `${(n / 1e3).toFixed(0)}k chars` : `${(n / 1e6).toFixed(1)}M chars`;

// EVERY STRING ONCE, EVERY LINE FROZEN. After this, text that is equal is the
// same string, so comparing two lines is comparing references, and a document in
// four hundred lines is still one document in memory.
function keeper(): (line: Line) => Line {
  const strings = new Map<string, string>();
  const one = (s: string): string => {
    const got = strings.get(s);
    if (got !== undefined) return got;
    strings.set(s, s);
    return s;
  };
  return ([a, rel, b]) => Object.freeze([one(a), one(rel), one(b)]) as unknown as Line;
}

const same = (a: readonly Line[], b: readonly Line[]): boolean =>
  a.length === b.length &&
  a.every((l, i) => l[0] === b[i][0] && l[1] === b[i][1] && l[2] === b[i][2]);

interface Cutter { name: string; file: string; run: (lines: readonly Line[]) => unknown }

// A .ts file is a function to call; any other executable file is a program to
// run. Anything else in cutters/ is not a cutter.
function findCutters(): Cutter[] {
  if (!existsSync(CUTTERS)) return [];
  const found: Cutter[] = [];
  for (const file of readdirSync(CUTTERS).sort()) {
    const path = join(CUTTERS, file);
    if (file.startsWith(".") || !statSync(path).isFile()) continue;
    const name = basename(file, extname(file));
    const where = `cutters/${file}`;
    if (name.startsWith("_"))
      throw new Error(`${where} — a cutter may not start with _\n  that name belongs to introduced files`);
    if (found.some(c => c.name === name))
      throw new Error(`${where} — there is already a cutter named ${name}`);

    if (file.endsWith(".ts")) {
      let fn: unknown;
      try { fn = load(path).default; }
      catch (e) { throw new Error(`${where} could not be loaded — ${(e as Error).message}`); }
      if (typeof fn !== "function")
        throw new Error(`${where} — a cutter exports a default function from lines to lines`);
      found.push({ name, file: where, run: fn as Cutter["run"] });
    } else if (statSync(path).mode & 0o111) {
      found.push({ name, file: where, run: lines => runProgram(path, where, lines) });
    }
  }
  return found;
}

// A cutter that is a program: every line of the cut on stdin, its own on stdout.
// It may stop reading before its input ends — it may not need the input at all —
// and that is not a failure. Exiting badly is.
function runProgram(path: string, where: string, lines: readonly Line[]): Line[] {
  const r = spawnSync(path, [], {
    input: lines.map(l => JSON.stringify(l) + "\n").join(""),
    encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["pipe", "pipe", "inherit"],
  });
  if (r.error && (r.error as NodeJS.ErrnoException).code !== "EPIPE")
    throw new Error(`${where}: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`${where} exited ${r.status ?? r.signal}`);
  return parse(r.stdout ?? "");
}

export interface Cut {
  piles: Map<string, readonly Line[]>;
  introduced: string[];
  cutters: string[];
  rounds: number;
}

export function cut({ introduce = [], debug = null }: Partial<Flags> = {},
                    time: Timing = timing(false)): Cut {
  rmSync(DEBUG, { recursive: true, force: true });

  const introduced = pilesIn(INTRODUCED);
  const stray = introduced.filter(n => !n.startsWith("_"));
  if (stray.length)
    throw new Error(`pile/introduced: ${stray.join(", ")} — an introduced file is named _<name>.pile` +
      `\n  so it can never share a name with a cutter's output`);

  const cutters = findCutters();
  time.lap("load cutters", cutters.map(c => c.file).join(" · "));

  const keep = keeper();
  const piles = new Map<string, readonly Line[]>();
  const texts = new Map<string, string>();
  const take = (name: string, text: string, where: string) => {
    texts.set(name, text);
    try { piles.set(name, parse(text).map(keep)); }
    catch (e) { throw new Error(`${where} — ${(e as Error).message}`); }
  };

  let read = 0;
  for (const n of introduced) {
    const text = readFileSync(join(INTRODUCED, n), "utf8");
    read += text.length;
    take(n, text, `pile/introduced/${n}`);
  }
  time.lap("read and parse pile/introduced", `${introduced.length} file(s) · ${chars(read)}`);

  // Read rather than copied, so `--introduce <(producer)` works.
  for (const path of introduce) {
    const name = "_" + basename(path).replace(/^_/, "").replace(/\.pile$/, "") + ".pile";
    if (piles.has(name))
      throw new Error(`--introduce ${path}: ${name} is already introduced · rename one of them`);
    if (!existsSync(path)) throw new Error(`--introduce ${path}: no such file`);
    take(name, readFileSync(path, "utf8"), `--introduce ${path}`);
  }
  if (introduce.length)
    time.lap("read and parse --introduce", `${introduce.length} pile(s), waiting on whatever produces them`);

  let rounds = 0;
  try {
    for (let changed = cutters.length > 0; changed; ) {
      if (++rounds > ROUNDS)
        throw new Error(`still changing after ${ROUNDS} rounds — ` +
          `a cutter is probably minting values out of its own output`);
      changed = false;
      for (const cutter of cutters) {
        const input = [...piles.keys()].sort().flatMap(n => piles.get(n)!);
        time.lap(`round ${rounds} · ${cutter.name} · gather`, `${input.length} lines`);

        let out: unknown;
        try { out = cutter.run(input); }
        catch (e) { throw new Error(`${cutter.file} failed — ${(e as Error).message}`); }
        const got = Array.isArray(out) ? out : [];
        time.lap(`round ${rounds} · ${cutter.name} · run`, `returned ${got.length} lines`);

        const pile = cutter.name + ".pile";
        const before = piles.get(pile) ?? [];
        piles.set(pile, got as Line[]);        // kept even when bad, so a dump shows it
        if (!Array.isArray(out)) throw new Error(`${cutter.file} returned no list of lines`);
        const kept = got.map((l, i) =>
          keep(checkLine(l, `${cutter.file} wrote a bad line — line ${i + 1}: ` +
            `${String(JSON.stringify(l)).slice(0, 60)}`)));
        if (!same(before, kept)) changed = true;
        piles.set(pile, kept);
        time.lap(`round ${rounds} · ${cutter.name} · check`);
      }
    }
  } catch (e) {
    if (debug) {
      dump(debug, piles, texts);
      (e as Error).message += `\n  the cut so far is in ${shown(debug)}`;
    }
    throw e;
  }

  if (debug) { dump(debug, piles, texts); time.lap("write the --debug dump"); }
  return { piles, introduced: [...piles.keys()].filter(n => n.startsWith("_")), cutters: cutters.map(c => c.name), rounds };
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  try {
    const flags = takeFlags(process.argv);
    const time = timing(flags.timing);
    time.lap("start node, load cut.ts");
    const c = cut(flags, time);
    const names = [...c.piles.keys()].sort();
    const w = Math.max(0, ...names.map(n => n.length));
    console.log(`  ${c.introduced.length} introduced · ${c.cutters.length} cutter(s)` +
      (c.cutters.length ? ` · caught up in ${c.rounds} round(s)` : ""));
    for (const n of names) console.log(`  ${n.padEnd(w + 2)}${c.piles.get(n)!.length}`);
    console.log(flags.debug
      ? `  written to ${shown(flags.debug)}`
      : "  kept nothing · --debug writes it to pile/cut");
    time.print();
  } catch (e) {
    console.error("  " + (e as Error).message);
    process.exit(1);
  }
}
