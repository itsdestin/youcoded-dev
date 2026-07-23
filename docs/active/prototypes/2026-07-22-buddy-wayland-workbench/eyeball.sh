#!/usr/bin/env bash
# Human-eyes verification protocol — buddy-floater smear/backdrop-freeze.
#
# WHY eyes-only: spectacle records transparent regions as alpha-0 pixels, so no
# screenshot metric can distinguish healthy see-through from a stale frozen
# backdrop (FINDINGS.md Round 5b). You look; that's the instrument.
#
# WHAT CHANGED since v1: upstream research (Round 5c) found the transparency
# smear was FIXED in Electron 41.2.0 (PR #50541) — the app pins 41.0.3, one
# minor version before the fix. Steps 2-3 test exactly that. Step 4 tests the
# documented Chromium buffer-eviction freeze mechanism.
#
# Run from this directory:  bash eyeball.sh          (~5 min, one download wait)
set -u
EL=/home/destin/youcoded-dev/youcoded/desktop/node_modules/electron/dist/electron
cd "$(dirname "$0")"

pause() { echo; read -rp "--- $1  [Enter to continue] ---"; echo; }

echo "Pre-fetching Electron 43.2.0 (one-time ~120MB download, please wait)…"
npx -y electron@43.2.0 --version 2>/dev/null \
  || echo "  (pre-fetch reported an error — step 3 will retry and may still work)"

echo
echo "Each step opens the interactive workbench: DRAG the blue mascot around,"
echo "watch for (a) smear/trails behind it, (b) the see-through area freezing"
echo "on a stale image, (c) where in the window artifacts appear."
echo "Quit each window with its 'quit workbench' button."

pause "STEP 1 — BASELINE: Electron 41.0.3 (the version the app ships, pre-fix)"
"$EL" . --interactive >/dev/null 2>&1

pause "STEP 2 — FIX TEST: Electron 43.2.0 (current stable, contains #50541 fix). Same drags — smear gone?"
npx -y electron@43.2.0 . --interactive >/dev/null 2>&1

pause "STEP 3 — only if artifacts remained in step 2: eviction-freeze kill switch"
read -rp "Did step 2 still show freeze/smear? Run the flag test? [y/N] " yn
if [[ "${yn,,}" == "y" ]]; then
  npx -y electron@43.2.0 --disable-features=EvictionThrottlesDraw . --interactive >/dev/null 2>&1
fi

read -rp "STEP 4 (OPTIONAL) — KWin blur/contrast effects unloaded, 41.0.3 again. Run? [y/N] " yn
if [[ "${yn,,}" == "y" ]]; then
  qdbus6 org.kde.KWin /Effects org.kde.kwin.Effects.unloadEffect blur 2>/dev/null
  qdbus6 org.kde.KWin /Effects org.kde.kwin.Effects.unloadEffect contrast 2>/dev/null
  "$EL" . --interactive >/dev/null 2>&1
  qdbus6 org.kde.KWin /Effects org.kde.kwin.Effects.loadEffect blur 2>/dev/null
  qdbus6 org.kde.KWin /Effects org.kde.kwin.Effects.loadEffect contrast 2>/dev/null
  echo "  (effects restored)"
fi

read -rp "STEP 5 (OPTIONAL) — integer-scale test: desktop switches to 2.0x for ~40s, then back to 1.5x. Run? [y/N] " yn
if [[ "${yn,,}" == "y" ]]; then
  XDG_RUNTIME_DIR=${XDG_RUNTIME_DIR:-/run/user/1000} kscreen-doctor output.eDP-1.scale.2
  sleep 3
  "$EL" . --interactive >/dev/null 2>&1
  XDG_RUNTIME_DIR=${XDG_RUNTIME_DIR:-/run/user/1000} kscreen-doctor output.eDP-1.scale.1.5
  echo "  (scale restored to 1.5 — revert manually if needed: kscreen-doctor output.eDP-1.scale.1.5)"
fi

echo
echo "Done. Report per step: SMEARS? / BACKDROP FROZE? / CLEAN? and where."
