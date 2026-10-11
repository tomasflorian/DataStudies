# Checklist

What is valued across the attempts, and why: a memory trace, not a certification. Each item has a
scenario that shows it working; detail comes later. Notes on earlier attempts say who came close
and how, in whatever words explain it best. Where a short label fits:

- **Had it:** working code showed it.
- **Partly:** working code showed some of it.
- **Expensive:** it works, at a cost that is clearly out of proportion.
- **Sketch:** a demo showed the idea.
- **Spec only:** written down, not built.
- **Not:** an attempt that makes the item clear by lacking it.

## Combining

**1. Merge without coordination**
I ingest the hosts file, a friend ingests the auth log, separately. We put the two together, ask
about `10.2.14.7`, and the login and the hostname show up side by side. Nobody planned the join.
Had it: StringWalk, EdgeOnEdge.
Expensive: Entwine. Saved forests from two people do not line up, because ids are counted per run;
but put the raw files together and run again, and `jump` crosses everything. It merges by
redoing all the work.

**2. Same thing, different names, and not fooled by coincidence**
The hosts file says `10.2.14.7` is `backup-03`. A DHCP log says `10.2.14.7` was leased to MAC
`3c:52:…`. An inventory says asset `AT-1042` has MAC `3c:52:…`. No single line says so, yet
`AT-1042` turns out to be `backup-03`, with the evidence shown. Then next month the DHCP log
leases `10.2.14.7` to `laptop-alice`, and the system does not conclude that `laptop-alice` is
`backup-03`: the IP moves around, so sharing it is weak evidence.
Not: StringWalk. Walking through the shared IP joins whatever has ever held it.

**3. Meet across sources by shared text**
A string seen in two unrelated files is a place to cross from one to the other.
Had it: StringWalk, EdgeOnEdge, Entwine (jump).
Not: ObservationTree. A port seen in the flow log found nothing in the scan of the same machine.

## Keeping

**4. Exact playback**
Ask for a file back and get it byte for byte.
Had it: StringWalk, EdgeOnEdge, Entwine.

**5. Every occurrence kept**
The hosts line written twice on purpose stays twice, and each copy can be pointed at.
Had it: ObservationTree, Entwine.
Also StringWalk and EdgeOnEdge: cutting keeps the whole original text, both copies included.

**6. Say something about one occurrence**
Mark line 7 of the hosts file as stale. The note sits on that line only, not on every `10.2.14.7`.
Nobody fully. EdgeOnEdge came closest: every line has an id and another line can point at it, but
two identical lines are one line, so one copy of a duplicate cannot be singled out. Entwine has an
id per occurrence, but no way to attach a note, and its ids change on every run. StringWalk can
single out a copy only by quoting more of its context, until the text is unique.

**7. Stories about stories**
Mark a login as an attack; later, mark that marking as wrong. Both stay, and the original line is
untouched.
Had it: EdgeOnEdge (a line can be about another line).
Partly: StringWalk, by quoting. A line about another line quotes it whole, which fits StringWalk's
own rule that something worth talking about becomes its own text; the quote points at every
identical line, though, not one copy.

**8. Adding only adds**
Append a new day of logs. Nothing is recomputed from scratch, and old answers change only where
the new data says something about them.
Not: MonoFlow 6. Its merging runs over the whole text again, so new text can change every unit.

## Finding structure

**9. Records without being told**
Feed a log with no format description. The lines, and the fields inside them, show up as
boundaries anyway.
Not: Entwine. Nothing is found until someone writes the table that says what a record is. //ok we have a problem, we're mixing entwine with a new idea within /next/SPEC.md which is unnamed ... we might have to pause and come up with a name for that before continuing

**10. Seams**
Read two different files back to back with no marker. The switch shows up as a spike of surprise.

**11. Tables without being told**
Feed a CSV or a fixed-width report. Its rhythm is found, and it reads as a table.

**12. Templates with slots**
From a pile of login lines, the fixed text comes out as a skeleton and the users and IPs as the
places where it branches.

**13. Ambiguity kept and ranked**
`expertsexchange` is read both ways, and the reading that fits the stream better ranks first.

**14. Same answer however the files were cut**
Cut the same data into one big file or many small ones; the answers do not change.
Partly: Entwine. Its partition check passes only for views that stay inside one record
(`--depth 3` from a value); above the record, answers change with the cutting. Still open.

## Time

**15. What holds still and what flickers**
Over weeks, a laptop's MAC and hostname stay together while its IP changes. The core and the
fuzz can be told apart.
Sketch: Common Fate.

**16. A rebuilt thing keeps its name**
A server rebuilt with a new MAC keeps its hostname. The old core fades and a new one forms.
Sketch: Common Fate.

**17. Information time**
A billion repetitive lines pass in an instant; one strange login slows the clock.

## Reading

**18. Start from what you see**
Type any string you can see in a file and walk outwards from it. No query language, no schema to
remember first.
Had it: StringWalk, Entwine.

**19. Frame of reference**
Stand on a laptop and IPs come and go; stand on the IP and laptops come and go.
Had it: Entwine. Sketch: Common Fate.

**20. One dial from verbatim to gist**
Turn the dial: the exact stream at one end, sound-alike gibberish at the other, templates in the
middle.

## Learning

**21. Curiosity**
Given logs, a scan and a stream of noise, the reader spends its time where it keeps learning and
leaves the noise alone after a taste.

**22. Rereading pays off**
An old stretch that was baffling when first read is predictable now; it gets flagged as worth
another look.

## Trust

**23. Same input, same output**
Run it twice and get identical results.
Had it: StringWalk, EdgeOnEdge, Entwine.

**24. Where did this come from?**
For any answer, trace it back to the files and lines it rests on.
Had it: EdgeOnEdge, Entwine, ObservationTree.
