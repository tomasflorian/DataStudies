// combined.ts — the graph. Every shape the project has, in one place.
//
// This was twelve separate scenarios until 2026-09-05, each keeping to one shape
// so that shape could be seen clearly. They are folded in here, and the folding
// is the point: everything lands in ONE graph, so values that different sources
// happen to agree on become one node, and a value can be reached by routes that
// have nothing to do with each other. The sections below still carry the old
// names, because they are still the useful way to say which shape is which.
//
// Some of the collisions are pretty:
//
//   192.168.1.3   is the raw IP of the `flat` section; it is also what `hubs`
//                 digs out of "IP:192.168.1.3/24" by hand, and what the record
//                 shapes dig out of the same string. Three routes, one node.
//   "3"           is lastOctet, lastOctetFromIP and octet4 — three functions,
//                 one answer — and also length("cat") and a timesheet seq, which
//                 nobody arranged.
//   paris         is a word in both texts, a CSV column value, a bare field, a
//                 grouped field, a config value, a JSON key and a nested JSON
//                 key. Eight functions land on it.
//   the city text is cut twice at once — by membership, and by the indexed
//                 functions that were the anti-scenario. Same words, two ways,
//                 side by side, with nothing labelling which is preferred.
//
// Where two sections used one name for one thing it is written once and both
// feed it — that is where most of the intersections come from. Where they used
// one name for two DIFFERENT things, one was renamed, and each is marked
// RENAMED. Nothing checks that any more; see the README, "Known limits".
//
// Isolation did not disappear with the separate files: anchoring the walk tab on
// `emp()` is choosing the timesheet part. You select a view instead of running a
// file.
//
// ---------------------------------------------------------------------------
// THIS IS A LOGGER. It computes things the way any program does, and says what
// it did afterwards. There is one primitive:
//
//   log("length", "paris", "5")     ->   ["length","paris","5"]
//
// No framework, no vocabulary to register, no handles, and NO CHAINING. An
// earlier version had a class with def/value/apply that ran your functions for
// you and threaded the answers; it produced exactly the atoms below and was
// deleted, because a producer is a program that prints lines and this one may as
// well look like one. producers/timesheet makes the same point in C#.
//
// What the framework used to do for free, and now sits in plain sight:
//
//   A function that declines writes NOTHING DOWN. It is an `if` now. `flat`
//   below is the case worth watching — isValidIP refuses "fifskje", so neither
//   it nor the lastOctet after it leaves a trace, and the graph never learns the
//   question was asked.
//
// Nothing memoises. The same call is made more than once here, which is fine: a
// graph is a function of the SET of atoms, so the output is sorted and deduped
// at the end, exactly as merge.sh does with `sort -u`.

import { writeFileSync } from "node:fs";

const acts: string[][] = [];
const log = (fn: string, ...slots: string[]): void => { acts.push([fn, ...slots]); };

// A record names its parts, so each name is a function. `read` hands the value
// back because the caller usually wants it — that is a function returning its
// own result, not a recorded call feeding another one.
function record(sep: string, fields: string[], guard?: (r: string) => boolean) {
  const at = (rec: string, f: string): string | null =>
    (!guard || guard(rec)) ? (rec.split(sep)[fields.indexOf(f)] ?? null) : null;
  const read = (rec: string, f: string): string | null => {
    const v = at(rec, f);
    if (v !== null) log(f, rec, v);
    return v;
  };
  return { read, of: (rec: string) => { for (const f of fields) read(rec, f); } };
}

// A collection does not name its parts, so you ask about them by content: one
// two-argument function handing back its own argument. There is no list node
// between the text and the part. See the README, O1.
function membership(name: string, split: (s: string) => string[]) {
  return {
    of: (s: string): string[] => {
      const parts = split(s);
      for (const part of parts) log(name, s, part, part);
      return parts;
    },
  };
}

// ---------------------------------------------------------------------------
// basic + hubs — the battery of small string functions.
//
// basic and hubs both had length and upper; written once, applied to both sets
// of words. basic's firstLetter and hubs' first are the same operation under two
// names, so firstLetter wins and hubs' first/last become firstLetter/lastLetter
// — RENAMED, because path needs `first` and `last` for its CSV columns and those
// are a different thing entirely.
//
// The battery is a map because the names are the point: the same seven functions
// go over eleven words, and a name is what a column will be called later.

