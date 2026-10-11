#!/usr/bin/env node
// sw.ts — a shell for building a reading.
//
//   ./sw.ts                             start empty
//   ./sw.ts scenarios/x.sw              start inside a saved reading
//   printf 'add hops ip\nadd next ip\ntable\n' | ./sw.ts
//   ./sw.ts --taxonomy gardener         start with a gardener's names
//   ./sw.ts --introduce mine.pile       one more pile, for this run only
//   ./sw.ts --introduce <(pass show work/records | ./any2pile.ts)
//   ./sw.ts --timing                    where startup goes, on stderr
//
// A CLIENT OF THE SESSION, AND NOTHING ELSE. What a command does is session.ts —
// one step function, the same one server.ts runs for the page. This file turns a
// typed line into a command, holds the session that comes back, and prints the
// view, so it can differ from the page in how a reading looks and never in what a
// reading is. api.ts says what a session, a command and a view are.
//
// YOU TRAVERSE A TREE, AND FROM THE TREE YOU ADD WHAT YOU WANT. cd moves and add
// builds; nothing you have built goes away when you walk past it.
//
//   add host resolves-to      the kind, narrowed to one way in
//   add ip*                   every way to an ip, merged — said with a *
//   add account/ticket        a chain
//   add ../notes              a sibling
//   cd ..                     move the cursor
//
// A TAXONOMY IS THE SHELL'S OWN. It decides which names you are shown — only its
// own, as if nothing else existed, until `add --all` — and writes a name you use
// out as the group of kinds it stands for, so what reaches the session is
// `itstuff{host, ip, url}` and the reading means the same without the taxonomy.

import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { build } from "./stringwalk.ts";
import { cut, takeFlags, timing } from "./cut.ts";
import { open, step, view, EMPTY, type Command, type Message, type Session, type View } from "./session.ts";
import { commandOf } from "./query.ts";
import { drawTable } from "./text.ts";
import { abbreviate, expand, groupsOf, kindsOf, readTaxonomy, topOf, type Taxonomy } from "./taxonomy.ts";

const HERE = import.meta.dirname;
const TAXONOMIES = join(HERE, "taxonomies");

const say = (...l: string[]) => console.log(l.join("\n"));
const many = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

const taxonomyNames = (): string[] => existsSync(TAXONOMIES)
  ? readdirSync(TAXONOMIES).filter(n => n.endsWith(".pile")).map(n => n.slice(0, -5)).sort() : [];

function loadTaxonomy(name: string): Taxonomy | string {
  const file = join(TAXONOMIES, `${name}.pile`);
  if (!existsSync(file)) {
    const known = taxonomyNames();
    return `there is no taxonomy named ${name}` + (known.length ? ` · there is ${known.join(", ")}` : "");
  }
  try { return readTaxonomy(name, readFileSync(file, "utf8")); }
  catch (e) { return (e as Error).message; }
}

// --- start ------------------------------------------------------------

const flags = (() => {
  try { return takeFlags(process.argv); }
  catch (e) { console.error("  " + (e as Error).message); process.exit(1); }
})();

// An argument is a script to run before handing over. Piped in, it runs and
// exits; on a terminal you carry on from wherever it left you.
let startTaxonomy: string | null = null;
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] !== "--taxonomy" && !argv[i].startsWith("--taxonomy=")) continue;
  const eq = argv[i].startsWith("--taxonomy=");
  startTaxonomy = eq ? argv[i].slice("--taxonomy=".length) : argv[i + 1] ?? "";
  argv.splice(i--, eq ? 1 : 2);
  if (!startTaxonomy) { console.error("  --taxonomy <name>"); process.exit(1); }
}
const script = argv[0];

const time = timing(flags.timing);
time.lap("start node, load sw.ts");

// THE SHELL HOLDS ITS OWN PILE, so it is the server and the client at once: the
// session lives in a variable, and nothing crosses anything.
const ctx = (() => {
  try {
    const piles = cut(flags, time).piles;
    return open(build([...piles.keys()].sort().flatMap(n => piles.get(n)!)));
  } catch (e) { console.error("  " + (e as Error).message); process.exit(1); }
})();
time.lap("index the cut");

let taxonomy: Taxonomy | null = null;
if (startTaxonomy) {
  const got = loadTaxonomy(startTaxonomy);
  if (typeof got === "string") { console.error("  " + got); process.exit(1); }
  taxonomy = got;
}

let session: Session = EMPTY;
const groups = () => taxonomy ? groupsOf(taxonomy) : {};
let shown: View = view(ctx, session, null, groups());
const history: string[] = [];        // what you typed, so it can be kept

// EVERY CHANGE IS ONE COMMAND THROUGH step, and the view is recomputed from the
// session that comes back. Nothing here decides what a command means.
function apply(command: Command): Message | null {
  const r = step(ctx, session, command);
  session = r.session;
  shown = view(ctx, session, r.message, groups());
  if (r.message) showMessage(r.message);
  return r.message;
}

