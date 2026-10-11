// walk.ts — the machinery behind the `walk` tab: build a table by walking
// outward from a set of starting values.
//
// Two trees, per the README:
//
//   the COLUMN TREE   what you ticked. Rooted at an anchor function, branching.
//                     Function names only, no data, the same for every row.
//   the VALUE TREE    what one starting value finds walking it. Branches wherever
//                     a step finds more than one answer. Rows are its leaves.
//
// Input is ATOMS — the lines of the saved file, one call each. Never a Producer
// and never nodes and edges, so the CLI and the browser agree by reading the
// same file rather than by agreeing on a representation.

import type { Atom } from "./expand.js";

export interface Call {
  fn: string;
  subject: string;
  extras: string[];
  result: string;
}

export interface Index {
  apps: Call[];
  bySubject: Map<string, Call[]>;
  byResult: Map<string, Call[]>;
}

export interface Step {
  dir: "fwd" | "rev";
  fn: string;
}

export interface Column {
  step: Step | null;
  anchorFn?: string;
  header: string;
  children: Column[];
}

export interface Cell {
  value: string;
  chain: string[];
}

export type Row = Record<string, Cell>;

export interface Table {
  columns: string[];
  rows: Row[];
  capped: boolean;
}

// --- index -------------------------------------------------------------
//
// An atom is one call:  [fn, ...args, result]
//
//   ["word","the|city|is|old","city","city"]
//      fn       word
//      subject  the|city|is|old     the first argument
//      extras   ["city"]            the rest — part of the call's identity
//      result   city
//
// The subject is args[0]. It used to be recovered by matching the inbound values
// against the call's own text, longest match first, because the arrows carried
// no order and the text was the only place order survived. That guessing is
// gone: position in the atom says which argument was first, and nothing here
// reads a call's text.
//
// Calls are kept as objects rather than by id, so a pile holding the same atom
// twice costs nothing — the duplicate produces an identical call, and every step
// below already drops a repeated answer. Merging is a concatenation, so
// duplicates are the normal case rather than an error to guard against.

export function buildIndex(atoms: Atom[]): Index {
  const apps: Call[] = [];
  const bySubject = new Map<string, Call[]>();
  const byResult = new Map<string, Call[]>();

  const under = (map: Map<string, Call[]>, key: string, app: Call): void => {
    const list = map.get(key);
    if (list) list.push(app);
    else map.set(key, [app]);
  };

  for (const atom of atoms) {
    if (!Array.isArray(atom) || atom.length < 3) continue;
    const app: Call = {
      fn: atom[0],
      subject: atom[1],
      extras: atom.slice(2, -1),
      result: atom[atom.length - 1],
    };
    apps.push(app);
    under(bySubject, app.subject, app);
    under(byResult, app.result, app);
  }

  return { apps, bySubject, byResult };
}

// --- steps -------------------------------------------------------------
//
// fn()      go to what the call produced
// rev_fn()  go to what it CONSUMED — the subject only. Extra arguments are
//           part of the call's identity, not a place you can walk to, or
//           rev_word() from "city" would hand back "city" itself, since
//           sequence writes its selector as (list, part) => part.

export function stepFwd(index: Index, value: string, fn: string): string[] {
  const out: string[] = [];
  for (const a of index.bySubject.get(value) ?? [])
    if (a.fn === fn && !out.includes(a.result)) out.push(a.result);
  return out;
}

export function stepRev(index: Index, value: string, fn: string): string[] {
  const out: string[] = [];
  for (const a of index.byResult.get(value) ?? [])
    if (a.fn === fn && !out.includes(a.subject)) out.push(a.subject);
  return out;
}

export function step(index: Index, value: string, dir: "fwd" | "rev", fn: string): string[] {
  return dir === "rev" ? stepRev(index, value, fn) : stepFwd(index, value, fn);
}

// Every step available from a value, one hop out. This is what a cell offers
// when you click it: computed from calls that exist, so a step that finds
// nothing is never on the menu.
export function stepsFrom(index: Index, value: string): Step[] {
  const seen = new Set<string>();
  const out: Step[] = [];
  for (const a of index.bySubject.get(value) ?? []) {
    const key = "fwd " + a.fn;
    if (!seen.has(key)) { seen.add(key); out.push({ dir: "fwd", fn: a.fn }); }
  }
  for (const a of index.byResult.get(value) ?? []) {
    const key = "rev " + a.fn;
    if (!seen.has(key)) { seen.add(key); out.push({ dir: "rev", fn: a.fn }); }
  }
  out.sort((a, b) => a.fn.localeCompare(b.fn) || a.dir.localeCompare(b.dir));
  return out;
}

