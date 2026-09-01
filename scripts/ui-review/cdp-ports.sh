#!/bin/bash
# cdp-ports.sh <offset> <count> [pid] — print the base of a FREE block of <count> CDP ports.
# The ports a sweep may use are base+1 .. base+count.
#
# WHY a per-run block and not `30000 + offset + index`: two sweeps at the same offset (the
# default 300, or 300 and 310) handed the same ports to their Chromes, the second attached
# to the first's browser, and both hung 20+ minutes with no error (2026-08-27, ROADMAP L168).
# The documented workaround, "offsets ≥ 100 apart", was already wrong: a full six-theme sweep
# is 312 jobs (2026-09-01), so offsets 300 and 400 overlapped too.
#
# How the block is chosen:
#   1. Blocks are 400 ports wide (wider than any sweep today; widened in 400s if a sweep
#      ever needs more) and start at 30000 + offset, so YOUCODED_PORT_OFFSET still moves
#      the neighbourhood the way the README always said it did.
#   2. The run's pid picks the block, so two sweeps started at the SAME offset land in
#      different blocks without anyone remembering to set anything.
#   3. Every port in the block is probed (probe-ports.sh). A busy block is skipped for the
#      next one, up to 6 tries — the probe is what protects the 1-in-74 pid collision and a
#      sweep that overlaps a foreign process.
#   4. Nothing free after 6 tries → refuse loudly, naming the busy ports. Never guess.
# The choice is deterministic for a given (offset, count, pid, listeners), which is what
# lets `run-review.sh --dry-run` print the exact ports a real run would take.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
OFFSET="${1:?offset}"; COUNT="${2:?count}"; PID="${3:-$$}"
BLOCK=400
while (( COUNT > BLOCK )); do BLOCK=$((BLOCK + 400)); done
FLOOR=$((30000 + OFFSET))
BLOCKS=$(( (60000 - FLOOR) / BLOCK ))      # every port stays below 60000, clear of ephemeral range
(( BLOCKS < 1 )) && { echo "REFUSING: offset $OFFSET leaves no room for a $BLOCK-port CDP block below 60000" >&2; exit 1; }
slot=$(( PID % BLOCKS ))
tried=()
for attempt in 1 2 3 4 5 6; do
  base=$(( FLOOR + slot * BLOCK ))
  ports=(); for ((i = 1; i <= COUNT; i++)); do ports+=("$((base + i))"); done
  if busy="$(bash "$HERE/probe-ports.sh" "${ports[@]}" 2>&1 >/dev/null)"; then
    echo "$base"; exit 0
  fi
  tried+=("$((base + 1))-$((base + COUNT)) [$busy]")
  echo "[cdp-ports] block $((base + 1))-$((base + COUNT)) is busy ($busy) — trying the next block" >&2
  slot=$(( (slot + 1) % BLOCKS ))
done
echo "REFUSING: no free block of $COUNT CDP ports in 6 tries — another sweep (or six) is running. Busy: ${tried[*]}" >&2
exit 1
