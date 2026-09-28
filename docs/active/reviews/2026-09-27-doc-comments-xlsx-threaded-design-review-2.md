---
status: resolved
date: 2026-09-27
resolved: 2026-09-27, same day — all 4 findings accepted and fixed; see each finding's own
  "Triage:" line below, and the design doc's own changelog entry naming this review.
reviewed: docs/active/specs/2026-09-26-doc-comments-build-design.md (commit f9ea621d — the
  post-review-1 revision of the xlsx threaded-comments-only redesign), against
  youcoded/shared-fixtures/doc-comments/xlsx-threaded-reference/ (both real files unzipped and
  independently re-checked, not read from the manifest/README), the currently-built
  desktop/src/main/doc-comments/{xlsx-comments,write-pipeline,doc-comments-dispatch,
  doc-comments-store}.ts, the renderer's desktop/src/renderer/state/doc-comments-store.ts, and the
  Android app/src/main/kotlin/com/youcoded/app/doccomments/ tree (to check what already exists vs.
  what T12/T13/T18/T19 still have to invent).
method: read the two newest changelog entries, all of §4 (4.1-4.3a), the T12/T13/T18/T19/T21 rows,
  §9.2/§9.3, skimmed §3/§7, and desktop/src/shared/doc-comments-types.ts, per the brief. Re-verified
  round 1's own re-verified claims directly against the unzipped bytes (sheet-to-N mapping, B19's
  5-root/4-reply count, GUID uniqueness across the whole elden workbook, namespace prefixes,
  mc:Ignorable presence) rather than trusting review 1's "re-verified" language at face value.
  Checked the design's stated reconciliation/push story against §1.5's actual chokidar-watch scope
  and the actual doc-comments-dispatch.ts/PendingMutationResult return shapes, not just the prose
  describing them. Confirmed the composite-id parsing algorithm and the duplicate-GUID case are not
  yet implemented anywhere in the tree (so these are still live design gaps, not already-resolved
  code facts I'd have missed).
---

# Review round 2: xlsx threaded-comments-only redesign, post review-1 fixes

Read-only review. Round 1's 12 findings were re-checked, not re-litigated: all 11 accepted fixes
hold up against the real files (the corrected sheet-to-N mapping, the corrected B19 5-root/4-reply
count, and the GUID-embedded id scheme are all exactly what the unzipped bytes show), and I found
no reason to reopen any of them. Four new findings below — none of them undo round 1's fixes, but
two of them (F1, F4) are real gaps round 1's own fixes didn't create but also didn't close, and one
(F2) is a concrete builder-facing hole in the GUID-id scheme review 1 just introduced.

## Severity key
Same as review 1. **High** — real correctness/security/data-corruption risk, fix before build.
**Medium** — a builder will hit this and have to invent an answer. **Low** — worth a sentence.

---

### F1 (High) — `docComments:changed` structurally never fires for a `.docx`/`.xlsx` mutation, so an open comments pane on a Word/Excel file never learns about a change from any source, including its own optimistic action's true server state

**Section:** §1.5 ("Watching"), §1.6 (IPC response shapes), §7 (reconciliation), §9.2.

**The contradiction, checked directly:** §1.5 says the chokidar watcher covers `.youcoded/comments/`
*per open project* and states the payoff explicitly: *"This is what lets a comment the assistant
just added over the MCP path... show up in an already-open comments pane without the user doing
anything."* But §9.1 (line 2164) says, just as explicitly, **"a `.docx`/`.xlsx` file never touches
the JSON sidecar at all"** — Word/Excel comments live inside the document's own OOXML parts, which
sit wherever the user's document is, never under `.youcoded/comments/`. The chokidar watcher that
produces `docComments:changed` has no path to ever see a docx/xlsx mutation: not this app's own
IPC-driven edit, not the assistant's MCP-queue-driven edit (T9b/T20 apply their mutation straight to
the document's bytes, and the `.pending/` request/result file churn that DOES live under
`.youcoded/comments/.pending/` is explicitly excluded from triggering the broadcast — F20's own
fix), and not a colleague's live edit in real Excel/Word. **§1.5's own quoted payoff is true for
plain-text/markdown comments and false for the two file types this whole reopen-1 effort exists
for**, and nothing in the design says so.

