# Doc comments — Android code review

Fresh review, no prior context. Scope: `youcoded/app/` + `shared-fixtures/` on
`session/comments-mock-a`, diffed against `origin/master`. Desktop counterparts were read
only to judge Android/desktop parity (a separate reviewer covers desktop itself).

## Verify

`bash scripts/verify.sh` covers `youcoded/desktop` only and this branch's Android diff
touches no desktop-review-relevant surface differently than what the desktop reviewer
already covers, so it was not the right command here. Ran instead:

```
cd youcoded && JAVA_HOME=/usr/lib/jvm/java-21-openjdk ANDROID_HOME=$HOME/.android-sdk \
  ./gradlew test -x bundleWebUi
```
Android SDK + JDK 21 were both present (`ls $HOME/.android-sdk/platform-tools /usr/lib/jvm`
checked fresh, per `docs/workspace-workflows.md`'s warning not to trust a stale answer).
BUILD SUCCESSFUL, but every task reported UP-TO-DATE, so per that same warning I read the
actual counts out of `app/build/test-results/testDebugUnitTest/*.xml` (files were freshly
written this run, timestamps confirmed): **509 tests, 0 failures, 0 errors, 0 skipped**,
including all eleven `doccomments`/`ClaudeCodeDocCommentsMcpTest` suites the diff adds.

Also ran the one desktop test that pins Android/desktop parity for the shared MCP asset,
since the task instructions call it out by name and it is a one-file, ~1s check:
`npx vitest run tests/claude-code-doc-comments-mcp.test.ts -t "byte-identical"` inside
`desktop/` — **passed**. `doc-comments-mcp.js` is confirmed byte-identical to desktop's
embedded `DOC_COMMENTS_SERVER_JS`.

Did not run `./gradlew :app:assembleReleaseTest` (the R8 parity guard): the diff adds no
reflection (`getMethod`/`Class.forName`/`KClass`/`::declaredMembers`) anywhere in
`doccomments/`, `ClaudeCodeDocCommentsMcp.kt`, or the touched `CasWrite.kt`/`PtyBridge.kt`/
`ManagedSession.kt` hunks (checked with `rg`), so the class of break that guard exists for
doesn't apply here. Flagging the omission rather than silently skipping it, per the budget
note.

## Findings

- F1 — `youcoded/desktop/src/main/doc-comments/doc-comments-store.ts:406-436` (`addComment`) vs `youcoded/app/src/main/kotlin/com/youcoded/app/doccomments/DocCommentsBridge.kt:78` — **cross-platform parity gap on the `docComments:add` channel**: Android's bridge does `CommentSelector.fromJson(payload.optJSONObject("selector")) ?: return missingField("selector")` before ever calling `addComment`, so a request with a missing/malformed `selector` is refused with `{ok:false, error:"missing-field", field:"selector"}`. Desktop's `ipc-handlers.ts` `ADD` handler (lines 130-172) never validates `selector` at all — it casts `payload?.selector as CommentSelector` (a compile-time-only TS assertion) straight through to `addComment()`, whose body (`doc-comments-store.ts:415-433`) assigns `selector: args.selector` unconditionally and returns `{ok:true, id}`. A caller that omits `selector` therefore gets a silent success on desktop and a persisted comment with no `selector` field, but a refusal on Android for the identical request shape on the identical IPC channel. Confirmed by reading both handlers directly (not runtime-tested against a live desktop instance). Low exploitability today — the shared React renderer always sends a real selector on this path — but it is a real, confirmed behavioral divergence on a channel the parity rules (`ipc-bridge.md`) say must agree, and it means Android is silently *more* correct than desktop here, not the reverse; worth deciding whether to backport the check to desktop or intentionally document the asymmetry.

  - F1 accepted — backported to desktop. New shared `isValidCommentSelectorShape`/
    `missingSelectorField` in `doc-comments-gate.ts`, matching Android's own leniency exactly
    (outer shape only: `kind` is `'text'`/`'cell'` and `selector` is a present object; inner
    fields are NOT validated, same as `TextQuoteSelector.fromJson`/`CellSelector.fromJson`
    defaulting missing inner fields rather than refusing). Wired into both desktop surfaces —
    `ipc-handlers.ts`'s `ADD` handler and `remote-server.ts`'s `docComments:add` case — so all
    three platforms now refuse the identical shape the identical way. New tests:
    `doc-comments-ipc-handlers.test.ts` and `doc-comments-remote-relay.test.ts` (missing selector,
    unrecognized `kind`, missing inner `selector` object all refuse; a selector missing only INNER
    fields still succeeds, matching Android's own leniency).

- F2 — `youcoded/app/src/main/kotlin/com/youcoded/app/doccomments/DocCommentsDispatch.kt:434-439` (doc comment above `moveNativeXlsxComment`) — **WHY comment doesn't match the code under it (or its sibling file)**. The comment claims "The IPC response shape (`DocCommentsBridge.kt`) stays `{ok:true}` either way… no tool or IPC caller currently reads a move's returned id back." That is false for the direct `docComments:move` dispatch path: `DocCommentsBridge.kt:211-213` explicitly does `.put("id", r.value)` for the XLSX branch, and its own adjacent comment (lines 198-210) says this was a deliberate "Coordinator review fix" mirroring desktop's `moveNativeXlsxComment` return type `{ok:true; id:string}` (confirmed in `desktop/src/main/doc-comments/doc-comments-dispatch.ts:237-246`), which desktop's `ipcMain.handle` returns raw, so desktop's real wire response for an xlsx move *does* carry `id` too. The claim in `DocCommentsDispatch.kt` is only true for the *pending-mutation-queue* path (`DocCommentsPendingQueue.kt:362-374`, which does drop `id` for `move`, matching desktop's `pending-mutation-queue.ts:200-204` — that part is correct and consistent). The comment reads as written before the Bridge-layer fix landed and never got corrected, and it directly contradicts code in the very file whose behavior it's describing. Not a functional bug — purely a misleading comment that will send a future editor down the wrong path if they trust it over the code.

  - F2 accepted — WHY comment rewritten to state accurately that BOTH the Bridge's direct dispatch
    AND the pending-mutation queue now forward the fresh xlsx-move id (desktop F1 fixed the same
    finding on desktop's `pending-mutation-queue.ts` this same review round, so the "that part is
    correct and consistent" half of this finding stopped being true the moment desktop's fix
    landed). Rather than let a NEW asymmetry stand, `DocCommentsPendingQueue.kt`'s own `move`
    branch was fixed alongside the comment to also forward `id` for an xlsx move, mirroring
    desktop's queue exactly — this is a direct, in-scope consequence of desktop F1's own fix
    (`ipc-bridge.md`'s parity mandate), not scope creep. New test:
    `DocCommentsPendingQueueTest.kt`'s "an xlsx move forwards the fresh id in the result"; the
    existing docx move test now also asserts no `id` is present (a docx id never changes).

- F3 — `youcoded/app/src/main/kotlin/com/youcoded/app/doccomments/DocCommentsStore.kt:296-303` (`mutateSidecar`'s `catch (_: java.io.IOException)`) — **PLAUSIBLE, minor: wrong error code on a class of failure**. Every `IOException` that escapes `mutateFileUnderLock` — including one thrown from the *write* side (`ch.force(true)` failing on a full disk, or `Files.move` failing) inside `CasWrite.kt:mutateFileUnderLock`, not just a failed read of an existing sidecar — is mapped to `DocCommentsError.SIDECAR_CORRUPT` ("sidecar-corrupt"). The comment directly above only reasons about the read side ("An EXISTING-but-unreadable sidecar"). A disk-full or permission failure during the write would surface to the user as "sidecar-corrupt," which is inaccurate and could send someone chasing file corruption that isn't there. I did not reproduce this (would require simulating a full disk or a write-time permission failure inside the lock), so this is marked PLAUSIBLE rather than confirmed; the code path exists and the mapping is visibly indiscriminate.

  - F3 accepted — confirmed and fixed. `mutateSidecar` now tracks whether `mutateFileUnderLock`'s
    own callback was entered (it only ever runs once the read has already succeeded, per
    `CasWrite.kt`), so an `IOException` caught afterward can only be a write-side failure and is
    reported as a new, dedicated `DocCommentsError.SIDECAR_WRITE_FAILED` ("sidecar-write-failed")
    — a read-side failure still reports `SIDECAR_CORRUPT` exactly as before. Deliberately
    Android-only (no desktop wire string to mirror by name): desktop's own `mutateSidecar`
    (doc-comments-store.ts) doesn't catch a write-side exception at all — it throws uncaught,
    caught only by the renderer's generic top-level catch as a raw OS error string, never a typed
    code. Android's bridge always needs a typed `StoreResult`, so this is the accurate equivalent
    given that structural difference. The shared renderer's `describeError` gained a matching
    `'sidecar-write-failed'` case so the distinction reaches the user. New tests in
    `DocCommentsStoreTest.kt`: malformed JSON content still reports `SIDECAR_CORRUPT` (unaffected,
    read-side, never an exception); a genuine write-time failure (a directory pre-created at the
    exact `.tmp` collision path `mutateFileUnderLock` writes to) reports `SIDECAR_WRITE_FAILED`.
    Reproduced empirically rather than left PLAUSIBLE — verified the fix by first observing BOTH
    of two hand-built repro attempts land on the wrong branch of the OLD code (a directory-at-the-
    sidecar-path repro turned out to be a write-side failure via the final rename, not a read
    failure; a chmod-based repro on the sidecar's parent directory turned out to fail lock
    ACQUISITION, not the write) before landing on the `.tmp`-collision repro that isolates the
    write step cleanly.

## Not covered

- Line-by-line correctness audit of `DocxComments.kt`/`XlsxComments.kt` (3,944 lines combined) beyond their dispatch boundaries, zip-bomb guarding, and native/notes-vs-threaded-comments split — verified those specific invariants (see below) but did not walk every XML-mutation code path (anchor math, ID renumbering, relationship rewriting) line by line.
- `./gradlew :app:assembleReleaseTest` (R8 parity) — reasoned as low-risk (no reflection added) rather than run, given the time budget; flagging so it isn't silently assumed clean.
- The shared React UI / anchor code that consumes these channels (`doc-comments-anchor.ts` and its Android-side callers) — out of scope for this Android-backend-focused pass.
- Full reconciliation of every one of the ~894-line `XlsxCommentsTest.kt` / 741-line `DocxCommentsWriteTest.kt` cases against desktop's equivalents beyond confirming both cross-platform parity test files exist and pass.

## What I checked and found clean (for context, not separate findings)

- `DocCommentsGate.kt`/`DocCommentsPermission.kt` field-for-field match their TS counterparts (`doc-comments-gate.ts`, `permission-auto-approve.ts`) — confirmed by direct side-by-side read.
- The post-contract product decisions are correctly implemented: Excel writes go through the threaded-comments path only (`XlsxComments.kt`'s `CELL_HAS_NOTE` refusal keeps a genuine legacy Note untouched); the assistant's five mutation MCP tools are auto-approved unconditionally for non-Word/Excel targets and require an already-frictionless permission mode (`acceptEdits`/`bypassPermissions`) for Word/Excel targets (`DocCommentsPermission.shouldAutoApproveDocComment`), matching `permission_mode` wiring documented in `docs/cc-dependencies.md`.
- `docComments:*` dispatch in `SessionService.kt` runs inside `serviceScope.launch` on `Dispatchers.IO` (confirmed at the call site, line 304, and `serviceScope`'s declaration at line 105) — no main-thread blocking from the synchronous `ZipFile`/file I/O in `DocxComments.kt`/`XlsxComments.kt`/`DocCommentsStore.kt`.
- Zip-bomb / memory guarding (`DocCommentsZipSizeGuard.kt`) checks declared sizes before decompression and additionally bounds real decompressed bytes mid-stream (`readEntryBounded`), applied consistently across both docx and xlsx read and write paths (verified via `rg` for every call site).
- `CasWrite.kt`'s new `mutateFileUnderLock` correctly reuses the existing mkdir-based cross-process lock (same lock path naming, same 3s wait / 30s stale-lock constants) rather than adding a second locking scheme; `DocCommentsStore.kt` layers an in-process `Mutex` in front of it per sidecar path, which is a real optimization, not a replacement.
- `DocCommentsPendingQueue.kt`'s authorization model (never trusting a request's self-reported `projectRoot`; per-session token compared with `MessageDigest.isEqual`) matches the reasoning documented for desktop's `pending-mutation-queue.ts`, and the `move` response shape asymmetry between the direct bridge and the pending-queue path is intentional and matches desktop on both sides (see F2 above for the one thing that's actually wrong: the comment describing it).
- Session lifecycle: `PtyBridge.start()`'s combined `--mcp-config`/`--allowedTools` flag construction matches desktop's `session-manager.ts` variadic-flag combining exactly (same reasoning, same two-array-then-join shape); `PtyBridge.stop()` unrefs the pending queue and deletes its own deploy directory; `ClaudeCodeDocCommentsMcp`'s per-process stale-deploy sweep only fires once per process and only before any live sibling deployment could exist, so it can't delete a running session's own directory.
- `DocCommentsMcpNames.SERVER_PREFIX` and mutator tool names match `desktop/src/shared/doc-comments-mcp.ts` exactly.
- No duplicate "is this a docx/xlsx path" extension-check exists anywhere else in `app/src/main/kotlin/com/youcoded/app` outside `doccomments/` (`rg` repo-wide).
