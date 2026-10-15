# Entwine

*Data Studies: Entwine, October 2026 — draft*

Entwine reads files as they come — logs, a hosts file, a DNS zone, a receipt — and stores
what was found in them as small trees, without first designing a schema for them. What
those trees have in common is worked out when someone reads them.

## 1. The forest

A **cutter** is a table of regular expressions that reads one raw file and
says what it finds inside it: this line holds an ip, that ip is `10.2.14.7`. What one cutter
says about one file is a **tree**. All the trees from one run of all the cutters make the
**forest**. A tree is an act of reading, not a classification of the world.

Each node of a tree is an **occurrence**: one piece of text at one place in one tree. An
occurrence has three things:

- an **id**, a whole number that names this occurrence and no other. Ids are handed out
  1, 2, 3 … in the order the occurrences are read.
- its **text**, a string.
- at most one **parent**, the occurrence it sits under. An occurrence with no parent is a
  tree's **root**.

```text
id   text                                          parent
3    "10.2.14.7    backup-03.corp   backup-03"     2
4    "regex"                                       3
5    "ip"                                          4
6    "10.2.14.7"                                   5
7    "name"                                        4
8    "backup-03.corp"                              7
9    "backup-03"                                   7
```

Text and identity are separate. If `10.2.14.7` appears in the hosts file and again in a log,
there are two occurrences, with two ids, whose texts happen to be identical. Nothing joins
them unless a reader decides to (section 5).

- **A tree is named by its root's id.** It needs no other name.
- **Trees are ordered.** Because ids are handed out in reading order, a node's children,
  sorted by id, are in the order the cutter wrote them.
- **Trees stay apart.** A parent is always in the same tree as its child, so nothing stored
  connects two trees. Getting from one to another is a reader's jump (section 5).

## 2. Storage

The forest lives in memory: cutting the files again is cheap, so a run happens whenever
someone asks a question. Writing the forest to disk is a serialization, for debugging and
for sharing. It takes two files of JSON Lines (one JSON value per line), so each file says
one thing:

```text
forest/tree.jsonl       [id, parentId]        one per occurrence, in id order
forest/strings.jsonl    [id, string]          one per occurrence, in id order
```

```text
tree.jsonl        strings.jsonl
[1, null]         [1, "eoe: hosts\n10.2.14.7    backup-03.corp   backup-03\n…"]
[2, 1]            [2, "unknownFunction"]
[3, 2]            [3, "path"]
[4, 3]            [4, "raw/hosts"]
[5, 2]            [5, "cutter"]
[6, 5]            [6, "hosts.tsv"]
…                 …
```

A root's parent is `null`. Ids are whole numbers from 1. They mean something only within one
run: the next run numbers everything again.

**Indexes are built from the forest**, never written. Four maps:

```text
parentOf     id → id           each occurrence's parent
childrenOf   id → [id]         the same, turned around, in id order
stringOf     id → string       each occurrence's text
idsOf        string → [id]     the same, turned around
```

## 3. Functions and labels

A cutter says what it found in four levels: the text it looked at, the **function** that
looked, a **label** for what was found, and what was found:

```text
"Sep 18 09:02:44 build-01 sshd[1290]: Accepted password for tomas from 10.2.14.7"
  "regex"
    "host"
      "build-01"
    "user"
      "tomas"
    "ip"
      "10.2.14.7"
```

This is the function → type → value shape, with no fixed number of arguments. A label is
the type.

**The shape recurses.** Every value is text that functions can look at in turn, so a value
can have its own functions, labels and values under it, to any depth:

```text
"eoe: hosts\n10.2.14.7    backup-03.corp   backup-03\n…"     value
  "regex"                                                   function
    "line"                                                  type
      "10.2.14.7    backup-03.corp   backup-03"             value
        "regex"                                             function
          "name"                                            type
            "backup-03.corp"                                value
              "regex"                                       function
                "domain"                                    type
                  "corp"                                    value
```

