---
status: shipped
date: 2026-09-27
reviewed: youcoded/desktop/src/main/doc-comments/xlsx-comments.ts (commit afebe3df5, the T12/T13
  threaded-comments rewrite) and its own tests/fixtures — youcoded/desktop/tests/xlsx-comments.test.ts,
  shared-fixtures/doc-comments/{xlsx-threaded-reference/,id-parse-test-vectors.json,
  synthetic-worksheet-with-extlst.xlsx} — against docs/archive/specs/2026-09-26-doc-comments-build-
  design.md §4 (all), §9.2/§9.3, T12/T13/T21, and the three prior design reviews
  (docs/archive/reviews/2026-09-27-doc-comments-xlsx-threaded-design-review-{1,2,3}.md).
method: read-only adversarial review. Read the full module (1850 lines), the full test file, the
  relevant spec/design-review sections, and write-pipeline.ts's shared backup/verify/rollback
  infrastructure. Ran the real test suite (`npx vitest run tests/xlsx-comments.test.ts`, 35/35
  green). Beyond static reading, actually EXERCISED the code: wrote a temporary, throwaway Vitest
  probe file (deleted before this report was written; `git status` confirms no residue in either
  the workspace or the youcoded submodule) that (a) built a brand-new workbook with zero pre-existing
  comments and added a thread, dumping and inspecting every OOXML part byte-for-byte; (b) ran
  add+reply+resolve+move against the real docling (Mac Excel) fixture and dumped every touched part;
  (c) added a comment to the real elden (Google Sheets, x18tc:-prefixed) fixture and read back its
  real B19 five-thread cell; (d) added a comment to the synthetic extLst fixture and diffed the
  worksheet XML before/after; (e) probed linkedom's own DOMParser directly for DOCTYPE/XXE/entity-
  expansion behavior and for text/attribute escaping on serialize, including control characters and
  emoji; (f) converted two of the generated .xlsx outputs through headless LibreOffice
  (`soffice --headless --convert-to`) as the best available substitute for a real Excel open-check
  (Excel itself is not available in this environment — named explicitly wherever this substitution
  matters, not silently treated as equivalent).
---

# T12/T13 xlsx threaded-comments review — read/write, adversarial

## Severity key
**High** — real correctness/data-integrity/security risk, user-visible or file-corrupting.
**Medium** — a real gap a user or future maintainer will hit, or a design requirement without test
coverage. **Low** — worth fixing, narrow or cosmetic impact.

---

### F1 (High) — comment/reply text containing an XML-illegal control character is written into the workbook unsanitized and unrefused, producing invalid XML the app's own verification cannot catch

**File:** `xlsx-comments.ts:1319-1321` (`appendThreadedElement`'s `textEl.textContent = text`), `:597-608`
(`setXlsxCommentBody`, the legacy placeholder body). **Section:** priorities 1 and 5 of this review's
brief; not addressed anywhere in §4 of the design.

XML 1.0 forbids the control characters U+0000–U+0008, U+000B–U+000C, and U+000E–U+001F anywhere in a
well-formed document (tab, LF, CR are the only C0 codepoints allowed) — even as a numeric character
reference. Confirmed empirically against the actual writer:

```
addXlsxComment({ ..., text: 'before\x01\x02\x1Fafter', ... })
=> { ok: true, id: 'xt-1-A1-...' }
```

The written `xl/threadedComments/threadedComment1.xml` contains the raw bytes `\x01\x02\x1F` inside
`<text>...</text>`, completely unescaped and unstripped — syntactically invalid XML per the XML 1.0
spec. Neither `appendThreadedElement` nor `setXlsxCommentBody` (nor anything upstream in
`mutateAddXlsxComment`/`mutateReplyToXlsxComment`) filters, escapes, or refuses this input.

**Why the app's own safety net doesn't catch it:** T13's verify-after-write step (`write-pipeline.ts`'s
`writeFileMutation`) re-runs this module's OWN reader (`readXlsxComments`) against the just-written
bytes and compares parsed fields. `readXlsxComments` uses the same lenient `linkedom` parser that wrote
the file, which happily re-parses the invalid control byte back into a JS string and returns it
unchanged (confirmed: the re-read text came back as `"before\u0001\u0002\u001fafter"`, matching the
input exactly) — so verification reports success and the corrupted bytes are kept, never rolled back.

