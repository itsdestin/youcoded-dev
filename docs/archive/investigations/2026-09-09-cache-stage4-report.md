---
status: shipped
stage: 4
updated: 2026-09-09
---
# Cache Stage 4 implementation report

Durable accepted history for ChatGPT continuation, implemented as five tasks on
`session/chatgpt-cache-efficiency`. Shape: `../plans/2026-09-09-cache-stage4-architecture.md`.
Depth for the shipped behaviour: `youcoded/docs/native-runtime.md` → Durable accepted history.
No live app or configuration was touched, no model or quota call was made, no IPC or
public transcript field changed, and no cache-savings claim is made — every test is offline.

## Progress

Planning inputs (approved brief, durability/transformation spec, integration-seams
investigation, Stage 3 report, workspace map, native-runtime rule, current SessionStore/host
source) were read before edits. They confirmed the critical seams: SessionStore coalesces
stream parts under the first event UUID; root and child append chains swallow failures; root
`resume` and child `resumeSpecialist` seeded only `rebuildHistory`; ordinary `destroy` is not
transcript deletion.

An initial store-only cycle landed `accepted-history-store.ts` with 5 tests (red first
because the module did not exist). Task 2 then rewrote that store around persisted
references rather than whole-event acceptance, so the 5-test cycle is superseded by the
17 tests below and is recorded here only as history.

## Task 1 — durable credential epoch and model-free continuation identity

`chatgpt-account.json` gained `credentialEpoch` (16 random bytes, hex), minted at every
fresh sign-in and read back as `'legacy'` for a pre-existing row.
`ProviderRegistry.continuationIdentity(binding)` became the ONE place the identity string is
built; `languageModel()`'s ChatGPT closure now delegates to it.

RED: `npx vitest run tests/chatgpt-auth.test.ts` → 3 failing (missing field, `.toMatch()`
on `undefined`, `expected undefined to be 'legacy'`); `tests/provider-registry.test.ts` →
4 failing, all `TypeError: reg.continuationIdentity is not a function`.

```text
$ npx vitest run tests/chatgpt-auth.test.ts tests/provider-registry.test.ts tests/openai-continuation.test.ts
 Test Files  3 passed (3)
      Tests  98 passed (98)
$ npx tsc --noEmit        → clean
```

## Task 2 — the manifest references persisted ranges, never copies content

Proposal takes `references: PersistedEventReference[]` (delta-level, emit order) instead of
accepted uuids; coalesced anchors must TILE `[0, persistedText.length)` or the publish fails
`unreferenced-history`. Descriptors cite events (`event` / `concat` / `image`) and recompute
pruned tool text with helpers extracted from `pruneToolOutputs`
(`prunedToolResultText`, `imageCollapsedToolResultText`). Provider metadata passes a per-kind
key allowlist; anything outside it fails the publish rather than restoring an approximation.

RED: `npx vitest run tests/accepted-history-store.test.ts` → `Tests 10 failed | 2 passed (12)`,
e.g. `expected { ok: false, reason: 'unreferenced-history' } to deeply equal { ok: true, … }`.

A review pass then added the per-kind `providerOptions` allowlist, non-committing anchor
matching, and manifest-tamper validation; five of its new tests were observed red first
(literal-instead-of-anchor, metadata copied, publish rejecting, bad role/transformation,
tampered `keepChars`).

```text
$ npx vitest run tests/accepted-history-store.test.ts tests/compaction.test.ts tests/harness-compaction.test.ts
 Test Files  3 passed (3)
      Tests  35 passed (35)
$ npx tsc --noEmit        → clean
```

Guard-break: inverting the tiling contiguity check and adding `input` to the tool-call
descriptor turned exactly the two tests that guard them red; reverted, 17 passed.

## Task 3 — attempt-scoped capture in the harness

`AcceptedHistoryCapture` (pure, no disk, no message content) tracks which emitted event uuids
belong to accepted history. `HarnessSession.emitEvent` returns its uuid; every site that
mutates `this.history` calls the capture (18 mutation sites cross-checked against 29 capture
calls); `acceptedHistory()` and `assemblyDigest()` are new public surface;
`seedHistory(messages, seed?)` reseeds the capture on resume.

RED 1: `Cannot find module '../src/main/harness/accepted-history-capture'`.
RED 2: `npx vitest run tests/harness-accepted-history.test.ts` → `Tests 9 failed (9)`
(`switched.acceptedHistory is not a function`, `makeSession(...).assemblyDigest is not a function`).

Guard-break: turning the manual-Retry `abandonAttempt` into `acceptAttempt`, and the
interrupt path's `acceptAttemptText` into `acceptAttempt`, turned exactly the two tests that
guard them red (`Tests 2 failed | 7 passed (9)`); reverted.

## Task 4 — host publication, restore and fencing

