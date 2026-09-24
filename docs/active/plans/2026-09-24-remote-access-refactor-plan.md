---
date: 2026-09-24
status: draft
type: plan
topic: Remote access refactor — one assistant core with one feature list that the desktop window, a phone browser and (later) the Android app all reach through the same doors; extends simplification Phase 4 with a computer-owned session record, per-session delivery and resume
---

# Remote access refactor — plan (draft, not approved)

> **Status.** Exploration output, 2026-09-24. Nothing here is approved or scheduled. It
> **extends** simplification Phase 4 (`docs/active/plans/2026-09-16-simplification-phases.md`,
> "Phase 4 — one door for desktop and phone"); where it disagrees with that plan's run list,
> Phase 4's list stands until Destin approves this one. Companion:
> `docs/active/plans/2026-09-24-android-rebuild-plan.md` — the Android rebuild is built on
> Stages 1–4 below.
>
> **Evidence.** Six read-only investigations on 2026-09-24 against app master `ab15a5858`.
> Line numbers are from that commit and will drift. Anything marked *(unverified)* was
> reasoned from the code, not run.

## For Destin — what this is, in plain words

The app's features live on your computer. Today there are **three separate lists of every
feature**, each written by hand:

1. one for the computer's own window (`ipc-handlers.ts`, 5,535 lines);
2. one for a phone or browser connecting over remote access (`remote-server.ts`, 4,154 lines);
3. one inside the Android app for when the phone works alone (`SessionService.kt`, 5,047 lines
   of Kotlin, plus ~10,000 more lines copying computer logic).

Each list has to be updated by hand, and they drift apart. When they drift you get
"works on the computer, blank on the phone" bugs. Examples so far: the phone's Resume list, the
remote-access panel coming up blank, and native sessions not working from your phone.

**The fix: one list and one "brain" that every screen talks to.** The computer window, a phone
browser and later the Android app all read the same feature list and call the same code. A
feature added once works everywhere, or openly says "not on this device".

This plan also fixes how the phone *stays in sync* with the computer. Today the phone gets
every conversation's output, even ones it isn't showing. After a dropped connection it
downloads everything again. It also depends on the computer's window being open to learn the
current state. After this plan, the computer keeps the official record of each conversation. A
phone asks only for what it is looking at, and after a blip it catches up on just what it missed.

**What you would notice when it's done:**
- On the phone, anything that behaved differently from the computer now behaves like the
  computer. Each step's report lists these changes so none are a surprise.
- Reconnecting is fast and cheap. The phone stops being slowed down by conversations it isn't
  showing.
- The phone and computer agree on queued messages, permission mode, the model name and the
  "working" dots.
- Buttons on the phone can react instantly instead of waiting for the computer.
- Nothing on the computer's own screen should look different.

**What it costs:** roughly 5,000–6,000 fewer lines in the two biggest files, plus about 2,000
lines of hand-written checking tests replaced by automatic checks. It is **12–20 separate work
runs**. While the first few runs happen, **nobody else may edit the two "door" files**. Stage 0
below explains how to keep that window short.

**Why it goes before the Android rebuild:** the Android plan runs this same brain on the phone.
Build the one list first, and the phone gets it for free. Build the phone first, and we write
list number four.

## Where things stand (facts, 2026-09-24)

