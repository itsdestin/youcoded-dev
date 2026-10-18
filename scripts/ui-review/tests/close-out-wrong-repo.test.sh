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

# 4. A local branch may be backed up under a different remote name.
# The app release keeps its original session name but pushes a 1.3.1 candidate alias.
git -C "$TMP/ws/youcoded" checkout -q -b session/release-source
echo alias >> "$TMP/ws/youcoded/a.txt"
git -C "$TMP/ws/youcoded" commit -qam alias-work
git -C "$TMP/ws/youcoded" push -q origin HEAD:refs/heads/release/candidate
alias=$(run session/release-source)
grep -q 'pushed to origin' <<<"$alias" || {
  echo 'did not recognize backup under a different remote branch name'; echo "$alias"; exit 1; }
grep -q 'never pushed' <<<"$alias" && {
  echo 'alias backup was falsely reported as lost'; echo "$alias"; exit 1; }

# A deleted server alias must not survive as false evidence in cached refs.
git -C "$TMP/ws/youcoded" config remote.origin.prune false
git --git-dir="$TMP/ws/youcoded.git" update-ref -d refs/heads/release/candidate
stale=$(run session/release-source)
grep -q 'not backed up' <<<"$stale" || {
  echo 'a deleted server alias was mistaken for a current backup'; echo "$stale"; exit 1; }

# 5. An old same-name remote ref must not hide a newer, genuinely unpushed tip.
git -C "$TMP/ws/youcoded" push -q origin HEAD:refs/heads/session/release-source
echo newer >> "$TMP/ws/youcoded/a.txt"
git -C "$TMP/ws/youcoded" commit -qam local-only-tip
newer=$(run session/release-source)
grep -q 'not backed up' <<<"$newer" || {
  echo 'older remote tip hid local-only work'; echo "$newer"; exit 1; }

# 6. Merging the older remote tip does not make newer local work safe to delete.
git -C "$TMP/ws/youcoded" checkout -q master
git -C "$TMP/ws/youcoded" merge -q --no-ff session/release-source~1 -m 'Merge already-pushed work'
git -C "$TMP/ws/youcoded" push -q origin master
git -C "$TMP/ws/youcoded" checkout -q session/release-source
partial=$(run session/release-source)
grep -q 'PRE-MERGE' <<<"$partial" || {
  echo 'an older merged remote tip hid newer local work'; echo "$partial"; exit 1; }
grep -q 'not backed up' <<<"$partial" || {
  echo 'newer local work was treated as backed up'; echo "$partial"; exit 1; }

# 7. An unavailable origin cannot justify a current backup or cleanup verdict.
mv "$TMP/ws/youcoded.git" "$TMP/ws/youcoded.offline.git"
offline=$(run session/release-source)
grep -q 'remote ancestry and backup status are unverified' <<<"$offline" || {
  echo 'an unavailable origin did not produce an explicit unknown verdict'; echo "$offline"; exit 1; }
if grep -q 'pushed to origin\|local branch still exists' <<<"$offline"; then
  echo 'an offline report claimed a backup or recommended branch deletion'; echo "$offline"; exit 1
fi

echo "close-out wrong-repo and remote-alias guards: ok"
