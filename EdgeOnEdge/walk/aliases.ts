// WALK — the tuning files' aliases: what to call words on screen. Pure: text in, names
// out.
//
//   alias raised-by = raised by          say "raised by" wherever the word is raised-by
//
// A tuning file's "tag" lines are not read here: tune.ts turns them into lines in the pile,
// so they are switches like any other. Aliases only rename, so they stay with the reader.
// Blank lines and lines starting with # are ignored.

export function parseAliases(text: string): Record<string, string> {
  const aliases: Record<string, string> = {};
  for (const raw of text.split("\n")) {
    const [keyword, ...rest] = raw.trim().split(/\s+/);
    const [left, right] = rest.join(" ").split("=").map((part) => part.trim());
    if (keyword === "alias" && left && right) aliases[left] = right;
  }
  return aliases;
}

// Every tuning file's aliases, side by side.
export const mergeAliases = (all: Record<string, string>[]) => Object.assign({}, ...all) as Record<string, string>;
