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

**The design is finished and signed off across five review rounds; the panel is the real
shipping component; the backend landed 2026-09-10 and it now runs on real data.** What is
left is Destin's call on Claude Code sessions, the two never-decked items, and the reviews.

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

### 1. What the signed contract does NOT cover

Destin signed the 31 rows and chose to skip the code reviewer and the second UX tester run
(2026-09-10: *"i think this is ready, we can skip the reviewers"*). That is his call and it is
recorded. What it means for the record: **a contract row must trace to an answered deck step**
(`review-cards.py contract-check` enforces it), so the seven things below are in the code and
were not addable as rows. They are written here because that makes them findable; they are not
signed.

Four came from HIS OWN words, in chat rather than on a deck — decided, just not sourced:

- **The System tab's five parts** — "include both preset instructions and general system
  instructions. i want to be fully transparent about what models load in with."
- **The strip tidy-up** — "remove the checkmark. improve the button."
- **The whole row is the button** — "i want the whole row thing to be a clickable button that
  opens the popup." Forced Details to stop being a real control (a button cannot nest).
- **Details lost its border**, and with it its fill and radius.

Three came from what the CODE turned out to do, not from anyone's decision. Reasons and
measurements: `docs/active/specs/2026-09-10-session-context-backend-design.md`.

- **A skill card opens to its text** rather than showing it. R20 says a skill that fits shows
  its text; with 47 installed that is 47 open cards and 619 KB read to build the page. The card
  still owns its text — it waits to be asked. **This is the one that bends an approved row.**
- **A skill row says "would be shortened when used"**, future tense, because skills are read
  when they are USED. Claiming a cut that has not happened would be false.
- **The amber state is driven by what was ACTUALLY left out** — the instruction file, dropped
  add-ons, and the big one: a small model is never told its skills exist.

### 2. The backend — DONE (2026-09-10, commit `acab1255`)
`NativeSessionHost.buildSessionContext` emitted from `wire()`, forwarded as
`native:session-context`, with `native:session-context-text` answering the panel's on-demand
read of one file. Five surfaces, pinned by `ipc-channels.test.ts`; `native.onSessionContext`
is off the mock-only list. Design and the three surprises that shaped it:
`docs/active/specs/2026-09-10-session-context-backend-design.md`.

**Claude Code chats — ANSWERED and built** (Destin, 2026-09-10: "reflect what we can reflect
accurately. And then for the stuff that's less certain. We should reflect it as such.").
`main/claude-code-context.ts`. Reported as fact: the instruction files the CLI reads (including
`~/.claude/CLAUDE.md`, which gets its own card and appears ONLY on a Claude Code chat, because
the native harness never reads it), and the installed skills — the app writes the four
registries the CLI reads, so that is the app's own knowledge. Withheld: its system prompt, its
tool list, its context window, and whether it shortened anything. `tools` is **null, never
`[]`** — an empty list reads as "this assistant has no tools", a lie in the more alarming
direction; each empty tab says whose business it is instead.

### 3. Android parity — DONE
`SessionService.kt` answers `native:session-context-text` with the honest
not-implemented reply; the push reaches a phone inside `chat:hydrate` over the remote
WebSocket, so it needs no case. **741 Android tests, 0 failed** (2026-09-10, first time this
branch has been checked on Android at all).

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

`bash scripts/verify.sh <youcoded worktree>` — **green** (types, related tests + 45
source-scanning guards, knip, lint, ast-grep), re-run after the backend. All 16 workbench
routes mount. **Android: 741 tests, 0 failed.** Probed in the workbench: the strip renders from
the pushed record, Details opens the panel, and expanding a skill fetches its text and shows
the got/cut comparison.

**A "visual defect" that turned out to be the measuring instrument.** The selected tab appeared
to paint on the wrong tab, reproducibly, in `ui-probe`'s headless Chrome — correct classes,
stale paint. Checked in a real dev instance against the SAME control on an untouched surface
(the bug-report popup's Bug/Feature tabs) and it is correct there: the selected tab carries
`bg-accent` and paints it. **Headless Chrome does not settle style recalculation for these
elements; do not trust `ui-probe` for painted state of a control that just changed.** The
roadmap item filed for it was withdrawn the same day.

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
