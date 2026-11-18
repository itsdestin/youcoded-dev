#!/usr/bin/env bash
# Lossless 3840x2400 stills for posters: real-density Chrome (RECORD_REAL_DENSITY), PNG screencast, last frame copied out untouched.
# Scenes are generated at 3840x2400: CAMP_OUT=<dir> CAMP_W=3840 CAMP_H=2400 CAMP_Z=3.33333 python3 scripts/campaign/gen-scenes.py
set -u
WS="$(cd "$(dirname "$0")/../.." && pwd)"; cd "$WS"
SC="${1:?scene dir}"; S="$HOME/Videos/youcoded-campaign/stills"; T="$(mktemp -d)"; mkdir -p "$S"
run(){ name=$1; scene=$2; theme=$3
  while :; do awk '{exit !($1<24)}' /proc/loadavg && break; sleep 30; done
  RECORD_REAL_DENSITY=1 RECORD_STILL="$S/$name.png" RECORD_CRF=50 THEME=$theme node scripts/ui-review/record.mjs "$SC/$scene.json" "$T/$name" 2>&1 | tail -1; identify "$S/$name.png"; }
run still-home-page still-home youcoded
run still-finance-spending money youcoded
run still-paint-page paint-page youcoded
run still-trip-board trip-page youcoded
run still-chat-golden-sunbreak look-themes golden-sunbreak
run still-chat-halftone-dimension look-themes halftone-dimension
run still-chat-devils-garden look-themes devils-garden
echo STILLSDONE
