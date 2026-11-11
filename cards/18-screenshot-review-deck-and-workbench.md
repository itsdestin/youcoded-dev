---
id: 18
title: Screenshot and review-page tools: ten faults
stage: planning
priority: P3
tags: dev-workspace, rigs, bug
branch: 18-screenshot-review-deck-and-workbench
created: 2026-10-15
summary: The tools that make before/after review pages sometimes send blank pages, cut off cards, or show viewers stuck loading.
area: Workspace
vision: together.workflow.decks, together.added.shoot
---
Progress
Done: Checked all ten against master (2026-11-10). Fixed already: b (viewers stuck loading), c (shared Office editor), e (duplicate keys; test added), h's 1.5x scale. Landed on master 2026-11-10 (workspace PR #356): f - the drag sweep no longer keeps every frame in memory (frames saved only for failing drags); i - the boot check now starts all 8 window kinds (19 routes boot) and a guard fails if a new one is not covered.
Next: Leave to session/review-deck-rethink: d (clipped cards), g (before/after diff card). Leave to the shoot sessions: touch emulation. a is stale (that rig was retired) - close it. j (terminal wraps at two-thirds width) needs a test window to check. 17 workbench switches are named by no screen; adding them waits for session/test-suite-rethink to land.
Blocked: nothing.

Chats

From the old roadmap (dev-workspace › rigs, status confirmed, seen on n/a, last checked 2026-09-02)
Screenshot, review-deck and workbench tooling: 10 faults. (a) the before/after check shows "nothing moved" for live steps (18 empty pages sent to Destin); (b) the headless page check shows Word/Excel/PDF/image viewers stuck on "Loading viewer…" unless `--wait` is used; (c) two Office screenshot runs from one checkout share one editor server, so the second fails; (d) deck preview silently clips What changed / You'll notice / Risk cards at smaller windows; (e) two specs in one feature folder can share a key, caught only hours later; (f) the drag sweep crashes writing its frame dump on a 60-drag run; (g) wanted: a before/after diff card, so an "approve these edits" question stays in the deck; (h) screenshot drivers lack touch and 1.5× scale (real mouse input already exists in `explore`); (i) eleven workbench `?switch=` values were never booted by the boot check; (j) terminal text wraps at about two-thirds width, only ever seen in the review rig (report: docs/active/investigations/2026-09-01-terminal-pty-column-count.md)
