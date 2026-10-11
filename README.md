# Data Studies

Experiments in reading raw data — logs, hosts files, DNS zones, receipts, plain text — without
deciding first what the things in it are. No schema up front: structure is found in the data, or
chosen by whoever is reading it.

[PHILOSOPHY.md](PHILOSOPHY.md) says why. [CHECKLIST.md](CHECKLIST.md) says what each attempt is
measured against.

## Projects

Oldest first. Each folder is a self-contained project with its own README, SPEC or DESIGN.

| Project | Started | Status | In one line |
|---|---|---|---|
| [TimeGraph](TimeGraph/) | 2026-05 | dormant | Encode sequences as a graph of phase-time and value nodes; structure emerges from what strings share by position. |
| [MonoFlow](MonoFlow/) | 2026-06 | dormant | Unsupervised text segmentation: grow tokens from single characters via a transition graph. |
| [ReversibleFunctionGraph](ReversibleFunctionGraph/) | 2026-08 | superseded by StringWalk | Store only function calls (`["length","paris","5"]`) and read the graph they form. |
| [StringWalk](StringWalk/) | 2026-09 | superseded by EdgeOnEdge | Cut a pile of paperwork into three-string facts and walk the connections. |
| [EdgeOnEdge](EdgeOnEdge/) | 2026-09 | dormant | Files come in as they are; the structure is read off afterwards, with tags on the connections. |
| [Entwine](Entwine/) | 2026-10 | draft | Store what cutters find as small trees; work out what they share at read time. |
| [SpeedOfTime](SpeedOfTime/) | 2026-10 | draft | Find records and boundaries in a raw stream from changes in surprise. |

## Adding a project

Make a new folder with a README (or SPEC or DESIGN) that says what it tries and where it left off, then
add a row above. When a project goes quiet, update its status so it's easy to pick up again.