const length      = (s: string) => String(s.length);
const upper       = (s: string) => s.toUpperCase();
const reverse     = (s: string) => s.split("").reverse().join("");
const sortChars   = (s: string) => s.split("").sort().join("");
const firstLetter = (s: string) => s.charAt(0);
const lastLetter  = (s: string) => s.charAt(s.length - 1);
const vowels      = (s: string) => String((s.match(/[aeiou]/g) ?? []).length);

const battery: Record<string, (s: string) => string> =
  { length, upper, reverse, firstLetter, lastLetter, sort: sortChars, vowels };

// basic's `cut` was a plain function returning "p|a|r|i|s". The characters are
// nodes in their own right now, so they meet firstLetter's answers.
const Chars = membership("char", s => s.split(""));

const anagrams = ["cat", "act", "arc", "car", "tar", "rat", "art"];
const short    = ["lima", "bat", "paris", "tokyo"];

for (const w of [...anagrams, ...short]) {
  for (const [name, f] of Object.entries(battery)) log(name, w, f(w));
  Chars.of(w);
}
for (const w of anagrams) {
  for (const c of ["a", "c", "r", "t", "z"]) log("hasLetter", w, c, String(w.includes(c)));
  log("sort", reverse(w), sortChars(reverse(w)));
  log("length", upper(w), length(upper(w)));
}

// ---------------------------------------------------------------------------
// text + general-demo prose — one set of cutters, two texts.
//
// text and general-demo both take paragraphs, sentences and words apart the same
// way, so there is one set of functions and both texts go through it. basic's
// words are the same function again — "paris france" is cut by the same `word`
// that cuts the sentences.

const Paragraphs = membership("paragraph", t => t.split("\n\n"));
const Sentences  = membership("sentence",  t => t.split("\n"));
const Words      = membership("word",      s => s.split(" "));

const cityText =
`paris is a city
the city is old

tokyo is a city
the city is new

a city is a place`;

const prose =
`paris sits on the seine
tokyo sits on the sumida

a city is a place`;

for (const text of [cityText, prose])
  for (const para of Paragraphs.of(text))
    for (const s of Sentences.of(para))
      Words.of(s);

Words.of("paris france");

// ---------------------------------------------------------------------------
// text-index (anti-scenario) — the same text, cut by index instead.
//
// RENAMED: paragraph/sentence/word are taken above, so the indexed versions are
// paragraphAt/sentenceAt/wordAt. They run over the SAME text and take the same
// subject, so the two ways of cutting differ only in how they name the part —
// which is the clearest look at why one is the scenario and the other is not.
//
// An index that finds nothing writes nothing, same as everywhere else.

const at = (parts: string[], i: number): string | undefined => parts[i];

for (let pi = 0; pi < 3; pi++) {
  const para = at(cityText.split("\n\n"), pi);
  if (para === undefined) continue;
  log("paragraphAt", cityText, String(pi), para);
  for (let si = 0; si < 2; si++) {
    const sent = at(para.split("\n"), si);
    if (sent === undefined) continue;
    log("sentenceAt", para, String(si), sent);
    for (let wi = 0; wi < 5; wi++) {
      const word = at(sent.split(" "), wi);
      if (word !== undefined) log("wordAt", sent, String(wi), word);
    }
  }
}

// ---------------------------------------------------------------------------
// types — predicates. A function is what a type used to be.
//
// A predicate that says no writes nothing at all, so the graph holds only the
// positives — which is why a `?` in a table means both "nobody asked" and "the
// answer was no". See the README, "Known limits".

const isIPv4 = (s: string) =>
  /^(\d{1,3}\.){3}\d{1,3}$/.test(s) && s.split(".").every(o => +o <= 255);

const predicates: Record<string, (s: string) => string | null> = {
  isString: s => s,
  isNumber: s => /^\d+$/.test(s) ? s : null,
  isPort:   s => /^\d+$/.test(s) && +s <= 65535 ? s : null,
  isIP:     s => isIPv4(s) ? s : null,
  isInternalIP: s => {
    if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(s)) return null;
    const [a, b] = s.split(".").map(Number);
    return a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) ? s : null;
  },
  isHost: s =>
    /^(\d{1,3}\.){3}\d{1,3}$/.test(s) ? s
      : (/^[a-z0-9]+(\.[a-z0-9]+)+$/i.test(s) && /[a-z]/i.test(s) ? s : null),
  isEmail: s => s.includes("@") ? s : null,
};

