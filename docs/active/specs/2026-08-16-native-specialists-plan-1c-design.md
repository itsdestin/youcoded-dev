---
status: draft
date: 2026-08-16
revised: 2026-08-16 (two independent reviews — see the handoff doc for what changed and why)
type: spec
repos: [youcoded]
tags: [native-runtime, specialists, subagents, m7, chat-ui, settings]
parent: docs/active/specs/2026-08-11-native-specialists-design.md   # the M7 design this completes (stage one)
relates:
  - docs/archive/plans/2026-08-12-native-specialists-plan-1a-core.md
  - docs/archive/plans/2026-08-12-native-specialists-plan-1b-background-durability.md
  - docs/archive/handoffs/2026-08-20-specialists-1b-testing-checklist.md
  - docs/active/handoffs/2026-08-16-specialists-1c-handoff.md   # review-round history + reviewer verdicts live THERE, not here
ui_branch: youcoded feat/specialists-1c-ui (worktree worktrees/specialists-1c) — the approved renderer, built workbench-first; §7 lists where it trails this spec
---

# Native specialists — plan 1c design (chat UI, management popup, definitions, Settings)

**Approved by Destin 2026-08-16 in the UI Workbench** ("good enough for now"), then
revised the same day on two independent reviews. Plan 1c is the last piece of stage one
of the M7 specialists design: 1a shipped foreground hires, 1b shipped background
execution, durability, steering, routed asks, and the model tiers' storage; **1c ships
the way all of that looks and is managed, specialists defined by files, and the
Settings page.**

The renderer already exists on the branch named above — the real components, edited in
place against fake channels (`MOCK_ONLY`). This spec is written for the person building
the backend those channels promise, plus the few renderer edits the review added (§7).

## §0 Scope

**In:**

1. **Chat card + management popup** — everything about one helper lives on its
   launching Task card and in one popup; a background hire renders like a foreground one
   (Destin's 1b hands-on directive; ROADMAP `#specialists`).
2. **Specialists from files** — a personal folder plus Claude Code's two `.claude/agents/` folders (user-level and
   in the project), re-read whenever a file changes, mapped through a strict tool table, with a starter file.
3. **Settings → Specialists** — the budget/frontier model pickers 1b left unset, and
   the roster with loader warnings.

**Shipped separately, before 1c:** the "pending permission card vanishes on renderer
reload" bug (ROADMAP `#permissions`). It matters more once a helper's ask can wait five
minutes, but it is independent, small, and testable alone — it must not share a PR with
the file catalog.

**Out, with reasons (Destin agreed 2026-08-16):**

| Item | Why not now | Where it goes |
|---|---|---|
| Child-transcript cleanup (GC) | The ROADMAP item hangs it on "deleting a parent conversation", and the app has **no delete-conversation feature at all** (no `conversations:*delete*` channel; `SessionStore` has no delete; the only destructive path prunes index records). Nothing to hook into. | ROADMAP note rewritten to depend on a future delete-conversation feature |
| Promote foreground → background | A foreground hire holds the parent's turn open on an awaited promise; promotion means resolving that promise with a launch ack and re-homing the reservation — invasive for a rare action. | ROADMAP `#specialists` idea |
| Open a helper's full transcript in a viewer | Activity already shows the work inline; a viewer needs a new read path (`getHistory` serves live sessions only; `resume()` refuses specialist headers by design). | ROADMAP `#specialists` idea |
| Project-level **native** specialists folder (`<cwd>/.youcoded/specialists/`) | `.claude/agents/` already covers "travels with the project" and exists in real repos; the native project folder would be empty everywhere on day one and costs a fourth source to fingerprint, a Settings group and collision tests. Adding it later is purely additive. | ROADMAP `#specialists` idea |
| Per-helper **tokens / cost** on the card (parent §6 "live rows") | The ledger records `steps` only; per-child token accounting is new plumbing in the child session, not a display change. Elapsed + steps is what 1c shows. | ROADMAP `#specialists` idea |
| **Strict per-action toggle** (parent §5: "a strict per-action toggle exists in settings") | Never shipped in 1a/1b; 1c's Settings page has a natural slot for it but it is a permissions-model change, not UI. | ROADMAP `#specialists` `#permissions` idea |
| Hidden utility specialists, CLI bridge, stage-two plans | Parent-spec phasing. | Parent spec |

## §1 The design (rules only — the review history is in the handoff doc)

