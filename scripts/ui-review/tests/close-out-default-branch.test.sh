#!/usr/bin/env bash
# close-out.sh must REFUSE the repo's default branch. WHY pinned (2026-09-03): a session
# that had worked directly on master ran `close-out.sh master workspace`. master is
# trivially an ancestor of origin/master, so the script took its post-merge path and
# printed "git push origin --delete master", "git branch -D master" and "git worktree
# remove <the main checkout>" — and the wrap-up skill tells sessions to finish every TODO
# it prints. Three destructive instructions with a green tick beside them.
set -euo pipefail
WS="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

# A throwaway repo of its own, so the assertion never depends on this machine's checkouts.
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
git init -q -b master "$TMP/origin.git" --bare
git init -q -b master "$TMP/clone" && cd "$TMP/clone"
git config user.email t@t && git config user.name t
echo x > a.txt && git add a.txt && git commit -qm init
git remote add origin "$TMP/origin.git" && git push -q -u origin master
git remote set-head origin master
git checkout -q -b feat/real && echo y >> a.txt && git commit -qam work && git push -q -u origin feat/real

out=$(bash "$WS/scripts/close-out.sh" master "$TMP/clone" 2>&1) || true
grep -q "IS the default branch" <<<"$out" || { echo "no refusal for the default branch"; echo "$out"; exit 1; }
grep -qi "delete master\|branch -D master\|worktree remove" <<<"$out" && { echo "STILL printing a destructive TODO for master"; echo "$out"; exit 1; }

# A real feature branch must be unaffected — the guard has to be narrow.
out=$(bash "$WS/scripts/close-out.sh" feat/real "$TMP/clone" 2>&1) || true
grep -q "IS the default branch" <<<"$out" && { echo "guard misfired on a feature branch"; echo "$out"; exit 1; }
grep -q "not merged into" <<<"$out" || { echo "expected the pre-merge path for feat/real"; echo "$out"; exit 1; }

echo "close-out default-branch guard: ok"
