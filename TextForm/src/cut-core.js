// The cutter's core: what the dictionaries find in the text, and what follows from where it sits
// (the table). Plain values in, plain values out: no editor and no page, so it runs the
// same in the browser and in node (the tests in test/). Offsets are into the text, from 0.

// --- dictionaries ---

// "Type:value", one a line. The value is everything after the first colon. In quotes it's read as a
// JSON string, so "web01\n192.168.1.2" is a value with a newline in it; quotes keep spaces at its
// ends too, and make it a pattern whatever it says (see "rules" below). (Quotes JSON can't read are
// just taken off, as before.)
export function entries(text) {
  return text.split("\n").flatMap((line) => {
    const i = line.indexOf(":");
    if (i < 1) return [];
    const type = line.slice(0, i).trim();
    let value = line.slice(i + 1).trim(), quoted = false;
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
      quoted = true;
      try { value = JSON.parse(value); } catch { value = value.slice(1, -1); }
    }
    return type && value ? [{ type, value, quoted }] : [];
  });
}
// a line for a value cut out of the text: quoted when it would otherwise be read as something else
export const entryLine = (type, value) =>
  `${type}:${/[\n\r\t\\]/.test(value) || value !== value.trim() || value.startsWith('"') || ruleOf(value, false)?.kind !== "pattern" ? JSON.stringify(value) : value}`;

// --- rules ---
// Every type is a set of stretches of the text, and every dictionary line is a rule that adds to
// one: it makes stretches from the text, or from the stretches of other types. Several lines with
// the same type add up (a union).
//
// From the text:
//   Host: web01                    a pattern: found wherever it's written...
//   IP: 192.168.1.[0-255]          ...with its blanks filled in (below)
//   Date: /\b[1-9][0-9]* May/      a regular expression, written /like this/: the escape hatch
//   Block: cut "\n\n"              the pieces between separators (see "cuts")
// From other types:
//   Word: cut {Line} on " ", "\n"  the same, inside each place of another type
//   HostName: {IP}[spaces]({Word}) a pattern can hold types: {IP} is a place found as an IP. With
//                                  ( ), only that part is the HostName; the rest is what's around it
//   FullRecord: {Record} containing {IP} {Host}+   the Records that hold these (in any order):
//                                  {IP} exactly one, {IP}+ at least one, {IP}* any, {IP}? at most one
//   Port: {Word} in {PortLine}     the Words that lie inside a PortLine
// The words cut, on, containing and in only count in a value written bare: in quotes, a value is
// always a pattern, so Note:"cut on Tuesday" is found as written.
//
// The order rules run in comes from the types they use: a rule runs once every rule making a type
// it uses has. Rules that use each other round in a circle (or a rule that uses its own type) find
// nothing.

// --- patterns ---
// A pattern is text, found as written, where it doesn't cut a word in half: at each end, either
// the pattern's own edge or the text beside it is not a letter or digit. So ".88." is found inside
// an IP, "cra" is not found inside "crack", and [0-255] doesn't stop partway through "2540".
// Blanks, in [ ], are what varies; what fills them in is the value found there:
//   [0-255]   a whole number in that range (written [01-12], it must have that many digits)
//   [A-H]     one letter in that range
//   [digits]  digits          [hex]    hex digits, either case     [word]  letters, digits, _ and -
//   [spaces]  spaces or tabs  [line]   a whole line, not empty     [rest]  the rest of the line
//   [*]       any text at all, as little as will do                [break] a blank line, or the end of the text
// How many characters a blank takes can be given after a colon: [digits:9] exactly 9, [digits:..9]
// at most 9, [digits:5..] at least 5, [digits:6..9] from 6 to 9, and [*:..300] any text, at most
// 300 characters. Any of the blanks above but [break] can have one; a count that can't be read (or
// is on a blank that takes none) leaves the brackets plain text, like any other.
// Anything else in brackets is plain text, so "[INFO]" is still found as written. {Type} is a place
// of that type (only one that's there: "{IP}" is never just the text of an IP somewhere else).
// ( ) around a blank or a type marks the part that gets found; other parentheses are plain text.
// Written bare, \n is a newline, \t a tab, and a backslash before anything else makes it plain text:
// \[digits] is "[digits]". (In quotes, JSON has done that already.)
const WORD = "[\\p{L}\\p{N}]";
const isWordChar = (c) => /[\p{L}\p{N}]/u.test(c || "");
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
// edge: whether the blank begins and ends like a letter or digit (which decides the boundary rule)
// A blank is a character it takes, how many (at least min; any number more), and what has to be
// around it: [line] is only one between the starts and ends of lines. [*] takes as few as will do.
const BLANKS = {
  digits: { chars: "[0-9]", min: 1, edge: true },
  hex: { chars: "[0-9A-Fa-f]", min: 1, edge: true },
  word: { chars: "[\\p{L}\\p{N}_-]", min: 1, edge: true },
  spaces: { chars: "[ \\t]", min: 1, edge: false },
  line: { chars: "[^\\n]", min: 1, before: "(?<![^\\n])", after: "(?![^\\n])", edge: false },
  rest: { chars: "[^\\n]", min: 0, edge: false },
  "*": { chars: "[\\s\\S]", min: 0, few: true, edge: false },
  break: { source: "(?:\\n\\n|$)", edge: false },
};
// a blank and its count (lo and hi: null for none) -> { source, edge }
function sized({ chars, min, few, before = "", after = "", edge }, lo = min, hi = null) {
  const count = lo === hi ? `{${lo}}` : lo === 0 && hi === null ? "*" : lo === 1 && hi === null ? "+" : `{${lo},${hi ?? ""}}`;
  return { source: before + chars + count + (few ? "?" : "") + after, edge };
}
const ESCAPES = { n: "\n", t: "\t" };

