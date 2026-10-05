#!/usr/bin/env bash
# Round 12: big sizes from the normal render; 16–48px from the small-tuned render (eyes ~20% larger),
# because that is what would ship in the .ico/.icns small slots. Each icon in six themes.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"; mkdir -p "$here/out"; cd "$here/out"
shot() { google-chrome-stable --headless=new --hide-scrollbars --force-device-scale-factor=1 --window-size=512,512 \
  --default-background-color=00000000 --virtual-time-budget=5000 --allow-file-access-from-files \
  --user-data-dir="$(mktemp -d)" --screenshot="$2" "file://$here/icons.html?i=$1&px=512${3:-}" >/dev/null 2>&1; }
for i in ${*:-r0 r1 r2 s1 s2}; do
  for t in purple golden meadow strawberry kuromi devils; do
    [[ $i == s* && $t != purple ]] && continue
    tag=$i; [[ $t != purple ]] && tag=$i-$t
    shot $i $tag-512.png "&t=$t"; shot $i $tag-small-512.png "&t=$t&small=1"
    for p in 256 96 64; do magick $tag-512.png -filter Lanczos -resize ${p}x${p} $tag-$p.png; done
    for p in 56 48 32 24 16; do magick $tag-small-512.png -filter Lanczos -resize ${p}x${p} $tag-$p.png; done
    rm $tag-small-512.png
  done; echo -n "$i "
done; echo
