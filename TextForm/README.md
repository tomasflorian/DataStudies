# TextForm

Plain text with dictionaries laid over it. The text is never changed: each dictionary line is a
rule that finds typed stretches of it, and a table reads them off by where they sit.

## Run

```
npm install
npm run build        # or: npm run watch
```

Open `index.html` straight from disk. Texts to try are in `data/` (the "load text…" list); premade
dictionaries are under "+ premade…".

## Dictionaries

One rule a line, `Type:value`. Lines with the same type add up.

```
Host:web01                              found as written
IP:192.168.1.[0-255]                    with blanks for what varies
SIN:SIN[*:..300]({SINFormat})           using a type; only the ( ) part is found
Record:Record:\n[*][break]              a region
FullRecord:{Record} containing {IP} {Host}+
Port:{Word} in {PortLine}
Block:cut "\n\n"                        the pieces between separators
Word:cut {Line} on " ", "\n"
Date:/\b[1-9][0-9]* May/                regex, the escape hatch
```

Blanks: `[0-255]` `[A-H]` `[digits]` `[hex]` `[word]` `[spaces]` `[line]` `[rest]` `[*]` `[break]`,
with a count after a colon: `[digits:9]`, `[digits:..9]`, `[digits:5..]`, `[*:..300]`.
The full description is at the top of `src/cut-core.js`.

## Table

Columns are types, `Host, IP`; `URL+IP` mixes two in one column. A row for each place of the first
type; the others are what's nearest it. Each column has a quick filter: text it holds, `!word`
for exactly that, `?` for empty cells.

## Tests

```
npm test             # or: npm run test:watch (reruns on save and on commit)
```

Golden tests: each writes what it got to `test/golden/<name>.txt`, and fails while that differs
from the committed file. Read the diff in git; committing it approves it.

## Files

- `src/cut-core.js`: the rules and the table, no page (what the tests use)
- `src/cutter.js`, `index.html`: the page
- `src/premade.js`: the premade dictionaries
- `data/`: sample texts: made up (`internet.txt`, `sin.txt`), from a containerlab lab
  (`lab.net.txt`), or from Wikipedia (`apple.wiki.txt`)
