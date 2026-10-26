// TextForm v0: a plain text editor where selected text can be tagged as an object (IP, Name, ...).
// A tag is a ProseMirror mark, so it behaves like bold: typing at its end carries it on.
// Each tag carries an object id, so two IPs that end up touching stay two objects.
// Tags nest: select a whole line that already has an IP in it and tag it Record, and the IP stays.
// Types are paths, general to specific: Obj, Obj:Pass, Obj:Pass:IP. Tag as general or as specific
// as you know, and change an object's type later from the Objects panel.

import { Schema } from "prosemirror-model";
import { EditorState, Plugin } from "prosemirror-state";
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
    tag: {
      attrs: { type: {}, id: {} },
      inclusive: true, // typing at the end of a tag extends it, like bold
      excludes: "", // a character can carry several tags (an IP inside a Record)
      // The span carries no look of its own. Which span ProseMirror puts inside which is not
      // decided by size, so all drawing is done by the paint plugin below, which knows sizes.
      toDOM: (m) => ["span", { "data-type": m.attrs.type, "data-id": m.attrs.id }, 0],
      parseDOM: [{ tag: "span[data-id]", getAttrs: (el) => ({ type: el.dataset.type, id: el.dataset.id }) }],
    },
  },
});
const tag = schema.marks.tag;

function hash(text) {
  let h = 0;
  for (const c of text) h = (h * 31 + c.charCodeAt(0)) % 360;
  return (h * 137) % 360; // spread similar names apart
}

const parts = (type) => type.split(":");
const leaf = (type) => parts(type).at(-1);
const ancestors = (type) => parts(type).slice(0, -1).map((_, i, a) => a.slice(0, i + 1).join(":"));

// a family shares a colour: everything under Obj:Pass is near Obj:Pass's hue
function hue(type) {
  const p = parts(type);
  const base = hash(p.slice(0, 2).join(":"));
  return p.length > 2 ? (base + ((hash(p.at(-1)) % 5) - 2) * 24 + 360) % 360 : base;
}

const newId = () => Math.random().toString(36).slice(2, 8);
const tagsOf = (marks) => marks.filter((m) => m.type === tag);

// --- storage (per browser; fine for a prototype) ---

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

// Pills are type paths. Adding one adds its ancestors too, so you can always be more general.
let pills = load("textform.types", ["Obj", "Obj:Pass", "Obj:Pass:IP", "Obj:Pass:Password", "Obj:Pass:Host", "Obj:Noun"]);

function addPill(type) {
  pills = [...new Set([...pills, ...ancestors(type), type])].sort();
  save("textform.types", pills);
}

const SAMPLE = [
  "Server notes",
  "web01 is at 192.168.1.2, login admin / hunter2",
  "Ask Alice Smith about the backup box 10.0.0.7",
];
const docJSON = load("textform.doc", null);
const doc = docJSON
  ? schema.nodeFromJSON(docJSON)
  : schema.node("doc", null, SAMPLE.map((l) => schema.node("paragraph", null, [schema.text(l)])));

// --- what the cursor is "in", like the bold button lighting up ---

function activeTags(state) {
  const { empty, $from } = state.selection;
  return tagsOf(empty ? state.storedMarks || $from.marks() : $from.marks());
}

// every tag of this type anywhere in the selection, and whether all of the selected text has one
function tagsInSelection(state, type) {
  const { from, to } = state.selection;
  const found = new Map();
  let all = true;
  state.doc.nodesBetween(from, to, (node) => {
    if (!node.isText) return;
    const mine = tagsOf(node.marks).filter((m) => m.attrs.type === type);
    if (!mine.length) all = false;
    for (const m of mine) found.set(m.attrs.id, m);
  });
  return { marks: [...found.values()], all };
}

// Clicking a pill:
//   text selected, not all of it this type  -> it becomes one new object of this type (other tags stay)
//   text selected, all of it this type      -> untag this type there (other tags stay)
//   cursor only, inside this type           -> stop: what you type next is not this type (bold off)
//   cursor only, elsewhere                  -> start: what you type next is a new object (bold on)
function clickPill(type) {
  const { state } = view;
  const { from, to, empty } = state.selection;
  let tr = state.tr;
  if (!empty) {
    const { marks, all } = tagsInSelection(state, type);
    if (all) for (const m of marks) tr = tr.removeMark(from, to, m);
    else tr = tr.addMark(from, to, tag.create({ type, id: newId() }));
  } else {
    const current = state.storedMarks || state.selection.$from.marks();
    const on = current.some((m) => m.type === tag && m.attrs.type === type);
    tr = tr.setStoredMarks(on
      ? current.filter((m) => !(m.type === tag && m.attrs.type === type))
      : [...current, tag.create({ type, id: newId() })]);
  }
  view.dispatch(tr);
  view.focus();
}

