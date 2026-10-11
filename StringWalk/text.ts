// text.ts — a view's table as text. Shared by the shell and read.ts so the two
// cannot drift, since one of them writes the file a diff reads.
//
// LAYOUT ONLY. What a cell holds — a value, a hole, the stub standing in for a
// shortened column's value — was decided by session.ts before it got here. This
// decides widths, escaping, and nothing else.

export interface TextColumn { header: string; short?: boolean }

// A ROW IS A LINE, so a value holding a newline would not make the table wide,
// it would break every column after it. Cursor-moving characters are written
// the way source writes them — an encoding, not a shortening; it reads back.
const oneLine = (s: string): string =>
  s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n")
   .replace(/\r/g, "\\r").replace(/\t/g, "\\t");

// `?` is a hole — the step found nothing from this row — not an empty value.
export function drawTable(columns: readonly TextColumn[], rows: readonly (readonly (string | null)[])[],
  indent = "  "): string[] {
  const head = columns.map(c => oneLine(c.header) + (c.short ? " (short)" : ""));
  const cell = (r: readonly (string | null)[], i: number) => {
    const c = r[i];
    return c === null || c === undefined ? "?" : oneLine(c);
  };
  const wide = head.map((h, i) => Math.max(h.length, ...rows.map(r => cell(r, i).length)));
  return [
    head.map((h, i) => h.padEnd(wide[i])).join(" | "),
    wide.map(n => "-".repeat(n)).join("-+-"),
    ...rows.map(r => columns.map((_, i) => cell(r, i).padEnd(wide[i])).join(" | ")),
  ].map(l => indent + l.trimEnd());
}