| # | Rule |
|---|---|
| R1 | **One card per helper, everything on it.** A helper's routed permission ask renders inside its Task card's Activity — the `?` row grows the same Yes / Always Allow / No a top-level ask has. A background report folds into the same card as its Report section (`ToolCallState.specialistReport`), identical to a foreground hire's Response; the standalone `SpecialistReportCard` is only the fallback when the card is not on the timeline. The assistant's reply to a report stays a normal message below. |
| R2 | **The card's status is its run record, not its tool result.** Spinner + "Working in the background · 1m 36s" until the ledger settles; then Finished / Failed / Stopped + elapsed + steps; "may be stuck" when stale. Header suffix "· in the background" only while running. Collapsed tool groups count a still-working helper as running and add "— N waiting on you". |
| R3 | **A held ask is a state, not a disappearance.** After the 5-minute redirect the ask stays answerable; the row says the helper carried on and a Yes now lands as a follow-up — with the assistant, if the helper has since finished ("Etta has finished; a Yes now tells the assistant, which can send her back"). Outside-the-folder asks say why there is no Always Allow. |
| R4 | **Approving the launch IS the grant, and the card says exactly what.** A consent envelope above the buttons, rendered from the *mapped* definition: who, **defined by what** ("Built in" / "Your specialists folder · x.md" / "This project's .claude/agents/x.md"), in which folder, read-only vs can edit/run commands, tools, model (tier → resolved name, or the honest fallback), and that deletes/secrets/outside-the-folder still ask. `task_id` calls read as note / resume / stop and never offer Always Allow. |
| R5 | **Send a note / Stop** on a running card; notes — the user's and the assistant's — appear in Activity as `note` rows. A note is capped at 2,000 characters (it enters the helper's context). |
| R6 | A helper's reasoning shows in its card as a collapsed **Thinking** row, never in the parent's thinking bubble. |
| R7 | **Header labels** say what the call is: "Wren the Whistling Worker ↳ Run the release checklist"; "Hiring a worker" before the name exists; "Note to / Resuming / Stopping Wren…" for `task_id` calls. |
| R8 | **Status-bar chip:** "N specialists" while helpers work; amber "N need you" when an ask waits; "N finished" after; hidden when the session has none. One indicator (parent §6). |
| R9 | **The chip opens the management popup** — the place asks are answered, notes sent, helpers stopped, without hunting the conversation. Answering in the popup or on the card clears both (same request id). Cards in the conversation do **not** move. |
| R10 | **Popup card layout:** name (dotted-underlined — it IS the link to the card) in-line with "· on <model>" and "· in the background"; no role tag, no charter copy, no status pill on a card that is asking; Note / Stop top-right while running, a Finished pill otherwise; the job on its own line; the chat card's status line; then the chat card's own **Briefing / Activity / Report** sections verbatim (`AgentSections`) — collapsed, one open at a time; the amber ask band (request left, buttons right, notes only when they apply) is the **bottom** of the card. Grouped Needs you → Working → Finished. |
| R11 | **Settings → Specialists** (row under Permissions; Dialog + (i)): Budget / Frontier pickers, "not set — helpers use the conversation's model" when unset; the roster grouped Built in / Your specialists / Claude Code agents (user-level and this project's, told apart by file path), each with charter, tools, file path, and warnings for anything the loader removed, skipped, or could not parse; Refresh; Open folder (the personal one). Three non-working looks, never confused: **loading**, **failed** (`ErrorState` recoverable + Retry — a thrown `specialists:list` is a failure, not a forever-spinner), and **not available here** (Android's `SessionService.kt` not-implemented → a plain "Specialists run on desktop" state, rendered with the existing `EmptyState` from `states.tsx` — one message does not earn a new component). |
| R12 | **A running helper keeps the definition it launched with.** Editing or deleting its file mid-run changes the next hire, never this one — the consent card promised a specific set of tools. |

## §2 Contract — renderer ↔ backend

The renderer half exists (types in `shared/types.ts`, actions/reducer in
`chat-types.ts` / `chat-reducer.ts`, selectors in `hooks/useSpecialists.ts`, components
listed in §7). This table is what the backend must feed it and through what.

| Renderer expects | Channel / event | Backend obligation |
|---|---|---|
| `SpecialistRunView` on the Task card (`ToolCallState.specialistRun`, keyed by `parentToolCallId`) → status, elapsed, steps, model, stale, notes | `specialists:event { kind:'run', sessionId, run }` (push) | Emitted **by `DelegationLedger` itself**, from ONE place: a private `mutate()` wrapper around `home.mutateJson` that emits after the write. Every write already funnels through that call (7 direct sites today — `recordStart`, `update`, `updateIfRunning`, `updateUnlessCompleted`, `appendMissedSteers`, `takeMissedSteers`, `claimUndelivered`; `markInjectionAttempted` / `confirmDelivered` / `releaseClaim` route through `update`), so the wrapper covers all of them and any method added later — never a host-side wrapper, never a per-method emit (an enumerated list is stale the day a method is added). Always emit; the renderer's set is idempotent, so a write that only touched delivery bookkeeping costs one no-op. `run` = the record minus delivery bookkeeping, plus `model { label, via, fallback }` and `notes[]`. Replayed for every record of the parent on session attach and after `TRANSCRIPT_REPLAY` — bounded by 1b's per-conversation spawn budget (`SPECIALIST_SPAWN_BUDGET_PER_SESSION`, 30). |
| `note` rows in Activity | **on the `run` event — `run.notes`** (no separate note message; plan review 2026-08-16) | Every accepted note — the user's (`specialists:steer`) or the model's (`Task` + `task_id`) — is appended to the ledger record as `notes: { text, from, at }[]` (additive; old records read `[]`) **in the same write** as anything else that note causes (a parked steer and its note land together, per the ledger's one-write rule). The ledger's change emitter then carries it to the card within milliseconds; the reducer **rebuilds** the card's note rows from `run.notes` on every update — idempotent by construction, no merge key (**§7 — the branch had a separate note action; it goes**). |
| Nested ask under the right card (`PERMISSION_REQUEST.specialist { childId, agentType, title, parentToolCallId }`) | `hook:event PermissionRequest` | `permission-broker` spreads `specialist` incl. **`parentToolCallId`** (child-ask-router gets it from `wireChildLive`). |
| Held state on the row (`PERMISSION_HELD`) | `hook:event PermissionHeld { _requestId }` | New broker event when the 5-minute hold flips `timedOut`. |
| Thinking rows (`TRANSCRIPT_ASSISTANT_REASONING.parentAgentToolUseId`) | stamped `assistant-thinking` | `assistant-thinking` **with text** joins `SUBAGENT_DISPLAY_TYPES`' stamped re-emit and the `getHistory` merge filter; payload-less heartbeats do not (the frozen-surface WHY still binds). |
| Report fold-in (`TRANSCRIPT_USER_MESSAGE.injectedMeta.parentToolCallId`) | existing | Already persisted in the parent JSONL by 1b — no change. |
| `specialists.list()` → `{ definitions: SpecialistDefinitionView[], folders: { personal: string; claudeUser?: string; project?: string } }` | `specialists:list` (+ `{ ensurePersonalFolder?: true }` from Settings only) | §3 catalog for the session's cwd — **always re-reads the folders** (this is also Settings' Refresh). With `ensurePersonalFolder` the personal folder and its starter file are created if absent — the one deliberate bend of the "`~/.youcoded/` appears on first write" convention, accepted so Settings' *Open folder* can use the app's existing `shell:open-path` instead of a seventh channel. |
| `specialists.getDelegatedModels()` → `DelegatedModelsView` | `specialists:delegated-get` | `DelegatedModels.get` × 2; `label` resolved from the provider catalog. |
| `specialists.setDelegatedModel(tier, binding\|null)` → `{ok, error?}` | `specialists:delegated-set` | `DelegatedModels.set`; an id absent from the catalog is refused, never substituted. |
| `specialists.steer(sessionId, childId, text)` → `{ok, error?}` | `specialists:steer` | `NativeSessionHost.steerSpecialist(parent, child, text)`; own-children-only inside; 2,000-char cap with a plain message. |
| `specialists.interrupt(sessionId, childId)` → `{ok, error?}` | `specialists:interrupt` | `NativeSessionHost.interruptSpecialist`. |
| Open the personal folder | existing `shell:open-path` with `folders.personal` | — |

All new channels ride the standard five surfaces (`ipc-handlers` · `preload` ·
`remote-shim` · `remote-server` WS · `SessionService.kt` not-implemented) with
`ipc-channels.test.ts` parity, and are **not** gated on `native.supported` (same reason
as `permissions:*`: remote-shim hardcodes it false and a phone must be able to answer an
ask). On Android the renderer maps not-implemented to the "desktop only" state (R11).

## §3 Specialists from files

**Catalog** (`harness/specialists/catalog.ts`, replaces the module-load `BY_ID` map):

- **Sources:** built-ins, Claude Code's two agent folders — user-level
  `~/.claude/agents/*.md` and project `<cwd>/.claude/agents/*.md` (both mapped, §3.2;
  CC itself reads both, so "CC compatibility" means both) — and personal
  `~/.youcoded/specialists/*.md`. **Ids are unique and built-in ids are reserved — there
  is no shadowing.** A file whose id collides with a built-in or with an already-loaded
  file is skipped with a warning ("`worker` is a built-in name — rename this file"),
  listed in Settings like a parse failure, and never offered to the model. **Load order
  decides who keeps a contested id: built-ins → personal → `~/.claude/agents/` →
  `<cwd>/.claude/agents/`** — your own files never lose to a repo you cloned. WHY: "later
  shadows earlier" would let a cloned repo's `.claude/agents/worker.md` silently replace
  the built-in Worker for anyone who opens it — the consent card would still be honest
  about *tools* (rendered from the mapped file), but nothing at hire time would say
  "this is the repo's Worker, not yours". Reserving ids closes that hole and deletes a
  precedence tier, a `shadows` field, and its tests.
- **In memory, per project folder (cwd).** The catalog is read **when a session attaches
  to a folder** (create / resume), and the Task tool for that session is constructed
  **only after that read completes** — so no session ever ships the model an empty
  roster. Every existing sync call site (`resolveSpecialist` in `tools/task.ts` and
  `native-session-host.ts`; `listSpecialists` in `tools/task.ts`) reads the in-memory
  catalog for its session's cwd; none of them wait on disk.
- **When files are re-read (no watchers — plan review 2026-08-16):** on conversation
  open (create / resume), **at each turn start if any file changed**, and on Settings'
  Refresh / `specialists:list`. Staleness is a **per-file fingerprint** (name + mtime +
  size over the handful of `.md` files in the three folders, ~1 ms) — never a directory
  mtime, which does not move when a file inside is edited. WHY not watchers: the Task
  tool is rebuilt from memory every turn anyway, so watchers only bought a Settings list
  that moves while you look at it — Settings has Refresh. Dropping them deletes three
  watchers, debounce, per-folder open/close bookkeeping, a roster push event, and the
  "folder appears later" edge case. What you lose: Settings won't move until Refresh.
  What you keep: drop a file in, the very next message can hire it. **Never create
  `.claude/agents/` inside a user's repo.**
- **Offered cap:** at most **20** non-built-in specialists (`MAX_OFFERED_SPECIALISTS`,
  load order) are offered to the model; the rest are listed in Settings with a warning
  ("not offered — more than 20 specialists are defined for this folder"), never silently
  cut. WHY: every offered specialist is a line in the Task tool's instructions on every
  turn, and a 20-item menu is already long; shared repos' `.claude/agents/` can hold more.
- **Provenance:** the catalog carries `source` + `path`; the consent card and the Settings
  row both show one line — "Built in" / "Your specialists folder · x.md" / "This project's
  .claude/agents/x.md" / "Your ~/.claude/agents/x.md" — so a repo-defined helper is never
  mistaken for one you wrote (the hole reserved ids only half-closed).
- **Task tool re-creation:** `createTaskTool()` interpolates the roster into its
  description at construction; `HarnessSession.syncTaskTool` builds only when absent.
  Change it to **rebuild at every turn start** from the in-memory catalog — an identical
  roster yields an identical description (no prompt-cache cost), a changed roster yields
  a new one, and there is no version counter to keep honest. Never rebuild mid-turn.
- **No teardown cleanup and no per-file description over 300 chars in the tool:** several conversations share one cwd, so the catalog keeps every folder it has
  seen for the process lifetime; and each offered `description` is capped at 300 characters
  in the Task tool (full text in Settings, with a warning) — the 20-count cap alone still let
  a repo put twenty paragraphs into every turn.
- **The consent card looks up the definition per cwd and refetches once on a miss** — the
  card has no push telling it the backend re-read the folders at turn start; a hire of an
  id it has never seen is that signal.
- **A running helper is unaffected by any of this** (R12): its definition was copied at
  spawn.

**Personal file format** — frontmatter + body:

```yaml
---
name: Docs Writer            # display; id = filename stem unless `id:` given
description: …               # one line; the model reads it, Settings shows it
tools: [Read, Write, Edit, Glob, Grep]   # native names; unknown → stripped + warning
model: budget | frontier | parent        # preference, never a lock (default parent)
stepCap: 40                  # optional
reportBudgetTokens: 2000     # optional
id / version / author        # reserved for the marketplace (parent §2); accepted, unused
---
(system prompt body — wrapped in the built-ins' shared prefix/suffix for KV-cache reuse)
```

`charter` is **derived** from the mapped tools — `read-write` iff any of `Write / Edit /
Bash` — never declared, so a file cannot claim read-only while holding a shell.

**Starter file.** When the personal folder is first created (§2, `ensurePersonalFolder`)
it gets `example.md`: every field filled in and explained in plain words — what `tools:`
accepts, what budget/frontier mean, that omitting `tools:` yields read-only. A file that
fails to parse is listed in Settings with the parse error as its warning and is not
offered to the model.

**§3.2 Claude Code `.claude/agents/*.md` mapping table** — safety-relevant (parent §2:
narrow on any ambiguity; the consent card renders the *mapped* result):

| CC frontmatter | Native |
|---|---|
| `name` / `description` / body | id (slug of name) / description / system prompt |
| `tools:` Read, Write, Edit, Bash, Glob, Grep, WebFetch, WebSearch, TodoWrite | same name |
| `tools:` MultiEdit | stripped, warning ("Edit covers it") |
| `tools:` NotebookEdit, KillShell / BashOutput, SlashCommand, Skill, ExitPlanMode, AskUserQuestion, ListMcpResources, any `mcp__*` | stripped, warning (children get no skills/MCP; asks route to the parent) |
| `tools:` Task / Agent | **always stripped**, warning — depth-by-omission is the depth guard |
| `tools:` **omitted** (CC: inherit everything) | **read-only set** (Read, Glob, Grep) + warning "no tools listed — read-only by default; add `tools:` to widen" |
| `disallowedTools:` | subtracted after mapping |
| `model:` inherit / sonnet → parent; haiku → budget; opus → frontier; other → parent + warning | preference |
| `maxTurns` (numeric) → `stepCap`; `permissionMode`, `color`, `hooks`, `skills`, `memory` | ignored; `hooks` / `skills` / **`permissionMode`** produce a warning (silent narrowing is what the warnings list is for — a file saying `bypassPermissions` must not look honored) |

Unrecognized keys never fail a load. **Warnings are for the user** (Settings, consent
card); the Task roster the model reads carries the mapped tools only.

## §4 Settings

`SettingsPanel` row "Specialists" under Permissions → `SpecialistsSection` (+ (i)
explainer). Tier pickers reuse `ModelPicker` (`includeClaude=false`); a pick sends
`{providerId, modelId}` and re-reads (the backend supplies `label`). Roster rows: name,
charter chip, `prefers budget/frontier`, `N warnings`; expand → tools, file path,
every warning (stripped tools, skipped id collision, parse error). Footer: Refresh, Open
folder (`shell:open-path` on `folders.personal`). Loading / failed / not-available per
R11 — a failed read must never look like loading. `specialists.list` returns
`{ definitions, folders: { personal, claudeUser?, project? } }`.

## §5 Permissions and safety (posture unchanged; restated for the new surfaces)

- Nothing in the popup can approve, deny, or widen anything except through the same
  `PermissionButtons` → `respondToPermission` path a top-level ask uses.
- Steer / interrupt IPC take the **parent** session id; the host's own-children check is
  the authority (a foreign `childId` reads identically to a nonexistent one).
- **A remembered grant never covers a file-defined helper:** a hire's
  permission subject stays `${charter}:${workDir}` for built-ins (existing grants keep
  working) and is `${charter}:${workDir}:file:${id}` for a personal / Claude Code file, and
  the hire card offers no Always-allow for a file-defined helper. WHY: a file can change
  under a grant, and a repo's `.claude/agents/x.md` writes its own instructions — the
  provenance line (R4) only protects if the card is shown, so for these it always is.
- The consent envelope and the Task roster both derive from the mapped definition;
  a source file's claims never reach either.
- Reports remain information, never authority (parent §5).

## §6 Testing

**Renderer** (some already on the branch; the plan pins the rest): reducer — nested ask
match / `sa-perm-` placeholder reclaim (the ask beats the rAF-batched tool-use event by
~50 ms — the race that hung 1b Test 1) / responded / expired / held; report fold-in and
the no-card fallback; run record onto the card; note merge idempotence; thinking routing.
`SpecialistsChip` — chip states; popup grouping; answering in the popup clears the card;
accordion; note rows are rebuilt from `run.notes` (idempotent; two same-millisecond notes stay two rows). `SpecialistsSection`
— unset/set tiers, warnings, refused write reverts, loading vs failed vs not-available
(a thrown `list` is never "Loading…"). Workbench — `workbench-fixture-actions`,
`workbench-mock-contract` (`MOCK_ONLY` emptied as channels land),
`workbench-boot-check.mjs`.

**Main:** catalog sources (all three CC/personal folders + built-ins); id collision →
warning + skipped, built-in ids reserved (a project `worker.md` never replaces the
built-in Worker); per-cwd catalog read before Task tool construction (a session created
in a folder with a personal file sees it on turn one); re-read at turn start only when a file's fingerprint changed (content edits detected — per file, not
per directory; a missing `.claude/agents/` is never created); offered cap (the 21st is listed,
warned, not offered); CC mapping
table (Task/Agent always stripped; omitted tools → read-only; unmappable → warning;
charter derived; parse failure → warning, not offered); Task tool rebuilt at turn start, never mid-turn; running helper keeps its spawn-time definition;
ledger emitter — the guard is a source-level test that `home.mutateJson` appears exactly once
in the file (inside `mutate()`); `notes` on the record — a parked steer and its note in ONE
write; broker `PermissionHeld`;
`specialists:*` channel parity across five surfaces; `assistant-thinking`-with-text
stamped, heartbeat never; note cap.

