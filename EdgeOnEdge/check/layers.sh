#!/usr/bin/env bash
# The layers point one way. Nothing but walk/ itself, check/ and the eoe.ts CLI may import
# walk/, and core/ may not import walk/. Inside walk/, each concern imports
# only those before it in ORDER, and only server.ts reads files or serves.
cd "$(dirname "$0")/.."
fail=0
while IFS= read -r hit; do echo "walk/ imported outside walk: $hit"; fail=1; done < <(
  grep -rnE "from ['\"][./]*walk/" --include='*.ts' . \
    | grep -v node_modules | grep -vE '^\./(walk/|check/|local/|eoe\.ts:)')
while IFS= read -r hit; do echo "core/ reaches upward: $hit"; fail=1; done < <(
  grep -nE "from ['\"][./]*walk/" core/*.ts)

ORDER=(aliases context words structure switches lattice types files steps reading kinds walk server)
position() { local i; for i in "${!ORDER[@]}"; do [ "${ORDER[$i]}" = "$1" ] && echo "$i" && return; done; echo -1; }
for file in walk/*.ts; do
  me=$(basename "$file" .ts); mine=$(position "$me")
  [ "$mine" = -1 ] && { echo "walk/$me.ts is not in ORDER"; fail=1; continue; }
  for used in $(grep -oE "from \"\./[a-z]+\.ts\"" "$file" | sed -E 's/from "\.\/([a-z]+)\.ts"/\1/'); do
    [ "$(position "$used")" -lt "$mine" ] || { echo "walk/$me.ts imports $used.ts, which comes after it"; fail=1; }
  done
  [ "$me" != server ] && grep -qE "from \"node:(fs|http)\"" "$file" && { echo "walk/$me.ts reads files or serves"; fail=1; }
done
[ $fail = 0 ] && echo "layers ok"
exit $fail
