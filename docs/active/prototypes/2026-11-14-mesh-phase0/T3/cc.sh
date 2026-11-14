#!/usr/bin/env bash
# Throwaway wrapper: run the real claude CLI with the parent app's nested-run variables removed.
# WHY: the lead session runs inside YouCoded and exports CLAUDECODE etc.; they make nested runs
# report themselves as children of the app session.
# Usage: cc.sh <cwd> [claude args...]   (set CLAUDE_CONFIG_DIR in the caller env for second-home tests)
cwd="$1"; shift
cd "$cwd" || exit 1
exec env -u CLAUDECODE -u CLAUDE_CODE_SESSION_ID -u CLAUDE_CODE_CHILD_SESSION -u CLAUDE_CODE_SESSION_ATTENDED \
  -u CLAUDE_CODE_ENTRYPOINT -u CLAUDE_CODE_MESSAGING_SOCKET -u CLAUDE_CODE_MESSAGING_TOKEN \
  -u CLAUDE_DESKTOP_SESSION_ID -u CLAUDE_DESKTOP_PIPE -u CLAUDE_PID -u CLAUDE_CODE_EXECPATH \
  -u CLAUDE_CODE_SUBAGENT_MODEL \
  claude "$@"