// Clear: selected text loses all its tags; with only a cursor, what you type next is untagged.
function clearTag() {
  const { state } = view;
  const { from, to, empty } = state.selection;
  const others = (state.storedMarks || state.selection.$from.marks()).filter((m) => m.type !== tag);
  view.dispatch(empty ? state.tr.setStoredMarks(others) : state.tr.removeMark(from, to, tag));
  view.focus();
}

// --- objects ---

// Objects added directly, from the panel; they need not have any characters yet.
let added = load("textform.objects", []); // [{id, type, value}]

// One entry per object id, from added objects and from tags in the text. An object's characters
// can end up in several places (untag the middle, or copy and paste it); those are its pieces.
function collectObjects(doc) {
  const objects = new Map(added.map((o) => [o.id, { type: o.type, value: o.value, pieces: [], last: -1, size: 0 }]));
  doc.descendants((node, pos) => {
    if (!node.isText) return;
    for (const m of tagsOf(node.marks)) {
      const o = objects.get(m.attrs.id) || { type: m.attrs.type, value: null, pieces: [], last: -1, size: 0 };
      if (o.last === pos) o.pieces[o.pieces.length - 1] += node.text;
      else o.pieces.push(node.text);
      o.last = pos + node.nodeSize;
      o.size += node.text.length;
      objects.set(m.attrs.id, o);
    }
  });
  for (const o of objects.values()) o.value ??= o.pieces.length === 1 ? o.pieces[0] : null;
  return objects;
}

// Untagged text that reads the same as an existing object. Nothing is tagged automatically:
// each match gets a striped highlight, and double-clicking it links it to that object.
// Text inside a bigger object still counts as untagged for a smaller type (an IP inside a Record).
const isWordChar = (c) => /[\p{L}\p{N}]/u.test(c || "");
function findSuggestions(doc, objects = collectObjects(doc)) {
  const found = new Map(); // "from-to" -> {from, to, id, type}
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return;
    const text = node.textContent;
    for (const [id, o] of objects) {
      if (!o.value || o.value.length < 2) continue;
      for (let i = text.indexOf(o.value); i !== -1; i = text.indexOf(o.value, i + 1)) {
        const j = i + o.value.length;
        if (isWordChar(text[i - 1]) || isWordChar(text[j])) continue; // 10.0.0.7 is not in 10.0.0.70
        const from = pos + 1 + i, to = pos + 1 + j;
        if (found.has(`${from}-${to}`)) continue;
        let taken = false; // already this object, or already something of this type
        doc.nodesBetween(from, to, (n) => {
          if (tagsOf(n.marks).some((m) => m.attrs.id === id || m.attrs.type === o.type)) taken = true;
        });
        if (!taken) found.set(`${from}-${to}`, { from, to, id, type: o.type });
      }
    }
    return false;
  });
  return [...found.values()];
}

// Make an object more general or more specific: same id, same characters, new type.
function retype(id, type) {
  let tr = view.state.tr;
  view.state.doc.descendants((node, pos) => {
    if (!node.isText) return;
    for (const m of tagsOf(node.marks)) {
      if (m.attrs.id !== id) continue;
      tr = tr.removeMark(pos, pos + node.nodeSize, m).addMark(pos, pos + node.nodeSize, tag.create({ type, id }));
    }
  });
  added = added.map((a) => (a.id === id ? { ...a, type } : a));
  save("textform.objects", added);
  view.dispatch(tr);
}

function applySuggestion(sg) {
  view.dispatch(view.state.tr.addMark(sg.from, sg.to, tag.create({ type: sg.type, id: sg.id })));
}

// --- drawing ---
// Each run of text is filled with the colour of its smallest object. Every bigger object around
// it adds a coloured line further below. Labels stack upward: the smallest object's at the bottom.

