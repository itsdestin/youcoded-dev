---
id: 135
title: Shared look: app hover hints, readable contrast, screens that don't match
stage: planning
priority: P2
tags: user-interface, bug
release: v1.3.2
report: docs/archive/investigations/2026-09-01-app-native-tooltips.md
branch: 135-browser-default-hover-tooltips-look
roadmap: user-interface: Browser-default hover tooltips look foreign to the app.
created: 2026-10-15
summary: Screens that don't match the shared look: plain browser hover hints, hard-to-read contrast, and controls that differ from the design guide.
area: Settings
side: screens
work: session/ui-consistency-audit
vision: yours.look.finetune
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

Chats

From the old roadmap (user-interface, status confirmed, seen on all, last checked 2026-09-10)
Browser-default hover tooltips look foreign to the app. The whole main chat screen is done (`<Tooltip>`, 82 hints); left are settings, the marketplace and project view (~148 of 236 hints). Settled: the ~1 s delay stays and there is no circled-i; every hint, long ones included, is a hover hint. Destin 2026-10-05 triage (roadmap-triage-2026-10-05#19): "want to deal with all in 1.3.2" (reverses the 2026-09-23 1.3.1-blocker call)

Merged in #137 "Hard-to-read text: four contrast problems"
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

See also #71: 71's unreadable amber 'Needs you' label on pale themes is one instance of 137's fixed-amber warning text that vanishes on pale themes.

Chats

From the old roadmap (user-interface, status confirmed, seen on all, last checked 2026-09-01)
Hard-to-read text: low contrast and unclear marks (4 things). (a) A busy red outlined button ("Stopping…") has dimmed text at 3.98:1 on Midnight, under 4.5:1; every such button shares it (report: docs/archive/reviews/2026-09-26-admin-password-ux-review-2.md); (b) the before/after file comparison on tool cards: in the light theme the + and − marks fail the minimum, pale pink and green rows are indistinguishable to a colour-blind reader, long lines break mid-word, the box ends on a sliced half-line, and "Expand (44 lines)" is a tiny grey target (report: docs/archive/reviews/2026-09-09-session-context-panel-ux-review-1.md); (c) warning text is one fixed amber that vanishes on pale themes (1.05:1 on Creme, 1.16:1 on Light) at 27 remaining places, each needing a look; (d) text fields inside cards match the card colour and read as labels (report: docs/active/investigations/2026-09-01-field-surface-invisible-on-inset.md).

Merged in #138 "Screens that do not match the shared look"
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

Chats

From the old roadmap (user-interface, status confirmed, seen on all, last checked 2026-09-01)
Shared-control drift: screens that do not match the shared look (7 things). (a) The design check still lists ~530 places that override a shared button, type a size by hand or use an off-theme colour, each group needing a design call; (b) about twenty clickable non-buttons have no hover and no keyboard path (command drawer, resume rows, model picker, settings rows and more), plus spreadsheet sheet tabs and six buddy buttons; (c) two bare-triangle "Show details" dropdowns in Backup & Sync and two bare "›" openers (Sync Log, chat system marker) — Destin: "I HATE the bare dropdowns with a chevron" (G-29); (d) the files filter panel draws a 12 px chip instead of the shared 14 px pill; (e) a lit filter chip is 2 px shorter than an idle one (design-guide G-14); (f) the specialists chip and session strip draw their own badges instead of the shared one.
