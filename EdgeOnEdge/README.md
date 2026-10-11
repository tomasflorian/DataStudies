# EdgeOnEdge

*Data Studies: EdgeOnEdge, September 2026*

If you have designed schemas, you know the usual order: decide the tables, columns and types,
agree on a class hierarchy, then load data that fits. EdgeOnEdge tries the opposite order.
Files come in as they are — logs, a hosts file, a DNS zone, a nursery receipt, a party plan —
and the structure you would normally declare up front is read off the data afterwards, by
whoever is looking.

```sh
node eoe.ts                                     # build the demo's layers, walk them at http://localhost:8788
node eoe.ts more.eoe                            # the same, with lines from anywhere else as one more chip
node eoe.ts --only demo/layers/base.eoe         # walk only the files named, as they are
node cut.ts cutters/hosts.tsv demo/raw/hosts    # what one table says about one file
node check/drift.ts --save; node check/drift.ts # remember the walk's answers, then see what moved
```

Node 24 runs the TypeScript as it is: no build step, no dependencies.

## The same data, two ways

Take one address that three files mention:

```text
hosts file   10.2.14.7    backup-03.corp   backup-03
DNS zone     backup-03.corp.   IN  A  10.2.14.7
auth log     Sep 18 09:02:44 build-01 sshd[1290]: Accepted password for tomas from 10.2.14.7 port 60211
```

In a schema you would design `hosts(ip, name)`, `dns_records(name, type, value)` and
`log_entries(time, host, program, …)`, pick a type for each column, and write the joins
between them. Here, each file is cut into pieces, and each piece is linked to the text it
was found in:

```text
"10.2.14.7    backup-03.corp   backup-03"  ──▶  "10.2.14.7"        tagged ip, address
"backup-03.corp.   IN  A  10.2.14.7"       ──▶  "10.2.14.7"        tagged ip, address
"Sep 18 09:02:44 build-01 sshd[1290]: …"   ──▶  "10.2.14.7"        tagged ip, from
```

The three lines meet because they contain the same string. There is no foreign key to
declare: identical bytes are the same node, so the join is already there when you walk it —
from the login, to the machine it came from, to its name in DNS.

<p align="center">
  <img src="images/PointingAtPointing-green.png" alt="Three identical figures pointing at each other" width="420">
</p>

## Your concepts, translated

| You know | Here | What changes |
|---|---|---|
| **a column's type** | a tag on one occurrence: `10.2.14.7` *is an ip in that line* | a value can carry several types — `18` is a day in one line and a port in another — and none is declared ahead |
| **a row** | a piece of a file, with the things found inside it | a row is also a value: the zone line is a part of the zone file and the whole of its ip |
| **a join / foreign key** | the same string appearing in two places | joins come from the data, including between files that were never designed together |
| **a namespace** | a vocabulary: IT's `host` and the party plan's `host` are different words | homonyms stay apart; a vocabulary also works as a filter you switch on and off |
| **a class hierarchy** | the *tower*: `ip` sits under `address` | it can be **said** by someone (`broader address = ip host`) or **seen** in the data (every string found as `vault-note` is also found as `notes`); the page marks which |
| **metadata columns** (source, created-by) | more lines: a text says which file it was read from, a tower step which tuning said it | provenance is data like any other, and can be tagged in turn |
| **a migration** | a new cutter table, or a new version of one | the layers are rebuilt from the raw files, so the pile always holds what today's tables find |
| **a constraint** | only well-formedness: a line is two ends, each a string or a reference to a line | data that fits no pattern is kept as text, not rejected |

Underneath, everything is one shape — a line of two ends, `[left, right]`. An end is a string,
a value, or a number, a reference to another line. A line's id is a hash of its two ends,
worked out when it is read and never stored: a reference is a line folded up, and anyone
holding the line can fold it the same way. So a value that happens to spell an id is still
a value — the type says which is which. A line is an arrow from its type-ish end to its
value-ish end: a whole before its part, a vocabulary before its word, a word before the
finding it names. Everything more an arrow means is said by other lines:

```text
[130584905024476,"eoe: syslog\nSep 18 …"]                     this text was read from a file
["Sep 18 … from 10.2.14.7 port 60211","10.2.14.7"]            the part was found inside the whole   (its id: 272325604139824)
[29342904932423,272325604139824]                              that step is seen: the part is there in the whole
["IT","ip"]                                                   a sense: the word ip, in IT           (its id: 156473796390586)
[156473796390586,272325604139824]                             the finding carries the word ip
[170628390243950,156473796390586]   ["<VOCABULARY>","IT"]     ip is a noun, and IT is a vocabulary
```

The numbers that are not explained there are words too: `130584905024476` is the line
`["eoe","file"]`, `29342904932423` is `["eoe","seen"]` and `170628390243950` is
`["eoe","noun"]` — words in the pile's own vocabulary, `eoe`.

