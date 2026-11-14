#!/usr/bin/env bash
# T12b: reproduces every number in docs/active/investigations/2026-11-14-mesh-phase0/T12b-decide-closed.md. Max 4 worker processes at a time.
# usage: bash run-all.sh   (about 20 minutes)   results land in ./results/
cd "$(dirname "$0")" && mkdir -p results
P=./par.sh
echo "== original 3 failing seeds (T12 generator, seeds 113098 119382 119763), old rules vs new rules" > results/three-seeds.txt
for s in 113098 119382 119763; do
  echo "seed $s  OLD (T12 rules):" >> results/three-seeds.txt; node fuzz.mjs --runs 1 --seed $s --revert runFix,orphanClaim,lineageSetAside,stableIds,parentOwesOnLoss,reversibleSetAside,rosterGate,keepLonger,adoptClaim,primaryIsChatId,noOverwrite,selfParent,roleField,oldEra,formatMax,reconcileAfterAdopt,hostNoPull | sed -n '/failuresByProperty/,/}/p' | tr -d '\n ' >> results/three-seeds.txt; echo >> results/three-seeds.txt
  echo "seed $s  NEW:" >> results/three-seeds.txt; node fuzz.mjs --runs 1 --seed $s | sed -n '/failuresByProperty/,/}/p' | tr -d '\n ' >> results/three-seeds.txt; echo >> results/three-seeds.txt
done
$P 20000 100000 --literal > results/random-literal-20000.txt            # the design text as written, T12 generator
$P 100000 100000 > results/random-std-100000.txt                         # T12 generator (3-5 devices), seeds 100000..199999
$P 200000 1000000 --wide > results/random-wide-200000.txt                # wide generator (2-5 devices, mutual removals, restores, ...)
$P 40000 2000000 --wide --readd > results/random-wide-readd-40000.txt    # same, then every removed/unknown device is re-added and everything re-settled
node fmt.mjs > results/format-max.txt 2>&1
node t13.mjs > results/t13-fixed.txt 2>&1                                # 4,374 systematic takeover cases
node t13.mjs --literal > results/t13-literal.txt 2>&1
( for k in runFix orphanClaim lineageSetAside parentOwesOnLoss reversibleSetAside rosterGate keepLonger noOverwrite selfParent roleField oldEra stableIds formatMax reconcileAfterAdopt hostNoPull; do echo -n "revert $k: "; $P 20000 300000 --wide --revert $k; done ) > results/ablation-wide-20000.txt 2>&1
node fuzz.mjs --runs 500 --seed 100000 --mutate > results/mutation-clock.txt 2>&1      # harness self-test: wall clock in the tie-break must be caught
node fuzz.mjs --runs 500 --seed 100000 --mutateOrder > results/mutation-order.txt 2>&1  # harness self-test: arrival order must be caught
bash seed-ablation.sh > results/seed-ablation.txt 2>&1
bash seeds3.sh > results/three-seeds-single-rule.txt 2>&1
node coverage.mjs > results/coverage-wide.txt 2>&1
echo done > results/DONE
