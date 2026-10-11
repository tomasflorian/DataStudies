#!/usr/bin/env bash
# atom.sh — the smallest producer there is. One call in, one atom out.
#
#   ./producers/atom.sh length cat 3
#   ["length","cat","3"]
#
#   ./producers/atom.sh hasLetter cat z false | ./merge.sh pile.atoms
#
# The function, then its arguments, then the answer. Everything between the first
# and the last is an argument, so this takes any arity without being told.
#
# There is nothing else to it, and that is the point: a person who has noticed
# something can write it down without a program, a schema, or permission. What
# comes out is the same line `scenarios/combined.ts` writes after running a
# function, and the pile cannot tell them apart — it has no vocabulary and cannot
# check that an answer is right, only that it is shaped like an atom.
set -e

if [ $# -lt 3 ]; then
  echo "usage: atom.sh <fn> <arg>... <result>" >&2
  echo "   eg: atom.sh length cat 3" >&2
  exit 1
fi

out='['
first=1
for part in "$@"; do
  # Backslash and quote, which is all a JSON string needs here. A value holding a
  # newline would need more; nothing this is meant for does.
  esc=$(printf '%s' "$part" | sed 's/\\/\\\\/g; s/"/\\"/g')
  if [ $first -eq 1 ]; then first=0; else out="$out,"; fi
  out="$out\"$esc\""
done
printf '%s]\n' "$out"
