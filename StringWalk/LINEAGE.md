# Lineage

```text
ReversibleFunctionGraph   →   StringWalk   →   EdgeOnEdge
        (search it)             (here)      (../Attempt2026-EdgeOnEdge)
```

StringWalk is complete as an experiment. It answered the question it was built to
answer, reached a wall it had itself described in writing, and the work carried on
somewhere else. Read it as a finished chapter rather than a closed one.

This file replaces `PROPOSAL.md`, `REFACTOR.md` and `TODO.md`. It keeps their
conclusions and leaves their arguments in git history, where the reasoning stays
available if it is ever wanted back.

`README.md` stays. It describes what this is, and it is still accurate.

## What the question was

Eight uncoordinated producers write down what they know. Each arrived with its own
schema, its own identifiers, its own vocabulary. Can a reader combine all of it and
walk through it, with the producers having coordinated in advance about nothing at
all, and with the tool claiming only what the lines actually say?

## What it established

These are settled now. They were built, driven through nine saved scenarios, and used.

**A fact is exactly three strings, and a path is a value.** A longer line would put a
route's identity into the line's *structure*, and structure is not a string, so
nothing can stand on it, name it, or join on it. A route worth recording becomes its
own exact text, with more lines about it.

**Identity is extensional.** Two occurrences are the same thing when their bytes
match. A string is its own name, and two producers reach the same node by writing the
same characters. `paris` in a nursery receipt meets `paris` in a JSON blob because
they are one string, and the meeting happens on its own.

**Union is the whole merge.** `cat pile/introduced/*.pile | sort -u`, and that is the
entire operation. Which also makes a pile a grow-only set — commutative, associative,
idempotent — so replicas could converge with zero coordination. That property sat
there available and unexercised.

**Commitment happens at read time.** A taxonomy belongs to a reader. A join's
soundness is a reader's judgment. A shortened column is a reader's display. What gets
decided at write time stays open for a later reader to decide differently.

**Evidence is kept; interpretation is disposable.** `pile/introduced/` holds the one
thing that regenerating would lose, so it is the one thing stored. The cut rebuilds in
memory on every start and dies with the process. A bad cutter is a bug to fix before
the next run, and the data survives it.

**One state machine, three clients.** `step(ctx, session, command)` is pure, so the
shell, the server and `read.ts` differ in how a reading *looks* and agree entirely on
what a reading *is*. Purity is also what lets the server stay stateless: the client
carries the session and sends it back with every request.

**A reader walks in rather than writing a query.** Every step shows what is reachable
from where you stand, and how many of this column's values can get there. Holes appear
as `?`, so a row that found nothing still shows up and says so. The pivot sits in the
column to the left, where a person can weigh a join the tool declines to vouch for.

Scale it ran at: 966 introduced lines over 8 piles, 113 distinct relations, 498
distinct strings, 187 phrases, 85 kinds, 2 cutters, about 3,500 lines of TypeScript
with zero runtime dependencies.

## What it could not do

The wall was self-diagnosed, in the project's own words, three separate times.

From `README.md`, on the empty relation:

> There is no way for a third party to name a relation its producer left empty.
> `""` is an invitation to say it later and nothing accepts the invitation. That
> is a gap, not a decision.

From `README.md`'s closing section:

> the empty relation is already an invitation: it is a line saying *something goes
> here and I do not know what yet*, and the obvious next thing anyone will want is
> to say it later.

And from `REFACTOR.md`, naming what a line-level name would have bought:
**supersession**, **per-line attribution**, and **claims about claims** — with the
observation that each one is reachable only that way.

The shape of the wall: **a line is a complete self-describing fact, and speaking about
one requires a place to stand that the format withholds.** Everything above follows
from the line being whole, and so does the limit.

A second, smaller wall is worth recording. The relation carried a grammar —
`"ip, resolves-to, has-address, host"` — and the reader's whole vocabulary was parsed
out of it. That grammar turned out to be load-bearing for the UI, which grew to serve
it: three spellings of every step, a merge marker for ambiguous kinds, a canonicaliser,
and an edit-distance matcher. All of it served the grammar rather than the reader.

## The proposals, and what became of them

**Remove out-of-process cutters** (`PROPOSAL.md`). Sound and unexercised — every actual
cutter is a TypeScript function, and the subprocess path bought language independence
that stayed hypothetical while costing a second error model, a second performance
model, and executable-bit-as-configuration. Left in place here. EdgeOnEdge should
settle on one cutter contract, or on none.