// A name the taxonomy holds something under, written out as its group.
const spelled = (text: string): string => taxonomy ? expand(taxonomy, text) : text;

// --- printing ---------------------------------------------------------

// Two different questions: whether to prompt is about the INPUT being a person,
// whether to colour is about the OUTPUT being a screen. A piped script watched
// on screen should still be lit; one redirected to a file must not be.
const tty = Boolean(process.stdin.isTTY);
const colour = Boolean(process.stdout.isTTY);
const ESC = String.fromCharCode(27);
const lit = (s: string) => colour ? `${ESC}[1;33m${s}${ESC}[0m` : s;

function showMessage(m: Message): void {
  say("  " + m.text);
  if (m.suggest.length && !m.text.includes("did you mean"))
    say(...m.suggest.map(s => "     " + s));
}

// The tree is the view; the table is asked for. A cell can be a whole document,
// so printing one after every step would bury everything else.
function showTable(): void {
  if (!shown.columns.length) { say("  nothing named"); return; }
  say(drawTable(shown.columns, shown.rows).join("\n"), "");
}

function showTree(): void {
  const depth = new Map<string, number>();
  for (const c of shown.columns) {
    depth.set(c.id, c.parent === null ? 0 : depth.get(c.parent)! + 1);
    const text = "   ".repeat(depth.get(c.id)! + 1) + c.label + (c.short ? "   short" : "") +
      (c.missing ? `   ${c.missing.length} not in this pile` : "");
    say(c.id === shown.focus ? lit(">" + text.slice(1)) : text);
  }
}

// At the pile there is nothing to be a fraction of yet — the count is how many
// rows the first column would open with.
const countOf = (have: number) => shown.focus === null ? String(have) : `${have}/${shown.offers.of}`;

// WHAT IS LISTED HERE. Every kind, or — with a taxonomy — only its own top names:
// a name it holds something under, counted the way the group would be built, or a
// kind it names directly. Everything else is not shown at all.
interface Entry { name: string; have: number; ways: number; kinds: number | null }

function entries(all: boolean): Entry[] {
  const items = shown.offers.items;
  if (!taxonomy || all) return items.map(i => ({ name: i.name, have: i.have, ways: i.ways, kinds: null }));
  const out: Entry[] = [];
  for (const name of topOf(taxonomy)) {
    const g = shown.offers.groups.find(x => x.name === name);
    if (g) {
      if (shown.focus === null || g.have > 0) out.push({ name, have: g.have, ways: g.ways, kinds: g.kinds.length });
      continue;
    }
    const i = items.find(x => x.name === name);
    if (i) out.push({ name, have: i.have, ways: i.ways, kinds: null });
  }
  return out;
}

const markOf = (e: Entry): string =>
  e.kinds !== null ? many(e.kinds, "kind") + (e.ways > 1 ? ` · ${e.ways} ways` : "")
    : e.ways > 1 ? `${e.ways} ways` : "";
const dotOf = (e: Entry): string => e.ways > 1 ? `·${e.ways}` : "";

const outside = (): number => {
  if (!taxonomy) return 0;
  const known = kindsOf(taxonomy);
  return shown.offers.items.filter(i => !known.has(i.name)).length;
};

// EVERYTHING ADDABLE HERE — `add` on its own, and `add --all`.
function addable(all: boolean): void {
  const list = entries(all);
  if (shown.focus === null)
    say(taxonomy && !all
      ? `  ${list.length} name(s) · ${taxonomy.name} · naming one is the first column`
      : `  ${list.length} kind(s) · naming one is the first column`);
  if (!list.length) say("  nothing can be added here.");
  const w = Math.max(0, ...list.map(e => e.name.length));
  for (const e of list) say(`  ${e.name.padEnd(w + 3)}${countOf(e.have).padStart(4)}   ${markOf(e)}`.trimEnd());
  const hidden = all ? 0 : outside();
  if (hidden) say("", `  ${hidden} kind(s) outside ${taxonomy!.name} · add --all shows them`);
}

// THE STANDING VIEW, printed before every prompt rather than by whichever
// command changed something, so the tree is always there. A name reachable more
// than one way carries how many, because that is the difference between a name
// and a choice, and it has to survive a pipe — the transcript has no colour.
function look(): void {
  showTree();
  if (shown.columns.length) say("");
  const list = entries(false);
  if (shown.focus === null) {
    say(`  ${list.length} ${taxonomy ? "names · " + taxonomy.name : "kinds"} · add one` +
        (shown.columns.length ? " · adding one here replaces this reading" : " to begin"));
    return;
  }
  say("  " + (list.length
    ? list.map(e => `${e.name} ${countOf(e.have)}${dotOf(e)}`).join("   ")
    : taxonomy && shown.offers.items.length
      ? `nothing in ${taxonomy.name} from here · add --all shows ${many(shown.offers.items.length, "kind")}`
      : "nothing can be added here."));
}

