# Reversible Function Graph


## What this is

You run a function, and the call gets written down as one line:

```
["year","2026-08-25","2026"]
```

A function, its input, its answer. That line is an **atom**, and atoms are all
this project stores.

A **graph** is what a reader makes of them. Expanding that atom gives four boxes
and three arrows:

```
year ─────────fn─────▶ (the call) ──output──▶ 2026
2026-08-25 ──input───▶ (the call)
```

`2026-08-25` and `2026` are pieces of text, `year` is the function, and the
fourth box is the call itself, sitting between the input and the answer. Because
the call is a node, three questions become the same kind of question — follow
arrows:

- What year is `2026-08-25`? Follow forward.
- Which dates fall in `2026`? Follow backward.
- Where has `year` been used? Follow forward from `year`.

The graph is not stored. It is derived each time somebody looks.

## The claim being tested

**Writing the call down is enough** — enough that you don't have to declare the
shape of your data before it arrives. No tables, no types, no record layout, no
"which version is current". A reader works it out afterwards by following arrows.

- **Forwards.** The record of *what function was run on what* has the three parts
  a table has: the function is the column, the input is the row, the answer is
  the cell.
- **Backwards.** The call sits between the input and the answer as a node you can
  stop on, so you can walk back from an answer.

The atom does fix a small shape, and you bring more in choosing which functions to
run. And the graph is not a log: asking the same question twice adds nothing.

## The atom

```
[ fn, input, output ]
```

Exactly three strings.

```
["length", "cat",             "3"]
["upper",  "cat",             "CAT"]
["word",   "paris is a city", "city"]
["word",   "paris is a city", "paris"]
```

Role comes from position; there is no role or label field. An atom is a claim:
this function, given this input, gave this answer. Usually it records a call that
ran, but a hand-written line works just as well.

**A call with several answers is several lines.** The last two atoms above are
one call, `word("paris is a city")`, and two of its answers.

**A call's identity is its function and its input**, compared element by element
rather than joined into a string, so there is no separator or quoting rule to get
wrong.

**A function that returns nothing writes nothing down.** Most strings are not an
IP; recording each "no" would grow the file with what was *asked* rather than
what was *found*.

**One atom per line**, each a JSON array. A truncated file loses its last partial
line and the rest still reads, so a prefix of the file is a smaller graph rather
than a damaged one. Readers skip a line that isn't an atom and report its line
number.

## Three roles

```
producers  ->  the pile  ->  readers
                  |  ^
                  v  |
                 cutters
```

A **producer** writes atoms. Anything that can print lines qualifies — any
language, or a person typing. It doesn't need to coordinate with other producers
or dedupe its output: merging is idempotent, so writing the same atom twice costs
nothing.

Producers come in two kinds, and the pile can't tell them apart:

- **Intake** reads the world: a file, an export, a program's own work. This is
  where something can be lost, because what intake doesn't write down isn't
  anywhere else. Its job is to keep things, not to understand them. `ingest.ts`
  is the smallest: a whole document in, one atom out.
- **Cutters** read the pile and write more atoms back. `passwordrecord-cut` cuts
  records out of a document already held; `scan.ts` finds addresses and URLs in
  a notes field; `entropy.ts` scores words by how generated they look.

`./rfg run` re-runs the cutters until a round adds nothing. There is no fixed
order or pass count; a cutter that needs another's output finds it on a later
round. Two rules make that land in one place:

- **Pure**, so the loop ends. A cutter that writes a timestamp would add new
  atoms every round.
- **Monotone**, so the order doesn't matter. A bigger pile gets you more, not
  less. In practice: don't let an absence change the answer. Writing
  `["kind",x,"unknown"]` unless something better is already there would depend
  on which cutter ran first.

A producer may read the pile to decide **what to call**. It shouldn't read the
pile to decide **what the answer is** — `parseNotes(doc)` should give the same
answer whether the pile holds eight records or eight million.

The **pile** is a plain file holding the union of what producers wrote. It has
no vocabulary and runs no functions, so it can't check an answer or spot a
contradiction. Merging is `sort -u`, and `merge.sh` is that plus a lock.

