// WALK — a reading: a start and its steps, as columns and rows.
//
// A reading starts from every whole or every part, from a noun (every string found as one),
// or from one string, and each column after the first is one step from a column to its left — the
// join is on the cell it steps from, so the evidence for a row is always in the row. A row
// that finds nothing keeps its place with a hole, rather than disappearing.

import type { Steps, Step, Offer } from "./steps.ts";
import type { Structure } from "./structure.ts";
import { TAG_MARK, type Switches } from "./switches.ts";
import type { Types } from "./types.ts";

// The kinds every reading can start from, whatever else is loaded: every string something
// was found inside, and every string found inside something. Many strings are both — a line
// is a whole to its fields and a part of its file.
export const WHOLE = "*whole";
export const PART = "*part";
const MAX_ROWS = 2000;

export type Session = { start?: { kind?: string; value?: string }; steps: Step[]; focus: number; tags?: string[]; find?: string };
export type Cell = { v: string; text: string; kinds: string[]; rels: number[] } | null;
export type View = { columns: { label: string; parent: number }[]; rows: Cell[][]; truncated: boolean; offers: Offer[]; focus: number };

// Whether a string holds the text being searched for — any string, when nothing is.
export const matches = (someString: string, find?: string) => !find || someString.toLowerCase().includes(find.toLowerCase());

export function readingOf(structure: Structure, switches: Switches, types: Types, steps: Steps) {
  const { switchedOn, shows, shown } = switches;

  const cell = (v: string, rels: number[], on: Set<string>): Cell => ({ v, text: v, kinds: shown(types.kindsOf(v), on), rels });

  // Every string of a kind where that finding shows — every whole or every part, for those;
  // for "#tag", every string with a noun carrying that switch, on or off.
  function members(kind: string, on: Set<string>): string[] {
    if (kind === WHOLE) return structure.containing().sort();
    if (kind === PART) return structure.contained().sort();
    const tag = kind.startsWith(TAG_MARK) ? kind.slice(TAG_MARK.length) : undefined;
    const out = new Set<string>();
    for (const { said, found } of types.nounings())
      if (tag ? said.needs[0].flat().includes(tag) : said.text === kind && shows(said, on)) out.add(found);
    return [...out].sort();
  }

  function view(session: Session): View {
    if (!session.start) return { columns: [], rows: [], truncated: false, offers: [], focus: 0 };
    const on = switchedOn(session.tags);
    // A search holds the first column only: the reading starts from the members that match.
    const first = session.start.kind !== undefined
      ? members(session.start.kind, on).filter((v) => matches(v, session.find)).map((v) => cell(v, [], on))
      : [cell(session.start.value!, [], on)];
    let rows: Cell[][] = first.map((one) => [one]);
    let truncated = false;
    for (const step of session.steps) {
      const next: Cell[][] = [];
      for (const row of rows) {
        const pivot = row[step.parent];
        const found = pivot ? steps.follow(pivot, step, on).map(({ v, rels }) => cell(v, rels, on)).sort((a, b) => a!.text.localeCompare(b!.text)) : [];
        if (!found.length) next.push([...row, null]);
        for (const one of found) next.push([...row, one]);
      }
      truncated ||= next.length > MAX_ROWS;
      rows = next.slice(0, MAX_ROWS);
    }
    const focus = Math.min(Math.max(0, session.focus), session.steps.length);
    return {
      columns: [
        { label: session.start.kind !== undefined ? session.start.kind : session.start.value!, parent: -1 },
        ...session.steps.map((step) => ({ label: step.label, parent: step.parent })),
      ],
      rows,
      truncated,
      offers: steps.offers(rows.map((row) => row[focus]), focus, on),
      focus,
    };
  }

  // Strings found in the files that contain q, the closest first.
  function find(q: string, limit = 40): string[] {
    const needle = q.toLowerCase();
    if (!needle) return [];
    const all = new Set<string>();
    for (const { from, to } of structure.contains.all()) for (const end of [String(from), String(to)]) if (end.toLowerCase().includes(needle)) all.add(end);
    const rank = (x: string) => (x.toLowerCase() === needle ? 0 : x.toLowerCase().startsWith(needle) ? 1 : 2);
    return [...all].sort((a, b) => rank(a) - rank(b) || a.length - b.length || a.localeCompare(b)).slice(0, limit);
  }

  return { view, find };
}
