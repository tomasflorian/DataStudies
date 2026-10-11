#!/usr/bin/env bash
# merge.sh — union atom lines from stdin into an inert pile file.
#
#   producer | ./merge.sh pile.atoms
#
# The replacement is atomic, so a file watcher sees either the old set or the
# new set, never a half-written pile. LC_ALL=C makes the representation stable.
set -e
cd "$(cd "$(dirname "$0")" && pwd)"
export LC_ALL=C

PILE=${1:-pile.atoms}
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
# Lock a stable sidecar because the atom file itself is replaced atomically.
# This prevents two simultaneous local merges from both starting with the same
# old set and losing whichever replacement lands first.
exec 9>"$PILE.lock"
flock 9
[ -f "$PILE" ] || : > "$PILE"
cat "$PILE" - | sed '/^[[:space:]]*$/d' | sort -u > "$TMP/next"
mv "$TMP/next" "$PILE"
echo "pile: $(wc -l < "$PILE") atoms in $PILE"
