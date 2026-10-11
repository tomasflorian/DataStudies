// CORE — the markers: the only words the view understands by name. Since SPEC.md, section 5,
// they are words like any other: senses in the pile's own vocabulary, "eoe". Each marker is the
// id of its sense, worked out from its two ends as every id is, so the producers that write
// them and the readers that look for them mean the same thing. Only <VOCABULARY> stays a
// reserved string: the anchor a reader needs to find the first vocabulary. Imports core/ only.
//
//   VOCABULARY   <VOCABULARY> → a name: that name is a vocabulary. A word is a sense, a line
//                from its vocabulary to its text: "IT" → "ip"
//   FILE_WORD    file    → a text: it was read from a file. Walking down from those texts finds
//                every "contains"
//   NOUN         noun    → a sense: what a thing is, "host", "entry"      declared by a cutter
//   VERB         verb    → a sense: how it sits in its whole, "address"   table's header
//   SWITCH       switch  → a sense: it switches the senses it is joined to on and off
//   BROADER      broader → a tower line: a step from a broader word down to a narrower one
//   SAID_BY      source  → a name: it names a source — the table or tuning that said a line, or
//                the file a text was read from
//   SEEN         seen    → a line: its right end is text found inside its left (seen.ts). These
//                steps are what "contains" means

import { id } from "./identity.ts";

export const VOCABULARY = "<VOCABULARY>";
export const SYSTEM = "eoe";
// The pile's own words, by their text, and each as the id of its sense in eoe.
export const SYSTEM_WORDS = ["file", "noun", "verb", "switch", "broader", "source", "seen"] as const;
const word = (text: (typeof SYSTEM_WORDS)[number]) => id(SYSTEM, text);
export const FILE_WORD = word("file");
export const NOUN = word("noun");
export const VERB = word("verb");
export const SWITCH = word("switch");
export const BROADER = word("broader");
export const SAID_BY = word("source");
export const SEEN = word("seen");
// A marker's text, from its id: what a producer writes so a layer says what its markers are.
export const systemWordText = new Map<number, string>(SYSTEM_WORDS.map((text) => [id(SYSTEM, text), text]));
