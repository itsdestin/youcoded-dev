#!/usr/bin/env bash
# For each named failing seed: run it with ALL fixes, then with ONLY the named rule put back to the old behaviour. A rule is "needed" if the
# second run fails a property the first does not. (Rules overlap, so a seed can be masked by a neighbouring rule: those show "no change".)
cd "$(dirname "$0")"
one() { # seed gen rule
  local flags=""; [ "$2" = wide ] && flags="--wide"
  local base rev
  base=$(node fuzz.mjs --runs 1 --seed $1 $flags | sed -n '/failuresByProperty/,/}/p' | tr -d '\n ' | grep -o 'P[0-9]*-[a-z-]*' | grep -v '^P7' | sort -u | tr '\n' ',')
  rev=$(node fuzz.mjs --runs 1 --seed $1 $flags --revert $3 | sed -n '/failuresByProperty/,/}/p' | tr -d '\n ' | grep -o 'P[0-9]*-[a-z-]*' | grep -v '^P7' | sort -u | tr '\n' ',')
  printf '%-8s %-5s revert %-20s all-fixes: %-8s reverted: %s\n' $1 $2 $3 "${base:-clean}" "${rev:-clean}"
}
one 119382 std runFix
one 113098 std orphanClaim
one 111374 std lineageSetAside
one 100314 std parentOwesOnLoss
one 108767 std reversibleSetAside
one 149748 std noOverwrite
one 125960 std selfParent
one 114235 std roleField
one 172735 std oldEra
one 1133515 wide oldEra
one 1144542 wide hostNoPull
one 1193904 wide hostNoPull
one 1094913 wide hostNoPull
one 1071905 wide reversibleSetAside
one 1164672 wide reversibleSetAside
one 1008399 wide reversibleSetAside
one 1034646 wide reversibleSetAside
one 103424 std keepLonger
one 103410 std keepLonger
one 105362 std keepLonger
one 307854 wide rosterGate
one 100002 std stableIds
one 300066 wide stableIds
