---
status: active
date: 2026-09-26
contract: docs/active/design/2026-09-24-doc-comments/doc-comments.contract.json (21 rows, signed)
handoff: docs/active/handoffs/2026-09-24-doc-comments-START-HERE.md
related: docs/roadmap/files.md → "Document comments"
changelog:
  - 2026-09-27: revised after review round 2 of the xlsx threaded-comments redesign
    (docs/active/reviews/2026-09-27-doc-comments-xlsx-threaded-design-review-2.md) — 4 findings, all
    accepted and fixed (see the review's own per-finding "Triage:" lines for the reasoning behind
    each). **F1 (High) — the biggest gap round 1 didn't touch:** `docComments:changed` structurally
    never fired for a `.docx`/`.xlsx` mutation from ANY source (this app's own write, the assistant's
    MCP pending-mutation queue, or a colleague's live edit), because the existing chokidar watcher
    only covers `.youcoded/comments/`, which a native-format file never touches — an open Word/Excel
    comments pane silently went stale until its next remount. Fixed with ONE mechanism covering all
    three sources: `doc-comments-store.ts`'s existing `watch`/`unwatch` entry points gain a branch
    that additionally registers a refcounted, single-file chokidar watcher on the target document
    itself (paused/torn down exactly when the existing per-file `docComments:watch` subscription
    already is — no renderer change needed), firing the SAME `docComments:changed` push on settle
    regardless of who wrote the bytes (§1.5). Separately, `reply`'s IPC response is enriched to
    return the real persisted `CommentReply` (its ordinal id can't be pre-computed by the renderer,
    unlike a brand-new comment's own id) — `resolve`/`reopen`/`move` deliberately keep `{ok:true}`,
    reasoned explicitly why (§1.6). §7 now specifies the exact reconcile rule (a `clientId`-keyed
    in-flight set; a push always replaces the whole array, never a field-by-field patch) so an
    optimistic reply is never duplicated or lost across a race between its own response and a push.
    §9.2 spells out the EXACT contract T9b/T20 (being built concurrently with this revision) must
    follow: no change to their own request/result JSON shape, and no explicit broadcast call needed
    from their applier code at all — the new watcher fires automatically off their existing
    write-pipeline-backed write, provided they never bypass it. **F2 (Medium):** the composite id's
    own parse algorithm (`xt-{sheetId}-{cell}-{GUID}`, whose GUID segment itself contains hyphens —
    the id's own delimiter character) was never specified; a naive `split('-')` silently truncates
    the GUID and fails every mutation. Fixed: parse from the left on exactly the first two hyphens,
    pre-written regex (`^xt-(\d+)-([^-]+)-(.+)$`), plus a new shared test-vector fixture
    (`shared-fixtures/doc-comments/id-parse-test-vectors.json`) both TS (T12/T13) and Kotlin
    (T18/T19) read directly, so the two runtimes can't silently diverge (§4.2). **F3 (Medium):** the
    id-resolution algorithm's full-workbook fallback scan never said what happens on more than one
    match (two roots sharing one GUID — unverified either way whether real Excel's own worksheet-
    duplication feature can produce this, per §4.1's own admission). Fixed: refuses a distinct
    `'ambiguous-comment-id'`, never silently acting on scan order (§4.2, §4.3, §4.3a). **F4 (High):**
    the `<legacyDrawing>`-always-last-even-after-`<extLst>` worksheet element-ordering rule — found
    and fixed once already for the now-retired legacy-Notes design, and still present as a code
    comment in the currently-built writer — was never restated anywhere in this rewrite's own §4.2/
    §4.3 text, and neither real reference fixture has a worksheet-level `<extLst>` to force a
    regression here to surface during ordinary testing. Restated explicitly in §4.3 step 1 and
    §4.3a, with a required synthetic (not real-fixture-sourced) worksheet-with-`<extLst>` pinning
    test shared between T12/T13 and T18/T19.
  - 2026-09-27: revised after review 1 of the xlsx threaded-comments redesign
    (docs/active/reviews/2026-09-27-doc-comments-xlsx-threaded-design-review-1.md) — 12 findings,
    11 accepted and fixed here, 1 informational/already-handled (see the review's own per-finding
    "Triage:" lines for the reasoning behind each). **F1 (High, the one correctness-risk finding):**
    the app-level thread id was a positional ordinal (`xt-{sheetId}-{cell}-{n}`, `n` by ascending
    `dT` among that cell's CURRENT roots) that only this app's own writes were shown to keep stable
    — a foreign edit (a colleague, in real Excel, editing a shared multi-thread cell between two of
    this app's own calls) could silently reshuffle which real thread an already-issued id names,
    misdirecting a reply/resolve/move at the wrong colleague's comment with no error. Fixed: the id
    now embeds the thread's own real GUID (`xt-{sheetId}-{cell}-{GUID}`), resolved by a hinted-`ref`
    lookup first, then a full-workbook fallback scan, then `'comment-not-found'` — never positional
    guessing (§4.2, §4.3, §4.3a). **F2 (Medium): three "confirmed directly against real files"
    claims in §4.2 did not survive independent re-verification** — the `N`-numbering claim ("only
    sheets 1 and 5 have comments") was based on inspecting 2 of 9 commented sheets and both the
    original claim and a natural "1:1 to sheet position" correction are wrong; the real rule is `N`
    incrementing sequentially among only the commented sheets, skipping gaps (re-verified against
    every sheet's own `.rels`, corrected in §4.2 AND in the app repo's own
    `xlsx-threaded-reference/manifest.json`, which carried the same error); the `elden` `B19` cell's
    reply/root count ("8-reply, 5-root, 9-message") was arithmetically self-contradictory and wrong
    — the real count, re-verified directly, is 4 replies + 5 roots = 9 (corrected in §4.2 and the
    same manifest.json); and `mc:Ignorable="xr"` is NOT confirmed present in both fixtures'
    `<comments>` roots — only `docling` (Mac Excel) has it, `elden` (Google Sheets) omits it and
    Excel tolerates the omission (corrected in §4.2; this specific claim was design-doc-only, not
    in the fixture manifest). **F3-F6, F8-F11 (Medium/Low, design gaps, all accepted as proposed or
    with the review's own reasoning adopted):** an explicit record-count ceiling alongside the
    existing byte ceiling (F3); the decompression-bomb guard narrows to the named parts this module
    now actually opens, matching docx's own model, since exceljs's black-box decompression is gone
    from xlsx entirely (F4); appending a placeholder `<v:shape>` into an EXISTING `vmlDrawing{N}.vml`
    reuses the legacy writer's own `nextVmlShapeId` scan-max+1 rule, named explicitly rather than
    silently inherited (F5); a brand-new `comments{N}.xml` gets `xmlns:xr`/`mc:Ignorable="xr"` (the
    Mac-Excel convention) on creation (F6); Strict OOXML is named as an accepted, out-of-scope gap
    (F8); deletion/post-hoc-editing of an already-posted reply or thread is stated explicitly as
    deliberately out of scope, cross-referencing §10's existing whole-feature statement (F9); no
    Excel-side "detached" state is needed, and why, stated as a reasoned conclusion rather than left
    implicit (F10); T21's full write-sequence parity test names `elden-ring-completionist-
    checklist.xlsx` explicitly as its target, adopting the reviewer's own "more surface area to
    accidentally re-serialize" reasoning (F11). **F7 (Medium, UI gap — resolved per Destin's own
    instruction, not a new UX-tester round):** the approved mockup predates the "multiple
    independent threads on one cell" finding, and nothing stated what a cell with several
    independent threads should look like. Resolved without inventing new UI or reopening a review
    round: §4.2 now states this reuses the already-approved card list exactly as it already renders
    several ordinary comments today (the same shape "several comments on one line of a text file"
    already takes) — one corner mark, the same pane, no new interaction — and this specific case
    (the real `elden` fixture's `B19`) is added to the acceptance deck's own checklist so Destin
    confirms it before ship, rather than treated as an open design question here.
  - 2026-09-27: **Excel comments redesigned to be threaded-only** (Destin, chat: "Excel comments use
    ONLY modern threaded comments... never old-style notes as the product format"). §4 (every
    subsection), the T12/T13/T18/T19 task rows, and §9.2/§9.3's xlsx parity guard are rewritten from
    scratch for `xl/threadedComments/threadedCommentN.xml` + `xl/persons/person.xml` + the matching
    legacy `commentsN.xml`/`vmlDrawingN.vml` placeholder Excel itself writes alongside them — the
    exact on-disk shape researched from Microsoft's [MS-XLSX] open spec (part paths, relationship
    types, content types, the full `2018/threadedcomments` XSD) plus two real, redistributable
    sample files (genuinely authored by Excel-365-for-Mac and by Google Sheets' own `.xlsx` export,
    not synthesized), captured under `shared-fixtures/doc-comments/xlsx-threaded-reference/`
    (superseding `xlsx-note-reference/` and the T18 spike doc, both marked superseded in place and
    kept for history, not deleted). The ENTIRE legacy-Notes design the previous §4 specified — the
    `exceljs`-based reader/writer, the "Priya Shah: ..." formatted-transcript note body, the
    `​✓ Resolved`/`​[[yc:resolved]]` marker hack, the `APP_AUTHOR_PREFIX_RE`/`NON_NAME_HEADINGS`
    author-guessing heuristic — is retired outright, not layered under the new format: a real
    `personId`→`displayName` mapping and a real `done` boolean replace every one of those
    workarounds. Old-style Notes already in a file are never read, created, or edited by the
    product (left byte-for-byte untouched) and are **not shown** in the comments pane — a
    deliberate, user-visible narrowing from the immediately-prior built code, which DID surface a
    plain Note and, as an independently-confirmed side effect neither this document nor its build
    caught before now, ALSO surfaced a threaded comment's own garbled legacy-placeholder text as if
    it were a plain note (`exceljs`'s `cell.note` getter cannot tell the two apart). Adding a
    threaded comment to a cell that already carries a Note is refused (`'cell-has-note'`), never
    layered on top of it. The whole-workbook refusal on any threaded-comment presence
    (`xlsx-comments.ts` ~lines 356-393, `checkNoUnsupportedFeatures`/`hasThreadedComments`) is
    REMOVED entirely — threaded comments are now the thing this module reads and writes, not a
    reason to refuse a file. See §4's own header for the full research citation and gaps
    (SheetJS/test_files and Apache POI's own test-data were unreachable from this session;
    same-cell Note-plus-thread coexistence and Excel's own refusal of it were not independently
    confirmed against a live Excel install — both flagged explicitly in §4.1/§4.2, not silently
    assumed).
  - 2026-09-27: revised after T5's own IMPLEMENTATION review (renderer `doc-comments-store.ts`
    rewired onto real IPC, commits 75ef08f63/86aa252b8) — F2: §2.3 said "the renderer sets that
    comment's `status: 'detached'`" with no owner named; T5's own store never computes it (it only
    threads `PersistedComment.status` through, unchanged, exactly as §2.3 already required). §2.3
    corrected to name T14 explicitly: swapping `use-quote-marks.ts` onto `resolveSelector` and
    computing `status` at list/read time is T14's work, not T5's or T6's. T6 ("Text no longer
    found" UI) now depends on T14 as well as T2 — a `status: 'detached'` UI with nothing ever
    setting that field is untestable end-to-end. Batching note (§8) updated to match: T6 can land
    any time after T2 AND T14, not T2 alone.
  - 2026-09-27: revised after T4's own IMPLEMENTATION review (Android docComments IPC parity,
    `SessionService.kt`, commit 9e1735ab6) — 5 findings fixed. F1 (blocker): §1.5's "Kotlin's own
    file-locking" and §9.1 point 3 both claimed Android's plain-text JSON sidecar needed no
    cross-process lock, reasoning Android has no second concurrent process sharing the file — wrong,
    since the Claude Code MCP script (§9.1 point 2, §9.2) runs on Android too, as its own separate
    Termux process, and reads/mutates that SAME sidecar directly. `DocCommentsStore.kt` now goes
    through `com.youcoded.app.artifacts.mutateFileUnderLock` — a new Kotlin port of desktop's
    `cas-write.ts` mkdir-lock primitive (`CasWrite.kt`) — with the in-process Mutex kept only as a fast
    path in front of it; §1.5/§9.1 corrected in place, not just here (the `.docx`/`.xlsx` in-process-
    mutex reasoning is UNCHANGED — that path never lets the MCP script touch the file directly). F2
    (major): `PersistedComment`'s Kotlin `fromJson`/`toJson` rebuilt every record field by field,
    dropping any key they didn't know about; now clone-then-overlay (`overlayJson`), matching desktop's
    own spread-based preservation, at every level the design's shape covers (sidecar file, comment,
    reply, resolve-history entry). F3 (major): `listNativeComments` (`DocCommentsDispatch.kt`) had no
    exception boundary around T16/T18's readers — a corrupt-but-openable `.docx`/`.xlsx` (valid ZIP,
    malformed inner XML) threw straight through `SessionService.handleBridgeMessage`'s un-caught
    `serviceScope.launch`, leaving the request unanswered forever; now catches at the dispatch
    boundary and returns a typed refusal (`read-failed` for I/O/permission, the format's own
    `invalid-*` code otherwise). F4 (major, security): that same no-`projectRoot` native read checked
    only a sensitive-path DENYLIST, unlike desktop's own two-pass roots-plus-tracked-artifacts
    ALLOWLIST (`authorizeBytesRead`) — switched to `DocCommentsGate.kt`'s new
    `allowUntrackedNativeRead`, the same authority `refuseUnknownProjectRoot` uses (minus live session
    cwds, matching desktop's own narrower `knownRoots()` for this specific check) plus tracked external
    artifacts/manual includes. F6: added `DocCommentsBridge.kt`'s `handleDocCommentsMessage`, extracting
    the docComments:* dispatch out of `SessionService.handleBridgeMessage` so a JVM unit test
    (`DocCommentsBridgeTest.kt`) can assert the real response JSON shape directly, not a regex.
  - 2026-09-26: revised after T11's own IMPLEMENTATION review (docx write, `desktop/src/main/doc-
    comments/docx-comments.ts`, commit 63d49b155) — 5 findings, all fixed in the same pass as T13's
    generic write pipeline (`write-pipeline.ts`) landed, so T11 now runs ON that shared pipeline rather
    than a second copy of it. F1 (blocker): `verifyOoxmlWiring`'s r:id check was scoped to the WHOLE
    document, so a single pre-existing dangling relationship anywhere (common in real Word files; Word
    opens them without complaint) failed every write to that file with
    a misleading verify-failed — scoped to a before/after diff of dangling ids, so only a reference
    THIS write itself broke fails verification (§3.3 step 6). F2 (major): every write re-serialized
    document.xml/[Content_Types].xml/document.xml.rels through linkedom unconditionally, which silently
    rewrites the XML declaration (drops `standalone="yes"`, lowercases `encoding`) and adds a space
    before every self-closing tag's `/>` — even on parts the operation never touched. Each part now
    tracks whether THIS operation actually changed it; an untouched part is written back byte-for-byte
    verbatim, and a changed part gets its original declaration restored and the added space stripped.
    F3 (major): splitting a run for a new comment range only cloned its `w:rPr` child, dropping every
    attribute Word stamps on `<w:r>` itself (rsids) — now copied onto every resulting piece. F4: two of
    Word 2016+'s own extension parts, `word/commentsIds.xml` (w16cid, pairs a comment's paraId with a
    durable id) and `word/commentsExtensible.xml` (w16cex, pairs that durable id with a UTC timestamp),
    now get a matching entry on add/reply when the file ALREADY has them — never created when absent.
    F5: settled §3.3 step 1's own open choice ("next to the source... or under `.youcoded/backups/`,
    decided at task time") — the backup lives at `~/.claude/youcoded-doc-backups/<hash-of-path>
    .docx.bak` (or `.xlsx.bak` for T13's xlsx path, since the fix landed in the shared pipeline), one
    ROLLING backup per file (a hash of the absolute path, not a timestamp, so the next write overwrites
    it rather than accumulating), KEPT after a successful write as a standing safety net rather than
    deleted. See `desktop/src/main/doc-comments/write-pipeline.ts` for the mechanics; both docx and
    xlsx share them.
  - 2026-09-26: revised after review 1 (docs/active/reviews/2026-09-26-doc-comments-design-review-1.md)
    — 17/17 findings accepted. Moved docx/xlsx comment parse+mutate from the renderer into the main
    process (§3.2, §3.3, §4; resolves the F1/F2 renderer-vs-main contradiction with no new binary IPC
    channel); added a path-containment check and pinning tests to the comments store (§1.5, F3); added
    lock-path canonicalization and a true-concurrency test (§1.5/§9, F4); made post-write verify
    failure an automatic rollback, not just a surfaced error (§3.3/§4.3, F5); specified Word comment id
    uniqueness (§3.3, F6); replaced the ambiguous Excel "resolved" text marker with a collision-safe one
    and specified reopen (§4.1, F7); split T9 into T9a/T9b/T9c (§8, F8); specified anchoring's
    occurrence-fallback and tie-break rules and documented the mammoth-render-stability risk (§2.2, F9);
    corrected the Android watch-channel response shape and REJECT_ON_NOT_OK registration (§1.6, F10);
    brought the compose-ref draft-token layer into T7's scope (§6.2, F11); made the new wire marker
    PTY-safe (no literal whitespace) with an end-to-end submission test (§6.2, F12); reworded the "no
    history" claim (§1.1, F13); spelled out full file paths and which repo each rule lives in (F14);
    committed to the exceljs author fallback without a task-time hedge (§4.1, F15); tightened T14's
    dependency notation (§8, F16); added an automated OOXML relationship sanity check to T11's verify
    step (§3.3, F17). New, explicit scope decision made while resolving F1: Word/Excel comment
    reading AND mutation is desktop-only for this build (Android answers `not-implemented-on-mobile`
    for `.docx`/`.xlsx`, same precedent as Git); plain-text/markdown comments remain fully real on
    Android as already designed. This is a technical scope call, not a change to any signed contract
    row — flagged to Destin for awareness, not blocking.
  - 2026-09-26: revised for reopen-1 (full phone support). Destin reopened R7 via
    `docs/active/design/2026-09-24-doc-comments/doc-comments.reopen-1.json`/`.answers.json` and picked
    "Full support on the phone": read, add, reply and resolve Word/Excel comments work the same on
    Android as on desktop. This **supersedes the desktop-only scope decision the previous revision
    made while resolving F1** (§3.2, §4.3, §1.6, §9, §10, §0/R7) — that decision is no longer in
    effect for `.docx`/`.xlsx` mutation; it still stands for `docComments:watch`/`:unwatch` (a
    separate, file-type-independent gap: Android has no `FileObserver`-based watch for anything).
    Android gets a real Kotlin implementation using `java.util.zip` (read+rewrite the archive, same
    load-mutate-rewrite shape JSZip already uses on desktop — Android has no in-place zip editor
    either) plus the platform's built-in `javax.xml.parsers`/`javax.xml.transform` DOM API (a
    `DOMParser`/`XMLSerializer`-equivalent already on every Android device, no new Gradle dependency),
    living in Kotlin/`SessionService.kt`-owned code rather than the WebView's JS — the same "not
    scoped to an open tab" reasoning that moved this logic out of the renderer on desktop (F1) applies
    here too, since Android's assistant path (the MCP script, §9) and a backgrounded PTY session must
    be able to mutate a comment with no WebView attached or foregrounded. New tasks T16-T21 (§8) cover
    Android docx read/write, xlsx read/write, the Android half of the MCP pending-mutation queue, and
    the golden-fixture parity test proving desktop and Android produce/read equivalent
    `comments.xml`/`commentsExtended.xml`/xlsx-note output.
  - 2026-09-26: revised after review 2 (docs/active/reviews/2026-09-26-doc-comments-design-review-2.md)
    — 18/21 findings accepted, 2 already handled (F19: PR #263/branch cleanup already done — T15
    marked no-op; F21: a bucket of spot-checked non-findings, no change needed), 1 (F8, the
    permission-gate default for the six new comment tools) accepted-as-a-real-gap but its SPECIFIC
    default is flagged for Destin's decision rather than picked silently, since either resolution
    changes what he experiences from what he approved (§5.2a). Fixes: corrected the path-containment
    algorithm to realpath the FULL joined path, not just the project root — the round-1 fix had
    mirrored git-service.ts's shallower check instead of write-authorization.ts's deeper one, leaving
    a symlink-inside-the-project escape (§1.5, F1); corrected the lock-path canonicalization to
    realpath the project root only and join the relative suffix, since realpathing a not-yet-existing
    leaf sidecar falls through to the raw path on ENOENT on exactly a file's first comment — the case
    the concurrency test is built to catch (§1.5/§9.1, F3); added a fourth, pathless compose-ref
    grammar form for kind:'chat' references so shipped chat-message/code-block "Ask about this"
    doesn't break (§6.2, F2); added an escape rule for an embedded quote mark and a
    structural-separator character inside a real quote/path (§6.2, F7); named all four of the xlsx
    OOXML surface's actually-hand-rolled pieces — two relationship entries, the non-"+xml" vml
    content type, and the legacyDrawing-after-extLst ordering constraint, not just "four pieces"
    (§4.3a, F4); reworded T21/§9.3 to state precisely that the cross-platform parity test proves both
    sides match a shared golden fixture, not a live round trip, and added a staleness self-check
    (§9.3/T21, F5); split the "no unprompted nudge" claim — Android's gap is real, but remote-server.ts
    already has a working chokidar-backed relay for exactly this and gets one for docComments too
    (§1.6/T3, F6); specified renderer-minted comment ids and an explicit rollback-to-UI contract for a
    mutation that fails after being shown optimistically (§7, F9); routed the jszip/XML-library
    dependency promotion through the workspace's safe path, not a bare npm install inside a
    hardlinked worktree (T10, F10); added a per-task-worktree sentence to §8's batching guidance
    (§8, F11); corrected the T9a/chatsearch.js citation to cover only the atomic-write mechanics —
    the mutual-exclusion half is novel, not ported (§9.1, T9a, F12); replaced the unsupported
    "~3s, matching other native tool timeouts" citation with a benchmarked, explicitly-set value and
    a non-default (500ms) chokidar stabilityThreshold for the comments watcher specifically (§1.5,
    §9.2, T9b/T20, F13); unified the anchoring tie-break/out-of-range rules into one edit-distance
    scoring function, since stated separately they could produce an ill-posed combination (§2.2, F14);
    noted that T17/T19's release-R8 build already rides the existing android-ci.yml job for free
    (T17/T19, F15); added a documented, watched file-size guard for Android's load-whole-archive
    approach (§3.2a/§4.3a, F16); extended F9c's "documented, watched risk" framing to the
    xlsx-note-reference capture, plus a re-diff-on-drift check (§4.3a, F17); corrected §2.3's tool
    citation to ReadFileComments, the one tool that actually exists (§2.3, F18); marked T15 done/no-op
    — PR #263 is closed and the three rejected mock branches/worktrees are already gone (§8, F19);
    excluded the pending-mutation queue's .pending/ subdirectory from chokidar's watch (§1.5, F20);
    F21 needed no design change. Self-consistency pass: every task-table row, §0's coverage table, and
    the changelog above were re-read together to confirm no fix left a dangling cross-reference.
  - 2026-09-26: revised after review 3 (final) (docs/active/reviews/2026-09-26-doc-comments-design-review-3.md)
    — 2/2 findings accepted (both blockers; round 3 is feature-flow's capped final round). Added a
    required, containment-checked `path` field to `reply`/`resolve`/`reopen`/`move`'s IPC payloads
    (§1.6), native-tool and MCP `inputSchema`s (§5, §5.3), and task rows/pinning tests (T1/T3/T4/T8/
    T9a/T9b/T20) — confirmed against the mock renderer store that an id-only lookup only worked there
    because the mock keeps every file's comments in one flat array, which the real one-sidecar-per-file
    store does not; every real caller already has the path in hand, so this was the simplest buildable
    fix over a maintained id-to-path index (§1.6, F1). Specified `MoveComment`'s write algorithm for
    both native formats — a sixth step in §3.3 for Word (remove/reinsert the `w:commentRangeStart`/
    `End` range by `w:id`, reusing the same id/`paraId`, refusing on an unresolvable `newSelector`) and
    a new repoint step in §4.3/§4.3a for Excel (read-clear-reset a Note's body across cells, citing
    exceljs's own `cDst._comment = undefined` precedent for clearing one) — and added it to T11/T13/
    T16/T17/T18/T19's scope and pinning tests, plus a move case to T21's cross-platform parity guard,
    since add/reply/resolve alone would leave Move's absence or cross-platform disagreement undetected
    (§3.3, §4.3, §4.3a, §8, §9.3, F2). §5.2a (the six comment tools' own permission gate) remains an
    open decision for Destin, unchanged by either fix — neither finding depended on its outcome. This
    design is now complete apart from that one decision.
  - 2026-09-26: revised after T10/T12's own implementation review (6/6 findings fixed in the built
    code, `desktop/src/main/doc-comments/{docx,xlsx}-comments.ts`). **§4.1's resolve marker changed
    again (F4 — major):** the `​[[yc:resolved]]` bracketed token this document specified above reads
    as literal garbage code to anyone opening the file in real Excel or Google Sheets, which R8/R9
    promise stays human-legible. Replaced with a leading zero-width space followed by plain readable
    text, `​✓ Resolved`, recognized only as the note body's exact LAST LINE (never a bare
    trailing-substring match, so a real reply that happens to end with the same visible words but no
    leading ZWSP is never misread as the marker); the original bracketed token is still READ for
    backward compatibility (never written again), so a file an earlier build already resolved doesn't
    silently flip back open. `xlsx-comments.ts` names the current marker `RESOLVED_MARKER` — the
    constant T13's write path should import rather than re-derive, once T13 exists. Also fixed in the
    same review, not requiring a design change beyond what's captured here: xlsx's `includeEmpty:
    false` skipped a comment on a styled, value-less cell (F1 — now `true`, §4.2's "every worksheet's
    cells" now means every cell, not every cell with a value); no decompression-bomb guard existed on
    either reader before decompressing/loading an archive (F2 — a shared
    `desktop/src/main/doc-comments/zip-size-guard.ts` now refuses a zip entry whose CENTRAL DIRECTORY
    metadata declares an implausible uncompressed size, checked BEFORE any entry is decompressed —
    docx checks its three named parts, xlsx pre-scans the whole archive with JSZip before handing the
    bytes to exceljs); docx's recursive DOM walk had no depth guard, and a document nested thousands of
    levels deep (cheap in bytes — nesting costs ~20 bytes/level — so NOT bounded by F2's byte ceiling)
    could overflow the call stack (F3 — `walkDocument` is now iterative, with an explicit heap-backed
    stack, so depth has no ceiling to hit; F2's size ceiling is what bounds the walk's total
    synchronous work instead); xlsx's "Name: text" split misread a foreign note whose text merely
    contained a colon, and silently DROPPED a colon-free foreign note's text entirely (F5 — a leading
    "Name:" is now recognized as this app's own author convention only when it matches a precise
    Title-Case-words pattern; anything else keeps the whole paragraph as the comment body with a
    neutral, nameless author, never dropped); docx had no fixture exercising a comment range split
    across multiple runs and two paragraphs (F6 — added, confirms the exact quote captures the
    paragraph-break newline correctly).
  - 2026-09-26: revised after T7's own implementation review (3 findings fixed in the built code,
    `desktop/src/renderer/components/context-menu/compose-ref.ts`). **§6.2's escaping rule was
    itself incomplete (F1 — high):** review 2's F7 fix only escaped a quote's own `"`, and located a
    quote's closing mark as the LAST `"` followed by a trailing token — but a path may legally
    contain its own `"` (Linux/macOS), so a path like `evil"_hijacked.md` could hijack decoding into
    the wrong quote AND the wrong file. Fixed by escaping a path's own `"`/`\` the same way a
    quote's `"` already was, AND by locating the closing quote as the FIRST unescaped match, not the
    last (either fix alone would have closed this specific case; both together make every path
    character structurally inert). **F2 (medium):** the path/suffix split (`splitPathSuffix`) matched
    `_L<n>-<n>`/`_cell_<C>` against the end of the RAW remainder, so an extension-less path that
    itself ends in that shape (`notes/draft_L2-3`, `x_cell_A1`) was misread as a real suffix and the
    path was truncated. Fixed by also escaping a path's own `_` and splitting left-to-right for the
    first UNESCAPED `_` instead of pattern-matching the string's end. **F3 (high — a signed
    behaviour, confirmed against deck S-7):** the sent Ask Your Assistant summary chip stopped
    highlighting anything on hover and stopped opening the comments panel on click, since both used
    to key off `commentIds`, which the wire form (§6.2) never carries by design. Fixed without adding
    ids to the wire text: `use-ref-source-highlight.ts` and `ReadingHighlights.tsx` recognize a
    decoded summary chip by its shape and recover "every currently open comment on this path" from
    the live comments store instead. §6.2 revised above to describe the corrected escaping rule and
    the F3 fix; no signed contract row changed.
  - 2026-09-26: revised after a review of T3's own built code (finding F1 — blocker, security). The
    `list`/`add`/`reply`/`resolve`/`reopen`/`move`/`watch`/`unwatch` handlers built in
    `desktop/src/main/doc-comments/ipc-handlers.ts` and `desktop/src/main/remote-server.ts` trusted a
    caller-supplied `projectRoot` outright: §1.5's containment check only proves `path` resolves
    INSIDE whatever root it is given, never that the root itself is one the app recognizes, so a
    `projectRoot` of `/` or `$HOME` made containment a no-op — every channel could create/mutate a
    sidecar anywhere on disk, and a `.docx`/`.xlsx` `list` could make the main process read and parse
    any such file on the machine, bypassing `read-binary-access.ts`'s guard entirely. Separately, the
    no-`projectRoot` fallback in `resolveSourceFilePath` (§1.1/§3.2/§4.1's dispatch) resolved and
    returned any absolute path with no containment at all. §1.5 now specifies two gates, both
    implemented in the built code rather than requiring a design change to the shapes above: (1) a new
    shared module, `desktop/src/main/doc-comments/doc-comments-gate.ts` (`refuseUnknownProjectRoot`),
    checked before every one of the eight channels above touches the store — reusing the SAME
    `isKnownRoot()` authority (`desktop/src/main/artifacts/read-service.ts`) git's `knownGitRoot`/
    `gitGate` and `remote-server.ts`'s own `isKnownRoot`/`refuseUnknownRoot` already gate on, so a
    live session's own (possibly unregistered) cwd still counts, matching `useActiveProject.ts`'s
    synthetic-project fallback (§1.4) — refusing an unrecognized root with a typed
    `unknown-project-root` error instead of a silent no-op containment check; (2) the no-`projectRoot`
    fallback path that reads actual `.docx`/`.xlsx` bytes (`doc-comments-dispatch.ts`'s
    `listNativeComments`) now runs the resolved absolute path through `authorizeBytesRead`
    (`read-service.ts`) — the SAME authority the artifacts binary viewers already use — refusing with
    `path-not-tracked` for anything that isn't a saved folder, an indexed project, or a tracked
    external artifact; the JSON-sidecar-only fallback (`locateFallback`, §1.4, used by every OTHER
    file type's plain comment storage) is unchanged, since it never exposes a source file's content.
    Both gates are single, shared functions reused identically by desktop IPC and the remote WS
    surface, so a future native tool (T8) or the MCP script's own reimplementation (T9a) has one
    place to import/mirror rather than a fourth independently-invented allowlist. No signed contract
    row changed; `desktop/tests/doc-comments-gate.test.ts` (new), and additions to
    `doc-comments-dispatch.test.ts`, `doc-comments-ipc-handlers.test.ts` and
    `doc-comments-remote-relay.test.ts`, pin both gates on desktop and remote, including a forged root
    ('/', an unregistered temp directory), the untracked-fallback-path case, and that a legitimate
    (session-cwd or in-project) `projectRoot` keeps working.
---

# Document comments — build-stage technical design

The UI is finished and approved (mockup on `session/comments-mock-a`). This document is the
design for making it real: persistence, re-anchoring, Word/Excel two-way sync, and the
assistant's tools. Per `.claude/rules/feature-flow.md` ("the build stage is reviewed, capped,
recorded"), this design goes through reviewer rounds next, then the task breakdown in §8 is
what subagents actually build from.

**Repo boundary (review 1, F14):** every plain file-path citation below (`desktop/...`, `app/...`)
resolves inside the `youcoded` app repo. Every `.claude/rules/*.md`/`docs/*.md` citation resolves
inside the `youcoded-dev` workspace repo, one level up — a subagent working only inside a `youcoded`
worktree needs to look at its parent workspace checkout for those.

No app code is changed by this document.

## 0. Contract coverage

Every row in `doc-comments.contract.json` maps to a section below or is UI-already-done (the
approved mockup already satisfies it; the build's job is to feed it real data, not change it).

| Row | Statement (short) | Covered by |
|---|---|---|
| R1 | Word/Excel keep native comments; others → hidden project folder | §1 |
| R2 | Assistant replies where you left a comment | §5 |
| R3 | Assistant resolves/reopens | §5 |
| R4 | Assistant's own comments are sparse, never narration | §5 (tool description text) |
| R5 | Assistant edits the file via existing edit tools/approval | §5 (explicitly: no new mechanism) |
| R6 | After a fix: reply, resolve, and/or repoint — nothing silently lost | §2, §5, §3.3 (Word move), §4.3/§4.3a (Excel move) — review 3, F2 |
| R7 | Phone: tap opens the comment sheet | UI-already-done (`CommentsMargin.tsx`, review R-9) — needs only real data (§1, §7, §3.2a, §4.3a). **Reopen-1 (Destin, `doc-comments.reopen-1.answers.json`, "full-phone"): the phone gets the SAME Word/Excel comment operations as desktop — read, add, reply, resolve — not just read-only tap-to-view. This supersedes the "desktop-only" scope note the review-1 revision of this document added while resolving F1 (§3.2, §4.3, §1.6, §9, §10); that note no longer applies to `.docx`/`.xlsx` mutation.** |
| R8 | Spreadsheet comments live in the cell, in the file | §4 |
| R9 | Word comments two-way with Word/Google Docs | §3 |
| R10 | A commented .docx keeps its comments in Google Docs | §3.5 |
| R11 | PR #263 closed | §8, T15 (process, not a design row) |
| R12 | Highlight → hover card → panel | UI-already-done (`ReadingHighlights.tsx`, `HighlightHoverCard.tsx`) |
| R13 | Selection/right-click menu; Add comment box | UI-already-done (`desktop/src/renderer/components/context-menu/build-menu.ts`, `NewCommentPopover.tsx`) |
| R14 | Show Resolved position; panel close X | UI-already-done (`CommentsPaneFrame.tsx`, review R-3) |
| R15 | Ask about this chip hover/click, incl. after sending | UI-already-done to render; wire format is §6 |
| R16 | One summary chip, not one per comment | UI-already-done (`CommentsFloatingActions.tsx`, review R-5) |
| R17 | Word/Excel share the panel; colleague names; cell corner mark | UI-already-done to render; real data from §3, §4 |
| R18 | Code files: same panel, chips light lines | UI-already-done (`CodeCommentsRail.tsx`, `ref-line-highlight.ts`) |
| R19 | Projects screen: Comments header button | UI-already-done |
| R20 | Projects → Ask Your Assistant opens new-chat dialog w/ project+model | **UI-already-done** (youcoded `488df318c`): FilesTab raises `youcoded:ask-in-new-session`, App opens PageCreateDialog in the file's project with the request in the composer. Build only needs the message format (§6) to flow through `initialInput`. |
| R21 | Rejected mock branches/worktrees deleted | §8, T15 (process, ask Destin first per handoff) |

## 1. Storage + history

### 1.1 Data shape (Web Annotation-flavored)

Today's mock record (`desktop/src/renderer/state/doc-comments-store.ts:33-60`, `DocComment`) is
renderer memory with a flat `quote` string (substring match, whitespace-insensitive —
`use-quote-marks.ts:82-100`'s `findQuote`), and already has `replies: CommentReply[]` and a single
`resolvedBy`/`resolvedAt` pair — what it does NOT have is a resolve/reopen **audit trail** beyond
that latest state (review 1, F13). The real record separates the
**selector** (how to re-find the anchor) from the **body** (what was said), and gives every
comment/reply a durable id shaped for a future account:

```ts
// desktop/src/shared/doc-comments-types.ts (new — shared by main, renderer, and the
// dependency-free MCP script's hand-copied constants; see §9 on why this file is the
// single source of truth three different runtimes must agree with byte-for-byte)
export type CommentAuthor = 'user' | 'assistant' | `person:${string}`;

export interface TextQuoteSelector {
  type: 'TextQuoteSelector';       // W3C Web Annotation Data Model §4.2.3
  exact: string;                   // the quoted text itself
  prefix: string;                  // ~32 chars before, whitespace-collapsed
  suffix: string;                  // ~32 chars after, whitespace-collapsed
  occurrence: number;              // 0-indexed: which match of `exact` in the document
                                    // this was, at creation time — disambiguates a repeated
                                    // phrase without needing character offsets that a later
                                    // edit would invalidate anyway
}

export interface CellSelector {
  type: 'CellSelector';
  cell: string;                    // "C4"
  sheet?: string;                  // sheet tab name; absent = the workbook's only sheet
}

export type CommentSelector =
  | { kind: 'text'; selector: TextQuoteSelector; lineHint?: [number, number] }
  | { kind: 'cell'; selector: CellSelector };

export interface CommentReply {
  id: string;                      // `${commentId}-r${n}`, account-ready (see 1.2)
  author: CommentAuthor;
  text: string;
  createdAt: number;
}

export interface ResolveEvent {
  by: CommentAuthor;
  at: number;
  action: 'resolved' | 'reopened';
}

export interface PersistedComment {
  id: string;
  path: string;                    // project-relative (or absolute, for the fallback store — §1.4)
  selector: CommentSelector;
  text: string;
  author: CommentAuthor;
  createdAt: number;
  replies: CommentReply[];
  resolved: boolean;
  history: ResolveEvent[];         // full resolve/reopen AUDIT TRAIL — the mock only has one
                                    // resolvedBy/resolvedAt pair (doc-comments-store.ts:57-59);
                                    // R6 needs the assistant's decisions to be legible after
                                    // the fact, not just the latest state
  /** Set by the anchoring pass (§2) at READ time, never persisted: whether `selector`
   *  currently resolves against the file on disk. Kept out of the stored record so two
   *  writers racing on `resolved`/`text` never also race on a derived field. */
  status?: 'anchored' | 'detached';
}
```

`TextQuoteSelector` is deliberately the exact shape `use-quote-marks.ts`'s own comment
(lines 78-80) already promises: *"the real build stores prefix/suffix context (Web
Annotation's TextQuoteSelector) so a repeated phrase lands on the right occurrence."* `occurrence`
is added on top of the spec's own fields because prefix/suffix alone still ties on a phrase that
repeats with identical surrounding text (rare, but cheap to rule out).

Word and Excel files do **not** get a `PersistedComment` row for their native comments — those
live inside the file (§3, §4) and are read/written in the file's own format. A `PersistedComment`
only exists for every other file type (markdown, code, plain text — anything `MarkdownView`/a
raw-text viewer renders).

### 1.2 Account-ready ids

No accounts or document sharing exist yet (handoff survey: "No per-user document storage and no
document sharing exist or are planned"). "Account-ready" here means: an id is a value nothing
else already had reason to be, so attaching an account id to it later is additive, not a
migration.

- Comment/reply ids: `c-${randomUUID()}` / `${commentId}-r${n}` — never a counter (the mock's
  `nextId()`, `doc-comments-store.ts:62-66`, is a `let idCounter` reset every reload — fine for a
  session-only mock, not for a record synced or shared later).
- `CommentAuthor` stays `'user' | 'assistant' | person:<name>` for now. When accounts land, `'user'`
  becomes a stand-in for "the signed-in account" and `person:<name>` gains an optional account id
  field — additive, no rewrite of existing records, because nothing about the shape above assumes
  a single-user file.

### 1.3 Where it lives, and why not the artifacts sidecar

The handoff's survey already rejected `.youcoded/artifacts.json`: one file per **project**,
rewritten on every tool call, the documented 2026-08-27 OOM source (up to 477 concurrent parses of
a 6.4MB file — `artifact-store.ts:36-65`), and excluded from sync. `ArtifactRecord` does reserve a
`comments: unknown[]` field (`desktop/src/shared/artifacts/types.ts:52-63`) — a candidate that was
considered and is explicitly **not** used, for the same reason: it would put comment writes back on
the same giant per-project file and its `casWrite`/`appendVersion` contention, for a feature that
now needs a write on essentially every reply.

Instead: **one JSON file per commented source file**, mirroring the source's relative path, under
a new hidden folder:

```
<project root>/.youcoded/comments/<relative/path/to/file.md>.json
```

e.g. `docs/active/plans/2026-09-24-onboarding-redesign.md` →
`.youcoded/comments/docs/active/plans/2026-09-24-onboarding-redesign.md.json`. This keeps every
write scoped to the one file whose comments actually changed (no cross-file contention, no
whole-project rewrite), reuses the `.youcoded/` convention the artifacts sidecar already
established (gitignored per-project — `desktop/src/main/artifacts/project-manager.ts`'s own
`.gitignore` write — and already in `desktop/src/main/sync-spaces/guards.ts`'s `DEFAULT_IGNORES` at
`'.youcoded/'`), and makes "what happens if the source file moves" the same already-solved class of
problem `useMissingArtifacts.ts` handles for artifacts (§1.5).

**Path containment (review 1, F3):** unlike the artifacts sidecar's `.youcoded/artifacts.json` (a
fixed literal suffix, never attacker-influenced), the `path` this join uses comes straight from an
IPC payload, a native tool call's arguments, or the MCP script's tool arguments — the last two are
model-controlled input. `.claude/rules/harness-tools.md` (`youcoded-dev` workspace repo) is explicit
that "the file-tool guards (secret paths, cwd jail) are honest friction, NOT a sandbox" — a new tool
surface must implement its own containment check, it inherits none. §1.5 below now specifies one,
mirroring `desktop/src/main/artifacts/write-authorization.ts`'s `judgeRelativeRecord()` (realpath,
then reject anything outside the vouching root) and `desktop/src/main/git/git-service.ts`'s
`locate()` (realpath the root, `path.relative`, reject `..`/absolute results).

File contents: `{ version: 1, comments: PersistedComment[] }`. `version` exists from day one so a
future schema change (e.g., adding account ids) can migrate on read instead of needing a
flag day.

### 1.4 Files outside any project

There is no "walk up from a file to find its project" function in this codebase — every existing
containment check (`desktop/src/main/git/git-service.ts`'s `locate()`,
`desktop/src/main/artifacts/write-authorization.ts`'s `judgeRelativeRecord()`) takes an
already-known `projectRoot` and tests a path against it;
`useActiveProject.ts` falls back to a synthetic `{id:'', name:'project', path: cwd}` when no
registry entry matches, rather than searching upward. The comments service follows the same
shape: it is handed the file's resolved project root (or none) by the caller, never discovers one
by walking directories.

**Fallback, for a file with no project root** (opened standalone, or before `workspace-start`
registers its directory): a global, per-machine store —

```
~/.youcoded/loose-file-comments/<sha256(absolute path)>.json
```

— explicitly local-only (matches `~/.youcoded/permission-modes.json`'s own "per machine, never
synced" precedent) and, like `.youcoded/comments/`, orphaned if the file's absolute path changes.
That's an accepted, documented limitation: the same class of loss the "detached" state (§2)
already has to handle at the text-span level, just at the whole-file level here. No migration path
from the fallback store to a project-scoped one is built now — if a loose file's directory later
becomes a project, its comments simply stay in the fallback store until someone notices and files
it (a roadmap item, not a build blocker).

### 1.5 Main-process service: reads, writes, watching

New module `desktop/src/main/doc-comments/doc-comments-store.ts`, following the shape of
`artifact-store.ts` and `pages-service.ts`, not `page-fetch.ts`'s per-call pattern:

- **`projectRoot` itself must be a root the app recognizes (T3 build review, F1 — blocker,
  security).** Every containment check below (and §1.6's IPC surface) proves `path` resolves INSIDE
  whatever `projectRoot` it is given — it never proves `projectRoot` ITSELF is real. Until this fix,
  it wasn't: a caller naming `projectRoot: '/'` or `$HOME` made every containment check below a
  no-op (`path.resolve('/', anything)` always lands "inside" `/`), so any `docComments:*` channel
  could create/mutate a sidecar anywhere on disk, and a `.docx`/`.xlsx` `list` could read and parse
  any such file on the machine — bypassing `read-binary-access.ts`'s guard entirely, the same guard
  the artifacts binary viewers already enforce for exactly this class of read. The fix is a shared
  gate, `desktop/src/main/doc-comments/doc-comments-gate.ts`'s `refuseUnknownProjectRoot` — reusing
  `isKnownRoot()` (`artifacts/read-service.ts`), the SAME authority git's `knownGitRoot`/`gitGate`
  (`ipc-handlers.ts`) and `remote-server.ts`'s own `isKnownRoot`/`refuseUnknownRoot` already gate on
  — called by `doc-comments/ipc-handlers.ts` and `remote-server.ts` on EVERY one of the eight
  channels (`list`/`add`/`reply`/`resolve`/`reopen`/`move`/`watch`/`unwatch`) before either surface
  touches this store, refusing a typed `unknown-project-root` for an unrecognized root. A live
  session's own cwd counts too (the caller passes it as an extra allowed root), matching
  `useActiveProject.ts`'s synthetic-project fallback (§1.4) — otherwise a file opened via an
  unregistered session's drawer would start refusing, not just close a hole. This module
  (`doc-comments-store.ts`) deliberately stays unaware of the gate: it is intentionally
  Electron-adjacent-but-pure fs/path logic, unit-tested with arbitrary temp directories as
  `projectRoot`, and trusts its caller to have already vetted the root — exactly the layering gap
  the gate closes at the real entry points. Separately, the NO-`projectRoot` fallback that reads
  actual `.docx`/`.xlsx` bytes (`doc-comments-dispatch.ts`'s `listNativeComments`, §3.2/§4.1) now
  runs the resolved absolute path through `authorizeBytesRead` (`read-service.ts`) before reading it,
  refusing `path-not-tracked` for anything that isn't a saved folder, an indexed project, or a
  tracked external artifact — the JSON-sidecar-only fallback below (`locateFallback`, used by every
  OTHER file type) is unchanged, since it never exposes a source file's content, only a hash of its
  path.
- **Path containment (review 1, F3; corrected in review 2, F1 — blocker):** every entry point
  (`list`/`add`/`reply`/`resolve`/`reopen`/`move`) resolves `path` to a sidecar location using the
  STRONGER of this design's own two cited precedents. **This claim is only true once §1.6's `path`
  field exists on `reply`/`resolve`/`reopen`/`move` (review 3, F1 — blocker): those four channels had
  no `path` in their payload until that fix, so there was nothing here for a subagent to containment-
  check at those four surfaces.** With §1.6's fix in place, the same containment test now applies
  uniformly to all six entry points, not just `list`/`add`. Round 1's fix mirrored `git-service.ts`'s
  `locate()` — realpaths only `projectRoot`, then joins the unresolved relative path with no further
  realpath (`git-service.ts:55-56`, confirmed) — which review 2 (F1) caught as the WEAKER of the two
  precedents this design itself cites: `write-authorization.ts`'s `judgeRelativeRecord()` realpaths
  the FULL joined path (`write-authorization.ts:108`), exactly because a symlink inside the project
  root (a `notes.md` → `~/.ssh/config`) would dodge a root-only check while the actual read/write
  follows the symlink to an arbitrary target. **Corrected algorithm**: `realProject =
  fs.promises.realpath(projectRoot)`, `abs = path.resolve(realProject, path)`, then realpath `abs`
  ITSELF (`fs.promises.realpath(abs)`) and test THAT resolved path against `realProject` — not the
  unresolved `abs`. For a path that doesn't exist yet (an `AddComment` creating a brand-new sidecar,
  or the first comment on a file), walk up to the nearest existing ancestor directory, realpath THAT,
  and join the remaining unresolved suffix back on before the same containment test — mirroring how
  `write-authorization.ts` handles a not-yet-existing file, except that it fails closed on ENOENT
  (`write-authorization.ts:109-110`, confirmed) rather than falling through to the raw path (see F3's
  own fix below for why "fall through on ENOENT" is unsafe specifically for a lock path). A `path`
  that fails this check is **refused** (a typed error the caller surfaces honestly), never silently
  clamped into the root. Every one of T1's new unit tests includes a `../../etc/passwd`-shaped, an
  absolute-path, AND a symlink-inside-the-project case (review 2, F1), and T3/T8/T9a each add the
  same shape of test at their own surface (IPC payload, native tool args, MCP tool args) since all
  three are reachable by model-controlled input, not just the renderer.
- **Read**: `mutateFileUnderLock`-free plain read for `list(path)` — a GET has nothing to lock.
  Missing file → `{ version: 1, comments: [] }`, never an error (a file with zero comments is the
  overwhelmingly common case).
- **Write** (add / reply / resolve / reopen / move): every mutation goes through
  `mutateFileUnderLock(sidecarPath, (onDisk) => …)` (`desktop/src/main/artifacts/cas-write.ts:165-185`)
  — read-current, apply one mutation, return the new JSON string. This is read-modify-write under
  an `fs.mkdir`-based lock with atomic tmp-then-rename (`cas-write.ts:133-150`), the same primitive
  already trusted for cross-process safety between a dev instance and the built app sharing
  `~/.claude/`/`~/YouCoded/` (PITFALLS.md → "Shared state"). No new locking primitive is invented.
  **Lock-path canonicalization (review 1, F4; corrected in review 2, F3 — major):** `cas-write.ts`'s
  own `mutateFileUnderLock`/`casWrite` derive the lock path as `target + '.lock'` with no `realpath`
  first (`cas-write.ts:170,227`) — fine for `cas-write.ts`'s existing single-process-family callers,
  but this feature adds a SECOND, independent implementation of the same algorithm (§9's MCP script)
  that must exclude the first one. Round 1's fix said to canonicalize "the target file's absolute
  path (`fs.realpath`, falling through to the raw path on ENOENT for a file that doesn't exist
  yet)" — review 2 (F3) found this reopens the exact trap it closes, on precisely the case its own
  concurrency test is built to exercise: a sidecar's FIRST-EVER write (the single most common case —
  the very first comment on a file) has no file to realpath yet, `fs.promises.realpath` throws ENOENT
  on the non-existent leaf, and BOTH racing writers fall through to the raw, non-canonical path,
  silently reopening the alias trap for first-writes specifically. (This also contradicted its own
  cited precedent: `write-authorization.ts:109-110` FAILS CLOSED on ENOENT rather than falling
  through.) **Corrected algorithm**: canonicalize the PROJECT ROOT only (`fs.promises.realpath(
  projectRoot)` — this always exists, since it's an open project) and join the relative sidecar
  suffix (`.youcoded/comments/<relative>.json`) onto the already-canonical root before appending
  `.lock` — never realpath the possibly-nonexistent leaf sidecar path itself. Both `sidecarPath`
  derivations (main's real one, the MCP script's reimplementation) do this identically, not just
  before comparing paths for containment above, a separate step, because a symlinked project
  directory or a case-difference between how Electron resolves `projectRoot` and how a Claude Code
  CLI session's cwd is set would otherwise let the two lock schemes silently stop excluding each
  other (the exact alias trap `git-service.ts:44-54` documents for a different subsystem). The
  pinning test for this is a TRUE concurrency test — both writers racing to create the SAME sidecar
  for the first time, asserting no write is lost — not just the sequential round-trip §9 already
  lists.
- **Non-blocking** (performance.md rule 1): every fs call is the `fs.promises`/async form; no
  `*Sync`, no whole-file synchronous parse on a path an IPC call or click reaches. `main-blocking-calls.test.ts`'s
  allowlist gets no new entry — that test failing on this module is a real defect, not
  something to permit.
- **Watching**: chokidar on `.youcoded/comments/` per open project (same library `pages-service.ts`
  already depends on — no new dependency), with `ignored: '**/.pending/**'` (review 2, F20 — the MCP
  pending-mutation queue's request/result files, §9.2, live inside this SAME watched tree; without
  this exclusion every assistant mutation's create-then-delete cycle fires a needless
  `docComments:changed` broadcast that costs a pointless re-`list()` in every open comments pane, the
  kind of per-event chattiness `performance.md` rule 4 flags). `awaitWriteFinish` avoids reading a
  half-written file, with its `stabilityThreshold` **explicitly set to 500ms, not chokidar's own
  2000ms default** (review 2, F13 — the default alone would already consume most of the
  pending-mutation queue's response-time budget before any docx/xlsx work starts; see §9.2), plus its
  own ~300ms debounce (matches `git-watcher.ts`'s `DEBOUNCE_MS`) before dispatching a change. This is
  what lets a comment the assistant just added over the MCP path (§5, §9 — a separate process writing
  the same file) show up in an already-open comments pane without the user doing anything — **for a
  `PersistedComment` (plain-text/markdown) target.** It does nothing for a `.docx`/`.xlsx` target,
  since those never touch `.youcoded/comments/` at all (§1.1, §9.1) — see the new bullet below
  (design review round 2, F1).

- **A second, narrower watcher for a `.docx`/`.xlsx` target's OWN file — the fix for design review
  round 2's F1 (High).** Checked directly against the built code before specifying this: the design's
  own quoted payoff for the bullet above ("lets a comment the assistant just added... show up in an
  already-open comments pane without the user doing anything") is true only for the JSON sidecar —
  nothing watches the actual `.docx`/`.xlsx` bytes, so an open Word/Excel comments pane never learns
  about a resolve, reply, or move from ANY source other than its own next `list()`: not the
  assistant's background action (native tool OR the MCP pending-mutation queue, T9b/T20), and not a
  colleague's live edit in real Excel/Word. Fixed the same way the design already fixes an analogous
  gap elsewhere, not by inventing a new mechanism: `doc-comments-store.ts` exposes ITS `watch(path,
  projectRoot)`/`unwatch(path, projectRoot)` — the SAME two functions `ipc-handlers.ts` and
  `remote-server.ts`'s own relay (§1.6) already call identically for every file type, so this needs
  no separate implementation in either caller — with a new branch: when the RESOLVED target (by
  extension) is `.docx`/`.xlsx`, ALSO register (refcounted by absolute path, the same "one underlying
  watcher, many subscribers" shape `project-watcher.ts`'s own refcounting already establishes for
  `artifacts:watch-project`) a chokidar instance watching that ONE document's own absolute path — not
  a directory, a single file — and `unwatch` decrements the SAME refcount. `awaitWriteFinish` applies
  here too, starting from the SAME 500ms `stabilityThreshold`/~300ms-debounce numbers as the sidecar
  watcher above (a starting point, not a frozen constant, per this design's own convention elsewhere
  — an external Excel/Word save can be slower and multi-step compared to a small JSON write, so this
  specific number may need its own task-time benchmark once a real save is measured). **This one
  mechanism covers all three sources F1 named, uniformly, with no source-specific code**: this app's
  own direct IPC-driven write, the assistant's MCP-pending-mutation-queue-applied write (T9b/T20 —
  see §9.2's own contract note), and an external application's save all end in the SAME observable
  event (the document's bytes settling on disk after an atomic rename or a normal save), which this
  watcher reacts to identically regardless of who or what wrote them. On settle, it fires the
  SAME `docComments:changed` push (`{path}`) the sidecar watcher already fires — no new push message
  type, no renderer-side branch by file type. **Lifecycle, already correct, no renderer change
  needed:** `doc-comments-store.ts` (renderer, `desktop/src/renderer/state/`) already calls `watch`/
  `unwatch` uniformly for every file type, tied to "one subscription per key for as long as the file
  is open" and already respects `performance.md` rule 2's "hidden means idle" (confirmed directly,
  `doc-comments-store.ts:422,498,510,516,930,938`) — this fix is entirely main-process-side.
- **Broadcast scope**: comments are file/project-scoped, not session-scoped, so there is no
  `sendForSession`-style single owner the way transcript events have one. Follow `pages:changed`'s
  pattern instead — broadcast to every `webContents` plus `remoteServer?.broadcast` (performance.md
  rule 4 is satisfied because the coalescing happens at the chokidar debounce, not by fanning out
  per-keystroke; a window that isn't showing that file/project ignores the push cheaply — same as
  every other broadcast consumer in the app already does).

### 1.6 IPC surface

New channels, named `docComments:*`, added to **all five surfaces** the ipc-bridge rule requires
(`preload.ts`, `ipc-handlers.ts`, `remote-shim.ts`, `remote-server.ts`, `SessionService.kt`) and to
`ipc-channels.test.ts`'s channel map:

| Channel | Direction | Payload (shape) | Android |
|---|---|---|---|
| `docComments:list` | request/response | `{path, projectRoot?}` → `PersistedComment[]` | real (Kotlin file read) |
| `docComments:add` | request/response | `{path, selector, text, author}` → new id | real |
| `docComments:reply` | request/response | `{path, id, text, author}` → the persisted `CommentReply` (design review round 2, F1 — see below) | real |
| `docComments:resolve` | request/response | `{path, id, by}` — response stays `{ok:true}` (see below) | real |
| `docComments:reopen` | request/response | `{path, id, by}` — response stays `{ok:true}` (see below) | real |
| `docComments:move` | request/response | `{path, id, newSelector}` — the re-anchor/repoint tool (§2, §5); response stays `{ok:true}` (see below) | real |
| `docComments:watch` / `:unwatch` | subscribe | `{path, projectRoot?}` | `{ok:false, error:'not-implemented-on-mobile'}` via an explicit Kotlin branch — the SAME shape `SessionService.kt`'s real `artifacts:watch-project`/`artifacts:unwatch-project` branch already returns (`SessionService.kt:4077-4080`; **not** `{unsupported:true}` — review 1, F10 — that shape is `MessageRouter.buildUnsupportedResponse`'s no-branch-at-all catch-all, a different mechanism per `.claude/rules/ipc-bridge.md`) |
| `docComments:changed` | push | `{path}` (client re-lists; no diff payload, same reasoning `pages:changed` uses) | n/a (no watch) |

**`path` on `reply`/`resolve`/`reopen`/`move`, added (review 3, F1 — blocker):** the storage model
(§1.3) is one sidecar file per commented source file, so resolving a `commentId` to the sidecar that
holds it requires knowing the file — and until this fix, none of these four payloads carried one, so
§1.5's own claim that "every entry point... resolves `path`" was aspirational, not built. The fix
takes the simplest buildable option over a maintained `commentId → path` index: every real caller
already has the path when it acts — the renderer's own open file, or the assistant's prior
`ReadFileComments`/`list()` result, whose `PersistedComment.path` field already carries it — so a
required field costs a caller nothing it doesn't already have, while an index would be a second,
separately-synchronized piece of state for three runtimes to agree on for no offsetting benefit.
`path` on these four channels is **containment-checked identically to `add`'s own `path`** (§1.5's
realpath-the-full-joined-path algorithm) — it is model-controlled input at the tool/MCP surfaces
exactly the way `add`'s already was, so it needs the same refusal, not a lighter check because it's
"just a lookup." T1/T3/T4's pinning tests add a case that exercises `reply`/`resolve`/`reopen`/`move`
against a comment whose sidecar was never previously `list()`-ed in the acting process — the case
that most concretely breaks without this fix (§9's MCP script is a fresh process per session with no
warm cache).

**Only `reply`'s response needs enriching, not all four (design review round 2, F1) — reasoned
explicitly, not applied blanket:** for a `.docx`/`.xlsx` target, a NEW reply's real, persisted id
(`{rootId}-r{n}` for docx, the same ordinal-suffix shape for xlsx — §3.3/§4.3) is computed by the
main-process write path from the file's OWN current state at write time (`n` = the reply's position
among the thread's existing messages) — the renderer cannot pre-compute it the way it safely
pre-mints a brand-new comment's own id (review 2's own F9 id-authority fix, still unchanged: ADD's
response already returns "→ new id," covering that case). `reply`'s response is therefore enriched
to return the full persisted `CommentReply` (id, author, text, `createdAt`) so the renderer's own
optimistic entry — today minted as a purely local, never-corrected `r-${nextLocalSuffix()}` (checked
directly, `desktop/src/renderer/state/doc-comments-store.ts:742-746`) — gets replaced with the real
one in place, immediately, without waiting for any push. **`resolve`/`reopen`/`move` do NOT need the
same enrichment**, and this is a reasoned omission, not an oversight: `resolve`/`reopen` only flip a
boolean the renderer already set optimistically to the exact value that succeeds (there is no new id
or field the renderer couldn't already have guessed correctly), and `move`'s new composite id is
fully self-computable by the renderer already — same `sheetId` and GUID segments, only the `cell`
segment changes to `newSelector`'s own cell, which the caller already supplied. What actually fixes
`resolve`/`reopen`/`move` for a change made by someone OTHER than the calling pane (the concrete
failure case in F1's own scenario) is the new per-document watcher above, not a richer response —
a response only ever tells the CALLER what its OWN call did.

**Reopen-1 supersedes this subsection's earlier desktop-only scope call** (Destin, "full-phone"
support, `doc-comments.reopen-1.answers.json`). Android's
`docComments:list/add/reply/resolve/reopen/move` are **real Kotlin implementations for every
target type**, not stubs, and not restricted to plain text: for a plain-text/markdown
`PersistedComment` target this is `java.io.File` read/write, exactly the precedent
`artifacts:get/save/read-binary` already set (SessionService.kt); for a `.docx`/`.xlsx` target it is
the new Kotlin zip+XML implementation §3.2a/§4.3a specify. Word/Excel comment reading and mutation
is **no longer desktop-only** — the `not-implemented-on-mobile` answer that the review-1 revision of
this document gave for `.docx`/`.xlsx` (citing the Git precedent) is retired for those six channels;
it never applied to `docComments:watch`/`:unwatch`, which stays refused for an unrelated,
file-type-independent reason. **Watching** is the one piece that still follows Git's "absent, not
reimplemented" precedent, for EVERY file type: Android has no `FileObserver`-based watch today
(`artifacts:watch-project` already answers not-implemented-on-mobile), and building one is out of
scope here — this is a general Android platform gap, not a Word/Excel-specific one, so reopen-1's
"full phone support" answer (about reading/adding/replying/resolving comments) doesn't touch it.
Practically: the comments pane re-`list()`s on mount and after every local mutation; on **Android**
that's the whole story — `docComments:watch` refuses honestly rather than pretending to subscribe.
**Remote is a different case, corrected in review 2 (F6 — major):** `remote-server.ts:3768-3796`'s
`artifacts:watch-project`/`:unwatch-project` are already a real, refcounted, chokidar-backed relay
(`project-watcher.ts` calls chokidar directly) from a project's file changes to a WS-connected remote
browser — the exact same "watch a project's files" shape this feature needs, already built and
shipped for the adjacent Files/artifacts feature. An earlier draft of this subsection conflated
Android's real gap with remote, wrongly implying remote also gets no push. `docComments:watch`/
`:unwatch` get the same relay treatment in `remote-server.ts` (T3's scope): a remote browser's
comments pane DOES get an unprompted push when something changes elsewhere, exactly as it already
does for artifacts. Only Android is the accepted, honestly-refused gap — a general `FileObserver`
absence, not a Word/Excel-specific or remote-specific one.

Unlike `artifacts:watch-project` (whose caller today tolerates `{ok:false}` itself and is therefore
not currently in `remote-shim.ts`'s `REJECT_ON_NOT_OK` set), `docComments:watch`/`:unwatch` are new
channels with no existing caller convention to match, so T3/T4 explicitly add both to
`REJECT_ON_NOT_OK`: a failed watch must reject to the caller's catch, never resolve as an ordinary
value a comments pane could misread as "subscribed, no changes yet" (review 1, F10).

**Kotlin's own file-locking (corrected 2026-09-27 after T4's own IMPLEMENTATION review — F1,
blocker):** this originally said Android doesn't share `~/.claude/` with a second concurrent
YouCoded process the way desktop's dev-instance-plus-built-app does, so the plain-text
`PersistedComment` JSON sidecar's write path could use a plain in-process mutex plus a
temp-then-rename instead of porting the mkdir-lock protocol. **That was wrong for the plain JSON
sidecar specifically**: the Claude Code MCP script (T9a, §9.1 point 2) reads and mutates that exact
same sidecar file DIRECTLY, as its own separate Termux `node` process, with zero shared runtime with
the Kotlin app — an in-process mutex does nothing to exclude a process outside the JVM that holds it.
Kotlin's JSON sidecar writer (`DocCommentsStore.kt`) now goes through
`com.youcoded.app.artifacts.mutateFileUnderLock` — the SAME cross-process mkdir-based lock protocol
desktop's `cas-write.ts` uses (identical lock path naming, identical 30s stale-lock timeout) — with
the in-process mutex kept only as a fast, allocation-free path in front of it for the common case of
zero cross-process contention. This makes the JSON sidecar story genuinely **three** implementations
that must exclude each other by the SAME on-disk protocol (§9.1), not two-with-Android-exempted.
**The `.docx`/`.xlsx` reasoning below is UNCHANGED and still correct**: unlike the JSON sidecar, the
MCP script never touches a `.docx`/`.xlsx` file directly — it goes through the pending-mutation queue
(§9.2, T20), whose applier is `SessionService`'s own polling loop running in the SAME process as every
Kotlin-originated write, so ordinary in-process exclusion (the same mutex) genuinely is sufficient
there: the same in-process mutex serializes a Kotlin-originated write against a
pending-mutation-queue-originated write (§9's Android extension, T20) — Android never needs the
desktop main process's cross-process mkdir-lock for THIS path, only ordinary in-process exclusion.
See §9 for why this is one of several separate implementations of "write this safely" the design
accepts rather than fights.

## 2. Re-anchoring after edits

### 2.1 What exists today

`use-quote-marks.ts`'s `findQuote` (lines 82-100) does whitespace-insensitive, first-occurrence
substring search across the container's text nodes — explicitly marked "Mockup-grade anchoring."
When it returns `null` (text not found), `CommentsMargin.tsx` already tolerates it: comments
without a mark are appended at the end of the list rather than dropped (`CommentsMargin.tsx:265`,
`[...withMark, ...visible.filter((c) => !marks.has(c.id))]`) — there is no UI today that tells the
user WHY that card has no highlight. That gap is exactly the "detached" state R6 requires.

### 2.2 The real anchoring pass

New shared (renderer + main, pure TS/JS, no DOM dependency in the matching logic itself —
only the DOM *wrapping* stays renderer-side) module
`desktop/src/shared/doc-comments-anchor.ts`:

```ts
function resolveSelector(fullText: string, sel: TextQuoteSelector): { start: number; end: number } | 'detached';
```

Algorithm: find every occurrence of `sel.exact` in `fullText` (whitespace-collapsed compare, same
tolerance `findQuote` already has — a selection almost never respects text-node boundaries).
For each candidate occurrence, score it by how much of `sel.prefix`/`sel.suffix` actually matches
around it (exact match preferred; if none match exactly — the surrounding text changed — **prefer
the closest-scoring candidate**, i.e. follow moved text: an edit that shifts the quote's position
but leaves prefix+suffix intact around it resolves at the new position). If `sel.exact` isn't found
in `fullText` at all — literally zero occurrences — return `'detached'`. This one algorithm serves
both the plain-text case (walked by `use-quote-marks.ts`'s existing `findQuote`/`wrapSegments`
machinery, swapped to call `resolveSelector` first for a character range instead of doing its own
substring search) and the assistant's `MoveComment` tool (§5), so the two paths can never disagree
about whether a comment is still anchored.

**One scoring function subsumes both fallback gaps (review 1, F9a/F9b; unified in review 2, F14):**
stated as two separate rules, F9a/F9b can interact in an ill-posed way — if `sel.occurrence` was 3 at
creation time and an edit reduces the document to 2 matches, "where index 3 would place it in the
CURRENT set of matches" (F9b's own wording) has no natural reading, since index 3 doesn't exist in a
2-element set ordinally or otherwise. The fix: define "position" concretely and use ONE metric for
both cases — score every occurrence of `sel.exact` currently in `fullText` by the character offset
that minimizes total edit distance between (`sel.prefix` + `sel.exact` + `sel.suffix`) and the
document text surrounding that candidate. This single scoring function replaces the two
separately-stated rules:
- **`sel.occurrence` out of range** (the quote's 4th match at creation time, but an edit reduced the
  document to 2 matches): never clamp to a fixed index (the last match, index 0) — that produces a
  different, differently-wrong answer depending on which clamp you'd picked. Score every remaining
  occurrence by the metric above and take the best one; only `'detached'` is returned when there are
  zero occurrences to score, never an out-of-range index error.
- **A tie between equally-scoring candidates** (the same edit touched text near two occurrences
  identically): the SAME metric breaks the tie deterministically, since it is one real-valued score,
  not a separate ordinal rule that can conflict with F9a — the lower-edit-distance candidate wins; on
  a genuine exact tie (a literal duplicate edit at two positions), the earlier document position wins,
  a fixed, documented rule rather than array order. T2's tests add a case exercising both conditions
  at once (an out-of-range `occurrence` AND a tie among the remaining candidates).

**A documented, watched risk, not a blocker (review 1, F9c):** `resolveSelector` and prefix/suffix
capture both operate on `DocxView.tsx`'s rendered DOM text — mammoth's docx→HTML output, re-run
fresh on every mount (`DocxView.tsx:40-44`, no version-pinned cache). Mammoth's paragraph/run
segmentation is a heuristic mapping, not guaranteed byte-stable across a mammoth version bump, so a
paragraph split/merge invisible to a human could in principle shift a whitespace-like boundary in a
way the whitespace-collapsed compare doesn't fully absorb, spuriously flipping a genuinely-unedited
comment to `'detached'` (or resolving it to the wrong occurrence). Building a pinning-test fixture
that exercises two different mammoth segmentation states is disproportionate to add now against a
library that isn't being bumped as part of this build; instead, this assumption is recorded here
explicitly and added to `youcoded/docs/cc-dependencies.md`-style dependency-watch tracking (or
`docs/PITFALLS.md` if no more specific home exists) so a future mammoth version bump is a known,
checked risk rather than a silent one.

Cell selectors resolve trivially: does `[data-sheet="…"] [data-cell="…"]` exist in the rendered
grid (unchanged from `cellSelector()`, `use-quote-marks.ts:57-60`) — a cell can go missing only if
a row/column was deleted or the sheet renamed, which is rarer and simpler than text drift, so no
prefix/suffix equivalent is needed there.

### 2.3 The detached state

When `resolveSelector` returns `'detached'` for a comment, the renderer sets that comment's
(derived, unpersisted) `status: 'detached'` and:

**Who actually calls `resolveSelector` and sets this (F2, T5 implementation review, 2026-09-27):**
T14 — "wire real backend into `CommentableDocument`/`DocxView`/`XlsxView`" is where the DOM-aware
re-anchoring pass belongs: swapping `use-quote-marks.ts`'s existing plain-`findQuote` lookup for
`resolveSelector` (so a repeated/moved quote resolves the same way everywhere `resolveSelector` is
already the source of truth — the main process, the MCP script), and computing `status` at
list/read time from that result. T1/T5 (the wire schema and the renderer's own IPC store,
respectively) only ever thread `PersistedComment.status`/`DocComment.status` through unchanged —
neither sets it, by design, since deciding "is this still anchored" needs the live DOM T14 wires in.
Until T14 lands, `status` is always `undefined`, and T6's own UI below has nothing to render against
— T6 depends on T14, not just T2 (§8's task table).

- `CommentCard.tsx` shows a small non-committal line — "Text no longer found in this file." — with
  no invented cause (`docs/error-message-standards.md`'s rule: specific-and-true, or general and
  non-committal; never guess). This is new UI, but it is additive to an already-approved card, not
  a redesign — it fills the gap `CommentsMargin.tsx:265` already leaves for exactly this case.
- The card stays visible and repliable/resolvable (R6: nothing is silently lost) — resolving a
  detached comment is a legitimate way to say "this no longer applies."
- The assistant's `ReadFileComments` tool (§5; corrected review 2, F18 — the design previously named
  two tools, `ReadComments`/`ReadCommentThread`, that don't exist in §5's table) reports
  `status: 'detached'` explicitly, so the assistant can decide whether to reply, resolve, or
  re-anchor (`MoveComment`) rather than silently failing to find the text itself.

## 3. Word (.docx) two-way

### 3.1 Today

`DocxView.tsx` (`desktop/src/renderer/components/artifact-views/DocxView.tsx:11,40-43`) converts
bytes to HTML with `mammoth/mammoth.browser`'s `convertToHtml` — mammoth drops `comments.xml`
entirely; nothing reads or writes Word comments today. `RendererRegistry.ts` marks `docx`/`xlsx` as
the two "commentable binary viewers" (line ~51, `isCommentableBinaryViewer` at 118-124) — the
dispatch point already exists, it just has nothing to feed it real comment data yet.

### 3.2 Reading

Word's own comment model, relevant parts:

- `word/document.xml`: `<w:commentRangeStart w:id="0"/>…text…<w:commentRangeEnd w:id="0"/><w:r><w:commentReference w:id="0"/></w:r>` marks a range.
- `word/comments.xml`: `<w:comment w:id="0" w:author="Priya Shah" w:date="…" w:paraId="…"><w:p>…comment text…</w:p></w:comment>`.
- `word/commentsExtended.xml` (Word 2013+, `w15` namespace): `<w15:commentEx w15:paraId="…" w15:done="1"/>` for resolved, and `w15:paraIdParent="…"` linking a reply's `w:comment` to its parent — this is where reply-threading and resolve status live; a `.docx` may simply not have this part at all (older files, or ones with only top-level un-resolved comments).

**Architecture correction (review 1, F1 — blocker):** an earlier draft of this design put this
module in the renderer, using the browser's native `DOMParser`/`XMLSerializer`. That directly
contradicted §9's own premise that the TS main process is "implementation #1" for JSZip/mammoth/
exceljs-capable work, and independent verification confirmed why that renderer placement cannot
work: `node -e "console.log(typeof DOMParser)"` against this repo's own Node (v26.4.0) prints
`undefined` — Electron's main process is a plain Node context with no DOM. Three real call paths
need this logic reachable from main with no renderer round-trip: T8's native harness tools
(`ReplyToComment`/`ResolveComment`/`MoveComment`/etc. run in-process in
`desktop/src/main/harness/tools/`, and must be able to mutate a Word/Excel comment even when no
renderer window has that file open at all — an assistant tool call is not scoped to an open tab);
T9's MCP pending-mutation queue (§9), whose whole point is that the main-process watcher applies the
mutation; and any UI-driven edit, which reaches main first over `docComments:resolve` etc. regardless
of where the parsing logic lives. Routing an in-process main-side call out to a specific, possibly-
unopened renderer window and back is not a workable architecture for a headless assistant action.

New module `desktop/src/main/doc-comments/docx-comments.ts`, run in **main** (not the renderer).
Parsing/mutation uses a small Node-compatible XML library — `@xmldom/xmldom` (`DOMParser`/
`XMLSerializer`-compatible API, so the algorithm described below barely changes shape from an
originally-renderer-shaped design) or `fast-xml-parser`, whichever T10's spike finds cleanest against
`comments.xml`'s structure — added as a new **direct** dependency of `desktop/package.json` (not
hoisted). This resolves §9's F2 finding too: since the capable code now runs where `fs` already is,
**no new binary IPC channel is needed** — `artifacts:read-binary` still supplies the bytes in, and
main writes the mutated bytes straight to disk itself (§3.3). Reading the doc's own BODY for display
(mammoth's `convertToHtml` in `DocxView.tsx`, unrelated to comments.xml) is untouched by this
change — only comment parsing/mutation moves.

**Android scope — superseded by reopen-1 (full phone support):** the review-1 revision of this
design argued Android needed no Kotlin port ("Android's WebView runs the same bundle"), then, once
F1 moved this logic main-only, reversed to "desktop-only for this build," citing Git's "the app
simply doesn't have on mobile" precedent. **Destin reopened R7 and picked full phone support**
(`doc-comments.reopen-1.answers.json`, "full-phone": *"Read, add, reply and reopen Word and Excel
comments on the phone too... keeps the promise you signed; the phone behaves exactly like
desktop"*). Word/Excel comment reading and mutation is therefore **real on Android**, not
`not-implemented-on-mobile` — §3.2a below is the Kotlin equivalent of this section; §4.3a is Excel's.

### 3.2a Android: a real Kotlin implementation

Why this can be built at all without a large new dependency: unlike Git (a whole external binary
and protocol Android genuinely lacks), the two pieces this module needs — reading/writing a ZIP
container, and parsing/serializing XML — are **already part of every Android device**, no new
Gradle dependency required:

- **ZIP**: `java.util.zip.ZipFile` (random-access read of named entries — `comments.xml`,
  `commentsExtended.xml`, `document.xml`, `document.xml.rels`, `[Content_Types].xml`) and
  `java.util.zip.ZipOutputStream` (write a whole new archive). Neither supports in-place editing —
  which is fine, because JSZip doesn't either: desktop's algorithm already loads the full archive
  into memory, mutates the in-memory representation, and writes the whole thing back out (§3.2/§3.3),
  so Kotlin's load-mutate-rewrite shape needs no new algorithm design, only a new implementation of
  the same one.
- **XML**: `javax.xml.parsers.DocumentBuilderFactory`/`DocumentBuilder` (parses into a standard
  `org.w3c.dom.Document` — the same DOM shape `@xmldom/xmldom` gives desktop's algorithm, per §3.2's
  own note that an `@xmldom/xmldom`-shaped design "barely changes shape from an originally
  renderer-shaped design") and `javax.xml.transform.TransformerFactory`/`Transformer` to serialize
  back to bytes. Both are part of the JDK class library Android ships, not a third-party dependency —
  no `app/build.gradle.kts` change, no APK size cost, no new R8/proguard surface beyond what already
  applies to any DOM-consuming Kotlin code (`docs/android-runtime.md`'s R8 rule is about
  *reflection against app-authored code*; calling into the platform's own `javax.xml`/`org.w3c.dom`
  classes isn't that — `./gradlew :app:assembleReleaseTest` (§8, new task) is still the check that
  confirms it).

**Why Kotlin/`SessionService.kt`, not the WebView's JS** (an alternative considered and rejected,
for the same reason §3.2's F1 correction rejected the desktop renderer): Android's WebView *does*
have a real `DOMParser`, and the same bundle already ships mammoth/exceljs/JSZip for read-only
display (`DocxView.tsx`/`XlsxView.tsx`), so reusing that JS instead of writing new Kotlin was a real
option. It fails the identical test F1 already established: a headless assistant action (the MCP
script, §9 — Android has no "native harness" concept at all; every assistant tool call on Android
goes through the real `claude` CLI plus this app's MCP server, `ClaudeCodeMcp.kt`/
`claude-code-mcp.ts`) must be able to mutate a comment with **no WebView attached or foregrounded** —
a backgrounded PTY session continuing a long-running turn has no live `WebView` to call
`evaluateJavascript` against, and even when one exists, Android can suspend or destroy a
backgrounded `WebView` independently of the Kotlin service keeping the PTY alive. Routing a
same-process Kotlin call out to a WebView instance that might not exist right now and back is not a
more workable architecture on Android than it was on desktop.

New Kotlin files, mirroring the desktop module boundary, under
`app/src/main/kotlin/com/youcoded/app/doccomments/` (new package, alongside the existing
`com.youcoded.app.artifacts`/`com.youcoded.app.config` convention): `DocxComments.kt` (this
section's read + §3.3's write) and `XlsxComments.kt` (§4.3a). Both are called from
`SessionService.kt`'s `docComments:*` `when` branches (§1.6) exactly like `artifacts:read-binary`/
`artifacts:save` already call into `com.youcoded.app.artifacts` helpers, and from the Android half
of the MCP pending-mutation queue (§9, T20).

**The algorithm is pre-written, not re-derived**: `DocxComments.kt`'s read function walks
`comments.xml`/`commentsExtended.xml` exactly as §3.2 above specifies (same fields: author, text,
`w15:done` → `resolved`, `w15:paraIdParent` chains → `replies`, `TextQuoteSelector`'s
exact/prefix/suffix built straight from `document.xml`'s own surrounding text, same as desktop —
neither platform needs mammoth's rendered HTML at this step). `resolveSelector` itself — matching
that selector against the CURRENT rendered document to decide `anchored`/`detached` (§2.2) — needs no
Kotlin port at all: it runs downstream, in the WebView, over the same shared
`doc-comments-anchor.ts` the plain-text path already uses, once the WebView has the raw comment
records back from `docComments:list`. Its write functions mirror §3.3's now-six steps verbatim
(review 3, F2 added the move/repoint step, §3.3 step 5): id uniqueness scanned from the file as it
stands (never assumed monotonic), an 8-hex-digit `w15:paraId` generated the same way, **backup before
write** (a sibling `.docx.bak-<timestamp>`), the same range-relocation algorithm for `MoveComment`,
and **verify after write with automatic rollback** — a
Kotlin `DocumentBuilder` re-parse of the just-written bytes confirming the comment round-trips and
the same `r:id`/content-types relationship sanity check §3.3 step 6 (F17) specifies, renaming the
backup back over the target on any verify failure before surfacing a specific `<ErrorState>`, never
leaving a possibly-corrupted file live. T16/T17 (§8) build these two halves; the same fixtures T10/T11
use (gapped/non-sequential `w:id`s, no-`commentsExtended.xml`-part case) apply unchanged, because the
algorithm — not just the wire format — is shared.

Output: one `PersistedComment`-shaped record per `w:comment` (author from `w:author`, text from
its paragraphs, `resolved` from a matching `commentsExtended.xml` entry's `w15:done`, `replies`
built by following `w15:paraIdParent` chains), with `selector: {kind:'text', selector: {type:
'TextQuoteSelector', exact: <the ranged text>, …}}` computed the same way as any other text
comment — Word's own range becomes the anchor text, matched against mammoth's rendered HTML the
same way `findQuote`/`resolveSelector` matches anything else, so `CommentableDocument` needs no
special case per file type once this parses. Comments with NO matching text (Word range referenced
a run mammoth dropped, e.g. a deleted-but-still-commented run) surface as `detached` (§2.3) rather
than being silently omitted.

**Library**: JSZip is present today only **transitively** (via `mammoth`'s and `exceljs`'s own
`package.json` deps — hoisted to `node_modules/jszip` at `3.10.1`, not declared in
`desktop/package.json`). The fixture generator already imports it directly
(`dev/workbench/fixtures/docs/make.mjs:10`) and works only because npm's flat `node_modules`
happens to hoist it. **Promote `jszip` to a direct dependency** before any product code imports it
— relying on a transitive hoist for shipped code is exactly the kind of drift `desktop/CLAUDE.md`'s
`allowScripts` section warns generally about (a dependency's own dependency tree is not a
contract).

### 3.3 Writing (add / reply / resolve / move)

Same module, mirrored write functions, applied to the **loaded JSZip archive** in memory:

1. **Backup before write** (contract requirement, R9/R10's own threshold language): copy the
   original bytes to `~/.claude/youcoded-doc-backups/<hash-of-the-absolute-path>.docx.bak` before
   touching anything — **decided at implementation time (T11 review, F5)**, settling this step's
   original "next to the source... or under `.youcoded/backups/`" open choice. A sibling path next
   to the source was ruled out: a dotdir INSIDE the user's own project is still inside whatever that
   project's git repo or cloud-sync tool (Dropbox, iCloud) watches, so it fails the "survives the
   write it's protecting against, and isn't itself synced/committed as a stray file" requirement —
   only a location entirely OUTSIDE the project satisfies it. The filename is a hash of the file's own
   absolute path, not a timestamp, so exactly ONE rolling backup exists per file — the next write to
   the same file overwrites the same path — and it is KEPT after a successful write (not deleted) as
   a standing safety net, not just cover for the moment of the write itself; this is still a safety
   net for a corrupted write, never a version history (Word comments already carry their own history,
   §1.1). Implemented once, generically, in `desktop/src/main/doc-comments/write-pipeline.ts`
   (T13's shared pipeline) — §4.3's xlsx path gets the identical behaviour for free.
2. Add a comment: append a new `<w:comment>` to `comments.xml` (creating the part + its
   `[Content_Types].xml` override + the `word/_rels/document.xml.rels` relationship if the file had
   no comments before), and insert `w:commentRangeStart`/`End` + a `w:commentReference` run into
   `document.xml` around the matched text — using `resolveSelector` (§2.2) against the CURRENT
   `document.xml` text to find where, exactly like the read path finds existing ones.
   **Id uniqueness (review 1, F6 — major):** the new `w:id` is `(max existing w:id in comments.xml)
   + 1`, scanned from the file as it stands — never assumed monotonic from creation order, since a
   previously-deleted comment or an id Word itself assigned non-sequentially can leave gaps a naive
   counter would collide with. The paired `w15:paraId` is generated the way Word itself does (an
   8-hex-digit value), not sequential. T11's fixture set includes a `.docx` with gapped/non-sequential
   existing ids to pin this.
3. Reply: append a new `<w:comment>` whose `commentsExtended.xml` entry sets
   `w15:paraIdParent` to the parent's `w15:paraId` (creating `commentsExtended.xml` if absent).
4. Resolve/reopen: set/clear `w15:done` on the matching `commentsExtended.xml` entry (creating the
   part if this is the file's first resolve).
4a. **Word 2016+ extension parts (T11 review, F4), add/reply only:** if the file ALREADY has
   `word/commentsIds.xml` (w16cid — pairs a comment's own `w14:paraId` with a durable id) and/or
   `word/commentsExtensible.xml` (w16cex — pairs that SAME durable id with a UTC creation timestamp),
   a brand-new `<w:comment>` (an add, or a reply — a reply is its own new comment entry) gets a
   matching entry in whichever of the two is present, sharing one freshly-minted durable id between
   them. Neither part is ever CREATED by this module when absent — unlike comments.xml/
   commentsExtended.xml, which this task creates on first use, these two are left alone entirely on a
   file that never had them, since nothing in this feature's own read path (§3.2) or its
   `<ErrorState>` surface needs them to exist.
5. **Move (repoint), new — review 3, F2 (blocker):** relocate an existing comment's anchor without
   touching its authored text, author, replies, or resolve state — the piece the design's earlier
   drafts asserted worked "identically" across formats (§5) but never actually specified for either
   native format. Remove the CURRENT `w:commentRangeStart`/`w:commentRangeEnd` pair and its paired
   `w:commentReference` run from `document.xml`, matched by the existing `w:id` (the range and its
   reference run already share that id, so no separate lookup is needed to find them). Then run
   `resolveSelector` (§2.2) against the CURRENT `document.xml` text using the caller's `newSelector`,
   and insert a fresh `w:commentRangeStart`/`End` pair plus a `w:commentReference` run at the resolved
   position — reusing the SAME `w:id`/`w15:paraId`, never minting fresh ones. Reusing them is what
   keeps `comments.xml`/`commentsExtended.xml` untouched by a move: replies and resolve state are
   keyed off `w15:paraId`, and this operation changes only WHERE the comment points, not what it says,
   who said it, or its resolve history. If `resolveSelector` returns `'detached'` for `newSelector`
   (the caller's replacement quote isn't in the CURRENT text either), the move is refused with a
   specific `<ErrorState>` — the same never-guess rule §2.3 already applies to a comment that can't be
   found — rather than silently leaving the old range removed with no new one inserted, which would
   turn a move into an accidental delete (exactly the "nothing silently lost" failure R6 exists to
   prevent). T11's fixture set adds a case exercising a move whose `newSelector` resolves and one
   whose `newSelector` doesn't, so both outcomes are pinned.
6. **Verify after write, with automatic rollback (review 1, F5 — major):** re-open the just-written
   bytes with the SAME read path (§3.2) before reporting success. If the re-parse doesn't find the
   comment that was just added/changed — for a move, this means confirming the comment resolves at
   its NEW position and that no duplicate range is left at the old one — OR a minimal
   relationship/content-types sanity check fails
   (review 1, F17 — minor: every `r:id` the new run references in `document.xml` resolves in
   `word/_rels/document.xml.rels`, and every part referenced has a `[Content_Types].xml` override —
   catching a class of "opens in Word, silently drops in Google Docs" bug automatically, ahead of
   the manual R10 check rather than only caught by it), the write is treated as failed and **the
   backup is renamed back over the target path before the error surfaces** — never just left
   alongside a possibly-corrupted live file for the user to notice and manually restore. The document
   the user has open is always either the successfully-mutated version or byte-identical to what it
   was before, never a half-written third state. Surface a specific `<ErrorState>` per
   `docs/error-message-standards.md` ("the write didn't take — your file wasn't changed" + Retry),
   not a generic failure. Actually opening the result in real Word/Google Docs is still a manual
   dev-instance check (§8, T11's test list), not something CI can do — this step only closes the
   automatable half.

### 3.4 A comment that traveled from Word

The mockup's seed data already role-plays this (`seed-docx-priya-goal` etc., `doc-comments-store.ts:184-240`,
author `person:Priya Shah`) — a colleague's Word comment reads as an ordinary thread, repliable and
resolvable from YouCoded, and a reply made here must round-trip back into `comments.xml` with
`w:author` naming **the account's display name or "You"**, never overwriting Priya's original
`w:author`.

### 3.5 Google Docs compatibility (R10)

No new code — R10 is a property of writing spec-conformant OOXML (§3.3's parts, correctly
cross-referenced), which Google Docs' own .docx importer already reads. The build's job is to
verify it, not implement anything extra: after T11 lands, a manual step (dev instance, not CI)
uploads a comment-bearing `.docx` this app wrote to Google Drive and confirms the comments survive
import. If they don't, the fix is to the OOXML parts §3.3 writes (most likely a missing
`[Content_Types].xml` override or relationship), not new product surface.

## 4. Excel (.xlsx) two-way

### 4.1 The format, and why legacy Notes are retired as the write target

**Decided (Destin, 2026-09-27, chat): Excel comments use ONLY Excel 365's modern "threaded
comments"** — never old-style Notes as the product's write format. This retires everything this
section previously specified for legacy Notes (the `exceljs`-based reader/writer, the "Priya
Shah: ..." formatted-transcript note body, and the resolve-marker hack below) outright, not as an
alternative sitting alongside the new design — the superseded text is kept only in the changelog
above, for history.

**exceljs still has no support for this format** (confirmed against `desktop/node_modules/
exceljs@4.4.0`: `cell.note` only ever gets/sets a legacy Note; there is no threaded-comment API of
any kind) — the same "no library help, hand-roll the OOXML" position §4.3's own 2026-09-27 rewrite
already reached for legacy Notes' WRITE path, now extended to the READ side too, because exceljs's
`cell.note` getter cannot distinguish a genuine Note from a threaded comment's own legacy-
compatibility placeholder (§4.2) — it reads the placeholder's text as if it were an ordinary Note.
**This is a real, independently-confirmed defect in the currently-built T12/T13, not something this
redesign invents:** a workbook containing ONLY a threaded comment (no genuine Note at all) shows
TODAY, in the already-built code, as a garbled "[Threaded comment]... Your version of Excel..."
pseudo-comment, misattributed to `person:Unknown` (the existing "Name:" heuristic never matches
that sentence). This redesign's read/write module moves entirely from `exceljs` to the same
hand-rolled JSZip + `linkedom` DOM approach `docx-comments.ts` already uses and the current xlsx
WRITE path already adopted in its own 2026-09-27 rewrite (§4.3) — extended now to the READ side as
well. `exceljs` remains a direct dependency for `XlsxView.tsx`'s own read-only cell-VALUE display,
completely untouched by this change.

**Old-style Notes already in a file are never read, created, or edited by this feature.** Every
write this section describes touches only the parts a threaded-comment mutation needs (the same
"never re-serialize an untouched part" discipline §4.3's surgical writer already established for
legacy Notes) — a genuine Note elsewhere in the same file round-trips byte-for-byte, untouched, no
matter how many threaded-comment writes happen around it. **Recommended, and built this way: Notes
are not shown** in the comments pane. Two reasons: the product has no write path for them any more,
so a Note card in the list would be a dead end with no reply/resolve/move affordance every other
card in the same list has; and showing them at all risks exactly the garbled-placeholder confusion
above resurfacing in a different form if a future change ever reintroduces Note-body parsing. A
workbook mixing real Notes and threaded comments on DIFFERENT cells is common and unremarkable —
confirmed directly in a real Excel-365-for-Mac sample (`docling-xlsx-comments.xlsx`,
`shared-fixtures/doc-comments/xlsx-threaded-reference/`): cells A1/B2 carry genuine Notes, F7/G12
carry threaded comments, all four inside the very same `xl/comments1.xml`. Reading simply skips any
legacy `<comment>` whose author does not match the `tc={GUID}` pattern (§4.2 — the marker that
means "this placeholder fronts for a real thread") and shows nothing for it.

**Whether the SAME cell can carry both a Note and a thread was not established either way** by file
inspection — neither real sample obtained has one. **Adding a threaded comment to a cell that
already carries a Note is refused regardless, not layered on top of it.** Real Excel's own
`Range.AddCommentThreaded` VBA API is documented as adding "a new... comment... if no comment
already exists" (learn.microsoft.com/en-us/office/vba/api/excel.range.addcommentthreaded), and
community sources report a hard one-or-the-other rule per cell — this design could **not**
independently confirm Excel's own refusal against a live install (none was available to the
research this section is built from), so that specific claim about Excel's own engine is marked
**unverified**. What IS certain, and does not depend on Excel's own behavior: this app refuses the
combination as its own policy. `AddComment` returns `'cell-has-note'` — surfaced as
`<ErrorState mode="recoverable">` "This cell already has a note. Add your comment to a different
cell, or remove the note in Excel first." + Retry — whenever the target cell's `xl/commentsN.xml`
already carries a non-`tc=` (genuine Note) entry. Per `docs/error-message-standards.md`'s "specific
and accurate" bar, this message is accurate about what THIS APP does, which needs no unverified
claim about Excel's own internals to be true.

### 4.2 The OOXML shape, researched from spec + real files

Researched from Microsoft's [MS-XLSX] open specification (learn.microsoft.com/en-us/openspecs/
office_standards/ms-xlsx/ — the Threaded Comments part, the Persons part, the Legacy Comment
Placeholders page, and the full `2018/threadedcomments` XSD) and from two real, redistributable
sample files captured under `shared-fixtures/doc-comments/xlsx-threaded-reference/` (`manifest.json`
+ `README.md` there hold the same facts machine-checkably): `docling-xlsx-comments.xlsx` (MIT,
github.com/docling-project/docling — genuinely authored by Microsoft **Macintosh** Excel, confirmed
via `docProps/app.xml`) and `elden-ring-completionist-checklist.xlsx` (MIT, github.com/Mjolniar/
elden-ring-index-build-planner — genuinely authored by **Google Sheets'** own `.xlsx` export,
confirmed via every `<person>` carrying `providerId="google-sheets"` and no `docProps/app.xml` part
at all). Both are real, unmodified, vendor-authored files, not hand-built fixtures — the same
"capture, don't guess" method the now-superseded T18 spike established for legacy Notes, extended
here to two independent real vendors instead of one app's own writer output. **Gaps this research
could not close**, named rather than papered over: SheetJS's `test_files` repo was unreachable (GitHub
disabled it for a ToS violation) and Apache POI's own `test-data` (which a POI unit test comment
implies has a fixture with BOTH a threaded comment and a genuine Note on one cell — exactly the
still-unverified same-cell-coexistence question, §4.1) ships outside GitHub and was not fetched; a
redistributable Windows-Excel-authored sample was not found (one exists but carries no license, so
it was used only to cross-check the VML finding below, never saved into this repo).

**Parts** (all new; the two-vendor cross-check is what makes each of these load-bearing rather than
a single-sample artifact):

| Part | Content type | Relationship type | Declared in |
|---|---|---|---|
| `xl/threadedComments/threadedComment{N}.xml` | `application/vnd.ms-excel.threadedcomments+xml` | `http://schemas.microsoft.com/office/2017/10/relationships/threadedComment` | the **worksheet's** own `_rels/sheet{N}.xml.rels` |
| `xl/persons/person.xml` | `application/vnd.ms-excel.person+xml` | `http://schemas.microsoft.com/office/2017/10/relationships/person` | the **workbook's** own `_rels/workbook.xml.rels` — NOT worksheet-level |
| `xl/comments{N}.xml` (legacy placeholder, same `N`) | unchanged: `application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml` | unchanged: `.../2006/relationships/comments` | worksheet rels, same as a legacy-Notes-only file |
| `xl/drawings/vmlDrawing{N}.vml` (legacy placeholder VML, same `N`) | unchanged: `application/vnd.openxmlformats-officedocument.vmlDrawing` (no `+xml`) | unchanged: `.../relationships/vmlDrawing` | worksheet rels |

`persons/person.xml` is **exactly one part per WORKBOOK**, never per worksheet — shared by every
worksheet's own `threadedComment{N}.xml` via `personId` (confirmed in both real files: one
workbook, one `person.xml`, many worksheets). `N` in `threadedComment{N}.xml`/`comments{N}.xml` is
shared between the two for a given worksheet (never a separate counter for threaded parts) but is
**not** tied to the worksheet's own position/`sheetId`. **Corrected (design review 1, F2 —
re-verified directly against every sheet's own `.rels`, not just a two-sheet sample):** the Google
Sheets file has 10 sheets, and **9 of them** carry comments (only sheet 4, "Sorceries &
Incantations List," has none) — `N` runs `1` through `9` in the **sequential order of sheets that
have any comment**, skipping the one uncommented sheet's number entirely rather than reserving it:
sheet 1 → `N=1`, sheet 2 → `N=2`, sheet 3 → `N=3`, sheet 4 → (no parts), sheet 5 → `N=4`, sheet 6 →
`N=5`, ..., sheet 10 → `N=9`. (An earlier draft of this paragraph, based on inspecting only 2 of the
9 commented sheets, wrongly generalized "comments only on sheets 1 and 5" as if that were the
file's whole comment set — corrected by listing every `sheet{1..10}.xml.rels`'s own comments/
threadedComment relationship Target directly.) This app's writer follows the same convention the
legacy-Notes writer already established (`mintPartNumber`: the smallest positive integer not
already used by `comments{N}.xml`, `vmlDrawing{N}.vml`, OR `threadedComment{N}.xml` anywhere in the
archive), extended to also scan the new part — an algorithm that already produces exactly this
"skip the gap, don't reserve it" numbering, so the correction above changes the evidence, not the
algorithm.

**Both the ThreadedComments and Person relationships are "implicit"** (MS-XLSX's own term, ISO/IEC
29500-1 §12.3.23/12.3.24): the `Relationship` entry exists in the owning part's `.rels` file, but
**no `r:id` attribute anywhere in the worksheet/workbook XML content ever points at it** — Excel
finds both parts purely by relationship Type, not by a referenced id. Confirmed by diffing sheet/
workbook content against their own `.rels` in both real files: only `vmlDrawing`'s `r:id` is ever
referenced explicitly, via the worksheet's own `<legacyDrawing r:id="...">` (unchanged from the
legacy-Notes shape §4.3 already builds). This app's writer still creates the Relationship entries —
they have to exist for Excel to find the parts — it just never needs to stamp a matching `r:id`
into worksheet/workbook content for the two new ones.

**Out of scope, named rather than silent (design review 1, F8):** every relationship/content-type
string this section names is the **Transitional** OOXML variant — the overwhelming majority of real
`.xlsx` files, and the only variant either real sample here uses. **ISO/IEC 29500 Strict** (a rare
export option, mainly seen from LibreOffice or PowerPoint) uses different URIs entirely (e.g.
`http://purl.oclc.org/ooxml/officeDocument/relationships/worksheet` instead of `.../2006/
relationships/worksheet`). `parseSheetsFromWorkbook`'s relationship-`Type` matching is exact-string
— a Strict-variant `.xlsx` would silently resolve **zero** addressable sheets (no relationship in
it matches any Transitional type string this module looks for) rather than fail with an honest
error. Accepted as an out-of-scope gap, the same way SheetJS/POI unavailability and same-cell
Note+thread coexistence already are (§4.1/§4.2) — a real but low-likelihood file shape this build
does not handle, named here so it isn't rediscovered as a silent surprise later.

**Element schema**, quoted verbatim from the spec's own XSD (learn.microsoft.com/en-us/openspecs/
office_standards/ms-xlsx/adb84732-9fc8-48b6-bddc-6b0bcdaad940):

```xml
<xsd:complexType name="CT_Person">
  <xsd:sequence><xsd:element name="extLst" type="x:CT_ExtensionList" minOccurs="0"/></xsd:sequence>
  <xsd:attribute name="displayName" type="x:ST_Xstring" use="required"/>
  <xsd:attribute name="id" type="x:ST_Guid" use="required"/>
  <xsd:attribute name="userId" type="x:ST_Xstring" use="optional"/>
  <xsd:attribute name="providerId" type="x:ST_Xstring" use="optional"/>
</xsd:complexType>
<xsd:complexType name="CT_ThreadedComment">
  <xsd:sequence>
    <xsd:element name="text" type="x:ST_Xstring" minOccurs="0"/>
    <xsd:element name="mentions" type="CT_ThreadedCommentMentions" minOccurs="0"/>
    <xsd:element name="extLst" minOccurs="0"/>
  </xsd:sequence>
  <xsd:attribute name="ref" type="x:ST_Ref" use="optional"/>
  <xsd:attribute name="dT" type="xsd:dateTime" use="optional"/>
  <xsd:attribute name="personId" type="x:ST_Guid" use="required"/>
  <xsd:attribute name="id" type="x:ST_Guid" use="required"/>
  <xsd:attribute name="parentId" type="x:ST_Guid" use="optional"/>
  <xsd:attribute name="done" type="xsd:boolean" use="optional"/>
</xsd:complexType>
```

`CT_ThreadedCommentMentions`/`CT_Mention` (`@name` mentions) also exist in the spec but were never
exercised by either real sample — out of scope for this build; a foreign file using them is simply
read as plain text (the `<mentions>` child, if present, is ignored, never crashing the parser).

The real `<ThreadedComments>` container, confirmed byte-for-byte in `docling-threadedComment1.xml`:

```xml
<ThreadedComments xmlns="http://schemas.microsoft.com/office/spreadsheetml/2018/threadedcomments"
                   xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <threadedComment ref="F7" dT="2026-06-18T17:12:37.41"
                    personId="{ED88F4F5-A552-4A41-970D-6B23DC2319F4}"
                    id="{04C1C54B-2744-A647-93D1-A99C27C7EFDC}">
    <text>Minimum number of saltwater ducks</text>
  </threadedComment>
  <threadedComment ref="F7" dT="2026-06-18T17:15:52.31"
                    personId="{F91C2EA4-71EE-4B4A-B219-115641A7AB48}"
                    id="{9079903E-5C85-DC40-828F-9D93A620480C}"
                    parentId="{04C1C54B-2744-A647-93D1-A99C27C7EFDC}">
    <text>I never thought it would be so low</text>
  </threadedComment>
</ThreadedComments>
```

and `xl/persons/person.xml`'s own root, `docling-person.xml` verbatim:

```xml
<personList xmlns="http://schemas.microsoft.com/office/spreadsheetml/2018/threadedcomments"
            xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <person displayName="Jane Smith (JS)" id="{ED88F4F5-A552-4A41-970D-6B23DC2319F4}"
          userId="Jane Smith (JS)" providerId="None"/>
</personList>
```

**A load-bearing gotcha, confirmed by the second real sample: namespace prefixes vary by writer.**
Real Excel (both samples above) declares the `2018/threadedcomments` namespace as the DEFAULT
(unprefixed) namespace, with `x:` as the SML-main prefix. Real Google Sheets does the reverse — its
own `threadedComment4.xml` root is `<x18tc:ThreadedComments xmlns="...spreadsheetml/2006/main"
xmlns:x18tc="...2018/threadedcomments" ...>`, with every element PREFIXED `x18tc:` (`<x18tc:
threadedComment>`, `<x18tc:text>`). **Both are equally valid XML** (a namespace prefix is an
arbitrary local label; only the namespace URI is meaningful) — but the existing `elementsByTag(doc,
tag)` helper (`xlsx-comments.ts`, built for legacy-Notes work) matches the literal tag string,
which would silently read ZERO threaded comments from a real Google-Sheets-authored file. This
module's read/write MUST match by `element.localName === 'threadedComment'` (etc.) — never a
prefix-inclusive string — the same class of fix, at a lower level, `docx-comments.ts`'s own
namespace-safe walk already needs for `w:`/`w15:`-prefixed elements. A dedicated pinning test
parses BOTH the Excel-shaped and the Google-Sheets-shaped real fixture and asserts identical output
shape from each.

**GUID format**: `{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}`, braces included. ECMA-376's own
`ST_Guid` pattern is strictly uppercase hex (confirmed via a MIT-licensed mirror of the shared
ECMA-376 XSD, randym/axlsx — the primary ECMA/ISO document itself was not directly fetched). Real
Windows/Mac Excel writes uppercase (both `docling` GUIDs); real Google Sheets writes **lowercase**
(every `elden` GUID) — technically non-conformant to the strict pattern but read without complaint
by Excel itself. **This app writes uppercase** (spec-conformant, matches the majority real-world
writer) and **reads case-insensitively** (matches either vendor, and any other real-world writer
this app hasn't sampled).

**`dT` timestamp format**: `YYYY-MM-DDTHH:MM:SS.ff` — exactly two fractional-second digits, **no
timezone offset, never a trailing `Z`** — confirmed across dozens of real values from both vendors
(`2026-06-18T17:12:37.41` from Mac Excel, `2023-01-22T07:55:21.00` from Google Sheets). The XSD type
is plain `xsd:dateTime` (which permits an offset), so a `Z`-suffixed value would still validate, but
no real writer sampled produces one — **this app writes the same two-decimal, no-`Z`, locally-naive
shape**, not a UTC-suffixed one, to match every real writer sampled rather than a technically-valid
but never-observed alternative.

**`parentId`/reply flattening**: a reply's `parentId` always names the THREAD ROOT's own `id` —
**never chained reply-to-reply**, confirmed with a 3-reply thread (`docling`) and a 4-reply,
5-root, 9-message cell (`elden`, below — corrected, design review 1 F2: an earlier draft of this
sentence said "8-reply," which is both arithmetically inconsistent with its own "9-message" total
and factually wrong; re-counted directly from `elden-threadedComment1-B19-excerpt.xml`'s 9
`ref="B19"` elements: 5 carry no `parentId` — the roots — and 4 carry one, always the id of one of
those 5 roots) where every single reply across many days and several different people still points
directly at its own root. `done` was never observed on a non-root element. This app's own writer follows the same convention: a reply's `parentId` is always the
thread's root id, never another reply's — which is also what keeps §2's "replies ordered by `dT`"
read-side logic a flat sort under one root, with no tree to walk.

**`done`**: optional per the XSD; real Excel OMITS it entirely when a thread is unresolved, real
Google Sheets writes it explicitly as `done="0"`. **This app's reader treats an omitted `done` and
`done="0"` identically as unresolved** (required for interop with Google-Sheets-authored files) and
its writer OMITS the attribute on creation (matching Excel's own idiom), sets `done="1"` on resolve,
and REMOVES the attribute entirely on reopen (never writes `done="0"`) — the marker hack this
retires (`​✓ Resolved`/`​[[yc:resolved]]`) needed inert placeholder text specifically because a
legacy Note has no real boolean field; a threaded comment does, so resolved state is now `done="1"`,
full stop, on the ROOT element only.

**A cell reference can carry MULTIPLE, entirely independent threads — confirmed directly, and a
real design decision, not just a format quirk.** Cell `B19` in the real `elden` file has **five**
separate `<threadedComment>` roots all with `ref="B19"`, spanning `dT` from April 2022 to January
2023, each with its own `done` state and its own (possibly zero) replies — resolving a thread on a
cell does NOT let Excel/Sheets reopen it later; a new "New Comment" action on an already-commented
cell starts a brand-new, unrelated root. `xl/comments1.xml` correspondingly carries **five separate
`<comment ref="B19">` legacy placeholders**, one per root (`elden-comments1-B19-excerpt.xml`).
**This app's READER must group `threadedComment` elements by `(ref, id-chain)`, never assume one
thread per cell**, and must never drop or silently merge a colleague's older thread just because a
newer one shares the same cell. **This app's own WRITER, though, keeps the one-thread-per-cell
convention the mockup's own UI already assumes** (`CellSelector` names a cell, not a thread index) —
`AddComment` refuses `'cell-already-has-comment'` if the target cell already carries ANY thread
(resolved or not), mirroring real Excel's own everyday right-click UI (which shows "Show/Edit/Delete
Comment" instead of "New Comment" on an already-commented cell) rather than the looser thing the
FILE FORMAT technically permits. **This is a real, user-visible decision, flagged explicitly**: a
colleague's file with several independent old threads on one cell will show several separate cards
at that cell in YouCoded's own pane (never merged, never dropped), but YouCoded's own "Add comment"
on an ALREADY-commented cell always offers reply-to-the-existing-thread, never a second independent
one — matching Excel's own everyday UI, not the looser thing a Google-Sheets-authored file can
apparently accumulate over time.

**UI for N>1 threads at one cell: reuses the already-approved card list, no new UI invented
(design review 1, F7).** The approved mockup already renders however many `PersistedComment` cards
a file/path has, stacked in the comments pane's own scroller (`CommentsPaneFrame.tsx`) — exactly
the shape "several comments on one line of a text file" already takes today for Word/plain-text.
Several independent threads on one Excel cell are not a new visual case: they are several ordinary
cards whose `selector.cell` happens to be equal, shown exactly as several `TextQuoteSelector`
comments whose `exact` text happens to overlap are already shown — one corner mark on the cell
(unchanged, R17), hover/click opens the SAME pane already showing every card at that highlight,
in `dT` order like any other list. No new interaction is designed or built for this — **this
specific case (a real multi-thread cell, using the `elden` fixture's own `B19` as the concrete
example) is added to the acceptance deck's checklist (§8/feature-flow's own acceptance-round step)
so Destin sees it before ship, not invented as new UI here.**

**Id scheme, corrected (design review 1, F1 — a positional ordinal is not a safe mutation
target).** An earlier draft of this paragraph identified a thread by `xt-{sheetId}-{cell}-{n}`,
`n` a 0-indexed ordinal by ascending `dT` among that cell's CURRENT roots — and reasoned that this
app's own writes can't reshuffle it (a new thread always sorts last). That reasoning is correct as
far as it goes, but it only covers THIS app's own writes. It says nothing about a **foreign** edit
(a colleague, in real Excel, using the file normally) landing between two of this app's own calls
on a shared, multi-thread cell — and the `B19` case above proves that shape is real, not
hypothetical: five threads, five different authors, spanning nine months. If a colleague deletes
their own unrelated thread on `B19` between this app's `ReadFileComments` and a later `Resolve
Comment(id)` call, every ordinal after the deleted one shifts down one position — the id the
assistant was holding now names a **different, real thread**, and nothing in a purely positional
scheme would catch that: the write would silently succeed against the wrong colleague's comment.
**Fixed: the app-level id embeds the thread's own real GUID, not a position** —
`xt-{sheetId}-{cell}-{id-without-braces}` (e.g. `xt-3-B19-36100E21-63DC-459D-8552-6830736C717E`).
`sheetId`/`cell` are kept in the id purely as a locate-first HINT (so a mutation can jump straight
to the right worksheet/cell without re-scanning the whole workbook in the common case) — the
GUID segment is the only part that identifies WHICH thread. Every reply/resolve/reopen/move
re-resolves an incoming id by: (1) opening the hinted worksheet and matching the embedded GUID
against a root `<threadedComment>` currently at the hinted `ref`; (2) if no match there — e.g. the
thread was itself moved to a different cell since the id was issued — falling back to a full-
workbook scan for a root whose `id` matches the embedded GUID; (3) refusing `'comment-not-found'`
only if NEITHER finds it, never guessing at "the nth thread currently at this ref." An ordinal MAY
still drive **display** order in the pane (so already-open cards don't visually reorder against
each other), but is never again the identity a mutation call targets. **Replies keep their existing
`{rootId}-r{n}` ordinal convention, unchanged** — the same class of instability doesn't apply to
them, because no tool in §5's table ever addresses an individual REPLY by id (`ReplyToComment`
always takes the THREAD's — the root's — id and appends; a reply's own id is display-only, read
back but never independently mutated), so there is no call this ordinal could silently misdirect.

**The parse algorithm itself, pre-written rather than left to be reinvented twice (design review
round 2, F2 — Medium).** The composite id's GUID segment ITSELF contains four hyphens — the SAME
character the composite id uses as its own field delimiter (`xt-3-B19-36100E21-63DC-459D-8552-
6830736C717E`) — and this design never previously said how a caller gets from the string back to
its three parts. A naive `id.split('-')` destructures only the GUID's OWN first hyphen-delimited
segment (`36100E21`) into what it thinks is the whole GUID, silently discarding the rest — every
mutation on a real GUID-bearing thread then fails `'comment-not-found'`, 100% of the time, in
whichever of the two independent runtimes (TS, Kotlin) happens to get this wrong. **Parse from the
LEFT, splitting on exactly the first TWO hyphens; the remainder — regardless of how many hyphens it
itself contains — is the GUID verbatim, never itself split further.** Pre-written regex both
runtimes implement identically: `/^xt-(\d+)-([^-]+)-(.+)$/` (group 1: `sheetId`; group 2: `cell` —
an A1-style reference never contains a hyphen, confirmed by `CELL_ADDRESS_RE`'s own existing pattern
in `xlsx-comments.ts`, so `[^-]+` is safe; group 3: the GUID, matched case-insensitively against a
file's real `id` attributes per §4.2's own GUID-case finding). **A shared test-vector fixture is
required, not left to each runtime's own hand-picked examples** — a small, checked-in JSON file
(`shared-fixtures/doc-comments/id-parse-test-vectors.json`), each entry `{input, sheetId, cell,
guid}`, covering: the worked example above; a lowercase-GUID input (Google Sheets' own case,
confirmed real per §4.2); a single-digit `sheetId`; a single-letter, single-digit cell (`A1`); and a
three-letter, seven-digit cell (`XFD1048576`, Excel's own maximum). T12 (TS) and T18 (Kotlin) both
read this SAME file in their own pinning tests, so a fix to one runtime's parser that the other
doesn't share fails immediately on the shared vectors rather than silently diverging — the identical
"one shared fixture, not two independently-typed example sets" discipline §9.3's own golden-fixture
parity test already uses for the OOXML byte shapes, applied here to the id format instead.

**Duplicate-GUID ambiguity is refused, never silently resolved by scan order (design review round 2,
F3 — Medium).** Step (2) above — the full-workbook fallback scan — is written as if at most one root
can match the embedded GUID. It never says what happens if MORE than one does: two roots (in the
same worksheet, or two different ones) whose `id` attribute is byte-identical. **Checked directly:
neither real fixture has this** (grepped every `id="{...}"` across all nine of `elden`'s
`threadedComment{N}.xml` parts plus `docling`'s one file — zero duplicates in either) — but §4.1
already admits real Excel's own "Move or Copy Sheet → Create a copy" behavior around thread GUIDs
was never verified either way (no live Excel install available to this research), so a worksheet
duplication that happens to copy a thread's GUID verbatim is a real, unverified-in-either-direction
possibility, not a purely theoretical malformed-file case. **Fixed: the fallback scan refuses a
distinct `'ambiguous-comment-id'` error — never `'comment-not-found'` folded in, since the two mean
different things to a caller (not found vs. found-but-can't-safely-act) — the moment it finds a
SECOND root sharing the embedded GUID, rather than silently acting on whichever the scan order
happens to hit first.** This is the same "never guess, refuse instead" principle F1 (round 1) already
applies to the plain not-found case, now extended to the found-more-than-once case a purely
positional id could never even have exposed as ambiguous in the first place.

**`person` attributes, real-world values**: `providerId` seen: `"None"` (Mac Excel, a local/
non-managed account), `"google-sheets"` (every person in the Google Sheets file — 57 entries
checked). `userId`: Mac/Windows Excel repeats the `displayName` string itself (`userId="Jane Smith
(JS)"` for `displayName="Jane Smith (JS)"` — an odd but confirmed real-world convention); Google
Sheets omits `userId` entirely on every entry. **This app's own person entries use a dedicated,
distinguishing `providerId="YouCoded"`** (a value no real vendor sampled uses, chosen specifically
so this app's own entries are never ambiguous with a colleague's) **and omit `userId`** (matching
Google Sheets' own precedent — this app has no real account-linked identity to put there yet, §1.2).
A person entry is reused, never duplicated, across repeated writes by the SAME identity to the same
file: before minting a new `<person>`, the writer checks for an existing entry with
`providerId="YouCoded"` and a matching `displayName`; only a genuine miss appends a new one with a
freshly-minted GUID. `displayName` follows the exact convention `docx-comments.ts`'s own
`commentAuthorToDisplayName` already establishes and the (now-retired) legacy-Notes writer already
copied: `'user'` → "You", `'assistant'` → "Assistant", `person:<name>` → `<name>` verbatim.
**Because a real `personId` now maps to a real `displayName`, the fragile "Name:" heading-shaped
prefix heuristic the legacy-Notes reader needed (`APP_AUTHOR_PREFIX_RE`/`NON_NAME_HEADINGS`, guessing
an author out of a plain-text note body) is gone entirely** — a threaded comment's author is never
guessed, and can never be misattributed to a colleague's own ordinary Title-Case heading the way a
legacy Note's body-first-line convention could.

**The legacy compatibility placeholder** — the human-readable text every writer stamps into
`xl/commentsN.xml` for a cell that ALSO has a threaded comment, verbatim (Mac Excel,
`docling-comments1.xml`, one reply):

```
[Threaded comment]

Your version of Excel allows you to read this threaded comment; however, any edits to it will get removed if the file is opened in a newer version of Excel. Learn more: https://go.microsoft.com/fwlink/?linkid=870924

Comment:
    Minimum number of saltwater ducks
Reply:
    I never thought it would be so low
```

— the header sentence and the exact URL (`https://go.microsoft.com/fwlink/?linkid=870924`) are
confirmed identical across THREE independent sources: both real files here, and a third real-
Excel-365 sample quoted in a public bug report (github.com/PHPOffice/PhpSpreadsheet issue #2184).
**Whitespace layout is writer-dependent, not part of the stable contract** — Google Sheets's own
export (`elden-comments4.xml`) uses a single space (not a blank line) before "Your version...", no
blank line before "Comment:", a tab (not 4 spaces) indent, a trailing newline, and an explicit
`xml:space="preserve"`. **This app's writer matches the real-Excel layout verbatim** (blank line
after the header, blank line before "Comment:", 4-space indents, one "Reply:" block per reply, in
`dT` order) — the more common of the two observed shapes and the one independently corroborated a
third time. The `done`/resolved state is **never** reflected in this placeholder text (confirmed:
`elden`'s own resolved B19 thread's placeholder reads as plain comment/reply text with no
resolved/closed marker at all) — resolving a thread therefore never touches `commentsN.xml` at all,
only the real thread's own `done` attribute.

**The `tc={GUID}` link — the ONLY thing that ties a placeholder to its real thread.** The legacy
`<comment>`'s own `authorId` points at an `<authors><author>tc={GUID}</author></authors>` entry
where `{GUID}` is byte-identical (including case) to the corresponding `threadedComment` ROOT's own
`id` — confirmed in every sample and by the spec's own text ("Legacy Comment Placeholders": author
"MUST contain `tc={uid}`"). The same GUID is **also** written to the legacy `<comment>` element's
own `xr:uid` attribute (`xmlns:xr="http://schemas.microsoft.com/office/spreadsheetml/2014/
revision"`), present on every `tc=`-authored `<comment>` in both fixtures. **Correction (design
review 1, F2):** an earlier draft of this paragraph additionally claimed `mc:Ignorable="xr"` is
"confirmed present whenever a `tc=` author exists" — re-checked directly, that is only true for
`docling` (Mac Excel), whose `<comments>` root does declare `mc:Ignorable="xr"`. `elden`'s (Google
Sheets) `<comments1.xml>` root uses `xr:uid` freely with **no** `mc:Ignorable` declaration at all
(`grep mc:Ignorable` on the real file returns nothing) and Excel accepts the file anyway. This has
no effect on the reading algorithm above — the reader only ever checks a `<comment>`'s own `tc=`-
shaped author (and, redundantly, its `xr:uid`), never `mc:Ignorable` — but the writer's own choice
of whether to declare it needs its own answer, not an assumption; see §4.3 step 1 (F6). There is
**no other link** — no relationship-level or `ref`-level pointer —
between the two parts; the spec itself says a `ref` mismatch between the two is resolved in the
placeholder's own favor for DISPLAY, but the `tc=`/`xr:uid` pair is what identifies which real
thread a placeholder fronts for. This app's reader identifies (and then SKIPS — §4.1) a placeholder
as thread-linked purely by its author matching `^tc=\{[0-9A-Fa-f-]{36}\}$`; anything else is a
genuine Note.

**The placeholder's VML shape is structurally the SAME `<x:ClientData ObjectType="Note">` shape as a
genuine Note's own** (`../xlsx-note-reference/vmlDrawing1.vml`) — no distinct `ObjectType` or marker
exists at the VML level. **One real, corroborated difference**: a genuine Note's VML includes
`<x:Locked>True</x:Locked>` and `<x:LockText>True</x:LockText>`; every one of three independently-
sourced threaded-placeholder VML samples checked (Mac Excel, Google Sheets, plus one further
Windows-Excel sample used only to cross-check and not redistributed here — no license file) OMITS
both elements. **This app's writer omits them too** for a threaded placeholder's own VML shape,
matching all three real sources, while the (now-retired) genuine-Note VML builder — no longer used
by any writer this design specifies — is deleted rather than kept as an unused second code path.

**Cell + sheet anchor — unchanged from the prior design**: `CellSelector { cell: 'C4', sheet?: 'Q3'
}`, `sheet` required only when the workbook has more than one (non-chartsheet) tab, exactly as
before (`sourceLabel`'s "By rep · B4" vs plain "C4" convention, `doc-comments-store.ts:249,281,298`)
— the format underneath changed, the anchor shape did not. `sheet-reveal.ts` already handles
switching the visible tab when a comment on another sheet is clicked — no change needed there.

**No spreadsheet equivalent of §2's "detached" state is needed, and this is a reasoned conclusion,
not a silent omission (design review 1, F10).** §2's whole re-anchoring/detached machinery exists
because an EDIT to the surrounding TEXT can move or delete exactly what a `TextQuoteSelector`
pointed at, and this feature has no way to know unless it re-derives the anchor itself. A cell
address has no equivalent problem: when a row or column is inserted or deleted, keeping every OTHER
cell's own comments correctly repositioned (shifting `ref="C4"` to `ref="C5"`, etc.) is Excel's/
Google Sheets' own job, already solved by the spreadsheet engine on save — this feature never edits
sheet structure itself, only comment threads, so it never has to duplicate that bookkeeping or
detect when it might be stale. The only way a `CellSelector` goes stale is the row/column it named
being DELETED outright (not shifted) — already handled the same way `resolveSelector`'s existing
cell-selector branch handles it (§2.2: "does `[data-sheet=…] [data-cell=…]` exist in the rendered
grid" — a missing cell renders exactly like any other not-found target), so no new machinery is
needed there either.

### 4.3 Read/write/backup, mirroring §3.3

**Rewritten 2026-09-27 (session `comments-mock-a`), for the threaded-comments-only decision —
superseding this section's own ExcelJS-based (and later surgical-but-legacy-Notes-only, commit
a4275bf23) write design entirely.** The prior rewrite already established the load-bearing lesson
this version keeps: `exceljs`'s own `workbook.xlsx.writeBuffer()` REBUILDS every OOXML part from its
in-memory model and silently drops whole part types it has no slot for (custom properties, external
links, several other features) — a real LibreOffice-authored workbook proved this by round-tripping
with `docProps/custom.xml` GONE, `xl/externalLinks/*` GONE, defined names' `$`-absoluteness ALTERED,
and more, none of it refused. **The fix is the same shape §3.3 already uses for Word, now applied to
BOTH read and write**: surgical JSZip + `linkedom`-DOM edits touching only the parts a mutation
needs, never a whole-workbook rebuild. Full implementation detail lives as comments in
`desktop/src/main/doc-comments/xlsx-comments.ts`'s own section header once T12/T13 are rebuilt to
this design; this section is kept as an accurate summary, not a duplicate of that detail.

A threaded-comment mutation touches, at most, **six** parts (up from legacy Notes' five, per §4.2):
the target worksheet's own `xl/threadedComments/threadedComment{N}.xml`, its `xl/commentsN.xml`
legacy placeholder, its `xl/drawings/vmlDrawingN.vml`, that worksheet's own rels file, the
worksheet's own `<legacyDrawing r:id>` element, and the WORKBOOK-level `xl/persons/person.xml` (new
— §4.2's own finding that persons is workbook-scoped, not worksheet-scoped) plus the workbook's own
rels file and `[Content_Types].xml`. Every other part in the archive — styles, shared strings, other
worksheets, external links, defined names, images, a genuine Note elsewhere in the same file — is
never parsed, never touched, and round-trips through JSZip's own unmodified-entry passthrough
byte-for-byte, exactly the guarantee §4.1 promises for pre-existing Notes.

**Lives in main, unchanged from the prior design's own placement (review 1, F1/F2 — blocker):**
`desktop/src/main/doc-comments/xlsx-comments.ts`, not `XlsxView.tsx`'s renderer code — T8's native
tools and T9's MCP queue must be able to mutate an Excel comment with no renderer window open on
that file, and no new binary IPC channel is needed because `fs` is already local. `XlsxView.tsx`'s
own read-only rendering of cell VALUES for display is untouched — only the comment read/write path
moves, and (new this rewrite) so does exceljs itself, entirely out of this module (§4.1).

**Read** (rewritten, no longer via exceljs — §4.1): loads the archive with JSZip (the same pattern
the write path already established), resolves the target worksheet's `threadedComment`/`person`
relationships by Type (§4.2's "implicit relationship" finding — never by a referenced `r:id`),
parses both parts with `linkedom`, matches every element by `localName` (§4.2's namespace-prefix
finding), groups `threadedComment` elements by `(ref, id-chain)` (§4.2's multiple-threads-per-cell
finding), and builds one `PersistedComment` per root (`id: xt-{sheetId}-{cell}-{root's own GUID,
braces stripped}` — §4.2's corrected id scheme) plus one `CommentReply` per child ordered by `dT`.
A legacy `<comment>` is inspected only far enough to classify it `tc={GUID}`-linked (skip — its
thread is read from the real part instead) or a genuine Note (skip — §4.1, never shown).

**A record-count ceiling, not just a byte ceiling (design review 1, F3).** `zip-size-guard.ts`'s
existing guard bounds DECOMPRESSED BYTES, not element count — a crafted (or just very large)
`threadedComment{N}.xml` of hundreds of thousands of minimal `<threadedComment ref="A1" .../>`
roots could stay comfortably under the byte ceiling while still handing the renderer hundreds of
thousands of `PersistedComment` records in one `list()` response, exactly the per-event-cost-growth
shape `.claude/rules/performance.md` rule 4 and the busy-app render-budget test exist to catch. Add
an explicit record-count ceiling alongside the existing byte ceiling — refuse (a new
`'too-many-comments'` read error, same `<ErrorState>` treatment as `'archive-too-large'`) past a
task-time, benchmarked threshold (a starting point, not a frozen constant, matching this design's
own precedent for other such numbers, e.g. §4.3a's Android size guard) — rather than leaving the
byte ceiling to silently stand in for a guarantee it was never designed to make.

**The decompression-bomb guard's shape should narrow along with the reader (design review 1, F4).**
The CURRENT two-tier guard (`checkTotalWithinCeiling` pre-scanning the WHOLE archive, plus
`decompressBounded` as a backstop) exists specifically because the OLD exceljs-based reader was a
black box with no hook to bound its own decompression — so the guard had to defend blindly, before
handing bytes to something it couldn't see inside. §4.1 removes exceljs from this module entirely;
this reader now only ever touches `threadedComment{N}.xml`, `person.xml`, and `comments{N}.xml` by
NAME, the same "named parts only" model `docx-comments.ts`'s own guard (`checkNamedEntriesWithinCeiling`)
already uses. **The guard narrows to match**: xlsx's read/write path checks only the parts it is
about to open, not the whole archive — strictly cheaper, and just as safe, since there is no more
black-box decompressor downstream to defend blindly. (Every OTHER part in the archive still
round-trips through JSZip's own unmodified-entry passthrough without ever being decompressed by
this module at all, so a huge, irrelevant, embedded image or other big part poses no risk this
narrower guard needs to catch.)

**Write** (rewritten): backup-before-write (unchanged, `write-pipeline.ts`), apply the surgical
edit described in each step below, **verify-after-write with automatic rollback on failure** by
re-running this section's OWN read path against the just-written bytes and confirming the mutated
thread's real fields match what was requested (never a raw-string comparison — a threaded comment's
body is real structured XML per message, not a formatted-transcript blob, so verification compares
parsed fields directly) — on failure, rename the backup back over the target before surfacing a
specific `<ErrorState>`, never leave a possibly-corrupted file as the user's live document.

**Resolving an incoming `commentId` (steps 2-4 below), per §4.2's corrected id scheme (design
review 1, F1):** `xt-{sheetId}-{cell}-{GUID}` is resolved by (1) opening the hinted worksheet and
looking for a root `<threadedComment>` at the hinted `ref` whose own `id` matches the embedded GUID;
(2) on a miss (the thread moved since the id was issued — including by a PRIOR call in this same
session), falling back to a full-workbook scan for a root whose `id` matches; (3) refusing
`'comment-not-found'` only if neither finds it. **Never** "the nth thread currently at this `ref`" —
that positional resolution is exactly what the earlier, now-corrected id scheme risked, and §4.2's
`B19` scenario (a foreign edit reshuffling which thread sits at which ordinal between two of this
app's own calls) is the concrete failure this guards against.

1. **Add a comment**: mint a root GUID (uppercase — §4.2) and a `dT` in this app's own writer
   format; reuse-or-create this app's own `<person>` entry (§4.2's `providerId="YouCoded"`
   convention, matched by `displayName`) in `xl/persons/person.xml`, creating that part + its
   workbook-level relationship + `[Content_Types].xml` Override on the file's first-ever thread;
   ensure the target worksheet's `threadedComment{N}.xml`/`comments{N}.xml`/`vmlDrawing{N}.vml`
   trio exists (creating all three + their worksheet-rels entries + content-types entries on that
   worksheet's first-ever comment of ANY kind, via `mintPartNumber`'s existing shared-`N`
   convention, extended to also scan the new part); append the `<threadedComment>` root (no `done`
   attribute — §4.2); append the matching legacy `<comment>` (`tc={the same GUID}` author,
   real-Excel-layout placeholder body — §4.2) and its `<v:shape>` (Note-shaped VML, WITHOUT
   `<x:Locked>`/`<x:LockText>` — §4.2). **Refuses `'cell-has-note'`** if the target cell already
   carries a genuine (non-`tc=`) Note, and **`'cell-already-has-comment'`** if it already carries
   ANY thread (§4.2's own one-thread-per-cell write policy).
   - **A brand-new `comments{N}.xml`'s own root gets `xmlns:xr`/`mc:Ignorable="xr"`, matching the
     Mac-Excel convention, not Google Sheets' omission of it (design review 1, F6):** both are
     tolerated by real Excel (§4.2's F2 correction confirms Google Sheets omits it and Excel still
     opens the file), but this app's writer follows the more spec-literal of the two observed
     conventions when creating a part from scratch, rather than leaving the choice to be discovered
     mid-implementation. (An EXISTING `comments{N}.xml` this module edits in place — the append
     case, next bullet — keeps whatever convention it already had; this only governs a part this
     app mints itself.)
   - **A `<v:shape>` appended into an EXISTING `vmlDrawing{N}.vml` reuses the legacy-Notes writer's
     own id-collision rule, carried over explicitly rather than silently assumed (design review 1,
     F5):** the real `docling` fixture proves this case isn't hypothetical — cells A1/B2 already
     carry genuine Notes' own `<v:shape id="_x0000_sNNNN">` elements in the SAME `vmlDrawing1.vml`
     that F7/G12's threaded placeholders also live in. A brand-new placeholder's shape id is picked
     the same way the currently-built legacy writer's `nextVmlShapeId` already does — scan every
     `_x0000_sNNNN` id already present in the part (Notes' and threaded placeholders' alike) and use
     `max + 1` — never assumed to start fresh at `1025` just because this rewrite touches a
     different part type. This is existing, working logic being carried forward, not new design.
   - **`<legacyDrawing>` is always appended as the worksheet's absolute LAST child element, even
     after an existing `<extLst>` if the worksheet already has one — restated explicitly here, not
     assumed carried over silently (design review round 2, F4 — High: this exact rule was found and
     fixed once already, for the now-retired legacy-Notes design, and this rewrite's own §4.2/§4.3
     text never restated it anywhere).** The retired legacy-Notes writer's own code comment (still
     present in the currently-built `xlsx-comments.ts`, ~lines 1129-1178) states the finding this
     rule carries forward verbatim: *"`<legacyDrawing r:id="...">` as the worksheet's OWN LAST child
     element — the spike's own 'legacyDrawing is the last element in `<worksheet>`, even after
     `<extLst>` if one exists' finding, which `appendChild` satisfies unconditionally."* This applies
     identically whether the worksheet's first-ever comment is a legacy Note (the retired design) or
     a threaded comment (this one) — the element being inserted and its required position in
     `sheet{N}.xml`'s own child sequence haven't changed, only what else gets wired alongside it. A
     builder implementing this "not as a patch" from §4.2/§4.3's prose alone, without independently
     re-discovering the retired writer's own comment, could reasonably (and wrongly) insert
     `<legacyDrawing>` via ordinary DOM `insertBefore`/schema-order logic — BEFORE an `<extLst>`,
     matching the formal `CT_Worksheet` element sequence at a glance — instead of unconditionally
     appending it last; the result is a syntactically valid but Excel-flags-for-repair worksheet part
     on a worksheet that already uses `extLst`-backed features (sparklines, certain conditional-
     formatting extensions, slicers, and others are all common). **Neither real fixture exercises
     this**: checked directly, `docling`'s `sheet1.xml` has no `<extLst>` at all (`<legacyDrawing>` is
     simply its own last element after `<pageMargins>`), and `elden`'s also has none (its
     `<legacyDrawing>` sits before `<tableParts>`, itself before where an `<extLst>` would go) — so
     T12/T13's own pinning tests, built against these two files, give NO signal either way. A
     synthetic fixture (not sourced from either real file, since neither has the shape) is required:
     a minimal worksheet with a pre-existing `<extLst>` element, confirming a brand-new
     `<legacyDrawing>` lands AFTER it, not before.
2. **Reply**: mint a new GUID/`dT`, reuse-or-create the replying identity's `<person>` entry, append
   a `<threadedComment parentId="{root's id}">` (never chained to another reply — §4.2) to the SAME
   `threadedComment{N}.xml`; rewrite the ONE existing legacy `<comment>` for this thread, appending a
   new `Reply:` block to its placeholder body in `dT` order (the placeholder is write-only output —
   §4.1 — never re-parsed by this app's own reader).
3. **Resolve/reopen**: set `done="1"` (resolve) or remove the `done` attribute entirely (reopen) on
   the ROOT `<threadedComment>` element ONLY — never on a reply, never touching the legacy
   placeholder at all (§4.2: resolved state is never reflected there). This is the WHOLE operation —
   no marker string to append or strip, unlike the retired legacy-Notes design.
4. **Move (repoint)**: update the `ref` attribute on the root AND every reply sharing its id-chain
   (found by `parentId`, never re-derived from a possibly-stale `ref`) to the new cell; update the
   SAME field on the thread's one legacy `<comment>`; move its `<v:shape>` to the new cell's default
   anchor rect (§4.2's VML shape, at the new coordinates). **Refuses `'destination-cell-occupied'`**
   if the destination already carries a DIFFERENT thread, and **`'cell-has-note'`** if it carries a
   genuine Note — the same two write-time checks Add already makes, applied to the destination.
5. **Verify after write, with automatic rollback** — see above; additionally confirms the
   relationship/content-types sanity check this section already needs for the legacy pair also
   covers the two new `threadedComment`/`person` relationships and their Overrides.

**Deletion, or editing an already-posted reply's own text, is out of scope here — deliberately, not
by oversight (design review 1, F9).** The only mutating operations this section (and §3.3's Word
equivalent) ever offers are add/reply/resolve/reopen/move; there is no "delete a reply," "delete a
whole thread," or "edit a reply's text after posting," on either format. This matches the signed
contract's own R6 wording ("reply, resolve, and/or repoint... nothing silently lost") — deletion and
post-hoc editing are never promised — and §10's own "no delete-a-comment capability beyond what the
mock already had client-side only" already states this as a whole-feature scope boundary; this is
that same boundary, restated here so a builder or a future reviewer doesn't re-litigate "can the
assistant undo or fix a typo in its own reply" while reading this section in isolation.

**No feature-refusal denylist is needed the way the legacy-Notes rewrite still needed one for
threaded comments specifically.** That refusal existed because a writer editing `commentsN.xml` in
place risked desynchronizing a threaded comment's own legacy placeholder from its real thread. **This
module now owns and edits both halves together, in the same operation, always in sync by
construction** — there is no longer a class of file this reader/writer must refuse outright. **The
whole-workbook refusal at `xlsx-comments.ts`'s old `checkNoUnsupportedFeatures`/
`hasThreadedComments` check (~lines 356-393) is REMOVED entirely** — a threaded comment's presence
is no longer a reason to refuse a file, it is the thing this module reads and writes. The refusals
that remain, worded per `docs/error-message-standards.md`: `'cell-has-note'`, `'cell-already-has-
comment'`, `'destination-cell-occupied'`, `'invalid-selector'`, `'sheet-not-found'`,
`'ambiguous-comment-id'` (design review round 2, F3 — two roots share one GUID; see §4.2's own id-
scheme paragraph for when this fires), plus the pre-existing `'invalid-xlsx'`/`'archive-too-large'`
malformed-input refusals `zip-size-guard.ts`/JSZip's own load failure already provide, unchanged.
`'too-many-comments'` (design review 1, F3 — the record-count ceiling, above) also refuses reads
past its own threshold. `'cell-has-no-value'` (the legacy-Notes-era ExcelJS-reader blind spot) no
longer applies — this module's own read path is no longer ExcelJS, so it has no such blind spot to
refuse around.

### 4.3a Android: a real Kotlin implementation

**Rewritten 2026-09-27 for the threaded-comments-only decision.** Same tools as §3.2a
(`java.util.zip` + `javax.xml.parsers`/`javax.xml.transform`, no new Gradle dependency); the same
`XlsxComments.kt` (`app/src/main/kotlin/com/youcoded/app/doccomments/`) gets a full rewrite, not a
patch — the entire legacy-Notes algorithm this file previously implemented (walking `xl/
workbook.xml`'s `<sheets>` for `sheetId`, resolving `r:id` through rels to a worksheet part, then
that worksheet's own comments relationship) is STILL the right way to locate a worksheet's parts;
only the leaf-level parsing (what a `<comment>`/`<threadedComment>` element actually MEANS) changes,
plus new work with no legacy-Notes precedent at all:

- **Namespace-safe element matching is now load-bearing, not optional** (§4.2's own finding):
  Android's `javax.xml.parsers` DOM gives `Element.getLocalName()`/`getNamespaceURI()` on any
  namespace-aware `DocumentBuilder` (`setNamespaceAware(true)`, already required for `DocxComments.
  kt`'s own `w:`/`w15:` handling) — this reader matches every element by `localName`
  (`"threadedComment"`, `"person"`, `"text"`), never a literal (possibly `x18tc:`-prefixed) tag
  string, so it reads a real Google-Sheets-exported file correctly, not just an Excel-authored one.
  T18's own pinning tests exist specifically to catch a regression here, since a same-vendor-only
  fixture would pass either way.
- **The workbook-level `person.xml` relationship** is resolved once per workbook (not per
  worksheet, unlike the comments/vmlDrawing/threadedComment relationships) via `xl/_rels/
  workbook.xml.rels` — a lookup the legacy-Notes predecessor never needed, since a Note carries no
  cross-worksheet-shared part.
- **Grouping by `(ref, id-chain)`** (§4.2's multiple-independent-threads-per-cell finding) replaces
  the legacy reader's simpler "one note per cell" assumption outright — this reader must never
  assume a `ref` implies a single thread.
- **Comment ids are GUID-embedding, not positional, identically to desktop (§4.2/§4.3, design
  review 1, F1):** `xt-{sheetId}-{cell}-{GUID}`, resolved the SAME two-step way (hinted `ref` first,
  then a full-workbook fallback scan, then `'comment-not-found'`) — never "the nth thread at this
  `ref`." This is the one piece of T18/T19 where reusing an ordinal instead would have been an easy,
  wrong shortcut distinct from anything the legacy-Notes predecessor had to get right (a Note's own
  id was always positional-safe, since a cell can hold only one). **The parse itself uses the SAME
  pre-written regex as desktop, checked against the SAME shared test-vector fixture (design review
  round 2, F2):** `^xt-(\d+)-([^-]+)-(.+)$`, group 3 (the GUID) never itself re-split on its own
  hyphens — Kotlin's `Regex` and TS's `RegExp` both read `shared-fixtures/doc-comments/
  id-parse-test-vectors.json` directly in their own pinning tests, so the two runtimes cannot
  silently diverge on this without one of them failing its own suite. **A duplicate-GUID match in
  the fallback scan refuses `'ambiguous-comment-id'`, identically to desktop (design review round 2,
  F3)** — never acts on whichever of two identically-`id`-attributed roots the scan order happens to
  reach first.
- **Write mirrors §4.3's five-step shape exactly**: backup, mint GUID/`dT`, reuse-or-create the
  `providerId="YouCoded"` person entry, wire all new parts on first use, write the placeholder text
  and VML shape verbatim to §4.2's spec, move-by-`ref`-update across the whole id-chain, verify with
  rollback — no new algorithm design versus what §4.3 already specifies, only a Kotlin
  implementation of it, exactly the relationship §3.2a already has with §3.3 for Word. `done`
  (resolve/reopen) is a single attribute set/removed on the root — identical Kotlin logic to the TS
  version, with no marker-string manipulation of any kind (the retired legacy-Notes design's own
  marker-stripping equivalent has nothing to port, since there is no marker any more).
- **`<legacyDrawing>` is always appended as the worksheet's absolute last child element, even after
  an existing `<extLst>` — restated for Kotlin identically to §4.3's own restatement (design review
  round 2, F4 — High).** `DocxComments.kt`'s own equivalent Word-side logic already gets this right
  for `document.xml`'s unrelated element-ordering rules; `XlsxComments.kt` needs the SAME explicit
  rule for `sheet{N}.xml`'s own child sequence, since neither real fixture (`docling`, `elden`) has a
  pre-existing `<extLst>` to force the issue during ordinary testing. T18/T19's own pinning tests use
  the SAME synthetic (not real-fixture-sourced) worksheet-with-`<extLst>` case §4.3's own T12/T13
  fixture defines — one shared synthetic fixture, not two independently hand-built ones, so a
  Kotlin-side and a TS-side element-ordering bug can't each independently pass against a fixture the
  OTHER platform's own version doesn't share.
- **A documented, watched memory risk, unchanged from the prior design (review 2, F16):** loading
  the whole archive into memory, mutating it, and rewriting it whole is reasonable on desktop
  Electron but was never acknowledged for Android specifically until the legacy-Notes design added
  it — carried over unchanged here: `XlsxComments.kt` checks the archive's uncompressed size before
  loading it fully, and a file over a documented (task-time, benchmarked) threshold routes to a
  specific, honest `<ErrorState>` ("this file is too large to edit comments on from the phone")
  rather than risking an OOM crash.

**The reference target is now sourced from two independent REAL files, not desktop's own writer
output** — a stronger target than the retired legacy-Notes T18/T19 pair had, where Android's writer
targeted whatever desktop's OWN `exceljs`-adjacent writer happened to produce (watched for drift
against future `exceljs` bumps, since that writer's output WAS the spec). `shared-fixtures/
doc-comments/xlsx-threaded-reference/`'s two real `.xlsx` files, saved during this redesign's own
research (not regenerated by either platform's writer, and not derivable from any library either
platform ships), are what BOTH T18's read tests and T19's write target check against — closing the
asymmetry where one platform's own code implicitly defined the other's correctness. T18/T19's own
re-run still re-diffs against the checked-in reference on every run (same drift-loudly-not-silently
treatment §4.3a always had), but now against a fixed, externally-sourced target rather than one tied
to a dependency version — a real file `exceljs` never wrote and a future `exceljs` bump cannot drift
away from.

**Move mirrors §4.3's algorithm — no new OOXML shape needed, same reasoning as the retired
legacy-Notes design's own version of this claim (review 3, F2's precedent):** repointing a thread to
a different `[sheet, cell]` pair needs no shape `AddComment` doesn't already build — read the old
cell's thread data out of the parsed `threadedComment<N>.xml` (root + every reply sharing its
id-chain), remove that ref's entries plus the legacy `<comment>`/`<v:shape>` pair, then re-run this
same module's add-thread wiring at the new `[sheet, cell]` address with the SAME ids/text/`done`
state (never minting fresh GUIDs for a move — this preserves reply history and resolve state exactly
as §3.3's own docx Move already does by reusing `w:id`/`w15:paraId`). T21's parity guard (§9.3)
carries a repoint case for xlsx specifically so a Kotlin-side field-naming or ordering slip in the
remove-then-add sequence doesn't go unnoticed, plus (new, since §4.2's own finding makes it
observable for the first time) a multiple-independent-threads-per-cell case, proving a move/resolve
targeting ONE thread on a shared cell never disturbs a sibling thread on the same `ref`.

## 5. Assistant tools

Two surfaces need the same capabilities, because "the assistant" in this app is either a native
harness session or a Claude Code CLI session:

- **Native harness** (`desktop/src/main/harness/tools/`) — in-process; a new tool file can
  `import` the real `doc-comments-store.ts`/`doc-comments-anchor.ts` modules directly, same as
  `edit.ts` imports `fs` directly (`types.ts:337-391`'s `NativeTool<A>` shape: `name`, `description`,
  Zod `inputSchema`, `permissionSubject`, `execute`).
- **Claude Code sessions** — via the app-owned MCP server `claude-code-mcp.ts` deploys per session
  (§9 covers why this is a separate implementation, not a re-export).

Tool set (same names/semantics on both surfaces):

| Tool | Input | Does |
|---|---|---|
| `ReadFileComments` | `{path}` | Every comment on a file, with `status` (`anchored`/`detached`), replies, and resolve history — what the assistant reads before acting on anything else in this list |
| `ReplyToComment` | `{path, commentId, text}` | Appends a reply as `'assistant'` |
| `ResolveComment` | `{path, commentId}` | Marks resolved, `resolvedBy: 'assistant'` |
| `ReopenComment` | `{path, commentId}` | Clears resolved |
| `AddComment` | `{path, selector, text}` | Leaves a new assistant-authored comment |
| `MoveComment` | `{path, commentId, newSelector}` | Repoints a comment's selector — the re-anchor half of R6 |

**`path` on every tool, not just `AddComment` (review 3, F1 — blocker):** an earlier draft of this
table gave `ReplyToComment`/`ResolveComment`/`ReopenComment`/`MoveComment` a bare `commentId`, with
no field through which the model could supply a file even if it tracked one — confirmed against the
mock renderer store (`doc-comments-store.ts:374,385,393`) that an id-only lookup only works there
because the mock keeps every file's comments in one flat in-memory array, which the real, one-
sidecar-per-file store (§1.3) doesn't have. Every one of these four tools' Zod `inputSchema`
(native, T8) and JSON-Schema `inputSchema` (MCP, §5.3, T9a) now includes `path` as a required field,
matching §1.6's IPC payload fix. The assistant always has `path` in hand before calling one of these
four — either it just called `ReadFileComments{path}` (whose returned `PersistedComment.path` field
names the file each comment lives in) or it is acting on a reference the user handed it, which
always names a file (§6.2's wire grammar has no path-less form except the `chat`/`kind` case, which
has no `commentId` to act on in the first place).

`ReplyToComment`/`ResolveComment`/`ReopenComment`/`MoveComment` work identically whether the
target is a `PersistedComment` (§1) or a Word/Excel-native one (§3, §4) — the tool takes a
`path` + `commentId` regardless of backing format; which write path it dispatches to is an
implementation detail of `doc-comments-store.ts`, not something the assistant needs to know.

### 5.1 R4 — sparse, never narration

This is enforced entirely through the tool's `description` field, the same mechanism every other
native tool uses to shape when a model reaches for it (there's no separate policy engine for tool
*usage frequency* elsewhere in the codebase, so this doesn't invent one). `AddComment`'s
description states the constraint directly, not just as a hint:

> "Leave a comment on this file — sparingly. Use this only for something that clearly needs the
> user's attention or a decision from them, never to narrate what you just did or are about to do.
> If you're explaining your own edit, say so in your reply to them instead; if nothing needs their
> decision, don't add a comment at all."

`ReplyToComment`/`ResolveComment` carry no such restriction — replying to and resolving a comment
the user already left is exactly what R2/R3 ask for, without limit.

### 5.2 R5 — editing the file is out of scope here, on purpose

R5 ("the assistant can edit a file to fix what a comment asks, following its existing
edit-approval rules") needs **no new tool and no change to `permission-engine.ts`**. The assistant
already has `Edit`/`Write` (`desktop/src/main/harness/tools/edit.ts`, `write.ts`) gated by the
existing centralized `decidePermission()` (`permission-engine.ts:22-49`) — a comment is context for
*why* the assistant chooses to call those tools, not a new capability. The only place this design
touches editing is `MoveComment`/R6: once an edit lands, the assistant decides — using the SAME
judgment any reply/resolve/move already requires — whether to call `ReplyToComment`, `ResolveComment`,
`MoveComment`, or some combination, on the comment whose text it just changed.

### 5.2a The six comment tools' OWN permission gate — DECIDED: option 1 (review 2, F8)

**Decided (Destin, 2026-09-27, chat: "fine w A"): option 1.** Word/Excel-targeted comment
mutations use `permissionSubject: (a) => a.path` at the `Edit`/`Write` tier; plain-text/markdown/code
sidecar mutations are ungated (`permissionSubject` returns `undefined` for them). T8 and T9a wire
exactly this. Ratify on the acceptance deck.

§5.2 above correctly covers R5's own scope (Edit/Write for CONTENT changes), but review 2 (F8) found
a separate, real gap this design left silent: the six comment tools THEMSELVES have no specified
`permissionSubject`. `NativeTool<A>.permissionSubject` (`types.ts:357`) is a REQUIRED field — a T8
implementer building `AddComment` etc. without this spec would have had to invent a default with no
guidance, and `decidePermission()`'s own safe default when nothing matches is `ask`, never
silent-allow (`permission-engine.ts`). These tools are not uniformly low-risk the way
`send-user-file.ts:44`'s `permissionSubject: () => undefined` precedent is — that tool sends an
already-approved file, it never writes:

- For a **plain-text/markdown target**, a comment mutation only ever touches the inert
  `.youcoded/comments/<path>.json` sidecar (§1.1) — never the source file's own bytes. This is
  internal app metadata, the same class of write the artifacts sidecar already makes without going
  through `decidePermission` at all.
- For a **Word/Excel target**, `AddComment`/`MoveComment`/`ReplyToComment`/`ResolveComment`/
  `ReopenComment` write DIRECTLY into the live document's own XML (§3.3 step 2: "insert
  `w:commentRangeStart`/`End`... into `document.xml`"; §4.3a's OOXML wiring touches the worksheet's
  own `<legacyDrawing>` relationship). This is functionally an edit of that file's real content —
  the exact thing R5 says should follow "existing edit-approval rules" — but reaches disk with no
  `Edit`/`Write` call and, unless gated here, no approval prompt at all. F5/F17's automatic
  backup+verify+rollback protects against data LOSS from a bad write; it does nothing about CONSENT
  to make the write in the first place.

**This is flagged for Destin's decision, not decided silently, because either resolution changes
what he experiences from what he signed off on.** His reopen-1/contract wording — "the assistant can
reply, resolve, add sparingly, and edit the file following its existing edit-approval rules" — reads
comment actions as separate from, and more frictionless than, "edit the file." The options:

1. **Gate only Word/Excel-targeted mutations** at the same approval tier as `Edit`/`Write`
   (`permissionSubject: (a) => a.path`, the comment's backing file), leave plain-text/markdown
   sidecar mutations ungated. *Pro:* matches the risk difference exactly — a gate exists precisely
   where real document bytes change; plain comments (the common case) stay as frictionless as
   Destin's "sparingly" wording implies. *Con:* the assistant now gets an approval prompt the FIRST
   time it replies to or resolves a Word/Excel comment — a behavior Destin hasn't specifically seen
   or approved. **This is the technically recommended default** — it treats "writes to your real
   file" and "writes to an app-only reply log" differently, exactly how `Edit`/`Write` already treat
   a file's content versus everything else in this codebase.
2. **Gate every comment mutation the same as `Edit`/`Write`, for every target type.** *Pro:* simplest
   rule, no dispatch-by-file-type logic. *Con:* adds an approval prompt to the plain-text case too,
   which is pure internal app metadata today and was likely understood as friction-free "sparingly"
   commenting — a bigger UX change than Destin asked for.
3. **Leave every comment tool ungated** (`permissionSubject: () => undefined`, matching
   `SendUserFile`'s one precedent). *Pro:* zero new approval prompts, matches how the mockup behaves
   today. *Con:* the assistant can autonomously rewrite a live Word/Excel file's internal XML with no
   consent step at all — a real, silent asymmetry with how the SAME class of write (an `Edit` call on
   that file) already requires approval.

Whichever option Destin picks, T8/T9a specify the chosen `permissionSubject` explicitly rather than
leaving it for a build subagent to invent. This decision does not block starting T1/T2/T10/T12 — only
T8/T9a's `permissionSubject` wiring waits on it.

### 5.3 MCP tool definitions

`claude-code-mcp.ts`'s `SendUserLink` (`desktop/src/main/claude-code-mcp.ts:59-88`) is the
template: hand-rolled JSON Schema `inputSchema`, a `description` string, and a `callTool` handler
that validates then replies `{content:[{type:'text', ...}], isError}`. The six tools in the table
above get the same treatment, added to the SAME embedded server script (or a sibling one deployed
alongside it — a task-time call, not a design constraint) and to `--allowedTools` at spawn. Unlike
`SendUserLink`, which does nothing but validate and reply (the Deliverables card renders itself
from the tool_use event already visible in Claude Code's own transcript — `handle()`'s
`tools/call` path performs no side effect today), these six tools have to actually mutate stored
state, which is where §9's dependency-free-script constraint becomes load-bearing. **The `path`
field on `ReplyToComment`/`ResolveComment`/`ReopenComment`/`MoveComment`'s JSON-Schema `inputSchema`
(review 3, F1) is not optional here specifically:** this MCP script is a fresh, dependency-free
process spawned per Claude Code session with no warm cache from any prior call, so it is the surface
where an id-only lookup was most sharply unbuildable — a `path`-less schema would leave the model
with no field to fill in at all, not just an inconvenient extra round trip.

## 6. What the assistant receives for "Ask about this" and "Ask Your Assistant"

### 6.1 The bug being fixed

`compose-ref.ts`'s `encodeRefMarker` (line 65-67) produces
`` `⦃${encodeURIComponent(JSON.stringify(ref))}⦄` `` — the literal text that reaches the
model (whatever's typed into the composer, or piped to the Claude Code CLI's stdin, is exactly
what the model sees as the user's turn). Today a message reading "Can we get a screenshot of
these five screens?" with one "Ask about this" chip actually arrives at the model as that
sentence followed by roughly:

```
⦃%7B%22id%22%3A%22ref-abc%22%2C%22label%22%3A%22%E2%80%9CToday%27s...%22%7D⦄
```

— unreadable, and (per the handoff) exactly the open question this build stage has to close.

### 6.2 The fix: same delimiters, readable payload, PTY-safe

The `⦃…⦄` delimiters stay (still inert — never appears in ordinary prose, per `compose-ref.ts`'s
own reasoning at lines 50-52) but the payload inside changes from percent-encoded JSON to a
fixed, legible grammar built from fields the `ComposeRef` already carries.

**PTY-safety (review 1, F12 — major):** today's marker is percent-encoded JSON, and
`encodeURIComponent` guarantees zero literal spaces in the encoded text — confirmed real and
deliberate (`compose-ref.ts:65-67`). YouCoded types Claude Code CLI input through a PTY with a
documented whitespace-mangling risk (`desktop/CLAUDE.md`'s `pty-worker.js`: atomic single-write only
under 56 bytes, echo-driven chunked submit above that; `chat-reducer.ts:69-71`'s `sameUserMessage`
carries a whitespace-insensitive comparison branch specifically because "a pasted tab swallowed as
the Tab key" can alter spacing in transit). An earlier draft of this section put literal spaces into
the STRUCTURAL parts of the new grammar (the `" — "`/`, lines `/`cell `/`, sheet ` separators) — the
part actually under this design's control, unlike a user's own prose, which already flows through
chat messages today. Losing or shifting one of those literal separator bytes at a PTY chunk boundary
is exactly the failure mode `sameUserMessage`'s fuzzy match exists to paper over elsewhere, and none
of the originally-listed pinning tests (pure encode/decode round-trips) would have caught it. Fixed
by making every structural separator underscore-joined (`_`), not space-joined — inert, single-byte
ASCII, and never relied on for anything else in this grammar. The exact quote and path VALUES
themselves keep their own real characters (including any of their own literal spaces) unchanged: the
parser locates them structurally (the quote by its `"…"` marks, the path/suffix by fixed position and
recognizable prefixes), never by splitting on whitespace, so this fix touches only the syntax this
design invents, not the user's own file paths or quoted text:

**Escaping (review 2, F7; corrected by T7's own implementation review, F1/F2 — the earlier draft of
this grammar had no escape rule at all, and review 2's first escape rule was itself incomplete):**
today's `encodeURIComponent(JSON.stringify(ref))` is fully escaped by construction — nothing in a
real quote or path can break it. The grammar below needs its own explicit rule to keep that
property. Review 2's fix escaped only a quote's own `"`, and located a quote's closing mark as the
LAST `"` immediately followed by a recognized trailing token — **T7's implementation review found
this incomplete on two counts, both now fixed:**

- **F1 (high):** a `"` is legal in a path on Linux/macOS. With only the quote's own `"` escaped, a
  path containing one (e.g. `evil"_hijacked.md`) could put an unescaped `"` right before a `_` —
  exactly the shape the LAST-match rule was watching for — and hijack decoding into the wrong quote
  AND the wrong file. Fixed two ways, kept together: the path's own `"` (and `\`) are now
  backslash-escaped the same way a quote's `"` already was (`escapePath`, mirroring `escapeQuote`),
  so no unescaped `"` can survive inside a path at all; **and** the parser now takes the FIRST
  unescaped `"` followed by a trailing token, not the last — the true closing quote is always the
  first one once the quote's own contents are correctly escaped, so this no longer depends on every
  caller having escaped its path correctly either.
- **F2 (medium):** the path/suffix split was an END-anchored regex over the RAW (unescaped)
  remainder, so an extension-less path that itself ends in something shaped like `_L2-3` or
  `_cell_A1` (e.g. `notes/draft_L2-3`) was misread as a real line-range/cell suffix, truncating the
  path. Fixed by also escaping a path's own literal `_` (the one character this grammar reserves as
  its own separator) and splitting LEFT-TO-RIGHT for the first unescaped `_` instead of pattern-
  matching the end of the string — the path's own underscores are never unescaped, so the only
  unescaped `_` that can exist is the real structural separator this grammar itself inserts (or none,
  meaning no suffix at all).

Both fixes use one escaping rule, general rather than quote-specific: `escapeText` backslash-escapes
`\` first, then the caller's own problem characters (`"` for a quote; `"` and `_` for a path); the
matching `unescapeText` reverses either in a single left-to-right pass, because every backslash in an
escaped string is there only to introduce the next character literally, however many backslashes the
original text itself happened to contain. This resolves every gap review 2's F7 and T7's review
found: an embedded quote (`He said "stop it" and left` → `⦃"He said \"stop it\" and left"_docs/foo.md⦄`)
parses correctly because the parser isn't fooled by an interior `"`; a quote or path's own `\` no
longer risks being misread as escaping the wrong thing; and an underscore inside a real path
(`2026_09_24_plan.md`) is never mistaken for a structural separator because the path is escaped
before it ever reaches the wire, not merely located "structurally" by markers that turned out not to
be unambiguous on their own. T7's tests cover an embedded quote mark, an underscore in a path/quote,
a `"` inside a path (including immediately before a `_`, and at the very end), and a `\` inside a
path or a quote.

- **A quoted-text reference** (`kind: 'doc'`, no `commentId`/`commentIds` — an ephemeral "Ask
  about this," not a saved comment): `⦃"<exact quote, \" escaped>"_<escaped path>[_L<start>-<end>|_cell_<C>_<S>]⦄`
  e.g. `⦃"Today's first-run flow shows five screens before the composer is reachable"_docs/active/plans/2026-09-24-onboarding-redesign.md⦄`.
  A model reading this sees a normal quoted excerpt and a file path — it can act on it with its
  existing Read/Grep tools without needing any new tool at all, because the quote text IS enough
  to locate the span (the same substring-search tolerance §2's `resolveSelector` uses). The path
  is escaped on the wire (`escapePath`) and unescaped back to its real characters on decode, so a
  model reading a marker whose path happens to contain an escaped `\_`/`\"` sees only one extra
  backslash it can safely ignore — the file's real name is still recoverable by eye.
- **A comment reference** (`commentId` set — from clicking an existing thread's chip, or the
  single-comment case of "Send to assistant"): adds the id so the assistant can call
  `ReplyToComment`/`ResolveComment` directly instead of re-finding the text:
  `⦃comment_c-<id>_"<quote>"_<path>⦄`.
- **A chat/code-block reference** (`kind: 'chat'`, no `path` — added review 2, F2): `compose-ref.ts`'s
  `ComposeRef` has a live, shipped `kind: 'chat'` variant, pathless, keyed by `entryKey`
  (`build-menu.ts:293,423` construct these today for "Ask about this" on a chat message or an
  in-chat code block; `chat-ref-highlight.ts:29-30` resolves hover/click-to-source purely off
  `entryKey`). The three forms above are all `path`-requiring and would silently break every existing
  chat-message/code-block "Ask about this" — a regression of a shipped, R15-covered feature — if
  shipped as the only forms. A fourth, pathless form closes this: `⦃chat_<entryKey>_"<quote>"⦄`. T7
  adds a pinning test that a chat-message/code-block "Ask about this" still round-trips and still
  resolves via `chat-ref-highlight.ts`.
- **The Ask Your Assistant summary chip** (`commentIds` set, §5's whole reason for existing):
  `⦃<N>_open_comments_<escaped path>_use_ReadFileComments_to_read_them⦄`. This one deliberately
  does NOT inline every comment's text (`CommentsFloatingActions.tsx`'s own comment: *"The comments
  themselves reach the assistant through its comment tools (real build), not the chip"* —
  §5.3/§9's `ReadFileComments` is what actually delivers the content; the chip is a pointer, on
  purpose, so this design doesn't duplicate comment bodies into every future turn's context). A
  decoded chip therefore cannot recover WHICH comments it covered, only the count and the path —
  **T7's implementation review, F3 (high):** this meant the SENT chip stopped highlighting anything
  on hover and stopped opening the comments panel on click, since both used to key off
  `commentIds`, which the wire form never carries. Fixed without adding ids to the wire text:
  `use-ref-source-highlight.ts`'s `rangeFor` and `ReadingHighlights.tsx`'s jump listener recognize
  a decoded summary chip by its SHAPE (`kind: 'doc'` with a `path` and no `quote`/`commentId`/
  `cell`/`lineRange` — the one shape only this form ever produces) and look up "every currently
  open comment on this path" from the live store (`commentsForPath(path).filter(c => !c.resolved)`)
  instead of from the wire text — hover lights up all of them, and a click opens the panel focused
  on the first one. The jump listener sets `handled` only when it actually opened something, so a
  summary chip whose file is genuinely closed still falls through to `jumpToRef`'s own `openFile`
  path.

`splitComposeRefs`'s parser (`compose-ref.ts:79-95`) changes from `JSON.parse(decodeURIComponent(...))`
to a small grammar parser matching the forms above, reconstructing the same `ComposeRef` shape the
renderer needs for the pill (quote, path, cell/sheet, commentId(s)) and converting underscore
separators back to display spacing only for the rendered pill, never for the wire text itself. A
marker that doesn't parse (hand-edited, truncated, or an old-format leftover — none should exist
since nothing has shipped yet, but the parser degrades to plain text rather than throwing, same as
today's `catch` block) never crashes a render.

**The draft-token layer (review 1, F11 — major):** `compose-ref.ts` has a SECOND encoding layer this
section originally never mentioned — `makeDraftToken`/`splitDraftTokens`/`draftTokenRanges`/
`expandDraftTokens` (`compose-ref.ts:141-213`, confirmed real). The composer textarea never holds the
full `⦃…⦄` marker while typing; it holds a short zero-width "draft token" so a 150+ character
invisible blob doesn't throw off caret position, and `expandDraftTokens` is the ONLY place that
expands a draft token into the full wire marker, at send time (`InputBar.tsx:783`:
`buildOutgoingMessage(expandDraftTokens(effectiveMessage), …)`). T7's scope is not just
`encodeRefMarker`/`splitComposeRefs` in isolation — it explicitly includes this draft-token layer,
because `makeDraftToken`'s registry and `expandDraftTokens`'s expansion must keep working against the
NEW wire format, and a pinning test types a reference through as a draft token, sends it, and confirms
`expandDraftTokens` produces the new grammar correctly, not just that `encodeRefMarker` does in
isolation.

### 6.3 Chips still render in the sent bubble

Nothing about `UserMessage.tsx` (`splitComposeRefs` → `TokenPill`, lines 12, 83-91) needs to
change beyond the parser update in §6.2 — it already decodes whatever `splitComposeRefs` returns
into the same pill component. The reconciliation path in `chat-reducer.ts`'s `TRANSCRIPT_USER_MESSAGE`
case keeps the **locally-created** `entry.message` object once `sameUserMessage` matches it against
what Claude Code recorded (`chat-reducer.ts:1500-1508`) — so the rich marker text a user typed and
the plain text a resumed session shows are the same string either way in this design (unlike the
attachment case, which already tolerates the two differing). No new normalization is needed in
`sameUserMessage` because the sent text and the rendered text are identical under this design —
only their *previous* JSON-blob form was the thing worth objecting to, not the idea of an inline
marker at all.

## 7. Replacing the renderer's in-memory store

`useDocComments(path)` (`doc-comments-store.ts:431-447`) is the ONE hook every comment component
reads (`DocCommentsApi`: `comments`, `focusId`, `showResolved`, `setShowResolved`, `addComment`,
`setCommentText`, `addReply`, `resolveComment`, `reopenComment`, `removeComment`, `clearFocus`).
**That interface does not change.** The build replaces the module's internals:

- The module-level `snap`/`subs`/`publish` `useSyncExternalStore` pattern (lines 310-335) stays —
  it's the right shape for "many components read one slice," it just needs to hydrate from
  `docComments:list` instead of `seedComments()`, and to push mutations through
  `docComments:add/reply/resolve/reopen/move` instead of mutating the in-memory array directly,
  reconciling on the `docComments:changed` push (or the response of its own just-issued mutation,
  optimistically, the same way most other IPC-backed stores in this app already update
  optimistically then reconcile).

  **`DocCommentsApi` staying id-only is what §1.6's added `path` field (review 3, F1) is FOR:**
  `useDocComments(path)` already closes over `path` as its own argument, so `addReply`/
  `resolveComment`/`reopenComment`'s exposed signatures need no change at all — the hook's internals
  inject the closed-over `path` into the underlying `docComments:reply/resolve/reopen/move` IPC call,
  exactly the way `addComment` already injects `path` into its own call today (`doc-comments-
  store.ts:337`, `useDocComments`'s own `addComment: (quote, sourceLabel, opts) => addComment(path,
  quote, sourceLabel, opts)`). This is the one caller for whom `path` was never the missing piece —
  the renderer always has the open file's path — which is exactly why F1's gap was invisible from
  the renderer alone and only showed up at the native-tool and MCP surfaces, which have no closure to
  borrow a path from.

  **Id authority and rollback-to-UI, specified explicitly (review 2, F9 — major):** the renderer
  mints a comment's id (`c-${randomUUID()}`, §1.2's own shape) and passes it to `docComments:add`;
  main never re-mints one — this keeps `addComment`'s existing synchronous string-return contract
  intact even once the call becomes a real async IPC round trip underneath, since the id shown
  optimistically is always the id that lands. For every mutation whose backing write can fail AFTER
  being shown optimistically (add/reply/resolve/reopen/move on a Word/Excel target, whose write goes
  through §3.3/§4.3's verify-after-write-with-automatic-rollback), `docComments:*`'s response carries
  an explicit failure shape (`{ok:false, error}`), and `useDocComments`'s internals revert the
  optimistic entry to its pre-mutation state and surface `<ErrorState>` (`components/ui/states.tsx`,
  `message` + `onRetry` — `error-message-standards.md`'s `mode="recoverable"` copy fits) with
  `onRetry` wired to replay the exact same mutation. This is new wiring, not new UI —
  `CommentCard.tsx` already has a place to render an error state for the detached case (§2.3); a
  failed mutation reuses it.

  **The reconcile rule, specified explicitly (design review round 2, F1) — how an optimistic entry
  and a push-triggered re-`list()` are merged without duplicating or losing anything:** every
  mutation the renderer issues optimistically is tracked in a small in-flight set, keyed by a
  client-generated `clientId` (distinct from the eventual persisted id) — reusing exactly the
  `useSyncExternalStore` module already tracks its optimistic entries in (no new state shape). The
  rule:
  1. **A `docComments:changed` push never merges field-by-field with existing state — it always
     REPLACES this path's whole `comments` array with a fresh `docComments:list()` read.** The fresh
     read is authoritative by construction (it's the file, right now); the in-memory array is never
     patched piecemeal against it.
  2. **Every entry still in the in-flight set at the moment a push lands is re-appended after the
     fresh list**, so a mutation the user is still waiting on doesn't visually vanish out from under
     them mid-request — UNLESS the fresh read's own content already reflects that specific mutation's
     effect (e.g., a reply with the same `clientId`-correlated author+text+parent already present,
     for the case where the underlying write actually succeeded and the watcher's push simply arrived
     before this call's own IPC response did — a genuine race, not a bug, since both the write and the
     file-settle detection are real, independent async events). In that case the in-flight entry is
     dropped from the re-appended set immediately (the fresh read already has the real thing) rather
     than shown twice.
  3. **A mutation's OWN response is still the PRIMARY, fastest reconciliation path, unchanged from
     the id-authority paragraph above** — for `reply` specifically, receiving the persisted
     `CommentReply` (§1.6's new response shape) replaces the optimistic entry in place and removes it
     from the in-flight set immediately, typically well before any push arrives at all; a push that
     arrives afterward for the SAME change is simply a no-op replace (the fresh read matches what the
     response already corrected the UI to).
  4. **A response that resolves `{ok:false, error}` after a push already landed** (the race the other
     direction — rare, since a failed write never settles the file, so the watcher has nothing to
     react to — but possible if some OTHER change landed on the same push) removes the failed entry
     from the in-flight set and shows `<ErrorState>`, unaffected by whatever the unrelated push did.

  This is one rule, uniform across add/reply/resolve/reopen/move and every target type (plain-text
  sidecar included, even though only `.docx`/`.xlsx` newly gets a live push this round — a
  plain-text pane already had a push, just never a precisely-specified merge rule for it either).
- `removeComment` (line 399-401) has no contract row asking for permanent deletion (the closest is
  resolve, which is reversible) — keep the function for the mock/workbench path only; the real
  store does not expose a delete IPC channel unless a later contract row asks for one.
- **Seed data** (`seedComments()`, lines 88-308) moves to `desktop/src/renderer/dev/workbench/mock-shim.ts`
  behind the existing `docComments.*`-style mock namespace (the pattern every other still-mocked
  feature already uses — see `mock-only.ts`'s header: *"the mock namespace in mock-shim.ts STAYS —
  the workbench still needs fixture data"*), so `?mode=workbench` keeps showing every comment state
  (open/replied/resolved/detached/Word/Excel) without a real backend, exactly like every prior
  feature this registry has tracked.
- **`MOCK_ONLY` entries**: none exist for doc-comments today (the mockup never touched IPC at all —
  it's pure renderer memory), so this is additive, not cleanup. While the real channels are being
  built, add rows for whichever `docComments:*` channels a given task's mock-shim fixture fronts
  ahead of its backend (`mock-only.ts`'s own convention: *"Adding an entry is the SUPPORTED way to
  design UI ahead of its backend"*); remove each row the moment its channel lands on all five
  surfaces, per the registry's own rule — never delete the fake in `mock-shim.ts`, only the "no
  real backend" claim.

## 8. Task breakdown

Sized for one subagent each. "Pre-written" means the schema/algorithm should be nailed down and
handed to the task rather than left for the subagent to invent — needed wherever three separate
runtimes (TS main, the dependency-free MCP script, Kotlin) have to agree on a wire/file format
without a shared import to enforce it. **Reopen-1 (Destin: full Word/Excel comment support on the
phone, `doc-comments.reopen-1.answers.json`) adds T16-T21** — Android gets a real Kotlin
implementation of the same docx/xlsx read/write/backup/verify/rollback algorithm §3.2a/§4.3a specify,
plus its own half of the MCP pending-mutation queue and the cross-platform golden-fixture test that
proves the two implementations actually agree (§9.2/§9.3). This raises "three separate runtimes" to
four load-bearing agreement points for docx/xlsx specifically (TS main and Kotlin both now parse/write
the OOXML; the MCP script and its Android twin both now need a pending-mutation queue reaching a
capable runtime) — the estimate Destin was shown when reopening this ("roughly two to three more
build tasks") undercounts what a byte-identical, verified two-platform OOXML writer actually takes;
six tasks (T16-T21) is the honest count once xlsx's hand-rolled four-part OOXML wiring (§4.3a) is
accounted for.

| # | Task | Depends on | Pre-written or description | Pinning test(s) | Key risk |
|---|---|---|---|---|---|
| T1 | `desktop/src/shared/doc-comments-types.ts` + main-process store (`list`/mutate via `mutateFileUnderLock`, project-relative + fallback path resolution, **path containment check** — review 1 F3, corrected review 2 F1) | — | **Pre-written schema** (§1.1's TS shape ships as the task's spec, not invented mid-task); **pre-written containment algorithm** (§1.5: realpath the project root AND the full joined path — `write-authorization.ts`'s `judgeRelativeRecord()` shape, not `git-service.ts`'s shallower one; a not-yet-existing leaf walks up to the nearest existing ancestor first — review 2, F1) | new unit tests: read-modify-write, concurrent-lock behavior, missing-file default, fallback path for a project-less file, **`../../etc/passwd`-shaped, absolute-path, AND symlink-inside-the-project containment refusal (F3; symlink case added review 2, F1)**, **lock-path canonicalization (project root only, never the possibly-nonexistent leaf — review 2, F3) + a TRUE concurrent-write test, not just sequential (F4)** | Getting this schema wrong is expensive — T4/T8/T9a/T10/T12 all build on it. Freeze it before parallel work starts. A missed containment check is a path-traversal write bug, not a style nit. |
| T2 | `desktop/src/shared/doc-comments-anchor.ts` (`resolveSelector`) | T1 (types) | Pre-written algorithm (§2.2), **one edit-distance-minimizing scoring function subsuming the out-of-range-`occurrence` fallback and the tie-break rule (review 1, F9a/F9b; unified review 2, F14 — "position" is now one concrete metric, not two rules that can conflict)** | exact match; moved text (prefix/suffix intact, position shifted); ambiguous repeated phrase; not-found → `'detached'`; cell-not-found; **occurrence-index-out-of-range resolves to the best-scoring remaining candidate, never a fixed clamp (F9a)**; **a scoring tie resolves deterministically by the same scoring metric, not array order (F9b)**; **a combined case — out-of-range occurrence AND a tie among the remaining candidates — in one test (F14)** | Anchoring correctness is the feature's whole trust model — under-test this and "text no longer found" fires on text that IS still there. §2.2 also flags mammoth-render stability as a documented, watched risk (F9c) rather than a test to build now. |
| T3 | IPC surface: `docComments:*` on preload/ipc-handlers/remote-shim/remote-server + chokidar watcher (`ignored: '**/.pending/**'` — review 2, F20) + `docComments:changed` broadcast; **register `docComments:watch`/`:unwatch` in `remote-shim.ts`'s `REJECT_ON_NOT_OK` (review 1, F10)**; **a real `docComments:watch`/`:unwatch` chokidar-backed relay in `remote-server.ts`, mirroring `artifacts:watch-project`'s existing pattern — remote is NOT the same gap as Android (review 2, F6)**; **`reply`/`resolve`/`reopen`/`move` payloads gain a required, containment-checked `path` field (review 3, F1)**; **the second, per-document `.docx`/`.xlsx` watcher, refcounted by absolute path, wired into the SAME `watch`/`unwatch` entry points (design review round 2, F1 — §1.5)**; **`reply`'s response is enriched to return the persisted `CommentReply` (design review round 2, F1 — §1.6); `resolve`/`reopen`/`move` responses are deliberately left as `{ok:true}`, per §1.6's own reasoning** | T1 | Description | `ipc-channels.test.ts` additions; `main-blocking-calls.test.ts` stays clean; a watcher-debounce test; **a per-document watcher test: a direct write, a pending-mutation-queue-applied write, and a raw external overwrite of a `.docx`/`.xlsx` fixture all trigger exactly one `docComments:changed` for that path, refcounted correctly across two simultaneous watchers on the same file (design review round 2, F1)**; **`reply`'s IPC response carries the real persisted id, asserted against a fixture where the reply's ordinal isn't `1` (design review round 2, F1)**; **path-containment refusal test at the IPC payload surface, including a symlink case (F3/F1), now exercised on ALL SIX channels, not just `list`/`add` (review 3, F1)**; **a `REJECT_ON_NOT_OK` regression test for `docComments:watch`/`:unwatch` (F10)**; **a remote-server relay test proving a WS-connected browser gets an unprompted push on a comment change (F6)**; **a `.pending/`-directory-churn test proving no `docComments:changed` fires for pending-mutation-queue file churn (F20)**; **a `reply`/`resolve`/`reopen`/`move` call against a comment whose sidecar was never previously `list()`-ed in this process succeeds (review 3, F1)** | Forgetting a surface (5, not 4 — ipc-bridge.md's own correction) breaks remote silently. Skipping the `REJECT_ON_NOT_OK` registration lets a failed watch read as "subscribed, no changes yet." Conflating Android's real gap with remote's non-gap (F6) would silently regress remote-browser UX below the adjacent Files feature. Shipping `reply`/`resolve`/`reopen`/`move` without `path` (review 3, F1) makes them literally uncallable against an uncached file. |
| T4 | Android `SessionService.kt` parity for `docComments:*` on **plain-text `PersistedComment` files** (real Kotlin `java.io.File` read/write, dispatching to `DocxComments.kt`/`XlsxComments.kt` for `.docx`/`.xlsx` targets — T16/T17/T18/T19 below, not this task); `watch`/`unwatch` answer **`{ok:false, error:'not-implemented-on-mobile'}` via an explicit branch (review 1, F10 — corrected from the earlier `{unsupported:true}` citation, which is a different no-branch-at-all mechanism)** for every file type, unchanged by reopen-1; **resolves `reply`/`resolve`/`reopen`/`move` via the same required `path` field as desktop, not an id-only lookup (review 3, F1)** | T3 (needs final channel/payload shapes) | **Pre-written wire format** (T1's schema doc, not re-derived); **pre-written response shape for the watch refusal** (§1.6) | shared JSON fixture both platforms round-trip; ipc parity guard; **an exact-JSON-shape test for the `docComments:watch` not-implemented-on-mobile response (F10)**; **the same never-previously-listed cold-start test as T3, run against the Kotlin implementation (review 3, F1)** | A schema drift here is invisible until an Android build actually runs — flag as needing a real Android build check (CLAUDE.md's own "CHECK, don't assume" rule on SDK presence). |
| T5 | Renderer: rewrite `doc-comments-store.ts` internals against real IPC, keep `DocCommentsApi` unchanged, move seeds to `mock-shim.ts`, add/remove `MOCK_ONLY` rows as channels land; **implement §7's own reconcile rule (design review round 2, F1) — a `clientId`-keyed in-flight set, a push always replaces the whole array (never a field-by-field patch), an in-flight entry re-appends after a replace unless the fresh read already reflects it** | T3 | **Pre-written reconcile rule** (§7) | existing comment component tests keep passing unmodified (proves the interface didn't move); a workbench fixture-state test; **a race test: issue a reply, then deliver a `docComments:changed` push before the reply's own IPC response resolves, asserting no duplicate card and no lost reply (design review round 2, F1)**; **a push arriving for an unrelated change while a DIFFERENT mutation is still in flight leaves the in-flight one visible, not dropped (F1)** | Any interface drift here silently breaks the ALREADY-APPROVED UI — treat every `comments/*.tsx` test as a regression gate, not just new tests. Getting the reconcile rule wrong either duplicates a reply visibly or makes one flicker and vanish. |
| T6 | "Text no longer found" UI on `CommentCard.tsx` (small, additive) | T2, **T14 (F2, T5 implementation review — nothing computes `status: 'detached'` before T14 wires `resolveSelector` into the live viewer; a T6 built against T2 alone has no real signal to render against)** | Description | a detached-state render test | Small enough to qualify for feature-flow's short route — confirm with Destin before skipping a review deck for it. **Building this before T14 lands means testing against a hand-set `status` that nothing in the real app ever produces yet — fine for the component test itself, but don't treat that as end-to-end proof.** |
| T7 | `compose-ref.ts` wire-format rewrite (§6.2/6.3), **including the draft-token layer** (`makeDraftToken`/`splitDraftTokens`/`expandDraftTokens`/`draftTokenRanges` — review 1, F11); **a fourth, pathless grammar form for `kind:'chat'` refs (review 2, F2)**; **an escape rule for an embedded `"` and a structural-separator character inside a real quote/path (review 2, F7)** | T1 (comment ids exist) | Pre-written grammar (§6.2's now-FOUR forms, **underscore-joined structural separators, no literal space in the delimiter syntax this design controls — F12**; **backslash-escaped interior `"`, closing quote located as the LAST `"` before a recognized trailing token — F7**) | encode/decode round-trip per ref kind (now including `kind:'chat'`, F2); a "no percent-encoding or JSON braces, and no literal space in the structural syntax" snapshot test; **a test that types a reference through as a draft token, sends it, and confirms `expandDraftTokens` produces the new grammar correctly (F11)**; **an end-to-end test that sends a message containing the new marker through the actual PTY submit path and confirms it arrives byte-identical (F12)**; **a chat-message/code-block "Ask about this" round-trips and still resolves via `chat-ref-highlight.ts` (F2)**; **an embedded-quote-mark case and an underscore-in-path/quote case both parse correctly (F7)** | Must not regress hover/click-to-source (`use-ref-source-highlight.ts`) — run its existing tests, don't just add new ones. A structural-separator regression to literal spaces is invisible in a pure-function test, only in the PTY e2e test. Shipping the grammar as three path-only forms (its pre-review-2 shape) breaks every live chat-message/code-block reference — a regression of a shipped, R15-covered feature, not a new-feature edge case. |
| T8 | Native tools: `ReadFileComments`, `ReplyToComment`, `ResolveComment`, `ReopenComment`, `AddComment`, `MoveComment` in `desktop/src/main/harness/tools/`, **each with an explicit `permissionSubject` per whichever option Destin picks in §5.2a (review 2, F8) — not left for this task to invent**; **`ReplyToComment`/`ResolveComment`/`ReopenComment`/`MoveComment`'s Zod `inputSchema` gains a required `path` field (review 3, F1) — the same field §5.2a's own `(a) => a.path` permission-subject example already assumed existed** | T1, T2 | Description (tool descriptions themselves are pre-written, §5.1/§5's table — copy verbatim, don't paraphrase) | per-tool execute tests; `tool-registry-manifest.test.ts` update; **a path-containment refusal test at the tool-argument surface, including a symlink case, since a tool's `path` is model-controlled input (F3/F1), now exercised on all four mutation tools, not just `AddComment` (review 3, F1)**; **a permission-gate test confirming the chosen `permissionSubject` actually routes through `decidePermission()` for Word/Excel-targeted mutations (F8)**; **a call against a comment whose sidecar was never previously `list()`-ed in this process succeeds given only `{path, commentId, ...}` (review 3, F1)** | `AddComment`'s description drifting from the exact "sparingly" wording is how R4 quietly regresses later. Do not start this task's `permissionSubject` wiring until §5.2a's decision is back from Destin — everything else in this row is unaffected. Shipping these four tools with a bare `commentId` (no `path`) makes them uncallable against a comment the model hasn't already got cached (review 3, F1). |
| T9a | Claude Code MCP: extend `claude-code-mcp.ts`'s deployed server with the six tools' JSON-RPC definitions, dependency-free plain-file store read/write (§9), citing `chatsearch.js`'s atomic tmp-write+rename **ONLY** for the write mechanics — **the mutual-exclusion/lock half is novel, not ported; `chatsearch.js` has no mutex anywhere in it (review 2, F12 corrects the original citation)**; **`ReplyToComment`/`ResolveComment`/`ReopenComment`/`MoveComment`'s JSON-Schema `inputSchema` gains a required `path` field (review 3, F1) — this is the surface where an id-only schema was most sharply unbuildable, since this script has no warm cache from any prior call** | T1, T2 | **Pre-written**: T1's frozen JSON schema, §9's "no Electron API, plain `fs` only" constraint, and the `chatsearch.js` precedent to copy for atomic-write mechanics only | mirrors `claude-code-mcp.test.ts`'s own style: JSON-RPC handler tests, a round-trip test (native tool writes → MCP script reads the same file, and back); **path-containment refusal test at the MCP tool-argument surface, including a symlink case (F3/F1), now on all four mutation tools (review 3, F1)**; **lock-path canonicalization (project root only — F3) + a genuine two-process contention STRESS test against T1's implementation, not just the sequential round-trip (F4, budget widened per F12)**; **a fresh script invocation (no prior `list`/`ReadFileComments` call in this process) successfully mutates a comment given only `{path, commentId, ...}` (review 3, F1)** | Porting `cas-write.ts`'s Windows-specific `EPERM`/`EACCES`/`EBUSY` contention handling is easy to drop in a "simplified" reimplementation — test it explicitly. The lock/mutex half of this task has no precedent anywhere in this codebase to copy from — budget review time accordingly (F12). Without `path` on these four tools (review 3, F1), a fresh MCP invocation days after the comment was made — R2's own ordinary case — cannot resolve which sidecar to open. |
| T9b | The docx/xlsx pending-mutation queue: MCP tool writes `.youcoded/comments/.pending/<uuid>.json`, main's watcher applies it via its real JSZip/Node-XML-library code (both docx and, since the 2026-09-27 threaded-comments redesign, xlsx — §4 — go through the same `linkedom`-based surgical-edit path; exceljs is no longer part of this write path) and writes a result file the MCP script polls for (§9) — split out because it is blocked on §3.2/§4.3's F1/F2 architecture fix landing first (review 1, F8); **the pending-mutation request carries the same `path` field T9a's tool call received (review 3, F1) — a trivial pass-through, not a new mechanism, since the queue exists to reach a Word/Excel target that a `path` already names**; **NO change to this task's own result-file shape for design review round 2's F1 (spelled out in §9.2 precisely because this task is being built concurrently with that revision) — a reply's persisted id is a renderer-optimistic-UI concern only, never read by any MCP tool, and the new per-document watcher (§1.5) fires automatically off this task's own write-pipeline-backed write with no broadcast call needed from this code at all, PROVIDED the write stays on `write-pipeline.ts`'s atomic path** | T9a, T10, T12 (needs the main-process docx/xlsx write path to exist) | Description; **the poll bound is corrected from an unsupported "~3s, matching other native tool timeouts" citation (no such precedent exists — real native-tool timeouts are 120-600s) to an explicitly-set, benchmarked value, with the comments watcher's own `awaitWriteFinish.stabilityThreshold` set to 500ms, not chokidar's 2000ms default, since the default alone would consume most of a 3s budget before any docx/xlsx work starts (review 2, F13)**; request shape includes `path`, `commentId` (or, for `add`, the new comment's fields), and for `move`, `newSelector` (review 3, F2) | queue round-trip (request written → result appears → MCP script reads it); **a bounded-timeout test using the corrected, benchmarked value (no result file within it surfaces a specific failure, never hangs) — benchmarked against a representative multi-MB `.docx` with images before the number is frozen (F13)**; **a move request round-trips through the queue against a Word/Excel fixture (review 3, F2)** | This piece is genuinely new (no direct precedent) — keep it isolated from T9a/T9c's lower-risk, precedented work so a review can weigh it on its own. A timeout tuned to fail routine successful operations is worse than a longer one that only fails genuine hangs (F13). |
| T9c | Android byte-identical MCP asset + its own parity test, citing `ClaudeCodeMcp.kt`/`claude-code-mcp.ts`'s existing `SendUserLink` deploy as precedent (review 1, F8) | T9a | Description, citing the existing `SendUserLink` deploy pattern verbatim | desktop-string-equals-Android-asset parity test (same shape as `claude-code-mcp.test.ts`'s existing one) | Low risk given the precedent — keep scope to parity, not new protocol design. |
| T10 | Docx read: `docx-comments.ts` (now `desktop/src/main/doc-comments/docx-comments.ts` — review 1, F1) parses `comments.xml`/`commentsExtended.xml` via a Node-compatible XML library (`@xmldom/xmldom` or `fast-xml-parser`, spike to confirm which), merges into `CommentableDocument`; promote `jszip` and the chosen XML library to direct dependencies **through the workspace's documented safe path (the shared checkout, or a `setup.sh` re-run) — never a bare `npm install` inside this session's hardlinked worktree, per `docs/PITFALLS.md`'s worktree/node_modules hazard (review 2, F10)** | T1 | Description | parse `docs/launch-brief.docx` fixture; `w15:paraIdParent` reply reconstruction; a docx with no `comments.xml` part doesn't crash; **runs under plain Node in a test, not a renderer/jsdom test environment, proving the main-process placement (F1)** | JSZip's hoisted-not-declared status (§3.2) — confirm the direct-dependency bump doesn't change the resolved version underfoot. Confirm the chosen XML library's API maps cleanly enough from a `DOMParser`-shaped design that §3.2's algorithm doesn't need a rewrite, only a swap. **A bare `npm install` inside a `cp -al`-hardlinked worktree silently corrupts sibling worktrees/checkouts (F10) — route through the safe path, not around it.** |
| T11 | Docx write: add/reply/resolve/**move** into `comments.xml`/`commentsExtended.xml` (main process), backup-before-write, verify-after-write **with automatic rollback on failure (review 1, F5)**, **id/paraId uniqueness (F6)**, **a minimal OOXML relationship/content-types sanity check in the verify step (F17)**, **the range-relocation algorithm for `MoveComment` (review 3, F2 — blocker; §3.3 step 5): remove the old `w:commentRangeStart`/`End` pair + `w:commentReference` by `w:id`, re-resolve `newSelector` against current `document.xml`, reinsert reusing the same `w:id`/`w15:paraId`, refuse with a specific `<ErrorState>` if `newSelector` doesn't resolve** | T10 | Description | round-trip add/reply/resolve against the fixture; backup file created; **a verify-failure test asserts the target file is byte-identical to the pre-write original, not just that an error surfaced (F5)**; **a fixture with gapped/non-sequential existing `w:id`s (F6)**; **every `r:id` the new run references resolves in `document.xml.rels`, and every referenced part has a `[Content_Types].xml` override (F17)**; **a move that relocates a comment's range, confirming the OLD range is gone, the NEW range resolves, and `w:id`/`w15:paraId`/replies/resolve state are unchanged (review 3, F2)**; **a move whose `newSelector` doesn't resolve in the current text is refused, not silently dropped (review 3, F2)**; (manual, dev-instance, not CI) Word-and-Google-Docs-open check | OOXML relationship/content-type wiring is exactly the class of bug that "opens in Word but Google Docs silently drops it" — R10's manual check is not optional, and F17's automated check now catches part of that class before the manual gate. Shipping this task without `MoveComment` (review 3, F2) leaves the tool with no implementation to dispatch to for any Word-backed comment. |
| T12 | **(redesigned 2026-09-27, threaded-only)** Xlsx read: hand-rolled JSZip + `linkedom` OOXML parse (NOT exceljs — §4.1) of `xl/threadedComments/threadedComment{N}.xml` + `xl/persons/person.xml`, matching every element by `localName` (never a literal, possibly `x18tc:`-prefixed tag string — §4.2's namespace-prefix finding), grouped by `(ref, id-chain)` since one cell can carry multiple independent threads (§4.2), into `PersistedComment`-shaped thread records in `desktop/src/main/doc-comments/xlsx-comments.ts`. A legacy `<comment>` is inspected only to classify `tc={GUID}`-linked (skip) vs. a genuine Note (skip, never shown — §4.1). | T1 | **Pre-written OOXML shape** (§4.2, backed by `shared-fixtures/doc-comments/xlsx-threaded-reference/`'s two real files) — not reverse-engineered mid-task | parse `docling-xlsx-comments.xlsx` (real Excel) AND `elden-ring-completionist-checklist.xlsx` (real Google Sheets) directly, asserting the SAME shape from both (proves namespace-prefix-agnostic parsing, §4.2); a resolved thread, an unresolved thread, a reply chain; the `elden` fixture's real 5-independent-threads-on-one-cell case (`B19`), asserting 5 separate records, none dropped or merged; a file with ONLY a genuine Note (no thread) returns ZERO comments, not a garbled pseudo-comment (the exact defect §4.1 names in the currently-built reader); **the id parser passes every entry in the shared `id-parse-test-vectors.json` (design review round 2, F2)** | A from-scratch namespace-unaware walk (matching a literal tag string instead of `localName`) would silently read zero comments from the Google-Sheets-shaped fixture while passing against the Excel-shaped one — the two real fixtures exist specifically so this can't go unnoticed. |
| T13 | **(redesigned 2026-09-27, threaded-only)** Xlsx write: surgical JSZip+DOM add/reply/resolve/reopen/**move**, mirroring docx's §3.3 shape (NOT exceljs — §4.1/§4.3); creates `xl/persons/person.xml` + its workbook relationship + content-types entry on a file's first-ever thread; reuses-or-creates this app's own `<person>` (`providerId="YouCoded"`, no `userId`, matched by `displayName` — §4.2) rather than duplicating one per write; writes the matching legacy `commentsN.xml`/`vmlDrawingN.vml` placeholder to Excel's own real-layout shape verbatim (§4.2), omitting `<x:Locked>`/`<x:LockText>` (confirmed absent in every real threaded-placeholder VML sample); resolve/reopen is a single `done` attribute set/removed on the root, no marker string; refuses `'cell-has-note'`/`'cell-already-has-comment'`/`'destination-cell-occupied'` per §4.3; backup-before-write, verify-after-write with automatic rollback (unchanged `write-pipeline.ts`) | T12 | **Pre-written** exact XML shapes (§4.2) + `shared-fixtures/doc-comments/xlsx-threaded-reference/` | round-trip add/reply/resolve/reopen/move; a resolve/reopen never touches the legacy placeholder text (§4.2's "done never appears in placeholder text" finding — verify must check the real `threadedComment` part, never the placeholder); a move updates `ref` on the root AND every reply sharing its id-chain, plus the one legacy comment entry; a reply's `parentId` always targets the root, never chains to another reply; an add on a cell with an existing Note is refused `'cell-has-note'`; an add on a cell with an existing thread is refused `'cell-already-has-comment'`; the person entry is reused (not duplicated) across two writes by the same identity to the same file; a mixed file (real Notes on other cells) round-trips those Notes byte-for-byte untouched; a verify-failure test asserts the target file is byte-identical to the pre-write original; **an add on a SYNTHETIC worksheet fixture with a pre-existing `<extLst>` confirms `<legacyDrawing>` lands after it, not before (design review round 2, F4 — neither real fixture has this shape)**; **a fallback-scan match against two roots sharing one GUID (a hand-crafted fixture, since neither real file has one) refuses `'ambiguous-comment-id'` (design review round 2, F3)** | Getting the persons.xml reuse-vs-duplicate logic wrong either loses identity across replies (Excel shows two different "people" for the same app-identity) or leaves the part growing unboundedly. Getting the multi-thread-per-cell grouping wrong on write (treating an unrelated existing thread on the same `ref` as this app's own) could silently touch or move a colleague's separate thread. |
| T14 | Wire real backend into `CommentableDocument`/`DocxView`/`XlsxView` (dispatch by file type: `PersistedComment` store for plain files, `docx-comments.ts` for `.docx`, `xlsx-comments.ts` for `.xlsx`); remove workbench-only seeds from the product path | T5, **T10 AND T11**, **T12 AND T13** (review 1, F16 — corrected from "T10 or T11, T12 or T13", which allowed starting on a read-only half-built lifecycle) | Description | full comment-lifecycle test per file type, run against the real (non-mock) store | The integration point where a wrong file-type dispatch silently sends a plain-file comment write at a `.docx`'s sidecar instead of into the file |
| T15 | **DONE, no-op (review 2, F19)** — Process cleanup: close PR #263 (R11); confirm with Destin, then delete the three rejected mock branches/worktrees (R21). Verified 2026-09-26: `gh pr view 263` → CLOSED; `git branch -a`/`git ls-remote --heads origin` show `comments-mock-a-v1`/`comments-mock-b`/`comments-mock-c` no longer exist locally or on the app repo's remote; no leftover `worktrees/sessions/comments-mock-{b,c}` directories. | none | n/a — already satisfied | n/a | None — kept as a row only so a build session doesn't re-verify or re-do finished cleanup. |
| T16 | **(reopen-1)** Android docx read: `DocxComments.kt` (§3.2a) parses `comments.xml`/`commentsExtended.xml` via `java.util.zip.ZipFile` + `javax.xml.parsers`, into the SAME `PersistedComment`-shaped record §3.2/T10 produces | T1, T4 | **Pre-written algorithm** (§3.2's field mapping, ported verbatim — same author/text/`resolved`/`replies` extraction, same `TextQuoteSelector` construction from `document.xml`'s own surrounding text, no mammoth/rendered-HTML dependency needed at read time) | parse the SAME `docs/launch-brief.docx` fixture T10 uses, asserting the SAME `PersistedComment[]` shape (not just "doesn't crash"); `w15:paraIdParent` reply reconstruction; a docx with no `comments.xml` part doesn't crash; a JVM unit test, not an instrumented/on-device test, proving this runs in plain `./gradlew test` | Reusing T10's exact fixture (not a separate Android-only one) is what makes T21's cross-read guard meaningful — a fixture drift here would silently make the "parity" test compare two different inputs. |
| T17 | **(reopen-1)** Android docx write: add/reply/resolve/**move** into `comments.xml`/`commentsExtended.xml` via `java.util.zip.ZipOutputStream` + `javax.xml.transform`, mirroring §3.3's now-six steps (backup-before-write, id/`paraId` uniqueness scanned fresh from the file, **the range-relocation algorithm for move (review 3, F2)**, **verify-after-write with automatic rollback**, the same `r:id`/content-types relationship sanity check as F17); **a size guard before loading the archive fully (review 2, F16)** | T16 | Pre-written (§3.2a: "mirror §3.3's six steps verbatim") | round-trip add/reply/resolve against T10/T16's shared fixture; backup file created; a verify-failure test asserts the target file is byte-identical to the pre-write original; a fixture with gapped/non-sequential existing `w:id`s; every `r:id` the new run references resolves in `document.xml.rels` and has a `[Content_Types].xml` override; **an over-size-threshold file routes to the specific `<ErrorState>`, not an OOM (F16)**; **a move that relocates a comment's range, mirroring T11's move test against the shared fixture (review 3, F2)**; (manual, dev-instance build, not CI) a `.docx` this writes opens correctly in the desktop app's own DocxView. **The release-R8 build is exercised for free by the existing `android-ci.yml` job's `assembleReleaseTest` step — no new R8 check needed here (review 2, F15).** | The riskiest code in the whole reopen — a Kotlin write bug corrupts a user's real Word file. Hold this task to the same "byte-identical rollback on verify failure" bar T11 was held to, not a lighter one because it's "just the phone." Missing `MoveComment` (review 3, F2) leaves Android's `MoveComment` on a Word target with no implementation, same gap as desktop's T11 without this fix. |
| T18 | **(reopen-1, redesigned 2026-09-27, threaded-only)** Android xlsx read. Unlike the retired legacy-Notes version of this row, **the reference is already captured** — this redesign's own research saved two real, license-checked, redistributable files (`docling-xlsx-comments.xlsx`, real Excel-365-for-Mac; `elden-ring-completionist-checklist.xlsx`, real Google Sheets export) to `shared-fixtures/doc-comments/xlsx-threaded-reference/`, a stronger target than the old "capture from desktop's own writer" approach since it's cross-checked against two independent real vendors, not one app's own code. `XlsxComments.kt`'s read half parses `threadedComment{N}.xml`/`person.xml` via namespace-aware `javax.xml.parsers`, matching by `localName` (§4.2/§4.3a), into the SAME shape T12 produces | T1, T4, T12 (needs T12's shape to exist) | The reference is pre-captured from real files, not re-derived from desktop's own writer output | parse the checked-in `docling`/`elden` fixtures directly, asserting the SAME shape T12 produces from each (proves namespace-prefix-agnostic Kotlin parsing against both a default-namespace and an `x18tc:`-prefixed real file); the `elden` fixture's 5-independent-threads-on-`B19` case, none dropped; a file with only a genuine Note returns zero comments; **the SAME shared `id-parse-test-vectors.json` T12 reads, asserting Kotlin's parser agrees with TS's on every entry (design review round 2, F2)** | Same namespace-prefix trap as T12's own key risk, now in Kotlin: a from-scratch XML walk matching literal tag strings instead of `localName` would silently read zero comments from the Google-Sheets-shaped real fixture while passing against the Excel-shaped one. |
| T19 | **(reopen-1, redesigned 2026-09-27, threaded-only)** Android xlsx write: hand-construct `threadedComment{N}.xml`'s `<threadedComment>` elements (root/reply/`done`) + `person.xml`'s `<person>` entries (creating the part + workbook relationship + content-types entry on first use, reusing an existing `providerId="YouCoded"` entry rather than duplicating) + the matching legacy `commentsN.xml`/`vmlDrawingN.vml` placeholder (§4.2's exact verbatim text/whitespace, VML omitting `<x:Locked>`/`<x:LockText>`) to match T18's real-file-sourced reference; `MoveComment` updates `ref` on the root and every reply sharing its id-chain plus the one legacy comment entry, reusing the same ids (no fresh GUIDs on a move); refuses `'cell-has-note'`/`'cell-already-has-comment'`/`'destination-cell-occupied'` identically to T13; backup-before-write, verify-after-write with automatic rollback; a size guard before loading the archive fully (unchanged from the original T19's own F16) | T18 | Target shape pre-written by T18's real-file-sourced reference, not desktop's own writer output — closing the asymmetry the retired legacy-Notes T18/T19 pair had | round-trip against T12/T18's shared real-file fixtures; multi-reply formatting; a resolve/reopen never touches the legacy placeholder text; a move that relocates a thread, confirming the OLD `ref` is gone and the NEW one carries the identical text/replies/`done` state; an add/move onto an already-commented or Note-bearing cell is refused per §4.3; a verify-failure test asserts byte-identical rollback; an over-size-threshold file routes to the specific `<ErrorState>`, not an OOM; T18/T19's own re-run re-diffs against the checked-in real-file reference every time, failing loudly on drift; a multiple-independent-threads-per-cell case (the `elden` fixture's `B19`) proving a move/resolve on ONE thread never disturbs a sibling thread sharing its cell; **the SAME synthetic pre-existing-`<extLst>` fixture T13 uses, confirming Kotlin's own `<legacyDrawing>` placement agrees with TS's (design review round 2, F4)**; **a fallback-scan duplicate-GUID case refuses `'ambiguous-comment-id'`, identically to T13 (design review round 2, F3)**; (manual, dev-instance build) a `.xlsx` this writes opens correctly with a visible, correctly-positioned threaded comment in the desktop app's own XlsxView and in real Excel/Google Sheets if available. The release-R8 build is exercised for free by the existing `android-ci.yml` job's `assembleReleaseTest` step. | **Still the single riskiest task in the whole reopen** — hand-rolled OOXML with no library help on either platform, now with persons.xml's workbook-singular (not per-worksheet) scoping as an added way to get it wrong: creating a SECOND `person.xml`, or a per-worksheet one, produces a file real Excel doesn't open cleanly, a failure mode legacy Notes' four worksheet-scoped pieces never had. |
| T20 | **(reopen-1)** Android half of the MCP pending-mutation queue: the byte-identical MCP asset (T9c) writes the SAME `.youcoded/comments/.pending/<uuid>.json` request shape T9b defines (**including its `path`/`newSelector` fields, review 3, F1/F2**); a Kotlin coroutine polling loop inside `SessionService` (not `FileObserver` — see §9.2) applies it via `DocxComments.kt`/`XlsxComments.kt` and writes the same result-file shape back; **NO result-shape change for design review round 2's F1 — Android has no `docComments:watch` for any file type, so there is no watcher for this task's own applied mutations to feed (§9.2's own T9b/T20 contract note)** | T9c, T17, T19 | Description; request/result JSON shape pre-written by T9b (unchanged) | queue round-trip on Android (request written → Kotlin applies it → result appears → MCP script reads it); the same bounded-timeout test as T9b using the corrected, benchmarked value, not the retracted ~3s figure (review 2, F13, never hangs); **a move request round-trips through the Android queue against T18's fixture (review 3, F2)** | Two independently-written watchers (chokidar vs. a Kotlin polling loop) for the identical request/result contract — a Kotlin-side field-naming slip is invisible until an Android build actually exercises this path. |
| T21 | **(reopen-1)** Cross-platform golden-fixture parity test — **precisely worded (review 2, F5): desktop's CI and Android's CI are two independently-scheduled jobs (a Node process and a JVM process never run inside the same test), so this proves "both sides match a shared, checked-in golden fixture," not a live hand-off between the two processes in one run** — desktop writes a docx/xlsx **add+reply+resolve+move** sequence into a fixture copy (the xlsx copy is `elden-ring-completionist-checklist.xlsx`, named explicitly — §9.3, review 1 F11) and checks its output against the checked-in golden bytes; Android reads the SAME golden bytes and produces the identical `PersistedComment[]`; the same in reverse for a Kotlin-written fixture; both platforms' verify-after-write rollback is exercised against a deliberately-corrupted intermediate write (§9.3); **a repoint (`MoveComment`) case is included for both formats, not just add/reply/resolve (review 3, F2 — blocker: this is the ONE test that would otherwise never notice Move's absence or a cross-platform disagreement on it)** | T11, T13, T17, T19 | Description; fixtures live in `shared-fixtures/doc-comments/` (the workspace's established cross-runtime fixture convention — `shared-fixtures/artifacts/`, `shared-fixtures/attention-classifier/` are the precedent, though both of those are JSON-only; this is the first binary+JSON pair in that directory); **desktop's own CI adds a self-check that fails loudly if its freshly-generated output no longer matches the committed golden fixture (review 2, F5) — otherwise fixture staleness lets desktop's CI stay green while silently drifting from the bytes Android's still-green test actually reads** | the five-part test §9.3 describes (add, reply, resolve, **move**, and a corrupted-write rollback), run in CI on the desktop side and via `./gradlew test` on the Android side against the SAME checked-in fixture bytes; **a staleness self-check: desktop's writer output is re-diffed against the committed golden fixture on every run, failing loudly on drift instead of only on the next manual regeneration (F5)**; **the move case: desktop repoints a comment and Android reads the identical new anchor (and vice versa) for both docx and xlsx (review 3, F2)** | This is the ONLY thing that catches "each side passes its own tests but the two are subtly incompatible" — treat a passing T17/T19 alone as unproven parity, not done, until this lands. It proves both sides match a shared golden fixture, not that the two live implementations agree with each other right now (F5) — that's the best achievable structure across a Node/JVM split, not a shortcut. Without a move case (review 3, F2), this guard would stay green even if Move silently disagreed cross-platform, or wasn't implemented at all. |

**Every task in a parallel batch below gets its OWN worktree (review 2, F11)** — per
`.claude/rules/using-git-worktrees`, never two write-capable subagents sharing one checkout.
`docs/PITFALLS.md` dates a real 2026-09-06 incident where exactly this erased a builder's saved,
type-checked work with a clean `git status` and no error; CLAUDE.md states directly "do not assume
multiple write-capable specialists can run concurrently." "In parallel" below means "in parallel,
each in its own worktree," never a shared checkout.

**Suggested batching**: T1 alone first (everything downstream reads its frozen schema and its
containment/lock-canonicalization algorithms). Then in parallel: T2, T7, T10, T12, and the desktop
half of T3. Then: T4, T5, T8, T9a (T9a last within this batch — it has real surface area and should
start once T1/T2 are truly stable, not while they might still shift), T11 (after T10), T13 (after
T12), T16 (after T10, needs its fixture), T18 (after T12, needs its fixture and workbook). Then T9b
(needs T10/T12's main-process write paths), T17 (after T16), T9c (needs T9a). Then T19 (after T18's
spike), T20 (needs T9c and T17/T19). Then T14 (needs BOTH halves of each format's read/write pair, per
F16) and T21 (needs T11/T13's desktop write paths and T17/T19's Android ones — necessarily last,
since it reads what every other docx/xlsx task produced). **T6 can land any time after T2 AND T14**
(F2, T5 implementation review — corrected from "after T2" alone: T6's own UI has nothing real to
render until T14 is what actually computes `status: 'detached'`). T15 is independent and low-priority.

## 9. Cross-cutting risk: multiple implementations of "write this safely"

Two separate multi-implementation risks live here: the plain-text `.youcoded/comments/<path>.json`
sidecar (three implementations — unchanged by reopen-1) and, **new since reopen-1**, `.docx`/`.xlsx`
OOXML mutation (now two real implementations, where the review-1 revision of this document had
arranged for there to be only one).

### 9.1 The JSON sidecar: three implementations

This design accepts, rather than architects away, three separate places that read/write the same
`.youcoded/comments/<path>.json` file format:

1. **TS main process** (`desktop/src/main/doc-comments/doc-comments-store.ts`, T1/T3) — uses the
   real `mutateFileUnderLock` from `cas-write.ts`, in-process, no duplication risk. As of §3.2/§4.3's
   revision, this was also (until reopen-1) the ONLY implementation with JSZip/a Node-XML-library/
   exceljs available — docx/xlsx parse+mutate lives here, resolving the earlier renderer/main
   contradiction (review 1, F1/F2).
2. **The Claude Code MCP script** (T9a) — a plain `node` process Claude Code spawns per session,
   with **zero `node_modules` beside it on either platform** (`claude-code-mcp.ts`'s own header
   comment: "this file is executed by a PLAIN node process… it has no node_modules beside it on
   either platform, and on Android it runs under Termux. Zero dependencies is the only shape that
   works in both places"). It cannot `import` `cas-write.ts` or any bundled dependency — it needs a
   small, dependency-free reimplementation of the SAME mkdir-lock-plus-atomic-rename algorithm,
   embedded the same way `LINK_SERVER_JS` is a self-contained `String.raw` template. **Corrected
   citation (review 2, F12):** `chatsearch.js`'s own atomic tmp-write+rename (`chatsearch.js:812-814`)
   is real, shipped precedent for the atomic-write mechanics ONLY — its `submitRequest` generates a
   fresh uuid-named file per call and polls a DIFFERENT ack path, so no two writers ever race the same
   file, and it contains no mutex anywhere. The mutual-exclusion half of T9a (truly excluding a second
   writer from the SAME file) has no precedent anywhere in this codebase to copy from — it is novel
   work, not a port, and T9a's review budget (§8's task table) is set accordingly.
3. **Kotlin** (`DocCommentsStore.kt`, T4) — **corrected 2026-09-27 after T4's own implementation
   review (F1, blocker):** this used to say a plain-mutex-plus-atomic-rename implementation was
   sufficient because Android has no concurrent second-process hazard. That was wrong — implementation
   #2 above (the MCP script) runs on Android too, as its own separate Termux process, and reads/mutates
   this SAME sidecar file directly. Kotlin's write path now uses
   `com.youcoded.app.artifacts.mutateFileUnderLock` — the SAME cross-process mkdir-lock protocol #1
   uses (identical lock path naming, identical 30s stale-lock timeout) — with the in-process mutex kept
   only as a fast path in front of it, so all three implementations actually exclude each other over
   the same file. (Kotlin's SEPARATE docx/xlsx write path, real as of reopen-1, is §9.2, not this
   three-way JSON story — a `.docx`/`.xlsx` file never touches the JSON sidecar at all, per §1.1, and
   its own in-process-mutex reasoning is UNCHANGED — see §1.5's "Kotlin's own file-locking" for why.)

**Lock-path canonicalization must match across #1 and #2 (review 1, F4 — restated from §1.5):**
`cas-write.ts`'s existing lock derivation (`target + '.lock'`, no `realpath` first) is fine for its
existing single-process-family callers, but #1 and #2 here are two INDEPENDENT reimplementations of
the same algorithm that must actually exclude each other. Both canonicalize the target's absolute
path before deriving the lock path, identically, or a symlinked project directory / cwd-resolution
difference between Electron and a Claude Code CLI session silently stops the two locks from excluding
each other — a torn or lost write on the exact file R6 depends on. The pinning test is a TRUE
concurrency test (both writers racing the same file simultaneously, asserting nothing is lost), not
only the sequential round-trip below.

**#3 (Kotlin) added 2026-09-27, needs no separate canonicalization fix of its own:** `DocCommentsStore.kt`'s
own `sidecarPath` is ALREADY built from the realpathed project root (never the caller's unresolved
argument — see F1 above), so its lock path (`sidecarPath + ".lock"`, via
`com.youcoded.app.artifacts.mutateFileUnderLock`) lands on the identical string #1/#2 compute for the
same real file without a second fix — the alias trap this paragraph describes is specific to deriving
a lock path from an UNRESOLVED target, which Kotlin's store never does.

### 9.2 docx/xlsx OOXML mutation: now two real implementations, and Android's own queue

Before reopen-1, only implementation #1 (TS main) had ZIP+XML capability, so this design routed
EVERY other write source at that one capable runtime: the renderer's IPC calls reach main directly;
the Claude Code MCP script (T9a) — which has neither `node_modules` nor a DOM, on either platform —
goes through a small file-based pending-mutation queue (T9b) instead of a third from-scratch XML
editor: the MCP tool writes a pending mutation request into `.youcoded/comments/.pending/<uuid>.json`
(the SAME dependency-free lock primitive as #2 above, since this part is a plain JSON write, not
XML), then polls (bounded, explicitly set and benchmarked — review 2, F13 retracted the earlier "~3s,
matching other native tool timeouts" citation, since no such precedent exists: real native-tool
timeouts are 120-600s, and chokidar's own 2000ms default `awaitWriteFinish.stabilityThreshold` alone
would consume most of a 3s budget; §1.5 sets 500ms for the comments watcher specifically) for a
result file the main-process watcher (§1.5, already watching `.youcoded/comments/`) writes once it
applies the
mutation with its real JSZip/Node-XML-library-capable code (§4's 2026-09-27 redesign moved xlsx
onto this same capability, off exceljs, for comment reads/writes specifically). Plain-file `PersistedComment`
mutations from the MCP path skip the queue entirely — JSON read-modify-write is simple and low-risk
enough for the script to do directly (T9a). Android's MCP script (T9c: a byte-identical asset) was
covered "for free" before reopen-1 because there was no Android docx/xlsx capability of any kind for
it to reach.

**Reopen-1 gives Android its own real ZIP+XML capability** (§3.2a/§4.3a's `DocxComments.kt`/
`XlsxComments.kt`) — but Android's MCP script is STILL the same zero-dependency, no-DOM plain node
process (T9c's whole point is that it stays byte-identical to desktop's), so it still cannot do the
mutation itself. Android therefore needs its OWN pending-mutation queue (T20), mirroring T9b's
request/result JSON shape exactly but with a **Kotlin coroutine polling loop inside `SessionService`**
as the applier instead of the TS main process's chokidar watcher — not `FileObserver`: §1.6's "no
`FileObserver`-based watch" is about the UI-facing `docComments:watch` push (a different, still
out-of-scope concern, unaffected by reopen-1); this internal queue only needs `SessionService`,
which is already running for the whole PTY session, to notice its own `.pending/` directory on a
short interval (~250ms, comfortably under T9b's corrected, benchmarked bound — review 2, F13; the
originally-cited ~3s "matching other native tool timeouts" figure had no such precedent). This is genuinely new work (T20) — landing
T9b on desktop does not cover it, because the two platforms' watchers are different code, even though
the request/result JSON shape and the MCP script's polling logic (T9c's byte-identical asset) are
unchanged.

There are now genuinely **two** real, independent implementations reading/writing the same
`comments.xml`/`commentsExtended.xml` (docx) and `threadedComments`/`persons`/legacy-placeholder
(xlsx, redesigned 2026-09-27 — §4) formats (TS main via a Node-XML-library/`linkedom`, Kotlin via
`javax.xml.parsers`/`javax.xml.transform`), where before reopen-1 there was only one. §9.3 is the
guard that proves they actually agree, not just that each independently works.

**T9 split into three (review 1, F8 — major, unchanged by reopen-1):** the original single T9 bundled
six MCP tool definitions, a from-scratch dependency-free lock port, an entirely new cross-process
pending-mutation queue, and Android byte-identical asset parity — four independently risky,
independently testable pieces the design's own "sized for one subagent each" rule argues against
combining. Split into:
- **T9a** — the six MCP tool JSON-RPC definitions plus the dependency-free plain-file store (§9.1
  point 2), citing `chatsearch.js` for its atomic-write mechanics only — the mutual-exclusion/lock
  half is novel work, not a port (review 2, F12).
- **T9b** — the docx/xlsx pending-mutation queue, desktop side (blocked on §3.2/§4.3's F1/F2
  architecture fix landing first).
- **T9c** — Android byte-identical asset parity + its own parity test, citing `ClaudeCodeMcp.kt` /
  `claude-code-mcp.ts`'s existing `SendUserLink` deploy as precedent.
- **T20 (reopen-1)** — the docx/xlsx pending-mutation queue, Android side (§9.2 above; not part of
  the original F8 split, added because reopen-1 gave Android a runtime T9b's desktop watcher can't
  reach on its own).

**The exact contract T9b (and T20) must follow for the new per-document watcher (§1.5) and reply-
response enrichment (§1.6) — design review round 2, F1, written precisely because T9b is being built
concurrently with this revision:**

- **No change to T9b's own request/result JSON shape.** The renderer-facing reply-id enrichment
  (§1.6) is a property of the DIRECT `docComments:reply` IPC channel only — it exists to correct a
  RENDERER'S OWN optimistic UI entry for an action IT initiated. The assistant (native tool or MCP)
  never holds or needs a reply's own persisted id back (round 1, F1's own finding: no tool in §5's
  table ever addresses an individual reply by id — only a thread's root id is ever passed to
  `ReplyToComment`/etc.), so T9b's result file needs no new field for this. **T9b's contract is
  unchanged: apply the queued mutation through the SAME `write-pipeline.ts`-backed functions
  (`docx-comments.ts`/`xlsx-comments.ts`) the direct IPC path already calls, and write whatever
  success/error shape it already writes today.**
- **No explicit broadcast call needed from T9b's own applier code, either.** The new per-document
  watcher (§1.5) observes the TARGET DOCUMENT'S OWN FILE, not the pending-mutation queue's request/
  result files — so it fires automatically once T9b's applier's write settles (the same atomic
  backup→write→verify→rollback pipeline every docx/xlsx write already goes through), with ZERO
  additional code in T9b to make this happen, PROVIDED T9b keeps applying through that shared
  pipeline rather than writing bytes any other way. If no comments pane for that document happens to
  be open, no watcher is registered and nothing fires — correct: nothing is listening either.
- **What T9b must NOT do:** write the document's bytes through any path that bypasses
  `write-pipeline.ts`'s atomic tmp-write-then-rename (§3.3/§4.3 step 1/6) — a direct, non-atomic
  write would make the new watcher observe a transient, possibly-invalid intermediate state as if it
  were a settled change, the exact hazard `awaitWriteFinish`'s stability window exists to absorb for
  an EXTERNAL save but that this app's OWN write should never produce in the first place.
- **T20 (Android): the per-document watcher doesn't apply — Android has no `docComments:watch` of
  any kind** (unchanged, §1.6: `not-implemented-on-mobile` for every file type), so there is no
  watcher for T20's own applied mutations to feed. T20 shares T9b's other conclusion unchanged: no
  new field in its request/result JSON shape for this fix, for the identical reasoning (no Android
  tool ever addresses a reply by its own id either).

### 9.3 The parity guards

- **JSON sidecar** (unchanged from review 1): a shared-fixture round-trip test — implementation #1
  writes a comment, #2 (or a Node harness standing in for it) reads and adds a reply, #1 reads the
  result and confirms both are present in the expected shape. Catches JSON format drift between the
  three before it reaches a real session.
- **docx/xlsx, new for reopen-1 (T21):** a shared fixture set under `shared-fixtures/doc-comments/`
  (the docx fixtures T10/T12 already use, plus — redesigned 2026-09-27 for xlsx, §4 — the two real,
  license-checked `.xlsx` files under `xlsx-threaded-reference/` this redesign's own research
  captured, not a desktop-writer-generated fixture) drives a test that: (1) desktop writes an
  add+reply+resolve+**move** sequence into a fixture copy and Android reads the result, producing
  the identical `PersistedComment[]` shape (same ids, text, `resolved`, reply order, **and the
  relocated selector — review 3, F2**) — **the xlsx copy this sequence runs against is
  `elden-ring-completionist-checklist.xlsx`, named explicitly rather than left to whichever fixture
  is convenient when T21 is built (design review 1, F11):** its ~150 unrelated comment threads and
  ~150 `xl/tables/*`/`xl/documenttasks/*` parts give the "never re-serialize a part this mutation
  doesn't need" guarantee (§4.3) far more surface area to accidentally violate than `docling`'s
  much smaller, simpler file would, making it the STRONGER test of exactly the property this
  redesign's whole rewrite (§4.3's own opening paragraph) exists to guarantee; (2) the same in
  reverse — Android writes, desktop reads;
  (3) both platforms' own verify-after-write logic is exercised against a deliberately-corrupted
  intermediate write, confirming both roll back to a byte-identical original; (4) **xlsx-specific,
  new for the threaded-comments redesign:** both platforms read the `elden` real-file fixture's
  `B19` cell (five independent, genuinely pre-existing threads) and produce the identical
  five-record shape, then a move/resolve on ONE of those five is confirmed on both platforms to
  leave the other four untouched — the one case that would otherwise let §4.2's multiple-threads-
  per-cell finding go silently mishandled by either platform. **A move case is required here, not
  optional (review 3, F2):** add/reply/resolve alone would let Move go unimplemented or
  cross-platform-inconsistent with this guard still green, since it's the one test in this design
  that exercises every docx/xlsx operation together.
  **Precisely worded (review 2, F5):**
  this proves "both sides match a shared, checked-in golden fixture," NOT a live hand-off between the
  two processes in one CI run — `android-ci.yml` and desktop's own CI are two independently-scheduled
  jobs, and a Node process and a JVM process never run inside the same test. That's the best
  achievable structure across a Node/JVM split, not a shortcut — but it means a future change to
  desktop's `docx-comments.ts`/`xlsx-comments.ts` output shape that isn't accompanied by
  regenerating the checked-in fixture could let desktop's own CI (checking its own fresh output
  against its own expectations) stay green while silently drifting from the golden bytes Android's
  still-green test reads.
  **Desktop's CI therefore adds a self-check that fails loudly if freshly-generated output no longer
  matches the committed golden fixture**, so staleness is caught immediately rather than only the
  next time someone remembers to regenerate it. Two implementations can each pass their own suite
  while producing subtly incompatible XML (e.g., a different but individually-valid relationship-id
  scheme) that only this golden-fixture comparison catches.

## 10. What this design deliberately does not change

- No accounts, no document sharing, no cross-device comment sync — out of scope per the handoff
  ("Later, separate projects").
- No live Google Drive link — R10 is "a `.docx` keeps its comments when uploaded," not a
  Drive integration.
- No delete-a-comment capability beyond what the mock already had client-side only (§7).
- No change to the approved UI beyond the one addition §2.3/T6 calls out (the detached-state line)
  and whatever §9's real-backend-data plumbing surfaces that the mockup's seed data already
  demonstrated (colleague names, resolved history, etc. — the cards already render these fields,
  they just need real values).
- **Superseded by reopen-1 — retained here only as history:** the review-1 revision of this document
  made Word/Excel comment reading and mutation desktop-only, with Android's `docComments:*` answering
  `not-implemented-on-mobile` for `.docx`/`.xlsx` targets (the same precedent accepted for Git).
  **Destin reopened this (`doc-comments.reopen-1.json`/`.answers.json`) and picked full phone
  support**: Android now gets a real Kotlin implementation with the same read/add/reply/resolve
  operations as desktop (§3.2a, §4.3a, §1.6, §9.2, T16-T21). Nothing about this bullet's original
  "no contract row required it" reasoning was wrong — R9/R10's thresholds genuinely are phrased as
  desktop dev-instance checks — but Destin's own signed answer to R7's reopen question now DOES ask
  for it, so this is no longer something the design leaves out. The one piece that's still true and
  unaffected: `docComments:watch`/`:unwatch` stays `not-implemented-on-mobile` on Android for every
  file type (§1.6) — a general "no `FileObserver`-based push" gap, not a Word/Excel-specific one, and
  reopen-1's answer was about reading/adding/replying/resolving, not live-watching.
- **Rolling backups are never evicted (T17 implementation review, F4 — informational).** §3.3 step 1/
  §4.3's "one rolling backup per file, overwritten on the next successful write" means exactly one
  `.docx.bak`/`.xlsx.bak` file exists PER SOURCE FILE ever written through this feature, forever, under
  `~/.claude/youcoded-doc-backups/` — but the DIRECTORY itself only ever grows: nothing deletes a
  backup for a file that was renamed, moved, deleted, or never touched again. A user who edits
  comments on hundreds of Word/Excel files over months accumulates hundreds of small backup files
  with no cleanup path, on both desktop (`write-pipeline.ts`'s `BACKUP_DIR`) and Android
  (`DocxComments.kt`'s `docxBackupPathFor`) alike — this is not a regression T17 introduced, it is
  the design's existing behavior on both platforms, called out here as explicitly NOT covered rather
  than silently left out. Deliberately not fixed as part of this task: an eviction policy (age-based?
  LRU? "the source file no longer exists"?) is a real product decision, not a bug fix, and is
  out of scope for a review-findings pass.
