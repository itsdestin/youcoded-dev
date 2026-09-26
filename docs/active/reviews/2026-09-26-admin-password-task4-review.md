---
status: active
feature: admin-password
review-round: task4
design: docs/active/specs/2026-09-26-admin-password-technical-design.md
contract: docs/active/design/2026-09-25-admin-password/admin-password.contract.json
commit: 042f45971
---

# Admin password card — task 4 (broker + IPC + card wiring) — security review

Scope: `desktop/src/main/harness/admin-password-service.ts` (new),
`desktop/src/main/harness/permission-broker.ts` (password `kind`), the five IPC surfaces
(`preload.ts`, `remote-shim.ts`, `ipc-handlers.ts`, `remote-server.ts`,
`SessionService.kt`), and the renderer (`chat-reducer.ts`, `chat-types.ts`,
`hook-dispatcher.ts`, `ToolCard.tsx`, `CompactToolStrip.tsx`), commit `042f45971`.
`AskpassServer` itself (`harness/askpass/**`) is task 3, imported from and not edited here,
but traced for Priority 1 anyway per the review brief.

`npx vitest run tests/admin-password-service.test.ts tests/native-permission-broker.test.ts
tests/chat-reducer-admin-password.test.ts tests/remote-server.test.ts tests/admin-command.test.ts
tests/ipc-channels.test.ts tests/workbench-fixture-actions.test.ts`: **859 passed (7 files), 0
failed.**

## Priority 1 — does the password ever leak?

Traced the full path: `AdminPasswordPrompt.onSubmit` → `preload.submitAdminPassword` /
`remote-shim.submitAdminPassword` → `ipc-handlers` `NATIVE_SUBMIT_ADMIN_PASSWORD` handler /
`remote-server.ts` WS case `native:submit-admin-password` → `NativeSessionHost.submitAdminPassword`
→ `AdminPasswordService.submit` → `AskpassServer.deliver`.

**No leak found.** Specifically checked and clean:

