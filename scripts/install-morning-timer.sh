#!/usr/bin/env bash
# Installs (or with --remove, removes) the morning-report timer for THIS user on THIS computer.
# Destin must confirm this: it changes system configuration (two files in ~/.config/systemd/user and one enabled timer).
#   bash scripts/install-morning-timer.sh            # prints what it would do, changes nothing
#   bash scripts/install-morning-timer.sh --yes      # does it
#   bash scripts/install-morning-timer.sh --remove   # disables and deletes the two files
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
dest="$HOME/.config/systemd/user"
units=(youcoded-morning-report.service youcoded-morning-report.timer)
mode="${1:-}"
if [ "$mode" = "--remove" ]; then
  systemctl --user disable --now youcoded-morning-report.timer || true
  for u in "${units[@]}"; do rm -f "$dest/$u"; done
  systemctl --user daemon-reload
  echo "removed the morning-report timer"; exit 0
fi
# WHY: the service runs the SHARED checkout's copy; before this work is merged that file is absent,
# the timer would fail silently and the briefing would only say STALE two days later.
target="$HOME/youcoded-dev/scripts/morning-report.mjs"
if [ ! -f "$target" ]; then echo "refusing: $target does not exist yet (install only after the morning-report work is merged)"; exit 1; fi
echo "This would:"
for u in "${units[@]}"; do echo "  copy $here/systemd/$u -> $dest/$u"; done
echo "  run: systemctl --user daemon-reload"
echo "  run: systemctl --user enable --now youcoded-morning-report.timer   (runs daily at about 06:30; no root)"
echo "It does not touch the app, any repo, or any other timer. Undo with: bash scripts/install-morning-timer.sh --remove"
[ "$mode" = "--yes" ] || { echo "(dry run; pass --yes to apply)"; exit 0; }
mkdir -p "$dest"
for u in "${units[@]}"; do cp "$here/systemd/$u" "$dest/$u"; done
systemctl --user daemon-reload
systemctl --user enable --now youcoded-morning-report.timer
systemctl --user list-timers youcoded-morning-report.timer --no-pager
