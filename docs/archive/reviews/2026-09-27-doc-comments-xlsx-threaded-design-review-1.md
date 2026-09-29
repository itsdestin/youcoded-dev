---
status: shipped
date: 2026-09-27
reviewed: docs/archive/specs/2026-09-26-doc-comments-build-design.md (commit 8937f0c4, xlsx §4
  redesign for threaded-comments-only), against youcoded/shared-fixtures/doc-comments/
  xlsx-threaded-reference/ (app commit d0d4bedd1) and the currently-built code it will replace
  (xlsx-comments.ts, write-pipeline.ts, zip-size-guard.ts, doc-comments-dispatch.ts,
  XlsxComments.kt).
method: read the design's §4 (4.1-4.3a), T12/T13/T18/T19 rows, §9.2/§9.3, changelog; unzipped
  BOTH real reference .xlsx files directly (docling-xlsx-comments.xlsx, elden-ring-completionist-
  checklist.xlsx) and diffed the design's "confirmed directly" claims against the raw XML rather
  than trusting the manifest/README that ships alongside the fixtures.
resolved: 2026-09-27, same day — all 12 findings triaged (11 accepted and fixed in the design doc
  [and, for F2's two factual sub-claims, in the app repo's xlsx-threaded-reference/manifest.json],
  1 informational/already-handled) — see each finding's own "Triage:" line below, and the design
  doc's own changelog entry naming this review.
---

# Review: xlsx threaded-comments redesign (§4, T12/T13/T18/T19, §9.2/§9.3)

Read-only review. 12 findings below, numbered in the order they appear in the design.

## Severity key
**Blocker** — must fix before build starts. **High** — real correctness/security risk, fix
before build. **Medium** — a builder will hit this and have to invent an answer; the design
should supply one. **Low** — worth a sentence in the doc; does not block building.

---

### F1 (High) — a cell's comment id embeds a positional index that a foreign edit can silently reshuffle out from under an in-flight mutation

**Section:** §4.2 "A cell reference can carry MULTIPLE, entirely independent threads", §4.3 steps
2-4 (Reply/Resolve/Move all take a `commentId`).

**The design's own text:** the app-level id for a thread is `xt-{sheetId}-{cell}-{n}`, with `n`
"0-indexed by ascending `dT` among that cell's roots **at read time**." The design's only
stability argument is: *"A brand-new thread this app creates always sorts last (its `dT` is
'now'), so this ordinal never reshuffles an already-seen thread's id out from under an in-flight
reply/resolve/move call."*

That sentence only defends against **this app's own** writes. It says nothing about a **foreign**
edit landing between two of this app's operations on a shared, multi-thread cell — and §4.2 itself
proves that shape is real and not rare: cell `B19` in the real `elden` fixture carries five
independent, unrelated threads, authored by five different people over nine months. This is
exactly the file shape a colleague's spreadsheet has.

