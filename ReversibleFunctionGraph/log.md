# log

Things that were tried and then set down again.

Being in this pile carries no verdict. It means the thing was looked at,
something was learned, and it was put aside for now — that is all it means. An
entry may be picked back up unchanged, picked up in a different form, or left
alone. Nothing here is settled.

Each entry says what was tried and what came out of it, and closes with what I
said about it at the time.

---

## Keeping a call that returned nothing

**Tried.** `Node.apply` returns the `∅` node as soon as a function hands back
`null`, before any application node is built, so a call that came back empty
leaves nothing behind. The idea was to build the application anyway and point it
at `∅`, so the graph would hold "this was asked, and nothing came back" the same
way it holds every other call. `types` applies 7 predicates to 7 values; the
graph keeps 16 of those 49 calls, and `∅` sits in it as a node with no edges.

**What came out.** Set down before it was built. The empty answers are the
ordinary case — most strings are not an IP — and re-running the predicate
answers the same question. A blank cell reading as "nothing came back" is the
intended reading. A blank cell currently covers both that and a call nobody
made, with nothing in the picture separating them.

> I think I did that on purpose. I don't need to know the million things that
> are not an IP.

---

## Splitting selecting calls out of the pivot

**Tried.** `gaze.ts` builds a column name by folding a call's extra arguments in:
`word(·,old)`. `record` defines its fields as one-argument functions, so its
columns are plain names and rows stack. `sequence` defines `elem` as a
two-argument function that hands back the part it was given, so each element
mints a column of its own. In `text`, one row looks like this:

```
subject         | word(·,city) | word(·,is) | word(·,old) | word(·,the)
the|city|is|old | city         | is         | old         | the
```

The change: in `pivot()`, notice a call whose result is one of its own arguments
(`extra.includes(res)`), keep it out of the pivot, and collect those into
`listings(g)` — subject plus the items, keyed on `(subject, fn)`. `view.ts`
shipped them; `graph.html` drew them under both pivot tabs.

**What came out.** Built and run across all twelve scenarios. Nodes and edges
came out identical everywhere; only the `pivot` and `tables` sections of the
snapshots moved.

| scenario | tables | listings | pivot columns |
|---|---|---|---|
| `text` | 12 → 4 | 8 | 20 → 4 |
| `general-demo` | 32 → 16 | 22 | 63 → 18 |
| `path` | 5 → 4 | 1 | 10 → 8 |
| the other nine | unchanged | 0 | unchanged |

`text-index`, the anti-scenario, came out unchanged — indexing gives
`word(list,"0") → "paris"`, and `"paris"` is not `"0"`, so nothing in it looked
like a selecting call. 6 of `general-demo`'s 22 listings were `hasFormat` tags
rather than lists; `hasFormat` is written as `(_raw, name) => name`, so it hands
back its own argument too and was collected alongside them.

Reverted afterwards; the code is not kept anywhere.

> I like the sound of this: the five sentences in `text` become one block — five
> lists with their words under them, shared words visibly shared — instead of
> five tables that happen to sit next to each other.
>
> I don't like the sound of this: it's asserting membership. Are we sneaking
> types and schema in where they don't belong?

---

## Marking listings by their separator

**Tried.** Rather than working it out in the gaze, put the fact in the graph:
define something like `isListing`, apply it to any value carrying a `|`, and
find the lists by clicking the function node — the same move every other fact in
the graph makes, with nothing new to build.

**What came out.** Checked against the snapshots before building. `sequence`
uses `|` between elements, and `record` accepts `|` as a field separator, which
`timesheet` and `timesheet-cli` both use, so the timesheet rows carry a `|` too:

```
nodes with "|" that a separator check would pick up
  text            8      general-demo   16
  timesheet       4      timesheet-cli   6
```

`bob|2026-08-25|projX|8` is a record written with the same character. Marking
the list node also leaves the pivot columns as they were — `word(·,old)` is
minted by the element calls, not by the list, so `text` stays at 12 tables
either way.

