#!/usr/bin/env bash
# Prove ONE ast-grep rule against ONE real file — "does it fire on the real regression?"
#
# WHY THIS EXISTS (2026-09-18): test-suite-hygiene.md says a guard you did not break is a
# guard you did not test. Doing that by hand for a new rule failed silently TWICE in one
# session: `npx @ast-grep/cli scan …` is not the binary's name (npm printed an error and the
# pipeline still exited 0), and a RELATIVE file path never matches a rule's `files:` glob
# (`**/src/renderer/App.tsx`), so the scan ran and reported nothing. Both read as "the rule
# did not fire", and one of them was about to be reported as proof. This runs the rule the
# way check.sh does — same binary resolution, absolute path — and says the count out loud.
#
# Usage:  bash scripts/ast-grep/prove-rule.sh <rule-id> <file>
#   Break the file first (commit your work before you do), run this, expect a count > 0,
#   `git checkout -- <file>`, run it again, expect 0.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ $# -eq 2 ]] || { echo "usage: prove-rule.sh <rule-id> <file>" >&2; exit 2; }
RULE="$1"; FILE="$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"
[[ -f "$FILE" ]] || { echo "prove-rule: no such file: $2" >&2; exit 2; }
[[ -f "$HERE/rules/$RULE.yml" ]] || { echo "prove-rule: no rule file rules/$RULE.yml" >&2; exit 2; }
if command -v ast-grep >/dev/null 2>&1; then AG=(ast-grep); else AG=(npx --yes --package @ast-grep/cli ast-grep); fi
OUT="$("${AG[@]}" scan -c "$HERE/sgconfig.yml" --filter "^${RULE}\$" "$FILE" 2>&1)"
N="$(grep -c "\[${RULE}\]" <<<"$OUT" || true)"
echo "$RULE fired $N time(s) on $FILE"
[[ "$N" -gt 0 ]] && grep -A6 "\[${RULE}\]" <<<"$OUT" | grep -E "^\s+[0-9]+ │" | head -n 5
exit 0
