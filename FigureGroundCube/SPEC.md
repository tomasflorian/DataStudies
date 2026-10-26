# FigureGroundCube — spec

*Data Studies: FigureGroundCube, October 2026 — draft*

*Marks on blanks.* Store facts. Every way of cutting a fact is a node, and facts meet on the
ground they share.

This spec gathers what the earlier studies found into one structure. Section 10 checks it
against each of them, and section 11 names what it costs.

## 1. The fact

A fact is exactly three ends, written as a JSON array, one per line:

```
["paris", "length", "5"]
```

Read it as a sentence: *paris length 5*. The positions are roles, and they never change:

```
[ input , function , output ]
```

- **An end is a string or a reference** (section 8). A string is any text: a whole document, an
  address, a single character. All three slots hold ends, the function included: the word comes
  from EdgeOnEdge, where a line has two ends and neither is the start, and here a fact is a line
  with three.
- **Role comes from position.** There is no label field. The function is the string in the
  middle; `length` here is a function because it is in the middle, not because of what it says.
- **Every fact names its relation.** A bare pairing uses the generic function `rel`:
  `["paris", "rel", "france"]`. There is no empty middle, so no fact has to be read as "something
  is missing here".
- **A fact is a claim**, usually that a function was run and gave this answer. A hand-written
  line works just as well.
- **A call with several answers is several facts.** A function that gives no answer writes
  nothing.

**Producers** write facts, as in ReversibleFunctionGraph: *intake* reads the world and keeps it
(a whole file can be one string, kept as its source wrote it, section 7.4), and *cutters* read
the pile and write more facts back. The same two rules hold, so the loop that reruns cutters
ends in one place:

- **Pure:** the same input gives the same facts.
- **Monotone:** a bigger pile gives more facts, never fewer. An absence never changes an answer.

A producer may read the pile to decide what to call. It does not read the pile to decide what
the answer is.

## 2. The pile and the graph

- **The pile** is the facts that producers wrote: a set of lines. Two piles merge as a union,
  `sort -u`, in any order. The pile holds only what someone said.
- **The graph** is what a reader walks: the pile, plus everything the rules in sections 3 and 4
  add. None of it is written to the pile, and all of it is always there. It is rebuilt whenever
  the pile is read.

Nothing in the graph is a choice a reader makes. What a reader chooses is which parts of it to
follow (section 7).

## 3. The cube

### 3.1 Forms

A **form** is three slots, each holding an end or a **blank**. A fact is a form with no blanks.
In this spec a blank is written `?`; stored, it is JSON `null`, which no string can be, so a
blank never collides with text.

```
["paris", "length", null]          written   paris length ?
```

A form with blanks is a question; a form with none is a fact. They are the same kind of thing
with a different number of blanks. Each form is an answer to the forms below it and a question
for the forms above it.

### 3.2 A fact's cube

Cutting a fact keeps some of its slots and blanks the rest; what is kept is the figure, the
blanks are the ground. Each subset gives a form. A fact has eight, and they form a cube:

```
                     paris length 5                      no blanks: the fact
             /              |              \
    paris length ?      paris ? 5      ? length 5        one blank
          |      \      /         \     /      |
     paris ? ?        ? length ?        ? ? 5            two blanks
             \              |              /
                          ? ? ?                          all blank
```

- **A node is a form.**
- **An edge fills one blank.** Going up adds a mark; going down blanks one out.
- **A form's id is its content**: a hash of its three slots, with each slot's kind (string,
  reference, blank) and length hashed with it, as in EdgeOnEdge's `core/identity.ts`. The same
  form from any fact, in any pile, is the same node. Drawing it once or several times is a
  display choice.

### 3.3 The three one-blank forms

Each one-blank form groups the two slots a question knows:

| form | groups | is | answers |
|---|---|---|---|
| `paris length ?` | input and function | **a route**: the length of paris | what is it? |
| `? length 5` | function and output | **a class**: things of length 5 | what has it? |
| `paris ? 5` | input and output | **a connection**: paris to 5 | how are they related? |

Earlier studies each kept one of these. ReversibleFunctionGraph's call node is the route.
EdgeOnEdge's line is the connection. The class had no node anywhere, which is why a bare `5`
became a hub (section 5). Here all three exist at once, and nobody has to choose.

## 4. Roles and the identity cube

### 4.1 Forms are bound to roles

