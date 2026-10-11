// FOREST — outlines in, the forest and its indexes out (SPEC.md, sections 1, 2, 5). Pure.
//
//   outline text ─parseOutline→ Tree ─number→ Forest ─indexOf→ Index ─up/down/jump→ ids
//
// A Tree is text with its children, before ids. A Forest is what would be written to disk:
// [id, parentId] and [id, text], one each per occurrence, in id order.

export type Tree = { text: string; children: Tree[] };
export type Forest = { tree: [number, number | null][]; strings: [number, string][] };
export type Index = {
  parentOf: Map<number, number>;
  childrenOf: Map<number, number[]>;
  stringOf: Map<number, string>;
  idsOf: Map<string, number[]>;
};

const INDENT = "  ";

// One outline: one JSON string per line, indented two spaces under its parent, one root.
export function parseOutline(outline: string): Tree {
  const stack: Tree[] = [];
  let root: Tree | undefined;
  outline.split("\n").forEach((line, i) => {
    if (!line.trim()) return;
    const depth = (line.length - line.trimStart().length) / INDENT.length;
    const node: Tree = { text: JSON.parse(line.trim()), children: [] };
    if (typeof node.text !== "string") throw new Error(`outline line ${i + 1}: not a JSON string`);
    if (depth === 0) {
      if (root) throw new Error(`outline line ${i + 1}: a second root`);
      root = node;
    } else {
      const parent = stack[depth - 1];
      if (!parent || !Number.isInteger(depth)) throw new Error(`outline line ${i + 1}: indented under nothing`);
      parent.children.push(node);
    }
    stack[depth] = node;
    stack.length = depth + 1;
  });
  if (!root) throw new Error("outline: empty");
  return root;
}

export function printOutline(tree: Tree, depth = 0): string {
  return [INDENT.repeat(depth) + JSON.stringify(tree.text), ...tree.children.map((child) => printOutline(child, depth + 1))].join("\n");
}

// Ids 1, 2, 3 … in reading order: tree after tree, each from its root down, children in order.
export function number(trees: Tree[]): Forest {
  const forest: Forest = { tree: [], strings: [] };
  const visit = (node: Tree, parentId: number | null) => {
    const id = forest.tree.length + 1;
    forest.tree.push([id, parentId]);
    forest.strings.push([id, node.text]);
    for (const child of node.children) visit(child, id);
  };
  for (const tree of trees) visit(tree, null);
  return forest;
}

export function indexOf(forest: Forest): Index {
  const index: Index = { parentOf: new Map(), childrenOf: new Map(), stringOf: new Map(), idsOf: new Map() };
  for (const [id, parentId] of forest.tree)
    if (parentId !== null) {
      index.parentOf.set(id, parentId);
      index.childrenOf.set(parentId, [...(index.childrenOf.get(parentId) ?? []), id]);
    }
  for (const [id, text] of forest.strings) {
    index.stringOf.set(id, text);
    index.idsOf.set(text, [...(index.idsOf.get(text) ?? []), id]);
  }
  return index;
}

// The three moves. up and down stay inside a tree; jump is every occurrence of the text,
// itself included.
export const up = (index: Index, id: number): number[] => (index.parentOf.has(id) ? [index.parentOf.get(id)!] : []);
export const down = (index: Index, id: number): number[] => index.childrenOf.get(id) ?? [];
export const jump = (index: Index, id: number): number[] => index.idsOf.get(index.stringOf.get(id)!) ?? [];

// Up as many steps as asked, stopping at the root; no number of steps means all the way up.
export const climb = (index: Index, id: number, steps = Infinity): number =>
  steps > 0 && index.parentOf.has(id) ? climb(index, index.parentOf.get(id)!, steps - 1) : id;

// A VIEW is built once and shown in any order and any format:
//
//   viewOf → View ─topDown/anchored→ Line[] ─printLines/printTriples→ text
//
// A View is what one occurrence shows: up as many steps as asked, then everything below there,
// each node with its kind and the occurrence itself marked. Orders and formats read only the
// View, never the index.
export type Kind = "value" | "function" | "label";
export type View = { text: string; kind: Kind; anchor: boolean; children: View[] };

