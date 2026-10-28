// Golden tests: a test writes what it got to test/golden/<name>.txt, every run, and git is what
// decides whether that's right. The file as last committed is the approved one: the test fails
// while what it wrote differs from that (or was never committed), and the diff is there to read
// in git. Committing it approves it; checking it out again throws it away.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export function golden(name, text) {
  const file = join(here, "golden", name + ".txt");
  const now = text.endsWith("\n") ? text : text + "\n";
  mkdirSync(dirname(file), { recursive: true });
  let was = null;
  try { was = readFileSync(file, "utf8"); } catch {}
  if (was !== now) writeFileSync(file, now); // only when it changed, so nothing sees it touched for nothing
  const path = relative(execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: here, encoding: "utf8" }).trim(), file);
  let approved = null;
  try { approved = execFileSync("git", ["show", `HEAD:${path}`], { cwd: here, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); } catch {}
  if (approved === null) throw new Error(`${path} is new: read it, and commit it if it's right`);
  if (approved !== now) throw new Error(`${path} differs from the committed one: see the diff in git, commit it if it's right`);
}

// How results read in a golden: a value as [value], newlines in it as ⏎.
const shown = (v) => `[${v.replace(/\n/g, "⏎")}]`;

// Found: each type with how many values and places
export const foundText = (types) => types.map(([type, values]) => {
  const places = [...values.values()].reduce((a, b) => a + b, 0);
  return `${type}  ${values.size} value${values.size > 1 ? "s" : ""}, ${places} place${places > 1 ? "s" : ""}`;
}).join("\n");

// a table: the columns, then a row a line, cells split by |, a hole as ?. Each column is as wide
// as its widest cell, so a value wider than the rest pads the whole column again: in a diff that's
// lines changed only in their spaces (git diff -w leaves them out).
export function tableText(columns, rows) {
  const lines = [columns, ...rows.map((cells) => cells.map((c) => (c.values.length ? c.values.map(shown).join(" ") : "?")))];
  const widths = columns.map((_, k) => Math.max(...lines.map((cells) => cells[k].length)));
  return lines.map((cells) => cells.map((c, k) => c.padEnd(widths[k])).join(" | ").trimEnd()).join("\n");
}
