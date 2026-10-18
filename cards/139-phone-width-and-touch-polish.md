---
id: 139
title: Phone-width and touch screen polish: three groups
stage: planning
priority: P3
tags: user-interface, polish
branch: 139-phone-width-and-touch-polish
roadmap: user-interface: Phone-width and touch polish (3 groups).
created: 2026-10-15
summary: On narrow or touch screens, wording is unclear, text wraps badly, and hover-only buttons cannot be reached.
area: Devices & sync
side: screens
vision: everywhere.platforms.android
work: session/139-touch-session-scroll
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

Chats
- 2026-10-18 session/139-touch-session-scroll: Implemented touch scrolling in the active-session list; taps switch, mouse and header-pill drags preserved. Five new regressions; all 44 switcher tests and desktop verify passed, including screen/journey checks. Android JVM tests passed (36 per variant); APK packaging blocked by apk version-tool gate; physical touch unverified. App changes remain local and uncommitted.
- 2026-10-18 session/139-touch-session-scroll: Fix active-session list touch scrolling on Android and remote access: finger swipes scroll, taps switch; preserve mouse and header-pill drags. Five regression tests added; verification in progress.
- 2026-10-18 session/139-touch-session-scroll: chat started

From the old roadmap (user-interface, status confirmed, seen on all, last checked 2026-09-10)
Phone-width and touch polish (3 groups). (a) A tester on a phone browser (2026-09-10) hit: "Session" wording a student would not use, the "Deliverables" pill, "delivered" and mixed time formats on file rows, filter popup labels, Projects tabs shrinking to unreadable icons, "on disk · modified", a code box clipped with no scroll, a hover-only Magnify and hover-only Remove control, an inert Conversations card, and "224 B" file sizes; proposed wording in docs/archive/reviews/2026-09-10-remote-batch-2-3-ux-review-1.md; (b) the Cloud providers card wraps "Signed in as…" one word per line, the welcome form and session-strip form differ, and Create Session wraps onto two lines (report: docs/archive/reviews/2026-09-10-first-run-guide-ux-review-1.md); (c) on the touchscreen Z13 the bigger tap targets and hover-only buttons probably never switch on.

From the 2026-10-16 document sweep
- Phase F, P-17: phone-width clipping, edge fade on the quick-chip row and Marketplace rails, and touch hit areas. Source: docs/active/design/2026-08-25-ui-audit-findings.md
