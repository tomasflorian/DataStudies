# Patterns

How to build with the ideas in [PHILOSOPHY.md](PHILOSOPHY.md). The philosophy says why; this says
how. Written for someone who was not there when the ideas came up, which includes the author a
month later.

Each pattern has a name to say out loud, a rule, the problem it prevents, and an example. The
examples are deliberately small: a name, a date, a mail merge, a messy password note.

## The core

Two things, and one rule.

1. **The bytes.** Kept exactly as they arrived. Never changed.
2. **Spans.** `(start, end, label)` over the bytes: "this stretch is a `word`, an `email`, a `row`".
   A span may also carry a derived `value`, and a `put` that makes it editable.

**Nothing ever writes to the bytes.**

Everything else in this document is either a way of making spans or a way of showing them. A
spreadsheet is spans shown as a grid. Zooming is showing coarser or finer spans. A form is spans
shown as labelled boxes. Before adding a new concept, ask whether it is just spans plus a way to
show them. Usually it is.

```ts
type Span    = { start: number, end: number, label?: string, value?: string,
                 put?: (edited: string) => string }
type Lifted  = { text: string, spans: Span[] }
type Reading = (text: string, spans: Span[]) => Span[]      // returns new spans only

const lift     = (text: string): Lifted => ({ text, spans: [] })
const apply    = (l: Lifted, r: Reading): Lifted =>
  ({ text: l.text, spans: [...l.spans, ...r(l.text, l.spans)] })
const verbatim = (l: Lifted): string => l.text
```

## Laws

Two, both testable mechanically.

```
verbatim(lift(x)) == x            after any number of readings
concat(parts) == whole            for every cut
```

The first holds by construction when readings can only return spans (see *Readings only
append*). The second is checked per cut, the way ReversibleFunctionGraph's `check.sh` proved
`lost.atoms` was empty.

## Words

Words that blame the data, or quietly decide what the things are, lead to designs that do the
same. Use words that describe the match between data and purpose.

| Avoid | Prefer | Why |
|---|---|---|
| invalid | not fit for *mailmerge* | the record is fine; it does not suit this use |
| error: missing email | no email tagged | describes, does not accuse |
| fix these records | these could be used if tagged | nothing is broken |
| required field | required for X | requirements belong to a use, not a record |
| clean / normalize the data | add a normalized reading | the original stays; the reading is disposable |
| parse (one answer) | read (one of several readings) | ambiguity is kept, not resolved at intake |
| split | cut, keeping the separators | a split that drops `" "` moves data into code |
| serialize / deserialize | lift / verbatim | serialization treats the structure as the truth and the bytes as transport; here it is the reverse |
| lower | verbatim | collides with `toLowerCase`, which is a lossy transform |
| objectize | lift | lifting adds room for readings; it does not decide what the things are |
| whitespace, junk, nothing | separator, relation | see *Keep the separators* |

## Patterns

### 1. Verbatim plus readings

**Rule:** `lift` keeps the original and adds structure on top of it, never instead of it.

**Problem:** `JSON.stringify(JSON.parse('{ "a" : 1 }'))` gives `{"a":1}`. The round trip that
starts on the side with more spellings breaks. Any design that stores only the interpretation
loses the spelling.

**Solution:** store the bytes; store interpretations as spans pointing into them. There are two
ways out: `verbatim` (exact, always safe) and a view (any reading made visible, may be lossy).

**Names:** `lift` is standard functional-programming vocabulary. In topology a lift is defined by
the law: anything above that projects back down to where it came from. The set of all lifts of a
string, every structured reading of it, is called its *fibre*.

### 2. Keep the separators

**Rule:** a cut keeps what lies between the pieces as pieces of its own. Hide them at view time;
never drop them.

```
classic:  "a b".split(" ")    → ["a", "b"]           the separator lives in the code
here:     cut("a b")          → ["a", " ", "b"]      the separator lives in the data
```

**Problem:** with a literal separator, classic split is reversible, but only for someone holding
the code. A reader holding only the data cannot know whether it was a space, a tab or two spaces.
With `/\s+/`, trim or "treat consecutive delimiters as one", nobody can know.

**Why it matters more than it looks:** what a cut leaves over is usually the relations. The `@` in
`tomas@example.com` says *at*; the space in `Tomas Florian` says *one name, given name first*; the
newline says *next record*. Drop them and the relations must be rebuilt in a schema, in code, or
in someone's head. (PHILOSOPHY.md: the dots and the white.)

