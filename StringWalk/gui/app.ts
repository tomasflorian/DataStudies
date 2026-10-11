// app.ts — the page: a client of the session, and nothing else.
//
// It holds a session and sends commands; server.ts runs them through the same
// step and view sw.ts runs, and this draws what comes back. So the page and the
// shell can differ in how a reading looks and never in what a reading is.
// Everything it knows about the pile arrives as the shapes in api.ts.
//
// THE SESSION LIVES IN THE URL. A reload keeps your place, a link reopens a
// reading, and the back button is undo: every change is a URL the browser
// already remembers.
//
// THE TAXONOMY IS THE PAGE'S OWN, and lives in the URL beside the session as
// `t=`. It decides which names you are shown — only its own, until "show
// everything" — and writes a name out as the group of kinds it stands for before
// anything is sent, so the session never holds a name only this page knows.
// taxonomy.ts is the same code the shell and read.ts use.
//
// WHAT THE PAGE DECIDES FOR ITSELF is only how things look: which offers are
// open, what the filter hides, which command you typed last. None of it changes
// a reading.

import type { Command, Message, OfferItem, Session, StepReply, View } from "../api.ts";
import {
  abbreviate, expand, groupsOf, kindsOf, readTaxonomy, spell, topOf, type Taxonomy,
} from "../taxonomy.ts";

const EMPTY: Session = { query: "", focus: "" };

// --- a little DOM ---------------------------------------------------------

type Child = Node | string | null | undefined | false;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { class?: string; title?: string; onclick?: (e: MouseEvent) => void } = {},
  ...kids: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.title) el.title = props.title;
  if (props.onclick) el.onclick = props.onclick;
  for (const kid of kids) if (kid !== null && kid !== undefined && kid !== false) el.append(kid);
  return el;
}

const byId = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

// --- state ----------------------------------------------------------------

let session: Session = fromUrl();
let current: View | null = null;
let lastCommand: Command | null = null;
let note: { text: string; trouble: boolean } | null = null;

let taxonomy: Taxonomy | null = null;
let taxonomies: string[] = [];
let showAll = false;

type SortDirection = "asc" | "desc";
let tableSort: { column: string; direction: SortDirection } | null = null;

const open = new Set<string>();                    // offers showing their ways
const typed: string[] = [];                         // the command line's history
let recall = 0;

function fromUrl(): Session {
  const p = new URLSearchParams(location.search);
  return { query: p.get("q") ?? "", focus: p.get("focus") ?? "" };
}

function urlOf(s: Session): string {
  const p = new URLSearchParams();
  if (taxonomy) p.set("t", taxonomy.name);
  if (s.query) p.set("q", s.query);
  if (s.focus) p.set("focus", s.focus);
  const search = p.toString();
  return location.pathname + (search ? `?${search}` : "");
}

// A name the taxonomy holds something under, written out as its group.
const spelled = (text: string): string => taxonomy ? expand(taxonomy, text) : text;

// --- talking to the server ------------------------------------------------

// ONE REQUEST SHAPE FOR EVERYTHING: the session, a command or nothing, and the
// taxonomy's groups so the view can count them.
async function send(command: Command | null, history: "push" | "replace" | "none" = "push"): Promise<void> {
  let reply: Response;
  try {
    reply = await fetch("/step", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session, command, groups: taxonomy ? groupsOf(taxonomy) : {} }),
    });
  } catch {
    note = { text: "the server is not answering · is ./server.ts running?", trouble: true };
    renderMessage();
    return;
  }

  const body = await reply.json() as StepReply | { message: Message };
  if (!reply.ok || !("view" in body)) {
    note = { text: "message" in body ? body.message.text : `the server said ${reply.status}`, trouble: true };
    renderMessage();
    return;
  }

  const moved = body.session.query !== session.query || body.session.focus !== session.focus;
  session = body.session;
  current = body.view;
  lastCommand = command;
  note = null;
  if (history === "replace") window.history.replaceState(session, "", urlOf(session));
  else if (history === "push" && moved) window.history.pushState(session, "", urlOf(session));
  render();
}