| Thing | Today | Evidence |
|---|---|---|
| Desktop door | One function `registerIpcHandlers` (`main/ipc-handlers.ts:368-5535`): 297 request/response channels, 10 fire-and-forget, 4 different "push to windows" helpers, ~36 banner-separated families | R1 |
| It also builds the assistant | The native runtime (NativeHome → … → NativeSessionHost, ModelManager) is constructed **inside** that function (`:2697-3264`) and handed to the remote door afterwards by a setter (`remote-server.ts:439-444`, 11-field bag) | R1 |
| Remote door | `RemoteServer.handleMessage` (`remote-server.ts:1713-3923`) is one 2,210-line `switch` with 236 case labels, all raw strings (zero use the shared `IPC` constant) | R2 |
| Feature-name lists | **Four** hand-kept copies: `shared/types.ts` IPC (393), preload's inlined copy (373), remote-server literals (236), remote-shim literals — and a **fifth implementation** of the whole surface, the UI Workbench's fake backend `renderer/dev/workbench/mock-shim.ts` (3,478 lines). Plus two more hand lists in the shim (`MESSAGE_KIND`, `REJECT_ON_NOT_OK`) — the latter has a documented gap (`models:installed`) | R1, R2, review |
| Type checking | Only `session` and `on` (2 of ~40 namespaces) are compile-checked (`shared/bridge-types.ts`, `satisfies`). The renderer's own view of `window.claude` is a second, unchecked copy (`renderer/hooks/useIpc.ts:19-551`, mostly `any`) | R4 |
| Parity tests | `tests/ipc-channels.test.ts` (2,279 lines) checks names by text search, one hand-written block per past feature; catches missing names, never wrong shapes. Every shape bug found so far was found after shipping | R4 |
| Delivery | `broadcast()` (`remote-server.ts:4083`) sends every session's terminal and chat events to every connected client | R2 |
| Reconnect | `runRestore()` (`:1470-1646`) resends every session, a full chat snapshot, a terminal replay, and up to 10,000 buffered tool events **per session**. Only the terminal has real resume (per-session offset + epoch, `ptyPass()` `:937`) | R2 |
| Where the phone's state comes from | The chat snapshot a phone receives is **assembled from the desktop's open windows**: `main/chat-snapshot.ts` `requestMergedChatSnapshot()` (`:97-152`) asks every main window for the sessions it owns (2-second timeout each, `chat-snapshot.ts:7`), with drag-between-windows race handling that silently degrades the snapshot; on total failure the phone gets an empty "degraded" list (`remote-server.ts:1547-1551`) | R4, review |
| "Working / needs you" status | Computed **only in the renderer**: `renderer/hooks/useAttentionClassifier.ts:73-190` reads the terminal screen in the window, and main learns it through a relay (`useRemoteAttentionSync.ts:1-15`) whose comment says it exists to avoid running the classifier in main | review |
| Three ways to fill a window | Main window pulls pages itself; detached/buddy windows use claim + `replayLiveState`; remote clients get the snapshot. No single "connect" contract | R4 |
| Platform checks | Roughly 40–85 `isAndroid()` and 45–70 `isRemoteMode()` sites depending on how they are counted (recount before budgeting Stage 5); three separate platform-detection modules (`platform.ts`, `state/platform.ts`, `platform-bootstrap.ts`), one of which exists to patch a shipped race. About half the checks are real touch/layout decisions; the rest stand in for "can this backend do X" | R4 |
| Protocol version | None. `auth:ok` carries ad-hoc booleans (`sessionNaming: true`) | R2 |
| Security to keep | Tailscale-only bind; bcrypt password; per-device hashed tokens with persisted revocation; origin allow-list; 64-socket/16 KB pre-auth caps; backpressure (8 MB pause / 32 MB close); four host-admin channels refused plus `remote:disconnect-client` deliberately unhandled | R2 |
| Phase 4 precondition | **Met.** Plan C's `remote-` test cluster merged (youcoded#527) | R6 |
| Unwritten precondition | `feat/specialists-plans-ui` (active today) changes the door files: +325/−18 across door/shim/preload/Kotlin. Nothing says whether Phase 4 waits for it | R6, checked 2026-09-24 |

## The target shape

```
                        ┌──────────────────────────────────────────────┐
                        │  CORE  (plain Node — no Electron imports)    │
                        │                                              │
                        │  createRuntime(platform, userDataDir)        │
                        │   ├ assistant runtime (NativeSessionHost,    │
                        │   │   providers, models, search, MCP, …)     │
                        │   ├ session manager + PTY host protocol      │
                        │   └ SESSION RECORD: per-session live state   │
                        │       + numbered event log (new, Stage 4)    │
                        │                                              │
                        │  CHANNEL TABLE — one entry per feature:      │
                        │   name · kind · request/response types ·     │
                        │   handler(payload, ctx) · remote policy ·    │
                        │   session-scoped? · user-action or read?     │
                        └──────────────┬──────────────┬────────────────┘
                                       │              │
                    ┌──────────────────┘              └──────────────────┐
          DESKTOP DOOR (Electron IPC)                        SOCKET DOOR (WebSocket)
          iterates the table; owns window                    iterates the table; owns auth,
          push helpers, dialogs, window                      pairing, backpressure, per-session
          controls, detach                                   subscriptions, resume, version
                    │                                                  │
          computer's own windows                   phone browser · paired Android app ·
                                                   (Android plan) the phone's OWN core, locally
```

