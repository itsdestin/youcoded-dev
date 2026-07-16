#!/usr/bin/env bash
# Run a command inside a quickemu guest via the QEMU guest agent (qemu-ga) and
# print its exit code + stdout/stderr. Lets a Claude session inspect a guest
# without SSH or sendkey guesswork. See docs/vm-testing.md.
#
# Usage: vm-exec.sh <vm-dir> <path> [args...]
#   scripts/vm/vm-exec.sh ~/vms/windows-11 powershell.exe -Command "Get-Command node"
#
# WARNING: qemu-ga is a LocalSystem service, so commands run as NT AUTHORITY\SYSTEM
# — NOT the logged-in user. Fine for inspection; wrong for per-user installers
# (they land in the system profile). Install via the GUI instead.
#
# Requires: the guest's answer file installed qemu-ga (quickemu's Windows one does,
# but only if virtio-win.iso was the real image and not the 4KB stub).
set -uo pipefail

AG="$1/$(basename "$1")-agent.sock"; shift
BIN="$1"; shift

# Build the JSON arg array from remaining args.
# Read from argv (NOT stdin lines) so multi-line arguments survive intact.
ARGS=$(python3 -c 'import sys,json; print(json.dumps(sys.argv[1:]))' "$@")

qga() { ( echo "$1"; sleep 2 ) | timeout 10 socat - unix-connect:"$AG" 2>/dev/null; }

PID=$(qga "{\"execute\":\"guest-exec\",\"arguments\":{\"path\":\"$BIN\",\"arg\":$ARGS,\"capture-output\":true}}" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["return"]["pid"])' 2>/dev/null)

[ -z "${PID:-}" ] && { echo "ERROR: guest-exec failed (is qemu-ga running?)"; exit 1; }

# Poll until the process exits
for _ in $(seq 1 30); do
  OUT=$(qga "{\"execute\":\"guest-exec-status\",\"arguments\":{\"pid\":$PID}}")
  echo "$OUT" | grep -q '"exited": true' && break
  sleep 1
done

echo "$OUT" | python3 -c '
import sys,json,base64
r=json.load(sys.stdin)["return"]
print("exitcode:", r.get("exitcode"))
for k,label in (("out-data","STDOUT"),("err-data","STDERR")):
    if r.get(k):
        d=base64.b64decode(r[k]).decode("utf-8","replace").strip()
        if d: print(f"--- {label} ---\n{d}")
'
