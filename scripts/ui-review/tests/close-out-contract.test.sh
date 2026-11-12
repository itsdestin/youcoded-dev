#!/usr/bin/env bash
# close-out.sh gets a Contract section: no contract → a note; a contract that holds but is
# unsigned with no acceptance deck → OK + TODO + TODO; signed and accepted → three OKs; a
# contract that does not hold → TODO with the problems indented. Runs against a temp docs dir.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; WS="$(cd "$HERE/../../.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
python3 -c "import sys; sys.path.insert(0, '$HERE'); from fixture import contract_spec; print(contract_spec('$TMP'))" >/dev/null
X="$TMP/docs/active/design/x"; mkdir -p "$X" && mv "$TMP/deck/"* "$X/"

out=$(CLOSE_OUT_DOCS="$TMP/nothing" bash "$WS/scripts/close-out.sh" no-such-branch-zz workspace)
grep -q "^Contract" <<<"$out" || { echo "no Contract section"; exit 1; }
grep -q "no contract or walkthrough names this branch" <<<"$out" || { echo "missing 'no contract' note"; echo "$out"; exit 1; }

# pass()/fail() print colour escapes between the OK/TODO word and the message, so match loosely.
out=$(CLOSE_OUT_DOCS="$TMP/docs" bash "$WS/scripts/close-out.sh" feat/arcade-fixture workspace)
grep -q "OK.*contract holds: 3 rows" <<<"$out" || { echo "expected 'contract holds'"; echo "$out"; exit 1; }
grep -q "TODO.*not signed" <<<"$out" || { echo "expected unsigned TODO"; echo "$out"; exit 1; }
grep -q "TODO.*acceptance deck not built" <<<"$out" || { echo "expected acceptance TODO"; echo "$out"; exit 1; }

echo '{"submitted":"2026-09-01T11:00:00Z","answers":{"C":{"v":"yes"}}}' > "$X/arcade.contract.answers.json"
echo '{"key":"arcade-contract-acceptance","steps":[]}' > "$X/arcade.contract.acceptance.json"
echo '{"submitted":"2026-09-01T12:00:00Z","answers":{"C":{"v":"yes"},"R2":{"v":"yes"}}}' > "$X/arcade.contract.acceptance.answers.json"
out=$(CLOSE_OUT_DOCS="$TMP/docs" bash "$WS/scripts/close-out.sh" feat/arcade-fixture workspace)
grep -q "OK.*signed 2026-09-01 11:00" <<<"$out" || { echo "expected signed OK"; echo "$out"; exit 1; }
grep -q "OK.*acceptance deck submitted" <<<"$out" || { echo "expected acceptance OK"; echo "$out"; exit 1; }

python3 - "$X/r1.answers.json" <<'PY'
import json, sys; p = sys.argv[1]; a = json.load(open(p)); a['submitted'] = None; json.dump(a, open(p, 'w'))
PY
out=$(CLOSE_OUT_DOCS="$TMP/docs" bash "$WS/scripts/close-out.sh" feat/arcade-fixture workspace)
grep -q "TODO.*contract does not hold" <<<"$out" || { echo "expected does-not-hold TODO"; echo "$out"; exit 1; }
grep -q "never submitted" <<<"$out" || { echo "expected the problem line"; echo "$out"; exit 1; }
# Walkthrough flow: a feature folder with a walkthrough naming the branch and NO contract is gated
# by walkthrough-check — unfinished until both decks are answered and every request is linked.
W="$TMP/wdocs/active/design/y"; mkdir -p "$W"
python3 - "$W" <<'PY'
import json, sys; d = sys.argv[1]
b = {"title": "t", "key": "y", "out": "y.html", "branch": "feat/walk-fixture", "steps": [
  {"id": "W-1", "calls": [{"id": "r", "call": "Saved.", "why": "Star.", "decided": "save it"}]}]}
a = {"title": "t", "key": "y2", "out": "y2.html", "steps": [
  {"id": "W-1", "calls": [{"id": "r", "call": "Built.", "why": "Yes.", "from": "W-1/r"}]}]}
json.dump(b, open(d + "/y.walkthrough.json", "w")); json.dump(a, open(d + "/y.walkthrough.after.json", "w"))
json.dump({"submitted": "2026-11-11T10:00:00Z", "answers": {}}, open(d + "/y.walkthrough.answers.json", "w"))
PY
out=$(CLOSE_OUT_DOCS="$TMP/wdocs" bash "$WS/scripts/close-out.sh" feat/walk-fixture workspace)
grep -q "TODO.*walkthrough not finished" <<<"$out" || { echo "expected unfinished walkthrough TODO"; echo "$out"; exit 1; }
grep -q "after-build walkthrough has not been submitted" <<<"$out" || { echo "expected the reason"; echo "$out"; exit 1; }
echo '{"submitted":"2026-11-11T12:00:00Z","answers":{}}' > "$W/y.walkthrough.after.answers.json"
out=$(CLOSE_OUT_DOCS="$TMP/wdocs" bash "$WS/scripts/close-out.sh" feat/walk-fixture workspace)
grep -q "OK.*requests and 0 switched-on checks all answered" <<<"$out" || { echo "expected walkthrough OK"; echo "$out"; exit 1; }
echo "close-out contract section: ok"
