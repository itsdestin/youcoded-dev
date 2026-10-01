# Code review — pop-up guard (branch session/scan-dir-prompt)

Reviewer: fresh read-only agent, 2026-09-30. Scope: `git diff origin/master...HEAD` plus the 3 uncommitted files (`check-popup-drift.mjs`, `popup-scenarios.mjs`, `docs/cc-dependencies.md`). No contract file, so no contract checks.

## verify.sh summary (`bash scripts/verify.sh <worktree>`)

```
PASS  types (tsgo --noEmit)
PASS  types in tests/
FAIL  tests (related)   -> 1 failed | 3169 passed | 40 skipped (167 files)
        tests/line-budgets.test.ts: renderer/App.tsx 5040 lines, budget 5000 (+40);
                                    renderer/styles/globals.css 3013 lines, budget 2994 (+19)
PASS  dead code (knip)
PASS  lint (oxlint)
PASS  design lint
PASS  invariants (ast-grep)
PASS  screens open (shoot --check)
PASS  journeys
FAIL  line budgets (budgets.log, same two files)
2 check(s) failed (both are the one line-budget test).
```

## Findings (most severe first)

- F1 — desktop/src/main/session-manager.ts:636-659 (`broadcastReloadPlugins` / `sendReloadWhenClear`), gate wired at main/main.ts:~274; Android twin runtime/SessionService.kt:~401 — an AUTOMATED PTY writer still bypasses the new screen check: `/reload-plugins\r` (fired after every plugin install/update/uninstall, ipc-handlers.ts:1588/1604/1744, remote-server.ts:3373/3385) is held back only by `hookRelay.hasPendingPermission`, a hook-based signal. With an unreported pop-up open (auto-mode setup offer, billing notice, compaction menu — the exact cases this branch exists for) the text is typed into it and its `\r` presses the highlighted option ("Yes" started an auto-mode scan). A user installing a skill while such a pop-up is up gets an answer they never gave. — Confirmed by reading: the only gate is `reloadPluginsGate`; main has no screen access; renderer-side `screenInputBlock` is never consulted for it. (Repo-wide `sendInput(` search in src/renderer found no other ungated automated writer; see F4/F5 for near-misses.)

- F2 — desktop/src/renderer/hooks/usePromptDetector.ts:~281-296 (top-of-flush bail) + 1000 ms `GENERIC_CARD_DEBOUNCE_MS` — hook permission event arriving AFTER the generic card is already up leaves BOTH cards: the bail `return`s on a live awaiting-approval tool and nothing dismisses an already-shown generic prompt (the `hasPermissionCard` checks only guard scheduling/firing, not a card already shown). The user then sees a generic card (digit buttons that type straight into the menu while the hook is still held) beside the real permission card; answering the generic one answers the menu behind the hook's back. — Confirmed by reading the detector flow; the replay test does not cover it: `DELAYS = [0, 150, 400, 'never']` (popup-corpus-replay.test.tsx:57), all below the 1000 ms generic debounce, so "hook arrives after 1 s" (slow main process, many sessions, a hook-relay retry) is untested. PLAUSIBLE for real-world frequency; the code path is certain.

- F3 — desktop/src/renderer/hooks/usePromptDetector.ts:~85-96 (`hasPermissionCard` -> `expiredToolIds`, whole `toolCalls` map) — one KEPT (expired) permission card anywhere in the session silences generic cards for the rest of the session ("kept cards deliberately outlive their turn"). A later unreported pop-up then gets no card; the send is still refused (screen gate), but the toast offers only "Open terminal", not an in-chat answer. — Confirmed by reading; behaviour is a design choice that contradicts the "pop-up mid-session gets a card" promise. PLAUSIBLE as a user-visible gap (needs an expired ask first).

- F4 — desktop/src/renderer/components/InputBar.tsx:~910-925 (attachment sends: `files.forEach(setTimeout(..., idx * 600))` then `setTimeout(sendInput(text+'\r'), files.length*600)`) — the screen gate is checked once, at click; the delayed writes (0.6 s per attached file, 2.4 s for four) fire with no re-check. A pop-up that opens in that window (the billing notice "opened mid-reply") swallows the path/text and its `\r` answers it. — Confirmed by reading (the check is only in `sendMessage` top). Pre-existing shape, but it is the same hazard this branch closes everywhere else.

