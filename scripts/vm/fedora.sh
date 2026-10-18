#!/usr/bin/env bash
# Fedora 44 KDE: disposable disk-only sessions. See docs/vm-testing.md.
# start [--headless] | status | stop [--keep] | save-ready | exec <cmd...>
# load <release|beta|tag|run:id|file> | shot <name> | view
set -euo pipefail
VMS=${VM_HOME:-$HOME/vms}
NAME=fedora-44-kde
DIR=$VMS/$NAME
SHOTS=${VM_SHOTS:-/tmp/vm-shots}
BASE=$DIR/disk.qcow2
VARS=$DIR/OVMF_VARS.4m.fd
SESSION=$DIR/session.qcow2
SVARS=$DIR/session-vars.fd
PIDFILE=$DIR/$NAME.pid
MON=$DIR/$NAME-monitor.socket
# WHY override: isolated command tests supply fixture firmware, never a host package dependency.
CODE=${VM_FEDORA_CODE:-/usr/share/edk2/x64/OVMF_CODE.4m.fd}
fail() { echo "$*" >&2; exit 1; }
usage() { echo 'fedora: start [--headless] | stop [--keep] | save-ready | status | exec <cmd...> | load <what> | shot <name> | view'; }
cmd=${1:-}; shift || true

# WHY one lock for lifecycle commands: parallel helpers must not reset/promote a disk being launched.
# No folder creation on a missing baseline, including accidental first starts.
[ -f "$BASE" ] && [ -f "$VARS" ] || fail "Missing Fedora baseline: $BASE and $VARS are required (no VM created)."
exec 9>"$DIR/.helper.lock"
flock -n 9 || fail 'Another Fedora helper is active; retry after it finishes.'

# WHY fail closed on PID reuse: never remove the pidfile or disk on an identity mismatch.
# We never signal a PID; stop uses this guest's monitor or its dedicated SSH connection.
running() {
  local pid args executable
  [ -f "$PIDFILE" ] || return 1
  read -r pid < "$PIDFILE"
  [[ "$pid" =~ ^[0-9]+$ ]] || fail 'Invalid Fedora pidfile; inspect it before proceeding.'
  args=$(ps -ww -p "$pid" -o args=) || return 1
  executable=${args%% *}
  [[ ( "$executable" = qemu-system-x86_64 || "$executable" = */qemu-system-x86_64 ) && " $args " == *" -name $NAME "* && "$args" == *"file=$SESSION,"* ]] || fail 'Fedora PID identity mismatch; refusing to touch pidfile or session.'
}
gssh() {
  ssh -F /dev/null -p 22227 -i "$DIR/id_ed25519" \
    -o IdentitiesOnly=yes -o ForwardAgent=no -o BatchMode=yes -o ConnectTimeout=5 \
    -o StrictHostKeyChecking=accept-new -o "UserKnownHostsFile=$DIR/known_hosts" keyboardtest@127.0.0.1 "$@"
}
wait_for_ssh() {
  # WHY positive readiness: a live QEMU PID precedes the installed guest's SSH service.
  local deadline=$((SECONDS + 90))
  while ((SECONDS < deadline)); do
    running || fail 'Fedora exited before SSH became ready; session retained.'
    if gssh true >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  fail 'Fedora is running but SSH is not ready; session retained. Check status/access before retrying.'
}
gscp() {
  scp -F /dev/null -P 22227 -i "$DIR/id_ed25519" \
    -o IdentitiesOnly=yes -o ForwardAgent=no -o BatchMode=yes -o ConnectTimeout=5 \
    -o StrictHostKeyChecking=accept-new -o "UserKnownHostsFile=$DIR/known_hosts" "$@"
}
safe_name() { [[ "$1" =~ ^[a-zA-Z0-9][a-zA-Z0-9._-]*$ ]] || fail 'Use a filename containing only letters, numbers, dots, underscores and hyphens.'; }

