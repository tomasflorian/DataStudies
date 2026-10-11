// session.ts — building a reading, as one state machine.
//
//   step(ctx, session, command)         -> { session, message }   what happens
//   view(ctx, session, message, groups) -> view                   what it looks like
//
// THERE IS EXACTLY ONE OF IT. sw.ts runs it for a terminal, server.ts runs it for
// the page, read.ts asks it for one view — so the three can differ in how a
// reading looks and never in what a reading is. api.ts says what a session, a
// command and a view are; this is that, and nothing a client decides.
//
// PURE. The same context, session and command always give the same answer, and
// neither function prints, reads a file, or changes what it was given. A session
// is a reading written down — a query and the path to the cursor — never a pile,
// so a client can carry it, send it again after a restart, and replay it.
//
// THE CONTEXT IS WHAT THE MACHINE RUNS AGAINST: the pile, indexed once by open()
// before anything is asked, and never changed after.
//
// NO VOCABULARY. The engine knows kinds, and groups of kinds a query spells out.
// A taxonomy — which names a person is shown, and what a name stands for — is the
// client's; a client may send its groups to have them counted, and that is all.
//
// A COMMAND IS DONE WHOLE OR NOT AT ALL. One that cannot be done returns the
// session it was given and a message saying why — there is no half-added chain,
// and no confirming: a merge is said with `*`, and a reading replaced at the pile
// is still in the hands of whoever held the session before.

import type { Pile } from "./stringwalk.ts";
import {
  reach, group, kindOf, phrases, values, relations, labelOf, ANCHOR,
  type Offer, type Table,
} from "./table.ts";
import {
  parseQuery, buildQuery, queryOf, canonicalToken, QueryError,
  type QueryStep, type Reading,
} from "./query.ts";
import type {
  Command, GroupOffer, Groups, Message, OfferItem, PileSummary, Session, View,
} from "./api.ts";
export type {
  Command, GroupOffer, Groups, Message, Narrower, OfferItem, PileSummary, Session, View, ViewColumn,
} from "./api.ts";

export const EMPTY: Session = Object.freeze({ query: "", focus: "" });

export interface Context {
  readonly pile: Pile;
  readonly kinds: ReadonlySet<string>;   // every kind anybody named
  readonly summary: PileSummary;
}

export function open(pile: Pile): Context {
  const kinds = new Set(phrases(pile).map(kindOf));
  return {
    pile, kinds,
    summary: {
      lines: pile.lines.length, values: values(pile).length, relations: relations(pile).length,
      phrases: phrases(pile).length, kinds: kinds.size,
    },
  };
}

// --- reading a session ----------------------------------------------------

const told = (text: string, at: number | null = null, suggest: string[] = [],
  where: Message["in"] = "command"): Message => ({ text, in: where, at, suggest });

// A session's query, read. "" is no reading.
const parse = (text: string): QueryStep | null => text.trim() ? parseQuery(text) : null;

const build = (ctx: Context, root: QueryStep | null): Reading | null =>
  root ? buildQuery(ctx.pile, root) : null;

const written = (r: Reading | null): string => r ? queryOf(r.table, r.short) : "";

// A path of step names -> the id of the column it ends at. The first name is the
// first column, which is the anchor.
const idOf = (path: readonly string[]): string => [ANCHOR, ...path.slice(1)].join("/");

// A column -> the path to it, spelled canonically.
function pathTo(table: Table, id: string): string[] {
  const out: string[] = [];
  let c = table.columns.find(x => x.id === id);
  while (c) {
    out.unshift(canonicalToken(c.step!));
    const parent = c.parent;
    c = parent === null ? undefined : table.columns.find(x => x.id === parent);
  }
  return out;
}

const clone = (n: QueryStep): QueryStep => ({ ...n, kids: n.kids.map(clone) });

// A name matches a step by its whole spelling, or — for a group — by its name.
const names = (n: QueryStep, t: string): boolean => n.token === t || n.name === t;

