#!/usr/bin/env bash
# Appends one line per instruction-load event to ~/.claude/instructions-loaded.log.
#
# Usage: instructions-log.sh <matcher-label>
#
# WHY: this workspace's guidance is retrieval-limited, not content-limited, and
# until 2026-08-31 nothing here had ever OBSERVED which rules reach a session.
# Two open questions need this same instrument: (a) do path-scoped rules fire on
# files inside worktrees/<name>/ (the premise of the glob migration), and (b) why
# do harness-tools.md and native-permissions.md load at turn zero of sessions
# that touch none of their paths — four sightings, cause unexplained.
#
# Purely observational: reads stdin, writes a line, exits 0 always. A hook that
# can fail is a hook that can break a session, and this one is worth nothing if
# it costs anything.
#
# FOUR FIELDS, and each is load-bearing:
#   1  timestamp
#   2  the MATCHER LABEL, passed as $1 by settings.json. It is NOT read from the
#      payload: the InstructionsLoaded stdin schema is undocumented, so a field
#      named "reason" may or may not exist. Without this argument the two
#      registrations write indistinguishable lines and the turn-zero question
#      cannot be answered at all.
#   3  the session's PROJECT ROOT. This separates "the glob had the wrong shape"
#      from "the session was rooted inside the worktree and had no .claude/rules
#      at all" — a root ending in /worktrees/<name> means no glob rewrite would
#      have helped.
#   4  stdin, VERBATIM and newline-flattened. Deliberately reaches for no field
#      names. Record what the fields actually are here once you have seen one:
#        observed fields (2.1.252, measured 2026-08-31):
#          session_id, transcript_path, cwd, hook_event_name, file_path,
#          load_reason, memory_type
#        load_reason is the same vocabulary as the matcher (session_start /
#        path_glob_match); memory_type is User | Project; file_path is the
#        instruction file that loaded. Those three answer everything this hook
#        was built for, so prefer them over re-deriving anything.
set -uo pipefail
LABEL="${1:-unlabelled}"
LOG="${HOME}/.claude/instructions-loaded.log"
mkdir -p "$(dirname "$LOG")" 2>/dev/null
PAYLOAD="$(cat 2>/dev/null | tr '\n\t' '  ')"   # drained even if the write fails
printf '%s\t%s\t%s\t%s\n' \
  "$(date -Is)" "$LABEL" "${CLAUDE_PROJECT_DIR:-?}" "$PAYLOAD" \
  >> "$LOG" 2>/dev/null
exit 0
