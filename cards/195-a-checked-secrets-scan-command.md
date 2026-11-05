---
id: 195
title: A checked secrets-scan command to run before every push
stage: explore
tags: dev-workspace
branch: 195-a-checked-secrets-scan-command
created: 2026-10-23
why: CLAUDE.md requires a secrets scan of all outgoing commits before every push, but no script exists and gitleaks is not installed on the z13; the queue-delivery session hand-rolled a regex scan five times and once let a push proceed past a (harmless) hit because the scan and push were chained with ';'. A script that wraps gitleaks when present and refuses (non-zero) otherwise, used as scan && push.
---
Progress
Done: RECURRED 2026-11-01 (analytics session): 'gitleaks … -q; echo …' — the scan failed on a bad flag, the echo reset the exit code, and the push went out unscanned (scanned clean afterwards)
Next: Build the checked scan-then-push script; this is the third recurrence
Blocked: nothing.

Chats
