// WALK — all of it, put together: a checked pile in, the questions the page asks out. The
// concerns build on each other one way, as imported here, top to bottom.

import type { Line } from "../core/lines.ts";
import { contextOf } from "./context.ts";
import { filesOf } from "./files.ts";
import { kindsOf } from "./kinds.ts";
import { latticeOf } from "./lattice.ts";
import { readingOf } from "./reading.ts";
import { stepsOf } from "./steps.ts";
import { structureOf } from "./structure.ts";
import { switchesOf } from "./switches.ts";
import { typesOf } from "./types.ts";
import { wordsOf } from "./words.ts";

export type Walk = ReturnType<typeof walkOf>;

export function walkOf(lines: Line[]) {
  const context = contextOf(lines);
  const words = wordsOf(context);
  const structure = structureOf(context);
  const switches = switchesOf(words, structure);
  const lattice = latticeOf(context, words);
  const types = typesOf(words, structure, switches, lattice);
  const files = filesOf(words, structure, types);
  const steps = stepsOf(structure, switches, types);
  const reading = readingOf(structure, switches, types, steps);
  const { kinds, tags } = kindsOf(words, structure, switches, lattice, types);
  return { view: reading.view, find: reading.find, kinds, tags, path: files.path };
}