A version where `sequence` says so itself when it cuts a list, rather than
anything reading the separator afterwards, was sketched and not built.

> That's a lot of work for listing all the nodes that have a `|` in them. Why
> not handle it in the graph? Whenever something comes out with a `|` in it,
> link it automatically. Then I get the listings by going to the triples and
> clicking `isListing()`. Or what am I missing?

---

## Giving every producer its own function names

**Tried.** Two producers can write the same call with two different answers —
`["length","cat","3"]` and `["length","cat","7"]` — and nothing anywhere can tell
which is right, because the pile has no vocabulary and never runs a function. The
idea was to make it impossible: give each producer an id and prefix every
function name with it, so `acme_length` and `bolt_length` are different functions
and no two producers ever write the same call.

**What came out.** Set down before it was built. It works, and that is the
problem with it: the disagreement does not go away, it stops being visible. Two
calls sit in the merged graph with two answers, no fork, and nothing in the
picture saying anyone disagreed. It also costs the thing the project is for —
`length` is one node with every use of length hanging off it, and prefixing turns
a thousand merged files into a thousand `length` nodes. Value collisions survive;
function collisions stop happening. And the id has to be a chosen, stable name
rather than a per-run uuid, or re-running a producer twice gives a disjoint
second copy of everything — which makes it a namespace a person picks, not an
identifier.

Left as: assume no producer ever conflicts. Nothing checks. If two answers ever
do arrive, the call node gets two arrows out and the picture shows a fork, which
is both what happens by default and the more honest of the two options. If
namespaces come back they should be optional and chosen, not mandatory.

> what if each producer had unique id and function names were id_x()? that way
> there is never any conflict?
>
> we assume something insane, but we know that it's insane .. no producers will
> ever conflict .. we leave it as a todo so that this doesn't stop us from the
> refactor

---

## Naming functions by a hash of their code

**Tried.** A plan to name functions by a hash of their code, `host_9c1e`, with one
more atom giving the family name used for walking and display:

```
["host_9c1e", "https://larkfield.example/login", "larkfield.example"]
["kindOf",    "host_9c1e",                       "host"]
```

**What came out.** Set down before it was built, because writing the plan showed
it is a convention, not a rule, and a convention needs no code.

A name can get its meaning from three places, and a pile can hold all three side
by side:

1. **Code.** `host_9c1e` means what that code does. Re-running it checks the atom.
2. **A chosen word.** `notedBy` means what its author meant. Testimony; nothing to
   re-run.
3. **Use.** A name learns a meaning from its track record, the answers it has
   given. These are all in the pile already, so this kind of meaning cannot be
   lost.

A name can move between them. Code can be lost, and its name keeps the meaning its
answers gave it. A hand-written name can later get code that reproduces it. So
hashing is something a producer can choose per function. It is not a new rule for
the pile, and plain names stay valid. A hash whose code cannot be found is not
broken. It just has fewer ways to be understood.

Nothing in the engine has to change for any of this: the atom, `expand.ts` and
merging already accept a hashed name and a `kindOf` line, and any producer can
start writing them today. That was expected to take the code to see. It came out
of the plan instead.

Notes from the plan, for a producer that adopts the convention:

- **What to hash.** Not `fn.toString()`, which `tsx` rewrites. The source a
  producer declares (a regex, or a function body) works, without covering the
  helpers it calls. Shared-helper code such as `emp` and `date` in `combined.ts`
  would need its parameters in the hash too.
- **Selecting by family.** A cutter that chooses its input by function name, as
  `scan.ts` does with `emailIn` and `urlIn`, would choose by family instead. That
  stays monotone.
- **Regexes can be their own names.** Short enough to sit in the fn slot, so the
  code is in the pile with no hash at all.
- **Disagreement.** It answers the objection in *Giving every producer its own
  function names*: implementations stay apart, and the family brings them back
  together, so a disagreement shows instead of disappearing.
