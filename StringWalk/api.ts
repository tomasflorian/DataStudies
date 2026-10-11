// api.ts — what a client may ask the pile, and what it gets back.
//
// THIS IS THE BOUNDARY. sw.ts, read.ts and the page talk to the pile through
// these shapes and nothing else, and server.ts carries them over HTTP. When a
// client needs something that is not here, it arrives as a change to this file.
//
// TYPES ONLY, so the page can import them without importing the engine: a browser
// gets the contract without a line of the code behind it.
//
// OVER HTTP (server.ts):
//
//   POST /step               StepRequest -> StepReply
//   GET  /taxonomies/        { taxonomies: string[] } — the files there are
//   GET  /taxonomies/<n>.pile  one of them, as the lines it is
//   GET  /                   the page
//
// A request that is not these shapes is a 400 with { message } whose `in` is
// "request". The server holds no session: every request brings the session it is
// about, so a restart loses nothing and a request sent twice gets the same answer.

// A READING WRITTEN DOWN. `query` is the whole reading in the query language
// (query.ts); `focus` is the path from the first column to the cursor, "" for
// the pile. It is small enough to put in a URL, and it never holds a pile.
export interface Session { query: string; focus: string }

// ONE COMMAND, done whole or not at all. One that cannot be done gives back the
// session it was given, and a message saying why.
//
//   add     a step under the focus, and the focus follows · a/b/c a chain,
//           ../x a sibling · at "" it starts a reading, replacing any there was
//   cd      move the focus · .. the parent, / the pile · never creates
//   shorten toggle ~ on a column, or on the focus with null
//   query   replace the whole reading · the focus goes to the first column
export type Command =
  | { add: string }
  | { cd: string }
  | { shorten: string | null }
  | { query: string };

// Why something did not work. `at` is a position in the command or the query,
// for a caret; `suggest` is names that would have worked.
export interface Message {
  text: string;
  in: "command" | "query" | "request";
  at: number | null;
  suggest: string[];
}

export interface PileSummary { lines: number; values: number; relations: number; phrases: number; kinds: number }

// A column of the reading. `path` is how to name it in a command — `cd /<path>`.
// `label` is its own name, `header` the whole route to it. A shortened column's
// cells are stubs, and the values they stand for never leave the engine.
// `missing` is a group's kinds this pile has no lines for.
export interface ViewColumn {
  id: string;
  parent: string | null;
  path: string;
  label: string;
  header: string;
  short?: boolean;
  missing?: string[];
}

// What can be added at the focus. `have` is how many of the focused column's
// values — or the pile's, at "" — can take the step; `ways` more than 1 means it
// needs `*`. `narrower` picks one way: a kind with one verb.
export interface Narrower { name: string; have: number; ways: number }
export interface OfferItem { name: string; have: number; ways: number; narrower: Narrower[] }

// A CLIENT'S OWN NAMES, COUNTED. A client with a taxonomy sends its groups — a
// name and the kinds under it — and gets back how many values each reaches from
// here, as a union, which it could not work out from the kinds' counts itself.
// Nothing here is kept: the groups shape this answer and are gone.
export type Groups = Record<string, string[]>;
export interface GroupOffer {
  name: string;
  have: number;        // the union of values its kinds are reached by from here
  ways: number;        // every phrase into any of its kinds — more than 1 needs *
  kinds: string[];     // the kinds of it reachable from here
  missing: string[];   // the kinds of it this pile has no lines for
}

export interface View {
  query: string;          // canonical, or as given when it no longer works
  focus: string | null;   // the focused column's id, null at the pile
  columns: ViewColumn[];
  rows: (string | null)[][];   // parallel to columns · null is a hole
  offers: { of: number; items: OfferItem[]; groups: GroupOffer[] };
  message: Message | null;
  pile: PileSummary;
}

export interface StepRequest { session?: Session; command?: Command | null; groups?: Groups }
export interface StepReply { session: Session; view: View }
