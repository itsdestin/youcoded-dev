---
status: active
created: 2026-08-27
kind: state-of-play
supersedes: docs/active/handoffs/2026-08-26-open-work-state-of-play.md (for the "what is open" question; that doc's §5 corrections still stand)
---

# Open work inventory — 2026-08-27 (evening)

Every branch, worktree, pull request, unsaved file and not-yet-closed conversation from the last 30 days, checked against what is actually on `origin/master` today. Four read-only agents read the opening and closing turns of 57 conversations; every "shipped" claim was checked against a merge on `origin/master` or a PR state on GitHub.

**Index freshness:** chatsearch refreshed 10 min before this run. 360 conversations in the window; 57 had no completion mark and were read; the other 303 are already marked complete in the app.

## 1. Live right now (4 sessions were running while this was written)

| Conversation | Branch | What it's doing | What's left |
|---|---|---|---|
| Phase D UI Review Deck (b4c2) | `feat/ui-phase-d` → PR #339 | Waiting for CI | Merge #339, archive audit docs, flip ROADMAP. Then 6 sub-worktrees (`ui-phase-d-a/b/c/d/base`) are disposable — all contained in the PR branch |
| Session Cost Check Review (31e4) | `feat/statusbar-session-relevance` (40 commits, pushed) | Task 16 = final verification | Your sign-off on its review deck, then merge |
| Model Download Resume (88c4) | `feat/model-download-resume` (9 commits, pushed) | Mid-Task 6 | Tasks 6+, verify, deck, merge |
| Artifact Image Zoom Loupe (e02d) | `feat/artifact-zoom-loupe` (6 commits, **not pushed**, 2 dirty files) | Capturing the "after" shots | Deck → your review → push → PR |

Don't clean up any of those four worktrees.

## 2. Every branch / worktree, with its state

| Worktree · branch | State | What's left | Conversations |
|---|---|---|---|
| `chatsearch-refs` · `feat/chatsearch-session-refs` (25 commits, pushed) | **Waiting on you** | Answer the Task 7 review deck (`docs/active/design/2026-08-27-chatsearch-refs-gate/`, untracked). "Looks pretty good" was not taken as sign-off. Then Phase B backend (Task 8+) | a7bf Chat Search Preview Review Gate — OPEN |
| `context-truncation` · `feat/context-truncation-notice` (1 rescue commit, **not pushed**) | Mockup approved by eye, no backend | Push it. Then `native.onSessionContext` backend + 4-surface IPC | 3d4e OpenRouter data integration timeline — OPEN |
| `assistant-settings` · `feat/assistant-settings-mockup` (2 commits, pushed) | **Waiting on you** | Sign off the provider-first mockup, then a backend plan | 1e32 Consolidated Assistant Settings Panel — OPEN |
| `full-auto-reads` · `feat/full-auto-read-bypass` (**0 commits** — empty) | Plan approved, nothing built | Execute plan; Task 2 (workbench copy) needs your sign-off | a192 Full-Auto Read Bypass Plan — OPEN |
| `resize-paint` · `fix/resize-paint-race` (1 commit 08-12, pushed, no PR) | Finished code, never looked at | **Drag a window edge once**, then PR + merge | 3a70 Electron Window Resize Lag — DONE (its own fix #284 shipped); this branch is the successor |
| `perm-timeout` · `feat/permission-ask-timeout` → PR #278 | **Conflicting**, 787 behind, never reviewed | Plan rewrite, not just a rebase: Tasks 7/8 edit `closeSocket()`, deleted 08-22 | 35b6 Permission Ask Timeout Implementation — OPEN |
| `ask-reference` · `feat/ask-claude-reference-ux` → draft PR #263 | Parked since 07-28 ("janky af" overlay) | Decide rework vs rewrite | none in window |
| `session-switch-animation` → draft PR #192 | Parked since 07-20; an 08-06 change likely breaks its mechanism | Design decision | none in window |
| `xwayland-floater` → draft PR #239 "DO NOT MERGE" | Experiment | Close PR, but first rescue the small buddy-window size fix trapped on it; `install-app.sh:196 Exec=` question unanswered | e409 Chromium And YouCoded Stacks — DONE (its fix shipped) |
| `ui-phase-d-a/b/c/d/base`, `zoom-before` (detached) | Review-rig scaffolding | Delete after their decks are done — all sub-branches are contained in `feat/ui-phase-d` | — |
| `origin/feat/opencode-mvp` (no worktree) | Archived experiment | Tag then delete branch | — |
| youcoded **main checkout** (`master`) | **131 commits behind origin**, 8 dirty files | Dirty files are byte-identical copies of the assistant-settings branch (one 1-line difference in `WorkbenchToolbar.tsx`) → safe to discard, then `git pull`. `tests/zz-repro.test.ts` (08-16 repro of a conversation-store model upsert) is the only thing not on any branch. Stash: `package.json +6` from 08-13 | — |

### Approved-on-paper, zero code, no worktree

| Plan | Conversation | Blocker |
|---|---|---|
| Timestamp-only assistant bubble (`plans/2026-08-17-…`) | 27c3 — OPEN | none, just scheduling |
| Search-scope timeout Chunk A (`plans/2026-08-17-…`) | 7cab (untitled) — OPEN | none — fixes the 181-second hang |
| Project-scoped skills (`plans/2026-08-06-…`) | 7e87 — OPEN | re-anchor on current master first |
| Native skip-permissions (`investigations/2026-08-09-…`) | d964 — OPEN, **waiting on you** to pick an option from §3; the Skip Permissions tooltip still over-promises |
| Session retrospective checkup tool | 1440 — OPEN, **waiting on you** (cadence, output shape). Script `test-engine/conversation-triage.mjs` is safe — committed on `feat/assistant-settings-mockup` |
| Perf lab loop (`plans/2026-08-23-…`) | fd3c, 1fec — handed to the other Linux machine; `perf-lab-session-prompt.md` is tracked. Unknown whether it ever ran |
| Feature fact sheet (`youcoded-feature-fact-sheet.md`, tracked) | 0aab — OPEN, **waiting on you** to read the draft |

## 3. Conversations to mark complete in the app

Superseded, shipped, or abandoned — safe to close:

| Conversation | Why |
|---|---|
| Permission Copy Review Page (8c00, 08-27) | Shipped: specialists 1c + copy rewrite `ebb55dae` on master. Only your manual items remain (revoke test grants in Settings → Permissions) |
| Deliverables Card Implementation (8e40, 08-26) | Shipped 08-26 (`feat/send-user-file-card`) |
| Native Tools Harness Comparison (5e60, 08-26) | Investigation written and pushed |
| Outstanding Work Review (4927, 08-26) | Superseded by this document |
| Perf Lab Plan Handoff (1fec) + Performance Optimization Plan (fd3c) | Handed to the other machine |
| Color Test HTML Page ×4 (3424, 042d, 9e94, 3ec3) | Render smoke tests; leftovers deletable |
| Artifact Pane Size Tests (40ce) | Fixtures for a feature that merged 08-25 |
| Native Sessions Workstream Status (9993) | Folded into the 08-26 state-of-play |
| Chromium And YouCoded Stacks (e409) | Its fix shipped; leftover question noted under xwayland-floater |
| Electron Window Resize Lag (3a70) | PR #284 shipped; successor is `resize-paint` |
| Audit Skill Installation Status (e264) | Abandoned mid-fix — **but** its two findings are still true: `registries.md` (rule + doc) say `wecoded-marketplace-cache`, code says `youcoded-marketplace-cache`; `youcoded-toolkit.md` says v1.2.1, `plugin.json` is 1.2.4. Two-line fix, then close |
| /home/destin/Z13-KNOWN-ISSUES.md (90cf) | Opened and interrupted in 4 seconds |
| Drawer Card Flicker Regression (6ead) | PR #277 merged |
| Testing the Native Harness (036d), (untitled) e8d1, (untitled) 95f5, (untitled) 634b | Reviews written / probes done / empty |
| JLBC Windows Bundle Packaging (b2ae), Project Move Sync (e349), Embeddings and Rerank (b718) | ask-the-budget work, all shipped there |
| youcoded-desktop-linux.zip (9fc4), Third DualSense (b705), Galaxy Book Display (a1c1) | Personal; done |
| User Patchability And Customization (2608) | Brainstorm never answered. **The idea is captured nowhere** (no ROADMAP line) — add as `idea` or let it go |
| KWallet Chrome OpenRouter (3e18), Tablet Start Menu (5840), sandbox probe (af83), Z13 Mouse Lag (1ea6), DualSense Edge Cemu (c5c0), LLM Training Concepts (5170) | Personal; done |
| (untitled) 2146, 08-18 | Transcript gone; 4-minute native chat, nothing knowable |

Already ✓ but tagged "Follow-Up Needed" — the tag is accurate, leave it: **Native MCP Phase 1 (fb4c)**: MCP phase 2 (ROADMAP:432), nine fixed-`.tmp` write sites (ROADMAP:440), and a never-run live check (resume with MCP tools, Cmd+Q leaves no subprocess).

## 4. Genuinely open, outside YouCoded

| Conversation | Project | Left |
|---|---|---|
| Table Section Path Implementation (b0e0) | ask-the-budget | Tasks 6–8; 12 commits + 2 dirty files in `~/ask-the-budget-az-worktrees/table-section-path`, **never pushed** |
| Agency Table Rebuild Spec Review (c06b) | ask-the-budget | The review was never delivered — 8 minutes of reading, no verdict. Spec is unreviewed |
| Caelestia Test And System Update (f467) + Scrcpy (e1ce) | laptop | The `pacman -Syu` never ran (last full upgrade 07-16); backup is done; 4 AUR apps will need rebuilds; scrcpy never installed |
| Z13 Crash Boot (2bdb) | laptop | Hibernate is the answer; blocked on that same upgrade |
| Dashboard Power Chips Redesign (722fa) | system dashboard | You never picked A/B/C; `static/index.html` has an unrelated 244-line uncommitted diff from 08-17 |
| False Success Claims Analysis (ad77) | Frontier-AI-Lab | Session-lint linter + eval suite proposed, none built |

## 5. Unsaved / stray files (workspace `youcoded-dev`)

| File | Whose | Do |
|---|---|---|
| `.claude/rules/ipc-bridge.md` (22-line wording trim) | another session, 08-27 | commit or discard |
| `.claude/rules/artifacts.md.recovered-trim.partial.patch` | recovered fragment of a wiped trim; 5 of 16 lines lost | re-apply by hand or delete |
| `docs/active/design/2026-08-25-ui-audit/phase-d-review.json`, `scripts/ui-review/plans/artifact-zoom.json` | live Phase D / zoom sessions | leave |
| `docs/active/design/2026-08-26-download-resume/` (deleted `-final.json`, untracked r4 deck + band PNGs + `band-shape-tuner.html`) | download-resume session | that session should commit its deck |
| `docs/active/design/2026-08-27-chatsearch-refs-gate/` + `scripts/ui-review/plans/chatsearch-gate-*.json` | chatsearch-refs Task 7 deck | commit with the branch |
| `docs/active/specs/2026-08-26-conversation-preview-header-design.md` (draft) | chatsearch-refs | commit |
| `color-test.html`, `grid-a.html`, `grid-b.html`, `spacing-test.html`, `probe.tmp`, `tmp-test.txt`, a `.png~` backup | test leftovers | delete |
| stash "test-draft-file.md" | 1-line | drop |

## 6. Open dependency PRs (all repos)

youcoded #338, #337, #334, #271, #270, #242, #237, #236, #235 · wecoded-themes #26 · wecoded-marketplace #63, #61, #60. The 08-26 review found every one failing checks; unchanged.

## 7. If you only do three things

1. **Push `feat/artifact-zoom-loupe` and `feat/context-truncation-notice`** — the only branches that exist on this laptop alone (the zoom session will do its own when it finishes its deck).
2. **Answer the three decks waiting on you**: chatsearch-refs Task 7, assistant-settings mockup, status-bar relevance (when 31e4 posts it).
3. **Drag a window edge** and merge `resize-paint`. Still the cheapest finished work in the workspace, 15 days waiting.
