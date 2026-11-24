#!/bin/bash
# usage: shard.sh FROM TO N TAG  (N workers, <=6); writes out/TAG-<a>.jsonl ; worker pids to out/TAG.pids
S=$(cd "$(dirname "$0")" && pwd); D=${R6_DESKTOP:-/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop}
F=$1; T=$2; N=$3; TAG=$4; SZ=$(( (T-F+1+N-1)/N )); : > $S/out/$TAG.pids
cd $D
for i in $(seq 0 $((N-1))); do
  a=$((F+i*SZ)); b=$((a+SZ-1)); [ $b -gt $T ] && b=$T
  mkdir -p $S/tmp/$TAG-$a
  R6_FROM=$a R6_TO=$b R6_OUT=$S/out/$TAG-$a.jsonl TMPDIR=$S/tmp/$TAG-$a npx vitest run -c $S/vitest.r6.config.mjs > $S/out/$TAG-log-$a.txt 2>&1 &
  echo $! >> $S/out/$TAG.pids
done
wait
