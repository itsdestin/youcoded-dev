#!/usr/bin/env bash
# Round 1 — Destin's hands. Loads the resident KWin helper, opens the rig,
# unloads the helper on exit no matter how it ends.
#
# SAFETY: the helper only ever touches windows whose caption STARTS WITH
# "YOUCODED-KWIN-PROBE". None of your real windows match. It is unloaded on exit.
set -u
cd "$(dirname "$0")"
EL=/home/destin/youcoded-dev/youcoded/desktop/node_modules/electron/dist/electron
NAME="buddy-kwin-helper-$$"
cleanup() { qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript "$NAME" >/dev/null 2>&1; echo "helper unloaded."; }
trap cleanup EXIT INT TERM

SID=$(qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.loadScript "$PWD/kwin/resident-follow.js" "$NAME")
qdbus6 org.kde.KWin "/Scripting/Script$SID" org.kde.kwin.Script.run >/dev/null 2>&1
echo "KWin helper loaded (id=$SID). Opening the rig…"
"$EL" . >/dev/null 2>&1
