#!/usr/bin/env bash
# close-out.sh must recognise a branch merged with a PLAIN `git merge --no-ff`,
# not only one merged through a GitHub pull request.
#
# WHY pinned (2026-09-10): the post-merge lookup searched for the branch name
# preceded by a slash or an apostrophe:
#
#     --grep="(/|')$BRANCH('|$)"
#
# That shape comes from GitHub's own subject, "Merge pull request #1 from
# itsdestin/<branch>", where a slash really does sit in front of the name. A
# direct merge writes "Merge <branch>" with a SPACE in front, so the pattern
# missed it, and close-out.sh fell through to:
#
#     TODO no ref for <branch> anywhere, and no merge commit for it on origin/master
#     TODO never pushed — nobody else can review this branch yet
#
# Two red lines telling a session its merged work is lost — the same failure
# close-out-wrong-repo.test.sh pins, reached by a different route. It is not
# hypothetical: master's own history in this workspace carries subjects of
# exactly the form "Merge session/<name>", and three branches merged on
# 2026-09-10 all reported "never pushed" moments after landing.
set -euo pipefail

REAL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/ws/scripts"
cp "$REAL/scripts/close-out.sh" "$TMP/ws/scripts/close-out.sh"

newrepo() {  # <dir> — a repo with an origin and a master branch
  git init -q -b master "$1.git" --bare
  git init -q -b master "$1" && git -C "$1" config user.email t@t && git -C "$1" config user.name t
  echo x > "$1/a.txt"
  git -C "$1" add a.txt && git -C "$1" commit -qm init
  git -C "$1" remote add origin "$1.git" && git -C "$1" push -q -u origin master
  git -C "$1" remote set-head origin master
}
newrepo "$TMP/ws"
newrepo "$TMP/ws/youcoded"

# Merge two branches the way a session does it by hand, then delete both refs —
# the state close-out.sh is asked about after a merge-and-clean-up.
merge_and_forget() {  # <branch>
  git -C "$TMP/ws/youcoded" checkout -q -b "$1"
  echo "$1" >> "$TMP/ws/youcoded/a.txt"
  git -C "$TMP/ws/youcoded" commit -qam "work on $1"
  git -C "$TMP/ws/youcoded" checkout -q master
  git -C "$TMP/ws/youcoded" merge -q --no-ff "$1" -m "Merge $1"
  git -C "$TMP/ws/youcoded" push -q origin master
  git -C "$TMP/ws/youcoded" branch -q -D "$1"
}
merge_and_forget fix/resume
merge_and_forget session/2026-09-09-projects-perf

run() { bash "$TMP/ws/scripts/close-out.sh" "$@" 2>&1 || true; }

# 1. The bug: a plainly-merged branch reads as landed, not as lost.
out=$(run fix/resume youcoded)
grep -q "the work landed" <<<"$out" || {
  echo "a branch merged with 'git merge --no-ff' was not recognised as merged"; echo "$out"; exit 1; }
grep -q "never pushed" <<<"$out" && {
  echo "STILL claiming a merged branch was never pushed"; echo "$out"; exit 1; }

# 2. A slash inside the branch name is not what makes it work.
slashed=$(run session/2026-09-09-projects-perf youcoded)
grep -q "the work landed" <<<"$slashed" || {
  echo "a merged session/ branch was not recognised"; echo "$slashed"; exit 1; }

# 3. Narrowness: a branch whose name is a PREFIX of a merged one must NOT be
#    claimed as landed. This is what the original trailing ('|$) protected, and
#    widening the leading side must not cost it.
prefix=$(run fix/resume-cc-brand-icon youcoded)
grep -q "the work landed" <<<"$prefix" && {
  echo "matched a LONGER branch that merely starts with this name"; echo "$prefix"; exit 1; }

# 4. The honest never-pushed warning still fires for a branch that never existed.
missing=$(run definitely-no-such-branch-zz9 youcoded)
grep -q "never pushed, or the name is wrong" <<<"$missing" || {
  echo "lost the real never-pushed warning"; echo "$missing"; exit 1; }

echo "close-out direct-merge guard: ok"
