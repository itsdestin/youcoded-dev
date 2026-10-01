#!/usr/bin/env bash
# shoot.sh [ids…] — renders round-4 wordmark cards to runs/r4/shots-brand/light/<id>.png.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
dest="$here/../../runs/r4/shots-brand/light"; mkdir -p "$dest"
for i in ${*:-n1 n2 n3 n4 n5 n6 n7 n8 n9 n10 n11 n12}; do
  google-chrome-stable --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --window-size=1200,620 --virtual-time-budget=6000 --allow-file-access-from-files --user-data-dir="$(mktemp -d)" \
    --screenshot="$dest/$i.png" "file://$here/names.html?i=$i" >/dev/null 2>&1
  echo -n "$i "
done; echo
