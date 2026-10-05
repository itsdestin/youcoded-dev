---
date: 2026-09-24
status: shipped
type: plan
topic: Remote access refactor — one assistant core with one feature list that the desktop window, a phone browser and (later) the Android app all reach through the same doors; extends simplification Phase 4 with a computer-owned session record, per-session delivery and resume
---

# Remote access refactor — plan

> **Status.** The plan of record for this work (written 2026-09-24). **Entry point:**
> `docs/active/handoffs/2026-09-24-one-core-START-HERE.md`, which has the one ordered list of
> every phase, remote and Android together. This plan **is** the run list for simplification
> Phase 4 (`docs/active/plans/2026-09-16-simplification-phases.md`): Phase 4 = R1–R4. It also
> covers what follows (R5–R6). Held 2026-09-18; **Destin lifted the hold 2026-09-29** ("i want
> to do the remote stuff"). **2026-10-04: R0–R6 complete, ready to merge as `feat/one-core` in both repos.** Still a v1.3.1 blocker until merged. The decisions table at the end is still open. Companion:
> `docs/active/plans/2026-09-24-android-rebuild-plan.md` (phases A0–A6).
>
> **Evidence.** Six read-only investigations (I1–I6) on 2026-09-24 against app master `ab15a5858`.
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
runs**. While the first few runs happen, **nobody else may edit the two "door" files**. R0 below
explains how to keep that window short.

**Why it goes before the Android rebuild:** the Android plan runs this same brain on the phone.
Build the one list first, and the phone gets it for free. Build the phone first, and we write
list number four.

## Where things stand (facts, 2026-09-24)

| Thing | Today | Evidence |
|---|---|---|
| Desktop door | One function `registerIpcHandlers` (`main/ipc-handlers.ts:368-5535`): 297 request/response channels, 10 fire-and-forget, 4 different "push to windows" helpers, ~36 banner-separated families | I1 |
| It also builds the assistant | The native runtime (NativeHome → … → NativeSessionHost, ModelManager) is constructed **inside** that function (`:2697-3264`) and handed to the remote door afterwards by a setter (`remote-server.ts:439-444`, 11-field bag) | I1 |
| Remote door | `RemoteServer.handleMessage` (`remote-server.ts:1713-3923`) is one 2,210-line `switch` with 236 case labels, all raw strings (zero use the shared `IPC` constant) | I2 |
| Feature-name lists | **Four** hand-kept copies: `shared/types.ts` IPC (393), preload's inlined copy (373), remote-server literals (236), remote-shim literals — and a **fifth implementation** of the whole surface, the UI Workbench's fake backend `renderer/dev/workbench/mock-shim.ts` (3,478 lines). Plus two more hand lists in the shim (`MESSAGE_KIND`, `REJECT_ON_NOT_OK`) — the latter has a documented gap (`models:installed`) | I1, I2, review |
| Type checking | Only `session` and `on` (2 of ~40 namespaces) are compile-checked (`shared/bridge-types.ts`, `satisfies`). The renderer's own view of `window.claude` is a second, unchecked copy (`renderer/hooks/useIpc.ts:19-551`, mostly `any`) | I4 |
| Parity tests | `tests/ipc-channels.test.ts` (2,279 lines) checks names by text search, one hand-written block per past feature; catches missing names, never wrong shapes. Every shape bug found so far was found after shipping | I4 |
| Delivery | `broadcast()` (`remote-server.ts:4083`) sends every session's terminal and chat events to every connected client | I2 |
| Reconnect | `runRestore()` (`:1470-1646`) resends every session, a full chat snapshot, a terminal replay, and up to 10,000 buffered tool events **per session**. Only the terminal has real resume (per-session offset + epoch, `ptyPass()` `:937`) | I2 |
| Where the phone's state comes from | The chat snapshot a phone receives is **assembled from the desktop's open windows**: `main/chat-snapshot.ts` `requestMergedChatSnapshot()` (`:97-152`) asks every main window for the sessions it owns (2-second timeout each, `chat-snapshot.ts:7`), with drag-between-windows race handling that silently degrades the snapshot; on total failure the phone gets an empty "degraded" list (`remote-server.ts:1547-1551`) | I4, review |
| "Working / needs you" status | Computed **only in the renderer**: `renderer/hooks/useAttentionClassifier.ts:73-190` reads the terminal screen in the window, and main learns it through a relay (`useRemoteAttentionSync.ts:1-15`) whose comment says it exists to avoid running the classifier in main | review |
| Three ways to fill a window | Main window pulls pages itself; detached/buddy windows use claim + `replayLiveState`; remote clients get the snapshot. No single "connect" contract | I4 |
| Platform checks | Roughly 40–85 `isAndroid()` and 45–70 `isRemoteMode()` sites depending on how they are counted (recount before budgeting R4); three separate platform-detection modules (`platform.ts`, `state/platform.ts`, `platform-bootstrap.ts`), one of which exists to patch a shipped race. About half the checks are real touch/layout decisions; the rest stand in for "can this backend do X" | I4 |
| Protocol version | None. `auth:ok` carries ad-hoc booleans (`sessionNaming: true`) | I2 |
| Security to keep | Tailscale-only bind; bcrypt password; per-device hashed tokens with persisted revocation; origin allow-list; 64-socket/16 KB pre-auth caps; backpressure (8 MB pause / 32 MB close); four host-admin channels refused plus `remote:disconnect-client` deliberately unhandled | I2 |
| Phase 4 precondition | **Met.** Plan C's `remote-` test cluster merged (youcoded#527) | I6 |
| Unwritten precondition | `feat/specialists-plans-ui` (active today) changes the door files: +325/−18 across door/shim/preload/Kotlin. Nothing says whether Phase 4 waits for it | I6, checked 2026-09-24 |

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
                        │       + numbered event log (new, R5)         │
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
sites, `shell.openExternal`, and 3 dialogs (I1 §3).

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

## Phases R0–R6

Phase ids are **R0–R6** here and **A0–A6** in the Android plan. The one ordered list of both,
with what can run in parallel, is
`docs/active/handoffs/2026-09-24-one-core-START-HERE.md`. **Simplification Phase 4 = R1–R4**
(D2 = R1, D1 = R2 + R3, D3 + M5 = R4). Its v1.3.1 release-blocker status applies to R1–R4 only; its "must run alone" rule is the
R1–R2 full lock plus R3's per-family lock (R0). R5 and R6 are new work and are not release blockers.

Each phase is one or more worker runs, each with a fresh reviewer, per the Phase 4 execution
protocol (`docs/active/plans/2026-09-16-simplification-phases.md` → Execution protocol).
Gates are `bash scripts/verify.sh <app worktree>` plus the phase's named checks.

### R0 — clear the road (no code)

- **The edit lock is a check, not a promise:** `docs/active/locks/phase4.json` lists the locked
  paths and exempt branches (`session/simplify-r*`); `scripts/close-out.sh` flags any other
  branch that touches them. R3 edits its `paths` per run.
- **Branches that edit the door files do NOT block R1 (Destin, 2026-09-29).** They keep going
  and are **rewritten onto the new layout after R2**, when the full lock ends: their edits to
  `ipc-handlers.ts`/`remote-server.ts`/`preload.ts`/`remote-shim.ts` are redone by hand as
  entries in the contract and the family file (git cannot carry an edit into a file that did
  not exist). The rest of each branch rebases normally. Each rewrite runs the branch's own
  tests plus a review that checks no phone-only guard was dropped. On 2026-09-29 six branches
  qualified, about 700 lines in those files, roughly half of it the remote/preload copies the
  refactor deletes anyway: `feat/specialists-plans-ui` (~270), `session/plugin-project-controls`
  (~140), `session/office-suite-investigation` (~60), and three stale ones already 1,000+
  commits behind (`feat/specialists-plans-5b`, `session/files-drawer-honesty`,
  `session/onedrive-no-auto-download`), which need redoing anyway. Recompute the list after R2
  (`git diff --name-only origin/master...<branch>` over the four files).
- **The owed real-phone passes happen before R3** (remote roadmap: the batch 2/3 pass and the
  2026-09-23 fixes pass). They need Destin's phone; R1–R2 change nothing visible, so they do
  not wait for them. Then the behaviour changes R3 reports can be told apart from existing
  bugs. The Android WebView origin check and pairing-credential reuse stay in A2, as Destin
  decided on 2026-09-11.
- **Shrink the freeze.** Only R1–R2 need the two door files fully locked, and they are short
  (≈2–3 runs). From R3 on, each run moves one family into `main/ipc/<family>.ts`. After that,
  feature work edits the family file rather than the door files, so the lock only covers the
  family currently moving. Enforce it mechanically: a check in `scripts/close-out.sh` warns
  when a branch touches a file listed in `docs/active/locks/phase4.json`. "The coordinator
  checks open branches" has already failed once (I6 §4).

### R1 — hoist the runtime (S1 + S2) · 1–2 runs · no visible change · v1.3.1 blocker

> **State 2026-09-29: built and reviewed ("ship"), awaiting merge.** App branch
> `session/simplify-r1` (`3cad11b4`). `main/create-runtime.ts` builds the runtime from
> `{ userDataDir, appVersion, platform }`. `main/platform.ts` + `electron-platform.ts` hold
> three touchpoints: open a URL, encrypt secrets, and locate the askpass helpers. **No dialogs
> were needed**, so the "three dialogs" below turned out not to be runtime touchpoints. The
> shared maps live in `main/ipc/session-state.ts`, and the other handler-local maps stay for
> R3. The broadcasters are returned values, `setNativeRuntime` is gone, and `RemoteServer`
> reads the runtime through a `getNativeRuntime` accessor, because it is built before the
> runtime exists and returns null until then, as before. `ipc-handlers.ts` went from 5,754 to
> 5,198 lines. Guard: `tests/create-runtime.test.ts`, which is blind to an Electron import
> arriving through an npm package or a non-literal `require` (reviewer, low severity).
> On merge, add `create-runtime.ts` to `docs/MAP.md`.

- `main/create-runtime.ts` returns `{ …runtime objects, sessionNamer, applyAutomaticTitle,
  cleanup }`, taking `{ userDataDir, appVersion, platform }`.
- `platform` covers **every** Electron touchpoint the runtime has: `openExternal`, the three
  dialogs, and **secret encryption** (`safeStorage`, used twice). The last one was listed in
  the 2026-09-10 Android handoff but not in this plan's investigation; the first run
  re-lists them with `rg -n "from 'electron'"` over everything `create-runtime.ts` imports.
- Convert `metaBroadcaster`/`tagsBroadcaster` (module-level `let`s assigned as a side effect,
  `ipc-handlers.ts:459,500`) into values the runtime returns. This is an ordering trap if left
  alone.
- Shared mutable maps (`sessionIdMap`, `lastModelSeen`, `topicWatchers`, `lastTopics`) move into
  one `main/ipc/session-state.ts` owned by the runtime. **Never one copy per file:** that would
  silently split state that handlers share today.
- **Gate:** `create-runtime.ts` and everything it imports load with no Electron present. A unit
  test constructs the runtime with a temp dir and a fake platform. That test is A2's first
  proof point. `ipc-handlers.ts` no longer constructs runtime objects. `remote-server.ts` no
  longer has `setNativeRuntime`.

### R2 — the contract and the empty table (S3) · 1–2 runs · no visible change · v1.3.1 blocker

> **State 2026-09-29: built and reviewed ("ship"), awaiting merge.** App branch
> `session/simplify-r2` (`148c8baa`, stacked on R1). `shared/backend-contract.ts` holds the
> channel names, `ChannelDef`, the bridge types and the `window.claude` type
> (`bridge-types.ts` is gone; `useIpc.ts` went from 590 to 34 lines). Preload's list is
> generated as a static literal block, fresh-checked in build, dev and CI typecheck. The table
> is empty and both doors iterate it. The name lists had drifted: 50 names existed only in
> preload, 15 only in the contract, and 74 were bare strings; all are now in one list. 181
> channels send one object on the wire. Still positional: `remote:set-password`,
> `dev:log-tail`, `favorites:set`, `game:setIncognito` and two `first-run` local-download
> channels.
> **Carry into R3:**
> (1) The `ChannelDef` fields `sessionScoped`, `messageKind` and `rejectOnNotOk` were not read
> anywhere. Resolved in R3-1: dropped.
> (2) The phone door consults the table *before* its switch, so every remote-only guard in a
> case body must be restated in the entry.
> (3) The `first-run` local-download handlers ignored the `sessionId` they received.
> Resolved in R3-3: the preload no longer sends it and the handlers take no argument.
> (4) The wire-shape guard missed the submodule channel maps (artifacts, git, project,
> chatsearch, voice); a follow-up commit on the R2 branch closes this.

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
  of the list changes; the boundary does not. **Decided 2026-09-29 (Destin: "ok, do it"):
  generated. A committed generated file plus a freshness test.**
- Keep `mock-shim.ts` (the Workbench's fake backend) compiling against the contract. Run
  `node scripts/workbench-boot-check.mjs` in every phase that changes the contract.
- **Gate:** `tsc` green; the preload list matches the contract; workbench boot-check green.

### R3 — move the families (S3 + S4) · ~1 run per family, ~12–16 runs · phone changes listed per run · v1.3.1 blocker

> **2026-09-30 — started without the owed phone passes (Destin: "everything on the phone is
> currently janky in some capacity, so i'd rather just start r3 and fix issues as they
> come").** So each run's list of phone behaviour changes is the main record for telling new
> phone issues from old ones. Runs stack on R2 (`session/simplify-r3-<n>`) and nothing merges
> until Destin says so.
>
> **Run log.** Every run stacks on the one before it; nothing is merged.
> - **R3-1** (app `session/simplify-r3-1` `6620047f`; workspace `session/simplify-r3-1`
>   `300014c2`, which retargets the ast-grep rules): tags, folders, defaults, modes, analytics
>   and settings, 17 channels in all. Reviewer said "ship". The pattern is written up in
>   `main/ipc/*.ts`. `remoteOnError` gives the phone a soft answer when a handler throws, and
>   `ctx.broadcast` reaches the phones and the desktop windows. The three unread policy
>   fields were dropped.
>   Phone changes:
>   - A tag edited on the phone now refreshes the computer's windows and the search index.
>   - The phone's tag input is cleaned the same way as on the desktop.
>   - A handler that throws now answers `{ok:false}` where the phone used to get no reply.
>     **The shim does not reject that yet, so R3-2 makes it do so, generically.**
>
> - **R3-2** (app `session/simplify-r3-2` `fb96b5dd`): dev, update and account, 26 channels.
>   Reviewer said "ship". Pattern fix: a failed table reply carries `tableHandlerFailed`, the
>   shim rejects it, and `remoteOnError` now warns. There is a new `main/update-service.ts`,
>   one lazy singleton.
>   Phone changes:
>   - A handler failure shows an error instead of a malformed value.
>   - Switching to the beta channel re-checks for updates, as on the computer.
>   - `account:user` fills an empty cached profile and refreshes against `/auth/me`. If the
>     computer's token is already invalid, that signs the computer out, as its own next call
>     would. Accepted, as it matches the computer.
>   - Everything refused before is refused byte-for-byte; `account:export` and
>     `update:launch` stay desktop-only.
>
> - **R3-3** (app `session/simplify-r3-3` `e48c5316`): skills, marketplace,
>   theme-marketplace and first-run, 55 channels. This includes both of `main.ts`'s first-run
>   registration sites. The first-run `sessionId` was dead and is removed end to end.
>   Reviewer said "ship", 701 tests.
>   Phone changes:
>   - Uninstalling a bundled plugin is now refused, as on the computer. Narrower.
>   - Favourites, chips, overrides and delete-prompt now answer empty rather than `{ok:true}`.
>     No caller reads it.
>   - A skills failure shows an error.
>   **Open questions for Destin**, with the old refusals kept until he answers:
>   - May the phone browse the theme marketplace?
>   - May it see the featured and update-available skills?
>   - May it rate, vote and comment as the owner? A phone can already install, uninstall and
>     publish as the owner.
>   Found, and older than this work: the bundled guard matches only an exact plugin id, so a
>   `plugin:skill` id bypasses it on both doors. It is fixed in R3-4. The flaky
>   permission-approve journey, a load flake on the mock backend, is also fixed in R3-4.

> - **R3-4** (app `session/simplify-r3-4` `f571f686`; workspace `session/simplify-r3-4`
>   `d7cc63e1`): sync 17, syncspaces 14, github 5, and session/naming/transcript 23, 59
>   channels. Reviewer said "ship" (1,045 tests). `remoteGuard` is a new phone-only policy
>   hook; session:create's shell refusal is now that policy. B1, the phone Resume list showing
>   already-open sessions, is fixed by construction and its interim one-liner is deleted.
>   The `on` entries call the handler directly with `ctx.sender`, and the table lookup costs
>   4 ns per message on the computer's door and 118 ns on the phone's.
>   Phone changes:
>   - session:destroy now does the computer's full teardown, so no more "welcome back"
>     leftovers.
>   - session:list carries `providerType`.
>   - session:get-meta carries the reserved flags.
>   - Plain-language refusal wording is the computer's.
>   - A failure shows an error.
>   Extras fixed: the permission-approve journey flake (workspace `7f7dbc75`; 3 of 18 runs
>   failed before, 18 of 18 pass after under load), the bundled-plugin guard gap for
>   `plugin:skill` ids, and a quadratic comment-highlight pass.
>   **Open questions for Destin** (old refusals kept): may a phone set session flags? The phone
>   can already change backup and sync set-up and run fixed sync setup commands; should any of
>   that be computer-only?
>   **Fix in R3-5** (reviewer, low): (F2) a brand-new native session can briefly be offered as
>   resumable on a phone, because the old phone lookup excluded unmapped live ids; exclude live
>   native ids. (F3) `session:history` reads the projects folder on every call, so probe the
>   slug hint first. (F4) disclose or fix: in the boot window before bind, a phone's session and
>   naming calls get "Sessions are not ready yet". (F1) Desktop windows hear `session:destroyed`
>   twice when a phone closes a session. The renderer is idempotent, so this is only noted.
>   **Not moved, and why**: replay-from-start and replay-live-state, detach/drag/window:*
>   (computer-only), handoff:* (8), and permission:respond, which shares a path with the native
>   group.
>   **Still to move after R3-4** (measured 2026-09-30): ~174 `ipcMain.handle` and 154 remote
>   cases. The largest: native 18, remote-admin 13 (stays refused), models 13, artifacts 13,
>   pages 10, engine 9, provider 6, integrations 6, specialists 5.

> - **R3-5** (app `session/simplify-r3-5` `594517fd`): native 20, permission:respond and
>   permissions 3, specialists 5, model 3, handoff 8, 40 channels. Reviewer said "ship" (611
>   tests). R3-4's F2, F3 and F4 are fixed; F4 now waits up to 15 s for the bind and then runs.
>   The `YOUCODED_NATIVE` kill switch is consolidated into one function.
>   Phone changes:
>   - A phone's model swap is recorded for Resume.
>   - A bad permission mode shows an error.
>   - native:clear and native:invoke-skill are still refused, with the same wording.
>   **Questions for Destin**: should answering permission prompts, permission mode
>   (incl. full-auto), compact, interrupt and retry from a phone be computer-only (allowed
>   today)? May a phone clear a session or run a skill command (refused today)? May the phone's
>   "what the assistant was given" panel read instruction files for Claude Code sessions
>   (refused today)? Always-allow removal and specialist tiers are allowed today.
>   **Fix in R3-6** (reviewer, low):
>   1. A request queued during the boot wait still runs after its phone disconnected; skip it.
>   2. `model:*` preference writes can race and leave a half-written file; write via a temp
>      file and rename, or serialise.
>   3. The wire-shape-parity floor keeps needing lowering; assert an exact count instead.

> - **R3-6** (app `session/simplify-r3-6` `011f79fe`; workspace `9a1a06b4`): models 13,
>   engine 9, provider 6 plus endpoints:detect, search 4, chatgpt 4, openrouter 3, claude-code 2,
>   42 channels. Reviewer said "ship" (598 tests); keys are never carried in any reply. R3-5's
>   A1–A3 are fixed: a boot-wait request is skipped if its socket left, model preference writes
>   are atomic and serialised, and the parity floor is now a ratio.
>   Phone changes:
>   - Failures show as errors.
>   - Saving a key during startup says "not ready" instead of a false "saved".
>   - "Run in terminal" waits for startup.
>   **Question for Destin**: should installing Claude Code, installing or restarting the engine,
>   downloading or deleting models, and saving provider and search keys stay allowed from a
>   phone (allowed today)? Recommendation: leave them.
>   **Fix in R3-7** (reviewer, low):
>   1. `model.ts` duplicates the async atomic-write helper in `sync-state.ts:241`; reuse it.
>   2. A non-Error throw now reaches a phone as a generic sentence instead of `String(err)`;
>      restore `String(err)`.
>   3. The `wire-shape-parity` check `handlers.size > 0` will fail once every object-taking
>      handler has moved; make it robust.
>   4. A stale shim comment on `claude-code:install` goes in the doc sweep.

> - **R3-7** (app `session/simplify-r3-7` `10703530`): artifacts 21, project 5, git 9,
>   chatsearch 2, pages 10, `fs:read-head`, `file:upload` (phone-only) and `get-home-path`, 50
>   channels. Reviewer said "ship" (1,140 tests). The read-service, read-binary-access,
>   editable-path-policy, write-authorization and fs-read-head code is untouched. The phone
>   folder gate, the 1 MiB / 10 MiB size ceilings and the 4-per-socket watch cap are now
>   per-entry policy, forced by the door. All 18 phone refusals are byte-identical. The three
>   submodule constant files are deleted. R3-6's fixes are in: one shared
>   `main/atomic-write.ts`, `String(err)` restored, and the parity check scans the table.
>   Phone changes:
>   - `pages:list` also watches `Pages/`.
>   - Three channels that hung on failure now answer an error.
>   **SECURITY, older than this refactor (checked against r3-6), for Destin's decision:** phone
>   reads have no credential deny list (`.git` is only in the write-deny list).
>   - `fs:read-head` has **no folder gate**, so a paired phone can read the first 4 KB of any
>     file on the computer: `~/.git-credentials`, `~/.claude.json`, `youcoded-remote.json` (the
>     remote password hash), `native-secrets.json` and `~/.npmrc`.
>   - Within project roots, `artifacts:read-binary` and Download serve `.git/config`,
>     `.git-credentials`, `id_rsa` and `*.pem`.
>   - `artifacts:get` serves `.env` inside known folders by design.
>   A reusable list exists: `isCredentialPath` in `harness/tools/credential-paths.ts`, which
>   lacks `.git/config`, private-key names outside `.ssh`, and `youcoded-remote.json`.
>   Recommended fix, a separate change and not part of R3-7: apply an extended credential deny
>   list to every phone read, and gate `fs:read-head` to known folders for phones only, with the
>   temp upload folder allowed for the attach preview.
>   Also old: `file:upload` has no size cap beyond the 50 MB socket limit, and uploads are never
>   cleaned up.
>   **Destin's answers (2026-10-01):**
>   - Phone upload stays.
>   - Pages approve and delete-saved-key stay allowed from a phone.
>   - Installing Claude Code, the engine and models, and saving keys stay allowed from a phone
>     (R3-6 question).
>   - The credential reads get **the recommended fix: R3-SEC, right after R3-8 and stacked on
>     it.** It covers the extended deny list on every phone read, `fs:read-head` gated to known
>     folders for phones (the temp upload folder allowed), and a size cap plus cleanup for
>     `file:upload`.

> - **R3-8, the last R3 run** (app `session/simplify-r3-8` `9217f00b` and `a67afdb0`;
>   workspace `c4ef3587`): 128 channels, bringing the table to 417. They cover doc comments,
>   themes and appearance, favourites, game and arcade, zoom, shell, dialog and clipboard,
>   window/detach/drag/replay (desktopOnly), buddy, integrations, voice, social and `remote:*`
>   admin (refusals byte-identical; `remote:disconnect-client` still has no entry and gets
>   `unsupported`). Reviewer said "ship" (1,501 tests; the bodies are identical line for line).
>   The phone-open set is pinned at exactly 39 channels, the same as before.
>   `channel-table-complete.test.ts` fails on any feature registration outside the table. Its
>   exceptions are 3 transport registrations and 4 cases.
>   Final sizes: `ipc-handlers.ts` 5,754 → 2,551, `remote-server.ts` 4,615 → 1,863, `main.ts`
>   2,655 → 2,042. The smoke run found and fixed a zoom bug: a phone's zoom did nothing after
>   the main window closed.
>   Phone change: an empty doc-comment field gets the computer's `missing-field` refusal.
>   **Owed to Destin's eyes:** the buddy window on KDE. The machine's consent gate refused in the
>   smoke run, so nothing was installed to bypass it.
>   **Fix at the start of R4** (reviewer, low):
>   - The completeness test misses a non-literal `case IPC.X:`, `handleOnce`/`addListener`/an
>     aliased `ipcMain`, and a dispatcher outside `remote-server.ts`.
>   - No behavioural tests cover the detach, drag-adopt or drop-resolve bodies.
>
> **R3 is complete:** every feature channel is served from the table by both doors.
>
> - **R3-SEC, the phone credential-read fix** (app `session/simplify-r3-sec` `b87fa76cf` and
>   `870d2ea73`, stacked on R3-8). Phone door only; the computer's door and the native
>   assistant's file tools are unchanged (`isPhoneDeniedFile` is a separate phone-only function
>   beside `isCredentialPath`). It matches on the resolved real path, ignores case, and strips
>   Windows trailing dots/spaces and `:stream` suffixes.
>   - **Applied to:** `artifacts:get/read-binary/resolve-path/list-folder/search-content`,
>     download (at link creation and again at fetch), `project:read-context-file`, and
>     `project:list-context` enrichment. `project:repo-info` strips logins from the address.
>   - **Denied:** `.git/`, `.ssh/`, `.aws/`, `.config/gh/`, git-credentials, `.netrc`, `.npmrc`,
>     `.gitconfig`, `.vault-token`, rclone.conf, docker and kube configs, shell and REPL
>     histories, `*.kdbx`, `*.pem/*.key/*.p12/*.pfx`, and `id_*` private keys (not `.pub`). Also
>     the app's own secret files: remote config, native secrets, GitHub token, marketplace auth,
>     search providers, page connections, ChatGPT account.
>   - **Search:** a search rooted in a denied folder is refused, and the excluding globs ignore
>     case.
>   - **`fs:read-head`:** a phone may preview only its own uploads (its sole caller is
>     `AttachmentChip`).
>   - **`file:upload`:** capped at 25 MB per file and 200 MB for the whole folder, with a clear
>     refusal sentence. `sweepOldUploads` also runs at start-up; the age stays 1 hour.
>   - **Gates:** 88 tests in the new guards, each shown red then green; `verify --full` green;
>     dev smoke.
>   - **Review:** "ship with fixes", and all 7 findings were fixed in `870d2ea73`.
>   - **Phone changes:**
>     - `.key` Keynote files and anything under a `.git` folder are unreadable from a phone.
>     - A phone sees "kept on the computer" for denied files.
>     - `.env` stays readable through `artifacts:get` on purpose.
>   - **Open for Destin (not blocking):** `folders:add` is still allowed from a phone, so a
>     phone can make any folder browsable (minus the deny list). Restricting it to folders
>     added on the computer is his call, because he wants the phone to match the computer.

>
> **Destin's answers (2026-09-30)** to the questions from R3-3 and R3-4. Each is a policy
> change that widens what a phone can do, applied in R6 once R3 is complete:
> 1. A phone may browse the theme marketplace. **Yes.**
> 2. A phone may see the featured and update-available skills. **Yes.**
> 3. A phone may rate, vote and comment as the owner. **Yes.**
> 4. A phone may set session flags (complete, priority). **Yes.**
> 5. A phone may keep changing backup set-up (add, edit or remove destinations, force a sync,
>    sync settings). **Unchanged, as today** ("fine with your recommendations").
> 6. A phone may keep triggering the fixed sync setup steps (check prereqs, install rclone,
>    start the Drive or GitHub sign-in on the computer, create a private repo). **Unchanged,
>    as today.**
>
> **Destin's answers (2026-09-30)** to the questions from R3-5:
> 7. Answering permission prompts, permission mode (incl. full-auto), compact, interrupt and
>    retry stay allowed from a phone. **Yes, unchanged.**
> 8. A phone may clear a session and run a skill command (refused today). **Yes, opened in R6.**
> 9. The phone's "what the assistant was given" panel may read the project and user
>    instruction files for Claude Code sessions, as the computer's does. **Yes, opened in R6.**
>    Always-allow rule removal and specialist tiers stay allowed from a phone, as today.

> **Doc sweep at merge** (these must describe master, so they are not edited while the branches
> are unmerged): the `.claude/rules/ipc-bridge.md` "Settings → Development" section, which
> still says `dev:*` lives in `ipc-handlers.ts` and gives the old count; the `docs/MAP.md`
> rows for the moved families and for `create-runtime.ts`; and every family moved after this.

Lowest risk first (I1 §4). Each run moves one family into `main/ipc/<family>.ts`, deletes its
remote `case` bodies and desktop registrations, adds its request/response types, and deletes
that family's hand-written blocks in `ipc-channels.test.ts`:

1. tags, folders, defaults, modes, analytics, settings (the D6/B3 prototype-pollution fix rides
   along)
2. dev, update, account
3. skills, marketplace, theme-marketplace, first-run
4. sync, syncspaces, github, session/transcript (the B1 Resume-list fix happens by construction
   here)
5. native, models, engine, provider, search, specialists — **last**, because these have the
   richest closures. **A2 (the assistant on the phone) waits for this group.** The order stays
   lowest-risk-first on purpose: A0 and A1 keep Android moving in the meantime.

Desktop-only families (`window`, `detach`, `dialog`, Electron half of `zoom`, `buddy`) are
entered as `desktopOnly: true`. The socket door refuses them **from the table**. Today's
refusal behaviour must be kept exactly: buddy throws, detach no-ops, window absent, admin
channels return `HOST_ADMIN_REFUSAL`, `disconnect-client` falls to `unsupported`. The ast-grep
rules `remote-admin-case-refuses` / `unpair-button-disabled-on-remote` keep guarding this.

Also in scope, and each must be decided per run rather than folded in silently:
- Remote-specific input checks inside today's case bodies (e.g. `session:create`'s
  shell-provider guard, `remote-server.ts:~1789`) become table **policy**. A mechanical merge
  would weaken or duplicate them (I2 §5 biggest risk).
- The other registration sites outside the big function (`registerFirstRunIpc`,
  `registerFirstRunLocalIpc`, `registerDetachIpc` in `main.ts`) join the table in the same
  phase. Otherwise they stay as a fourth hand-written door.
- The `YOUCODED_NATIVE` kill switch (M6) gets enforced at one chokepoint the first time a run
  touches it.

**Gate per run:** `verify.sh`. The family's contract types compile against both doors. The
run's report lists **every phone behaviour that changed**, in plain words. Phase 4's overall
gate applies too (`2026-09-16-simplification-phases.md` → "Gate for the phase"): line budgets
for the two door files drop every run, and a dev-instance phone check follows the last family.

### R4 — one answer on the screen side (S7 + S8 + S9) · 2–3 runs · no visible change intended · D3 + M5 are v1.3.1 blockers

None of this edits the two door files, so the edit lock ends when R3 ends.

- **Protocol version + capabilities.** `auth:ok` carries `protocolVersion` and a
  `capabilities` object. The desktop preload supplies the same object locally.
- Merge the three platform modules into one. Replace capability-gap checks with
  `capabilities.*` reads (e.g. `RuntimeBinding.tsx:104`'s three-way combination,
  `TerminalView.tsx:597`'s transport pick, `SessionStrip.tsx:1498`'s triple detach guard,
  `build-menu.ts:29`'s ad-hoc `isDesktop`). This also fixes the model picker offering models
  a browser cannot run (remote roadmap).
- D3: one pure `eventToAction(event, {live})` in `renderer/state/`, called by `App.tsx`'s
  transcript handler (~`:1384-1664`), `buddy/BubbleFeed.tsx` (~`:114-340`) and
  `state/transcript-page-actions.ts` (`:26-31`). Gate: `tests/transcript-event-surface-parity.test.ts`
  passes with its ledger intact, then becomes a compiler-checked exhaustive `switch`. **Keep the buddy window's three known gaps** (`user-interrupt`,
  `skill-invoked`, `context-clear`) exactly as they are. Closing them is its own visible
  decision.
- M5: `TranscriptEvent.data` (`shared/types.ts:306-612` on `ab15a5858`) becomes a union keyed on `type`. It comes before R5 so R5's event log stores
  typed events. Kotlin's copy is left alone and is deleted by A3 rather than updated.

**R4 run order:**
1. R4-1: the R3-8 review fixes, capabilities with the protocol version, one platform module.
2. R4-2: D3.
3. R4-3: the ordering fix.
4. R4-4: M5.

The investigation for D3 and M5 (producers, consumers, disk shapes, the three translators'
differences, the proposed union and the commit order) was taken on 2026-10-01 from
`simplify-r3-sec`.

**R4-1 log** (app `session/simplify-r4-1`: `31c344eaa`, `34aafee6b`, `71e3ff113`, `cfbf69ca5`;
workspace `ec655c97`):
- **Guard.** `channel-table-complete.test.ts` now scans all of `main/`. It catches once,
  addListener, aliased, property-aliased and computed registrations, and any dispatcher outside
  the door.
- **Detach tests.** detach, drag-adopt and drop-resolve have behaviour tests
  (`tests/detach-handlers.test.ts`).
- **Capabilities.** `shared/capabilities.ts` holds `PROTOCOL_VERSION` (1) and a 13-key
  `Capabilities`. `auth:ok` carries both; Kotlin `MessageRouter.buildAuthOkResponse` is pinned
  by a parity test. The preload exposes them, and the shim starts conservative.
- **One platform module.** `renderer/platform.ts`; `platform-bootstrap.ts`,
  `state/platform.ts` and build-menu's `isDesktop` are deleted.
- **Capability reads.** 29 capability-gap checks became capability reads, equivalent on every
  screen (reviewer table). `FolderSwitcher:260` and `Icons:322` stay as they are, because
  converting them would change the Android-paired screen.
- **Visible change:** pickers that choose what *this* screen runs (new session, default model)
  hide native models on a phone browser, on Android, and with `YOUCODED_NATIVE=0`.
  Host-run pickers (`runsOn="host"`: naming, specialists, switching a native session's model,
  resuming a native conversation) keep them. An empty list shows a sentence.
- **Review:** "ship with fixes". All of them were fixed in `cfbf69ca5`.
- **Gates:** `verify --full` green, and 595 Android unit tests pass.

**R4-2 log (D3)** (app `session/simplify-r4-2`, 8 commits ending `8e62fd653`; workspace
`4e2d908e`):
- **One translator.** A pure `eventToAction` in `renderer/state/transcript-event-actions.ts`
  replaces App's, BubbleFeed's and the page path's translators. `pageEventToAction` is now a
  wrapper.
- **Buddy.** The buddy filters through a typed `BUDDY_LIVE` ledger, which keeps its 3 gaps.
- **Tool-use timestamp.** `TRANSCRIPT_TOOL_USE.timestamp` is required.
- **Golden.** A characterisation golden was recorded from the old code first, covering 50
  payload variants.
- **Size.** App.tsx went from 5000 to 4695 lines, and BubbleFeed.tsx from 665 to 440.
- **Visible change:** only the approved one. The buddy's compaction marker reads "freed N
  tokens", and duplicates are suppressed.
- **Also changed, invisible:** the buddy now gets `NATIVE_HISTORY_REWRITTEN` (totals only;
  the reviewer verified it never touches the timeline), `promptProcessing`, and session-error
  `uuid`/`usage`.
- **Review:** "ship". The reviewer watched it work in the workbench. The low findings
  (F1 App wiring unpinned, F2 missing-text tests, F3 empty user bubble, F5, F6 rule
  over budget) went into R4-3.
- **Bisect note:** commits 3 and 4 alone leave two old guards red; the tip is green.

**R4-3 log (ordering)** (app `session/simplify-r4-3`: `976861861`, `d51cebcd7`, `2230d27b4`,
`17be73295`, `223c11d7d`; workspace `a0e254f9`, `678e9c57`):
- **Ordering.** Every transcript action goes through the frame batcher in arrival order
  (`routeTranscriptEvent`, `routeTranscriptShrink`), and `DIRECT_DISPATCH_TYPES` is gone. No
  recorded reason for the old direct dispatches was found.
- **Guard.** It is pinned by the ast-grep rule `app-transcript-listeners-batched.yml` and by
  behavioural tests.
- **Empty messages.** An empty user-message draws no bubble on every path. The reviewer
  verified that no producer sends a legitimate empty one.
- **Flakes fixed on the way:**
  - update-installer cleanup race (retrying delete);
  - the CommentsMargin 1,000-comment pin, which now counts visits and is green with 8
    parallel copies.
- **Review:** "ship with fixes". The shrink path is now batched and the source scan is
  replaced by a rule.
- **Visible change:** a message and a /clear, compaction or skill card arriving in the same
  frame keep their sent order.

**R4-4 log (M5)**:
- **Commits.** App `session/simplify-r4-4` has 9 commits, ending `f665c2e91`.
- **The union.** `TranscriptEvent` is a union keyed on `type`, in
  `shared/transcript-event-types.ts`, which `types.ts` re-exports. The loose bag is deleted.
- **Producers** are typed: `emitEvent<T>`, `commitSummaryCandidate`, `abandonedTurnUsage`, one
  `stampSubagent()`, and the watcher.
- **Disk readers** go through `looseData()` (`data ?? {}`).
- **Bridge listeners** take `TranscriptEvent`.
- **Test helpers:** `ev<T>` and `loose`.
- **Not done:** a single `fromDisk()`, because the readers validate differently.
- **Review:** ship with fixes. The fix restored tolerance for a disk line with no `data` (it
  threw, which failed resume), with 6 tests shown red then green.
- **Visible change:** none.
- **Gates:** `verify --full` green. The reviewer's dev smoke had a phone socket receive
  well-formed events.
- **Bisect:** commits 3 to 6 do not compile alone.

**R4 is complete** (2026-10-01): R4-1 to R4-4, stacked on R3-SEC. Next is R5.

**Destin's answers (2026-10-01):**
1. The buddy's live compaction marker unifies with the main window: "freed N tokens", with
   the duplicate marker suppressed. This is the one visible change in D3.
2. App's direct dispatches (`skill-invoked`, `context-clear`, `compact-summary`) move into
   the batch. This fixes same-frame ordering, as its own small run right after D3.
3. Saved `dropPart` markers are ignored on the page path, so a discarded partial answer can
   reappear in reopened history. This is fixed in R5, with the record rebuild.

The buddy's three live gaps stay, as a typed ledger.

**After R4, simplification Phase 5 may start**, once its other precondition (the
native-session-host test split) has merged. Phase 5 and R5 may overlap; each run checks the
other's files first.

### R5 — the computer keeps the record (S5 + S6) · 3–4 runs · phone gets faster, screens agree

The biggest addition beyond Phase 4. It fixes most of the remote roadmap's "protocol" group
(I6 §2b).

1. **Per-session delivery.** `session:watch/unwatch`, with `broadcast()` filtering channels the
   table marks session-scoped. Socket clients join the desktop's existing window registry
   (one audience model, see S6). The small per-session summary a session strip needs still
   goes to everyone.
2. **Session record in the core.** Per-session live state (pending asks, working, queued
   messages, permission mode, model label, status) plus a numbered event ring. The ring
   generalises `ptyBuffers`' offset/epoch to chat and tool events.
   - **One way to fill any window.** Load the latest history page from the transcript (the
     main window already does this), then subscribe from sequence N. If N is too old or the
     epoch changed, fall back to a fresh page. This replaces the remote snapshot and
     `chat-snapshot.ts`'s per-window merge, the detached window's claim/replay, and the
     10,000-event hook replay (only still-open asks need replaying).
   - **Known gap: "working / needs you" status lives only in the renderer** (the attention
     classifier reads the window's terminal screen). Choose one before building:
     (a) run the classifier in main, per session. Complete, and a phone works with no
     desktop window open, but it is a new always-on cost on the computer;
     (b) keep it in the renderer, and main records the last value relayed (today's
     behaviour). Cheap, but stale when no desktop window is open.
     **Recommend (a) only if a quick measurement shows it is cheap** (decision 4); the
     classifier already exists as code, so it is not a rewrite.
   - The first run starts by listing everything else the desktop renderer knows that main
     does not: streaming text mid-turn, tool cards mid-run, pending prompts. It also settles
     whether the phone should follow the computer's active session and view (Commit 3 of
     `docs/active/plans/2026-07-20-remote-hydration-pr-spec.md`, never built; Destin's call). Each item gets
     either a home in the record or a written reason to stay put. Prompt cards drawn from
     the record also fix cards landing in different places on phone and computer.
3. **Wire the "answer never arrived" event** (`OUTCOME_UNKNOWN_EVENT`, fired today with no
   listener). With numbered events the phone can usually learn what happened, not just
   "unknown".

**R5 state (2026-10-01).**

The R5-0 investigation (scratchpad `r5-0-investigation.md`) produced:
- a 17-item renderer-only inventory;
- a map of the fill paths;
- an attention-classifier measurement: in main, at the real Claude Code rate, about 1 ms/s
  per session, 2.8% of a core for 10 busy sessions, idle near zero, and about 1 MB per
  session with 60 rows of scrollback;
- a correction: hydration Commit 3 was mostly settled on 2026-09-10
  (`remote-place.ts:84-94`; view is per-screen per contract R4), leaving only "follow live?".

**My calls (technical):**
- **Run order** is R5-pre dropPart, then R5-1 (one audience plus the record, additive), R5-2
  (one fill path, deleting the old ones), R5-3 (per-session delivery with dots from the
  summary), and R5-4 (live facts, the stuck check, outcome-unknown). Per-session delivery
  needs the new fill path first.
- **The ring** holds 2,000 events or 2 MB per session. Its epoch changes only when the record
  is created. Open asks are kept outside the ring.

**R5-pre** (app `session/simplify-r5-pre` `458e56a62`, stacked on r4-4):
- **Fix:** history pages honour persisted `dropPart` markers, so a reopened conversation no
  longer shows a retry's discarded text.
- **Edge left unfixed:** a single turn over 2 MB split mid-turn keeps the ghost. It is pinned
  by a test.
- **Review:** "ship".
- **ast-grep:** the verify failure comes from master's rules against the unrebased stack,
  and clears at the rebase.

**Destin's answers (2026-10-01, deck `r5-phone-record-questions`, answers file committed):**
1. **Follow live:** leave it as is. Hydration Commit 3 is closed; each screen picks its own
   conversation and view.
2. **The "working / may be stuck" check** runs in the computer's core (built last, in R5-4).
3. **Queued messages:** native-session queued messages are shown on the phone and can be
   cancelled there, with the same rights as the computer.
4. **The lost-send note** ("Not sure this was sent / Send again") goes in. Destin asked
   "would this self heal on reconnect?", so the design must do this: on reconnect the phone
   checks the send's id against the record.
   - If the computer got it, the note clears itself.
   - If it provably did not, the note says so and offers Send again (never automatically,
     to avoid duplicates).
   - "Not sure" stays only when the computer cannot tell (Claude Code sessions, where the
     check is approximate).
5. **Notice lines and prompt cards** become shared record events, the same on every screen.

R5-1 was started before the answers and does not depend on them.

**R5-1 log** (app `session/simplify-r5-1`: `da32bc854`, `39f54e62e`, `6d59c8963`, `126355b36`;
workspace `6284fef5`):
- **The record.** `main/session-record.ts` is built by `createRuntime` as `runtime.records`.
  Each session has an epoch, a ring (2,000 events or 2M UTF-16 units, sized with
  `estimateSize`, never stringify), open asks kept outside the ring, and live facts. It also
  holds a resume rule (events, or a fresh page) for R5-2.
- **One publish.** `publish(sessionId, type, payload, {afterWindows})` replaces 12 paired
  send+broadcast sites. The ast-grep rule `no-paired-session-send-and-broadcast` and a coverage
  test guard it. Claude Code hook events and `pty:output` stay split-delivery, with reasons.
- **Phones in the registry.** Phones join `WindowRegistry` as a separate sockets set, with ids
  of -1000 or lower. Delivery is unchanged.
- **New `session:summary` push**, unread so far.
- **Checks.**
  - A shadow compare against the real reducer.
  - 31 audience-equivalence tests.
  - Measured memory: 5–15 MB for 10 sessions, at 7 µs per event.
- **Review:** "ship with fixes". The fixes are a cheap size estimate, a phone id range, the
  buffer order restored, and the hook note fenced.
- **Visible change:** none. In the dev smoke the pushes are identical, apart from the summary.
- **For R5-3:** `releaseSession` also wipes phone watches.

**R5-2 log (one fill path)** — app `session/simplify-r5-2`: `e8e6499e0` (old-path golden),
`821269ea2`, `e4d5524f6`, `2e302cfb9`, `289abd30b`, `a45fb0dd8`, `3043f188d`; workspace
`b84e6669`.

- **One open path.** `session:open` (newest page, record tail, open asks and pty buffer;
  resume by `{epoch, seq}`) replaces all of these:
  - the phone snapshot and `RemoteSnapshotExporter`;
  - the restore cut line and hold-queue;
  - the 10k hook replay and `awaitingInSnapshot`;
  - `replay-from-start` and `replayLiveState`;
  - `chat:hydrate`.

  `claimPending` is kept for the hand-off only.
- **Merged.** The pty buffer now lives in the record, and the two `transcript:page` bodies
  are merged into one.
- **Size.** `remote-server.ts` went from 1909 to about 1281 lines.
- **Bytes.** A long first open is 988 KB. Reconnecting after 10 missed events sends 1.7 KB,
  and after 110 missed events 16.9 KB.
- **Review: "ship with fixes".** All of these were fixed:
  - a pty hole during a fill (the cut is now taken after the page read);
  - tear-off double delivery and freeze;
  - `gone` sessions;
  - optimistic sends lost across a fill;
  - Claude Code `/clear` leaking pre-clear messages (`startNewTranscript`);
  - hold timeout ordering (dropped and refilled; queue cap 5,000).
- **Old clients.**
  - The new page sends `protocolVersion: 2`.
  - A v1.3.0 phone page gets a degraded hydrate saying "Refresh this page to finish
    updating", tested against a verbatim old shim.
  - New pages show an `unsupported-version` gate with a Refresh button.
  - **Release:** an older paired Android app silently falls back to its own runtime, so
    Android and desktop must ship together.
- **Visible changes:**
  - A torn-off window gains asks, streamed text, error and stall cards, and the compacted
    line.
  - The phone reconnects incrementally, and "empty copy replaces my messages" is fixed.
  - Lost: the "answered on the computer" note for a card answered before the phone
    connected, and the compaction spinner when joining mid-compaction (comes back in R5-4).
- **Flakes fixed:** the CommentsMargin 315-cell ratio (now counts queries) and a
  ThemeProvider setState after unmount.
- **Owed:** real-phone first-connect timing.

**R5-3 log (per-session delivery)** (app `session/simplify-r5-3`: `2a9d81314`, `e4e79cf86`,
`c176df52d`, `094a51235`, `4bcdabbd1`; workspace `58f64c41`):
- **Watching.** `session:open` starts a watch and `session:unwatch` ends it. The phone keeps
  the on-screen session plus the 2 previous ones watched.
- **Terminal bytes** are filtered to watchers.
- **Dots, the attention sound and the finished chime** read `session:summary`
  (`useSessionSummaries`). It is pushed about 50 ms after a change, with a 10 s backstop, and
  only when a phone is connected. Blue stays per-screen.
- **Session lifetime.** `releaseSession` keeps phone watches, and a new `endSession` handles
  a session that actually ends.
- **Tags and notes** go to every phone again; a regression since R5-2 was found and fixed.
- **Bytes.** With 10 busy sessions and one watched, the phone receives 10.0% (198 KB vs
  1.97 MB).
- **Review:** "ship with fixes", all of them fixed:
  - an eviction mid-open froze the conversation, so `loader.abandon` was added;
  - resumed sessions showed gray on the phone vs blue on the computer, so `noteHistory` was
    added;
  - helper and password asks were added to the parity test;
  - `summaryKey` now carries the queue length and the permission mode;
  - the chime and viewed effects moved out of App.tsx.
- **Visible changes:**
  - With several sessions, the phone does less work.
  - A chat not viewed recently shows "Catching up with your computer…" when opened.
- **Not verified:** the green and blue dots live, and the sounds.

**R5-4a log (live facts)** (app `session/simplify-r5-4a`: `a9b154c63`, `374e59227`, `bfd9bba94`;
workspace `70556d37`, `9e377321`):
- **One push for live facts.** A numbered `session:live` carries:
  - the native queue (a phone can cancel; Destin approved);
  - the model label (main reads `/model`; a refused switch is retracted);
  - the compaction spinner (`/compact` with Enter; main owns the 180 s watchdog for
    host-raised spinners);
  - dividers ("cleared" from the SessionStart hook, or main after 3 s);
  - prompt cards (reported by a window via `session:prompt-report`, deduped by id,
    reconciled on reload, dismissed by newer output).
- **Claude Code permission mode** is read from the footer line in main.
- **Old clients.** Screen inference is off when `capabilities.sessionRecord` is set; a
  missing value means false.
- **Removed:** `streamingText` and `QUEUED_MESSAGE_ADDED`.
- **Interim:** phones may also report cards, restricted to the watched conversation, with the
  card rebuilt in the parser's shape (digit or nav buttons, at most 8, length caps), and
  phones never sync. **R5-4b removes phone card reporting once main detects cards itself.**
- **Review:** "ship with fixes", all fixed:
  - resume spinner watchdog;
  - stale card;
  - capability default;
  - `/clear` fallback;
  - refused `/model`;
  - footer gating.
- **Not verified live:** the native queue, spinner and label; a real refused `/model`; a real
  dialog card. A refusal capture does not exist, so the wording is an assumption
  (`cc-dependencies.md`).

**R5-4b log (stuck check and lost sends)** (app `session/simplify-r5-4b`: `8871941f9`,
`fca47d7bd`, `45cea1226`, `37421d72b`; workspace `68a1d83c`):
- **Main reads every Claude Code terminal.** `main/session-screens.ts` keeps one always-on
  headless terminal per live Claude Code session, from its first byte to its end. It uses
  about 0.4 MB per idle session and about 0.8 ms/s of CPU per busy session.
- **Main is the only writer** of attention ("stuck") and of setup-dialog cards. The renderer
  hook is inert where `sessionRecord` is set.
- **`session:prompt-report` is removed,** which closes the R5-4a injection surface.
- **`@xterm/headless` ships** (pure JS, about 183 KB main file).
- **Terminal bytes** are kept in the record only while the phone server runs, as `ptyBuffers`
  were before.
- **Send ids** with `session:send-outcomes` show an inline note (received: none; "This didn't
  send — your computer never received it."; "Not sure this was sent."), with Send again and
  never an automatic resend. The epoch is stored per send. This is phone only; the computer
  keeps its toast and restores the draft.
- **Review: "ship with fixes".** The review found a HIGH issue: the idle-dialog gate matched no
  real output, so `/login`, `/resume` and auto-mode dialogs were missed. It is fixed by the
  always-on terminal, plus a replay of every real capture into idle sessions with
  8- and 40-byte splits. Also fixed:
  - stale write callbacks;
  - the send epoch;
  - the spinner after "not sent".
- **Flake fixed:** owner-lease tests used pid 999999 (`deadPid()`).
- **Not seen live:** a real dialog card or stuck banner (the throwaway HOME is logged out). It
  is covered by real-capture replays.

**R5 is complete (2026-10-01):** R5-pre, R5-1, R5-2, R5-3, R5-4a and R5-4b.
- **Owed to Destin:** real-phone first-connect timing and a real-phone pass.
- **Release rule:** a paired Android app must ship with this desktop.

**Gate:** a scripted reconnect test. Drop the connection mid-turn and reconnect; bytes sent
must be proportional to what was missed, not to total history. The first-connect timing must
be measured on a **real phone** (dev-mode timing does not count, per the roadmap).

### R6 — things that become cheap afterwards (each its own small decision)

- **Native sessions from the phone:** flip `native.supported` for remote clients (Destin
  2026-09-11: "remote access should be identical to the desktop"). **Still open:** may a phone
  add or change provider keys? Needs R3 group 5 only, so it may run earlier if Destin wants.
- **Instant buttons:** Stop, permission answer, close, send, permission mode. The phone updates
  its own screen at once and undoes the change if the computer refuses. Needs R5's record.
- **Destin's 2026-09-30 yeses** (see the R3 run log): theme-marketplace browsing, featured/update-available skills, rate/vote/comment, session flags, `native:clear`, `native:invoke-skill`, and the instruction-file read in `native:session-context-text` for Claude Code sessions. Each is a policy flip on an existing table entry; test that the refusal is gone and that nothing else opened.
- **More features over remote** (`social`, most `artifacts`, `project`, `theme`, `marketplace`,
  `dialog`). Each becomes a one-line table policy change. *Which* to open is Destin's call
  (`docs/active/investigations/2026-09-01-remote-unbridged-channels.md`).

**R6-1 log (approved phone abilities)** (app `session/simplify-r6-1`: `048fb3bb3`, `8e81a6e94`,
`c375602e9`, `8a1c1c7f4`; workspace `9681dd71`):
- **13 channels opened.** The phone-open set went from 246 to 259, pinned in full by
  `tests/fixtures/phone-open-channels.json`. The new channels are:
  - theme-marketplace list and detail;
  - featured skills and packages;
  - rate, thumb, comment and like;
  - `session:set-flag`;
  - `native:clear` and `native:invoke-skill`.
- **Instruction-file read.** `native:session-context-text` now reads instruction files for a
  phone, with these limits:
  - project and user kinds only;
  - the folder comes from the host's session list;
  - the R3-SEC deny list is applied to the real path, which is read once;
  - regular files only, up to 1 MB;
  - a non-reading async locator, which fixed a hang on a named pipe before the deny check ran.
- **Native sessions from a phone.** The `nativeSessions` capability on `YOUCODED_NATIVE` makes
  the shim's `native.supported` live.
- **Divider fix.** A duplicate "Conversation cleared" on reopen (record plus page) is fixed by
  dedupe on marker id in `HISTORY_PAGE_LOADED`.
- **Review:** ship with fixes. The fixes were a bogus `kind` reaching a skill file, the
  double-locate, no size cap, and weak tests.
- **Final checks:** `verify --full` green, run by me on `8a1c1c7f4`.
- **"Inactive" grey-dot wording:** consistent on both screens. Destin may change it.

**Waiting on Destin:** deck `docs/active/design/2026-10-01-r6-phone-abilities-questions.json`.
It covers skill update, theme install/remove/update, theme publish, the install count, the
report button, the skill file in the context panel, and `folders:add`.

**R6-2 log (instant buttons)** (app `session/simplify-r6-2`: `cea7358e5`, `6281f5424`,
`ed44c72de`; workspace `4e0f051f`):
- **One mechanism.** `state/pending-action.ts` (`runPending`), plus
  `hooks/usePhoneSessionActions.ts`, makes Stop, permission answers, Close, native send into an
  idle conversation, and the mode chip apply at once on a phone. Each confirms from the reply
  or record, undoes on refusal, and settles after a drop. Nothing is resent.
- **Phone only.** It applies to phone screens; the computer window is unchanged.
- **Speed.** With 0.8 s of added latency, the screen changes in about 15–31 ms.
- **Review: "ship with fixes".**
  - The REQUIRED fix was consent safety. A lost permission answer could stay drawn as
    "allowed". Now the fill's open-ask list reconciles every answered-pending card: one still
    open goes back to answerable with a "couldn't confirm" note, never resent. A failed or
    throwing resume counts as a failed check. This is tested on the real resume path.
  - Also fixed: Stop clears at once if the turn has already ended, the stale-idle bubble
    flash is reduced, and the adapters moved out of App.tsx.
- **Limits:**
  - A native send into a busy conversation still waits for the computer.
  - AskUserQuestion answers and the keyboard Esc stop keep the old path.

**Destin's answers (2026-10-01, deck `r6-phone-abilities-questions`, answers file committed).**
All of the following are allowed from a phone, and they become R6-3:
- skill Update (`skills:update`);
- theme install, remove and update;
- **theme publish**, against my recommendation of computer-only;
- the marketplace install count (`marketplace:install` report);
- the Report button (`marketplace:report`);
- a skill's own file in the "what the assistant was given" panel, under the R3-SEC deny list.

`folders:add` stays as it is: a phone may add any folder, and the deny list still applies.

**R6-3 log** (app `session/simplify-r6-3`: `9780bc94e`, `d5dc74afe`, `5ad841ed4`, `85708eb97`;
workspace `3822d495`, `5cde146a`):
- **Opened to the phone.** Eight more channels; the phone-open set goes from 259 to 267:
  - `skills:update`
  - theme install, uninstall, update and publish
  - `marketplace:install` and `marketplace:report`
  - `theme-marketplace:resolve-publish-state`: read-only, not on Destin's list, opened because
    the Publish sheet needs it.
- **Publish** takes a slug only and refuses marketplace-installed themes.
- **A skill's own file reads on a phone.** The read is judged before any host is asked:
  - the deny list applies to the real path;
  - regular files only, up to 1 MB;
  - the real path must sit inside `~/.claude/skills`, `~/.claude/plugins` or the session's
    `.claude/skills`;
  - the host's answer is deny-checked too.
- **Main-process freeze fixed.** A FIFO saved as `SKILL.md` froze the main process; the skill
  scan now stats before reading.
- **INCIDENT, 2026-10-01.** The R6-3 dev smoke published a test theme from a throwaway HOME.
  The OS keyring (Secret Service on the user's D-Bus) still handed out Destin's real `gh`
  login, so a real pull request opened: https://github.com/itsdestin/wecoded-themes/pull/37.
  Validation failed and there is no auto-merge. **Closing it is Destin's call.** The worker
  also printed the token once into its own local transcript; whether to rotate it is Destin's
  call.
- **The fix: `scripts/dev-isolation.sh`.** `run-dev.sh` sources it. With a throwaway HOME it
  sets up:
  - a private D-Bus;
  - XDG and `GH_CONFIG_DIR` inside the HOME;
  - credential environment variables unset;
  - a kwalletrc with the wallet disabled;
  - `--stop` killing the bus tree by exact pid.

  The real-home check uses `readlink -f`. It is tested by `scripts/dev-isolation.test.mjs`
  and documented in `docs/local-dev.md` and `docs/PITFALLS.md`.
- **Review:** "ship with fixes" for both halves, and all of them are fixed.
- **Final verify:** `verify --full` passes all 9 checks.

**Testing round (2026-10-02 to 10-04)**

Destin tested the series in a dev instance.

*Branches on top of r6-3:*
- `simplify-r6-4-fix` (0aab13e37)
- `simplify-sync-master`: app merge 381b74cdb of origin/master (26 commits, including the popups gate, which the series had branched before); workspace master merged too
- `simplify-sync-fix1` (3e12ea930)
- `simplify-sync-fix2` (3066982ab)
- `simplify-sync-fix3` (173e4ee87…b2b9af33c)

*What testing found:*
- A send typed into Claude Code's "Switch model?" pop-up was lost. The series lacked master's gate, so the fix was the master merge plus one detector in main.
- The "Model switched" divider retracted itself. The host scanned the whole screen for refusal words; only anchored signals count now.
- The real "Switch model?" dialog has no footer. A real capture of it was added (`switch-model-confirm`).
- After a reconnect, the phone showed live sessions as "Initializing". `started` now travels in the summary.
- The phone terminal waited for the chat page. `session:open {ptyOnly}` fixes it.

*One-shot state audit (`one-shot-audit.md`):* sync-fix3 fixed the gaps it found:
- the buddy fills through `session:open`;
- native model state is in the fill;
- theme, pinned pages and session list catch up on reconnect;
- dividers are kept in the fill tail.

*Windows/macOS/Linux:* Desktop CI ran on sync-fix2 by `workflow_dispatch`: all three passed (run 37172839368).

*sync-fix3 review fixes and fix4:*
- sync-fix3 review fixes: da5618c32 … b9c941614. They cover the Reload bar for late screens, theme reconnect that never persists, the pill race, buddy ask-end routing, divider timestamps and the buddy refill.
- `simplify-sync-fix4` e9ca4c0ac adds Discard/Dismiss on the phone's unsent-message note. Destin: "looks good so far" (2026-10-04).

*Destin's answers, 2026-10-04:*
- **Sounds:** at most one sound on reconnect, however many sessions are waiting. Done in `simplify-sync-fix5` e67716767: the phone coalesces each sound kind within a 1.5 s burst, and the computer is unchanged.
- **The buddy shows what the main window shows.** All three ledger gaps are closed. `simplify-sync-fix6` (e9684f200, c647eb839, with the workspace rule update 93b7fd2b) does this:
  - The buddy and App share `screen-feed.ts` (`attachTranscriptFeed`, `attachSessionLiveFeed`), and `BUDDY_LIVE` is deleted.
  - "Conversation cleared" has one source, the record's `session:live`, for both runtimes.
  - `clearDividerId` and `hasMarker` were each unified into one.
  - Duplication found elsewhere is listed for Phase 5 in `scratchpad/sync-fix6-report.md`.
- **Checks:** `verify --full` is green (run by me), shoot `--check` 189/189 and journeys 7/7.

*Still open for Destin:*
- the real-phone pass.

**Parked by Destin (2026-10-02):** the blue "reply ready" dot stays per screen, as designed in R5-3. A reply read on the computer still shows blue on the phone. The option of making "seen" shared through the record was offered, and he said "leave it for now".

**R6 status (2026-10-04):** R6-1, R6-2 and R6-3 are built. **R0–R6 are complete and ready to merge together as `feat/one-core` in both repos** (stacked from the `session/simplify-*` branches through `simplify-sync-fix6`, with master merged in). Nothing is merged until Destin says so.
What remains after the merge:
- Destin's real-phone pass and a real Android device check;
- re-recording the Claude Code capture corpus on the current version;
- the Phase 5 tidy-up sync-fix6 listed;
- archive this plan.

All four are filed in `docs/roadmap/` (remote-access, android-only, claude-code-integration, dev-workspace). The shared blue "seen" dot is parked there too, and `folders:add` is recorded as decided-unchanged. The R0 edit lock (`docs/active/locks/phase4.json`) was retired on 2026-10-04: its `paths` list is empty, which means no lock.

## What this plan deliberately does not touch

Independent remote items that do not need the refactor and may land any time: password
confirm field, device-removal undo, Keep-awake explainer, setup step count, wallpaper/mascot
on phone, service-worker "can't reach" page, browser encryption (approved design, own
project), YouCoded-account access (v1.4 idea). Any of these that edits `remote-server.ts`
waits for R3 to finish, or goes in once its family file exists.

## Decisions for Destin (later — not blocking this document)

| # | Question | Recommendation | Why |
|---|---|---|---|
| 1 | ~~Start R1 only after `feat/specialists-plans-ui` merges?~~ | **Decided 2026-09-29:** start now; in-flight branches are rewritten onto the new layout after R2 | Destin chose not to wait for other branches |
| 2 | ~~Generate preload's channel list from one contract (reopens D10)?~~ | **Decided 2026-09-29: generated, as static code** | Destin approved; the list stays explicit and readable, only its source changes |
| 3 | R5 (computer keeps the record): is it wanted, as its own phase after Phase 4? | **Yes** | It is the fix for the slow reconnect, "every session sent to every phone", and screens disagreeing. It changes how the phone behaves, so it is outside the release-blocker scope |
| 4 | Should the "working / needs you" status be computed on the computer itself, so a phone is accurate even with no computer window open? | **Measure first, then likely yes** | It is the one piece of live state only a window knows. Moving it costs some background work on the computer |
| 5 | Should the computer's own window eventually talk over the socket door too (one client, not two)? | **Not now** | The generated contract gets most of the benefit. A socket door on the computer adds a local attack surface, for little gain |

## Risks

- **Behaviour is already different on the phone, so unifying changes it.** Mitigation:
  per-run change lists; real-phone passes in R0.
- **Calendar.** R1–R4 gate v1.3.1, Phase 5 and the Android rebuild. Mitigation: R0's
  shrinking lock; families move in parallel only if they share no state (reviewer decides).
- **Security regression by merge.** Remote-only guards sit inside case bodies. Mitigation:
  policy fields in the table; existing refusal tests and ast-grep rules stay; a reviewer checks
  each run's refusal list against today's.
- **R5 memory.** A numbered ring per session costs memory on the computer. Mitigation:
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
