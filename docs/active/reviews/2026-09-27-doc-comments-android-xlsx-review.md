---
status: draft
date: 2026-09-27
reviewed: youcoded/app/src/main/kotlin/com/youcoded/app/doccomments/{XlsxComments.kt,
  DocCommentsDispatch.kt, DocCommentsBridge.kt, DocCommentsZipSizeGuard.kt} and
  app/src/test/kotlin/com/youcoded/app/doccomments/{XlsxCommentsTest.kt,
  DocCommentsBridgeTest.kt, DocCommentsDispatchTest.kt} at commit `ad7a60dd5`
  (Android T18/T19), against docs/active/specs/2026-09-26-doc-comments-build-
  design.md §4 (all), §9.3, T18/T19/T21, and against the reference
  implementation desktop/src/main/doc-comments/{xlsx-comments.ts,write-
  pipeline.ts,zip-size-guard.ts} plus the prior desktop adversarial review
  (docs/active/reviews/2026-09-27-doc-comments-xlsx-t12-t13-review.md, findings
  F1-F7 and their triage/fixes at commit `ffda4b654`).
method: read-only adversarial review. Read XlsxComments.kt in full (1895
  lines), DocCommentsDispatch.kt/DocCommentsBridge.kt in full, the full
  XlsxCommentsTest.kt (573 lines) plus the docx/xlsx bridge and dispatch test
  files, DocCommentsZipSizeGuard.kt in full, and the corresponding sections of
  desktop's xlsx-comments.ts (~2000 lines) side-by-side, field for field, for
  every one of the desktop review's F1-F7 findings plus the priorities in this
  review's own brief. Ran the actual test suite: `JAVA_HOME=/usr/lib/jvm/
  java-21-openjdk ANDROID_HOME=$HOME/.android-sdk ./gradlew testDebugUnitTest
  -x bundleWebUi --tests '*XlsxComments*'` — BUILD SUCCESSFUL, 29/29 passing
  across debug/releaseTest/release unit test variants (confirmed via
  app/build/test-results/*/TEST-...XlsxCommentsTest.xml). No scratch test files
  were added or left behind; `git status` at the end of this review shows only
  the pre-existing, unrelated concurrent-session changes to DocxComments.kt/
  DocxCommentsWriteTest.kt/desktop/* that were already present at session
  start, untouched by this review. Excel/LibreOffice were not available in
  this environment, so priority (2)'s "would Excel open the output" question
  is answered by structural comparison against desktop's own byte-shape (§4.2)
  and against the prior review's own empirical LibreOffice/probe findings for
  the shared parts of the algorithm, not by a fresh open-check here — named
  explicitly rather than assumed.
---

# Android xlsx threaded-comments (T18/T19) review — read/write, adversarial

## Severity key
**High** — real correctness/data-integrity/security/crash risk, user-visible or file-corrupting,
or a documented design guarantee that does not actually hold. **Medium** — a real gap a user or
future maintainer will hit, or a design requirement without test coverage. **Low** — worth fixing,
narrow or cosmetic impact.

---

### F1 (High) — the write path decompresses and recompresses EVERY part of the archive, not just the "at most six" the design promises, contradicting the module's own "never re-serialize an untouched part" claim and multiplying peak memory on a phone

**File:** `XlsxComments.kt:1258-1317` (`loadArchiveForWrite`), `:1356-1365` (`serializeArchiveToFile`'s
final zip-writing loop).

`loadArchiveForWrite` does:

```kotlin
for (entry in Collections.list(z.entries())) {
    if (entry.isDirectory) continue
    entries[entry.name] = readEntryBounded(z, entry)
}
```

— unconditionally, for **every** entry in the archive, before any mutation logic runs. `readEntryBounded`
fully decompresses each entry's real bytes into a `ByteArray` (that is its whole job — see
`DocCommentsZipSizeGuard.kt`'s own header). This means a one-cell `AddComment` on a workbook that also
happens to embed a 100MB image, or has 40 other worksheets never touched by this write, fully
decompresses ALL of it into JVM heap before the archive-mutation code even starts, and then
`serializeArchiveToFile`'s final loop re-compresses every one of those same untouched entries via
`ZipOutputStream`'s default DEFLATED method when writing the output file:

```kotlin
for ((name, bytes) in archive.entries) {
    zos.writeXlsxEntry(name, archive.overrides[name] ?: bytes)   // untouched entries go through here too
    written.add(name)
}
```

**This is a real, confirmed difference from desktop's own write path**, not a cosmetic one. Desktop's
`loadXlsxArchiveForWrite` (`xlsx-comments.ts:770-800`) only ever decompresses **named** parts as they're
needed — `readOptionalPart`/`checkNamedEntriesWithinCeiling` are called per-part (workbook.xml,
content-types, workbook rels, then only the specific worksheet/rels/comments/vml/threaded parts a
lookup actually visits). An image, `styles.xml`, `sharedStrings.xml`, or any worksheet this call never
touches is **never decompressed at all** on desktop — JSZip's `generateAsync` passthrough emits its
original bytes unchanged (confirmed directly in the code, `xlsx-comments.ts:1472-1477`, and matches the
prior desktop review's own confirmed finding that untouched parts round-trip byte-for-byte). Android's
`WriteArchive.entries` map, by contrast, holds **every** part's decompressed bytes simultaneously for
the whole duration of a single write call, and rewrites (re-deflates) every one of them on output.

**Why this matters specifically on a phone (priority 3 of this review):** the module's own size guard
(`checkAllEntriesWithinCeiling`, 200MB, ported byte-for-byte from desktop's constant) is an accepted,
documented risk per the design (§4.3a, review 2 F16) for *loading* the archive — but that acceptance was
framed as "loading the whole archive into memory... is reasonable... carried over unchanged," not as
"and also fully re-compress it on every single add/reply/resolve/move." A real, legitimate (not
crafted/adversarial) workbook comfortably under the 200MB ceiling — e.g. one with embedded screenshots
or images, which is common for real-world spreadsheets — will, on every trivial one-cell comment write:
1. Hold up to ~200MB of decompressed `ByteArray`s in `entries` simultaneously (not proportional to what
   the comment mutation actually touches).
2. Additionally build DOM trees only for the ~6 parts actually touched (bounded, fine) — but the
   untouched 190+MB sits as raw byte arrays the whole time regardless.
3. Re-deflate all of it through `ZipOutputStream` on every write, which is real, avoidable CPU/battery
   cost on every mutation, not just a one-time cost.

200MB was chosen to mirror desktop's constant, which was sized for Electron's much larger available
heap, not for a phone's typical per-app heap budget (often 256MB-512MB, sometimes larger with
`largeHeap`, but not reliably so) — the SAME numeric ceiling could be safe on desktop and a plausible
OOM trigger on a phone, especially compounded by Java's `String`/DOM overhead on top of the raw bytes
this specific finding is about, and the CPU/GC pressure to boot.

**This is also inconsistent with this file's own read path (T18), in the SAME module**:
`readXlsxCommentsFromZip` (`:1668-1798`) only ever calls `readZipEntryText` for specific, named parts
(workbook.xml, workbook rels, person.xml, per-sheet rels/threaded XML) — genuinely surgical, matching
desktop's read-side discipline. The write path (T19) had a surgical, lazy, named-part precedent
available in the very same file and did not use it for the top-level bulk load.

**Fix, roughly in order of effort:** (a) at minimum, name this explicitly in the file's own header
(currently lines 47-51 only discuss the *size-guard* being whole-archive, not that every entry's bytes
get fully decompressed+recompressed regardless of which parts a write actually touches) so a future
reader isn't misled by the "never re-serialize an untouched part" language elsewhere in the file (e.g.
the `WriteArchive` class doc, lines 695-701, and `serializeArchiveToFile`'s own doc, lines 1319-1324,
both of which describe a stronger guarantee than the code delivers at the compressed-byte level); (b) a
cheaper structural fix that doesn't require a new dependency: make `entries` populate lazily (only the
top-level named parts `loadArchiveForWrite` needs directly, plus whatever `getWorksheetContext` resolves
on demand — which is already how worksheet-scoped parts work), and stream-copy any part neither the
mutation nor a lazy lookup ever touched directly from the source `ZipFile`'s input stream to the output
`ZipOutputStream` in bounded chunks, rather than buffering its full decompressed content in a
`LinkedHashMap` for the whole call. This would cut peak memory from O(total declared archive size) to
O(largest touched part) + O(one entry's streaming buffer), without adding a Gradle dependency. A true
byte-for-byte (compressed-bytes-identical) passthrough the way JSZip does it isn't available from
`java.util.zip`'s public API without extra complexity (there's no public API to copy a raw deflated
entry verbatim); the streaming fix above is the achievable middle ground.

**Not a correctness bug in the sense of producing a wrong file** — decompressed content for untouched
parts is preserved exactly, entry order is preserved, and the resulting archive is valid and
content-identical. It is a real memory/CPU divergence from the design's stated "at most six parts
touched, everything else never parsed, never touched" guarantee (§4.3/§4.3a), and the single largest gap
this review found relative to desktop's actual behavior.

---

### F2 (Medium) — three of the six desktop T12/T13 review fixes (F2/F5/F6) were correctly ported into the Kotlin code, but have ZERO pinning tests on the Android side, unlike their desktop counterparts

**Files:** `XlsxComments.kt:562-584` (`resolveOrAppendTcAuthor`, ports desktop review F2), `:773-808`
(`createLegacyPair`'s `xmlns:r` check, ports F5), `:986-1017`/`:1040-1044` (`sawAmbiguousSheet` tracking
in `resolveXlsxThreadTarget`/`getWorksheetContext`, ports F6). `app/src/test/kotlin/.../
XlsxCommentsTest.kt` has no test asserting on the `<authors>` list's length/contents across repeated
moves, no test with a worksheet root that omits `xmlns:r`, and no test that forces the fallback scan to
skip an ambiguously-wired sheet and asserts `ambiguous-comment-wiring` (confirmed by grep: `authors`,
`xmlns:r`, and `AMBIGUOUS_COMMENT_WIRING`/`ambiguous-comment-wiring` produce zero matches anywhere in
the test file).

Desktop's own triage for these three findings explicitly added a dedicated test for each (the T12/T13
review's own triage section: "Test: moves a thread twice within the same worksheet, asserts the
`<authors>` list length never grows"; "Test: a hand-built minimal workbook whose worksheet root
deliberately omits `xmlns:r`"; "Test: corrupts one sheet's own `<legacyDrawing r:id>`... confirms the
honest error"). The Kotlin code correctly implements all three fixes (I read each one and confirmed the
logic matches desktop's field-for-field), but none of the three has independent verification on Android
— a future refactor of `resolveOrAppendTcAuthor`, the `xmlns:r` check, or the `sawAmbiguousSheet`
tracking could silently regress any of them while `./gradlew test` stays green.

**Also missing, a smaller gap in the same family:** desktop's ceiling test suite added both a
"MAX_COMMENT_RECORDS + 1 refuses" test AND a "exactly MAX_COMMENT_RECORDS succeeds" boundary test
(triage note for F4). Android's `XlsxCommentsTest.kt:481-496` only has the "+1 refuses" case — there is
no test confirming a workbook with exactly 20,000 records is accepted, so an off-by-one in the `>` vs.
`>=` comparison (`XlsxComments.kt:1746`, `if (totalRecords > MAX_COMMENT_RECORDS)`) would not be
caught by either boundary going the wrong way.

**Fix:** add the three missing tests (author-list dedup across two moves, a hand-built worksheet
omitting `xmlns:r`, a corrupted-wiring fallback-skip case) mirroring desktop's own, plus the
exactly-at-ceiling boundary case for `TOO_MANY_COMMENTS`.

---

### F3 (Low) — xlsx reply/resolve/reopen/move are exercised at the module level (`XlsxCommentsTest.kt`) but not at the bridge/JSON level (`DocCommentsBridgeTest.kt`)

**File:** `app/src/test/kotlin/com/youcoded/app/doccomments/DocCommentsBridgeTest.kt`.

The bridge test file has one xlsx-specific test (`add against an xlsx target dispatches to the real T19
write pipeline, never the sidecar store`, line 149) — and it exercises a nonexistent target file, so it
only proves routing ("this doesn't fall through to the sidecar"), not an end-to-end write. There is no
bridge-level test that a real `.xlsx` reply produces the JSON `{"ok":true,"reply":{...}}` shape end to
end (the existing `reply carries the persisted CommentReply...` test at line 168 uses a plain
`docs/plan.md` sidecar file, not a real xlsx fixture), and no bridge-level test for xlsx resolve/reopen/
move. The underlying Kotlin functions themselves ARE well-tested (`XlsxCommentsTest.kt`), and
`CommentReply.toJson()` is presumably exercised via the docx/sidecar bridge tests, so this is a narrow,
low-severity gap — but it means the specific JSON-envelope wiring for xlsx mutations beyond `add` (the
`nativeFormatFor(filePath)` dispatch branches in `DocCommentsBridge.kt:126-129, 150-153, 174-177,
202-205`) has no test proving the real archive write reaches the WebView-facing response correctly, only
that it's routed to the right function.

**Fix:** add one bridge-level test using a real xlsx fixture that exercises add → reply → resolve →
reopen → move through `handleDocCommentsMessage`, asserting the JSON envelope at each step, mirroring
the existing docx/sidecar test's shape.

---

## What I checked and confirmed correct (no defect found)

- **Illegal XML control-character handling matches the session's actual, current direction, not the
  superseded one.** The file's own header (lines 278-291) says characters are STRIPPED, not refused —
  this initially reads as a possible regression against the prior desktop review's F1 fix (which
  REFUSED). Checked directly: desktop's `xml-text-safety.ts` and the concurrent, in-flight
  `DocxComments.kt` changes in this same worktree (uncommitted, `git diff HEAD` confirmed) show the
  WHOLE feature — desktop's xlsx-comments.ts, desktop's docx-comments.ts, and Android's DocxComments.kt
  — moved from refuse to strip in this same session, for the same reasoning (a user can't see or remove
  an invisible control byte from a bad paste, so a refusal they can't act on is worse than silently
  dropping it). `XlsxComments.kt`'s strip behavior is consistent with this, not a divergence. Tab/LF/CR
  are correctly preserved (tested, `:445-455`).
- **Desktop review F2 (orphaned `tc=` author entries growing unboundedly across repeated moves)** —
  `resolveOrAppendTcAuthor` correctly searches for an existing matching entry (case-insensitive GUID
  compare) before minting a new one, matching desktop's fix exactly. (Missing a dedicated test — see F2
  above — but the logic itself is correct.)
- **Desktop review F3 (unbounded fallback-scan cost)** — `MAX_FALLBACK_SCAN_BYTES` (50MB, matching
  desktop's constant exactly), the running `parsedBytesTotal` charge in `getWorksheetContext`, and
  `moveXlsxComment`/`replyToXlsxComment` returning the thread's FRESH id (embedding the new cell) so a
  caller's very next call skips the fallback scan — all correctly ported. Confirmed the
  `scanBudgetExceeded` flag is only consulted in the zero-matches branch (never the "found exactly one,
  but the scan was incomplete" case) — checked against desktop's own `resolveXlsxThreadTarget`
  (`xlsx-comments.ts:1280-1283`) and confirmed this is an IDENTICAL, faithfully-ported limitation, not
  an Android-introduced regression; desktop's own review round did not flag it either.
- **Desktop review F4 (record-count ceiling)** — `MAX_COMMENT_RECORDS = 20000`, checked cumulatively
  across sheets, correctly refuses `TOO_MANY_COMMENTS` past the ceiling (tested, `:480-496`). See F2
  above for the missing exactly-at-ceiling boundary case.
- **Desktop review F5 (undeclared `xmlns:r`)** — `createLegacyPair` defensively declares `xmlns:r` on
  the worksheet root before ever setting `legacyDrawing`'s `r:id`, matching desktop's fix. (Missing a
  dedicated test — see F2 above.)
- **Desktop review F6 (ambiguous-wiring sheets silently skipped in the fallback scan)** —
  `sawAmbiguousSheet` is tracked and correctly surfaces `AMBIGUOUS_COMMENT_WIRING` instead of a
  misleading `COMMENT_NOT_FOUND` when the final result would otherwise be not-found. (Missing a
  dedicated test — see F2 above.)
- **Desktop review F7 (wording)** — this is a renderer-string concern (`doc-comments-store.ts`'s
  `describeError`), and the renderer is shared between desktop and Android (the React UI, per
  `youcoded/CLAUDE.md`) — no Android-side duplicate string to fix.
- **Namespace-prefix-agnostic parsing (§4.2's central risk for both T12 and T18)** — `elementsByLocalName`
  correctly walks by `localName` (substring after the last `:`), never a literal tag string; tested
  directly against both the real Excel-authored (`docling`, default namespace) and real Google-Sheets-
  authored (`elden`, `x18tc:`-prefixed) fixtures, asserting identical shape from both (`:147-160`).
  `detectPrefix`/`tcTag` correctly make a NEW element appended into an EXISTING part match that part's
  own convention rather than always using the default namespace.
- **Multiple independent threads on one cell (`elden`'s real `B19`, five roots)** — read back as five
  separate records (tested, `:161-177`); resolving one of the five is confirmed not to disturb the other
  four (tested, `:342-375`).
- **GUID case-insensitive comparison, uppercase-on-write** — `normalizeGuid`/`mintGuid` match §4.2
  exactly (strips braces, lowercases for compare; always mints uppercase).
- **`dT` timestamp format** — `formatThreadedDate`/`parseThreadedDate` produce/accept the exact
  `YYYY-MM-DDTHH:MM:SS.ff` (two fractional digits, no timezone, local time) shape §4.2 specifies, with a
  safe fallback to "now" on a malformed value, matching desktop's `Number.isNaN(t) ? Date.now() : t`.
- **`parentId` flattening (replies always point at the root, never chain)** — `appendThreadedElement`/
  `mutateReplyToXlsxComment` always pass the ROOT's id as `parentId`, never a reply's own id. Tested via
  the real 3-reply/9-message `elden` B19 fixture shape.
- **`done` semantics** — omitted on creation, set to exactly `"1"` on resolve, REMOVED entirely (never
  `"0"`) on reopen; legacy placeholder text never reflects it. Tested directly (`:308-341`).
- **Id parse regex and shared test-vector fixture (design review round 2, F2)** — `parseXlsxThreadId`
  uses the identical `^xt-(\d+)-([^-]+)-(.+)$` pattern, correctly splitting on the first two hyphens
  only and never re-splitting the GUID segment; tested directly against the SAME
  `shared-fixtures/doc-comments/id-parse-test-vectors.json` desktop reads (`:187-205`), not a
  hand-picked Kotlin-only example set.
- **Duplicate-GUID ambiguity refusal (design review round 2, F3)** — `resolveXlsxThreadTarget` correctly
  returns `AMBIGUOUS_COMMENT_ID` (never silently acting on scan order) the moment the fallback scan
  finds a second root sharing the embedded GUID; tested with a hand-crafted fixture (`:500-516`), since
  neither real fixture has this shape (matching desktop's own precedent).
- **`legacyDrawing`-after-`extLst` ordering (design review round 2, F4)** — `createLegacyPair` uses
  unconditional `appendChild`, correctly landing after a pre-existing `extLst`; tested against the SAME
  shared synthetic fixture desktop's own T13 test uses (`:459-476`), not an independently-built one —
  satisfies the design's own "one shared fixture, not two independently hand-built ones" requirement.
- **Move semantics** — reuses the SAME GUID/dT/text/done state (never mints fresh ids on move, tested
  `:413-429`); refuses `DESTINATION_CELL_OCCUPIED`/`CELL_HAS_NOTE` at the destination identically to
  Add (tested `:395-411`); returns the fresh id embedding the new cell (tested `:377-393`).
- **Security — DOCTYPE/XXE**: `rejectDoctype` runs an unconditional, case-insensitive regex check on
  the RAW XML text BEFORE any parser sees it, independent of whether `setFeature` for
  `disallow-doctype-decl`/external entities succeeds (those are wrapped in a best-effort
  try/catch that swallows `ParserConfigurationException` — but the upfront regex rejection is
  unconditional and doesn't depend on the feature call succeeding). Combined with
  `isExpandEntityReferences = false` and external entity/DTD-loading features disabled, this closes
  the XXE class the same way the prior desktop review directly probed and confirmed closed for
  `linkedom` (no exploit found there either, via a different mechanism — desktop's parser simply never
  resolves external entities at all).
- **Zip-bomb / declared-vs-actual size**: `checkAllEntriesWithinCeiling` (declared-size, cheap, before
  any decompression) plus `readEntryBounded`'s real-byte-counted abort (a backstop that doesn't trust
  the archive's own declared metadata) together correctly close the "small declared size, huge real
  decompressed content" attack — verified by reading the implementation directly; this two-tier
  structure is the same shape desktop's `zip-size-guard.ts` uses (declared-size pre-check +
  `decompressBounded` real-byte backstop).
- **Backup/verify/rollback architecture is arguably STRICTER than desktop's, not weaker.**
  `writeXlsxMutation` mutates a SCRATCH copy, verifies the result BEFORE ever touching the backup or the
  real target, and only then backs up the pristine original and atomically (`ATOMIC_MOVE`, with a
  non-atomic fallback) replaces it. If verification fails, the real target is never touched at all — no
  backup is even created (tested directly, `:520-542`: byte-identical original, no backup file). This
  avoids the whole class of failure desktop's "rename the backup back over the target" rollback step is
  exposed to (what if the rollback rename itself fails?) by never needing a rollback in the first place.
  Backup location (`~/.claude/youcoded-doc-backups/<hash>.xlsx.bak`, app-private home dir), fsync of the
  output file before backup+move, and best-effort directory fsync after the move all match the
  documented requirements.
- **`file-open-elsewhere` step 0** — checked as literally the first thing `writeXlsxMutation` does,
  before backup or mutation, reusing `DocxComments.kt`'s own `isFileOpenElsewhere` (a single shared
  implementation, not a duplicated one) — matches the design's "mirrors identically" instruction.
- **Error-code parity** — every `XlsxWriteError`/`XlsxReadError` wire string
  (`cell-has-note`, `cell-already-has-comment`, `destination-cell-occupied`, `ambiguous-comment-id`,
  `ambiguous-comment-wiring`, `comment-scan-too-large`, `too-many-comments`, `unsafe-xml`,
  `file-open-elsewhere`, etc.) matches desktop's own wire strings exactly.
- **Bridge/dispatch response shapes match the design's own §1.6 decision exactly**: `reply` returns the
  real persisted `CommentReply` (both docx and xlsx branches in `DocCommentsBridge.kt`); `resolve`/
  `reopen`/`move` deliberately stay `{ok:true}` (the design's own reasoning: no caller reads a move's
  fresh id back today) — this is NOT a gap, it is the documented decision, correctly implemented on both
  platforms.
- **Security boundary (exception handling)**: `DocCommentsDispatch.kt`'s `nativeMutateExceptionBoundary`/
  `listNativeComments`'s own try/catch correctly convert a corrupt-but-openable archive's unexpected
  exception into a typed refusal instead of letting it escape uncaught into `serviceScope.launch{}` with
  no `CoroutineExceptionHandler` — which the file's own comments correctly identify as a process-crash
  risk on Android, not just a dropped response, and which this code correctly avoids for both formats.
- **Path/allowlist gating** — `listNativeComments`/`resolveNativeWriteTarget` apply the SAME
  containment/allowlist check to both reads and writes (never a looser gate for mutation), and the
  `path` field is required on reply/resolve/reopen/move at the bridge layer (`DocCommentsBridge.kt`),
  matching design review round 3, F1's requirement that these calls work against a comment never
  previously `list()`-ed in this process (tested, `XlsxCommentsTest.kt:555-565`).

## Test suite run

`cd youcoded && JAVA_HOME=/usr/lib/jvm/java-21-openjdk ANDROID_HOME=$HOME/.android-sdk ./gradlew
testDebugUnitTest -x bundleWebUi --tests '*XlsxComments*'` — BUILD SUCCESSFUL. Confirmed via
`app/build/test-results/{testDebugUnitTest,testReleaseTestUnitTest,testReleaseUnitTest}/TEST-
com.youcoded.app.doccomments.XlsxCommentsTest.xml`: 29/29 passing, 0 failures, 0 errors, 0 skipped,
across all three unit-test variants (debug/releaseTest/release). No scratch test files were added; none
needed to be deleted. `git status` confirms this review left the working tree exactly as found (only the
pre-existing, unrelated concurrent-session diff to `DocxComments.kt`/`DocxCommentsWriteTest.kt`/
`desktop/*` remains, which predates this review and was not touched by it).

## Summary for a non-developer reading this

The Android version of Excel comment support (adding, replying to, resolving, and moving comments on a
phone) is a careful, largely faithful copy of the same logic already reviewed and fixed on the desktop
app. I checked it against six specific bugs a previous review found and fixed on desktop, and five of
those six fixes were correctly copied into the phone code (the sixth, wording, lives in code shared by
both platforms already). All 29 automated tests for this code pass.

One real concern, though: when the phone app saves a comment to an Excel file, it currently reads the
**entire** file into memory and re-packs the **entire** file back up — not just the small part that
actually changed. For a normal-sized spreadsheet this is harmless. But for a large, real spreadsheet
that happens to have embedded pictures or many tabs (not a rare or suspicious file — just a bigger one),
this means every single comment you add or reply to makes the phone momentarily hold the whole file,
uncompressed, in memory, and then re-compress the whole thing again — even the pictures and tabs you
never touched. On a phone (which has much less memory headroom than a laptop), that's a real risk of the
app running out of memory and crashing on a big file, where the equivalent desktop code only ever
touches the handful of pieces the comment itself needs. It doesn't corrupt anything — the file that
comes out is still correct — it's a performance/reliability risk on large files, not a data-safety one.

Three smaller fixes that were already made and tested on the desktop version (closing a "file grows a
little junk every time you move a comment" issue, a defensive check for an unusual file shape, and a
clearer error message when a comment's underlying spreadsheet wiring is broken) were correctly copied
into the phone code too — but nobody wrote a phone-side test proving those three fixes actually work and
will keep working, unlike the desktop side which has one for each. The logic itself looks right on
inspection; it's just unverified by an automated check on this platform.

---

## Triage (2026-09-28, session `comments-mock-a`, commit `b07d4c39f`)

All three findings accepted and fixed; every fix has a new pinning test.

- **F1 (High) — fixed.** `WriteArchive` (`XlsxComments.kt`) no longer eagerly
  decompresses the whole archive into an `entries: LinkedHashMap<String,
  ByteArray>`. It now holds the source `ZipFile` open across the whole
  load→mutate→serialize call (`loadMutateSerializeXlsx` opens it once and
  closes it in `finally`), and a new `originalBytesByName` map tracks only the
  parts actually decompressed: the fixed top-level trio
  (`[Content_Types].xml`, `xl/workbook.xml`, `xl/_rels/workbook.xml.rels`),
  `persons.xml` if present, and whatever `getWorksheetContext` lazily resolves
  for the worksheet(s) a mutation actually touches (unchanged from before —
  that half was already lazy). `mintPartNumber` was updated to scan
  `archive.zip`'s own entry NAMES (central-directory metadata only, no
  decompression) instead of the old `entries.keys`, since that map no longer
  holds every part's name. At serialize time (`serializeArchiveToFile`),
  every entry that's neither an override (changed) nor a tracked original is
  now streamed straight from the source zip to the output
  (`streamCopyUntouchedEntry`, new): a `STORED` entry is passed through RAW
  with its own size/crc preserved exactly (no inflate/deflate at all — the
  "raw compressed bytes where java.util.zip allows" case); anything else
  (`DEFLATED`) is decompressed and re-compressed at the output stream's
  default level but STREAMED through one small fixed buffer, never held as a
  whole `ByteArray`, with the same real-byte-counted zip-bomb backstop
  `readEntryBounded` already gives every part this module actually parses (a
  new `MAX_STREAMED_ENTRY_BYTES` = 200MB cap on the DEFLATED path only, since
  a STORED entry's declared and actual sizes are identical by construction
  and already passed the whole-archive `checkAllEntriesWithinCeiling` check).
  `ZipBombDetectedException`/`XlsxUnsafeXmlDoctypeException` thrown during
  serialize are now re-thrown past `loadMutateSerializeXlsx`'s own generic
  catch so they surface as `ARCHIVE_TOO_LARGE`/`UNSAFE_XML` at
  `writeXlsxMutation`'s outer boundary, not a misleading `WRITE_FAILED`.
  **Confirmed the identical bug in `DocxComments.kt`** (`LoadedArchive.entries`,
  eagerly decompressing every entry NOT in `TRACKED_PART_NAMES` — the docx
  write path has no lazy-per-part precedent at all, unlike xlsx's worksheet
  contexts, so this was a straight port of the same fix: `loadArchiveForWrite`
  now takes an already-open `ZipFile` and only reads the six tracked parts;
  `serializeArchiveToFile` streams everything else via its own copy of
  `streamCopyUntouchedEntry`; `loadMutateSerialize` opens/closes the zip and
  maps a `ZipBombDetectedException` from serialize directly to
  `ARCHIVE_TOO_LARGE`). Re-read `DocxComments.kt` fresh immediately before
  editing — the concurrent character-stripping/symlink-resolution session had
  already landed and committed (`38c74c268`) by the time this fix started, so
  there was no live conflict; this fix's own diff is confined to the
  `LoadedArchive`/`loadArchiveForWrite`/`serializeArchiveToFile`/
  `loadMutateSerialize` region, untouched by that other commit. Tests:
  `XlsxCommentsTest.kt` gained "an untouched STORED entry (e.g. an embedded
  image) passes through RAW, byte-identical and still STORED, never
  re-compressed" (fails against the pre-fix code, since the old path always
  re-wrote every entry as DEFLATED) and "a workbook carrying a large (40MB
  declared) untouched part writes successfully and preserves its content
  exactly" (an all-zero-byte synthetic part, so the fixture stays small on
  disk despite a large declared uncompressed size — the same "declared vs.
  actual" shape a real embedded image has). A JVM unit test has no reliable
  way to assert peak heap directly, named explicitly rather than claimed as
  proven; the STORED-passthrough test's compression-method assertion is what
  actually distinguishes "streamed through" from "fully buffered then
  rewritten," not the large-file test alone.
- **F2 (Medium) — fixed.** Added the three missing pinning tests, each
  mirroring desktop's own: (1) "moving a thread twice within the same
  worksheet reuses its tc author entry, never duplicating it" — moves a
  thread twice, counts `tc={GUID}` occurrences in the resulting
  `xl/commentsN.xml`, asserts exactly 1; (2) "declares xmlns_r defensively
  before stamping legacyDrawing on a worksheet that never had it" — a
  hand-built minimal worksheet (neither real fixture omits `xmlns:r`, so this
  is necessarily synthetic, matching desktop's own precedent for this exact
  case), adds a comment, asserts the declaration is present and the resulting
  worksheet part parses as well-formed XML; (3) "returns
  ambiguous-comment-wiring, not comment-not-found, when the fallback scan
  must pass through a corrupted sheet" — corrupts the real `elden` fixture's
  sheet1 `<legacyDrawing r:id>` so it no longer matches its own vmlDrawing
  relationship, hints at a nonexistent sheet so the fallback scan must walk
  through the corrupted one, confirms the honest error. Also added "allows a
  read exactly AT the record-count ceiling" (20000 minimal
  `<threadedComment>` elements, asserting `Ok` with exactly 20000 records) —
  the missing other half of the boundary, alongside the existing
  "MAX_COMMENT_RECORDS + 1 refuses" test.
- **F3 (Low) — fixed.** Added "xlsx add-reply-resolve-reopen-move round trips
  through the real T19 write pipeline end to end, matching desktop's own
  response shapes" to `DocCommentsBridgeTest.kt` — copies the real `docling`
  fixture into a project root, drives all five mutations plus a final `list`
  through `handleDocCommentsMessage`, and asserts the exact JSON key set and
  values at every step. **This caught a real parity gap while writing it**:
  desktop's own `docComments:move` response for an xlsx target carries the
  moved thread's fresh id (confirmed directly against
  `doc-comments-dispatch.ts`'s `moveNativeXlsxComment`, which returns
  `{ok:true, id: string}`) — `DocCommentsBridge.kt`'s xlsx branch was
  discarding `moveNativeXlsxComment`'s already-correct return value down to a
  bare `{ok:true}`. Fixed to include `id`, matching desktop exactly; docx's
  own move response stays bare `{ok:true}` (a `TextQuoteSelector`-anchored
  comment's id never changes on move), so this is a real, intentional
  per-format asymmetry now correctly preserved on Android, not something
  unified away.

**Also fixed while here (not a separate finding):** `DocCommentsDispatch.kt`
already returned the fresh id correctly from `moveNativeXlsxComment` — only
the bridge layer was dropping it, so no change was needed there.

Verification: `JAVA_HOME=/usr/lib/jvm/java-21-openjdk ANDROID_HOME=$HOME/
.android-sdk ./gradlew test -x bundleWebUi` — 470/470 passing across
debug/releaseTest/release unit test variants (up from 462 before this
triage; 8 new tests: 2 for F1, 4 for F2, 1 for F3, plus the pre-existing
suite unchanged). `./gradlew :app:assembleReleaseTest -x bundleWebUi` —
BUILD SUCCESSFUL (R8 parity; no reflection introduced by this fix).
Committed to `youcoded` at `b07d4c39f`, pushed. This review file itself was
not committed (coordinator's instruction) — only the five source/test files
this triage touched.
