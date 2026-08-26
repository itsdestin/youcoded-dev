#!/bin/bash
# montage-ab.sh <outDir> <surfaces> <themes> <label>=<shotsRoot> [<label>=<shotsRoot> ...]
#
# Before/after sheets for a UI PR: one sheet per surface, one ROW per theme, one COLUMN per
# labelled capture root (e.g. before=scratch/ui-review-2026-08-25 after=scratch/phase-a).
# <surfaces> is a comma list of <plan>/<name> (e.g. main/home,overlays/permission-prompt);
# each root must contain shots-<plan>/<theme>/<name>.png — the verified layout shot.mjs
# writes, so a miss simply shows "(not captured)" instead of a wrong picture.
set -e
OUT=$1; SURFACES=$2; THEMES=$3; shift 3
mkdir -p "$OUT"
IFS=',' read -r -a S <<< "$SURFACES"; IFS=',' read -r -a T <<< "$THEMES"
LABELS=(); ROOTS=()
for kv in "$@"; do LABELS+=("${kv%%=*}"); ROOTS+=("${kv#*=}"); done
cols=${#LABELS[@]}
count=0
for s in "${S[@]}"; do
  plan=${s%%/*}; name=${s#*/}; args=()
  for t in "${T[@]}"; do
    for i in "${!LABELS[@]}"; do
      f="${ROOTS[$i]}/shots-$plan/$t/$name.png"
      if [ -f "$f" ]; then args+=( -label "$t · ${LABELS[$i]}" "$f" ); else args+=( -label "$t · ${LABELS[$i]} (not captured)" null: ); fi
    done
  done
  montage "${args[@]}" -tile "${cols}x" -geometry 720x+8+8 -background '#808080' -fill white -pointsize 18 "$OUT/$plan-$name.png"
  count=$((count+1))
done
echo "built $count before/after sheets in $OUT"
