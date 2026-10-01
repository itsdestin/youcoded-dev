#!/usr/bin/env bash
# shoot.sh [i1…] — regenerates the icons and screenshots each concept card into the deck's run folder.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
dest="$here/../../runs/r4/shots-brand/light"; mkdir -p "$dest"
node "$here/gen.mjs" >/dev/null
for i in ${*:-i1 i2 i3 i4 i5 i6}; do
  google-chrome-stable --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --window-size=1200,620 --virtual-time-budget=5000 --allow-file-access-from-files --user-data-dir="$(mktemp -d)" \
    --screenshot="$dest/$i.png" "file://$here/card.html?i=$i" >/dev/null 2>&1
  echo -n "$i "
done; echo