**Three purity items** (`PROPOSAL.md`, "one level up"):

- *Errors returned rather than thrown* — the useful part is done. `load()` used to
  parse a query, catch, and parse a second time to recover the tree that one catch
  block could no longer distinguish. Split into two catches; the double parse is gone
  (`e6dea95`). The wider `Result`-type project stays undone, since TypeScript offers
  no `?` operator to make it cheap.
- *`readonly` on the core types* — undone, cheap, and still worth it. The runtime
  already freezes every line; the types stay silent about it, and `session.ts` leans
  on a clone ten lines earlier to keep `node.short = !…` safe.
- *An effect interpreter for `cut.ts`* — skipped. `scenarios.ts` drives the real shell
  and diffs a transcript, which buys the same confidence for far less machinery.

**Move relation parsing into a cutter** (`REFACTOR.md`, change A). **Rejected.** The
engine would have to match literal relation strings like
`"relation, forward, forward-of, phrase"` to rebuild its own walking index, planting a
fixed vocabulary in the one place this project keeps clear of one. Prototyped: it adds
676 lines, puts three machinery kinds at the top of the opening menu, and moves 308
lines of saved transcripts. The crash it removes has yet to fire — across 113 distinct
relations in the whole cut, every one parses.

**Give a line a name** (`REFACTOR.md`, change B). **Correct, and superseded.** The
analysis holds: supersession, attribution and claims-about-claims arrive together or
stay out of reach, and a content hash over a canonical spelling would have bought all
three. EdgeOnEdge reaches them by making identity structural instead, which costs it no
frozen canonical form.

**Proven, policy-aware partitions** (`TODO.md`). Unmet, and carried forward. Splitting
a document's lines into separately governed partitions — a public one, a protected one
— with a proof that their union reconstructs the original. It sat awkwardly in
StringWalk, where a line is atomic and every cutter sees the whole cut. It looks more
tractable next door, where each assertion carries its own identity and can be
attributed and governed on its own. Restated in `EDGEONEDGE-MIDDLE.md`.

## What carries forward, and what stays behind

**Carries.**

- Strings deduplicate; the join lands on literal bytes; producers stay uncoordinated.
- Position is the one thing that says what role a string plays.
- Three and nothing longer, for the original reason.
- Commitment happens at read time.
- Evidence kept, interpretation disposable.
- A taxonomy belongs to a reader.
- The tool puts evidence beside the claim and stops there.

**Stays behind.** Each of these was load-bearing here, so a reader arriving from
StringWalk will expect it:

- *"A relation has a shape."* The 0/2/4 field grammar is gone. The middle slot now
  holds an identity, so there is nothing to parse and no `readRelation`.
- *"Verbs come in pairs; naming one and not the other is half a job."* A single named
  direction now stands as a complete state of knowledge.
- *`kindOf` as the last word of a phrase.* Kinds get stated, rather than parsed.
- *"Equal strings are equal readings"* at the relation level. Two identical assertions
  count as two assertions, by design.
- *"`sort -u` is the whole merge."* Still mechanically true; making two independent
  producers agree is now a reader's job, by design.
- *Cutter idempotence.* A cutter that mints identities produces fresh nodes on every
  run. That rule needed rewriting rather than inheriting.

**The likeliest leak is the code, rather than the vocabulary.** Importing
`stringwalk.ts` brings `readRelation`, `checkLine`'s relation validation, and `kindOf`
— three functions encoding rules EdgeOnEdge sets aside. `checkLine` alone would refuse
every line it writes. Fork the file, and delete those three on day one.

## Where the thread goes

EdgeOnEdge starts from the wall rather than from the format. A connection gets recorded
as a bare, identified thing that says nothing about itself; what it means arrives as
other connections pointing at strings; and naming waits for somebody to do it. The
empty relation graduates from special case to the default state of everything.

The name says the move. An edge resting on an edge is the one thing an ordinary graph
forbids, since an edge there is defined by the two nodes it joins and can never be a
thing in its own right.

The work continues in a sibling directory, `../Attempt2026-EdgeOnEdge`:

```text
EDGEONEDGE-CORE.md     what is settled, and what stays deliberately open
EDGEONEDGE-MIDDLE.md   the derivation layer, sketched
EDGEONEDGE-UI.md       what it should feel like to use
```

The substrate carries over intact: three strings a line, strings deduplicate,
`sort -u` merges, position says which is which. What changes is the middle field — it
stops describing and starts identifying, and everything the description used to carry
moves out into lines that anyone can dispute.
