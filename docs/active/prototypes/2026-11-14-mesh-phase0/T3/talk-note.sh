#!/usr/bin/env bash
# Throwaway talk-only note: injected as hook context on every prompt.
cat >/dev/null
printf '%s' '{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"MESH-NOTE: this chat is now talk-only. The project files are not on this device. You cannot read, edit, create or run anything here. Answer from the conversation only and do not attempt any tool."}}'
