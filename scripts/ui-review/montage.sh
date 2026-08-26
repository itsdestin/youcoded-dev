#!/bin/bash
# montage.sh <shotsDir> <outDir> [themes,comma,list]
# One labelled sheet per surface with every theme side by side (3 per row).
# Only verified shots exist at <shotsDir>/<theme>/<surface>.png — shot.mjs moves
# misses into _unverified/ — so a sheet can never show a mislabelled capture.
set -e
SRC=$1; OUT=$2; THEMES="${3:-midnight,light,halftone-dimension,meadow-mist,creme,dark}"
mkdir -p "$OUT"
IFS=',' read -r -a T <<< "$THEMES"
names=$(for t in "${T[@]}"; do ls "$SRC/$t"/*.png 2>/dev/null; done | xargs -n1 basename 2>/dev/null | sed 's/.png$//' | sort -u)
count=0
for n in $names; do
  args=(); have=0
  for t in "${T[@]}"; do
    f="$SRC/$t/$n.png"
    if [ -f "$f" ]; then args+=( -label "$t" "$f" ); have=$((have+1)); else args+=( -label "$t (not captured)" null: ); fi
  done
  [ "$have" -gt 0 ] || continue
  cols=3; [ "${#T[@]}" -lt 3 ] && cols=${#T[@]}
  montage "${args[@]}" -tile "${cols}x" -geometry 720x+8+8 -background '#808080' -fill white -pointsize 18 "$OUT/$n.png"
  count=$((count+1))
done
echo "built $count sheets in $OUT"
