#!/usr/bin/env bash
# check.sh — does parsing LATER lose anything? Run end to end, workings kept.
#
#   ./check.sh
#
# The question: does the same parse produce the same atoms when it runs LATER,
# against a document already sitting in the pile, as it did when it ran at
# intake? Same code both ways — producers/passwordrecord-cut compiles
# producers/passwordrecord/PasswordRecords.cs rather than a copy of it.
#
# Every intermediate is written to check/ so the answer can be read instead of
# taken on trust:
#
#   before.atoms     the old way: parsed at intake, straight off disk
#   ingested.atoms   the whole document as one atom, plus what is known about it
#   cut.atoms        what the cutter got out of that document
#   after.atoms      ingested + cut, sorted — the new way, entire
#   after2.atoms     the pile a SECOND pass lands on. Must equal after.atoms
#   lost.atoms       in before and not in after. MUST BE EMPTY
#   added.atoms      in after and not in before. Read this one by eye
#   scanned.atoms    after.atoms with every cutter run over it until nothing
#                    new came out — the Notes read at last. Stages 4-6.
#
# This is not a regression artifact like snapshots/. It needs
# local/sample/example2.txt, which is data and is not in the repo.
#
# LC_ALL=C is not decoration. Without it `sort` uses the locale's collation,
# `comm` disagrees, prints "file 2 is not in sorted order", and then reports
# nonsense that looks like a catastrophic diff.
set -e
cd "$(cd "$(dirname "$0")" && pwd)"
export LC_ALL=C
mkdir -p check

SRC=local/sample/example2.txt
[ -f "$SRC" ] || { echo "missing $SRC — that file is data, and data is not in the repo"; exit 1; }

# the old way — parse at intake
dotnet run --project producers/passwordrecord -- "$SRC" | sort > check/before.atoms

# the new way — ingest whole, then cut what is in the pile
npx tsx ingest.ts "$SRC" > check/ingested.atoms
dotnet run --project producers/passwordrecord-cut < check/ingested.atoms > check/cut.atoms
cat check/ingested.atoms check/cut.atoms | sort > check/after.atoms

# and again, over a pile that now contains the cutter's own output
dotnet run --project producers/passwordrecord-cut < check/after.atoms \
  | cat check/after.atoms - | sort -u > check/after2.atoms

# stages 4-6: read what intake left whole. No pass count and no tool names — rfg
# runs every pile-reading tool until a round adds nothing.
cp check/after.atoms check/scanned.atoms
./rfg run --pile check/scanned.atoms < /dev/null

comm -23 check/before.atoms check/after.atoms > check/lost.atoms
comm -13 check/before.atoms check/after.atoms > check/added.atoms

echo
echo "before      $(wc -l < check/before.atoms)"
echo "after       $(wc -l < check/after.atoms)"
echo "lost        $(wc -l < check/lost.atoms)      <- must be 0"
echo "added       $(wc -l < check/added.atoms)"
cmp -s check/after.atoms check/after2.atoms \
  && echo "caught up    second pass added nothing" \
  || echo "NOT CAUGHT UP — see check/after2.atoms"
echo "scanned     $(wc -l < check/scanned.atoms)   (the pile after every cutter)"
