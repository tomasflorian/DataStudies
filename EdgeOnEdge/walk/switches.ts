// WALK — switches: which words show.
//
// Every word has switches: its vocabulary, and each switch word above it
// ("machine", from a tuning). A word shows while its vocabulary is on, or while one of its
// switches is on and that switch's own word shows — so switching the party plan off also
// silences "people", a party-plan word. All start on. "#machine" steps to anything carrying
// machine, on or off, so a closed language can still be stepped into whole.

import type { End } from "../core/lines.ts";
import { NOUN, SWITCH, VERB } from "../core/markers.ts";
import { memo } from "./context.ts";
import type { Structure } from "./structure.ts";
import { unique, type Said, type Words } from "./words.ts";

export const TAG_MARK = "#";

export type Switches = ReturnType<typeof switchesOf>;

export function switchesOf(words: Words, structure: Structure) {
  const { labelsOn, markedWith, hasRole, textOf, vocabularyOf, marked } = words;
  // The ways a word can show: its vocabulary on — or one of its switches on, while that
  // switch's own word can show.
  const switchesOn = (word: End) => labelsOn(word).filter((tagged) => hasRole(tagged, SWITCH));
  function waysToShow(word: End, seen = new Set<End>()): string[][] {
    const inner = new Set([...seen, word]);
    return [[vocabularyOf(word)], ...switchesOn(word).filter((one) => !seen.has(one))
      .flatMap((one) => waysToShow(one, inner).map((way) => [textOf(one), ...way]))];
  }
  const showWays = memo((word: End) => waysToShow(word));
  const said = (word: End): Said => ({ text: textOf(word), needs: [showWays(word)] });
  // Each word, and a "#tag" step for each switch any of them carries.
  const withTags = (said: Said[]): Said[] =>
    unique([...said, ...[...new Set(said.flatMap((one) => one.needs.flat(2)))].map((tag) => ({ text: TAG_MARK + tag, needs: [] }))]);

  // The languages an arrow speaks: the vocabularies of its nouns and verbs.
  const languagesOf = memo((arrowId: number) => [...new Set([...marked(arrowId, NOUN), ...marked(arrowId, VERB)].map(vocabularyOf))]);
  // Every switch there is: each vocabulary the findings use, and each switch word.
  const allTags = (() => {
    const languages = new Set(structure.carriers().flatMap(({ via }) => languagesOf(via)));
    const switches = [...new Set(markedWith(SWITCH).map(textOf))].sort();
    return [...new Set([...[...languages].sort(), ...switches])];
  })();
  // Every switch starts on; a reading that turns some off says which stay on.
  const switchedOn = (tags?: string[]) => new Set(tags ?? allTags);
  const shows = (said: Said, on: Set<string>) => said.needs.every((ways) => ways.some((way) => way.every((tag) => on.has(tag))));
  const shown = (said: Said[], on: Set<string>) => [...new Set(said.filter((one) => shows(one, on)).map((one) => one.text))];

  return { said, showWays, withTags, allTags, switchedOn, shows, shown };
}
