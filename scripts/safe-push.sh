#!/usr/bin/env bash
# safe-push.sh — push the current branch ONLY if a secrets scan of everything it would
# newly publish comes back clean. Card #195.
#
# Usage: bash scripts/safe-push.sh [<repo-path>] [<remote>]
#   <repo-path>  any git checkout or worktree (the workspace, or a component repo). Default: .
#   <remote>     default: origin
#
# Exit 0 = scanned clean AND pushed. Non-zero = nothing was pushed. It refuses (no push) when:
#   - the scan finds a possible secret
#   - the scanner is missing, errors, or is given a bad flag (fails CLOSED)
#   - HEAD is detached, or the branch is master/main/the remote's default branch
#   - any option is passed (so no --force, --force-with-lease, --delete, --mirror, +refspec)
#
# WHY (card #195): CLAUDE.md requires a secrets scan of every outgoing commit before every
# push, but sessions hand-rolled it. One chained scan and push with `;` let a push go past a
# hit, and `gitleaks git -q` (not a real flag) happened to stop a push by luck. Here the push
# is the last step of the same script that ran the scan, so it cannot run on a failed scan.
#
# WHY no repo-level pre-push hook: Destin's machine already has a per-repo gitleaks pre-push
# hook installed from ~/system/tools/gitleaks-scan.sh, and that installer refuses to overwrite a
# different pre-push hook. A second hook here would fight it. This script is the explicit,
# testable path; the hook stays the safety net for a raw `git push`.
#
# Overrides (tests only): SAFE_PUSH_GITLEAKS = the scanner command to run instead of `gitleaks`.
set -uo pipefail

die() { echo "safe-push: $1" >&2; exit "${2:-1}"; }

# WHY: every extra option is a way to force or rewrite the remote; refuse them all rather than
# maintain a deny-list that a new git flag would slip past.
for a in "$@"; do
  case "$a" in
    -*|+*|*:*) die "refusing option/refspec '$a' — safe-push only pushes the current branch, never forced." 2 ;;
  esac
done
[[ $# -le 2 ]] || die "usage: bash scripts/safe-push.sh [<repo-path>] [<remote>]" 2

REPO="${1:-.}"
REMOTE="${2:-origin}"
git -C "$REPO" rev-parse --git-dir >/dev/null 2>&1 || die "not a git checkout: $REPO" 2

BRANCH=$(git -C "$REPO" symbolic-ref -q --short HEAD) || die "HEAD is detached — check out a branch first." 2
DEFAULT=$(git -C "$REPO" symbolic-ref -q --short "refs/remotes/$REMOTE/HEAD" 2>/dev/null || true)
DEFAULT="${DEFAULT#"$REMOTE"/}"
case "$BRANCH" in
  master|main) die "refusing to push $BRANCH — the default branch only changes through a merge Destin approved." 3 ;;
esac
[[ -n "$DEFAULT" && "$BRANCH" == "$DEFAULT" ]] && die "refusing to push $BRANCH — it is the remote's default branch." 3

# Refresh what we know about the remote so the range is exact. Best effort: if offline the
# range is only ever LARGER than needed (more scanned), never smaller, and the push itself fails.
git -C "$REPO" fetch -q "$REMOTE" 2>/dev/null || true

# WHY this range: every commit reachable from HEAD that no branch of the remote has. It covers
# intermediate versions (a secret added then deleted is still in history) and a brand-new
# branch with no upstream (everything not already on any remote branch).
RANGE="HEAD --not --remotes=$REMOTE"
COUNT=$(git -C "$REPO" rev-list $RANGE 2>/dev/null | wc -l | tr -d ' ')

SCANNER="${SAFE_PUSH_GITLEAKS:-gitleaks}"
if ! command -v "$SCANNER" >/dev/null 2>&1; then
  die "'$SCANNER' is not installed — push NOT done (an unscanned push is what the rule forbids). Install: sudo pacman -S gitleaks" 4
fi

if [[ "$COUNT" -gt 0 ]]; then
  # WHY every non-zero stops: gitleaks exits 1 for a finding but 126/127/2 for a bad flag or
  # crash; none of those mean "clean". --redact keeps secret values out of the log.
  "$SCANNER" git --redact --no-banner -l warn --log-opts="$RANGE" "$REPO" >&2
  rc=$?
  if [[ $rc -ne 0 ]]; then
    die "scan did not pass (exit $rc) for the $COUNT commit(s) about to be published — push NOT done. Remove the secret from those commits (values are hidden above), or mark a deliberate test fake with a gitleaks:allow comment." 5
  fi
  echo "safe-push: scan clean ($COUNT commit(s))" >&2
else
  echo "safe-push: no new commits to scan" >&2
fi

# -u only when the branch has no upstream yet (brand-new branch).
UP=()
git -C "$REPO" rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1 || UP=(-u)
exec git -C "$REPO" push ${UP[@]+"${UP[@]}"} "$REMOTE" "HEAD:refs/heads/$BRANCH"
