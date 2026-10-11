// query.ts — a reading as one line, and back.
//
//   host resolves-to/(account/ticket, ip has-address)
//   record username-of/notes~/ip
//   flower{bugambilia, lilly, rose}*/itstuff{host, ip, url}
//
// THE SAME WORDS YOU TYPE IN THE SHELL. A step is a kind, a kind narrowed by a
// verb, or a group of kinds, and the only other things in a query are the few
// characters a kind or a verb can never contain:
//
//   a/b          b is a step from a
//   a/(b, c/d)   b and c both hang off a, and d hangs off c
//   a*           a has more than one way in, and you mean all of them
//   a~           draw a's column shortened
//   n{a, b}      one step over the kinds a and b, merged, and called n
//
// Whitespace around those characters means nothing, so a long query can be laid
// out like the tree it describes.
//
// A GROUP SAYS ITS KINDS. `itstuff{host, ip, url}` is what a gardener's taxonomy
// writes when they name `itstuff`, and the query means the same with or without
// that taxonomy: nothing outside the string decides what a name covers, so equal
// strings are equal readings. A group covers whichever of its kinds this pile
// reaches from where it stands — a kind nobody wrote yet, like `cpu`, is part of
// the group already and simply finds nothing — and is refused only when none of
// them do. That leniency is the group's alone: its list is a vocabulary, not a
// claim about this pile.
//
// STRICT, BECAUSE NOTHING CAN BE ASKED. A step with more than one way in, written
// without `*`, is an error that lists the ways — otherwise a query that meant one
// way today would quietly mean two the day a second producer arrives.
//
// EXACT, FOR THE SAME REASON. A saved query that resolved a partial name one way
// today and another way tomorrow is worse than one that fails.
//
// ONE SPELLING OUT. A step may be written kind first or verb first, and a group's
// kinds in any order. What queryOf writes is kind first, a group's kinds sorted,
// and marks only where they have to be, so two people's queries for one reading
// are one string.

import {
  anchor, add, offers, rootOffers, kindOf, verbOf, ANCHOR,
  type Column, type Offer, type Step, type Table,
} from "./table.ts";
import type { Pile } from "./stringwalk.ts";

export const many = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

// --- what can be typed --------------------------------------------------
//
// EVERYTHING ADDABLE SOMEWHERE. A kind is what you type; the ways in are only
// matchable, because listing them beside the kind is the noise this exists to
// remove. `show` is that difference.
export interface Opt {
  tok: string;        // what you type
  step: Step;         // the kind, and the phrases it turned out to name
  count: string;      // "13/29", or just a number at the root
  ways: number;       // how many phrases the token names
  show: boolean;      // listed, or only reachable by typing it
}

// One offer becomes several ways to say the same thing: the kind alone, the
// kind narrowed by a verb, and the verb-first phrase, which is how a producer
// writes it and how every scenario saved before this typed it.
export function optsOf(o: Offer, atRoot: boolean): Opt[] {
  // At the root there is nothing to be a fraction of yet — the count is how many
  // rows the first column would open with.
  const n = (have: number) => atRoot ? String(have) : `${have}/${o.of}`;
  const out: Opt[] = [{
    tok: o.kind, step: { token: o.kind, phrases: o.ways.map(w => w.phrase) },
    count: n(o.have), ways: o.ways.length, show: true,
  }];
  for (const w of o.ways) {
    if (w.verb)
      out.push({ tok: `${o.kind} ${w.verb}`, step: { token: `${o.kind} ${w.verb}`, phrases: [w.phrase] },
        count: n(w.have), ways: 1, show: false });
    if (w.phrase !== o.kind)
      out.push({ tok: w.phrase, step: { token: w.phrase, phrases: [w.phrase] },
        count: n(w.have), ways: 1, show: false });
  }
  return out;
}

// WHAT NARROWS IT: a kind narrows to its verbs.
export const narrowerOf = (opt: Opt, all: Opt[]): Opt[] =>
  all.filter(o => o.ways === 1 && o.tok.startsWith(opt.step.token + " "));

// WHAT TAKING THIS WOULD MERGE, for a person: the kind alone on top, because
// taking all of them is what `*` says, then each way on its own.
export function waysOf(opt: Opt, all: Opt[]): string[] {
  const kind = opt.step.token;
  const narrower = narrowerOf(opt, all);
  const w = Math.max(kind.length, ...narrower.map(o => o.tok.length));
  return [
    `${kind} — ${many(opt.ways, "way")}`,
    `     ${kind.padEnd(w + 3)}${opt.count}   all of them`,
    ...narrower.map(o => `     ${o.tok.padEnd(w + 3)}${o.count}`),
  ];
}

// --- reading a query ----------------------------------------------------

export interface QueryStep {
  token: string;            // the words — or, for a group, `name{a, b}` as written canonically
  name: string | null;      // a group's name
  members: string[] | null; // a group's kinds, sorted, each once
  merge: boolean;           // *
  short: boolean;           // ~
  at: number;               // where in the query it was written, for errors
  kids: QueryStep[];
}

