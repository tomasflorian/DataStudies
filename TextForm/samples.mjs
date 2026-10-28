// Packs data/* into dist/samples.js, so the cutter page (opened straight from disk, where it can't
// read a folder) can offer them as texts to load. Run by `npm run build`; with --watch (as
// `npm run watch` runs it) it packs again whenever something in data/ changes.
import fs from "node:fs";

const dir = new URL("./data/", import.meta.url);

function pack() {
  const samples = Object.fromEntries(fs.readdirSync(dir).sort()
    .filter((name) => fs.statSync(new URL(name, dir)).isFile())
    .map((name) => [name, fs.readFileSync(new URL(name, dir), "utf8")]));
  fs.mkdirSync(new URL("./dist/", import.meta.url), { recursive: true });
  fs.writeFileSync(new URL("./dist/samples.js", import.meta.url), `window.SAMPLES = ${JSON.stringify(samples)};\n`);
  console.log(`samples: ${Object.keys(samples).join(", ") || "(none)"}`);
}

pack();
if (process.argv.includes("--watch")) {
  let timer; // an editor saving a file fires several events; pack once they settle
  fs.watch(dir, () => { clearTimeout(timer); timer = setTimeout(() => { try { pack(); } catch (e) { console.error(e.message); } }, 200); });
}
