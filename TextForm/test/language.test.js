import { test } from "node:test";
import { findSpans } from "../src/cut-core.js";
import { golden } from "./golden.js";

// The rule language, a part a feature: its dictionary, its input, then each type found and its
// values in the order they sit in the text, as [value], newlines in them as ⏎.
//   blanks: each kind of blank
//   escapes: \n, \[ and \( written bare; parentheses with no blank or type in them are plain text
//   quoted: in quotes a value is a pattern whatever it says, so a keyword in it is just text
//   named part: a pattern using a type, where only the ( ) part is found
//   containing / in: rules made from other types
//   cut inside a type: each place of that type cut on its own
//   order: a rule that uses a type defined further down still sees it; rules in a circle find nothing
//   regex: the escape hatch
//   counts: how many characters a blank takes, [name:count]; a SIN up to 300 characters after its
//     label; counts that can't be read stay plain text
test("language: rules and blanks", () => {
  const parts = [
    ["blanks", [
      "Num:[0-255]", "Letter:Group [A-H]", "Digits:x[digits]", "Hex:[hex]:[hex]", "Word:<[word]>",
      "Gap:a[spaces]b", "Line:[line]", "Rest:key=[rest]", "Any:<[*]>", "Para:P[*][break]",
    ], "256 255 007 Group C Group Z x42 0a:FF <web-01_x> a  \t b\nkey=some value\n<one><two>\n\nP1 end\n\nP2 last"],
    ["escapes", ["Lit:\\[digits] \\(x)", "Two:a\\nb", "Paren:(Unknown)"], "[digits] (x) and a\nb, MAC (Unknown)"],
    ["quoted", ['Note:"cut on Tuesday"', 'Lines:"[digits] apples"'], "cut on Tuesday: 12 apples"],
    ["named part", [
      "IP:10.20.[0-255].[0-255]", "Host:{IP}[spaces]([word])", "Alias:{Host} ([word])",
    ], "10.20.0.1   r1\n10.20.1.10  lb01 www\n10.20.2.1 dev eth1"],
    ["containing / in", [
      "IP:192.168.1.[0-255]", "Host:web[digits]", "Record:Record:\\n[*][break]",
      "Full:{Record} containing {IP} {Host}", "AtMostOne:{Record} containing {IP}?", "NoHost:{Record} containing {IP}+ and {Host}?",
      "Line:[line]", "HostLine:{Line} containing {Host}", "IPInFull:{IP} in {Full}",
    ], "Record:\nweb01 at 192.168.1.2\n\nRecord:\n192.168.1.3 and 192.168.1.4\n\nRecord:\nweb02"],
    ["cut inside a type", ["Line:[line]", 'Word:cut {Line} on " "', 'Para:cut "\\n\\n"', 'Field:cut {Para} on ","'], "a b\nc d\n\ne,f\ng"],
    ["order", ["Pair:{A} in {Line}", "A:[digits]", "Line:[line]", "X:{Y} in {Line}", "Y:{X} in {Line}"], "1 2\n3"],
    ["regex", ["Date:/\\b[1-9][0-9]* May/", "Broken:/(/"], "on 3 May and 31 May, not 0 May"],
    ["counts", [
      "Exactly:[digits:4]", "AtMost:x[digits:..2]", "AtLeast:y[digits:3..]", "Between:z[digits:2..3]",
      "Short:<[*:..5]>", "ShortLine:[line:..9]", "Code:[word:2]-[hex:4]",
      "SINFormat:[digits:3] [digits:3] [digits:3]", "SINFormat:[digits:3]-[digits:3]-[digits:3]",
      "SIN:SIN[*:..300]({SINFormat})", "Far:SIN[*:..10]({SINFormat})",
      "Plain:[digits:] [digits:9..3] [break:2] [digits:x]",
    ], "1234 12345 x1 x12 x123 y12 y123 y12345 z1 z12 z123 z1234 <abc> <abcdefg> ab-0f3A\nshort line\n" +
      "SIN\n\n   (on file, see below)\n   046 454 286\nPhone 613 555 0199\nSIN: 130-692-544, not 12-345-678\n" +
      "[digits:] [digits:9..3] [break:2] [digits:x]"],
  ];
  const header = [
    "language: what each rule finds",
    "each part: its dictionary, its input (as JSON), then each type with its values in text order ([value], newlines as ⏎)",
  ];
  const lines = parts.flatMap(([name, dict, text]) => {
    const spans = findSpans(text, [{ on: true, text: dict.join("\n") }]).sort((a, b) => a.from - b.from || b.to - a.to);
    const types = [...new Set(dict.map((line) => line.slice(0, line.indexOf(":"))))];
    return ["", `== ${name}`, "dictionary:", ...dict.map((l) => "  " + l), `input: ${JSON.stringify(text)}`,
      ...types.map((type) => {
        const values = spans.filter((s) => s.type === type).map((s) => `[${s.value.replace(/\n/g, "⏎")}]`);
        return `  ${type}: ${values.join(" ") || "(none)"}`;
      })];
  });
  golden("language", [...header, ...lines].join("\n"));
});
