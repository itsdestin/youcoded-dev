#!/bin/bash
# resolve-checkout.test.sh — the names a launcher must accept for a session worktree.
#
# WHY: `workspace-start` puts a session's app checkout at
# worktrees/sessions/<name>/youcoded. Two things stopped the obvious names working
# (measured 2026-09-10, two failed launches):
#   · the caller passes the directory above scripts/, which INSIDE a worktree is the
#     worktree — so every workspace-relative layout below silently could not match;
#   · a session worktree always ends in /youcoded, so matching a registered worktree
#     by path basename never distinguishes one session from another.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
# shellcheck source=../../lib/resolve-checkout.sh
source "$ROOT/scripts/lib/resolve-checkout.sh"

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
WS="$TMP/ws"
mkdir -p "$WS/youcoded/desktop" "$WS/worktrees/sessions/my-feature/youcoded/desktop"
git -C "$WS/youcoded" init -q 2>/dev/null || true

fail=0
check() { # <label> <target> <root> <expected>
  local got; got="$(resolve_youcoded_checkout "$2" "$3" || echo '<unresolved>')"
  if [[ "$got" == "$4" ]]; then echo "  ok   $1"
  else echo "  FAIL $1: wanted $4, got $got"; fail=1; fi
}

echo "resolve-checkout:"
check "session name, from the workspace root" \
  my-feature "$WS" "$WS/worktrees/sessions/my-feature/youcoded"
# The regression: called from INSIDE the session worktree, as run-workbench does.
check "session name, from inside that worktree" \
  my-feature "$WS/worktrees/sessions/my-feature" "$WS/worktrees/sessions/my-feature/youcoded"
check "no target still means the main checkout" \
  "" "$WS" "$WS/youcoded"
check "an unknown name still fails" \
  no-such-thing "$WS" "<unresolved>"

[[ $fail -eq 0 ]] || { echo "resolve-checkout.test.sh FAILED"; exit 1; }
echo "resolve-checkout.test.sh OK"