// How deep an object's nesting goes: 0 for one with nothing inside it, else 1 + the deepest
// object inside it. With colours off, a label sits that many steps up and to the left, so the
// same object is at the same height wherever its label is, and a step with no label stays empty.
function heights(doc) {
  const nodes = new Map(); // object id -> indexes of the text runs it covers
  let n = 0;
  doc.descendants((node) => {
    if (!node.isText) return;
    for (const m of tagsOf(node.marks)) (nodes.get(m.attrs.id) || nodes.set(m.attrs.id, new Set()).get(m.attrs.id)).add(n);
    n++;
  });
  const inside = (b, a) => { // b is inside a
    const A = nodes.get(a), B = nodes.get(b);
    return a !== b && [...B].every((i) => A.has(i)) && (A.size > B.size || (A.size === B.size && a > b));
  };
  const memo = new Map();
  const height = (id) => {
    if (!memo.has(id)) memo.set(id, Math.max(-1, ...[...nodes.keys()].filter((b) => inside(b, id)).map(height)) + 1);
    return memo.get(id);
  };
  for (const id of nodes.keys()) height(id);
  return memo;
}

const STEP_X = 7, STEP_Y = 11, LABEL_Y = 15, TEXT_TOP = 8; // px above the baseline, matching the CSS for .lbl

// A stair from the top of the text up to a label `depth` steps up: each step goes left, then up,
// and the last one ends at the label's bottom-left corner. Steps with no label of their own stay empty.
function stair(depth) {
  const w = STEP_X * (depth + 1), h = LABEL_Y - TEXT_TOP + STEP_Y * depth;
  let d = `M${w},${h}`;
  for (let i = 0; i <= depth; i++) d += ` H${w - STEP_X * (i + 1)} V${h - (LABEL_Y - TEXT_TOP + STEP_Y * i)}`;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "stair");
  svg.setAttribute("width", w);
  svg.setAttribute("height", h + 1);
  svg.setAttribute("viewBox", `0 -0.5 ${w} ${h + 1}`);
  svg.style.left = `${-w}px`;
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", d);
  svg.append(path);
  return svg;
}

// level: how high above the text with colours on; indent: how many steps further left;
// depth: the object's nesting depth, which places it with colours off
function label(text, type, level, cls, indent = 0, depth = 0) {
  const outer = el("span", { className: "lbl " + cls, title: type });
  const inner = el("span", {}, text);
  inner.style.setProperty("--h", hue(type));
  inner.style.setProperty("--lvl", level);
  inner.style.setProperty("--indent", indent);
  inner.style.setProperty("--depth", depth);
  outer.append(stair(depth), inner);
  return outer;
}

// An object that covers whole lines (every character of each line it touches, lines in a row,
// empty lines between allowed) is drawn in the left margin instead of over the text:
// one line gets its label beside it, two or more get a bar with the label written up it.
function lineObjects(doc) {
  const touched = new Map(); // id -> {type, lines, whole}
  const empty = [];
  doc.forEach((para, offset, i) => {
    empty[i] = !para.content.size;
    const covered = new Map(); // id -> [mark, characters covered]
    para.forEach((n) => {
      for (const m of tagsOf(n.marks)) covered.set(m.attrs.id, [m, (covered.get(m.attrs.id)?.[1] || 0) + n.text.length]);
    });
    for (const [id, [m, count]] of covered) {
      const o = touched.get(id) || { type: m.attrs.type, lines: [], whole: true };
      o.whole &&= count === para.textContent.length;
      o.lines.push(i);
      touched.set(id, o);
    }
  });
  const result = new Map();
  for (const [id, o] of touched) {
    const inRow = o.lines.every((l, k) => k === 0 || empty.slice(o.lines[k - 1] + 1, l).every(Boolean));
    if (o.whole && inRow) result.set(id, { type: o.type, first: o.lines[0], last: o.lines.at(-1) });
  }
  return result;
}

