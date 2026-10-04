#!/usr/bin/env bash
# shoot.sh [board[:theme]…] — screenshots boards.html into the deck's run folder (round 27).
# WHY device scale 1: the taskbar and menu-bar rows must show TRUE small pixels, not a retina upscale.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
dest="$here/../runs/v28/shots-brand/light"; mkdir -p "$dest"
for spec in ${*:-themes pair:halftone pair:morning glass dockswap tray menubar}; do
  b=${spec%%:*}; t=${spec#*:}; name=$b; q="b=$b"; [[ $t != "$spec" ]] && { name=$b-$t; q="$q&t=$t"; }
  google-chrome-stable --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --window-size=1200,700 --virtual-time-budget=9000 --allow-file-access-from-files \
    --user-data-dir="$(mktemp -d)" --screenshot="$dest/$name.png" "file://$here/boards.html?$q" >/dev/null 2>&1 &
done; wait; ls "$dest"
