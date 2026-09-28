# Doc comments — code review (fresh, code-reviewer.md)

Scope: everything under `youcoded/desktop/` (main, shared, renderer, the Claude Code doc-comments
MCP script, desktop tests). `youcoded/app/` (Android Kotlin) is a separate reviewer's territory —
no desktop/Android mismatch was found from this side.

Inputs used: the diff `origin/master...session/comments-mock-a` under `youcoded/desktop/`, the
contract at `docs/active/design/2026-09-24-doc-comments/doc-comments.contract.json`, every
`.claude/rules/*.md` whose `paths:` matched a touched file (`performance.md`, `renderer-lists.md`,
`react-renderer.md`, `harness-tools.md`, `native-runtime.md`, `native-permissions.md`,
`ipc-bridge.md`, `narrow-viewport.md`), and `docs/PITFALLS.md`. Two post-contract product
decisions were given as ground truth: Excel comments are threaded-only (legacy Notes untouched,
never surfaced), and the assistant asks permission only for a Word/Excel comment mutation, never
for reading or for a plain-text/markdown/code comment.

## Verify

```
verify: /home/destin/youcoded-dev/worktrees/sessions/comments-mock-a/youcoded (base origin/master)
  tests: FULL suite (test infra changed: desktop/package.json)

PASS  types (tsgo --noEmit)
PASS  types in tests/ (tsgo --noEmit, 47 file(s) still excluded)
PASS  tests (full suite)
PASS  dead code (knip)
PASS  lint (oxlint)
PASS  design lint (oxlint --max-warnings ratchet)
PASS  invariants (ast-grep)

OK — all checks passed.
   Not covered: Android (./gradlew test), marketplace worker.
```
`npm run knip` was also re-run filtered for "comment" — no dead-export/dead-file warnings for any
doc-comments file.

## Findings

