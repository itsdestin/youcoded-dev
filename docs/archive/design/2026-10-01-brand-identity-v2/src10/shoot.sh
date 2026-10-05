#!/usr/bin/env bash
# shoot.sh [ids…] — screenshots each board in boards.html into the deck's run folder.
# WHY device scale 1: the taskbar/tab rows must show TRUE small pixels, not a retina upscale.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
dest="$here/../runs/v10/shots-brand/light"; mkdir -p "$dest"
ids="${*:-l1 l2 l3 l4 m1 m2 m3 m4 m5 m6 m7 m8 m9 m10 n1 n2 n3 n4 n5}"
for id in $ids; do
  google-chrome-stable --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --window-size=1200,700 --virtual-time-budget=9000 --allow-file-access-from-files \
    --user-data-dir="$(mktemp -d)" --screenshot="$dest/$id.png" "file://$here/boards.html?b=$id" >/dev/null 2>&1
  echo -n "$id "
done; echo
