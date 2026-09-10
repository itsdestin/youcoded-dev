#!/usr/bin/env bash
# ci-red-vs-master.sh — is this PR's red check already red on master?
#
# Usage: bash scripts/ci-red-vs-master.sh <pr-number> [<repo-dir>]
#   repo-dir: a sub-repo checkout (default: youcoded) or `.` for the workspace.
#
# WHY: "read the check before merging" is the rule, and on 2026-09-10 one session did the
# same eight-call dance four times — list the PR's checks, open the failed job's log, pull
# the failing test names, find master's latest run of the same workflow, open ITS log,
# compare — to learn each time that the red leg (a git-identity test in the workspace, a
# harness checkpoint test on Windows in the app) was already red on master. Two to three
# minutes each, and a session that skips it merges over a real regression one day.
#
# Read-only. Exits 0 when every failing test on the PR also fails on master's latest run
# of that workflow, 1 when the PR has a failure master does not (or a job with no test
# names to compare — build/install breaks — which you read yourself). Needs `gh`.
set -u
pr="${1:?usage: ci-red-vs-master.sh <pr-number> [<repo-dir>]}"
repo="${2:-youcoded}"
cd "$repo" || exit 2

# failing test names in a run's failed-job logs: vitest's "×" rows and node:test's "not ok".
# gh prints colour codes as the literal two characters ^[ not an ESC byte, so both are stripped.
failing_tests() { # $1 = run id
  gh run view "$1" --log-failed 2>/dev/null \
    | sed -E 's/(\x1b|\^\[)\[[0-9;]*m//g' \
    | grep -E '(×|not ok [0-9]+ -) ' \
    | sed -E 's/.*(×|not ok [0-9]+ -) *//; s/ +[0-9]+ms$//' \
    | sort -u
}

new=0; compared=0
while IFS=$'\t' read -r name state _ url; do
  [ "$state" = "fail" ] || continue
  run="${url##*/actions/runs/}"; run="${run%%/*}"
  wf=$(gh run view "$run" --json workflowName -q .workflowName)
  # latest COMPLETED run: an in-progress one has no failed log yet and every PR failure would read as new
  master=$(gh run list --branch master --workflow "$wf" --status completed --limit 1 --json databaseId -q '.[0].databaseId')
  prfail=$(failing_tests "$run"); mfail=$(failing_tests "$master")
  echo "== $name  (workflow: $wf; master run $master)"
  if [ -z "$prfail" ]; then
    echo "   no test names in the failed log — a build/install failure; read it: $url"; new=1; continue
  fi
  while IFS= read -r t; do
    compared=$((compared+1))
    if grep -qxF "$t" <<<"$mfail"; then echo "   also red on master: $t"
    else echo "   NEW on this PR:     $t"; new=1; fi
  done <<<"$prfail"
done < <(gh pr checks "$pr" 2>/dev/null)

if [ "$compared" -eq 0 ] && [ "$new" -eq 0 ]; then echo "no failing checks on PR #$pr"; fi
[ "$new" -eq 0 ] && echo "verdict: every failure is pre-existing on master" || echo "verdict: something here is NOT on master — read it before merging"
exit "$new"