// A GRID FOR LEAVES, sized to the width of a menu.
const WIDE = 78;

// THE TAXONOMY AS A TREE, counted from where the cursor is: a name carries how
// many values it reaches from here, a leaf carries its name. A kind this pile has
// no lines for is said once, at the end.
function showTaxonomy(t: Taxonomy): void {
  const all = groupsOf(t);
  const rows: { text: string; count: string; held: string }[] = [];
  const walk = (node: string, depth: number): void => {
    const pad = "  " + "   ".repeat(depth);
    const g = shown.offers.groups.find(x => x.name === node);
    rows.push({ text: pad + node, count: String(g?.have ?? 0), held: many(all[node]?.length ?? 0, "kind") });
    const kids = t.children.get(node) ?? [];
    for (const k of kids) if (t.children.has(k)) walk(k, depth + 1);
    let line = "";
    for (const leaf of kids.filter(k => !t.children.has(k))) {
      if (line && (line + "  " + leaf).length > WIDE) { rows.push({ text: line, count: "", held: "" }); line = ""; }
      line = line ? `${line}  ${leaf}` : pad + "   " + leaf;
    }
    if (line) rows.push({ text: line, count: "", held: "" });
  };
  walk(t.root, 0);
  const w = Math.max(...rows.filter(r => r.count).map(r => r.text.length));
  for (const r of rows)
    say(r.count ? `${r.text.padEnd(w + 3)}${r.count.padStart(4)}   ${r.held}` : r.text);
}

function summaryOf(t: Taxonomy): string {
  const kinds = kindsOf(t).size;
  const missing = shown.offers.groups.find(g => g.name === t.root)?.missing ?? [];
  return `${t.name} · ${many(t.children.size, "name")} over ${kinds - missing.length}/${kinds} of its kinds in this pile` +
    (missing.length ? ` · not here: ${missing.join("  ")}` : "");
}

const HELP = `
  You build a reading one step at a time. Every step is a command to the same
  session the server runs for the page.

  / is the pile.  it holds every KIND anybody named, and adding one there
  starts a reading: the kind is the first column, with a row for every value it
  reaches.  adding another at / replaces the reading.

  YOU TYPE THE KIND.  the verb is a qualifier, for one particular way in:

      host               the kind, when there is one way to it
      host*              every way to a host from here, merged
      host resolves-to   only that one
      resolves-to host   the same, spelled the producer's way
      addr{host, ip}*    several kinds as one column, called addr

  a step with more than one way in needs * — without it nothing is added and
  the ways are listed.  a column is called by the phrase when there is one way
  in, and by the kind or the group when it merged several.

  every column after the first joins on the column to its left.

  add                on its own, what you could add here
  add --all          every kind, whatever the taxonomy shows
  add <path>         add it, and the focus follows.  add ../x a sibling,
                     add a/b/c a chain.  names are whole; a miss says what
                     you probably meant
  cd <path>          move the cursor.  .. is the parent, / the pile
                     cd alone says where you are          (alias: focus)
  shorten [path]     draw a column as a hash — for a column you step over
                     rather than read.  again puts it back
  taxonomy <name>    your vocabulary from taxonomies/<name>.pile.  only its
                     names are shown, and a name you add is written out as
                     the kinds it stands for
                     taxonomy       the tree, counted from here
                     taxonomy off   every kind under its own name again
  table              the whole thing
  tree [flat]        the shape, one column per line — or as one line
  query              this reading as a command for ./read.ts
  save <name>        keep this session as scenarios/<name>.sw
  jump               waits on offers further out, which are not here yet

  help  quit
  a bare token is an add`;

