#!/bin/bash
# probe-ports.sh <port> [<port> ...] — exit 1 naming every port that already has a listener.
# WHY: two review sweeps at offsets 300 and 310 overlapped their CDP port ranges and
# deadlocked for 20 minutes with no error (2026-08-27, hand-off gap 1). Refusing loudly is
# the fix; `ss` is the reliable local truth, bash's /dev/tcp is the fallback where ss is absent.
# ONE `ss` call, not one per port: cdp-ports.sh probes a 312-port block up to six times.
set -u
busy=()
if command -v ss >/dev/null 2>&1; then
  # Every local listening port, once. `ss` prints the address as host:port; strip the host.
  listening="$(ss -ltnH 2>/dev/null | awk '{print $4}' | sed 's/.*://' | sort -u)"
  for p in "$@"; do
    grep -qx "$p" <<< "$listening" && busy+=("$p")
  done
else
  for p in "$@"; do
    (exec 3<>"/dev/tcp/127.0.0.1/$p") 2>/dev/null && busy+=("$p")
  done
fi
if [[ ${#busy[@]} -gt 0 ]]; then
  # Only the ports on stderr: cdp-ports.sh quotes this line inside its own message.
  echo "ports already in use: ${busy[*]}" >&2
  exit 1
fi
exit 0
