#!/usr/bin/env bash
# Bring the workspace checkout up to date with its remote -- healing the cases
# that are provably safe, refusing (with a specific reason) the ones that are not.
#
# WHY THIS IS NOT `git pull`: on 2026-09-03 the shared checkout was 110 commits
# behind after three days, and `git pull` had been failing every single run for
# two stacked reasons it reported only in git's own vocabulary:
#   1. seven local commits + 110 remote ones = "diverged", fatal, exit 128 --
#      git refuses before it even looks at your files;
#   2. underneath that, five uncommitted files that the incoming commits also
#      touched, which block a merge even once a strategy is chosen.
# Both were recoverable, neither was explained, and setup.sh's generic "commit,
# stash, or resolve" told nobody which of the two had happened.
#
# Usage: workspace-sync.sh <repo-dir> [branch]   (default branch: master)
# Exit 0 = up to date (possibly after healing). Exit 1 = a human is needed, and
# the reason is on stderr in plain English.
set -euo pipefail

ROOT="${1:?usage: workspace-sync.sh <repo-dir> [branch]}"
BRANCH="${2:-master}"
cd "$ROOT"

git fetch --quiet origin "$BRANCH"
REMOTE="origin/$BRANCH"

behind=$(git rev-list --count "HEAD..$REMOTE")
ahead=$(git rev-list --count "$REMOTE..HEAD")

# --- the happy case -------------------------------------------------------
if [ "$ahead" -eq 0 ] && [ "$behind" -eq 0 ]; then
    echo "Workspace is up to date with $REMOTE."
    exit 0
fi

# --- local commits that only exist here -----------------------------------
# `git cherry` compares by PATCH CONTENT, not commit id: a '-' means the same
# change is already upstream (someone copied it across by hand, which is the
# sanctioned workflow and leaves a different sha behind). Only '+' lines are
# work that would actually be destroyed.
if [ "$ahead" -gt 0 ]; then
    unique=$(git cherry "$REMOTE" HEAD | grep -c '^+' || true)
    dirty=$(git status --porcelain | grep -c '^[ MARC][MD]' || true)

    if [ "$unique" -eq 0 ] && [ "$dirty" -eq 0 ]; then
        # Nothing unique, nothing unsaved: the local commits are duplicates of
        # upstream ones, so discarding them loses no change that isn't already
        # on the remote. This is the ONLY case where this script rewrites history.
        git reset --hard --quiet "$REMOTE"
        echo "Workspace healed: dropped $ahead local commit(s) whose changes are already on $REMOTE, and caught up $behind commit(s)."
        exit 0
    fi

    {
        echo ""
        echo "WARNING: the workspace checkout has commits of its own, so it was NOT updated."
        echo "  $ahead local commit(s), of which $unique contain work that is NOT on $REMOTE."
        echo "  $dirty file(s) with unsaved edits."
        echo "  It is $behind commit(s) behind."
        echo ""
        if [ "$unique" -gt 0 ]; then
            echo "  Commits that exist ONLY here -- do not discard these:"
            git cherry -v "$REMOTE" HEAD | sed -n 's/^+ \([0-9a-f]\{7\}\)[0-9a-f]* /    \1 /p'
            echo ""
            echo "  Get them onto the remote from a throwaway worktree, then re-run setup.sh:"
            echo "      git worktree add /tmp/wspush -b chore/rescue $REMOTE"
            echo "      git -C /tmp/wspush cherry-pick <sha>...   # only your own"
            echo "      git -C /tmp/wspush push origin HEAD:$BRANCH"
        else
            echo "  No commit here is unique -- only the unsaved edits are blocking the reset."
            echo "  Save or discard them, then re-run setup.sh."
        fi
        echo ""
    } >&2
    exit 1
fi

# --- behind only: fast-forward, unless an unsaved edit is in the way -------
# Computed rather than inferred from git's error text, so the message can name
# the files before anything is attempted.
incoming=$(git diff --name-only HEAD "$REMOTE")
locally_edited=$(git status --porcelain | sed -n 's/^[ MARC][MD] //p; s/^[MARC][MD ] //p')

blockers=""
while IFS= read -r f; do
    [ -z "$f" ] && continue
    if printf '%s\n' "$incoming" | grep -qxF "$f"; then
        blockers="${blockers}${f}"$'\n'
    fi
done <<< "$locally_edited"

# An untracked file that the incoming commits also add blocks a merge too --
# but only when its content actually differs, which is the case git refuses.
while IFS= read -r f; do
    [ -z "$f" ] && continue
    if git cat-file -e "$REMOTE:$f" 2>/dev/null; then
        if ! git show "$REMOTE:$f" | diff -q - "$f" >/dev/null 2>&1; then
            blockers="${blockers}${f} (untracked)"$'\n'
        fi
    fi
done < <(git ls-files --others --exclude-standard)

if [ -n "$blockers" ]; then
    {
        echo ""
        echo "WARNING: the workspace is $behind commit(s) behind and was NOT updated."
        echo "  These files have unsaved edits that the incoming commits also change:"
        printf '%s' "$blockers" | sed 's/^/    /'
        echo ""
        echo "  Nothing was touched. Save or set aside those edits, then re-run setup.sh."
        echo "  To see what the remote does to one of them:  git diff HEAD $REMOTE -- <file>"
        echo ""
    } >&2
    exit 1
fi

git merge --ff-only --quiet "$REMOTE"
echo "Workspace caught up $behind commit(s) to $REMOTE."
exit 0
