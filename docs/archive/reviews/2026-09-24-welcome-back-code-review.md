# Welcome back — code review

Branch: `session/session-resume-20260924` (youcoded repo) vs `origin/master`, plus the
workspace commit touching `scripts/ast-grep/rules/no-hand-rolled-setting-row-toggle.yml`.

`bash scripts/verify.sh /home/destin/youcoded-dev/worktrees/sessions/session-resume-20260924/youcoded`:

```
PASS  types (tsgo --noEmit)
PASS  types in tests/ (tsgo --noEmit, 47 file(s) still excluded)
PASS  tests (related)
PASS  dead code (knip)
PASS  lint (oxlint)
PASS  design lint (oxlint --max-warnings ratchet)
PASS  invariants (ast-grep)
OK — all checks passed.
   Not covered: Android (./gradlew test), marketplace worker.
```

- F1 accepted — Claude Code handoff must untrack like native. Finding: `desktop/src/main/conversations/takeover.ts:141-157` — a Claude Code (non-native) session handed off through the receipt-verified `captureWriter`/`pinSnapshot` path never calls `untrackWelcomeBack`, so it stays in `welcomeBackStore.open` after the conversation has moved to another device and gets wrongly offered back on this device's next Welcome back screen — confirmed by reading the branch: inside the `if (deps.captureWriter && deps.pinSnapshot)` block, only `if (evidence!.provider === 'native')` (line 153) calls `deps.untrackWelcomeBack?.(id)`; the `else if` branch for `provider === 'claude'` (line 155, `stopSessionForHandoff`) has no such call, and no other code path reaches it (`ipc-handlers.ts`'s own comment states untrack only happens at the explicit SESSION_DESTROY IPC handler and inside `takeover.ts`, deliberately never from a generic `destroySession`/`session-exit`). `ipc-handlers.ts:2615-2621` wires `captureWriter` for both `'claude'` and `'native'`, so this is the common case, not an edge case. The test suite added for this path (`desktop/tests/holder-takeover.test.ts`, "pinned-snapshot path: untracks Welcome back…") only exercises the native branch — there is no equivalent assertion for `provider: 'claude'`, which is consistent with the gap being unnoticed rather than accepted.
- F2 accepted — a failed resume must not leave the session tracked. Finding: `desktop/src/main/ipc-handlers.ts:869` (and the failure path at `:1008-1026`) — a resumed session is optimistically `trackWelcomeBack`'d the moment it's created (before the native resume attempt runs), but every failure branch of that native resume (refused sync, missing project folder, missing saved data, "another device holds this conversation", window closed mid-startup) tears the session down via a bare `sessionManager.destroySession(info.id)` at line 1016 and then `throw e` — never calling `untrackWelcomeBack`. Confirmed by reading the full `startSession` function: the catch block at 1008 only calls `nativeHost.destroy`, `resumeAdmission.waitForStop/clearProtection`, and `sessionManager.destroySession`; per the design's own stated invariant (comment at `ipc-handlers.ts:1138-1142`), an ordinary `destroySession` call must NOT untrack. The result: a native resume that fails for a real, recurring reason (project folder not on this device, lease held elsewhere) still leaves a phantom "open" entry that gets folded into `offer` at the next launch, so Welcome back re-proposes reopening a conversation that is known to be unresumable here. `desktop/tests/ipc-handlers.test.ts`'s new "Welcome back tracking hooks" suite only tests the happy-path resume (mocked `createSession` that always succeeds); no test exercises a thrown/refused resume, matching this gap.

## Not covered

- Did not re-verify the `human`/`deck`-checked contract rows (R10, R15, R17, R18, R19, R20, R23, R24, R11) pixel-for-pixel against the approved review-deck screenshots — those are graded by deck/human per the contract, not by this review.
- Did not exercise the Android build (`./gradlew test`) — `SessionService.kt`'s two new stub branches (`session:reopen-list`, `session:forget-reopen`) were read and match the desktop/remote-server shape, but per workspace policy the SDK/JDK availability must be checked fresh each session and wasn't as part of this review's scope.
- Did not dig further into `main.ts`'s `shuttingDown` interaction with `applyCloseAnswer`'s destroy/untrack calls racing `runShutdown()`'s own teardown loop (both paths appear to reach idempotent operations and the `if (shuttingDown) return` guard on the window `close` handler prevents re-prompting), but did not trace every teardown ordering under a concurrent whole-app-quit + in-flight close-request to full certainty — marked here rather than asserted either way.
- Did not review `welcome-back-store.test.ts`, `close-request-manager.test.ts`, or `remote-server-connections.test.ts` line-by-line beyond spot checks; `verify.sh`'s green run covers them mechanically.
- Did not run the render-cost/perf rules (`performance.md`) against `App.tsx`'s new effects beyond inspection — no list of user data is involved (Welcome back shows a handful of sessions through the existing chunked ResumeBrowser), so this was judged low-risk and not independently profiled.
