---
status: shipped
---

# Doc comments — live refresh review: T3 per-document watcher, T5 reply reconcile, T11 file-open-elsewhere

Adversarial read-only review of `6546fc1f3` (desktop) and `4b7836d38` (Android). Scope: the
per-document chokidar watcher (§1.5), the renderer reconcile rule for optimistic replies
(§1.6/§7), and the `file-open-elsewhere` write-pipeline check (§3.3 step 0). Reasoning inherited
from `2026-09-27-doc-comments-xlsx-threaded-design-review-{2,3}.md`, `2026-09-26-doc-comments-build-design.md`.

All cited desktop tests were run: `write-pipeline.test.ts`, `doc-comments-watcher.test.ts`,
`use-doc-comments.test.tsx`, `docx-comments.test.ts`, `doc-comments-store.test.ts`,
`xlsx-comments.test.ts`, `doc-comments-json-sidecar-fixture-parity.test.ts`,
`doc-comments-ipc-handlers.test.ts` — **173/173 pass.** `npm run typecheck` is clean.
`bash scripts/ast-grep/check.sh` is clean (408/408 fixtures fire, no violation on real source).
`main-blocking-calls.test.ts` passes (26/26) — the new `fs.access` calls in
`isFileOpenElsewhere` are on the async path, no new blocking call.

## Findings

### 1. HIGH — `docComments:watch`/`:unwatch` skip the known-root gate that every other native-format channel enforces, letting a caller open a live filesystem watch on an arbitrary absolute `.docx`/`.xlsx` path

**Where:** `desktop/src/main/doc-comments/doc-comments-store.ts:583-592` (`resolveWatchTarget`'s
new native-format branch, this commit), consumed by
`desktop/src/main/doc-comments/ipc-handlers.ts:278-306` and
`desktop/src/main/remote-server.ts:2430-2455`.

**The gap:** Every OTHER native-format entry point — `list`/`add`/`reply`/`resolve`/`reopen`/
`move`, via `doc-comments-dispatch.ts`'s `resolveDocxTarget`/`resolveXlsxTarget`/
`listNativeComments` — runs the resolved absolute path through `authorizeBytesRead()`
(`read-service.ts`) whenever `projectRoot` is omitted, refusing `path-not-tracked` for anything
that isn't a saved folder, an indexed project, or a tracked external artifact
(`doc-comments-dispatch.ts:41,84,160,265`). `resolveWatchTarget`'s new `nativeFormatFor` branch
(the one this commit adds) does not: for a `.docx`/`.xlsx` target with no `projectRoot`, it calls
`resolveSourceFilePath`, which only requires `path.isAbsolute()` and realpaths it — no
authorization at all (confirmed by grep: `authorizeBytesRead` appears exactly 3 times in
`desktop/src/main/doc-comments/`, all inside `doc-comments-dispatch.ts`; `doc-comments-store.ts`
never calls it). `ipc-handlers.ts`'s `WATCH`/`UNWATCH` handlers do call `gateProjectRoot`
first, but that function is a documented no-op when `projectRoot` is `undefined`
(`doc-comments-gate.ts:33-38`: *"the caller then takes the fallback (loose-file) path... gated
separately, at the point it would read a file's actual bytes... not here"*) — but `resolveWatchTarget`
never reaches that "elsewhere" gate for `WATCH`. `remote-server.ts`'s `docComments:watch`/
`:unwatch` cases (lines 2430-2455) call the exact same `resolveWatchTarget`, so the gap is
present on the WS-remote surface too, not just desktop IPC.

**Concrete failure scenario:** A WS-connected remote-access client (already past password auth)
sends `{type:'docComments:watch', payload:{path:'/home/destin/some/untracked/anywhere.docx'}}`
with no `projectRoot`. `gateProjectRoot(undefined)` returns `null` (proceed, by design — no root
to vet). `resolveWatchTarget` resolves the absolute path and returns
`{kind:'document', absolutePath, projectRoot: undefined}` with **no check that this path is a
saved folder, an indexed project, or a previously-tracked artifact** — unlike calling `list()`
on that same path, which would correctly refuse `path-not-tracked`. `watchComments` starts a
live chokidar watch on it. The client learns nothing about the file's *content*, but does learn
"this file exists" (a watch on a nonexistent path fails silently rather than refusing with a
typed error) and gets a live "it just changed" signal for a path it was never authorized to
touch — an oracle `list`/`add`/etc. all correctly close.

**Compounding, same root cause:** `doc-comments-watcher.ts`'s `entries: Map<string, Entry>` has
no cap on the number of concurrent chokidar watchers, and (for the `'document'` case
specifically) no root-scoping to bound how many distinct absolute paths can be named. A `'project'`
target is at least bounded by "known roots the app already shows"; a `'document'` target with no
`projectRoot` is bounded by nothing. This matches the "watching huge numbers of files" hunt item:
the design's own text only requires the bytes-reading gate for `listNativeComments` (§1.5's own
wording), but `resolveWatchTarget`'s new branch was never given the equivalent scoping, and no
test exercises it — `doc-comments-remote-relay.test.ts`'s "fallback (no projectRoot) source-file
gate" `describe` block (line 295) tests **only** `docComments:list`, and
`doc-comments-ipc-handlers.test.ts`'s watch/unwatch tests (line 326) test only the
unknown-`projectRoot` case, never the no-`projectRoot`-plus-untracked-absolute-path case.

