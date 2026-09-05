#!/usr/bin/env bash
# close-out.sh's PRE-MERGE report must say whether the branch still merges cleanly into the
# default branch. WHY pinned (2026-09-05): two branches that had passed every check
# conflicted on a generated file at merge time because master had moved; the report that
# fed "ready to merge?" never asked the question.
set -euo pipefail
WS="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
git init -q -b master "$TMP/origin.git" --bare
git init -q -b master "$TMP/clone" && cd "$TMP/clone"
git config user.email t@t && git config user.name t
printf 'a\nb\nc\n' > f.txt && git add f.txt && git commit -qm init
git remote add origin "$TMP/origin.git" && git push -q -u origin master && git remote set-head origin master
# A branch that edits line 1, while master (pushed behind its back) edits the same line.
git checkout -q -b feat/clash && printf 'A\nb\nc\n' > f.txt && git commit -qam clash && git push -q -u origin feat/clash
git checkout -q master && printf 'X\nb\nc\n' > f.txt && git commit -qam master-moved && git push -q origin master
git fetch -q origin
out=$(bash "$WS/scripts/close-out.sh" feat/clash "$TMP/clone" 2>&1) || true
grep -q "would CONFLICT with origin/master in: f.txt" <<<"$out" || { echo "no conflict line for a clashing branch"; echo "$out"; exit 1; }
# A branch that touches a different file must be reported as clean.
git checkout -q -b feat/clean master && echo z > g.txt && git add g.txt && git commit -qm clean && git push -q -u origin feat/clean
git fetch -q origin
out=$(bash "$WS/scripts/close-out.sh" feat/clean "$TMP/clone" 2>&1) || true
grep -q "merges cleanly into origin/master" <<<"$out" || { echo "clean branch not reported clean"; echo "$out"; exit 1; }
grep -q "would CONFLICT" <<<"$out" && { echo "conflict line misfired on a clean branch"; echo "$out"; exit 1; }
echo "close-out-conflict: OK"
