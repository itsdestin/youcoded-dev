---
id: 195
title: A checked secrets-scan command to run before every push
stage: merged
priority: P2
tags: dev-workspace
branch: 195-a-checked-secrets-scan-command
created: 2026-10-23
why: CLAUDE.md requires a secrets scan of all outgoing commits before every push, but no script exists and gitleaks is not installed on the z13; the queue-delivery session hand-rolled a regex scan five times and once let a push proceed past a (harmless) hit because the scan and push were chained with ';'. A script that wraps gitleaks when present and refuses (non-zero) otherwise, used as scan && push.
---
Progress
Done: Landed on master 2026-11-10 (workspace PR #356): scripts/safe-push.sh scans every commit GitHub does not have yet and pushes only if the scan passes; refuses when the scanner is missing or errors, on master, and on any force or extra option. An independent review found and we fixed a way a deleted GitHub branch could make it skip the scan. 10 tests. Used for every push of this batch.
Next: Destin: merge the branch. Optional: a one-line pointer in CLAUDE.md so sessions use it by default.
Blocked: nothing.

Chats