function nodeAt(root: QueryStep | null, path: readonly string[]): QueryStep | null {
  if (!root || !path.length || root.token !== path[0]) return null;
  let node = root;
  for (const t of path.slice(1)) {
    const next = node.kids.find(k => k.token === t);
    if (!next) return null;
    node = next;
  }
  return node;
}

// A command's path, cut at its slashes — but never inside a group's braces —
// each piece knowing where it started.
function segments(text: string): { seg: string; start: number; at: number }[] {
  const out: { seg: string; start: number; at: number }[] = [];
  let start = 0;
  let depth = 0;
  for (let i = 0; i <= text.length; i++) {
    if (i < text.length) {
      if (text[i] === "{") depth++;
      if (text[i] === "}") depth = Math.max(0, depth - 1);
      if (text[i] !== "/" || depth > 0) continue;
    }
    const seg = text.slice(start, i);
    out.push({ seg, start, at: start + (seg.length - seg.trimStart().length) });
    start = i + 1;
  }
  return out;
}

const words = (s: string): string => s.trim().split(/\s+/).filter(Boolean).join(" ");

interface Loaded {
  root: QueryStep | null;      // null when there is no reading, or it does not read
  reading: Reading | null;
  query: string;               // canonical when it works, as given when it does not
  path: string[];              // the focus, as far as it still goes
  error: QueryError | null;
}

// As far down a query's tree as a path of names goes.
function follow(root: QueryStep | null, want: readonly string[]): string[] {
  const path: string[] = [];
  let node: QueryStep | null = null;
  for (const t of want) {
    const next: QueryStep | undefined = node === null
      ? (root && names(root, t) ? root : undefined)
      : node.kids.find(k => names(k, t));
    if (!next) break;
    path.push(next.token);
    node = next;
  }
  return path;
}

// TWO STEPS, TWO CATCHES. Reading a query and building it fail for different
// reasons and leave different things behind: a query that parses but does not
// build was still parsed, and that tree is what the focus is followed down. One
// catch cannot tell the two apart, so it had to throw the tree away and parse a
// second time to get it back.
function load(ctx: Context, s: Session): Loaded {
  let root: QueryStep | null;
  try { root = parse(s.query); }
  catch (e) {
    if (!(e instanceof QueryError)) throw e;
    return { root: null, reading: null, query: s.query, path: [], error: e };
  }

  let reading: Reading | null;
  try { reading = build(ctx, root); }
  catch (e) {
    if (!(e instanceof QueryError)) throw e;
    return { root, reading: null, query: s.query, path: [], error: e };
  }

  const want = s.focus.split("/").map(words).filter(Boolean);
  let path = follow(root, want);
  const query = written(reading);
  if (query !== s.query.trim()) {
    // Written some other way — verb first, a group's kinds out of order, a mark
    // where none was needed. Read it again as it is written canonically, so the
    // columns carry canonical names. The focus may be spelled either way too;
    // whichever reaches further is the one meant.
    const asWritten = reading && path.length ? pathTo(reading.table, idOf(path)) : [];
    root = parse(query);
    reading = build(ctx, root);
    const asCanonical = follow(root, want);
    path = asCanonical.length >= asWritten.length ? asCanonical : asWritten;
  }
  return { root, reading, query, path, error: null };
}

// A session from a reading that is known to work, with the focus on `path` —
// written in the names `root` uses, and handed back canonically.
function settle(ctx: Context, root: QueryStep | null, path: readonly string[]): Session {
  const reading = build(ctx, root);
  return {
    query: written(reading),
    focus: reading && path.length ? pathTo(reading.table, idOf(path)).join("/") : "",
  };
}