A **reader** expands the pile and draws or walks it. Everyone holding the same
atoms holds the same graph, so the graph doesn't need to travel. `serve.ts` is an
optional read-only adapter that streams the file to the viewer.

## Expanding

`expand` turns one atom into nodes and edges:

```
nodes:  fn        a function
        input     a value
        the call  fn and input together
        output    a value

edges:  fn     -> call     slot: fn
        input  -> call     slot: input
        call   -> output   slot: output
```

Edges carry their slot, so `isString(x) = x` keeps its input and its answer
apart even though they are the same node. A call with several answers has one
`output` edge per atom.

**`expand` reads only the atom**, not the graph built so far. Most of what
follows comes from that:

```
expand(A ∪ B) = expand(A) ∪ expand(B)
```

Merging the same file twice does nothing, and order and grouping don't matter.
The graph is a function of the *set* of atoms, so "send everything again" and
"send what is new" give the same result.

## Where the meaning is

An atom is complete in itself. A node is the opposite: `3` is interesting because
it is the length of `cat` *and* the last octet of an IP *and* a timesheet
sequence number, and that fact is in no single atom. It appears when equal
strings are grouped into one node.

So meaning enters through the atoms and is made at the nodes. The atoms are
authored; the connections mostly aren't — they happen because two strings are
identical. The bet is less "meaning is in connections" than *meaning is in the
connections nobody made on purpose.*

Some consequences, each of which showed up in the code before it was written
down:

- No join keys or matching rules, because connections aren't authored.
- Merging needs no coordination, so it is concatenation.
- How a value is written down matters, because collision is on exact text.
- Anything added later arrives as atoms — "who asked" would be more calls, not a
  field on the side.

## Design choices

**What the engine holds to**

- **Identity from contents.** A value is its text; a call is its function and
  input. Arbitrary ids (a counter, a uuid) would make merging a matching problem.
- **Arrows are derived.** Nobody writes an arrow; it appears because a value sat
  in an atom.
- **Everything is text.** A string is a number or a date through the function you
  run on it.
- **A node's kind comes from position.** Being a function is a property of an
  edge, so one node can be a function in one call and a value in another.
- **Calls don't nest.** A call inside a call is two calls side by side, so levels
  can be added later in either direction.
- **You can walk back.** This is the one to give up last.

**Opinions about the data** — each could have gone another way:

- **O1 — a collection is not a thing.** A sentence's words are the answers of
  `word()`; there is no list node between them. A minted list was tried and
  removed: of 37 in the corpus, 36 were touched by nothing but their own
  extractor. Lists the world hands you, like `bob|2026-08-25|projX|8|1`, stay as
  values.
- **O2 — name positions rather than number them.** `lastOctet` is fine. Inventing
  `0, 1, 2…` for a count you don't know in advance is what to avoid. Where order
  is the only clue, as in an unlabelled CSV, it becomes a named function:
  `["column1", row, "Tomas"]`.
- **O3 — avoid nodes that exist only for the machinery.**
- **O4 — two ways in: by name or by content.** Records name their parts, so the
  name becomes a function. Collections don't, so you ask by content.
- **O5 — a format is its cutting functions.** Avoid converting one format into
  another to reuse a path.

## Quick start

```sh
npm install
npm run build # compile viewer.ts into dist/, which graph.html loads
npm start     # optional viewer at :8000, watching pile.atoms
./run.sh      # run the producers and merge their atoms into pile.atoms
./runAll.sh   # write snapshots/combined.atoms, the regression artifact
```

`rfg.config.ts` lists what the pile is made of and names each tool. What it says
about a tool is whether it reads the pile, which is what makes it worth
re-running when something new lands.

```sh
./rfg list                        # the inputs, the tools, which read the pile
./rfg run                         # bring the inputs in, catch up, stop
./rfg run --fresh                 # the same, from an empty pile
./rfg run ingest some/other.txt   # the inputs and this too
./rfg run --only scan,entropy     # catch up with some of them
./rfg run --pile other.atoms      # a different pile
some-producer | ./rfg run         # anything that prints atoms
./rfg watch                       # stay caught up
```