*Contains* is the steps said to be seen: steps whose right end is found inside their left,
which anyone holding the two strings can check (`seen.ts` writes those claims). A word is a
*sense*, an arrow from a vocabulary to a text, so IT's `host` and the party plan's `host` are
two senses that meet at the string `host`. What a word is (noun, verb), where it sits in the
tower (broader), who said a line (source) and which steps are seen are said with words in
`eoe`, the few words the page knows by name (`core/markers.ts`). The only reserved string is
`<VOCABULARY>`, which says a name is a vocabulary. `SPEC.md` describes the model in full.

The pile is written in layers, files that are unioned when it is read. Nothing reads which
layer a line came from, so any set of them makes a pile:

```text
base      what was read: each file's text, what was found inside what, and which steps are seen
types     the words, and which words each finding carries
lattice   the tunings' switches and tower
files     where things came from: the file a text was read from, the tuning that said a line
```

## Why give up the schema

- **The sources do not agree on one.** A hosts file, a DNS export and a receipt were never
  designed together. A schema has to pick one view of them before anyone asks a question;
  here each reader can hold their own, and the data does not change.
- **Type and value are positions, not categories.** `account` is the type of `root` and an
  instance of `identity`. In a class system those are different layers; here they are the
  same kind of string, one step apart.
- **Structure you discover is still structure.** The page builds the hierarchy from what the
  data shows, adds what someone claims, and marks the difference. How broad a word is
  depends on today's data, and moves as more arrives.

What you give up is real: data is not checked against a shape when it arrives, a query is a
walk rather than a `SELECT`, and a hierarchy discovered from a small pile includes
coincidences (in the demo every city happens to be an argument to a shell script). The page
shows those as they are, marked *seen*, rather than hiding them.

## Walking it

Start from a type (`ip`), or from *whole* or *part*: every string something was found
inside, or every string found inside something — there whatever is loaded. Each column is one step from a column to its left — down into a piece,
or up to what contains it — and each row keeps the evidence for its join. The search box sits
over the first column and holds that column only: type `paris` and the kinds list keeps the
types that have it, and a reading keeps the rows whose first cell does. Switches on the left
filter by vocabulary; a click on a cell shows the file lines it was read from, and a
double-click starts a new reading from that one string.

Base is always loaded; *types*, *lattice* and *file names* are chips in the header. Switch
one off and the reading stays, saying what the pile says without it: with base alone, steps
are only `part` and `whole`; types name them and nest what the data shows (*seen*); the
lattice adds what the tunings claim (*said*); file names give each cell its file and line.

## How the pieces fit

Each raw file names what it is on its first line (`eoe: zone-file`). The tables in
`cutters/` recognize files and cut them, tagging what they find with words from their
vocabulary. The files in `tunings/` add filters, tower claims and display names.

```text
core/       lines: identity, parse, union, check, index; moves: up and down; the markers, the few
            words the view knows by name
walk/       the column walk, one concern per file — words, structure, switches, lattice,
            types, files, steps, reading, kinds — its server, and its page
cascade.ts  cutting (cut.ts runs one table on one file)     tune.ts   the tunings, as lines
produce.ts  the shapes of line every producer writes, and the layers   seen.ts   which steps are seen
eoe.ts      build the layers, serve                                    SPEC.md   the model
check/      layers.sh (the layers point one way), drift.ts (the walk's answers, compared)
```

## Earlier studies

EdgeOnEdge continues a line of experiments:
[Reversible Function Graph](../ReversibleFunctionGraph/)
→ [StringWalk](../StringWalk/) → EdgeOnEdge.

**Reversible Function Graph** recorded function calls as strings and derived a graph
that readers could walk forwards and backwards. Its walk exposed a limit: arguments
beyond the first could be stored without ever being reachable in a table. The
[postmortem](../ReversibleFunctionGraph/POSTMORTEM.md)
explains how that led to a simpler unit.

**StringWalk** made each fact three strings — `[value, relation, value]` — and built
readings by walking through shared values. Kinds and verbs described each relation.
It ended with an open question: if the values record what was found and the relation
is someone's interpretation, how can another reader describe that connection without
rewriting the original fact?

**EdgeOnEdge** gives the connection itself an identity. The middle string identifies
the link between its two ends; descriptions become tags on that link, and tags can
themselves be tagged with vocabulary and provenance. The pile, joins through identical
strings, and column walk carry forward. The continuing question is how much structure
readers can build from the evidence after it arrives.

## Where it wants to go

- **Identity from tags.** A set of tags that picks out one thing — "the 2021 linksys router"
  — is a name for it, readable when ids are not. Two files describing the same thing with
  different strings could meet on overlapping tags, not only on identical bytes.
- **Graded hierarchy.** "95% of X is inside Y" instead of all or none, once the data is big
  enough for coincidences to wash out.
- **Recognition by content**, so tables know a zone file when they see one instead of
  reading the hint line.
- **Big files.** Each piece currently repeats its whole file's text; large files will need a
  shorter reference.