// A TAXONOMY IS A FILE THE SERVER HANDS OUT, read here by taxonomy.ts. Changing
// it changes what is shown and nothing about the reading, so it replaces the URL
// rather than adding a step the back button would undo.
async function useTaxonomy(name: string | null, history: "replace" | "none" = "replace"): Promise<void> {
  if (!name) {
    taxonomy = null;
  } else {
    try {
      const reply = await fetch(`/taxonomies/${encodeURIComponent(name)}.pile`);
      if (!reply.ok) throw new Error(`there is no taxonomy named ${name}` +
        (taxonomies.length ? ` · there is ${taxonomies.join(", ")}` : ""));
      taxonomy = readTaxonomy(name, await reply.text());
    } catch (e) {
      note = { text: (e as Error).message, trouble: true };
      renderMessage();
      renderPicker();
      return;
    }
  }
  open.clear();
  if (history === "replace") window.history.replaceState(session, "", urlOf(session));
  await send(null, "none");
}

// --- drawing --------------------------------------------------------------

function render(): void {
  if (!current) return;
  renderPile(current);
  renderPicker();
  renderMessage();
  renderQuery(current);
  renderTree(current);
  renderTaxonomy(current);
  renderOffers(current);
  renderTable(current);
}

function renderPile(v: View): void {
  const p = v.pile;
  byId("pile").textContent =
    `${p.lines} lines · ${p.values} values · ${p.relations} relations · ${p.phrases} phrases · ${p.kinds} kinds`;
}

function renderPicker(): void {
  const select = byId<HTMLSelectElement>("taxonomy");
  select.replaceChildren(h("option", {}, "none"), ...taxonomies.map(name => h("option", {}, name)));
  (select.options[0] as HTMLOptionElement).value = "";
  select.value = taxonomy?.name ?? "";
}

function renderMessage(): void {
  const box = byId("message");
  const m = current?.message ?? null;
  box.replaceChildren();
  box.className = "message";

  if (note) {
    box.hidden = false;
    if (!note.trouble) box.classList.add("note");
    box.append(note.text);
    return;
  }
  if (!m) { box.hidden = true; return; }

  box.hidden = false;
  box.append(m.in === "query" ? `this reading does not work · ${m.text}` : m.text);
  if (m.suggest.length)
    box.append(h("div", { class: "suggest" }, ...m.suggest.map(s => h("button", {
      title: "try this instead",
      onclick: () => void (m.in === "query" ? mend(m, s) : retry(m, s)),
    }, s))));
}

// A READING THAT STOPPED WORKING is mended the same way a command is retried: the
// piece of the query the message points at, replaced, and the whole query asked
// for again. A step ends where the syntax does, and a group ends at its brace.
function mend(m: Message, suggestion: string): Promise<void> {
  const query = current?.query ?? session.query;
  if (m.at === null) return send({ query: spelled(suggestion) });
  let end = m.at;
  let depth = 0;
  while (end < query.length) {
    const c = query[end]!;
    if (c === "{") depth++;
    if (c === "}") depth--;
    if (depth <= 0 && "/,()*~".includes(c)) break;
    end++;
  }
  const piece = query.slice(m.at, end);
  const tail = piece.length - piece.trimEnd().length;
  const word = suggestion.endsWith("*") && query[end] === "*" ? suggestion.slice(0, -1) : suggestion;
  return send({ query: query.slice(0, m.at) + word + query.slice(end - tail) });
}

// A SUGGESTION IS THE LAST COMMAND WITH ONE PIECE REPLACED — the piece the
// message points at — so a chain that failed halfway is tried again whole.
function retry(m: Message, suggestion: string): Promise<void> {
  const last = lastCommand;
  const key = last && "add" in last ? "add" : last && "cd" in last ? "cd" : last && "shorten" in last ? "shorten" : null;
  const text = last && key ? (last as Record<string, string | null>)[key] ?? "" : "";
  if (!key || m.at === null) return send({ add: suggestion });
  let end = text.indexOf("/", m.at);
  if (end < 0) end = text.length;
  const again = text.slice(0, m.at) + suggestion + text.slice(end);
  return send(key === "add" ? { add: again } : key === "cd" ? { cd: again } : { shorten: again });
}

