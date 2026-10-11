#!/usr/bin/env node
// any2pile.ts — a raw document in, one line out.
//
//   ./any2pile.ts document.txt
//   ./any2pile.ts < document.txt
//   pass show some/document | ./any2pile.ts
//   ./sw.ts --introduce <(./any2pile.ts < document.txt)
//   ./any2pile.ts document.txt > pile/introduced/_document.pile
//
//   [<the whole document>, "document, is, is, document", <the whole document>]
//
// AN INTRODUCER, AND THE SMALLEST ONE THERE IS. Its only job is not to change a
// byte: no trimming, no line endings fixed, the byte-order mark kept. The one
// way it can still be wrong is decoding, so a document that is not valid UTF-8
// is refused rather than copied wrong.
//
// THE SAME LINE HOWEVER THE DOCUMENT ARRIVES. A file name is a detail of this
// machine and stdin has none, so neither is written down. The document is the
// only thing both ways know, and the thing two people could both arrive at. It
// says of itself only that it is a document, which is enough for `add document`
// to find it and for every cutter to read it.
//
// ONE BLOCKING READ, AND NEVER `process.stdin`. Reading stdin is readFileSync(0),
// which waits for the writer however slow it is — `pass` takes a moment. Merely
// looking at `process.stdin` turns the pipe non-blocking, and then that same read
// fails with EAGAIN whenever nothing has arrived yet. So a terminal is asked
// about with isatty(0), which does not touch it.
//
// Plain node runs this: it strips the types itself, so there is no tsx and no
// second process in front of the read.

import { readFileSync } from "node:fs";
import { isatty } from "node:tty";

const args = process.argv.slice(2);
if (args.length > 1 || (!args.length && isatty(0))) {
  console.error("usage: any2pile.ts <document>   or   any2pile.ts < document");
  process.exit(1);
}

const from = args.length && args[0] !== "-" ? args[0] : 0;
let text: string;
try {
  text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(readFileSync(from));
} catch (e) {
  console.error(`any2pile: ${from === 0 ? "stdin" : from}: ${(e as Error).message}`);
  process.exit(1);
}

console.log(JSON.stringify([text, "document, is, is, document", text]));
