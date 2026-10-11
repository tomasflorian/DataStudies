// CORE — id(line) = hash( left · right ). Imports nothing from walk/.
//
// An end is a string — a value — or a number — a reference to a line, by that line's id.
// A line's id is its content: the same two ends are the same line, whoever writes it, so the
// id is worked out from the ends when a line is read, never stored. Who said a line is
// another line about it, not part of its name.

import { createHash } from "node:crypto";

export type End = string | number;

// Each end with its type and length, so the value "42" and a reference to line 42 stay
// apart, and so do "ab"+"c" and "a"+"bc". 48 bits: a number JSON carries exactly.
export function id(left: End, right: End): number {
  const hash = createHash("sha256");
  for (const end of [left, right]) hash.update(typeof end === "number" ? `#${end};` : `${Buffer.byteLength(end)}:${end}`);
  return parseInt(hash.digest("hex").slice(0, 12), 16);
}

// Whether a value read from a file can be a reference: a whole number an id can be.
export const isReference = (end: unknown): end is number => Number.isSafeInteger(end) && (end as number) >= 0 && (end as number) < 2 ** 48;
