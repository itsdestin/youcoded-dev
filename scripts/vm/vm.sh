#!/usr/bin/env bash
# vm.sh — fast hands-on install testing in the quickemu guests. See docs/vm-testing.md → "Quick loop".
#
#   vm.sh <win|ubuntu|mac|tahoe> start [--headless]   restore the saved "ready" desktop (seconds) and open
#                                               a window for Destin; cold-boots `clean` if no ready state
#   vm.sh <vm> load <what>                      put an installer in the guest user's Downloads, marked
#                                               as downloaded from the internet. <what> is one of:
#                                                 release | beta | <tag, e.g. v1.3.0> | run:<CI run id> | <file path>
#   vm.sh <vm> view                             (re)open the window on a running guest
#   vm.sh <vm> shot <name>                      screenshot -> $VM_SHOTS/<name>.png
#   vm.sh <vm> exec <cmd...>                    run a command in the guest (Windows: as SYSTEM via the agent)
#   vm.sh <vm> stop                             throw the session away (no save; next start is clean again)
#   vm.sh <vm> save-ready                       one-time: snapshot the running guest as the new "ready" state
#
# WHY this exists (2026-10-01, Destin): the old loop was a cold boot (~50 s + login) per reset and a
# shared-folder copy that (a) needed an smbd restart to see new files and (b) skipped the
# "downloaded from the internet" mark, so SmartScreen / Gatekeeper — the exact first-run wall users
# hit — never appeared. This restores a running, logged-in desktop from a RAM snapshot and fetches
# the installer over HTTP into Downloads with the internet mark applied.
#
# A bash script on purpose: Claude Code's Bash tool runs zsh here (see vmctl.sh's header).
set -euo pipefail

VMS=${VM_HOME:-$HOME/vms}
SHOTS=${VM_SHOTS:-/tmp/vm-shots}
HTTP_PORT=${VM_HTTP_PORT:-8010}
SERVE=$VMS/serve           # WHY a separate dir from ~/vms/share: only files we hand out, nothing else
REPO=itsdestin/youcoded
mkdir -p "$SHOTS" "$SERVE"

case "${1:-}" in
  win|windows) NAME=windows-11; OS=win ;;
  ubuntu|linux) NAME=ubuntu-24.04; OS=linux ;;
  mac|macos) NAME=macos-sonoma; OS=mac ;;
  # WHY a second Mac: Sonoma (14) predates Liquid Glass and the icon looks (Default/Dark/Clear/
  # Tinted); only macOS 26 shows the real app icon and the Dock rules (brand rounds 27–31).
  tahoe|mac26) NAME=macos-tahoe; OS=mac ;;
  *) sed -n '2,15p' "$0"; exit 2 ;;
esac
shift
CMD=${1:-}; shift || true

DIR=$VMS/$NAME
MON=$DIR/$NAME-monitor.socket
AGENT=$DIR/$NAME-agent.sock
STATE=$DIR/ready.state     # RAM + device state; paired with the disk snapshot named "ready"
LAUNCH=$DIR/vm-sh-launch.sh
SPICE_PORT=$(awk -F, '$1=="spice"{print $2}' "$DIR/$NAME.ports" 2>/dev/null || true)

mon() { ( echo "$1"; sleep "${2:-0.5}" ) | socat - "unix-connect:$MON" 2>/dev/null | tr -d '\r' | sed 's/\x1b\[[0-9;]*[A-Za-z]//g'; }
running() { [ -f "$DIR/$NAME.pid" ] && kill -0 "$(cat "$DIR/$NAME.pid")" 2>/dev/null; }
has_snapshot() { qemu-img snapshot -l "$DIR/disk.qcow2" | awk '{print $2}' | grep -qx "$1"; }

