// The page's state, and the small things every part of the page asks of it.
//
// The reading lives in the URL — its start, steps, focus, switches, threshold and the chips
// that are on — so a reload keeps your place, a link hands the reading to someone else, and
// the back button is undo. What the page decides for itself is only how things look: which
// column has focus, which cell's file lines are open. None of it changes a reading.

export const $ = (id) => document.getElementById(id);

export function fromUrl() {
  try { return JSON.parse(new URLSearchParams(location.search).get("s")) || { steps: [], focus: 0 }; }
  catch { return { steps: [], focus: 0 }; }
}
export const urlFor = (s) => location.pathname + (s.start || s.tags || s.threshold || s.layers ? "?s=" + encodeURIComponent(JSON.stringify(s)) : "");

export const state = {
  session: fromUrl(),
  info: null,     // the title, the chips, and the tunings' aliases
  tagInfo: [],    // the switches, for the chips that are on
  kinds: [],      // where a reading can start
  view: null,     // the reading
  selected: null, // the cell whose file lines are open
};
// Filled in by app.js, so the parts of the page can move the reading without importing it.
export const actions = { go: () => {}, load: () => {} };

// The chips that are on: all of them, until the reading switches some off.
export const layersOn = () => state.session.layers ?? state.info.chips.map((chip) => chip.name);
// The switches that are on: all of them, until the reading switches some off.
export const tagsOn = () => new Set(state.session.tags ?? state.tagInfo.map((t) => t.tag));
// How many strings a noun needs before the pile's own evidence may nest it.
export const threshold = () => state.session.threshold || 2;
// The search box holds the first column only. It is a lens, not part of the reading: it
// stays out of the URL.
export const finding = () => $("q").value.trim();

// Every question names the chips that are on.
export const get = (path, params = {}) =>
  fetch(path + "?" + new URLSearchParams({ ...params, layers: layersOn().join(",") })).then((r) => r.json());
export const post = (path, body) =>
  fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, layers: layersOn() }) }).then((r) => r.json());

// A name, or a label made of names, as the tuning files call it. "entry(by)" is a word and
// its role; each half is said that way. "*whole" and "*part", the kinds every reading can
// start from, are "whole" and "part".
export const structural = (kind) => kind === "*whole" || kind === "*part";
export const word = (text) => structural(text) ? text.slice(1) : String(text).split(" ").map((w) => {
  const aliases = state.info?.aliases ?? {};
  const role = /^(.+)\((.+)\)$/.exec(w);
  return role ? (aliases[role[1]] ?? role[1]) + "(" + (aliases[role[2]] ?? role[2]) + ")" : aliases[w] ?? w;
}).join(" ");