**Concrete failure scenario:** the assistant reads `B19`, gets five cards, and is told (by the
user, or by its own earlier turn) to resolve `xt-6-B19-2` — the third-oldest thread. Before that
call runs, a colleague deletes their own (unrelated) oldest thread on `B19` via Excel's normal
UI, and saves. The next `list()`/mutate call recomputes ordinals: what was `xt-6-B19-2` is now a
**different** real thread, one position earlier in the recomputed ascending-`dT` order. The
resolve now lands on the wrong colleague's comment, silently — no error, no refusal, because
nothing in the write path checks that the id it was handed still names the thread it named when
issued. This is precisely the "silently mishandled" failure §4.2 says it's trying to avoid on the
cross-platform side (§9.3's `B19` parity test) but leaves open on the single-platform,
single-session side.

**Proposed fix:** encode the thread's real, stable `id` GUID into the app-level comment id
(e.g. `xt-{sheetId}-{cell}-{last8ofGUID}`, or just the GUID itself) instead of a purely
positional ordinal. Every reply/resolve/reopen/move re-resolves by matching that embedded GUID
against the file's *current* `threadedComment` elements and refuses `'comment-not-found'` if it's
gone — never by "the nth thread currently at this ref." An ordinal can still drive **display**
order (already-open cards shouldn't visually jump around), but must not be the identity key a
mutation targets.

**Triage: Accepted.** Fixed in `docs/archive/specs/2026-09-26-doc-comments-build-design.md` §4.2
("Id scheme, corrected...") and mirrored in §4.3's write steps and §4.3a's Android bullet list. The
app-level id is now `xt-{sheetId}-{cell}-{GUID, braces stripped}` — the full GUID, not a truncated
one, since there is no reason to accept even a theoretical truncation-collision risk for an
internal id. `sheetId`/`cell` are kept as a locate-first hint only; every reply/resolve/reopen/move
resolves by matching the embedded GUID against the hinted `ref` first, then falls back to a
full-workbook scan (covering the case where the thread itself moved between two of this app's own
calls), and refuses `'comment-not-found'` only if neither finds it — never positional guessing.
Reply ids deliberately keep their existing `{rootId}-r{n}` ordinal convention (not switched to
GUID-embedding too): no tool in §5's table ever addresses an individual reply by id — only a
thread's root id is ever passed back into `ReplyToComment`/`ResolveComment`/`ReopenComment`/
`MoveComment` — so a reply's own id is display-only and the F1 failure mode doesn't apply to it;
this reasoning is now stated explicitly in the doc rather than left for a future reader to wonder
why replies weren't "fixed" the same way.

---

### F2 (Medium) — three "confirmed directly against real files" claims in §4.2 do not match the checked-in files when independently re-verified

The design's whole epistemic pitch for §4 is "researched from spec + real files, not assumed."
Spot-checking three specific "confirmed" claims against the actual unzipped bytes of
`elden-ring-completionist-checklist.xlsx` and `docling-xlsx-comments.xlsx` (both already sitting
in the repo) found three that don't hold up:

1. **The N-to-worksheet-position claim is backwards for the very file cited.** §4.2 says: *"N...
   is NOT tied to the worksheet's position in the workbook — confirmed directly: the Google
   Sheets file has 10 sheets, comments only on sheets 1 and 5, using N=1 and N=4 respectively,
   matching each sheet's OWN `.rels` file rather than a 1:1 sheet-index mapping."* Unzipping the
   real file shows the opposite: **9 of the 10 sheets** have comments (`comments1.xml` through
   `comments9.xml`, `threadedComment1.xml` through `threadedComment9.xml`), and every one of them
   is an exact 1:1 match to its sheet's position (`sheet1.xml.rels` → `comments1.xml`/
   `threadedComment1.xml`, ... `sheet9.xml.rels` → `comments9.xml`/`threadedComment9.xml`; only
   sheet 10 has none). The design's own general point — "don't assume N tracks sheet index,
   `mintPartNumber` picks the smallest unused number instead" — is still a safe algorithm on its
   own merits, so this doesn't break the write design. But the specific evidentiary claim backing
   it is false, and it's checkable in under a minute against a file already in the repo.
2. **Internally inconsistent reply/root count.** §4.2 (the `parentId`/reply-flattening
   paragraph) cites *"an 8-reply, 5-root, 9-message cell (elden, below)"* for `B19`. 8+5=13, not
   9 — the sentence contradicts itself. The real data (verified): 5 roots, **4** replies, 9
   messages total. Should read "4-reply, 5-root, 9-message."
3. **`mc:Ignorable="xr"` is not "confirmed present" in both fixtures.** §4.2 says the legacy
   `<comments>` root declares `mc:Ignorable="xr"` "confirmed present whenever a `tc=` author
   exists." `docling`'s (Mac Excel) `comments1.xml` root does have it. `elden`'s (Google Sheets)
   `comments1.xml` root does **not** — it declares `xmlns:xr` and writes `xr:uid="tc={...}"`
   attributes freely, with no `mc:Ignorable` at all, and Excel accepts it anyway (this is
   independently confirmable: `grep mc:Ignorable xl/comments1.xml` on the real file returns
   nothing). Low practical impact — the reader only needs to check `tc=`/`xr:uid`, never
   `mc:Ignorable`, so no reading logic breaks — but it's the third "confirmed present/confirmed
   directly" claim in the same section that doesn't survive a direct check.

**Recommendation:** none of these three individually changes the write algorithm, but together
they're reason to do one more independent pass over §4.2's "confirmed" language specifically
(not the whole document) before treating it as ground truth for T12/T13/T18/T19 — a builder who
trusts the "N is sparse and non-1:1" framing, for instance, might reasonably (if unnecessarily)
over-engineer the read path's sheet/part-number resolution around a pattern that doesn't actually
occur in either sample.

**Triage: Accepted, all three sub-claims — independently re-verified against the raw unzipped
files, not just re-read.**
1. Re-checked directly (listed every `sheet{1..10}.xml.rels`'s own comments/threadedComment
   relationship Target in `elden`): confirmed 9 of 10 sheets have comments, not 2, and — this
   review's own "1:1 to sheet position" replacement claim is ALSO not quite right — the true
   pattern is N incrementing sequentially among only the COMMENTED sheets in document order
   (sheet5, the first commented sheet after the uncommented sheet4, gets N=4; sheet10 gets N=9),
   which is neither the original "sparse, sheets 1 and 5 only" claim nor a strict 1:1 position
   match. §4.2 rewritten with the fully re-verified mapping table. The fixture's own
   `manifest.json` (`partPaths.numberingScheme`) carried the same original error and is corrected
   too (app repo).
2. Re-counted directly from `elden-threadedComment1-B19-excerpt.xml`: confirmed 5 roots + 4 replies
   = 9 messages. §4.2 and the fixture's `manifest.json` (`threadedCommentAttributes.reply`) both
   corrected from "8-reply" to "4-reply."
3. Re-checked directly (`grep mc:Ignorable` on both real `comments1.xml` files): confirmed
   `docling` has it, `elden` does not, and Excel accepts the omission. §4.2 corrected; this specific
   claim never appeared in the fixture manifest/README, so no fixture edit was needed for it. §4.3
   now explicitly specifies which convention THIS app's writer follows for a brand-new part (F6,
   below) rather than leaving the now-corrected "both vendors agree" premise unaddressed.

