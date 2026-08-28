#!/usr/bin/env bash
# Launch a perf-lab run DETACHED, and print how to watch it.
#
# WHY this exists (2026-08-27, 2026-08-28 — three separate self-inflicted losses):
#   1. A `run_in_background` Bash task running the rig is KILLED ~15-25s after
#      launch with no user action. `setsid nohup` survives; plain `&` does not.
#   2. The redirect target and `--out` are resolved against the SHELL's cwd, and a
#      session whose cwd had drifted into a worktree launched a run that died
#      instantly with the log written somewhere nobody looked. This script always
#      cds to the workspace root first.
#   3. Watching the log needs a filter that matches FAILURE as well as progress —
#      a monitor that greps only for success lines is silent through a hang, and
#      silence reads identically to "still running".
#
# Usage:  bash scripts/perf-lab/bg-run.sh --label cycle3-x [any run.mjs flags]
#         bash scripts/perf-lab/bg-run.sh --only history --history-repeats 1 --label probe
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

# Pull --label out of the args so the log is named after it; it is still passed through.
LABEL="run"
prev=""
for a in "$@"; do
  if [ "$prev" = "--label" ]; then LABEL="$a"; fi
  prev="$a"
done
LABEL="$(printf '%s' "$LABEL" | tr -c 'A-Za-z0-9._-' '-')"

LOG_DIR="$ROOT/scratch/perf-lab/logs"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/$LABEL.console.log"
: > "$LOG"

setsid nohup bash -c "cd '$ROOT' && node scripts/perf-lab/run.mjs $* >> '$LOG' 2>&1; echo \"EXIT \$?\" >> '$LOG'" \
  >/dev/null 2>&1 </dev/null &

sleep 1
echo "perf-lab: launched detached  ($*)"
echo "  log:   $LOG"
echo
echo "Watch it with the Monitor tool — this filter catches progress AND failure,"
echo "so a hang is never reported as silence:"
echo
echo "  tail -f -n 0 $LOG | grep -E --line-buffered \"^EXIT |aborted|TIMED OUT|Error:|ERROR|^\\[perf-lab .*\\] (cold start|workload|history\\.|stall\\.|artifacts |screenshot)\""
echo
echo "Then gate with:"
echo "  node scripts/perf-lab/compare.mjs <baseline>.json <new>.json --target <primary.path>"
