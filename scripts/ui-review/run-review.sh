#!/bin/bash
# Autonomous UI review, end to end. Boots the UI Workbench on a worktree, runs
# every plan in scripts/ui-review/plans/ across the theme set, verifies each
# screenshot (see shot.mjs), builds side-by-side theme sheets, a contrast report,
# a coverage report and an HTML gallery. Nothing here touches the live app.
#
# Usage:
#   bash scripts/ui-review/run-review.sh <worktree-or-path> [outDir] [themes]
#     worktree   name under worktrees/ or a path containing desktop/ (what to review)
#     outDir     default scratch/ui-review-<date>  (git-ignored)
#     themes     default midnight,light,halftone-dimension,meadow-mist,creme,dark
#
# Plans: every scripts/ui-review/plans/*.json EXCEPT electron-*.json (those need a
# running dev instance — see README). Width-specific plans carry their own size.
#
# Output layout:
#   <outDir>/shots-<plan>/<theme>/<surface>.png      verified screenshots
#   <outDir>/shots-<plan>/<theme>/_unverified/       misses (never reach the gallery)
#   <outDir>/sheets/<plan>-<surface>.jpg             all themes side by side
#   <outDir>/coverage.md · contrast.md · gallery.html
#   --reports-only <outDir> [themes]   skip capture; rebuild sheets/coverage/contrast/gallery
#                                      (after re-running a fixed plan by hand into the same outDir)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HERE="$ROOT/scripts/ui-review"
if [[ "${1:-}" == "--reports-only" ]]; then
  OUT="${2:?outDir}"; THEMES="${3:-midnight,light,halftone-dimension,meadow-mist,creme,dark}"
  REPORTS_ONLY=1
else
  TARGET="${1:?worktree or path}"
  OUT="${2:-$ROOT/scratch/ui-review-$(date +%F)}"
  THEMES="${3:-midnight,light,halftone-dimension,meadow-mist,creme,dark}"
  REPORTS_ONLY=0
fi
PORT_OFFSET="${YOUCODED_PORT_OFFSET:-60}"
VITE_PORT=$((5173 + PORT_OFFSET))
mkdir -p "$OUT/sheets"
STARTED_WB=0
if [[ "$REPORTS_ONLY" == 0 ]]; then

# 1. Workbench (reuse one that is already up on this port).
if ! curl -s "http://127.0.0.1:$VITE_PORT/" >/dev/null 2>&1; then
  echo "[ui-review] starting workbench on :$VITE_PORT for $TARGET"
  (YOUCODED_PORT_OFFSET=$PORT_OFFSET nohup bash "$ROOT/scripts/run-workbench.sh" "$TARGET" > "$OUT/workbench.log" 2>&1 &)
  for i in $(seq 1 60); do curl -s "http://127.0.0.1:$VITE_PORT/" >/dev/null 2>&1 && break; sleep 1; done
  STARTED_WB=1
else
  STARTED_WB=0
fi
node "$ROOT/scripts/workbench-boot-check.mjs" "$VITE_PORT" > "$OUT/boot-check.log" 2>&1 || { echo "[ui-review] workbench boot check FAILED — see $OUT/boot-check.log"; exit 1; }

# 2. Plans, two themes per process so a full sweep stays under ~15 minutes.
IFS=',' read -r -a T <<< "$THEMES"
port=9930
pids=()
for plan in "$HERE"/plans/*.json; do
  name="$(basename "$plan" .json)"
  case "$name" in electron-*) continue;; esac
  for ((i=0; i<${#T[@]}; i+=2)); do
    pair="${T[$i]}${T[$((i+1))]:+,${T[$((i+1))]}}"
    port=$((port+1))
    CDP_PORT=$port node "$HERE/shot.mjs" "$plan" "$OUT/shots-$name" "$pair" > "$OUT/run-$name-$port.log" 2>&1 &
    pids+=($!)
  done
done
echo "[ui-review] ${#pids[@]} capture processes running…"
wait "${pids[@]}" || true
fi
rm -rf "$OUT/sheets"/*.jpg

# 3. Sheets (verified shots only — misses live in _unverified/), reports, gallery.
for d in "$OUT"/shots-*; do
  name="${d##*/shots-}"
  bash "$HERE/montage.sh" "$d" "$OUT/sheets-$name" "$THEMES" >/dev/null
  for f in "$OUT/sheets-$name"/*.png; do [ -f "$f" ] && magick "$f" -resize 1800x -quality 82 "$OUT/sheets/$name-$(basename "$f" .png).jpg"; done
done
node "$HERE/coverage.mjs" "$OUT"/shots-* > "$OUT/coverage.md"
node "$HERE/contrast-report.mjs" "$OUT"/shots-* > "$OUT/contrast.md"
python3 "$HERE/make-gallery.py" "$OUT/sheets" "$OUT/gallery.html" >/dev/null
echo "[ui-review] done → $OUT/gallery.html"
head -3 "$OUT/coverage.md"
grep -c MISSED "$OUT/coverage.md" | xargs -I{} echo "[ui-review] {} surfaces MISSED — read $OUT/coverage.md before writing any finding"
[ "$STARTED_WB" = 1 ] && pkill -f "[v]ite --port $VITE_PORT" || true
