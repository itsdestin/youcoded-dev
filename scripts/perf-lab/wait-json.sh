#!/bin/bash
# usage: wait-json.sh <file> [max-seconds]  — polls until the report file exists (rig runs write it last)
f="$1"; max="${2:-600}"; t=0
while [ ! -s "$f" ] && [ $t -lt $max ]; do sleep 5; t=$((t+5)); done
[ -s "$f" ] && echo ready || echo "timeout waiting for $f"