**Platform** is a small interface the core is given at startup. It holds the few things only
the host OS can do: open a URL, pick a folder, show a notification, store a secret, read the
clipboard. Desktop passes an Electron implementation. The Android plan passes a Kotlin-backed
one. This removes the core's only real Electron dependencies: `app.getPath('userData')` at 32
sites, `shell.openExternal`, and 3 dialogs (R1 §3).

## The seams — where we cut

| # | Seam | Cut | What collapses into it |
|---|---|---|---|
| S1 | **Runtime hoist** (Phase 4 D2) | New `main/create-runtime.ts` does the construction now at `ipc-handlers.ts:2697-3264`, plus the `sessionNamer`/`applyAutomaticTitle` closures (`:3000-3121`) and teardown (`:5471-5497`). `main.ts` calls it once and passes the result to both doors | The `setNativeRuntime` setter, the 11-field bag, and startup-order coupling between the two doors |
| S2 | **Platform interface** | `userDataDir` and a `Platform` object injected into `createRuntime` instead of `app.getPath`/`shell`/`dialog` | Makes the core runnable without Electron, which is the Android plan's foundation |
| S3 | **Contract + channel table** (Phase 4 D1, widened) | `shared/backend-contract.ts`: each channel declared once with name, kind (`handle`/`on`/`push`), request/response types, and policy fields. Handlers live in `main/ipc/<family>.ts` (~36 files matching today's banners) | The four name lists, `MESSAGE_KIND`, `REJECT_ON_NOT_OK`, the `useIpc.ts` duplicate type, and most of `ipc-channels.test.ts`. `mock-shim.ts` becomes compile-checked against the contract (it stays a hand-written fake, but can no longer drift silently) |
| S4 | **Door adapters** | Desktop door loops over the table and calls `ipcMain.handle/on`. Socket door loops over the table and replaces the 2,210-line switch with a generic dispatcher plus per-channel policy | ~2,000 lines of remote case bodies that copy desktop ones |
| S5 | **Session record** (new) | The core keeps, per session: live state (pending asks, working/idle, queued messages, permission mode, current model, status) and a **numbered event log** (chat, tool, terminal) in a bounded ring, extending the terminal's existing offset/epoch pattern | The remote snapshot, including `chat-snapshot.ts`'s whole per-window ownership merge and its drag-race handling; the detached window's `claimPending`/`replayLiveState`; the 10,000-event hook replay; and "things only one window knows" |
| S6 | **Per-session delivery** (new) | Clients say what they are watching (`session:watch`/`unwatch`). Session-scoped channels (declared in the table) go only to watchers; lifecycle events (`session:created`, `status:data`) and the small per-session summary a session strip needs (attention, name, unread) still go to everyone. **Must be one audience model**: the desktop already tracks "which window owns / subscribes to which session" (`WindowRegistry`, `sendForSession`); socket clients become entries in that same registry rather than a second "who wants this" list | The "every session's output to every phone" roadmap item |
| S7 | **Protocol version** (new) | `auth:ok` carries `protocolVersion` plus a `capabilities` object | Ad-hoc `auth:ok` booleans, and the renderer's platform-check workarounds (see S8) |
| S8 | **Renderer: one client, one platform answer** | (a) `window.claude` type derived from the contract; (b) one `capabilities` object resolved at connect (native runtime, raw PTY bytes, detach, max file size, theme-asset protocol…); (c) one platform module | Three platform detectors become one. ~50–60 capability-gap `isAndroid()/isRemoteMode()` checks become capability reads; touch/layout checks stay |
| S9 | **One transcript translator** (Phase 4 D3 + M5) | One `eventToAction(event, {live})` for the live window, buddy feed and history pages. `TranscriptEvent.data` becomes a compiler-checked union keyed on `type` | Three translators become one. The text-scanning `transcript-event-surface-parity.test.ts` becomes an exhaustive `switch` the compiler checks |

## Stages

Each stage is one or more worker runs, each with a fresh reviewer, per the Phase 4 execution
protocol. Gates are `bash scripts/verify.sh <app worktree>` plus the stage's named checks.

### Stage 0 — clear the road (no code; one decision)

- **Decide the specialists-branch order.** `feat/specialists-plans-ui` is active and edits the
  door files. **Recommend: let it merge first, then start Stage 1 immediately.** Starting
  Phase 4 now would force a painful merge into 12–20 in-flight runs.
- **Shrink the freeze.** Only Stages 1–2 need the two door files fully locked. They are short
  (≈2–3 runs). From Stage 3 on, each run moves one family into `main/ipc/<family>.ts`. After
  that, feature work edits the family file rather than the door files, so the lock only covers
  the family currently moving. Enforce it mechanically: a check in `scripts/close-out.sh` that
  warns when a branch touches a family file listed in a lock file
  `docs/active/locks/phase4.json`. "The coordinator checks open branches" has already failed
  once (R6 §4).

### Stage 1 — hoist the runtime (S1 + S2) · 1–2 runs · no visible change

- `main/create-runtime.ts` returns `{ …runtime objects, sessionNamer, applyAutomaticTitle,
  cleanup }`, taking `{ userDataDir, platform }`.
- Convert `metaBroadcaster`/`tagsBroadcaster` (module-level `let`s assigned as a side effect,
  `ipc-handlers.ts:459,500`) into values the runtime returns. This is an ordering trap if left
  alone.
- Shared mutable maps (`sessionIdMap`, `lastModelSeen`, `topicWatchers`, `lastTopics`) move into
  one `main/ipc/session-state.ts` owned by the runtime. **Never one copy per file:** that would
  silently split state that handlers share today.
- **Gate:** `rg -n "new NativeSessionHost|app\.getPath" main/create-runtime.ts` is empty.
  `ipc-handlers.ts` no longer constructs runtime objects. `remote-server.ts` no longer has
  `setNativeRuntime`. A new unit test constructs the runtime with a temp dir and a fake
  platform, with no Electron loaded. That test is the Android plan's first proof point.

### Stage 2 — the contract and the empty table (S3) · 1–2 runs · no visible change

- Add `shared/backend-contract.ts`. Move `bridge-types.ts` into it. Delete `useIpc.ts`'s
  `declare global` and derive `Window['claude']` from the contract (type-only, zero runtime
  risk).
- Normalise desktop calls to **one object argument**, as the shim already does. This is Phase
  4's named blocker, and it closes `bridge-types.ts`'s own gap: two same-typed positional
  parameters can be swapped without the compiler noticing.
- Preload cannot import modules (sandbox). So its channel constants are **generated at build
  time as a static list** from the contract. **This reopens decision D10** ("bridge stays
  hand-enumerated because it is the security boundary"). The proposal keeps it statically
  enumerated: generated code lists every channel explicitly, with no runtime Proxy. The source
  of the list changes; the boundary does not. **Needs Destin's OK.**
- Keep `mock-shim.ts` (the Workbench's fake backend) compiling against the contract, and run `node scripts/workbench-boot-check.mjs` in each stage that changes the contract.
- **Gate:** `tsc` green. A generated-file freshness check fails if preload's list is stale. Workbench boot-check green.

### Stage 3 — move the families (S3 + S4) · ~1 run per family, ~12–16 runs · phone changes listed per run

Lowest risk first (R1 §4). Each run moves one family into `main/ipc/<family>.ts`, deletes its
remote `case` bodies and desktop registrations, adds its request/response types, and deletes
that family's hand-written blocks in `ipc-channels.test.ts`:

1. tags, folders, defaults, modes, analytics, settings (the D6/B3 prototype-pollution fix rides
   along)
2. dev, update, account
3. skills, marketplace, theme-marketplace, first-run
4. sync, syncspaces, github, session/transcript (the B1 Resume-list fix happens by construction
   here)
5. native, models, engine, provider, search, specialists — **last**, because these have the
   richest closures and depend on Stage 1

Desktop-only families (`window`, `detach`, `dialog`, Electron half of `zoom`, `buddy`) are
entered as `desktopOnly: true`. The socket door refuses them **from the table**. Today's
refusal behaviour must be kept exactly: buddy throws, detach no-ops, window absent, admin
channels return `HOST_ADMIN_REFUSAL`, `disconnect-client` falls to `unsupported`. The ast-grep
rules `remote-admin-case-refuses` / `unpair-button-disabled-on-remote` keep guarding this.

Also in scope, and each must be decided per run rather than folded in silently:
- Remote-specific input checks inside today's case bodies (e.g. `session:create`'s
  shell-provider guard, `remote-server.ts:~1789`) become table **policy**. A mechanical merge
  would weaken or duplicate them (R2 §5 biggest risk).
- The other registration sites outside the big function (`registerFirstRunIpc`,
  `registerFirstRunLocalIpc`, `registerDetachIpc` in `main.ts`) join the table in the same
  stage. Otherwise they stay as a fourth hand-written door.
- The `YOUCODED_NATIVE` kill switch (M6) gets enforced at one chokepoint the first time a run
  touches it.

**Gate per run:** `verify.sh`. The family's contract types compile against both doors. The
run's report lists **every phone behaviour that changed**, in plain words.

### Stage 4 — the computer keeps the record (S5 + S6 + S7) · 3–4 runs · phone gets faster, screens agree

The biggest addition beyond Phase 4. It fixes most of the remote roadmap's "protocol" group
(R6 §2b).

1. **Protocol version + capabilities** in `auth:ok` (small; do first so later changes can be
   negotiated).
2. **Per-session delivery.** `session:watch/unwatch`, with `broadcast()` filtering channels the
   table marks session-scoped. The desktop window keeps receiving all sessions: it shows the
   session strip, and its push helpers are separate.
3. **Session record in the core.** Per-session live state (pending asks, working, queued
   messages, permission mode, model label, status) plus a numbered event ring. The ring
   generalises `ptyBuffers`' offset/epoch to chat and tool events.
   - **One way to fill any window.** Load the latest history page from the transcript (the
     main window already does this), then subscribe from sequence N. If N is too old or the
     epoch changed, fall back to a fresh page. This replaces the remote snapshot, which
     depended on the desktop renderer answering within 2 seconds. It also replaces the
     detached window's claim/replay, and the 10,000-event hook replay (only still-open asks
     need replaying).
   - **Known gap: "working / needs you" status lives only in the renderer** (the attention
     classifier reads the window's terminal screen). Choose one before building:
     (a) run the classifier in main, per session. Complete, and a phone works with no
     desktop window open, but it is a new always-on cost on the computer;
     (b) keep it in the renderer, and main records the last value relayed (today's
     behaviour). Cheap, but stale when no desktop window is open.
     **Recommend (a) only if a quick measurement shows it is cheap**; the classifier
     already exists as code, so it is not a rewrite.
   - The first run of this stage starts by listing everything else the desktop renderer
     knows that main does not: streaming text mid-turn, tool cards mid-run, pending
     prompts. Each item gets either a home in the record or a written reason to stay put.
4. **Wire the "answer never arrived" event** (`OUTCOME_UNKNOWN_EVENT`, fired today with no
   listener). With numbered events the phone can usually learn what happened, not just
   "unknown".

**Gate:** a scripted reconnect test. Drop the connection mid-turn and reconnect; bytes sent
must be proportional to what was missed, not to total history. The first-connect timing must
be measured on a **real phone** (dev-mode timing does not count, per the roadmap).

### Stage 5 — renderer clean-up (S8 + S9) · 2–3 runs · no visible change intended

- Merge the three platform modules into one. Replace capability-gap checks with
  `capabilities.*` reads (e.g. `RuntimeBinding.tsx:104`'s three-way combination,
  `TerminalView.tsx:597`'s transport pick, `SessionStrip.tsx:1498`'s triple detach guard,
  `build-menu.ts:29`'s ad-hoc `isDesktop`).
- D3: one `eventToAction`. **Keep the buddy window's three known gaps** (`user-interrupt`,
  `skill-invoked`, `context-clear`) exactly as they are. Closing them is its own visible
  decision.
- M5: `TranscriptEvent.data` becomes a union. Kotlin's copy is left alone here and is removed
  by the Android plan rather than updated.

### Stage 6 — things that become cheap afterwards (each its own small decision)

- **Native sessions from the phone:** flip `native.supported` for remote clients (Destin
  2026-09-11: "remote access should be identical to the desktop"). **Still open:** may a phone
  add or change provider keys?
- **Instant buttons:** Stop, permission answer, close, send, permission mode. The phone updates
  its own screen at once and undoes the change if the computer refuses.
- **More features over remote** (`social`, most `artifacts`, `project`, `theme`, `marketplace`,
  `dialog`). Each becomes a one-line table policy change. *Which* to open is Destin's call
  (`docs/active/investigations/2026-09-01-remote-unbridged-channels.md`).

## What this plan deliberately does not touch

Independent remote items that do not need the refactor: password confirm field, device-removal
undo, Keep-awake explainer, setup step count, wallpaper/mascot on phone, service-worker "can't
reach" page, browser encryption (approved design, own project), YouCoded-account access
(v1.4 idea). Also left alone: the four items waiting on a real-phone pass (R6 §2d). **Those
passes should happen before Stage 3**, so that behaviour changes Stage 3 reports can be told
apart from existing bugs.

## Decisions for Destin (later — not blocking this document)

| # | Question | Recommendation | Why |
|---|---|---|---|
| 1 | Start after `feat/specialists-plans-ui` merges? | **Yes** | Starting now forces a merge into a moving target. The branch is active today |
| 2 | Generate preload's channel list from one contract (reopens D10)? | **Yes, as static generated code** | The security boundary stays an explicit list you can read. Only its source changes, and four hand copies become one |
| 3 | Add Stage 4 (computer keeps the record) to Phase 4, or run it as its own phase right after? | **Right after, as its own phase** | Phase 4 is already the largest phase. Stage 4 changes how the phone behaves, so it deserves its own review |
| 4 | Keep D3/M5 in Phase 4 or move to Phase 5? | **Move to Stage 5 (after Stage 4)** | They do not unblock Android and they lengthen the exclusive-edit window |
| 5 | Should the "working / needs you" status be computed on the computer itself, so a phone is accurate even with no computer window open? | **Measure first, then likely yes** | It is the one piece of live state only a window knows. Moving it costs some background work on the computer |
| 6 | Should the computer's own window eventually talk over the socket door too (one client, not two)? | **Not now** | The generated contract gets most of the benefit. A socket door on the computer adds a local attack surface, for little gain |

## Risks

- **Behaviour is already different on the phone, so unifying changes it.** Mitigation:
  per-run change lists; real-phone passes before Stage 3.
- **Calendar.** 12–20 runs gate v1.3.1, Phase 5 and the Android rebuild. Mitigation: Stage 0's
  shrinking lock; families move in parallel only if they share no state (reviewer decides).
- **Security regression by merge.** Remote-only guards sit inside case bodies. Mitigation:
  policy fields in the table; existing refusal tests and ast-grep rules stay; a reviewer checks
  each run's refusal list against today's.
- **Stage 4 memory.** A numbered ring per session costs memory on the computer. Mitigation:
  bounded like today's rings (`COMPLETED_RING_PER_DEVICE`, `HOOK_BUFFER_SIZE`, which it
  replaces).

## Size

| Area | Today | After (estimate) |
|---|---|---|
| `ipc-handlers.ts` + `remote-server.ts` | 9,689 | ~3,500–4,500 spread over `create-runtime.ts`, ~36 family files and two thin doors (net −5k to −6k, Phase 4's own estimate) |
| `remote-shim.ts` | 3,165 | ~1,800–2,200 (the hand mirror of preload becomes generated; reconnect/offline logic stays) |
| `ipc-channels.test.ts` | 2,279 | most of it deleted as `tsc` takes over; a generic manifest test replaces it |
| Platform-detection modules + capability-gap checks | 3 modules, ~85–155 call sites (count method varies) | 1 module; roughly half the call sites become capability reads |

Estimates are directional, from measured line counts, not a line-by-line diff.