// a blank's name -> what it matches, or null when it isn't one (then it's plain text)
function blankOf(inner) {
  const range = inner.match(/^(\d+)-(\d+)$/);
  if (range) {
    const [, lo, hi] = range;
    return { range: { lo: Number(lo), hi: Number(hi), width: lo.length === hi.length && lo.startsWith("0") ? lo.length : 0 }, edge: true };
  }
  if (/^[A-Za-z]-[A-Za-z]$/.test(inner)) return { source: `[${inner}]`, edge: true };
  const [, name, count] = inner.match(/^([^:]+)(?::(.*))?$/) ?? [];
  const blank = BLANKS[name];
  if (!blank) return null;
  if (count === undefined) return blank.chars ? sized(blank) : blank;
  // 9, ..9, 5.., 6..9
  const m = blank.chars && count.match(/^(\d+)$|^(\d*)\.\.(\d*)$/);
  if (!m || m[0] === "..") return null;
  const lo = m[1] ?? (m[2] ? Number(m[2]) : blank.min), hi = m[1] ?? (m[3] ? Number(m[3]) : null);
  if (hi !== null && (Number(lo) > Number(hi) || Number(hi) === 0)) return null;
  return sized(blank, Number(lo), hi === null ? null : Number(hi));
}

// pattern -> pieces: {text}, {blank}, {ref: type}, {open}, {close} (the part's parentheses)
function piecesOf(value, bare) {
  const out = [];
  const text = (t) => (out.at(-1)?.text !== undefined ? (out.at(-1).text += t) : out.push({ text: t }));
  for (let i = 0; i < value.length; ) {
    const c = value[i];
    if (bare && c === "\\" && i + 1 < value.length) { text(ESCAPES[value[i + 1]] ?? value[i + 1]); i += 2; continue; }
    if (c === "[") {
      const j = value.indexOf("]", i), blank = j > i && blankOf(value.slice(i + 1, j));
      if (blank) { out.push({ blank }); i = j + 1; continue; }
    }
    const ref = c === "{" && value.slice(i).match(/^\{([\p{L}\p{N}_][\p{L}\p{N}_ -]*)\}/u);
    if (ref) { out.push({ ref: ref[1].trim() }); i += ref[0].length; continue; }
    if (c === "(" || c === ")") { out.push({ paren: c }); i++; continue; }
    text(c); i++;
  }
  // the first ( ... ) with a blank or a type inside is the part; every other parenthesis is text
  let open = -1, part = false;
  for (let k = 0; k < out.length; k++) {
    if (out[k].paren === "(") open = k;
    else if (out[k].paren === ")" && open >= 0 && !part) {
      if (out.slice(open + 1, k).some((p) => p.blank || p.ref)) { out[open] = { open: true }; out[k] = { close: true }; part = true; }
      open = -1;
    }
  }
  return out.reduce((all, p) => {
    const t = p.paren ?? p.text;
    if (t === undefined) all.push(p);
    else if (all.at(-1)?.text !== undefined) all.at(-1).text += t;
    else all.push({ text: t });
    return all;
  }, []);
}

