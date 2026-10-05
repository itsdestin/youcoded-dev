#!/usr/bin/env bash
# shoot-icons.sh — renders every round-7 icon at 512px (transparent), shrinks to the real sizes,
# and renders each icon dressed in three other themes. WHY shrink, not redraw: honest small sizes.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"; mkdir -p "$here/out"; cd "$here/out"
shot() { google-chrome-stable --headless=new --hide-scrollbars --force-device-scale-factor=1 --window-size=512,512 \
  --default-background-color=00000000 --virtual-time-budget=5000 --allow-file-access-from-files \
  --user-data-dir="$(mktemp -d)" --screenshot="$2" "file://$here/icons.html?i=$1&px=512${3:-}" >/dev/null 2>&1; }
for i in ${*:-m1 m2 m3 m4 m5 m6 m7 m8 m9 m10 n1 n2 n3 n4 n5}; do
  shot $i $i-512.png
  for p in 256 96 64 56 48 32 24 16; do magick $i-512.png -filter Lanczos -resize ${p}x${p} $i-$p.png; done
  [[ $i == m* ]] && for t in golden meadow strawberry; do shot $i $i-$t-512.png "&t=$t"; magick $i-$t-512.png -resize 64x64 $i-$t-64.png; magick $i-$t-512.png -resize 24x24 $i-$t-24.png; rm $i-$t-512.png; done
  echo -n "$i "
done; echo
