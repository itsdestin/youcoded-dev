#!/bin/bash
# The full T4 campaign. Output: results-*.txt next to this script. JOBS=6 by default.
cd "$(dirname "$0")"
J=${JOBS:-6}
node fuzz.mjs --n 1000 --devices 3 --jobs $J --seed0 1 > results-main-3dev.txt 2>&1
node fuzz.mjs --n 300 --devices 4 --jobs $J --seed0 5001 > results-4dev.txt 2>&1
node fuzz.mjs --n 200 --devices 5 --jobs $J --seed0 9001 > results-5dev.txt 2>&1
node fuzz.mjs --n 300 --devices 3 --jobs $J --seed0 30001 --cfg mixed=true > results-mixed-git-methods.txt 2>&1
# two hosts, both writing every 2 s for 2 minutes of simulated time: how fast does history grow?
node fuzz.mjs --n 24 --devices 2 --jobs $J --seed0 40001 --cfg writeTicks=60,pOp=1,cap=300 > results-long-2hosts.txt 2>&1
# ablations on the same first 150 seeds as the main run, one change each
for cfg in "baseMode=recursive" "baseMode=lowest" "dominance=false" "tie=id" "det=false" "dedupe=true" "view=false" "dominance=false,det=false,fold=naive,baseMode=recursive,view=false,cap=60"; do
  node fuzz.mjs --n 150 --devices 3 --jobs $J --seed0 1 --cfg "$cfg" > "results-ablation-$(echo $cfg | tr ',=' '__').txt" 2>&1
done
echo finished > results-DONE.txt