**Why this is more than a missed live-refresh nicety.** Checked the actual return shapes: §1.6's
own channel table gives `list` and `add` an explicit `→ X` response shape, but `reply`/`resolve`/
`reopen`/`move` get none — and `PendingMutationResult`'s own type comment (doc-comments-types.ts)
confirms why: *"the remaining four kinds return a bare `{ok:true}`... the exact same per-operation
shape `doc-comments-dispatch.ts`'s own functions already return."* So for a docx/xlsx target,
neither of §7's two stated reconciliation paths ("the `docComments:changed` push, **or** the
response of its own just-issued mutation") actually carries real data back: the push never fires
(this finding), and the response is a bare boolean. The renderer's optimistic guess is never
corrected — not just cosmetically, but including the one field it structurally cannot pre-compute:
a reply's real, persisted id (`{rootId}-r{n}`, an ordinal computed from the file's true state at
write time — unlike the root comment's freshly-minted random GUID, which the renderer can safely
mint itself per review 2 F9's own id-authority fix). Checked the currently-built renderer code
(`doc-comments-store.ts:742-746`) for how this gap actually manifests today: `addReply` mints a
purely local `r-${nextLocalSuffix()}` id and never has anything to replace it with for a docx/xlsx
target.

**Concrete failure scenario:** a user has an Excel file's comments pane open. The assistant, via a
native tool call or the MCP path, resolves a thread on that same file (a completely ordinary,
sparingly-used R4 action). The open pane shows nothing changed — no push exists to tell it to
refresh — so the user can keep replying to, or asking the assistant to resolve *again*, a thread
that is already resolved, based on UI that is now silently wrong. Separately: if the user's own
reply and the assistant's own reply to the *same thread* land close together, the user's pane shows
its own reply under a locally-invented id forever (until the pane happens to unmount/remount and
re-`list()`s), never learning the ordinal the file actually gave it — harmless as long as nothing
reads that id back, which today nothing does, but it means the one id-stability guarantee this
whole redesign is built around (F1 from round 1) is *paired with a display path that never
resolves that id* for the format it was designed to protect.

**Why round 1 didn't catch this:** round 1's own F1-F12 focused entirely on the id-resolution and
OOXML-shape correctness of the xlsx read/write path; none of them touch the notification/push layer,
which is a `.docx`/`.xlsx`-generic problem (not xlsx-specific — it applies to `.docx` too) that
simply wasn't in round 1's scope. It's squarely inside this round's brief (renderer optimistic
updates).

**Proposed fix:** name this explicitly as either an accepted, documented limitation (the same way
§4.2 already names Strict OOXML and cross-device sync as accepted gaps) — "an open docx/xlsx
comments pane does not receive a live push; it refreshes only on remount/next `list()`" — **or**
close it, by having the main-process docx/xlsx write path (both the direct IPC-driven one and T9b/
T20's pending-mutation applier) fire the SAME `docComments:changed` broadcast for the target
document's own path after a successful write, independent of chokidar (which correctly has no
reason to watch arbitrary user document paths). Either way, `reply`/`resolve`/`reopen`/`move`'s IPC
response should carry back at least the new reply's real id (or the whole updated
`PersistedComment`) for docx/xlsx targets, so the renderer's own optimistic entry can be corrected
from the response even before any broadcast lands.

