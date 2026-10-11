# Philosophy

## The big picture

Every project here circles one question: **what is the same, and what is a thing, when the data
arrives without anyone having agreed on what the things are?**

A hosts file, a login log and a network scan were never designed together. The same machine
shows up in them as an IP, a hostname, a MAC address. The usual answer is to decide the things
first (a schema, a unique id) and file the data under them. That works wherever someone has the
authority to mint the ids. These projects live where no one does.

Underneath is an older thought about language. Language is a wick dipped into a sea of
non-verbal experience: it pulls something up, and what it pulls up is shaped like the wick. A
schema is a wick that turns the sea into things before anyone has looked. The aim is a wick
that brings meaning up without freezing it into things.

That puts these projects on the side of **process and relation** rather than **substance**.
Substance thinking starts from things with properties and adds relations afterwards. Process
thinking starts from events and relations, and finds things as patterns that keep recurring: a
whirlpool is a shape held in moving water, and a tune stays the same tune when every note is
transposed. Whitehead's philosophy of organism is the nearest company, met late, as a fellow
traveller rather than a teacher.

## Two axes

The attempts so far move along two axes, and the search is for a point between their poles: not
a compromise along either axis, but a different way of seeing that makes each pair stop
conflicting.

**Identity.** Is the string the thing (equal text is one node, and joins come for free), or is
every occurrence its own thing (nothing merges, and nothing joins)? The text pole cannot point
at one occurrence. The occurrence pole cannot cross from one to another.

**Cuts.** Are the boundaries in the data drawn by a person (a table of patterns, a template) or
found from the bottom up (statistics over the stream)? Authored cuts carry meaning but impose
categories. Found cuts impose nothing but name nothing.

| | cuts found in the stream | cuts authored |
|---|---|---|
| **strings are the identity** | MonoFlow, TimeGraph | StringWalk, EdgeOnEdge, ReversibleFunctionGraph |
| **occurrences are kept** | SpeedOfTime | ObservationTree, Entwine |

TimeGraph came closest to dissolving the identity axis: following the value nodes gives
deduplicated types, and following time gives the verbatim sequence. The choice moves from
storage to reading.

## What carries across every attempt

- **Commit at read time.** What is decided while storing stays decided. What is decided while
  reading can be decided differently by the next reader.
- **Keep the evidence; interpretation is disposable.** The raw text is kept whole, and every
  reading of it can be thrown away and redone.
- **A tree is an act of reading, not a classification of the world.** A tree is how one hand
  holds one reach into the sea. There is no master tree over the others.
- **Adding data only adds.** A method that must reread the whole corpus before it can say
  anything, and whose old answers shift when unrelated data arrives, treats the corpus as an
  authority. The world keeps arriving.
- **Tools that count, not tools that bring meanings.** A method that only counts this stream
  keeps the worldview intact. A method that arrives with its own categories, learned from
  everyone else's language, replaces it.
- **Boundaries are relative to an observer.** That is not a weakness to apologise for. It is the
  frame of reference made explicit.
- **Attempts are sticks.** A stick is for fishing, not for mounting on the wall. When a better
  stick turns up, the old one is thrown away; what it caught is kept.

## SpeedOfTime: records found by surprise

**Records don't exist.** No line, row, block or object exists in the data as stored. What exists
is a stream. A record is where the stream becomes hard to predict from what came before:

> a new unit starts here = the next thing cannot be predicted from the last.

**Delimiters are conventions for surprise.** A newline, a comma, a colon, a blank line: none of
them is a thing. Each is an agreed sign for "a boundary is here". That is why a computer struggles
to see that `admin` / `pass123` on two lines and `admin:pass123` are the same: it compares the
signs, while the shape (a predictable run, a break, another predictable run) is the same. Word
spacing itself was a medieval invention; ancient texts ran together, and readers found the words
by expectation.

**Surprise is a gradient, so records nest.** A small drop in predictability separates fields, a
larger one separates records, a larger one still separates files or sources. Sub-records,
records and groups are not different kinds of things. They are boundaries of different
strength, rings around a centre, found in the same measurement.

**Surprise is measured in bits.** A predictor reads the stream one symbol at a time, guesses
what comes next from what it has seen, measures how surprised it was (`−log₂ p`), and only then
learns. Predict, measure, learn: it never sees the answer before guessing. A bit is one halving
of the possibilities.

**Surprise is time.** Clock time is the wrong clock: a computer does nothing for ages and then a
billion things in a second. Information time runs on surprise instead: predictable stretches
pass almost instantly, and surprises slow time to a crawl. No one has to mark the pause between
two files; reading one file straight after another produces a spike of surprise on its own. Time
is the grounding rod: whatever lasts is what holds still while the stream moves on.

**What a thing is.** A thing is a region where everything predicts everything else well, and its
boundary is where prediction falls off. A body's parts predict each other; they do not predict
the table. In the fuzzy cloud of observations, a thing is the dense, slow core where some values
keep holding still together, while other values flicker at the edges.

**Evidence and time are one currency.** Agreeing on a rare value is strong evidence that two
occurrences are the same thing; agreeing on a common value is weak. In bits, that strength is
the same number as the time the value takes to pass in information time: `alice` flies by,
`zoltan` makes the clock pause. Record linkage (Fellegi–Sunter) survives here without its batch
machinery: sameness is evidence summed in bits, with weights that come from moment-to-moment
surprise rather than from a frozen corpus.

**The observer is part of the measurement.** Surprise depends on what the predictor remembers.
A short memory finds things surprising again soon; a long memory recognises them from long ago.
That one dial (none, short, long) sets what counts as surprising, and so where the boundaries
fall and how fast time runs. None is pure deduplication; long tends towards the verbatim record
of everything.

## Open

- **The predictor.** Counting exact contexts breaks down on long contexts, because they have
  rarely been seen before, and it cannot see that `cat` and `caat` are nearly the same. A small
  neural predictor trained only on the stream itself would generalise without importing anyone
  else's expectations (see TODO.md).
- **Is there such a thing as a point?** If records dissolve into gradients, values and characters
  may too. What the stream is made of, before anything is recognised, is unanswered.
- **Names.** Found boundaries come without names. Whether a person names them afterwards, and how
  a name relates to the region it names, is not decided.
- **Sameness across streams.** Finding records inside one stream is the first half. Deciding that
  two regions in different streams are the same thing is the second.
