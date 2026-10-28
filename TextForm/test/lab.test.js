import { test } from "node:test";
import { readFileSync } from "node:fs";
import { findSpans, byType, buildTable } from "../src/cut-core.js";
import { golden, foundText, tableText } from "./golden.js";

// Real-looking output from the containerlab lab (data/lab.net.txt: ip neigh, a hosts file, an nmap
// scan, two frr configs), through one dictionary, read as a table of IPs with the MAC and interface
// that go with each.
test("lab: IPs with their MAC and interface", () => {
  const text = readFileSync(new URL("../data/lab.net.txt", import.meta.url), "utf8");
  const dict = [
    "IP:10.20.[0-255].[0-255]",
    "Line:[line]",
    'Block:cut "\\n\\n"',
    "Interface:eth[0-9]",
    "MAC:[hex]:[hex]:[hex]:[hex]:[hex]:[hex]",
  ].join("\n");
  const columns = ["IP", "MAC", "Interface"];
  const spans = findSpans(text, [{ on: true, text: dict }]);
  const header = [
    "lab: data/lab.net.txt through one dictionary, as a table",
    "dictionary:",
    ...dict.split("\n").map((line) => "  " + line),
    `table: ${columns.join(", ")}`,
    "",
    "found:",
  ];
  golden("lab", [...header, foundText(byType(spans)), "", tableText(columns, buildTable(spans, columns))].join("\n"));
});
