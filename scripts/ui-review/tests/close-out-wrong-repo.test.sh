#!/usr/bin/env bash
# close-out.sh must say WHICH repo a branch is in, not "never pushed".
#
# WHY pinned (2026-09-03): `close-out.sh <branch>` defaults to the youcoded sub-repo,
# and the wrap-up skill runs it on every branch a session touched — including this
# workspace's own docs branches, which are the common case for a wrap-up. Run without
# the second argument on a workspace branch that was ALREADY MERGED, it printed:
#
#     TODO no ref for <branch> anywhere, and no merge commit for it on origin/master
#     TODO never pushed — nobody else can review this branch yet
#
# Two red lines telling a session its merged work is lost. The failure is convincing
# precisely because the second line agrees with the first, and the wrap-up skill tells
# sessions to finish every line this script prints.
set -euo pipefail

# A throwaway WORKSPACE of its own — close-out.sh derives $WORKSPACE from its own
# location, so the fixture is a skeleton workspace with the script copied into it. This
# has to be self-contained: CI checks out only youcoded-dev, with no sub-repos on disk,
# so a version of this test that leaned on the real checkouts passed locally and would
# have failed on the runner (caught 2026-09-03, before it shipped).
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
newrepo "$TMP/ws"          # the workspace itself
newrepo "$TMP/ws/youcoded" # the sub-repo close-out.sh defaults to

# The branch exists ONLY in the workspace repo, and is merged there.
git -C "$TMP/ws" checkout -q -b docs/only-here
echo y >> "$TMP/ws/a.txt" && git -C "$TMP/ws" commit -qam work
git -C "$TMP/ws" checkout -q master
git -C "$TMP/ws" merge -q --no-ff docs/only-here -m "Merge pull request #1 from itsdestin/docs/only-here"
git -C "$TMP/ws" push -q origin master
git -C "$TMP/ws" branch -q -D docs/only-here

run() { bash "$TMP/ws/scripts/close-out.sh" "$@" 2>&1 || true; }

# 1. The bug: default repo is youcoded, where this branch has never existed.
out=$(run docs/only-here)
grep -q "it is in workspace" <<<"$out" || {
  echo "did not name the repo the branch is actually in"; echo "$out"; exit 1; }
grep -q "never pushed" <<<"$out" && {
  echo "STILL claiming the branch was never pushed"; echo "$out"; exit 1; }

# 2. Narrowness: pointed at the RIGHT repo, the normal post-merge report is unchanged.
right=$(run docs/only-here workspace)
grep -q "the work landed" <<<"$right" || {
  echo "the correct-repo report regressed"; echo "$right"; exit 1; }
grep -q "is not in" <<<"$right" && {
  echo "cross-repo hint fired when the repo was already correct"; echo "$right"; exit 1; }

# 3. A branch that genuinely exists nowhere must still get the honest warning.
missing=$(run definitely-no-such-branch-zz9)
grep -q "never pushed, or the name is wrong" <<<"$missing" || {
  echo "lost the real never-pushed warning"; echo "$missing"; exit 1; }

echo "close-out wrong-repo guard: ok"
