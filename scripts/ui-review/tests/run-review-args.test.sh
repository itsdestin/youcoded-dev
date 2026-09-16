#!/usr/bin/env bash
# run-review.sh must refuse a target that is not a folder BEFORE it starts a
# workbench. On 2026-09-16 `run-review.sh --help` took "--help" as the worktree,
# started a workbench for it and printed a line of progress before failing.
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
fail=0
for bad in --help -h /definitely/not/a/folder; do
  out="$(bash "$HERE/run-review.sh" "$bad" 2>&1)"; code=$?
  if [[ $code -eq 0 ]]; then echo "FAIL: '$bad' exited 0"; fail=1; fi
  if grep -q "starting workbench" <<<"$out"; then echo "FAIL: '$bad' started a workbench"; fail=1; fi
  if ! grep -q "usage:" <<<"$out"; then echo "FAIL: '$bad' printed no usage"; fail=1; fi
done
[[ $fail -eq 0 ]] && echo "ok run-review-args"
exit $fail
