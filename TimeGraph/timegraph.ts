#!/usr/bin/env node

import readline from "node:readline";

type Command = {
  name: string;
  arg: string;
};

type TimeGraph = {
  maxT: number;
  values: Set<string>;
  out: Map<string, Set<string>>;
  edgeCount: Map<string, number>;
};

function createGraph(maxT: number): TimeGraph {
  return {
    maxT,
    values: new Set(),
    out: new Map(),
    edgeCount: new Map(),
  };
}

function parseCommand(line: string): Command {
  const space = line.indexOf(" ");
  if (space === -1) return { name: line, arg: "" };
  return { name: line.slice(0, space), arg: line.slice(space + 1) };
}

function runCommand(graph: TimeGraph, command: Command): void {
  if (command.name === "add") {
    encodeAtoms(graph, command.arg);
    console.log(`encoded: ${command.arg.length} chars`);
    return;
  }
  if (command.name === "edges") {
    printEdges(graph, command.arg);
    return;
  }
  if (command.name === "values") {
    printValues(graph);
    return;
  }
  if (command.name === "promote") {
    autoPromote(graph, 2);
    return;
  }
  if (command.name === "stats") {
    console.log(`maxT: ${graph.maxT}`);
    console.log(`values: ${graph.values.size}`);
    console.log(`edges: ${graph.edgeCount.size}`);
    return;
  }
  console.log(`unknown command: ${command.name}`);
}

function encodeAtoms(graph: TimeGraph, input: string): void {
  for (let pos = 0; pos < input.length; pos++) {
    const value = input[pos];
    graph.values.add(value);
    addEdge(graph, timeKey(graph, pos), valueKey(value));
    if (pos + 1 < input.length) {
      addEdge(graph, valueKey(value), timeKey(graph, pos + 1));
    }
  }
}

function addEdge(graph: TimeGraph, from: string, to: string): void {
  if (!graph.out.has(from)) graph.out.set(from, new Set());
  graph.out.get(from)?.add(to);
  const key = `${from}|${to}`;
  graph.edgeCount.set(key, (graph.edgeCount.get(key) ?? 0) + 1);
}

function setEdgeCount(graph: TimeGraph, from: string, to: string, count: number): void {
  if (!graph.out.has(from)) graph.out.set(from, new Set());
  graph.out.get(from)?.add(to);
  graph.edgeCount.set(`${from}|${to}`, count);
}

function getEdgeCount(graph: TimeGraph, from: string, to: string): number {
  return graph.edgeCount.get(`${from}|${to}`) ?? 0;
}

function timeKey(graph: TimeGraph, pos: number): string {
  return `t:${pos % graph.maxT}`;
}

function valueKey(value: string): string {
  return `v:${value}`;
}

function valueFromKey(key: string): string {
  return key.slice(2);
}

function isAtomKey(key: string): boolean {
  return key.startsWith("v:") && valueFromKey(key).length === 1;
}

function printEdges(graph: TimeGraph, rawNode: string): void {
  const from = rawNode.startsWith("t") ? `t:${rawNode.slice(1)}` : valueKey(rawNode);
  const tos = [...(graph.out.get(from) ?? [])].sort();
  if (tos.length === 0) {
    console.log(`${rawNode}: no outgoing edges`);
    return;
  }
  for (const to of tos) {
    const count = getEdgeCount(graph, from, to);
    console.log(`${displayNode(from)} -> ${displayNode(to)} x${count}`);
  }
}

function displayNode(key: string): string {
  if (key.startsWith("t:")) return `t${key.slice(2)}`;
  return JSON.stringify(key.slice(2));
}

function printValues(graph: TimeGraph): void {
  const values = [...graph.values].sort((a, b) => a.length - b.length || a.localeCompare(b));
  console.log(values.map((value) => JSON.stringify(value)).join(" "));
}

function autoPromote(graph: TimeGraph, threshold: number): void {
  let added = 0;
  for (let i = 0; i < graph.maxT; i++) {
    const t0 = timeKey(graph, i);
    const t1 = timeKey(graph, i + 1);
    const t2 = timeKey(graph, i + 2);
    for (const aKey of graph.out.get(t0) ?? []) {
      if (!isAtomKey(aKey)) continue;
      const a = valueFromKey(aKey);
      const aIn = getEdgeCount(graph, t0, aKey);
      const aOut = getEdgeCount(graph, aKey, t1);
      if (Math.min(aIn, aOut) < threshold) continue;
      for (const bKey of graph.out.get(t1) ?? []) {
        if (!isAtomKey(bKey)) continue;
        const b = valueFromKey(bKey);
        const bIn = getEdgeCount(graph, t1, bKey);
        if (bIn < threshold) continue;
        const candidate = a + b;
        if (graph.values.has(candidate)) continue;
        const count = Math.min(aIn, aOut, bIn);
        graph.values.add(candidate);
        setEdgeCount(graph, t0, valueKey(candidate), count);
        setEdgeCount(graph, valueKey(candidate), t2, count);
        console.log(`promoted ${JSON.stringify(candidate)} x${count}`);
        added++;
      }
    }
  }
  if (added === 0) console.log("promoted 0 values");
}

function main(): void {
  const graph = createGraph(10);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "> " });
  rl.on("line", (line) => {
    const command = parseCommand(line);
    if (command.name === "quit" || command.name === "exit") return rl.close();
    runCommand(graph, command);
    rl.prompt();
  });
  rl.prompt();
}

main();
