// The reading as a table: the chain of columns, the rows, and — under a clicked cell — the
// file lines it was read from.

import { $, actions, finding, post, state, urlFor, word } from "./state.js";
import { h, marked, short } from "./util.js";

// Removing a column removes everything that stepped from it.
function remove(col) {
  const { session } = state;
  const gone = new Set([col]);
  session.steps.forEach((s, i) => { if (gone.has(s.parent)) gone.add(i + 1); });
  const keep = session.steps.map((s, i) => [s, i + 1]).filter(([, c]) => !gone.has(c));
  const renumber = new Map([[0, 0], ...keep.map(([, c], i) => [c, i + 1])]);
  const steps = keep.map(([s]) => ({ ...s, parent: renumber.get(s.parent) }));
  actions.go({ ...session, steps, focus: Math.min(renumber.get(session.focus) ?? steps.length, steps.length) });
}

function focus(col) {
  state.session = { ...state.session, focus: col };
  history.replaceState(null, "", urlFor(state.session));
  actions.load();
}

const startValue = (value) => actions.go({ ...state.session, start: { value }, steps: [], focus: 0 });

export function renderChain() {
  const { view } = state;
  $("chain").replaceChildren(...view.columns.map((c, i) => h("span", {
    class: "pill" + (i === view.focus ? " focus" : ""),
    title: i ? "column " + (i + 1) + ", stepping from column " + (c.parent + 1) : "where the reading starts",
    onclick: () => focus(i),
  }, (i ? "" : "◆ ") + short(word(c.label), 40), i ? h("span", { class: "x", title: "remove", onclick: (e) => { e.stopPropagation(); remove(i); } }, "×") : null)));
}

const same = (a, b) => (a === null && b === null) || (a && b && a.v === b.v && a.rels.join() === b.rels.join());

export function renderTable() {
  const { view } = state;
  const wrap = $("table");
  if (!view.columns.length) {
    wrap.replaceChildren(h("div", { class: "empty" }, "Start from a kind on the left — whole and part are always there. Type in the box above to keep only the kinds that hold a string."));
    $("note").textContent = "";
    return;
  }
  const holes = view.rows.filter((r) => r.some((c) => c === null)).length;
  $("note").textContent = view.rows.length + " rows" + (holes ? " · " + holes + " with a hole" : "") + (view.truncated ? " · cut at 2000" : "");
  const head = h("tr", {}, view.columns.map((c, i) => h("th", { class: i === view.focus ? "focus" : "", onclick: () => focus(i) },
    h("span", { title: c.label }, short(word(c.label), 40)), i && c.parent !== i - 1 ? h("span", { class: "from" }, "from " + (c.parent + 1)) : null)));
  const body = view.rows.map((row, r) => h("tr", {}, row.map((cell, col) => {
    const repeat = r > 0 && view.rows[r - 1].slice(0, col + 1).every((p, j) => same(p, row[j]));
    const isSelected = state.selected && state.selected.row === r && state.selected.col === col;
    return h("td", {
      class: (cell ? "" : "hole") + (repeat ? " repeat" : "") + (isSelected ? " selected" : ""),
      "data-r": r, "data-c": col,
      title: cell ? cell.text : "a hole: nothing found from the cell it steps from",
      onclick: () => {
        if (!cell) return;
        state.selected = isSelectedNow(r, col) ? null : { row: r, col };
        renderMarks();
        showPath();
      },
      ondblclick: () => cell && startValue(cell.v),
      onmouseenter: () => markPivot(r, col, true), onmouseleave: () => markPivot(r, col, false),
    }, h("div", { class: "t" }, cell ? (col === 0 ? marked(cell.text, finding()) : cell.text) : "?"),
      cell && cell.kinds.length ? h("div", { class: "kinds" }, cell.kinds.map(word).join(", ")) : null);
  })));
  wrap.replaceChildren(h("div", { class: "tablewrap" }, h("table", {}, h("thead", {}, head), h("tbody", {}, body))));
}

const isSelectedNow = (r, col) => state.selected && state.selected.row === r && state.selected.col === col;

function renderMarks() {
  document.querySelectorAll("td.selected").forEach((td) => td.classList.remove("selected"));
  if (state.selected) document.querySelector('td[data-r="' + state.selected.row + '"][data-c="' + state.selected.col + '"]')?.classList.add("selected");
}

// The join pivots on the cell it stepped from: hovering a cell lights it up.
function markPivot(r, col, on) {
  const parent = state.view.columns[col]?.parent;
  if (parent === undefined || parent < 0) return;
  document.querySelector('td[data-r="' + r + '"][data-c="' + parent + '"]')?.classList.toggle("pivot", on);
}

// Under the clicked row: the file lines this reading went through to reach the cell, and
// every place the value appears — the ones this reading used first, the rest after. With
// no file names loaded, there are none to show.
async function showPath() {
  document.querySelectorAll("tr.pathrow").forEach((tr) => tr.remove());
  if (!state.selected) return;
  const { view } = state;
  const { row: r, col } = state.selected;
  const row = view.rows[r];
  const chain = [];
  for (let c = col; c > 0; c = view.columns[c].parent) chain.unshift(c);
  const td = h("td", { colspan: view.columns.length }, h("div", { class: "note" }, "looking…"));
  document.querySelector('td[data-r="' + r + '"]')?.parentElement.after(h("tr", { class: "pathrow" }, td));
  const steps = chain.map((c) => ({ from: row[view.columns[c].parent].v, rels: row[c].rels }));
  const found = await post("/api/path", { steps, value: row[col].v });
  const read = [...new Set(found.steps.flatMap((st) => st.ways.flat().map((hop) => hop.at)).filter(Boolean))];
  const used = found.appears.filter((at) => read.includes(at));
  const also = found.appears.filter((at) => !read.includes(at));
  td.replaceChildren(h("div", { class: "path" },
    h("div", { class: "line" }, h("span", { class: "lead" }, "this row read"),
      h("span", {}, read.length ? read.join(", ") : chain.length ? "nothing from a named file" : "nothing — it is where the reading starts")),
    found.appears.length ? h("div", { class: "line" }, h("span", { class: "lead" }, short(row[col].text, 40) + " appears in"),
      h("span", {}, used.length ? h("b", {}, used.join(", ")) : null,
        also.length ? h("span", { class: "also" }, (used.length ? " · also " : "") + also.join(", ")) : null)) : null));
}