function run(input: string): void {
  const line = input.trim().replace(/\s+/g, " ");

  // Off a terminal there is no echo, so say what is being run. That makes a
  // piped session a transcript, which is what the harness diffs.
  if (!tty && (line || input.trim().startsWith("#"))) say("$ " + input.trim());

  // A comment does nothing and is kept: it is the note on a scenario.
  if (line.startsWith("#")) { history.push(line); return; }
  if (!line) return;
  if (!line.startsWith("save ")) history.push(line);
  const [cmd, ...rest] = line.split(" ");
  const arg = rest.join(" ");

  switch (cmd) {
    case "help": case "?": say(HELP); return;
    case "quit": case "exit": process.exit(0);

    case "add":
      if (!arg) { addable(false); return; }
      if (arg === "--all") { addable(true); return; }
      apply({ add: spelled(arg) });
      return;

    case "cd": case "focus":
      if (!arg) { say("  /" + session.focus); return; }
      apply({ cd: arg });
      return;

    case "table": case "cat": showTable(); return;

    case "shorten": {
      const before = shown.columns.find(c => c.id === shown.focus);
      if (apply({ shorten: arg || null })) return;
      if (!arg && before) say(`  ${before.header} ${shown.columns.find(c => c.id === before.id)?.short
        ? "shortened · shorten again to read it whole" : "whole again"}`);
      return;
    }

    // THE TAXONOMY CHANGES WHAT YOU ARE SHOWN AND NOTHING ELSE. The reading does
    // not move: a group already in it is spelled out, and means what it meant.
    case "taxonomy": {
      if (!arg || arg === "list") {
        if (taxonomy && arg !== "list") { showTaxonomy(taxonomy); say(""); }
        say(`  ${taxonomy ? summaryOf(taxonomy) : `no taxonomy · ${shown.pile.kinds} kind(s), each its own name`}`);
        const names = taxonomyNames();
        if (names.length) say("  taxonomies: " + names.join("  "));
        return;
      }
      if (arg === "off" || arg === "none") {
        taxonomy = null;
        shown = view(ctx, session, null, groups());
        say(`  no taxonomy · ${shown.pile.kinds} kind(s)`);
        return;
      }
      const got = loadTaxonomy(arg);
      if (typeof got === "string") { say("  " + got); return; }
      taxonomy = got;
      shown = view(ctx, session, null, groups());
      say(`  ${summaryOf(got)}`);
      return;
    }

    case "query": {
      if (!shown.columns.length) { say("  nothing named"); return; }
      say("  " + commandOf(shown.query));
      const short = taxonomy ? abbreviate(taxonomy, shown.query) : shown.query;
      if (short !== shown.query) say(`  ./read.ts --taxonomy ${taxonomy!.name} '${short}'`);
      return;
    }

    case "tree":
      if (!shown.columns.length) { say("  nothing named"); return; }
      if (arg === "flat") say("  " + shown.query); else showTree();
      return;

    case "jump":
      say("  jump waits on offers further out, which the session does not have yet");
      return;

    // A SESSION IS A SCENARIO. What you typed is already the recipe, so keeping
    // it is writing it to a file the harness replays.
    case "save": {
      if (!arg) { say("  save <name>"); return; }
      const name = arg.replace(/[^\w.-]+/g, "-");
      mkdirSync(join(HERE, "scenarios"), { recursive: true });
      writeFileSync(join(HERE, "scenarios", name + ".sw"), history.map(l => l + "\n").join(""));
      say(`  ${history.length} line(s) -> scenarios/${name}.sw`);
      return;
    }

    default: apply({ add: spelled(line) });     // a bare token is an add
  }
}

if (tty) {
  const p = shown.pile;
  const names = taxonomyNames();
  say(`${p.lines} lines · ${p.values} values · ${p.relations} relations · ${p.phrases} phrases · ? for help\n` +
      (taxonomy
        ? `${summaryOf(taxonomy)} · taxonomy off for every kind\n`
        : `${names.length} taxonom${names.length === 1 ? "y" : "ies"}: ${names.join("  ")} · taxonomy <name> to use one\n`) +
      `add a kind and it is your first column\n`);
  time.lap("the banner");
}

const rl = createInterface({
  input: process.stdin, output: process.stdout, terminal: tty, prompt: "",
  completer: (line: string): [string[], string] => {
    const word = line.split(/\s+/).pop() ?? "";
    const pool = [
      ...entries(false).map(e => e.name), ...shown.offers.items.map(i => i.name), "..", "/",
      "add", "cd", "focus", "table", "tree", "query", "save", "shorten", "taxonomy", "help", "quit",
      ...taxonomyNames(), "off", "--all",
    ];
    const hits = [...new Set(pool)].filter(c => c.startsWith(word));
    return [hits.length ? hits : pool, word];
  },
});

const prompt = () => {
  look();
  if (!tty) return;
  rl.setPrompt("$ ");
  rl.prompt();
};

// The table comes back only when the reading actually changed. Moving the
// cursor is not news; building a column is. `table` still asks for it any time.
//
// The standing view is not redrawn after a comment or a blank line in a
// script — nothing happened, and a transcript should not repeat itself. On a
// terminal it always redraws, because pressing Enter is how you refresh.
function feed(l: string): void {
  const before = shown.query;
  run(l);
  if (shown.columns.length && shown.query !== before) showTable();
  const bare = l.trim();
  if (tty || (bare && !bare.startsWith("#"))) prompt();
}

if (script) {
  for (const l of readFileSync(script, "utf8").split("\n")) feed(l);
  time.lap("run the script");
}
prompt();
time.lap("the first view");
time.print();
rl.on("line", feed);
rl.on("close", () => { if (tty) say(""); });
