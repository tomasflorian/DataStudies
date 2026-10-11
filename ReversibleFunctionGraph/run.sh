#!/usr/bin/env bash
# run.sh — run the producer and merge its atoms into the pile file.
#
#   npm start      # optional read-only viewer, watching pile.atoms
#   ./run.sh       # produce and merge into pile.atoms
#
# The pile keeps what it is given, so running this twice adds nothing the second
# time — merging is idempotent, and re-sending everything is free by design.
# Point at another file with RFG_PILE_FILE.
set -e
cd "$(cd "$(dirname "$0")" && pwd)"
exec ./rfg run combined --pile "${RFG_PILE_FILE:-pile.atoms}"
