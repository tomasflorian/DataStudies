// taxonomy.ts — a reader's vocabulary: names for groups of kinds.
//
//   ["itstuff", "kind, is-a, example, kind", "gardener"]
//   ["ip",      "kind, is-a, example, kind", "itstuff"]
//   ["host",    "kind, is-a, example, kind", "itstuff"]
//
// A TAXONOMY IS A CLIENT'S, NOT THE ENGINE'S. The engine knows nothing about
// taxonomies: a query says which kinds a step merges — `itstuff{host, ip, url}` —
// and means the same with or without anyone's vocabulary. A client holds a
// taxonomy to decide what you are shown — a gardener sees flower and itstuff, and
// nothing else, as if nothing else existed — and to write a name out as the group
// it stands for when you use it.
//
// A TAXONOMY IS LINES. taxonomies/<name>.pile is a pile file: every line one edge
// of a tree, child on the left and parent on the right, with the one relation
// read as vertical. Being lines, it can also be introduced into a pile and walked
// like anything else.
//
// A MEMBER NEED NOT BE IN THE PILE. The gardener's `itstuff` lists `cpu`, and
// nobody here wrote a line about a cpu. It stays in the group anyway, so the day a
// document with one arrives, every query that names `itstuff` already covers it.
//
// PURE: text in, answers out. Nothing here reads a file, so the shell, read.ts
// and the page — which has no file system — use the same code.

export interface Taxonomy {
  name: string;
  root: string;
  children: ReadonlyMap<string, readonly string[]>;   // a name -> what hangs off it
}

const WORD = /^[A-Za-z][A-Za-z0-9_-]*$/;
const VERTICAL = "is-a";

export function readTaxonomy(name: string, text: string): Taxonomy {
  const children = new Map<string, string[]>();
  const parent = new Map<string, string>();

  text.split("\n").forEach((raw, i) => {
    const t = raw.trim();
    if (!t) return;
    const where = `${name}, line ${i + 1}`;
    let line: unknown;
    try { line = JSON.parse(t); } catch { throw new Error(`${where}: not a line of three strings`); }
    if (!Array.isArray(line) || line.length !== 3 || !line.every(s => typeof s === "string"))
      throw new Error(`${where}: not a line of three strings`);
    const [child, relation, up] = line as [string, string, string];
    const fields = relation.split(",").map(f => f.trim());
    const verb = fields.length === 4 ? fields[1] : fields.length === 2 ? fields[0] : "";
    if (verb !== VERTICAL)
      throw new Error(`${where}: every line is one edge · ["child", "kind, is-a, example, kind", "parent"]`);
    if (!WORD.test(child) || !WORD.test(up))
      throw new Error(`${where}: a name is letters, digits, _ and -`);
    if (parent.has(child) && parent.get(child) !== up)
      throw new Error(`${name}: ${child} hangs off both ${parent.get(child)} and ${up}`);
    parent.set(child, up);
    const kids = children.get(up) ?? children.set(up, []).get(up)!;
    if (!kids.includes(child)) kids.push(child);
  });

  const roots = [...children.keys()].filter(n => !parent.has(n));
  if (!roots.length) throw new Error(`${name}: every name hangs off another one, so there is no top`);
  if (roots.length > 1)
    throw new Error(`${name}: a taxonomy has one top, this has ${roots.length} — ${roots.join(", ")}`);

  const taxonomy: Taxonomy = { name, root: roots[0]!, children };
  kindsUnder(taxonomy, taxonomy.root, new Set());     // refuses a name under itself
  return taxonomy;
}

// The kinds under a name, at any depth — a name with nothing under it is a kind.
function kindsUnder(t: Taxonomy, node: string, above: ReadonlySet<string>): string[] {
  if (above.has(node)) throw new Error(`${t.name}: ${node} is under itself`);
  const kids = t.children.get(node);
  if (!kids) return [node];
  const next = new Set(above).add(node);
  return [...new Set(kids.flatMap(k => kindsUnder(t, k, next)))];
}

// Every name that holds something -> its kinds, sorted. What a client sends to
// have its names counted, and what it writes a name out as.
export function groupsOf(t: Taxonomy): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const node of t.children.keys()) out[node] = kindsUnder(t, node, new Set()).sort();
  return out;
}

// What a menu shows at the top: the names hanging off the root, in the order the
// author wrote them.
export const topOf = (t: Taxonomy): readonly string[] => t.children.get(t.root) ?? [];

// Every kind the taxonomy names. Anything else is outside it, and hidden.
export const kindsOf = (t: Taxonomy): Set<string> => new Set(kindsUnder(t, t.root, new Set()));

// A group as a query writes it — its kinds sorted, so it is spelled one way.
export const spell = (name: string, kinds: readonly string[]): string =>
  `${name}{${[...new Set(kinds)].sort().join(", ")}}`;

// A NAME OUT AS ITS GROUP. Wherever a step is a bare name the taxonomy holds
// something under — at the start, or after `/`, `(` or `,` — it is written as the
// group, marks kept. A kind, a kind with a verb, and a group already spelled out
// are left as they are.
export function expand(t: Taxonomy, text: string): string {
  const groups = groupsOf(t);
  let out = "";
  let depth = 0;
  let stepStarts = true;
  for (let i = 0; i < text.length;) {
    const c = text[i]!;
    if (depth === 0 && stepStarts && /[A-Za-z]/.test(c)) {
      const word = /^[A-Za-z][A-Za-z0-9_-]*/.exec(text.slice(i))![0];
      const after = text.slice(i + word.length);
      const kinds = groups[word];
      out += kinds && /^\s*[*~]*\s*(?:[/,)]|$)/.test(after) ? spell(word, kinds) : word;
      i += word.length;
      stepStarts = false;
      continue;
    }
    if (c === "{") depth++;
    if (c === "}") depth = Math.max(0, depth - 1);
    if (depth === 0 && (c === "/" || c === "(" || c === ",")) stepStarts = true;
    else if (!/\s/.test(c) && c !== ".") stepStarts = false;
    out += c;
    i++;
  }
  return out;
}

// THE OTHER WAY: a group this taxonomy would have written, back to its name — so
// a query can be shown the way its reader thinks of it.
export function abbreviate(t: Taxonomy, query: string): string {
  const groups = groupsOf(t);
  return query.replace(/([A-Za-z][A-Za-z0-9_-]*)\{([^}]*)\}/g, (whole, name: string, inside: string) => {
    const kinds = groups[name];
    if (!kinds) return whole;
    const listed = inside.split(",").map(k => k.trim()).filter(Boolean).sort();
    return listed.join(",") === kinds.join(",") ? name : whole;
  });
}
