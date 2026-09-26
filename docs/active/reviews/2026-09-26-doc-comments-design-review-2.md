---
date: 2026-09-26
status: active
type: review
---

# Document comments — build design review (round 2)

Reviewing: `docs/active/specs/2026-09-26-doc-comments-build-design.md` (as revised after
review 1, `docs/active/reviews/2026-09-26-doc-comments-design-review-1.md`, and after
Destin's reopen-1 answer — full Word/Excel comment support on the phone,
`docs/active/design/2026-09-24-doc-comments/doc-comments.reopen-1.json`/`.answers.json`)
against the contract (`doc-comments.contract.json`, 21 rows, signed), the app code at
`/home/destin/youcoded-dev/worktrees/sessions/comments-mock-a/youcoded` (branch
`session/comments-mock-a`), and `CLAUDE.md` / `.claude/rules/feature-flow.md` /
`.claude/rules/performance.md` / `docs/PITFALLS.md` / the MAP-named subsystem rules
(`ipc-bridge.md`, `harness-tools.md`, `android-runtime.md`, `native-runtime.md`).

**Round-1 fixes checked, not just re-read.** All 17 of review 1's findings are marked
`accepted` in the design's changelog. I re-verified the load-bearing ones against the design
text and, where the underlying code is unchanged (no app code has been touched — line 61 of
the design confirms this — round 1's own code citations still hold), confirmed the design's
new prose is internally consistent: F1/F2 (docx/xlsx logic moved to main, no new binary IPC
channel — §3.2/§3.3/§4.3, confirmed present), F3 (path containment specified — §1.5, present),
F4 (lock-path canonicalization + true-concurrency test — §1.5/§9.1, present), F5 (automatic
rollback on verify failure — §3.3 step 5/§4.3, present), F6 (id/paraId uniqueness — §3.3 step
2, present), F7 (collision-safe resolve marker + reopen-strip — §4.1, present), F8 (T9 split
into T9a/T9b/T9c — §8/§9.3, present), F9a/F9b (anchoring fallback + tie-break — §2.2,
present, but see F11 below), F10 (correct Android watch-refusal shape + `REJECT_ON_NOT_OK` —
§1.6, present), F11 (draft-token layer in T7 — §6.2, present), F12 (PTY-safe underscore
separator — §6.2, present, but see F4 below — **this fix has a real residual problem**),
F13–F17 (wording/citation/dependency fixes — present). No round-1 finding was reopened or
found to be reverted.

**New territory since round 1:** reopen-1 added T16–T21 (Android docx/xlsx Kotlin
implementation) and re-affected §3.2/§4.3/§1.6/§9/§10. This review's research focused there,
plus re-examining whether F8's and F12's fixes actually close the risk they name, since a
"fixed" citation to weak prior art or a new syntax can still be broken in a different way.

Method: direct code reads and greps against the real repo (not the design's paraphrase) —
`claude-code-mcp.ts`, `chatsearch.js`, `ClaudeCodeMcp.kt`, `compose-ref.ts`, `edit.ts`/
`write.ts`/`send-user-file.ts`'s `permissionSubject`, chokidar's installed README defaults,
`git-watcher.ts`, Android's `app/src/main/kotlin` tree (grepped for existing
`javax.xml`/`org.w3c.dom`/`zip` usage), `app/src/test/kotlin`, `shared-fixtures/`, and
`.github/workflows/android-ci.yml`.

## Findings

### F1 — [major] T9a's cited precedent (`chatsearch.js`) solves an easier problem than the one T1/T9a actually have, and `claude-code-mcp.ts` has zero existing file I/O to build on

Evidence: `desktop/src/main/claude-code-mcp.ts`'s embedded `LINK_SERVER_JS` (lines 32-215)
does pure stdin/stdout JSON-RPC — no `fs` call anywhere inside the deployed server string; the
only `fs` calls in the whole file (`fs.mkdirSync`, `fs.writeFileSync`, lines 243/246/254) run
in the **main-process deploy function**, not in the plain-node script Claude Code actually
spawns. So today, the dependency-free script this design's T9a extends has never once done
file I/O, let alone a lock.

`wecoded-marketplace/youcoded-chatsearch/skills/chatsearch/scripts/chatsearch.js`'s
`submitRequest` (read at lines ~798-819, not 812-822 as cited — close but off by ~14 lines)
is real and does an atomic tmp-write+rename, but it is a **single-writer mailbox to a
separate, already-running, more-authoritative process** (the CLI writes one uuid-named
request file, then polls a distinct `done/<id>.ack.json` path the app writes back — never the
same file two independent writers race for) with an explicit non-error "queued, try later"
message when the app isn't running (`return { message: `Queued: YouCoded is not running...` }`
at line ~817). It contains **no mutex/lock at all** — there is nothing here that excludes two
writers from touching the same file simultaneously, because chatsearch's design never has two
writers touching the same file. That is a categorically easier problem than what T1/T9a need:
main and the MCP script both mutating the SAME `.youcoded/comments/<path>.json` and needing to
actually exclude each other (review 1's own F4).

Citing `chatsearch.js` as the pattern for "the mkdir-lock-plus-atomic-rename algorithm" (§9.1
point 2, T9a's row) oversells how much of T9a is precedented. The atomic-tmp-write-then-rename
half transfers; the **mutual-exclusion** half (the actually hard part F4 worries about, and
the part `cas-write.ts`'s Windows-specific `EPERM`/`EACCES`/`EBUSY` contention handling exists
for) has no precedent anywhere in this codebase to copy from. This doesn't reopen review 1's
F8 (T9 is still correctly split), but it means T9a's own "Key risk" column undersells the
task: it isn't "porting `cas-write.ts`'s contention handling," it's **inventing the first
dependency-free concurrent-writer lock this codebase has ever needed**, with only a
single-writer mailbox as loose inspiration.

Fix: reword T9a's row and §9.1 point 2 to say plainly that the lock/mutex half of T9a is
novel, not ported — cite `chatsearch.js` only for the atomic-write mechanics, not the
locking — and budget T9a's review accordingly (a `stress`-style two-process contention test,
not just the existing sequential round-trip, before this is trusted as F4's fix).

Triage:

### F2 — [major] The ~3s pending-mutation timeout has no real precedent and may not survive chokidar's own default latency, threatening R2/R3/R9 for the CLI-session path specifically

Evidence: §9.2/T9b/T20 all specify "polls (bounded, ~3s, matching other native tool
timeouts)." The actual native-tool timeout constants in this repo are
`desktop/src/main/harness/tools/bash.ts:26-27` (`DEFAULT_TIMEOUT_MS = 120_000`,
`MAX_TIMEOUT_MS = 600_000`) and `desktop/src/main/harness/tools/registry.ts:13`
(`SEARCH_TIMEOUT_MS = 180_000`) — 120–600 seconds, not 3. There is no existing 3-second
timeout anywhere in `harness/tools/` or `claude-code-mcp.ts` for this design to be "matching."
The number appears invented, not sourced.

More concretely: chokidar (installed version 5.0.0,
`desktop/node_modules/chokidar/README.md:203`) documents `awaitWriteFinish.stabilityThreshold`
**defaulting to 2000ms** when `awaitWriteFinish` is enabled at all (not an object with a
smaller value). §1.5 says the comments watcher uses `awaitWriteFinish` (to avoid reading a
half-written file) **plus its own ~300ms debounce** on top, but never specifies overriding
`stabilityThreshold` down from the 2000ms default. `git-watcher.ts` (`DEBOUNCE_MS = 300`,
confirmed at line 16) — the design's own cited precedent for the 300ms figure — does **not**
use `awaitWriteFinish` at all (grepped, no match), so this design is combining two delays
(chokidar's default 2000ms stability wait + a borrowed 300ms debounce) that have never been
stacked together anywhere in this codebase. 2000+300 = 2300ms of latency before the
main-process watcher even fires the callback that starts JSZip unzip → XML parse → mutate →
JSZip re-zip → `fs.writeFile` → (per F5/F17's own fix) a **full re-parse of the just-written
bytes to verify** before replying. That leaves well under a second for all of that real work,
on any docx/xlsx file, not just a large one — and Android's Kotlin polling loop (T20, ~250ms
granularity) adds its own step latency on top for the CLI-on-Android path.

If this bound is hit in ordinary (non-error) operation, T9b/T20's own spec says the MCP script
"surfaces a specific failure, never hangs" — meaning a **successful** comment reply on a
Word/Excel file, reached through a Claude Code CLI session (not the app's own IPC path, which
doesn't go through this queue at all), could routinely report failure to the model even though
nothing is actually wrong. That threatens R2/R3 ("the assistant can reply to/resolve your
comments") and R9 (Word two-way) specifically for the CLI-session route this design's whole
§9 architecture exists to serve.

Fix: before committing T9b/T20's pinning tests to "~3s," (1) correct the "matching other
native tool timeouts" citation — there is no such precedent — and (2) either explicitly set
`awaitWriteFinish: { stabilityThreshold: <small value>, pollInterval: 100 }` for the comments
watcher specifically (documenting why a smaller threshold is safe here, e.g. because JSZip's
write is not chunked the way the chokidar default guards against) or budget the real number
from a benchmark against a representative fixture (a multi-MB `.docx` with images) before the
timeout is frozen into a task's pinning-test spec. A timeout tuned to fail routine successful
operations is worse than a longer one that fails only genuine hangs.

Triage:

### F3 — [major] No permission/approval gate is specified for six tools that, for Word/Excel targets, write directly into the user's real document bytes — not an inert sidecar

Evidence: `desktop/src/main/harness/tools/write.ts:70` (`permissionSubject: (a) => a.file_path`)
and `edit.ts:82` (same) route every file-content mutation through `decidePermission()` —
confirmed both tools declare a subject. `send-user-file.ts:44` (`permissionSubject: () =>
undefined`) is the codebase's one existing precedent for a tool that deliberately opts out of
the approval gate, and it does so for a tool that sends an already-approved *file to the user*,
never writing anything.

The design's §5 tool table (`ReadFileComments`, `ReplyToComment`, `ResolveComment`,
`ReopenComment`, `AddComment`, `MoveComment`) never specifies a `permissionSubject` for any of
the six, and §5.2 states outright: "no new tool and no change to `permission-engine.ts`,"
framing every comment operation as pure metadata the assistant should never need approval for
— true for a plain-text file (§1.1: those comments live only in
`.youcoded/comments/<path>.json`, never touching the source file). It is **not** true for a
Word/Excel target: per §3.3 step 2, `AddComment` on a `.docx` "insert[s]
`w:commentRangeStart`/`End` + a `w:commentReference` run into `document.xml`" — a real
insertion into the document body's own XML, and §4.3a's four-part xlsx note wiring touches the
worksheet's own `<legacyDrawing>` relationship. These are direct writes to the user's actual
document, dispatched by a tool with (by the design's own silence) presumably `permissionSubject:
() => undefined` like `send-user-file.ts` — meaning **zero approval prompt**, ever, for an
autonomous binary-file mutation, where the same class of action against a plain-text file
(an `Edit` call) is gated.

The automatic backup+verify+rollback (F5's fix) mitigates *data loss*, not *consent* — the
user is never asked before the assistant rewrites part of a live Word/Excel file's internal
XML. No contract row requires this be gated (R2/R3/R6 just ask for reply/resolve/move to work),
so this isn't a contract violation, but it's a real, unaddressed product/security asymmetry the
design should decide on purpose rather than by omission.

Fix: decide explicitly (and record the decision, not just silence) whether
`AddComment`/`MoveComment`/`ResolveComment`/`ReopenComment`/`ReplyToComment` need a
`permissionSubject` when their target resolves to a `.docx`/`.xlsx` file (gated the same as
Edit/Write) versus staying ungated for plain-text targets (where only an inert JSON sidecar is
touched). If the decision is "stay ungated everywhere, backup/rollback is enough," say so in
§5.2 with the reasoning, so a future reviewer doesn't have to rediscover the asymmetry.

Triage:

### F4 — [major] The PTY-safe wire grammar (§6.2, F12's fix) trades an unambiguous encoding for an unescaped one — real paths and real quotes can break the new parser

Evidence: today's `encodeRefMarker` (`compose-ref.ts:65-67`, confirmed) is
`encodeURIComponent(JSON.stringify(ref))` — fully escaped, unambiguous by construction: no
character in a real quote or path can ever be misread as a delimiter, because JSON's own
escaping handles it. F12's fix (§6.2) replaces this with a hand-rolled positional grammar —
`⦃"<exact quote>"_<path>[_L<start>-<end>|_cell_<C>_<S>]⦄` etc. — parsed, per the design's own
words, by "the quote by its `"…"` marks, the path/suffix by fixed position and recognizable
prefixes." This closes F12's PTY-whitespace problem (correctly — underscores are a fine,
single-byte, non-mangled substitute for the literal spaces that were the actual bug) but opens
two new, concrete correctness gaps that didn't exist in the JSON encoding it replaces:

1. **A quote containing its own `"` breaks the "ends at the next `"`" parse.** A perfectly
   normal excerpt like `He said "stop it" and left` produces
   `⦃"He said "stop it" and left"_docs/foo.md⦄`. A parser that finds the quote by scanning to
   the next `"` after the opening one reads the quote as `He said ` and then has no defined
   behavior for the remaining `stop it" and left"_docs/foo.md⦄`. Quoted dialogue inside a
   document is not a rare edge case — it's the kind of text "Ask about this" exists to
   reference.
2. **A path or quote containing a literal underscore is indistinguishable from the grammar's
   own structural separator.** Real filenames commonly contain underscores
   (`2026_09_24_plan.md`, `snake_case_notes.txt`). The design's own claim that the fix "touches
   only the syntax this design invents, not the user's own file paths or quoted text" is true
   for whitespace (the actual F12 bug) but not for underscores, which are now structurally
   overloaded and were never overloaded in the JSON encoding.

Neither T7's listed pinning tests ("encode/decode round-trip per ref kind," "no literal space
in the structural syntax," the draft-token test, the PTY end-to-end test) exercises a quote
containing an embedded `"` or a path/quote containing a literal `_`. F12 fixed the bug that was
found; it did not re-establish the unambiguous-by-construction property the original JSON
encoding had for free.

Fix: either (a) escape the one reserved character each grammar form actually needs (e.g. a
quote's internal `"` doubled or backslash-escaped, matching how the quote-hover/click logic
already needs to reconstruct the exact original text) and add pinning tests for an
embedded-quote-mark case and an underscore-in-path/quote case, or (b) constrain the grammar so
the quote is captured by a **non-greedy** match up to the *last* `"` before a recognized
trailing suffix or `⦄` (still imperfect if the quote itself ends near a real suffix-looking
tail, but closes the common case), with the same two adversarial cases added as tests either
way.

Triage:

### F5 — [minor] Zero existing precedent for `javax.xml.parsers`/`org.w3c.dom`/`TransformerFactory`/`ZipOutputStream` anywhere in this Kotlin codebase; the R8-risk dismissal is untested (though CI's existing `assembleReleaseTest` run mitigates it)

Evidence: `grep -rln "javax.xml|org.w3c.dom|DocumentBuilder|TransformerFactory"
app/src/main/kotlin/` returns nothing — no file in this codebase has ever used these classes.
`grep` for zip usage under `app/src/main/kotlin/` finds only
`app/src/main/kotlin/com/youcoded/app/runtime/Bootstrap.kt`, and only `ZipInputStream` for
**streaming, read-only extraction** of a bundled Termux asset (`bootstrap-aarch64.zip`) — never
`ZipOutputStream`, never a load-whole-archive-into-memory-then-rewrite pattern. §3.2a's
confident "already part of every Android device, no new Gradle dependency required" is true
for *availability*; the design's further claim that this "isn't [the kind of reflection R8
breaks]... no new R8/proguard surface" is asserted, not demonstrated anywhere in this repo —
there is no existing DOM-manipulation Kotlin code that has ever gone through this app's release
R8 config to confirm it.

This is meaningfully mitigated, not ignored: `.github/workflows/android-ci.yml` already runs
`./gradlew assembleReleaseTest` (R8-minified, debug-signed) on every push/PR automatically
(confirmed, lines ~65-75), so DocxComments.kt/XlsxComments.kt would go through the same R8 pass
as everything else the moment they exist, without needing a bespoke task step for it — the
design's §3.2a citation of `assembleReleaseTest` as "still the check" is correct as a
description of CI's existing behavior. What's missing is that **no task's own pinning-test
column (T16-T19) names this explicitly**, so a reviewer reading only the task table (not §3.2a's
prose) could believe R8 is unaddressed for this feature specifically, when in fact it rides on
the app-wide CI job for free.

Fix: add one line to T17/T19's pinning-test column noting the release-R8 build is exercised by
the existing `android-ci.yml` job (not a new check to build), so the coverage is visible from
the task table alone.

Triage:

### F6 — [minor] No memory/file-size guard for Android's load-whole-archive-into-memory pattern, where phone heap limits are tighter than desktop Electron

Evidence: §3.2a explicitly models Kotlin's approach on JSZip's "load the full archive into
memory, mutate the in-memory representation, and write the whole thing back out" — reasonable
on desktop Electron, which has no comparable per-process heap ceiling to a phone's app sandbox.
Nothing in §3.2a/§4.3a/T16-T19 mentions a size guard, streaming fallback, or even an
acknowledgment that a multi-MB `.docx` with embedded images, fully unzipped + DOM-parsed +
re-zipped in Kotlin on a phone, is a materially different memory profile than the same
operation in an Electron main process. `docs/android-runtime.md`/`.claude/rules/android-runtime.md`
don't mention a comments-specific memory concern either (expected, since no app code has been
written yet).

Fix: not a blocker for typical Word/Excel files (most are small), but worth a documented,
watched limit (e.g., "detect files over N MB and route to a specific, honest `<ErrorState>`
rather than an OOM crash") the same way F9c documented the mammoth-version risk as accepted-but-watched
rather than silently absent.

Triage:

### F7 — [minor] T21's cross-platform parity guard is two independently-scheduled CI jobs checked against the same static fixture bytes, not a live cross-implementation comparison

Evidence: `desktop-ci.yml` and `android-ci.yml` are separate GitHub Actions workflows (confirmed
`android-ci.yml` exists as its own file, running on `ubuntu-latest` with its own job). T21 says
the parity test runs "in CI on the desktop side and via `./gradlew test` on the Android side
against the SAME checked-in fixture bytes" — this does run automatically on every PR (both
workflows trigger on `pull_request`, confirmed), which is better than this reviewer initially
assumed from `CLAUDE.md`'s own caveat about Android SDK/build availability being inconsistent
**on a workstation** (that caveat is about local dev machines, not CI, which has its own fixed
image). But the actual comparison T21 needs — "desktop writes, Android reads the SAME output;
Android writes, desktop reads the SAME output" — can only happen through a **shared, checked-in
fixture file**, since a Node process and a JVM process never run in the same test. If a future
change to desktop's `docx-comments.ts` output shape isn't accompanied by regenerating the
fixture Android's test reads, desktop's own CI (checking its own output against its own
expectations) could stay green while silently drifting from what T21's fixture — and therefore
Android's still-passing test — actually represents, and nothing forces the fixture to be
regenerated as part of ordinary desktop changes.

Fix: not a blocker (this is the best structure achievable across a Node/JVM split), but add an
explicit CI step or test assertion that fails loudly if the checked-in fixture bytes and
desktop's freshly-generated output diverge (a "does today's desktop output still match the
committed golden fixture" self-check on the desktop side), so fixture staleness is caught before
it silently defeats T21's whole purpose.

Triage:

### F8 — [minor] The exceljs-output-capture spike (T18) has the same dependency-version-drift risk review 1's F9c accepted for mammoth, without the same "documented, watched risk" treatment

Evidence: F9c (review 1, accepted) explicitly records that mammoth's docx→HTML output isn't
guaranteed byte-stable across a version bump, and accepts that as a documented, watched risk
rather than building a disproportionate dual-version test now. §4.3a's T18 spike captures a
**point-in-time** snapshot of exceljs's `comments<N>.xml`/`vmlDrawing<N>.vml` output as
`shared-fixtures/doc-comments/xlsx-note-reference/` — T19's Kotlin writer then targets that
snapshot's exact shape. If `exceljs` is later bumped and its OOXML output shape changes even
slightly (a different but still-valid VML attribute order, say), T19's Kotlin target silently
stops matching what desktop's *current* `xlsx-comments.ts` actually produces, and nothing in
the design calls this out as a risk to watch the way F9c did for mammoth.

Fix: extend the same accepted-risk language F9c already established (§2.2's closing paragraph)
to cover the xlsx-note-reference capture, or add a lightweight check (T18/T19's own tests
already re-run desktop's writer against the fixture workbook per the design — confirm that
re-run also re-diffs against the checked-in reference, so a silent drift fails loudly at test
time rather than only being caught by intuition).

Triage:

### F9 — [minor] Internal inconsistency: §2.3 names assistant tools that don't exist in §5's tool table

Evidence: §2.3 states "The assistant's `ReadComments`/`ReadCommentThread` tools (§5) report
`status: 'detached'` explicitly." §5's actual tool table defines exactly six tools:
`ReadFileComments`, `ReplyToComment`, `ResolveComment`, `ReopenComment`, `AddComment`,
`MoveComment`. There is no `ReadComments` and no `ReadCommentThread` anywhere in the design.
This reads as leftover naming from an earlier draft. Low risk on its own, but a subagent
building T2 or T8 who searches the design for "ReadCommentThread" (as named in §2.3) and finds
nothing in §5 could reasonably wonder whether a tool is missing from the spec rather than just
misnamed.

Fix: correct §2.3's citation to `ReadFileComments` (singular tool, since that's the one that
exists).

Triage:

### F10 — [minor] The anchoring tie-break rule's "position" metric is not concretely defined when combined with the out-of-range fallback

Evidence: §2.2's two fixes (F9a, F9b) are individually clear in isolation — F9a: score every
remaining occurrence when `sel.occurrence` is out of range; F9b: on a scoring tie, prefer "the
candidate whose position is closest to where `sel.occurrence`'s original index would place it
in the CURRENT set of matches." But "position" here is never defined as a concrete metric
(character offset in the document? ordinal rank among current matches?), and the two rules can
interact in a way that makes the phrase ill-posed: if `sel.occurrence` was 3 at creation time
and an edit reduces the current match count to 2 (F9a's own example), "where index 3 would
place it in the current set" has no natural reading — index 3 doesn't exist in a 2-element set,
ordinally or otherwise. A subagent implementing T2 has to invent an interpretation the design
doesn't actually specify for this (fairly likely, since both fallbacks are designed to trigger
on the same kind of edit — text drift) combined case.

Fix: define "position" concretely (recommend: the character offset the ORIGINAL prefix+exact
match would have started at, computed once against the document as it stood at comment-creation
time if that's available, or — simpler and requires no extra stored state — the position in the
CURRENT document that minimizes total edit distance of prefix+suffix, which subsumes both F9a
and F9b under one scoring function rather than two separately-stated rules that can conflict).
Add a test exercising both conditions at once (out-of-range occurrence AND a tie among the
remaining candidates).

Triage:

## Summary

**10 findings: 0 blocker, 4 major, 6 minor.**

Top five:
1. F1 [major] — T9a's cited precedent (`chatsearch.js`) is a single-writer mailbox to an already-running process, not a concurrent-writer mutex; `claude-code-mcp.ts` has zero existing file I/O, so the mkdir-lock port T9a needs is more novel than the design's citation implies.
2. F2 [major] — the ~3s pending-mutation timeout matches no real native-tool precedent (actual timeouts are 120–600s), and chokidar's own default `awaitWriteFinish` latency (2000ms) plus the design's added 300ms debounce alone consumes most of that budget before any docx/xlsx work starts — risking spurious failures on R2/R3/R9's CLI-session path.
3. F3 [major] — no permission/approval gate is specified for the six comment tools even though, for Word/Excel targets, they write directly into the user's real document bytes (not an inert sidecar) — a materially different risk than Edit/Write's existing gated behavior, left undecided rather than addressed.
4. F4 [major] — F12's PTY-safe wire-grammar fix trades an unambiguous JSON encoding for an unescaped positional one: a quoted excerpt containing its own `"` or a path/quote containing a literal `_` can break the new parser, neither case covered by T7's listed tests.
5. F5 [minor] — zero existing precedent in this codebase for the Kotlin XML/zip-write APIs the Android reopen needs; mitigated by `android-ci.yml`'s automatic `assembleReleaseTest` run, but not called out in any task's own pinning tests.