// Where a path lands from `from`, without moving there. Never creates.
function walk(root: QueryStep | null, from: readonly string[], text: string):
  { path: string[] } | { message: Message } {
  let path = [...from];
  if (text.trimStart().startsWith("/")) path = [];
  for (const { seg, at } of segments(text)) {
    const t = words(seg);
    if (!t || t === ".") continue;
    if (t === "..") { path.pop(); continue; }
    const here = nodeAt(root, path);
    const choices = here === null ? (root ? [root] : []) : here.kids;
    const found = choices.find(k => names(k, t));
    if (!found)
      return { message: told(
        !choices.length ? (here === null ? "nothing has been added yet" : `nothing is under ${here.name ?? here.token}`)
          : `there is no column ${t} ${here === null ? "at the start" : `under ${here.name ?? here.token}`}`,
        at, choices.map(k => k.name ?? k.token)) };
    path.push(found.token);
  }
  return { path };
}

// --- what happens ---------------------------------------------------------

export function step(ctx: Context, s: Session, command: Command | null):
  { session: Session; message: Message | null } {
  if (command === null || command === undefined) return { session: s, message: null };
  const no = (text: string, at: number | null = null, suggest: string[] = []) =>
    ({ session: s, message: told(text, at, suggest) });

  const keys = typeof command === "object" ? Object.keys(command) : [];
  if (keys.length !== 1 || !["add", "cd", "shorten", "query"].includes(keys[0]))
    return no("a command is one of add, cd, shorten, query");
  const key = keys[0];
  const arg = (command as Record<string, unknown>)[key];
  const nullable = key === "shorten";
  if (!(typeof arg === "string" || (nullable && arg === null)))
    return no(`${key} takes ${nullable ? "a name, or null" : "text"}`);

  if (key === "query") {
    try {
      const root = parse(arg as string);
      build(ctx, root);
      return { session: settle(ctx, root, root ? [root.token] : []), message: null };
    } catch (e) {
      if (!(e instanceof QueryError)) throw e;
      return no(e.message, e.at, e.suggest);
    }
  }

  const cur = load(ctx, s);

  if (key === "add") {
    const text = arg as string;
    let root = cur.root && !cur.error ? clone(cur.root) : null;
    let path = [...cur.path];
    if (text.trimStart().startsWith("/")) path = [];
    let added = false;

    for (const { seg, start, at } of segments(text)) {
      const t = seg.trim();
      if (!t || t === ".") continue;
      if (t === "..") { path.pop(); continue; }

      // A piece is one step in the query language, read by the same parser.
      let node: QueryStep;
      try {
        node = parseQuery(seg);
        if (node.kids.length) return no("a piece of a path is one step", at);
      } catch (e) {
        if (!(e instanceof QueryError)) throw e;
        return no(e.message, start + e.at, e.suggest);
      }
      node.at = at;

      if (!path.length) {
        root = node;                                   // a reading starts, or starts again
        path = [node.token];
      } else {
        const parent = nodeAt(root, path)!;
        const there = parent.kids.find(k => k.token === node.token);
        if (!there) parent.kids.push(node);
        path.push(node.token);
      }
      added = true;

      // Checked at every piece, so a refusal points at the piece that caused it.
      try { build(ctx, root); }
      catch (e) {
        if (!(e instanceof QueryError)) throw e;
        return no(e.message, at, e.suggest);
      }
    }
    if (!added) return no("add names a step · add host resolves-to");
    return { session: settle(ctx, root, path), message: null };
  }

  if (key === "cd") {
    const text = arg as string;
    if (cur.error && words(text) !== "/")
      return no(`the reading does not work, so there is nowhere to move · ${cur.error.message}`);
    const w = walk(cur.error ? null : cur.root, cur.path, text);
    if ("message" in w) return { session: s, message: w.message };
    return { session: { query: cur.query, focus: w.path.join("/") }, message: null };
  }

  // shorten
  if (cur.error) return no(`the reading does not work · ${cur.error.message}`);
  const root = cur.root ? clone(cur.root) : null;
  let target = cur.path;
  if (arg !== null) {
    const w = walk(root, cur.path, arg as string);
    if ("message" in w) return { session: s, message: w.message };
    target = w.path;
  }
  if (!target.length)
    return no(root ? "shorten names a column · the pile itself has nothing to shorten" : "nothing has been added yet");
  const node = nodeAt(root, target)!;
  node.short = !node.short;
  return { session: settle(ctx, root, cur.path), message: null };
}

