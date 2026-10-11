// EdgeOnEdge — cut, check, and walk.
//   node eoe.ts [--port N] [FILE.eoe ...]        build the demo's layers, and walk them
//   node eoe.ts [--port N] --only FILE.eoe ...   walk only the files named, as they are
//
// Reads every raw file and offers it to every table in cutters/, has every tunings/*.tuning
// join the senses found, writes each layer to demo/layers/ (see produce.ts), and serves the
// walk (walk/): base always loaded, and types, lattice and file names — and any other .eoe
// files named — as chips a reader switches on and off. The layers are rebuilt on every
// start, so they are always the ones the raw files and the tables make. With --only, nothing
// is built: each file named is a chip, and nothing is always loaded.
//
// The only impure file besides cut.ts and walk/server.ts: it reads, writes the layers and
// prints. Everything between is one chain:  cut → union → check → index → meanings → walk.

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { cutByCascade, parseCutter } from "./cascade.ts";
import { check, parse, stored, union, type Line } from "./core/lines.ts";
import { FILE_WORD } from "./core/markers.ts";
import { LAYER_NAMES, line, noLayers, saidBy, sensesIn, systemWord, type Layers } from "./produce.ts";
import { seenLines } from "./seen.ts";
import { tuneLines } from "./tune.ts";
import { mergeAliases, parseAliases } from "./walk/aliases.ts";
import { serve, type Chip } from "./walk/server.ts";

const LAYERS = "demo/layers";
// The layers a reader switches on and off, and what the page calls them.
const CHIPS: { layer: keyof Layers; label: string }[] = [
  { layer: "types", label: "types" }, { layer: "lattice", label: "lattice" }, { layer: "files", label: "file names" },
];

// Every raw file, read and offered to every table: each cuts the files it recognizes, so a
// file can be read several ways, and every file is at least text. Reading a file enters its
// text, said to be a file, and says where it was read from. The pile's lines come
// out sorted, so the files read the same however often they are rebuilt.
function cutAll(): Layers {
  const cutters = readdirSync("cutters").filter((f) => f.endsWith(".tsv")).sort()
    .map((f) => parseCutter(readFileSync(`cutters/${f}`, "utf8"), f));
  const files = (readdirSync("demo/raw", { recursive: true }) as string[]).sort()
    .map((f) => `demo/raw/${f}`).filter((path) => statSync(path).isFile());
  const cuts = files.flatMap((path): Layers[] => {
    const text = readFileSync(path, "utf8");
    const root = line(FILE_WORD, text);
    return [{ ...noLayers(), base: [root, ...systemWord("file")], files: saidBy(root[1], path) }, ...cutters.map((cutter) => cutByCascade({ path, text }, cutter))];
  });
  const layers = noLayers();
  for (const name of LAYER_NAMES) layers[name] = union(...cuts.map((cut) => cut[name]));
  return layers;
}

// The tuning files, by name.
function tuningFiles() {
  const dir = "tunings";
  return existsSync(dir)
    ? readdirSync(dir).filter((f) => f.endsWith(".tuning")).sort()
      .map((f) => ({ name: f.replace(/\.tuning$/, ""), text: readFileSync(`${dir}/${f}`, "utf8") }))
    : [];
}
const aliasesOf = (tunings: { text: string }[]) => mergeAliases(tunings.map(({ text }) => parseAliases(text)));

// .eoe files, each as a chip, and what was wrong with any of them.
function readFiles(paths: string[]) {
  const parsed = paths.map((path) => ({ path, ...parse(readFileSync(path, "utf8"), path) }));
  return { chips: parsed.map(({ path, lines }): Chip => ({ name: path, label: path.split("/").at(-1)!, lines })), problems: parsed.flatMap((p) => p.problems) };
}

// The pile: every raw file cut, the tunings joining the senses found, and the lines of any
// other .eoe files named — checked, with every layer loaded. `layers` is what demo/layers/ holds.
export function buildPile(extra: string[] = []) {
  const tunings = tuningFiles();
  const layers = cutAll();
  const named = readFiles(extra);
  // The tunings join the senses the files were cut into — and those in any .eoe file named.
  const tuned = tunings.map(({ name, text }) => tuneLines(name, text, sensesIn(union(layers.types, ...named.chips.map((chip) => chip.lines)))));
  layers.lattice = union(...tuned.map((one) => one.lattice));
  layers.files = union(layers.files, ...tuned.map((one) => one.files));
  // Which steps are seen, over everything read: always loaded with base, since the walk reads
  // "contains" as the seen steps.
  layers.base = union(layers.base, seenLines(union(...Object.values(layers), ...named.chips.map((chip) => chip.lines))));
  const lines = union(...Object.values(layers), ...named.chips.map((chip) => chip.lines));
  const { kept, setAside } = check(lines);
  const problems = [...named.problems, ...setAside.map((s) => `set aside ${JSON.stringify(s.line)}: ${s.why}`)];
  return { layers, named: named.chips, lines, kept, setAside, problems, aliases: aliasesOf(tunings) };
}

function main(argv: string[]) {
  const port = Number(argv[argv.indexOf("--port") + 1]) || 8788;
  const files = argv.filter((a, i) => a !== "--port" && argv[i - 1] !== "--port" && a !== "--only");
  if (argv.includes("--only")) {
    const read = readFiles(files);
    for (const problem of read.problems) console.error(problem);
    console.log(`${files.join(" ")}: ${read.chips.map((chip) => `${chip.lines.length} ${chip.label}`).join(", ")}`);
    return serve({ title: files.join(" "), always: [], chips: read.chips, aliases: aliasesOf(tuningFiles()) }, port);
  }
  const built = buildPile(files);
  mkdirSync(LAYERS, { recursive: true });
  for (const name of LAYER_NAMES)
    writeFileSync(`${LAYERS}/${name}.eoe`, built.layers[name].map(stored).sort().join("\n") + "\n");
  for (const problem of built.problems) console.error(problem);
  const counts = LAYER_NAMES.map((name) => `${built.layers[name].length} ${name}`).join(", ");
  console.log(`${LAYERS}: ${counts}${files.length ? `; ${built.lines.length} lines with ${files.join(" ")}` : ""}, ${built.setAside.length} set aside`);
  serve({
    title: [LAYERS, ...files].join(" "),
    always: built.layers.base,
    chips: [...CHIPS.map(({ layer, label }): Chip => ({ name: layer, label, lines: built.layers[layer] })), ...built.named],
    aliases: built.aliases,
  }, port);
}

if (import.meta.main) main(process.argv.slice(2));
