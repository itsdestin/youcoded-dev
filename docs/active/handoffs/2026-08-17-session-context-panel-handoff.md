---
status: active
---

# Handoff: session context panel (Step 3, broadened)

The native-sessions grand plan's **Step 3** ("make context truncation visible")
was designed — and then **broadened on Destin's direction** into a full
**session context transparency** panel. The mockup is approved; the backend is
not built. This handoff is the bundle for the session that refines the mockup
and implements the backend.

## The goal, in one sentence

At the start of **every** session (local or cloud), the user should see a
panel accounting for **what the assistant began with** — the system prompt,
project instructions (CLAUDE.md, as truncated), skills, tools, and any MCP
servers dropped for budget — with clickable outlinks to the real files, a
clear visual hierarchy, a **"Full vs supplied" diff** for anything trimmed,
and a **"Manage Assistant Settings"** button (stubbed).

## The problem it solves

Every truncation the native harness performs announces itself **to the model
and nowhere else** (ROADMAP `#656`): `fitProjectInstructions` outlines an
over-budget `CLAUDE.md`, `fitInjection` cuts skill bodies and path rules,
`mcpBudgetSizing` drops whole MCP servers into `HarnessSession.droppedMcpServers`
— which has **zero UI readers**. A user on a small local model runs a session
where most rules are outlined, skills cut, servers unattached — and nothing on
screen says so. The broadened version extends this from "only when cut" to
"every session, full accounting."

## Approved design (read this before re-designing)