`paris ? ?` does not mean *paris*. It means *paris, as an input*. `? ? paris` is paris as an
output. These are different nodes:

```
PARIS lower paris        has   ? ? paris
paris length 5           has   paris ? ?
```

The two facts' cubes share only `? ? ?`.

### 4.2 The identity cube

For every end that appears in the pile, the graph includes the cube of the fact that end makes
in all three roles:

```
                      paris paris paris
              /               |               \
    ? paris paris      paris ? paris      paris paris ?
          |      \       /          \      /       |
     ? ? paris          ? paris ?          paris ? ?
              \               |               /
                            ? ? ?
```

`paris paris paris` reads as *paris(paris) = paris*: the end is itself in every role. This is
the **diagonal**. Its two-blank forms are exactly the end's three role forms, so it is what
connects them.

**Rule.** The graph is the pile, plus the cube of every fact, plus the identity cube of every
end in the pile.

- **A chain crosses roles through the diagonal.** PARIS lower paris, then paris length 5:

  ```
  PARIS ? ?  ↑  PARIS lower paris  ↓  ? ? paris  ↑  paris paris paris  ↓  paris ? ?  ↑  paris length 5
  ```

  Climb to a fact, come down on its output side, climb through the diagonal, come down into
  the input role, climb the next fact. Each crossing is one step of composition.
- **Fixed points meet the diagonal.** `paris lower paris` agrees with the diagonal on input and
  output, so the two share the face through `paris ? paris`. A function that leaves something
  as it was is marked by the shape, with no extra rule.
- **A function is an end like any other.** Facts *about* `length` have it as an input
  (`length ? ?`); calls of it have it in the middle (`? length ?`). The identity cube of
  `length` connects them. ReversibleFunctionGraph's open question, *walking to a function*, is
  one role crossing.

## 5. Meeting

### 5.1 What two facts share

Two cubes share the forms that keep a blank wherever the facts disagree. The facts never
choose this; their contents decide it:

| facts | agree on | share | |
|---|---|---|---|
| `paris length 5`, `paris length 5` | 3 slots | the whole cube | one fact; the union keeps one copy |
| `paris length 5`, `tokyo length 5` | 2 slots | a face: `? length 5`, `? length ?`, `? ? 5`, `? ? ?` | same class |
| `paris length 5`, `entry17 reps 5` | 1 slot | an edge: `? ? 5`, `? ? ?` | only the bare `5` |
| `paris length 5`, `venus kind planet` | none | a point: `? ? ?` | nothing |

The dimension of what two facts share is the number of slots they agree on. Every shared part
contains `? ? ?` and lies in the bottom half of both cubes: **facts meet at the bottom and differ
at the top.**

### 5.2 Crowdedness

How crowded a form is is the number of facts above it. `? ? ?` is above nothing in particular
and under everything; `? ? 5` is under everything that ever landed on 5; `? length 5` is under
the five-letter words only. A meeting at a crowded form is weak evidence; a meeting at a rare
one is strong. `225 days` under `orbitalPeriod` is the Greeks finding that the evening and
morning stars are one; `5` under `length` is paris and tokyo, true and nearly worthless.

The hub problem of the earlier studies is a meeting at the edge `? ? 5`, where `paris length 5`
and `entry17 reps 5` look alike. The class form `? length 5` sits one level higher and keeps
them apart.

**Meetings add up, if they look at different things.** `Paris` and `Pařis` are not identical,
but both are above `? length 5` and above `? contains p,a,i,s`. Each meeting is crowded; the two
together are rarer. Not rare enough, though: `pairs` is above both, because neither looks at
order, and the two overlap. Meetings add up as evidence only when they look at different
things, and one sharp function (`stripAccents`) can beat several blunt ones. This is
Fellegi–Sunter, the bits argument in PHILOSOPHY.md's SpeedOfTime section, and the degree² cost
in EmergentIdentityGraph's `PLAN-MINIMAL.md`.

### 5.3 Only exact ends meet

Cubes share forms only where ends are identical. `Paris` and `paris` do not meet. Every coarser
sameness is a fact of its own, written by a producer (section 9).

## 6. Figure and ground

Swap marks and blanks in a form and you get the **opposite corner** of the cube:

| form | its opposite | the split |
|---|---|---|
| `paris length ?` | `? ? 5` | route and answer: `paris length \| 5` |
| `? length 5` | `paris ? ?` | class and member: `paris \| length 5` |
| `paris ? 5` | `? length ?` | connection and label: `paris (\|length\|) 5` |
| `paris length 5` | `? ? ?` | all figure and all ground |

The three ways to cut a fact are the three pairs of opposite corners. Either half, put back on
its opposite, gives the whole fact. `? ? ?` is the ground everything stands on; each mark is
figure on it. PHILOSOPHY.md: *the next reader's figure may be this reader's ground.*

The connection is the cut that looks odd in a line of text, because `paris` and `5` are not
neighbours, and natural in a drawing, `paris ──length──▶ 5`. It is the reading where the
function stops being a piece and becomes the separator.

**A template is a form inside an end.** `Accepted password for ? from ? port ?` is figure and
ground one level down: the skeleton is the figure, the slots are the ground, and every login
line fills it. The difference is that a fact has three given slots, while a line has any number
of pieces and nobody has said where they are. Once a line is in pieces, the same moves find its
template: blank every subset of the pieces, keep only the forms other lines land on (section
9), and take the form with the most figure that is still crowded. Blank too little and one line
fits; blank too much and everything does. This is SymSpell's deletes one level down, and close
to what log-template miners such as Drain do. Where the pieces come from in the first place is
finding, and stays with SpeedOfTime and MonoFlow.

## 7. Reading

### 7.1 Every question is a form

The basic read is one operation: **the facts above a form.** The four kinds of "is" (see
PHILOSOPHY.md) are built on it:

| "is" | operation | form | example |
|---|---|---|---|
| predication | look up | output blank | `venus brightness ?` → bright |
| membership | collect | input blank | `? kind planet` → venus, mars, earth |
| identity | join | two facts above one form, through the same function | `? orbitalPeriod 225 days` → evening-star, morning-star |
| existence | count | collect, join, count the groups | wanderers: 3 with no joins, 2 joined on `orbitalPeriod`, 1 on `kind` |

Every count states three things: what is counted, under which sameness, in which pile. A count
is about the pile, never the world: nothing tagged is not nothing there.

**Membership is measured, then classified.** The `kind` in the table is someone's rule, not a
fact of nature. `bright` is a magnitude put in a bucket by a threshold someone chose. `planet`
is three measurements (`orbitsSun`, `isRound`, `clearedOrbit`) combined by a rule someone chose,
which is why the IAU could demote Pluto without Pluto changing. Who decides goes in the middle
slot: `["pluto", "kindIAU2005", "planet"]` and `["pluto", "kindIAU2006", "dwarf planet"]` are
both true.

### 7.2 Descriptions

AND several forms together and collect what is above all of them. A description that leaves
exactly one thing picks it out: `rocky yes` leaves Mercury, Venus, Earth and Mars; `moons 0`
leaves Mercury and Venus; add `atmosphere thick` and only Venus is left. This is Russell's
definite description ("the author of Waverley"), a candidate key in a database, and
EdgeOnEdge's *identity from tags*.

- **Picking out is not yet identity.** Identity is two unique descriptions landing on the same
  thing: the rocky moonless planet with a thick atmosphere, and the morning star.
- **Uniqueness is counted under the joins already made.** With `["Phosphorus", "seenAt",
  "dawn"]` and `["Hesperus", "seenAt", "dusk"]` unjoined, "seen at dawn AND seen at dusk"
  returns 0, because no single input is above both forms; joined, it returns 1. A description
  that comes out unique is a reason to make a join, so identity is built up a step at a time.
  An early Greek pile never joined the two names, and there the question returns 0.
- **Unique means unique so far.** Add a rocky moonless planet with a thick atmosphere around
  another star and the description returns 2. The answer changes because new data speaks to
  it, and nothing else changes (CHECKLIST 8).

### 7.3 Kinds

The same string can be different kinds of thing. `-4.6` might be a temperature in Calgary or a
star's brightness (its magnitude). The string does not say which; the function that gave it
does. So a kind is written as a fact about a function:

```
["celsius",      "gives", "temperature"]
["magnitude",    "gives", "magnitude"]
["brightBucket", "takes", "magnitude"]
```

`gives` and `takes` mean nothing special to the store; they are strings like any other. Their
meaning comes from a reader that chooses to follow them.