`rfg` checks what tools print strictly — a line that isn't three strings stops
the run — so broken lines don't get into the pile that way.

## Producers

```sh
./producers/atom.sh notedBy paris tomas   | ./merge.sh pile.atoms
./producers/repo.sh                       | ./merge.sh pile.atoms
dotnet run --project producers/timesheet  | ./merge.sh pile.atoms
```

`atom.sh` turns three arguments into one line. `repo.sh` is plain bash.

`producers/timesheet` is C#, and makes the other half of the point: **an atom is
a structured log line.** The program is a record, a rate card and an interface —
code you would write anyway — with `Atoms` beside work that has already happened:

```csharp
Atoms.Log("dayOfWeek", date, date.DayOfWeek);            // say it afterwards
var rate = Atoms.Call("rate", proj, () => rates[proj]);  // wrap the call
var cost = pricing.Cost(row);   // recorded by a proxy behind IPricing
```

The part that can't be automated is turning a `decimal` or a `DateOnly` into
text. That decision lives once, in `Atoms.cs`, and a type nobody has decided
about is refused rather than guessed at.

`scenarios/combined.ts` is a logger with one primitive, `log(fn, input, output)`.
A function that declines is an `if`:

```ts
for (const s of ["192.168.1.3", "fifskje"]) {
  if (!isIPv4(s)) continue;          // no atom, for this call or the next
  log("isValidIP", s, s);
  log("lastOctet", s, lastOctet(s));
}
```

Producers don't chain. `upper(paris) = PARIS` and `length(PARIS) = 5` are two
independent atoms, and a reader finds the join by following `PARIS`. Composition
across producers happens **through the pile**: `host` runs on what `urlIn`
wrote, on a later round.

## The corpus

`scenarios/combined.ts` puts the shapes in one producer: 66 functions and 319
atoms, expanding to 482 nodes and 817 edges. It was twelve scenarios until
2026-09-05; folding them together is the point, because values different sources
agree on become one node:

- `192.168.1.3` is a raw IP, what a hand parser digs out of `IP:192.168.1.3/24`,
  and what the record shapes dig out of the same string. Three routes, one node.
- `3` is `lastOctet`, `lastOctetFromIP` and `octet4`, and also `length("cat")`
  and a timesheet `seq`, which nobody arranged.
- `city` is a word in the prose and a column function from a CSV: a function in
  two calls and an answer in five.

Where two sections used one name for two different things, one was renamed and
marked `RENAMED`.

## The viewer

`npm start`, then open `http://localhost:8000`. The page receives atoms and
expands them itself. You can also paste atoms. Broken lines are counted in the
status line rather than stopping the page.

### graph

Nodes coloured value / function / call. Click to light a node and its neighbours;
`multi-select` accumulates. Pan with the arrow keys, zoom with `[` and `]`. The
layout re-settles as atoms arrive.

### triples

What a node is: what produced it, where it was used, and for a call, its function,
its input and each answer.

### walk

Builds a table. Pick a function; what it produced becomes the rows. Click a cell
to see where it can go, and tick a step to add a column. `fn()` goes from input
to answers; `rev_fn()` goes back from an answer to its inputs.

```sh
npx tsx walk-cli.ts combined emp rev_emp date +hours
```

```
emp() | rev_emp()                    | date() via rev_emp()                    | hours() via rev_emp()
------+------------------------------+-----------------------------------------+-------------------------------
alice | "alice|2026-08-25|projX|5|2" | "alice|2026-08-25|projX|5|2".2026-08-25 | "alice|2026-08-25|projX|5|2".5
bob   | "bob|2026-08-25|projX|6|4"   | "bob|2026-08-25|projX|6|4".2026-08-25   | "bob|2026-08-25|projX|6|4".6
bob   | "bob|2026-08-25|projX|8|1"   | "bob|2026-08-25|projX|8|1".2026-08-25   | "bob|2026-08-25|projX|8|1".8
bob   | "bob|2026-08-26|projX|4|3"   | "bob|2026-08-26|projX|4|3".2026-08-26   | "bob|2026-08-26|projX|4|3".4
carol | "carol|2026-08-27|projX|8"   | "carol|2026-08-27|projX|8".2026-08-27   | "carol|2026-08-27|projX|8".8
carol | "carol|2026-08-27|projY|7"   | "carol|2026-08-27|projY|7".2026-08-27   | "carol|2026-08-27|projY|7".7
carol | "carol|2026-08-27|projY|8"   | "carol|2026-08-27|projY|8".2026-08-27   | "carol|2026-08-27|projY|8".8
```

