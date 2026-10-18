#!/usr/bin/env bash
# Existing per-user VM idle policy, now tracked with the VM tools. Never touches YouCoded processes.
# Pause unused guests after 30 min; resume only guests this watcher paused itself.
set -uo pipefail
VMS=${VM_HOME:-$HOME/vms}
IDLE_SECS=${VM_IDLE_SECS:-1800}
STATE=${XDG_RUNTIME_DIR:-/tmp}/vm-idle-pause
FOCUS_EVERY=30
focused=''; focused_at=0

log() { echo "$*"; }
mon() { ( echo "$2"; sleep "${3:-0.5}" ) | timeout 5 socat - "unix-connect:$VMS/$1/$1-monitor.socket" 2>/dev/null | tr -d '\r' | sed 's/\x1b\[[0-9;]*[A-Za-z]//g'; }
running_vms() {
  local pidf pid
  for pidf in "$VMS"/*/*.pid; do
    [ -f "$pidf" ] || continue
    pid=$(cat "$pidf" 2>/dev/null) || continue
    kill -0 "$pid" 2>/dev/null && echo "$(basename "$(dirname "$pidf")") $pid"
  done
}
ssh_port_from_cmdline() {
  # WHY both formats: the older guests bind tcp::PORT; Fedora intentionally binds 127.0.0.1.
  # Missing that form can pause an in-use Fedora guest and fail to resume it on SSH.
  grep -oE 'hostfwd=tcp:[^ ,]*:[0-9]+-:22' | sed -nE 's/.*:([0-9]+)-:22/\1/p' || true
}
ssh_port() { tr '\0' ' ' < "/proc/$1/cmdline" | ssh_port_from_cmdline; }
ssh_in_use() { [ -n "$1" ] && [ -n "$(ss -Htn state established "( sport = :$1 )" 2>/dev/null)" ]; }
vm_tool_running() { pgrep -f 'scripts/vm/(vm|vmctl|vm-exec|fedora)\.sh' >/dev/null; }
refresh_focus() {
  local now tag js id
  now=$(date +%s)
  if (( now - focused_at >= FOCUS_EVERY )); then
    tag="VMIDLE$$-$now"; js="$STATE/aw.js"
    echo "console.info('$tag ' + (workspace.activeWindow ? workspace.activeWindow.resourceClass + ' | ' + workspace.activeWindow.caption : ''));" > "$js"
    id=$(qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.loadScript "$js" vm-idle-probe 2>/dev/null)
    [ -n "$id" ] && qdbus6 org.kde.KWin "/Scripting/Script$id" org.kde.kwin.Script.run >/dev/null 2>&1
    qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript vm-idle-probe >/dev/null 2>&1
    focused=$(journalctl --user -q --no-pager --since -15s -g "$tag" -o cat 2>/dev/null | tail -1 | cut -d' ' -f2-)
    focused_at=$now
  fi
}
window_focused() {
  case "$focused" in
    *qemu*"$1"*|*QEMU*"$1"*|*spicy*"$1"*|*"Test machine: $1"*) return 0 ;;
  esac
  return 1
}
sync_clock() {
  local name=$1 port=$2 user
  case $name in
    windows-11)
      ( echo "{\"execute\":\"guest-set-time\",\"arguments\":{\"time\":$(date +%s%N)}}"; sleep 1 ) |
        timeout 5 socat - "unix-connect:$VMS/$name/$name-agent.sock" >/dev/null 2>&1 ;;
    ubuntu-24.04|macos-tahoe)
      [ "$name" = macos-tahoe ] && user=${VM_MAC_USER:-yctesting} || user=youcoded-testin
      local cmd="sudo -n date -s @$(date +%s)"
      [ "$name" = macos-tahoe ] && cmd="sudo -n date -u $(date -u +%m%d%H%M%Y.%S)"
      timeout 15 ssh -q -p "$port" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
        -o ConnectTimeout=5 -i "$VMS/vm-key" "$user@127.0.0.1" "$cmd" >/dev/null 2>&1 ;;
    fedora-44-kde)
      # WHY dedicated identity: Fedora's test account/key is not the legacy Ubuntu/macOS shared key.
      timeout 15 ssh -F /dev/null -q -p "$port" -o IdentitiesOnly=yes -o ForwardAgent=no \
        -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile="$VMS/$name/known_hosts" \
        -o ConnectTimeout=5 -i "$VMS/$name/id_ed25519" "keyboardtest@127.0.0.1" \
        "sudo -n date -s @$(date +%s)" >/dev/null 2>&1 ;;
  esac
}
resume_paused_vm() {
  local name=$1 port=$2
  # WHY verify before clearing: a failed cont must retain the marker so the next use retries.
  mon "$name" cont >/dev/null && mon "$name" 'info status' | grep -q 'VM status: running' || return 1
  rm -f "$STATE/$name.paused"
  log "$name resumed (in use again)"
  sync_clock "$name" "$port" &
}
main() {
  mkdir -p "$STATE"
  declare -A last_used
  log "started (idle limit ${IDLE_SECS}s)"
  while true; do
    local now tool name pid port used
    now=$(date +%s)
    tool=0; vm_tool_running && tool=1
    [ -n "$(running_vms)" ] && refresh_focus
    while read -r name pid; do
      [ -n "$name" ] || continue
      port=$(ssh_port "$pid")
      used=0
      if (( tool )) || ssh_in_use "$port"; then used=1
      elif [ ! -f "$STATE/$name.paused" ] && window_focused "$name"; then used=1; fi
      [ -z "${last_used[$name]:-}" ] && last_used[$name]=$now
      (( used )) && last_used[$name]=$now
      if [ -f "$STATE/$name.paused" ]; then
        if (( used )) && resume_paused_vm "$name" "$port"; then
          last_used[$name]=$now
        fi
      elif (( now - last_used[$name] >= IDLE_SECS )); then
        if mon "$name" 'info status' | grep -q 'VM status: running'; then
          mon "$name" stop >/dev/null
          touch "$STATE/$name.paused"
          log "$name paused after $(( (now - last_used[$name]) / 60 )) min unused"
        fi
      fi
    done < <(running_vms)
    for name in "${!last_used[@]}"; do
      running_vms | grep -q "^$name " || { unset 'last_used[$name]'; rm -f "$STATE/$name.paused"; }
    done
    sleep 2
  done
}
# WHY no import-time state or loop: function tests never create a watcher or query the real desktop.
if [[ ${BASH_SOURCE[0]} == "$0" ]]; then main "$@"; fi
