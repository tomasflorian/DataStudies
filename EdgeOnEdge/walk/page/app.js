// The column walk, as a page: asks the server (walk/server.ts) and draws the answers.
//
//   state.js   the reading, in the URL, and what every part asks of it
//   app.js     loading, the layer chips, and drawing it all
//   left.js    the left pane: where to start, and what the focused column reaches
//   table.js   the columns and rows, and the file lines under a clicked cell
//
// The layer chips sit in the header. A chip switched off leaves its lines out of the pile
// the server walks; the reading stays, and says what the pile says without them.

import { $, actions, finding, fromUrl, get, layersOn, post, state, tagsOn, threshold, urlFor } from "./state.js";
import { renderLeft } from "./left.js";
import { renderChain, renderTable } from "./table.js";
import { h } from "./util.js";

function go(next) {
  state.session = next;
  state.selected = null;
  history.pushState(null, "", urlFor(next));
  load();
}
actions.go = go;
actions.load = load;
window.onpopstate = () => { state.session = fromUrl(); state.selected = null; load(); };

// What the switches and kinds were last asked for, so an answer is asked again only when
// something it depends on moved.
const askedFor = { tags: null, kinds: null };

async function load() {
  if (!state.info) {
    state.info = await fetch("/api/info").then((r) => r.json());
    $("title").textContent = state.info.title;
  }
  const layers = layersOn().join(",");
  if (askedFor.tags !== layers) { state.tagInfo = await get("/api/tags"); askedFor.tags = layers; }
  const kindsKey = [layers, [...tagsOn()].join(","), threshold(), finding()].join("|");
  if (askedFor.kinds !== kindsKey) {
    state.kinds = await get("/api/kinds", { tags: [...tagsOn()].join(","), threshold: threshold(), find: finding() });
    askedFor.kinds = kindsKey;
  }
  state.view = await post("/api/view", { ...state.session, find: finding() || undefined });
  render();
}

// The layer chips: base is always loaded; each chip is a layer the reader loads or leaves out.
function toggleLayer(name) {
  const on = new Set(layersOn());
  on.has(name) ? on.delete(name) : on.add(name);
  go({ ...state.session, layers: state.info.chips.map((chip) => chip.name).filter((one) => on.has(one)) });
}
function renderLayers() {
  const on = new Set(layersOn());
  $("layers").replaceChildren(...state.info.chips.map((chip) => h("span", {
    class: "chip layer" + (on.has(chip.name) ? " on" : ""), title: chip.lines + " lines · click to load or leave out",
    onclick: () => toggleLayer(chip.name),
  }, chip.label)));
}

function render() { renderLayers(); renderChain(); renderTable(); renderLeft(); }

let findTimer = null;
$("q").oninput = () => { clearTimeout(findTimer); findTimer = setTimeout(load, 150); };
$("reset").onclick = () => { $("q").value = ""; go({ steps: [], focus: 0, layers: state.session.layers }); };
load();
