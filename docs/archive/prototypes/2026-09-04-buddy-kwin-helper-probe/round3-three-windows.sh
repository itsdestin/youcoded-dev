#!/usr/bin/env bash
# Round 3 — three windows on the caption channel at once. Loads the counting
# helper, runs the sweep, unloads the helper on every exit path.
#
# SAFETY: the helper only ever touches captions starting "YOUCODED-KWIN-PROBE:".
# No real window matches. Nothing is installed; the script is loaded over DBus
# and unloaded on exit.
set -u
cd "$(dirname "$0")"
EL=/home/destin/youcoded-dev/youcoded/desktop/node_modules/electron/dist/electron
OUT=${OUT:-/tmp/claude-1000/-home-destin-youcoded-dev/b76eda7c-51df-467e-9138-0ed3b2ae28e8/scratchpad/kwin-round3}
mkdir -p "$OUT"
NAME="buddy-three-$$"
cleanup() { qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript "$NAME" >/dev/null 2>&1; }
trap cleanup EXIT INT TERM

SINCE=$(date '+%Y-%m-%d %H:%M:%S')
SID=$(qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.loadScript "$PWD/kwin/three-follow.js" "$NAME")
qdbus6 org.kde.KWin "/Scripting/Script$SID" org.kde.kwin.Script.run >/dev/null 2>&1
echo "helper loaded (id=$SID)"

FRAMES=${FRAMES:-120} "$EL" three-window.js > "$OUT/electron.log" 2>&1
sleep 2

echo "== app =="
grep SWEEP_DONE "$OUT/electron.log"
echo "== compositor =="
journalctl --user --since "$SINCE" -n 2000 --no-pager 2>/dev/null | grep KWIN3 | tee "$OUT/kwin.txt"
