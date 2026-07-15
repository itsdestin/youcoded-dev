---
status: superseded
---

# Plan Review: `2026-05-04-opencode-provider-mvp.md`

**Date:** 2026-05-04
**Reviewer:** Claude (Opus 4.7)
**Plan reviewed:** `docs/superpowers/plans/2026-05-04-opencode-provider-mvp.md`
**Spec:** `docs/superpowers/specs/2026-05-04-multi-model-harness-design.md`

Strong foundation overall — TDD discipline, clean module separation (`OpenCodeService` / `Adapter` / `ConfigWriter`), correct worktree+junction safety, IPC parity covered, and an analog `oc-dependencies.md` registry. Below is what should change, ordered by severity.

---

## Critical bugs in the design

### 1. Desktop session ID ≠ OpenCode session ID for new sessions (Task 6)

This breaks message routing and event filtering.

```ts
const localId = opts.resumeSessionId || id;   // resume: OC id; new: random UUID
ensureOcSession.then((ocSession) => {
  const adapter = new OpenCodeSessionAdapter({ sessionId: ocSession.id, ... });
  // adapter filters events by ocSession.id, emits with sessionId: ocSession.id
});
// ...
sendInput(id, ...) {
  this.opencodeService.sendMessage(id, userText);   // id = localId (random UUID)
}
```

For **new** sessions, `id` (desktop) and `ocSession.id` (OpenCode) diverge. `sendMessage(id, ...)` targets a non-existent OC session, AND adapter-emitted `transcript-event`s carry `sessionId: ocSession.id` while the chat reducer keys on the desktop id. Both directions are broken.

Fix options, in order of cleanness:
- Make `createSession` async for `provider === 'local'` so we can use the OC id as the desktop id from the start. (Cleanest, but ripples through callers.)
- Maintain a `desktopId ↔ ocId` map in `SessionManager` and translate in both `sendInput` and the adapter's emit. (Localized but two bugs to remember forever.)
- Have OpenCode accept a client-supplied session id at create time, if its API allows. (Verify in setup step 5.)

This is the biggest design issue in the plan — the resume path works by accident because the IDs match.

### 2. Tool calls likely hang on the first turn (no permission policy)

The plan declares "no permission UI" as a non-goal, but doesn't disable OpenCode's permission prompts. Any local session that emits a `ToolPart` triggers a permission flow that has no listener — the session will sit in `pending` forever. The `ConfigWriter` should set OpenCode's permission policy to `allow` (or whatever the equivalent field is) for the MVP, and that decision belongs in the spec/non-goals list.

### 3. Ready-detection is fabricated

Task 4 hard-codes a regex against `"listening on http://host:port"`. There's no evidence OpenCode prints that. If the format differs (JSON logs, different wording, or stdout-buffered until ready), `start()` rejects after 15s. **Replace stdout regex with port polling**: spawn → poll `GET ${baseUrl}/event` (or any health endpoint) every 200 ms with a deadline. Stdout-line parsing is fragile and version-coupled regardless.

### 4. Resume hydration is assumed, not verified

Task 13 says "OpenCode replays its message history over SSE." If OpenCode's SSE only delivers new events (the more common pattern), resumed sessions appear empty until the user types. Verify, and otherwise add a one-shot `GET /session/:id/message` → synthesize `user-message` / `assistant-text` / `tool-use` / `tool-result` transcript events on adapter mount.

---

## High-impact issues

### 5. Speculative SDK surface

Setup Step 5 says "verify the SDK type surface" but Tasks 4–6 hard-code `createOpencodeClient`, `client.event.subscribe`, `client.session.create`, `client.session.message.create`, `client.session.cancel`, `client.session.delete`, `client.session.list` into both production and test code. Tests pass against placeholders. This should be a hard gate: Setup Step 5 is incomplete until the SDK names are pinned and the plan's tests are rewritten with the real names. Mark it "BLOCKING — do not proceed."

### 6. Config schema is guessed

`opencode.json` shape (`provider.ollama.npm`, `provider.ollama.options.baseURL`), `auth.json` shape (`auth.ollama.key`) — no source cited. Verify against an `opencode init`-generated config or OpenCode docs before writing tests.

### 7. Canonical OpenCode repo is unresolved