const tested = [
  "192.168.1.2", "8.8.8.8", "db01.internal", "user@db.local", "8080",
  "hello world", "mystery-blob",
  "192.168.1.3",  // flat's IP and hubs' IP — the predicates meet them here
  "10.0.0.5",
];
for (const v of tested)
  for (const [name, f] of Object.entries(predicates)) {
    const out = f(v);
    if (out !== null) log(name, v, out);
  }

// ---------------------------------------------------------------------------
// flat — is it an IP, and if so what is its last octet.
//
// THIS IS THE ONE TO WATCH. "fifskje" is not an IP, so isValidIP writes nothing
// and there is no answer for lastOctet to be asked about. Two calls, no atoms,
// and the graph never learns the question was asked. The `if` is the whole of
// it; nothing is enforcing this on anyone's behalf.

const lastOctet = (s: string) => s.split(".")[3];

for (const s of ["192.168.1.3", "fifskje"]) {
  if (!isIPv4(s)) continue;
  log("isValidIP", s, s);
  log("lastOctet", s, lastOctet(s));
}
for (const s of ["10.0.0.5", "192.168.1.3"])
  log("octetSum", s, String(s.split(".").reduce((a, o) => a + +o, 0)));

// ---------------------------------------------------------------------------
// hubs — the same "IP:192.168.1.3/24" taken apart by hand-written parsers.

const raw = "IP:192.168.1.3/24";
const rawType  = raw.split(":")[0];
const rawValue = raw.split(":")[1];
const rawIP    = rawValue.split("/")[0];
const rawMask  = rawValue.split("/")[1];

log("parseRecordType",             raw,      rawType);
log("parseRecordValue",            raw,      rawValue);
log("parseIPFromIPWithSubnet",     rawValue, rawIP);
log("parseSubnetFromIPWithSubnet", rawValue, rawMask);
log("lastOctetFromIP",             rawIP,    lastOctet(rawIP));

// ---------------------------------------------------------------------------
// hubs-record — the SAME string again, taken apart by record shapes instead.
//
// RENAMED: the "/" record's fields were ip and subnet; ip is needed below for
// path's endpoints, which split on ":" and mean something else. They are
// cidrIP and cidrMask here.
//
// This section adds almost no new values — it arrives at 192.168.1.3 and at "3"
// where hubs already is. Two ways of writing the same parse, meeting on the
// answer.

const Colon = record(":", ["recordType", "recordValue"]);
const Slash = record("/", ["cidrIP", "cidrMask"]);
const Dot   = record(".", ["octet1", "octet2", "octet3", "octet4"]);

Colon.read(raw, "recordType");
const cidr = Colon.read(raw, "recordValue");
if (cidr !== null) {
  const ip = Slash.read(cidr, "cidrIP");
  if (ip !== null) Dot.read(ip, "octet4");
  Slash.read(cidr, "cidrMask");
}

// ---------------------------------------------------------------------------
// path — names two ways round, a CSV with a header, and endpoints.

for (const nm of ["robert smith", "smith, robert", "alice brown", "brown, alice"]) {
  log("firstName", nm, nm.includes(",") ? nm.split(", ")[1] : nm.split(" ")[0]);
  log("lastName",  nm, nm.includes(",") ? nm.split(", ")[0] : nm.split(" ")[1]);
}

const Rows = membership("row", c => c.split("\n").slice(1));

// The column names are read out of the header line, so this producer does not
// know them when it is written. A field is still one function per name; the
// impl happens to be the same for all of them, so there is nothing to register.
const csv = "first,last\ncarol,white\ndave,green";
const header = csv.split("\n")[0];
log("headerLine", csv, header);
const cols = header.split(",");
for (const r of Rows.of(csv))
  cols.forEach((name, i) => { const v = r.split(",")[i]; if (v !== undefined) log(name, r, v); });

for (const ep of ["192.168.1.10:8080", "192.168.1.10:443", "10.0.0.5:22"]) {
  log("ip",   ep, ep.split(":")[0]);
  log("port", ep, ep.split(":")[1]);
}

// ---------------------------------------------------------------------------
// timesheet + timesheet-cli — one record shape for both.
//
// timesheet's rows carry a seq field and the CLI's do not. One five-field record
// serves both: on a four-field row, seq simply finds nothing. The date record
// carries a guard so `year` does not try itself on "mystery-blob".

const Entry = record("|", ["emp", "date", "proj", "hours", "seq"]);
const Day   = record("-", ["year", "month", "day"], d => /^\d{4}-\d{2}-\d{2}$/.test(d));

const enter = (rec: string): void => {
  Entry.of(rec);
  const date = Entry.read(rec, "date");
  if (date !== null) Day.of(date);
};

