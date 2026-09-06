#!/usr/bin/env bash
# Round 5 — needs Destin. Two questions at once:
#   (a) multi-monitor: plug the TV in FIRST, then use the per-screen buttons.
#   (b) does the caption leak into Overview (Meta+W) or a screen-share picker?
#
# SAFETY: the helper only ever touches captions matching ^YC:(mascot|chat|bar)@ .
# It is loaded over DBus, never installed, and unloaded on every exit path.
set -u
cd "$(dirname "$0")"
EL=/home/destin/youcoded-dev/youcoded/desktop/node_modules/electron/dist/electron
OUT=${OUT:-/tmp/claude-1000/-home-destin-youcoded-dev/b76eda7c-51df-467e-9138-0ed3b2ae28e8/scratchpad/kwin-round5}
mkdir -p "$OUT"
NAME="yc-follow-$$"
cleanup() { qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript "$NAME" >/dev/null 2>&1; echo "helper unloaded."; }
trap cleanup EXIT INT TERM

SINCE=$(date '+%Y-%m-%d %H:%M:%S')
SID=$(qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.loadScript "$PWD/kwin/yc-follow.js" "$NAME")
qdbus6 org.kde.KWin "/Scripting/Script$SID" org.kde.kwin.Script.run >/dev/null 2>&1
echo "helper loaded (id=$SID)"

"$EL" round5.js 2>&1 | tee "$OUT/electron.log"

sleep 1
echo "== compositor =="
journalctl --user --since "$SINCE" -n 400 --no-pager 2>/dev/null | grep YC5 | tee "$OUT/kwin.txt"
