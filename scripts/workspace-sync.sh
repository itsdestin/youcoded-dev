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

# --- behind only: heal what is provably residue, merge what git can merge ---
#
# WHY THIS IS NOT A SINGLE REFUSAL. Measured on the real checkout 2026-09-04:
# it had sat 175 commits behind for ~31 hours, and NOT ONE of the 19 files
# blocking the sync held work that was not already upstream. 15 were
# byte-identical to a version already committed on origin/master; the other 4
# were older copies of files many sessions append to (MAP, ROADMAP, ...).
#
# That is what the workflow produces, not bad luck. A session edits a workspace
# file in the shared checkout -- the project root is where CLAUDE.md, docs/ and
# .claude/ live, so that is where editing happens -- the pre-commit hook refuses
# the commit, the change is copied into a throwaway worktree and pushed from
# there, and NOTHING ever removes the original edit. It is residue from that
# moment on. The old version of this script refused whenever an incoming commit
# touched ANY edited file, so a single leftover blocked every later sync
# permanently, while the repo took ~100 commits a day from concurrent sessions.
# The 2026-09-03 fix healed the diverged-COMMITS half (above, and the reflog
# shows it firing that day); this is the dirty-FILES half it left behind.
#
# Three buckets, and the script only ever acts on the two it can prove:
#   residue    the working file's exact bytes are already a commit on the remote
#              -> restoring it destroys nothing, because git still has it
#   mergeable  git's own 3-way merge resolves it without conflict markers
#              -> stash, fast-forward, pop; the session's edit survives
#   conflict   a person is genuinely needed -> refuse, and name ONLY these
incoming=$(git diff --name-only HEAD "$REMOTE")
locally_edited=$(git status --porcelain | sed -n 's/^[ MARC][MD] //p; s/^[MARC][MD ] //p')

# Residue is recent by construction, so a bounded walk stays cheap on a repo
# with years of history behind it.
is_residue() {
    local f="$1" h c b
    [ -f "$f" ] || return 1
    h=$(git hash-object "$f") || return 1
    for c in $(git rev-list --max-count=300 "$REMOTE" -- "$f"); do
        b=$(git rev-parse "$c:$f" 2>/dev/null) || continue
        if [ "$b" = "$h" ]; then return 0; fi
    done
    return 1
}

# Asks git the same question `git stash pop` would ask after the fast-forward,
# BEFORE anything is touched -- so a conflict is reported, never written into
# somebody's file as markers.
merges_cleanly() {
    local f="$1" d rc
    [ -f "$f" ] || return 1
    git cat-file -e "HEAD:$f" 2>/dev/null || return 1
    git cat-file -e "$REMOTE:$f" 2>/dev/null || return 1
    d=$(mktemp -d)
    git show "HEAD:$f" > "$d/base"
    git show "$REMOTE:$f" > "$d/theirs"
    cp "$f" "$d/mine"
    git merge-file -q -p "$d/mine" "$d/base" "$d/theirs" > /dev/null 2>&1 && rc=0 || rc=1
    rm -rf "$d"
    return $rc
}

residue=""; mergeable=""; conflicts=""
classify() {
    local f="$1" untracked="$2"
    if is_residue "$f"; then
        residue="${residue}${f}"$'\n'
    elif [ "$untracked" = "no" ] && merges_cleanly "$f"; then
        mergeable="${mergeable}${f}"$'\n'
    elif [ "$untracked" = yes ]; then
        conflicts="${conflicts}${f} (untracked)"$'\n'
    else
        conflicts="${conflicts}${f}"$'\n'
    fi
}

while IFS= read -r f; do
    [ -z "$f" ] && continue
    if printf '%s\n' "$incoming" | grep -qxF "$f"; then classify "$f" no; fi
done <<< "$locally_edited"

# An untracked file the incoming commits also add blocks the merge too -- but
# only when its content actually differs, which is the case git refuses.
while IFS= read -r f; do
    [ -z "$f" ] && continue
    if git cat-file -e "$REMOTE:$f" 2>/dev/null; then
        if ! git show "$REMOTE:$f" | diff -q - "$f" >/dev/null 2>&1; then classify "$f" yes; fi
    fi
done < <(git ls-files --others --exclude-standard)

if [ -n "$conflicts" ]; then
    {
        echo ""
        echo "WARNING: the workspace is $behind commit(s) behind and was NOT updated."
        echo "  These files have edits that genuinely disagree with the incoming commits."
        echo "  The counts are the decision: \"only here\" is what would be lost by discarding"
        echo "  the local copy, and it is usually 0 -- residue from a change that was already"
        echo "  pushed from a worktree, which the remote has since moved past."
        while IFS= read -r c; do
            [ -z "$c" ] && continue
            f="${c% (untracked)}"
            if git cat-file -e "$REMOTE:$f" 2>/dev/null && [ -f "$f" ]; then
                only_here=$(git show "$REMOTE:$f" | diff - "$f" | grep -c '^>' || true)
                only_there=$(git show "$REMOTE:$f" | diff - "$f" | grep -c '^<' || true)
                printf '    %-60s %s line(s) only here, %s only on the remote\n' "$c" "$only_here" "$only_there"
            else
                printf '    %s\n' "$c"
            fi
        done <<< "$conflicts"
        echo ""
        echo "  Nothing was touched. Save or set aside those edits, then re-run setup.sh."
        echo "  To see what the remote does to one of them:  git diff HEAD $REMOTE -- <file>"
        if [ -n "$residue" ] || [ -n "$mergeable" ]; then
            echo ""
            echo "  (The other blocked files needed no decision and were left alone:"
            echo "   $(printf '%s' "$residue" | grep -c . || true) already on the remote,"
            echo "   $(printf '%s' "$mergeable" | grep -c . || true) that git can merge.)"
        fi
        echo ""
    } >&2
    exit 1
fi

healed=0
if [ -n "$residue" ]; then
    while IFS= read -r f; do
        [ -z "$f" ] && continue
        # Tracked: hand it back to HEAD so the fast-forward can carry it to the
        # remote's version. Untracked: delete it, and the fast-forward writes
        # the remote's copy in its place. Either way the bytes are in git.
        if git ls-files --error-unmatch "$f" >/dev/null 2>&1; then
            git checkout --quiet HEAD -- "$f"
        else
            rm -f "$f"
        fi
        healed=$((healed + 1))
    done <<< "$residue"
fi

merged=0
stashed=no
if [ -n "$mergeable" ]; then
    # shellcheck disable=SC2046
    git stash push --quiet -m "workspace-sync: edits held across a fast-forward" -- $(printf '%s' "$mergeable" | tr '\n' ' ')
    stashed=yes
    merged=$(printf '%s' "$mergeable" | grep -c . || true)
fi

git merge --ff-only --quiet "$REMOTE"

if [ "$stashed" = yes ]; then
    if ! git stash pop --quiet; then
        {
            echo ""
            echo "The workspace caught up $behind commit(s), but $merged held-back edit(s) could not be"
            echo "re-applied on top. They are safe -- 'git stash list' shows them, 'git stash pop' retries."
            echo ""
        } >&2
        exit 1
    fi
fi

note=""
[ "$healed" -gt 0 ] && note="${note}, discarded $healed leftover cop$([ "$healed" -eq 1 ] && echo y || echo ies) of changes already on the remote"
[ "$merged" -gt 0 ] && note="${note}, merged $merged unsaved edit(s) back on top"
echo "Workspace caught up $behind commit(s) to $REMOTE${note}."
exit 0
