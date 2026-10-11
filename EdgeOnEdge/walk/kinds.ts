// WALK — kinds: where a reading can start.
//
// First every whole and every part, whatever else is loaded. Then every noun whose findings
// show, with how many strings each reaches; then every switch, with how many strings carry
// it, on or off.
//
// Each noun also says where it sits among the others — the lattice, the middle path:
//   seen    every string found as it is also found as the other, which has more; worked
//           out from the types alone, for nouns with at least `threshold` strings
//   said    a tuning puts it under the other (lattice.ts), whatever the pile shows; with who
//           said it, where that is loaded. Where the pile points the other way, the claim wins.
// and only its immediate parents: under "place" and "place" under "word", a city is not
// also listed under "word". Nouns with exactly the same strings are equals — unless a claim
// orders them.

import { NOUN } from "../core/markers.ts";
import type { Lattice } from "./lattice.ts";
import { matches, PART, WHOLE } from "./reading.ts";
import type { Structure } from "./structure.ts";
import { TAG_MARK, type Switches } from "./switches.ts";
import type { Types } from "./types.ts";
import type { Words } from "./words.ts";

export type Parent = { kind: string; seen: boolean; said: string[] };
export type Kind = { kind: string; count: number; of: number; tag: boolean; parents?: Parent[]; equals?: string[] };

export function kindsOf(words: Words, structure: Structure, switches: Switches, lattice: Lattice, types: Types) {
  const { switchedOn, shows, allTags } = switches;

  // A search keeps only the kinds with a matching string among their members, and counts
  // those; `of` is how many they have in all.
  function kinds(tags?: string[], threshold = 2, find?: string): Kind[] {
    const on = switchedOn(tags);
    const byKind = new Map<string, Set<string>>(), byTag = new Map<string, Set<string>>(), direct = new Map<string, Set<string>>();
    const add = (map: Map<string, Set<string>>, key: string, member: string) => map.set(key, (map.get(key) ?? new Set()).add(member));
    for (const { said: one, found } of types.nounings()) {
      if (shows(one, on)) add(byKind, one.text, found);
      for (const tag of new Set(one.needs[0].flat())) add(byTag, tag, found);
    }
    for (const { via, to } of structure.carriers()) for (const noun of types.nounsOf(via)) if (shows(noun, on)) add(direct, noun.text, String(to));

    const claims = lattice.claims(structure.carriers().flatMap(({ via }) => words.marked(via, NOUN)));
    // Everything a noun is claimed to sit under, however many steps up.
    const claimedAbove = (kind: string, seen = new Set<string>()): Set<string> => {
      for (const up of claims.get(kind)?.keys() ?? []) if (!seen.has(up)) { seen.add(up); claimedAbove(up, seen); }
      return seen;
    };
    const shownKinds = [...byKind.keys()];
    const parents = new Map<string, Map<string, Parent>>();
    const parentOf = (child: string, parent: string) => {
      const mine = parents.get(child) ?? new Map<string, Parent>();
      parents.set(child, mine);
      return mine.get(parent) ?? mine.set(parent, { kind: parent, seen: false, said: [] }).get(parent)!;
    };
    const equals = new Map<string, string[]>();
    const inside = (small: Set<string>, big: Set<string>) => [...small].every((member) => big.has(member));
    for (const child of shownKinds) {
      const mine = direct.get(child);
      if (!mine || mine.size < threshold) continue;
      for (const other of shownKinds) {
        const theirs = direct.get(other);
        // a claim the other way outranks what the pile happens to show
        if (other === child || !theirs || !inside(mine, theirs) || claimedAbove(other).has(child)) continue;
        if (mine.size < theirs.size) parentOf(child, other).seen = true;
        else if (!claims.get(child)?.has(other) && !claims.get(other)?.has(child)) equals.set(child, [...(equals.get(child) ?? []), other]);
        else if (claims.get(child)?.has(other)) parentOf(child, other).seen = true;
      }
    }
    for (const [child, upward] of claims)
      for (const [parent, sources] of upward)
        if (byKind.has(child) && byKind.has(parent)) parentOf(child, parent).said = [...sources].sort();
    // Only immediate parents: drop a parent another parent already sits under.
    const ancestors = (kind: string, seen = new Set<string>()): Set<string> => {
      for (const parent of parents.get(kind)?.keys() ?? []) if (!seen.has(parent)) { seen.add(parent); ancestors(parent, seen); }
      return seen;
    };
    const immediate = (kind: string) => {
      const all = [...(parents.get(kind)?.values() ?? [])];
      return all.filter((parent) => !all.some((other) => other !== parent && ancestors(other.kind).has(parent.kind)))
        .sort((a, b) => a.kind.localeCompare(b.kind));
    };

    const listed = (map: Map<string, Set<string>>, tag: boolean) => [...map]
      .map(([kind, members]) => ({ kind: tag ? TAG_MARK + kind : kind, count: [...members].filter((member) => matches(member, find)).length, of: members.size, tag,
        ...(tag ? {} : { parents: immediate(kind), equals: equals.get(kind) ?? [] }) }))
      .filter((one) => one.count > 0)
      .sort((a, b) => b.count - a.count || b.of - a.of || a.kind.localeCompare(b.kind));
    const structural = ([[WHOLE, structure.containing()], [PART, structure.contained()]] as const)
      .map(([kind, members]): Kind => ({ kind, count: members.filter((one) => matches(one, find)).length, of: members.length, tag: false, parents: [], equals: [] }))
      .filter((one) => one.count > 0);
    return [...structural, ...listed(byKind, false), ...listed(byTag, true)];
  }

  // Every switch, and how many strings carry it.
  const tags = () => {
    const counts = new Map(kinds(allTags).filter((one) => one.tag).map((one) => [one.kind.slice(TAG_MARK.length), one.count]));
    return allTags.map((tag) => ({ tag, count: counts.get(tag) ?? 0 }));
  };

  return { kinds, tags };
}
