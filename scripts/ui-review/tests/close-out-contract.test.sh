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
grep -q "no contract names this branch" <<<"$out" || { echo "missing 'no contract' note"; echo "$out"; exit 1; }

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
echo "close-out contract section: ok"