---

### F3 (Medium) — no stated bound on the number of `PersistedComment` records one `list()` call can produce

**Section:** §4.3 "Read", `zip-size-guard.ts`.

The zip-bomb guard (`checkTotalWithinCeiling`/`decompressBounded`) bounds **decompressed byte
size**. It does not bound **element count**. A `threadedComment{N}.xml` with, say, 300,000 tiny
`<threadedComment ref="A1" .../>` roots (no `parentId`, minimal `<text>`) could plausibly stay
under a 200MB decompressed ceiling while still producing hundreds of thousands of
`PersistedComment` records handed back over IPC to the renderer in one `list()` response. That's
exactly the shape `.claude/rules/performance.md` rule 4 ("per-event work does not grow with
history or session count") and the busy-app render-budget test exist to catch on the renderer
side, but nothing in §4 states a record-count ceiling analogous to the byte ceiling, and the
existing `elden` fixture (~150 real threads across 9 sheets) is nowhere near large enough to
surface this in T12's own pinning tests. Worth an explicit ceiling (or an explicit "the byte
ceiling is judged sufficient because X" reasoning) rather than leaving it implicit.

**Triage: Accepted.** §4.3's "Read" paragraph now specifies an explicit record-count ceiling
alongside the existing byte ceiling, refusing a new `'too-many-comments'` read error past a
task-time, benchmarked threshold — the same "starting point, not a frozen constant" treatment this
design already gives other such numbers (e.g. §4.3a's Android archive-size guard).

---

### F4 (Medium) — the decompression-bomb guard's shape was designed around exceljs being a black box; that's no longer true for xlsx, and §4 never revisits it

**Section:** §4.1, §4.3; `zip-size-guard.ts`'s own header comment.

The changelog (T10/T12 review) explains the CURRENT two-tier guard shape: *"docx checks its
three named parts, xlsx pre-scans the **whole archive** with JSZip before handing the bytes to
exceljs"* — because exceljs decompresses parts itself with no hook to bound it, so xlsx's guard
has to pre-decompress every entry defensively before handing anything to that black box. §4.1 of
THIS redesign removes exceljs from the xlsx path entirely, for both read and write, moving to the
same "touch only the named parts a mutation needs" surgical model docx already uses. Nothing in
§4.3 revisits whether the guard should now narrow to just the touched parts (`threadedComment{N}
.xml`, `person.xml`, `comments{N}.xml`) the same way docx's guard already does — which would be
strictly cheaper and just as safe, since this reader no longer has a black-box decompressor to
defend blindly. As written, T12/T13's builder has to guess whether "keep the current
whole-archive pre-scan" or "narrow to docx's per-part model" is the intended design; the doc
should say which.

**Triage: Accepted.** §4.3's "Read" paragraph now states explicitly that the guard narrows to the
named parts this module actually opens (`threadedComment{N}.xml`, `person.xml`, `comments{N}.xml`),
matching `docx-comments.ts`'s own `checkNamedEntriesWithinCeiling` model, since exceljs's black-box
decompression is gone from this module entirely (§4.1) and every other part in the archive already
round-trips through JSZip's passthrough without this module ever decompressing it.

---

### F5 (Medium) — persons/vmlDrawing/comments merging with a worksheet that ALREADY has legacy Notes is not specified, only inherited by assumption

**Section:** §4.3 step 1 (Add), vs. the currently-built `xlsx-comments.ts`'s `nextVmlShapeId`.

§4.3's Add algorithm explicitly separates two cases: creating the `commentsN.xml`/
`vmlDrawingN.vml`/`threadedComment{N}.xml` trio "on that worksheet's **first-ever** comment of
ANY kind," vs. (implicitly) appending into an existing trio otherwise. The real `docling` fixture
proves the append case is not hypothetical: A1/B2 already carry genuine Notes in the SAME
`comments1.xml`/`vmlDrawing1.xml` that F7/G12's threaded placeholders also live in. Appending a
new placeholder `<v:shape>` into a VML part that already has shapes requires picking a shape id
that doesn't collide with the EXISTING Note's own `_x0000_sNNNN` id — the currently-built legacy
writer already solves exactly this (`nextVmlShapeId`, scans existing ids, picks `max+1`) — but
§4.3 doesn't name this invariant or say it's carried over, and the design explicitly frames T13
as "REWRITTEN... not a patch." Since a rewrite is exactly the kind of change that can silently
drop an existing safeguard nobody re-stated, this should be named explicitly rather than left to
"implementation detail" (the design's own words, a few lines up) for a piece of behavior that a
real sample file already exercises.

**Triage: Accepted.** §4.3 step 1 now names this explicitly: appending a `<v:shape>` into an
EXISTING `vmlDrawing{N}.vml` reuses the currently-built legacy writer's own `nextVmlShapeId`
scan-max+1 rule verbatim (never assumed to start fresh at `1025`), citing the real `docling`
fixture's A1/B2-plus-F7/G12 coexistence as the concrete case this guards.

---

### F6 (Low) — a new-authored `comments{N}.xml` part's own `mc:Ignorable`/`xr:uid` declaration convention is unstated

**Section:** §4.3 step 1.

Both real vendors write `xr:uid` on the legacy placeholder `<comment>` (required by F2's own
`tcAuthorLink` finding — it's the only link back to the real thread). Only one vendor
(Mac Excel) also declares `mc:Ignorable="xr"` on the `<comments>` root; Google Sheets omits it
and Excel tolerates the omission (confirmed, F2 above). The design never states which convention
**this app's own writer** should follow when it creates a brand-new `comments{N}.xml` from
scratch (the `EMPTY_COMMENTS_XML` template in the current code has no `xr` namespace at all
today, since legacy Notes never needed `xr:uid`). Recommend explicitly specifying that a
freshly-created part gets `xmlns:xr`/`mc:Ignorable="xr"` (matching the more common, spec-literal
of the two real vendors) rather than leaving it to be discovered mid-implementation.

**Triage: Accepted, as proposed.** §4.3 step 1 now specifies that a brand-new `comments{N}.xml`
gets `xmlns:xr`/`mc:Ignorable="xr"` on its root (the Mac-Excel convention), explicitly noting both
are tolerated by real Excel per F2's own correction, and that this only governs a part this app
mints itself — an EXISTING part this module edits in place keeps whatever convention it already
had, never rewritten to match.

---

### F7 (Medium) — the approved mockup predates the "multiple independent threads per cell" finding; how the UI shows N>1 threads at one cell corner mark is unaddressed

**Section:** §4.2's own "real, user-visible decision" framing, contract rows R12/R17 (UI-already-
done).

§4.2 is explicit that the WRITE side keeps one-thread-per-cell (matching everyday Excel UI), but
is equally explicit that the READ side must show a colleague's several independent old threads on
one cell as "several separate cards... never merged, never dropped." The approved mockup
(R12: highlight → hover card → panel; R17: "commented cells get a red corner mark") was designed
and signed off before this finding existed in the codebase's knowledge (the finding is dated
2026-09-27, this session). Nothing in this design or the referenced UI-already-done rows states
what a cell with 5 independent threads (the real `B19` case) actually looks like: one corner mark
with 5 cards stacked behind it? A count badge? Which thread does hovering show first? This is a
real, testable UX gap the redesign surfaced but didn't route back through a review deck — worth a
short UX check before T14 wires this in, rather than assuming the existing "one commented cell →
one mark → one card" mockup generalizes.

**Triage: Accepted, resolved without new UI or a new review round (coordinator instruction).** §4.2
now states explicitly that N>1 threads at one cell is NOT a new visual case: it reuses the
already-approved card list exactly as several ordinary comments already stack in the same pane
today (the same shape "several comments on one line of a text file" already takes) — one corner
mark (unchanged, R17), the same pane showing every card at that highlight in `dT` order, no new
interaction designed or built here. Rather than opening a new UX-tester/review-deck round for a
question the approved mockup's own list-of-cards shape already answers, this specific case (using
the real `elden` fixture's `B19` as the concrete example) is added to the acceptance deck's own
checklist so Destin sees and confirms it before ship — the standing acceptance step this design's
own §8/feature-flow already runs, not an extra round invented for this finding.

---

### F8 (Low) — Strict OOXML is never mentioned; relationship-type string matching would silently find zero sheets on a Strict-variant file

**Section:** §4.2, §4.3's `parseSheetsFromWorkbook`.

ISO/IEC 29500 **Strict** (as opposed to the ubiquitous Transitional variant this whole design is
written against) uses different relationship-type and content-type URIs (e.g.
`http://purl.oclc.org/ooxml/officeDocument/relationships/worksheet` instead of
`.../2006/relationships/worksheet`). `parseSheetsFromWorkbook`'s worksheet/chartsheet resolution
matches relationship `Type` by exact string. A Strict-OOXML `.xlsx` (rare in practice — mainly a
LibreOffice/PowerPoint export option, but real) would silently resolve **zero** addressable
sheets rather than fail with an honest error, since no relationship in it would match any of the
Transitional type strings this module looks for. Real-world likelihood is low, but the document
never names this as an accepted limitation the way it names other gaps (SheetJS/POI
unavailability, same-cell Note+thread coexistence) — worth one sentence saying it's out of scope,
consistent with this design's own practice elsewhere of naming gaps rather than leaving them
silent.

**Triage: Accepted, as proposed.** §4.2 now names Strict OOXML as an accepted, out-of-scope gap —
a Strict-variant file silently resolves zero addressable sheets rather than an honest error —
alongside the design's existing named gaps (SheetJS/POI unavailability, same-cell Note+thread
coexistence), so it isn't rediscovered as a silent surprise later.

---

### F9 (Low) — deleting or editing an already-posted reply/thread is never offered as an operation, and the design doesn't say this is deliberate

**Section:** §4.3, §5 (tool table), contract row R6.

Across both Word and Excel, the only mutating operations are add/reply/resolve/reopen/move — no
"delete a reply," "delete a whole thread," or "edit a reply's own text after posting." This
mirrors the Word design (same absence there), and matches the contract's own R6 wording ("reply,
resolve, and/or repoint... nothing silently lost" — deletion/editing is never promised), so this
reads as a deliberate, cross-format product-scope decision rather than an oversight. Recommend
saying so explicitly in §4.3 (a single sentence, matching this document's own habit of naming
scope boundaries elsewhere) since "can the assistant undo or fix a typo in its own reply" is
exactly the kind of question a builder or a future reviewer will otherwise re-litigate.

**Triage: Accepted, as proposed.** §4.3 now states explicitly that deletion and post-hoc editing of
an already-posted reply/thread are deliberately out of scope (matching the Word design and the
signed contract's own R6 wording), cross-referencing §10's existing whole-feature statement of the
same boundary rather than leaving it implicit at the Excel-specific section a reader might consult
in isolation.

---

### F10 (Low) — cell/row deletion as an anchoring concern is implicitly a non-issue, but the design never says so or why

**Section:** §2 (anchoring), §4.2 (`CellSelector`).

§2's whole re-anchoring/detached-state machinery is scoped to `TextQuoteSelector` (Word/plain
text), where an edit can move or delete the exact text a comment pointed at. For Excel,
`CellSelector` just names `{cell, sheet}` — and unlike a Word paragraph, a **cell address's own
row/column-shift bookkeeping when rows or columns are inserted/deleted is Excel's own job**: real
Excel/Google Sheets already keep a comment's `ref=` correct on save when the user inserts or
deletes a row above it, and this feature never edits sheet structure itself (only comment
threads), so there should be no YouCoded-side "detached" equivalent needed for spreadsheet
comments. This is very likely the right conclusion, but it's only inferable — the design never
states it as a reasoned conclusion the way it explicitly reasons through the Word case in §2.
Given the review brief specifically asks "anchoring when a cell/row is deleted," this should be
one explicit sentence in §4.2 rather than left for a reader to work out independently.

**Triage: Accepted, as proposed.** §4.2's closing "Cell + sheet anchor" paragraph now states the
reasoning explicitly: row/column-shift bookkeeping is Excel's/Google Sheets' own job, unrelated to
this feature (which never edits sheet structure, only comment threads); the only real staleness
case — the named cell being deleted outright — is already handled by `resolveSelector`'s existing
cell-selector branch (§2.2), so no new "detached" machinery is needed for spreadsheets.

---

### F11 (Low) — T21's xlsx write+move parity test doesn't name which real fixture/cell it targets

**Section:** §9.3, T21.

§9.3 says the xlsx-specific parity addition is "both platforms read the `elden` real-file
fixture's `B19` cell... and produce the identical five-record shape, then a move/resolve on ONE
of those five is confirmed... to leave the other four untouched." That's the **read+targeted-
mutation** case. Separately, T21's own row (and §9.3's general description) also requires "an
add+reply+resolve+move sequence into a fixture copy" — it's not stated whether this full
write-sequence test runs against a copy of `docling` (small, simple: one sheet, 2 legacy Notes +
2 threads) or `elden` (large: 10 sheets, ~150 threads, plus the unrelated `xl/documenttasks/`
parts and ~150 `xl/tables/*` parts that must round-trip byte-for-byte untouched). The `elden`
file is the stronger test of "never touch a part this mutation doesn't need" specifically because
it has so much more surface area that could accidentally get re-serialized; worth naming it as
the target explicitly rather than leaving the choice to whichever is more convenient when T21 is
built.

