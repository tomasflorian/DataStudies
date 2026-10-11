# Time Graph — Design

A directed graph that encodes sequences without grammar, schema, or templates.
Structure emerges from what strings share positionally.

---

## Model

Two node kinds:

- **Time node** — a phase position `t0 … t(MaxT-1)`. Substrate, not schema. Position is a fact about the world, not an interpretation of it.
- **Value node** — a string. Globally deduplicated. The string is the identity.

Edges are directed. Every valid traversal alternates: time → value → time → value → …

A time node may point to many value nodes. A value node may point to many time nodes.

---

## Phase Time

Time is not absolute position. It is:

```
t = position mod MaxT
```

`t0` does not mean "the start of this string." It means "a position that is a multiple of MaxT." Any string of any length passes through `t0` multiple times. There is no privileged origin.

This is intentional. An absolute `t0` shared by the first character of every string ever encoded becomes a universal hub by accident, not meaning. Phase time distributes that load across `MaxT` nodes.

---

## MaxT — the verbatim knob

MaxT controls a single trade-off:

> **At what text length does the model cease to be verbatim?**

| MaxT | Behavior |
|---|---|
| ∞ | Fully verbatim. Every position is unique. No phase sharing. |
| N | Positions that differ by a multiple of N share a time node. |
| 1 | Maximum abstraction. All positions collapse to one time node. |

There is no correct MaxT. Practical starting range: **30–50** for character-level encoding. The rule of thumb: MaxT should exceed the typical length of a promoted chunk. If promoted chunks average 5 characters and MaxT = 3, chunk boundaries collapse into the same few phases and the phase structure is destroyed.

As vocabulary matures and promoted chunks grow longer, MaxT may need to grow with them.

---

## Phase time example

MaxT = 10. Encoding three strings:

```
"cat"      → c@0 a@1 t@2
"the cat"  → t@0 h@1 e@2 ' '@3 c@4 a@5 t@6
"a cat"    → a@0 ' '@1 c@2 a@3 t@4
```

"cat" appears at phases (0,1,2), (4,5,6), and (2,3,4) — different phase alignments in each string. The time-node structure differs across them.

Once "cat" is promoted and chunked encoding is used:

```
"cat"      → t0 → "cat" → t3
"the cat"  → t0 → "the" → t3 → " " → t4 → "cat" → t7
"a cat"    → t0 → "a" → t1 → " " → t2 → "cat" → t5
```

All three routes through the same "cat" value node. Repetition is visible at the **value level** regardless of phase alignment. Phase structure captures positionally-aligned repetition; value statistics capture phase-agnostic repetition. The two mechanisms are complementary.

---

## Core Types

```ts
type Time = number          // 0 … MaxT-1
type Value = string

interface TimeNode { kind: "time";  t: Time  }
interface ValueNode { kind: "value"; value: Value }

interface Edge { from: string; to: string }

interface TimeGraph {
  maxT: number

  values:    Set<Value>

  out:       Map<string, Set<string>>
  edgeCount: Map<string, number>       // key: "fromKey|toKey"
}
```

Node keys for internal maps:

```ts
timeKey(t)        = "t:" + (t % maxT)
valueKey(v)       = "v:" + v
```

The `v:` prefix prevents collisions between value `"3"` and time node `t3`.

---

## Invariants

- Every edge is directed.
- A legal string traversal alternates time and value nodes.
- Time nodes are never duplicated. There is exactly one node per phase value `0 … MaxT-1`.
- Two absolute positions at distance MaxT share the same time node.
- Value nodes are never duplicated. The value string is the identity.
- Multi-character values added via `promote` must have length greater than 1.
- Atomic ASCII characters are always valid fallback values.
- Adding a value does not delete or rewrite existing paths.
- All values in `values` are candidates for chunking — there is no separate gate.
- MaxT is a runtime parameter. The graph does not bake it in permanently.

---

## Encoding

One mode. At each character position, create edges for **every known value that matches there** — atoms and multi-character values simultaneously. No choice is made at encode time about which decomposition is preferred. That choice belongs to query time.

