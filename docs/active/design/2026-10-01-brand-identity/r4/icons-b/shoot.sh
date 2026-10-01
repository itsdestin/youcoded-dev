#!/usr/bin/env bash
# shoot.sh [j1 …] — builds J-concept icons and their review cards.
# App icon: 512 master in Chrome (it has the fonts) → ImageMagick Lanczos to real sizes.
# Tab icon + tray glyph: their own 16-grid SVGs → rsvg-convert at exact size (crisp pixels).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
dest="$here/../../runs/r4/shots-brand/light"; mkdir -p "$dest" "$here/out" "$here/svg"
chrome() { google-chrome-stable --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --virtual-time-budget=5000 --allow-file-access-from-files --user-data-dir="$(mktemp -d)" "$@" >/dev/null 2>&1; }
ids="${*:-j1 j2 j3 j4 j5 j6}"
node -e '
  require("vm").runInThisContext(require("fs").readFileSync(process.argv[1] + "/lib.js", "utf8"));
  const fs = require("fs"), d = process.argv[1] + "/svg/";
  for (const id of process.argv.slice(2)) {
    fs.writeFileSync(d + id + "-tab.svg", J.TAB[id]());
    fs.writeFileSync(d + id + "-tray-w.svg", J.TRAY[id]("#fff"));
    fs.writeFileSync(d + id + "-tray-b.svg", J.TRAY[id]("#111"));
  }' "$here" $ids
for id in $ids; do
  chrome --window-size=512,512 --default-background-color=00000000 --screenshot="$here/out/$id-app-512.png" "file://$here/page.html?icon=$id"
  for p in 128 64 32 24 16; do magick "$here/out/$id-app-512.png" -filter Lanczos -resize ${p}x${p} "$here/out/$id-app-$p.png"; done
  for w in tab tray-w tray-b; do for p in 16 32; do rsvg-convert -w $p -h $p "$here/svg/$id-$w.svg" -o "$here/out/$id-$w-$p.png"; done; done
  chrome --window-size=1200,620 --screenshot="$dest/$id.png" "file://$here/page.html?card=$id"
  echo -n "$id "
done; echo
