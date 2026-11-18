#!/bin/bash
cd "$(dirname "$0")/.."
F=$1; T=$2; N=$3; TAG=$4; SZ=$(( (T-F+1+N-1)/N ))
for i in $(seq 0 $((N-1))); do
  a=$((F+i*SZ)); b=$((a+SZ-1)); [ $b -gt $T ] && b=$T
  TMPDIR=$PWD/tmp R5_FROM=$a R5_TO=$b R5_OUT=$PWD/out/$TAG-$a.jsonl npx vitest run -c vitest.r5.config.ts r5/fuzz.test.ts > out/$TAG-log-$a.txt 2>&1 &
done
wait