const paint = new Plugin({
  props: {
    decorations(state) {
      const objects = collectObjects(state.doc);
      const inMargin = lineObjects(state.doc);
      const suggestions = findSuggestions(state.doc, objects);
      const depth = heights(state.doc);
      const tallest = []; // per line: the deepest label starting on it
      const decos = [];
      const suggestAt = new Set(suggestions.map((sg) => sg.from));
      const ends = new Map(); // object id -> where its current piece ends
      let prev = [];
      state.doc.descendants((node, pos) => {
        if (!node.isText) { prev = []; return; }
        const tags = tagsOf(node.marks).filter((m) => !inMargin.has(m.attrs.id)).sort((a, b) => objects.get(a.attrs.id).size - objects.get(b.attrs.id).size);
        if (tags.length) {
          const h = (m) => hue(m.attrs.type);
          const lines = tags.map((m, k) => k === 0
            ? `inset 0 -2px hsl(${h(m)} 60% 50%)`
            : `0 ${3 * k}px 0 hsl(${h(m)} 60% 55%)`);
          // two different smallest objects side by side: a thin bar where one ends and the next begins
          const inner = tags[0].attrs.id, prevInner = prev[0]?.attrs.id;
          const touching = prevInner && prevInner !== inner
            && !prev.some((m) => m.attrs.id === inner) && !tags.some((m) => m.attrs.id === prevInner);
          decos.push(Decoration.inline(pos, pos + node.nodeSize, {
            class: "seg" + (touching ? " touching" : ""),
            style: `--h:${h(tags[0])};--lines:${lines.join(",")}`,
          }));
          tags.forEach((m, k) => {
            const id = m.attrs.id;
            if (ends.get(id) !== pos) { // a piece of this object starts here
              const level = k + (suggestAt.has(pos) ? 1 : 0), d = depth.get(id);
              const line = state.doc.resolve(pos).index(0);
              tallest[line] = Math.max(tallest[line] ?? 0, d);
              decos.push(Decoration.widget(pos, () => label(leaf(m.attrs.type), m.attrs.type, level, "", 0, d), { side: -1, key: `l:${id}:${pos}:${level}:${d}` }));
            }
            ends.set(id, pos + node.nodeSize);
          });
        }
        prev = tags;
      });
      // Colours off: whole-line objects leave the margin and get a label above their first line,
      // placed by depth like every other label, plus one empty row and no stair, so it reads as
      // a heading for the line rather than a label for its first word:
      //   line
      //
      //     Ask Alice Smith
      state.doc.forEach((para, offset, i) => {
        for (const [id, o] of inMargin) {
          if (o.first !== i) continue;
          const d = depth.get(id);
          tallest[i] = Math.max(tallest[i] ?? 0, d + 1);
          decos.push(Decoration.widget(offset + 1, () => label(leaf(o.type), o.type, 0, "linelbl", 0, d), { side: -1, key: `ll:${id}:${offset}:${d}` }));
        }
        // the line spacing has room for two rows of labels; deeper stacks get more room above
        if ((tallest[i] ?? 0) > 1) decos.push(Decoration.node(offset, offset + para.nodeSize, { class: "tall", style: `--extra:${tallest[i] - 1}` }));
      });
      for (const sg of suggestions) {
        decos.push(Decoration.inline(sg.from, sg.to, {
          class: "suggest", style: `--sh:${hue(sg.type)}`, title: `Double-click to link to ${sg.type} object ${sg.id}`,
        }));
        decos.push(Decoration.widget(sg.from, () => label(leaf(sg.type) + "?", sg.type, 0, "maybe"), { side: -1, key: `s:${sg.id}:${sg.from}` }));
      }
      return DecorationSet.create(state.doc, decos);
    },
    handleDoubleClick(view, pos) {
      if (editorEl.classList.contains("plain")) return false; // overlay off: a double-click just selects
      const sg = findSuggestions(view.state.doc).find((sg) => sg.from <= pos && pos <= sg.to);
      if (!sg) return false;
      applySuggestion(sg);
      return true;
    },
  },
});

// --- UI ---

const pillBar = document.getElementById("pills");
const objectsEl = document.getElementById("objects");
const editorEl = document.getElementById("editor");

function el(tagName, props = {}, ...children) {
  const e = Object.assign(document.createElement(tagName), props);
  e.append(...children);
  return e;
}

const leafPrefix = (type) => parts(type).slice(0, -1).join(":") + ":";

