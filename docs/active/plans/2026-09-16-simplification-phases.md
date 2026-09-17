---
date: 2026-09-16
status: active
type: plan
topic: Executing the 2026-09-16 simplification audit in seven phases — small fixes, deletions and tooling ratchets first, then the always-on timers, the launch path, one door for desktop and phone, and the remaining structure — each phase one worker, one reviewer, nothing on screen changing
---

# Simplification phases — implementation plan

> **For agentic workers:** one phase = one worker in its own worktree. Read `.claude/rules/test-suite-hygiene.md` (every guard below must be shown red once, then green — paste that run), the rules `docs/MAP.md` names for each file you edit, and `docs/PITFALLS.md` before the first edit. Item ids (W, D, M, B, G) are defined in the audit; this plan does not restate their evidence.

**Source:** `docs/active/investigations/2026-09-16-simplification-audit.md` (read against app master `912d0972`). This plan's phase list **supersedes the audit's §8**.

**Goal:** less code and less background work, with **zero user-visible change** except where a phase says otherwise (D8's row order, D1's phone behaviour). Every phase is accepted on `bash scripts/verify.sh <app worktree>` from the workspace root plus the guards it names — never on a feeling that it is faster.

**Sibling plan:** `docs/active/plans/2026-09-16-smoothness-batches-a-c.md` (branches `perf/shell-redraw-per-token` = Batch A, `perf/main-thread-click-paths` = Batch C, both built and unmerged on 2026-09-16). Phases 2, 3 and 5 edit files those branches also edit; their preconditions say so.

## Decisions (Destin, 2026-09-16)

| Item | Decision |
|---|---|
| M1 overlay buddy strategy | **Delete** all of it: `buddy-overlay-manager.ts`, `buddy/BuddyOverlayApp.tsx`, `buddy/overlay-state.ts`, its five IPC channels (`shared/types.ts:1983-1997`), the four `instanceof` branches in `main.ts`, the chooser's env-var path in `buddy-manager.ts:39-48`, and its test. The strategy interface with one implementation left goes with it. |
| M2 harness eval tooling in the installer | **Move it out of the packaged app.** The worker picks the less invasive *correct* option: move `src/main/harness/eval/` to `desktop/test-engine/lib/` with its own tsconfig, or exclude `dist/main/harness/eval` in `electron-builder.yml`. A move also updates `.claude/rules/harness-evaluator.md` `paths:` and `docs/MAP.md` (a workspace-repo commit); an exclude leaves `tsc` still compiling it. Either way the installer must no longer contain it — prove it by listing the built `app.asar`. |
| D9 Android duplicated logic | **Not in this plan.** Folded into the Android rebuild: `docs/active/investigations/2026-09-10-android-parity-audit.md`. |
| W26 particle pause on occlusion | **Skipped.** Destin's standing requirement is the broader one: **no unnecessary rendering or graphics work while the app is minimised.** True today because Chromium does not paint a hidden window; the particle canvas and the mascot gate on `visibilitychange` / `data-doc-hidden` (`renderer/index.tsx:65-73`, `styles/mascot.css:95-98`); and background throttling is never disabled (`backgroundThrottling` appears nowhere in `desktop/src` on 2026-09-16), so JS timers in a hidden window slow to once a second. Two guards keep it true: Phase T's source guard that fails if `backgroundThrottling: false` ever appears, and Phase 2's shared tick pausing while `document.hidden`. |
| D10 generated bridge table | **Measured only.** Not scheduled; the bridge stays hand-enumerated because it is the security boundary. |

## Execution protocol (every phase)

