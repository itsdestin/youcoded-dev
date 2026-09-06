#!/bin/bash
# Measure how long after `reconfigure` KWin reports the script as loaded.
ID=youcodedbuddyhelper-40287c02fc6f
Q=$(command -v qdbus6 || command -v qdbus)
for run in 1 2 3; do
  "$Q" org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript "$ID" >/dev/null 2>&1
  "$Q" org.kde.KWin /KWin org.kde.KWin.reconfigure >/dev/null 2>&1
  t0=$(date +%s%N)
  first_true=""
  for i in $(seq 1 400); do
    v=$("$Q" org.kde.KWin /Scripting org.kde.kwin.Scripting.isScriptLoaded "$ID" 2>/dev/null)
    now=$(date +%s%N)
    ms=$(( (now - t0) / 1000000 ))
    if [ "$i" -le 3 ]; then echo "  run$run poll$i @${ms}ms -> $v"; fi
    if [ "$v" = "true" ]; then first_true=$ms; break; fi
    [ "$ms" -gt 8000 ] && break
  done
  echo "run$run: became loaded at ${first_true:-NEVER within 8s} ms (after $i polls)"
done