A step written with `+` hangs off the same parent as the one before, so `date`
and `hours` both come from the record. Three `carol` rows for one person edited
twice: the edit chain keeps each version, and which is current is a question you
ask.

What the table does on purpose:

- **Branches pair at their deepest shared step**, so bob gets three rows, not a
  six-row cross product.
- **Identical values don't collapse.** Two of bob's rows say `2026-08-25` because
  he has two records that day; the waypoint column shows which.
- **A step that finds nothing writes `?`** and the row stays.
- **Qualifiers** show the walk that produced a cell.
- **Values aren't shortened.** An abbreviation tends to grow into an invented
  identifier. Quoting isn't shortening.

The ticked columns are a schema, and it lives in the viewer rather than the
graph. A schema at write time is a decision made before you know what you have;
at view time it is a hypothesis you can drop for free.

## Checking that nothing changed

```sh
./runAll.sh          # write snapshots/combined.atoms
git diff snapshots/  # did anything move?
./check.sh           # parse at intake vs. parse later: lost must be 0
```

The snapshot is written sorted, so a diff line means the atoms changed. `check.sh`
needs `local/sample/example2.txt`, which is data and not in the repo.

## Files

```
rfg / rfg.ts          run tools, merge what they print, keep the pile caught up
rfg.config.ts         a pile's inputs, its tools, and which of them read it
scenarios/combined.ts a producer in TypeScript: the shapes in one
producers/atom.sh     a producer: three arguments in, one line out
producers/repo.sh     a producer in bash
producers/timesheet/  a producer in C#: ordinary code, logging to atoms
producers/passwordrecord/      intake in C#: a file of records in, atoms out
producers/passwordrecord-cut/  the same parse as a cutter
producers/scan.ts     a cutter: addresses, URLs and hosts in a Notes field
producers/entropy.ts  a cutter: which words look generated
producers/shortstring.ts  a cutter: values that read like a typed word
ingest.ts             a document in, one atom out
merge.sh              union stdin into an atom file
cut.sh                ./rfg run --pile FILE, spelled short
expand.ts             atoms -> nodes and edges
walk.ts               atoms -> tables, for the browser and the terminal
walk-cli.ts           the walk tab without the tab
viewer.ts, graph.html the viewer
serve.ts              optional read-only file watcher for the viewer
snapshots/            the regression artifact
check.sh, check/      the intake check and its workings
log.md                things tried and set down again
```

`pile.atoms` is not tracked.

## Known limits

**Asking twice leaves no mark.** Two people asking the same question for
different reasons look the same afterwards: no count, no order, no record of who
asked. That is also what lets piles merge as a plain union. If who-asked is ever
recorded, it would arrive as more atoms — the asker as a value, the asking as a
call.

**A hole means two things.** A `?` covers both "nobody made that call" and "the
call came back empty", because a function that declines writes nothing.

**Conflicts look like answers.** Two producers giving the same call different
answers looks the same as a call with two answers, such as a note holding two
email addresses. A reader could check it: list the functions that should have one
answer (`emp`, `date`, `Company`, …) and report any input where one has two.
Before the move to three strings, the doubled form `["emailIn", note, x, x]`
kept one answer per call so that two answers could only mean disagreement; that
check was never run. *Open questions* has a version that names functions by
their code.

**Vocabulary is per producer.** `combined.ts` uses `first` for a CSV column;
`repo.sh` uses it for the head of a `|`-separated list. In one pile they share a
`first` node, and a reader anchored on `first` gets both. That is the cost of
anyone bringing their own names.

## Not built yet

- **A merge harness** that splits a file many ways and merges in random orders.
- **A query server.** `serve.ts` streams the file; a server that gets asked
  things is a different design.