for (const rec of [
  "bob|2026-08-25|projX|8|1",
  "alice|2026-08-25|projX|5|2",
  "bob|2026-08-26|projX|4|3",
  "bob|2026-08-25|projX|6|4",
  "carol|2026-08-27|projY|7",   // the CLI's four-field shape — no seq
]) enter(rec);

// The CLI's edit chain. An edit is one call: the old record in, the new record
// out. Nothing is overwritten and no version is marked current, so the whole
// chain stays in the pile and "the latest one" is a question a reader asks.
log("edit", "carol|2026-08-27|projY|7", "carol|2026-08-27|projY|8", "carol|2026-08-27|projY|8");
log("edit", "carol|2026-08-27|projY|8", "carol|2026-08-27|projX|8", "carol|2026-08-27|projX|8");
for (const rec of ["carol|2026-08-27|projY|8", "carol|2026-08-27|projX|8"]) enter(rec);

// ---------------------------------------------------------------------------
// general-demo — six ways of writing the same two cities down.
//
// Its prose went through the functions above. What is left is the other five
// formats, each with its own cutters, all arriving at paris and tokyo.

const tag = (text: string, format: string) => log("hasFormat", text, format, format);

tag(cityText, "prose");
tag(prose, "prose");

const headered = `city,country
paris,france
tokyo,japan`;
const Place = record(",", headered.split("\n")[0].split(","));
tag(headered, "headered-csv");
for (const r of Rows.of(headered)) Place.of(r);

const bare = `paris,france,europe
tokyo,japan,asia`;
const Lines  = membership("line",  c => c.split("\n"));
const Fields = membership("field", l => l.split(","));
tag(bare, "bare-csv");
for (const l of Lines.of(bare)) Fields.of(l);

const grouped = `paris:2.35,48.85
tokyo:139.69,35.68`;
const GroupedLines  = membership("groupedLine",  c => c.split("\n"));
const GroupedFields = membership("groupedField", l => l.split(":"));
tag(grouped, "grouped");
for (const l of GroupedLines.of(grouped)) GroupedFields.of(l);

const json = `[{"place":"paris","river":"seine"},{"place":"tokyo","river":"sumida"}]`;
const Items = membership("item", j => JSON.parse(j).map((o: unknown) => JSON.stringify(o)));
tag(json, "json");
for (const item of Items.of(json))
  for (const key of ["place", "river"]) {
    const v = (JSON.parse(item) as Record<string, string>)[key];
    if (v !== undefined) log(key, item, v);
  }

const config = `name: paris
nation: france

name: tokyo
nation: japan`;
const Blocks = membership("block", t => t.split("\n\n"));
const Pairs  = membership("pair",  b => b.split("\n"));
tag(config, "key-value");
// The key names itself: the line says which function it is an answer to.
for (const block of Blocks.of(config))
  for (const pair of Pairs.of(block)) {
    const [key, value] = [pair.split(": ")[0], pair.split(": ")[1]];
    if (value !== undefined) log(key, pair, value);
  }

// ---------------------------------------------------------------------------
// general (anti-scenario) — a function per JSON key, walking into nested objects.
//
// RENAMED throughout: its keys were first/last/ip/geo/city/country, all of which
// name something else here. The shape is what matters — the loader does not know
// the keys ahead of time, it names a function as it meets one. The address it
// carries is 10.0.0.5, which flat has already summed and path has already seen
// as an endpoint.

function chopObject(obj: Record<string, unknown>): void {
  const s = JSON.stringify(obj);
  for (const [key, val] of Object.entries(obj)) {
    if (val !== undefined && val !== null)
      log(key, s, typeof val === "object" ? JSON.stringify(val) : String(val));
    if (val && typeof val === "object" && !Array.isArray(val))
      chopObject(val as Record<string, unknown>);
  }
}
chopObject({ addr: "10.0.0.5", geo: { town: "paris", region: "idf" } });

// ---------------------------------------------------------------------------
// out. Sorted and without repeats, so a diff line means the atoms changed rather
// than that a call moved — the same thing merge.sh does with `sort -u`.

const lines = [...new Set(acts.map(a => JSON.stringify(a)))]
  .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

if (process.env.RFG_OUT) {
  writeFileSync(process.env.RFG_OUT, lines.join("\n") + "\n");
  console.log(`wrote ${lines.length} atoms -> ${process.env.RFG_OUT}`);
} else {
  for (const line of lines) process.stdout.write(line + "\n");
}
