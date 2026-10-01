---
date: 2026-09-24
status: active
type: plan
topic: Remote access refactor — one assistant core with one feature list that the desktop window, a phone browser and (later) the Android app all reach through the same doors; extends simplification Phase 4 with a computer-owned session record, per-session delivery and resume
---

# Remote access refactor — plan

> **Status.** The plan of record for this work (written 2026-09-24). **Entry point:**
> `docs/active/handoffs/2026-09-24-one-core-START-HERE.md`, which has the one ordered list of
> every phase, remote and Android together. This plan **is** the run list for simplification
> Phase 4 (`docs/active/plans/2026-09-16-simplification-phases.md`): Phase 4 = R1–R4. It also
> covers what follows (R5–R6). Held 2026-09-18; **Destin lifted the hold 2026-09-29** ("i want
> to do the remote stuff"). Still a v1.3.1 blocker. The decisions table at the end is still open. Companion:
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
> (1) The `ChannelDef` fields `sessionScoped`, `messageKind` and `rejectOnNotOk` are not read
> anywhere yet. Implement them before the first entry relies on them, or drop them.
> (2) The phone door consults the table *before* its switch, so every remote-only guard in a
> case body must be restated in the entry.
> (3) The `first-run` local-download handlers ignore the `sessionId` they receive; this is
> kept as a `TODO(one-core R3)`.
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

**Gate:** a scripted reconnect test. Drop the connection mid-turn and reconnect; bytes sent
must be proportional to what was missed, not to total history. The first-connect timing must
be measured on a **real phone** (dev-mode timing does not count, per the roadmap).

### R6 — things that become cheap afterwards (each its own small decision)

- **Native sessions from the phone:** flip `native.supported` for remote clients (Destin
  2026-09-11: "remote access should be identical to the desktop"). **Still open:** may a phone
  add or change provider keys? Needs R3 group 5 only, so it may run earlier if Destin wants.
- **Instant buttons:** Stop, permission answer, close, send, permission mode. The phone updates
  its own screen at once and undoes the change if the computer refuses. Needs R5's record.
- **More features over remote** (`social`, most `artifacts`, `project`, `theme`, `marketplace`,
  `dialog`). Each becomes a one-line table policy change. *Which* to open is Destin's call
  (`docs/active/investigations/2026-09-01-remote-unbridged-channels.md`).

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
