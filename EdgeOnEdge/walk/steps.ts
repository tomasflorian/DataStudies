// WALK — steps: the ways out of a cell, and what a column can reach.
//
// A step is named by words only — no arrows. One offer takes every direction that reaches
// its word; the lines a cell was reached through are told by files.ts.
//   - a step down a link reads as the nouns of where it lands, and as its verbs: from a zone
//     record, "ip" and "address" both reach its ip. A step up reads as the nouns of the
//     whole, and a verb read from below would say it backwards, so it becomes a role:
//     "zone-record(address)", the records this is the address of. With no noun, a step
//     reads "part" going down and "whole" going up.
//   - every step is one link, up or down, so every string a reading passes through is a
//     column. "host in zone-record" is offered as a shortcut for two steps — up to a zone
//     record, down to its host — and taking it adds both columns.

import { memo } from "./context.ts";
import type { Structure } from "./structure.ts";
import { TAG_MARK, type Switches } from "./switches.ts";
import type { Types } from "./types.ts";
import { unique, type Said } from "./words.ts";

export const ACROSS = " in ";

export type Step = { parent: number; label: string };
export type Offer = { step: Step; count: number; of: number; kinds: string[]; tag: boolean };
// A cell as steps see it: the string, and the links that reached it.
export type Reached = { v: string; rels: number[] };

export type Steps = ReturnType<typeof stepsOf>;

export function stepsOf(structure: Structure, switches: Switches, types: Types) {
  const { contains, wholes } = structure;
  const { withTags, shows, shown } = switches;
  const { kindsOf, kindsAndAbove, verbsOf } = types;

  // The ways out of a string, each with the labels it can be taken by.
  type Way = { via: number; other: string; labels: Said[] };
  const ways = memo((from: string): Way[] => [
    ...contains.down(from).map((step) => ({ step, toward: "down" })),
    ...contains.up(from).map((step) => ({ step, toward: "up" })),
  ].map(({ step, toward }): Way => {
    const other = String(step.to);
    const otherKinds = kindsOf(other);
    const verbs = toward === "down" ? withTags(verbsOf(step.via))
      : verbsOf(step.via).flatMap((verb) => (otherKinds.length ? otherKinds : [{ text: "whole", needs: [] }])
        .map((kind) => ({ text: `${kind.text}(${verb.text})`, needs: [...kind.needs, ...verb.needs] })));
    const plain = otherKinds.length ? withTags(kindsAndAbove(other)) : [{ text: toward === "down" ? "part" : "whole", needs: [] }];
    return { via: step.via, other, labels: unique([...plain, ...verbs]) };
  }));

  // Shortcuts across a whole: up to a whole the string sits in, then down to another part
  // of it. A part is not its own sibling — unless it holds several roles in the whole (a
  // password that is also the username).
  const shortcuts = memo((from: string): { other: string; labels: Said[] }[] => wholes(from).flatMap((whole) => {
    const inside: Said[] = kindsOf(whole).length ? kindsOf(whole) : [{ text: "whole", needs: [] }];
    return contains.down(whole).flatMap(({ via, to }) => {
      const part = String(to), itself = part === from;
      if (itself && verbsOf(via).length < 2) return [];
      const named = withTags(itself ? verbsOf(via) : [...kindsAndAbove(part), ...verbsOf(via)]);
      const what: Said[] = named.length ? named : [{ text: "part", needs: [] }];
      return [{ other: part, labels: unique(what.flatMap((kind) =>
        inside.map((outer) => ({ text: `${kind.text}${ACROSS}${outer.text}`, needs: [...kind.needs, ...outer.needs] })))) }];
    });
  }));

  // Where one step leads from one cell: each far end once, with every link that got there.
  function follow(from: Reached, step: Step, on: Set<string>): Reached[] {
    const found = new Map<string, number[]>();
    for (const { via, other, labels } of ways(from.v))
      if (labels.some((one) => one.text === step.label && shows(one, on))) found.set(other, [...new Set([...(found.get(other) ?? []), via])]);
    return [...found].map(([v, rels]) => ({ v, rels }));
  }

  // Every step a column can take, and how many of its cells can take it.
  function offers(column: (Reached | null)[], col: number, on: Set<string>): Offer[] {
    const cells = new Map<string, Reached>();
    for (const cell of column) if (cell) cells.set(cell.v + "\0" + cell.rels.join(), cell);
    const tally = new Map<string, { step: Step; reached: Set<string>; kinds: Set<string> }>();
    for (const [key, here] of cells)
      for (const { via, other, labels } of [...ways(here.v), ...shortcuts(here.v).map((one) => ({ via: undefined, ...one }))]) {
        // stepping back across the link that brought you here is not a new step
        if (via !== undefined && here.rels.includes(via)) continue;
        for (const offered of labels) {
          if (!shows(offered, on)) continue;
          const count = tally.get(offered.text) ?? { step: { parent: col, label: offered.text }, reached: new Set(), kinds: new Set() };
          count.reached.add(key);
          shown(kindsOf(other), on).forEach((kind) => count.kinds.add(kind));
          tally.set(offered.text, count);
        }
      }
    return [...tally.values()]
      .map((count) => ({ step: count.step, count: count.reached.size, of: cells.size, kinds: [...count.kinds].sort().slice(0, 3), tag: count.step.label.includes(TAG_MARK) }))
      .sort((a, b) => b.count - a.count || a.step.label.localeCompare(b.step.label));
  }

  return { follow, offers };
}
