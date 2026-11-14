#!/usr/bin/env bash
# The three seeds the previous report could not explain: which single new rule closes each one (T12 baseline fixes on, plus exactly one new rule).
cd "$(dirname "$0")"
for s in 113098 119382 119763; do
  echo -n "seed $s  T12 baseline only: "; node fuzz.mjs --runs 1 --seed $s --only runFix_none | sed -n '/failuresByProperty/,/}/p' | tr -d '\n ' | grep -o 'P3[a-z-]*' | tr '\n' ' '; echo
  for k in runFix orphanClaim oldEra keepLonger reversibleSetAside lineageSetAside selfParent hostNoPull; do
    echo -n "   + only $k: "; node fuzz.mjs --runs 1 --seed $s --only $k | sed -n '/failuresByProperty/,/}/p' | tr -d '\n ' | grep -o 'P[0-9]*-[a-z-]*' | grep -v '^P7' | sort -u | tr '\n' ' '; echo
  done
done