load_file() {
  local what=${1:?load requires release, beta, tag, run:id or a local file} pat=${VM_LINUX_FMT:-*.AppImage}
  local serve=$VMS/serve port=${VM_HTTP_PORT:-8010} incoming f base tag url cleanup
  local -a files
  [[ "$port" =~ ^[0-9]+$ ]] && ((port > 0 && port < 65536)) || fail 'Invalid VM_HTTP_PORT.'
  mkdir -p "$serve" "$SHOTS"
  incoming=$(mktemp -d "$serve/fedora-incoming.XXXXXX")
  # WHY a private staging folder: never serve the guest's SSH keys or unrelated host downloads.
  printf -v cleanup '%q' "$incoming"
  trap "rm -rf -- $cleanup" EXIT
  case "$what" in
    release) gh release download -R itsdestin/youcoded -p "$pat" -D "$incoming" ;;
    beta) tag=$(gh release list -R itsdestin/youcoded --json tagName,isPrerelease -q '[.[]|select(.isPrerelease)][0].tagName')
      [ -n "$tag" ] && [ "$tag" != null ] || fail 'No beta release found.'
      gh release download "$tag" -R itsdestin/youcoded -p "$pat" -D "$incoming" ;;
    run:*) gh run download "${what#run:}" -R itsdestin/youcoded -D "$incoming" ;;
    *) if [ -f "$what" ]; then cp -- "$what" "$incoming/";
       else gh release download "$what" -R itsdestin/youcoded -p "$pat" -D "$incoming"; fi ;;
  esac
  mapfile -d '' files < <(find "$incoming" -type f -name "$pat" -print0)
  [ "${#files[@]}" = 1 ] || fail "Expected exactly one installer matching $pat."
  f=${files[0]}; base=$(basename "$f"); safe_name "$base"
  mv -- "$f" "$serve/$base"
  # WHY loopback only: same native HTTP path as other guests, never a host-wide file server.
  if ! ss -ltn | grep -q "127.0.0.1:$port "; then
    setsid nohup python3 -m http.server "$port" --bind 127.0.0.1 -d "$serve" > "$SHOTS/http.log" 2>&1 < /dev/null 9>&- &
    sleep 1
  fi
  url="http://10.0.2.2:$port/$base"
  # WHY native xattr: stock KDE has no GVfs metadata backend; this writes user.xdg.origin.url.
  gssh "mkdir -p ~/Downloads && curl -fSL -o ~/Downloads/$base '$url' && gio set -t string ~/Downloads/$base xattr::xdg.origin.url '$url' && test -s ~/Downloads/$base"
  echo "Loaded $base into Fedora Downloads over HTTP (download URI recorded)."
}