// Where it went wrong, as a position in the query, so the error can point.
// `more` is lines for a person; `suggest` is names that would have worked.
export class QueryError extends Error {
  at: number;
  more: string[];
  suggest: string[];
  constructor(at: number, message: string, more: string[] = [], suggest: string[] = []) {
    super(message);
    this.at = at;
    this.more = more;
    this.suggest = suggest;
  }
}

const fail = (at: number, message: string, more: string[] = [], suggest: string[] = []): never => {
  throw new QueryError(at, message, more, suggest);
};

const SYNTAX = "/,()*~{}";
const WORD = /^[A-Za-z][A-Za-z0-9_-]*$/;

// A group as it is written canonically.
export const spellGroup = (name: string, members: readonly string[]): string =>
  `${name}{${[...new Set(members)].sort().join(", ")}}`;

export function parseQuery(text: string): QueryStep {
  let i = 0;
  const space = () => { while (i < text.length && /\s/.test(text[i])) i++; };
  const peekWord = (from: number): string => text.slice(from).trim().split(/[\s/,()*~{}]/)[0];

  const step = (depth: number): QueryStep => {
    space();
    if (text[i] === "(")
      fail(i, depth === 0 ? "a reading starts from one column · branch after the first step"
                          : "a branch hangs off a step · name the step first");
    const start = i;
    while (i < text.length && !SYNTAX.includes(text[i])) i++;
    const raw = text.slice(start, i);
    const words = raw.trim().split(/\s+/).filter(Boolean);
    if (!words.length)
      fail(start, i < text.length ? `a step is missing before ${text[i]}` : "a step is missing here");
    const at = start + (raw.length - raw.trimStart().length);
    let offset = 0;
    for (const word of words) {
      offset = raw.indexOf(word, offset);
      if (!WORD.test(word))
        fail(start + offset, `${word} cannot be a kind or a verb · they are letters, digits, _ and -`);
      offset += word.length;
    }
    const node: QueryStep = {
      token: words.join(" "), name: null, members: null, merge: false, short: false, at, kids: [],
    };

    if (text[i] === "{") {
      if (words.length !== 1) fail(at, "a group is named with one word · itstuff{host, ip}");
      const open = i++;
      const inside: string[] = [];
      for (;;) {
        space();
        const from = i;
        while (i < text.length && !SYNTAX.includes(text[i]) && !/\s/.test(text[i])) i++;
        const kind = text.slice(from, i);
        if (!kind) fail(i < text.length ? i : open, i < text.length ? "a kind is missing here" : "this { is never closed");
        if (!WORD.test(kind)) fail(from, `${kind} cannot be a kind · they are letters, digits, _ and -`);
        inside.push(kind);
        space();
        if (text[i] === ",") { i++; continue; }
        if (text[i] === "}") { i++; break; }
        fail(i < text.length ? i : open, i < text.length ? "expected , or } here" : "this { is never closed");
      }
      node.name = node.token;
      node.members = [...new Set(inside)].sort();
      node.token = spellGroup(node.name, node.members);
    }

    for (;;) {
      space();
      if (text[i] === "*" || text[i] === "~") {
        const mark = text[i] === "*" ? "merge" : "short";
        if (node[mark]) fail(i, `${text[i]} is already said on ${node.name ?? node.token}`);
        node[mark] = true;
        i++;
        continue;
      }
      break;
    }

    space();
    if (text[i] !== "/") return node;
    i++;
    space();
    if (text[i] !== "(") { node.kids.push(step(depth + 1)); return node; }

    const open = i++;
    for (;;) {
      node.kids.push(step(depth + 1));
      space();
      if (text[i] === ",") { i++; continue; }
      if (text[i] === ")") { i++; break; }
      fail(i < text.length ? i : open, i < text.length ? `expected , or ) here` : "this ( is never closed");
    }
    space();
    if (text[i] === "/") {
      const next = peekWord(i + 1);
      fail(i, `a chain cannot continue after a branch · put ${next || "it"} inside it`);
    }
    return node;
  };

  space();
  if (i >= text.length) fail(0, "a query names at least one kind");
  const root = step(0);
  space();
  if (i < text.length)
    fail(i, text[i] === ")" ? "a ) with no ( before it"
          : text[i] === "," ? "a , outside a branch · put the branches in ( )"
          : text[i] === "}" ? "a } with no { before it"
          : `nothing can follow here`);
  return root;
}

// --- building the table it describes ------------------------------------

export interface Reading { table: Table; short: Set<string> }

