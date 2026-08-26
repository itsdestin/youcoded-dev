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
  # VITE_NO_WATCH: a capture sweep never edits files, and a watching Vite can
  # die with ENOSPC when the live app + a dev instance already hold the inotify
  # budget (vite.config.ts explains).
  (VITE_NO_WATCH=1 YOUCODED_PORT_OFFSET=$PORT_OFFSET nohup bash "$ROOT/scripts/run-workbench.sh" "$TARGET" > "$OUT/workbench.log" 2>&1 &)
  for i in $(seq 1 60); do curl -s "http://127.0.0.1:$VITE_PORT/" >/dev/null 2>&1 && break; sleep 1; done
  STARTED_WB=1
else
  STARTED_WB=0
fi
node "$ROOT/scripts/workbench-boot-check.mjs" "$VITE_PORT" > "$OUT/boot-check.log" 2>&1 || { echo "[ui-review] workbench boot check FAILED — see $OUT/boot-check.log"; exit 1; }

# 2. Capture jobs: one (plan, theme, shard) per Chrome process, through a queue of
# UI_REVIEW_JOBS workers (default 24). A sweep is wall-clock bound — every shot pays
# a fixed page-boot wait — so the win is breadth: the old 2-themes-per-process layout
# took ~15 min with the machine 85% idle; sharding brings a full sweep to ~5 min (main+overlays for two themes: 2 min).
# Each job gets its own CDP port (9931 + index). SHARD=k/n is honoured by shot.mjs.
IFS=',' read -r -a T <<< "$THEMES"
JOBS="${UI_REVIEW_JOBS:-24}"
PER_SHARD="${UI_REVIEW_SHARD_SIZE:-8}"     # shots per process before the plan is split further
jobfile="$OUT/jobs.txt"; : > "$jobfile"
idx=0
for plan in "$HERE"/plans/*.json; do
  name="$(basename "$plan" .json)"
  case "$name" in electron-*) continue;; esac
  # UI_REVIEW_PLANS=main,overlays limits a run to the plans a PR touches.
  if [[ -n "${UI_REVIEW_PLANS:-}" && ",${UI_REVIEW_PLANS}," != *",$name,"* ]]; then continue; fi
  n=$(node -e "const p=require('$plan');console.log(Math.max(1,Math.ceil(p.shots.length/$PER_SHARD)))")
  for t in "${T[@]}"; do
    for ((k=0; k<n; k++)); do
      idx=$((idx+1))
      echo "$plan $name $t $k/$n $((9930+idx))" >> "$jobfile"
    done
  done
done
echo "[ui-review] $idx capture jobs, $JOBS at a time…"
run_job() { CDP_PORT=$5 SHARD=$4 node "$HERE/shot.mjs" "$1" "$OUT/shots-$2" "$3" > "$OUT/run-$2-$3-${4%/*}.log" 2>&1 || true; }
export -f run_job; export HERE OUT
xargs -P "$JOBS" -L 1 bash -c 'run_job "$@"' _ < "$jobfile"
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