// The query as the reader thinks of it: groups the taxonomy would have written,
// back to their names.
const shortQuery = (v: View): string => taxonomy ? abbreviate(taxonomy, v.query) : v.query;

function renderQuery(v: View): void {
  const q = byId("query");
  q.textContent = v.columns.length ? shortQuery(v) : "nothing named yet";
  q.title = v.columns.length && shortQuery(v) !== v.query ? v.query : "";
  byId<HTMLButtonElement>("reset").disabled = !v.columns.length;
}

function renderTree(v: View): void {
  const tree = byId("tree");
  tree.replaceChildren(
    h("li", { class: v.focus === null ? "focus" : "", title: "the pile · adding here starts a reading",
      onclick: () => void send({ cd: "/" }) }, "/ the pile"),
  );
  const depth = new Map<string, number>();
  for (const c of v.columns) {
    const d = c.parent === null ? 0 : (depth.get(c.parent) ?? 0) + 1;
    depth.set(c.id, d);
    const li = h("li", {
      class: c.id === v.focus ? "focus" : "",
      title: c.header + (c.missing ? ` · not in this pile: ${c.missing.join(", ")}` : ""),
      onclick: () => void send({ cd: `/${c.path}` }),
    },
      c.label, c.short && h("span", { class: "tag" }, "short"));
    li.style.paddingLeft = `${d + 1.4}em`;
    tree.append(li);
  }
}

// THE TAXONOMY AS A TREE, counted from the focus. A kind this pile has no lines
// for is struck through: it stays in its group, and nothing here has one yet.
function renderTaxonomy(v: View): void {
  const box = byId<HTMLDetailsElement>("taxonomytree");
  box.hidden = !taxonomy;
  if (!taxonomy) return;
  const t = taxonomy;
  const counts = new Map(v.offers.groups.map(g => [g.name, g]));
  const missing = new Set(counts.get(t.root)?.missing ?? []);
  const kinds = kindsOf(t).size;

  byId("taxonomyname").textContent = `taxonomy ${t.name} · ${kinds - missing.size}/${kinds} of its kinds in this pile`;
  const node = (name: string): HTMLLIElement => {
    const kids = t.children.get(name) ?? [];
    const inner = kids.filter(k => t.children.has(k));
    const leaves = kids.filter(k => !t.children.has(k));
    const g = counts.get(name);
    return h("li", {},
      h("span", {}, name),
      h("span", { class: "count" }, `${g?.have ?? 0} · ${g?.kinds.length ?? 0} kinds from here`),
      (inner.length > 0 || leaves.length > 0) && h("ul", {},
        ...inner.map(node),
        leaves.length > 0 && h("li", { class: "leaves" },
          ...leaves.map(k => h("span", missing.has(k) ? { class: "missing", title: "no lines of this kind" } : {}, k)))));
  };
  byId("taxonomybody").replaceChildren(h("ul", {}, node(t.root)));
}

function renderOffers(v: View): void {
  const focused = v.columns.find(c => c.id === v.focus);
  byId("here").textContent = focused
    ? `from ${focused.header}`
    : v.columns.length ? "from the pile · adding one starts again" : "from the pile · adding one starts a reading";

  const count = (have: number) => focused ? `${have}/${v.offers.of}` : String(have);
  const wanted = byId<HTMLInputElement>("filter").value.trim().toLowerCase();
  const matches = (i: OfferItem) => !wanted ||
    i.name.toLowerCase().includes(wanted) || i.narrower.some(n => n.name.toLowerCase().includes(wanted));

  byId<HTMLLabelElement>("showall").closest("label")!.hidden = !taxonomy;
  byId<HTMLInputElement>("showall").checked = showAll;
  const list = byId("offers");
  const outside = byId("outside");
  list.replaceChildren();
  outside.textContent = "";

  if (taxonomy && !showAll) {
    // WITH A TAXONOMY, ONLY ITS NAMES: the top of it, in the order its author
    // wrote them. Anything else is not listed at all, only counted.
    const t = taxonomy;
    for (const name of topOf(t)) {
      const row = nameRow(t, name, v, count, matches, wanted);
      if (row) list.append(row);
    }
    const known = kindsOf(t);
    const hidden = v.offers.items.filter(i => !known.has(i.name)).length;
    if (hidden) outside.textContent = `${hidden} kind(s) outside ${t.name} · show everything lists them`;
  } else {
    for (const i of v.offers.items.filter(matches)) list.append(offerRow(i, count));
  }

  if (!list.childElementCount)
    list.append(h("li", { class: "empty" },
      wanted ? "nothing matches the filter"
        : taxonomy && !showAll && v.offers.items.length ? `nothing in ${taxonomy.name} from here`
        : "nothing can be added here"));
}