// pieces -> a matcher { re, ranges, refs }: one regular expression, the check on the number in each
// range blank, and for each type in it the places it must be. places: type -> spans found so far.
// null when it can't find anything (a type with no places).
function compile(pieces, places = () => []) {
  const ranges = [], refs = [];
  const parts = pieces.map((p) => {
    if (p.open) return { source: "(?<part>" };
    if (p.close) return { source: ")" };
    if (p.text !== undefined) return { source: escape(p.text), first: isWordChar(p.text[0]), last: isWordChar(p.text.at(-1)) };
    if (p.ref !== undefined) {
      const spans = places(p.ref);
      if (!spans.length) return null;
      const name = `t${refs.length}`;
      refs.push({ name, at: new Set(spans.map((s) => `${s.from} ${s.to}`)) });
      const values = [...new Set(spans.map((s) => s.value))].sort((a, b) => b.length - a.length); // longest first
      return { source: `(?<${name}>${values.map(escape).join("|")})` };
    }
    if (p.blank.range) {
      const name = `r${ranges.length}`;
      ranges.push({ name, ...p.blank.range });
      return { source: `(?<${name}>[0-9]+)`, first: true, last: true };
    }
    return { source: p.blank.source, first: p.blank.edge, last: p.blank.edge };
  });
  if (parts.includes(null) || !parts.length) return null;
  const ends = parts.filter((p) => p.first !== undefined || p.last !== undefined); // the part's parentheses don't count
  const source = (ends[0]?.first ? `(?<!${WORD})` : "") + parts.map((p) => p.source).join("") + (ends.at(-1)?.last ? `(?!${WORD})` : "");
  return { re: new RegExp(source, "gdu"), ranges, refs };
}

const fits = ({ lo, hi, width }, digits) => {
  const n = Number(digits);
  if (width ? digits.length !== width : digits.length > 1 && digits.startsWith("0")) return false;
  return lo <= n && n <= hi;
};

// Where a matcher matches in the text: [{index, text}] (only the part, when it has one). After each
// match the search tries again one character later, so overlapping repeats are all found.
function matches(matcher, text) {
  const { re, ranges = [], refs = [] } = matcher, out = [];
  re.lastIndex = 0;
  for (let m; (m = re.exec(text)); re.lastIndex = m.index + 1) {
    if (!m[0] || !ranges.every((r) => fits(r, m.groups[r.name]))) continue;
    if (!refs.every(({ name, at }) => at.has(m.indices.groups[name].join(" ")))) continue;
    const [from, to] = m.indices?.groups?.part ?? [m.index, m.index + m[0].length];
    if (from < to) out.push({ index: from, text: text.slice(from, to) });
  }
  return out;
}

// --- cuts ---
// A cut cuts the text instead of searching it:
//   Block: cut "\n\n"
//   Word: cut " ", "\n"
//   Word: cut {Line} on " "
// Every stretch between two separators is found, and so is the stretch before the first one and the
// one after the last: a block is what's left between the cuts, whatever it looks like. Separators
// are written in quotes (JSON, blanks allowed), one or more of them, with commas or spaces between,
// and aren't part of any piece. With several, a piece ends at whichever comes first; where two
// start at the same place, the longer one is the cut. They're taken left to right without
// overlapping, so with just "\n\n", "\n\n\n" is one cut and a "\n" left over. A stretch that is
// only whitespace (that "\n", say) isn't a piece. With {Type} on, each place of that type is cut
// on its own.

// the pieces of text between the separators: [{index, text}]
function cutPieces(separators, text) {
  const cuts = separators.flatMap((s) => matches(s, text)).sort((a, b) => a.index - b.index || b.text.length - a.text.length);
  const out = [];
  let from = 0;
  const cut = (to) => { const piece = text.slice(from, to); if (piece.trim()) out.push({ index: from, text: piece }); };
  for (const m of cuts) {
    if (m.index < from) continue; // overlaps the separator just taken
    cut(m.index);
    from = m.index + m.text.length;
  }
  cut(text.length);
  return out;
}

// --- reading a rule ---
const CUE = String.raw`"(?:[^"\\]|\\.)*"`;
const TYPE = String.raw`\{([^{}]+)\}`;
const CUT = new RegExp(String.raw`^cut\s+(?:${TYPE}\s+on\s+)?(${CUE}(?:[\s,]+${CUE})*)$`, "su");
const CONTAINING = new RegExp(String.raw`^${TYPE}\s+containing\s+(.+)$`, "su");
const IN = new RegExp(String.raw`^${TYPE}\s+in\s+${TYPE}$`, "su");
const COUNTS = { "": [1, 1], "+": [1, Infinity], "*": [0, Infinity], "?": [0, 1] };

