---
status: resolved
date: 2026-09-27
resolved: 2026-09-27, same day — all 5 findings accepted and fixed; see each finding's own
  "Triage:" line below, and the design doc's own changelog entry naming this review. This was the
  final (round 3 of 3) design review for the xlsx threaded-comments redesign — the design's build
  stage is now complete apart from the follow-up fixes this round's own findings require against
  already-shipped code (T3, T5, T11).
reviewed: docs/active/specs/2026-09-26-doc-comments-build-design.md (commit 6c612cb9) — the three
  newest changelog entries, §1.5, §1.6, §4 (all), §7, §9.2, §9.3, and task rows T3/T5/T9b/T12/T13/
  T18/T19/T20/T21 — against youcoded/shared-fixtures/doc-comments/xlsx-threaded-reference/ (both
  real files unzipped and independently re-checked) AND, this round, against the ACTUAL already-
  built code in youcoded/desktop/src/main/doc-comments/{doc-comments-store,doc-comments-watcher,
  ipc-handlers,doc-comments-dispatch,xlsx-comments,docx-comments,write-pipeline}.ts,
  youcoded/desktop/src/main/remote-server.ts, and youcoded/desktop/src/renderer/state/
  doc-comments-store.ts, plus node_modules/chokidar@5.0.0's own source (handler.js) — not just the
  design's prose describing what that code is supposed to do.
method: read the three newest changelog entries, all of §1.5/§1.6/§4/§7/§9.2/§9.3, and the named
  task rows, per the brief. Focus areas per the brief: (a) the new .docx/.xlsx document-file
  watcher (refcounting, pause-when-hidden, our own atomic rename, echo of our own write, Windows
  file locking, Android/remote), (b) the reconcile rule for optimistic replies, (c) the id regex
  against real cell refs/GUID forms, (d) the ambiguous-id refusal, (e) legacyDrawing-after-extLst.
  For (a)/(b), rather than only re-reading the design's own prose (which round 2 already did),
  traced whether the ALREADY-BUILT T3/T5 code actually implements what round 2's F1 fix specifies,
  since both round 1 and round 2 explicitly grepped the tree to distinguish "still a design gap"
  from "already a code fact I'd have missed" — this round found the tree has moved since round 2
  (T3/T5/T10/T11 are now real, tested code, not just types), so the same check was re-run against
  the CURRENT tree rather than trusted as still accurate. For (c)/(d)/(e), independently re-unzipped
  both real xlsx fixtures fresh (not reused from a prior round's notes) and re-checked every cell
  `ref=`, `sheetId`, and GUID value against the pre-written regex and the duplicate-GUID/extLst
  claims. Read chokidar 5.0.0's actual `_handleFile`/`_watchWithNodeFs` implementation
  (`node_modules/chokidar/handler.js`) directly rather than relying on general watcher folklore, to
  ground the atomic-rename-vs-inode question in this exact dependency's real behavior.
---

# Review round 3 (final): xlsx threaded-comments-only redesign, post review-2 fixes

Read-only review. Rounds 1 and 2's fixes were re-checked, not re-litigated: every re-verified claim
(sheet-to-N numbering, B19's 5-root/4-reply count, the GUID-embedded id scheme, the id-parse regex,
the `'ambiguous-comment-id'` refusal, the `legacyDrawing`-after-`extLst` restatement) still holds up
against a fresh, independent re-check of the real files and the design text, and none of it is
reopened below.

This round's main finding is different in kind from rounds 1-2's: **round 2's own F1 fix — the
per-document `.docx`/`.xlsx` watcher and the enriched `reply` response — is written into the design
correctly, but the code that has been built since round 2 landed does not implement either half of
it.** Since round 1 and round 2 both explicitly distinguished "a live design gap" from "already a
code fact" by grepping the tree, and the tree has grown substantially since round 2 (T3, T5, T10,
T11 are now real, tested modules, not empty scaffolding), this round re-ran that same check against
the current tree. It found the gap is real, current, and already observable in the shipped desktop
docx path — not merely an unbuilt future task.

