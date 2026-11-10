---
id: 195
title: A checked secrets-scan command to run before every push
stage: explore
priority: P2
tags: dev-workspace
branch: 195-a-checked-secrets-scan-command
created: 2026-10-23
why: CLAUDE.md requires a secrets scan of all outgoing commits before every push, but no script exists and gitleaks is not installed on the z13; the queue-delivery session hand-rolled a regex scan five times and once let a push proceed past a (harmless) hit because the scan and push were chained with ';'. A script that wraps gitleaks when present and refuses (non-zero) otherwise, used as scan && push.
---
Progress
Done: RECURRED 2026-11-05 (security-apparatus): 'gitleaks git -q' is not a flag; this time the bad flag stopped the push (nothing went out unscanned). Working form: gitleaks git --no-banner -l warn --log-opts=<range>.
Next: build the check so a push cannot run unless the scan passes.
Blocked: nothing.

Chats
