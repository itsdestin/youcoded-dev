#!/usr/bin/env bash
# setup-builder.sh <round> <concept> — a private workspace + app copy for one guide-test builder.
# Detached (no branch), so nothing a builder makes shows up as a branch later rounds could find.
set -euo pipefail
R=$1; C=$2
SRC=/home/destin/youcoded-dev/worktrees/sessions/ui-consistency-audit
DST=/home/destin/youcoded-dev/worktrees/sessions/gt-$R-$C
git -C "$SRC" worktree add --detach "$DST" HEAD >/dev/null
git -C "$SRC/youcoded" worktree add --detach "$DST/youcoded" HEAD >/dev/null
cp -al "$SRC/youcoded/desktop/node_modules" "$DST/youcoded/desktop/node_modules"
# Earlier rounds' designs and critiques must not be visible (Destin, guide-test-questions#R-2).
rm -rf "$DST/docs/archive/design/2026-10-15-guide-test"  # this folder (archived 2026-10-16)
# Hide earlier mockups of the same kind of screen (guide-test-questions#R-1).
if [ "$C" = purchases-page ]; then
  rm -rf "$DST/youcoded/desktop/src/renderer/dev/workbench/fixtures/money" "$DST/youcoded/desktop/tests/money-page.test.ts"
  sed -i "/import { MONEY_PAGE } from '.\/money\/money';/d; /^    MONEY_PAGE,$/d" "$DST/youcoded/desktop/src/renderer/dev/workbench/fixtures/pages.ts"
fi
echo "$DST"
