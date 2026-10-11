// rfg.config.ts — the tools rfg knows how to run.
//
// ONE LIST. A tool is a command that prints atom lines; that is the whole
// contract, and the pile cannot tell one from another. `pile: true` says the
// tool READS atom lines on stdin, which is not a category anybody picks — it is
// a fact about the program, and the only thing that matters about it is that
// such a tool is worth running again after something new arrives.
//
// A tool does not have to be on this list to be a producer. Anything that prints
// atoms can be piped straight in:
//
//   npx tsx ingest.ts somefile.txt | ./rfg run
//
// The list is for the ones you run often enough to want a name for.

// WHAT THIS PILE IS MADE OF. `./rfg run` brings every one of these in before
// catching up, so one command rebuilds the pile from nothing — which is only
// safe because merging is idempotent and these tools are pure: running them
// again on an unchanged file adds nothing at all.
//
// Without this list the paths live in your shell history and nothing can be
// rebuilt. With it, `./rfg run --fresh` means exactly "start over".

export interface Input {
  tool: string;
  args: string[];
}

export interface Tool {
  command: string[];
  description: string;
  pile?: true;       // reads atom lines on stdin, so re-run it until it is caught up
}

export default {
  pile: "pile.atoms",

  inputs: [
    { tool: "ingest", args: ["local/sample/example2.txt"] },
  ] satisfies Input[],

  tools: {
    ingest: {
      command: ["npx", "tsx", "ingest.ts"],
      description: "a whole file, kept as one atom (takes a path)",
    },
    combined: {
      command: ["npx", "tsx", "scenarios/combined.ts"],
      description: "the combined demonstration graph",
    },
    repo: {
      command: ["./producers/repo.sh"],
      description: "facts about this repository",
    },
    timesheet: {
      command: ["dotnet", "run", "--project", "producers/timesheet"],
      description: "the C# timesheet example",
    },

    passwords: {
      command: ["dotnet", "run", "--project", "producers/passwordrecord-cut"],
      description: "cut password records out of a document already held",
      pile: true,
    },
    scan: {
      command: ["npx", "tsx", "producers/scan.ts"],
      description: "addresses, URLs and hosts inside a Notes value",
      pile: true,
    },
    entropy: {
      command: ["npx", "tsx", "producers/entropy.ts"],
      description: "score every word by how generated it looks",
      pile: true,
    },
    shortstring: {
      command: ["npx", "tsx", "producers/shortstring.ts"],
      description: "mark values that read like a word somebody typed",
      pile: true,
    },
  } satisfies Record<string, Tool>,
};
