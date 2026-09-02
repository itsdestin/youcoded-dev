#!/usr/bin/env bash
# Close-out report for a merged branch. READ-ONLY — it changes nothing, and it
# ALWAYS EXITS 0. It is advisory; do not gate anything on its exit code.
#
# Usage: bash scripts/close-out.sh <branch> [<repo-dir>]
#   e.g. bash scripts/close-out.sh feat/games-arcade-shell youcoded
#        bash scripts/close-out.sh docs/my-branch workspace   # youcoded-dev itself
#
# WHY: closing out the games arcade on 2026-08-31 took eleven steps across two
# repos and the workspace, and several were nearly missed and recovered only by
# re-reading CLAUDE.md mid-task. The generic finishing-a-development-branch skill
# covers the git half and none of the workspace half. This prints the whole
# checklist with an answer beside each line.
#
# Every check is scoped to the branch you name. A workspace-wide version of the
# docs checks was tried and rejected: it produced 78 warnings on its first run,
# including a live-but-never-pushed branch and a file path that looked like one.
#
# Contract section: feature-flow design §4
set -uo pipefail

BRANCH="${1:-}"
REPO="${2:-youcoded}"
WORKSPACE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[[ -z "$BRANCH" ]] && { echo "usage: bash scripts/close-out.sh <branch> [<repo-dir>]"; exit 0; }
# `workspace` / `.` mean youcoded-dev itself, which is a normal close-out target:
# this workspace's own docs, rules and scripts ship on branches like any sub-repo.
case "$REPO" in
  workspace|.|youcoded-dev) REPO_DIR="$WORKSPACE"; REPO="workspace" ;;
  *)                        REPO_DIR="$WORKSPACE/$REPO" ;;
esac
[[ -e "$REPO_DIR/.git" ]] || { echo "close-out: no git repo at $REPO_DIR"; exit 0; }
# Where contracts are looked for. Overridable so the test can point it at a temp folder.
DOCS_DIR="${CLOSE_OUT_DOCS:-$WORKSPACE/docs}"

pass() { printf '  \033[32mOK\033[0m   %s\n' "$1"; }
fail() { printf '  \033[31mTODO\033[0m %s\n' "$1"; FAILED=$((FAILED+1)); }
note() { printf '  --   %s\n' "$1"; }
FAILED=0

echo "Close-out: $BRANCH in $REPO"
echo
echo "Git"

git -C "$REPO_DIR" fetch origin --quiet 2>/dev/null

SHA=$(git -C "$REPO_DIR" rev-parse --verify -q "origin/$BRANCH" 2>/dev/null \
   || git -C "$REPO_DIR" rev-parse --verify -q "$BRANCH" 2>/dev/null || true)
BASE=$(git -C "$REPO_DIR" symbolic-ref -q --short refs/remotes/origin/HEAD 2>/dev/null || echo origin/master)

# TWO MODES, because "close out" does not always mean "merged".
# Destin routinely says wrap up / close out meaning "do the docs and workspace
# hygiene" while the PR stays open for a fresh session to review. Reporting
# "delete the branch" then would be actively wrong advice, so the script asks
# whether the work landed FIRST and changes what it checks accordingly.
MERGED=no
if [[ -n "$SHA" ]]; then
  if git -C "$REPO_DIR" merge-base --is-ancestor "$SHA" "$BASE" 2>/dev/null; then
    pass "the branch tip is an ancestor of $BASE — the work landed"; MERGED=yes
  else
    note "not merged into $BASE yet — PRE-MERGE close-out. Branch, worktree and"
    note "dead-name checks are SKIPPED: they would all tell you to delete things"
    note "you still need. Docs and workspace hygiene below still apply."
  fi
