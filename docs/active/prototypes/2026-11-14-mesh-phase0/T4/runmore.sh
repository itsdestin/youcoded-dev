#!/bin/bash
# Longer ablations: is the criss-cross base rule / tie rule really needed? (1000 / 1000 / 500 schedules)
cd "$(dirname "$0")"
J=${JOBS:-6}
node fuzz.mjs --n 1000 --devices 3 --jobs $J --seed0 1 --cfg baseMode=recursive > results-long-ablation-baseMode_recursive.txt 2>&1
node fuzz.mjs --n 1000 --devices 3 --jobs $J --seed0 1 --cfg baseMode=lowest > results-long-ablation-baseMode_lowest.txt 2>&1
node fuzz.mjs --n 500 --devices 3 --jobs $J --seed0 1 --cfg tie=id > results-long-ablation-tie_id.txt 2>&1
echo finished > results-DONE2.txt