function renderPills() {
  const activeTypes = view ? activeTags(view.state).map((m) => m.attrs.type) : [];
  const active = new Set(activeTypes);
  const within = new Set(activeTypes.flatMap(ancestors)); // an IP is also a Pass and an Obj
  pillBar.replaceChildren(...pills.map((type) => {
    const cls = active.has(type) ? " active" : within.has(type) ? " within" : "";
    const prefix = ancestors(type).length ? leafPrefix(type) : "";
    const b = el("button", { className: "pill" + cls, title: type }, el("small", {}, prefix), leaf(type));
    b.style.setProperty("--h", hue(type));
    b.onmousedown = (e) => e.preventDefault(); // keep the editor's selection
    b.onclick = () => clickPill(type);
    b.oncontextmenu = (e) => {
      e.preventDefault();
      if (confirm(`Remove the "${type}" pill? Text already tagged keeps its tag.`)) {
        pills = pills.filter((p) => p !== type);
        save("textform.types", pills);
        renderPills();
      }
    };
    return b;
  }));
  const clear = el("button", { className: "pill clear", title: "Remove all tags from the selection (Ctrl+Space)" }, "× clear");
  clear.onmousedown = (e) => e.preventDefault();
  clear.onclick = clearTag;
  pillBar.append(clear);
  const add = el("input", { placeholder: "+ new type, e.g. Obj:Pass:Port" });
  add.onkeydown = (e) => {
    const name = add.value.trim().replace(/\s*:\s*/g, ":");
    if (e.key === "Enter" && name && !pills.includes(name)) {
      addPill(name);
      renderPills();
      renderObjects(); // the add-object type list
      pillBar.querySelector("input").focus();
    }
  };
  pillBar.append(add);
}

function renderObjects() {
  const objects = collectObjects(view.state.doc);
  const suggestions = findSuggestions(view.state.doc, objects);
  const typeSel = el("select", {}, ...pills.map((p) => el("option", { value: p }, p)));
  const valueIn = el("input", { placeholder: "value, e.g. 10.0.0.7" });
  const addObject = () => {
    const value = valueIn.value.trim();
    if (!value) return;
    added.push({ id: newId(), type: typeSel.value, value });
    save("textform.objects", added);
    view.dispatch(view.state.tr); // redraw suggestions
  };
  valueIn.onkeydown = (e) => { if (e.key === "Enter") addObject(); }; // returning false here would swallow the key
  const form = el("div", { className: "addobj" }, typeSel, valueIn, el("button", { onclick: addObject }, "add object"));

  const rows = [...objects].map(([id, o]) => {
    const mine = suggestions.filter((sg) => sg.id === id);
    const typeChoice = el("select", { className: "otype", title: "Change to a more general or more specific type" },
      ...[...new Set([...pills, o.type])].sort().map((p) => el("option", { value: p, selected: p === o.type }, p)));
    typeChoice.onchange = () => retype(id, typeChoice.value);
    const row = el("div", { className: "obj" },
      typeChoice,
      el("span", { className: "otext" }, o.pieces.length ? o.pieces.join(" … ") : o.value),
      el("span", { className: "ocount" }, o.pieces.length ? "" : "not in text"),
    );
    if (mine.length) row.append(el("button", { className: "apply", onclick: () => mine.forEach(applySuggestion) }, `apply all (${mine.length})`));
    if (added.some((a) => a.id === id)) row.append(el("button", {
      className: "remove", title: "Forget this added object (tags in the text stay)",
      onclick: () => { added = added.filter((a) => a.id !== id); save("textform.objects", added); view.dispatch(view.state.tr); },
    }, "×"));
    row.append(el("span", { className: "oid" }, id));
    row.style.setProperty("--h", hue(o.type));
    return row;
  });
  objectsEl.replaceChildren(form, ...rows);
  if (!objects.size) objectsEl.append(el("div", { className: "hint" }, "No objects yet. Select some text and click a pill, or add one here."));
}

function renderCaret() {
  const active = activeTags(view.state);
  editorEl.style.caretColor = active.length ? `hsl(${hue(active[active.length - 1].attrs.type)} 80% 40%)` : "";
  document.getElementById("mode").textContent = active.length ? `typing into: ${active.map((m) => m.attrs.type).join(", ")}` : "";
}

