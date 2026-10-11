// CORE — see README.md, "The line". Every function here is pure; reading files is the caller's job.
//
//   text ─parse→ Line[] ─union→ Line[] ─check→ { kept, setAside } ─index→ LineIndex
//
// A line is two ends, stored as [left, right]: each a string, a value, or a number, a
// reference to another line by its id (core/identity.ts). Read, it is [left, id, right], its
// id worked out from its ends. A line is an arrow from its type-ish end to its value-ish end
// (SPEC.md, section 3). What more an arrow means — that its right was found inside its left,
// that it is a step down the tower — is said by other lines (seen.ts, core/markers.ts).
//
// Imports nothing from walk/.

import { id, isReference, type End } from "./identity.ts";

export type { End };
export type Line = [End, number, End];

export type LineIndex = {
  lineByMiddle: Map<number, Line>;  // an id → the one line it is the id of
  linesByLeft: Map<End, Line[]>;    // an end → the lines with it as their left
  linesByRight: Map<End, Line[]>;   // an end → the lines with it as their right
};

export type SetAside = { line: Line; why: string };

// A line read from its two ends.
export const lineOf = (left: End, right: End): Line => [left, id(left, right), right];
// A line as it is stored: its two ends, as JSON.
export const stored = ([left, , right]: Line) => JSON.stringify([left, right]);

// One text, as lines. Anything that isn't two ends is a problem, located by `source`.
export function parse(text: string, source: string): { lines: Line[]; problems: string[] } {
  const lines: Line[] = [];
  const problems: string[] = [];
  const isEnd = (end: unknown): end is End => typeof end === "string" || isReference(end);
  text.split("\n").forEach((raw, i) => {
    if (!raw.trim()) return;
    const where = `${source}:${i + 1}`;
    let read: unknown;
    try { read = JSON.parse(raw); } catch { problems.push(`${where}: not JSON`); return; }
    if (Array.isArray(read) && read.length === 2 && read.every(isEnd)) lines.push(lineOf(read[0], read[1]));
    else problems.push(`${where}: a line is two ends, each a string or an id`);
  });
  return { lines, problems };
}

// The merge. Like `sort -u` on the stored lines: the same answer whatever order the inputs
// arrive in.
export function union(...inputs: Line[][]): Line[] {
  const all = new Map(inputs.flat().map((line) => [stored(line), line] as const));
  return [...all.keys()].sort().map((key) => all.get(key)!);
}

// Well-formedness. An id is worked out from its line, so a line cannot name itself, two
// lines cannot name each other, and the same ends are one line. What is left is two
// different lines whose ids happen to be the same: both are set aside, not repaired, so the
// result never depends on which came first.
export function check(lines: Line[]): { kept: Line[]; setAside: SetAside[] } {
  const byId = new Map<number, Line[]>();
  for (const line of lines) byId.set(line[1], [...(byId.get(line[1]) ?? []), line]);
  const setAside: SetAside[] = [];
  const kept: Line[] = [];
  for (const line of lines) {
    const sharing = byId.get(line[1])!.length;
    if (sharing > 1) setAside.push({ line, why: `${line[1]} is the id of ${sharing} lines` });
    else kept.push(line);
  }
  return { kept, setAside };
}

// Assumes checked lines: one line per id.
export function index(lines: Line[]): LineIndex {
  const lineIndex: LineIndex = { lineByMiddle: new Map(), linesByLeft: new Map(), linesByRight: new Map() };
  for (const line of lines) {
    const [left, middle, right] = line;
    lineIndex.lineByMiddle.set(middle, line);
    lineIndex.linesByLeft.set(left, [...(lineIndex.linesByLeft.get(left) ?? []), line]);
    lineIndex.linesByRight.set(right, [...(lineIndex.linesByRight.get(right) ?? []), line]);
  }
  return lineIndex;
}