**Fix:** In `doc-comments-store.ts`'s `resolveWatchTarget`, when `nativeFormatFor(args.path)` is
truthy and `args.projectRoot` is absent, run the resolved `absolutePath` through the same
`authorizeBytesRead()` check `doc-comments-dispatch.ts`'s `resolveDocxTarget`/`resolveXlsxTarget`
already use, refusing `path-not-tracked` identically. Add the missing test case to both
`doc-comments-ipc-handlers.test.ts` and `doc-comments-remote-relay.test.ts`'s existing "fallback
gate" `describe` blocks, mirroring the `list` case already there but for `WATCH`.

**Triage: Accepted — closed exactly as proposed, plus the compounding cap.** `resolveWatchTarget`'s
native-format branch (`doc-comments-store.ts`) now runs the resolved `absolutePath` through
`authorizeBytesRead()` whenever `projectRoot` is absent, refusing a new `'path-not-tracked'` member
added to `DocCommentsError` — identical gate, identical refusal code, to `list`/`add`/etc. Both
desktop IPC and the WS-remote surface inherit it for free (both call the same `resolveWatchTarget`),
so no change was needed in `ipc-handlers.ts`/`remote-server.ts` themselves. Also closed the
compounding finding: `doc-comments-watcher.ts` now caps concurrent `'document'`-kind chokidar
watchers at `MAX_DOCUMENT_WATCHERS = 32` (a NEW distinct target beyond the cap degrades to
`{ok:false}`, the same shape every other watch-start failure already uses; an existing target's
resubscribe is never blocked by the cap, checked in its own test). New tests: the untracked-path
refusal for `WATCH` on both `doc-comments-ipc-handlers.test.ts` and
`doc-comments-remote-relay.test.ts` (mirroring the existing `list`-side "fallback gate" blocks
exactly, plus a same-path-with-a-real-projectRoot control proving Gate 2 doesn't affect the
legitimate case), the store-level `resolveWatchTarget` test corrected to assert the new refusal
instead of its now-incorrect success expectation, and the 32-watcher cap test in
`doc-comments-watcher.test.ts`. `bash scripts/verify.sh --full`: all green. Commit `ae4c309e0`.

### 2. LOW/INFORMATIONAL — a reply with no server-side enrichment (xlsx today) shows under its fake local id until the next merge, not a duplicate/loss but an untested combination

**Where:** `desktop/src/renderer/state/doc-comments-store.ts:900-923` (`addReply`'s `.then`
callback) interacting with `desktop/src/main/doc-comments/doc-comments-dispatch.ts:178-200`
(`replyToNativeXlsxComment`, explicitly documented as NOT yet returning `res.reply`).

**Behavior traced through every interleaving:** `dropInFlightReply(id, replyId)` runs
**unconditionally** at the top of the `.then` callback, before checking `res.ok`/`res.reply`
(line 904). For docx (enriched), `reconcileReplyId` immediately swaps the local placeholder for
the real id in the same tick (correct, matches §7 rule 3). For xlsx (not yet enriched, `res.reply`
undefined), nothing swaps the placeholder — the reply keeps showing under its throwaway local id
(`r-${nextLocalSuffix()}`) until the **next** `docComments:changed` push replaces the whole
`replies` array via `mergeServerComments`. Because `dropInFlightReply` already removed the entry
from `inFlightRepliesByParent` (regardless of whether it was ever swapped), `reconcileInFlightRepliesForComment`
has nothing to re-append for it at that point — but since the actual write already committed to
disk by the time the IPC response resolved (the write-pipeline's own verify-after-write happens
before the promise settles), the eventual push's fresh `list()` read already contains the real
reply, so it correctly replaces the placeholder with no duplicate and no content loss. Traced
this through the "two identical back-to-back replies" case too (constructed manually since no
test covers it): the *content* of `fresh.replies` is never filtered by the tie-break match
(`reconcileInFlightRepliesForComment` only decides what to *additionally append*, never removes
anything already in `fresh`), so even a spurious content-match against the wrong in-flight entry
cannot delete a real, already-persisted reply. **Net: no correctness bug found**, matching the
xlsx dispatch code's own comment ("an accepted, narrower gap than before, not a bug") — but the
window between an xlsx reply's response and the next push/reopen is real: the UI shows the reply
under an id that will never again match anything (a `key=` churn, and any other client-side
lookup by that fake id silently fails once the merge lands).

