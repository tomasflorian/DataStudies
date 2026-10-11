// stringwalk.ts — the line and the index. Nothing else.
//
// A LINE IS ONE FACT, EXACTLY THREE STRINGS: value, relation, value.
//
//   ["apple", "fruit, grows-on, grows, plant", "tree"]
//
// A PILE is a set of lines. Merging is a union over lines and nothing else.
//
// THREE AND ONLY THREE. A longer line would be a list of steps flattened into
// a tuple, and the flattening is not free — it puts a path's identity in the
// line's structure, and structure is not a string, so nothing can stand on it,
// name it, or join on it. A path worth recording is a VALUE, its own exact
// text, with facts about it written as more lines.

export type Line = [string, string, string];

// --- a relation has a shape -------------------------------------------
//
// A VALUE IS ANY STRING. A RELATION IS UP TO FOUR FIELDS, comma separated:
//
//   "ip, resolves-to, has-address, host"
//
//   forwards   10.2.14.7       resolves-to host  backup-03.corp
//   backwards  backup-03.corp  has-address ip    10.2.14.7
//
// THE KINDS SIT AT THE ENDS AND THE VERBS SIT BETWEEN THEM. A relation always
// joins two kinds — the thing at the start is something, the thing at the end
// is something — and which one you land on is only a question of which way you
// walked. So kinds come as a PAIR or not at all. One kind would be a relation
// that knows what it points at and not what it points from, which is not a
// thing a relation can be.
//
// VERBS COME IN PAIRS TOO, so there are three field counts and nothing between:
//
//   ""                                    0  related, nobody has said how
//   "grows-on, grows"                     2  both verbs, kinds unsaid
//   "fruit, grows-on, grows, plant"       4  everything
//
// `""` is a producer certain two values belong together and unable to name how.
// It reads as `related` with `said` false, so it is never mistaken for a word a
// producer chose.
//
// WHAT YOU TYPE pairs a verb with what you land on — `grows-on plant` forwards,
// `grows fruit` backwards. Each is built from opposite ends of the relation,
// which is why `text` is assembled here rather than stored in the line.

export interface Phrase {
  text: string;                 // what you type and what a column is called
  verb: string;                 // "grows-on"
  kind: string;                 // "plant" — what you land on, "" if unsaid
  said: boolean;                // did a producer write this verb, or did we
}

export interface Relation {
  text: string;                 // the whole string, as written in the line
  fwd: Phrase;
  back: Phrase;
}

const WORD = /^[A-Za-z][A-Za-z0-9_-]*$/;

const words = (s: string): string[] | null => {
  const w = s.trim().split(" ").filter(x => x !== "");
  return w.length && w.every(x => WORD.test(x)) ? w : null;
};

const phrase = (verb: string, kind: string, said: boolean): Phrase =>
  ({ text: kind ? `${verb} ${kind}` : verb, verb, kind, said });

const cache = new Map<string, Relation | null>();

export function readRelation(text: string): Relation | null {
  const got = cache.get(text);
  if (got !== undefined) return got;

  if (text === "") {
    const unnamed: Relation = {
      text,
      fwd: phrase("related", "", false),
      back: phrase("related", "", false),
    };
    cache.set(text, unnamed);
    return unnamed;
  }

  const fields = text.split(",").map(words);
  let out: Relation | null = null;

  if (!fields.some(f => f === null)) {
    const f = fields as string[][];
    const one = (w: string[]) => w.length === 1 ? w[0] : null;   // a kind is one word
    const join = (w: string[]) => w.join(" ");                   // a verb may be several

    // [verb, verb] | [kind, verb, verb, kind]
    const shape: [string, string, string, string] | null =
      f.length === 2 ? ["", join(f[0]), join(f[1]), ""]
      : f.length === 4 && one(f[0]) && one(f[3])
        ? [one(f[0])!, join(f[1]), join(f[2]), one(f[3])!]
      : null;

    if (shape) {
      const [a, fwdVerb, backVerb, b] = shape;
      out = { text, fwd: phrase(fwdVerb, b, true), back: phrase(backVerb, a, true) };
    }
  }
  cache.set(text, out);
  return out;
}

// A LINE IS CHECKED THE SAME WAY WHEREVER IT COMES FROM — a file, or a cutter
// handing lines back in memory.
export function checkLine(line: unknown, where: string): Line {
  if (!Array.isArray(line) || line.length !== 3 || !line.every(s => typeof s === "string"))
    throw new Error(`${where}\n  a fact is exactly three strings: value, relation, value` +
      `\n  a path is not a long line — it is a value, with facts about it`);
  if (!readRelation(line[1]))
    throw new Error(`${where}\n  ${JSON.stringify(line[1])} is not a relation.` +
      `\n  a relation is  ""  |  verb, verb  |  kind, verb, verb, kind`);
  return line as Line;
}

export function parse(text: string): Line[] {
  const out: Line[] = [];
  text.split("\n").forEach((raw, i) => {
    const t = raw.trim();
    if (!t) return;
    out.push(checkLine(JSON.parse(t), `line ${i + 1}: ${t.slice(0, 60)}`));
  });
  return out;
}

// --- the index --------------------------------------------------------
//
// EVERY STRING, EVERYWHERE IT OCCURS. Position 0 and 2 hold values, position 1
// holds the relation — position is the only thing that says which, and which
// end a value sits at is the only thing that says which way it can be walked.
// Relations are indexed too: a relation is a string, and `at` does not ask what
// role a string plays.
export interface Spot { line: number; pos: number }

export type Dir = "fwd" | "back";

// ONE PHRASE CAN NAME SEVERAL RELATIONS — `contains word`, `contains ip` and
// `contains url` are all `appears in text` backwards. Not a collision: a step
// walks every one of them, and `add` groups the landings by value, so readings
// that agree collapse into one cell and readings that disagree split the row.
export interface Way { relation: string; dir: Dir }

export interface Pile {
  lines: Line[];
  at: Map<string, Spot[]>;        // every string -> everywhere it occurs
  ways: Map<string, Way[]>;       // every phrase -> every way to walk it
}

export function build(lines: Line[]): Pile {
  const at = new Map<string, Spot[]>();
  const ways = new Map<string, Way[]>();
  const done = new Set<string>();

  const way = (phrase: string, w: Way) =>
    (ways.get(phrase) ?? ways.set(phrase, []).get(phrase)!).push(w);

  lines.forEach((line, li) =>
    line.forEach((s, pos) => {
      (at.get(s) ?? at.set(s, []).get(s)!).push({ line: li, pos });
      if (pos !== 1 || done.has(s)) return;
      done.add(s);
      const rel = readRelation(s)!;
      way(rel.fwd.text, { relation: s, dir: "fwd" });
      way(rel.back.text, { relation: s, dir: "back" });
    }));

  return { lines, at, ways };
}
