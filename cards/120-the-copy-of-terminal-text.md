---
id: 120
title: The copy of terminal text kept for phones can be cut in the middle of a formatting code, so a phone that…
stage: planning
priority: P3
tags: remote-access, standalone, remote, performance
report: docs/archive/investigations/2026-10-04-performance-gap-review.md
branch: 120-the-copy-of-terminal-text
roadmap: remote-access: The copy of terminal text kept for phones can be cut in the
created: 2026-10-15
---
Progress
Done: nothing recorded.
Next: check it still happens.
Blocked: nothing recorded.

Chats

From the old roadmap (remote-access › standalone, status needs-verify, seen on remote, last checked 2026-10-04)
The copy of terminal text kept for phones can be cut in the middle of a formatting code, so a phone that joins late may replay a garbled start. This predates the 2026-10-04 terminal work; fixing it changes the offsets phones replay against, so it needs a phone check. Filed here because the fix is the phone protocol; the memory cost of that buffer is in perf
