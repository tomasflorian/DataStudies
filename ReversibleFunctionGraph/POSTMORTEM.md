# Postmortem — Reversible Function Graph

Not a list of defects. The project worked, and working is what ended it.

## What it was for

One idea: **write the call down and you have enough.** Enough that you never
declare the shape of your data before the data arrives. A reader works it out
afterwards by following arrows.

The unit was one call, flat, all strings — function first, result last,
arguments between:

```
["length", "paris", "5"]
["hasLetter", "cat", "z", "false"]
```

## It worked

383 calls, 70 functions.

Three producers in three languages — TypeScript, C#, a shell script — with no
shared library, no schema, and no contract between them. Their output joined
up. Nobody integrated anything; they happened to write the same strings.

I never wrote a migration. Adding a new kind of fact never meant touching an old
one, because there was no shape to change.

I never resolved a conflict. Two piles merged with `cat` and `sort -u`, and the
result was right by construction rather than by care.

Putting in a document I couldn't parse cost nothing. `check.sh` proves it:
parsing at intake and parsing a month later off the pile produce the same atoms,
with `lost.atoms` empty. Not understanding something yet became a decision I
could defer indefinitely.

Two producers used `first` to mean different things — the first column of a CSV,
and the head of a `|`-separated list — and both landed on one node. Nothing was
corrupted, no answer was wrong, and a reader anchored on `first` got both.

Almost none of this is being thrown away.

## The anomaly

While planning a cleanup, Claude measured something nobody had asked for:

```
values in the pile:                       241
values any walk table can ever reach:     171
of the unreachable, not a function name:  "0", "z"
```

Two strings sitting in the file that no table could ever contain, at any depth,
by any sequence of ticks. `"z"` is the letter `hasLetter` tests and no word
contains. `"0"` is an index argument to `wordAt`.

Two values out of 241. I read it and thought Claude was lost in minutiae.

## The wrong explanation

Claude's first account of it was about *slots*: `"z"` sits in slot 3, and the
reader only reads slots 2 and 4.

**Rejecting that is what cracked the project open.** There is no slot 3. The
format is `function, arg1, arg2, … argN, result`. "Slot 3" only exists in lines
that happen to have two arguments, and describing it that way made it sound
like a quirk of one position.

Said properly: **the reader reads the first argument and the result, and
ignores arguments 2 through N.** And that is not a bug — a step is a function
and a direction, and with more than one argument that isn't enough to say where
to land. With one argument there's nothing to decide. With two there is, and the
reader had always guessed the first.

```
one argument    203 lines   53%   read completely
two arguments   180 lines   47%   read to the first argument, the rest skipped
```

Nearly half the pile was half-read, and had been from the start.

## The shape underneath

**`[fn, ...args, result]` is a nested structure cosplaying as a flat one.**

It reads like a list of strings. It isn't. It's three parts — a function, a
*list* of arguments, and a result — with the list flattened into the middle and
the flattening treated as free. Every reader has to know the first position is
special, the last is special, and the middle is a variable-length list whose
positions carry meaning.

That's a tuple with a list inside it, wearing a costume.

## Six symptoms, one cause

- **The first-argument rule.** Nothing in the format says which element is the
  thing you asked about, so a convention had to — one nothing enforced and whose
  violation was invisible.
- **Unreachable values.** Everything in the list but the first could be written
  and not stood on.
- **The membership trick.** `["word", sentence, "paris", "paris"]` writes the
  same string twice. Not waste — the only way to get a list element into the
  result position where the reader could see it. Used 116 times.
- **Verdicts.** `hasLetter` answered `"true"`/`"false"` because the result
  position was taken by something that wasn't the letter. Those two became the
  2nd and 5th largest destinations in the pile, and neither is a place anyone
  wants to stand.
- **The minted call id.** Drawing needed a name for the tuple, so one was made
  by JSON-encoding the argument list — creating a collision six lines of code
  then policed.
- **The slot-ordering bug.** Arguments recovered by sorting `arg0 … arg10` as
  strings, so an eleven-argument call drew `a0 a1 a10 a2 a3`. A list indexed by
  string, which is what you get when a list pretends not to be one.

Six things filed as unrelated annoyances. One cause.

## What replaced it

Take the nesting out and there's nothing left to flatten:

```
["paris", "length", "5"]
```

Three strings, exactly three, no list, no privileged position. Most of the
corpus was already this:

```
already exactly this                       203
membership lines (2nd argument == answer)  117    the doubling was the nesting showing
                                           ---
                                           320  of 383
```

The residue was `hasLetter` — whose 21 positive facts `char` already recorded —
and 28 lines about positions, which is one real idea rather than a defect.

And it loses nothing. Anything needing a fourth thing gets a more specific
relation name, described by more lines: the position, who said it, what to call
it backwards, even an opinion about spelling. One mechanism, found four times
before I recognised it as one.

Not that this project was bad. That three strings does everything it did, plus
what it couldn't, without a single one of the six symptoms — because there's no
nesting to hide. The successor is `STRINGWALK.md`.

## What survives

The model changed. The architecture didn't:

- the pile as one plain file, any prefix of it a smaller pile rather than a
  damaged one
- merging as `sort -u`, no coordination, no dedupe
- producers as programs that print lines — no API, no chaining
- a function that declines writing nothing at all
- reading whole and cutting later, run until a round adds nothing
- pure and monotone, and *never look at what is missing*
- identity as exact text, never a minted name
- the walk table as the deliverable, the ticked shape living in the viewer
- nothing stored but the file

One rejected idea comes back. Per-producer function names were set aside because
they made disagreement *invisible*. Describing relations fixes that —
`["ownerPerDhcp","kindOf","owner"]` — so the disagreement becomes a thing you
can walk to. Re-examining a rejected idea once its reason expires isn't
re-litigating it.

## What happens to the code

Nothing is ported. The successor is a rebuild from the three-string unit up, in
its own repository, no shared code and no compatibility layer — carrying the old
vocabulary across would mean pretending "relation" is a new word for "function,"
and it isn't.

This repository stays as it is. It's the evidence for most of what
`STRINGWALK.md` claims, and most of those claims are measurements taken here.
