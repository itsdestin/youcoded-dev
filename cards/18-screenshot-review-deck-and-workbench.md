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
Done: three of the ten listed faults look fixed in later work: Office editor sharing (youcoded commits 56a8ab9cf, c1c3a936d, a446ff0d8), duplicate spec keys (review-cards.py:183 and spec.py duplicate-id checks), and 1.5x screenshots (commit c670f7cf9). Not checked by running the app: the live-step check, viewer hangs, deck clipping, the drag-sweep crash and the terminal width.
Next: re-test the unverified faults in the review rig, then split what is still open into separate cards or close it. Still open per code: touch emulation is missing; 7 of 8 workbench URL switches are not covered by the boot check; the before/after diff card is not confirmed built.
Blocked: nothing recorded.

Chats

From the old roadmap (dev-workspace › rigs, status confirmed, seen on n/a, last checked 2026-09-02)
Screenshot, review-deck and workbench tooling: 10 faults. (a) the before/after check shows "nothing moved" for live steps (18 empty pages sent to Destin); (b) the headless page check shows Word/Excel/PDF/image viewers stuck on "Loading viewer…" unless `--wait` is used; (c) two Office screenshot runs from one checkout share one editor server, so the second fails; (d) deck preview silently clips What changed / You'll notice / Risk cards at smaller windows; (e) two specs in one feature folder can share a key, caught only hours later; (f) the drag sweep crashes writing its frame dump on a 60-drag run; (g) wanted: a before/after diff card, so an "approve these edits" question stays in the deck; (h) screenshot drivers lack touch and 1.5× scale (real mouse input already exists in `explore`); (i) eleven workbench `?switch=` values were never booted by the boot check; (j) terminal text wraps at about two-thirds width, only ever seen in the review rig (report: docs/active/investigations/2026-09-01-terminal-pty-column-count.md)
