#!/usr/bin/env bash
# close-out.sh must warn (non-blocking) about untracked docs/scripts files sitting only on
# this machine. WHY pinned (2026-09-23): the shared youcoded-dev checkout accumulated ~200
# such files (design reviews, investigations, plans) with nothing at close-out ever catching
# them — the session that left them never saw a prompt to commit, push or ask Destin. The
# check must be a note (never fail/FAILED), since a session closing out ITS OWN branch should
# not be told its work is broken because some OTHER session left files lying around.
set -euo pipefail
WS="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

# A throwaway repo of its own — CLOSE_OUT_WORKSPACE points the untracked-files check at it,
# so this assertion never depends on this machine's real (~200-file) clutter.
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
git init -q -b master "$TMP/origin.git" --bare
git init -q -b master "$TMP/clone" && cd "$TMP/clone"
git config user.email t@t && git config user.name t
mkdir -p docs scripts
echo x > tracked.txt && git add tracked.txt && git commit -qm init
git remote add origin "$TMP/origin.git" && git push -q -u origin master
git remote set-head origin master
git checkout -q -b feat/real && echo y >> tracked.txt && git commit -qam work && git push -q -u origin feat/real

# No untracked files yet: no warning at all.
out=$(CLOSE_OUT_WORKSPACE="$TMP/clone" bash "$WS/scripts/close-out.sh" feat/real "$TMP/clone" 2>&1) || true
grep -q "WARNING:" <<<"$out" && { echo "warned with nothing untracked"; echo "$out"; exit 1; }

# Add untracked files under docs/ and scripts/ (and one OUTSIDE those, which must not count).
echo a > docs/investigation-a.md
echo b > docs/investigation-b.md
echo c > scripts/one-off.mjs
echo d > outside-scope.txt

out=$(CLOSE_OUT_WORKSPACE="$TMP/clone" bash "$WS/scripts/close-out.sh" feat/real "$TMP/clone" 2>&1) || true
grep -q "WARNING: 3 untracked file(s) under docs/ and scripts/" <<<"$out" \
  || { echo "expected a count of 3, scoped to docs/ and scripts/"; echo "$out"; exit 1; }
grep -q "investigation-a.md" <<<"$out" || { echo "did not list an example untracked file"; echo "$out"; exit 1; }
grep -q "outside-scope.txt" <<<"$out" && { echo "counted a file outside docs/ and scripts/"; echo "$out"; exit 1; }
grep -qi "move them into your branch" <<<"$out" || { echo "missing the fix-it instruction"; echo "$out"; exit 1; }

# Non-blocking: this alone must not add a mechanical TODO.
grep -q "^close-out.sh:.*FAILED" <<<"$out" && { echo "should not affect FAILED count"; exit 1; }
grep -qi "^Nothing mechanical outstanding" <<<"$out" \
  || { echo "an untracked-file warning alone should not report mechanical items outstanding"; echo "$out"; exit 1; }

echo "close-out untracked-files warning: ok"
