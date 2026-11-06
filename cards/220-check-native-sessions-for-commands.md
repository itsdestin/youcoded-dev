---
id: 220
title: Check native sessions for commands stuck showing Running
stage: explore
tags: bug, native-runtime, needs-repro
branch: 220-check-native-sessions-for-commands
created: 2026-11-05
why: Destin, 2026-11-04: "commands keep getting stuck showing as running indefinitely. i've mostly noticed in claude code, but wouldnt be surprised if similar issues exist in native sessions." The Claude Code causes were fixed (youcoded session/stuck-background-commands: Monitor time-limit notices, helper commands on reopen and restart). Native sessions track shells by their own process records (exitUnknown / maybeStillRunning in background-commands.ts), not Claude Code notices, and were not checked. Also: a 'keep checking until…' loop with no time limit never ends there either.
---
Progress
Done: nothing yet.
Next: plan it.
Blocked: nothing.

Chats
