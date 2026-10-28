import { test } from "node:test";
import { toggleColumn } from "../src/cut-core.js";
import { golden } from "./golden.js";

// Clicking types under Found: each step clicks one type, and the line shows the columns after it.
// From nothing, a click adds at the end and a second click takes it out; the columns as typed
// (odd spacing, a stray comma) are written back tidy by the first click.
test("columns: clicking types in and out", () => {
  const runs = [
    ["", ["Host", "IP", "User", "IP", "Host"]],
    ["Host,IP ,  ,User", ["Pass"]],
    ["Host, IP", ["Host"]],
  ];
  const header = [
    "columns: what the table's columns become as types under Found are clicked",
    "each run: the columns as typed (as JSON), then a line a click: the type clicked, and the columns after it",
  ];
  const lines = runs.flatMap(([start, clicks]) => {
    let columns = start;
    return ["", JSON.stringify(start), ...clicks.map((type) => {
      columns = toggleColumn(columns, type);
      return `  ${type.padEnd(5)} -> ${columns || "(none)"}`;
    })];
  });
  golden("columns", [...header, ...lines].join("\n"));
});
