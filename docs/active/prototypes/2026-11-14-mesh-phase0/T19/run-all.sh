#!/bin/bash
# Re-run everything: ~8 minutes, 4 trials at a time.
cd "$(dirname "$0")"
{
node run-trials.mjs baseline 50 0
node run-trials.mjs signal 50 0
node run-trials.mjs signal 100 0.25
node run-trials.mjs both 100 0.25
node run-trials.mjs gap 200 0
} > results.jsonl