1. `node scripts/workspace-start.mjs --session simplify-<phase> youcoded` from the workspace root; work only at the absolute paths it returns. Branch `session/simplify-<phase>` in the app repo.
2. WHY comment at every non-trivial edit, dated and naming the item id (`WHY (2026-09-16 audit W14): …`).
3. Each guard the phase names: write it, invert what it guards, paste the red run, restore, paste the green run (`.claude/rules/test-suite-hygiene.md`).
4. `bash scripts/verify.sh <app worktree>` from the workspace root; all lines green.
5. Stage by explicit path, inspect the staged diff, commit, **push the branch. No PR** — Destin merges.
6. A **fresh reviewer agent** reads the pushed diff with the audit rows for that phase and reports: regressions, visible changes, guards that could not fail.
7. The coordinator reads only the worker's report, the reviewer's report and the verify output — never the diff itself.
8. The worker records the outcome in the **State** section at the bottom of this file (workspace repo, this session's branch or a fresh one).

**Never** run or probe Destin's built app. Runtime checks, where a phase asks for one, use `bash scripts/run-dev.sh --label "<phase>"` from the app worktree, announced before launch, killed by pid after.

## Phase order and what each is for

| Phase | Name | Items | Runs (worker + reviewer) | Precondition |
|---|---|---|---|---|
| 1a | Small fixes, zero visible change | D6, B1, B2, D13, M3, M4, M7, M8, W10, W13, W14, W20, W24 | 1 + 1 | none |
| 1b | Delete unreachable and unshipped code | M1, M2 | 1 + 1 | none |
| T | Tooling ratchets | G1, G2, G9, G3, G4, throttling guard | 1–2 + 1 | none; runs alongside 1a/1b |
| 2 | Always-on timers | W2, W7, W8, W9, W11, W12, W18, W19, W23 | 2 + 1 | Batch C merged or dropped |
| 3 | Launch path | W3, W4+D5, W15, W16, W17, W25, W21, W22 | 2 + 1 | Batches A and C merged or dropped |
| 4 | One door for desktop and phone | D2, D1, D3, M5 | ~12–20 + one reviewer per run | runs alone |
| 5 | Structure B | D4, D7, D8, D11, D12, W5, W6, W1 | 4–5 + 1 each | Phase 4 done; Batch C merged or dropped |

1a, 1b and T are independent and may run at the same time in three worktrees. 1a and 1b both touch `main.ts` only in different regions (1a: none; 1b: buddy branches), and neither touches T's files.

---

## Phase 1a — small fixes, zero user-visible change

**For Destin.** Today the app does a handful of tiny pointless things: it reads your settings file six times when you open Preferences, asks the operating system "is anyone here?" every 15 seconds even when you are signed out, wakes a phone-connection timer with no phone connected, keeps a spare copy of a spinner, and one download type can crash the app if the disk fills mid-download. What changes: each of those gets its one-line-to-twenty-line fix. End state: the same app, doing slightly less. **You would notice nothing.** If you notice anything at all, that is a bug in this phase.

**Items and files**

| Item | Change | Files |
|---|---|---|
| D6 (fixes B3) | Delete the hand-rolled dot-path walk; call `getJsonPath`/`setJsonPath` | `main/ipc-handlers.ts:1308-1331`; helper `main/safe-json-path.ts` |
| B1 | Phone Resume list: map desktop session ids to transcript ids before excluding, as the desktop path does | `main/remote-server.ts:1773-1783` (pattern at `main/ipc-handlers.ts:1840-1856`) |
| B2 | Add the stream-error guard the two sibling downloaders have — **that guard only**; the D7 unification is Phase 5 | `main/model-downloader.ts:255-274` (copy from `main/engine-acquisition.ts:533-566`) |
| D13 | Byte-equality test covers all four hook scripts | `tests/statusline-rate-limits.test.ts:73-76`; `desktop/hook-scripts/` vs `app/src/main/assets/` |
| M3 | Fix the comment: the consumer is Android, not bash hooks. Keys stay | `main/sync-state.ts:253-334` |
| M4 | Delete the `'thinking'` member | `shared/types.ts:136` |
| M7 | Delete the `SkillProvider` interface; export the class's type | `shared/types.ts:1189-1209`; `main/skill-provider.ts:101`; `renderer/state/skill-context.tsx:43` |
| M8 | One latest-wins buffer helper | `main/remote-server.ts:1049-1065, 1084-1085` |
| W10 | Memoize the settings parse on (mtime, size) inside the handler | `main/ipc-handlers.ts:1296-1305` (Phase 3's D5 later moves this region; keep the memo small) |
| W13 | Idle poller starts on socket connect, stops on disconnect | `main/social-handlers.ts:49, 132-144`; `main/main.ts:1925` |
| W14 | Ping timer armed in `addClient`, disarmed in `drop` | `main/remote-server.ts:140, 1351-1371, 679-688` |
| W20 | Render `<BrailleSpinner>` | `renderer/components/.../InstallFavoriteCorner.tsx:30-35` |
| W24 | Pass `40` rows | `renderer/hooks/useAttentionClassifier.ts:158-173`; `renderer/state/terminal-registry.ts:90-113` |

**Gate.** `verify.sh` green. Guards: D13's extended equality test (prove red by editing one byte of an Android copy in a temp fixture, not the real file); B1 gets a case in `tests/session-browser.test.ts` or a remote-server test: an open desktop session's transcript is excluded from the phone list; B2 gets a case in the model-downloader test: a stream `error` rejects instead of throwing unhandled; W14: a test that no timer exists with zero clients. Check first whether Batch C merged — C6 edits `remote-server.ts:1782`, one line from B1; resolve on rebase.

**Risk line.** None per row; the only ordering trap is W10 sitting in a region Phase 3 rewrites, so its memo must not grow beyond the handler.

## Phase 1b — delete unreachable and unshipped code

**For Destin.** Today the app carries two things nobody can reach: a second way of drawing the buddy over your desktop that no setting turns on (about a thousand lines), and the developer test-scoring tools (about four thousand lines) that get packed into every installer. What changes: the first is deleted; the second stops shipping to users. End state: a smaller installer and one less buddy code path to keep in step. **You would notice nothing** — the buddy behaves exactly as it does now, and the installer is a little smaller.

**Items and files.** M1: `main/buddy-manager.ts:39-48`, `main/buddy-overlay-manager.ts`, `renderer/components/buddy/BuddyOverlayApp.tsx`, `renderer/components/buddy/overlay-state.ts`, `shared/types.ts:1983-1997`, `main/main.ts:2038, 2185-2200`, `preload.ts` bindings for the five channels, `tests/buddy-strategy.test.ts` (rewrite for one strategy or delete), `.claude/rules/buddy-floater.md` (drop its overlay references; workspace commit). M2: `main/harness/eval/` (14 files), `electron-builder.yml:128-134`, callers in `test-engine/*.mjs`; on a move, also `.claude/rules/harness-evaluator.md` `paths:`, `docs/MAP.md`.

**Gate.** `verify.sh` green (knip must stay at or below its count — deletions can expose newly-unused exports; delete those too). M1: the IPC parity test set (`tests/ipc-channels.test.ts` and its siblings) passes with five fewer channels; `rg -n "overlay" desktop/src/main desktop/src/renderer/components/buddy` shows only the KDE/kwin overlay that is a different thing. M2: `npm run build` then list `app.asar` contents — no `harness/eval`; `test-engine/harness-eval.mjs --dry-run` still works (the harness-evaluator rule's `verify:` anchors must still resolve). A `node scripts/audit-anchors.mjs` run from the workspace root for the workspace commit.

**Risk line.** M1 none for users; M2 changes installer contents, so the built-app proof is the gate, not the diff.

## Phase T — tooling ratchets (parallel with 1a/1b)

**For Destin.** Today the workspace owns checks that could catch dead code, oversized files and always-on animations, but they either warn without failing or run only when someone remembers. The dead-code count grew 77% with every check green. What changes: five ratchets — each freezes today's number and fails the build if it grows. No code is converted; the day-one allowlists *are* the inventory. End state: this kind of drift becomes a red check instead of an audit finding. **You would notice nothing** in the app; you would notice future pull requests failing for a new reason, with the reason named.

**Items and files** (all in the app repo)

| Item | Change | Files |
|---|---|---|
| G1 | Commit `knip-baseline.json`; a check parses `knip --reporter json` and fails on growth of exports/types; `unlisted` → error; fix the 4 unlisted deps (`@ai-sdk/provider` in two files, plus two more from the report) | `desktop/knip.jsonc:84-93`, `desktop/package.json`, new `scripts/knip-ratchet.mjs` (or in `verify.sh`), `.github/workflows/desktop-ci.yml` |
| G2 | `line-budgets.json` freezes the 19 files over 1,500 lines at today's size; unlisted files ≤ 1,500; two dev-only registries exempt with reason | new `desktop/tests/line-budgets.test.ts` (source guard, `readStripped` not needed — raw line count), `desktop/line-budgets.json` |
| G9 | `lint:design --max-warnings <today's 539>` in CI | `desktop/package.json:20`, `desktop-ci.yml` |
| G3 | Every renderer file with `setInterval(` is allowlisted-with-reason or references a visibility hook. **Allowlist only, no conversions**; Phase 2 shrinks the list | new `desktop/tests/renderer-intervals-visibility.test.ts` (house style: `tests/helpers/guard-scope.ts`) |
| G4 | Invert the infinite-animation allowlist: sweep every `.css` and inline `animation:`; any `infinite` not `steps()` fails unless in `SMOOTH_OK` with a reason. The two known leaks at `globals.css:831, 887` and the JS-gated mascot/buddy set go in `SMOOTH_OK` on day one | extend `desktop/tests/animation-frame-budget.test.ts` or new `tests/infinite-animations-allowlist.test.ts` |
| throttling guard | Fails if `backgroundThrottling: false` appears anywhere in `desktop/src`. Prefer an ast-grep rule (`scripts/ast-grep/rules/background-throttling-never-off.yml`, workspace repo, with the fixture `check.sh` requires) over a text guard | `scripts/ast-grep/rules/`, `scripts/ast-grep/check.sh` |

**Gate.** Each ratchet shown red once: add a dead export (G1), a line past a budget (G2), a raw colour (G9), a bare `setInterval` in a new renderer file (G3), a smooth `infinite` (G4), `backgroundThrottling: false` in a window options object (throttling). `verify.sh` green on master's state. CI workflow edits proven by a PR-branch run, read — not assumed.

**Deferred, noted here so nobody re-derives them.** G5 (render-count tests): **after Batch A merges** — cherry-pick its three test files, do not rewrite them. G6/G8 (idle-CPU and startup numbers): need a same-machine runner. G7 (bundle budget), G10 (IPC payload trace), G12 (coverage ratchet): later, unscheduled. G11: checked, not worth adding.

**Risk line.** False positives on day one are the point; a ratchet that starts red is misconfigured, not a finding.

## Phase 2 — always-on timers

**For Destin.** Today about a dozen background timers run for the life of the app whether or not anyone is looking: a status refresh every 10 seconds that re-reads files and sends the same answer to every window; a 2-second poll of every conversation file next to a watcher that already reports changes; an internet check every minute with sync off; a "is a phone connected?" question every 10 seconds; and five kinds of on-screen counters each running their own clock. What changes: each timer either waits for the thing it watches, or runs only while a window is visible or a phone is connected, and the counters share one clock that stops while the window is hidden. End state: an idle or minimised app does close to nothing. **You would notice:** nothing when the window is up. On coming back from minimised, the status bar refreshes within a moment rather than being already fresh; "No internet" can take up to five minutes to clear. Elapsed-time counters must show the right number when you return — they are computed from start times, not from counted ticks, so a paused clock loses nothing.

**Precondition.** Batch C (`perf/main-thread-click-paths`) edits the same status poll (`ipc-handlers.ts:2318-2411`), topic poll and transcript safety poll (`transcript-watcher.ts:692`). It must be merged or dropped first, or the worker branches from it.

**Items and files.** Main-process worker: W2 (`main/ipc-handlers.ts:2318-2411` — skip byte-identical sends; tick only while a window is visible or a phone is connected; push once on window show), W7 (`main/transcript-watcher.ts:687-703, 662-682` — poll only on Windows and on watcher error), W8 (`main/subagent-watcher.ts:72, 220-258, 305-315`), W9 (`main/chatsearch-index/outbox-drain.ts:149-196, 296-306` — sweeps hourly), W11 (`main/engine/engine-supervisor.ts:1125-1140, 1075-1098` — 400 ms loading, ~10 s idle), W12 (`main/sync-service.ts:99, 218-224, 1010-1092`; `main.ts:2390` — gated, 5 min), W18 (`main/remote-server.ts:228-232, 519-526`; `renderer/App.tsx:2387-2415` — `clientCount` rides the status push). Renderer worker: W19 (new `renderer/hooks/useSecondsTick.ts` on `BrailleSpinner.tsx:17-67`'s pattern, **paused while `document.hidden`**; callers `ToolBody.tsx:316-322`, `RunStatusLine.tsx:17`, `AttentionBanner.tsx:96`, `CompactingCard.tsx:13`, `ModelLoadingBar.tsx:83`), W23 (`renderer/components/mascot/MascotRig.tsx:252-269`).

**Gate.** `verify.sh` green. Guards: W19 — `tests/use-seconds-tick.test.tsx` with fake timers: N subscribers share one interval; zero ticks while hidden; one tick on return. W2 — a test that an unchanged payload is not sent and that a window-show triggers one push. W7 — `tests/transcript-watcher.test.ts` gains "no poll timer on linux with a healthy watcher". Phase T's G3 allowlist shrinks by every file this phase converts — the worker removes those entries, so the ratchet moves. Dev-instance check (announced, killed by pid): status chips and a tool card's elapsed seconds still update; minimise for 30 s, restore, counters correct.

**Risk line.** Low; the one real edge is "push on window show" for W2 and W12's slower "No internet" clear.

## Phase 3 — launch path

**For Destin.** Today, every time the app starts, before the window appears, it copies its five helper scripts over themselves and rewrites your Claude settings file four separate times by four separate pieces of code, whether anything changed or not; then the chat screen fetches marketplace data nothing on that screen shows, twice; and every open conversation — even the kind that never has a terminal — gets a full GPU terminal built for it. What changes: the launch chores run once through one settings module and skip when nothing changed; marketplace data loads when you open the marketplace; native conversations get a terminal only when you switch to the terminal view; the syntax-colour theme you are not using is not loaded. End state: a shorter path to the first screen. **You would notice:** the first marketplace open shows its own loading state instead of arriving pre-warmed; nothing else.

**Precondition.** Batch A edits `App.tsx`'s root (W21's region); Batch C edits `ipc-handlers.ts`. Both merged or dropped first, or the worker branches from them.

**Items and files.** Main-process worker: W3 (`main/main.ts:1688-1714`; `scripts/install-hooks.js:41-53, 236` — version stamp that includes dev/packaged; compare serialized output before writing; drop the pre-scan), W4 + D5 (new `main/claude-settings.ts`: `readSettings`, `mutateSettings(fn)` under `artifacts/cas-write.ts:165`'s lock, `getField/setField` over `safe-json-path.ts`, **one** failure rule for an unparseable file — the refusing one; callers `install-hooks.js:246`, `hook-reconciler.ts:31,105`, `disable-prompt-suggestion.ts:16-49`, `retention-default.ts:29-57`, `claude-code-registry.ts:117,275`, `ipc-handlers.ts:1295-1331`, `remote-server.ts:2981-3040`; **order at `main.ts:1744-1750` is load-bearing**). Renderer worker: W15 (`App.tsx:3665-3670`; `TerminalView.tsx:125, 203-241`; `main/session-manager.ts:176-188` — provider-gated only), W16 (`App.tsx:4700-4710`; `marketplace-context.tsx:189-205, 241`; `marketplace-stats-context.tsx:102, 128-130`), W17 (`skill-context.tsx:69-70`; `marketplace-context.tsx:162, 200-201`), W25 theme half (`theme-context.tsx:3-5, 167`; the highlighter half of `MarkdownContent.tsx:2-4` is optional and needs a flash-of-plain-code check before it is kept), W21 (`App.tsx:3551, 3778-3799`; `StatusBar.tsx:961`; `HeaderBar.tsx:368` — one handler reads a ref and must keep doing so), W22 (`ContentFindBar.tsx:27-47, 93-115`).

**Gate.** `verify.sh` green. Guards: D5 — a test that the four launch chores produce one write when the file is already correct and one write when it is not, and that an unparseable file is refused (never overwritten); a source guard that no file outside `claude-settings.ts` writes `settings.json` under `~/.claude`. W15 — a test that a native session mounts no terminal until terminal view. W16 — a test that no marketplace IPC fires on mount. W21 — after Batch A's render-count test lands, extend it: a status push re-renders `StatusBar`, not `HeaderBar`. Dev-instance check: launch with a deliberately stale hooks dir → restaged once; launch again → no write (compare `settings.json` mtime); open a native session, switch to terminal view, terminal appears.

**Risk line.** D5's failure rule and the launch order are the two decisions that can break a real user's settings file; the dev-instance and the unparseable-file test are non-negotiable.

## Phase 4 — one door for desktop and phone

**For Destin.** Today the desktop window and a phone reach the app's features through two different doors, and behind them 182 features are written out twice by hand — some already behave differently on the phone. The cause is that the code which registers the desktop features also *builds* the assistant runtime inside itself, so the phone door cannot share it. What changes: the runtime is built once and handed to both doors; then each group of features is moved to a table both doors read, one group at a time; then the three copies of "turn a chat event into a screen update" become one; then the event type gets a proper shape the compiler can check. End state: one body per feature, and the phone bug where already-open sessions show in Resume is fixed by construction (Phase 1a's one-liner is the interim). **You would notice:** where the phone had drifted from the desktop, it now matches the desktop — that is a change on the phone, listed per group in each run's report. The buddy's three known missing behaviours (it does not clear on `/clear`, etc.) stay missing in this phase; closing them is visible and is its own decision.

**Must run alone.** Nothing else edits `main/ipc-handlers.ts` or `main/remote-server.ts` while Phase 4 is in flight. Coordinator checks open branches before starting each run.

**Order and files.**
1. **D2** (one run): hoist runtime construction out of `ipc-handlers.ts:2669, 3074` into `main/create-runtime.ts`, called from `main.ts`; each handler group becomes `main/ipc/<group>.ts` exporting `register(ctx)`. Pure move; keep the two ordering assumptions the audit names. Gate: `verify.sh`, IPC parity tests unchanged, `rg -n "new NativeSessionHost|new .*Supervisor" main/ipc-handlers.ts` empty.
2. **D1** (one run per channel group; 36 banner-separated groups today — merge trivially small adjacent groups only when the reviewer agrees): a channel table `{name, handler(payload, ctx)}` registered once; both transports iterate it. Normalise on the object first (preload passes positional args, the shim one object). Files: `main/ipc-handlers.ts:346-5192`, `main/remote-server.ts:1670-3765`, `preload.ts`, `renderer/remote-shim.ts`; rule `.claude/rules/ipc-bridge.md`. Gate per run: `verify.sh`; the two parity tests; a per-group test that desktop and phone call the same body; the run's report lists every phone behaviour that changed.
3. **D3** (one run): one pure `eventToAction(event, {live})` in `renderer/state/`; callers `App.tsx:1363-1664`, `buddy/BubbleFeed.tsx:101-312`, `state/transcript-page-actions.ts:26-31`. Keep the buddy ledger's three gaps as they are (visible if closed). Gate: `tests/transcript-event-surface-parity.test.ts` still passes with its ledger intact.
4. **M5** (one run, the payoff): `TranscriptEvent.data` becomes a discriminated union (`shared/types.ts:243-512`). Crosses IPC and persisted transcripts; Kotlin's copy is D9's problem — note the divergence, do not touch Android.

**Gate for the phase.** G2's line budgets drop for `ipc-handlers.ts` and `remote-server.ts` on every run (the worker lowers the budget; never leaves headroom). B1's 1a fix is deleted when its group moves. Dev-instance check after the last D1 run: a phone session (remote web) opens Resume, installs a skill, pages history.

**Risk line.** Needs care: behaviour is already divergent, so unifying changes what the phone does. The per-group reports and parity tests are the net; the phase is the largest in this plan (~5–6k lines net removed).

## Phase 5 — structure B

**For Destin.** Today the remaining oversized pieces: one 4,756-line object that runs conversations and also orchestrates helper agents (which already have their own home); three copies of the file downloader; two parallel settings screens sharing 14 of 17 rows; a history-replay path that reads a 112 MB file into memory with no caller; the Resume browser re-reading every conversation file on every open. What changes: each is split, merged or cached along the seam the audit names. End state: files a session can hold in its head, and Resume that opens from a cache. **You would notice:** Resume opens faster on a big history; the settings screen's row order may shift slightly — D8 gets a before/after review deck before it is kept. Nothing else.

**Precondition.** Phase 4 done (D4 and D7 touch the runtime Phase 4 moves). Batch C merged or dropped (C6 edits `session-browser.ts`, W1's file).

**Items and files** (one worker per row group; D8 alone)

| Item | Change | Files |
|---|---|---|
| D4 | Specialist block → `harness/specialists/orchestrator.ts`; shells → `harness/shells/`; host keeps registry + lifecycle. `LiveEntry` and reserve/bind/release stay on one object | `main/harness/native-session-host.ts:359, 504-2096, 1593-1676, 2257-2460, 2701-2775` |
| D7 (closes B2) | One `main/download-stream.ts` (`fetchToFile`, `fileDigest`); callers keep progress adapters | `voice-assets.ts:343-374, 384`; `engine-acquisition.ts:533-566`; `model-downloader.ts:255-274, 304`; `update-manifest-verify.ts:82`; `manifest-backfill.ts:127` |
| D8 | One `<SettingsBody>` with two platform inserts; **before/after review deck** per `.claude/rules/review-deck.md`, both platforms, every theme, before Destin sees it | `renderer/components/SettingsPanel.tsx:353, 2569-3184` |
| D11 | `injected` is the discriminant; `kind` optional-and-ignored for one release | `shared/types.ts:385-405, 951-995`; `state/chat-reducer.ts:1401` |
| D12 | Manager's three engine calls go through `supervisor.trackedFetch` | `main/engine/engine-manager.ts:703, 1189, 1594, 1783, 1954`; `engine-supervisor.ts:339-345, 609-613, 916` |
| W5 | Verify no caller, then delete `TRANSCRIPT_REPLAY`, its preload binding and `getHistory` | `main/transcript-watcher.ts:615-655`; `ipc-handlers.ts:3168-3178, 3241-3249`; `preload.ts:1232` |
| W6 | Memoize slug → path per process; cap the fallback | `main/session-browser.ts:189-215`; `main/transcript-cwd.ts:76-104` |
| W1 | `(size, mtime) → meta` map in front of the per-file reader; short memo of the list | `main/session-browser.ts:401-505, 299-385`; callers `ipc-handlers.ts:1853`, `projects-index.ts:134`, `remote-server.ts:1780` |

**Gate.** `verify.sh` green. Guards: D7 — one downloader test covers disk-full mid-stream for all three callers; D11 — `tests/chat-reducer.test.ts` case for a persisted turn with `kind` absent; W1 — `tests/session-browser.test.ts` case: second listing of an unchanged directory performs zero file reads (count via an injected `fs`), a touched file is re-read; W5 — `rg -n "TRANSCRIPT_REPLAY|getHistory\(" desktop/src` returns nothing after; D8 — the deck, answered. G2 budgets lowered for every file that shrank.

**Risk line.** D4's shared mutable state and D8's visible row order are the two places to slow down; everything else is low.

---

## Not scheduled (recorded so the list stays honest)

D9 (Android rebuild), D10 (measured), W26 (replaced by the two guards), M6 (`YOUCODED_NATIVE` half-enforced flag — retire or enforce at one chokepoint; one line, whenever a Phase 4 run passes it), M9 beyond G1's ratchet, B4 (in-view class after compaction — filed with the smoothness sweep's D-batch), B5 (`stableStringify` in `chat-reducer.ts:1115` — one line, take it in 1a if the worker has room, else file), G5–G8, G10–G12, and the unread native turn loop (`harness-session.ts:2263-3719`).

## State

| Phase | State |
|---|---|
| 1a | merged 2026-09-16 (youcoded#497 `289730cb`) |
| 1b | merged 2026-09-16 (youcoded#498 `ad2b709b`; rules youcoded-dev#118 `3eb6e5c0`) |
| T | merged 2026-09-16 (youcoded#499 `41ab097b`; verify step + ast-grep rule youcoded-dev#119 `d23c3945`) |
| 2 | merged 2026-09-17 (youcoded#503 `88f286a1`) |
| 3 | not started — Batch A/C precondition met (youcoded#501) |
| 4 | not started |
| 5 | not started |
