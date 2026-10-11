// CORE — the two moves (SPEC.md, section 7), over an indexed pile. Readers above core/ walk the
// pile through these and never read a line's positions themselves. Imports core/ only.
//
//   down(x)   find x on the left of a line; the answer is its right end
//   up(x)     find x on the right of a line; the answer is its left end
//
// A step is one move across one line: where it started, the line it went through, and where it
// landed. The line keeps the evidence, and is an end too, so what is said about a step is up
// from its line. Every line is written type-ish end first, so a line read on its own is the
// step down it.

import type { End, LineIndex } from "./lines.ts";

export type Step = { from: End; via: number; to: End };
export type Moves = ReturnType<typeof movesOf>;

export function movesOf(lineIndex: LineIndex) {
  const down = (x: End): Step[] => (lineIndex.linesByLeft.get(x) ?? []).map(([, via, to]) => ({ from: x, via, to }));
  const up = (x: End): Step[] => (lineIndex.linesByRight.get(x) ?? []).map(([to, via]) => ({ from: x, via, to }));
  // The line an id names, as the step down it: from its type-ish end to its value-ish end.
  // Nothing for a value, or for an id with no line here.
  const stepOf = (x: End): Step | undefined => {
    const line = typeof x === "number" ? lineIndex.lineByMiddle.get(x) : undefined;
    return line && { from: line[0], via: line[1], to: line[2] };
  };
  // Every line, as the step down it, in the pile's order.
  const all = (): Step[] => [...lineIndex.lineByMiddle.values()].map(([from, via, to]) => ({ from, via, to }));
  // Narrowing: whether a line says this step is the word — the word is up from the step's line.
  const saidToBe = (step: Step, word: End) => up(step.via).some(({ to }) => to === word);
  return { down, up, stepOf, all, saidToBe };
}

// The same moves, kept to the steps a line says are this word. "Contains" is the pile narrowed
// to seen: narrowed(pile, SEEN).
export function narrowed(moves: Moves, word: End) {
  const keep = (step: Step) => moves.saidToBe(step, word);
  return {
    down: (x: End) => moves.down(x).filter(keep),
    up: (x: End) => moves.up(x).filter(keep),
    stepOf: (x: End) => { const step = moves.stepOf(x); return step && keep(step) ? step : undefined; },
    all: () => moves.all().filter(keep),
  };
}