**Untested combination worth closing:** none of the four new `addReply` reconcile tests in
`use-doc-comments.test.tsx` (lines 331-479) exercise `res.reply` being **absent** on success (the
xlsx shape) followed by a `docComments:changed` push — every one of them supplies `res.reply`.
Add one test using the plain `ok:true` (no `reply`) shape from the default fake IPC (already
present at line 37) followed by an `emitChanged`, asserting the placeholder is correctly replaced
and not duplicated — this is exactly the combination T13 (xlsx reply enrichment, still open per
`doc-comments-dispatch.ts:178-189`) will need proof for once it lands.

### 3. LOW/INFORMATIONAL — `file-open-elsewhere`'s Word/Excel owner-file check is a confirmed, accepted false-negative for very long filenames — already flagged by the design, worth a roadmap line rather than silence

**Where:** `desktop/src/main/doc-comments/write-pipeline.ts:35-37` (`officeOwnerFilePath`),
mirrored in `app/.../DocxComments.kt`'s `isFileOpenElsewhere`.

Both implementations compute the LITERAL `~$<full filename>` and look for that exact sibling.
Real Word/Excel are documented (multiple Microsoft support/community threads) to shorten the
owner-file name for a long original filename rather than always prefixing the whole name with
`~$` — the design's own §3.3 step 0 already states this could not be independently confirmed and
marks it an accepted limitation rather than guessing at the truncation rule. I could not verify
the exact truncation algorithm from within this sandbox either, so I am not asserting a specific
scheme — but the shape the task described (`~$` + a suffix of the original name, to keep the
owner file's own path under Office's ~218/259-char limits) matches what's publicly documented
about this convention, which means the accepted limitation is real, not theoretical, for a
filename long enough to approach those limits. This is not a regression from this commit (the
design explicitly pre-approved the gap) — flagging only because the task asked for it to be
checked. No code change needed; consider adding one line to `docs/roadmap/` noting the
accepted false-negative is real rather than hypothetical, so it isn't silently rediscovered as
new later. Verified NOT an issue on case-insensitive filesystems (Word/Excel and this app's
check both run on the SAME machine/filesystem, so a case mismatch between the two never arises
in practice).

### Verified NOT a problem (checked because the task asked to hunt these; no fix needed)

- **The check does not run on non-Office writes.** `writeFileMutation` (which contains
  `isFileOpenElsewhere`) is called ONLY from `docx-comments.ts` and `xlsx-comments.ts`; the plain
  sidecar's `mutateFileUnderLock`/`cas-write.ts` path is untouched — confirmed by grep across
  `desktop/src/main` and `app/src/main`. A plain-text/markdown comment's sidecar write is never
  blocked by an unrelated `~$`/`.~lock.` sibling.
- **TOCTOU between the check and the actual write.** `isFileOpenElsewhere` runs first inside
  `withWriteLock`'s per-path in-process lock, then the same callback proceeds to backup/mutate.
  There's a small window where Office could open the file a moment after the check passes but
  before the rename completes — the design does not claim to close this (residual limitation
  text focuses on stale-lock-after-crash and non-Office holders), and it is not practically
  closable without cooperating with Office's own lock protocol. Noting it exists; not treating it
  as a new defect since no realistic mitigation was skipped.