// Every step available from a WHOLE COLUMN, with how many of its values offer
// it. Clicking a cell is really clicking a column: what you want to know is
// where this column can go, not where this one cell happens to go. A step that
// only one value in the column offers is still worth being told about — it will
// write `?` on every other row, and a row with a hole is more honest than a step
// nobody was offered.
//
// `have` is out of how many distinct values in the column, so `4/13` reads as
// "four of the thirteen go there".
export function stepsFromMany(index: Index, values: string[]): { step: Step; have: number; of: number }[] {
  const distinct = [...new Set(values)];
  const count = new Map<string, { step: Step; have: number }>();
  for (const v of distinct)
    for (const st of stepsFrom(index, v)) {
      const key = stepName(st);
      const at = count.get(key);
      if (at) at.have++;
      else count.set(key, { step: st, have: 1 });
    }
  return [...count.values()]
    .map(c => ({ ...c, of: distinct.length }))
    .sort((a, b) => b.have - a.have
      || a.step.fn.localeCompare(b.step.fn)
      || a.step.dir.localeCompare(b.step.dir));
}

// SEVERAL HOPS AT ONCE.
//
// Walking to somewhere interesting often goes through values you have no wish to
// read — a record's own name, on the way from one of its fields to another. This
// offers the far end directly: every route of exactly `depth` steps out of a
// column, named the way a column header is named, destination first.
//
//   host() via urlIn() via Notes()
//
// `have` counts the values in the column that reach the END of the route. A
// value that gets halfway and stops has not found this path.
//
// Nothing is filtered. A route that goes out and comes back — Company() then
// rev_Company() — is not a wasted trip: it lands on the OTHER records at the
// same company, which is how you ask for everything else like this one.
//
// It walks a layer at a time and keeps ONE entry per route, merging the values
// that route reaches. Recursing per value instead would re-walk the same route
// once for every value that happens to take it.
export function pathsFrom(
  index: Index,
  values: string[],
  depth = 2,
): { steps: Step[]; have: number; of: number }[] {
  const distinct = [...new Set(values)];
  const count = new Map<string, { steps: Step[]; have: number }>();

  for (const v of distinct) {
    let layer = new Map<string, { steps: Step[]; at: Set<string> }>([
      ["", { steps: [], at: new Set([v]) }],
    ]);

    for (let d = 0; d < depth; d++) {
      const next = new Map<string, { steps: Step[]; at: Set<string> }>();
      for (const { steps, at } of layer.values())
        for (const from of at)
          for (const st of stepsFrom(index, from)) {
            const landed = step(index, from, st.dir, st.fn);
            if (!landed.length) continue;
            const key = [...steps, st].map(stepName).join(" <- ");
            const to = next.get(key) ?? { steps: [...steps, st], at: new Set<string>() };
            for (const x of landed) to.at.add(x);
            next.set(key, to);
          }
      layer = next;
    }

    // one vote per value per route, however many ways it got there
    for (const { steps } of layer.values()) {
      const key = pathName(steps);
      const at = count.get(key);
      if (at) at.have++;
      else count.set(key, { steps, have: 1 });
    }
  }

  return [...count.values()]
    .map(c => ({ ...c, of: distinct.length }))
    .sort((a, b) => b.have - a.have || pathName(a.steps).localeCompare(pathName(b.steps)));
}

// The header addStep WOULD give this child. Kept next to addStep so the naming
// rule lives in one place: a caller adding several steps at once needs each
// middle header to hang the next step off, whether or not it already existed.
export function childHeader(tree: Column, parentHeader: string, s: Step): string | null {
  const parent = findNode(tree, parentHeader);
  if (!parent) return null;
  return parent.step === null ? stepName(s) : stepName(s) + " via " + parent.header;
}

// destination first, the way a column header reads
export function pathName(steps: Step[]): string {
  return steps.slice().reverse().map(stepName).join(" via ");
}

// every function that produced something — the anchors you can start from
export function anchorFunctions(index: Index): string[] {
  const seen = new Set<string>();
  for (const a of index.apps) seen.add(a.fn);
  return [...seen].sort();
}

