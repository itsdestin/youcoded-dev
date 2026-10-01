#!/usr/bin/env bash
# shoot-boards.sh — screenshots every board in boards.html into the deck's hand-made run folder
# (runs/today/shots-brand/light/<id>.png), the layout AUTHORING.md asks for pictures shoot can't take.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
dest="$here/../runs/today/shots-brand/light"; mkdir -p "$dest"
ids="${*:-s-costume s-badge s-wordmark k-cut k-dot k-gloss t-dm t-brico t-round r-current r-mono r-color a-current a-bold a-ink}"
for id in $ids; do
  google-chrome-stable --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --window-size=1440,900 --virtual-time-budget=8000 --allow-file-access-from-files \
    --screenshot="$dest/$id.png" "file://$here/boards.html?b=$id" >/dev/null 2>&1
  echo "$id"
done
