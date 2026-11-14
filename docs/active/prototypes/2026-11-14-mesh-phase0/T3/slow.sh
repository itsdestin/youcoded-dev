#!/usr/bin/env bash
# Throwaway: hold the first process mid-turn (PreToolUse) for 22 s so a second resume can overlap it.
cat >/dev/null; sleep 22; exit 0