- **`AdminPasswordPrompt.tsx`** (L26, L39-46): password lives only in local `useState`,
  cleared synchronously right after `onSubmit?.(value)` (L45, "the text must not linger in
  React state after send"). Also cleared on a wrong-try re-ask (L37). No `console.*` call in
  the file references `value` or `ask`. `autoComplete="off"`, `spellCheck={false}`,
  `data-1p-ignore`, `data-lpignore` block password-manager/spellcheck exfil.
- **`ipc-handlers.ts`** L4832-4841: one-line passthrough into `nativeHost.submitAdminPassword`.
  No generic `ipcMain.handle` wrapper/logging middleware exists anywhere in the file (302
  direct `ipcMain.handle` registrations, none wrapped) that could catch this payload on error.
- **`remote-server.ts`**: `handleMessage`'s only catch (L1732-1736) swallows a `JSON.parse`
  failure with no logging of raw bytes. The `default:` unknown-channel branch (L3921+) logs
  only the channel-name string, never `payload`. `logDevice()` (L426-429) takes a plain event
  string, never a payload. The `native:submit-admin-password` case (L2010-2024) has its own
  comment stating no logging touches `payload.password`, and the code matches — read once,
  passed straight into `submitAdminPassword`. `bufferHookEvent` explicitly refuses to buffer a
  `PasswordRequest` at all (new `if (event.type === 'PasswordRequest') return;`, L1086-1093),
  so it never sits in the rolling replay log even transiently.
- **`permission-broker.ts` `askPassword()`**: payload is built explicitly to exclude `password`
  and `tool_input` — pinned by test `native-permission-broker.test.ts` → "askPassword emits a
  PasswordRequest with no password field and no tool_input, ever".
- **`AdminPasswordService`**: `submit()` converts the string to a `Buffer` only at the call
  into `askpass.deliver()`; the class holds no field that ever contains the string (pinned by
  its own test "never logs or stores the password anywhere reachable after the call returns",
  which walks every instance field with `JSON.stringify`).
- **`AskpassServer.deliver()`** (task 3, unedited): zeroes both the reply buffer and the caller's
  password `Buffer` in a `finally` (askpass-server.ts L303-306); the password is never turned
  into a JS string on that side of the wire (`buildOkReplyBuffer`/`jsonEscapeBytes` work on raw
  bytes and zero their own intermediates).
- **Persistence / sync**: `PasswordAsk` (the renderer type) and `PasswordAskRequest` (the
  broker type) carry only `requestId`/`command`/`via`/`triesLeft` — the secret is structurally
  excluded from the state shape that gets serialized for remote hydrate
  (`serializeChatState`/`deserializeChatState`) or `SessionStore`. Grepped
  `session-store.ts`/`harness-session.ts` for `PermissionRequest|PasswordRequest|hook-event`:
  no matches — hook-events never reach the on-disk transcript path at all, only IPC/WS
  listeners.
- **Crash diagnostics**: `crash-diagnostics.ts` logs only `reason`/`exitCode`/`type` on
  process-death events, never IPC args; `crashReporter.start({ uploadToServer: false })` keeps
  any minidump local-only (pre-existing, unrelated to this commit).
- **`unhandledRejection` handler** (`main.ts` L134-137): logs `reason.stack ?? reason.message`.
  A malformed WS payload where `payload.password` is a **non-string** (e.g. a number) would
  throw inside `Buffer.from(password, 'utf8')` (Node's `ERR_INVALID_ARG_TYPE`), and that error's
  own message echoes the received value — but only the attacker-supplied malformed value, never
  the real password (a real password from the card is always a string, so this throw path is
  never reached on the legitimate flow). Filed below as a low-severity robustness gap, not a
  leak.

**T4-1 already handled — the contract (R7) shows the exact command on purpose, and the same text is already on the approval card; (low, informational — command-display, not password-plaintext handling):**
`displayCommandFromSudoArgv` (`tools/admin-command.ts` new function, L176-190) strips only
`sudo`'s own flags, not the target command's own arguments, before the result is emitted
unredacted as `PasswordRequest.command` — shown in the card (by design, contract R7) and
broadcast to every connected remote/paired device (contract R6) over the app's remote-access
WebSocket, which per `desktop/CLAUDE.md` is not TLS-encrypted. A command like
`sudo mysqldump -pSECRET db` puts `SECRET` (the *target command's* own secret, not the
computer's admin password) straight into that broadcast string. This is an inherent tradeoff
of "show the exact admin step" and already existed in `visibleSudoLines`'s pre-commit behavior
for the up-front ask; `displayCommandFromSudoArgv` shares the exact same stripping rule via the
new `stripSudoOptionsFromArgv` helper, so this task did not make it worse, but it does now also
apply to the mid-command ask this task adds. Not a fix requirement for this task — flagging so
it's tracked rather than silently inherited.

**T4-2 accepted — type-check the password before Buffer.from on both surfaces, with tests incl. a no-log test on the IPC handler; (low — robustness, not a leak):** none of `ipc-handlers.ts`'s handler, `remote-server.ts`'s
WS case, or `AdminPasswordService.submit`'s default `toBuffer` validate that `password` is
actually a string before calling `Buffer.from(password, 'utf8')`. A malformed/malicious
`native:submit-admin-password` payload (non-string `password`) throws synchronously inside
`submit()`. On the IPC hop this becomes a rejected `ipcMain.handle` promise (Electron logs and
returns it to the renderer — no crash). On the **remote WS** hop it becomes a rejected
`handleMessage()` promise that nothing awaits (`ws.on('message', ...) => { ... void
this.handleMessage(...) }`), caught only by the process-wide `unhandledRejection` handler in
`main.ts`, which logs and keeps the app alive — so this is not a crash, but it is an
unnecessary throw path reachable by a payload an authenticated-but-buggy or malicious remote
peer controls. Fix: validate `typeof password === 'string'` in the WS case (and/or in
`ipc-handlers.ts`) and answer `false` for a non-string, matching the "unknown/expired requestId
returns false" contract `AdminPasswordService.submit` already documents. No test currently
pins this — see Priority 4.

## Priority 2 — correctness

**No bugs found; the described invariants hold and are pinned by tests:**

- **Re-announce/replay/withdraw for password asks.** `askPassword()` registers into the SAME
  `pending` map as `ask()`, with `kind: 'password'`; the heartbeat (`ASK_REANNOUNCE_MS`) and
  `pendingEventsFor()` both route through the shared `requestEventFor()`, which now reads
  `type` from the stored announcement instead of hardcoding `'PermissionRequest'` — this is the
  bug the commit message describes fixing, and it is exactly the kind of bug that would have
  silently mislabeled every password heartbeat/replay as a permission ask (renderer would never
  match `PasswordRequest`, card would never re-appear on reconnect). Pinned by "re-announces a
  still-pending password ask ... as PasswordRequest (not PermissionRequest)" and "pendingEventsFor
  replays an open password ask as PasswordRequest".
- **`PasswordResolved` is always emitted, never `PermissionExpired`/`PermissionResolved` for a
  password kind.** `removeEntry()` branches `entry.kind === 'password' ? 'PasswordResolved' :
  'PermissionResolved'`; `cancelOne()` returns before emitting `PermissionExpired` or calling
  `entry.resolve!` when `entry.kind === 'password'` (password entries have no `resolve` to
  call). Pinned by "withdraw() removes it and emits PasswordResolved, never PermissionExpired",
  "cancelSession() clears an open password ask with PasswordResolved only".
- **The two doors never cross.** `respond()` returns `false` for `entry.kind === 'password'`
  before touching `entry.resolve` (which would be `undefined` for that kind); `withdraw()`
  returns `false` for `entry.kind !== 'password'`. Pinned by "respond() never touches a password
  ask" and "withdraw() returns false for ... a PERMISSION ask's id".
- **No ask left pending after its socket closes.** `AskpassServer`'s `onClose` (task 3, unedited)
  emits `'withdrawn'` only for an ask already in its own `pending` map; `AdminPasswordService
  .onWithdrawn` forgets the bidirectional mapping *before* calling `broker.withdraw()`, so the
  broker's own resulting `PasswordResolved` hook-event finds nothing left in
  `onPasswordResolved` to act on — verified by walking the ordering in both directions (submit()
  forgets before its own `withdraw()` call for the same reason). Both orderings are exercised by
  tests ("submit()'s own withdraw() does NOT also trigger a refuse", "a repeat withdrawn for the
  same askId is a no-op").
- **`triesLeft` mapping.** `attempt > 0 ? SUDO_DEFAULT_TRIES - attempt : undefined` matches
  design §6 (attempt 0 = first ask, no warning; attempt 1/2 → 2/1 tries left). Note: `attempt 3
  → triesLeft 0` is tested but should be unreachable in practice — sudo's own
  `passwd_tries` default is 3, so a third wrong answer makes sudo give up before ever issuing a
  4th askpass round with `attempt: 3`. Harmless dead branch, not a bug.
- **Specialist routing.** `resolveSpecialistChild` mirrors `childAskRouter`'s field shape
  (`childId`/`agentType`/`title`/`parentToolCallId`) and routes `sessionId` to the parent,
  `raisedBy` to the child — verified against both the service's own tests and the reducer's
  `findSpecialistCard` fallback path (falls back to a labelled top-level card, never fabricates
  one, when the Task card/segment isn't loaded yet).
- **Reducer matching by `toolUseId`, including nested specialist segments.** `PASSWORD_REQUEST`
  matches the exact `toolUseId` (no name/input guessing, unlike `PERMISSION_REQUEST`'s synthetic
  fallback) and, when `specialist.parentToolCallId` resolves to a loaded Task card, sets
  `passwordAsk` on the matching `subagentSegments` entry rather than the top-level card;
  `PASSWORD_RESOLVED` checks the nested-segment path first, then the top-level path, matching by
  `requestId` alone (unique per ask) so no `toolUseId` is needed to find the right card either
  way.
- **`submit` returning `false` → card ends.** `ToolCard.tsx`'s `onSubmit` dispatches
  `PASSWORD_RESOLVED` locally only on `false` (an expired ask has no live main-side push coming
  for *this* device); a `true` result needs no local dispatch because `AdminPasswordService
  .submit()` always calls `broker.withdraw()` regardless of `deliver()`'s own result, which
  broadcasts `PasswordResolved` to every device including the one that just submitted.

## Priority 3 — parity

All five surfaces agree: `NATIVE_SUBMIT_ADMIN_PASSWORD` = `'native:submit-admin-password'` is
byte-identical across `preload.ts`, `shared/types.ts`, `remote-server.ts`'s WS case string, and
`ipc-channels.test.ts`'s pinned list. Arg shape `{ requestId: string, password: string }` and
`Promise<boolean>` return match on `preload.ts`, `remote-shim.ts`, `ipc-handlers.ts`, and
`remote-server.ts` (respond with the raw boolean). `remote-shim.ts`/`preload.ts` both carry the
explicit "never logged/echoed on this hop" comment. `SessionService.kt` correctly lists the
channel among desktop-only not-implemented channels (same posture as `native:kill-shell`) with
a comment explaining a phone answers over the remote WS path instead, never through Android's
own native runtime — consistent with contract R19.

## Priority 4 — test gaps

- **T4-2's non-string-password throw path is untested** on both the `ipc-handlers.ts` handler
  and the `remote-server.ts` WS case — a test asserting `submitAdminPassword`/the WS case
  answers `false` (not throws) for a non-string `password` would have caught this and would
  stay red until fixed.
- **No test on `ipc-handlers.ts` itself** asserting the `NATIVE_SUBMIT_ADMIN_PASSWORD` handler
  never logs the password (the equivalent `remote-server.test.ts` sentinel test — spying on
  `console.log`/`warn`/`error` — exists only for the WS case, not the direct IPC handler). Low
  risk given the handler is a visually-inspectable one-liner with no logging anywhere nearby,
  but a leak introduced later by an unrelated edit to that function would currently stay green.
- **No fixture/gallery-level test** exercises `mock-shim.ts`'s `?adminPasswordFail=1` toggle
  (workbench-only, so low stakes, but it's new hand-written surface with zero coverage).

## Not re-litigated

Task 3's `AskpassServer`/`verify.ts` internals were already reviewed
(`2026-09-26-admin-password-task3-review.md`) and are unedited here; this review only re-traces
`deliver()`'s zeroing behavior as the Priority-1 endpoint, per the brief.