A tree is as deep as its cutter keeps finding things. Nothing marks a level as the last.

- **A function node is a hint**, not a record of a computation. `"regex"` says the results
  were found in the text by a pattern; it does not say which pattern. `"tolower"` says the
  results were made from the text. Being more exact can come later.
- **Grouped.** One function node per parent for each function, one label under it for each
  label, and every result under its label, in order.
- **Several labels, several occurrences.** A result that is both an `ip` and an `address` is
  written once under each, as siblings. Same string, two occurrences, one per claim.

  ```text
  text → "regex" → "ip"      → "192.168.1.1"
  text → "regex" → "address" → "192.168.1.1"
  ```

- **Kinds come from depth.** Nothing stored says "function", "label" or "value". Every tree,
  cut or written by hand, alternates value → function → type → value from its root down, so
  a node's depth says what it is. Where a writer does not know a function or a type, it
  writes `"unknownFunction"` or `"unknownType"` rather than skipping the level.

## 4. Cutters

A cutter reads one raw file and prints its tree as an **outline**: one JSON string per line,
indented two spaces under its parent. The cutter mints no ids; ids are handed out as the
outline is read. A person can write an outline by hand too (see "A run"). JSON strings
carry line breaks, so a whole file fits on one outline line.

The root is the file's whole text, as read. A parent holds the full text of what is under
it, so each piece can be read without putting it back together. Under every root the run
adds which file this is and which cutter read it. The engine does not name a function for
that, so it writes `"unknownFunction"`:

```text
"eoe: hosts\n10.2.14.7    backup-03.corp   backup-03\n10.2.14.9    build-01.corp   build-01\n"
  "unknownFunction"
    "path"
      "raw/hosts"
    "cutter"
      "hosts.tsv"
  "regex"
    "line"
      "10.2.14.7    backup-03.corp   backup-03"
        "regex"
          "ip"
            "10.2.14.7"
          "name"
            "backup-03.corp"
            "backup-03"
      "10.2.14.9    build-01.corp   build-01"
        …
```

Being ordinary branches, they can be jumped to: every tree a table made is a jump from its
name.

### Table cutters

Cutters are tables, run by one engine. A file names its kind on its first line,
`eoe: hosts`, and a table says which kind it reads. Its own name is its file name.

```text
#! hint   hosts
# on      label     function
file      line      /^[^#\s].*$/
line      ip        /^(\S+)/
line      name      /\s(\S+)/
```

Tab-separated. Each row runs on every result labelled with its `on`, `file` being the root,
and puts what its function returns under its own label. A function is either a regex,
between slashes, or the name of a built-in:

- **A regex** returns every match: its first group, if it has one, or the whole match.
  Regexes are multiline. Its results go under a `"regex"` node.
- **A built-in** returns its result under a node with its name. The built-ins are few
  (only `tolower`, for now).

A `label` cell holding several words — `ip address` — writes each result once under each.
**A result identical to its input is dropped.** That is what stops a row from running on
its own results for ever:

```text
#! hint   notes
# on      label     function
file      word      /\b[A-Za-z]+\b/
word      word      tolower
```

```text
"…CAT ran…"
  "regex"
    "word"
      "CAT"
        "tolower"
          "word"
            "cat"
      "ran"
```

`cat` is labelled `word`, so `tolower` runs on it too, returns `cat` again, and that is
dropped. `tolower` of `ran` is dropped too, and a function with no results writes no node,
so `ran` has none.

### A run

Every table runs on every file whose hint it reads. Each pairing gives one tree.

A person can write a tree too. An outline typed by hand is loaded like any cutter's output;
nothing marks it as different:

```text
"204 means 10.20.30.204"
  "means"
    "ip"
      "10.20.30.204"
    "ip-octet"
      "204"
```

## 5. Reading

A reader moves through the forest with three moves:

```text
up(id)       its parent
down(id)     its children, in order
jump(id)     every occurrence of its text, itself included: idsOf(stringOf(id))
```

