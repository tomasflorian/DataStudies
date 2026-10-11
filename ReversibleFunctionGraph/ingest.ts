#!/usr/bin/env node
// ingest.ts — a document in, one atom out. The whole thing, verbatim.
//
//   npx tsx ingest.ts local/sample/example2.txt
//   npx tsx ingest.ts local/sample/example2.txt | ./merge.sh pile.atoms
//
// An intake producer's job is to LOSE NOTHING, not to understand anything. This
// one does not look inside the file. Cutting happens afterwards, over and over,
// against the value this leaves in the pile.
//
// Three atoms:
//
//   ["isblob",   <the whole text>, <the whole text>]
//   ["cameFrom", <the whole text>, "local/sample/example2.txt"]
//   ["modified", <the whole text>, "2026-09-08T20:16:33.000Z"]
//
// THE BLOB NEEDS NOTHING TO HOOK ONTO. A function handing back its own input is
// the same shape as isIP and hasFormat, and it is what makes the text a node you
// can click, count and start a walk from. Everything else known about the
// document then hangs off that node as an ordinary call — which is why the path
// is a fact ABOUT the blob rather than the blob's name. A path is a detail of
// this machine; the bytes are the thing two people could both arrive at.
//
// modified is the file's own mtime, NOT the clock. An ingester is allowed to be
// impure — it runs once, by hand, and is never in the cutter loop — but reading
// the clock would mean running this twice on one file wrote two different atoms,
// and re-sending everything would stop being free. mtime does not survive a copy
// or a clone, so it will fork if the same document is ingested from two places.
// That is a true fork and the picture is welcome to show it; delete the line if
// the noise is worse than the provenance.
//
// NOT WRITTEN: how big it is, what it looks like, what is in it. A cutter can
// work all of that out from the blob. Only what cannot be recomputed is worth
// capturing here, because this is the one step that gets no second chance.

import { readFileSync, statSync } from "node:fs";
import { format } from "./expand.js";
import type { Atom } from "./expand.js";

const path = process.argv[2];
if (!path) {
  console.error("usage: npx tsx ingest.ts <file>");
  process.exit(1);
}

const text = readFileSync(path, "utf8");

const atoms: Atom[] = [
  ["isblob", text, text],
  ["cameFrom", text, path],
  ["modified", text, statSync(path).mtime.toISOString()],
];

process.stdout.write(format(atoms));
