---
status: active
---

# AppInner Decomposition Map

**Date:** 2026-07-17
**Status:** Investigation — extraction map for the staged decomposition of `AppInner` in `youcoded/desktop/src/renderer/App.tsx`. Feeds the ROADMAP item "Staged AppInner decomposition". Mapped on branch `feat/buddy-feedback-tuning` (line numbers will drift as that branch and master evolve — re-anchor by symbol name, not line, when executing).

## Why

`App.tsx` is 3,356 lines; a single component, `AppInner` (lines 178–3195), holds ~51 `useState`, ~49 `useEffect`, and ~80+ state/ref declarations. Costs: (1) merge-conflict magnet for parallel Claude sessions, (2) context burn — every session touching app-level behavior reads the whole file, (3) perf — nothing at the call site is memoized, so **any single state update re-renders the entire return and every mounted child**, with fresh inline closures defeating any child-level `React.memo`.

Decision (2026-07-17 session with Destin): **staged mechanical extraction, not a rewrite.** Small PRs, one cluster each, verified in the dev instance. Do NOT start until in-flight renderer branches (currently `feat/buddy-feedback-tuning`) land — this refactor conflicts with everything.

## Headline numbers

- Logic portion of AppInner: ~2,410 lines (178–2588); JSX return: ~600 lines (2588–3194).
- 22 state/effect clusters identified. EASY+MEDIUM extractions alone remove **~900–1,000 lines**, taking AppInner to a realistic floor of **~2,000–2,100 lines**.
- Going materially below that requires the two HARD anchors: the **giant mount effect** (804–1416, ~15 IPC handler registrations — the session event bridge) and the **multi-window ownership wiring** (1500–1592). Together ~700–800 lines holding nearly all the regression risk. Dedicated, separately-reviewed step — or leave in place indefinitely.

## Cluster map (state/effect side)

| # | Cluster | Lines removable | Difficulty | Extraction shape |
|---|---------|----------------|------------|------------------|
| 4 | Zoom controls (state 403–412, handlers/effects 2371–2452, overlay 3177) | ~90 | EASY | `useZoomControls()` — zero cross-deps |
| 5 | Chrome/layout measurement (3 ResizeObservers, 2493–2572) | ~80 | EASY | `useChromeMeasurements(headerRef, bottomBarRef, sessionId, viewMode)` |
| 6 | Welcome/new-session form (state 377–390, JSX 2849–2982) | ~250 | MEDIUM | `<WelcomeScreen>` child owning all `welcome*` state; props: `sessionDefaults`, `createSession`, `onResume`, `onManageProjects` |
| 2 | Per-session model mgmt (394–401, 1736–1887) | ~150 | MEDIUM | `useSessionModel(...)` — seeding writes in Cluster 1 handlers need a shared setter |
| 3 | Permission modes PTY+native (204–209, 1428–1461, 2295–2369) | ~130 | MEDIUM | `useSessionPermissionMode(...)` — same seeding coupling |
| 7+8 | Session status derivation + sounds (611–746, 662–701) | ~170 | MEDIUM | extract **together** — R1 ordering |
| 10 | Marketplace/library/editor nav (308–371) | ~70 | EASY-MED | `useMarketplaceNav` |
| 9 | Compaction watchdog (513–550) | ~40 | EASY-MED | `useCompactionWatchdog` — timer-map cleanup sensitive (R6) |
| 12 | Takeover prompt (260–271, dialog 3143–3176) | ~65 | EASY-MED | `useTakeoverPrompt()` returning `{askTakeover, dialog}` |
| 14 | Settings orchestration (219–224, 1684–1713) | ~40 | EASY-MED | |
| 11 | Command drawer state (213–215) | ~25 | EASY | |
| 18 | fast/effort modes (294–305) | ~15 | EASY | |
| 19 | First-run + session defaults (373–439) | ~30 | EASY | |
| 21 | Android/esc-stack integration (767–784, 2187) | ~30 | EASY | |
| 16 | Game/presence (557–595) | ~50 | MEDIUM | exclusivity effects couple to artifact drawer (R2) |
| 17 | Artifact tracker (466–471; handler 1308–1388 inside mount effect) | ~90 | MEDIUM | |
| 15 | Status data + usage snapshot (statusHandler 1174–1212) | ~80 | MED-HARD | `prevAttentionRef` diff is remote's only attention path (R9) |
| 13 | Moved Gate (239–247, 2475, JSX 2737–2758) | ~50 | MEDIUM | ref-mirror is load-bearing (R3) |
| 1 | **Session registry + event bridge (mount effect 804–1416 + lifecycle)** | ~700 | **HARD** | `useSessionRegistry` + `useSessionEventBridge` — the trunk; dedicated step |
| 20 | **Multi-window detach topology (1500–1592)** | ~90 | **HARD** | duplicates full session seed/teardown; bound to Cluster 1 |

## Render-side map

