---
status: active
date: 2026-10-15
type: plan
---

# Guide test — fresh builders design made-up pages; Destin critiques; the guide changes

Set by `guide-test.questions` (answers committed beside this file).

## Each round
1. Draw 5 at random from the pool (seed recorded below).
2. One private copy per builder: `setup-builder.sh <round> <concept>` (this folder) makes
   `worktrees/sessions/gt-<round>-<concept>` (workspace + app, detached, no branch) from this branch's
   HEAD with THIS folder removed, and any earlier mockup of the same kind hidden (`#R-1`).
3. Builder brief = a normal short-route feature request in Destin's words; it is not told it is a
   test (`#R-4`). Same tools and reading as real work: CLAUDE.md, the guide, real screens (`#R-1`).
   Model: Opus (`#R-3`).
4. After it reports, the builder is told it was a guide test and asked where the guide left it
   guessing (`#R-4`).
5. Pictures go on `gt-<round>.review` in this folder; Destin critiques each design.
6. Critique → guide edits on this branch. Critiques stay in THIS folder (not `decisions.md`), so later
   builders cannot read earlier rounds of the same page (`#R-2`).
7. Builder copies are removed after the round; their code is kept only as a patch outside the
   workspace.

## Pool
From `#C-1`, `#C-3`, `#C-4` (and `#C-2`, answered "idk", left in):
tool-loadout (which tools/skills/MCP servers load per project) · model-presets (system prompts, tool
descriptions, output styles) · share · import · calendar · quiz · notifications · reading-list ·
agents-automations · news-page (headlines dashboard) · trip-page (Japan trip planner) · pc-build-page ·
purchases-page.

## Rounds
| Round | Seed | Drawn |
|---|---|---|
| r1 | 1792030997 | purchases-page, agents-automations, notifications, pc-build-page, import |