`NativeSessionHost` gained a trailing optional `{ acceptedHistory, continuationIdentityFor }`;
`ipc-handlers.ts` passes the real store and `providerRegistry.continuationIdentity`, and calls
`cleanupOrphans()` once at startup. Publication snapshots and starts the revision fence
SYNCHRONOUSLY at a boundary event, then flushes references and publishes on the session's
append chain. Restore runs in both `resumeInner` and `resumeSpecialist`, falling back to
`rebuildHistory` on any failure. `SessionStore` gained `transcriptPath` and
`hydrateReferences` (without which no resumed session could ever publish again).

RED: `npx vitest run tests/native-session-host-continuation.test.ts` → 1 failed, the reopened
session's continuation items missing every reasoning item, item id and phase.

```text
$ npx vitest run tests/native-session-host-continuation.test.ts tests/native-session-host.test.ts \
    tests/session-store.test.ts tests/harness-accepted-history.test.ts tests/openai-continuation.test.ts
 Test Files  5 passed (5)
      Tests  264 passed (264)
```

Guard-break: moving the fence back INSIDE the append chain turned both race tests red
(`expected [ 'ok', 'ok' ] to deeply equal [ 'stale-generation', 'ok' ]`) — the stale
publication wins, which is why the synchronous fence exists. Removing `hydrateReferences`
and disabling the restore branch each turned their own tests red.

A follow-up review batch closed Task 4's reported gap: the compact-summary uuid is now
recorded into the accepted set, so the summary receipt is a REFERENCE to the persisted event
instead of a bounded literal. Task 5 updated the pinning test accordingly and added an
assertion that the summary text is absent from the sidecar.

## Task 5 — privacy sentinels, docs, verification

`tests/accepted-history-privacy.test.ts` drives one real session through the real
`@ai-sdk/openai` Responses provider over fake SSE, with temp NativeHome / userData / cwd
roots, whose reasoning ciphertext is the sentinel `REASONING-SENTINEL-…`. The visible
reasoning summary carries a SECOND marker that must be present everywhere, so no assertion
can pass against an empty artefact.

RED (assertion inverted to claim the sentinel IS in the JSONL):

```text
AssertionError: expected '{"v":1,"sessionId":"privacy","harness…' to contain 'REASONING-SENTINEL-4f1c9ae207b3d6e8'
 ❯ tests/accepted-history-privacy.test.ts:166:19
 Test Files  1 failed (1)
```

The dumped transcript in that failure is the evidence: header, `user-message`,
`assistant-thinking` (visible summary only), `assistant-text`, `turn-complete` — no ciphertext.

Guard-breaks (each reverted): removing the host's continuation options →
`expect(fs.existsSync(manifestPath)).toBe(true)` red, so the manifest assertion is not
vacuous; making a second source file mention `private-continuation` →
`expected [ 'main/dev-tools.ts', …(1) ] to deeply equal [ Array(1) ]`.

GREEN: `Test Files 1 passed (1) / Tests 1 passed (1)`.

### Readers inspected for the privacy claim

| Reader | File | What it reads | How it was covered |
|---|---|---|---|
| Session JSONL | `harness/session-store.ts` → `native-home.ts` | the transcript the manifest describes | read from disk and searched; every file under the NativeHome root searched too |
| Replay | `harness/native-session-host.ts` `getHistory()` | persisted events + the delegation ledger | called on the live session, result serialized and searched |
| Forwarded events | `NativeSessionHost` `'transcript-event'` | the single emitter every consumer (renderer, remote server, conversations service, title feeder) subscribes to | recorded from before `create()`, serialized and searched |
| Portable export | `conversations/service.ts` + `conversations/transcript-mirror.ts` | resolves a native session to `<nativeHome>/sessions/<slug>/<id>.jsonl` and copies THAT FILE into the synced space | `mirrorIn()` run for real; the space copy searched |
| Export metadata | `session-browser.ts` `readSessionTranscriptMeta` | head/tail of the same JSONL, for title / last model | called for real; result searched |
| Chatsearch index | `chatsearch-index/index-service.ts` → `index-core.ts` | ONLY that same JSONL, at line granularity | `extractNativeUserTurns()` run on the real transcript |
| Chatsearch preview | `chatsearch-index/transcript-reader.ts` | the same JSONL | `parseNativeTranscript()` run on the real transcript |
| Bug report / diagnostics | `dev-tools.ts` (`gatherDiagnostics`, `readLogTail`) | fixed environment probes plus the tail of `~/.claude/desktop.log` | **not exercised offline** — see below |

**Could not be exercised offline:** `gatherDiagnostics()` shells out to `git`/`claude` and
makes two HTTPS HEAD requests, and `readLogTail()` reads the developer's real
`~/.claude/desktop.log`. Both are pinned structurally instead: the test asserts that the
string `private-continuation` occurs in exactly ONE source file in the whole app
(`main/harness/accepted-history-store.ts`, where it is a private field, not an export), that
`dev-tools.ts` names neither it nor `userData`, and that the manifest path is outside the
NativeHome tree that every transcript walker enumerates.

### Android and remote-web boundary check

