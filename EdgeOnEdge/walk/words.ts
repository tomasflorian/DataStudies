// WALK — words: how a thing is named, and the roles it plays (core/markers.ts).
//
// A thing's labels are what is said about it: up from it. An arrow is named by its ends, less
// any end that names a vocabulary: the sense "IT" ~ "ip" is "ip", in IT. A string is named
// as itself.
//
// A word as a step or a cell says it is a Said: its text, and the switches it needs on to
// show (switches.ts) — for each word it is made of, the ways that word can show, each a set
// of switches that must all be on. A "#tag" step needs none.

import type { End } from "../core/lines.ts";
import { VOCABULARY } from "../core/markers.ts";
import { memo, type Context } from "./context.ts";

export type Said = { text: string; needs: string[][][] };
export const unique = (said: Said[]) => [...new Map(said.map((one) => [one.text + "\0" + JSON.stringify(one.needs), one])).values()];

export type Words = ReturnType<typeof wordsOf>;

export function wordsOf({ associations }: Context) {
  // Everything said about a thing is up from it: its roles, a finding's words, who said a
  // line, the switches a word belongs to — every line is written type-ish end first.
  const labelsOn = memo((thing: End) => associations.up(thing).map(({ to }) => to));
  // And the other way: everything a marker is said about is down from it.
  const markedWith = memo((marker: End) => associations.down(marker).map(({ to }) => to));
  const hasRole = (thing: End, role: string) => labelsOn(thing).includes(role);
  const isVocabulary = memo((someEnd: End) => hasRole(someEnd, VOCABULARY));
  // A sense is a line down from its vocabulary to its word, so its text is the end it lands
  // on and its vocabulary the end it starts from. Any other line reads as both its ends.
  const asSense = (thing: End) => { const step = associations.stepOf(thing); return step && isVocabulary(step.from) ? step : undefined; };
  const textOf = memo((thing: End): string => {
    const step = associations.stepOf(thing);
    return !step ? String(thing) : asSense(thing) ? String(step.to) : `${step.from} ~ ${step.to}`;
  });
  const vocabularyOf = memo((thing: End): string => String(asSense(thing)?.from ?? ""));
  // The words an arrow carries, in order of their text and vocabulary, and those of them
  // playing a role.
  const orderKey = (word: End) => `${textOf(word)}@${vocabularyOf(word)}`;
  const wordsOn = memo((arrowId: number) => [...labelsOn(arrowId)].sort((a, b) => (orderKey(a) < orderKey(b) ? -1 : orderKey(a) > orderKey(b) ? 1 : 0)));
  const marked = (arrowId: number, role: string) => wordsOn(arrowId).filter((word) => hasRole(word, role));
  return { labelsOn, markedWith, hasRole, textOf, vocabularyOf, marked };
}
