#!/usr/bin/env bash
# close-out.sh must judge "a live doc still names the branch" from the workspace's
# origin default branch, not from a working tree that is behind it.
#
# WHY pinned (2026-09-17): Plan B's close-out ran from the shared checkout, 168
# commits behind. The merge had already moved the plan to docs/archive/, but the
# stale working tree still held docs/active/…, so close-out printed a red TODO for
# a doc that no longer existed on master.
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
BR=session/stale-probe

# The app branch, merged and forgotten.
git -C "$TMP/ws/youcoded" checkout -q -b "$BR"
echo w >> "$TMP/ws/youcoded/a.txt"; git -C "$TMP/ws/youcoded" commit -qam work
git -C "$TMP/ws/youcoded" checkout -q master
git -C "$TMP/ws/youcoded" merge -q --no-ff "$BR" -m "Merge $BR"
git -C "$TMP/ws/youcoded" push -q origin master
git -C "$TMP/ws/youcoded" branch -q -D "$BR"

# A plan naming the branch lands in docs/active/ on the workspace.
mkdir -p "$TMP/ws/docs/active/plans" "$TMP/ws/docs/roadmap"
printf -- '---\nstatus: active\n---\nbranch %s\n' "$BR" > "$TMP/ws/docs/active/plans/p.md"
git -C "$TMP/ws" add docs && git -C "$TMP/ws" commit -qm plan && git -C "$TMP/ws" push -q origin master

run() { bash "$TMP/ws/scripts/close-out.sh" "$@" 2>&1 || true; }

# 1. Control: while origin/master still has the doc, it is reported.
out=$(run "$BR" youcoded)
grep -q "still name the branch" <<<"$out" || {
  echo "a live doc naming the merged branch was not reported"; echo "$out"; exit 1; }

# 2. Another clone archives the doc and pushes; this checkout never pulls.
git clone -q "$TMP/ws.git" "$TMP/other"
git -C "$TMP/other" config user.email t@t && git -C "$TMP/other" config user.name t
mkdir -p "$TMP/other/docs/archive/plans"
git -C "$TMP/other" mv docs/active/plans/p.md docs/archive/plans/p.md
git -C "$TMP/other" commit -qm archive && git -C "$TMP/other" push -q origin master
[[ -f "$TMP/ws/docs/active/plans/p.md" ]] || { echo "fixture: stale copy missing"; exit 1; }

# 3. The bug: the stale working tree must not make close-out report it.
out=$(run "$BR" youcoded)
grep -q "still name the branch" <<<"$out" && {
  echo "reported a doc that origin/master already archived (read the stale working tree)"; echo "$out"; exit 1; }
grep -q "no live doc names the branch" <<<"$out" || {
  echo "expected the pass line"; echo "$out"; exit 1; }

echo "close-out stale-checkout guard: ok"