// A NAME THE TAXONOMY HOLDS SOMETHING UNDER opens to show all of it — one column
// that merges every kind under it — and then what hangs off it. A kind it names
// directly is the kind's own row.
function nameRow(t: Taxonomy, name: string, v: View, count: (have: number) => string,
  matches: (i: OfferItem) => boolean, wanted: string): HTMLLIElement | null {
  const kids = t.children.get(name);
  if (!kids) {
    const i = v.offers.items.find(x => x.name === name);
    return i && matches(i) ? offerRow(i, count) : null;
  }

  const g = v.offers.groups.find(x => x.name === name);
  if (!g || g.have === 0) return null;
  const inside = kids.map(k => nameRow(t, k, v, count, matches, wanted)).filter((r): r is HTMLLIElement => r !== null);
  if (wanted && !name.toLowerCase().includes(wanted) && !inside.length) return null;

  const key = `${session.focus}|${name}`;
  const showing = open.has(key) || (wanted !== "" && inside.length > 0);
  const members = groupsOf(t)[name] ?? [];
  const mark = `${g.kinds.length} kind(s)` + (g.ways > 1 ? ` · ${g.ways} ways` : "");

  const row = h("li", {}, h("button", {
    class: "offer",
    title: "open to choose all of it, or one of what is under it",
    onclick: () => {
      if (showing) open.delete(key); else open.add(key);
      render();
    },
  },
    h("span", { class: "name" }, name),
    h("span", { class: "count" }, count(g.have)),
    h("span", { class: "mark" }, `${showing ? "▾" : "▸"} ${mark}`)));

  if (showing) {
    const all = spell(name, members) + (g.ways > 1 ? "*" : "");
    row.append(h("ul", {},
      h("li", {}, h("button", {
        class: "offer",
        title: `one column merging ${g.kinds.join(", ")}` + (g.missing.length ? ` · not in this pile: ${g.missing.join(", ")}` : ""),
        onclick: () => void send({ add: all }),
      },
        h("span", { class: "name" }, g.ways > 1 ? `${name}*` : name),
        h("span", { class: "count" }, count(g.have)),
        h("span", { class: "mark" }, "all of it, one column"))),
      ...inside));
  }
  return row;
}

// A NAME WITH ONE WAY IN IS ADDED ON A CLICK. A name with more than one opens to
// show them: all of them, which sends it with a *, or one of them. The terminal
// writes the * because you typed it; the page writes it because you chose all.
function offerRow(i: OfferItem, count: (have: number) => string): HTMLLIElement {
  const choice = i.ways > 1;
  const key = `${session.focus}|${i.name}`;
  const showing = open.has(key);
  const mark = choice ? `${i.ways} ways` : "";

  const row = h("li", {}, h("button", {
    class: "offer",
    title: choice ? "more than one way in · open to choose" : "add this step",
    onclick: () => {
      if (!choice) { void send({ add: i.name }); return; }
      if (showing) open.delete(key); else open.add(key);
      render();
    },
  },
    h("span", { class: "name" }, i.name),
    h("span", { class: "count" }, count(i.have)),
    mark && h("span", { class: "mark" }, `${showing ? "▾" : "▸"} ${mark}`)));

  if (choice && showing) {
    row.append(h("ul", {},
      h("li", {}, h("button", { class: "offer", title: "every way in, merged", onclick: () => void send({ add: `${i.name}*` }) },
        h("span", { class: "name" }, `${i.name}*`), h("span", { class: "count" }, count(i.have)),
        h("span", { class: "mark" }, "all of them"))),
      ...i.narrower.map(n => h("li", {}, h("button", {
        class: "offer",
        onclick: () => void send({ add: n.ways > 1 ? `${n.name}*` : n.name }),
      },
        h("span", { class: "name" }, n.ways > 1 ? `${n.name}*` : n.name),
        h("span", { class: "count" }, count(n.have)),
        n.ways > 1 && h("span", { class: "mark" }, `${n.ways} ways`))))));
  }
  return row;
}

