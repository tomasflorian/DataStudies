declare const process: {
  argv: string[];
  stdin: { isTTY?: boolean };
  stdout: { write(text: string): void };
};
declare const require: (module: string) => any;

const END = Symbol("end");
type Target = string | typeof END;

const { readFileSync } = require("node:fs");
const args = process.argv.slice(2);
const sparse = args.includes("--sparse");
const normalize = args.includes("--normalize");
const thresholdArg = args.find(arg => arg.startsWith("--threshold="));
const threshold = Number(thresholdArg?.split("=")[1] ?? 0.2);
const path = args.find(arg => !arg.startsWith("--"));

if (!path)
  throw new Error(
    "usage: monoflow4.ts [--normalize] [--sparse]"
    + " [--threshold=0.2] <text-file>",
  );
if (!(threshold >= 0 && threshold <= 1))
  throw new Error("threshold must be between 0 and 1");

let input = readFileSync(path, "utf8").toLowerCase();
if (normalize) {
  input = input
    .replace(/[\r\n]/g, "")
    .replace(/[^\p{L}\p{N} ]/gu, "");
}
let flow = [...input];

for (let round = 1; ; round++) {
  // Pass 1: discover the graph.
  const outgoing = new Map<string, Set<Target>>();
  for (let i = 0; i < flow.length; i++) {
    const targets = outgoing.get(flow[i]) ?? new Set<Target>();
    targets.add(flow[i + 1] ?? END);
    outgoing.set(flow[i], targets);
  }

  // Pass 2: place bets and record what actually happened.
  const visits = new Map<string, number>();
  const actual = new Map<string, Map<Target, number>>();
  for (let i = 0; i < flow.length; i++) {
    const from = flow[i];
    const to = flow[i + 1] ?? END;
    visits.set(from, (visits.get(from) ?? 0) + 1);

    const edges = actual.get(from) ?? new Map<Target, number>();
    edges.set(to, (edges.get(to) ?? 0) + 1);
    actual.set(from, edges);
  }

  const refine = [...outgoing].find(([from, targets]) =>
    [...targets].some(to =>
      (actual.get(from)?.get(to) ?? 0) / visits.get(from)! < threshold
    )
  )?.[0];

  if (!sparse || round % 100 === 0 || !refine) {
    console.log(`round ${round}:`);
    for (const [from, targets] of outgoing) {
      const predicted = visits.get(from)!;
      for (const to of targets) {
        const hits = actual.get(from)?.get(to) ?? 0;
        const percent = (100 * hits / predicted).toFixed(1);
        console.log(
          `${from} -> ${to === END ? "[end]" : to}`
          + `  p/a ${predicted}/${hits}  ${percent}%`,
        );
      }
    }
  } else {
    console.log(`round ${round}`);
  }

  if (!refine) break;

  const next: string[] = [];
  for (let i = 0; i < flow.length; i++) {
    if (i + 1 < flow.length && flow[i + 1] === refine) {
      next.push(flow[i] + flow[i + 1]);
      i++;
    } else {
      next.push(flow[i]);
    }
  }

  if (next.join("\0") === flow.join("\0"))
    throw new Error(`cannot refine ${JSON.stringify(refine)}`);

  flow = next;
  if (!sparse || round % 100 === 0) console.log();
}

if (flow.length && process.stdin.isTTY) void walk(flow);

async function walk(nodes: string[]): Promise<void> {
  const edges = new Map<string, Map<Target, number>>();
  const visits = new Map<string, number>();

  for (let i = 0; i < nodes.length; i++) {
    const from = nodes[i];
    const to = nodes[i + 1] ?? END;
    visits.set(from, (visits.get(from) ?? 0) + 1);
    const targets = edges.get(from) ?? new Map<Target, number>();
    targets.set(to, (targets.get(to) ?? 0) + 1);
    edges.set(from, targets);
  }

  const readline = require("node:readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let node: Target = nodes[0];
  console.log("\nwalk the graph (choose at junctions, q to quit)");
  process.stdout.write(show(node));

  while (node !== END) {
    const targets = [...(edges.get(node) ?? [])];
    if (targets.length === 0) break;

    if (targets.length === 1) {
      node = targets[0][0];
      process.stdout.write(` -> ${show(node)}`);
      continue;
    }

    console.log();
    const total = visits.get(node)!;
    targets.forEach(([to, count], index) => {
      console.log(
        `${index + 1}. ${show(to)}  ${(100 * count / total).toFixed(1)}%`,
      );
    });

    let choice = -1;
    while (choice < 0 || choice >= targets.length) {
      const answer = await ask(rl, "choose> ");
      if (answer.trim().toLowerCase() === "q") {
        rl.close();
        return;
      }
      choice = Number(answer) - 1;
    }

    node = targets[choice][0];
    process.stdout.write(`-> ${show(node)}`);
  }

  console.log();
  rl.close();
}

function ask(rl: any, prompt: string): Promise<string> {
  return new Promise(resolve => rl.question(prompt, resolve));
}

function show(node: Target): string {
  return node === END ? "[end]" : JSON.stringify(node);
}
