// Cascaded cutting. Pure: a cutter's text and a file in, lines out, in layers (produce.ts).
//
// A cutter is a table. Each row finds things inside what another row found, and tags what
// it finds with words:
//
//   #! scope       dns@6                        the table's name and version, for messages
//   #! vocabulary  IT                           the vocabulary its words are found in
//   #! <NOUN>      zone-file zone-record host   the roles its words play, said once for the
//   #! <VERB>      name address                 table; a word may have several, or none
//   # on          id            tags                  regex
//   file          hint          hint                  ^eoe: zone-file$
//   file          zone-file     zone-file             (?<=^eoe: zone-file\n)[\s\S]+
//   zone-file     zone-record   zone-record           ^[^;\s].*$
//   zone-record   -             ip address            \sA\s+(\S+)
//
// Tab-separated: "on", an id, any number of tag cells (each holding space-separated
// words), and the regex last, so a long one does not push the others around. "on" names
// the id of the row whose finds this row runs on; "file" is the file's whole text. An id of
// "-" means nothing runs on this row's finds. A word written "@gardening" puts the row's
// words in that vocabulary instead of the table's. The thing found is the regex's first
// group if it has one, the whole match if not. Every regex is multiline: a line break is a
// separator like any other, and ^ and $ meet it the same way.
//
// A table applies to a file when one of its rows on "file" finds something in it — the
// file says what it is — and a table with no rows on "file" applies to every file. Several
// tables can apply to one file. Two tables finding the same thing in the same whole write
// the same link.
//
// What the engine writes, for every find:
//
//   base      whole ──→ thing       thing was found inside whole
//   types     IT ~ ip → find        the find carries that word, a sense (see produce.ts)
//
// and each sense with its roles once. A table that says "#! file <words>" also gives those
// words to the line saying the file's text is a file — the line the runner writes when it
// reads the file; its id is its content, so the table can name it without writing it. Rows keep
// running on what they find until a round adds nothing. It always ends: a thing is always
// strictly shorter than its whole, and a row runs on a given string once. It only adds, so
// the order rows run in changes nothing.
//
// The engine knows no words, roles or vocabularies. It copies them from the table.

import { line, noLayers, sense, type Layers, type Source } from "./produce.ts";
import type { Line } from "./core/lines.ts";
import { FILE_WORD, NOUN, VERB } from "./core/markers.ts";
// A table's header names its roles the way a person writes them; each is one of the pile's words.
const ROLE_WORDS: Record<string, number> = { "<NOUN>": NOUN, "<VERB>": VERB };

const FILE = "file";
const NO_ID = "-";
const IN_VOCABULARY = "@";

export type Row = { on: string; id: string; words: string[]; vocabulary: string; regex: RegExp; groups: number };
export type Cutter = { scope: string; vocabulary: string; roles: Map<string, string[]>; fileWords: string[]; rows: Row[] };

export function parseCutter(text: string, source = "cutter"): Cutter {
  let scope: string | undefined, vocabulary: string | undefined;
  let fileWords: string[] = [];
  const roles = new Map<string, string[]>();
  const cells: { on: string; id: string; words: string[]; regex: string; at: number }[] = [];
  text.split("\n").forEach((raw, i) => {
    const line = raw.replace(/\r$/, "");
    if (line.startsWith("#!")) {
      const [key, ...words] = line.slice(2).trim().split(/\s+/);
      if (key === "scope") scope = words[0];
      else if (key === "vocabulary") vocabulary = words[0];
      else if (key === FILE) fileWords = words;
      else for (const one of words) roles.set(one, [...(roles.get(one) ?? []), key]);
      return;
    }
    if (!line.trim() || line.startsWith("#")) return;
    const fields = line.split("\t");
    if (fields.length < 3) throw new Error(`${source}:${i + 1}: a row is on, id, tags…, regex — tab-separated`);
    cells.push({ on: fields[0].trim(), id: fields[1].trim() || NO_ID, words: fields.slice(2, -1).flatMap((cell) => cell.split(/\s+/)).filter(Boolean), regex: fields.at(-1)!, at: i + 1 });
  });
  if (!scope || !vocabulary) throw new Error(`${source}: needs "#! scope" and "#! vocabulary"`);
  const rows = cells.map(({ on, id, words, regex }) => ({
    on, id,
    words: words.filter((one) => !one.startsWith(IN_VOCABULARY)),
    vocabulary: words.find((one) => one.startsWith(IN_VOCABULARY))?.slice(IN_VOCABULARY.length) ?? vocabulary!,
    regex: new RegExp(regex, "gm"),
    groups: new RegExp(`${regex}|`).exec("")!.length - 1,
  }));
  return { scope, vocabulary, roles, fileWords, rows };
}

// A whole file, cut — or nothing, if the table does not recognize it.
export function cutByCascade(source: Source, cutter: Cutter): Layers {
  return cascade(cutter, source.text);
}

export function cascade(cutter: Cutter, text: string): Layers {
  const fileRows = cutter.rows.filter((row) => row.on === FILE);
  if (fileRows.length && !fileRows.some((row) => new RegExp(row.regex.source, "m").test(text))) return noLayers();

  const out = noLayers();
  const written = new Set<string>();
  const idsOf = new Map<string, Set<string>>([[text, new Set([FILE])]]);   // which rows found each string
  const done = new Set<string>();                                            // "row index · string": each row runs on a string once

  const write = (pile: Line[], lines: Line[]) => {
    for (const line of lines) {
      const key = JSON.stringify(line);
      if (!written.has(key)) { written.add(key); pile.push(line); }
    }
  };
  // The words an arrow carries: each a sense in its vocabulary, with the roles the table
  // gives the word.
  const carry = (arrowId: number, words: string[], vocabulary: string) => {
    for (const text of words) {
      const one = sense(vocabulary, text, (cutter.roles.get(text) ?? []).map((role) => ROLE_WORDS[role] ?? role));
      write(out.types, [...one.lines, line(one.id, arrowId)]);
    }
  };
  // A find, carrying its words.
  const found = (whole: string, thing: string, words: string[], vocabulary: string) => {
    const finding = line(whole, thing);
    write(out.base, [finding]);
    carry(finding[1], words, vocabulary);
  };

  if (cutter.fileWords.length) carry(line(FILE_WORD, text)[1], cutter.fileWords, cutter.vocabulary);
  for (let changed = true; changed; ) {
    changed = false;
    for (const [string, ids] of [...idsOf])
      cutter.rows.forEach((row, i) => {
        if (!ids.has(row.on) || done.has(`${i}\0${string}`)) return;
        done.add(`${i}\0${string}`);
        changed = true;
        for (const match of string.matchAll(row.regex)) {
          const thing = row.groups ? match[1] : match[0];
          if (!thing || thing === string) continue;
          found(string, thing, row.words, row.vocabulary);
          if (row.id !== NO_ID) idsOf.set(thing, (idsOf.get(thing) ?? new Set()).add(row.id));
        }
      });
  }
  return out;
}
