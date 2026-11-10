---
id: 134
title: Error messages still guess at causes
stage: planning
priority: P1
tags: user-interface, bug
report: docs/active/investigations/2026-09-10-error-inventory/README.md
branch: 134-error-messages-still-guess-at
roadmap: user-interface: Error messages still guess at causes in many places.
created: 2026-10-15
summary: Many error messages still state a guessed cause or offer no next step; six of seven fix batches remain.
area: Settings
side: both
---
Progress
Done: Batch 1 (17 messages that said something false, such as a backup 'Uploaded!' after it failed) is merged on master (youcoded 72bd4093, 2026-09-11) and reached the 1.3.1 beta line. Error boxes now draw one shared look with the action inside, retry buttons all read 'Try again', and the crash screen offers Report bug and Details (b92a6b7ec, 38efb4786, c8662714a).
Next: batches 2 onward — silent failures where a screen shows 'none' after a failed load (16 places still do this), empty catch blocks that swallow button errors (about 73 in the desktop renderer, count not exact), the phone's error paths, and the remaining report-a-bug gaps.
Blocked: nothing recorded.

Chats

From the old roadmap (user-interface, status confirmed, seen on all, last checked 2026-09-11)
Error messages still guess at causes in many places. The app-wide re-audit is done and batch 1 of 7 (seventeen messages that stated something false) shipped 2026-09-11. Left: Android and crash plumbing, one Report/Diagnose block, "couldn't load" shown as "none", silent action failures, look and wording, guards. Destin's rule: every error state offers an action

From the 2026-10-16 document sweep
- The report-a-bug flow has gaps: no catch for failures, logs are sent to the assistant before review, no attachments (E-01..E-08). Source: docs/archive/investigations/2026-09-08-error-states-development-audit.md

2026-10-18 release scope decision — deferred from 1.3.1 by Destin; see #29 for the current-build release scope and requirements that remain mandatory. This item stays open and is not marked fixed or shipped.
