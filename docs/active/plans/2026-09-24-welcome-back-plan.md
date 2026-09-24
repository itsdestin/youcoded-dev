---
date: 2026-09-24
status: active
type: plan
topic: Welcome back — build tasks
---

# Welcome back — build tasks

Design (authority): `docs/active/specs/2026-09-24-welcome-back-design.md`, reviewed three
rounds (`docs/active/reviews/2026-09-24-welcome-back-design-review-{1,2,3}.md`).
Contract (signed): `docs/active/design/2026-09-24-welcome-back/welcome-back.contract.json`.
App branch: `session/session-resume-20260924` in
`worktrees/sessions/session-resume-20260924/youcoded`. The renderer mockup is already on it.

Tasks run ONE AT A TIME in that one worktree (PITFALLS → Worktrees: never a builder and a
verifier writing the same checkout at once). Each ends with a commit; its reviewer reads the
commit, never a moving tree. Every task: WHY comments at non-trivial edits; tests seen red
before green; `.claude/rules/performance.md` (no `*Sync` in main on hot paths).

## T1 — the per-install store (main)

New `desktop/src/main/welcome-back-store.ts`: state `{open, offer}` per design §1, injected
fs (`readFile`/`writeFile`/`rename`), `ready` promise, `startup()` union-and-reset,
`track(desktopId, conversationId, provider)`, `remap(desktopId, conversationId)`,
`untrack(desktopId)`, `offerIds()`, `forget(ids)`, `flush()`; write-through serialized, temp +
rename, corrupt/missing file = empty. Tests `desktop/tests/welcome-back-store.test.ts`
covering every bullet of design §6's store line.

## T2 — tracking hooks + the two `session:*` channels

- Construct the store in main at `app.whenReady()` (file `<userData>/welcome-back.json`),
  start `startup()` before `createWindow()`, flush at the top of `shutdownApp()`.
- Hooks per design §2 table: `createSession` resume (after `sessionIdMap.set`), first
  user-message transcript event (Claude + native feeds), SessionStart remap, `SESSION_DESTROY`
  IPC, remote `session:destroy`, holder takeover (`conversations/takeover.ts`, injected).
  NOT in `destroySession`/`session-exit`/`destroyAll`.
- Channels `session:reopen-list` / `session:forget-reopen`: `shared/types.ts`, `preload.ts`
  (typed on the session namespace), `ipc-handlers.ts` (await `ready`), `remote-shim.ts`
  (invoke), `remote-server.ts` (answer `[]`/`{ok:true}` — a phone never shows the screen),
  `SessionService.kt` (`[]` / `{ok:true}`). Hand-written parity block in
  `tests/ipc-channels.test.ts` (design §6). Drop `session.reopenList`/`session.forgetReopen`
  from `MOCK_ONLY`; drop the `as any` in `renderer/state/welcome-back.ts`.
- Tests: SESSION_DESTROY untracks; destroySession alone does not; takeover untracks.

## T3 — the in-app quit warning (main + renderer)

- `main.ts` close handler per design §4 (request/answer with requestId, 5 s timeout destroys
  and keeps tracked, re-use a pending request, return immediately when shutting down).
  `settlePendingCloseRequests()` at the top of `shutdownApp()`.
- Channels `window:close-request` (push), `window:answer-close`,
  `window:close-request-cancelled` (push) on preload's Electron-only `window` namespace:
  `onCloseRequest`, `answerClose`, `onCloseRequestCancelled`. Parity test entries.
- Renderer: `quitPrompt` carries `requestId`; clears on cancelled push; mock-shim gains
  `onCloseRequestCancelled`; drop the two `window.*` MOCK_ONLY rows.
- Tests: close-flow unit (false / true / reopen / timeout / late answer / SIGTERM settle);
  `QuitSessionsPrompt` copy, switch off by default, confirm passes the switch.

## T4 — renderer gating + Welcome back tests

- App's Welcome back effect: skip in remote mode, on Android, and unless this window is the
  leader (`isLeader`, `App.tsx` ~293).
- Tests (`ResumeBrowser` welcome mode, declare the viewport per narrow-viewport rule): seeds
  resumable rows ticked; complete unticks; Escape/scrim do not close; footer label counts;
  needs-model note; list empty → `onDone`; App gating skips non-leader/remote.
- `bash scripts/verify.sh` green for the branch.

## After the build (feature-flow)

Code reviewer (`scripts/ui-review/code-reviewer.md`) + UX tester run 2 in parallel → triage →
contract agent adds accepted `review:` rows → grader → acceptance deck → Destin's merge call.