`up` and `down` stay inside a tree. `jump` is the only way out of one, and it is deliberate:
equal strings are a place a reader may cross, not a join the forest has made.

From `cat` in the notes tree: up to `word`, up to `tolower`, up to `CAT`, then jump to every
`CAT` — the one in another file's tree, say — and walk on from there.

**Who jumps, and when, is up to the view.** A view that wants as many trees as it can get
jumps wherever it can; another view may not jump at all. `ask TEXT` jumps from the text to
every occurrence of it and shows each tree that holds one, in full. `ask TEXT --depth N`
climbs only N steps up from each occurrence, stopping at the root, and shows what is below
there: `--depth 3` from an `ip` value gives the line it was found in, `--depth 0` the value
alone.

`ask TEXT --anchor` shows the same nodes starting from each occurrence. Every line is
indented by its depth in the tree, as usual; only the order changes. The occurrence comes
first, then its parent one step to the left, then that one's parent, up to `--depth` steps.
These read upward: each one's parent is the next line below it that is less indented.
Everything else comes after its parent and reads down, as in any outline:

```text
    "backup-03"
  "text"
"regex"
  "part"
    "backup"
    "03"
```

`--triples` writes either view with one line per value: its function, label and text as
`function:label:"value"`, indented one step for each value above it. A function or label
outside the view is left empty, so a view from a value starts with `::"value"`:

```text
  regex:text:"backup-03"
  regex:part:"backup"
  regex:part:"03"
::"backup-03\tbackup\t03"
```

**Only exact text matches.** Two occurrences are the same place for a reader only when their
texts are identical, which is what `jump` follows. A cutter can still bring other texts
together by writing them: `CAT → tolower → word → cat` and `Cat → tolower → word → cat` meet
at `cat`.

## 6. Pure functions

Every step is a pure function: the same inputs give the same outputs. Reading files, and
writing them when asked, happens only at the edges, in the script that runs the steps. So a
run is the files in and the forest out, and a view is the forest in and the answer out.

## 7. What holds

- An occurrence has one id, one string, and at most one parent.
- A tree's children are ordered by id.
- Every tree alternates value → function → type → value from its root down.
- No stored edge crosses trees; equal strings are crossed only by `jump`.
- A cutter's output is kept as it printed it.
- Views are computed from the forest and change nothing in it.
- Each run builds the forest whole.

## 8. What it gives up, next to EdgeOnEdge

Entwine follows [EdgeOnEdge](../README.md), which stores everything as one pile of
two-ended lines in which identical text is one node, so files join wherever they share a
string. Before that, Reversible Function Graph stored function calls with numbered
arguments, and the trouble it had with them is why Entwine names the parts of what it
finds with labels. Next to EdgeOnEdge, Entwine gives up:

- **Joins by default.** Equal strings were one node; now they are a jump away, and a view
  decides whether to take it.
- **Ids from content.** An EdgeOnEdge id is a hash anyone can recompute, so two piles merge by
  putting their lines together. Entwine's ids are a count within one run, which is enough for one person
  rerunning everything, and nothing more yet.
- **Merging piles.** Two people cutting the same file get two forests that do not line up.

## 9. Open

- **When a view jumps.** Whether something can stop a view from jumping, and what, is not
  decided.
- **Other matching rules.** A rule could turn each occurrence into a key, such as its text
  under its label, and treat equal keys as the same place. Only exact text is used for now.
- **Vocabularies.** IT's `host` and the party plan's `host` are separate occurrences, but a
  jump from one lands on the other. Whether and how a label says which vocabulary it
  belongs to is not decided.
- **Tunings.** EdgeOnEdge's tuning files say which labels are broader than others
  (`broader address = ip host`) and which labels a view can switch on and off. How that
  comes into Entwine is not decided.
- **The first view.** An adapter that turns the forest into EdgeOnEdge's lines, jumping at
  every step, would run today's walk page and form rung unchanged, before either is
  rewritten over occurrences.
