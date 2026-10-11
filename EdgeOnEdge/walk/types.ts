// WALK — types: what a string was found as.
//
// A string's nouns ride on the arrows into it (structure.ts), and each carries every word
// above it in the tower: "ip" also reads "address". A broader word shows only while the noun
// under it does, and it does itself.

import { NOUN, VERB } from "../core/markers.ts";
import { memo } from "./context.ts";
import type { Lattice } from "./lattice.ts";
import type { Structure } from "./structure.ts";
import type { Switches } from "./switches.ts";
import { unique, type Said, type Words } from "./words.ts";

export type Types = ReturnType<typeof typesOf>;

export function typesOf(words: Words, structure: Structure, switches: Switches, lattice: Lattice) {
  const { textOf, marked } = words;
  const { said, showWays } = switches;
  const nounsOf = memo((arrowId: number): Said[] => marked(arrowId, NOUN).map(said));
  const verbsOf = memo((arrowId: number): Said[] => marked(arrowId, VERB).map(said));
  const nounsAndAbove = memo((arrowId: number): Said[] => unique(marked(arrowId, NOUN).flatMap((noun) =>
    [said(noun), ...lattice.above(noun).map((up) => ({ text: textOf(up), needs: [showWays(noun), showWays(up)] }))])));
  // Everything a string was found as — and, for stepping and starting, everything broader.
  const kindsOf = memo((someString: string): Said[] => unique(structure.carriersOf(someString).flatMap(nounsOf)));
  const kindsAndAbove = memo((someString: string): Said[] => unique(structure.carriersOf(someString).flatMap(nounsAndAbove)));
  // Every noun on every arrow into a string, and every word above it, with that string.
  const nounings = () => structure.carriers().flatMap(({ via, to }) => nounsAndAbove(via).map((said) => ({ said, found: String(to) })));

  return { nounsOf, verbsOf, kindsOf, kindsAndAbove, nounings };
}
