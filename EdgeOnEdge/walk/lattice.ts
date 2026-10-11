// WALK — the lattice as said: which words sit under which, because a tuning says so.
//
// A tuning's "broader address = ip" is a line from address down to ip, said to be broader.
// Climbing follows only those arrows — never a switch or a role — as far up as they go.
// (What the pile shows for itself — every vault-note is also a note — is worked out in
// kinds.ts, from the types alone.)

import type { End } from "../core/lines.ts";
import { BROADER, SAID_BY } from "../core/markers.ts";
import type { Context } from "./context.ts";
import type { Words } from "./words.ts";

export type Lattice = ReturnType<typeof latticeOf>;

export function latticeOf({ associations }: Context, words: Words) {
  const { labelsOn, hasRole, textOf } = words;
  // The tower lines reaching a word: each comes down to it from a broader one.
  const stepsUp = (word: End) => associations.up(word).filter(({ via }) => hasRole(via, BROADER));
  // The words a word is narrower than, however many steps up.
  function above(word: End, seen = new Set<End>([word])): End[] {
    return stepsUp(word).map(({ to }) => to).filter((up) => !seen.has(up)).flatMap((up) => { seen.add(up); return [up, ...above(up, seen)]; });
  }
  // Every step up from these words and above them, as text → text, with who said each.
  function claims(from: End[]): Map<string, Map<string, Set<string>>> {
    const out = new Map<string, Map<string, Set<string>>>();
    const climbing = [...new Set(from)], climbed = new Set<End>();
    while (climbing.length) {
      const word = climbing.pop()!;
      if (climbed.has(word)) continue;
      climbed.add(word);
      for (const { to: up, via: stepId } of stepsUp(word)) {
        const sources = labelsOn(stepId).filter((source) => hasRole(source, SAID_BY)).map(textOf);
        const upward = out.get(textOf(word)) ?? new Map<string, Set<string>>();
        upward.set(textOf(up), new Set([...(upward.get(textOf(up)) ?? []), ...sources]));
        out.set(textOf(word), upward);
        climbing.push(up);
      }
    }
    return out;
  }
  return { above, claims };
}
