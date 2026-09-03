#!/usr/bin/env bash
# Records ONE scene against a BEFORE and an AFTER target, for a review-deck CLIP step
# (deck spec: `"clip": "<name>"` → <images>/clips/<name>--before.webm + --after.webm, posters .webp).
# Usage: bash scripts/ui-review/record-pair.sh <scene.json> <before> <after> <out-dir> [name]
#   <before>/<after>: a worktree name or path (its workbench is booted on :5473, one at a
#   time, then stopped) or a URL (http://…: the scene's origin is replaced — a static page
#   served at two commits, a remote build). Mix freely. A single target twice is fine for
#   a one-run ("today") deck: pass it as both.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; WS="$(cd "$HERE/../.." && pwd)"
SCENE="${1:?scene.json}"; BEFORE="${2:?before target}"; AFTER="${3:?after target}"; OUT="${4:?out dir}"
NAME="${5:-$(basename "$SCENE" .json)}"
export YOUCODED_PORT_OFFSET="${YOUCODED_PORT_OFFSET:-300}" VITE_NO_WATCH=1
export WB_PORT=$((5173 + YOUCODED_PORT_OFFSET))
mkdir -p "$OUT"
T="${TMPDIR:-/tmp}"; WB_LOG="$T/record-pair-wb.log"
STARTED=0
stop_wb() { if [[ "$STARTED" = 1 ]]; then pkill -f "[v]ite --port $WB_PORT" || true; STARTED=0; sleep 1; fi; }
trap stop_wb EXIT

resolve_tree() {   # worktree name or path → checkout dir, or empty
  local t="$1"
  if [[ -d "$WS/worktrees/$t/desktop" ]]; then echo "$WS/worktrees/$t"
  elif [[ -d "$t/desktop" ]]; then (cd "$t" && pwd)
  elif [[ "$t" = youcoded && -d "$WS/youcoded/desktop" ]]; then echo "$WS/youcoded"
  fi
}

record_one() {   # <target> <run>
  local target="$1" run="$2"; local cdp=$((10380 + RANDOM % 20))
  if [[ "$target" == http://* || "$target" == https://* ]]; then
    echo "[record-pair] $run ← $target"
    BASE_URL="$target" CDP_PORT=$cdp node "$HERE/record.mjs" "$SCENE" "$OUT/$NAME--$run"
    return
  fi
  local tdir; tdir="$(resolve_tree "$target")"
  [[ -n "$tdir" ]] || { echo "[record-pair] '$target' is neither a URL nor a checkout with desktop/" >&2; exit 1; }
  # One workbench at a time on WB_PORT; whatever answers must be serving THIS tree
  # (same guard as site-assets.sh — a foreign server films the wrong code, verified).
  local pid cwd
  pid="$(ss -ltnp "sport = :$WB_PORT" 2>/dev/null | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2 || true)"
  cwd="$(readlink "/proc/${pid:-0}/cwd" 2>/dev/null || true)"
  if [[ -n "$pid" && "$cwd" != "$tdir/desktop" ]]; then
    if [[ "$STARTED" = 1 ]]; then stop_wb; pid=""; else
      echo "[record-pair] REFUSING: :$WB_PORT is served from '$cwd', not '$tdir/desktop' — stop it or pass another YOUCODED_PORT_OFFSET" >&2; exit 1; fi
  fi
  if [[ -z "$pid" ]]; then
    STARTED=1
    (cd "$tdir" && nohup bash "$WS/scripts/run-workbench.sh" "$tdir" >"$WB_LOG" 2>&1 &)
    for i in $(seq 1 60); do curl -sf "http://127.0.0.1:$WB_PORT/" >/dev/null && break; sleep 1; done
    curl -sf "http://127.0.0.1:$WB_PORT/" >/dev/null || { echo "[record-pair] workbench for '$target' did not boot — see $WB_LOG" >&2; exit 1; }
  fi
  echo "[record-pair] $run ← $tdir (workbench :$WB_PORT)"
  CDP_PORT=$cdp node "$HERE/record.mjs" "$SCENE" "$OUT/$NAME--$run"
  stop_wb
}
record_one "$BEFORE" before
record_one "$AFTER" after
ls -la "$OUT/$NAME--before.webm" "$OUT/$NAME--after.webm"
echo "[record-pair] done → deck step: {\"clip\": \"$NAME\", …} with \"images\" pointing at $(dirname "$OUT")"