# The guest SSH port quickemu forwards (22220 on Windows/mac, 22221 Ubuntu).
# WHY fixed ports: quickemu hands Windows and macOS the same 22220, so the second guest to start
# dies with "Could not set up host forwarding rule". make_launch rewrites the forward to match.
case $OS in win) SSH_PORT=22220 ;; linux) SSH_PORT=22221 ;; mac) SSH_PORT=22222 ;; esac
[ "$NAME" = macos-tahoe ] && SSH_PORT=22223   # its own port, so both Macs can run at once
gssh() { ssh -q -p "$SSH_PORT" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=5 \
           -i "$VMS/vm-key" "$GUEST_USER@127.0.0.1" "$@"; }
case $OS in win) GUEST_USER=Quickemu ;; linux) GUEST_USER=youcoded-testin ;; mac) GUEST_USER=${VM_MAC_USER:-destinmoss} ;; esac

# Build our own launch script from the one quickemu last generated.
# WHY: a RAM snapshot needs a migratable CPU model and a stable command line. quickemu's
# Windows CPU line has +invtsc / hv_passthrough / migratable=no, each of which blocks it
# ("State blocked by non-migratable CPU device"), and 32 GB of guest RAM would make every
# saved state huge. The Mac's virtio-sound card is also unmigratable ("non-migratable device
# virtio-sound-device"), so it becomes the Intel HDA card Windows already uses. The edits are
# applied identically on save and restore.
make_launch() {
  local src=$DIR/$NAME.sh
  # WHY the Mac keeps its own window: it has no SPICE server and its only real speed lever is
  # QEMU's GTK window with GL on (docs/vm-testing.md → macOS performance). Windows/Ubuntu run
  # without a window and get a SPICE viewer, which can be closed and reopened freely.
  local display_sed='s/^\(\s*-display \)[^ ]*/\1none/'
  [ "$OS" = mac ] && [ -z "${HEADLESS:-}" ] && display_sed='s/^\(\s*-display \)[^ ]*/\1gtk,grab-on-hover=on,zoom-to-fit=on,gl=on/'

  [ -f "$src" ] || { echo "no $src — run quickemu once for $NAME first" >&2; exit 1; }
  sed -e 's/,+invtsc//; s/,migratable=no//' \
      -e 's/,hv_passthrough/,hv_relaxed,hv_vapic,hv_spinlocks=0x1fff,hv_vpindex,hv_runtime,hv_time,hv_synic,hv_stimer,hv_frequencies,hv_reset/' \
      -e 's/^\(\s*-m \)[0-9]*G/\18G/' \
      -e "$display_sed" \
      -e "s/hostfwd=tcp::[0-9]*-:22/hostfwd=tcp::$SSH_PORT-:22/" \
      -e 's/-device virtio-sound-pci,audiodev=audio0/-device intel-hda -device hda-duplex,audiodev=audio0/' \
      -e 's/ 2>\/dev\/null$/ \\/' "$src" > "$LAUNCH"
  # WHY -incoming last: restore = same command line + "-incoming defer", then migrate_incoming.
  printf '    "$@" 2>/dev/null\n' >> "$LAUNCH"
  chmod +x "$LAUNCH"
}

open_view() {
  [ -n "${HEADLESS:-}" ] && return 0
  [ "$OS" = mac ] && return 0   # its GTK window opened with the guest
  [ -n "$SPICE_PORT" ] || { echo "no spice port for $NAME"; return 0; }
  # WHY setsid/nohup: the window must outlive this command, and closing it must not stop the guest.
  setsid nohup spicy -h 127.0.0.1 -p "$SPICE_PORT" --title "Test machine: $NAME" >/dev/null 2>&1 < /dev/null &
}

sync_clock() {
  # WHY: a restored guest wakes up believing it is still the moment it was saved. TLS sign-ins,
  # update checks and certificate validity all fail on a stale clock.
  case $OS in
    # WHY an explicit time: guest-set-time with no argument copies the guest's own RTC, which the
    # restore brought back stale too (measured 2026-10-01: still 590 s behind afterwards).
    win) ( echo "{\"execute\":\"guest-set-time\",\"arguments\":{\"time\":$(date +%s%N)}}"; sleep 1 ) | timeout 5 socat - "unix-connect:$AGENT" >/dev/null 2>&1 || true ;;
    # WHY ssh for Linux/mac: quickemu gives only the Windows guest an agent channel.
    linux) gssh "sudo -n date -s @$(date +%s)" >/dev/null 2>&1 || true ;;
    mac) gssh "sudo -n date -u $(date -u +%m%d%H%M%Y.%S)" >/dev/null 2>&1 || true ;;
  esac
}

