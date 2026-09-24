#!/usr/bin/env bash
# Emergency recovery: find and kill a stuck YouCoded DEV overlay window (full-screen,
# always-on-top, grabbing input with no clickthrough) that is locking the desktop.
#
# SAFETY CHECK (2026-09-23): KWin can only tell us a window is on-top, active and large —
# that description also matches Destin's real, built app (e.g. a maximized buddy window).
# Before killing anything, this script reads /proc/<pid>/exe (the program file) and
# REFUSES to kill any pid whose program is not inside this dev workspace
# ($HOME/youcoded-dev — the main checkout or one of its worktrees, per run-dev.sh, which
# always `cd`s into <checkout>/desktop before `npm run dev`). Destin's installed app runs
# from a packaged location outside this tree, so it can never match and is never touched.
set -euo pipefail
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=$XDG_RUNTIME_DIR/bus}"

# Every youcoded-dev checkout (main + worktrees) lives under this tree; a dev Electron's
# cwd/cmdline always points inside it. The built app never does. See the SAFETY CHECK note above.
WORKSPACE_ROOT="$HOME/youcoded-dev"

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

# WHY: KWin's signature (on-top + active + large) cannot tell a dev overlay from
# Destin's live built app — confirmed on 2026-09-23 this script would have force-closed
# ANY window matching that shape. Refuse to kill anything whose process isn't rooted in
# this dev workspace, and say so, instead of silently killing the wrong window.
#
# The test is the EXECUTABLE's location, not the working folder: a dev window runs the
# Electron binary from a checkout's node_modules (under $WORKSPACE_ROOT), the built app
# runs /opt/YouCoded/youcoded. A working folder is not proof — the built app launched
# from a terminal sitting in ~/youcoded-dev would inherit that cwd and look like a dev copy.
is_dev_instance() {
  local pid="$1" exe
  exe="$(readlink -f "/proc/$pid/exe" 2>/dev/null || true)"
  [[ -n "$exe" && "$exe" == "$WORKSPACE_ROOT"/* ]]
}

KILLED=0
for p in $PIDS; do
  if ! is_dev_instance "$p"; then
    echo "REFUSING to kill pid $p: it is not a YouCoded dev instance (its program is not inside $WORKSPACE_ROOT)." >&2
    echo "  This may be Destin's live built app — leaving it running. If it really is a stuck dev" >&2
    echo "  window, check /proc/$p/exe by hand before killing it yourself." >&2
    continue
  fi
  echo "Killing stuck overlay pid $p (dev instance, program under $WORKSPACE_ROOT)"
  kill -TERM "$p" 2>/dev/null || true
  sleep 0.8
  kill -0 "$p" 2>/dev/null && kill -KILL "$p" 2>/dev/null || true
  KILLED=1
done

if [ "$KILLED" = "1" ]; then
  echo "Done."
else
  echo "No dev-instance overlay matched — nothing was killed."
fi
