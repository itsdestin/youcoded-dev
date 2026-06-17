#!/bin/bash
# Run a dev instance of YouCoded alongside your built/installed app.
# See docs/local-dev.md for what this isolates and what it shares.
set -euo pipefail

cd "$(dirname "$0")/.."

# Shifts every port youcoded controls (Vite 5173 → 5223, remote 9900 → 9950).
# First dev instance uses offset 50; a second concurrent dev could use 100, etc.
export YOUCODED_PORT_OFFSET="${YOUCODED_PORT_OFFSET:-50}"

# Splits Electron userData → %APPDATA%/youcoded-dev/ so dev's localStorage,
# window bounds, and cache don't clobber the built app's.
export YOUCODED_PROFILE=dev

# Belt-and-suspenders: if this script is run from inside a Claude Code session
# (e.g. via a Claude session's Bash tool), the shell carries CC's own session
# markers. Inherited by the dev app and passed to the `claude` it spawns, they
# make that child run as a NESTED session, which writes no transcript → chat
# view stays empty (responses only show in terminal view). The real fix lives in
# the app (desktop/src/main/pty-worker.js strips these at spawn); unsetting them
# here too keeps the dev launch clean regardless of app version.
# See docs/PITFALLS.md → "Local Dev & Launch Environment".
unset CLAUDECODE CLAUDE_CODE_CHILD_SESSION CLAUDE_CODE_SESSION_ID \
      CLAUDE_CODE_ENTRYPOINT CLAUDE_CODE_EXECPATH CLAUDE_EFFORT \
      CLAUDE_DESKTOP_SESSION_ID CLAUDE_DESKTOP_PIPE

echo "Starting YouCoded dev (port offset: $YOUCODED_PORT_OFFSET)..."
echo "  Vite:          http://localhost:$((5173 + YOUCODED_PORT_OFFSET))"
echo "  Remote server: port $((9900 + YOUCODED_PORT_OFFSET)) (if enabled in dev)"
echo ""
cd youcoded/desktop
npm run dev