- F5 — desktop/src/renderer/App.tsx:~3465 (`cyclePermission` -> raw `sendInput(sessionId, '\x1b[Z')`) — Shift+Tab from the header chip / hotkey is an automated-looking write with no screen check; into a pop-up it moves a tab/option (e.g. /config tabs), while the chip has already been optimistically flipped to the "next" mode (`setPermissionModes` before the write), so the chip lies until the PTY watcher corrects it. — Confirmed by reading; severity low (no Enter involved).

- F6 — desktop/tests/popup-detector-bench.test.ts:~12 + tests/popup-bench/bench-lib.ts:7-8 (`FALSE_ALARM_MS = 300`, `GAP_MS = 100`) — the "must be perfect" bench TOLERATES a false alarm shorter than 300 ms and a gap shorter than 100 ms. A real send landing inside such a moment is refused for nothing ("Claude Code is waiting on something" while the message box is up), and replay only reads whole-chunk frames, so mid-redraw torn frames (Ink erases then rewrites; PTY chunks can split) are not exercised. — Confirmed by reading the scoring; torn-frame refusal itself is PLAUSIBLE (not reproduced).

- F7 — desktop/line-budgets.json / tests/line-budgets.test.ts — the branch fails the repo's own line-budget test: `renderer/App.tsx` 5040 vs 5000 (+40) and `globals.css` 3013 vs 2994 (+19). verify.sh is red. — Ran verify.sh; same assertion fails in budgets.log. Per CLAUDE.md a failing test is fixed now (raise the numbers with a stated reason, or move `showBlockedSend`/the toast action renderer out of App.tsx).

- F8 — desktop/src/renderer/components/InputBar.tsx:~726-731 ("Send anyway" wait) — after Esc, `waitForMessageBox` polls up to 2 s with no on-screen feedback and no guard against a second click; the toast is already dismissed (`setToast(null)` before `retry()`), so the user sees nothing for up to 2 s, may click Send again (a second refusal toast or a double send once it clears), and the late `sendRef.current(true)` sends whatever the draft is by then (edited, emptied, or session switched — `sendRef` always points at the latest `send`). Also the stale-chat-state case (box already live) resolves true immediately and writes text right behind the Esc, same as before. — Confirmed by reading.

- F9 — desktop/src/renderer/App.tsx:~776-786 (`showBlockedSend`) — the toast's buttons capture `sid` at refusal time and stay for 8 s; switch to another session and click "Open terminal" and it flips the OLD session's view with no visible change while the toast vanishes; "Show card" for the old session searches only the VISIBLE chat so it falls through to the same silent `openTerminal`. Also `focusChatCard` accepts any element with non-null `offsetParent`, so a card inside a collapsed tool group can "succeed" without anything visible. — Confirmed by reading (no clearing of the toast on session switch). PLAUSIBLE for the collapsed-group case.

- F10 — desktop/src/renderer/utils/focus-chat-card.ts:32-44 vs components/SpecialistsChip.tsx:236 (`jumpToCard`) plus the new `.card-attention` vs existing `.specialist-jump-flash` — a second hand-rolled "scroll a card into view and flash it" helper and CSS class; the new one is better (visible-chat filter) so the old one could use it. — `rg` repo-wide shows both. Duplication, low.