// Typing shorthand: "Bob#First " tags Bob as First and drops "#First". It fires when the word
// ends: on a space, punctuation or Enter. The type can be a full path (Bob#Obj:Noun:First)
// or just its last part, if that names one existing type; an unknown name becomes a new type.
const TYPE_CHAR = /[\p{L}\p{N}_:]/u;
const SHORTHAND = /([^\s#]+)#([\p{L}\p{N}_:]+)$/u;

function resolveType(name) {
  if (pills.includes(name)) return name;
  const byLeaf = pills.filter((p) => leaf(p).toLowerCase() === name.toLowerCase());
  if (byLeaf.length) return byLeaf[0]; // several types share this last part: the first wins
  addPill(name);
  return name;
}

// Turn "value#Type" just before the cursor into a tagged value, then type `text` after it untagged.
function shorthand(view, text) {
  const { $from, empty } = view.state.selection;
  if (!empty) return false;
  const before = $from.parent.textBetween(0, $from.parentOffset);
  const m = before.match(SHORTHAND);
  if (!m) return false;
  const end = $from.pos;
  const hashAt = end - m[2].length - 1;
  const start = hashAt - m[1].length;
  const outside = view.state.doc.resolve(start).marks(); // e.g. a Record the word sits in
  const type = resolveType(m[2].replace(/^:+|:+$/g, ""));
  let tr = view.state.tr.delete(hashAt, end).addMark(start, hashAt, tag.create({ type, id: newId() }));
  if (text) tr = tr.insert(hashAt, schema.text(text, outside));
  tr = tr.setStoredMarks(outside);
  view.dispatch(tr);
  return true;
}

const typing = new Plugin({
  props: {
    handleTextInput: (view, from, to, text) => !TYPE_CHAR.test(text) && shorthand(view, text),
    handleKeyDown: (view, e) => {
      if (e.key === "Enter") shorthand(view, ""); // then let Enter split the line as usual
      return false;
    },
  },
});

// The margin is drawn after each update by measuring where the lines ended up.
// Multi-line objects stand in columns, the biggest furthest left; one-line labels sit next to the text.
const SINGLE_W = 84, COL_W = 22;
function renderMargin() {
  const lines = [...lineObjects(view.state.doc)].map(([id, o]) => ({ id, ...o }));
  const paras = [];
  view.state.doc.forEach((_, offset) => paras.push(view.nodeDOM(offset)));
  const singles = lines.filter((o) => o.first === o.last);
  const multis = lines.filter((o) => o.first !== o.last).sort((a, b) => (a.last - a.first) - (b.last - b.first));
  const placed = [];
  for (const o of multis) {
    o.col = 1 + Math.max(-1, ...placed.filter((p) => p.first >= o.first && p.last <= o.last).map((p) => p.col));
    placed.push(o);
  }
  const cols = multis.length ? 1 + Math.max(...multis.map((o) => o.col)) : 0;
  const singleW = singles.length ? SINGLE_W : 0;
  editorEl.style.setProperty("--margin", `${singleW + cols * COL_W}px`);
  const box = (o, top, height, left, width, cls) => {
    const b = el("div", { className: "mobj " + cls, title: o.type },
      el("span", { className: "mtext" }, leaf(o.type)), el("span", { className: "bar" }));
    Object.assign(b.style, { top: `${top}px`, height: `${height}px`, left: `${left}px`, width: `${width}px` });
    b.style.setProperty("--h", hue(o.type));
    return b;
  };
  marginEl.replaceChildren(
    ...singles.map((o) => box(o, paras[o.first].offsetTop, paras[o.first].offsetHeight, cols * COL_W, singleW - 6, "single")),
    ...multis.map((o) => {
      const a = paras[o.first], b = paras[o.last];
      return box(o, a.offsetTop, b.offsetTop + b.offsetHeight - a.offsetTop, (cols - 1 - o.col) * COL_W, COL_W - 4, "multi");
    }),
  );
}

const view = new EditorView(editorEl, {
  state: EditorState.create({
    doc,
    plugins: [paint, typing, history(), keymap({ "Mod-Space": () => (clearTag(), true), "Mod-z": undo, "Mod-y": redo, "Mod-Shift-z": redo }), keymap(baseKeymap)],
  }),
  dispatchTransaction(tr) {
    view.updateState(view.state.apply(tr));
    if (tr.docChanged) save("textform.doc", view.state.doc.toJSON());
    renderPills();
    renderObjects();
    renderCaret();
    renderMargin();
  },
});

document.getElementById("overlay").onchange = (e) => editorEl.classList.toggle("plain", !e.target.checked);
document.getElementById("labels").onchange = (e) => { editorEl.classList.toggle("labels", e.target.checked); renderMargin(); };
document.getElementById("colors").onchange = (e) => editorEl.classList.toggle("mono", !e.target.checked);
document.getElementById("reset").onclick = () => {
  if (confirm("Clear the text and start from the sample?")) { localStorage.removeItem("textform.doc"); location.reload(); }
};

const marginEl = el("div", { id: "margin" });
editorEl.append(marginEl);
window.addEventListener("resize", renderMargin);

renderPills();
renderObjects();
renderMargin();
view.focus();
