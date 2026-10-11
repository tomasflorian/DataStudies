// The left pane: before a reading, where it can start; during one, what the focused column
// can reach.

import { $, actions, finding, state, structural, tagsOn, threshold, word } from "./state.js";
import { h, short } from "./util.js";

const go = (next) => actions.go(next);
const startKind = (kind) => go({ ...state.session, start: { kind }, steps: [], focus: 0 });

// A switch on shows every kind carrying it; off hides them, unless another switch of theirs
// is on. The reading stays; back undoes it.
function toggleTag(tag) {
  const on = tagsOn();
  on.has(tag) ? on.delete(tag) : on.add(tag);
  go({ ...state.session, tags: state.tagInfo.map((t) => t.tag).filter((t) => on.has(t)) });
}
const switchChips = () => h("div", { class: "chips" }, state.tagInfo.map((t) =>
  h("span", { class: "chip" + (tagsOn().has(t.tag) ? " on" : ""), title: t.count + " strings · click to switch", onclick: () => toggleTag(t.tag) }, "#" + word(t.tag))));

// How a nesting is known: seen in the pile, said by a tuning file, or both.
const how = (parent) => [parent.seen ? "seen" : "", parent.said.length ? "said" : ""].filter(Boolean).join(" + ");
// How many of a kind's strings match the search, of how many — or just how many.
const counted = (k) => (finding() ? k.count + "/" + k.of : String(k.count));

// The lattice, as the kinds list shows it. Every whole and every part come first; a noun
// nests under the nouns it sits inside — seen in the pile, said by a tuning file, or both —
// and appears under each of them. Each row's bar is how many strings it reaches, on a log
// scale: its height.
function kindsList(kinds) {
  const nouns = kinds.filter((k) => !k.tag);
  const widest = Math.log(1 + Math.max(1, ...nouns.map((k) => k.count)));
  const item = (k, depth, via) => h("li", {
    class: structural(k.kind) ? "structural" : "", onclick: () => startKind(k.kind),
    title: word(k.kind) + (via ? " — under " + via.kind + ": " + how(via) + (via.said.length ? " (by " + via.said.join(", ") + ")" : "") : ""),
    style: "padding-left:" + (8 + depth * 18) + "px;background:linear-gradient(90deg,var(--accent-soft) " +
      100 * Math.log(1 + k.count) / widest + "%,transparent 0)",
  }, h("span", { class: "lbl" }, word(k.kind)),
    via ? h("span", { class: "k" }, how(via)) : null,
    k.equals && k.equals.length ? h("span", { class: "k" }, "= " + k.equals.map(word).join(", ")) : null,
    h("span", { class: "n" }, counted(k)));
  const first = nouns.filter((k) => structural(k.kind));
  const rest = nouns.filter((k) => !structural(k.kind));
  const byKind = new Map(rest.map((k) => [k.kind, k]));
  const children = new Map();
  for (const k of rest) for (const parent of k.parents) if (byKind.has(parent.kind)) children.set(parent.kind, [...(children.get(parent.kind) || []), [k, parent]]);
  const under = (k, depth, via, path) => [item(k, depth, via),
    ...(children.get(k.kind) || []).filter(([kid]) => !path.has(kid.kind)).flatMap(([kid, parent]) => under(kid, depth + 1, parent, new Set([...path, kid.kind])))];
  const top = rest.filter((k) => !k.parents.some((parent) => byKind.has(parent.kind)));
  return [...first.map((k) => item(k, 0)), first.length && top.length ? h("li", { class: "sep" }) : null,
    ...top.flatMap((k) => under(k, 0, null, new Set([k.kind])))];
}

function renderStart(box) {
  const tags = state.kinds.filter((k) => k.tag);
  const box2 = h("input", { type: "number", min: "1", value: String(threshold()), class: "threshold", title: "how many strings a noun needs before the pile's own evidence may nest it" });
  box2.onchange = () => go({ ...state.session, threshold: Math.max(1, Number(box2.value) || 2) });
  box.append(h("h2", {}, "kinds · every string called that"),
    h("div", { class: "note" }, "nest by the pile's evidence from ", box2, " strings up"),
    h("ul", { class: "list" }, kindsList(state.kinds)));
  if (tags.length) box.append(h("h2", {}, "tags · every string carrying one"), h("ul", { class: "list" }, tags.map((k) =>
    h("li", { class: "tag", title: k.kind, onclick: () => startKind(k.kind) }, h("span", { class: "lbl" }, word(k.kind)), h("span", { class: "n" }, counted(k))))));
  if (!state.kinds.length) box.append(h("p", { class: "note" }, "no string holds that."));
}

// The word a step lands on: "ip" for ip, "ip in hosts-entry", "route(hop)".
const landsOn = (label) => label.split(" in ")[0].replace(/\(.*\)$/, "");