// A MISS SUGGESTS WHAT WAS PROBABLY MEANT: a name that starts with what was
// typed, or is a slip or two away from it. Kinds — not every way of saying every
// kind — unless what was typed was a kind and a verb, when a slip in either one
// should still find the pair.
function nearest(all: Opt[], token: string): string[] {
  const words = token.split(" ").length;
  const reach = token.length <= 3 ? 1 : 2;
  const scored = new Map<string, number>();
  for (const o of all) {
    if (!o.show && !(words > 1 && o.tok.split(" ").length === words)) continue;
    const d = o.tok.startsWith(token) ? 0 : distance(o.tok, token);
    if (d <= reach && !(scored.get(o.tok)! <= d)) scored.set(o.tok, d);
  }
  return [...scored].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
    .slice(0, 5).map(([tok]) => tok);
}

// Edits between two names, and anything past a few is as good as none.
function distance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++)
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

export function buildQuery(pile: Pile, query: QueryStep): Reading {
  const pick = (found: Offer[], s: QueryStep, from: string | null): Step => {
    const where = from === null ? " in this pile" : ` from ${from}`;

    if (s.members) {
      const mine = found.filter(o => s.members!.includes(o.kind));
      const phrases = mine.flatMap(o => o.ways.map(w => w.phrase));
      if (!phrases.length)
        return fail(s.at, from === null
          ? `none of ${s.name}'s kinds is in this pile`
          : `nothing in ${s.name} is reachable from ${from}`);
      if (phrases.length > 1 && !s.merge)
        fail(s.at, `${s.name} covers ${many(phrases.length, "way")}${where} · say ${s.name}* or narrow it`,
          mine.map(o => `     ${o.kind}   ${many(o.ways.length, "way")}`),
          [`${s.token}*`, ...mine.map(o => o.kind)]);
      return { token: s.token, phrases, name: s.name!, members: s.members };
    }

    const all = found.flatMap(o => optsOf(o, from === null));
    const opt = all.find(o => o.tok === s.token);
    if (!opt) {
      const near = nearest(all, s.token);
      return fail(s.at,
        (from === null ? `no kind named ${s.token} in this pile` : `nothing reaches ${s.token} from ${from}`) +
        (near.length ? ` · did you mean ${near.join(", ")}` : ""),
        [], near);
    }
    if (opt.ways > 1 && !s.merge)
      fail(s.at, `${s.token} has ${many(opt.ways, "way")}${where} · say ${s.token}* or narrow it`,
        waysOf(opt, all).slice(2),
        [`${s.token}*`, ...narrowerOf(opt, all).map(o => o.tok)]);
    return opt.step;
  };

  let table = anchor(pile, pick(rootOffers(pile), query, null));
  const short = new Set<string>();
  if (query.short) short.add(ANCHOR);

  const grow = (s: QueryStep, id: string): void => {
    for (const kid of s.kids) {
      const from = table.columns.find(c => c.id === id)!;
      const step = pick(offers(pile, table, id), kid, from.header);
      const kidId = `${id}/${step.token}`;
      if (table.columns.some(c => c.id === kidId)) fail(kid.at, `${kid.name ?? kid.token} is already a column here`);
      table = add(pile, table, id, step);
      if (kid.short) short.add(kidId);
      grow(kid, kidId);
    }
  };
  grow(query, ANCHOR);
  return { table, short };
}

// --- writing a reading down ---------------------------------------------

// A step's one spelling, without its marks: kind first, or a group as written.
export const canonicalToken = (s: Step): string =>
  s.members ? s.token
    : s.phrases.length === 1 && s.token === s.phrases[0] && verbOf(s.token)
      ? `${kindOf(s.token)} ${verbOf(s.token)}` : s.token;

// Kind first, `*` where a step merged, `~` where a column is shortened, and a
// branch only where there is more than one child.
export function queryOf(table: Table, short: ReadonlySet<string>): string {
  const spell = (c: Column): string =>
    canonicalToken(c.step!) + (c.step!.phrases.length > 1 ? "*" : "") + (short.has(c.id) ? "~" : "");
  const draw = (c: Column): string => {
    const kids = table.columns.filter(k => k.parent === c.id);
    return spell(c) + (kids.length === 1 ? "/" + draw(kids[0])
      : kids.length ? `/(${kids.map(draw).join(", ")})` : "");
  };
  return draw(table.columns[0]);
}

// A query never holds a single quote, so single quotes are always enough.
export const commandOf = (query: string): string => `./read.ts '${query}'`;

// The error as a person reads it: the query, and a caret under the place. A
// query written over several lines shows only the line the caret is on.
export function explain(text: string, at: number, message: string, more: string[] = []): string[] {
  const startOfLine = text.lastIndexOf("\n", at - 1) + 1;
  const end = text.indexOf("\n", at);
  if (!text.includes("\n"))
    return [`'${text}'`, " ".repeat(1 + at) + "^ " + message, ...more];
  const lead = `line ${text.slice(0, at).split("\n").length}: `;
  return [lead + text.slice(startOfLine, end < 0 ? undefined : end),
    " ".repeat(lead.length + at - startOfLine) + "^ " + message, ...more];
}
