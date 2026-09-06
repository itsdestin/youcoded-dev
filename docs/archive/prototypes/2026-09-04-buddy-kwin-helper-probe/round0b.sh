#!/usr/bin/env bash
# Round 0b — how FAST can the KWin lever be driven? This is the question that
# decides "smooth drag-follow" vs "snap-on-release only".
#   Q5 60 consecutive moves along a path: achieved moves/sec on the reload path.
#   Q6 Can one LOADED script be re-run (cheaper than load+run+unload each time)?
set -u
cd "$(dirname "$0")"
EL=/home/destin/youcoded-dev/youcoded/desktop/node_modules/electron/dist/electron
OUT=${OUT:-/tmp/claude-1000/-home-destin-youcoded-dev/b76eda7c-51df-467e-9138-0ed3b2ae28e8/scratchpad/kwin-round0}
mkdir -p "$OUT"

echo "== launching holder window (30s) =="
HOLD_MS=30000 "$EL" holder.js > "$OUT/electron-b.log" 2>&1 &
sleep 6

# Q6 first: load ONCE, then call run repeatedly.
sed -e "s/__MODE__/move/" -e "s/__X__/500/" -e "s/__Y__/300/" kwin/probe.js.in > "$OUT/resident.js"
SID=$(qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.loadScript "$OUT/resident.js" "resident-$$" 2>&1)
echo "loaded scriptId=$SID"
for i in 1 2 3; do
  T0=$(date +%s%N)
  qdbus6 org.kde.KWin "/Scripting/Script$SID" org.kde.kwin.Script.run 2>&1 | head -1
  T1=$(date +%s%N)
  echo "RERUN|$i|$(( (T1-T0)/1000000 ))ms"
done
qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript "resident-$$" >/dev/null 2>&1

# Q5: 60 moves along a circle, reload path, wall-clock the whole sweep.
echo "== 60-move sweep =="
SWEEP0=$(date +%s%N)
for i in $(seq 0 59); do
  X=$(python3 -c "import math;print(int(700+380*math.cos($i*0.105)))")
  Y=$(python3 -c "import math;print(int(430+260*math.sin($i*0.105)))")
  sed -e "s/__MODE__/move/" -e "s/__X__/$X/" -e "s/__Y__/$Y/" kwin/probe.js.in > "$OUT/sweep.js"
  S=$(qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.loadScript "$OUT/sweep.js" "sweep-$$-$i" 2>&1)
  qdbus6 org.kde.KWin "/Scripting/Script$S" org.kde.kwin.Script.run >/dev/null 2>&1
  qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript "sweep-$$-$i" >/dev/null 2>&1
done
SWEEP1=$(date +%s%N)
MS=$(( (SWEEP1-SWEEP0)/1000000 ))
echo "SWEEP|60 moves in ${MS}ms = $(( 60000 / (MS>0?MS:1) )) moves/sec (includes python + sed + 3 dbus calls each)"
wait