// A dictionary line's value -> its rule { kind, uses: [types], run(text, places) -> [{index, text}] },
// or null when it's broken (then it finds nothing). places: type -> its spans, all found by now.
function ruleOf(value, quoted) {
  if (!quoted && value.length > 2 && value.startsWith("/") && value.endsWith("/")) {
    let re;
    try { re = new RegExp(value.slice(1, -1), "gmu"); } catch { return null; }
    return { kind: "regex", uses: [], run: (text) => matches({ re }, text) };
  }
  const cut = !quoted && value.match(CUT);
  if (cut) {
    const [, inType, list] = cut;
    let separators;
    try { separators = [...list.matchAll(new RegExp(CUE, "gu"))].map(([s]) => JSON.parse(s)); } catch { return null; }
    if (!separators.every(Boolean)) return null;
    const pieces = separators.map((s) => piecesOf(s, false));
    if (pieces.some((ps) => ps.some((p) => p.ref !== undefined || p.open))) return null; // separators are plain patterns
    const matchers = pieces.map((ps) => compile(ps));
    const type = inType?.trim();
    return { kind: "cut", uses: type ? [type] : [], run: (text, places) => type
      ? [...new Map(places(type).map((s) => [`${s.from} ${s.to}`, s])).values()]
        .flatMap((s) => cutPieces(matchers, s.value).map((p) => ({ index: s.from + p.index, text: p.text })))
      : cutPieces(matchers, text) };
  }
  const containing = !quoted && value.match(CONTAINING);
  if (containing) {
    const of = containing[1].trim(), slots = [];
    const left = containing[2].replace(/\{([^{}]+)\}([+*?]?)/g, (_, type, q) => { slots.push({ type: type.trim(), min: COUNTS[q][0], max: COUNTS[q][1] }); return ""; });
    if (!slots.length || left.replace(/,|\band\b/g, "").trim()) return null; // only slots (and commas, "and") may follow
    return { kind: "containing", uses: [of, ...slots.map((s) => s.type)], run: (text, places) => places(of)
      .filter((region) => slots.every(({ type, min, max }) => {
        const n = places(type).filter((p) => p !== region && within(region, p)).length;
        return min <= n && n <= max;
      }))
      .map((s) => ({ index: s.from, text: s.value })) };
  }
  const inside = !quoted && value.match(IN);
  if (inside) {
    const of = inside[1].trim(), outer = inside[2].trim();
    return { kind: "in", uses: [of, outer], run: (text, places) => places(of)
      .filter((s) => places(outer).some((o) => o !== s && within(o, s)))
      .map((s) => ({ index: s.from, text: s.value })) };
  }
  const pieces = piecesOf(value, !quoted);
  const uses = [...new Set(pieces.filter((p) => p.ref !== undefined).map((p) => p.ref))];
  if (!uses.length) {
    const matcher = compile(pieces);
    return matcher && { kind: "pattern", uses, run: (text) => matches(matcher, text) };
  }
  return { kind: "pattern", uses, run: (text, places) => { const m = compile(pieces, places); return m ? matches(m, text) : []; } };
}

// Every place a loaded entry is found: {from, to, type, value, entry}, from and to as offsets in
// the text. dicts: [{on, text}], the dictionaries, of which only the loaded ones count. value is the
// text found there; entry is the dictionary line's value that found it (the same, unless it's a
// rule of some kind). The same thing found under the same type by two rules is found once.
export function findSpans(text, dicts) {
  const wanted = new Map(); // value (and whether it was quoted) -> { value, quoted, types }
  for (const d of dicts) if (d.on) for (const { type, value, quoted } of entries(d.text)) {
    const key = (quoted ? '"' : "") + value;
    if (!wanted.has(key)) wanted.set(key, { value, quoted, types: new Set() });
    wanted.get(key).types.add(type);
  }
  const found = new Map(); // "from to type" -> span
  const byType = new Map(); // type -> spans
  const places = (type) => byType.get(type) ?? [];
  const add = (index, value, types, entry) => {
    const from = index, to = from + value.length;
    for (const type of types) {
      const key = `${from} ${to} ${type}`;
      if (found.has(key)) continue;
      const span = { from, to, type, value, entry };
      found.set(key, span);
      if (!byType.has(type)) byType.set(type, []);
      byType.get(type).push(span);
    }
  };
  let pending = [...wanted.values()].flatMap(({ value, quoted, types }) => {
    const rule = ruleOf(value, quoted);
    return rule ? [{ value, types: [...types], rule }] : [];
  });
  // run, in rounds, every rule none of whose types is still waiting to be made by another
  for (;;) {
    const waiting = new Set(pending.flatMap((r) => r.types));
    const ready = pending.filter((r) => r.rule.uses.every((t) => !waiting.has(t)));
    if (!ready.length) break; // what's left uses itself, round in a circle
    for (const { value, types, rule } of ready) for (const m of rule.run(text, places)) add(m.index, m.text, types, value);
    pending = pending.filter((r) => !ready.includes(r));
  }
  return [...found.values()];
}

