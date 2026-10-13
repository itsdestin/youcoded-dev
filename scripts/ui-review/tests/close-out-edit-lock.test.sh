#!/usr/bin/env bash
# close-out.sh must flag a branch that edits a file frozen by docs/active/locks/*.json, and
# stay quiet for exempt branches, unlocked files and an empty lock. WHY pinned (2026-09-29):
# the refactor's edit lock was a promise in a handoff doc; this is what makes it a check.
set -euo pipefail
WS="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
# The repo dir is named "youcoded" because the lock names its repo.
git init -q -b master "$TMP/origin.git" --bare
git init -q -b master "$TMP/youcoded" && cd "$TMP/youcoded"
git config user.email t@t && git config user.name t
mkdir -p desktop/src/main && echo a > desktop/src/main/ipc-handlers.ts && echo a > desktop/src/main/other.ts
git add . && git commit -qm init
git remote add origin "$TMP/origin.git" && git push -q -u origin master && git remote set-head origin master
mkdir "$TMP/locks"
cat > "$TMP/locks/l.json" <<'JSON'
{"repo":"youcoded","phase":"R1–R2","since":"2026-09-29","handoff":"docs/active/handoffs/x.md",
 "paths":["desktop/src/main/ipc-handlers.ts"],"exemptBranches":["session/simplify-r*"]}
JSON
export CLOSE_OUT_LOCKS="$TMP/locks"
mk() { git checkout -q -b "$1" master && echo "$2" >> "$3" && git commit -qam x && git push -q -u origin "$1"; }
mk feat/touches z desktop/src/main/ipc-handlers.ts
mk session/simplify-r1-x z desktop/src/main/ipc-handlers.ts
mk feat/other z desktop/src/main/other.ts
git fetch -q origin
run() { bash "$WS/scripts/close-out.sh" "$1" "$TMP/youcoded" 2>&1 || true; }
out=$(run feat/touches)
grep -q "EDIT LOCK.*R1–R2.*desktop/src/main/ipc-handlers.ts" <<<"$out" || { echo "locked-file edit not flagged"; echo "$out"; exit 1; }
grep -q "DO NOT MERGE" <<<"$out" || { echo "no plain-language instruction"; echo "$out"; exit 1; }
out=$(run session/simplify-r1-x)
grep -q "EDIT LOCK" <<<"$out" && { echo "exempt branch flagged"; echo "$out"; exit 1; }
out=$(run feat/other)
grep -q "EDIT LOCK" <<<"$out" && { echo "unlocked file flagged"; echo "$out"; exit 1; }
# An empty paths list means no lock.
echo '{"repo":"youcoded","phase":"x","paths":[]}' > "$TMP/locks/l.json"
out=$(run feat/touches)
grep -q "EDIT LOCK" <<<"$out" && { echo "empty lock still flagged"; echo "$out"; exit 1; }
echo "close-out-edit-lock: OK"
