---
status: active
---

> **Status re-verified 2026-08-26 against `origin/master` `dbbb9139`.** Corrections to the
> body below, each backed by a `git grep … origin/master`:
>
> - **"Kotlin `ProjectManager.kt` still has `detectOrphan` / `rebuildIndex` mirrors" is
>   FALSE — already done.** `git grep -rn "detectOrphan\|rebuildIndex" origin/master`
>   returns exactly one hit, and it is a tombstone comment in TypeScript
>   (`desktop/src/main/artifacts/project-manager.ts:150`: "detectOrphan / rebuildIndex were
>   removed in the 2026-07-10 dead-code…"). Nothing named either function exists under
>   `app/`. Strike this item.
> - **The `sync-spaces` 120 s idle poll is still live** (`sync-spaces/engine.ts:78`
>   `this.pollMs = opts.pollMs ?? 120_000`), but its guard note — *"owned by the sync
>   sessions while Phase 2 is in flight — don't touch"* — **is stale**. Sync Phase 2 shipped
>   (2a `#116`, 2b `#121`, 2c `#126`) and native sync parity shipped as M2 (`#212`,
>   merge `60d56a67`). This is now free to pick up.
> - **Still open, verified present:** hidden-xterm WebGL detach (`TerminalView.tsx` disposes
>   the addon only on `onContextLoss`, never on hide); `buildStatusData`'s triplicated
>   read-with-fallback loop (no `readPerSession` helper exists anywhere in `desktop/src`);
>   `FOLDERS_LIST` path-equality still hand-rolls `path.resolve(...).toLowerCase()`
>   three times (`ipc-handlers.ts:1178,1182,1189`) instead of `canonicalize()`;
>   `SettingsPanel.tsx` is now **2,721** lines (was 2,489 — it grew).
> - **Still open, decision not taken:** the `marketplace:get-config` / `set-config` chain is
>   still wired across all four surfaces (`ipc-handlers.ts:1439`, `preload.ts:148-149`,
>   `remote-shim.ts:916-918`, `shared/types.ts:1159-1160`) with `ConfigForm.tsx` gone —
>   dormant exactly as described. **Blocked on Destin:** are config-schema plugins on the
>   roadmap or not?
> - The two `App.tsx` items are correctly struck: tranche 1 shipped, remaining tranches are
>   in `docs/active/investigations/2026-07-17-appinner-decomposition-map.md`. Note `App.tsx`
>   is **3,652** lines today, so the decomposition never reduced total file size.
>
> With the Kotlin item struck, everything left here is opportunistic cleanup with no
> deadline. Recommend moving to `docs/archive/handoffs/` and re-filing the six surviving
> items as ROADMAP `#tech-debt` entries, so the workspace has one ledger instead of two.


# Master Review — Deferred Follow-ups (non-remote)

**Date:** 2026-07-10
**Context:** The full-codebase review of youcoded master (correctness / performance / dead-code / complexity) shipped its non-remote fixes in merge `7cfe75a7` (branch `fix/review-hardening`). This doc records the review findings that were **deliberately NOT shipped in that pass**, so they aren't lost. Remote-access findings live separately in `2026-07-10-remote-access-review-handoff.md` — not repeated here.

Nothing below is urgent or broken; these are net-improvement opportunities the review surfaced. Pick them up as standalone sessions.

## Deferred performance work

- ~~**App-root `useChatStateMap` subscription refactor — the single biggest re-render win.**~~ **RESOLVED 2026-07-17** — App.tsx tranche 1 shipped (youcoded merge `f1ab07fc`). Original text: `App.tsx` (`AppInner`) subscribes to the whole chat-state map, so every reducer dispatch re-renders the entire app tree; the per-session store exists precisely to avoid this. Most of App's map reads are inside effects/refs and could move to `store.subscribeAll` + the existing `chatStateMapRef` pattern, or a narrow selector hook (e.g. `useAnyThinking`). Medium risk (effect ordering + `sessionsRef`); do it one hook at a time and verify in the dev app. Kept out of the correctness batch on purpose.
- **Hidden-xterm WebGL detach.** Background sessions' WebGL canvases keep rasterizing Claude's full-TUI Ink redraws while `visibility:hidden` (`TerminalView.tsx`). The buffer writes must continue (prompt detector reads them), but the WebGL addon could be disposed on hide / re-attached on show via the existing `attachWebglRef`. **Profile the GPU first** — only worth the dispose/reattach complexity if it measurably helps.
- **sync-spaces 120s idle poll.** `sync-spaces/engine.ts` does a git fetch + several spawns per space every 120s while idle (~20-40 process spawns per 2min with ~5 spaces). Consider backoff/jitter when no space synced changes recently. **Owned by the sync sessions while Phase 2 is in flight — don't touch until sync work settles.**

## Deferred complexity / simplification (from the complexity review)

Low-risk but pure-churn; best done in a quiet window, NOT during the sync-gated release.

- **DROPPED 2026-07-24** — assessed low-value and dropped (see ROADMAP 2026-07-24 deferred-perf entry): **`ipc-handlers.ts` is one 2,674-line `registerIpcHandlers` function** with ~177 handlers. It already has 27 `// ---` section markers = ready-made module seams. Split into `register<Domain>Handlers(ctx)` modules (leaf domains first: theme marketplace, skills, dev, artifacts). **Caveat:** `tests/ipc-channels.test.ts` asserts channel presence *in ipc-handlers.ts* — update its file list in the same commit.
- **DROPPED 2026-07-24** — assessed low-value and dropped (see ROADMAP 2026-07-24 deferred-perf entry): **`SessionService.kt handleBridgeMessage` is one ~2,700-line `when` (191 cases).** Keep the `when` as a thin dispatch table (message-type string literals must stay in the file so the `ipc-channels.test.ts` parity grep passes) and move case bodies to private funs grouped by domain.
- ~~**`SessionService.kt` `publishPluginViaGh` / `publishThemeViaGh` (~110 duplicated lines)**~~ **RESOLVED** — dedup shipped in PR #207 `82552cee`. Original text: extract a shared `GhPublisher` helper (`runGh`, `uploadDir`, shared `sensitivePatterns`). Same-file same-language dup, not a documented TS/Kotlin parity mirror. Behavior must not change (linker64 exec path).
- ~~**`App.tsx` `AppInner` is ~2,500 lines / 46 useState / 47 useEffect.**~~ **RESOLVED (tranche 1) 2026-07-17** — shipped in youcoded merge `f1ab07fc`; remaining tranches tracked in `docs/active/investigations/2026-07-17-appinner-decomposition-map.md`. Original text: Extract self-contained clusters into custom hooks (`useStatusData`, `useWindowTopology`, `useMarketplaceNav`, `useResumeFlow`). Overlaps with the perf refactor above — do them together. Don't touch chat-reducer wiring or the `RemoteSnapshotExporter` mount (PITFALLS-pinned).
- **`SettingsPanel.tsx` (2,489 lines)** — AndroidSettings/DesktopSettings duplicate identical `defaults`/overlay state + the Development-button JSX. Extract a shared `useSettingsDefaults()` hook + `<OtherSection>`; the platform fork itself is legitimate.
- **`buildStatusData` (ipc-handlers.ts)** repeats the same read-with-last-known-fallback loop three times (context %, git branch, session stats) — collapse into one generic `readPerSession<T>` helper. Trivial, in-function.
- **`FOLDERS_LIST` path-equality** uses hand-rolled `resolve().toLowerCase()` instead of the documented `canonicalize()` single-source. Low risk; diff behavior on UNC/trailing-sep first.

## Small decisions still open

- **`ConfigForm.tsx` was deleted; the `marketplace:get/set-config` IPC chain (4 surfaces incl. Android) was kept dormant.** If config-schema plugins are definitively off the roadmap, delete the whole chain (touches SessionService.kt + the parity test). Otherwise leave as-is.
- **Kotlin `ProjectManager.kt` still has `detectOrphan` / `rebuildIndex` mirrors** of the TS functions deleted in this pass (never called in production). Prune them in an Android session; PITFALLS §"Project View sidebar count" already notes this.

## Where the shipped work lives

- Merge `7cfe75a7` on youcoded master — 3 commits (correctness / perf / dead-code), full test suite + dev-app smoke pass verified.
- Remote findings: `docs/active/handoffs/2026-07-10-remote-access-review-handoff.md`.
- New invariants: `docs/PITFALLS.md` (serialized reads, byte carry, replay dedup, tail screen reads, subagent timer lifecycle).