export function anchorValues(index: Index, fn: string): string[] {
  const out: string[] = [];
  for (const a of index.apps)
    if (a.fn === fn && !out.includes(a.result)) out.push(a.result);
  return out.sort();
}

// --- the column tree ---------------------------------------------------

export function stepName(s: Step): string {
  return (s.dir === "rev" ? "rev_" : "") + s.fn + "()";
}

export function newTree(anchorFn: string): Column {
  return { step: null, anchorFn, header: anchorFn + "()", children: [] };
}

// A header reads destination-first and spells out the way back: a child is its
// own step in front of its parent's header, so two columns that branch from the
// same point share a suffix and the header says where they pair. The anchor is
// left off — it is the same for every column, so naming it says nothing.
export function addStep(tree: Column, parentHeader: string, s: Step): Column | null {
  const parent = findNode(tree, parentHeader);
  if (!parent) return null;
  const h = parent.step === null ? stepName(s) : stepName(s) + " via " + parent.header;
  if (parent.children.some(c => c.header === h)) return null;
  const child: Column = { step: s, header: h, children: [] };
  parent.children.push(child);
  return child;
}

export function findNode(tree: Column, header: string): Column | null {
  if (tree.header === header) return tree;
  for (const c of tree.children) {
    const found = findNode(c, header);
    if (found) return found;
  }
  return null;
}

export function removeNode(tree: Column, header: string): boolean {
  for (let i = 0; i < tree.children.length; i++) {
    if (tree.children[i].header === header) { tree.children.splice(i, 1); return true; }
    if (removeNode(tree.children[i], header)) return true;
  }
  return false;
}

export function columns(tree: Column): string[] {
  const out: string[] = [];
  (function walk(n: Column): void { out.push(n.header); n.children.forEach(walk); })(tree);
  return out;
}

// --- the value tree ----------------------------------------------------
//
// Rows are its leaves. Siblings are computed from the SAME parent value, so
// two branches pair at their deepest shared step — which is the whole reason
// the walk carries its intermediate values instead of collapsing each branch
// to a set of leaves. Collapsing gives a cross product and six wrong rows for
// bob instead of three right ones.

interface Budget { count: number; capped: boolean }

function expandRows(
  index: Index, node: Column, value: string, chain: string[],
  isRoot: boolean, cap: number, state: Budget,
): Row[] {
  const base: Row = { [node.header]: { value, chain } };
  let rows: Row[] = [base];

  const childChain = isRoot ? [] : chain.concat([value]);

  for (const child of node.children) {
    const vals = step(index, value, child.step!.dir, child.step!.fn);
    const next: Row[] = [];
    for (const row of rows) {
      if (vals.length === 0) { next.push(row); continue; }  // descendants -> "?"
      for (const cv of vals) {
        const subs = expandRows(index, child, cv, childChain, false, cap, state);
        for (const sub of subs) {
          if (next.length + state.count >= cap) { state.capped = true; break; }
          next.push({ ...row, ...sub });
        }
      }
    }
    rows = next;
  }
  return rows;
}

export function tabulate(index: Index, tree: Column, opts?: { maxRows?: number }): Table {
  const cap = opts?.maxRows ?? 2000;
  const state: Budget = { count: 0, capped: false };
  const rows: Row[] = [];
  for (const v of anchorValues(index, tree.anchorFn!)) {
    if (state.count >= cap) { state.capped = true; break; }
    for (const r of expandRows(index, tree, v, [], true, cap, state)) rows.push(r);
    state.count = rows.length;
  }
  return { columns: columns(tree), rows, capped: state.capped };
}

// --- display -----------------------------------------------------------
//
// NEVER shorten a value. No nickname, no ellipsis, no hover-to-see-the-rest —
// a value's text is its identity, and an abbreviation grows into an invented
// identifier. Quoting is not shortening: it stops a value containing the
// display's own separators from being read as one.

export function quote(v: string): string {
  return /[|.,"\s]/.test(v) ? '"' + v.replace(/"/g, '\\"') + '"' : v;
}

// "bob|2026-08-25|projX|8|1".2026-08-25 — the walk that produced this cell
export function qualified(cell: Cell | undefined): string {
  if (!cell) return "?";
  return [...cell.chain.map(quote), quote(cell.value)].join(".");
}