// Kinds come from depth: value, function, label, value … from each root down.
const KINDS: Kind[] = ["value", "function", "label"];
const nextKind = (kind: Kind) => KINDS[(KINDS.indexOf(kind) + 1) % KINDS.length];

export function viewOf(index: Index, id: number, steps = Infinity): View {
  let rootSteps = 0;
  for (let at = id; index.parentOf.has(at); at = index.parentOf.get(at)!) rootSteps++;
  const top = climb(index, id, steps);
  const build = (at: number, kind: Kind): View => ({
    text: index.stringOf.get(at)!,
    kind,
    anchor: at === id,
    children: down(index, at).map((child) => build(child, nextKind(kind))),
  });
  return build(top, KINDS[(rootSteps - Math.min(steps, rootSteps)) % KINDS.length]);
}

// The views of a text: one per occurrence when anchored; otherwise one per top its occurrences
// climb to, since occurrences that share a top would show the same nodes.
export function viewsOf(index: Index, text: string, steps = Infinity, anchoredAt = false): View[] {
  const ids = index.idsOf.get(text) ?? [];
  const shown = anchoredAt ? ids : ids.filter((id, i) => ids.findIndex((other) => climb(index, other, steps) === climb(index, id, steps)) === i);
  return shown.map((id) => viewOf(index, id, steps));
}

// A view's nodes in the order they are shown, each with its depth below the top and the nodes
// above it in the view, nearest first.
export type Line = { node: View; depth: number; above: View[] };

// Top down: each node after its parent, as in any outline.
export const topDown = (node: View, depth = 0, above: View[] = []): Line[] => [{ node, depth, above }, ...node.children.flatMap((child) => topDown(child, depth + 1, [node, ...above]))];

// The anchor first, then the nodes above it, each one step out: these read upward, each one's
// parent being the next line below it that is less indented. Every other node comes after its
// parent and reads down.
//
//       "backup-03"
//     "text"
//   "regex"
//     "part"
//       "backup"
export function anchored(view: View): Line[] {
  const pathTo = (node: View): View[] | undefined => {
    if (node.anchor) return [node];
    for (const child of node.children) {
      const path = pathTo(child);
      if (path) return [node, ...path];
    }
    return undefined;
  };
  const path = pathTo(view)!; // top … anchor
  return path
    .map((node, depth) => ({ node, depth, above: path.slice(0, depth).reverse() }))
    .reverse()
    .flatMap((line, i, chain) => [line, ...line.node.children.filter((child) => child !== chain[i - 1]?.node).flatMap((child) => topDown(child, line.depth + 1, [line.node, ...line.above]))]);
}

// Each line as its text in JSON, indented by its depth.
export const printLines = (lines: Line[]): string => lines.map(({ node, depth }) => INDENT.repeat(depth) + JSON.stringify(node.text)).join("\n");

// One line per value, as function:label:"value", indented one step per value above it. A
// function or label outside the view is left empty, so a view from a value starts with
// ::"value". A function or label is written bare unless it holds a colon, a quote or a space.
//
//   ::"10.2.14.7    backup-03.corp   backup-03"
//     regex:ip:"10.2.14.7"
//     regex:name:"backup-03.corp"
export function printTriples(lines: Line[]): string {
  const bare = (node: View | undefined) => (node === undefined ? "" : /^[^\s:"]+$/.test(node.text) ? node.text : JSON.stringify(node.text));
  return lines
    .flatMap(({ node, depth, above }) => {
      if (node.kind !== "value" && node.children.length) return []; // written with its values
      const [fn, label] = node.kind === "value" ? [above[1], above[0]] : node.kind === "label" ? [above[0], node] : [node, undefined];
      const value = node.kind === "value" ? JSON.stringify(node.text) : "";
      const valueDepth = depth + (node.kind === "function" ? 2 : node.kind === "label" ? 1 : 0);
      return [INDENT.repeat(Math.floor(valueDepth / 3)) + `${bare(fn)}:${bare(label)}:${value}`];
    })
    .join("\n");
}

// The forest as the two files' texts: JSON Lines, in id order.
export function serialize(forest: Forest): { tree: string; strings: string } {
  const lines = (rows: unknown[]) => rows.map((row) => JSON.stringify(row)).join("\n") + "\n";
  return { tree: lines(forest.tree), strings: lines(forest.strings) };
}
