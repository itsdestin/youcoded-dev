#!/usr/bin/env bash
# Round 0 — headless. Answers, with no human hands:
#   Q1 Can a KWin script READ the true position of our window?   (proven 2026-07, re-confirm)
#   Q2 Can a KWin script SET keepAbove — the primitive Electron cannot?
#   Q3 Can a KWin script MOVE the window — the primitive Wayland forbids the app?
#   Q4 How long does one load->run->unload DBus round trip take?  (decides drag vs snap)
set -u
cd "$(dirname "$0")"
EL=/home/destin/youcoded-dev/youcoded/desktop/node_modules/electron/dist/electron
OUT=${OUT:-/tmp/claude-1000/-home-destin-youcoded-dev/b76eda7c-51df-467e-9138-0ed3b2ae28e8/scratchpad/kwin-round0}
mkdir -p "$OUT"

run_kwin() {  # $1=mode $2=x $3=y  -> prints elapsed ms
  local mode=$1 x=$2 y=$3
  local f="$OUT/probe-$mode.js"
  sed -e "s/__MODE__/$mode/" -e "s/__X__/$x/" -e "s/__Y__/$y/" kwin/probe.js.in > "$f"
  local t0 t1 sid
  t0=$(date +%s%N)
  sid=$(qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.loadScript "$f" "probe-$mode-$$" 2>&1)
  qdbus6 org.kde.KWin "/Scripting/Script$sid" org.kde.kwin.Script.run >/dev/null 2>&1
  t1=$(date +%s%N)
  qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript "probe-$mode-$$" >/dev/null 2>&1
  echo "ROUNDTRIP|$mode|$(( (t1 - t0) / 1000000 ))ms|scriptId=$sid"
}

echo "== launching holder window (25s) =="
HOLD_MS=25000 "$EL" holder.js > "$OUT/electron.log" 2>&1 &
EL_PID=$!
sleep 6

SINCE=$(date '+%Y-%m-%d %H:%M:%S')
{
  run_kwin read 0 0
  sleep 1
  run_kwin keepabove 0 0
  sleep 1
  run_kwin move 120 120
  sleep 1
  run_kwin move 900 640
  sleep 1
  # Q4b: five moves back to back — the "how fast can we drag" measurement.
  for i in 1 2 3 4 5; do run_kwin move $((200 + i * 90)) $((200 + i * 60)); done
} | tee "$OUT/roundtrips.txt"

sleep 2
echo "== KWin script output =="
journalctl --user --since "$SINCE" -n 400 --no-pager 2>/dev/null | grep KWINHELPER | tee "$OUT/kwin-output.txt"
echo "== Electron's own claims =="
grep ELECTRON_SAYS "$OUT/electron.log" | tee "$OUT/electron-says.txt"

wait $EL_PID 2>/dev/null
echo "== done; artifacts in $OUT =="
