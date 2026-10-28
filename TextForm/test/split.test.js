import { test } from "node:test";
import { findSpans } from "../src/cut-core.js";
import { golden } from "./golden.js";

// What a cut dictionary cuts each input into: the input (as JSON), then each block it gives as
// [block], newlines in it as ⏎.
function cases(dict, inputs) {
  const dicts = [{ on: true, text: dict }];
  return inputs.flatMap((text) => {
    const blocks = findSpans(text, dicts).map((s) => `  [${s.value.replace(/\n/g, "⏎")}]`);
    return [JSON.stringify(text), ...(blocks.length ? blocks : ["  (none)"])];
  });
}

// Blocks cut on blank lines. The inputs: the plain case, blank lines at both ends and a run of them,
// three newlines (one is left over), whitespace-only stretches, no separator at all, and one with
// nothing but it.
test("split: blocks between blank lines", () => {
  const dict = 'Block:cut "\\n\\n"';
  const header = [
    "split: the text cut into blocks at blank lines",
    `dictionary: ${dict}`,
    "each input (as JSON), then the blocks it gives as [block], newlines in them as ⏎",
    "",
  ];
  golden("split", [...header, ...cases(dict, [
    "a\nb\n\nc",
    "\n\na\n\n\n\nb\n\n",
    "a\n\n\nb",
    "a\n\n  \n\nb",
    "no separator",
    "\n\n",
  ])].join("\n"));
});

// Several separators, each part with its own dictionary:
//   words: spaces and newlines both cut, so words don't glue across a line end (as with " " alone)
//   longer wins: "=" and "=>" start at the same place in "a=>b", and "=>" is the cut, so no ">" is
//     left on b. (With "\n" and "\n\n", or "-" and "--", it can't be seen: what's left over is
//     dropped as whitespace, or is a separator itself.)
//   order: the separators' order in the entry doesn't matter, only where they are in the text
//   commas: separators can have commas between them, as well as spaces
//   broken: an empty separator, one not in quotes: the entry finds nothing
test("split: several separators", () => {
  const parts = [
    ["words", 'Word:cut " " "\\n"', ["10.20.1.10  lb01 www\n10.20.1.41  mail01 mail", "one\ntwo three\n\nfour"]],
    ["words, \" \" alone (for comparison)", 'Word:cut " "', ["10.20.1.10  lb01 www\n10.20.1.41  mail01 mail"]],
    ["longer wins", 'Part:cut "=" "=>"', ["a=>b", "a=b", "a=>b=c"]],
    ["order", 'Part:cut "=>" "="', ["a=>b", "a=b", "a=>b=c"]],
    ["first comes first", 'Field:cut "," ";"', ["a,b;c", "a;b,c", ",;a;,"]],
    ["commas", 'Word:cut " ", "\\n"', ["a b\nc"]],
    ["broken: empty separator", 'Word:cut "" " "', ["a b"]],
    ["broken: not in quotes", 'Word:cut " " \\n', ["a b"]],
  ];
  const header = [
    "cut on several separators: a piece ends at whichever comes first; where two start at the same place, the longer is the cut",
    "each part: its dictionary, then each input (as JSON) and the blocks it gives as [block], newlines in them as ⏎",
  ];
  const lines = parts.flatMap(([name, dict, inputs]) => ["", `== ${name}`, `dictionary: ${dict}`, ...cases(dict, inputs)]);
  golden("split-several", [...header, ...lines].join("\n"));
});
