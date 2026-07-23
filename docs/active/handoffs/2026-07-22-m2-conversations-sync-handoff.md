---
status: active
created: 2026-07-22
type: handoff
program: docs/active/plans/2026-07-22-native-runtime-parity-program.md (§3 — Milestone M2)
---

# Handoff: Implement M2 — Conversations & Sync (native session parity)

**For the implementing session:** you are executing Milestone M2 of the native-runtime parity program. Read this handoff, then the program doc §3, then the design doc — in that order. Your first deliverable is an implementation plan at writing-plans granularity (program §9 mandates a per-milestone plan doc BEFORE code); execute it with subagent-driven development in a worktree.

## Why this matters now (Destin, 2026-07-22)

**M2 gates v1.3.0.** Destin's ruling: core sync functionality must be complete before the version is finalized — "sync needs to be finished before we version." M2 is the native-session half of that milestone (Android sync is a separate v1.3.1 work stream, not yours). Do not let scope drift into M3+ items.

## What M2 is (program §3 — read it in full; summary here)

Six items, design basis `docs/active/specs/2026-07-18-native-sync-parity-design.md` (Option C):

1. **Store provider-awareness (writes)** — `provider:'native'` records; provider-aware `localJsonlPath`/`transcriptRef` (native transcripts live at `~/.youcoded/sessions/<slug>/<id>.jsonl`); route the native host's `transcript-event` into `noteTranscriptEvent` (today fed only by CC's TranscriptWatcher, hardcoded `provider:'claude'`); write portable `lastUsedModel` on create/`setBinding`/turn-complete.
2. **Read-side unlock** — three provider locks (anchors below) + retire the 2026-07-19 meta-refusal stopgap in the same pass (replace `session-meta-native-refusal.test.ts` with parity tests).
3. **Resume picker + `lastUsedModel`** — native ResumeBrowser rows present the provider-scoped model selector (same data source as ModelPickerPopup's native branch), pre-filled from `lastUsedModel`; selection becomes the binding. **Never auto-launch a binding.**
4. **Space sync + takeover** — native branches in `flushSessionToSpace`/`mirrorIn`/`materializeOne`; re-enable the reverted native lease acquire; `nativeHost.interrupt` replaces the ESC byte in the holder quiesce; requester's post-takeover resume lands in the item-3 picker.
5. **Auto-titles** — native sessions are never auto-named: CC titles flow Auto-Title hook → `~/.claude/topics` → topic-watcher → `setTitle`, and topic-watcher is `setTitle`'s ONLY caller. Native needs its own feeder (title at first-turn end via the bound model; skip below a capability floor once M6 tiers exist — current profiles fine).
6. **Store-availability fix (not native-specific)** — `noteFlagChanged`/`noteSessionNote` are `store?.` optional-chains: a null store (boot window) evaporates the write while the IPC still broadcasts META_CHANGED and returns `{ok:true}`. Bound the reachability, buffer meta writes until `startConversationStore()`, flush in order, honest `ok:false` + renderer revert if the store never comes up.

## The settled design ruling (do NOT re-litigate)

Model bindings are **device-local** (per-device provider ULIDs in never-synced `~/.youcoded/providers.json`; machine-bound keys; multi-GB local GGUFs) — a synced transcript can't carry a usable binding. **Destin (2026-07-22): resuming a native session ALWAYS offers the model selector, on any device** — same as CC resume offers alias choice. `lastUsedModel` is the synced, *portable* hint (model id + provider type/label, NEVER the device-local ULID) that pre-fills the selector. This dissolves the cross-device-continuation problem by design.

## State of the world (verified 2026-07-22, youcoded master `e6d4ca3f`)

**M1 just shipped** (PR #204, program §2 — plan archived at `docs/archive/plans/2026-07-22-m1-session-control-plan.md`). What it changed that you touch:
- `NativeSessionHost.send()` is sync, returns `NativeSendResult`, with a per-session FIFO queue; the transcript-event emit surface is UNCHANGED (frozen) — your item-1 event routing taps `nativeHost.on('transcript-event')` exactly as the host already re-emits.
- `native:send`/`native:queue-remove` are invokes on all four transports; mirror that transport pattern for any channel you add.
- The renderer has `queuedMessages` list state + a docked strip; timeline entries for queued sends appear only via the drain's `user-message` event.

**The sync subsystem was overhauled the same week** (youcoded #199 honest state machine, #201/#202 shared github-client, #203 connected-accounts). `flushSessionToSpace`/`mirrorIn`/`materializeOne` survived with the same names (verified), but read `.claude/rules/sync-spaces.md` + `youcoded/docs/sync-spaces.md` BEFORE planning item 4 — the state machine is now evidence-gated and your native branches must not reintroduce phantom "synced" states.

**Fresh anchors** (all verified on `e6d4ca3f`; re-verify anything you depend on — master moves fast this week):
- `desktop/src/main/ipc-handlers.ts:2616` — `session:get-meta` reads `store.get('claude', resolved)` (lock 1)
- `desktop/src/main/session-browser.ts:377` — resume overlay lists `store.list('claude')` only (lock 2)
- `desktop/src/main/ipc-handlers.ts:1417` — `session:browse` maps `nativeHost.list()` to `PastSession` rows with no flags/tags/note (lock 3)
- `desktop/src/main/ipc-handlers.ts:571` — the reverted native lease acquire ("Re-enable this together with the parity work, NOT before")
- `desktop/src/main/ipc-handlers.ts:2461` — `nativeMetaRefusal` helper (stopgap to retire); `NATIVE_META_UNSUPPORTED` in `desktop/src/shared/types.ts`; `metaDisabled` in ResumeBrowser; `metaSupported`/`metaLoaded` in CloseSessionPrompt; `desktop/tests/session-meta-native-refusal.test.ts`
- `desktop/src/main/ipc-handlers.ts:1984` — the only `noteTranscriptEvent` feed (CC-side, keyed via `sessionIdMap`→claudeId)
- `desktop/src/main/conversations/service.ts:267,271` — the `store?.` optional-chain meta writes (item 6)
- `desktop/src/main/conversations/transcript-mirror.ts:65` — `mirrorIn`; `service.ts:362` — `materializeOne` (bails on missing `transcriptRef` — item 1 makes the record exist)
- `desktop/src/main/conversations/conversation-store.ts:37-50` — record shape (`transcriptRef` etc., "LOCAL TRUTH" comment)
- Native transcript path builder: `desktop/src/main/native-home.ts:115` (`sessions/<slug>/<id>.jsonl`)
- `lastUsedModel` does not exist anywhere yet — you name it into the store record (portable shape per the ruling).

## Hard lessons that bind your tests (the #177 lesson)

`holder-takeover.test.ts` previously **certified a no-op** — the suite passed while native takeover destroyed the holder and transferred nothing, because the fakes could not express failure. Program §9: *fakes must be able to express failure, or the suite certifies the bug.* Your item-4 work MUST give `holder-takeover.test.ts` real native flows (real `NativeSessionHost` over a real store in a tmpdir — `desktop/tests/native-session-host.test.ts` shows the pattern, incl. `delayedFactory` for mid-stream capture). History: youcoded #177 (merge `fe8529ba`), investigation at `docs/active/investigations/2026-07-18-native-session-takeover-gap.md`, ROADMAP entry "Native-session takeover destroys the holder" (shipped, residue = your item 4).

## Process requirements (program §9 — these are exit criteria, not suggestions)

1. **Sync first**: `bash setup.sh` from the workspace root.
2. **Plan doc first**: `docs/active/plans/YYYY-MM-DD-m2-conversations-sync-plan.md`, writing-plans granularity (tasks, exact code, test-first), spec = program §3 + the design doc + this handoff. Fan out research agents before writing it — the M1 plan's accuracy came from four parallel code-mapping agents; budget the same. Known plan-shape risk from M1: reason about EVENT ORDERING explicitly (M1's final review caught an ack-vs-transcript race the plan itself specified — sync/store work is even more ordering-sensitive).
3. **Worktree** + subagent-driven development; per-task review; final whole-branch review on the most capable model.
4. **Exit criteria**: tests shipped per item; `.claude/rules/native-runtime.md` (workspace) + `docs/MAP.md` + the lazy docs updated in the same PR; remote web client in scope (meta/browse/resume surfaces all bridge over the remote shim — check `remote-shim.ts` parity for every channel you touch; `desktop/tests/ipc-channels.test.ts` pins the four-surface convention); dogfood pass on desktop + remote before merge.
5. **Desktop-only**: Android tag/note handlers are stubs — that gap belongs to M8. Do not touch `SessionService.kt` beyond stub-list strings for any new channels.
6. **Flag interactive verification for Destin** — takeover/resume flows across two running instances are exactly the class of verification he eyeballs faster than you can script (workspace rule). Structure the PR checklist accordingly.

## Read in this order

1. This handoff
2. `docs/active/plans/2026-07-22-native-runtime-parity-program.md` §3 + §9
3. `docs/active/specs/2026-07-18-native-sync-parity-design.md` (Option C — the phases map 1:1 to items 1–4)
4. `.claude/rules/native-runtime.md`, `.claude/rules/sync-spaces.md` (workspace), `youcoded/docs/sync-spaces.md`, `youcoded/docs/chat-reducer.md`
5. `docs/PITFALLS.md` (cross-repo invariants)
6. `docs/active/investigations/2026-07-18-native-session-takeover-gap.md` (item 4 background)

## Open questions you may hit (resolutions if Destin is unavailable)

- **`lastUsedModel` staleness**: if the stored model id no longer exists on the resuming device, the picker simply opens un-prefilled — never error, never guess a substitute.
- **Auto-title model choice**: use the session's own binding for the title turn; if the binding is a local model below the smallest current capability profile, skip titling rather than block (title arrives on a later turn or never — honest default).
- **Item 6 ordering**: land it FIRST (it's provider-agnostic and the meta-write path everything else builds on gets honest before you widen it).
