import { test } from "node:test";
import { readFileSync } from "node:fs";
import { findSpans, buildTable, filterRows } from "../src/cut-core.js";
import { PREMADE } from "../src/premade.js";
import { golden, tableText } from "./golden.js";

// Columns joined with +: a column of several types, mixed. data/internet.txt through the internet
// addresses dictionary, plus lines; a table a part.
//   first column URL+Email: a row for each URL or email, in the order they're in the text
//   later column URL+IP: whichever of them is nearest, both kinds in one cell
//   one type alone, for comparison
test("table: columns joined with +", () => {
  const text = readFileSync(new URL("../data/internet.txt", import.meta.url), "utf8");
  const dict = PREMADE.find((p) => p.name === "internet addresses").text + "\nLine:[line]";
  const spans = findSpans(text, [{ on: true, text: dict }]);
  const tables = [["URL+Email", "Line"], ["Line", "URL+IP"], ["Line", "IP"]];
  const header = [
    "table: a column can be several types joined with +, their values mixed",
    "data/internet.txt through the premade \"internet addresses\" dictionary plus Line:[line]; a table each",
  ];
  golden("table", [...header, ...tables.flatMap((columns) => ["", `== ${columns.join(", ")}`, tableText(columns, buildTable(spans, columns))])].join("\n"));
});

// Quick filters on the Line, URL+IP table: one filter at a time, then two together. A filter keeps
// the rows whose cell in its column holds it, ignoring case; "?" keeps the holes; !word keeps a
// value that is exactly word (so !10.20.1.1 is nothing here, though 10.20.1.10 and .11 hold it).
test("table: quick filters", () => {
  const text = readFileSync(new URL("../data/internet.txt", import.meta.url), "utf8");
  const dict = PREMADE.find((p) => p.name === "internet addresses").text + "\nLine:[line]";
  const columns = ["Line", "URL+IP"];
  const rows = buildTable(findSpans(text, [{ on: true, text: dict }]), columns);
  const runs = [["", "172."], ["", "HTTPS"], ["", "?"], ["NAT", ""], ["nat", "203"], ["zzz", ""],
    ["", "10.20.1.1"], ["", "!10.20.1.1"], ["", "!10.20.1.11"], ["", "!8.8.8.8"], ["", "!"]];
  const header = [
    "table: quick filters, a filter a column (\"\" none), on data/internet.txt as Line, URL+IP",
    `${rows.length} rows unfiltered; each run: its filters, then the rows left`,
  ];
  golden("table-filters", [...header, ...runs.flatMap((filters) => {
    const shown = filterRows(rows, filters);
    return ["", `== ${columns.map((c, k) => `${c}: ${JSON.stringify(filters[k])}`).join("  ")}  -> ${shown.length} rows`, ...(shown.length ? tableText(columns, shown).split("\n") : ["(none)"])];
  })].join("\n"));
});
