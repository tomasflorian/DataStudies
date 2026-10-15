// expand.ts — atoms in, nodes and edges out. The one expansion.
//
// An atom is one answer of one call, exactly three strings:  [fn, input, output]
// See the README.
//
//   ["word","paris is a city","city"]
//
//     nodes   word               a function
//             paris is a city    a value
//             the atom           a call
//             city               a value
//     edges   word            -> call    slot: fn
//             paris is a city -> call    slot: input
//             call            -> city    slot: output
//
// THE LOAD-BEARING BIT: expand reads only the atom. It never consults the graph
// built so far. Everything else — that merging is concatenation, that order and
// grouping are irrelevant, that a viewer can expand one arriving atom on its own
// and just add what comes out — follows from this and nothing else.
//
//   expand(A + B) = expand(A) + expand(B)

export type Atom = string[];

export interface GraphNode {
  id: string;
  label: string;
  role: "value" | "application";
  isFn: boolean;
}

export interface GraphEdge {
  from: string;
  to: string;
  slot: string;
}

export interface Expanded {
  nodes: GraphNode[];
  edges: GraphEdge[];
  problems: string[];
}

// The atom is a 3-string array of strings — the one test, shared by everything
// that reads atoms.
export function isAtom(x: unknown): x is Atom {
  return Array.isArray(x) && x.length === 3 && x.every(s => typeof s === "string");
}

export function identity(atom: Atom): string[] {
  return atom.slice(0, 2);
}

// A call is a function and an input. A call with several answers is one call
// node with several output edges — one per line. It has no name: its identity
// is its own contents, compared element by element. vis-network wants a string
// id, so one is minted here from the identity: canonical because JSON escapes
// everything, and never displayed, never written to a file, never merged. The
// LABEL is the readable form and nothing parses it.
export function callId(atom: Atom): string {
  return JSON.stringify(identity(atom));
}

export function callLabel(atom: Atom): string {
  return atom[0] + "(" + atom[1] + ")";
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function expand(atoms: Atom[]): Expanded {
  const values = new Map<string, GraphNode>();
  const calls = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  const problems: string[] = [];

  const value = (text: string): GraphNode => {
    let n = values.get(text);
    if (!n) {
      n = { id: text, label: text, role: "value", isFn: false };
      values.set(text, n);
    }
    return n;
  };

  const edge = (from: string, to: string, slot: string): void => {
    const k = from + " " + to + " " + slot;
    if (!edges.has(k)) edges.set(k, { from, to, slot });
  };

  for (const atom of atoms) {
    if (!isAtom(atom)) {
      problems.push("not an atom: " + JSON.stringify(atom));
      continue;
    }
    const [fn, input, output] = atom;
    const id = callId(atom);

    if (!calls.has(id))
      calls.set(id, { id, label: callLabel(atom), role: "application", isFn: false });

    // A node is a function IN THIS CALL — it is what filled the fn slot. Not a
    // property of the node, not a way of spelling it. A node can be a function
    // in one call and a value in another; both lives hang off the one node.
    value(fn).isFn = true;
    edge(fn, id, "fn");
    value(input);
    edge(input, id, "input");
    value(output);
    edge(id, output, "output");
  }

  // Values are keyed by text and calls by their argument list — two different
  // kinds of identity, so nothing says they cannot collide once both are
  // squeezed into one string-keyed space for drawing. Say so rather than
  // silently merging two unrelated things onto one node.
  for (const id of calls.keys())
    if (values.has(id)) problems.push("a value reads exactly like a call id: " + id);

  const nodes = [...values.values(), ...calls.values()].sort((a, b) => cmp(a.id, b.id));
  const out = [...edges.values()].sort((a, b) =>
    cmp(a.from, b.from) || cmp(a.to, b.to) || cmp(a.slot, b.slot));

  return { nodes, edges: out, problems };
}

// One atom per line, blank lines skipped — see the README, "The atom". A line
// that is not an atom (a write cut off mid-line, a stray edit) is skipped and
// reported by line number, so one bad line costs that line and not the pile.
export interface Parsed {
  atoms: Atom[];
  broken: number[];   // 1-based line numbers
}

export function parse(text: string): Parsed {
  const atoms: Atom[] = [];
  const broken: number[] = [];
  text.split("\n").forEach((line, i) => {
    const t = line.trim();
    if (!t) return;
    let a: unknown;
    try { a = JSON.parse(t); } catch { broken.push(i + 1); return; }
    if (isAtom(a)) atoms.push(a); else broken.push(i + 1);
  });
  return { atoms, broken };
}

export function brokenNote(broken: number[], where: string): string {
  const shown = broken.slice(0, 10).join(", ") + (broken.length > 10 ? ", …" : "");
  return `${where}: skipped ${broken.length} broken line(s): ${shown}`;
}

export function format(atoms: Atom[]): string {
  return atoms.map(a => JSON.stringify(a)).join("\n") + "\n";
}
