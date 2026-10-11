// Small helpers for building the page.

// An element, its properties, and its children.
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === "class") el.className = v; else if (k.startsWith("on")) el[k] = v; else if (v != null) el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid);
  return el;
}

// A string cut to n characters, its line breaks shown as \n.
export function short(s, n) { s = String(s).replace(/\n/g, "\\n"); return s.length > n ? s.slice(0, n - 1) + "…" : s; }

// Text with every occurrence of `find` marked, ignoring case.
export function marked(text, find) {
  find = find.toLowerCase();
  if (!find) return text;
  const lower = text.toLowerCase(), out = [];
  let from = 0;
  for (let at = lower.indexOf(find); at >= 0; at = lower.indexOf(find, at + find.length)) {
    out.push(text.slice(from, at), h("mark", {}, text.slice(at, at + find.length)));
    from = at + find.length;
  }
  out.push(text.slice(from));
  return out;
}