Return structure: framed-shell active-session branch (2613–2848: chrome-glass, HeaderBar, per-session ChatView/TerminalView map, TrustGate/MovedGate/CommandDrawer, bottom chrome with ChatInputBar+StatusBar) vs Welcome branch (2849–2982), then ~14 modals/overlays (2988–3191), each narrow (1–6 props consumed).

- **HeaderBar** (~22 AppInner values) and **bottom chrome/StatusBar** (~25 values incl. the ~29-line inline `onDispatch` closure) are the two heavily-threaded regions — NOT clean extractions until callbacks are hoisted.
- **Welcome branch** consumes almost exclusively its own `welcome*` state → strongest render-side extraction.
- **No inline component definitions** inside the return; largest inline block is the Welcome form (~133 lines).
- **Memoization status: none of the major subtrees are `React.memo` at the call site**; memoized values are only `gameConnection`, `sessionStatuses`, `settingsDangerBadge`. All modals re-render (element + closures recreated) on every AppInner render even when closed. `ChatInputBar` (3203) is a pure pass-through `forwardRef`, not memoized.
- Trivial file moves: `ThemeBg` (3209), `StatsWithHealthBridge` (3221), `RootErrorBoundary` (3309) — ~70 lines, zero risk.

## Regression risks (verify each survives extraction)

- **R1** `sessionStatuses` memo (611) must compute before the attention-reporter effect (716); `lastAttentionReportedRef` deliberately hoisted to 555 for deterministic hooks order. Extract Clusters 7+8 together, preserve declaration order.
- **R2** Game↔artifact-drawer exclusivity: two effects (568, 574) each keyed on only the *other* pane's flag to avoid re-open loops. Move as a pair.
- **R3** Moved-gate: `destroyedHandler` reads `movedSessionsRef.current` (mount-closure would be stale); `recordMoved`/`clearMoved` keep ref+state in lockstep synchronously. Keep the ref path.
- **R4** Transcript batching (943–980): rAF→timeout handoff on `visibilitychange` prevents a stranded batch (historical stray-`\r` bug). Its cleanup (1396–1399) cancels both timers + listener — move as one unit.
- **R5** Model-verify effect (1779–1829) previously leaked its `transcript:event` handler; the `off()` cleanup is load-bearing. Passive-drift effect is gated on `!pendingModel` to avoid racing verify.
- **R6** Compaction watchdog resets per-session timers on every dispatch; cleanup must clear all live timers.
- **R7** Giant mount-effect cleanup (1395–1415) unregisters ~15 handlers — any split must not drop an `off()`.
- **R8** Render-phase ref assignments (`escPassthroughStateRef` at 2226, `cycleModelRef`, `cyclePermissionRef`, `viewModeRef`, zoom refs): "assign-in-render so window listeners see latest without re-registering." Retain the pattern.
- **R9** `prevAttentionRef` diff in statusHandler (1200–1211) is the ONLY attention path for remote browsers (`.claude/rules/react-renderer.md`).
- **R10** `lastStatusJsonRef` skips byte-identical `status:data` (pushed every 10s) — removing it re-renders the tree at idle.

## Staged plan (one PR per stage, dev-instance verify each)

0. **Trivial moves** — `ThemeBg`, `StatsWithHealthBridge`, `RootErrorBoundary` to own files; zoom subsystem → `useZoomControls()` + wiring; chrome measurement → `useChromeMeasurements()`. (~240 lines, near-zero risk.)
1. **`<WelcomeScreen>`** — child component owning the `welcome*` state cluster. (~250 lines.)
2. **Session-scoped hooks** — `useSessionModel`, `useSessionPermissionMode`, `useSessionStatuses`+sounds (together, R1), `useMarketplaceNav`, `useTakeoverPrompt`, `useCompactionWatchdog`, small EASY clusters. (~500 lines across 2–3 PRs.)
3. **Callback-stabilization pass** — hoist inline render closures (HeaderBar handlers, StatusBar `onDispatch`, `CloseSessionPrompt.onConfirm`, `ModelPickerPopup.onSelectModel`) to `useCallback`. Prerequisite for any memo perf win.
4. **Perf isolation** — extract `BottomChrome` and `ContentArea` children with `React.memo` + the now-stable callbacks. This is where the keystroke-re-render win lands. (Related: the ROADMAP's separate "App-root useChatStateMap subscription refactor" from the 2026-07-10 review is the *other* half of the perf story.)
5. **(Optional, dedicated) session event bridge** — `useSessionEventBridge`/`useSessionRegistry` for the giant mount effect + ownership wiring. Highest risk (R3, R4, R7, R9, R10 all live here); only attempt with its own plan and review. Stages 0–4 are worthwhile without it.

Floor after stages 0–4: AppInner ~2,000–2,100 lines with the two HARD anchors intact — acceptable; the trunk being one readable file is defensible the same way `SessionService.kt` is.
