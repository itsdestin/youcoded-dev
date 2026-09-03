#!/bin/bash
# scripts/ui-review/tests/cdp-ports.test.sh — cdp-ports.sh gives two runs at the SAME offset
# disjoint port blocks, is deterministic for one run, slides past a busy block, and refuses
# loudly when six blocks in a row are taken. Needs only python3 (to hold ports).
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
CDP="$HERE/../cdp-ports.sh"
pids=()
hold() { python3 -m http.server "$1" --bind 127.0.0.1 >/dev/null 2>&1 & pids+=($!); }
trap 'kill "${pids[@]}" 2>/dev/null' EXIT
fail() { echo "FAIL: $*"; exit 1; }
COUNT=312   # a full six-theme sweep on 2026-09-01
blocks=$(( (60000 - 30300) / 400 ))
expected() { echo $(( 30300 + ($1 % blocks) * 400 )); }
# This machine has its own listeners (a foreign one sat in pid 1000's block on 2026-09-01 and
# the helper rightly slid past it), so pick two consecutive pids whose blocks are free NOW —
# the test is about the arithmetic and the slide, not about what else the machine is running.
pa=""
for p in $(seq 1000 1100); do
  [[ "$(bash "$CDP" 300 $COUNT $p 2>/dev/null)" == "$(expected $p)" ]] || continue
  [[ "$(bash "$CDP" 300 $COUNT $((p + 1)) 2>/dev/null)" == "$(expected $((p + 1)))" ]] || continue
  pa=$p; break
done
[[ -n "$pa" ]] || fail "could not find two consecutive free blocks between pids 1000 and 1101"
pb=$((pa + 1))

# 1. Same offset, consecutive pids (two sessions starting sweeps) -> blocks that do not overlap.
a=$(bash "$CDP" 300 $COUNT $pa 2>/dev/null) || fail "pid $pa got no block"
b=$(bash "$CDP" 300 $COUNT $pb 2>/dev/null) || fail "pid $pb got no block"
(( a + COUNT < b || b + COUNT < a )) || fail "blocks overlap: $a and $b for $COUNT ports"
(( a >= 30300 )) || fail "block $a is below 30000+offset"

# 2. Deterministic: the dry run must predict the real run.
a2=$(bash "$CDP" 300 $COUNT $pa 2>/dev/null)
[[ "$a" == "$a2" ]] || fail "same pid gave $a then $a2"

# 3. One listener inside pid $pa's block -> it moves to the NEXT block (pid $pb's) and says so.
hold $((a + 5)); sleep 0.7
moved=$(bash "$CDP" 300 $COUNT $pa 2>"$HERE/.cdp-stderr") || fail "busy block should slide, not refuse"
[[ "$moved" == "$b" ]] || fail "expected slide to $b, got $moved"
grep -q "$((a + 5))" "$HERE/.cdp-stderr" || fail "stderr must name the busy port: $(cat "$HERE/.cdp-stderr")"

# 4. Six consecutive blocks busy -> exit 1 naming the busy ports.
for k in 1 2 3 4 5; do hold $(( $(expected $((pa + k))) + 1 )); done; sleep 0.7
out=$(bash "$CDP" 300 $COUNT $pa 2>&1); code=$?
rm -f "$HERE/.cdp-stderr"
[[ $code -eq 1 && "$out" == *"REFUSING"* && "$out" == *"$((a + 5))"* ]] || fail "expected loud refusal naming $((a + 5)), got $code: $out"
echo "ok"
