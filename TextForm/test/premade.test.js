import { test } from "node:test";
import { readFileSync } from "node:fs";
import { findSpans, byType } from "../src/cut-core.js";
import { PREMADE } from "../src/premade.js";
import { golden } from "./golden.js";

const short = (v) => { const s = v.replace(/\n/g, "⏎"); return s.length > 30 ? s.slice(0, 29) + "…" : s; };

// Each premade dictionary on its own, on the file it was made for ("any": the lab file): each type
// it finds, how many values, and the first four.
test("premade: what each dictionary finds in its file", () => {
  const header = [
    "premade: each premade dictionary loaded alone on the file it was made for (\"any\": lab.net.txt)",
    "each type found: how many values, and the first four ([value], newlines as ⏎, long ones cut short with …)",
  ];
  const lines = PREMADE.flatMap(({ name, file, text }) => {
    const path = file === "any" ? "lab.net.txt" : file;
    const spans = findSpans(readFileSync(new URL(`../data/${path}`, import.meta.url), "utf8"), [{ on: true, text }]);
    return ["", `== ${name} on data/${path}`, "dictionary:", ...text.split("\n").map((l) => "  " + l),
      ...byType(spans).map(([type, values]) =>
        `  ${type} ${values.size}: ${[...values.keys()].slice(0, 4).map((v) => `[${short(v)}]`).join(" ")}${values.size > 4 ? " …" : ""}`)];
  });
  golden("premade", [...header, ...lines].join("\n"));
});
