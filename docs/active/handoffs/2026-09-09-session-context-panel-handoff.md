---
status: active
supersedes: docs/archive/handoffs/2026-08-17-session-context-panel-handoff.md
---

# Handoff: "What the assistant was given" — design done, panel built, backend next

**START HERE** for the session-start context panel (roadmap item in
`docs/roadmap/native-harness.md`: "When a small model's session has its project rules
outlined, skills cut or MCP servers dropped … nothing on screen says so").

Rewritten 2026-09-10. The previous version of this file described a design still in the
workbench; that is no longer where it lives.

## State in one line

**The design is finished and signed off across five review rounds; the panel is now the real
shipping component; nothing feeds it real data yet.**

## Where it lives

| What | Where |
|---|---|
| App branch (pushed) | `youcoded` `session/context-truncation`, worktree `worktrees/sessions/context-truncation/youcoded` |
| Workspace branch (pushed) | `youcoded-dev` `session/context-truncation`, worktree `worktrees/sessions/context-truncation` |
| Resume | `node scripts/workspace-start.mjs --session context-truncation youcoded` |
| Workbench | `YOUCODED_PORT_OFFSET=340 bash scripts/run-workbench.sh <abs path of the youcoded worktree>` → `http://127.0.0.1:5513/?mode=workbench` |
| **The panel** | `desktop/src/renderer/components/SessionContextPopup.tsx` — the real component, not a mockup |
| The strip | `desktop/src/renderer/components/SessionContextBanner.tsx` |
| Decks + answers | `docs/active/design/2026-09-09-session-context-panel/` — rounds 3, 4, 5 all submitted |
| **Contract** | `session-context-panel.contract.json` — 31 rows, `contract-check` holds, **NOT signed** |
| Design lineage (mockups) | `desktop/src/renderer/dev/workbench/compare/registry.tsx`, surface `session-context`, rounds 1-5 |
| Pre-rebase duplicates, safe to delete once this lands | branch `feat/context-truncation-notice`, worktree `worktrees/context-truncation` |

## What is decided (rounds 3, 4, 5 — all submitted, answers committed)

Look, words and behaviour are settled. The contract's 31 rows are the authority; in brief:

- Built entirely from the app's dialog vocabulary — `Dialog size="panel" fill`, eyebrow
  sections, `SettingRow` stacks, `Callout`, well-backed text. Never its own invention.
- Title never says "context" — the app's other Context popup means how full the window is now.
- Tabs FIRST (Overview / System / Project / Skills / Tools); the status card belongs to Overview.
- Warning is one line ("Not everything fit") opening to the full sentence ending
  "(see details below)" — true only because the card sits above the list it names.
- Cut text is the app's red/green comparison ("i like the diff view"), with a line count per
  side, inside ONE card per file or skill.
- File text renders as markdown, heading sizes scaled down for a 420px panel.
- Tools are full-width rows that open in place, each with a plain-English sentence.
- **It never opens by itself.** The strip is the only way in and carries the amber state.
- The strip shows even when nothing extra was given.
- Open opens the file (via `useOpenFilepath`). No Assistant settings row, no footer.
- Tabs scroll sideways when narrow.

## Remaining work, in order

### 1. Two things built from notes, never seen on a deck
The contract agent flagged both. They are in the code but not approved:
- **What the System tab contains.** His note: "include both preset instructions and general
  system instructions. i want to be fully transparent about what models load in with." Built as
  five parts (identity / preset / environment / doctrine / small-model steering) from what
  `prompt-assembly.ts` actually assembles. He has not seen it.
- **The strip tidy-up** — "remove the checkmark. improve the button." Done; not seen.

Show both on the next deck. They can ride the acceptance deck rather than needing one of
their own.

### 2. The backend — the bulk of what is left
Nothing supplies `SessionContext` today; the panel runs on workbench fixtures.

A session-start push carrying:
- `fitProjectInstructions` result — `prompt-assembly.ts` currently discards `truncated`.
- `fitInjection` per skill and rule (`harness-session.ts`, `native-session-host.ts`).
- `HarnessSession.droppedMcpServers`.
- `fullText` for the diff (CLAUDE.md / SKILL.md from disk).
- **`systemPromptSections`** — the new field. `assembleSystemPrompt` already builds the prompt
  from exactly these parts; the honest implementation returns them rather than re-splitting a
  finished string.

New channel on all four surfaces (`preload.ts`, `remote-shim.ts`, `ipc-handlers.ts`,
`SessionService.kt`), pinned by `ipc-channels.test.ts`. Then delete the
`native.onSessionContext` row from `mock-only.ts`.

**Known trap:** the budget is fixed at session start and `setBinding` does NOT re-apply it, so
a model switch mid-chat does not re-trim. The panel must not imply that it does. (Filed as a
question in the parked truncation rework — see below.)

### 3. Android parity
The React panel is shared, so it comes along, but `SessionService.kt` needs the channel.
Nothing about Android has been checked. `JAVA_HOME=/usr/lib/jvm/java-21-openjdk
ANDROID_HOME=$HOME/.android-sdk ./gradlew test -x bundleWebUi` from `youcoded/`.

### 4. Reviews and close-out
Code reviewer + UX tester run 2 in parallel (`scripts/ui-review/{code-reviewer,ux-tester}.md`),
triage every finding line, accepted ones become `review:` contract rows, then a fresh grader
writes `session-context-panel.contract.verdicts.json`, then the acceptance deck, then
`bash scripts/close-out.sh session/context-truncation`. **Destin signs the contract before the
build is called done** — it is unsigned today.

### 5. After it lands
Archive this handoff and the design folder, close the roadmap item into `docs/roadmap/shipped.md`,
delete `feat/context-truncation-notice` + `worktrees/context-truncation` + the session worktrees,
stop the workbench on 5513.

### Decide at some point
The `Sfx*` mockups (rounds 1-5) still sit in `compare/registry.tsx`. Keep as design lineage or
delete now that the real component exists — Destin's call, no urgency.

## Verified state

`bash scripts/verify.sh <youcoded worktree>` — **green** (types, related tests + 44
source-scanning guards, knip, lint, ast-grep). All 16 workbench routes mount. Probed in the
running app: the panel does not auto-open, and Details opens it.

## Not part of this feature (filed, do not chase here)

- `docs/roadmap/native-harness.md` — the Assistant-settings step guard may save the OLD number;
  its own test has failed on master since 2026-09-08.
- `docs/roadmap/user-interface.md` — the shared before/after diff renderer fails the app's own
  contrast minimum in the light theme, breaks words mid-line, and ends on a sliced half-line.
  Affects every tool card, not just this panel.
- `docs/roadmap/native-harness.md` — the small-model truncation rework, parked, with a
  ready-to-serve seven-question deck. Investigation:
  `docs/active/investigations/2026-09-09-small-model-context-truncation.md`. Three correctness
  fixes from it are already merged into this branch (a cut skill names its file, cuts land on a
  line boundary, the Skill tool respects the session budget).

## Lessons worth keeping

- A component mounted with `open={false}` still runs its hooks. Putting `useOpenFilepath` at the
  top of the panel reached into artifact context on every ChatView render and failed eight test
  files. The outer component now returns before any hook exists.
- `verify.sh` had never been run on this branch until 2026-09-10 and found three guard failures
  in a single run, two of them ours. Run it before believing a UI change is done.
- The context-free UX tester found 31 things in one pass, including a dead end (expanding cut
  text pushed the controls off an unscrollable window) that five design rounds had missed.
