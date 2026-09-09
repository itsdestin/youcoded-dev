---
status: active
supersedes: docs/archive/handoffs/2026-08-17-session-context-panel-handoff.md
---

# Handoff: "What the assistant was given" panel — design approved, build next

**START HERE** for the session-start context panel (the roadmap item in
`docs/roadmap/native-harness.md`: "When a small model's session has its project rules
outlined, skills cut or MCP servers dropped … nothing on screen says so").

## Where it lives

| What | Where |
|---|---|
| App branch (rebased onto master 2026-09-09, pushed) | `youcoded` `session/context-truncation`, worktree `worktrees/sessions/context-truncation/youcoded` |
| Workspace branch (decks, answers, this doc; pushed) | `youcoded-dev` `session/context-truncation`, worktree `worktrees/sessions/context-truncation` |
| Resume | `node scripts/workspace-start.mjs --session context-truncation youcoded` |
| Workbench for this worktree | `YOUCODED_PORT_OFFSET=340 bash scripts/run-workbench.sh <abs path of the youcoded worktree>` → `http://127.0.0.1:5513/?mode=workbench` (the deck tool's own offset, so `serve --no-live` reuses it) |
| The approved design (source of truth) | `desktop/src/renderer/dev/workbench/compare/registry.tsx` → `SfxTabbedStyled` (round 4 of surface `session-context`) |
| Decks + answers | `docs/active/design/2026-09-09-session-context-panel/` — `review.json` (rebase check, unanswered, superseded), `review-2.json` (rewording, unanswered, superseded), **`review-3.json` + `.answers.json` (the decision)** |
| Pre-rebase copies, safe to delete once this lands | branch `feat/context-truncation-notice`, worktree `worktrees/context-truncation` (identical work, 1,009 commits behind) |

The old branch and worktree were left alone on purpose: nothing was removed without
Destin's word. Both carry nothing the new branch lacks.

## What was decided (the record is the answers file; this is the summary)

**Layout** — the tabbed panel (candidate B, 2026-08-17) stands. Five tabs, header, one
pane at a time.

**Words (changes 1–12, Destin 2026-09-09: "content is fine")**
1. Title "What the assistant was given" — never "context" (the app's Context popup means how
   full the window is).
2. Status pill → replaced in R4; see 14.
3. First tab leads with the consequence: it may miss rules or skip steps.
4. One tappable row per cut under WHAT WAS LEFT OUT; tapping jumps to that tab.
5. Model/window rows moved out of the top (they came back as rows under THIS CHAT in 17).
6. Tabs: Overview / YouCoded / Project / Skills / Tools ("Built-in" broke at its hyphen).
7. Each tab opens with one line saying what that thing is.
8. Cut-content switch reads "What it got | What was cut"; caption explains red and green lines.
9. Per-item notes: "shortened to headings", "cut short".
10. The unattached add-on shows on the Tools tab, in a warning callout.
11. Footer copy → replaced in R4; see 18.
12. The strip in the real chat (production `SessionContextBanner.tsx`, already edited):
    "Started with this project's rules, 3 skills and 10 tools" / "This model's context window
    is small, so some rules and skills were left out"; button says **Details**.

**Look (changes 13–20, deck 3 S-1: picked After)** — built only from the dialog vocabulary:
13. `Dialog.tsx` header geometry (title `text-sm font-bold`, `text-3xs` subtitle, CloseButton,
    hairline). Subtitle: "Its instructions, skills and tools for this chat."
14. No pill, no model line. Trimmed → `Callout tone="warning"`; full → `bg-inset/50` card with a
    green dot and one sentence (the "signed in" pattern).
15. Eyebrow sections: the `h3 text-3xs font-medium text-fg-muted tracking-wider uppercase` recipe.
16. Every row is `SettingRow variant="item"`, stacked `space-y-1.5`.
17. THIS CHAT rows: Model · Context window ("How much it can hold at once") · Given, value right.
18. No footer. MORE → `SettingRow` "Assistant settings — Change the model, or what the assistant
    is given", `onClick` chevron (destination: the Assistant-settings panel).
19. Code blocks: `bg-well rounded-lg border border-edge-dim text-2xs`.
20. Got/cut switch is `SegmentedTabs variant="bare"`; "Open" beside a file is
    `Button variant="secondary" size="sm"`.

**Deck 3 note, applied (commit `93acee8a`)**: the warning banner is ONE sentence — "This
model's context window is small (16k), so some rules and skills were cut and it may miss
steps it would normally follow (see details below)." S-2 (green state): yes.

**Dots** are `bg-green-500` / `bg-amber-500` — the app has no `status-ok/-warn` tokens
despite the design guide naming them; `SettingsPanel.tsx` uses the same Tailwind colours.
Touch matters: no `title=` tooltips carry information (Destin reviews on a touchscreen).

## Verified on the rebased branch

`npx tsc --noEmit` clean · eslint clean on every touched file ·
`chat-reducer`, `workbench-fixture-actions`, `workbench-mock-contract` tests: 260 pass ·
`node scripts/workbench-boot-check.mjs 5513`: all 16 routes mount. `bash scripts/verify.sh`
has NOT been run yet — run it before claiming the build done.

## Next steps, in order

1. **Contract deck.** Dispatch a fresh agent with `scripts/ui-review/contract-agent.md`, the
   three deck specs + the answers file, branch `session/context-truncation`. Serve
   `session-context-panel.contract.json`; Destin signs it before the build.
2. **Make the approved panel the real one.** Rebuild `SessionContextPopup.tsx` as
   `SfxTabbedStyled` inside the real `<Dialog size="panel" title subtitle>` (the mockup's
   header IS Dialog's header — drop the hand-copy). Keep the once-per-session auto-open latch
   and the strip in `ChatView.tsx`. Then delete `SfxTabbed`/`SfxTabbedClear`/`SfxCardAltA`
   from the registry or leave them as lineage — Destin's call; the compare rounds' notes are
   the design history either way.
3. **Backend.** A session-start push carrying `SessionContext` (type in `chat-types.ts`):
   `fitProjectInstructions` result (`prompt-assembly.ts` currently discards `truncated`),
   `fitInjection` per skill/rule (`harness-session.ts`, `native-session-host.ts`),
   `HarnessSession.droppedMcpServers`, and `fullText` (CLAUDE.md / SKILL.md on disk) for the
   diff. New channel on all four surfaces (`preload.ts`, `remote-shim.ts`, `ipc-handlers.ts`,
   `SessionService.kt`) pinned by `ipc-channels.test.ts`; then delete the
   `native.onSessionContext` row from `mock-only.ts`. The budget is fixed at session start and
   `setBinding` does not re-apply it — a model switch mid-chat does not re-trim, and the panel
   must not imply it does. Survives resume (the prompt is rebuilt on resume).
4. **Wire the two dead spots**: "Open" (the `FilepathToken` open action) and the Assistant
   settings row (deep-link to the Assistant-settings panel when it exists; until then the row
   can open Settings).
5. **Reviews**: UX tester run 2 + code reviewer in parallel, triage, grader, acceptance deck,
   `bash scripts/close-out.sh session/context-truncation`. Merge only on Destin's word.
6. **After landing**: archive this handoff and the design folder's lifecycle docs, close the
   roadmap item into `docs/roadmap/shipped.md`, remove `feat/context-truncation-notice` +
   `worktrees/context-truncation` + the session worktrees, stop the workbench.

## Things learned this session (not yet filed anywhere else)

- `git cherry-pick` of the 2026-08-26 rescue commit onto master conflicted in six files; every
  conflict was additive (keep both sides). The compare registry was easiest rebuilt from
  master + the commit's own patch (`patch --fuzz=3`) with the surface entry re-inserted by
  hand at the end of `ALL_SURFACES`.
- `workspace-start` did NOT provision `node_modules` for the new worktree despite CLAUDE.md
  saying it does (`deps:` line absent). `cp -al youcoded/desktop/node_modules <worktree>/desktop/`
  took half a second and matched the lock file. Worth a look in `scripts/workspace-start.mjs`.
- `SegmentedTabs variant="contained"` splits width evenly with `flex-1`, so five tabs at
  `panel` width clip or hyphen-break any label over ~8 characters.
