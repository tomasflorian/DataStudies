// TABLE CUTTERS — a table and a file in, the file's tree out as an outline (SPEC.md, section 4).
// Pure.
//
//   #! hint   hosts-file                    reads files whose first line is "eoe: hosts-file"
//   # on      label     function
//   file      line      /^[^#\s].*$/        a regex, between slashes: every match, its first
//   line      ip        /^(\S+)/            group if it has one; always multiline
//   word      word      tolower             or a built-in, by name
//
// Tab-separated. A row runs on every result labelled with its "on" ("file" is the root), and
// puts what its function returns under value → function → label. A label cell of several
// words writes each result under each. A result identical to its input is dropped, which is
// what lets a row run on its own results and still stop.

import { printOutline, type Tree } from "./forest.ts";

export type Row = { on: string; labels: string[]; functionText: string };
export type Table = { name: string; hint: string; rows: Row[] };

const ROOT = "file";
const HINT_PREFIX = "eoe: ";
const REGEX = "regex";
const UNKNOWN_FUNCTION = "unknownFunction";
const BUILT_INS: Record<string, (text: string) => string> = { tolower: (text) => text.toLowerCase() };

export function parseTable(name: string, text: string): Table {
  let hint = "";
  const rows: Row[] = [];
  text.split("\n").forEach((raw, i) => {
    const line = raw.replace(/\r$/, "");
    if (line.startsWith("#!")) {
      const [key, value] = line.slice(2).trim().split(/\s+/);
      if (key === "hint") hint = value;
      return;
    }
    if (!line.trim() || line.startsWith("#")) return;
    const [on, labelCell, functionText] = line.split("\t").map((cell) => cell.trim());
    if (!on || !labelCell || !functionText) throw new Error(`${name}:${i + 1}: a row is on, label, function — tab-separated`);
    if (!isRegex(functionText) && !BUILT_INS[functionText]) throw new Error(`${name}:${i + 1}: no built-in "${functionText}"; the built-ins are ${Object.keys(BUILT_INS).join(" ")}`);
    rows.push({ on, labels: labelCell.split(/\s+/), functionText });
  });
  if (!hint) throw new Error(`${name}: needs "#! hint"`);
  return { name, hint, rows };
}

// Whether a table reads a file: the file's first line names the table's hint.
export const reads = (table: Table, fileText: string) => fileText.split("\n")[0].trim() === HINT_PREFIX + table.hint;

const isRegex = (functionText: string) => functionText.length > 1 && functionText.startsWith("/") && functionText.endsWith("/");

// A function's name in the tree, and what it returns for one text.
function functionOf(functionText: string): { functionName: string; resultsOf: (text: string) => string[] } {
  if (!isRegex(functionText)) return { functionName: functionText, resultsOf: (text) => [BUILT_INS[functionText](text)] };
  const pattern = new RegExp(functionText.slice(1, -1), "gm");
  return { functionName: REGEX, resultsOf: (text) => [...text.matchAll(pattern)].map((match) => match[1] ?? match[0]) };
}

// The child of a node with this text, made if it is not there yet: one function node per
// function, one label node per label.
function childNamed(parent: Tree, text: string): Tree {
  let child = parent.children.find((one) => one.text === text);
  if (!child) parent.children.push((child = { text, children: [] }));
  return child;
}

export function cut(table: Table, path: string, fileText: string): string {
  const root: Tree = { text: fileText, children: [] };
  const queue: { value: Tree; label: string }[] = [{ value: root, label: ROOT }];
  const add = (value: Tree, functionName: string, label: string, result: string) => {
    const resultNode: Tree = { text: result, children: [] };
    childNamed(childNamed(value, functionName), label).children.push(resultNode);
    queue.push({ value: resultNode, label });
  };
  add(root, UNKNOWN_FUNCTION, "path", path);
  add(root, UNKNOWN_FUNCTION, "cutter", table.name);
  while (queue.length) {
    const { value, label } = queue.shift()!;
    for (const row of table.rows.filter((one) => one.on === label)) {
      const { functionName, resultsOf } = functionOf(row.functionText);
      const results = resultsOf(value.text).filter((result) => result !== value.text);
      for (const rowLabel of row.labels) for (const result of results) add(value, functionName, rowLabel, result);
    }
  }
  return printOutline(root);
}

// A run: every table on every file whose hint it reads, one outline each.
export const cutAll = (tables: Table[], files: { path: string; text: string }[]): string[] =>
  files.flatMap((file) => tables.filter((table) => reads(table, file.text)).map((table) => cut(table, file.path, file.text)));
