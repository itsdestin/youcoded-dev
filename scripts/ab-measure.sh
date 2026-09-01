#!/usr/bin/env bash
# scripts/ab-measure.sh — run the same measurement against the OLD files and your NEW ones,
# so "did I break this?" gets an answer instead of a guess.
#
# WHY THIS EXISTS: on 2026-09-01 a styling change made a review deck look wrong in two
# places, and there was no way to tell which of them was new damage. Doing this by hand
# three times answered it every time, and the answers went both ways:
#
#   * the pinned answer bar was on screen BEFORE the change and off screen AFTER  → I broke it
#   * a cut-off option measured 66 px before and 46 px after                      → pre-existing,
#     and slightly improved; an hour of "fixing" it would have been wasted
#
# Guessing wrong is expensive in both directions: ship a regression, or spend the afternoon
# repairing something that was never yours.
#
# Usage:
#   bash scripts/ab-measure.sh <file>... -- <measurement command...>
#
#   --rev <ref>         compare against this instead of HEAD
#   --prepare '<cmd>'   run after each swap, before measuring (a rebuild step, usually) —
#                       repeatable, run in order
#   --diff              also print a unified diff of the two outputs
#
# Examples:
#   # Did my page.css change break the narrow layout, or was it already broken?
#   bash scripts/ab-measure.sh scripts/ui-review/deck/page.css scripts/ui-review/deck/page.js \
#     --prepare 'python3 scripts/ui-review/review-cards.py build /tmp/deck/spec.json' \
#     -- node scripts/ui-probe.mjs file:///tmp/deck/deck.html --size 520x760 \
#          --wait 'window.__deckReady' --eval "document.querySelector('.controls').getBoundingClientRect().bottom <= innerHeight"
#
# YOUR FILES ARE SAFE. Working copies are stashed to a temp dir and restored by an EXIT
# trap, so an interrupt or a failing command still puts them back. The git index is never
# touched — the old version is read with `git show`, not checked out.
set -uo pipefail

REV="HEAD"; PREPARE=(); FILES=(); CMD=(); SHOWDIFF=0; SEEN_SEP=0
while [[ $# -gt 0 ]]; do
  if [[ $SEEN_SEP -eq 1 ]]; then CMD+=("$1"); shift; continue; fi
  case "$1" in
    --) SEEN_SEP=1; shift ;;
    --rev) REV="${2:?--rev needs a ref}"; shift 2 ;;
    --prepare) PREPARE+=("${2:?--prepare needs a command}"); shift 2 ;;
    --diff) SHOWDIFF=1; shift ;;
    -h|--help) sed -n '2,30p' "$0" | sed 's|^# \{0,1\}||'; exit 0 ;;
    -*) echo "ab-measure: unknown option '$1'" >&2; exit 2 ;;
    *) FILES+=("$1"); shift ;;
  esac
done
[[ ${#FILES[@]} -eq 0 ]] && { echo "ab-measure: name at least one file to swap" >&2; exit 2; }
[[ ${#CMD[@]} -eq 0 ]] && { echo "ab-measure: no measurement command after --" >&2; exit 2; }
git rev-parse --git-dir >/dev/null 2>&1 || { echo "ab-measure: not a git repo" >&2; exit 2; }

for f in "${FILES[@]}"; do
  [[ -f "$f" ]] || { echo "ab-measure: no such file: $f" >&2; exit 2; }
  git show "$REV:$f" >/dev/null 2>&1 || { echo "ab-measure: $f does not exist at $REV — nothing to compare against" >&2; exit 2; }
done

MINE="$(mktemp -d)"; THEIRS="$(mktemp -d)"
restore() {
  for f in "${FILES[@]}"; do cp "$MINE/$(echo "$f" | tr '/' '_')" "$f" 2>/dev/null || true; done
  rm -rf "$MINE" "$THEIRS"
}
trap restore EXIT
for f in "${FILES[@]}"; do
  cp "$f" "$MINE/$(echo "$f" | tr '/' '_')"
  git show "$REV:$f" > "$THEIRS/$(echo "$f" | tr '/' '_')"
done

prepare() { for p in ${PREPARE+"${PREPARE[@]}"}; do bash -c "$p" >/dev/null 2>&1 || echo "ab-measure: prepare step failed: $p" >&2; done; }
swap_in() { local d="$1"; for f in "${FILES[@]}"; do cp "$d/$(echo "$f" | tr '/' '_')" "$f"; done; prepare; }

echo "ab-measure: ${#FILES[@]} file(s) swapped against $REV"
printf '  %s\n' "${FILES[@]}"

swap_in "$THEIRS"
BEFORE="$("${CMD[@]}" 2>&1)"; BEFORE_RC=$?
swap_in "$MINE"
AFTER="$("${CMD[@]}" 2>&1)"; AFTER_RC=$?

echo
echo "──── BEFORE ($REV) ── exit $BEFORE_RC ────"
echo "$BEFORE"
echo
echo "──── AFTER (yours) ── exit $AFTER_RC ────"
echo "$AFTER"

if [[ "$BEFORE" == "$AFTER" && "$BEFORE_RC" == "$AFTER_RC" ]]; then
  echo
  echo "──── IDENTICAL — whatever you are looking at, your change did not cause it. ────"
elif [[ $SHOWDIFF -eq 1 ]]; then
  echo
  echo "──── DIFF (before → after) ────"
  diff <(echo "$BEFORE") <(echo "$AFTER") || true
fi
