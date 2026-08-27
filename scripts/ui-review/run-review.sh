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
# Offset 300 (Vite 5473): a port no other tool defaults to. Offset 60 (5233) is the
# workbench default, and on 2026-08-25 a review "reused" another session's workbench on
# it and screenshotted the wrong worktree for 40 minutes without any error.
PORT_OFFSET="${YOUCODED_PORT_OFFSET:-300}"
VITE_PORT=$((5173 + PORT_OFFSET))
export WB_PORT=$VITE_PORT     # shot.mjs rewrites the plans' hardcoded 5233 to this
mkdir -p "$OUT/sheets"
# One id per sweep, stamped on every manifest entry: coverage merges by it, and the sheets
# below are rebuilt only for the plans this sweep actually ran (hand-off gaps 6 and 7).
RUN_ID="$(date +%s%3N)"; export UI_REVIEW_RUN=$RUN_ID
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
# Whatever answers on the port MUST be serving the worktree under review. A stale or
# foreign server produces perfectly verified screenshots of the wrong code.
if [[ -d "$ROOT/worktrees/$TARGET" ]]; then TDIR="$ROOT/worktrees/$TARGET"; elif [[ -d "$TARGET/desktop" ]]; then TDIR="$(cd "$TARGET" && pwd)"; else TDIR="$TARGET"; fi
VITE_PID="$(ss -ltnp "sport = :$VITE_PORT" 2>/dev/null | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2)"
VITE_CWD="$(readlink "/proc/${VITE_PID:-0}/cwd" 2>/dev/null || true)"
if [[ "$VITE_CWD" != "$TDIR/desktop" ]]; then
  echo "[ui-review] REFUSING: port $VITE_PORT is served from '${VITE_CWD:-nothing}', not '$TDIR/desktop'. Stop that server or pass YOUCODED_PORT_OFFSET=<other>."; exit 1
fi
echo "[ui-review] workbench :$VITE_PORT serves $VITE_CWD (pid $VITE_PID)"
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
idx=0; ports=()
for plan in "$HERE"/plans/*.json; do
  name="$(basename "$plan" .json)"
  case "$name" in electron-*) continue;; esac
  # UI_REVIEW_PLANS=main,overlays limits a run to the plans a PR touches.
  if [[ -n "${UI_REVIEW_PLANS:-}" && ",${UI_REVIEW_PLANS}," != *",$name,"* ]]; then continue; fi
  n=$(node -e "const p=require('$plan');console.log(Math.max(1,Math.ceil(p.shots.length/$PER_SHARD)))")
  for t in "${T[@]}"; do
    for ((k=0; k<n; k++)); do
      idx=$((idx+1))
      port=$((30000 + PORT_OFFSET + idx)); ports+=("$port")
      echo "$plan $name $t $k/$n $port" >> "$jobfile"   # CDP ports keyed by offset so two reviews never share one
    done
  done
done
bash "$HERE/probe-ports.sh" "${ports[@]}" || exit 1
echo "[ui-review] $idx capture jobs, $JOBS at a time…"
run_job() { CDP_PORT=$5 SHARD=$4 node "$HERE/shot.mjs" "$1" "$OUT/shots-$2" "$3" > "$OUT/run-$2-$3-${4%/*}.log" 2>&1 || true; }
export -f run_job; export HERE OUT WB_PORT
xargs -P "$JOBS" -L 1 bash -c 'run_job "$@"' _ < "$jobfile"
fi
# 3. Sheets (verified shots only — misses live in _unverified/), reports, gallery.
# A sweep rebuilds sheets only for the plans it ran (their manifests carry RUN_ID);
# --reports-only rebuilds everything.
for d in "$OUT"/shots-*; do
  name="${d##*/shots-}"
  if [[ "$REPORTS_ONLY" == 0 ]] && ! grep -lq "\"run\": \"$RUN_ID\"" "$d"/manifest-*.json 2>/dev/null; then continue; fi
  rm -f "$OUT/sheets/$name-"*.jpg
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