Plan defers `sst/opencode` vs `anomalyco/opencode` to implementation time. Pin this **before** Task 8, not during. Wrong URL = broken installer, and discovery during smoke test is expensive.

### 8. Crash recovery leaks stale adapters

`ensureOpenCodeService` will start a fresh daemon after `crashed`, but existing `OpenCodeSessionAdapter` instances still hold an unsubscribe over the dead SDK. After restart they're zombies. Either (a) `destroyAll` local sessions on `crashed` and surface a "local sessions ended; restart required" banner, or (b) re-mount adapters against the new SDK. Plan should pick one.

### 9. Settings endpoint write is debounce-less

Task 11's `useEffect` calls `writeOpenCodeConfig` on every keystroke in the endpoint input. Each keystroke = a JSON read+write to disk. Debounce 500–1000 ms or wrap in onBlur.

---

## Medium issues

### 10. `endpoint` on `SessionInfo` is vestigial

Added "for IPC-routing convenience" but I don't see it consulted anywhere — `sendInput` reaches `opencodeService` via the singleton, not via the field. Either drop it or document the actual reader.

### 11. Test mocks pin the SDK shape that Tasks haven't verified

When Setup Step 5 lands real SDK names, every test in Tasks 4–6 must change. Reorder: do Setup Step 5 with a tiny spike file (`scratch/opencode-spike.ts`) that calls real methods against a real `opencode serve` and prints types. Then write tests.

### 12. `ManagedSession.worker: ChildProcess | null` is a definite change, not "if needed"

Task 6 hedges; it'll definitely fail tsc otherwise.

### 13. Local session "session-died" banner unreachable

Plan correctly gates the classifier on `provider === 'claude'`. But `<AttentionBanner>` for `'session-died'` is dispatched from `SESSION_PROCESS_EXITED` — local sessions don't have a worker process, so they never emit that. If the OpenCode daemon dies mid-turn, the local session stays in "thinking" forever with no banner. Address by translating `OpenCodeService.crashed` into a synthetic `session-died` for any in-flight local session.

### 14. Optimistic-message dedup may double-render

`USER_PROMPT` sets `pending: true`; the adapter emits `user-message` with `data.text` from OpenCode's echo. If OpenCode normalizes whitespace or trims, content-match dedup misses and the user sees their bubble twice. Verify with a real round-trip; if dedup needs help, use a per-message uuid sent in `sendMessage` and echoed back.

### 15. Runtime UI label/icon polish

`r === 'claude' ? 'Claude' : r === 'local' ? 'Local' : 'Gemini'` is fine for MVP, but Local with no model-installed shows "Install Ollama + Qwen 3 8B →" — that copy bakes Qwen 3 8B into the UI in a way that won't age (LM Studio users, future preferred models). Consider "Set up local models →" and let `LocalSetupModal` choose the default.

### 16. Smoke-test commands are bash-only

`ps aux | grep` won't work in PowerShell. Either give a `Get-Process opencode` variant or note "run from Git Bash."

---

## Lower-priority polish

- The `// Existing Claude variant buttons` placeholder in Task 9 Step 3 hides real JSX surgery — call out which file lines move where.
- Task 13's `// ... existing post-create wiring` similarly handwaves the bulk of resume.
- No e2e test (Task 14 is manual). Acceptable for MVP, but a Playwright run that programmatically goes through "Local → send → see streamed bubble" would catch bugs #1, #3, #4 in CI rather than at smoke.
- `oc-dependencies.md` should also list: SSE event delta semantics (cumulative vs incremental text), session-storage path on each OS, and OpenCode's expected log format (once #3 is verified) — those are the upgrade tripwires.
- `LocalSetupModal` runs setup async with no cancel cleanup — if the user clicks Close mid-install, the `installOllama` Promise keeps running. Pass an `AbortController` through.

---

## Summary

The architecture is sound. There are two **must-fix-before-implementation** items: the desktop-id/OC-id divergence (#1) and the missing permission policy (#2). There are three **must-verify-before-Task-4** items: SDK surface (#5), config schema (#6), and canonical repo (#7). Everything else is solvable during implementation, but listing #3 (port poll vs stdout regex) and #8 (crash adapter cleanup) explicitly in the plan would prevent rework.
