#!/usr/bin/env bash
# reproduces every number in simplify-study.md (about 1 minute; 4 workers at a time)
cd "$(dirname "$0")"; mkdir -p results
./par.sh 200000 50000000 --mode AB > results/AB-honest-200k.json
./par.sh 100000 60000000 --mode copyonly > results/copyonly-honest-100k.json
./par.sh 100000 70000000 --mode ungated > results/ungated-honest-100k.json
./par.sh 100000 80000000 --mode AB --lie 0.3 > results/AB-lie0.3-100k.json
./par.sh 100000 90000000 --mode AB --lie 0.8 > results/AB-lie0.8-100k.json
./par.sh 100000 100000000 --mode AB --noterminal --norestore --strict > results/AB-calm-strict-100k.json
./par.sh 100000 110000000 --mode copyonly --noterminal --norestore --strict > results/copyonly-calm-strict-100k.json
./par.sh 100000 120000000 --mode ungated --noterminal --norestore --strict > results/ungated-calm-100k.json
for m in AB copyonly ungated; do ./par.sh 100000 160000000 --mode $m --everyday --norestore --noterminal --strict --len 40 > results/everyday-$m-100k.json; done
./par.sh 20000 130000000 --mode AB --mutate nofork > results/mut-nofork.json
./par.sh 20000 140000000 --mode AB --mutate nodedupe > results/mut-nodedupe.json
./par.sh 20000 150000000 --mode AB --mutate nofence > results/mut-nofence.json
node roster-sim.mjs --runs 100000 --seed 1 > results/roster.txt
