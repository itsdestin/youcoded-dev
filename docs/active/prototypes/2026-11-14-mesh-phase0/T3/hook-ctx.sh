#!/usr/bin/env bash
# Throwaway UserPromptSubmit hook: injects a codeword note, writes a marker file to prove it ran.
cat >/dev/null
date +%s >> "$(dirname "$0")/hook-ran.log"
printf '%s' '{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"MESH-NOTE: this chat is now hosted on Phone. The secret codeword is PINEAPPLE-7."}}'
