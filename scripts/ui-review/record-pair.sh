#!/usr/bin/env bash
# Records ONE scene against a BEFORE and an AFTER target, for a review-deck CLIP step
# (deck spec: `"clip": "<name>"` → <images>/clips/<name>--before.webm + --after.webm, posters .webp).
# Usage: bash scripts/ui-review/record-pair.sh <scene.json> <before> <after> <out-dir> [name]
#   <before>/<after>: a worktree name or path (record.mjs builds and serves it itself
#   through scripts/shoot/engine.mjs — no fixed port, no workbench to start first; the
#   build is cached, so recording the same tree twice in one deck only builds it once)
#   or a URL (http://…: the scene's origin is replaced — a static page served at two
#   commits, a remote build). Mix freely. A single target twice is fine for a one-run
#   ("today") deck: pass it as both.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; WS="$(cd "$HERE/../.." && pwd)"
SCENE="${1:?scene.json}"; BEFORE="${2:?before target}"; AFTER="${3:?after target}"; OUT="${4:?out dir}"
NAME="${5:-$(basename "$SCENE" .json)}"
mkdir -p "$OUT"

resolve_tree() {   # worktree name or path → checkout dir, or empty
  local t="$1"
  if [[ -d "$WS/worktrees/$t/desktop" ]]; then echo "$WS/worktrees/$t"
  elif [[ -d "$t/desktop" ]]; then (cd "$t" && pwd)
  elif [[ "$t" = youcoded && -d "$WS/youcoded/desktop" ]]; then echo "$WS/youcoded"
  fi
}

record_one() {   # <target> <run>
  local target="$1" run="$2"
  if [[ "$target" == http://* || "$target" == https://* ]]; then
    echo "[record-pair] $run ← $target"
    BASE_URL="$target" node "$HERE/record.mjs" "$SCENE" "$OUT/$NAME--$run"
    return
  fi
  local tdir; tdir="$(resolve_tree "$target")"
  [[ -n "$tdir" ]] || { echo "[record-pair] '$target' is neither a URL nor a checkout with desktop/" >&2; exit 1; }
  echo "[record-pair] $run ← $tdir (built + served by scripts/shoot/engine.mjs)"
  WORKTREE="$tdir" node "$HERE/record.mjs" "$SCENE" "$OUT/$NAME--$run"
}
record_one "$BEFORE" before
record_one "$AFTER" after
ls -la "$OUT/$NAME--before.webm" "$OUT/$NAME--after.webm"
echo "[record-pair] done → deck step: {\"clip\": \"$NAME\", …} with \"images\" pointing at $(dirname "$OUT")"
