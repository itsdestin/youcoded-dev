#!/usr/bin/env bash
# shoot.sh [ids…] — renders round-3 option cards into the deck's run folder.
# Icons first: each app/tab icon at 512px on transparent, shrunk with ImageMagick to the
# real sizes the cards show (WHY: a taskbar icon must be judged as true small pixels).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
dest="$here/../runs/r3/shots-brand/light"; mkdir -p "$dest" "$here/out"
chrome() { google-chrome-stable --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --virtual-time-budget=5000 --allow-file-access-from-files --user-data-dir="$(mktemp -d)" "$@" >/dev/null 2>&1; }
A="a1 a2 a3 a4 a5 a6 a7 a8 a9 a10"; F="f1 f2 f3 f4 f5 f6 f7"
W="w1 w2 w3 w4 w5 w6 w7 w8 w9 w10 w11 w12"; L="l1 l2 l3 l4 l5 l6 l7 l8"
ids="${*:-$W $L $A $F}"
for i in $ids; do
  k="${i%%[0-9]*}"
  if [[ $k == a || $k == f ]]; then
    chrome --window-size=512,512 --default-background-color=00000000 --screenshot="$here/out/$k-$i-512.png" "file://$here/sheet.html?icon=$k&i=$i"
    for p in 128 64 32 24 16; do magick "$here/out/$k-$i-512.png" -filter Lanczos -resize ${p}x${p} "$here/out/$k-$i-$p.png"; done
  fi
  h=620; [[ $k == a ]] && h=470; [[ $k == f ]] && { h=390; [[ $i == f7 ]] && h=480; }
  chrome --window-size=1200,$h --screenshot="$dest/$i.png" "file://$here/sheet.html?k=$k&i=$i"
  echo -n "$i "
done; echo
