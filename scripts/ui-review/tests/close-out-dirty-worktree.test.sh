#!/usr/bin/env bash
# close-out.sh must NOT say "the work landed" (or print a delete command) for a branch whose
# worktree holds uncommitted or untracked files. Card #22 item (e).
# WHY pinned: it recurred four times (2026-10-06, and three times on 2026-10-18). Each time the
# branch tip was the unchanged base commit — trivially "an ancestor of master" — while the whole
# implementation sat uncommitted, and wrap-up was told to delete the worktree.
set -euo pipefail
WS="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
git init -q -b master --bare "$TMP/origin.git"
git init -q -b master "$TMP/clone" && cd "$TMP/clone"
git config user.email t@t && git config user.name t
echo x > tracked.txt && git add tracked.txt && git commit -qm init
git remote add origin "$TMP/origin.git" && git push -q -u origin master && git remote set-head origin master

run() { bash "$WS/scripts/close-out.sh" "$1" "$TMP/clone" 2>&1 || true; }
need() { grep -qiF -- "$2" <<<"$1" || { echo "missing: $2"; echo "$1"; exit 1; }; }
forbid() { grep -qiF -- "$2" <<<"$1" && { echo "must not contain: $2"; echo "$1"; exit 1; }; return 0; }

# A: tip == base commit, a tracked file edited in the branch's worktree.
git worktree add -q -b session/edited "$TMP/wt-edited" master
echo more >> "$TMP/wt-edited/tracked.txt"
out=$(run session/edited)
need "$out" "NOTHING LANDED"; need "$out" "DO NOT delete"
forbid "$out" "the work landed"; forbid "$out" "git branch -D"; forbid "$out" "git worktree remove"

# B: tip == base commit, only a brand-new untracked file (the common "implementation not yet added" case).
git worktree add -q -b session/untracked "$TMP/wt-untracked" master
echo new > "$TMP/wt-untracked/new-file.txt"
out=$(run session/untracked)
need "$out" "NOTHING LANDED"; forbid "$out" "the work landed"; forbid "$out" "git branch -D"

# C: a branch that really merged, clean worktree: unchanged behaviour, still reports landed.
git worktree add -q -b session/clean "$TMP/wt-clean" master
out=$(run session/clean)
need "$out" "the work landed"; forbid "$out" "NOTHING LANDED"; forbid "$out" "UNCOMMITTED WORK HERE"

# D: tip is a real merged commit AND extra uncommitted edits sit on top: not "nothing landed", but still keep.
git worktree add -q -b session/ahead "$TMP/wt-ahead" master
( cd "$TMP/wt-ahead" && echo c > c.txt && git add c.txt && git commit -qm c && git push -q origin session/ahead )
git checkout -q master && git merge -q --no-ff -m "Merge session/ahead" session/ahead && git push -q origin master && git fetch -q origin
echo wip > "$TMP/wt-ahead/wip.txt"
out=$(run session/ahead)
need "$out" "UNCOMMITTED WORK HERE"; forbid "$out" "the work landed"; forbid "$out" "git worktree remove"

echo "close-out dirty-worktree guard: ok"
