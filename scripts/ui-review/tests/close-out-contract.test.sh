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
  {"id": "W-1", "calls": [{"id": "r", "call": "Built.", "why": "Yes.", "from": "W-1/r"}]},
  {"id": "W-7", "words": True, "list": "changed-while-building", "calls": [{"id": "b", "call": "Built as drawn.", "why": "Nothing moved.", "built": "as planned"}]}]}
json.dump(b, open(d + "/y.walkthrough.json", "w")); json.dump(a, open(d + "/y.walkthrough.after.json", "w"))
json.dump({"submitted": "2026-11-11T10:00:00Z", "answers": {}}, open(d + "/y.walkthrough.answers.json", "w"))
PY
out=$(CLOSE_OUT_DOCS="$TMP/wdocs" bash "$WS/scripts/close-out.sh" feat/walk-fixture workspace)
grep -q "TODO.*walkthrough not finished" <<<"$out" || { echo "expected unfinished walkthrough TODO"; echo "$out"; exit 1; }
grep -q "after-build walkthrough has not been submitted" <<<"$out" || { echo "expected the reason"; echo "$out"; exit 1; }
echo '{"submitted":"2026-11-11T12:00:00Z","answers":{"W-7":{"ok":{"b":true}}}}' > "$W/y.walkthrough.after.answers.json"
out=$(CLOSE_OUT_DOCS="$TMP/wdocs" bash "$WS/scripts/close-out.sh" feat/walk-fixture workspace)
grep -q "OK.*requests and 0 switched-on checks all answered" <<<"$out" || { echo "expected walkthrough OK"; echo "$out"; exit 1; }
# Hands-off route: ONE growing deck carrying "hands_off" and a branch is gated by the same command, as a hands-off deck.
H="$TMP/hdocs/active/design/z"; mkdir -p "$H"
python3 - "$H" <<'PY'
import json, sys, hashlib; d = sys.argv[1]
def lst(i, k, calls): return {"id": i, "words": True, "surface": "S", "path": "P", "headline": k, "list": k, "calls": calls}
s = {"title": "t", "key": "z", "out": "z.html", "branch": "feat/hands-fixture", "grows": True, "tag": "feature", "stage": "after", "hands_off": "do it without me", "steps": [
  {"id": "P-1", "page": "What you asked for", "intro": "x.", "stage": "after"},
  lst("L-1", "asked-for", [{"id": "a", "call": "Saved.", "why": "Star."}]),
  lst("L-2", "choices-made", [{"id": "c", "call": "None.", "why": "All asked.", "none_made": True}]),
  lst("L-3", "changed-while-building", [{"id": "b", "call": "Built.", "why": "As drawn.", "built": "as planned"}])]}
raw = json.dumps(s).encode(); open(d + "/z.json", "wb").write(raw)
json.dump({"submitted": "2026-11-18T10:00:00Z", "built": {"spec_sha256": hashlib.sha256(raw).hexdigest()}, "answers": {"L-1": {"ok": {"a": True}}}}, open(d + "/z.answers.json", "w"))
PY
out=$(CLOSE_OUT_DOCS="$TMP/hdocs" bash "$WS/scripts/close-out.sh" feat/hands-fixture workspace)
grep -q "TODO.*walkthrough not finished" <<<"$out" || { echo "expected unfinished hands-off TODO"; echo "$out"; exit 1; }
grep -q "hands-off deck, not finished: row L-2/c" <<<"$out" || { echo "expected the unlooked row"; echo "$out"; exit 1; }
python3 - "$H" <<'PY'
import json, sys; p = sys.argv[1] + "/z.answers.json"; a = json.load(open(p))
a["answers"] = {"L-1": {"ok": {"a": True}}, "L-2": {"ok": {"c": True}}, "L-3": {"ok": {"b": True}}}; json.dump(a, open(p, "w"))
PY
out=$(CLOSE_OUT_DOCS="$TMP/hdocs" bash "$WS/scripts/close-out.sh" feat/hands-fixture workspace)
grep -q "OK.*went through the hands-off deck" <<<"$out" || { echo "expected hands-off OK"; echo "$out"; exit 1; }
echo "close-out contract section: ok"
