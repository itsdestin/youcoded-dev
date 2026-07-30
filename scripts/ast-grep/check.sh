#!/usr/bin/env bash
# Executable-invariant check. Runs the ast-grep rules in rules/ two ways:
#
#   1. against the VIOLATION FIXTURES — every rule must fire (proves the rules work)
#   2. against the REAL SOURCE        — no rule may fire  (proves the code is clean)
#
# WHY both directions: a rule that silently stops matching is indistinguishable
# from a rule that passes. The workspace already lost a SessionStart hook that way
# (its worktree `find` matched nothing for weeks and printed no section, so nobody
# noticed). Fixtures make a broken rule fail loudly instead of going quiet.
#
# Usage: bash scripts/ast-grep/check.sh [<source-dir>]
#
#   <source-dir>  Defaults to the main checkout's youcoded/desktop/src. Pass one to
#                 scan a worktree instead — scripts/verify.sh does exactly that, so a
#                 branch is checked against ITS OWN source rather than master's.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE="$(cd "$HERE/../.." && pwd)"
SOURCE_DIR="${1:-$WORKSPACE/youcoded/desktop/src}"

if [[ ! -d "$SOURCE_DIR" ]]; then
    echo "error: source dir not found: $SOURCE_DIR" >&2
    exit 2
fi

# Prefer a real install (pacman -S ast-grep / npm i -g @ast-grep/cli); npx works but
# re-resolves the binary on every invocation, which is slow enough to notice.
if command -v ast-grep >/dev/null 2>&1; then
    AG=(ast-grep)
else
    AG=(npx --yes --package @ast-grep/cli ast-grep)
    echo "note: using npx (slower). Install with: sudo pacman -S ast-grep"
fi

# How many fixture violations we expect. Bump this when adding a rule + fixture.
EXPECTED_VIOLATIONS=3

count_findings() {
    # --json emits an array of matches; jq counts them. Fall back to grep if jq is absent.
    local out
    out="$("${AG[@]}" scan -c "$HERE/sgconfig.yml" --json "$1" 2>/dev/null)"
    if command -v jq >/dev/null 2>&1; then
        printf '%s' "$out" | jq 'length' 2>/dev/null || echo "ERR"
    else
        printf '%s' "$out" | grep -c '"ruleId"' || echo 0
    fi
}

fail=0

echo "== fixtures (every rule must fire) =="
got="$(count_findings "$HERE/fixtures")"
if [[ "$got" == "$EXPECTED_VIOLATIONS" ]]; then
    echo "  OK — $got/$EXPECTED_VIOLATIONS rules fired on the violation fixtures"
else
    echo "  FAIL — expected $EXPECTED_VIOLATIONS findings, got $got"
    echo "         A rule stopped matching. Run for detail:"
    echo "         ${AG[*]} scan -c $HERE/sgconfig.yml $HERE/fixtures"
    fail=1
fi

echo "== real source (no rule may fire) =="
got="$(count_findings "$SOURCE_DIR")"
if [[ "$got" == "0" ]]; then
    echo "  OK — no invariant violations in youcoded/desktop/src"
else
    echo "  FAIL — $got invariant violation(s):"
    "${AG[@]}" scan -c "$HERE/sgconfig.yml" "$SOURCE_DIR" 2>/dev/null
    fail=1
fi

exit $fail
