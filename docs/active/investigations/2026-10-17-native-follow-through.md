---
status: active
work_item: 148
---
# Native follow-through: investigation and regression coverage

## Observed symptom
In this session, the assistant repeatedly said researchers were running without checking current task state. A later Task list reported no specialists or background commands running or awaiting delivery. The user correctly identified the unsupported status claim and premature handoffs.

## What was established
The source investigation traced background resume, delegation ledger transitions, report injection, confirmation, and Task.list. A deterministic test was added to `youcoded/desktop/tests/native-session-host.test.ts`: `a resumed interrupted task delivers its report before it disappears from the task list`.

The test uses a real host, child header and ledger, with gated model responses. It checks running status, actual report injection into the parent transcript, report-pending status while the parent's notice turn is in flight, then absence from Task.list only after delivery confirmation. This tested path passes without changing production code. Existing related resume, ledger and specialist suites also passed in the worker's run.

This is regression coverage, **not a reproduced/fixed original incident**. It does not establish renderer visibility, cloud model comprehension, or the lifecycle of this conversation's execution service. Do not label the original bug fixed or change loop policy based on this test alone.

## Important observation during implementation
Two implementation specialists reached `finished — report delivery pending` in Task.list without their reports appearing in the parent transcript at that point. Foreground resume requests returned their reports. This establishes a pending-delivery state was visible to the parent tool; it does not prove whether delayed injection, the parent still being active, or another runtime boundary caused the delay. No live-app inspection was performed.

## Next useful evidence
The lab now runs the production NativeSessionHost and preserves native events and request attempts. A capped live behavioral evaluation should pair the actual work-state timeline with the model's final claims and count unnecessary user nudges. A runtime-level reproduction should identify the exact failed boundary before any fix. Do not add prose regexes that automatically continue all replies or require status polling on every turn: both would change user behavior and incur costs without an established cause.