```ts
function encode(input: string): void {
  for (let pos = 0; pos < input.length; pos++) {
    for (const value of valuesMatchingAt(input, pos)) {
      addEdge(timeKey(pos), valueKey(value))
      const nextPos = pos + value.length
      if (nextPos < input.length) {
        addEdge(valueKey(value), timeKey(nextPos))
      }
    }
  }
}

function valuesMatchingAt(input: string, pos: number): Value[] {
  return (valuesByFirstChar.get(input[pos]) ?? [])
    .filter(v => input.startsWith(v, pos))
}
```

Paths may end at a value node. No explicit end marker in this version.

`timeKey` applies `mod maxT` internally. `pos` is absolute position; the graph stores only the phase.

---

## Chunking

At each offset, select the best matching value node:

```ts
function chunk(input: string): Value[] {
  const chunks: Value[] = []
  let i = 0

  while (i < input.length) {
    const value = bestValueAt(input, i)
    chunks.push(value)
    i += value.length
  }

  return chunks
}
```

`bestValueAt` selects the known value that starts at offset `i` by:

1. Longest match first
2. Higher `edgeCount(timeKey(i), valueKey(v))` to break ties — prefers values with stronger evidence at this specific phase
3. Single ASCII character as fallback

Index for efficiency:

```ts
valuesByFirstChar: Map<string, Value[]>
// each bucket sorted: longer first, then higher phase-specific edge count
```

---

## Promotion

Promotion adds a multi-character string to `values`. Once in `values`, it is immediately a candidate for chunking — no separate gate. There is no promoted/unpromoted distinction in the data structure.

Promotion does two things:

1. **Compression** — longer chunks produce shorter paths.
2. **Phase-invariant detection** — all occurrences of a promoted string, regardless of where they fall in the phase cycle, route through the same value node and accumulate shared edge statistics.

**Manual** (`promote <text>`): bootstrap and domain knowledge injection. Use when data is too sparse for auto-detection but you know the string is meaningful.

**Automatic** (`promote`): scans atom chains in the graph. A candidate is a concatenation of atoms whose connecting edges are all strong:

```
for each time node t_i:
  let t_j = (t_i + 1) mod MaxT
  for each atom a1 where edgeCount(t_i → a1) >= threshold
                    and  edgeCount(a1 → t_j) >= threshold:
    for each atom a2 where edgeCount(t_j → a2) >= threshold:
      candidate = a1 + a2
      estimated saving = edgeCount(t_i → a1) * (length(candidate) - 1)
      if saving > 0: add candidate to values
```

After adding a new value, `promote` also **creates its chunk-level edges retroactively** by deriving counts from the atom chain — no need to re-encode existing strings:

```
new edgeCount(t_i → candidate) = min(edgeCount(t_i → a1), edgeCount(a1 → t_j))
new edgeCount(candidate → t_k) = edgeCount(t_j → a2)   where t_k = (t_i + length(candidate)) mod MaxT
```

This extends to longer chains by iterating: once 2-atom chunks are promoted, re-scan for chains involving those chunks.

---

## Path Search

Given a target string, find all graph paths that spell it:

```ts
function pathsFor(input: string, offset: number, pos: number): Path[] {
  if (offset === input.length) return [[]]

  const candidates = outgoingValues(timeKey(pos))
    .filter(v => input.startsWith(v, offset))
    .sort(byNavigationScore)

  const results = []
  for (const value of candidates) {
    const nextPos = pos + value.length
    const atEnd = nextPos === input.length
    const hasNext = hasEdge(valueKey(value), timeKey(nextPos))
    if (!atEnd && !hasNext) continue
    for (const tail of pathsFor(input, offset + value.length, nextPos)) {
      results.push([value, ...tail])
    }
  }
  return results
}
```

Limit explosion with: max result count, max branch count per time node, longest values first.

---

## Navigation & Hub Avoidance

Hubs are expected and not removed. Common characters (`"e"`, `" "`), common multi-character values, and low-numbered phase nodes will all attract high degree. Navigation ranks around them.

Score for choosing a value node from a time node:

