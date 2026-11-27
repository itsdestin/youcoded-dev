#!/bin/zsh
# usage: run.sh <testfile-pattern>
D=/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop
cd $D && VITE_CONFIG_NATIVE_IGNORE_WARNING=true timeout 580 node_modules/.bin/vitest run --config /tmp/claude-1000/-home-destin-youcoded-dev/1d94ee8c-71e6-4c05-afdb-68b45dbe9211/scratchpad/review4/vitest.r4.config.ts "$@" 2>&1 | grep -v "^$" | tail -${TAILN:-45}
