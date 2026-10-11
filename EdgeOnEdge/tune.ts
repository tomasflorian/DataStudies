// A producer: the tuning files, as lines. Pure: a tuning's text and the pile's senses in,
// lines for the lattice and files layers out. Two kinds of line, both joining senses to a
// sense of the tuning's own vocabulary:
//
//   tag machine = host@IT ip           "machine" is a switch: a line from it to each
//                                      member, and switching it shows them (see
//                                      walk/switches.ts)
//   broader address = ip host@IT       "address" is broader than its members: a line from it
//                                      down to each member, said to be broader, so a reader
//                                      climbing the tower follows only these steps, and knows it
//
// A member is a text ("ip": that text in any vocabulary), a vocabulary ("@IT": every sense in
// it), or both ("host@IT"). The lattice layer carries the senses it joins, so it reads on its
// own; the files layer says each joining was said by the tuning file. Aliases are not lines:
// they only rename, and the page reads them itself.
//
// Imports core/ and produce.ts only.

import type { Line } from "./core/lines.ts";
import { BROADER, SWITCH } from "./core/markers.ts";
import { line, saidBy, sense, systemWord, type Layers, type sensesIn } from "./produce.ts";

export function tuneLines(name: string, text: string, senses: ReturnType<typeof sensesIn>): Pick<Layers, "lattice" | "files"> {
  const out = { lattice: [] as Line[], files: [] as Line[] };
  for (const raw of text.split("\n")) {
    const [keyword, ...rest] = raw.trim().split(/\s+/);
    if (keyword !== "tag" && keyword !== "broader") continue;
    const [tagName, members] = rest.join(" ").split("=").map((part) => part.trim());
    if (!tagName || !members) continue;
    const tag = sense(name, tagName, keyword === "tag" ? [SWITCH] : []);
    out.lattice.push(...tag.lines);
    for (const member of members.split(/\s+/)) {
      const [memberText, memberVocabulary] = member.split("@");
      for (const one of senses)
        if ((!memberText || one.text === memberText) && (!memberVocabulary || one.vocabulary === memberVocabulary)) {
          // The broader word or the switch first, the member after it: type-ish end first.
          const joining = line(tag.id, one.id);
          out.lattice.push(...sense(one.vocabulary, one.text).lines, joining, ...(keyword === "broader" ? [line(BROADER, joining[1]), ...systemWord("broader")] : []));
          out.files.push(...saidBy(joining[1], `${name}.tuning`));
        }
    }
  }
  return out;
}
