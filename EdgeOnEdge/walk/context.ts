// WALK — the column walk, one concern per file. Pure throughout: server.ts serves it.
//
//   context    the pile, read as contains and associations
//   words      how a sense or a string is named, and the roles it plays
//   structure  what contains what, and the arrows that carry a string's words
//   switches   which words show: their vocabulary, or a switch that is on
//   lattice    the tower: which words sit under which, said by a tuning
//   types      what a string was found as — its nouns, and every word above them
//   files      where a string was read from: file and line
//   steps      the steps out of a cell, and what each column can reach
//   reading    a session — a start and its steps — as columns and rows
//   kinds      where a reading can start: every whole, every part, and each noun, nested
//   walk       all of it, put together
//
// Each file works on whatever pile it is given and finds nothing where its markers are
// missing: with no senses loaded there are no types, with no tunings no tower. None of
// them knows which layers were loaded.
//
// This file: the pile, walkable by up and down, with "contains" the steps said to be seen,
// and a helper that works a thing out once per end — the pile does not change under a walk.

import { index, type Line } from "../core/lines.ts";
import { SEEN } from "../core/markers.ts";
import { movesOf, narrowed, type Moves } from "../core/moves.ts";

// The whole pile, and "contains": the pile narrowed to the steps said to be seen.
export type Context = { contains: ReturnType<typeof narrowed>; associations: Moves };

export function contextOf(lines: Line[]): Context {
  const pile = movesOf(index(lines));
  return { contains: narrowed(pile, SEEN), associations: pile };
}

export const memo = <Key, T>(work: (key: Key) => T) => {
  const known = new Map<Key, T>();
  return (key: Key): T => {
    if (!known.has(key)) known.set(key, work(key));
    return known.get(key)!;
  };
};
