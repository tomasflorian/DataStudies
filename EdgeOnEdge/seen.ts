// A producer: the seen checker (SPEC.md, section 6). Pure: lines in, lines out. A step is seen
// when both its ends are text and the right one is found inside the left: anyone holding the
// two strings can check it, and this writes down that it was checked — "seen → that line", a
// claim like any other. The walk reads "contains" as the steps said to be seen.

import type { Line } from "./core/lines.ts";
import { SEEN } from "./core/markers.ts";
import { line, systemWord } from "./produce.ts";

export function seenLines(lines: Line[]): Line[] {
  const seen = lines.filter(([whole, , part]) => typeof whole === "string" && typeof part === "string" && whole !== part && whole.includes(part));
  return seen.length ? [...seen.map(([, lineId]) => line(SEEN, lineId)), ...systemWord("seen")] : [];
}