```
score =
    value.length        * 1000
  + edgeCount(t → v)   * 10
  - outDegree(v)
```

This is intentionally rough. The CLI should print score breakdowns so bad heuristics are visible.

Useful metrics exposed:

```ts
outDegree(node)        // out[node].size
edgeCount(from, to)    // how many times this specific directed edge was added
value.length
```

---

## CLI Commands

```
add <text>          encode: at each position, create edges for all matching values
promote <text>      manually add a multi-character string to values (bootstrap / override)
promote             auto: scan atom chains, promote candidates, create retroactive edges
read <text>         show preferred chunking without encoding
paths <text>        show all graph paths that spell text
values              list all known values
edges <node>        show outgoing edges from a node
stats               node / edge summary
```

### Demo session  (MaxT = 10, threshold = 2)

```
> add dog
pos 0: "d" → t0→"d"(1)  "d"→t1(1)
pos 1: "o" → t1→"o"(1)  "o"→t2(1)
pos 2: "g" → t2→"g"(1)
values=[d g o]
```

```
> add doing
pos 0: "d" → t0→"d"(2)  "d"→t1(2)
pos 1: "o" → t1→"o"(2)  "o"→t2(2)
pos 2: "i" → t2→"i"(1)  "i"→t3(1)
pos 3: "n" → t3→"n"(1)  "n"→t4(1)
pos 4: "g" → t4→"g"(1)
values=[d g i n o]
note:   t0→d, d→t1, t1→o, o→t2 all at 2 — "do" chain threshold reached.
```

```
> promote
candidate: "do"  chain t0→"d"(2)→t1→"o"(2)→t2  saving: 2*(2-1)=2
added "do" to values
retroactive edges: t0→"do"(2)  "do"→t2(2)   ← derived from atom chain counts

values=[d do g i n o]
```

```
> add door
pos 0: "d"  → t0→"d"(3)   "d"→t1(3)
pos 0: "do" → t0→"do"(3)  "do"→t2(3)   ← "do" now in values, matched here
pos 1: "o"  → t1→"o"(3)
pos 2: "o"  → t2→"o"(1)
pos 3: "r"  → t3→"r"(1)
note:   atom and chunk edges built simultaneously in one pass.
```

```
> paths dog
1.  t0 → "do" → t2 → "g"
2.  t0 → "d"  → t1 → "o" → t2 → "g"
note:   path 1 ranked first — "do" scores higher at t0 (length 2 vs 1).
        both paths are valid — all edges pre-built by prior adds.
```

```
> read dog
do + g
note:   preferred chunking at query time. does not encode.
```

```
> edges t0
t0 → "d"   ×3
t0 → "do"  ×3
```

```
> values
d  do  g  i  n  o  r
```

```
> stats
time nodes (active):  5   t0 t1 t2 t3 t4  (of MaxT=10)
value nodes:          7
unique edges:         14
total edge weight:    24
```

---

## Parsing Rules

- Input is ASCII. Reject or escape non-ASCII.
- Preserve whitespace exactly.
- Do not trim unless the command explicitly requests it.
- Empty string creates no path.

---

## Implementation Steps

1. Node key helpers (`timeKey`, `valueKey`) and graph storage.
2. `addEdge`, `addValue`, `outDegree` helper, `edgeCount` map.
3. `valuesMatchingAt` and `valuesByFirstChar` index.
4. `encode`: sliding window, all matching values at each position.
5. Manual promotion (`promote <text>`).
6. Path search (`pathsFor`): pure edge traversal.
7. `bestValueAt` and `read`: preferred chunking at query time.
8. CLI commands and debug output.
9. Automatic promotion: atom chain scan + retroactive edge creation.

---

## Open Questions

- Should MaxT be inferred from data rather than set externally? Candidate: mode or median of multi-character value lengths, updated as vocabulary grows.
- Should `paths` output be ranked by total path score rather than returned in DFS order?
- Auto-promotion currently scans 2-atom chains. Should it iterate to discover longer chains, or wait for chunked encodes to build up evidence for those naturally?
