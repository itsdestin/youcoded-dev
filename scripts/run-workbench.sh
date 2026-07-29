#!/bin/bash
# Launch the UI Workbench: the REAL renderer against a fake window.claude, in a
# plain browser tab. No Electron, no main process, no PTY.
#
# When to use which launcher:
#   run-workbench.sh  — building or redesigning UI. Fastest loop (~1s HMR).
#   run-dev.sh        — you need real event ordering, PTY, or main-process behavior.
#
# Usage:
#   bash scripts/run-workbench.sh [<worktree>]
#
#   <worktree>   Name of a worktree under worktrees/, or a path containing
#                desktop/. Defaults to the main youcoded checkout.
#
# Spec: docs/active/specs/2026-07-29-ui-workbench-design.md
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-}"

# Resolve which checkout to serve. Mirrors run-dev.sh's resolution order, minus
# the branch-name lookup — the workbench is for iterating on source you already
# have open, so a worktree name or an explicit path covers it.
if [[ -z "$TARGET" ]]; then
  CHECKOUT="$ROOT/youcoded"
elif [[ -d "$TARGET/desktop" ]]; then
  CHECKOUT="$TARGET"
elif [[ -d "$ROOT/worktrees/$TARGET/desktop" ]]; then
  CHECKOUT="$ROOT/worktrees/$TARGET"
else
  echo "error: no checkout found for '$TARGET'" >&2
  echo "  expected a path containing desktop/, or a worktree under $ROOT/worktrees/" >&2
  exit 1
fi

# Offset 60 (Vite 5233), NOT run-dev.sh's default offset 50 (Vite 5223). The
# whole point is coexisting with a running dev instance, and sharing its port
# guarantees the opposite — the second launcher would fail to bind or steal the
# port. See run-dev.sh:22,46 for the offset-50 default.
export YOUCODED_PORT_OFFSET="${YOUCODED_PORT_OFFSET:-60}"
PORT=$((5173 + YOUCODED_PORT_OFFSET))

echo "UI Workbench"
echo "  checkout: $CHECKOUT"
echo "  open this in a local browser:"
echo "    http://localhost:$PORT/?mode=workbench"
echo ""
echo "  scenarios: &scenario=default|empty|no-providers|refused|stress"
echo "  latency:   &latency=0|150|2000   (ms of fake IPC delay; default 150)"
echo ""

# Localhost-only on purpose: no --host, no LAN binding. The workbench is not for
# phone or remote review.
cd "$CHECKOUT/desktop"
npm run dev:renderer -- --port "$PORT"
