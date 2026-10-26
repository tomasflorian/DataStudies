// TextForm, highlighter version: no types, no objects. You only highlight.
// Highlights may cover words, whole lines or several lines, and may overlap: each one is a
// translucent layer, so where they overlap the colour builds up.
// Kept separate from main.js on purpose; this page shares no code or storage with it.

import { Schema } from "prosemirror-model";
import { EditorState, Plugin, TextSelection } from "prosemirror-state";
import { EditorView, Decoration, DecorationSet } from "prosemirror-view";
import { history, undo, redo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { baseKeymap } from "prosemirror-commands";

const schema = new Schema({
  nodes: {
    doc: { content: "paragraph+" },
    paragraph: { content: "text*", toDOM: () => ["p", 0], parseDOM: [{ tag: "p" }] },
    text: {},
  },
  marks: {
    hl: {
      // type: optional, given from the list at the bottom. colour: no longer chosen; kept so saved text still loads
      attrs: { id: {}, type: { default: "" }, color: { default: "yellow" } },
      excludes: "", // highlights overlap
      inclusive: false, // typing just after a highlight does not extend it (a highlighter, not bold)
      // no look of its own: the paint plugin layers the colours, which nested spans can't do for lines
      toDOM: (m) => ["span", { "data-hl": m.attrs.id }, 0],
      parseDOM: [{ tag: "span[data-hl]", getAttrs: (el) => ({ id: el.dataset.hl, color: el.dataset.color || "yellow" }) }],
    },
  },
});
const hl = schema.marks.hl;
const hlsOf = (marks) => marks.filter((m) => m.type === hl);

const LAYER = "rgb(255 214 0 / 0.28)"; // one colour; overlaps show as deeper yellow
const layers = (marks) => marks.map(() => `linear-gradient(${LAYER}, ${LAYER})`).join(",");

const newId = () => Math.random().toString(36).slice(2, 8);

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

const SAMPLE = [
  "Server notes",
  "web01 is at 192.168.1.2, login admin / hunter2",
  "Ask Alice Smith about the backup box 10.0.0.7",
];
const docJSON = load("textform.hl.doc", null);
const doc = docJSON
  ? schema.nodeFromJSON(docJSON)
  : schema.node("doc", null, SAMPLE.map((l) => schema.node("paragraph", null, [schema.text(l)])));

// --- highlights ---

// One entry per highlight id: its colour, its text pieces, where it starts and ends,
// and whether it covers whole lines (every character of each line it touches).
function collectHighlights(doc) {
  const found = new Map();
  const empty = [];
  doc.forEach((para, offset, line) => {
    empty[line] = !para.content.size;
    const covered = new Map();
    para.forEach((n, o) => {
      const pos = offset + 1 + o;
      for (const m of hlsOf(n.marks)) {
        const h = found.get(m.attrs.id) || { mark: m, pieces: [], from: pos, to: pos, lines: [], last: -1 };
        if (h.last === pos) h.pieces[h.pieces.length - 1] += n.text;
        else h.pieces.push(n.text);
        h.last = h.to = pos + n.nodeSize;
        covered.set(m.attrs.id, (covered.get(m.attrs.id) || 0) + n.text.length);
        found.set(m.attrs.id, h);
      }
    });
    for (const [id, count] of covered) {
      const h = found.get(id);
      h.lines.push(line);
      h.whole = (h.whole ?? true) && count === para.textContent.length;
    }
  });
  for (const h of found.values()) {
    const inRow = h.lines.every((l, k) => k === 0 || empty.slice(h.lines[k - 1] + 1, l).every(Boolean));
    h.isLines = h.whole && inRow;
  }
  return found;
}

// Give a highlight a type (or clear it): same id, same characters, the type stored on the mark.
function setType(id, type) {
  let tr = view.state.tr;
  view.state.doc.descendants((node, pos) => {
    if (!node.isText) return;
    for (const m of hlsOf(node.marks)) {
      if (m.attrs.id !== id || m.attrs.type === type) continue;
      tr = tr.removeMark(pos, pos + node.nodeSize, m).addMark(pos, pos + node.nodeSize, hl.create({ ...m.attrs, type }));
    }
  });
  if (tr.docChanged) view.dispatch(tr);
}

function highlightSelection() {
  const { from, to, empty } = view.state.selection;
  if (empty) return false;
  view.dispatch(view.state.tr.addMark(from, to, hl.create({ id: newId() })));
  return true;
}

// remove every highlight from the selection, or the one highlight with this id everywhere
function unhighlight(id) {
  const { state } = view;
  if (id) {
    const h = collectHighlights(state.doc).get(id);
    if (h) view.dispatch(state.tr.removeMark(0, state.doc.content.size, h.mark));
  } else {
    const { from, to } = state.selection;
    view.dispatch(state.tr.removeMark(from, to, hl));
  }
  view.focus();
}

// Text that reads the same as an existing highlight is highlighted too, automatically.
// These are not stored: they are worked out from the list each time, so removing a highlight
// removes its repeats, and typing the same text again elsewhere lights it up.
// Whole words only (admin is not lit inside administrator), case-sensitive, 2+ characters.
const isWordChar = (c) => /[\p{L}\p{N}]/u.test(c || "");
function findRepeats(doc, highlights) {
  const texts = new Set([...highlights.values()].filter((h) => h.pieces.length === 1 && h.pieces[0].length >= 2).map((h) => h.pieces[0]));
  const own = new Set([...highlights.values()].map((h) => `${h.from}-${h.to}`)); // a highlight is not a repeat of itself
  const repeats = []; // {from, to, text}
  doc.forEach((para, offset) => {
    const line = para.textContent;
    for (const text of texts) {
      for (let i = line.indexOf(text); i !== -1; i = line.indexOf(text, i + 1)) {
        const j = i + text.length;
        if (isWordChar(line[i - 1]) || isWordChar(line[j])) continue;
        const from = offset + 1 + i, to = offset + 1 + j;
        if (!own.has(`${from}-${to}`)) repeats.push({ from, to, text });
      }
    }
  });
  return repeats;
}

// --- drawing ---
// Words: each run of text gets one background layer per highlight on it.
// Whole lines: the line itself gets the layer, edge to edge, and its text does not get it again.

const paint = new Plugin({
  props: {
    decorations(state) {
      const highlights = collectHighlights(state.doc);
      const lineIds = new Set([...highlights].filter(([, h]) => h.isLines).map(([id]) => id));
      const repeats = findRepeats(state.doc, highlights);
      const decos = [];
      state.doc.forEach((para, offset) => {
        const onLine = new Map();
        // Cut the line wherever a highlight or a repeat starts or ends; each piece gets one layer
        // per highlight on it plus one per repeat over it.
        const runs = []; // [from, to, layers from stored highlights]
        para.forEach((n, o) => {
          const marks = hlsOf(n.marks);
          for (const m of marks) if (lineIds.has(m.attrs.id)) onLine.set(m.attrs.id, m);
          const pos = offset + 1 + o;
          runs.push([pos, pos + n.nodeSize, marks.filter((m) => !lineIds.has(m.attrs.id)).length]);
        });
        const mine = repeats.filter((r) => r.from > offset && r.to <= offset + para.nodeSize);
        const cuts = [...new Set([...runs.flatMap(([a, b]) => [a, b]), ...mine.flatMap((r) => [r.from, r.to])])].sort((a, b) => a - b);
        for (let k = 0; k + 1 < cuts.length; k++) {
          const [a, b] = [cuts[k], cuts[k + 1]];
          const stored = runs.find(([x, y]) => x <= a && b <= y)?.[2] ?? 0;
          const n = stored + mine.filter((r) => r.from <= a && b <= r.to).length;
          if (n) decos.push(Decoration.inline(a, b, { class: "hlw", style: `background-image:${layers(Array(n).fill(null))}` }));
        }
        if (onLine.size) decos.push(Decoration.node(offset, offset + para.nodeSize, { class: "hll", style: `background-image:${layers([...onLine.values()])}` }));
      });
      return DecorationSet.create(state.doc, decos);
    },
  },
});

// --- UI ---

function el(tagName, props = {}, ...children) {
  const e = Object.assign(document.createElement(tagName), props);
  e.append(...children);
  return e;
}

const listEl = document.getElementById("highlights");

function describe(h) {
  if (h.isLines) return h.lines.length === 1 ? "line" : `${h.lines.length} lines`;
  return h.lines.length === 1 ? "text" : `text across ${h.lines.length} lines`;
}

function renderList() {
  const all = collectHighlights(view.state.doc);
  const repeats = findRepeats(view.state.doc, all);
  const highlights = [...all].sort(([, a], [, b]) => a.from - b.from || b.to - a.to);
  // every type used so far, offered as you type one
  const types = [...new Set(highlights.map(([, h]) => h.mark.attrs.type).filter(Boolean))].sort();
  document.getElementById("types").replaceChildren(...types.map((t) => el("option", { value: t })));
  listEl.replaceChildren(...highlights.map(([id, h]) => {
    const typeIn = el("input", { className: "type", value: h.mark.attrs.type, placeholder: "type", title: "Give this highlight a type (Enter to save)" });
    typeIn.setAttribute("list", "types");
    typeIn.onclick = (e) => e.stopPropagation(); // don't select the highlight in the text
    typeIn.onkeydown = (e) => { if (e.key === "Enter") typeIn.blur(); };
    typeIn.onchange = () => setType(id, typeIn.value.trim());
    const row = el("div", { className: "row", title: "Click to select it in the text" },
      typeIn,
      el("span", { className: "kind" }, describe(h)),
      el("span", { className: "text" }, h.pieces.join(" ⏎ ")),
      el("span", { className: "repeats", title: "Same text elsewhere, highlighted automatically" },
        ((n) => (n ? `+${n} more` : ""))(h.pieces.length === 1 ? repeats.filter((r) => r.text === h.pieces[0]).length : 0)),
      el("button", { className: "remove", title: "Remove this highlight", onclick: (e) => { e.stopPropagation(); unhighlight(id); } }, "×"),
    );
    row.onclick = () => {
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, h.from, h.to)).scrollIntoView());
      view.focus();
    };
    return row;
  }));
  if (!highlights.length) listEl.append(el("div", { className: "hint" }, "No highlights yet. Select some text."));
}

const editorEl = document.getElementById("editor");
const view = new EditorView(editorEl, {
  state: EditorState.create({
    doc,
    plugins: [paint, history(),
      keymap({ "Mod-Shift-h": () => highlightSelection(), "Mod-z": undo, "Mod-y": redo, "Mod-Shift-z": redo }),
      keymap(baseKeymap)],
  }),
  dispatchTransaction(tr) {
    view.updateState(view.state.apply(tr));
    if (tr.docChanged) save("textform.hl.doc", view.state.doc.toJSON());
    renderList();
  },
});

document.getElementById("highlight").onmousedown = (e) => e.preventDefault();
document.getElementById("highlight").onclick = () => { highlightSelection(); view.focus(); };
document.getElementById("clear").onmousedown = (e) => e.preventDefault();
document.getElementById("clear").onclick = () => unhighlight();
document.getElementById("reset").onclick = () => {
  if (confirm("Clear the text and start from the sample?")) { localStorage.removeItem("textform.hl.doc"); location.reload(); }
};

renderList();
view.focus();
