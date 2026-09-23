#!/usr/bin/env bash
# Rebuild every mascot candidate and render the pictures the deck shows.
#
# WHY this exists as a script: the first attempt built the candidates into /tmp, which the
# system cleaned up mid-session, and every image the deck referenced disappeared with it.
# Building into the design folder keeps the candidates beside the deck that shows them, and
# re-running this reproduces the pictures after any change to the mascot — which happened
# repeatedly, and each time left a deck showing art that no longer existed.
#
# It prints each image's real pixel size, because the deck's `crops` name an explicit WxH
# and a montage whose size drifts from that crop is silently cut off rather than reported.
#
# Usage: bash build-variants.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PREVIEW="$HOME/.claude/wecoded-themes/_preview"
BUILD="$PREVIEW/decorate-mascot.cjs"
SHOTS="$HERE/runs/after/shots-mascot/light"
# The deck's `crops` name this folder, not `light/`. Keep both in step.
MIRROR="$HERE/runs/after/shots-mascot/morning-rounds"
VARIANTS="$HERE/mascot-variants"

# The deck's A-1 and D-3 steps show the dog in its own carnelian, so those shots come from
# the `dog` candidate; C-1 shows all seven.
PALETTES=(dog cat-exact scrub-mid scrub-teal teal-deep blue-clinic blue-deep)
CANVAS='#FAF6F0'
LEAD=scrub-teal     # the recommended candidate, used for the multi-expression sheet

mkdir -p "$SHOTS" "$MIRROR" "$VARIANTS"

for p in "${PALETTES[@]}"; do
  d="$VARIANTS/$p"
  mkdir -p "$d/assets"
  cp "$PREVIEW/mascot-config.json" "$d/mascot-config.json"
  cp "$PREVIEW/assets/wallpaper-b.jpg" "$d/assets/" 2>/dev/null || true
  node "$BUILD" "$d" --palette "$p" | tail -1 | sed "s|^|$p: |"
done

svg() { echo "$VARIANTS/$1/assets/mascot-$2.svg"; }
shot() { magick -background "$CANVAS" -density "$1" "$2" -resize "$3" ${4:+-bordercolor "$CANVAS" -border "$4"} "$5"; }

# --- C-1: one large portrait per candidate, plus its 80 px and 24 px behaviour ----------
for p in "${PALETTES[@]}"; do
  shot 500 "$(svg $p welcome)" 360x360 30 "$SHOTS/scrubs-$p.png"
done
shot 900 "$(svg dog welcome)" 80x80 0 "$VARIANTS/dog/w80.png"
# The strip at the size the buddy really renders, with the recommended one marked by order.
shot 900 "$(svg dog welcome)" 80x80 0 /tmp/_w-dog.png
shot 900 "$(svg cat-exact welcome)" 80x80 0 /tmp/_w-cat.png
shot 900 "$(svg scrub-mid welcome)" 80x80 0 /tmp/_w-mid.png
shot 900 "$(svg scrub-teal welcome)" 80x80 0 /tmp/_w-teal.png
shot 900 "$(svg teal-deep welcome)" 80x80 0 /tmp/_w-tdeep.png
shot 900 "$(svg blue-clinic welcome)" 80x80 0 /tmp/_w-bclinic.png
shot 900 "$(svg blue-deep welcome)" 80x80 0 /tmp/_w-bdeep.png
magick montage -background "$CANVAS" -tile 7x1 -geometry 80x80+14+14 \
  /tmp/_w-dog.png /tmp/_w-cat.png /tmp/_w-mid.png /tmp/_w-teal.png \
  /tmp/_w-tdeep.png /tmp/_w-bclinic.png /tmp/_w-bdeep.png \
  -bordercolor "$CANVAS" -border 10 "$SHOTS/scrubs-80px.png"

# --- A-1 / D-3: the dog's four expressions, and the lead candidate's four --------------
for p in dog "$LEAD"; do
  for f in idle welcome inquisitive shocked; do
    shot 500 "$(svg $p $f)" 300x300 20 "/tmp/_f-$p-$f.png"
  done
done
magick montage -background "$CANVAS" -tile 4x1 -geometry 300x300+14+14 \
  /tmp/_f-dog-idle.png /tmp/_f-dog-welcome.png /tmp/_f-dog-inquisitive.png /tmp/_f-dog-shocked.png \
  -bordercolor "$CANVAS" -border 12 "$SHOTS/mascot-all.png"
for f in idle welcome inquisitive shocked; do cp "/tmp/_f-dog-$f.png" "$SHOTS/mascot-$f.png"; done
# A-1's secondary: the dog at the size the buddy actually renders. A-1 narrates the ears and
# muzzle, so this sheet has to be the same character the large sheet shows — an earlier build
# rendered the other candidate here and the two halves of the same step disagreed.
for f in idle welcome inquisitive shocked; do
  shot 900 "$(svg dog $f)" 80x80 0 "/tmp/_d80-$f.png"
done
magick montage -background "$CANVAS" -tile 4x1 -geometry 80x80+14+14 \
  /tmp/_d80-idle.png /tmp/_d80-welcome.png /tmp/_d80-inquisitive.png /tmp/_d80-shocked.png \
  "$SHOTS/mascot-80px.png"
magick montage -background "$CANVAS" -tile 4x1 -geometry 300x300+14+14 \
  /tmp/_f-$LEAD-idle.png /tmp/_f-$LEAD-welcome.png /tmp/_f-$LEAD-inquisitive.png /tmp/_f-$LEAD-shocked.png \
  -bordercolor "$CANVAS" -border 12 "$SHOTS/scrubs-faces.png"
# The deck's D-3 step shows the empty hand at a size where a held item would be visible.
magick montage -background "$CANVAS" -tile 3x1 -geometry 300x300+14+14 \
  /tmp/_f-dog-idle.png /tmp/_f-dog-inquisitive.png /tmp/_f-dog-welcome.png \
  -bordercolor "$CANVAS" -border 12 "$SHOTS/scrubs-range.png"

# The deck's crops resolve under shots-mascot/<theme>/, so mirror the lot.
cp "$SHOTS"/*.png "$MIRROR/"

echo
echo "image sizes (the deck's crops must match these exactly):"
for f in "$SHOTS"/*.png; do printf '  %-20s %s\n' "$(basename "$f")" "$(identify -format '%wx%h' "$f")"; done