- F1 — `desktop/src/main/doc-comments/pending-mutation-queue.ts:200-204` and
  `desktop/src/main/harness/tools/doc-comments-tools.ts:339-348` — the xlsx `Move` path's own
  "review F3" fix is wired at the dispatch layer but never reaches either real caller, so it
  never actually helps. `moveNativeXlsxComment`/`moveXlsxComment`
  (`desktop/src/main/doc-comments/doc-comments-dispatch.ts:237-246`,
  `desktop/src/main/doc-comments/xlsx-comments.ts:1950-1971`) were changed to return the moved
  thread's *fresh* id (its old id's embedded-cell hint goes stale the instant it moves, forcing
  the next lookup by the old id into the full-workbook fallback scan, bounded by
  `MAX_FALLBACK_SCAN_BYTES` = 50MB of parsing —
  `desktop/src/main/doc-comments/xlsx-comments.ts:80`). But: (1) the pending-mutation queue's
  `applyRequest` 'move' branch discards it — `return result.ok ? { ok: true } : ...` never reads
  `result.id`, even though `PendingMutationResult` itself declares an optional `id` field
  (`desktop/src/shared/doc-comments-types.ts:156-164`) that the adjacent 'add' branch three lines
  above *does* forward; (2) the native harness `MoveCommentTool.execute` also never reads
  `result.id` — its success text is `` `Comment ${args.commentId} on ${args.path} repointed.` ``,
  always the OLD id. Since the renderer never calls `docComments:move` at all (verified: no
  `ipc.move`/`MoveComment` call site under `src/renderer` outside `describe-rule.ts`'s label map),
  these two are the *only* real consumers, and neither is told the new id. Net effect: every
  real Move followed by another operation on the same xlsx comment (Move→Resolve, Move→Reply)
  still pays for the full-workbook fallback scan the fix's own comment says it exists to avoid —
  the optimization is effectively dead code at both of its intended call sites. Confirmed by
  reading all four sites named above (not run live — no test currently pins this cross-file
  wiring, e.g. nothing pins that the MCP queue's move result forwards `id`). Severity is
  contained: correctness is unaffected (the fallback scan still resolves the comment correctly),
  this is a missed perf optimization, not a bug a user or the assistant can observe going wrong,
  which is why this is not filed higher. `desktop/tests/pending-mutation-queue.test.ts` and
  `desktop/tests/xlsx-comments.test.ts` do not appear to assert on a forwarded move `id` either
  (grep for `result.id`/`extra.id` inside the move describe blocks came back empty), so nothing
  guards this either way — [PLAUSIBLE] that a repo-wide search missed a guard, but non-exhaustive
  grep across both test files found none.

  - F1 accepted — `pending-mutation-queue.ts`'s `move` branch now reads `result.id` and forwards
    it (`{ok:true, id}` when the xlsx dispatch function set one, plain `{ok:true}` for docx, which
    never does). `doc-comments-tools.ts`'s `MoveCommentTool.execute` now states the new id in its
    success text (`"...repointed (new id: <id>)."`) when one comes back, unchanged otherwise. The
    MCP script's own `MoveComment` handler (`claude-code-doc-comments-mcp.ts`'s embedded
    `DOC_COMMENTS_SERVER_JS` string) now states `"New id: <id>."` too when the queue result carries
    one — mirrored byte-for-byte into `app/src/main/assets/doc-comments-mcp.js`, parity test still
    green. New tests: `pending-mutation-queue.test.ts` ("an xlsx move forwards the fresh id in the
    result"), `doc-comments-tools.test.ts` ("MoveComment on a .xlsx target states the fresh id...").

- F2 — `desktop/src/main/doc-comments/zip-size-guard.ts:153` — `decompressBounded`'s
  `stream.on('error', ...)` maps *every* stream error to `{ok:false, error:'archive-too-large'}`,
  not only a genuine size overflow (which is already handled explicitly by the `data` handler's
  own `total > ceilingBytes` branch three lines above). A truncated/corrupted zip entry — nothing
  to do with size — would surface through the exact same code as an oversized one. I did not trace
  this error code all the way to a user-facing string (no renderer-side handling of the literal
  `'archive-too-large'` string was found — `rg` across `src/renderer` came back empty, meaning it
  flows through whatever generic `describeError`/error-panel path the comments pane uses for any
  read failure), so I could not confirm whether a user or the assistant ever actually sees a
  specific "this file is too large" claim for what might be ordinary corruption — flagging as
  [PLAUSIBLE], not confirmed, and low severity even if true (an inaccurate error *cause* string,
  not a functional break — `docs/error-message-standards.md`'s "never invent an error cause" is
  the rule this would brush against if the string does reach the user verbatim).

  - F2 accepted — `zip-size-guard.ts`'s `decompressBounded` now reports a genuine stream error as
    `'decompress-failed'`, distinct from `'archive-too-large'` (which is left to mean only a real
    size overflow, from the `data` handler's own ceiling check). `docx-comments.ts`/`xlsx-
    comments.ts` map `'decompress-failed'` to their own existing corrupt-archive codes
    (`'invalid-docx'`/`'invalid-xlsx'`) at every call site that touches it — including the
    narrow-check propagation sites in `xlsx-comments.ts` (`resolveXlsxThreadTarget`,
    `resolveWorksheetForSelector`) that used to treat anything other than `'archive-too-large'` as
    "part missing." The renderer's `describeError` gained an explicit `'archive-too-large'` case
    (previously it silently fell through to the generic default) since the code is now guaranteed
    accurate. New tests: `zip-size-guard.test.ts` (a fake stream's `'error'` event → `'decompress-
    failed'`), `docx-comments.test.ts`/`xlsx-comments.test.ts` (a REAL corrupted zip entry, built by
    a new `buildCorruptedEntryZip`/`corruptLocalFileData` fixture helper, → `'invalid-docx'`/
    `'invalid-xlsx'`, never `'archive-too-large'`).

- F3 — `desktop/src/renderer/components/comments/CommentsMargin.tsx:25-29` (and
  `ReadingHighlights.tsx`'s twin) — the file's own comment argues comment lists are exempt from
  `renderer-lists.md`'s chunked-reveal + 1,000-item stress-pin requirement because "comment
  counts here are small (a handful per file)". That's a judgment call, not a proven bound: one of
  this branch's own test fixtures (`elden-ring-completionist-checklist.xlsx`) carries roughly 150
  threaded comments, and nothing in the diff pins render cost at that count (no stress test for
  `CommentsMargin`/`ReadingHighlights` was found under `desktop/tests/` — searched for a
  `dom-size-sweep`/`stress` reference against these two components specifically). Per comment,
  `useQuoteMarks` attaches its own `mouseenter`/`mouseleave`/`click` DOM listeners to every mark
  segment (`use-quote-marks.ts` via `CommentsMargin.tsx:244-259`), and `useAnchorTops` mounts a
  `ResizeObserver` per render of the margin. At tens to ~150 comments this is very unlikely to be
  a real problem (these are one-time listener attachments per anchoring pass, not per-frame or
  per-keystroke work — none of the seven numbered performance.md rules are violated as written),
  so this is reported as a low-confidence, low-severity observation rather than a defect: the
  exemption from `renderer-lists.md` is plausible but unverified at the top end of this feature's
  own real-world fixture data, not something I could confirm was wrong.

  - F3 accepted — measured, not fixed: the review's own "roughly 150" estimate undercounted the
    elden-ring fixture (710 comments total; its busiest single sheet, Boss List, alone has 315).
    New stress tests (`CommentsMargin.test.tsx`, `ReadingHighlights.test.tsx`, describe block
    "render cost at a realistic high comment count") mount the real components against that
    315-comment real sheet (~0.5s CPU) and a synthetic 1,000-comment document
    (renderer-lists.md's own literal stress-pin bar, ~1.6s CPU, both measured in jsdom, slower
    than a real browser). Both are one-time per-file-open/re-anchor costs, not per-frame or
    per-keystroke, so renderer-lists.md's chunked-reveal treatment doesn't apply — no
    virtualization added. `CommentsMargin.tsx`'s header comment was rewritten to record the
    measured bound instead of the "handful per file" guess, with a note to re-measure if a real
    file ever needs materially more than ~1,000 comments.

## Not covered

Budget did not reach: the full internal parsing/writing bodies of `docx-comments.ts` (1,709
lines) and `xlsx-comments.ts` (1,988 lines) beyond their write-orchestration/verify functions,
zip-part XML shape handling, and the threaded-vs-legacy-Notes dispatch header (spot-checked, not
exhaustively read); `doc-comments-anchor.ts`'s `resolveSelector`/`resolveCellSelector` algorithm
internals; the full 1,021-line body of `claude-code-doc-comments-mcp.ts` beyond its header and
the permission-gate reasoning (its polling loop, JSON-RPC framing, and its hand-copied constants'
byte-for-byte agreement with the shared TS files were not independently re-verified beyond
trusting the repo's own `claude-code-doc-comments-mcp.test.ts` pin, which `verify.sh` ran green);
`ReadingHighlights.tsx`, `HighlightHoverCard.tsx`, `NewCommentPopover.tsx`, `ReplyField.tsx`,
`CodeCommentsRail.tsx`, `use-code-comment-anchors.ts`, `CommentCard.tsx` (read only where cited
above); `xml-text-safety.ts`, `native-format.ts`; the "Ask about this" chip / summary-chip
integration touching `CommandDrawer.tsx`, `InputBar.tsx`, `MarkdownContent.tsx`, `UserMessage.tsx`,
`SessionCardDetails.tsx`, `SessionDrawer.tsx`, `use-ref-source-highlight.ts`,
`use-container-narrow.ts`; the fixture-generation scripts under `tests/fixtures/doc-comments/`;
`permission-engine.test.ts`/`specialist-child-permissions.test.ts`'s new cases (read the
production code they cover, not the test bodies themselves in full). Everything under
`youcoded/app/` was left to the other reviewer as instructed.

What I *did* verify in depth: the full cross-module permission-split chain for the "ask only for
Word/Excel, never for reading or plain-text" decision (`rulesForMode` in
`shared/permission-types.ts`, `decidePermission` in `harness-session.ts`/`permission-engine.ts`,
`doc-comments-tools.ts`'s `permissionSubject`/`nativeSubjectFor`, `permission-auto-approve.ts`'s
`shouldAutoApproveDocComment`, and `main.ts`'s hook wiring) — this is correctly and completely
implemented end to end, including the CLI-MCP path's separate mechanism (Claude Code's own live
`permission_mode` read off the hook payload). Also verified in depth: the pending-mutation
queue's token-based authorization boundary (`pending-mutation-queue.ts` vs.
`shared/doc-comments-types.ts`'s `PendingMutationRequest`), the watcher/gate cross-module wiring
(`doc-comments-watcher.ts`, `doc-comments-gate.ts`, `doc-comments-dispatch.ts`,
`resolveWatchTarget`'s native-vs-sidecar/document-vs-project split), the write pipeline's
atomic-replace/fsync/rollback contract (`write-pipeline.ts`), the renderer's optimistic-id
reconciliation race handling in `doc-comments-store.ts` (`persistNewComment`'s
`alreadyLanded`/`dedupeById` handling of a `docComments:changed` push racing an in-flight
`add()`), the IPC/remote-server five-surface parity for the six `docComments:*` channels, and the
`ipc-channels.test.ts`/`main-blocking-calls.allowlist.json` additions. No bugs were found in any
of these; the branch's own inline "review finding" comments already document and fix a large
number of issues a fresh reviewer would otherwise raise (project-root authorization, token
authentication, symlink disguise, cold-start races, backup location/durability, DoS-bounding on
zip parsing).

## Summary

0 Blocker/Critical, 0 Major, 1 Minor/Medium (confirmed) finding, 2 PLAUSIBLE/Low observations.
This is an unusually well-engineered and heavily self-reviewed branch — most of the classes this
brief asks a fresh reviewer to hunt for (broken project-root authorization, token/auth gaps,
permission-split mistakes, IPC/remote parity gaps, main-process blocking calls, render-cost
regressions) were already found and fixed by the implementing session's own prior adversarial
review rounds, and I independently re-traced rather than took on faith the ones most likely to
hide a cross-module bug (the permission split, the pending-mutation-queue's auth boundary, the
watcher wiring, the write pipeline). The one confirmed finding (F1) is a missed optimization, not
a correctness or security bug.