else
  # No ref anywhere is NOT evidence of a close-out: a branch that merged and was
  # cleaned up looks IDENTICAL to one that was never pushed, or whose name you
  # mistyped. Assuming the good one printed an all-green report for a branch that
  # never existed. There is a real answer available instead of a guess — a merge
  # commit on $BASE names the branch it merged ("Merge pull request #N from
  # owner/<branch>"), so look for one before concluding anything.
  MERGE_COMMIT=$(git -C "$REPO_DIR" log "$BASE" --merges --grep="/$BRANCH\$" \
                 --extended-regexp --format=%h -1 2>/dev/null || true)
  if [[ -n "$MERGE_COMMIT" ]]; then
    pass "no ref left, and $BASE carries the merge commit $MERGE_COMMIT for it — the work landed"
    MERGED=yes
  else
    fail "no ref for $BRANCH anywhere, and no merge commit for it on $BASE — never pushed, or the name is wrong"
    MERGED=unknown
  fi
fi

# "No remote ref" has TWO opposite causes — pushed-and-deleted (done) or
# never-pushed (very much not done) — and this script cannot tell them apart on
# its own. Printing a green "deleted" for both is exactly the misleading message
# the workspace's error standard forbids, so the merge result above decides.
if [[ "$MERGED" == yes ]]; then
  if git -C "$REPO_DIR" ls-remote --exit-code --heads origin "$BRANCH" >/dev/null 2>&1; then
    fail "remote branch still exists — git push origin --delete $BRANCH"
  else
    pass "remote branch deleted (the work is on $BASE, so it was pushed and cleaned up)"
  fi

  git -C "$REPO_DIR" show-ref --verify -q "refs/heads/$BRANCH" \
    && fail "local branch still exists — git branch -D $BRANCH  (-D, not -d: --no-ff merges leave the tip non-ancestral)" \
    || pass "local branch deleted"

  WT=$(git -C "$REPO_DIR" worktree list --porcelain | sed -n 's/^worktree //p' \
       | while read -r p; do
           [[ "$(git -C "$p" branch --show-current 2>/dev/null)" == "$BRANCH" ]] && echo "$p"
         done)
  if [[ -n "$WT" ]]; then
    fail "worktree still registered at $WT — git worktree remove '$WT'"
  else
    pass "no worktree left on this branch"
  fi

  for d in "$WORKSPACE"/worktrees/*/; do
    [[ -d "$d" && ! -e "${d%/}/.git" ]] && fail "unregistered leftover directory: ${d%/}"
  done
else
  if git -C "$REPO_DIR" ls-remote --exit-code --heads origin "$BRANCH" >/dev/null 2>&1; then
    pass "pushed to origin — a reviewer can see it"
  else
    fail "never pushed — nobody else can review this branch yet"
  fi
fi

echo
echo "Contract"
# The contract is the definition of done for a feature (docs/active/specs/2026-09-01-feature-flow-design.md).
# It names its branch, so this is the ONLY lookup — no "branch" field, no contract, and the
# note below says so rather than guessing which deck folder this work came from.
# Fix: a fixed-string match on `"branch": "$BRANCH"` missed a contract written without the
# space after the colon (`"branch":"$BRANCH"`, still valid JSON) — a contract could sit right
# there and this would still say "no contract names this branch". Match the colon loosely
# instead. $BRANCH can contain "/" and "." — a "." in the regex also matches a literal "."
# so that alone is harmless, but escape every regex metacharacter anyway so the intent reads
# honestly as "escaped for regex use", not "happens to work".
BRANCH_RE=$(printf '%s' "$BRANCH" | sed 's/[.[\*^$]/\\&/g')
CONTRACTS=$(rg -l --glob '*.contract.json' -e "\"branch\"[[:space:]]*:[[:space:]]*\"$BRANCH_RE\"" "$DOCS_DIR" 2>/dev/null || true)
if [[ -z "$CONTRACTS" ]]; then
  note "no contract names this branch — the feature flow was not used, or the contract has no \"branch\""
else
  while IFS= read -r c; do
    REL="${c#"$WORKSPACE"/}"
    # contract-check owns every fact (does it hold, was it signed, was acceptance submitted):
    # exit 1 + problems on stderr when it does not hold; otherwise `ok:` / `todo:` lines
    # that are relayed here verbatim, so this script never reads an answers file itself.
    if OUT=$(python3 "$WORKSPACE/scripts/ui-review/review-cards.py" contract-check "$c" 2>&1); then
      while IFS= read -r line; do
        case "$line" in
          ok:\ *)   pass "${line#ok: } — $REL" ;;
          todo:\ *) fail "${line#todo: }" ;;
          *)        note "$line" ;;
        esac
      done <<<"$OUT"
    else
      fail "contract does not hold — $REL:"
      echo "$OUT" | sed 's/^/       /'
    fi
  done <<<"$CONTRACTS"
fi

echo
echo "Docs"

# Scoped to THIS branch. A doc naming a branch that no longer exists holds
# commands that error instead of answering, and claims that read as current.
DEAD=""
[[ "$MERGED" == yes ]] && DEAD=$(rg -l --glob '!docs/archive/**' -F "$BRANCH" "$WORKSPACE/docs/active" "$WORKSPACE/docs/roadmap" 2>/dev/null || true)
if [[ "$MERGED" != yes ]]; then
  note "docs naming this branch are FINE while it is unmerged — check skipped"
fi
if [[ -n "$DEAD" ]]; then
  fail "these still name the branch — commands in them will error, not answer:"
  echo "$DEAD" | sed "s|^$WORKSPACE/|       |"
elif [[ "$MERGED" == yes ]]; then
  pass "no live doc names the branch"
fi

# Also scoped: only docs that mention the branch AND are marked shipped. The
# unscoped version reports the same handful of unrelated files on every run.
if [[ -n "$DEAD" ]]; then
  SHIPPED=$(echo "$DEAD" | tr '\n' '\0' | xargs -0 rg -l '^status: shipped' 2>/dev/null || true)
  if [[ -n "$SHIPPED" ]]; then
    fail "marked shipped, names this branch, still under docs/active/ — move to docs/archive/:"
    echo "$SHIPPED" | sed "s|^$WORKSPACE/|       |"
  fi
fi

ALL_SHIPPED=$(rg -l '^status: shipped' "$WORKSPACE/docs/active" 2>/dev/null | wc -l)
[[ "$ALL_SHIPPED" -gt 0 ]] && note "($ALL_SHIPPED doc(s) marked shipped are still in docs/active/ overall — not necessarily yours)"

note "roadmap: close the item for this work in the SAME session — delete it from docs/roadmap/<area>.md, one line in docs/roadmap/shipped.md, then node scripts/roadmap-check.mjs --fix (CLAUDE.md)"
note "docs/MAP.md: does the merged subsystem have a row and a hot path? 'no rule' is an answer; 'no row' is not"
note "archived docs: repoint cross-links that still point at docs/active/"

echo
echo "Deploy"
if [[ "$REPO" == "wecoded-marketplace" ]]; then
  note "merging to master AUTO-DEPLOYS the Cloudflare Worker via .github/workflows/worker-deploy.yml"
  note "never run wrangler deploy by hand"
else
  note "no auto-deploy on merge for $REPO"
fi

echo
echo "Verify"
note "bash scripts/verify.sh              (desktop only — Android and worker need their own commands)"
note "node scripts/audit-anchors.mjs      (docs, rules, MAP, budgets)"

echo
if [[ "$MERGED" == unknown ]]; then
  echo "Nothing here is evidence of a close-out — no ref and no merge commit for $BRANCH."
  echo "Confirm the branch name before reading any line above as done."
elif [[ $FAILED -eq 0 ]]; then
  echo "Nothing mechanical outstanding. The '--' lines still need a human."
else
  echo "$FAILED mechanical item(s) outstanding. The '--' lines still need a human."
fi
exit 0
