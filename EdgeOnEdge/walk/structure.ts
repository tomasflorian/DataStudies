// WALK — structure: what contains what, and the arrows that carry a string's words.
//
// A link is a contains line: its right was found inside its left. The words a string was
// found as ride on the arrows into it — the links that found it, and, for a file's text,
// the line saying it is a file.

import { FILE_WORD } from "../core/markers.ts";
import type { Step } from "../core/moves.ts";
import { memo, type Context } from "./context.ts";

export type Structure = ReturnType<typeof structureOf>;

export function structureOf({ contains, associations }: Context) {
  // A link is a contains line, walked as any line is: down from a whole to a part, up back.
  const wholes = memo((part: string) => contains.up(part).map(({ to }) => String(to)));
  // The lines saying a text is a file: one into each file's text.
  const rootsInto = (someString: string) => associations.up(someString).filter(({ to }) => to === FILE_WORD);
  // The lines into a string that carry its words, and every such line in the pile, as the
  // step down to the string it reaches.
  const carriersOf = (someString: string) => [...contains.up(someString), ...rootsInto(someString)].map(({ via }) => via);
  const carriers = (): Step[] => [...contains.all(), ...associations.down(FILE_WORD)];
  // Every string something was found inside, and every string found inside something.
  const containing = () => [...new Set(contains.all().map(({ from }) => String(from)))];
  const contained = () => [...new Set(contains.all().map(({ to }) => String(to)))];
  return { contains, wholes, rootsInto, carriersOf, carriers, containing, contained };
}
