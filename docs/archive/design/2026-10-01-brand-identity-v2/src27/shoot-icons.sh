#!/usr/bin/env bash
# Round 27: shoot.sh <id> <theme> [extra-query] — one icon at 512 plus its small sizes, like src17's.
# WHY a small render for ≤48px: the eyes are drawn ~20% bigger there, exactly as the shipped .ico/.icns will be.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"; mkdir -p "$here/out"; cd "$here/out"
shot() { google-chrome-stable --headless=new --hide-scrollbars --force-device-scale-factor=1 --window-size=512,512 \
  --default-background-color=00000000 --virtual-time-budget=5000 --allow-file-access-from-files \
  --user-data-dir="$(mktemp -d)" --screenshot="$2" "file://$here/icons.html?i=$1&px=512${3:-}" >/dev/null 2>&1; }
i=$1; t=$2; x=${3:-}; tag=$i-$t${4:-}
shot $i $tag-512.png "&t=$t$x"; shot $i $tag-small-512.png "&t=$t&small=1$x"
for p in 256 160 128 96 64; do magick $tag-512.png -filter Lanczos -resize ${p}x${p} $tag-$p.png; done
for p in 48 32 24 20 16; do magick $tag-small-512.png -filter Lanczos -resize ${p}x${p} $tag-$p.png; done
rm $tag-small-512.png