// SHOW A VALUE WHOLE. A cell holding a document is merely tall here. A hole is
// `?`; a shortened column holds stubs, and the value they stand for never
// reached the page.
function renderTable(v: View): void {
  const table = byId<HTMLTableElement>("table");
  table.replaceChildren();
  const rowCount = byId("rows");
  const filter = byId<HTMLInputElement>("tablefilter");
  filter.disabled = !v.columns.length;
  rowCount.textContent = v.columns.length ? `${v.rows.length} row(s)` : "";
  if (!v.columns.length) { table.append(h("caption", {}, "nothing named yet · add a kind to start")); return; }

  if (tableSort && !v.columns.some(c => c.id === tableSort?.column)) tableSort = null;
  const sortMark = (id: string): string =>
    tableSort?.column === id ? (tableSort.direction === "asc" ? " ▲" : " ▼") : "";

  table.append(h("thead", {}, h("tr", {}, ...v.columns.map(c => h("th", {
    class: c.id === v.focus ? "focus" : "",
  },
    h("button", {
      class: "sort",
      title: "sort ascending, descending, then restore original order",
      onclick: () => {
        tableSort = tableSort?.column !== c.id ? { column: c.id, direction: "asc" }
          : tableSort.direction === "asc" ? { column: c.id, direction: "desc" }
          : null;
        renderTable(v);
      },
    }, c.header + sortMark(c.id)),
    h("button", {
      class: "shorten",
      title: c.short ? "read this column whole" : "shorten this column",
      onclick: () => void send({ shorten: `/${c.path}` }),
    }, c.short ? "whole" : "short"),
  )))));

  const wanted = filter.value.toLocaleLowerCase();
  const rows = v.rows.map((row, original) => ({ row, original }))
    .filter(({ row }) => !wanted || row.some(cell => cell !== null && cell.toLocaleLowerCase().includes(wanted)));

  if (tableSort) {
    const column = v.columns.findIndex(c => c.id === tableSort?.column);
    const direction = tableSort.direction === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      const av = a.row[column];
      const bv = b.row[column];
      if (av === bv) return a.original - b.original;
      if (av === null) return 1;
      if (bv === null) return -1;
      return direction * av.localeCompare(bv, undefined, { numeric: true, sensitivity: "base" });
    });
  }

  rowCount.textContent = wanted ? `${rows.length}/${v.rows.length} row(s)` : `${v.rows.length} row(s)`;

  const body = h("tbody");
  for (const { row } of rows)
    body.append(h("tr", {}, ...row.map((cell, i) => cell === null
      ? h("td", { class: "hole", title: "a hole: the step found nothing from this row" }, "?")
      : h("td", { class: v.columns[i]?.short ? "stub" : "" }, cell))));
  table.append(body);
}

// --- the command line -----------------------------------------------------

const readCommand = (v: View): string => {
  const short = shortQuery(v);
  return taxonomy && short !== v.query ? `./read.ts --taxonomy ${taxonomy.name} '${short}'` : `./read.ts '${v.query}'`;
};