**Mockup location:** youcoded branch `feat/context-truncation-notice`, worktree
`worktrees/context-truncation`, **workbench compare view** → surface **"Session
context"**, candidate **B ("Tabbed")** — `bash scripts/run-workbench.sh
context-truncation` then View → comparisons.

**What Destin approved:**
- **Tabbed layout** (candidate B): a `SegmentedTabs` row — **Overview /
  Prompt / Instructions / Skills / Tools** — over per-view panes; header
  (model + token-window chip + Trimmed/Full status pill) always visible above
  the tabs; footer "Manage Assistant Settings" stub separated by a divider.
- **Overview tab:** one status card (amber ⚠ "Context was trimmed to fit…" or
  green ✓ full-context line) + a bordered `SettingRow` group (Model / Context
  window / Loaded) + a warning `Callout` ("Not attached — dropped to fit the
  tools budget") when any MCP server was dropped.
- **Per-surface diff** for anything trimmed: a **"Supplied | Full vs
  supplied"** segmented toggle under the truncated surface, swapping the
  supplied copy for the app's real `UnifiedDiff` (`oldStr=full`,
  `newStr=supplied`; red rows = content the model did not receive). Caption:
  "Red lines are {label} content the model did not receive."
- **Untrimmed surfaces show no toggle.** The cloud (full) state is a green
  mirror of the same layout.
- Candidate **A ("Card stack")** was the losing alternative — kept in the
  compare registry for lineage; do not re-propose unless Destin asks.

**Design decisions locked in the review:**
- The old dismissible **banner** (v1, `ContextTruncationBanner`) was dropped —
  the persistent strip + one-time panel replaced it.
- The panel **auto-opens once per session** (a per-session latch in ChatView),
  then the strip is the reopen path.
- Survives resume (the accounting is a fact about the rebuilt prompt).
- The diff needs the **full original text** alongside the supplied copy:
  `SessionContext.projectInstructions.fullText` and per-skill `fullText`.

## Current code state (worktree `worktrees/context-truncation`, branch `feat/context-truncation-notice`)

The UI is built in the **workbench only** — the production components exist but
run off mock data seeded through the real chat reducer.

| File | What it is |
|---|---|
| `desktop/src/renderer/components/SessionContextBanner.tsx` | The always-visible top-of-timeline strip (✓ full / ⚠ trimmed), click → opens panel |
| `desktop/src/renderer/components/SessionContextPopup.tsx` | The panel — **still the pre-tabbed v1 layout**; the approved tabbed layout lives ONLY in the compare registry candidate B and must be pasted here |
| `desktop/src/renderer/state/chat-types.ts` | `SessionContext` type (model, window, summary, systemPrompt, projectInstructions+fullText, skills+fullText, tools, droppedMcpServers); `SESSION_CONTEXT` action; serialized (`sessionContext`) |
| `desktop/src/renderer/state/chat-reducer.ts` | `SESSION_CONTEXT` case |
| `desktop/src/renderer/components/ChatView.tsx` | Strip mount + one-time auto-open effect + panel mount |
| `desktop/src/renderer/dev/workbench/fixture-loader.ts` | `session_context` fixture line → real reducer |
| `desktop/src/renderer/dev/workbench/fixtures/conversations/{native,claude-code}.jsonl` | Trimmed (native, qwen) + full (cloud, sonnet) fixtures |
| `desktop/src/renderer/dev/workbench/mock-only.ts` | `native.onSessionContext` registered `MOCK_ONLY` (no real backend) |
| `desktop/src/renderer/dev/workbench/compare/registry.tsx` | The approved candidates (A card stack, B tabbed + diff) + `SessionContext` surface, `ACTIVE_FIRST` |
| `desktop/tests/{chat-reducer,workbench-fixture-actions}.test.ts` | Tests pinned for the reducer/serialization/fixture |

`npx tsc --noEmit`, `npx eslint`, and `node scripts/workbench-boot-check.mjs`
all pass on the worktree; the workbench mounts clean on all routes.

## What a future session should do (in order)

1. **Refine the mockup further** (Destin: "a future session will further refine
   the mockup") — the approved tabbed layout is in the compare registry
   (candidate B); any new round appends to the `session-context` surface's
   `rounds`. Pastes to production once settled.
2. **Paste the approved layout into `SessionContextPopup.tsx`** — it currently
   holds the v1 non-tabbed layout; the winner must become the real component
   (the compare candidates are built from real primitives, so this is a copy
   of the arrangement, not a reimplementation).
3. **Implement the backend** — replace the `MOCK_ONLY` channel with a real
   session-start push carrying the `SessionContext` facts:
   - `fitProjectInstructions`'s `truncated` + outline (caller
     `prompt-assembly.ts:52` currently discards it)
   - `fitInjection`'s `truncated` per skill/rule (callers
     `harness-session.ts:758`, `native-session-host.ts:3331`)
   - `HarnessSession.droppedMcpServers` (zero non-test readers today)
   - `fullText` = the source file contents (CLAUDE.md, SKILL.md) for the diff
   - New IPC channel per the 4-surface parity rule (`preload.ts` +
     `remote-shim.ts` + `SessionService.kt` + `ipc-channels.test.ts`); drop the
     `MOCK_ONLY` entry when real.
   - Note the trap from ROADMAP: the budget is fixed at session start and
     `setBinding` does NOT re-apply it — switching models mid-session does not
     re-truncate, and the notice must not imply otherwise.

## Related design — "Manage Assistant Settings" destination

The stub button's destination is the **Assistant-settings consolidated panel**:
`docs/active/design/2026-08-17-assistant-settings-panel-design.md` (concurrent
design, same day — Defaults + Permissions + Model Providers collapse into one
searchable tabbed panel; prototype `docs/active/prototypes/
2026-08-17-assistant-settings-panel.html`). The session-context panel and the
Assistant-settings panel are complementary: context shows *what the assistant
began with*; Assistant settings manages *how it's configured*. Do not
duplicate the settings work; the stub should deep-link to that panel when it
lands.

## Ground rules for the next session

- `bash setup.sh` first; start non-trivial work at `docs/MAP.md`; read
  `docs/PITFALLS.md` before non-trivial changes.
- Work in a worktree; verify with `bash scripts/verify.sh` (desktop) — the
  worktree `worktrees/context-truncation` already exists on branch
  `feat/context-truncation-notice`; `node_modules` is hardlinked (`cp -al`).
- The workbench lives on **port 5235** in this session (`YOUCODED_PORT_OFFSET=62`)
  because 5223/5233 were taken by concurrent dev sessions — use a free offset.
- Keep the mockup honest: candidates from real primitives, never hand-drawn
  approximations; `MOCK_ONLY` until the backend exists.
- After any change to the workbench mock, run
  `node scripts/workbench-boot-check.mjs` (default 5233; pass the port).
