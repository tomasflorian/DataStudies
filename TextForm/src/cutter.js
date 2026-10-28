// TextForm: the cutter. The text is plain and stays plain: no marks, nothing stored in it.
// Types come from dictionaries laid over it. A dictionary is a list of Type:value lines, typed by
// hand or cut out of the text. Load any of them and their values light up wherever they appear;
// unload them all and the text is just text. Several dictionaries merge as a union (sort -u).
//
// The text is one string. A newline is a character like any other: values can run across lines,
// and lines are something a dictionary reads off the text ([line]), not something the text is made of.

import { Schema } from "prosemirror-model";
import { EditorState, Plugin, TextSelection } from "prosemirror-state";
import { EditorView, Decoration, DecorationSet } from "prosemirror-view";
import { history, undo, redo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { baseKeymap } from "prosemirror-commands";
import { entries, entryLine, findSpans, byType, buildTable, filterRows, columnsOf, toggleColumn, typesOf } from "./cut-core.js";
import { PREMADE } from "./premade.js";

// One block holding the whole text. It's a code block to ProseMirror, which is what makes Enter
// type "\n" into the text instead of starting a new block, and pasting keep its newlines.
const schema = new Schema({
  nodes: {
    doc: { content: "text_block" },
    text_block: { content: "text*", code: true, marks: "", toDOM: () => ["div", 0], parseDOM: [{ tag: "div", preserveWhitespace: "full" }] },
    text: {},
  },
});

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

const SAMPLE_TEXT = [
  "Record:",
  "web01 is at 192.168.1.2, login admin / hunter2",
  "",
  "Record:",
  "db01 is at 10.0.0.7, login root / s3cret",
  "",
  "Record:",
  "web02 is at 192.168.1.7",
  "login deploy / password1",
  "",
  "Note:",
  "192.168.1.256 is not an address",
];
// Three kinds of dictionary, by what's in them: values cut out of the text by hand, patterns that
// find values like them, and structure: the stretches the values sit in.
const SAMPLE_DICTS = [
  { name: "Values", on: true, text: "Host:web01\nHost:db01\nIP:192.168.1.2\nIP:10.0.0.7\nUser:admin\nUser:root\nUser:deploy\nPass:hunter2\nPass:s3cret\nPass:password1" },
  { name: "Patterns", on: true, text: [
    "IP:192.168.1.[0-255]",
    "Host:web[digits]",
    "Group:Group [A-H]",
    "Date:[1-31] May",
    "GroupLine:Group [A-H] [rest]",
  ].join("\n") },
  // a Record or a Note: from its label down to the next blank line (or the end of the text)
  { name: "Structure", on: true, text: [
    "Line:[line]",
    "Record:Record:\\n[*][break]",
    "Note:Note:\\n[*][break]",
    "IPRecord:{Record} containing {IP}+",
    "HostRecord:{Record} containing {Host}+",
    "FullRecord:{Record} containing {IP} {Host}",
    'Word:cut {Line} on " "',
  ].join("\n") },
];

let dicts = load("textform.cut.dicts", SAMPLE_DICTS); // [{name, on, text}]
const saveDicts = () => save("textform.cut.dicts", dicts);


// --- drawing ---
// Each found value is one translucent layer; where values overlap (an IP inside a line) the colour
// builds up.

const LAYER = "rgb(255 214 0 / 0.28)";

// The layers, built in one pass: walk the starts and ends of all values in order, keeping the set
// of values open at each point; every stretch between two such points with any open gets one
// background layer per open value. (Overlapping decorations become one span in ProseMirror, which
// is why the text is cut up this way.)
function layersOf(doc, spans) {
  const points = spans.flatMap((s) => [[s.from, 1, s], [s.to, -1, s]]).sort((a, b) => a[0] - b[0]);
  const open = new Set(), decos = [];
  for (let k = 0; k < points.length; ) {
    const at = points[k][0];
    for (; k < points.length && points[k][0] === at; k++) points[k][1] > 0 ? open.add(points[k][2]) : open.delete(points[k][2]);
    const next = points[k]?.[0];
    if (!open.size || next === undefined || next === at) continue;
    const over = [...open];
    decos.push(Decoration.inline(at, next, {
      class: "found",
      style: `background-image:${over.map(() => `linear-gradient(${LAYER}, ${LAYER})`).join(",")}`,
      title: over.map((s) => `${s.type}: ${short(s.value)}` + (s.entry !== s.value ? `   (from ${s.entry})` : "")).join("\n"),
    }));
  }
  return DecorationSet.create(doc, decos);
}

// in the editor, positions are one more than offsets in the text: it starts just inside its block
const found = (doc) => {
  const spans = findSpans(doc.textContent, dicts).map((s) => ({ ...s, from: s.from + 1, to: s.to + 1 }));
  return { spans, layers: layersOf(doc, spans) };
};
const spansOf = (state) => overlay.getState(state).spans;

const overlay = new Plugin({
  // { spans, layers }: what the dictionaries find, and how it's drawn. Both are worked out again only
  // when the text or a dictionary changes (or live updates resume), not on every redraw.
  state: {
    init: (_, state) => found(state.doc),
    apply: (tr, old, _, state) => {
      if (live || tr.getMeta("resume")) return tr.docChanged || tr.getMeta("dicts") || tr.getMeta("resume") ? found(state.doc) : old;
      // paused: nothing is matched again; what was found moves along with the edits, so it stays on its text
      if (!tr.docChanged) return old;
      return {
        spans: old.spans.flatMap((s) => {
          const from = tr.mapping.map(s.from, 1), to = tr.mapping.map(s.to, -1);
          return from < to ? [{ ...s, from, to }] : [];
        }),
        layers: old.layers.map(tr.mapping, tr.doc),
      };
    },
  },
  props: {
    decorations: (state) => overlay.getState(state).layers,
  },
});

// --- UI ---

function el(tagName, props = {}, ...children) {
  const e = Object.assign(document.createElement(tagName), props);
  e.append(...children);
  return e;
}

// for showing a value in a button or a list: newlines as ⏎, and long ones cut short
const short = (v) => { const s = v.replace(/\n/g, "⏎"); return s.length > 40 ? s.slice(0, 38) + "…" : s; };

function refresh() {
  view.dispatch(view.state.tr.setMeta("dicts", true));
}

// Live updates: on, every keystroke (in the text or a dictionary) matches everything again and redraws
// the lists and the table. Off, nothing is matched again and the lists and table stay as they were,
// so typing in a big text or working on a regex is quick; turning it back on catches up at once.
let live = true;
const liveEl = document.getElementById("live");
liveEl.onchange = () => {
  live = liveEl.checked;
  document.body.classList.toggle("paused", !live);
  if (live) view.dispatch(view.state.tr.setMeta("resume", true));
};

// The types the loaded dictionaries find in the text (only the types, not what's found under them).
// Clicking one adds it to the table's columns, or takes it out again; the columns can still be typed.
function renderFound() {
  const types = byType(spansOf(view.state)).map(([type]) => type);
  const box = document.getElementById("found");
  if (!types.length) { box.replaceChildren(el("div", { className: "none" }, "nothing found with what's loaded")); return; }
  const columns = columnsOf(columnsEl.value).flatMap(typesOf); // URL+IP: both are in the table
  box.replaceChildren(...types.map((type) => el("button", {
    className: "type-pick" + (columns.includes(type) ? " in" : ""),
    title: columns.includes(type) ? "Take it out of the table" : "Add it to the table",
    onclick: () => { columnsEl.value = toggleColumn(columnsEl.value, type); columnsChanged(); },
  }, type)));
}

const columnsEl = document.getElementById("columns");
columnsEl.value = load("textform.cut.columns", "Host, IP, User, Pass");
columnsEl.setAttribute("list", "types");
const columnsChanged = () => { save("textform.cut.columns", columnsEl.value); renderFound(); renderTable(); };
columnsEl.oninput = columnsChanged;

// A quick filter under each column's name: only the rows whose cell in that column holds what's
// typed there (any case; "?" finds the holes). Kept by column name, so a filter stays with its
// column when the others change. !word keeps only a value that is exactly word. Typing in one redraws only the rows, so it keeps the focus.
const filters = new Map(Object.entries(load("textform.cut.filters", {}))); // column -> text
const saveFilters = () => save("textform.cut.filters", Object.fromEntries([...filters].filter(([, f]) => f)));

function renderTable() {
  const columns = columnsOf(columnsEl.value);
  const box = document.getElementById("table");
  if (!columns.length) { box.replaceChildren(); return; }
  const rows = buildTable(spansOf(view.state), columns);
  if (!rows.length) { box.replaceChildren(el("div", { className: "none" }, `no ${columns[0]} found with what's loaded`)); return; }
  const body = el("tbody"), count = el("div", { className: "count" });
  const showRows = () => {
    const shown = filterRows(rows, columns.map((c) => filters.get(c) ?? ""));
    count.textContent = shown.length === rows.length ? `${rows.length} rows` : `${shown.length} of ${rows.length} rows`;
    body.replaceChildren(...shown.map((cells) => el("tr", {}, ...cells.map((cell) => el("td", { title: cell.via ? `found inside its ${cell.via}` : "" },
      ...(cell.values.length
        ? cell.values.map((v) => el("span", { className: "cell", title: v }, short(v)))
        : [el("span", { className: "hole" }, "?")]))))));
  };
  const filterRow = el("tr", { className: "filters" }, ...columns.map((c) => {
    const input = el("input", { value: filters.get(c) ?? "", placeholder: "filter", spellcheck: false, title: `Only rows whose ${c} holds this (any case; !word: exactly word; ? for holes)` });
    input.oninput = () => { filters.set(c, input.value); saveFilters(); showRows(); };
    return el("th", {}, input);
  }));
  showRows();
  box.replaceChildren(el("table", {}, el("thead", {}, el("tr", {}, ...columns.map((c) => el("th", {}, c))), filterRow), body), count);
}

const typesEl = document.getElementById("types");
const intoEl = document.getElementById("into");

function renderCutBar() {
  const types = [...new Set(["Keyword", ...dicts.flatMap((d) => entries(d.text).map((e) => e.type))])].sort();
  typesEl.replaceChildren(...types.map((t) => el("option", { value: t })));
  const was = intoEl.value;
  intoEl.replaceChildren(...dicts.map((d, k) => el("option", { value: k, selected: String(k) === was }, d.name || `dictionary ${k + 1}`)));
}

function renderDicts() {
  const box = document.getElementById("dicts");
  box.replaceChildren(...dicts.map((d, k) => {
    const on = el("input", { type: "checkbox", checked: d.on, title: "Load this dictionary" });
    on.onchange = () => { d.on = on.checked; saveDicts(); refresh(); };
    const name = el("input", { className: "name", value: d.name, placeholder: "name" });
    name.oninput = () => { d.name = name.value; saveDicts(); renderCutBar(); };
    const text = el("textarea", { value: d.text, spellcheck: false, placeholder: "Type:value, one a line", rows: Math.max(3, d.text.split("\n").length + 1) });
    text.oninput = () => { d.text = text.value; saveDicts(); refresh(); };
    const remove = el("button", { className: "remove", title: "Delete this dictionary", onclick: () => {
      if (!confirm(`Delete dictionary ${d.name || k + 1}?`)) return;
      dicts.splice(k, 1); saveDicts(); renderDicts(); refresh();
    } }, "×");
    return el("div", { className: "dict" + (d.on ? "" : " off") }, el("div", { className: "head" }, on, name, remove), text);
  }), el("div", { className: "adds" },
    el("button", { className: "add", onclick: () => addDict(String.fromCharCode(65 + dicts.length), "") }, "+ dictionary"),
    premadeList()));
  renderCutBar();
}

function addDict(name, text) {
  dicts.push({ name, on: true, text }); saveDicts(); renderDicts(); refresh();
}

// the premade dictionaries: picking one adds a copy of it
function premadeList() {
  const list = el("select", { className: "add", title: "Add a premade dictionary (a copy: change it as you like)" },
    el("option", { value: "" }, "+ premade…"),
    ...PREMADE.map((p, k) => el("option", { value: k }, `${p.name}  (${p.file})`)));
  list.onchange = () => { const p = PREMADE[list.value]; if (p) addDict(p.name, p.text); };
  return list;
}

// Selection -> one Type:value line in the chosen dictionary. The text itself is not touched.
function cut() {
  const { from, to, empty } = view.state.selection;
  const typeIn = document.getElementById("type");
  if (empty) return;
  const value = view.state.doc.textBetween(from, to);
  const type = typeIn.value.trim().replace(/:/g, "");
  if (!type) { typeIn.focus(); return; }
  const d = dicts[Number(intoEl.value) || 0];
  if (!d) return;
  d.text = d.text.replace(/\n*$/, d.text.trim() ? "\n" : "") + entryLine(type, value);
  d.on = true;
  saveDicts();
  renderDicts();
  refresh();
  view.focus();
}

const docOf = (text) => schema.node("doc", null, [schema.node("text_block", null, text ? [schema.text(text)] : [])]);
const saved = load("textform.cut.text", null);
const doc = docOf(Array.isArray(saved) ? saved.join("\n") : saved ?? SAMPLE_TEXT.join("\n")); // saved as lines before

// Texts to load: the built-in sample, then each file in data/ (packed by samples.mjs).
// Loading replaces only the text, as one edit, so Ctrl+Z brings the old text back.
const TEXTS = { "sample": SAMPLE_TEXT.join("\n"), ...(window.SAMPLES || {}) };
const samplesEl = document.getElementById("samples");
samplesEl.replaceChildren(el("option", { value: "" }, "load text…"), ...Object.keys(TEXTS).map((name) => el("option", { value: name }, name)));
samplesEl.onchange = () => {
  const text = TEXTS[samplesEl.value];
  samplesEl.value = "";
  if (text === undefined) return;
  setText(text.replace(/\r\n/g, "\n")); // exactly as the file has it, trailing newline and all
  view.focus();
};
function setText(text) {
  const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, docOf(text).content);
  view.dispatch(tr.setSelection(TextSelection.atStart(tr.doc)).scrollIntoView()); // start at the top, not at the end of the last line
}

const view = new EditorView(document.getElementById("editor"), {
  state: EditorState.create({
    doc,
    plugins: [overlay, history(),
      keymap({ "Mod-Shift-x": () => (cut(), true), "Mod-z": undo, "Mod-y": redo, "Mod-Shift-z": redo }),
      keymap(baseKeymap)],
  }),
  dispatchTransaction(tr) {
    view.updateState(view.state.apply(tr));
    if (tr.docChanged) save("textform.cut.text", view.state.doc.textContent);
    if (!live) return;
    renderFound();
    renderTable();
  },
});

document.getElementById("cut").onmousedown = (e) => e.preventDefault();
document.getElementById("cut").onclick = cut;
document.getElementById("type").onkeydown = (e) => { if (e.key === "Enter") cut(); };
document.getElementById("reset").onclick = () => {
  if (!confirm("Put the sample text and dictionaries back?")) return;
  localStorage.removeItem("textform.cut.text"); localStorage.removeItem("textform.cut.dicts"); location.reload();
};

renderDicts();
renderFound();
renderTable();
view.focus();