// THE SHELL'S COMMANDS, so what works in sw.ts works here. A bare name is an add.
// `taxonomy` is the page's own and never reaches the server.
function commandOf(line: string): Command | string | (() => Promise<void>) | null {
  const text = line.trim();
  if (!text) return null;
  const [cmd = ""] = text.split(/\s+/);
  const arg = text.slice(cmd.length).trim();
  switch (cmd) {
    case "add": return arg === "--all" ? () => { showAll = true; render(); return Promise.resolve(); }
      : arg ? { add: spelled(arg) } : "add names a step · or pick one from the list";
    case "cd": case "focus": return arg ? { cd: arg } : `the cursor is at /${session.focus}`;
    case "shorten": return { shorten: arg || null };
    case "taxonomy":
      if (!arg) return taxonomy ? `taxonomy ${taxonomy.name} · taxonomy off, or taxonomy <name>`
        : `no taxonomy · there is ${taxonomies.join(", ") || "none"}`;
      return () => useTaxonomy(arg === "off" || arg === "none" ? null : arg);
    case "query": return arg ? { query: spelled(arg) } : current?.columns.length ? readCommand(current) : "nothing named yet";
    case "help": case "?":
      return "add <kind> · add <kind>* · add a/b · add ../x · add --all · cd <path> · cd / · shorten [path] · taxonomy <name> · taxonomy off · query <text>";
    default: return { add: spelled(text) };
  }
}

byId<HTMLFormElement>("line").addEventListener("submit", e => {
  e.preventDefault();
  const input = byId<HTMLInputElement>("command");
  const line = input.value;
  if (line.trim()) { typed.push(line); recall = typed.length; }
  input.value = "";
  const got = commandOf(line);
  if (got === null) return;
  if (typeof got === "string") { note = { text: got, trouble: false }; renderMessage(); return; }
  if (typeof got === "function") { void got(); return; }
  void send(got);
});

byId<HTMLInputElement>("command").addEventListener("keydown", e => {
  const input = e.currentTarget as HTMLInputElement;
  if (e.key === "ArrowUp" && recall > 0) { input.value = typed[--recall] ?? ""; e.preventDefault(); }
  if (e.key === "ArrowDown" && recall < typed.length) { input.value = typed[++recall] ?? ""; e.preventDefault(); }
});

byId<HTMLInputElement>("filter").addEventListener("input", () => { if (current) renderOffers(current); });
byId<HTMLInputElement>("tablefilter").addEventListener("input", () => { if (current) renderTable(current); });

byId<HTMLSelectElement>("taxonomy").addEventListener("change", e => {
  const value = (e.currentTarget as HTMLSelectElement).value;
  void useTaxonomy(value === "" ? null : value);
});

byId<HTMLInputElement>("showall").addEventListener("change", e => {
  showAll = (e.currentTarget as HTMLInputElement).checked;
  if (current) renderOffers(current);
});

async function copy(text: string, what: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    note = { text: `copied ${what}`, trouble: false };
  } catch {
    note = { text: `could not copy · ${text}`, trouble: true };
  }
  renderMessage();
}

// START OVER is one more command, not a page reload: the reading goes back to
// nothing, the taxonomy stays, and the URL it leaves behind is what the back
// button returns to.
byId("reset").addEventListener("click", () => {
  if (!current?.columns.length) return;
  open.clear();
  void send({ query: "" });
});

byId("copyquery").addEventListener("click", () => {
  if (current?.columns.length) void copy(current.query, "the query");
});
byId("copyread").addEventListener("click", () => {
  if (current?.columns.length) void copy(readCommand(current), "the ./read.ts command");
});

window.addEventListener("popstate", e => {
  session = (e.state as Session | null) ?? fromUrl();
  const t = new URLSearchParams(location.search).get("t");
  if (t !== (taxonomy?.name ?? null)) void useTaxonomy(t, "none");
  else void send(null, "none");
});

// --- start ----------------------------------------------------------------

async function start(): Promise<void> {
  try {
    const reply = await fetch("/taxonomies/");
    if (reply.ok) taxonomies = (await reply.json() as { taxonomies: string[] }).taxonomies;
  } catch { /* send() says the server is not answering */ }
  byId("boot").remove();
  if (!session.query && !session.focus) session = EMPTY;
  const t = new URLSearchParams(location.search).get("t");
  if (t) {
    await useTaxonomy(t, "none");
    window.history.replaceState(session, "", urlOf(session));
  } else {
    await send(null, "replace");
  }
}

void start();