**Hands-on (Destin):** a checklist like 1b's covering R1–R12 end to end on real hires.

## §7 Where the UI branch trails this spec (renderer tasks for the plan)

The branch is the approved design; the reviews added these small edits:

1. `specialists.list` returns `{ definitions, folders }` (mock returns a bare array
   today; `useSpecialists` expects an array); Settings' Open folder calls
   `shell.openPath(folders.personal)`; the mock's `specialists.openFolder` and its
   `MOCK_ONLY` row go.
2. `SpecialistsSection` tells **loading / failed / not-available** apart. Today every
   throw is swallowed (`catch → null`) and `roster === null` renders "Loading…" forever —
   so an Android not-implemented AND a desktop bug both look like a spinner. Failed →
   `ErrorState` recoverable + Retry; not-available → the small desktop-only state.
3. Held-ask copy on a helper that has finished (R3 wording). Note `useSpecialists`
   classifies `asks.length > 0 → 'needs-you'` before it looks at `run.status`, so the
   finished-with-held-ask case never reaches a status branch today.
4. Note length cap surfaced in `SpecialistActions` (counter + disabled Send past 2,000;
   nothing caps it today).
5. The `SPECIALIST_NOTE` action and the mock's note echo go; `SPECIALIST_RUN_CHANGED`
   rebuilds the card's note rows from `run.notes` (today the branch appends per note event
   and would double rows on replay).
5b. Provenance line ("defined by …") on `SpecialistEnvelope` and the Settings row; the
   footer copy becomes "Files are re-read each time you send a message; Refresh to re-read
   now."; two stale comments naming `specialists:run-changed` (`shared/types.ts:411`,
   `chat-types.ts:516`) get the real channel name.
6. Roster group copy: "Claude Code agents" (user-level + project, by path) replaces "This
   project (Claude Code format)".
7. Starter file's existence is a backend concern; nothing on the branch.

## §8 Docs to update in the same PR

`.claude/rules/native-specialists.md` (nested asks, fold-in, catalog + per-cwd read
order + turn-start re-read (no watchers, per-file fingerprint), reserved ids / no
shadowing, offered cap, provenance, mapping table, ledger `mutate()` chokepoint, notes on
the record, popup as management surface, R12), `youcoded/docs/native-runtime.md` →
"Specialists (plan 1c)", `docs/MAP.md` (new files), ROADMAP `#specialists` items
closed/rewritten (GC → depends on delete-conversation; promote / viewer / project native
folder / tokens-cost / per-action toggle / live-updating Settings roster as ideas), `youcoded/desktop/CLAUDE.md` if the
workbench verbs deserve a line.
