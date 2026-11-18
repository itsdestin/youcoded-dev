#!/usr/bin/env bash
# Films one campaign scene only when the machine is quiet, then measures smoothness and retries when it is choppy.
# WHY (2026-11-18): takes filmed at load average ~170 stuttered (6 unique frames in 3 s of typing). Screencast
# frames only arrive when the CPU keeps up, so a clip is only as smooth as the machine was.
# Usage: film.sh <scene.json> <out-base> [THEME] [max-duration-s]
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; WS="$(cd "$HERE/../.." && pwd)"
SCENE="$1"; OUT="$2"; THEME="${3:-}"; MAXD="${4:-60}"; LOADMAX="${LOADMAX:-24}"
for attempt in 1 2 3; do
  while :; do l=$(cut -d' ' -f1 /proc/loadavg); awk -v l="$l" -v m="$LOADMAX" 'BEGIN{exit !(l<m)}' && break; echo "  load $l >= $LOADMAX, waiting 30 s"; sleep 30; done
  echo "  take $attempt of $(basename "$OUT") (load $l)"
  ( cd "$WS" && RECORD_REAL_DENSITY=1 RECORD_JPEG="${RECORD_JPEG:-1}" RECORD_CRF="${RECORD_CRF:-12}" ${THEME:+THEME=$THEME} node scripts/ui-review/record.mjs "$SCENE" "$OUT" 2>&1 | tail -1 )
  if python3 "$HERE/measure.py" "$OUT" "$MAXD"; then echo "  PASS $(basename "$OUT")"; exit 0; fi
  echo "  choppy or too slow, retrying"
done
echo "  GAVE UP $(basename "$OUT")"; exit 1
