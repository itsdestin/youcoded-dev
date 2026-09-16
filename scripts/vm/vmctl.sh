#!/usr/bin/env bash
# vmctl.sh — drive a quickemu Windows guest with NO window on the host. See docs/vm-testing.md.
#
#   vmctl.sh boot              revert the `clean` snapshot, boot with --display none + a share dir
#   vmctl.sh ping              guest-agent ping (prints {"return": {}} once Windows is up)
#   vmctl.sh shot <name>       monitor screendump -> $VMCTL_SHOTS/<name>.png
#   vmctl.sh keys <k> [...]    sendkey each argument, e.g. meta_l-r ret tab ctrl-shift-2
#   vmctl.sh type <text>       type text through sendkey (letters, digits, common punctuation)
#   vmctl.sh exec <cmd...>     run through the guest agent — as SYSTEM, so inspect only (vm-exec.sh)
#   vmctl.sh off               ACPI power-down, then wait until qemu has actually exited
#
# WHY this exists (2026-09-10): a before/after installer test needs a real user session driven
# step by step — the agent runs as SYSTEM, so installing through it tests a path no user takes —
# and a VM window on the host desktop is exactly what a session must not open unannounced.
# --display none still renders the Windows desktop for `screendump`, so keys + screenshots are
# enough to install, search the Start menu and photograph the results. It was written ad hoc in
# that session; keeping it saves the next one rebuilding the sendkey table.
#
# Environment (all optional):
#   VMCTL_VM     guest folder          (default ~/vms/windows-11)
#   VMCTL_SHARE  folder served as \\10.0.2.4\qemu in the guest (default ~/vms/share)
#   VMCTL_SHOTS  where screenshots go  (default /tmp/vmctl-shots)
# A bash script on purpose: Claude Code's Bash tool runs zsh here, which does not word-split
# variables and reads "$F[0]" as an array index (see ~/system/tools/claude-code-bash-shell.md).
set -euo pipefail

VM=${VMCTL_VM:-$HOME/vms/windows-11}
NAME=$(basename "$VM")
SHARE=${VMCTL_SHARE:-$HOME/vms/share}
SHOTS=${VMCTL_SHOTS:-/tmp/vmctl-shots}
MON=$VM/$NAME-monitor.socket
AGENT=$VM/$NAME-agent.sock
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
mkdir -p "$SHOTS"

mon() { ( echo "$1"; sleep "${2:-0.35}" ) | socat - "unix-connect:$MON" >/dev/null; }

keychar() {
  local c="$1"
  case "$c" in
    [a-z0-9]) echo "$c" ;;
    [A-Z]) echo "shift-$(echo "$c" | tr 'A-Z' 'a-z')" ;;
    ' ') echo spc ;; '.') echo dot ;; '-') echo minus ;; '_') echo shift-minus ;;
    '\') echo backslash ;; '/') echo slash ;; ':') echo shift-semicolon ;; '%') echo shift-5 ;;
    '$') echo shift-4 ;; '"') echo shift-apostrophe ;; "'") echo apostrophe ;; ',') echo comma ;;
    '=') echo equal ;; '(') echo shift-9 ;; ')') echo shift-0 ;; '*') echo shift-8 ;;
    *) echo "unsupported char: $c" >&2; return 1 ;;
  esac
}

running() { pgrep -f "[q]emu-system-x86_64.*-name $NAME" >/dev/null; }

case "${1:-}" in
  boot)
    if running; then echo "$NAME is already running" >&2; exit 1; fi
    (cd "$(dirname "$VM")" && quickemu --vm "$NAME.conf" --snapshot apply clean >/dev/null)
    (cd "$(dirname "$VM")" && nohup quickemu --vm "$NAME.conf" --display none --public-dir "$SHARE" > "$SHOTS/vm-boot.log" 2>&1 &)
    for _ in $(seq 1 120); do [ -S "$MON" ] && break; sleep 1; done
    [ -S "$MON" ] && echo "booting $NAME headless (share: $SHARE)" || { echo "monitor socket never appeared — see $SHOTS/vm-boot.log" >&2; exit 1; }
    ;;
  ping)
    ( echo '{"execute":"guest-ping"}'; sleep 2 ) | timeout 5 socat - "unix-connect:$AGENT" || true
    ;;
  shot)
    mon "screendump $SHOTS/$2.ppm" 1.2
    magick "$SHOTS/$2.ppm" "$SHOTS/$2.png" && rm -f "$SHOTS/$2.ppm" && echo "$SHOTS/$2.png"
    ;;
  keys)
    shift; for k in "$@"; do mon "sendkey $k" 0.35; done
    ;;
  type)
    shift; text="$*"
    for ((i = 0; i < ${#text}; i++)); do mon "sendkey $(keychar "${text:i:1}")" 0.12; done
    ;;
  exec)
    shift; bash "$HERE/vm-exec.sh" "$VM" "$@"
    ;;
  off)
    mon "system_powerdown" 1
    until ! running; do sleep 3; done
    echo "$NAME off"
    ;;
  *) sed -n '2,10p' "$0"; exit 2 ;;
esac
