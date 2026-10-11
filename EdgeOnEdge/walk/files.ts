// WALK — files: where a string was read from.
//
// A file's text is said to be a file, and the line saying so names the file it was read from
// as its source. With no such source loaded, a string still sits in its wholes; it only has
// no file and line to show.

import { SAID_BY, VERB } from "../core/markers.ts";
import type { Structure } from "./structure.ts";
import type { Types } from "./types.ts";
import type { Words } from "./words.ts";

export type Hop = { toward: "up" | "down"; word: string; to: string; toText: string; at: string | null };
export type PathStep = { from: string; rels: number[] };

export function filesOf(words: Words, structure: Structure, types: Types) {
  const { labelsOn, hasRole, textOf, marked } = words;
  const { wholes, contains } = structure;
  // The file a text was read from: the source of the line saying it is a file.
  const fileOf = (someString: string) =>
    structure.rootsInto(someString).flatMap(({ via }) => labelsOn(via).filter((source) => hasRole(source, SAID_BY)))[0] as string | undefined;

  // Where a part sits in its file, found inside this whole: the file's name and line. It
  // climbs one way up to a file's text, adding up where each piece starts inside the next,
  // and names the file that text was read from.
  function lineOf(part: string, whole: string): string | null {
    const inside = whole.indexOf(part);
    if (inside < 0) return null;
    const seen = new Set([part, whole]);
    let at = whole, offset = inside;
    for (;;) {
      const up = wholes(at).find((one) => !seen.has(one));
      if (up === undefined) {
        const file = fileOf(at);
        return file === undefined ? null : `${file.split("/").at(-1)}:${at.slice(0, offset).split("\n").length}`;
      }
      const next = up.indexOf(at);
      if (next < 0) return null;
      offset += next;
      seen.add(up);
      at = up;
    }
  }

  // One link, walked: up from a part to its whole, or down from a whole to a part.
  function hop(linkId: number, toward: "up" | "down"): Hop {
    const step = contains.stepOf(linkId)!, whole = String(step.from), part = String(step.to);
    const landing = toward === "up" ? whole : part;
    const verbs = marked(linkId, VERB).map(textOf);
    const word = verbs.length ? verbs.join(" / ") : types.kindsOf(landing)[0]?.text ?? (toward === "up" ? "whole" : "part");
    return { toward, word, to: landing, toText: landing, at: lineOf(part, whole) };
  }

  // The link one step walked, from the string it left to the cell it reached.
  function hopsFor(from: string, linkId: number): Hop[] | null {
    const step = contains.stepOf(linkId);
    if (!step) return null;
    if (from === step.from) return [hop(linkId, "down")];
    if (from === step.to) return [hop(linkId, "up")];
    return null;
  }

  // How a row reached one of its cells: for each step on the way, every way it was taken
  // (one per link that reached the cell), as the links walked. And where the value appears
  // in the files, however it was reached.
  function path(steps: PathStep[], value: string) {
    return {
      steps: steps.map((step) => ({
        ways: step.rels.flatMap((linkId) => { const hops = hopsFor(step.from, linkId); return hops ? [hops] : []; }),
      })),
      appears: [...new Set(wholes(value).map((whole) => lineOf(value, whole)).filter((at): at is string => !!at))]
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    };
  }

  return { path };
}
