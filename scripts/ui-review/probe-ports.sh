#!/bin/bash
# probe-ports.sh <port> [<port> ...] — exit 1 naming every port that already has a listener.
# WHY: two review sweeps at offsets 300 and 310 overlapped their CDP port ranges and
# deadlocked for 20 minutes with no error (2026-08-27, hand-off gap 1). Refusing loudly is
# the fix; `ss` is the reliable local truth, bash's /dev/tcp is the fallback where ss is absent.
busy=()
for p in "$@"; do
  if command -v ss >/dev/null 2>&1; then
    [[ -n "$(ss -ltnH "sport = :$p" 2>/dev/null)" ]] && busy+=("$p")
  elif (exec 3<>"/dev/tcp/127.0.0.1/$p") 2>/dev/null; then
    busy+=("$p")
  fi
done
if [[ ${#busy[@]} -gt 0 ]]; then
  echo "REFUSING: ports already in use: ${busy[*]} — another sweep is running; use YOUCODED_PORT_OFFSET at least 100 away" >&2
  exit 1
fi
exit 0
