#!/usr/bin/env bash
# Find and kill a YouCoded dev overlay window that is full-screen, always-on-top,
# and grabbing input (no clickthrough), locking the desktop.
set -euo pipefail
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=$XDG_RUNTIME_DIR/bus}"

TMP=$(mktemp --suffix=.js)
cat > "$TMP" <<'JS'
var ws = workspace.windowList ? workspace.windowList() : workspace.clientList();
for (var i = 0; i < ws.length; i++) {
  var w = ws[i];
  // Offending signature: on-top, active, covers (nearly) the whole screen
  if (w.keepAbove && w.active && w.frameGeometry.width > 1400 && w.frameGeometry.height > 1000) {
    print("KILLPID|" + w.pid + "|" + w.caption);
  }
}
JS

QDBUS=$(command -v qdbus6 || command -v qdbus)
SNUM=$("$QDBUS" org.kde.KWin /Scripting org.kde.kwin.Scripting.loadScript "$TMP" stuck-overlay-killer)
"$QDBUS" org.kde.KWin /Scripting/Script"$SNUM" org.kde.kwin.Script.run
sleep 0.4
"$QDBUS" org.kde.KWin /Scripting/Script"$SNUM" org.kde.kwin.Script.stop || true
rm -f "$TMP"

PIDS=$(journalctl --user --since "5 seconds ago" -o cat 2>/dev/null | grep '^KILLPID|' | cut -d'|' -f2 | sort -u)
if [ -z "$PIDS" ]; then
  echo "No stuck overlay window found."
  exit 0
fi
for p in $PIDS; do
  echo "Killing stuck overlay pid $p"
  kill -TERM "$p" 2>/dev/null || true
  sleep 0.8
  kill -0 "$p" 2>/dev/null && kill -KILL "$p" 2>/dev/null || true
done
echo "Done."