A chain takes the output of one fact as the input of the next. Without a check, every step can
be true and the chain nonsense: `calgary-am celsius -4.6`, then `-4.6 brightBucket bright`, and
a cold morning comes out bright. So before following a chain, a reader can check that what the
first function gives is what the next one takes. Here `celsius` gives a temperature and
`brightBucket` takes a magnitude, so the chain stops. The check is on the functions, not on the
string: `-4.6` is still one string, and a reader who only wants "the same number" ignores kinds
and crosses. Writing the kind into the value (`magnitude:-4.6`) would split "same number" for
good, which is a sameness decided at write time.

### 7.4 Two answers to one question

Two clerks write down the same birth, one lazy and one thorough:

```
clerk 1:  alice born 1991-03-01
clerk 2:  alice smith, maiden name jones, living at 12 elm st, born 1990-03-01 at 9 am
```

Neither line is the record. Both were written, and both are kept as written.

**An input is a whole, as its source wrote it.** A terse clerk gives a short whole and a
thorough one a long whole; neither is cut down or filled in. The pieces are outputs:

```
["alice born 1991-03-01",                 "firstName", "alice"]
["alice born 1991-03-01",                 "birthdate", "1991-03-01"]
["alice smith, maiden name jones, …",     "firstName", "alice"]
["alice smith, maiden name jones, …",     "maidenName", "jones"]
["alice smith, maiden name jones, …",     "birthdate", "1990-03-01"]
```

**The pile has no conflict.** The two lines are different strings, and each has one birthdate.
Nothing in the pile says they are about the same person.

**They meet, and the meeting is evidence.** Both lines are above `? firstName alice`. Whether
that makes them one alice is a reading, not a fact (section 5). How much the meeting is worth
is crowdedness: there are many alices, so the meeting is weak. Clerk 1's line can only ever
meet on crowded forms like this one; clerk 2's also reaches rare ones (`? maidenName jones`,
the address, the hour). So clerk 1's line is cheap to read and weak evidence of who someone is,
and clerk 2's is the line that can settle it. Nobody grades the clerks. The difference comes
from which forms each line reaches.

**Under a join, a fork.** A reader who joins the two lines on `alice` and asks
`alice birthdate ?` gets two answers. Call that a *fork*: two facts above one route. A
*meeting* is two facts above one class (`? birthdate 1990-03-01`, with bob born the same day).
They are the same structure from opposite cuts (section 6): a meeting is a hint of "same", a
fork a hint of "different".

**Two answers are not always a problem.** Two phone numbers are just two phones. Whether a fork
matters depends on the function, and saying so is a fact like any other:
`["birthdate", "oneAnswer", "yes"]`. It belongs to a reader or a purpose, not to the pile.

**A fork has four explanations.** Each one says that one sameness was assumed wrongly:

| explanation | wrong assumption | where |
|---|---|---|
| two alices | the inputs are the same | input |
| one date is a typo (`1990` and `1991` are one character apart) | the outputs are different | output |
| one clerk's "birthdate" means something else, such as a registration date | the functions are the same | function |
| one clerk is wrong | the saying is true | a fact about the fact (section 8) |

The evidence for each is mostly already in the cubes: how crowded `alice` is, how far apart the
two dates are, how often a clerk forks with others. Before a fork counts at all, each answer is
read back up to the whole it came from. A fork made by a cutter that cut too small (dropping
`smith`) disappears there.

**The pile resolves nothing.** A reader who must choose, say to send a birthday card, writes
the choice as a fact about facts (`[#(card), "chose", #(…)]`). The next reader can choose
differently, and the fork stays visible. The cost is branching: an open fork doubles every
chain that goes through it (`birthdate`, then `age`, then `canVote`). A purpose that never
follows `birthdate` never pays for it.

### 7.5 Purposes