Searched `youcoded/app/` for `session-store`, `SessionStore`, `native-session-host`,
`NativeSessionHost`, `accepted.?history`, `private-continuation`, `chatgpt-account`,
`credentialEpoch`, `continuationIdentity` — **zero matches**. Android has no native harness:
its `TranscriptEvent.kt` parses Claude Code's own JSONL, and `SessionService.kt` mentions
ChatGPT only to reply not-implemented on `chatgpt:status|sign-in|cancel-sign-in|sign-out`
so the shared React UI degrades to a desktop-only state. No Android build is required.

Searched `remote-server.ts` and `remote-shim.ts` for the same terms — zero matches. Remote
forwards transcript events, whose public shape is unchanged, and its transcript reads are
path-checked reads of the same JSONL. Repo-wide, `sessionFilePath` / `transcriptPath(` /
`hydrateReferences` / `continuationIdentity` have no consumer outside `src/main/harness/`,
`native-home.ts`, `provider-registry.ts` and `ipc-handlers.ts`. Three stale comments still
naming `NativeHome.sessionPath()` (renamed to `sessionFilePath()` in Task 4) were corrected.

### Full verification

```text
$ bash scripts/verify.sh /home/destin/youcoded-dev/worktrees/sessions/chatgpt-cache-efficiency/youcoded
verify: …/youcoded (base origin/master)
  tests: related to 37 changed file(s) + 45 source-scanning guards

PASS  types (tsc --noEmit)
PASS  types in tests/ (tsc --noEmit, 57 file(s) still excluded)
PASS  tests (related)
PASS  dead code (knip)
PASS  lint (eslint)
PASS  invariants (ast-grep)

OK — all checks passed.
   Not covered: Android (./gradlew test), marketplace worker.
```

The first run of that command failed two checks, both inside Stage 4's own new test file and
both fixed here: a `SpecialistSpawnOpts` missing its required `description` (visible only
under `tsconfig.tests.json`, which the main `tsc --noEmit` does not cover), and the
compact-summary assertion that pinned the now-closed literal gap.

`--full` additionally runs the whole suite: `Test Files 1 failed | 722 passed | 1 skipped
(724) / Tests 2 failed | 9971 passed | 42 skipped (10015)`. The single failing file is
`tests/xterm-webgl-mipmap-patch.test.ts`, which asserts a dependency patch inside
`node_modules` — the known worktree/hardlink environmental failure, unrelated to Stage 4 and
outside its scope.

## Closing (2026-09-09, second session)

The unfinished Stage 4 was completed on the app branch `session/chatgpt-cache-efficiency` as five reviewed tasks plus a whole-branch review and one fix wave. Every task got a fresh implementer and a fresh reviewer; the branch was then merged with `origin/master` (6ccb8172, PR #456) and Stage 2 was dropped by Destin's decision because master retired the per-turn specialist status block.

Commits, in order: 46f10816 (durable credential epoch + `continuationIdentity`), 44da5d62 + be4126bf (manifest store: references, per-kind providerOptions allowlist, prune helpers), 47f35cf2 + fedcf05e (attempt-scoped capture + harness hooks), 6684d791 (host publication/restore/fencing), 3bfd972a (harness leftovers), 2ecef874 + d95fd3b8 (privacy sentinels + docs), c4ef1a3a (whole-branch review fixes), 2a3d07c6 (merge master), dce6b269 (drop Stage 2; `spliceNotice` records its own event).

Whole-branch review findings and their disposition: C1 master conflict + uninstrumented `spliceNotice` — resolved by the merge commit and dce6b269; I1 empty-summary reasoning part could never publish — reference-free `empty` descriptor plus a summary-less fixture at store and host level; I2 spurious clearing status snapshot — moot, Stage 2 dropped; I3 fingerprint buffer parser mismatch — scanner completeness is the guard, shortfall counts as a dropped observation; I4 zero-assertion CPU benchmark — opt-in via `YOUCODED_DIAG_BENCH=1` with a real assertion; I5 loss record untested — writer and summary-script tests added; I6 double JSON parse pre-send — scanner now supplies `model` and input count, one parse; measured medians moved 12.98→12.72 ms (433 KB) and 29.33→27.99 ms (4 MiB encrypted part) on this machine, so the win is correctness, not speed. Minors carried as follow-ups are listed in the branch's `.superpowers/sdd/progress.md` ledger and in the roadmap entry.

One documented exemption to "reference, never copy": `providerOptions.openai.parallelToolCall.input`, the parallel-call wrapper argument string the pinned SDK re-emits verbatim and the transcript cannot rebuild, is kept in the private sidecar. Stated in `youcoded/docs/native-runtime.md`.

Final desktop verifier after the merge (from the merge report): `OK — all checks passed` (types, types in tests, related tests, knip, eslint, ast-grep). Not covered: Android, marketplace Worker; both were grep-checked for consumers of the touched boundaries and none were found. No paid evaluation or live model call was made; offline correctness does not establish cache savings.
