#!/usr/bin/env bash
# par.sh <check|own> <total> <seed0> <args...>   4 workers (the maximum allowed), merged JSON on stdout.
# check: args = <mix> <relay>   (env NOCOPY=1 etc. passes through)       own: args = extra flags of sim-own-v2.mjs (e.g. --v2 --mix poison --lie 0.3)
K=$1; N=$2; S=$3; shift 3; Q=$((N/4)); D=$(mktemp -d); cd "$(dirname "$0")"
for i in 0 1 2 3; do
  if [ "$K" = check ]; then node sim-check-v2.mjs $((S+i*Q)) $Q "$@" > $D/$i.txt 2>&1 &
  else node sim-own-v2.mjs --runs $Q --seed $((S+i*Q)) "$@" > $D/$i.txt 2>&1 & fi
done; wait
node merge.mjs $D/0.txt $D/1.txt $D/2.txt $D/3.txt; rm -rf $D
