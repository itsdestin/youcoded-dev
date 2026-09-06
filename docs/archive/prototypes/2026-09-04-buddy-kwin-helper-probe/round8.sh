#!/usr/bin/env bash
set -u
cd "$(dirname "$0")"
EL=/home/destin/youcoded-dev/youcoded/desktop/node_modules/electron/dist/electron
NAME="yc-round8-$$"
Q=$(command -v qdbus6 || command -v qdbus)
cleanup() { "$Q" org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript "$NAME" >/dev/null 2>&1; echo "probe helper unloaded."; }
trap cleanup EXIT INT TERM
SINCE=$(date '+%Y-%m-%d %H:%M:%S')
SID=$("$Q" org.kde.KWin /Scripting org.kde.kwin.Scripting.loadScript "$PWD/kwin/round8-follow.js" "$NAME")
"$Q" org.kde.KWin "/Scripting/Script$SID" org.kde.kwin.Script.run >/dev/null 2>&1
echo "probe helper loaded (id=$SID)"
"$EL" --ozone-platform=wayland round8.js 2>&1 | grep -E 'MEASURE|ERROR'
sleep 1
echo "== compositor =="
journalctl --user --since "$SINCE" -n 400 --no-pager 2>/dev/null | grep -o 'YC8|.*'