// A word already chosen in this reading — where it started, or any step since — is not
// offered again. A tag can be taken again, and so can "part" and "whole": they are not
// words, only the way in or out, and an unnamed walk climbs by taking them again.
function unchosen(o) {
  if (o.tag || o.step.label === "part" || o.step.label === "whole") return true;
  const chosen = new Set([state.session.start?.kind, ...state.session.steps.map((s) => s.label)].filter(Boolean).map(landsOn));
  return !chosen.has(landsOn(o.step.label));
}

// A step is one link. A shortcut across a whole ("host in zone-record") is two: up to the
// whole, then down from it — both become columns, so the step in between stays visible.
function add(step) {
  const cut = step.label.lastIndexOf(" in ");
  const taken = cut < 0 ? [step] : [
    { parent: step.parent, label: step.label.slice(cut + 4) },
    { parent: state.session.steps.length + 1, label: step.label.slice(0, cut) },
  ];
  const steps = [...state.session.steps, ...taken];
  go({ ...state.session, steps, focus: steps.length });
}

// Offers as plain words, then the tag steps: "#IT" takes anything tagged IT. Each step's bar
// is how much of the column can take it: its height from here. Steps that are nouns nest
// the way the kinds list does and come first; verbs, roles and switches follow, flat.
function offerList(offers) {
  const lattice = new Map(state.kinds.filter((k) => !k.tag && !structural(k.kind)).map((k) => [k.kind, k]));
  const item = (o, depth, via) => h("li", {
    class: o.tag ? "tag" : "", onclick: () => add(o.step),
    title: o.step.label + " — " + o.count + " of " + o.of + " cells" + (via ? "; under " + via.kind + ": " + how(via) : ""),
    style: "padding-left:" + (8 + depth * 18) + "px;background:linear-gradient(90deg,var(--accent-soft) " + (100 * o.count / Math.max(1, o.of)) + "%,transparent 0)",
  },
    h("span", { class: "lbl" }, word(o.step.label)),
    via ? h("span", { class: "k" }, how(via)) : o.kinds.length && !o.tag ? h("span", { class: "k" }, o.kinds.map(word).join(", ")) : null,
    h("span", { class: "n" }, o.count + "/" + o.of));
  const nouns = offers.filter((o) => !o.tag && lattice.has(o.step.label));
  const rest = offers.filter((o) => !nouns.includes(o));
  const here = new Map(nouns.map((o) => [o.step.label, o]));
  const children = new Map();
  for (const o of nouns) for (const parent of lattice.get(o.step.label).parents)
    if (here.has(parent.kind)) children.set(parent.kind, [...(children.get(parent.kind) || []), [o, parent]]);
  const under = (o, depth, via, path) => [item(o, depth, via),
    ...(children.get(o.step.label) || []).filter(([kid]) => !path.has(kid.step.label))
      .flatMap(([kid, parent]) => under(kid, depth + 1, parent, new Set([...path, kid.step.label])))];
  const top = nouns.filter((o) => !lattice.get(o.step.label).parents.some((parent) => here.has(parent.kind)));
  return h("ul", { class: "list" },
    top.flatMap((o) => under(o, 0, null, new Set([o.step.label]))),
    nouns.length && rest.length ? h("li", { class: "sep" }) : null,
    rest.filter((o) => !o.tag).map((o) => item(o, 0)), rest.filter((o) => o.tag).map((o) => item(o, 0)));
}

export function renderLeft() {
  const fresh = h("div", {}, switchChips());
  const { view, session } = state;
  if (!session.start) renderStart(fresh);
  else {
    const col = view.columns[view.focus];
    // Shortcuts across a whole ("host in line") are many; they fold away under the whole they cross.
    const across = (o) => / in /.test(o.step.label);
    const offers = view.offers.filter(unchosen);
    const direct = offers.filter((o) => !across(o));
    if (direct.length) fresh.append(h("h2", {}, "from " + short(word(col.label), 40)), offerList(direct));
    const byWhole = new Map();
    for (const o of offers.filter(across)) {
      const whole = o.step.label.slice(o.step.label.lastIndexOf(" in ") + 4);
      byWhole.set(whole, [...(byWhole.get(whole) || []), o]);
    }
    if (byWhole.size) fresh.append(h("h2", {}, "shortcuts · up to a whole and back down, two columns"));
    for (const [whole, list] of byWhole)
      fresh.append(h("details", {}, h("summary", {}, "in " + word(whole) + " · " + list.length), offerList(list)));
    if (!offers.length) fresh.append(h("p", { class: "note" }, view.offers.length
      ? "everything this column reaches is a column already." : "nothing more is said about this column."));
  }
  $("left").replaceChildren(fresh);
}
