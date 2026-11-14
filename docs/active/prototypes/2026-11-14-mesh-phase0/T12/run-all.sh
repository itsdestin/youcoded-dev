#!/usr/bin/env bash
# Re-runs every result file in ./results (about 6 minutes). usage: bash run-all.sh
cd "$(dirname "$0")" && mkdir -p results
node fuzz.mjs --runs 20000 --seed 100000 > results/fuzz-fixed-20000.txt 2>&1
node fuzz.mjs --runs 20000 --seed 100000 --literal > results/fuzz-literal-20000.txt 2>&1
node fuzz.mjs --runs 20000 --seed 100000 --noRemove --len 40 > results/fuzz-fixed-noremove-20000.txt 2>&1
node t13.mjs > results/t13-fixed.txt 2>&1
node t13.mjs --literal > results/t13-literal.txt 2>&1
node scenarios.mjs > results/scenarios.txt 2>&1
node s15.mjs > results/s15.txt 2>&1
node fmt.mjs > results/format-coinflip.txt 2>&1
node fuzz.mjs --runs 500 --mutate > results/mutation-clock.txt 2>&1
node fuzz.mjs --runs 500 --mutateOrder > results/mutation-order.txt 2>&1
( for k in loserRelease anyOnBehalf restoreAll backed seenMaximal literalLosers noOwnerField naiveCluster; do echo -n "revert $k: "; node fuzz.mjs --runs 3000 --seed 1 --revert $k | sed -n '/failuresByProperty/,/}/p' | tr -d '\n '; echo; done; echo -n "FIXED (all on): "; node fuzz.mjs --runs 3000 --seed 1 | sed -n '/failuresByProperty/,/}/p' | tr -d '\n '; echo ) > results/ablation-3000.txt 2>&1
echo done > results/DONE
node fuzz.mjs --runs 20000 --seed 100000 --add witnessEntries > results/fuzz-witnessentries-20000.txt 2>&1
