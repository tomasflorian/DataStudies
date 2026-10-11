#!/usr/bin/env node
// rfg.ts — run tools, merge what they print, keep the pile caught up.
//
//   ./rfg run                          bring the inputs in, catch up, stop
//   ./rfg run ingest FILE              run that tool, merge it, catch up, stop
//   some-command | ./rfg run           merge stdin, catch up, stop
//   ./rfg watch                        the same, and stay for whatever arrives
//   ./rfg list                          what tools there are
//
// THREE VERBS, AND ONLY ONE REAL DISTINCTION. A tool is a command that prints
// atom lines. Some of them also READ atom lines, which makes them worth running
// again whenever something new lands — that is a fact about the program, marked
// in rfg.config.ts, and never a choice at the prompt.
//
// CAUGHT UP means every pile-reading tool has been run over everything now held
// and none of them had anything to add. It is a statement about work, not a
// state of the pile: the next atom leaves them behind again. `run` catches up
// and leaves; `watch` stays caught up. "Fixed point" is the same thing said in
// arithmetic, and it earns its keep in one place only: the argument for why the
// order the tools run in cannot change where they land.

import { existsSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import config, { type Input, type Tool } from "./rfg.config.js";

const usage = `usage:
  ./rfg run [TOOL [ARGS...]] [--only NAMES] [--pile FILE] [--fresh] [-v]
  ./rfg watch [--only NAMES] [--pile FILE] [-v]
  ./rfg list

run brings in everything rfg.config.ts lists as an input, then whatever you
named, then re-runs the pile-reading tools until nothing is new. Doing that
twice adds nothing the second time, so it is also how you rebuild:
--fresh empties the pile and run puts it back.

A tool prints atom lines. One that also reads them is re-run until it has
nothing left to add. Atoms on stdin are merged too, so an unregistered producer
needs no registering:  npx tsx ingest.ts f.txt | ./rfg run

  --only NAMES   restrict the re-run to these tools (comma separated)
  --pile FILE    a pile other than ${config.pile}
  --fresh        empty the pile first
  -v             let the tools' own chatter through`;

const tools = config.tools as Record<string, Tool>;
const rereads = (name: string): boolean => tools[name].pile === true;

interface Options {
  action: "run" | "watch" | "list" | "help";
  pile: string; only?: string[]; fresh: boolean; loud: boolean; rest: string[];
}

function parse(argv: string[]): Options {
  const o: Options = { action: "run", pile: config.pile, fresh: false, loud: false, rest: [] };
  if (argv[0] && ["run", "watch", "list", "help"].includes(argv[0]))
    o.action = argv.shift() as Options["action"];

  // rfg's own flags are recognised wherever they appear, because a tool's
  // arguments are usually paths and making `--pile` mean one thing before the
  // tool name and another after it is the sort of rule nobody remembers. `--`
  // stops the reading, for a tool that genuinely wants a flag of that spelling.
  let literal = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = (): string => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    if (literal) o.rest.push(a);
    else if (a === "--") literal = true;
    else if (a === "--only") o.only = value().split(",").map(x => x.trim()).filter(Boolean);
    else if (a === "--pile") o.pile = value();
    else if (a === "--fresh") o.fresh = true;
    else if (a === "-v" || a === "--verbose") o.loud = true;
    else if (a === "-h" || a === "--help") o.action = "help";
    else o.rest.push(a);
  }
  return o;
}

// one column of work, one column of what it came to
const LEFT = 58;
const said = (left: string, right: string): string =>
  `  ${left.length >= LEFT ? left + " " : left.padEnd(LEFT)}${right}`;

// --- atoms in, atoms out -----------------------------------------------------

function atomLines(text: string, from: string): string[] {
  const lines = text.split("\n").map(x => x.trim()).filter(Boolean);
  for (const line of lines) {
    let atom: unknown;
    try { atom = JSON.parse(line); } catch { throw new Error(`${from} wrote non-JSON: ${line}`); }
    if (!Array.isArray(atom) || atom.length < 3 || !atom.every(x => typeof x === "string"))
      throw new Error(`${from} wrote a malformed atom: ${line}`);
  }
  return lines;
}

// A tool's own chatter is captured rather than shown, because the round line
// already says what it added — but it is kept and printed if the tool fails,
// since that is where the reason will be. -v shows it either way.
function invoke(name: string, extra: string[], input: string | undefined, loud: boolean): string[] {
  const [command, ...configured] = tools[name].command;
  const r = spawnSync(command, [...configured, ...extra], {
    cwd: process.cwd(), input, encoding: "utf8",
    stdio: ["pipe", "pipe", loud ? "inherit" : "pipe"],
    maxBuffer: 128 * 1024 * 1024,
  });
  if (r.error) throw r.error;
  if (r.status !== 0) {
    if (!loud && r.stderr) process.stderr.write(r.stderr);
    throw new Error(`${name} exited ${r.status ?? "without a status"}`);
  }
  return atomLines(r.stdout, name);
}

const count = (path: string): number =>
  existsSync(path) ? atomLines(readFileSync(path, "utf8"), path).length : 0;

function merge(path: string, incoming: string[]): number {
  const before = count(path);
  const r = spawnSync("./merge.sh", [path], {
    cwd: process.cwd(), input: incoming.length ? incoming.join("\n") + "\n" : "",
    encoding: "utf8", stdio: ["pipe", "pipe", "inherit"],
  });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`merge exited ${r.status ?? "without a status"}`);
  return count(path) - before;
}

// --- catching up -------------------------------------------------------------

