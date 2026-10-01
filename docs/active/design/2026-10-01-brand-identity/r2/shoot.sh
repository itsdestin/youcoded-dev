#!/usr/bin/env bash
# shoot.sh <territory> [board…] — screenshots boards into the deck's hand-made run folder
# (runs/r2/shots-brand/light/<territory>-<board>.png), the layout AUTHORING.md asks for.
# Default boards: the six every territory ships.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
t="$1"; shift
dest="$here/../runs/r2/shots-brand/light"; mkdir -p "$dest"
boards="${*:-poster icon tray hero docs themes}"
for b in $boards; do
  google-chrome-stable --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --window-size=1440,900 --virtual-time-budget=6000 --allow-file-access-from-files \
    --user-data-dir="$(mktemp -d)" \
    --screenshot="$dest/$t-$b.png" "file://$here/board.html?t=$t&b=$b" >/dev/null 2>&1
  echo "$dest/$t-$b.png"
done