- **A containment crawler** — noticing that `smith` sits inside
  `smith@example.com`, written `["contains","smith@example.com","smith"]`. One
  optional cutter among many.
- **Weights on ticks.** Booleans today.
- **Time and ordering**, which touches the claim itself rather than just the code.

## Open questions

- **Walking to a function.** A function name sits in the `fn` slot, and the walk
  can't step to it. Lines *about* a function — `["kindOf","emp_3fa9","emp"]`,
  who wrote it, what its reverse is called — can be written but not reached from
  the calls it made. StringWalk could describe its own relations this way. One
  walk step, "the function behind this cell", would close the gap. Is it worth
  building before there is a real need?
- **Names by content.** Name each function by a hash of its code, `emp_3fa9`,
  with `["kindOf","emp_3fa9","emp"]` for the family. This turned out to be a
  convention rather than a feature: nothing in the engine has to change, and any
  producer can adopt it. See `log.md`.
- **Disagreement now.** Should the single-answer check (*Known limits*) be built
  as a reader in the meantime?
- **The minted call id.** The viewer still names a call `JSON.stringify([fn,
  input])` for vis-network, with a check against collisions. It is drawing
  plumbing rather than part of the model. Can the drawing do without it?
- **Function or relation?** A name here is code that returns a set of answers,
  which makes it a relation in all but name, and StringWalk's `[value, relation,
  value]` has the same shape. The difference is not in the structure. A
  StringWalk label *is* its meaning: someone chose the word, and nothing stands
  behind it. An RFG name can *point to* its meaning: it names whatever produced
  the answer, however much more that code does than a short label could say.
  Meaning can come from three places — code, a chosen word, or use, the track
  record a name builds up in the pile — and one name can move between them: code
  can be lost while the answers keep what they taught. That is a property of
  each name rather than of either project, so one pile could hold all three. The
  two stay in separate folders for now.
- **The noise.** The stress-test producers (`IsShortString`, `entropy`, the
  letter functions) are most of the pile and most of its biggest hubs. They stay
  for now; the graph view can hide the top hubs.

## History

**2026-08 to 09: it worked.** Three producers in three languages, with no shared
library or schema, joined up on equal strings. No migrations, no conflict
resolution: piles merged with `sort -u`. `check.sh` showed that parsing a
document at intake and parsing it later off the pile give the same atoms, so not
understanding something yet could be deferred.

**What stopped it.** Atoms were `[fn, ...args, result]`. A walk step is a
function and a direction, and with more than one argument that doesn't say where
to land, so the walk read the first argument and the result and skipped the
rest. Measured on the 383-line corpus: 47% of lines had two arguments and were
half-read, and two values (`"z"`, `"0"`) could be written but never reached in
any table. Six annoyances turned out to share that one cause:

- a convention that the first argument is the subject, which nothing enforced
- values that could be stored but not reached
- the membership trick, `["word", sentence, "paris", "paris"]`, writing the
  answer twice to get it into the readable slot
- `"true"` / `"false"` verdicts becoming large hubs
- a call id minted by JSON-encoding the argument list
- arguments sorted as strings, so `arg10` came before `arg2`

The diagnosis was that `[fn, ...args, result]` is a nested structure posing as a
flat one. StringWalk started over from three strings, `[value, relation, value]`,
in its own folder.

**2026-10: revived.** Coming back, the smaller model was the appeal. Most of the
pile was already three strings, and the doubled lines were three strings
written with one repeated. The change: every atom is exactly
`[fn, input, output]`, a call with several answers is several lines, and the
position functions (`hasLetter`, `wordAt`, `sentenceAt`, `paragraphAt`) were
dropped — positions weren't used by any of the real data. Five of the six
symptoms went with it; the minted call id remains in the viewer (*Open
questions*).

It was checked by rebuilding the pile from source before and after. The old code
reproduced the old 952-line pile exactly, except one line cut off mid-write,
which came back whole. The new pile has 885 lines; the only difference beyond the
planned ones was three `IsShortString` atoms for `false`, `true` and `z`, values
that existed only inside `hasLetter`. Eighteen walks printed the same rows, and
`check.sh` lost nothing. Readers now skip and report broken lines instead of
stopping on the first one.
