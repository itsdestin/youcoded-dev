---
status: draft
date: 2026-08-16
type: spec
repos: [youcoded]
tags: [native-runtime, specialists, subagents, m7, chat-ui, settings]
parent: docs/active/specs/2026-08-11-native-specialists-design.md   # the M7 design this completes (stage one)
relates:
  - docs/archive/plans/2026-08-12-native-specialists-plan-1a-core.md
  - docs/archive/plans/2026-08-12-native-specialists-plan-1b-background-durability.md
  - docs/archive/handoffs/2026-08-20-specialists-1b-testing-checklist.md
  - docs/active/handoffs/2026-08-16-specialists-1c-handoff.md
ui_branch: youcoded feat/specialists-1c-ui (worktree worktrees/specialists-1c) — the approved renderer, built workbench-first
---

# Native specialists — plan 1c design (chat UI, management popup, definitions, Settings)

**Approved by Destin 2026-08-16 in the UI Workbench, ten review rounds** ("good enough
for now" on round 10). Plan 1c is the last piece of stage one of the M7 specialists
design. 1a shipped foreground hires; 1b shipped background execution, durability,
steering, routed asks, and the model tiers' storage. 1c ships **the way all of that
looks and is managed**, plus **specialists defined by files** and the **Settings page**.

The renderer half already exists on the branch named above: it is the real
components, edited in place against fake channels (`MOCK_ONLY`), which is why this spec
can point at code rather than mockups. The backend half is what those fake channels
promise, written down in §4.

## §0 Scope

**In (three buckets):**

1. **Chat card + management popup** — everything about one helper lives on its
   launching Task card and in one popup; a background hire renders like a foreground one
   (Destin's 1b hands-on directive, ROADMAP `#specialists`).
2. **Specialists from files** — a personal folder and a project folder (including Claude
   Code's `.claude/agents/*.md`), hot-reloaded, mapped through a strict tool table.
3. **Settings → Specialists** — the budget/frontier model pickers 1b left unset, and the
   roster with loader warnings.

Plus one adjacent bug that matters more once a helper's ask can wait five minutes: a
pending permission card vanishes if the renderer reloads (ROADMAP, `#permissions`).

**Out, with reasons (Destin agreed 2026-08-16):**

| Item | Why not now | Where it goes |
|---|---|---|
| Child-transcript cleanup (GC) | The ROADMAP item hangs it on "deleting a parent conversation", and the app has **no delete-conversation feature at all** (verified: no `conversations:*delete*` channel, `SessionStore` has no delete, the only destructive path prunes index records). Nothing to hook into. | ROADMAP note rewritten to depend on a future delete-conversation feature |
| Promote foreground → background (button or model) | A foreground hire holds the parent's turn open on an awaited promise; promotion means resolving that promise with a launch ack and transferring the reservation to a detached chain — invasive for a rarely-needed action. | ROADMAP `#specialists` idea |
| Open a helper's full transcript in a viewer with a parent breadcrumb | The card's Activity already shows the helper's work inline; a viewer needs a new read path (`getHistory` only serves live sessions; `resume()` refuses specialist headers by design). | ROADMAP `#specialists` idea |
| Hidden utility specialists, CLI bridge, stage-two plans | Spec phasing — not stage one's tail. | Parent spec |

## §1 The design, as approved (change ledger)

Numbers are the review numbers Destin approved by. Superseded rows say by what.

| # | Decision | Rule it locks in |
|---|---|---|
| 1 | A helper's routed permission ask renders **inside its Task card's Activity** — the `?` row grows the same Yes / Always Allow / No buttons a top-level ask has (`SpecialistAskBlock`). | Everything about one helper is on one card. Answering here or in the popup (#12) clears both — same request id. |
| 2 | ~~Cards with a pending nested ask hoist to the bottom of the timeline~~ | **Dropped** (round 2): the popup does the navigating; cards do not move. |
| 3 | The 5-minute redirect is a state, not a disappearance: the ask stays answerable, the row says the helper carried on and a Yes now lands as a follow-up. Outside-the-folder asks say why there is no Always Allow. | The card never lies about whether an answer still counts. |
| 4 | A background report **folds into the launching card** as its Report section (`ToolCallState.specialistReport`), identical to a foreground hire's Response. The standalone `SpecialistReportCard` remains only as the fallback when the card is not on the timeline. The assistant's reply stays a normal message below. | Background and foreground render alike. |
| 5 | The card's status is its **run record**, not its tool result: spinner + "Working in the background · 1m 36s" until the ledger settles, then Finished / Failed / Stopped + elapsed + steps; "may be stuck" when stale. Header suffix "· in the background" only while running. | No ✓ while a helper still works (1b Test 4). |
| 6 | **Consent envelope** above the buttons on a hire's ask card, rendered from the *mapped* definition: who, in which folder, read-only vs can edit/run commands, tools, model (tier → resolved name, or the honest fallback), and the standing reminder that deletes/secrets/outside-the-folder still ask. `task_id` calls read as note / resume / stop and hide Always Allow. | Approving the launch IS the grant (§5 of the parent spec) — the card says exactly what. |
| 7 | **Send a note / Stop** on a running card (`SpecialistActions`); notes — the user's and the assistant's — appear in the Activity trail as `note` segments. | User and model steer through one mechanism. |
| 8 | A helper's reasoning shows in its card as a collapsed **Thinking** row, never in the parent's thinking bubble. | Child events stay in the child's card. |
| 9 | Status-bar chip (`SpecialistsChip`): "N specialists" while working; amber "N need you" when an ask waits; "N finished" after. Hidden when the session has no helpers. | Attention, not vigilance (parent §6). One indicator. |
| 10 | Header labels: "Wren the Whistling Worker ↳ Run the release checklist"; "Hiring a worker" before the name exists; "Note to / Resuming / Stopping Wren…" for `task_id` calls. | The card says the management verb it is. |
| 11 | **Settings → Specialists** (row under Permissions; Dialog + (i)): Budget / Frontier pickers (unset → "helpers use the conversation's model"); the roster grouped Built in / Your specialists / This project / This project (Claude Code format), each with charter, tools on expand, file path, and orange warnings for anything the loader removed; Refresh / Open folder. | The tiers are user-designated, never auto-priced; a stripped tool is a visible warning. |
| 12 | The chip opens the **management popup**: one card per helper, grouped Needs you → Working → Finished. Answering an ask, sending a note, stopping — all here. | Asks are managed centrally; the card is the second place, not the only place. |
| 13 | Same request underneath: answering in either place clears both. | — |
| 14 | Replaces 2 — see 2. | — |
| 15 | Collapsed tool groups count a still-working helper as running and add "— N waiting on you". | Group summaries do not say "all complete" over a helper mid-job. |
| 16–18 | Popup styling rounds; **superseded by 19–23**. Round 5 (two-row compression) was **reverted** at Destin's request. | — |
| 19 | Popup card: name in-line with model ("· on Claude Sonnet 4.6") and "· in the background"; **no "Needs you" pill**; request and Yes/Always/No on one line; the amber ask band is the **bottom** of the card. | — |
| 20 | No "Show in chat" button — the **name is the out-link** (dotted underline); **Note / Stop top-right** on running cards (Finished pill there otherwise); the "can edit & run commands" copy dropped from the popup. | Consent copy lives on the hire's ask card, not the popup. |
| 21 | No role tag in the popup ("Wren the Whistling Worker" says worker). | — |
| 22 | The popup card renders the chat card's own **Briefing / Activity / Report** sections (`AgentSections`, one component in two places); Activity's `?` row stays but its buttons are suppressed there because the band has them. | One representation of a helper's work, not a summary that can drift. |
| 23 | In the popup those sections start **collapsed** and behave as an **accordion** (one open at a time). The chat card keeps its own behaviour. | — |

Fidelity notes recorded during review: workbench data is fake; the running elapsed
ticks from page load; narrow-phone and Halftone Dimension were not checked by the agent
(Destin reviewed in a light glass theme). Note/Stop echo instantly in the mock.

## §2 Renderer contract (what the branch already does)

State (`shared/types.ts`, `chat-types.ts`, `chat-reducer.ts`):

- `SubagentSegment` gains: tool segments may be `'awaiting-approval'` and carry
  `requestId / denyListed / external / permissionMode / askHeld`; new `note` (`from:
  'user'|'assistant'`) and `thinking` variants.
- `ToolCallState` gains `specialistRun?: SpecialistRunView` (the ledger record, keyed by
  `parentToolCallId`), `specialistReport?`, and `specialist?` (label for the rare
  routed ask that could not nest).
- Actions: `PERMISSION_REQUEST.specialist { childId, agentType, title, parentToolCallId? }`
  → nests under the card (two-tier match over segments; else an `sa-perm-<requestId>`
  placeholder the child's tool-use event reclaims — the ask beats the rAF-batched
  tool-use event by ~50 ms, the exact race that hung 1b Test 1). `PERMISSION_HELD`.
  `SPECIALIST_RUN_CHANGED { run }`. `SPECIALIST_NOTE { childId, text, from, timestamp }`.
  `TRANSCRIPT_ASSISTANT_REASONING.parentAgentToolUseId` routes to a `thinking` segment.
  `TRANSCRIPT_USER_MESSAGE` with `injectedMeta.parentToolCallId` (or a card whose run
  names the child) folds the report into the card instead of appending a timeline entry
  — the turn boundary is kept because the model reads it as its next input.
- `PERMISSION_RESPONDED / EXPIRED` also patch nested segments.

Selectors (`hooks/useSpecialists.ts`): `useSpecialistRunByChild`,
`useSpecialistSummary` (per-helper `HelperView`, keyed so the chip does not re-render per
token), `useSpecialistRoster` (module cache, `refreshSpecialistRoster()`),
`useDelegatedModels`.

Components: `AgentView` → `AgentSections` (Briefing / Activity / children / Report;
`suppressAsk`, `accordion`), `SubagentTimeline` (ask rows, notes, thinking),
`specialists/SpecialistAskBlock` (`compact`, `leading`), `specialists/SpecialistActions`
(`compact`), `specialists/RunStatusLine`, `SpecialistEnvelope` + `TaskConsentBlock`
(ToolCard's ask area), `SpecialistsChip` (chip + Dialog popup), `SpecialistsSection` (+
explainer), `ToolCard.taskDisplay` / `PermissionButtons.bare`, `StoppedIcon`. ToolCard
stamps `data-tool-use-id`; `jumpToCard` scrolls + flashes.

Workbench: fixture verbs `subagent_text / subagent_thinking / subagent_tool_use /
subagent_tool_result / subagent_permission_request (held) / specialist_run (elapsedMs for
running) / specialist_note / specialist_report`; seeded session `wb-3` "specialists demo";
mock namespace `specialists.*` + `on.specialistEvent`; `MOCK_ONLY` lists exactly the
seven channels below.

## §3 Channels — the backend to-do (from `MOCK_ONLY`)

All ride the standard five surfaces (`ipc-handlers` · `preload` · `remote-shim` ·
`remote-server` WS · `SessionService.kt` not-implemented) and `ipc-channels.test.ts`
parity. None gated on `native.supported` (same reason as `permissions:*`: remote-shim
hardcodes it false and revoking/answering from a phone must work).

| Renderer call | Channel | Backend |
|---|---|---|
| `specialists.list(cwd?)` → `SpecialistDefinitionView[]` | `specialists:list` | §5 catalog: built-ins + personal + project (+ CC-mapped), with `warnings[]`, `source`, `path`, `shadows` |
| `specialists.getDelegatedModels()` → `DelegatedModelsView` | `specialists:delegated-get` | `DelegatedModels.get` × 2, `label` resolved from the provider catalog |
| `specialists.setDelegatedModel(tier, binding\|null)` → `{ok}` | `specialists:delegated-set` | `DelegatedModels.set`; refuse an id absent from the catalog (never substitute) |
| `specialists.steer(sessionId, childId, text)` → `{ok, error?}` | `specialists:steer` | `NativeSessionHost.steerSpecialist(parent, child, text)`; own-children-only inside; emits a `note` event (below) |
| `specialists.interrupt(sessionId, childId)` → `{ok, error?}` | `specialists:interrupt` | `NativeSessionHost.interruptSpecialist` |
| `specialists.openFolder()` → `{ok}` | `specialists:open-folder` | `shell.openPath(~/.youcoded/specialists)`, creating it |
| `on.specialistEvent(cb)` | `specialists:event` (push) | see below |

**`specialists:event` payloads** (one push channel, discriminated):

- `{ kind: 'run', sessionId, run: SpecialistRunView }` — on every delegation-ledger
  write for that parent (`recordStart / update* / setStale / claim / confirm`), and
  replayed for every record of the parent on session attach and after
  `TRANSCRIPT_REPLAY`. `SpecialistRunView` = the ledger record minus delivery bookkeeping,
  plus `model { label, via, fallback }` (resolved binding, stated honestly) and
  `notes[]` (§4). Requires an emitter on `DelegationLedger` (today it is pure disk) or a
  host-side wrap of every write site — the plan decides; both are acceptable.
- `{ kind: 'note', sessionId, childId, text, from, timestamp }` — on every successful
  `postSteer`, whether the user (this channel) or the model (`Task` with `task_id`)
  sent it.
- `{ kind: 'roster' }` — the definitions catalog changed on disk (§5); no session id.

**Hook events:** `permission-broker` spreads `specialist { childId, agentType, title,
parentToolCallId }` (adds `parentToolCallId`; child-ask-router gets it from
`wireChildLive`) and emits a new `PermissionHeld { _requestId }` hook event when the
5-minute hold flips `timedOut`.

**Replay fix (adjacent bug):** after `TRANSCRIPT_REPLAY` the host re-emits every
`PermissionBroker.pending` entry for that session (`PermissionRequest`, plus
`PermissionHeld` for timed-out ones). Pending asks live only in memory; a re-dock or HMR
used to leave the card `running` with no buttons.

**Thinking:** `assistant-thinking` events **with text** join `SUBAGENT_DISPLAY_TYPES`'
stamped re-emit and the `getHistory` merge filter (payload-less heartbeats do not — the
frozen-surface WHY still binds). App.tsx / BubbleFeed already forward the stamp.

## §4 Notes, durability, and the ledger

- A delivered steer is recorded on the ledger record: `notes: { text, from, at }[]`
  (in addition to 1b's `missedSteers`, which stays the "not yet applied" queue). The
  `run` payload carries them; the reducer merges by `(at, text)` so a live `note` event
  and a later replay do not double a row.
- Nothing about 1c rewrites the stored session header. All new durable state is ledger
  sidecar fields (additive; older records read as `notes: []`).
- Report fold-in needs no new persistence: the injected `user-message` already carries
  `injectedMeta.parentToolCallId` in the parent JSONL.

## §5 Definitions from files

**Catalog** (`harness/specialists/catalog.ts`, replaces the module-load `BY_ID` map):
sources in precedence order **built-ins → project → personal**, later shadows earlier
by `id` (recorded as `shadows`, shown in Settings). Per session it is keyed by `cwd`
(project sources depend on it), the pattern the project-scoped-skills design settled.

- **Personal:** `~/.youcoded/specialists/*.md` (NativeHome; created lazily on first
  write / Open folder).
- **Project:** `<cwd>/.youcoded/specialists/*.md` and `<cwd>/.claude/agents/*.md`.
- **Watch:** chokidar on both folders (`theme-watcher.ts` is the template: debounce,
  extension allowlist, tolerate a missing dir); a change invalidates the catalog and
  pushes `specialists:event { kind: 'roster' }` — the renderer's roster cache re-reads
  `specialists:list` on it (no third channel).
- **Task tool re-creation:** `createTaskTool()` interpolates the roster into its
  description at construction; `HarnessSession.syncTaskTool` constructs only when
  absent. It must **re-create** (delete + set) when the catalog version changes, or a
  long session keeps a stale roster.

**Native file format** — frontmatter + body:

```yaml
---
name: Docs Writer            # display; id = filename stem unless `id:` given
description: …               # one line, shown to the model and in Settings
tools: [Read, Write, Edit, Glob, Grep]   # native names; unknown → stripped + warning
model: budget | frontier | parent        # preference, never a lock (default parent)
stepCap: 40                  # optional; default from charter
reportBudgetTokens: 2000     # optional
id / version / author        # reserved for the marketplace (parent §2); accepted, unused
---
(system prompt body — wrapped in the built-ins' shared prefix/suffix for KV-cache reuse)
```

`charter` is **derived** from the mapped tools — `read-write` iff any of `Write / Edit /
Bash` — never declared, so a file cannot claim read-only while holding a shell.

**Claude Code `.claude/agents/*.md` mapping table** — the safety-relevant part (parent
§2: narrow on any ambiguity; the launch card renders from the *mapped* result):

| CC frontmatter | Native |
|---|---|
| `name` / `description` / body | id (slug of name) / description / system prompt |
| `tools:` Read, Write, Edit, Bash, Glob, Grep, WebFetch, WebSearch, TodoWrite | same name |
| `tools:` MultiEdit | stripped, warning ("Edit covers it") |
| `tools:` NotebookEdit, KillShell/BashOutput, SlashCommand, Skill, ExitPlanMode, AskUserQuestion, ListMcpResources, any `mcp__*` | stripped, warning (children get no skills/MCP; asks route to the parent) |
| `tools:` Task / Agent | **always stripped**, warning — depth-by-omission is the depth guard |
| `tools:` **omitted** (CC: inherit everything) | **read-only set** (Read, Glob, Grep) + warning "no tools listed — read-only by default; add `tools:` to widen" |
| `disallowedTools:` | subtracted after mapping |
| `model:` inherit / sonnet → parent; haiku → budget; opus → frontier; anything else → parent + warning | preference |
| `permissionMode`, `color`, `hooks`, `skills`, `memory`, `maxTurns` (→ `stepCap` if numeric) | ignored; `hooks`/`skills` produce a warning |

Unrecognized frontmatter keys never fail a load; a file that fails to parse is listed
with a warning and not offered to the model. **Warnings are for the user** (Settings,
consent card); the Task roster the model reads carries the mapped tools only.

## §6 Settings

`SettingsPanel` row "Specialists" under Permissions → `SpecialistsSection` (+ the (i)
explainer, three sections). Tier pickers reuse `ModelPicker` (`includeClaude=false`);
a pick sends `{providerId, modelId}` and re-reads (the backend supplies `label`). Roster
rows: name, charter chip, `prefers budget/frontier`, `N warnings`; expand → tools, file
path, shadows, every warning. Footer: Refresh (re-read) and Open folder.

## §7 Permissions and safety (unchanged posture, restated for 1c surfaces)

- Approving the hire is the grant; the envelope (#6) is rendered from the mapped
  definition. Nothing in the popup can approve, deny, or widen anything except through
  the same `PermissionButtons` → `respondToPermission` path a top-level ask uses.
- `task_id` calls never offer Always Allow (1b Test 10) — `ToolCard` suppresses it.
- Steer/interrupt IPC take the **parent** session id; the host's own-children check is
  the authority (a foreign `childId` reads identically to a nonexistent one).
- Reports remain information, never authority (parent §5).

## §8 Testing

Renderer (branch already carries some; the plan pins the rest): reducer — nested ask
match / placeholder reclaim / responded / expired / held; report fold-in and the
no-card fallback; run record onto the card; note segments; thinking routing.
`SpecialistsChip` — chip label states, popup grouping, answering from the popup clears
the card. `SpecialistsSection` — unset/set tiers, warnings shown, refused write reverts.
Workbench — `workbench-fixture-actions` (updated), `workbench-mock-contract` (MOCK_ONLY
emptied when the backend lands), `workbench-boot-check.mjs`.

Main: catalog precedence + shadowing; CC mapping table (Task/Agent always stripped;
omitted tools → read-only; unmappable → warning; charter derived); watcher hot-reload;
Task tool re-created on roster change; ledger emitter fires on every write; `notes` on
the record and idempotent merge; broker `PermissionHeld`; replay re-emits pending asks;
`specialists:*` channel parity across five surfaces; `assistant-thinking`-with-text
stamped re-emit but never a payload-less heartbeat.

Hands-on (Destin, per the standing rule): a checklist like 1b's, covering the ten
approved behaviours end to end on a real background hire.

## §9 Docs to update in the same PR

`.claude/rules/native-specialists.md` (1c invariants: nested asks, fold-in, catalog,
mapping table, popup as management surface), `youcoded/docs/native-runtime.md` →
"Specialists (plan 1c)", `docs/MAP.md` (new files), ROADMAP `#specialists` items
closed/rewritten (GC → depends on delete-conversation; promote/viewer as ideas),
`youcoded/desktop/CLAUDE.md` if the workbench verbs deserve a line.