function selected(only: string[] | undefined): string[] {
  const all = Object.keys(tools).filter(rereads);
  if (!only) return all;
  for (const name of only) {
    if (!tools[name]) throw new Error(`unknown tool: ${name}`);
    if (!rereads(name)) throw new Error(`${name} does not read the pile, so re-running it changes nothing`);
  }
  return only;
}

// Run every pile-reading tool, over and over, until a round adds nothing. There
// is no order in here and no pass count: a tool that only finds something once
// another has run will find it on a later round.
function catchUp(pile: string, names: string[], loud: boolean): void {
  for (let round = 1; ; round++) {
    const added: string[] = [];
    let total = 0;
    for (const name of names) {
      const n = merge(pile, invoke(name, [], readFileSync(pile, "utf8"), loud));
      if (n) added.push(`${name} +${n}`);
      total += n;
    }
    if (!total) {
      console.log(said(`round ${round}   nothing new`, "caught up"));
      return;
    }
    console.log(said(`round ${round}   ${added.join("  ")}`, `-> ${count(pile)}`));
    if (round === 20)
      throw new Error("still not caught up after 20 rounds — a tool is probably not pure");
  }
}

// --- the verbs ---------------------------------------------------------------

function list(): void {
  const inputs = config.inputs as Input[];
  console.log(`  ${config.pile} is made of:`);
  for (const i of inputs) console.log(`    ${[i.tool, ...i.args].join(" ")}`);
  if (!inputs.length) console.log("    nothing — rfg.config.ts lists no inputs");
  console.log();
  const w = Math.max(...Object.keys(tools).map(n => n.length));
  const c = Math.max(...Object.values(tools).map(t => t.command.join(" ").length));
  for (const [name, tool] of Object.entries(tools))
    console.log(`  ${name.padEnd(w)}  ${tool.command.join(" ").padEnd(c)}  ` +
                `${tool.pile ? "reads the pile" : ""}`);
  console.log();
  for (const [name, tool] of Object.entries(tools))
    console.log(`  ${name.padEnd(w)}  ${tool.description}`);
}

// stdin can be a non-blocking pipe, where a synchronous read of fd 0 fails with
// EAGAIN rather than waiting. Read it as the stream it is.
const readStdin = (): Promise<string> =>
  new Promise(resolve => {
    let buf = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", d => (buf += d));
    process.stdin.on("end", () => resolve(buf));
  });

function bring(pile: string, input: Input, loud: boolean): void {
  if (!tools[input.tool]) throw new Error(`unknown tool in inputs: ${input.tool}`);
  const n = merge(pile, invoke(input.tool, input.args, undefined, loud));
  console.log(said([input.tool, ...input.args].join(" "), `+${n}`));
}

// What this pile is made of, then whatever the caller put in front of us: a
// named tool, or atoms on stdin. The inputs go first and go every time — they
// cost a re-read and add nothing when the files have not moved, which is what
// makes one command able to rebuild the whole pile.
async function feed(o: Options): Promise<void> {
  for (const input of config.inputs as Input[]) bring(o.pile, input, o.loud);

  const [name, ...args] = o.rest;
  if (name) {
    if (!tools[name]) throw new Error(`unknown tool: ${name}`);
    // A tool that reads the pile gets the pile. Naming one here is unusual —
    // catching up runs it anyway a moment later — but `run X` has to mean run X,
    // not run X with its input held shut.
    const input = rereads(name) ? readFileSync(o.pile, "utf8") : undefined;
    const n = merge(o.pile, invoke(name, args, input, o.loud));
    console.log(said([name, ...args].join(" "), `+${n}`));
    return;
  }
  // Atoms on stdin, so an unregistered producer needs no registering. A terminal
  // is not atoms: reading it would hang waiting for something nobody is typing.
  if (!process.stdin.isTTY) {
    const text = await readStdin();
    if (!text.trim()) return;
    console.log(said("stdin", `+${merge(o.pile, atomLines(text, "stdin"))}`));
  }
}

async function main(): Promise<void> {
  const o = parse(process.argv.slice(2));
  if (o.action === "help") { console.log(usage); return; }
  if (o.action === "list") { list(); return; }

  const names = selected(o.only);          // validate before emptying anything
  if (o.fresh) {
    if (o.action !== "run") throw new Error("--fresh is only valid with run");
    writeFileSync(o.pile, "");
  }
  if (!existsSync(o.pile)) writeFileSync(o.pile, "");

  await feed(o);
  catchUp(o.pile, names, o.loud);
  console.log(said(o.pile, `${count(o.pile)} atoms`));
  if (o.action === "run") return;

  // WATCH. The pile is a file, so "something arrived" is the file changing —
  // another terminal running rfg, or anything at all appending atoms. merge.sh
  // replaces the file atomically, so what is seen is never half a pile. The
  // stamp is taken AFTER catching up, so our own writes never wake us.
  let stamp = "";
  const now = (): string => {
    const s = statSync(o.pile);
    return `${s.size}:${s.mtimeMs}`;
  };
  stamp = now();
  console.log(`  watching ${o.pile} — ctrl-c to stop`);
  setInterval(() => {
    if (now() === stamp) return;
    console.log();
    catchUp(o.pile, names, o.loud);
    console.log(said(o.pile, `${count(o.pile)} atoms`));
    stamp = now();
  }, 500);
}

try { await main(); }
catch (e) { console.error(`rfg: ${e instanceof Error ? e.message : String(e)}\n\n${usage}`); process.exit(1); }