// --- what it looks like ---------------------------------------------------

// SHORTENING, THE VALUE NEVER LEAVES. A shortened column's cells become a hash
// of the whole value — never an ellipsis, which would draw two documents sharing
// an opening as the same thing. The stub is the shortest one that still tells
// the column's values apart, so it can never claim two different strings are
// one. The value is untouched everywhere it means anything: the column still
// joined, stepped and counted on it.
//
// FNV-1a, 32 bit. Non-cryptographic on purpose: all it has to do is differ.
const fnv1a = (text: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
};

function stubber(cells: string[]): (v: string) => string {
  const distinct = [...new Set(cells)];
  for (let n = 3; n < 8; n++) {
    const seen = new Set(distinct.map(v => fnv1a(v).slice(-n)));
    if (seen.size === distinct.length) return v => fnv1a(v).slice(-n);
  }
  return v => fnv1a(v);
}

function shaped(r: Reading): (string | null)[][] {
  const stubs = r.table.columns.map((c, i) => r.short.has(c.id)
    ? stubber(r.table.rows.map(row => row.cells[i]).filter((v): v is string => v !== null && v !== undefined))
    : null);
  return r.table.rows.map(row => row.cells.map((v, i) =>
    v === null || v === undefined ? null : stubs[i] ? stubs[i]!(v) : v));
}

const itemOf = (o: Offer): OfferItem => ({
  name: o.kind,
  have: o.have,
  ways: o.ways.length,
  narrower: o.ways.length > 1
    ? o.ways.filter(w => w.verb).map(w => ({ name: `${o.kind} ${w.verb}`, have: w.have, ways: 1 }))
    : [],
});

// A client's groups, counted from here: the union of values that can take any
// phrase into any of a group's kinds.
function counted(ctx: Context, here: Map<string, Set<string>>, groups: Groups): GroupOffer[] {
  return Object.entries(groups).map(([name, members]) => {
    const wanted = new Set(members);
    const who = new Set<string>();
    const kinds = new Set<string>();
    let ways = 0;
    for (const [phrase, values] of here) {
      const kind = kindOf(phrase);
      if (!wanted.has(kind)) continue;
      ways++;
      kinds.add(kind);
      for (const v of values) who.add(v);
    }
    return {
      name, have: who.size, ways,
      kinds: [...kinds].sort(),
      missing: [...wanted].filter(k => !ctx.kinds.has(k)).sort(),
    };
  });
}

export function view(ctx: Context, s: Session, message: Message | null = null, groups: Groups = {}): View {
  const cur = load(ctx, s);
  const r = cur.reading;
  const focus = r && cur.path.length ? idOf(cur.path) : null;
  const here = reach(ctx.pile, r?.table ?? null, focus);

  return {
    query: cur.query,
    focus,
    columns: r ? r.table.columns.map(c => {
      const missing = c.step?.members?.filter(k => !ctx.kinds.has(k)) ?? [];
      return {
        id: c.id, parent: c.parent, path: pathTo(r.table, c.id).join("/"), label: labelOf(c), header: c.header,
        ...(r.short.has(c.id) ? { short: true } : {}),
        ...(missing.length ? { missing } : {}),
      };
    }) : [],
    rows: r ? shaped(r) : [],
    offers: {
      of: here.of,
      items: group(here.reach, here.of).map(itemOf),
      groups: counted(ctx, here.reach, groups),
    },
    message: message ?? (cur.error ? told(cur.error.message, cur.error.at, cur.error.suggest, "query") : null),
    pile: ctx.summary,
  };
}
