# Data Studies

Experiments in reading raw data — logs, hosts files, DNS zones, receipts, plain text — without
deciding first what the things in it are. No schema up front: structure is found in the data, or
chosen by whoever is reading it.

[PHILOSOPHY.md](PHILOSOPHY.md) says why. [PATTERNS.md](PATTERNS.md) says how to build with it.
[CHECKLIST.md](CHECKLIST.md) says what each attempt is measured against.

## Projects

Newest first. Each folder is a self-contained project with its own README, SPEC or DESIGN.
TextForm is the one being worked on; the others are dormant, kept as they were left.

| Project | Started | Status | In one line |
|---|---|---|---|
| **[TextForm](TextForm/)** | **2026-10** | **active** | **Plain text with dictionaries laid over it: values, patterns and rules find typed stretches, and a table reads them off. The text stays as written.** |
| [FigureGroundCube](FigureGroundCube/) | 2026-10 | dormant (spec only) | Store facts; every way of blanking one out is a node, and facts meet on the ground they share. |
| [SpeedOfTime](SpeedOfTime/) | 2026-10 | dormant (draft) | Find records and boundaries in a raw stream from changes in surprise. |
| [Entwine](Entwine/) | 2026-10 | dormant (draft) | Store what cutters find as small trees; work out what they share at read time. |
| [EdgeOnEdge](EdgeOnEdge/) | 2026-09 | dormant | Files come in as they are; the structure is read off afterwards, with tags on the connections. |
| [StringWalk](StringWalk/) | 2026-09 | dormant (superseded by EdgeOnEdge) | Cut a pile of paperwork into three-string facts and walk the connections. |
| [ReversibleFunctionGraph](ReversibleFunctionGraph/) | 2026-08 | dormant | Store only function calls (`["year","2026-08-25","2026"]`) and read the graph they form. |
| [MonoFlow](MonoFlow/) | 2026-06 | dormant | Unsupervised text segmentation: grow tokens from single characters via a transition graph. |
| [TimeGraph](TimeGraph/) | 2026-05 | dormant | Encode sequences as a graph of phase-time and value nodes; structure emerges from what strings share by position. |

## Adding a project

Make a new folder with a README (or SPEC or DESIGN) that says what it tries and where it left off, then
add a row above. When a project goes quiet, update its status so it's easy to pick up again.