**Existing practice:** regex split with a capture group, `"a b\tc".split(/(\s+)/)`; lossless
syntax trees (Roslyn, rust-analyzer's rowan, tree-sitter), which keep whitespace as "trivia".

### 3. Readings only append

**Rule:** a reading receives the text and returns new spans. It never receives the power to
change the text.

**Problem:** `shout = l => ({ ...l, text: l.text.toUpperCase() })` breaks the first law, and
nothing stops the next person from writing it.

**Solution:** the `Reading` type above. A reading can still be wrong about where it puts a span;
it cannot damage the bytes. The law then holds for every reading anyone ever writes, without a
test per reading.

**Lineage:** ReversibleFunctionGraph's rule, *"a producer may read the pile to decide what to
call; it must never read the pile to decide what the answer is."*

### 4. One join for every cut

**Rule:** every cut must return pieces that concatenate exactly to the input. Then the reverse of
every cut is the same function, concatenation, written once by the system.

**Problem:** when each cutter has its own `join`, someone has to keep every pair compatible, and
eventually one drifts (`{tomas}`, hex, a trimmed space).

**Solution:** cutters write no reverse. The check `concat(parts) == whole` runs over every cut
and catches any cutter that drops a byte.

### 5. Derived values are annotations

**Rule:** a function that changes content (`toUpperCase`, decode, format) attaches its result as a
span's `value`. It does not replace the text.

```ts
const shout: Reading = text =>
  [{ start: 0, end: text.length, label: "shout", value: text.toUpperCase() }]
```

Even a lossy function loses nothing this way, because its input is still there. This is
Bennett's trick from reversible computing: any computation becomes reversible if its input is
kept. It is also exactly what an RFG atom does: `["toUpperCase", "tomas", "TOMAS"]`.

### 6. Editable only where there is a way back

**Rule:** a cell is editable exactly when there is a lossless way from it back to the bytes.
Editability is derived from whether a span has a `put`; nobody maintains a list.

| Cell | Way back | Editable |
|---|---|---|
| raw span (`smith`) | write the new bytes at its offsets | yes |
| decoded (`%40` shown as `@`) | re-encode, then write | yes |
| `shout` (`SMITH`) | none; the casing is lost | read-only |
| a count or score | none | read-only |

**On edit:** apply `put`, write over the span's bytes as a new version (the old one is kept),
rerun the readings. Derived cells recalculate like spreadsheet formulas.

**Standard name:** the view update problem (databases); lenses (programming languages).

### 7. Entry, storage and export are three decisions

**Rule:** decide them separately.

| Concern | Decided by |
|---|---|
| Entry | what is easiest for the person: often one free field |
| Storage | the bytes plus spans |
| Export | whatever the downstream system needs: `first_name`, `last_name` |

**Problem:** forms are generated from database columns, so the column layout becomes the entry
layout and the person becomes the parser. Downstream needs (airlines want given name and surname)
are real, but they are export needs, and they were never a reason to make the person split.

The person supplies evidence, kept verbatim. The program supplies interpretation: pliable,
correctable, and rerun when it improves.

### 8. Guess, and let a person outrank the guess

**Rule:** readings may guess, with a confidence. A span made or accepted by a person outranks any
guess, and survives when the guessing is rerun.

**Why it is safe here:** a wrong guess is a wrong span, never lost data. It can be fixed later, by
anyone, and every record whose reading was a guess can be found and rechecked.

**Watch for:** *automation bias*. When a system is usually right, people approve its output
without looking. Do not rely on review to catch rare errors; make errors cheap instead (this
pattern), and ask only when the guesses disagree (*mixed-initiative design*: act when confident,
ask when not).

### 9. Show a checksum

**Rule:** show the interpretation in terms the person already knows, so checking it costs a
glance.

| Field | Show | Why it works |
|---|---|---|
| Birthdate | age: "1 Feb 2003 · age 23" | everyone knows their age; a year mix-up shows at once |
| Recent date | weekday and relative: "Sat 4 Oct · 10 days ago" | "last weekend" is remembered better than a date |
| Future date | countdown: "in 3 weeks" | catches last year's year |
| Name | salutation: "We'll call you Tomas" | a wrong first/last split shows at once |
| Address | map pin | you know where your house is |
| Amount | in words: "one thousand two hundred fifty" | why cheques ask for the amount written out |

Repeated exposure teaches: after a few uses, the person knows their birthday's weekday whether
they meant to learn it or not, and the checksum becomes one they can verify.

### 10. Ask once, remember the answer

**Rule:** when a person resolves an ambiguity, store the decision keyed on the verbatim input, and
look there first next time.

```
# decisions.tsv
Ludwig van Beethoven ludwig@example.com	first=0-6 last=7-20
```

Also ask the question that generalises: after one pick, "always read dates as day/month?" When
many readings remain, ask the question that rules out the most ("is 02 the month?").

### 11. Don't ask mid-run; settle before the irreversible

**Rule:** interpretation can happen anywhere, as long as the verbatim travels with it. It must be
settled before a step that cannot be undone.

A thin client, a CLI or a batch job need not interpret anything: they pass the verbatim on. A
batch job never prompts. Each record ends in one of:

```
$ mailmerge.sh contacts.txt
sent                        41
needs a choice               3   → mailmerge.review   (ambiguous: which reading?)
not fit for mailmerge       12   → mailmerge.unfit    (missing: email)
```

The review file lists candidates with their checksums (`→ "Dear Ludwig"` / `→ "Dear Ludwig
van"`). A `--plan` mode prints what would happen before anything is sent.

### 12. Required for what?

**Rule:** "required" always names a use. A record is never incomplete in itself, only unfit for a
particular use.

| Use | Requires |
|---|---|
| Autofill | url, username, password |
| Account recovery | recovery-secret or recovery email |
| Mail merge | email, name |

Nothing blocks saving, so nobody types `n/a` to get past a required field. Unfit records are not
flagged as wrong, deleted, or padded to fit; they wait, as written, for a use they do fit.
A requirement has three states: missing, guessed, confirmed. A cautious use can insist on
confirmed.

**Standard names:** schema-on-read versus schema-on-write; *fitness for use* (Juran).

### 13. Keep ambiguity, rank it

**Rule:** keep every reading; rank them; let each reader pick.

A string of N characters has 2^(N−1) cuts, about 10^451 for 250 words of prose. They are never
listed. Every piece is a cell `(start, end)`, and every cut is a route through the cells where
each piece starts where the last one ended:

| start ↓ / end → | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| **0** | a | ab | abc | abcd |
| **1** | · | b | bc | bcd |
| **2** | · | · | c | cd |
| **3** | · | · | · | d |

`ab | cd` is (0,2) → (2,4). The full table has N·(N+1)/2 cells; capping piece length makes it
N·L. In practice only create cells a dictionary or the data supports (an *informed* table): find
them in one pass with a trie and Aho–Corasick, allow single characters as a penalised fallback so
unknown stretches still get through, and find the best route by dynamic programming (Viterbi).

Independent forks multiply: `tomas`/`t omas` and `florian`/`f lorian` give 2 × 2 = 4 cuts from 2
extra cells.

**Standard names:** lattice (speech, Japanese tokenizers like MeCab); chart (CYK parsing); shared
packed parse forest (GLR); span-based NER.

### 14. Zoom by boundary strength

**Rule:** give each gap a strength. Zooming in lowers a threshold; every gap above it is a cut.

```
t o m a s ␣ f l o r i a n ⏎ b o b ␣ s m i t h
 1 . . . 2 2 1 . . . . . . 3 . 1 . 2 2 1 . . .
```

Threshold 3 gives rows, 2 gives words, 1 gives `t│omas│ │f│lorian`. Each level only adds cuts, so
the levels nest into a tree. One number per gap, so storage is tiny.

**Trade-off:** one set of strengths holds one tree; the table in pattern 13 holds every cut. Keep
several sets of strengths, one per reader, when readings do not nest.

**Standard names:** dendrogram cut; ultrametric; semantic zoom. In this repo: SpeedOfTime's
roughness dial and levels.

### 15. Align by order, not position

**Rule:** to line rows up into columns, align their cuts as sequences of pieces. Never by character
position.

```
bob.smith        → [bob]   [.] [smith]
tomas.florian    → [tomas] [.] [florian]
```

Pieces identical across rows become fixed columns (anchors); what varies between anchors becomes
slots. The template `X . Y` is found, not declared. Rows help each other: next to `bob . smith`,
the cut `tomas . florian` aligns and `t omas . f lorian` does not. Anchor on the rarest, most
stable piece first (`@` before `.`). When rows have different shapes, cluster first.

**Standard names:** multiple sequence alignment; log template mining (Drain, Spell); wrapper
induction; Flash Fill. CHECKLIST #12.

## Case studies

**Names.** One field, `Tomas Florian`. A reading proposes `first` and `last` spans from an order
prior, name-frequency lists, particles (`van`, `de`) and commas. Typing into two boxes produces the
same record with person-made spans. Sorting, salutations and export read the spans. `Ludwig van
Beethoven`, `Madonna` and `Nguyễn Văn An` are flagged for a glance, never rejected.
*Patterns 1, 7, 8, 9, 12.*

**Dates.** `01/02/03` has six readings. Rank by locale, the person's own history, the field's
purpose and the separators. Offer the top few as `Sat 1 Feb 2003` / `Thu 2 Jan 2003` / `Sat 3 Feb
2001`; remember the answer; fall back to a calendar only when nothing else works.
*Patterns 8, 9, 10, 13.*

**Chips while typing.** `Tomas␣` becomes `[First: Tomas]`; `Florian⏎` becomes `[Last: Florian]`.
Labels stay provisional until Enter, because later words change earlier ones (`Ludwig van` is
unsettled until `Beethoven`). Keep chips where they are; change only the label.
*Patterns 8, 9, 13.*

**Mail merge from a CLI.** `"Tomas Florian user@example.com"` and `"user@example.com Tomas
Florian"`: the email is unambiguous by shape, so its position does not matter. The name is the
only guess. No prompts mid-run; review and unfit files; decisions remembered; `--plan` before
sending. *Patterns 10, 11, 12.*

**A password note.** Write the chaos down as it comes, annotate later:

```
Polycom account                                  ← title
Acct 1235-5612321-3123                           ← account-number
user@example.com                                 ← username
pass123                                          ← password
oldpass:pass566 or maybe 413g32                  ← old-password, old-password?
voicemail forwarding email user2@example.com     ← email (forwarding)
recovery secret:x2y2                             ← recovery-secret
login.polycom.com                                ← url (login)
docs.polycom.com                                 ← url (docs)
voicemail                                        ┐ group: voicemail
PIN:12345                                        ┘   pin
```

Labels repeat (two emails, two URLs); uncertainty stays honest ("or maybe"); a blank line and a
heading make a group; `PIN:` and `recovery secret:` are labels the author already typed, so most
of the note can be pre-labelled. Mask `password`, `pin` and `secret` spans at view time; that is
convenience, not security, so the verbatim note is encrypted as a whole.
*Patterns 1, 2, 8, 12.*

## Glossary

| Term | Meaning here |
|---|---|
| verbatim | the bytes exactly as they arrived |
| reading | a function that returns spans over the bytes |
| view | readings made visible; may be lossy |
| lift | take text into the system's form, adding room for structure and changing nothing |
| fibre | every structured reading of one string; all of them project back to it |
| lattice / chart | every possible piece of a string, as cells `(start, end)` |
| stand-off annotation | spans kept apart from an unchanged text (brat, TEI) |
| lens | a pair `get`/`put` that lets edits to a view flow back to the source |
| view update problem | when an edit to a derived view can be written back |
| schema-on-read | structure checked when data is used, not when it is stored |
| fitness for use | data quality judged against a purpose, not in itself |
| automation bias | approving an automated answer without checking it |
| mixed-initiative design | act when confident, ask when not |

## Further reading

- Bohannon, Pierce et al., *Boomerang*: bidirectional string lenses.
- Rendel and Ostermann (2010), *Invertible Syntax Descriptions*: one grammar, parser and printer.
- Richard Ishida, *Personal names around the world* (W3C Internationalization).
- Patrick McKenzie (2010), *Falsehoods Programmers Believe About Names*.
- Parasuraman and Manzey (2010), on complacency and bias in human use of automation.
- Horvitz (1999), *Principles of Mixed-Initiative User Interfaces*.
- Joseph Juran, quality as *fitness for use*.
- Christopher Alexander (1977), *A Pattern Language*: the format of this document.
- Tools: probablepeople and usaddress (DataMade); Duckling, chrono (dates); libphonenumber;
  MeCab (lattice tokenizer); Drain (log templates); Re-Pair and Sequitur (grammar-based
  compression, a learned zoom tree); Flash Fill (Gulwani).