A purpose is a choice of which functions to follow, which kinds to require, and how to weigh
crowded meetings. Paying a debt follows `denomination` and ignores `owner`; a museum follows
both. Comparing two wholes is a row per function: two coins meet on `denomination nickel` and
fork on `owner` (adam smith, joe blow), and the purpose weights the rows. Graded overlap ("95%
of X is inside Y") is the share of rows that meet. Purposes can be facts too (`["museum",
"follows", "owner"]`), so they can be shared and argued about like anything else. Reading
picks the sameness; storing never does.

## 8. Facts about facts

A reference is a form's id. It can sit in any slot of a fact, so anything with a form can be
talked about:

```
[#(paris length 5),   "saidBy",   "scan.ts"]           who said a fact
[#(paris length 5),   "markedAs", "wrong"]             a reading of it
[#(? kind planet),    "label",    "the planets"]       a name for a class
[#(markedAs wrong),   "saidBy",   "tomas"]             a reading of the reading
```

(`#(…)` here means the id of that form.) A reference may point at a form no fact fills, such
as a class: its id is computable whether or not anything stands above it.

- **More than three parts** is facts about a fact: `[#(paris capitalOf france), "since",
  "1944"]`.
- **Revising a reading** is adding another reading beside it. Nothing is replaced, and the pile
  stays append-only.
- **A person outranks a guess** as a rule in the reader: a fact said by a person wins over one
  said by a cutter when the two disagree.

## 9. Sameness from a library

Exact ends meet for free (section 5). Every other sameness is a fact written by a producer that
runs a library of functions:

- **Prefer many-to-one functions:** `lower`, `trim`, `stripAccents`, `toMinutes`, `year`. Two
  ends meet at a shared output without anyone comparing the pair, so there is no n².
- **Keep only facts that land on something.** Norvig's spelling corrector keeps only candidates
  that are known words. A one-to-many function, like edits, can be turned into a many-to-one
  one by applying it to both sides and meeting in the middle (SymSpell: deletes only).
- **The library is the write-time decision**, with the kinds each function takes and gives.
  Adding a function adds facts to old data too, so the decision can change at any time.

## 10. What it covers

FigureGroundCube aims to hold everything the earlier studies held, as facts and forms. Where
an earlier study *found* structure (boundaries, units, templates), FigureGroundCube does not
find it; the finder becomes a producer, and what it finds becomes facts. That is the line
between a store and a method, and it is drawn in each row below.

### 10.1 Study by study

**ReversibleFunctionGraph.** Its atom `[fn, input, output]` is a fact with the slots reordered.
Moving a pile over means rebuilding it from the producers, all at once: every slot is a plain
string, so a pile with both orders in it looks valid and reads as nonsense. Its call node is
the route form `paris length ?`. *Conflicts look like answers* becomes a fork: two facts above
one route, read under a join (section 7.4). *Walking to a function* becomes a role crossing
through the identity cube (section 4.2). *Vocabulary is per producer* (two `first`s) becomes a
question of kinds, and of names by content (`emp_3fa9`) with `["emp_3fa9", "kindOf", "emp"]`
for the family.

**StringWalk.** Its `[value, relation, value]` is the same shape. Its kinds, packed into the
relation string, become facts about the function (section 7.3). Its rule *three, and nothing
longer*, which ended long lines because a route's identity sat in a line's structure where
nothing could stand on it, is kept, and goes further: every part of every fact is a form that
can be stood on and referenced. Its open question, revising a relation without rewriting a
value, is a fact about a fact.

**EdgeOnEdge.** Its line `[left, right]` is a two-slot fact; in three slots it names its
relation, `[whole, contains, part]`. Its ids by content, lines about lines, senses in
vocabularies, tunings and layers carry over as facts, references and files of facts unioned on
read. Its *seen* step, checkable by looking, sits beside derived steps, checkable by running.
What it lacked was the class: with two slots, `? france` holds capital-of and located-in alike.

**Entwine.** Its occurrences become ends with ids from content, such as the source's hash plus
an offset, `["3fa9:12:17", "text", "10.2.14.7"]`. Joins by default come back through the form
`? text 10.2.14.7`, which every occurrence of that text stands above; a note can sit on one
occurrence because it is an end of its own. Ids no longer change between runs, so forests from
two people merge. Its *jump* is a role crossing, and its open *when a view jumps* has an answer:
meetings within a role are free, and a jump is only for following a chain. Its two `host`s,
IT's and the party plan's, meet only on the label text, a crowded form, and a reader that
requires the kinds to match (a machine, a person) does not follow it.

**SpeedOfTime.** Its overlays, stand-off readings of earlier moments, are facts about
references. The stream itself, one moment per symbol, is not a good fit for facts (section 11).
Its finders, surprise and boundaries, are producers whose results are facts:
`[#(span), "boundaryStrength", "6.2 bits"]`. Naming a found unit is a fact a person adds,
`[#(span), "label", "login"]`, and it outranks any guess (section 8).

**TimeGraph and MonoFlow.** Both find units in a stream. Their units, and the evidence for
them, are facts; the finding stays theirs.

**EmergentIdentityGraph.** Identity as strength of connection is section 5: the dimension of
shared forms, the crowdedness of each, and descriptions ANDed together. Not checked against
EIG's code.

### 10.2 Against CHECKLIST.md

| # | item | in FigureGroundCube |
|---|---|---|
| 1 | merge without coordination | by construction: piles are sets of facts, ids are content |
| 2 | same thing, different names, not fooled by coincidence | crowdedness and descriptions; the IP that moves is a crowded form, and tense is a fact about a fact. Not built |
| 3 | meet across sources by shared text | by construction: identical ends share forms |
| 4 | exact playback | an intake fact holds the file as one string |
| 5 | every occurrence kept | occurrences as ends with content ids (Entwine row) |
| 6 | say something about one occurrence | a fact about that occurrence's end |
| 7 | stories about stories | by construction: references in any slot |
| 8 | adding only adds | by construction: forms and identity cubes follow the facts |
| 9–11, 13 | records, seams, tables, ambiguity without being told | finders, not the store; their results are facts |
| 12 | templates with slots | partly: a template is a form inside an end, picked by crowdedness once a line is in pieces (section 6); finding the pieces is a finder's job |
| 14 | same answer however the files were cut | stated per sameness: under text sameness answers must not depend on the cut; under occurrence sameness they may |
| 15–16 | what holds still; a rebuilt thing keeps its name | the facts that keep holding over time; needs time as facts about facts. Not built |
| 17 | information time | a finder (SpeedOfTime) |
| 18 | start from what you see | any end is a form `x ? ?`, `? x ?` or `? ? x` to start from |
| 19 | frame of reference | standing on a form: on the laptop, IPs come and go above it |
| 20 | one dial from verbatim to gist | not addressed |
| 21–22 | curiosity; rereading pays off | not addressed |
| 23 | same input, same output | by construction, given pure producers |
| 24 | where did this come from? | `saidBy` facts and intake facts |

*By construction* means the property follows from sections 1 to 8 with no further work. Nothing
here has been run yet.

## 11. Trade-offs

**Size.** A fact brings up to seven more forms, and each new end an identity cube. None is
stored, but answering any question quickly means indexing them, and an index on every form
costs several times the pile. Hexastore-style stores pay a similar price for keeping triples in
every order. The pile on disk stays as small as the facts.

**Three slots, always.** One size means every fact can meet every other; a four-slot form and a
three-slot form would never meet. The cost is that anything with more parts is a fact about a
fact. A record with ten columns is ten facts about the record, and reading it back is a step
further than reading a row.

**Raw streams.** A file kept as one string plays back exactly, but a per-symbol stream (one
moment per character, as SpeedOfTime keeps it) written as facts would cost a fact per
character. Streams stay arrays; facts hold what is read from them.

**Exact meeting only.** Nothing meets that is not identical. Every other sameness costs a
producer and the facts it writes, and nothing meets through a function no one ran.

**Reading costs more.** A question must say which functions to follow, which kinds to require
and how to weigh meetings, or a default must say it. An index on one sameness is fast;
following many is not.

**Role crossings are explicit.** A chain takes a hop through the identity cube at every step.
That is the price of meetings within a role being free.

## 12. Open

- **Weights.** How a purpose becomes numbers. Fellegi–Sunter, summed in bits, is one candidate.
- **Rules with several inputs.** The IAU's planet rule needs three answers and a fact has one
  input. A reference to a form may serve as the input; not yet worked out.
- **Time.** Tense as facts about facts (`since`, `until`) is the plan; whether it is enough for
  CHECKLIST 15 and 16 is not known. A thing would be the facts that keep holding: a laptop's
  MAC and hostname stay together while its IP comes and goes, and a server rebuilt with a new
  MAC keeps its name because the hostname still holds.
- **Which identity cubes to index.** All of them are in the graph; whether every end needs its
  diagonal indexed, or only ends that appear in more than one role, is a matter of cost.
- **The first test.** exercisegraph (outside this repo) is a small real pile of sameness
  questions: `5` against `reps 5`, `1:30` against `1.50`, the first attempt of a session, axes
  that pivot.
