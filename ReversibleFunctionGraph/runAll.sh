#!/usr/bin/env bash
# runAll.sh — build the graph and write its atoms to snapshots/combined.atoms.
#
#   ./runAll.sh
#   git diff snapshots/          # did anything move?
#
# The snapshot is the regression artifact. It is DETERMINISTIC: atoms are written
# in sorted order, so a diff line means the graph actually changed, not that a
# call moved. Refactor freely, re-run this, and the diff shows what shifted.
#
# It holds the ACTS and nothing else — no nodes, no edges, no readings. The graph
# is derived by whoever looks (expand.js, in the browser or in walk.js), so
# nothing here can go stale and no grouping decision is baked in. It is the same
# file the viewer fetches, so it is also directly viewable:
#
#   cp snapshots/combined.atoms pile.atoms
#
# Stdout is discarded. The graph does not narrate; the picture is the report.
set -e
cd "$(cd "$(dirname "$0")" && pwd)"
mkdir -p snapshots
RFG_OUT="snapshots/combined.atoms" npx tsx scenarios/combined.ts >/dev/null
echo "wrote snapshots/combined.atoms"