- F11 — desktop/src/renderer/parser/cc-input-focus.ts:~49-52 (`EDGE = /^[─━]{20,}\s*$/`) — a terminal narrower than 20 columns can never draw a qualifying rule, so every screen reads as a pop-up and every send is refused (Send anyway still works). Also a draft taller than 40 rows (look-back cap in `boxAt`) reads as a pop-up. — Reasoned from the code; not reproduced. PLAUSIBLE, edge. (Android phone widths are ~40+ cols; chat view hides the xterm, so the hidden terminal's size is the thing to check.)

- F12 — desktop/src/renderer/state/pty-input-gate.ts:~118-125 (`pendingInteractionRefusalCopy(_kind, _block)`) — two parameters kept "so a reason-specific sentence can come back"; nothing uses them and every call site still computes and passes them. Dead parameters, naming that suggests behaviour that is not there. — Read; knip does not flag unused params.

## Checked and found fine

- Real chat send swallowed/refused for nothing via the screen gate: no terminal or blank screen -> `unknown` -> no verdict -> send proceeds (pty-input-gate.test.ts "no terminal at all"); native sessions skip the gate (`provider !== 'native'`); shell sessions never reach it (`canPtySend`).
- Terminal-view typing (InputBar 1005/1318, TerminalToolbar, TerminalView) and card/driver writes (prompt-input, PlanApprovalCard, ExpiredApprovalActions, StopButton, ESC passthrough) are deliberate menu input and rightly ungated. `guardedPtySend` callers (slash commands, /model, /sync, /config, queued sends) all inherit the screen check through `notifyIfPtyBlocked`.
- `useSubmitConfirmation`: the bare retry `\r` now also waits on `screenInputBlock`; the retry timer just reschedules, no lost message.
- Android / remote browser parity: all renderer changes live in the shared renderer (`terminal-registry` is fed the same way on every platform), so no IPC/Kotlin mirror is needed for them; the one parity hole is F1 (Android `SessionService.kt` has the same hook-only `/reload-plugins` gate).
- Tests: new replay test uses fake timers; bench and gate tests use `@xterm/headless` write callbacks, no fixed sleeps or wall-clock assertions (`waitForMessageBox` itself uses `Date.now()` but is not unit-tested). No hygiene findings beyond F6.
- Performance: `readInputFocus` only runs when a parsed dialog menu exists (not per streamed flush); the CSS flash animates opacity only. knip, lint, tsgo clean.

## Not covered

- Did not run the test-conpty captures (instructed) or any dev instance, so torn-frame refusals (F6) and narrow-terminal behaviour (F11) are reasoned, not observed.
- Did not read the 104 corpus fixtures or the scenario scripts (`popup-scenarios.mjs`, `fake-anthropic.mjs`) beyond the diff of the two uncommitted edits; the drift workflow was read, its action versions (`@v7`) match the repo's other workflows.
- Android-side Kotlin was not diffed for behaviour (branch touches none); the F1 Android claim rests on SessionService.kt's comment and the same hook-only gate pattern, not a full read.

Design disagreement (one line): none that affects correctness; "Send anyway" still presses Esc into whatever is up, which on a live permission menu declines it — the toast names the blocker, but the single shared sentence no longer says so.

## Triage (implementing session, 2026-09-30)

- **F1 — accepted, fixed.** The renderer now reports its screen verdict per session (`session:input-blocked`, fire-and-forget; preload / ipc-handlers / remote-shim / SessionService.kt; remote-server ignores remote browsers' reports — the desktop window is the authority). `SessionManager.sendReloadWhenClear` and Android's `onPluginsChanged` loop defer on it exactly as on a pending permission. Pinned: `session-manager.test.ts` "also defers while the renderer reports a pop-up holding the keyboard" (seen red with the check removed).
- **F2 — accepted, fixed.** A hook ask that arrives after a generic card is up withdraws that card (`genericShownRef`, in the awaiting-approval effect). The replay test now raises the hook at 1500 ms too, with a store that notifies its subscribers; 12 cases fail with the withdrawal removed, all pass with it.
- **F3 — already handled.** A kept card settles once its menu has been absent for two flushes (`expired-card-resolver.ts`), and only then does `hasPermissionCard` stop holding generic cards back; while the kept card is up, its menu IS that card's, so holding back is correct.
- **F4 — rejected for now.** Attachment paths are written 0.6 s apart after one check at click; a pop-up would have to open inside that window. Pre-existing timing, unchanged by this branch; not worth a per-write re-check that could half-send an attachment list.
- **F5 — accepted, fixed.** The permission chip's Shift+Tab now refuses (same toast) while an UNREPORTED pop-up holds the keyboard; behaviour beside hook cards is unchanged.
- **F6 — rejected.** Sub-300 ms flickers can only refuse a send that lands inside them; the toast says so and the next press goes through. A fail-safe direction, measured as zero ≥300 ms false alarms on 106 captures.
- **F7 — accepted, fixed.** `useBlockedSend` + `blocked-send-toast.ts` took the logic out of App.tsx (now 4997, budget lowered to match); globals.css is back to master. The five IPC files carry the new channel's few lines (budgets raised by exactly those lines — the channel must be listed in each).
- **F8 — rejected.** The wait is the pop-up closing after Esc (typically well under a second); the toast is gone after the first click, so there is no second click; the send uses the box's contents at that moment by design.
- **F9 — rejected (minor).** An 8-second toast outliving a session switch is rare; "Open terminal" then switches the session the toast was about, which is still correct, only unexpected.
- **F10 — accepted, partly.** `focusChatCard` now uses the existing `.specialist-jump-flash` ring (the separate stylesheet is gone), so every jump-to-card looks the same. `jumpToCard` itself is left as is: it searches every chat, `focusChatCard` only the visible one, and changing the Specialists panel is outside this branch.
- **F11 — accepted, fixed.** The box edge now needs 10 columns (was 20) and the opening rule is looked for 200 rows up (was 40). Bench still perfect on all 106 captures.
- **F12 — rejected.** The unused parameters are documented: they let a reason-specific sentence return without touching the call sites.
