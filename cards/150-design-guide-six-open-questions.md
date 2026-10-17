---
id: 150
title: Design guide: six open questions, and tooling so chats follow it
stage: explore
tags: user-interface, dev-workspace, housekeeping
branch: 150-design-guide-six-open-questions
created: 2026-10-16
why: Destin, 2026-10-12: "we will revisit tooling to actually get sessions to use the guide and meet standards later"
summary: Six design-guide questions builders raised that are not decided yet, and tooling so chats actually follow the guide.
area: Workspace
side: behind
---
Progress
Done: nothing yet.
Next: not decided.
Blocked: nothing.

Chats

From the old roadmap (moved 2026-10-16)
Design guide: 6 questions fresh builders raised that Destin has not ruled on (guide test,
2026-10-15/16; notes in docs/archive/design/2026-10-15-guide-test/r1, r2). (a) Where a new
feature lives: a Page, a built-in Page or its own screen (3 of 5 round-2 builders unsure; one felt
a 4th permanent top-bar icon was the only allowed way in). (b) Cards inside the chat have no
recipe; the level-1 card vanishes inside a bubble. (c) "Every group gets a label and a box" and
"a lone button is full width" made screens boxy and heavy (3 builders). (d) "One filled button per
row in a list of actions" let seven cards each carry a bright button. (e) No neutral notice tone
(info takes the accent, pink in Halftone). (f) No recipe for big summary numbers, scores, or "pick
a card, the rest shows its details". Settle on a questions page, then a round-3 guide test.
`all` `decision` `P3` `checked 2026-10-16`


Tooling that gets sessions to actually use the design guide and meet its standards — a
conventions list per part of a screen before building, a design-lint rule for hand-built rows
and problem lines, a check that popup titles name the popup, live deck panes that take
practice settings, and shoot sizing its browsers by the machine's load (proposals 21–25 in
the UI element review's close-session friction notes). Deferred by Destin, 2026-10-12: "we
will revisit tooling to actually get sessions to use the guide and meet standards later. for
now, we should just continue to focus on current app design and the ui guide."
→ docs/active/design/2026-09-23-ui-element-review/close-session-friction.md
`n/a` `parked` `P3` `checked 2026-10-12`

## knowledge

From the 2026-10-16 document sweep
- COUNT-1: reconcile the accepted "Session Files (12)" screen with the guide's no-parentheses count rule (not confirmed settled). Source: docs/active/reviews/2026-09-23-ui-guide-wording-round2.md
- Buttons beside text: the top / centre / bottom alignment review. Source: docs/active/design/2026-09-23-ui-element-review/decisions.md