**Triage: Accepted, as proposed.** §9.3 (and T21's own row) now name `elden-ring-completionist-
checklist.xlsx` explicitly as the fixture the full add+reply+resolve+move write-sequence test runs
against, adopting the reviewer's own reasoning verbatim: its ~150 unrelated threads and ~150
tables/documenttasks parts make it the stronger test of "never re-serialize an untouched part" than
`docling`'s much smaller file would be.

---

### F12 (Informational, not a defect) — spot-checks that came back clean

For completeness, since much of this review is critical: the following specific, checkable claims
in §4.2 **were** verified byte-for-byte correct against the real files and are not being
re-litigated:

- Part paths, content types, and relationship types for `threadedComments`/`persons` (both
  fixtures' `[Content_Types].xml` and `.rels` files match verbatim).
- Both relationships are genuinely "implicit" — no `r:id` anywhere in worksheet/workbook content
  points at either — confirmed by grepping `r:id="..."` usage in both `docling`'s `sheet1.xml`
  and `workbook.xml`.
- GUID case (uppercase in `docling`, lowercase throughout `elden`'s 57-person list, 0 exceptions
  found).
- `dT` format (no `Z`, two fractional digits) holds across every sampled timestamp in both files.
- `done` omitted-vs-`"0"`-vs-`"1"` convention (Excel omits, Google Sheets writes explicitly)
  holds across all 9 of `elden`'s comment-bearing sheets, not just the cited excerpt.
- The `tc={GUID}` ↔ root `id` ↔ `xr:uid` three-way link was independently re-derived from the
  `B19` case (5 legacy `<comment>` entries, 5 matching `tc=` authors, 5 matching `xr:uid`s, all
  byte-identical to their respective `threadedComment` root ids) — matches exactly.
- The legacy placeholder's shared sentence/URL and the VML `<x:Locked>`/`<x:LockText>` omission
  both match verbatim in both fixtures.
- linkedom's `DOMParser` (already a direct dependency, reused for xlsx per §4.1) does **not**
  resolve external entities — a hand-built DOCTYPE/XXE payload parses as literal text, not an
  expanded file read. No XXE risk from switching xlsx onto the same parser docx already uses.
- No contradiction found against the signed contract (`doc-comments.contract.json` R1/R6/R8) —
  hiding Notes and refusing note+thread coexistence are both compatible with what was signed.
- The `'cell-has-note'` refusal wording is compliant with `docs/error-message-standards.md`'s
  "specific and accurate" bar — it asserts only what the app itself does, not an unverified claim
  about Excel's own engine (the design is explicit about this distinction).
- Android parity (T18/T19) is plausible with `java.util.zip` + namespace-aware
  `javax.xml.parsers`/`javax.xml.transform` — no capability gap found that `DocxComments.kt`
  doesn't already exercise for the equivalent Word problem.

**Triage: Already handled — informational, no design change needed.** These are confirmations, not
defects; noted with thanks, nothing to fix. (One item overlaps with an F1/F5 fix: the `'cell-has-
note'` wording confirmation and the contract-compliance confirmation both still hold unchanged
after this round's revisions, since neither F1 nor F5 touched that wording or that scope claim.)

---

## Summary for a non-developer reading this

The new design is well-researched overall — most of its detailed claims about how Excel's modern
comments are stored held up against the real sample files. But two things are worth fixing before
building starts:

1. **The most important one (F1):** when a shared Excel file has several separate comment
   threads sitting on the exact same cell (confirmed to really happen — one real sample file has
   five), the plan for telling those threads apart could get confused if someone edits the file
   in between two of the assistant's actions, and the assistant could end up resolving or
   replying to the wrong person's comment without any warning. This needs a small fix to how the
   app tells threads apart before building starts.
2. **A few "we checked this against the real file" claims turned out to be wrong when
   re-checked** (F2) — none of them break anything by themselves, but it means the design
   deserves one more careful read of that section rather than being treated as fully verified.

Everything else is smaller: some edge cases (rare file variants, what happens when someone
deletes a comment, how the screen should show five stacked comments on one cell) aren't spelled
out and should be, but none of them are likely to cause data loss or a broken file on their own.
