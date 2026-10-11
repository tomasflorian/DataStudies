declare const process: {
  argv: string[];
  stdin: {
    isTTY?: boolean;
    on(event: "keypress", listener: (text: string, key: Key) => void): void;
    resume(): void;
    setRawMode?(enabled: boolean): void;
  };
  stdout: { write(text: string): void };
  exit(): never;
};
declare const require: (module: string) => {
  readFileSync(path: string, encoding: "utf8"): string;
  emitKeypressEvents?(input: unknown): void;
};

type Key = { name?: string; ctrl?: boolean };
const END = Symbol("end");
type Target = string | typeof END;

const { readFileSync } = require("node:fs");
const args = process.argv.slice(2);
const sparse = args.includes("--sparse");
const path = args.find(arg => arg !== "--sparse");

if (!path) throw new Error("usage: monoflow3.ts [--sparse] <text-file>");

const input = readFileSync(path, "utf8").toLowerCase();
let flow = [...input];

for (let round = 1; ; round++) {
  const outgoing = new Map<string, Set<Target>>();

  for (let i = 0; i < flow.length; i++) {
    const targets = outgoing.get(flow[i]) ?? new Set<Target>();
    targets.add(flow[i + 1] ?? END);
    outgoing.set(flow[i], targets);
  }

  const ambiguous = [...outgoing]
    .find(([, targets]) => targets.size > 1)?.[0];

  if (!sparse || round % 100 === 0 || !ambiguous) {
    console.log(`round ${round}:`);
    for (const [from, targets] of outgoing)
      for (const to of targets)
        console.log(`${from} -> ${to === END ? "[end]" : to}`);
  } else {
    console.log(`round ${round}`);
  }

  if (!ambiguous) break;

  const next: string[] = [];
  for (let i = 0; i < flow.length; i++) {
    if (i + 1 < flow.length && flow[i + 1] === ambiguous) {
      next.push(flow[i] + flow[i + 1]);
      i++;
    } else {
      next.push(flow[i]);
    }
  }

  if (next.join("\0") === flow.join("\0"))
    throw new Error(`cannot refine ${JSON.stringify(ambiguous)}`);

  flow = next;
  if (!sparse || round % 100 === 0) console.log();
}

if (flow.length && process.stdin.isTTY) walk(flow);

function walk(nodes: string[]): void {
  const outgoing = new Map<string, Target>();
  for (let i = 0; i < nodes.length; i++)
    outgoing.set(nodes[i], nodes[i + 1] ?? END);

  const readline = require("node:readline");
  readline.emitKeypressEvents?.(process.stdin);
  process.stdin.setRawMode?.(true);
  process.stdin.resume();

  let node: Target = nodes[0];
  console.log("\nwalk the graph (Enter/Space: next, q: quit)");
  process.stdout.write(JSON.stringify(node));

  process.stdin.on("keypress", (_text, key) => {
    if (key.name === "q" || (key.ctrl && key.name === "c")) finish();
    if (key.name !== "return" && key.name !== "space") return;

    node = outgoing.get(node as string) ?? END;
    process.stdout.write(` -> ${node === END ? "[end]\n" : JSON.stringify(node)}`);
    if (node === END) finish();
  });

  function finish(): never {
    process.stdin.setRawMode?.(false);
    process.exit();
  }
}
