#!/usr/bin/env bash
# cut.sh — catch a pile up: run every pile-reading tool until a round adds
# nothing. A thin spelling of `./rfg run --pile FILE`, kept because scripts and
# the README have said ./cut.sh for longer than rfg has existed.
set -e
cd "$(cd "$(dirname "$0")" && pwd)"
PILE=${1:-}
if [ -z "$PILE" ] || [ ! -f "$PILE" ]; then
  echo "usage: ./cut.sh <atoms-file>"; exit 1
fi
exec ./rfg run --pile "$PILE" < /dev/null