## Severity key
Same as rounds 1-2. **Blocker** — must fix before build starts (moot here — build is already past
this point for docx). **High** — real correctness/user-facing risk. **Medium** — a builder will hit
this and have to invent an answer. **Low** — worth a sentence.

---

### F1 (High — and already live, not hypothetical) — round 2's per-document watcher fix is written into the design but does not exist in the built T3 code; the ALREADY-SHIPPED docx write path fires zero live push today

**Section:** §1.5 ("A second, narrower watcher for a `.docx`/`.xlsx` target's OWN file"), §1.6, T3.

**The design's own claim, quoted:** "`doc-comments-store.ts` exposes ITS `watch(path, projectRoot)`/
`unwatch(path, projectRoot)` — the SAME two functions `ipc-handlers.ts` and `remote-server.ts`'s own
relay... already call identically for every file type, so this needs no separate implementation in
either caller — with a new branch: when the RESOLVED target (by extension) is `.docx`/`.xlsx`, ALSO
register... a chokidar instance watching that ONE document's own absolute path."

**Checked directly against the built code, not just the design's description of it:**

- `doc-comments-store.ts`'s `CommentsWatchTarget` type (lines 540-548) has exactly two variants:
  `{kind:'project', commentsDir, projectRoot}` and `{kind:'fallback', sidecarPath, sourcePath}`.
  There is no third variant for a native document's own absolute path.
- `resolveWatchTarget` (lines 550-565) never inspects the file extension at all — a `.xlsx`/`.docx`
  target with a `projectRoot` resolves to `{kind:'project', commentsDir: '<root>/.youcoded/comments'}`,
  the SAME sidecar-directory target a plain-text file gets. §1.1/§9.1 are explicit that "a `.docx`/
  `.xlsx` file never touches the JSON sidecar at all" — so this directory watch can never fire for
  that file's own mutations.
- `doc-comments-watcher.ts` (the actual chokidar wiring) only knows about `'project'`/`'fallback'`
  keys; there is no absolute-path-keyed watch entry anywhere in it.
- `ipc-handlers.ts`'s `WATCH`/`UNWATCH` handlers (lines 278-306) are the ONLY two of the eight
  `docComments:*` handlers in that file with **no `nativeFormatFor(filePath)` branch** — `LIST`,
  `ADD`, `REPLY`, `RESOLVE`, `REOPEN`, and `MOVE` all check `nativeFormatFor` and dispatch
  differently for docx/xlsx; `WATCH`/`UNWATCH` call `resolveWatchTarget` uncondtionally with no such
  check. This is the one mechanical tell that a genuinely-required branch is missing, not a
  by-design omission — every other channel in the same file already has the shape this one lacks.
- `remote-server.ts`'s `docComments:watch`/`:unwatch` cases (lines 2430-2450) call the exact same
  `resolveWatchTarget`/`watchComments`/`unwatchComments` functions, so the identical gap applies to
  the remote/web surface too — this is not a desktop-only omission.