wait_monitor() { for _ in $(seq 1 120); do [ -S "$MON" ] && return 0; sleep 0.5; done; echo "monitor never appeared" >&2; exit 1; }

case "$CMD" in
  start)
    [ "${1:-}" = --headless ] && HEADLESS=1
    if running; then echo "$NAME is already running"; open_view; exit 0; fi
    cd "$VMS"
    if [ -f "$STATE" ] && has_snapshot ready; then
      qemu-img snapshot -a ready "$DIR/disk.qcow2"
      make_launch
      setsid nohup bash "$LAUNCH" -incoming defer > "$SHOTS/$NAME-launch.log" 2>&1 < /dev/null &
      wait_monitor
      mon "migrate_incoming file:$STATE" 1 >/dev/null
      for _ in $(seq 1 120); do mon "info status" 0.3 | grep -q "paused (prelaunch)\|paused (inmigrate)" || break; sleep 0.5; done
      mon "cont" 0.5 >/dev/null
      sync_clock
      echo "$NAME restored to the ready desktop"
    else
      # WHY no revert to `clean` here: with no ready state yet this is setup mode, and setup
      # (auto-login, remote access) happens across restarts. Reverting wiped it once (2026-10-01).
      make_launch
      setsid nohup bash "$LAUNCH" > "$SHOTS/$NAME-launch.log" 2>&1 < /dev/null &
      wait_monitor
      echo "$NAME cold-booting its current disk (no ready state yet — set it up, then save-ready)"
    fi
    open_view
    ;;

  save-ready)
    running || { echo "$NAME is not running" >&2; exit 1; }
    mon "stop" 0.5 >/dev/null
    rm -f "$STATE.tmp"
    err=$(mon "migrate file:$STATE.tmp" 1 | grep -i "error\|blocked" || true)
    # WHY check the reply: a blocked migration never reports "failed" in info migrate, it just
    # refuses up front — without this the wait loop below spins for ten minutes.
    [ -n "$err" ] && { echo "$err" >&2; mon "cont" >/dev/null; exit 1; }
    for _ in $(seq 1 600); do s=$(mon "info migrate" 0.4); echo "$s" | grep -qi "status:[[:space:]]*completed" && break
      echo "$s" | grep -qi "status:[[:space:]]*failed" && { echo "$s" >&2; mon "cont"; exit 1; }; sleep 1; done
    mon "quit" 1 >/dev/null
    for _ in $(seq 1 60); do running || break; sleep 0.5; done
    has_snapshot ready && qemu-img snapshot -d ready "$DIR/disk.qcow2"
    qemu-img snapshot -c ready "$DIR/disk.qcow2"
    mv "$STATE.tmp" "$STATE"
    echo "saved ready state ($(du -h "$STATE" | cut -f1)); $NAME is now off"
    ;;

  load)
    what=${1:?"load what? release | beta | <tag> | run:<id> | <file>"}
    case $OS in win) pat='YouCoded-Installer-*.exe' ;; mac) pat='YouCoded-Installer-*-x64.dmg' ;; linux) pat="${VM_LINUX_FMT:-*.AppImage}" ;; esac
    rm -rf "$SERVE/incoming"; mkdir -p "$SERVE/incoming"
    case "$what" in
      release) gh release download -R $REPO -p "$pat" -D "$SERVE/incoming" ;;
      beta) tag=$(gh release list -R $REPO --json tagName,isPrerelease -q '[.[]|select(.isPrerelease)][0].tagName')
            gh release download "$tag" -R $REPO -p "$pat" -D "$SERVE/incoming" ;;
      run:*) gh run download "${what#run:}" -R $REPO -D "$SERVE/incoming"
             find "$SERVE/incoming" -type f ! -name "$pat" -delete ;;
      v*|[0-9]*) gh release download "$what" -R $REPO -p "$pat" -D "$SERVE/incoming" ;;
      *) cp "$what" "$SERVE/incoming/" ;;
    esac
    f=$(find "$SERVE/incoming" -type f -name "$pat" | head -1)
    [ -n "$f" ] || f=$(find "$SERVE/incoming" -type f | head -1)
    [ -n "$f" ] || { echo "nothing matched $pat" >&2; exit 1; }
    base=$(basename "$f"); mv "$f" "$SERVE/$base"
    # WHY HTTP from 10.0.2.2: the guest-side copy from the SMB share silently copied nothing
    # (2026-09-10), and only a real download can carry the internet mark.
    if ! ss -ltn | grep -q ":$HTTP_PORT "; then
      setsid nohup python3 -m http.server "$HTTP_PORT" --bind 127.0.0.1 -d "$SERVE" > "$SHOTS/http.log" 2>&1 < /dev/null &
      sleep 1
    fi
    url="http://10.0.2.2:$HTTP_PORT/$base"
    case $OS in
      win)
        # WHY the Zone.Identifier stream: it is the "Mark of the Web" a browser download carries;
        # SmartScreen only checks marked files. Runs as SYSTEM, so write into the user's profile.
        # WHY ProgressPreference: PowerShell's progress bar slows Invoke-WebRequest roughly tenfold.
        ps="\$ProgressPreference='SilentlyContinue'; \$d='C:\\Users\\$GUEST_USER\\Downloads\\$base'; Invoke-WebRequest -UseBasicParsing '$url' -OutFile \$d; Set-Content -Path \$d -Stream Zone.Identifier -Value \"[ZoneTransfer]\`r\`nZoneId=3\`r\`nHostUrl=https://youcoded.ai/\"; (Get-Item \$d).Length"
        out=$(VM_EXEC_TIMEOUT=900 bash "$(dirname "$0")/vm-exec.sh" "$DIR" powershell.exe -NoProfile -Command "$ps")
        echo "$out" | grep -q "^exitcode: 0" || { echo "$out" >&2; echo "load failed" >&2; exit 1; } ;;
      linux)
        # WHY wget: stock Ubuntu desktop ships without curl.
        gssh "wget -q -O ~/Downloads/$base '$url' && ls -l ~/Downloads/$base" ;;
      mac)
        # WHY the quarantine xattr: Gatekeeper only assesses files a browser marked as downloaded.
        gssh "curl -fsSL -o ~/Downloads/$base '$url' && xattr -w com.apple.quarantine '0081;$(printf '%x' "$(date +%s)");Safari;' ~/Downloads/$base && ls -l ~/Downloads/$base" ;;
    esac
    echo "loaded $base into $NAME's Downloads (marked as an internet download)"
    ;;

  view) running || { echo "$NAME is not running" >&2; exit 1; }; open_view ;;

  shot)
    mon "screendump $SHOTS/${1:-shot}.ppm" 1.5 >/dev/null
    magick "$SHOTS/${1:-shot}.ppm" "$SHOTS/${1:-shot}.png" && rm -f "$SHOTS/${1:-shot}.ppm" && echo "$SHOTS/${1:-shot}.png"
    ;;

  exec)
    case $OS in win) bash "$(dirname "$0")/vm-exec.sh" "$DIR" "$@" ;; *) gssh "$@" ;; esac ;;

  stop)
    running || { echo "$NAME is not running"; exit 0; }
    mon "quit" 1 >/dev/null
    for _ in $(seq 1 60); do running || break; sleep 0.5; done
    echo "$NAME stopped (session discarded)"
    ;;

  *) sed -n '2,15p' "$0"; exit 2 ;;
esac
