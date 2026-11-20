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
work: session/round4-silent-places, session/134-phone-paste
---
Progress
Done: Phone-browser picture paste merged (PR #771, de7cbe952)
Next: Android app picture paste is a separate piece if wanted
Blocked: Nothing

Chats
- 2026-11-18 session/134-phone-paste: chat started
- 2026-11-14 session/round4-silent-places: chat started

From the old roadmap (user-interface, status confirmed, seen on all, last checked 2026-09-11)
Error messages still guess at causes in many places. The app-wide re-audit is done and batch 1 of 7 (seventeen messages that stated something false) shipped 2026-09-11. Left: Android and crash plumbing, one Report/Diagnose block, "couldn't load" shown as "none", silent action failures, look and wording, guards. Destin's rule: every error state offers an action

From the 2026-10-16 document sweep
- The report-a-bug flow has gaps: no catch for failures, logs are sent to the assistant before review, no attachments (E-01..E-08). Source: docs/archive/investigations/2026-09-08-error-states-development-audit.md

2026-10-18 release scope decision — deferred from 1.3.1 by Destin; see #29 for the current-build release scope and requirements that remain mandatory. This item stays open and is not marked fixed or shipped.
