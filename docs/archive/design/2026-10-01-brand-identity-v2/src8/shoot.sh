#!/usr/bin/env bash
# shoot.sh [ids…] — screenshots each board in boards.html into the deck's run folder.
# WHY device scale 1: the taskbar/tab rows must show TRUE small pixels, not a retina upscale.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
dest="$here/../runs/v8/shots-brand/light"; mkdir -p "$dest"
ids="${*:-t1 t2 t3 t4 t5 t6 k1 k2 k3 k4 k5 k6 k7 k8 j1 j2 j3 j4 j5}"
for id in $ids; do
  google-chrome-stable --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --window-size=1200,700 --virtual-time-budget=9000 --allow-file-access-from-files \
    --user-data-dir="$(mktemp -d)" --screenshot="$dest/$id.png" "file://$here/boards.html?b=$id" >/dev/null 2>&1
  echo -n "$id "
done; echo
