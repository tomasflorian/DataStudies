import { test } from "node:test";
import { findSpans, byType, buildTable } from "../src/cut-core.js";
import { golden, foundText, tableText } from "./golden.js";

// Four records that the record rules should sort differently: one with no Host, one with two IPs,
// one with no IP, and a last one with no blank line after it ([break] takes the end of the text too).
// GeneralRecord is every record; the other three are the GeneralRecords holding what they need.
test("frames: which records are which", () => {
  const text = [
    "Record:", "box at 192.168.1.9", "",
    "Record:", "web05 at 192.168.1.3 and 192.168.1.4", "",
    "Record:", "web06, address unknown", "",
    "Record:", "web07 at 192.168.1.8",
  ].join("\n");
  const dicts = [{ on: true, text: [
    "IP:192.168.1.[0-255]",
    "Host:web[digits]",
    "GeneralRecord:Record:\\n[*][break]",
    "IPRecord:{GeneralRecord} containing {IP}+",
    "HostRecord:{GeneralRecord} containing {Host}+",
    "FullRecord:{GeneralRecord} containing {IP} {Host}",
  ].join("\n") }];
  const spans = findSpans(text, dicts);
  const columns = ["GeneralRecord", "Host", "IP"];
  golden("frames", [foundText(byType(spans)), "", tableText(columns, buildTable(spans, columns))].join("\n"));
});