// --- the table ---

// a contains b: b lies within a, and they are not the same stretch of text
export const contains = (a, b) => a.from <= b.from && b.to <= a.to && (a.from !== b.from || a.to !== b.to);

// spans -> [[type, Map of value -> how many places]], by type
export function byType(spans) {
  const types = new Map();
  for (const s of spans) {
    if (!types.has(s.type)) types.set(s.type, new Map());
    const values = types.get(s.type);
    values.set(s.value, (values.get(s.value) || 0) + 1);
  }
  return [...types].sort(([a], [b]) => a.localeCompare(b));
}

// A table. Columns are types; the first one's places are the rows. For each other
// column, climb from the row's value through what contains it, smallest first, and take that
// column's values from the first stretch that has any (the value's own stretch counts too).
// So a Date comes from the row's own line if it has one, else its record, and so on up; a column
// nothing on the way up has is a hole, "?". The rows are places, so two places with the same
// value are two rows. A column can be several types joined with +, URL+IP: its values are of any
// of them, mixed (as the first column, a row for each place of any of them, in text order).
export const within = (outer, s) => outer.from <= s.from && s.to <= outer.to;

// The types in a column: "URL+IP" is URL and IP
export const typesOf = (column) => column.split("+").map((t) => t.trim()).filter(Boolean);

// The columns as typed: types split by commas. Clicking a type adds it at the end, or takes it out
// if it's there; the rest is written back as "A, B, C".
export const columnsOf = (text) => text.split(",").map((t) => t.trim()).filter(Boolean);
export function toggleColumn(text, type) {
  const columns = columnsOf(text);
  return (columns.includes(type) ? columns.filter((c) => c !== type) : [...columns, type]).join(", ");
}

// Quick filters: the rows whose cells all hold their column's filter, ignoring case. A filter that
// is just "?" keeps the holes (and nothing else: not a URL with a ? in it). One written !word keeps
// the cells with a value that is exactly word, not one that only has it inside ("!10.20.1.1" keeps
// 10.20.1.1, not 10.20.1.10); a "!" alone, not yet followed by anything, filters nothing. filters:
// one a column, "" for none.
function passes(cell, filter) {
  if (filter === "?") return !cell.values.length;
  if (filter.startsWith("!") && filter.length > 1) return cell.values.some((v) => v.toLowerCase() === filter.slice(1));
  return cell.values.join("\n").toLowerCase().includes(filter);
}
export function filterRows(rows, filters) {
  const wanted = filters.map((f) => f.trim().toLowerCase()).map((f) => (f === "!" ? "" : f));
  return rows.filter((cells) => cells.every((cell, k) => !wanted[k] || passes(cell, wanted[k])));
}

export function buildTable(spans, columns) {
  const [anchor, ...rest] = columns.map(typesOf);
  const places = new Map(); // "from to" -> span: a place found as two of the first column's types is one row
  for (const s of spans) if (anchor.includes(s.type) && !places.has(`${s.from} ${s.to}`)) places.set(`${s.from} ${s.to}`, s);
  const rows = [...places.values()].sort((a, b) => a.from - b.from || b.to - a.to);
  return rows.map((row) => {
    const up = [row, ...spans.filter((s) => contains(s, row))].sort((a, b) => (a.to - a.from) - (b.to - b.from));
    return [{ values: [row.value] }, ...rest.map((types) => {
      for (const c of up) {
        const found = spans.filter((s) => types.includes(s.type) && s !== row && within(c, s)).sort((a, b) => a.from - b.from);
        if (found.length) return { values: [...new Set(found.map((s) => s.value))], via: c === row ? row.type : c.type };
      }
      return { values: [] };
    })];
  });
}