- **Android xlsx parity.** `XlsxComments.kt` has no write path at all yet (T19 unbuilt) —
  `isFileOpenElsewhere`/`FILE_OPEN_ELSEWHERE` only exist in `DocxComments.kt`. Confirmed by grep;
  matches the commit message exactly. No gap to close until T19 lands (and T19 will need this
  check ported the same way T13 got it "for free" on desktop through the shared pipeline —
  Android's xlsx path won't get it for free since it's a separate module, so add it as an
  explicit line item on T19's own task description if not already there).
- **Watcher leaks.** Renderer: `subscribeKey`'s returned cleanup calls `ipc.unwatch` on last
  release and is gated by `useOnScreen()` (hidden-means-idle, performance.md rule 2) —
  unaffected by this diff, confirmed still correct for the new `'document'` target. Main process:
  `ipc-handlers.ts`'s `WATCH` handler registers an `e.sender.once('destroyed', …)` that calls
  `dropDocCommentsSubscriber`, covering a crashed/closed renderer. `remote-server.ts`'s
  `docCommentsSubscriberId` registers `client.ws.once('close', …)` doing the same. Both correctly
  iterate every watch-target entry (not just the caller's most recent target), so a client
  watching multiple files loses all of them on disconnect, not just one.
  `doc-comments-watcher.ts`'s own refcounting (`entries.get(key).refs: Map<subscriberId, count>`)
  is per-(target, subscriber) and closes the underlying chokidar watcher exactly when the last
  ref drops — traced through explicit `unwatch`, crash-drop, and the two-simultaneous-watchers
  test (`doc-comments-watcher.test.ts:291`), all correct.
  `__resetDocCommentsWatcherForTest`/`__resetDocCommentsStoreForTest` both clear the new state
  (`inFlightRepliesByParent.clear()` added at line 1133) — no test-isolation leak.
  For a `'document'` target replacing `'project'` (§1.5's "replaces, never runs alongside"):
  confirmed `resolveWatchTarget` returns exactly ONE target per `nativeFormatFor` check (the
  `if (nativeFormatFor(...)) { ...; return ...; }` short-circuits before the `project`/`fallback`
  branches), so a docx/xlsx pane can never accidentally hold both a document watch AND a stale
  project-sidecar watch simultaneously.
- **Echo from our own write clobbering optimistic state or an unsent draft.** A reply/comment
  draft still being typed lives in component-local `useState` (`ReplyField.tsx:19`,
  `NewCommentPopover`'s own draft state) — entirely outside `doc-comments-store.ts`'s snapshot,
  so a `docComments:changed`-triggered `mergeServerComments` full-array replace never touches it.
  A brand-new, not-yet-persisted top-level comment (`pendingLocalIds`) is explicitly preserved
  across every merge (`keptLocal` filter, unchanged by this diff). A per-comment inline error
  (F7, pre-existing) is preserved the same way. Traced the resolve/reopen optimistic-boolean path
  too: since a self-triggered write only resolves `ok:true` after write-pipeline's
  verify-after-write succeeds, any subsequent `list()` (whether from our own settling write's
  push or an unrelated one) already reads the correct new boolean — no window where our own echo
  reverts our own optimistic flip.
- **Reply duplicates/losses under response-before/after-push interleaving, and the two-identical-
  replies tie-break.** All four scenarios are covered by real tests in `use-doc-comments.test.tsx`
  (lines 331-479) and pass; I additionally traced the docx enrichment path
  (`reconcileReplyId`'s `alreadyLanded` guard) and confirmed it cannot double-apply: if a push
  already landed with the real id present, the `.filter` branch removes the (already-absent)
  placeholder as a no-op; if not, the `.map` branch swaps it. No path produces two entries for one
  reply.
- **Ordinal computation parity (desktop `nextReplyOrdinal` vs. Android's mirror).** Both walk
  `commentsDoc`'s `w:comment` elements, resolve each to its thread root via the SAME
  `paraIdParent`-chain walk (`resolveRootParaId`), exclude the target's own paraId, and return
  `count + 1`, computed BEFORE the new entry is appended in both languages. Verified by direct
  diff comparison — no logic drift.
- **`file-open-elsewhere` wording and Retry.** Exact text matches §3.3 step 0
  ("This file looks open in another app. Close it there, then try again.") on both desktop
  (`doc-comments-store.ts:323-324`) and by the same string being forwarded verbatim through the
  native-tool path's generic `describeError` passthrough (`doc-comments-tools.ts:103-105`, no
  special-casing needed since it never asserts an unverified cause). `setCommentError`'s
  `onRetry` replays the exact same mutation for every one of `resolveComment`/`reopenComment`/
  `addReply`/`persistNewComment`.

---

## Triage (2026-09-27, session `comments-mock-a`, commit `ffda4b654`)

Finding #2 (xlsx reply enrichment untested combination): **closed** — xlsx's own reply path
(`replyToXlsxComment`) is now enriched with the persisted `CommentReply`, exactly like docx, as
part of the xlsx T12/T13 adversarial review's own fixes (see
`2026-09-27-doc-comments-xlsx-t12-t13-review.md`'s triage). Added the two tests this finding's own
"untested combination worth closing" asked for to `use-doc-comments.test.tsx`: an xlsx-shaped
(`xt-`) enriched reply swap, and — the finding's own specific ask — a reply response with NO
`res.reply` at all (the plain `{ok:true}` shape, still real for any future non-enriching caller)
still correctly reconciling once the next `docComments:changed` push lands, with no duplicate and
no stuck placeholder. Both pass (29/29 in that file overall).

Finding #1 (the `resolveWatchTarget` known-root gate) was explicitly out of scope for this session
per the coordinator's own instruction ("another agent is fixing a known-root gate... stay out of
those") — confirmed separately landed at commit `ae4c309e0` ("gate docComments:watch/unwatch on
authorizeBytesRead + cap document watchers") before this session's own fixes were pushed on top.

Finding #3 (long-filename owner-file false negative) — no action taken here, matching the
review's own "no code change needed, consider a roadmap line" recommendation; not this session's
task scope.
