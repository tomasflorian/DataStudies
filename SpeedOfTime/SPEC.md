# SpeedOfTime — spec

*Surprise is the speed of time.*

*Draft, October 2026. Descended from TimeGraph, with boundaries from MonoFlow and overlays from
Entwine.*

Find the boundaries and shapes in raw data from changes in surprise, without declaring
records, schemas or tokens in advance. Keep every reading of the data, including how it is cut
into units, as an overlay that can be compared with others.

## 1. The stream

- Everything read becomes one verbatim stream of **moments**, one per symbol, in the order it
  happened. Moments are never deduplicated, and the stream is never broken into records.
- Each moment points to a **value** (a character, or a unit). Values are deduplicated.
- Following moments plays the stream back exactly. Following values gives every place a value
  occurred.

**Storage is arrays, appended to and never rewritten.** For the text `cat and bat`:

```
values   0=c 1=a 2=t 3=_ 4=n 5=d 6=b     each string once, with a number

moment   0 1 2 3 4 5 6 7 8 9 10
stream   0 1 2 3 1 4 5 3 6 1 2          the verbatim line; the index is the moment

where    a → 1, 4, 9                    every moment of each value (the reverse lookup)
         t → 2, 10
         …
```

- Forward, moment to value: `stream[t]`. Reverse, value to moments: `where[value]`. Each new
  moment is appended to `stream` and its number added to that value's `where` list.
- What comes after moment `t` is moment `t + 1`, so the verbatim stream needs no edges. Every
  graph in this spec is computed from these arrays: a reading of them, rebuildable at any time.
  Lose a graph and it can be counted again; lose the arrays and nothing can bring them back.

## 2. Tracks and overlays

- The stream has **tracks** on one clock, like a multitrack recording. The data is one track.
- An **overlay** is a reading of earlier moments: "moments 812–830 are an attack", "moments
  845–857 are an ip", "this was important". It is a new event, appended at the time the reading
  was made, on its own track, and it points back at the moments it is about (stand-off
  annotation: a target, and what is said about it).
- Overlays are made of moments too, so an overlay can be about another overlay. Stories about
  stories nest to any depth.
- Nothing is ever edited. A reinterpretation is a new overlay; contradictory readings coexist.

**Phase tracks.** A track can read the stream with a period, **MaxT**: each moment is mapped to
its phase, `t mod MaxT` (TimeGraph's phase time). The stored stream stays verbatim; the period
is a way of reading it.

The period sets the **shape** of the reading, from a line to a choose-your-own-adventure:

- MaxT = ∞: a **line**. Every moment stands alone and has exactly one next: the path that
  happened, with no choices.
- MaxT = 1: a **graph of values**. Every position collapses into one, so each value keeps only
  what can come after it, with counts. For `cat and bat`:

  ```
  c → a
  a → t ×2, n ×1
  t → _
  _ → a, b
  n → d
  d → _
  b → a
  ```

  From `a` the story branches. Walking it at random gives words that were never in the text but
  sound like it (`can`, `bat at`), as in Shannon's 1948 approximations of English. This graph is
  the same table a K = 1 predictor head counts: the head's memory is the deduplicated reading.
- MaxT in between: a graph whose nodes are (phase, value), partly line and partly branching.
  Positions a period apart become the same. If the data has a fixed rhythm (a
  record every 64 characters), the track whose MaxT matches it lines every record up, each
  column on its own phase, and surprise per phase drops sharply. Trying a range of periods and
  keeping the one where surprise falls most finds tables without anyone declaring them.
- MaxT forgets *where*; a head's memory dial forgets *how long ago*.

## 3. Units are readings too

- Cutting characters into units is an overlay like any other. One stretch can carry several
  segmentations at once:

  ```
  moments 1–15:   e x p e r t s e x c h a n g e
  reading A:      [experts][exchange]
  reading B:      [expert][sex][change]
  ```

- Units are found from boundaries in surprise (section 5), never from a fixed tokenizer or
  vocabulary.
- A new unit never rewrites how earlier moments were read. Its statistics come from what was
  already counted.

## 4. Predictor heads

- Each track or reading has its own **predictor head**: one for the raw characters, one per
  segmentation, one per overlay track, one per level of units.
- A head reads its track one item at a time: **predict, measure, learn**. It never sees the
  answer before guessing.
- The first head counts what followed the last K symbols, and uses Good–Turing estimation for
  "something never seen here before": the share of continuations seen exactly once.
- Each head has a **memory dial** (none, short, long) that sets how fast old counts fade.
- Heads learn only from this stream, and are deterministic.

## 5. Measurements

- **Surprise** per item: `−log₂ p`, in bits.
- **Information time**: the running total of surprise. Predictable stretches pass quickly and
  surprising ones slowly; a switch between sources shows up as a spike without any marker.
- **Boundaries** are where surprise jumps. A boundary's **strength** is the size of the jump.
  A **roughness dial** blurs surprise over a stretch so that only boundaries above a chosen
  strength remain.
- Delimiters (newline, comma, colon) are not special. They are found as boundaries only if they
  behave like one.

## 6. Comparing readings

- The reading under which a stretch is **least surprising** is the better reading for that head
  (minimum description length). In a stream about tech questions, "experts exchange" should win.
- Where heads **disagree** strongly, the stretch is ambiguous. Disagreement is a signal worth
  its own overlay, or a person's attention.

## 7. Levels and shapes

- Units found at one level are read by the next level's head, whose boundaries give the next
  level up: words, fields, records, sources.
- Shapes are found, not chosen:
  - **table**: boundaries of the same strength recurring at a regular rhythm
  - **tree**: boundaries nested inside stronger ones
  - **prose**: nested but irregular
  - **noise**: flat and high

## 8. Choosing what to read: curiosity

Surprise is measured; curiosity only exists where something chooses. A **chooser** decides which
source to read next, or which old stretch to reread.

- **Learning progress**, not surprise, is what it looks for: how much a head's surprise on a
  source or region has dropped recently. A source is tasted with a small sample before more is
  read; its progress is tracked from then on.
  - surprise falling as more is read: something learnable, keep going
  - surprise high and never falling (noise): no progress, move on
  - surprise already low and staying low (mastered): no progress, move on
- Rewarding progress instead of surprise is what keeps the chooser from staring at noise (the
  noisy-TV problem). Progress fades as a source is mastered, so it is averaged over recent reads
  only, and the chooser keeps moving.
- It picks among sources like a multi-armed bandit, in three modes:
  - **progress**, most of the time: read where progress is highest
  - **random**, some of the time: try a source not being read, in case it is better than thought
  - **forced boredom**, some of the time: keep reading a source written off as mastered. Fully
    predictable at one level can still hold structure at the next (wax on, wax off), and only
    repetition lets that pattern show.
- **Rereading:** read an old stretch with today's heads and compare its surprise with what it was
  when first read. A large difference means something has been learned since; those stretches are
  worth reinterpreting, and the reinterpretation is a new overlay.

## 9. Invariants

- Adding data only adds. Old readings are never recomputed from scratch.
- No category, label or record is stored as fact. All of them are readings, on tracks.
- Every reading says when it was made and what it points at.
- Boundaries are relative to a head and its memory, and say so.

## 10. Open

- A better predictor: a small neural head trained online on the stream (see TODO.md).
- Should heads read overlay tracks, or only the data? Per track, by choice?
- Names for found units: whether and how they are given.
- Sameness across streams: deciding two regions are the same thing.
