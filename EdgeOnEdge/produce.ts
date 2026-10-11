// What every producer shares: the shapes of line a producer writes. cascade.ts and tune.ts
// are the producers; a cutter is a table cascade.ts reads.
// Producers import core/ only — never walk/.
//
// All pure. An id is computed from content, so a producer never has to remember what it
// wrote: it can point at a line again by recomputing its id. Two producers writing the same
// line write the same line, and union collapses them; each says it said it with a line of
// its own.
//
// A producer writes each line into a layer: a file of its own, unioned with the others when
// the pile is read. A layer groups lines only so they can be loaded or left out together —
// nothing reads which layer a line came from — and each brings the eoe words it uses, so any
// set of layers reads on its own:
//
//   base      what was read: each file's text, said to be a file, what was found inside what,
//             and which of those steps are seen (seen.ts)
//             inside what, [whole, id, part]
//   types     the words — senses with their roles — and which words each finding carries
//   lattice   the tunings' switches and tower
//   files     where things came from: the file each text was read from, and the tuning that
//             said each of its lines
//
// The walk always reads base; the other three are what a reader switches on and off.

import { lineOf, type End, type Line } from "./core/lines.ts";
import { SAID_BY, SYSTEM, VOCABULARY, systemWordText } from "./core/markers.ts";

// Every line is written type-ish end first (SPEC.md, section 3): a whole before its part, a
// vocabulary before its word, a word before the finding it names, a broader word before a
// narrower one, a marker or a source before what it marks or said. The fixed order is what
// makes two producers writing the same claim write the same line.
export const line = (left: End, right: End): Line => lineOf(left, right);

export type Layers = { base: Line[]; types: Line[]; lattice: Line[]; files: Line[] };
export const noLayers = (): Layers => ({ base: [], types: [], lattice: [], files: [] });
export const LAYER_NAMES = Object.keys(noLayers()) as (keyof Layers)[];

// --- senses -------------------------------------------------------------------------
// A word is a sense: a line from a vocabulary's name to a text, "IT" → "ip". The same text in
// two vocabularies is two senses, meeting at the text; the same text in the same vocabulary is
// one sense, whichever producer writes it. Its roles (noun, verb …) are eoe words, each a line
// from the word to the sense; the words come along, so the layer says what they are.
export function sense(vocabulary: string, text: string, roles: End[] = []): { id: number; lines: Line[] } {
  const arrow = line(vocabulary, text);
  const roleWords = roles.flatMap((role) => (typeof role === "number" && systemWordText.has(role) ? systemWord(systemWordText.get(role)!) : []));
  return { id: arrow[1], lines: [arrow, line(VOCABULARY, vocabulary), ...roles.map((role) => line(role, arrow[1])), ...roleWords] };
}

// One of the pile's own words, as lines: its sense in eoe, and that eoe is a vocabulary.
export const systemWord = (text: string): Line[] => sense(SYSTEM, text).lines;

// Who said a line: a line from the source's name to it; the name is said to be a source.
export function saidBy(lineId: number, source: string): Line[] {
  return [line(source, lineId), line(SAID_BY, source), ...systemWord("source")];
}

// Every sense some senses-layer lines hold: its id, vocabulary and text. A sense is a line down
// from its vocabulary to its word. The pile's own words, in eoe, are not senses the data was
// cut into, so they are left out.
export function sensesIn(senseLines: Line[]): { id: number; vocabulary: string; text: string }[] {
  const vocabularies = new Set(senseLines.filter(([left, , name]) => left === VOCABULARY && name !== SYSTEM).map(([, , name]) => name));
  return senseLines.flatMap(([vocabulary, middle, text]) =>
    typeof vocabulary === "string" && typeof text === "string" && vocabularies.has(vocabulary) ? [{ id: middle, vocabulary, text }] : []);
}

// A raw file as the runner read it.
export type Source = { path: string; text: string };
