#!/usr/bin/env bash
# repo.sh — a producer, in bash, written by hand.
#
#   ./producers/repo.sh                                       # look at them
#   ./producers/repo.sh | ./merge.sh pile.atoms
#
# It prints atoms to stdout and stops. That is the whole of a producer: there is
# no library to link against, no kernel to run, nothing to import, and it never
# reads the pile or coordinates with anybody. The pipe is the API.
#
# It exists to answer the one thing scenarios/combined.ts cannot ask on its own.
# combined.ts is a single program with a single `def` table, so a function name
# means one thing across the whole of it and defining it twice throws. Across
# producers there is no such table and nothing to throw. This is the second
# producer, so the question becomes answerable, and section 3 answers it.
#
# Values are quoted by hand below, which is fine for what is here and would not
# be for a value containing a newline. A real producer in bash would reach for
# jq. This one is deliberately the crudest thing that works.

set -e

esc() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }

# atom fn arg... result
atom() {
  local out='[' first=1 part
  for part in "$@"; do
    if [ $first -eq 1 ]; then first=0; else out="$out,"; fi
    out="$out\"$(esc "$part")\""
  done
  printf '%s]\n' "$out"
}

# --- 1. typed by hand -------------------------------------------------------
#
# Somebody sat down and wrote what they know. Every one of these lands on a value
# combined.ts already put in the graph — paris, tokyo, france, japan — so this
# whole section hangs off nodes another producer made, in another language, with
# no arrangement between them beyond both writing the same strings.

atom capitalOf   france  paris
atom capitalOf   japan   tokyo
atom speaks      paris   french
atom speaks      tokyo   japanese
atom timezone    paris   CET
atom timezone    tokyo   JST
atom onRiver     paris   seine
atom onRiver     tokyo   sumida

# --- 2. computed, and already known -----------------------------------------
#
# The same calls combined.ts made, worked out again in bash. Identical atoms, so
# the pile drops every one of them and the graph does not move. Two producers,
# two languages, no coordination, and re-deriving what somebody else already
# found costs nothing — which is what "merging is idempotent" means when it stops
# being a claim about sets and starts being two programs.

for w in cat act arc car tar rat art; do
  atom length "$w" "${#w}"
  atom upper  "$w" "$(printf '%s' "$w" | tr '[:lower:]' '[:upper:]')"
done

# --- 3. the same name, a different thing ------------------------------------
#
# THE POINT OF THIS FILE.
#
# combined.ts reads a CSV whose header is "first,last" and mints a function per
# column, so `first` there means "the first comma-separated field of a CSV row"
# and its subjects are rows like "carol,white".
#
# Here `first` means "the first part of a |-separated list". Nothing anywhere can
# stop this. `def` throws on a repeat inside one producer and there is no `def`
# here — no shared table, no registry, no check available even in principle,
# because the pile has no vocabulary and never runs a function.
#
# So the graph gets ONE `first` node with arrows from two unrelated kinds of
# call, and the picture is the only place it shows. Click `first` and the two
# meanings sit side by side: "carol,white" -> carol, and "paris|is|a|city" ->
# paris. Nothing is corrupted and no answer is wrong; the word is just doing two
# jobs, and a reader who anchors on `first` gets both.

atom first "paris|is|a|city"  paris
atom first "the|city|is|old"  the
atom first "tokyo|is|a|city"  tokyo
