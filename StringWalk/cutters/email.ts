// email.ts — every email in every value, split at the @.
//
//   [<a note>, "text, contains, appears in, email", "alice@larkfield.example"]
//   ["alice@larkfield.example", "email, has, user-of, user", "alice"]
//   ["alice@larkfield.example", "email, has, domain-of, domain", "larkfield.example"]
//
// A value that IS an email is split, and not said to contain itself.

import type { Line } from "../stringwalk.ts";

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z0-9-]+/g;

export default function email(lines: readonly Line[]): Line[] {
  const values = new Set<string>();
  for (const [a, , b] of lines) { values.add(a); values.add(b); }

  const out: Line[] = [];
  const split = new Set<string>();
  for (const value of values)
    for (const found of new Set(value.match(EMAIL) ?? [])) {
      if (found !== value) out.push([value, "text, contains, appears in, email", found]);
      if (split.has(found)) continue;
      split.add(found);
      const at = found.lastIndexOf("@");
      out.push([found, "email, has, user-of, user", found.slice(0, at)]);
      out.push([found, "email, has, domain-of, domain", found.slice(at + 1)]);
    }
  return out;
}
