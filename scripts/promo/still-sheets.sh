#!/bin/bash
# One still per speech bubble WITHOUT rendering the film (Destin, 2026-09-09: drafts are his
# call; iterate on stills). Bundles the composition once, renders each line's frame (14 frames
# into the line, full size) off that bundle, and tiles them four per sheet in film order —
# the same sheets line-sheets.sh cuts from out/draft.mp4, from the source instead.
# Usage: bash still-sheets.sh <outdir> [frame-offset]   (~10 s a still after the one bundle)
set -euo pipefail
cd "$(dirname "$0")"
OUT="${1:?outdir}"; OFF="${2:-14}"; mkdir -p "$OUT/stills"; rm -f "$OUT"/lines-*.png "$OUT"/stills/*.png
bash cues.sh "$OUT/cues.json" > /dev/null
FRAMES=$(node -e 'const c=require(require("path").resolve(process.argv[1]));console.log(c.map(x=>x.at+Number(process.argv[2])).join(" "))' "$OUT/cues.json" "$OFF")
BUNDLE="$OUT/bundle"; rm -rf "$BUNDLE"
npx remotion bundle src/index.ts --out-dir "$BUNDLE" --log=error >/dev/null
i=0
for f in $FRAMES; do
  i=$((i+1))
  flock /tmp/promo-render.lock npx remotion still "$BUNDLE" Promo "$OUT/stills/$(printf '%02d' "$i")-f$f.png" --frame "$f" --browser-executable /usr/bin/google-chrome-stable --log=error 2>&1 | rg -v "network requests" || true
done
# four per sheet, half size, in film order
ls "$OUT"/stills/*.png | xargs -n 4 | nl -w2 -n rz | while read -r n a b c d; do
  montage $a $b ${c:-} ${d:-} -tile 2x2 -geometry 960x540+0+0 "$OUT/lines-$n.png"
done
ls "$OUT"/lines-*.png
