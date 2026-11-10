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
Done: 2026-11-10 (release-safety session), checked on YouCoded's own engine. What the screen shows is correct in both cases: a command from before a restart shows its saved outcome, 'Stopped when the app quit', or 'May be running' (left as is, on purpose); a never-ending command shows Running, is stopped when its chat closes or the app quits, and none was left behind in a live test. ONE FAULT FOUND AND FIXED on branch session/release-safety (app repo, not merged): the assistant itself was told 'No background command' about a command from before a restart; it now gets the saved outcome and can stop one that is provably still this app's. Nothing on screen changes. Tested live in a dev copy: reload keeps Running and Stop works; after a forced kill the assistant answered truthfully; a normal quit left no command running.
Next: Destin: merge decision for session/release-safety. Not staged live: a command that survives a crash and is re-attached as Running (in the test the forced kill took the command down too); covered by unit tests only. Small leftovers, not built: (1) commands from before a restart do not count toward the limit on running commands; (2) for a moment right after reopening a chat the assistant could ask about an old command before the saved list has loaded.
Blocked: Waiting for Destin's word to merge.

Chats