- `tests/doc-comments-watcher.test.ts` and `tests/doc-comments-ipc-handlers.test.ts` were checked for
  any docx/xlsx watch coverage: `doc-comments-ipc-handlers.test.ts` exercises `.docx`/`.xlsx`
  list/add/reply/resolve/reopen/move thoroughly (T10/T11/T13's own tests), but neither file has a
  single test that calls `docComments:watch` against a `.docx`/`.xlsx` path and asserts a push
  fires. The gap isn't just unimplemented, it's untested — consistent with it having been missed
  rather than deliberately deferred.

**Concrete, currently-reproducible failure (not hypothetical, not blocked on unbuilt xlsx work):**
docx read/write (T10/T11) is real, shipped, and tested today. A user opens a `.docx`'s comments pane
in one window, then the assistant (a native tool call, or — once T9b lands — the MCP queue) resolves
or replies to a comment on that same file from elsewhere. `write-pipeline.ts`'s atomic write
succeeds. **No `docComments:changed` push fires**, because the watch target for that file is a
`.youcoded/comments/` directory the docx write never touches. The open pane shows nothing changed
until the user closes and reopens it — exactly the F1 (round 2) failure scenario the design's own
prose describes as fixed, reproducible today against already-shipped code, not a future risk.

**A second, independent issue in the design's own wording, worth fixing regardless of the build
gap above:** "ALSO register... a chokidar instance watching that ONE document's own absolute path"
reads as *additive* to whatever `resolveWatchTarget` already resolves — for a `.docx`/`.xlsx` target
with a `projectRoot`, that is the `.youcoded/comments/` directory watch, which (per the previous
paragraph) can never produce a matching event for that file. Taken literally, every open native-
format comments pane would stand up TWO chokidar watchers for the lifetime of the pane: one
correctly on the document's own path, and one on the project's sidecar directory that is
structurally incapable of ever firing for that file. This is the kind of watcher waste
`project-watcher.ts`'s own extensive commentary (depth caps, `MAX_GRACE_ENTRIES`, `HOME_WATCH_DEPTH`)
shows this codebase treats as a real cost, not a rounding error — inotify watches are a
per-user-capped OS resource, and every additional live chokidar instance is memory and file
descriptors held for as long as the pane is open. The fix is "**instead of**, not **also**": a
`.docx`/`.xlsx` target's `resolveWatchTarget` branch should produce ONLY the per-document watch
target, never the sidecar-directory one, mirroring how `nativeFormatFor` branching already
*replaces* (never supplements) the sidecar dispatch for every other channel in the same file.

**Proposed fix:** (1) add a third `CommentsWatchTarget` variant (e.g. `{kind:'document', absolutePath}`)
resolved via the SAME `nativeFormatFor`/`resolveSourceFilePath` logic `LIST`/`ADD`/etc. already use,
and make it the ONLY target a `.docx`/`.xlsx` path resolves to — not an addition alongside the
sidecar-directory target; (2) add the missing `nativeFormatFor` branch to `ipc-handlers.ts`'s and
`remote-server.ts`'s `WATCH`/`UNWATCH` cases, matching the pattern every other channel in both files
already has; (3) add `doc-comments-watcher.ts` support for a single-absolute-path chokidar target,
refcounted the same way its existing `'project'`/`'fallback'` keys already are; (4) add the test
this round found missing: a direct write to an OPEN `.docx` fixture (T10/T11's own fixture, already
in the tree) fires exactly one `docComments:changed` for that path.

**Triage: Accepted — this is an unbuilt design requirement (the design was revised after T3's own
first pass had already shipped), not a design flaw, and is fixed exactly as proposed.** §1.5 now
states, in place of the earlier "also register" wording, that a `.docx`/`.xlsx` target's
`resolveWatchTarget` produces the new `{kind:'document', absolutePath}` variant INSTEAD OF the
sidecar-directory one, never alongside it. T3's own row (§8) now explicitly owns this as a required
follow-up to already-shipped `ipc-handlers.ts`/`remote-server.ts`/`doc-comments-watcher.ts` code,
naming the missing `nativeFormatFor` branch and the missing watch-fires-on-open-docx test directly.
Android is confirmed unaffected (§1.5): `docComments:watch` already refuses `not-implemented-on-
mobile` unconditionally for every file type, so there is no per-platform branch there to fix.

---

### F2 (High) — round 2's OTHER half of the same fix (`reply`'s enriched response) is specified correctly but the already-built renderer discards it on success

**Section:** §1.6 ("Only `reply`'s response needs enriching..."), §7 ("A mutation's OWN response is
still the PRIMARY, fastest reconciliation path"), T5.

The design is explicit and correct that `reply`'s IPC response, for a `.docx`/`.xlsx` target, should
carry back the real persisted `CommentReply` (its true `{rootId}-r{n}` id) so the renderer can
replace its own locally-minted `r-${nextLocalSuffix()}` placeholder **immediately, without waiting
for any push** — called out as the PRIMARY, fastest path, faster and more reliable than the
per-document watcher in F1 above.

**Checked directly against the built renderer code** (`desktop/src/renderer/state/
doc-comments-store.ts`, `addReply`, lines 742-765): on a successful `ipc.reply(...)` call, the
callback is `if (res.ok) return;` — the success branch does nothing with `res` at all. It never
reads a returned `CommentReply`, never replaces the optimistic reply's id, never updates
`commentKeyIndex`. Contrast this with `persistNewComment` (the `add` path, lines 687-716) a few dozen
lines above it in the SAME file, which DOES implement exactly this kind of response-driven
id-reconciliation (including the "server already landed via a push" race-safety check design review
2's own F9 finding required) — the machinery for doing this correctly already exists in this file
for `add`, it simply was never extended to `reply` when `reply`'s own response-enrichment fix (this
round's F1's sibling half) was specified.

**Consequence:** a reply to a Word/Excel comment displays under its client-minted placeholder id for
as long as that comments pane stays continuously mounted and on-screen — self-correcting only on the
next `hydrate()` (pane closed/reopened, or the session tab going off-screen and back per
`performance.md` rule 2's "hidden means idle" unsubscribe/resubscribe). Combined with F1 above (no
push ever arrives to correct it via the fallback path either, for a native-format target), there is
currently **no mechanism at all** that corrects a Word/Excel reply's displayed id while its pane
stays open — not the primary path (this finding) and not the fallback path (F1). No tool ever
addresses a reply by its own id (round 1's own finding, still true), so this doesn't corrupt any
data or misdirect a mutation; the observable harm is narrow (an internal id a user never sees is
wrong), but it is precisely the property this round's own F1 (round 2) design fix set out to
guarantee, and it isn't happening.

**Proposed fix:** extend `addReply`'s success branch to mirror `persistNewComment`'s existing
id-reconciliation shape: on `res.ok`, if `res.reply` is present and its id differs from the local
placeholder, swap it into the parent comment's `replies` array (with the same "already landed via a
concurrent list()" guard `persistNewComment` already has, since the exact same push-vs-response race
applies here once F1 makes a push possible at all).

**Triage: Accepted — an unbuilt design requirement, fixed as proposed.** §7's reconcile rule now
states this explicitly, and T5's own row (§8) owns it as a required follow-up to the already-shipped
`addReply`, naming the exact fix (mirror `persistNewComment`'s existing shape, same file) and adding
the missing pinning test.

---

### F3 (Low) — the design's own content-based reconciliation fallback (§7 rule 2) cannot distinguish two genuinely distinct, back-to-back identical replies

**Section:** §7, reconcile rule 2.

Rule 2 says an in-flight optimistic entry is dropped from re-appending "UNLESS the fresh read's own
content already reflects that specific mutation's effect (e.g., a reply with the same
`clientId`-correlated author+text+parent already present...)." A real `CT_ThreadedComment` element
(§4.2's own XSD quote) has no field for an arbitrary client-generated correlation token — `ref`,
`dT`, `personId`, `id`, `parentId`, `done` only — so this match can only ever be by content
(author+text+parent), never by a true client-side correlation id round-tripped through the file.
This is a reasonable fallback for the rare push-before-response race the design itself says this
path exists for, but it has a real (if narrow) blind spot the design doesn't name: if a user (or the
assistant) sends the same short reply twice in a row to the same thread — an ordinary thing to do
("thanks" / "thanks", or the assistant re-confirming the same short acknowledgement) — a push landing
between the two cannot tell them apart by content, and could de-duplicate the wrong one of two real,
distinct replies, or fail to de-duplicate the one it should. This is a genuine but low-probability
edge case in the FALLBACK path only (the response-based path in F2, once fixed, remains authoritative
and unaffected by this ambiguity for the overwhelmingly common case where the response arrives
before or with the push). Not blocking, but worth one sentence acknowledging the limitation rather
than presenting the content-match as a fully general disambiguator.

**Proposed fix:** a sentence in §7 noting this specific known limitation of the content-based
fallback match, and that it is why the response-based path (F2) is described as primary rather than
the push-based one — already implied by the design's own ordering, just not stated as a boundary.

**Triage: Accepted, plus a cheap tie-break, not just the caveat sentence.** §7 now states the
limitation explicitly AND closes most of it cheaply: when more than one in-flight entry under the
same parent shares identical content, entries and fresh matches are paired by order (issue time vs.
`dT`) rather than by bare existence — no new OOXML field needed. The residual boundary (this is the
fallback path only; the response-based path, once F2 is built, remains authoritative and unaffected)
is stated as proposed.

---

### F4 (High) — a `.docx`/`.xlsx` file open concurrently in real Excel/Word is never addressed; the assistant's own write can be silently reverted by the user's next save in the OTHER app

**Section:** §3.3/§4.3 (write-pipeline's atomic backup→tmp-write→rename→verify), §10 (scope
exclusions) — neither mentions this case; the review brief specifically asked about Windows file
locking, so this was checked directly against `write-pipeline.ts`.

**What's checked and confirmed:** `write-pipeline.ts`'s atomic replace (`fs.writeFile(tmpPath,...)`,
`fh.sync()`, `fs.rename(tmpPath, absolutePath)`) has no special-case handling for "the destination
path is currently open by another process" — a failure there falls into the generic `catch` at line
197 and surfaces as `{ok:false, error:'write-failed'}`, cleanly (tmp file and backup both cleaned up,
target untouched). This part degrades safely.

**Two distinct risks this doesn't cover, and the design names neither:**

1. **Whether the rename itself can even succeed while Excel/Word has the file open is unverified
   either way**, on the one platform (Windows) where mandatory file locking is the norm rather than
   the exception — the design's own research explicitly flags when a claim about real Excel's
   behavior couldn't be checked against a live install (§4.1's `AddCommentThreaded` refusal claim,
   §4.2's worksheet-duplication GUID claim); this is the same class of unverified-against-a-real-app
   claim, but for the write path's own reliability, and it isn't named as unverified anywhere.
2. **Independent of whether the rename succeeds, a MUCH more certain problem**: real Excel/Word has
   no idea this app just replaced the file's bytes on disk — it has the OLD content loaded in memory
   and no live-reload-on-external-change behavior by default (that's a co-authoring/AutoSave-plus-
   OneDrive feature, not ordinary local-file behavior). If the user has the SAME file open in real
   Excel/Word (an entirely ordinary scenario for this feature's own use case — "I have my budget
   spreadsheet open while I ask the assistant about the comments on it") and later presses Ctrl+S in
   that other app, **Excel/Word overwrites the assistant's just-written comment with its own stale
   in-memory copy, silently** — no conflict prompt in either app, no warning, and no way for the user
   to know the resolve/reply/add they saw succeed in YouCoded's own UI was just undone by their own
   later save elsewhere. This is a real, foreseeable, silent-data-loss scenario for exactly the
   concurrent-use pattern this whole two-way-comments feature targets, and it's a DIFFERENT failure
   mode from the "colleague edits between two of our calls" case §4.2's `B19` scenario and F1
   (round 1)'s GUID-id fix already cover — this one is the SAME human, SAME file, two programs open
   on it at once, and no id scheme fixes it because the problem isn't identifying the right thread,
   it's that Word/Excel's own save has no idea anything changed underneath it.

**Proposed fix:** name this explicitly as an accepted, documented limitation — the same way §4.1/§4.2
already name Strict OOXML, unverified Excel-engine behavior, and same-cell Note+thread coexistence as
out-of-scope gaps rather than silent surprises. A full fix (detecting the file is open elsewhere, or
warning the user) is real product work and likely out of scope for this build, but a builder and a
future user deserve one sentence saying "if the same file is open in real Excel/Word at the same
time, whichever program saves last wins, and the other program's changes can be silently lost" rather
than discovering it the first time a user reports a comment "disappearing."

**Triage: Accepted, and taken further than the proposed fix — a real, researched pre-write check,
not just a documented limitation.** A cheap, genuinely buildable partial mitigation was available
(detecting Word/Excel's own `~$<name>` owner file and LibreOffice's own `.~lock.<name>#` lock file,
both real, documented conventions — sources: a Microsoft Q&A thread and a Nextcloud community
support thread for the Office convention, LibreOffice/OpenOffice community documentation for the
LibreOffice one), so §3.3 adds a new step 0 refusing `'file-open-elsewhere'` before backup even
begins, shared by every write caller (UI, native tool, MCP queue) via `write-pipeline.ts`. The
residual gaps this doesn't close are stated explicitly, per your own instruction: a stale lock file
after a crash is a real, documented nuisance (cited) that Retry cannot always resolve on its own,
and a program holding the file open WITHOUT either lock-file convention remains fully undetected —
both are named as accepted limitations and listed for the acceptance deck, not silently implied to
be fully solved by the new check.

---

### F5 (Informational, not a defect) — chokidar 5.0's single-file watch mode already handles the atomic-rename/inode-replacement case on POSIX; Windows is unverified either way, not confirmed broken

Checked directly against `node_modules/chokidar/handler.js` (chokidar 5.0.0, the version actually
installed): `NodeFsHandler._handleFile`'s listener (lines 351-374) explicitly detects an inode change
between the previously-seen `stat` and a fresh one, and on macOS/Linux/FreeBSD closes and
**re-establishes** the underlying `fs.watch` on the same path when this happens — precisely the
recovery a naive single-file watch would need after this app's OWN atomic tmp-write-then-rename
replaces the target's inode. So the generic "editors that save via rename break `fs.watch`" concern
this review's brief asked about is, for the three POSIX platforms, already addressed by the library
itself, not something F1's fix needs to invent. **The same re-arm branch is explicitly gated OFF for
Windows** (`if ((isMacos || isLinux || isFreeBSD) && ...)`), which is plausibly fine — Windows's own
`ReadDirectoryChangesW`-backed notification is directory-and-filename-keyed rather than
inode-keyed, so it may not need the same recovery at all — but this reviewer could not independently
confirm that either way from source alone, and neither can the design as written. Given F1 above
means this code doesn't exist yet regardless, this is not a blocking finding, but once F1 is built,
the design (or its own task-time pinning tests) should say explicitly whether Windows was verified to
survive this app's own atomic rename on a live single-file watch, the same "confirmed" vs
"unverified" discipline §4.1/§4.2 already apply everywhere else in this document.

**Triage: Accepted — stated, not silently assumed.** §1.5's own F1 fix now states this directly:
chokidar 5.0's re-arm-on-inode-change behavior is confirmed from source for macOS/Linux/FreeBSD, and
Windows is named explicitly as unverified from source alone, with a note that T3's own pinning tests
should settle it once built rather than leaving it assumed either way.

---

### (c), (d), (e) — re-checked directly against fresh, independent unzips of both real fixtures; no new findings

- **Id regex vs. real cell refs/GUID forms (c):** every `ref=` value in both real files (`docling`:
  `F7`, `G12`; `elden`: dozens across all 9 commented sheets, e.g. `B19`, `J26`, `XFD`-style refs are
  never actually present but the regex's `[^-]+` cell group does not depend on that) contains no
  hyphen, and every `sheetId` in `elden`'s `workbook.xml` (`<sheet sheetId="1".."10">`) is a bare
  positive integer — both match `^xt-(\d+)-([^-]+)-(.+)$` cleanly, with the GUID segment (group 3)
  correctly capturing the full, un-re-split remainder regardless of its own internal hyphens. No
  cell reference, sheet id, or GUID form in either real file breaks this regex. Confirms round 2's
  own re-verification; nothing new.
- **Ambiguous-id refusal (d):** re-grepped every `id="{...}"` across all of `elden`'s nine
  `threadedComment{N}.xml` parts plus `docling`'s one file — zero duplicate GUIDs in either real
  file, same result round 2 already reported. The design's specified refusal
  (`'ambiguous-comment-id'`, distinct from `'comment-not-found'`) is clear and implementable as
  written; this is unimplemented in the current tree only because xlsx-comments.ts as a whole is
  still the pre-redesign legacy-Notes module (confirmed: it still contains the workbook-wide
  `checkNoUnsupportedFeatures`/`hasThreadedComments` refusal the current design says is "REMOVED
  entirely," and its `parseXlsxCommentId` returns a bare `{sheetId, cell}` with no GUID at all) —
  already an acknowledged, settled fact from round 2 ("T12/T13... haven't been rewritten"), not a new
  gap this round is raising.
- **`legacyDrawing`-after-`extLst` (e):** re-confirmed directly that neither `docling/xl/worksheets/
  sheet1.xml` nor `elden/xl/worksheets/sheet*.xml` contains an `<extLst>` element at all, so neither
  real fixture can pin a regression here — same conclusion round 2 reached. The design's required
  synthetic fixture (a worksheet with a pre-existing `extLst`, shared between T12/T13 and T18/T19) is
  the right call and is specified clearly enough to build from; it does not yet exist in the tree,
  consistent with T12/T13/T18/T19 not being rebuilt yet.

---

## What I checked and did not flag

- Android's explicit, unambiguous answer to "does a FileObserver-equivalent watch exist" — no, by
  design, for every file type, stated plainly in §1.6, unrelated to the reopen-1 "full phone support"
  answer for read/add/reply/resolve/reopen/move. No gap found here; the design is clear and the
  brief's own question is already fully answered in the text.
- The renderer's existing `pendingLocalIds`/`keyGeneration` mechanism (an unsent NEW-comment draft
  surviving a `mergeServerComments` full-array replace) already does, correctly, what a naive
  "replace the whole array" rule would otherwise clobber — checked directly, `mergeServerComments`
  explicitly re-appends any comment whose id is still in `pendingLocalIds` before publishing. An
  unsent REPLY draft (typed but not submitted) is never in the store at all until `addReply` is
  called with final text, so it cannot be clobbered by a push in the first place — it lives in the
  component's own local state, not the synced array. No defect found in either case.
- Whether a full-array replace (a `docComments:changed` push) would unmount/remount a `CommentCard`
  and lose in-progress local UI state (an open reply textbox) was considered; `fromPersisted`
  produces a fresh object per comment but with the SAME `id`, and nothing in the diffed code paths
  suggests list rendering keys on anything other than comment id — no defect found, though this
  reviewer did not exhaustively trace every list-rendering call site to rule out an index-keyed
  render somewhere in the comments pane's JSX.

## Summary for a non-developer reading this

This design has now been checked three times, and the underlying plan for reading and writing
Excel's modern comments is solid — the remaining findings are about the "tell me when something
changed" feature, not about the file format itself.

1. **The most important finding (F1, F2):** the last review round designed a fix so that an open
   comments window updates itself automatically when a comment changes elsewhere — the assistant
   acting in the background, a colleague editing in real Excel, or another window. That fix is
   correctly written down, but checking the actual code that has been built since then shows **the
   fix was not actually built** — not just for Excel (which hasn't been rebuilt yet at all) but for
   Word, which HAS already been rebuilt and is already working. Right now, if someone has a Word
   file's comments open and the assistant resolves a comment on it, the screen does not update until
   the window is closed and reopened — exactly the problem the fix was supposed to solve. This isn't
   a flaw in the plan itself; it's a gap between the plan and what got built, worth closing before
   this ships, not filing away.
2. **A new, real risk this review found (F4):** if someone has the same Excel or Word file open in
   the real Excel/Word app AT THE SAME TIME as asking the assistant about it — a completely normal
   thing to do — and the assistant makes a change, then the person later saves from Excel/Word
   itself, **Excel/Word can silently erase the assistant's change** with no warning in either
   program. Nothing in the plan currently says this can happen. A full fix is a bigger project; at
   minimum, this should be written down as a known limitation rather than something that surprises
   someone the first time a comment "disappears" for no visible reason.
3. Everything else is a smaller wording gap or an already-confirmed-fine detail — nothing else
   changes the plan.