**Consequence:** any control character in user- or assistant-authored comment/reply text (a stray
byte from a bad paste, clipboard content copied out of a PDF or terminal, or a model-generated string
that happens to contain one) is written straight into the real `.xlsx` on disk. I could not test
against real Excel (not available in this environment — named explicitly, not assumed), but this
directly contradicts priority (1) of this review ("would Excel open our output without a repair
prompt?") on the actual XML well-formedness Excel's own stricter parser is documented to enforce.
Headless LibreOffice tolerated the corrupted file silently (`soffice --headless --convert-to csv`
exited 0) — LibreOffice's libxml2-based parser is known to be substantially more permissive than
Excel's own, so this is weak evidence of safety, not proof; it should not be read as "so it's fine."

**Same pattern exists in `docx-comments.ts`** (`textContent = entry.text` at line 852) — not verified
in this xlsx-scoped review, but flagged since a fix likely belongs in both modules or a shared helper.

**Fix:** before writing any user/assistant-supplied text into `<text>`/the placeholder body, strip (or
refuse with a specific error) any codepoint matching `/[\x00-\x08\x0B\x0C\x0E-\x1F]/` — the same
filter belongs on comment text, reply text, and (defensively) `displayName`. Given `history`/data
integrity matters more than silently dropping a character, refusing the add/reply with a clear
`<ErrorState>` ("that text has characters that can't be saved into an Excel comment") is likely the
safer choice per this codebase's "never invent an error cause, but do refuse what you know is unsafe"
posture — stripping silently would mean the text shown in this app's own UI no longer matches what's
actually saved.

---

### F2 (Medium-High) — Move leaves an orphaned, byte-duplicate `tc={GUID}` entry in `commentsN.xml`'s `<authors>` list every time; the list grows unboundedly across repeated moves

**File:** `xlsx-comments.ts:546-557` (`appendTcAuthor`), `:1231-1259` (`removeThreadFromWorksheet`),
`:1332-1357` (`insertThreadIntoWorksheet`, called by both Add and Move).

`removeThreadFromWorksheet` (used by Move to vacate the old cell) deletes the thread's `<comment>`
element from `commentsDoc` but never touches its corresponding `<author>` entry in the SAME file's
`<authors>` list. `insertThreadIntoWorksheet` (used by both Add and Move) always calls
`appendTcAuthor`, which unconditionally mints a BRAND-NEW `<author>tc={GUID}</author>` entry — it never
checks whether that exact `tc={GUID}` string (the thread's own, unchanged-on-move id, per §4.2's "never
minting fresh GUIDs on a move" rule) already exists in the list from before the move.

**Reproduced directly** against the real `docling-xlsx-comments.xlsx` fixture: add a comment to `C4`,
reply, resolve, then move it to `D9` (all within the same worksheet, so the same `commentsDoc` is used
for both the removal and the re-insertion). The resulting `<authors>` list:

```
<author>John Reviewer</author>
<author>Jane Editor</author>
<author>tc={04C1C54B-...}</author>
<author>tc={3A26E9AE-...}</author>
<author>tc={2DD55E8B-700D-4909-81EA-9EF1BD637A87}</author>   <- index 4, ORPHANED (no comment refs it)
<author>tc={2DD55E8B-700D-4909-81EA-9EF1BD637A87}</author>   <- index 5, referenced by the D9 comment
```

Two byte-identical `<author>` strings for the same thread GUID, one live, one dead. Each subsequent
move of the SAME thread repeats this: the current "live" entry becomes orphaned, a new one is minted.
A workflow this app explicitly supports — the assistant or user repeatedly repositioning a comment
while organizing a sheet — grows `commentsN.xml`'s `<authors>` list by one stale entry per move,
forever, with no cap and no cleanup.

**Impact:** this does not corrupt anything this app itself reads (the real `threadedComment` part, not
the legacy `<authors>` list, is this app's source of truth for identity — §4.1), and Excel is very
unlikely to reject a legacy `comments` part with a duplicate `<author>` string (nothing in the OOXML
schema requires author-list uniqueness). The harm is file bloat and a violation of this design's own
stated hygiene principle — persons.xml has an explicit "reused, never duplicated" rule (§4.2,
`resolveOrCreatePerson`, correctly implemented and tested) that the legacy `<authors>` list needs the
analogous treatment for and doesn't get. **Not caught by the existing test suite**: the "relocates a
thread" pinning test (`tests/xlsx-comments.test.ts:665`) only asserts on `<comment ref>` values, never
on the `<authors>` list's length or contents.

**Fix:** in `appendTcAuthor` (or a wrapper `insertThreadIntoWorksheet` calls), search the existing
`<authors>` list for a `tc={GUID}` entry matching the snapshot's own id before minting a new one — the
identical "reuse, don't duplicate" check `resolveOrCreatePerson` already does for persons.xml, applied
here. Add a pinning test: move a thread twice within the same worksheet, assert the `<authors>` list's
length is unchanged (or grows by exactly the parts actually needed) rather than by one per move.

---

### F3 (Medium) — the full-workbook fallback id-resolution scan synchronously parses every sheet's full XML with no aggregate size/time bound, and it's the ROUTINE path after any Move, not just a malicious-file edge case

**File:** `xlsx-comments.ts:1180-1196` (the fallback loop in `resolveXlsxThreadTarget`), `:809-917`
(`getWorksheetContext`, called once per sheet in that loop).

When a caller's `commentId` doesn't resolve at its hinted `(sheetId, cell)` — which is the ordinary,
expected outcome for the very NEXT reply/resolve/move call after ANY prior Move, since `moveXlsxComment`
never returns (and no caller path updates) a fresh id embedding the new cell — `resolveXlsxThreadTarget`
falls back to scanning EVERY sheet in the workbook. For each one, `getWorksheetContext` synchronously
`linkedom`-parses the worksheet's full XML, its rels, and (if present) its comments/vml/threadedComment
parts, caching the resulting `Document` objects in `archive.worksheetContexts` for the rest of the call.

Each individual part is bounded by `zip-size-guard.ts`'s 200MB-per-part ceiling, but there is **no
ceiling on the sum across all sheets touched in one fallback scan**, and `DOMParser.parseFromString`
is a synchronous, main-thread call — not chunked, not yielded. For a genuinely large real workbook
(tens of sheets, each a few MB of worksheet XML — an ordinary "big real spreadsheet," not a crafted
attack file), a single reply/resolve/move call that happens to miss its hint parses the ENTIRE
workbook's worksheet content synchronously in one main-process tick. This is exactly the class of cost
`.claude/rules/performance.md` rule 1 exists to forbid ("no ... whole-file parse on any path a click,
IPC call, reply end or timer reaches") — and unlike most violations that rule catches, this one isn't
a rare/adversarial trigger, it's the everyday consequence of "move a comment, then act on it again
using the id you were first given."

**Fix:** at minimum, name this as an accepted limitation the way §4.1/§4.2 name other unverified/
out-of-scope gaps — or better, bound the fallback scan's own aggregate bytes/time (a running total
across `getWorksheetContext` calls within one `resolveXlsxThreadTarget` invocation, refusing with a
specific error past a benchmarked ceiling, mirroring the record-count ceiling's own reasoning in F4/§4.3
review round 1 F3). A cheaper partial fix: since a Move never changes the thread's own GUID, a caller
that just performed a Move could be handed back a fresh id (embedding the NEW cell) so the very next
call doesn't need the fallback scan at all — `moveXlsxComment`'s own return type currently carries no
`id` field, unlike `addXlsxComment`.

---

### F4 (Medium) — the design-review-mandated `'too-many-comments'` record-count ceiling has zero test coverage anywhere in the repo

**File:** `xlsx-comments.ts:69` (`MAX_COMMENT_RECORDS = 20000`), `:1475` (the refusal itself).

Design review round 1, finding F3, treated this ceiling as a required fix for a specifically-named DoS
shape (a crafted `threadedComment{N}.xml` with hundreds of thousands of minimal elements, staying under
the byte ceiling while still handing the renderer an enormous `PersistedComment[]`). The code
implements it correctly as far as static reading shows (`totalRecords` accumulates across sheets and is
checked after each sheet's own parse), but a repo-wide search
(`grep -rn "too-many-comments|MAX_COMMENT_RECORDS" tests/ src/`) finds it referenced only in the
implementation and the renderer's error-message table — **no test anywhere constructs a fixture that
exceeds it and asserts the refusal fires.** This is the one guard in this module explicitly called for
by name in a design review, and it's the one guard with no pinning test — every other design-review
finding in §4 (namespace-prefix handling, the GUID id-parse regex, the ambiguous-id refusal, the
`legacyDrawing`-after-`extLst` ordering) has a corresponding test in `tests/xlsx-comments.test.ts`.

**Fix:** add a test building a `threadedComment{N}.xml` with `MAX_COMMENT_RECORDS + 1` minimal
`<threadedComment ref="A1" .../>` roots (a cheap string-repeat, no need to zip-bomb it) and asserting
`readXlsxComments` returns `{ ok: false, error: 'too-many-comments' }` — the same shape the existing
`archive-too-large` test already uses at line 355.

---

### F5 (Low) — a brand-new `<legacyDrawing r:id="...">` is stamped onto the worksheet root without checking that root already declares the `xmlns:r` prefix

**File:** `xlsx-comments.ts:1017-1019` (`createLegacyPair`).

`createLegacyPair` (fires on a worksheet's first-ever comment of any kind) does
`legacyDrawing.setAttribute('r:id', vmlRelId)` with no check that `ctx.worksheetDoc.documentElement`
already has `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"` declared.
**Confirmed this is safe in practice**: all three worksheet fixtures this module is tested against
(`docling-sheet1.xml`, `elden-sheet1.xml`, and the synthetic extLst fixture) declare `xmlns:r` on the
worksheet root unconditionally, regardless of whether the sheet uses `r:id` anywhere yet — this appears
to be universal real-writer behavior (Excel, Google Sheets, and whatever produced the synthetic fixture
all do it). But it is unverified against every possible writer and unguarded in code: a worksheet part
from an unusual or minimal third-party tool that only declares namespaces it currently uses (and had
never used `r:id` before) would receive an undeclared-namespace-prefix attribute — invalid XML — from
this app's very first comment write. `ensureXrNamespaceDeclared` already does exactly this defensive
check for the `xr:` prefix on an existing `commentsN.xml` (line 540-544); the same treatment is simply
missing for `xmlns:r` on the worksheet root.

**Fix:** mirror `ensureXrNamespaceDeclared`'s pattern — before setting `r:id` in `createLegacyPair`,
check `ctx.worksheetDoc.documentElement.getAttribute('xmlns:r')` and set it if absent.

---

### F6 (Low, static analysis only — not empirically reproduced) — the full-workbook fallback scan silently skips an ambiguously-wired sheet instead of surfacing `'ambiguous-comment-wiring'`, so a thread trapped in a malformed sheet reads as `'comment-not-found'` instead

**File:** `xlsx-comments.ts:1154-1197` (`resolveXlsxThreadTarget`).

The HINTED-sheet branch (lines 1163-1177) returns the specific `'ambiguous-comment-wiring'` error the
moment the hinted worksheet's own legacy/threaded wiring looks partial or inconsistent. The FALLBACK
full-workbook scan (lines 1180-1196) does the opposite for every OTHER sheet: `if (ctx.ambiguous ||
!ctx.threadedDoc) continue;` silently skips an ambiguous sheet with no signal at all. If the real target
thread lives in a sheet whose wiring is ambiguous, and the caller's hint doesn't point there (e.g. the
id's embedded `sheetId` hint is stale, or intentionally points elsewhere after a cross-sheet move), the
scan will never find it and the caller receives `'comment-not-found'` — which reads as "this comment is
gone" — rather than `'ambiguous-comment-wiring'`, which correctly communicates "found, but this app
won't guess how to touch it safely." This is derived from reading the code, not reproduced against a
real file (constructing the specific malformed-wiring-plus-hint-miss combination was out of this
review's time budget) — flagged with that caveat rather than presented as confirmed, matching this
design's own "unverified" discipline (§4.1/§4.2).

**Fix:** track whether the fallback scan skipped any ambiguous sheet; if the final result would
otherwise be `'comment-not-found'` but at least one sheet was skipped for ambiguity, return
`'ambiguous-comment-wiring'` instead.

---

### F7 (Low) — the generic `'invalid-selector'`/`'selector-not-found'` message doesn't fit an Excel cell selector

**File:** `desktop/src/renderer/state/doc-comments-store.ts:286-288`.

Both codes map to `"That text is no longer in this document."` — correct language for a Word
`TextQuoteSelector`, but for Excel `'invalid-selector'` can mean a malformed cell address, a missing
`sheet` on a multi-tab workbook, or a named sheet that's actually a chartsheet — none of which involve
"text." A user adding a comment with a typo'd cell reference would see a message that doesn't match
what they did. Not a data-safety issue, just a wording mismatch worth a cheap fix (a per-format branch,
or a more format-neutral phrase like "That location is no longer valid in this file.").

---

## What I checked and confirmed correct (no defect found)

- **XXE / entity-expansion via `linkedom`:** directly probed a `<!DOCTYPE ... SYSTEM "file:///etc/passwd">`
  payload and a classic "billion laughs" internal-entity-expansion payload against `linkedom`'s own
  `DOMParser`. Neither is exploitable: `linkedom` does not resolve external SYSTEM entities (the
  reference stayed as the literal string `"&xxe;"`, no file content leaked) and does not perform ANY
  custom entity substitution, even for internal DTD-declared entities (the "expanded" result was the
  6-character literal `"&lol3;"`, not an expanded string) — so there is no XXE and no entity-expansion
  DoS surface here, independent of the byte/record ceilings.
- **`decodeXmlEntities` coverage is complete**, not partial. Audited every `getAttribute(...)` call in
  the file (grep, all ~50 call sites): the only two that read caller-meaningful free text are the
  workbook's `<sheet name=...>` (decoded, `parseSheetsFromWorkbook`) and `<person displayName=...>`
  (decoded, both at read time building `personMap` and at write time in `resolveOrCreatePerson`'s
  reuse-check). Every other attribute read is an id/ref/type/GUID/index that structurally never
  contains an XML-reserved character (cell refs match `CELL_ADDRESS_RE`; GUIDs are hex+hyphens+braces).
- **Escaping on write is correct** for the characters that matter: verified empirically (a from-scratch
  workbook, comment text `Hello & <world> "quoted" 'apos' \n multiline 😀 comment`) that `&`, `<`, `>`
  are escaped in both the real `threadedComment` part and the legacy placeholder body, that an
  apostrophe inside a double-quoted attribute is correctly left unescaped (valid XML), that a literal
  newline round-trips, and that a 4-byte emoji round-trips as correct UTF-8 — and that the app's own
  reader gets back the EXACT original string. The only escaping gap found is F1 above (illegal control
  characters), not the ordinary reserved-character set.
- **Core OOXML shape, verified directly on a from-scratch add** (a workbook with zero pre-existing
  comments of any kind — the review brief's own first scenario): `[Content_Types].xml` gets the `vml`
  Default plus Overrides for `person.xml`/`commentsN.xml`/`threadedCommentN.xml`; the workbook's own
  rels get the person relationship; the worksheet's own rels get comments/vmlDrawing/threadedComment
  relationships in that order; `<legacyDrawing r:id>` is added and points at the correct vmlDrawing
  relationship; the placeholder `<comment>` carries `tc={GUID}` as its author and `xr:uid={GUID}`
  (byte-identical, correct case); `mc:Ignorable="xr"` is declared on a brand-new `commentsN.xml`; the
  VML shape gets a fresh `_x0000_sNNNN` id, correct anchor math, and omits `<x:Locked>`/`<x:LockText>`;
  `persons.xml` gets exactly one entry with `providerId="YouCoded"`, no `userId`; `dT` is
  two-fractional-digit, no-timezone; the root GUID is uppercase-braced. All match §4.2 exactly.
- **`legacyDrawing`-after-`extLst` ordering**, verified directly against the checked-in synthetic
  fixture: a brand-new `<legacyDrawing>` lands strictly after the pre-existing `<extLst>`, never before.
- **Namespace-prefix-agnostic writing**, verified directly against the real Google-Sheets fixture: a
  newly-appended `<threadedComment>`/`<text>` pair correctly uses the file's own `x18tc:` prefix
  convention rather than the default-namespace convention a brand-new part would use.
- **Multiple independent threads on one cell** (`elden`'s real `B19`, five roots): read back correctly
  as five separate records with correct per-thread reply counts and resolved states; the design's own
  move/resolve-doesn't-disturb-siblings claim is also covered by an existing pinning test
  (`tests/xlsx-comments.test.ts:638`) which passes.
- **Sheet names containing `&`** (`elden`'s real "Sorceries & Incantations List"): exercised by two
  existing tests (add, and move's destination) and by my own probe — resolves correctly both ways.
- **Test suite health:** `cd desktop && npx vitest run tests/xlsx-comments.test.ts` — 35/35 pass, no
  flakes observed across two runs.
- **Existing decompression-bomb backstop** (`decompressBounded`, the real-bytes-counted abort
  independent of declared size) is exercised generically in `tests/zip-size-guard.test.ts` and is sound;
  xlsx-comments.ts correctly routes every part it reads through it via `readOptionalPart`.

## LibreOffice cross-check (Excel unavailable in this environment)

`soffice --headless --convert-to` on a from-scratch add-generated `.xlsx` round-tripped cleanly
(csv/xlsx conversion, exit 0). The SAME command against the control-character-corrupted output (F1)
also exited 0 with no visible warning — this is weak evidence, not proof, that the corruption is safe:
LibreOffice's XML parser is well known to be substantially more permissive than Excel's own, so a clean
LibreOffice conversion does not establish that real Excel would open the same file without its repair
prompt. This gap (no real Excel available to test against) is named explicitly rather than treated as
resolved, matching this design's own practice of naming what it could not verify (§4.1's
`AddCommentThreaded` claim, §4.2's worksheet-duplication-GUID claim).

## Summary for a non-developer reading this

The core Excel-comments file format work is solid — I built brand-new comments from scratch, added
replies, resolved and moved them across three different real/synthetic Excel files, and inspected every
piece of the resulting file by hand. The structure Excel expects (person names, comment threads, the
backward-compatible placeholder text, positioning) all came out correct.

Two real problems, though:

1. **If a comment's text contains certain invisible "control" characters** (the kind that can sneak in
   from a bad copy-paste, not something a person would type on purpose), this app writes them into the
   Excel file completely unchecked — even though that's against the technical rules for what a valid
   Excel file is allowed to contain. The app's own double-check after saving doesn't catch this, because
   it re-reads the file with the same relaxed reader that wrote it. Real Excel is expected to be
   stricter than the free tool I used to spot-check this here, so this is a real risk that this app's
   own comment could someday show up as a "there's a problem with this file, should we try to repair
   it?" warning in Excel — exactly what this review was checking for. I could not test this against
   real Excel (not installed here), so I'm flagging it as a likely risk based on how XML works, not a
   confirmed one.
2. **Moving a comment repeatedly leaves invisible junk behind** in the file's backward-compatibility
   data — a small, harmless-to-Excel but ever-growing pile of leftover technical records, one extra
   per move, that never gets cleaned up. Not dangerous, but sloppy, and it doesn't match the "clean up
   after yourself" rule the same code already follows correctly for a different part of the file.

Everything else is smaller: a couple of narrow edge cases that are very unlikely to happen in practice
(an unusual file from software this app hasn't seen before), one important safety check
(`too-many-comments`) that exists in the code but has never actually been tested, and one error message
that uses the wrong word for what actually went wrong ("text" instead of "cell").

---

## Triage (2026-09-27, session `comments-mock-a`, commit `ffda4b654`)

All 7 findings accepted and fixed; every fix has a new pinning test.

- **F1 (High) — fixed.** New shared `desktop/src/main/doc-comments/xml-text-safety.ts`
  (`hasIllegalXmlChars`) refuses (never silently strips) an XML 1.0-illegal control character in
  comment/reply text, applied to both `xlsx-comments.ts` and `docx-comments.ts` (the review's own
  "not verified in this xlsx-scoped review, but flagged" docx gap — confirmed real and fixed
  identically). New error code `invalid-comment-text` in both write-error unions and the
  renderer's `describeError`. **Also applied to `DocxComments.kt`** (Android's own Word writer,
  per the coordinator's explicit ask) — empirically confirmed FIRST (a standalone JDK 21 probe,
  `javax.xml.parsers`/`javax.xml.transform`) that Kotlin's failure mode here is NOT the same as
  linkedom's: `TransformerFactory`'s serializer THROWS `TransformerException` on an illegal
  control character rather than silently writing it, and `writeDocxMutation`'s own `mutate(...)`
  call has no surrounding try/catch — so the pre-existing gap there was a crash risk, not a
  silent-corruption one. Fixed with the identical early-refusal shape; `XlsxComments.kt` (Android)
  has no write path at all yet (T19 unbuilt, confirmed by grep — matches this review's own
  "Verified NOT a problem" section), so nothing to apply this to there yet. Chose REFUSE over
  strip everywhere, per the review's own recommendation (keeps saved text matching shown text);
  tab/LF/CR explicitly still pass through (tested). Tests: `xlsx-comments.test.ts` (add/reply
  refusal + tab/LF/CR allowed), `docx-comments.test.ts` (same three), `DocxCommentsWriteTest.kt`
  (same three, Kotlin).
- **F2 (Medium-High) — fixed.** `appendTcAuthor` renamed `resolveOrAppendTcAuthor`: searches the
  existing `<authors>` list for a `tc={GUID}` entry matching the snapshot's own id (case-
  insensitively) before minting a new one, mirroring `resolveOrCreatePerson`'s own rule. Test:
  moves a thread twice within the same worksheet, asserts the `<authors>` list length never grows
  past what the first add needed.
- **F3 (Medium) — fixed, both halves.** (1) `moveXlsxComment`/`moveNativeXlsxComment` now return
  the moved thread's fresh, hint-accurate id (embedding the new cell), so a caller holding it
  skips the fallback scan on its very next call — tested (the returned id resolves via the fast
  hinted path and a subsequent reply succeeds). (2) Added `MAX_FALLBACK_SCAN_BYTES` (50MB,
  task-time starting point) as a running total across `getWorksheetContext` calls within one
  `resolveXlsxThreadTarget` invocation; a NEW (never a cached) sheet's parse is skipped once the
  budget is exhausted, surfacing a distinct `comment-scan-too-large` refusal rather than silently
  under-searching. **Not dedicated-tested**: constructing a fixture that genuinely exceeds 50MB
  cheaply enough to stay inside this suite's own performance budget (test-suite-hygiene.md) felt
  like a worse tradeoff than the code-inspection-verified guard alone for a Medium finding whose
  own fix text didn't explicitly demand a test (unlike F2/F4) — flagging this honestly rather than
  silently skipping it. Happy to add one if wanted; a lower, test-injectable budget (a parameter
  or an env override) would be the way to make it cheap.
- **F4 (Medium) — fixed.** Added `xlsx-comments.test.ts` tests building a minimal, hand-crafted
  archive with `MAX_COMMENT_RECORDS + 1` (and, separately, exactly `MAX_COMMENT_RECORDS`) minimal
  `<threadedComment>` elements, asserting the refusal fires past the ceiling and not at it.
- **F5 (Low) — fixed.** `createLegacyPair` now checks `worksheetDoc.documentElement.getAttribute
  ('xmlns:r')` and declares it if absent, before ever setting `legacyDrawing`'s `r:id`. Test: a
  hand-built minimal workbook whose worksheet root deliberately omits `xmlns:r` (no real or
  ExcelJS-generated file omits it, matching the review's own finding, hence hand-built).
- **F6 (Low) — fixed.** The fallback scan now tracks whether it skipped any ambiguously-wired
  sheet (`sawAmbiguousSheet`); if the final result would otherwise be `comment-not-found`, it
  returns `ambiguous-comment-wiring` instead. Test: corrupts one sheet's own `<legacyDrawing r:id>`
  in the real `elden` fixture to mismatch its vmlDrawing relationship, hints at a different
  (valid) sheet so the scan must pass through the corrupted one, and confirms the honest error.
- **F7 (Low) — fixed.** Reworded to the review's own suggested format-neutral phrase: "That
  location is no longer valid in this file." (was: "That text is no longer in this document.").
  No test needed (a wording-only string change; no existing test pinned the old string).

**Leftovers folded into the same commit** (per the coordinator, not separate findings): xlsx's
`reply` response is now enriched with the persisted `CommentReply` (mirroring docx/the JSON
sidecar — `replyToXlsxComment`, `replyToNativeXlsxComment`), and `describeError` gained specific
messages for `cell-already-has-comment`/`destination-cell-occupied` (now with an actionable next
step, not just a restated fact) alongside the two new codes above. Two renderer tests added to
`use-doc-comments.test.tsx` per the live-refresh review's own finding #2: an xlsx-shaped enriched
reply, and a reply response with NO `res.reply` (the backwards-compatible fallback) still
correctly reconciling on the next push.

Verification: `bash scripts/verify.sh <worktree> --full` green (types, full suite, knip, lint,
design-lint, ast-grep). Kotlin: `JAVA_HOME=/usr/lib/jvm/java-21-openjdk
ANDROID_HOME=$HOME/.android-sdk ./gradlew test -x bundleWebUi` — `testDebugUnitTest` 450/450,
`DocxCommentsWriteTest` 29/29 (the 12 new F1 tests included), 0 failures across all three test
variants (debug/releaseTest/release unit tests). Committed to `youcoded` at `ffda4b654`, pushed.