**Triage: Accepted — closed the gap, not documented as a limitation.** §1.5 now specifies a second,
narrower watcher: `doc-comments-store.ts`'s existing `watch`/`unwatch` entry points gain a branch
that, for a `.docx`/`.xlsx` target, additionally registers a refcounted chokidar watcher on the
document's OWN absolute path (not the sidecar tree), firing the SAME `docComments:changed` push on
settle — no source-specific code, so this app's own write, the MCP pending-mutation queue's applied
write, and an external Excel/Word save are all covered by the identical mechanism. Response
enrichment is scoped precisely, not blanket: `reply`'s response now returns the persisted
`CommentReply` (its ordinal id genuinely can't be pre-computed client-side); `resolve`/`reopen`/
`move` deliberately keep `{ok:true}`, with the reasoning for why written into §1.6 (their optimistic
guess is already exactly right on success; it's the WATCHER that corrects them for an externally-
caused change, not a richer response). §7 specifies the exact reconcile rule this needed (a
`clientId`-keyed in-flight set; a push always replaces the whole array, never patches it
field-by-field; an in-flight entry survives a replace unless the fresh read already reflects it) so
neither direction of the race — response-before-push or push-before-response — duplicates or drops
an optimistic reply. §9.2 gives T9b/T20 (being built concurrently with this fix) an explicit
contract: no change to their own request/result JSON shape (a reply's persisted id is a
renderer-optimistic-UI concern the assistant never reads back), and no broadcast call needed from
their own code — the new watcher fires automatically off their existing write-pipeline-backed write.

---

### F2 (Medium) — the composite id's own parse algorithm is never specified, and the natural failure mode (a naive split on `-`) silently breaks every mutation, in two independently-written runtimes

**Section:** §4.2 ("Id scheme, corrected"), §4.3, §4.3a.

The corrected id format is `xt-{sheetId}-{cell}-{GUID}`, e.g. `xt-3-B19-36100E21-63DC-459D-8552-
6830736C717E`. The GUID segment itself contains four hyphens — the *same* character used as the
composite id's own field delimiter. A cell reference never contains a hyphen, so the format is
parseable (split on the first two hyphens only; whatever remains, however many hyphens it has, is
the GUID verbatim) — but the design never states this. It gives one example string and otherwise
only describes the algorithm in terms of "the embedded GUID," never how a caller gets from the
string to that GUID. This is the exact class of gap this design elsewhere insists on pre-writing
("Getting this schema wrong is expensive," §8's own words for T1) *specifically because* two
independent runtimes (`desktop/src/main/doc-comments/xlsx-comments.ts` in TS, `XlsxComments.kt` in
Kotlin) both have to parse this same string with no shared import to enforce agreement, per §4.3a's
own framing.

**Confirmed not yet resolved by existing code:** grepped both the TS (`desktop/src/main/doc-
comments/*.ts`) and Kotlin (`app/src/main/kotlin/com/youcoded/app/doccomments/*.kt`) trees for any
`xt-` composite-id parsing logic — none exists yet (T12/T13/T18/T19 haven't been rewritten to the
threaded-comments design), so this is a live, open gap, not something already settled in code the
design doc just didn't repeat.

**Concrete failure scenario:** a builder (plausibly on either side, since it's the natural first
instinct) writes something like `const [, sheetId, cell, guid] = id.split('-')` — this destructures
only the FIRST hyphen-delimited segment of the GUID (`36100E21`) into `guid`, silently discarding
`-63DC-459D-8552-6830736C717E`. Every `reply`/`resolve`/`reopen`/`move` call then compares an
8-character fragment against full 36-character `id="{...}"` values in the file and never matches —
every mutation on a real GUID-bearing thread fails `'comment-not-found'`, 100% of the time, for
every thread in both real fixtures. (This is likely to be caught fast by T12/T13's own pinning
tests, which is why this is Medium and not High — but it's exactly the kind of two-runtime
agreement problem this design's own philosophy says to pre-write rather than leave to be
independently reinvented, twice, possibly two different ways that each pass their own suite while
disagreeing with each other, the same shape §9.3's own T21 exists to catch for the OOXML shape
itself.)

**Proposed fix:** one sentence in §4.2 or §4.3: "parse by splitting on the first two hyphens only
(`sheetId`, then `cell`); the remainder — regardless of how many hyphens it itself contains — is the
GUID verbatim. Do not `split('-')` naively." Optionally give the literal regex
(`/^xt-(\d+)-([A-Za-z0-9]+)-(.+)$/`) as the pre-written form, matching this design's own habit for
every other cross-runtime format detail.

**Triage: Accepted, as proposed, plus the shared test vector.** §4.2 now gives the pre-written regex
(`^xt-(\d+)-([^-]+)-(.+)$`, group 3 never re-split) and a new shared fixture,
`shared-fixtures/doc-comments/id-parse-test-vectors.json`, covering the worked example, a
lowercase-GUID (Google Sheets' own case), a single-digit `sheetId`, a single-letter/single-digit
cell, and Excel's own maximum cell reference — read directly by both T12 (TS) and T18 (Kotlin)'s own
pinning tests (§4.2, §4.3a, T12/T18 rows) so the two runtimes cannot silently diverge.

---

### F3 (Medium) — no defined behavior when the fallback full-workbook scan matches more than one root sharing the identical GUID

**Section:** §4.2 ("Id scheme, corrected"), §4.3 (resolution algorithm), §4.3a.

The corrected resolution algorithm is: (1) hinted-ref match, (2) on a miss, "falling back to a
full-workbook scan for a root whose id matches," (3) refuse `'comment-not-found'` only if neither
finds it. This is written as if step (2) can find at most one match. It never says what happens if
it finds **more than one** — two roots, in two different worksheets (or, in principle, the same
one), whose `id` GUID attribute is byte-identical. §4.2 already admits it could not verify, either
way, whether real Excel's own "Move or Copy Sheet → Create a copy" feature re-mints thread GUIDs or
copies them verbatim (no live Excel install was available to the design's own research) — so this
isn't a purely theoretical malformed-file case; it's a real, unverified-in-either-direction gap in
a feature (worksheet duplication) that is one of the most ordinary things a user does to a
spreadsheet. **Checked directly: neither real fixture exercises this** (grepped every `id="{...}"`
across all nine of `elden`'s `threadedComment{N}.xml` files plus `docling`'s one file — zero
duplicates in either real file), so there is no fixture that would ever surface this gap during
T12/T13/T18/T19/T21's own testing.

**Concrete failure scenario:** a user duplicates a worksheet in Excel that happens to carry a
threaded comment (or opens a hand-edited/adversarially-crafted `.xlsx`). If Excel's own duplicate
behavior turns out to copy the GUID verbatim (unverified, per §4.2's own admission), the workbook
now has two independent roots sharing one id. A `commentId` issued before the duplication (from an
earlier `list()`) now resolves, via the step-2 fallback scan, to **whichever of the two the scan
order happens to hit first** — implementation-defined, not specified — and a `resolve`/`reply`/
`move` call could silently land on the duplicate sheet's copy instead of the original, exactly the
"silently wrong colleague's comment, no error" failure mode round 1's F1 fixed for the positional-
ordinal case, now reachable through a different, unaddressed mechanism.

**Proposed fix:** state explicitly that the full-workbook fallback scan refuses (a distinct
`'ambiguous-comment-id'` error, or folds into the existing `'comment-not-found'` refusal) if it
finds more than one root sharing the embedded GUID, rather than silently acting on the first match
in scan order — the same "never guess, refuse instead" principle this design already applies to the
plain not-found case.

**Triage: Accepted — a distinct error code, not folded into `'comment-not-found'`.** §4.2/§4.3/§4.3a
now specify the fallback scan refuses `'ambiguous-comment-id'` the moment it finds a SECOND root
sharing the embedded GUID, kept distinct from `'comment-not-found'` since the two mean different
things to a caller (not found vs. found-but-can't-safely-act). Added to §4.3's own list of refusals
that remain, and to T12/T13/T18/T19's pinning tests against a hand-crafted duplicate-GUID fixture
(neither real file has one).

---

### F4 (High) — the `<legacyDrawing>`-after-`<extLst>` worksheet element-ordering constraint, already found and fixed once for the retired legacy-Notes design, is not restated anywhere in the 2026-09-27 threaded-comments rewrite, and neither real fixture exercises it

**Section:** §4.3 step 1 (Add).

Design review 2 (the round before this document's own most recent rewrite, referenced only in this
document's changelog at the now-superseded legacy-Notes-era entry) found and fixed exactly this:
*"named all four of the xlsx OOXML surface's actually-hand-rolled pieces — two relationship
entries, the non-'+xml' vml content type, and **the legacyDrawing-after-extLst ordering
constraint**, not just 'four pieces'"* (changelog, 2026-09-26 review-2 entry). That fix concerned
inserting a worksheet's first-ever `<legacyDrawing r:id="...">` child element into `sheet{N}.xml` in
the position real Excel actually expects it — checked directly, the CURRENTLY-BUILT
`xlsx-comments.ts` still carries this exact fix as a code comment (`XlsxComments`'s legacy-Notes
writer, `~line 1129-1178`): *"`<legacyDrawing r:id="...">` as the worksheet's OWN LAST child element
— the spike's own 'legacyDrawing is the last element in `<worksheet>`, even after `<extLst>` if one
exists' finding, which `appendChild` satisfies unconditionally."*

**The 2026-09-27 threaded-comments-only rewrite of §4.2/§4.3 never restates this.** Searched the
entire current §4 text for `extLst` or any element-ordering language — the only two hits are inside
the XSD excerpt for `CT_Person`/`CT_ThreadedComment` (unrelated schema elements, not the worksheet's
own element sequence) and the one changelog reference to the now-superseded finding. Step 1 (Add) in
the current §4.3 describes creating the `threadedComment{N}.xml`/`comments{N}.xml`/`vmlDrawing{N}.
vml` trio "on that worksheet's first-ever comment of ANY kind" and the worksheet's rels/content-types
entries, but says nothing about where in `sheet{N}.xml`'s own child-element sequence the
`<legacyDrawing>` element itself goes — the exact thing the (now-invisible-from-this-document)
prior fix addressed. This is the same class of risk round 1's own F5 named and fixed for the VML
shape-id-collision case ("a rewrite is exactly the kind of change that can silently drop an existing
safeguard nobody re-stated") — but it caught a *different* already-known safeguard, and this one
slipped through.

**Confirmed neither real fixture would catch a regression here:** checked both worksheets'
`sheet1.xml` directly — `docling`'s has no `<extLst>` at all (`<legacyDrawing>` is simply its own
last element after `<pageMargins>`); `elden`'s also has no `<extLst>` (its `<legacyDrawing>` sits
correctly before `<tableParts>`, which is itself before where an `<extLst>` would go). **Neither
sample exercises the coexistence case the retired finding was about**, so T12/T13's own pinning
tests, built against these two files, give no signal either way.

**Concrete failure scenario:** a builder rewriting `xlsx-comments.ts`'s Add path "not as a patch"
(the design's own words for this rewrite) from §4.2/§4.3's prose alone, without independently
re-discovering or preserving the retired writer's own code comment, inserts `<legacyDrawing>` using
ordinary DOM `insertBefore`/schema-order logic (i.e., before a worksheet's own `<extLst>`, which is
what the formal `CT_Worksheet` sequence looks like at a glance) instead of appending it
unconditionally last. The result is a syntactically well-formed but Excel-incompatible worksheet
part on the **specific, not-rare** case of adding a comment to a worksheet that already has an
`<extLst>` (sparklines, certain conditional-formatting extensions, slicers, and other common Excel
features all use worksheet-level `extLst`) — real Excel flags such a file for repair on open, in
exactly the "produces a file Excel would flag for repair" failure class this review round was asked
to check for.

**Proposed fix:** one sentence in §4.3 step 1, mirroring how F5's own fix was worded: *"`<legacyDrawing>`
is always appended as the worksheet's absolute last child element, even after an existing
`<extLst>` if the worksheet already has one — carried over from the currently-built writer's own
already-fixed behavior (review 2, the retired legacy-Notes design's F4), not assumed fresh for this
rewrite."* Also worth a pinning-test case that synthesizes (not sourced from either real fixture,
since neither has one) a worksheet with a pre-existing `<extLst>` and confirms `<legacyDrawing>`
lands after it.

**Triage: Accepted, as proposed, essentially verbatim.** §4.3 step 1 and §4.3a both now restate the
rule explicitly, quoting the retired writer's own code comment as the citation rather than asserting
it fresh. A required synthetic worksheet-with-`<extLst>` fixture — shared between T12/T13 (TS) and
T18/T19 (Kotlin), not two independently hand-built ones — is added to both platforms' pinning tests,
since neither real reference file has this shape to force a regression to surface on its own.

---

## What I checked and did not flag

- Round 1's own re-verified claims (sheet-to-N numbering, B19's 5-root/4-reply count, GUID
  uniqueness, `mc:Ignorable` presence/absence, namespace-prefix handling) all hold up against a
  fresh, independent unzip and re-check — no regressions, nothing to reopen.
- The composite id's `sheetId` component is the workbook.xml `<sheet sheetId="N">` persistent
  attribute (not worksheet position, not the `threadedComment{N}.xml` part number) — correctly
  stable across sheet reordering, and correctly distinct from the two other numbering schemes this
  section already has to juggle (part-number `N`, workbook position). No defect found here.
- Cross-device/cross-process simultaneous docx/xlsx writes (two devices' YouCoded instances, or
  YouCoded plus a live Excel session, writing the SAME file at the literal same moment) are a real
  risk in principle, but the design's own scope statement ("No accounts, no document sharing, no
  cross-device comment sync — out of scope per the handoff") already covers this class of risk
  explicitly; I did not raise it as a new finding.
- Security bounds (path containment, XXE via linkedom, zip-bomb/record-count ceilings) were
  thoroughly covered by round 1 (F3, F4, F12) and this round found nothing to add.
- Android buildability: the SDK and a working JDK (21) are both present on this machine as of this
  review (`~/.android-sdk/platform-tools`, `/usr/lib/jvm/java-21-openjdk`) — noted per CLAUDE.md's
  "check, don't assume" rule, though T16-T21 aren't built yet so there's nothing to build-verify
  against this design specifically.

## Summary for a non-developer reading this

Two real problems, one medium-size gap, one smaller one:

1. **(F1, the important one)** When Excel or Word comments are open on screen, the screen never
   automatically updates if the change comes from somewhere else — the assistant resolving a
   comment in the background, or (in the phone-support version of this feature) the same file being
   edited from another device. The person has to close and reopen the file to see the real,
   current state. The design document claims this problem is already solved, but that claim only
   turns out to be true for plain-text files, not Word or Excel files — nobody had said so out
   loud until this check.
2. **(F4)** There's a very specific, previously-solved technical trap in how Excel comment files are
   put together (where exactly one invisible marker goes inside the file) that the rewrite of this
   design plan forgot to re-mention. The actual solved code for it still exists elsewhere, so it's
   recoverable, but the instructions being handed to whoever builds this next don't say to keep it —
   which is exactly the kind of gap that produces a file Excel refuses to open cleanly, on a
   spreadsheet shape (one with certain built-in Excel features like sparklines) that neither of the
   two real sample files used for testing happens to have.
3. **(F2, F3)** Two smaller "the plan doesn't say exactly how to do this one small step" gaps in how
   a comment's internal ID gets read back apart — plausible to get wrong, but likely to be caught
   quickly by testing rather than silently shipping.

None of these are reasons to distrust the id-embedding fix from the last review round (it's solid),
but F1 and F4 are worth fixing in the document before a builder starts.