case "$cmd" in
  start)
    [ "$#" = 0 ] || { [ "$#" = 1 ] && [ "$1" = --headless ]; } || fail 'start accepts only --headless.'
    if running; then wait_for_ssh; echo 'Fedora is already running and SSH-ready; use view or shot.'; exit 0; fi
    [ -f "$CODE" ] || fail "Required UEFI firmware not found: $CODE"
    [ -f "$DIR/id_ed25519" ] || fail 'Dedicated Fedora SSH identity is missing.'
    if [ -e "$SESSION" ] || [ -e "$SVARS" ]; then
      [ -f "$SESSION" ] && [ -f "$SVARS" ] || fail 'Incomplete retained session; inspect before explicitly discarding with stop.'
      echo 'Resuming retained Fedora session (stop discards it; stop --keep preserves it).'
    else
      qemu-img create -f qcow2 -F qcow2 -b "$BASE" "$SESSION"
      cp -- "$VARS" "$SVARS"
    fi
    display=gtk,gl=on
    [ "${1:-}" != --headless ] || display=egl-headless,rendernode=/dev/dri/renderD128
    # WHY daemonize rather than host process-name kills: QEMU owns this dedicated pidfile.
    qemu-system-x86_64 -name "$NAME" -machine q35 -enable-kvm -cpu host -smp 4 -m 8G \
      -drive "if=pflash,format=raw,readonly=on,file=$CODE" \
      -drive "if=pflash,format=raw,file=$SVARS" \
      -drive "file=$SESSION,format=qcow2,if=virtio,discard=unmap,detect-zeroes=unmap" \
      -device virtio-vga-gl -display "$display" \
      -netdev user,id=net0,hostfwd=tcp:127.0.0.1:22227-:22 -device virtio-net-pci,netdev=net0 \
      -monitor "unix:$MON,server=on,wait=off" -qmp "unix:$DIR/qmp.socket,server=on,wait=off" \
      -chardev "socket,path=$DIR/agent.sock,server=on,wait=off,id=agent0" \
      -device virtio-serial -device virtserialport,chardev=agent0,name=org.qemu.guest_agent.0 \
      -pidfile "$PIDFILE" -daemonize 9>&-
    running || fail 'QEMU returned without a matched running guest; retained session left intact.'
    wait_for_ssh
    echo "Fedora started and SSH-ready ($display); baseline unchanged."
    ;;
  status)
    if running; then echo 'Fedora: matched running QEMU'; else echo 'Fedora: not running'; fi
    if [ -f "$SESSION" ]; then echo 'Session: retained'; else echo 'Session: none (next start is clean)'; fi
    echo "Baseline: $BASE"
    [ ! -e "$DIR/disk.previous.qcow2" ] || echo 'Previous baseline retained: verify the new baseline boot before manual retirement.'
    ;;
  stop)
    [ "$#" = 0 ] || { [ "$#" = 1 ] && [ "$1" = --keep ]; } || fail 'stop accepts only --keep.'
    if running; then
      # WHY graceful shutdown for promotion: keep must flush guest filesystems before conversion.
      # Disposable tests can quit directly; neither path ever signals a host PID.
      if [ "${1:-}" = --keep ]; then gssh 'sudo -n systemctl poweroff --no-block';
      else printf 'quit\n' | timeout 5 socat - "unix-connect:$MON" >/dev/null; fi
      for ((i=0; i<120; i++)); do running || break; sleep 0.5; done
      if running; then fail 'Fedora has not stopped; session retained. No PID was signalled.'; fi
    fi
    rm -f -- "$PIDFILE"
    if [ "${1:-}" = --keep ]; then echo 'Fedora stopped; session retained for resume or save-ready.';
    else rm -f -- "$SESSION" "$SVARS"; echo 'Fedora stopped; session discarded, baseline unchanged.'; fi
    ;;
  save-ready)
    if running; then fail 'Fedora is running; use stop --keep first, then save-ready.'; fi
    [ -f "$SESSION" ] && [ -f "$SVARS" ] || fail 'No complete stopped session to promote.'
    previous=$DIR/disk.previous.qcow2
    [ ! -e "$previous" ] && [ ! -e "$DIR/OVMF_VARS.previous.fd" ] || fail 'Previous baseline backup exists; verify its replacement before manual retirement.'
    next=$DIR/disk.next.qcow2
    [ ! -e "$next" ] || fail 'disk.next.qcow2 already exists; inspect the interrupted promotion first.'
    # WHY compare BEFORE any rename: a failed conversion must never replace the working baseline.
    qemu-img convert -O qcow2 "$SESSION" "$next"
    qemu-img check "$next"
    qemu-img compare "$SESSION" "$next"
    cp -- "$VARS" "$DIR/OVMF_VARS.previous.fd"
    mv -- "$BASE" "$previous"
    mv -- "$next" "$BASE"
    cp -- "$SVARS" "$VARS"
    rm -f -- "$SESSION" "$SVARS" "$PIDFILE"
    echo 'Baseline promoted. Previous disk/firmware retained until a new baseline boot is verified.'
    ;;
  exec) [ "$#" -gt 0 ] || fail 'exec requires a command.'; gssh "$@" ;;
  shot)
    name=${1:-shot}; safe_name "$name"
    mkdir -p "$SHOTS"
    # WHY Spectacle: virtio GL has no QMP screendump surface. Keep guest/host temp names private.
    remote=$(gssh 'mktemp /tmp/youcoded-shot.XXXXXXXX.png')
    [[ "$remote" =~ ^/tmp/youcoded-shot\.[a-zA-Z0-9]+\.png$ ]] || fail 'Invalid guest screenshot path.'
    localshot=$(mktemp "$SHOTS/.fedora-shot.XXXXXXXX.png")
    trap 'rm -f -- "$localshot"; gssh "rm -f -- $remote" >/dev/null 2>&1 || true' EXIT
    gssh "env XDG_RUNTIME_DIR=/run/user/1000 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus WAYLAND_DISPLAY=wayland-0 XDG_SESSION_TYPE=wayland QT_QPA_PLATFORM=wayland spectacle -b -n -f -o $remote >/dev/null 2>&1 && test -s $remote"
    gscp "keyboardtest@127.0.0.1:$remote" "$localshot"
    [ -s "$localshot" ] || fail 'Guest screenshot missing or empty.'
    mv -- "$localshot" "$SHOTS/$name.png"
    echo "$SHOTS/$name.png"
    ;;
  view)
    running || fail 'Fedora is not running.'
    echo 'Normal start already has a GTK window. Headless EGL cannot reattach GTK; use shot, or stop --keep then start without --headless.'
    ;;
  load) load_file "$@" ;;
  *) usage; exit 2 ;;
esac
