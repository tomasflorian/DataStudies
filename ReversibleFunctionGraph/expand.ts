// expand.ts — atoms in, nodes and edges out. The one expansion.
//
// An atom is one call, flat, all strings:  [fn, ...args, result]
// Length is at least 3. Slot 0 is the function, the last slot is the result,
// everything between is the arguments in order. See the README.
//
//   ["hasLetter","cat","z","false"]
//
//     nodes   hasLetter    a function
//             cat, z       values
//             the atom     a call
//             false        a value
//     edges   hasLetter -> call    slot: fn
//             cat       -> call    slot: arg0
//             z         -> call    slot: arg1
//             call      -> false   slot: result
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

export function identity(atom: Atom): string[] {
  return atom.slice(0, -1);
}

// A call has no name. Its identity is its own contents, compared element by
// element — nothing is ever joined and read back apart. vis-network wants a
// string id, so one is minted here from the identity: canonical because JSON
// escapes everything, and never displayed, never written to a file, never
// merged. The LABEL is the readable form and nothing parses it.
export function callId(atom: Atom): string {
  return JSON.stringify(identity(atom));
}

export function callLabel(atom: Atom): string {
  return atom[0] + "(" + atom.slice(1, -1).join(",") + ")";
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
    if (!Array.isArray(atom) || atom.length < 3 || atom.some(s => typeof s !== "string")) {
      problems.push("not an atom: " + JSON.stringify(atom));
      continue;
    }
    const fn = atom[0];
    const args = atom.slice(1, -1);
    const result = atom[atom.length - 1];
    const id = callId(atom);

    if (!calls.has(id))
      calls.set(id, { id, label: callLabel(atom), role: "application", isFn: false });

    // A node is a function IN THIS CALL — it is what filled the fn slot. Not a
    // property of the node, not a way of spelling it. A node can be a function
    // in one call and a value in another; both lives hang off the one node.
    value(fn).isFn = true;
    edge(fn, id, "fn");
    args.forEach((a, i) => { value(a); edge(a, id, "arg" + i); });
    value(result);
    edge(id, result, "result");
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

// one atom per line, blank lines skipped — see the README, "The atom"
export function parse(text: string): Atom[] {
  const out: Atom[] = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (t) out.push(JSON.parse(t) as Atom);
  }
  return out;
}

export function format(atoms: Atom[]): string {
  return atoms.map(a => JSON.stringify(a)).join("\n") + "\n";
}
