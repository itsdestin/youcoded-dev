---
date: 2026-09-26
status: active
type: review
---

# Document comments — build design review (round 2)

Reviewing: `docs/active/specs/2026-09-26-doc-comments-build-design.md` (as revised after round 1,
`docs/active/reviews/2026-09-26-doc-comments-design-review-1.md`, and after Destin's reopen-1
answer — full Word/Excel comment support on the phone,
`docs/active/design/2026-09-24-doc-comments/doc-comments.reopen-1.json`/`.answers.json`) against
the signed contract (`doc-comments.contract.json`), the app code at
`/home/destin/youcoded-dev/worktrees/sessions/comments-mock-a/youcoded` (branch
`session/comments-mock-a`), and `CLAUDE.md` / `.claude/rules/feature-flow.md` /
`.claude/rules/performance.md` / `docs/PITFALLS.md` / the MAP-named subsystem rules
(`ipc-bridge.md`, `harness-tools.md`, `android-runtime.md`, `native-runtime.md`).

**Round-1 fixes checked, not just re-read.** All 17 of round 1's findings are marked `accepted`
in the design's changelog; every one was independently re-verified against the design text and,
where the underlying code is unchanged (no app code has been touched by this design — confirmed),
against the real repo. None was found reverted or reopened by name — but two of the SPECIFIC
algorithms the round-1 fix text chose to close a blocker/major finding turn out to have their own,
different gap (F1 and F3 below: F3's own fix and F12's own fix each close the named bug while
opening a different one). This round's method: parallel read-only research passes plus direct
verification in this session (`gh pr view`, `git branch -a`/`git ls-remote`, and direct reads of
`cas-write.ts`, `doc-comments-store.ts`, `permission-engine.ts`, `claude-code-mcp.ts`,
`chatsearch.js`, `remote-shim.ts`, `remote-server.ts`, exceljs's xlsx-comment xforms, chokidar's
installed README defaults, `bash.ts`'s timeout constants, `android-ci.yml`, and Android's
`SessionService.kt`/`app/build.gradle.kts`/`proguard-rules.pro`/full Kotlin source tree). Focus:
whether round-1's fixes are structurally sound (not just present), and the entirely new Android
Kotlin OOXML surface reopen-1 added (§3.2a, §4.3a, T16–T21).

## Findings

### F1 — [blocker] The path-containment fix (review 1, F3) mirrors the WEAKER of its own two cited precedents — a symlink inside the project escapes containment

Evidence: §1.5 specifies `realProject = fs.promises.realpath(projectRoot)`, then
`abs = path.resolve(realProject, path)`, then a `path.relative` escape check — this is exactly
`desktop/src/main/git/git-service.ts`'s `locate()` (realpaths the ROOT only, never the final
joined path). But the design cites a SECOND precedent, `desktop/src/main/artifacts/
write-authorization.ts`'s `judgeRelativeRecord()`, which does something stronger and says why in
its own comment: it realpaths the FULL resolved file path, explicitly because "a link inside the
project root (a `notes.md` → `~/.ssh/config`) would dodge... the traversal guard... if we checked
the unresolved path." `git-service.ts`'s shallower check is fine for its own use (read-only git
status); `write-authorization.ts`'s deeper check exists because ITS callers write bytes to disk —
exactly doc-comments' risk category (`docx-comments.ts`/`xlsx-comments.ts` via `fs`/JSZip follow
symlinks; the plain-text sidecar write does too). The design copies the wrong one of its own two
citations. Consequence: a project containing a symlink at the exact commented path (plantable by a
cloned/untrusted repo, or a prior lower-trust write) passes §1.5's containment check while the
actual read/write follows the symlink to an arbitrary out-of-project target — the precise attack F3
was written to close, reopened by the specific algorithm chosen to close it.

Fix: realpath the FULL joined path, not just the project root — with the same
parent-directory-realpath-then-join fallback `write-authorization.ts` already uses for a
not-yet-existing file (needed for `AddComment` creating a brand-new sidecar). Apply this to every
one of T1/T3/T8/T9a's containment checks, not just T1's.

Triage: accepted — verified directly: `git-service.ts:55-56` realpaths only `projectRoot`, then
joins the unresolved relative path with no further realpath; `write-authorization.ts:108`
realpaths the FULL joined path. §1.5's algorithm is verbatim `git-service.ts`'s shallower shape,
not `write-authorization.ts`'s deeper one. Fixed in §1.5/§1.4 and T1/T3/T8/T9a below.

### F2 — [blocker] The compose-ref rewrite (T7, §6.2) has no wire form for `kind: 'chat'` references — breaks a shipped, contract-covered feature (R15)

Evidence: `compose-ref.ts`'s `ComposeRef` has a live `kind: 'chat'` variant, pathless, keyed by
`entryKey` — confirmed real and in active use: `build-menu.ts:293,423` construct `kind:'chat'`
refs for "Ask about this" on a chat message or an in-chat code block, and
`chat-ref-highlight.ts:29-30` resolves hover/click-to-source purely off `ref.entryKey`. §6.2's
three new wire forms (the quoted-text form, the `comment_` form, the summary-chip form) are ALL
`⦃"<quote>"_<path>...⦄`-shaped — every one requires a `path` and is `kind:'doc'`-only. There is no
fourth form for a pathless chat reference. If T7 replaces `encodeRefMarker`/`splitComposeRefs`
uniformly per §6.2 as written, every existing "Ask about this" reference to a chat message or code
block (a feature that already ships and that R15 covers) either fails to encode or parses back to
plain text — a regression of shipped, contract-relevant functionality, not merely an unaddressed
edge case. Round 1 did not catch this because F11/F12 focused on the draft-token layer and
PTY-safety, not on enumerating every `ComposeRef` variant the new grammar must cover.

Fix: add a fourth grammar form for `kind:'chat'` refs (entryKey-based, no path — e.g.
`⦃chat_<entryKey>_"<quote>"⦄`), add it to T7's scope, and add a pinning test that a chat-message/
code-block "Ask about this" still round-trips and still resolves via `chat-ref-highlight.ts`.

Triage: accepted — verified directly: `compose-ref.ts:24,26` defines `kind: 'doc' | 'chat'` with
`path?` marked "doc kind only"; `build-menu.ts:293,423` construct real `kind:'chat'` refs;
`chat-ref-highlight.ts:29-30` resolves purely by `entryKey`, no path. §6.2's three forms are all
path-requiring. Fixed in §6.2 with a fourth grammar form; added to T7's scope and tests.

### F3 — [major] F4's own canonicalization fix ("realpath, fall through to the raw path on ENOENT") reopens the alias trap specifically on the first-write race it exists to catch

Evidence: `cas-write.ts:170,227` confirms `mutateFileUnderLock`/`casWrite` derive
`lock = target + '.lock'` with no realpath — this part of round 1's F4 diagnosis was correct, and
the design's plan (caller canonicalizes before calling in) is mechanically buildable without
touching `cas-write.ts` itself. But the fix text specifies canonicalizing "the target file's
absolute path (`fs.realpath`, falling through to the raw path on ENOENT for a file that doesn't
exist yet)." The comments sidecar (`.youcoded/comments/<path>.json`) does not exist on the FIRST
comment ever written to a file — the single most common case, and exactly the scenario the
true-concurrency pinning test (F4's own required test) is built to exercise: two writers racing to
create the SAME sidecar for the first time. `fs.promises.realpath` throws `ENOENT` on a
non-existent leaf, so BOTH racing processes fall through to the raw, non-canonical path in exactly
this case — silently reopening the exact alias trap (a symlinked project directory, or an
Electron-vs-CLI-cwd resolution difference) F4 exists to close, for first-writes specifically.

Fix: canonicalize the PROJECT ROOT only (which always exists, since it's an open project) and join
the relative sidecar suffix onto the already-canonical root — never attempt to realpath the
possibly-nonexistent leaf sidecar path itself. This closes the gap for both existing and
about-to-be-created sidecars.

Triage: accepted — verified directly: `cas-write.ts:170,227` derives `lock = target + '.lock'` with
no realpath, confirming round 1's diagnosis; `write-authorization.ts:109-110` actually FAILS CLOSED
on ENOENT (`{ok:false, reason:'missing'}`), it does not fall through to the raw path — so F4's
original fix text contradicts the very precedent it cites, not just risks a logical gap. Fixed in
§1.5/§9.1 by canonicalizing the project root only and joining the relative suffix.

### F4 — [major] §4.3a's "four coordinated pieces" undersells the real xlsx OOXML surface — two relationship entries, a non-`+xml` content type, and an element-ordering constraint, none captured in the design's own framing

Evidence (read directly from `desktop/node_modules/exceljs/lib/xlsx/`): `xlsx.js:573-581` writes
`xl/comments<N>.xml` and `xl/drawings/vmlDrawing<N>.vml` only when a sheet has comments;
`xform/sheet/worksheet-xform.js:145-270` pushes TWO separate relationship entries (a `Comments`-
type and a `VmlDrawing`-type — not one), and `:347-352` deliberately writes the worksheet's
`<legacyDrawing r:id="…">` element only AFTER `extLst` — element order in `sheet<N>.xml` is
schema-load-bearing. `content-types-xform.js:73-83` gives the `.vml` extension a `Default` entry
with content type `application/vnd.openxmlformats-officedocument.vmlDrawing` — **no `+xml` suffix**,
unlike every other XML part in the same file, an easy silent mismatch for a from-scratch Kotlin
writer to introduce by analogy with the other Overrides. The VML root itself also carries three
fixed namespace declarations (`xmlns:v`/`xmlns:o`/`xmlns:x`) plus a mandatory `o:shapelayout`/
`v:shapetype` preamble emitted before any per-comment `v:shape` (`vml-notes-xform.js`). None of
this — the second relationship entry, the missing `+xml` suffix, the `legacyDrawing`-after-`extLst`
ordering, or the VML preamble/namespaces — is named in §4.3a's "four pieces" framing, even though
T19 (already flagged by the design itself as "the single riskiest task in the whole reopen") is
exactly where a from-scratch Kotlin writer would get one of these wrong and produce a file that
opens in Excel (tolerant) but fails Google Sheets, a stricter consumer, or T21's own parity read.

Fix: make T18's spike capture, and T19's Kotlin writer target, explicit about all four of: (a) the
VML preamble/namespaces verbatim, (b) `legacyDrawing`'s required position after `extLst`, (c) the
vml Content-Types `Default` entry's exact (non-`+xml`) content type string, (d) both worksheet-rels
entries in the same relative order exceljs emits them — not just "comments<N>.xml +
vmlDrawing<N>.vml + a relationship + content-types."

Triage: accepted — verified byte-for-byte against `exceljs/lib/xlsx/xlsx.js:572-580`,
`worksheet-xform.js:170-179,345-351`, and `content-types-xform.js:73-76`: two distinct relationship
entries, `legacyDrawing` after `extLst`, and a non-`+xml` vml content type are all real and none
were named in §4.3a. Fixed in §4.3a and T18/T19.

### F5 — [major] T21's cross-platform golden-fixture guard is two independently-scheduled CI jobs compared against static fixture bytes, not a live cross-implementation round trip — and nothing catches the fixture going stale

Evidence: `android-ci.yml` and desktop's CI are separate GitHub Actions workflows, each its own
job; both DO trigger automatically on `pull_request` (confirmed by reading both workflow files —
this is a real, working precedent, not the flip-flopping "Android SDK on a workstation" caveat
`CLAUDE.md` warns about, which is about local dev machines, not CI's fixed image). But a Node
process and a JVM process never run inside the same test, so the "round trip" T21 describes
("desktop writes... Android reads the result... the same in reverse") can only actually happen
through a shared, checked-in fixture file that BOTH sides' independently-scheduled jobs read
against — `shared-fixtures/` today (`artifacts/`, `attention-classifier/`) holds only 41 static
JSON files with exactly this shape (one committed expectation, read by both a jest test and a
gradle test, never a live hand-off between the two processes in one CI run). That structure is
reasonable — it's close to the best achievable across a Node/JVM split without new cross-job
artifact-passing infrastructure — but it means T21 actually proves "both sides independently match
a committed golden file," not "the two live implementations agree with each other right now." If a
future change to desktop's `docx-comments.ts` output shape isn't accompanied by regenerating the
fixture Android's test reads against, desktop's own CI (checking its own fresh output against its
own expectations) can stay green while silently drifting from the checked-in golden bytes — and
nothing forces the fixture to be regenerated as part of an ordinary desktop change, so Android's
still-green test would no longer mean what T21 claims it means.

Fix: not a blocker — this is the best structure achievable across a Node/JVM split — but (1) reword
T21/§9.3's "proves equivalent output" framing to be precise about what's actually checked (both
sides vs. a shared golden fixture, not a live comparison), and (2) add a self-check on the desktop
side that fails loudly if freshly-generated output no longer matches the committed golden fixture,
so fixture staleness is caught before it silently defeats the whole guard's purpose.

Triage: accepted — verified: `android-ci.yml`/desktop's CI workflow are independent jobs, both
triggering on `pull_request`; `shared-fixtures/{artifacts,attention-classifier}/` hold only static
JSON pairs, no live cross-process handoff exists anywhere in the repo today. Fixed in §9.3/T21 with
reworded framing plus a staleness self-check.

### F6 — [major] §1.6's "Android/remote... never gets an unprompted nudge" wrongly extends Android's real watch gap to remote browsers, which already have a working precedent for exactly this

Evidence: `desktop/src/main/remote-server.ts:3768-3796` — `artifacts:watch-project`/
`:unwatch-project` are REAL, chokidar-backed, refcounted implementations that relay file-change
pushes to a WS-connected remote browser today, for the directly analogous "watch a project's files"
feature. Android's `FileObserver` gap is real and specific to Kotlin; remote-server.ts's desktop
process (which already runs chokidar for exactly this purpose) has no such limitation. But §1.6
says "on Android/remote it simply never gets an unprompted nudge when something changes from
elsewhere," conflating the two. If T3's implementer reads this literally, they'll skip building the
remote-server.ts relay that's actually straightforward and directly precedented — a real UX
regression for remote-browser users versus what the Files feature already gives them today (a
comments pane on a remote browser would need a manual re-list to see anything, silently worse than
the adjacent artifacts feature).

Fix: split the claim — Android stays `not-implemented-on-mobile` (real gap, per F10's original
fix); remote-server.ts should get a real `docComments:watch`/`:unwatch` relay mirroring
`artifacts:watch-project`'s pattern, added explicitly to T3's scope.

Triage: accepted — verified: `remote-server.ts:3768-3796`'s `artifacts:watch-project`/
`:unwatch-project` are real, refcounted, chokidar-backed relays to a WS-connected remote browser
today (`project-watcher.ts` imports and calls chokidar directly) — a working precedent §1.6
wrongly implied didn't apply. Fixed in §1.6 and T3's scope.

### F7 — [major] The new wire grammar's positional/quoted syntax has no escaping — both an embedded `"` in a quote and an underscore in a real path or quote can break the parser, a regression from the JSON encoding it replaces

Evidence: today's `encodeRefMarker` (`compose-ref.ts:65-67`) is
`encodeURIComponent(JSON.stringify(ref))` — fully escaped and unambiguous by construction, since
JSON's own escaping handles every character a real quote or path could contain. Round 1's F12
correctly fixed the PTY-whitespace bug (underscores replacing literal spaces in the STRUCTURAL
separators is a sound fix for that specific problem) but the replacement grammar
(`⦃"<exact quote>"_<path>[_L<start>-<end>|_cell_<C>_<S>]⦄`), read literally against §6.2's own
parsing description ("the quote by its `"…"` marks, the path/suffix by fixed position and
recognizable prefixes"), reintroduces two NEW correctness gaps the JSON encoding never had:

1. **A quote containing its own `"` breaks the "ends at the next `"`" parse.** An ordinary excerpt
   like `He said "stop it" and left` encodes as `⦃"He said "stop it" and left"_docs/foo.md⦄` — a
   parser scanning to the next `"` after the opening one reads the quote as `He said ` and has no
   defined behavior for the remainder. Quoted dialogue inside a document is exactly the kind of
   text "Ask about this" exists to reference, not a rare edge case.
2. **A path or quote containing a literal underscore collides with the grammar's own structural
   separator.** Real filenames commonly contain underscores (`2026_09_24_plan.md`,
   `snake_case_notes.txt`) — now structurally overloaded, where the original JSON encoding never
   overloaded any character in a real value.

Neither T7's listed pinning tests (round-trip per ref kind, the "no literal space" snapshot test,
the draft-token test, the PTY end-to-end test) exercises an embedded `"` or a structural-separator
character inside a real value.

Fix: escape the one reserved character each grammar form actually needs (e.g., double or
backslash-escape an interior `"`; require the parser to find the LAST `"` before a recognized
trailing suffix or `⦄` rather than the first one after the opening quote) and add pinning tests for
both an embedded-quote-mark case and an underscore-in-path/quote case.

Triage: accepted — verified: today's `encodeRefMarker` is exactly
`encodeURIComponent(JSON.stringify(ref))`, fully escaped by construction; the proposed replacement
grammar specifies no escape mechanism, so an embedded `"` or a real underscore in a path/quote is a
genuine, structural parse collision, not a hypothetical edge case. Fixed in §6.2 with an escape rule
and both pinning tests added to T7.

### F8 — [major] No permission/approval gate is specified for the six new comment tools, even though for Word/Excel targets they write directly into the user's real document bytes — a materially different risk than the "no new mechanism" reasoning in §5.2 covers

Evidence: `desktop/src/main/harness/tools/types.ts:357` — every `NativeTool<A>` implements
`permissionSubject(args): string | undefined`, feeding `decidePermission()`
(`permission-engine.ts:22-49`, default when nothing matches: `{action:'ask', denyListed:false}` —
"safe default — never silent-allow"). `Edit`/`Write` gate on `a.file_path` (`edit.ts:82`,
`write.ts:70`); `send-user-file.ts:44`'s `permissionSubject: () => undefined` is this codebase's
one existing precedent for a tool that deliberately opts OUT of the approval gate — and it does so
for a tool that sends an already-approved file TO the user, never writing anything. §5's tool table
(`AddComment`, `ReplyToComment`, `ResolveComment`, `ReopenComment`, `MoveComment`) never specifies a
`permissionSubject` for any of the six, and §5.2 argues R5 needs "no new tool and no change to
`permission-engine.ts`" because file edits already go through `Edit`/`Write`'s existing approval —
true for a plain-text comment (§1.1: lives only in the inert `.youcoded/comments/<path>.json`
sidecar), but NOT true for a Word/Excel target: §3.3 step 2 has `AddComment` on a `.docx` "insert[s]
`w:commentRangeStart`/`End` + a `w:commentReference` run into `document.xml`" — a real write into
the document body's own XML — and §4.3a's four-part xlsx wiring touches the worksheet's own
`<legacyDrawing>` relationship. These are direct, autonomous writes to the user's actual document,
by design silence presumably ungated like `send-user-file.ts`, where the same class of action
against a plain-text file (an `Edit` call) requires approval. F5/F17's automatic backup+verify+
rollback mitigates data LOSS, not CONSENT — the user is never asked before the assistant rewrites
part of a live Word/Excel file's internal XML. No contract row requires gating (R2/R3/R6 just ask
for reply/resolve/move to work), so this isn't a contract violation — but it's a real,
currently-silent product/security asymmetry the design should decide on purpose.

Fix: specify `permissionSubject: (a) => a.path` (or the resolved comment's backing file path) for
the mutating tools, and state explicitly whether Word/Excel-targeted comment mutations ride the
same approval tier as Edit/Write (recommended, given they write real file bytes) or a lighter one —
with the tradeoff named so Destin can weigh in if it affects how often he's prompted. If the
decision is "stay ungated everywhere, backup/rollback is enough," say so in §5.2 explicitly rather
than by omission.

Triage: accepted, gap is real and confirmed — verified directly: `NativeTool<A>.permissionSubject`
(`types.ts:357`) is a required (non-optional) field, so T8's implementer would have had to invent a
default with no guidance. `Edit`/`Write` gate on `a.file_path` (`edit.ts:82`, `write.ts:70`) and fall
through `decidePermission`'s "safe default: ask" when nothing else matches (`permission-engine.ts`'s
own comment). `send-user-file.ts:44`'s `permissionSubject: () => undefined` is this codebase's ONE
precedent for opting out, and only for a tool that sends an already-approved file, never writes.
**The specific default is left to Destin, not decided here** (see design §5.2): closing the gap by
gating every comment mutation the same as Edit/Write would add an approval prompt to comment actions
Destin's own reopen-1/contract wording ("reply, resolve, add sparingly... and edit the file
following its existing edit-approval rules") reads as frictionless, distinct from "edit the file."
That reading only holds for the plain-text sidecar (inert app metadata); for a Word/Excel target,
`AddComment`/`MoveComment` etc. write directly into the live document's own XML — functionally an
Edit of that file with no Edit call and no gate. Since either resolution (gate everything the same
as Edit/Write, gate only Word/Excel targets, or leave ungated) changes what he experiences from what
he signed off on, §5.2 states the technical recommendation (gate only when the target is Word/Excel,
since that's the only case that writes real document bytes) but flags it as **needing Destin's
decision**, not silently baked in.

### F9 — [major] The optimistic-UI / async-IPC error path is unspecified: comment-id authority and rollback-to-UI wiring are both missing

Evidence: `desktop/src/renderer/state/doc-comments-store.ts:337-401` — today's `addComment`
returns a synchronously-minted `id: string` and immediately calls `publish({...comments, focusId:
id})`; `resolveComment`/`reopenComment`/`addReply` are `void`, mutate `snap`, and publish
immediately. §7 says `DocCommentsApi`'s interface "does not change" while its internals move to
real IPC, reconciling "optimistically... then reconcile" — but never specifies (a) who mints a new
comment's id once `docComments:add` is a real async IPC round trip (client-generated, passed to
main? or server-generated, meaning `addComment`'s synchronous string-return contract breaks?), or
(b) what happens in the UI when §3.3/§4.3's verify-after-write automatic rollback fires: a
resolve/add is shown optimistically, the underlying docx/xlsx write is then rejected and rolled
back by main, and nothing in `DocCommentsApi`'s void/string-returning synchronous shape has a path
to revert the optimistic UI state or surface `<ErrorState>` (confirmed real:
`components/ui/states.tsx`, `message` + `onRetry: () => void` props) against that SPECIFIC failed
mutation. The component and copy both check out (`error-message-standards.md`'s `mode="recoverable"`
fits the proposed text) — what's missing is the wiring between a main-process rollback and this
renderer-side surface.

Fix: T1/T5 must specify id authority explicitly (recommend: renderer mints
`c-${randomUUID()}` and passes it to `docComments:add`; main never re-mints an id) and an explicit
rollback-to-UI contract (revert the optimistic entry, surface `<ErrorState>` with `onRetry` wired to
replay the same mutation) for every write that can fail after being shown.

Triage: accepted — verified: `doc-comments-store.ts:337-344`'s `addComment` synchronously mints an id
and publishes with no error path; `resolveComment`/`reopenComment`/`addReply` are `void`-returning
and mutate+publish synchronously; `states.tsx`'s `ErrorState` really does take `message`+`onRetry`.
The plumbing exists, only the contract connecting a main-side rollback to it was missing. Fixed in
§1.1/§7/T1/T5 with renderer-minted ids and an explicit rollback-to-UI contract.

### F10 — [major] T10's "promote jszip to a direct dependency" step doesn't address this workspace's hardlinked-`node_modules` worktree hazard

Evidence: `docs/PITFALLS.md` ("Worktrees: sharing a checkout, node_modules, symlinks and
hardlinks") documents a dated, real incident: `node_modules` is provisioned via `cp -al` hardlinks
shared across every worktree's inode table, and a tool that writes an existing dependency file IN
PLACE (not temp-then-rename) silently corrupts every other worktree/checkout sharing that inode —
CLAUDE.md itself: "Do not run `npm ci` ... against shared/linked dependencies." T10 says "Promote
`jszip` [and the chosen XML library] to a direct dependency... before any product code imports it,"
with no mention of how to do this safely under exactly the `cp -al`-hardlinked `node_modules` every
build worktree (including this session's own) actually has. A subagent executing T10 by running a
plain `npm install jszip @xmldom/xmldom` inside its worktree risks the documented failure mode —
corrupting sibling worktrees' `node_modules` silently, with `verify.sh` then reporting failures
that read as the subagent's own bug (per PITFALLS.md's own account of the same failure class).

Fix: T10 must explicitly route the dependency-promotion step through the workspace's documented
safe path (the shared checkout, or a `setup.sh` re-run) rather than a bare `npm install` inside a
linked worktree, citing PITFALLS.md directly.

Triage: accepted — verified: `docs/PITFALLS.md` documents the `cp -al` hardlink-farm hazard and two
real dated incidents (a script and a lockfile written in place, corrupting sibling
worktrees/checkouts) almost verbatim to the review's citation. Fixed in T10 with an explicit
safe-install pointer.

### F11 — [major] §8's "suggested batching" instructs parallel task subagents with no mention of per-task worktree isolation — inviting a documented, dated data-loss hazard

Evidence: `docs/PITFALLS.md` ("Two agents working in ONE worktree silently eat each other's
uncommitted work") documents a real 2026-09-06 incident: a reviewer's mutation battery erased a
builder's saved, type-checked edits with a CLEAN `git status` and no error — "nothing measured
while another agent writes the same files is evidence." `CLAUDE.md` → Working Rules states
directly: "Parallelize independent work when the runtime permits it. Do not assume multiple
write-capable specialists can run concurrently." The design's §8 "Suggested batching" instructs
running groups of task subagents "in parallel" (e.g., "T2, T7, T10, T12, and the desktop half of
T3" together; later "T4, T5, T8, T9a"), with zero mention of whether each parallel task gets its
own worktree or whether they share one. Given this design's own stated purpose is to be "what
subagents actually build from" (design doc intro), silently assuming shared-worktree parallelism
for a dozen-plus tasks touching overlapping subsystems (T3/T4/T5 all touch IPC-adjacent files; T2
is a hard dependency many others read) is exactly the hazard PITFALLS.md dates and CLAUDE.md warns
against, left unaddressed by a design whose entire §8 is about task sequencing. (This review's own
research phase independently reproduced a version of this exact hazard: a research subagent
launched into this same worktree, instructed to be read-only, instead wrote and committed its own
version of this very review file, which had to be reconciled by hand before this document could be
finalized — direct, first-hand evidence of how easily shared-worktree/context assumptions slip.)

Fix: add one sentence to §8 stating each parallel-batch task gets its own worktree (per
`.claude/rules/using-git-worktrees` convention), or if the intended execution model is strictly
sequential-within-one-session despite the "suggested batching" language, say so explicitly so a
build session doesn't read "in parallel" as license for concurrent write-capable subagents sharing
one checkout.

Triage: accepted — verified: `docs/PITFALLS.md` documents the dated 2026-09-06 incident (a
reviewer's mutation battery erased a builder's saved work with a clean `git status`) verbatim to the
review's citation, and CLAUDE.md's "do not assume multiple write-capable specialists can run
concurrently" line is quoted accurately. §8's batching language never said each batch gets its own
worktree. Fixed in §8 with an explicit per-task-worktree sentence.

### F12 — [major] T9a's cited concurrency precedent (`chatsearch.js`) solves an easier problem than T1/T9a actually have — the mkdir-lock port is more novel than the design implies

Evidence: `desktop/src/main/claude-code-mcp.ts`'s embedded `LINK_SERVER_JS` (the plain-node script
Claude Code actually spawns) does pure stdin/stdout JSON-RPC with no `fs` call anywhere inside it —
the file's only `fs` calls run in the main-process deploy function, never in the deployed script
itself, so the dependency-free script T9a extends has never once done file I/O, let alone a lock.
`wecoded-marketplace/youcoded-chatsearch/skills/chatsearch/scripts/chatsearch.js`'s `submitRequest`
does a real atomic tmp-write+rename, but it is a single-writer mailbox to a separate,
already-running, more-authoritative process (the CLI writes one uuid-named request file, then polls
a distinct `done/<id>.ack.json` path the app writes back — never the same file two independent
writers race for), with an explicit non-error "queued, try later" message when the app isn't
running. It contains no mutex/lock at all, because chatsearch's design never has two writers
touching the same file — a categorically easier problem than T1/T9a's actual need: main and the MCP
script both mutating the SAME `.youcoded/comments/<path>.json` and needing to truly exclude each
other (review 1's own F4). Citing `chatsearch.js` as the pattern for "the mkdir-lock-plus-atomic-
rename algorithm" oversells how much of T9a is precedented — the atomic-write half transfers, but
the mutual-exclusion half (what `cas-write.ts`'s Windows-specific `EPERM`/`EACCES`/`EBUSY`
contention handling exists for) has no precedent anywhere in this codebase to copy from.

Fix: reword T9a's row and §9.1 point 2 to state plainly that the lock/mutex half of T9a is novel,
not ported — cite `chatsearch.js` only for the atomic-write mechanics — and budget T9a's review
accordingly (a genuine two-process contention stress test, not just the existing sequential
round-trip, before this is trusted as F4's fix).

Triage: accepted — verified: `LINK_SERVER_JS`'s embedded script body has zero `fs` calls (all `fs`
calls live in the main-process deploy function, never the deployed script); `chatsearch.js`'s
`submitRequest` generates a fresh uuid-named file per call and polls a DIFFERENT ack path — no two
writers ever race the same file, no mutex exists in it at all. Citing it for the lock/mutex half
oversold the precedent. Fixed in T9a/§9.1 with reworded citation scope and a heavier review budget.

### F13 — [major] The ~3s pending-mutation timeout (T9b/T20) matches no real precedent in this codebase and may not survive chokidar's own default latency, risking spurious failures on the assistant-replies-to-a-Word-comment path

Evidence: §9.2/T9b/T20 specify "polls (bounded, ~3s, matching other native tool timeouts)." The
actual native-tool timeout constants in this repo are `bash.ts`'s `DEFAULT_TIMEOUT_MS = 120_000`/
`MAX_TIMEOUT_MS = 600_000` and `registry.ts`'s `SEARCH_TIMEOUT_MS = 180_000` — 120 to 600 seconds,
not 3; there is no existing 3-second timeout anywhere in `harness/tools/` or `claude-code-mcp.ts`
for this design to be "matching." More concretely: the installed chokidar version's own README
documents `awaitWriteFinish.stabilityThreshold` **defaulting to 2000ms** when `awaitWriteFinish` is
enabled at all. §1.5 says the comments watcher uses `awaitWriteFinish` plus its own ~300ms debounce
on top, but never specifies overriding `stabilityThreshold` down from the 2000ms default —
and `git-watcher.ts` (the design's own cited precedent for the 300ms figure) does NOT use
`awaitWriteFinish` at all, so this design combines two delays that have never been stacked together
anywhere in this codebase. 2000+300 = 2300ms of latency before the main-process watcher even fires
the callback that starts JSZip unzip → XML parse → mutate → JSZip re-zip → `fs.writeFile` → (per
F5/F17's own fix) a full re-parse of the just-written bytes to verify before replying — leaving well
under a second for all of that real work, on any docx/xlsx file, not just a large one, with
Android's own ~250ms polling granularity adding further latency on the CLI-on-Android path. If this
bound is hit in ordinary (non-error) operation, T9b/T20's spec says the MCP script "surfaces a
specific failure, never hangs" — meaning a successful comment reply on a Word/Excel file, reached
through a Claude Code CLI session, could routinely report failure to the model even though nothing
is actually wrong, threatening R2/R3/R9 specifically for the CLI-session route this design's whole
§9 architecture exists to serve.

Fix: (1) correct the "matching other native tool timeouts" citation — there is no such precedent —
and (2) either explicitly set a smaller `awaitWriteFinish.stabilityThreshold`/`pollInterval` for the
comments watcher specifically (documenting why that's safe here) or budget the real number from a
benchmark against a representative fixture (a multi-MB `.docx` with images) before freezing the
timeout into a task's pinning-test spec. A timeout tuned to fail routine successful operations is
worse than a longer one that fails only genuine hangs.

Triage: accepted — verified: `bash.ts`'s `DEFAULT_TIMEOUT_MS = 120_000`/`MAX_TIMEOUT_MS = 600_000`,
`registry.ts`'s `SEARCH_TIMEOUT_MS = 180_000` — no 3-second precedent anywhere; chokidar's own
default `awaitWriteFinish.stabilityThreshold` is 2000ms; `git-watcher.ts`'s cited 300ms
`DEBOUNCE_MS` never combines with `awaitWriteFinish` in that file, confirming this design stacks two
delays never before combined. Fixed in §1.5/§9.2/T9b/T20 with a corrected citation and a widened,
explicitly-set timeout.

### F14 — [minor] The anchoring tie-break rule's "position" metric is undefined, and becomes ill-posed when combined with the out-of-range fallback

Evidence: §2.2's two fixes (F9a, F9b) are each clear in isolation — F9a: score every remaining
occurrence when `sel.occurrence` is out of range; F9b: on a scoring tie, prefer "the candidate
whose position is closest to where `sel.occurrence`'s original index would place it in the CURRENT
set of matches." But "position" is never defined as a concrete metric (character offset in the
document? ordinal rank among current matches?), and the two rules can interact in a way that makes
the phrase ill-posed: if `sel.occurrence` was 3 at creation time and an edit reduces the current
match count to 2 (F9a's own example), "where index 3 would place it in the current set" has no
natural reading — index 3 doesn't exist in a 2-element set, ordinally or otherwise. A subagent
implementing T2 has to invent an interpretation for this combined case, which is fairly likely to
occur since both fallbacks are designed to trigger on the same kind of edit (text drift).

Fix: define "position" concretely — recommend the character offset the ORIGINAL prefix+exact match
would occupy in the current text (or, simpler and requiring no extra stored state, the position
that minimizes total edit distance of prefix+suffix, subsuming both F9a and F9b under one scoring
function rather than two separately-stated rules that can conflict). Add a test exercising both
conditions at once (out-of-range occurrence AND a tie among the remaining candidates).

Triage: accepted — confirmed by re-reading §2.2: "position" is used only in prose with no concrete
metric, and the interaction is genuinely ill-posed (occurrence=3 at creation, 2 matches remain post-edit
has no natural reading). Fixed in §2.2/T2 with one scoring function (edit-distance-minimizing offset)
subsuming both fallbacks, plus the combined test case.

### F15 — [minor] Zero existing precedent anywhere in this Kotlin codebase for `javax.xml.parsers`/`org.w3c.dom`/`TransformerFactory`/`ZipOutputStream` — mitigated by CI's existing release-R8 build, but not named in any task's own tests

Evidence: no file under `app/src/main/kotlin/` uses `javax.xml`/`org.w3c.dom`/`DocumentBuilder`/
`TransformerFactory`; the only existing zip usage (`Bootstrap.kt`) is read-only `ZipInputStream`
extraction of a bundled Termux asset, never `ZipOutputStream` or a load-whole-archive-then-rewrite
pattern. §3.2a's "already part of every Android device, no new Gradle dependency required" is true
for availability; the further claim that this needs no new R8/proguard surface is asserted, not
demonstrated by any existing code path in this repo. This is meaningfully mitigated, not ignored:
`android-ci.yml` already runs `./gradlew assembleReleaseTest` (R8-minified, debug-signed)
automatically on every push/PR, so `DocxComments.kt`/`XlsxComments.kt` would go through the same R8
pass the moment they exist, with no bespoke task step needed — but no task's own pinning-test column
(T16–T19) names this explicitly, so a reviewer reading only the task table could believe R8 is
unaddressed for this feature specifically when it actually rides on the app-wide CI job for free.

Fix: add one line to T17/T19's pinning-test column noting the release-R8 build is exercised by the
existing `android-ci.yml` job (not a new check to build), so the coverage is visible from the task
table alone.

Triage: accepted — verified: no file under `app/src/main/kotlin/` uses `javax.xml`/`org.w3c.dom`/
`DocumentBuilder`/`TransformerFactory`; `Bootstrap.kt`'s only zip usage is read-only
`ZipInputStream` extraction; `android-ci.yml` does run `./gradlew assembleReleaseTest` (R8-minified)
on every push/PR. Fixed with a one-line pinning-test-column note on T17/T19.

### F16 — [minor] No memory/size guard for Android's load-whole-archive-into-memory approach, where phone heap limits are materially tighter than desktop Electron's

Evidence: §3.2a explicitly models Kotlin's approach on JSZip's "load the full archive into memory,
mutate the in-memory representation, and write the whole thing back out" — reasonable on desktop
Electron, which has no comparable per-process heap ceiling to a phone app sandbox's. Nothing in
§3.2a/§4.3a/T16–T19 mentions a size guard, a streaming fallback, or even an acknowledgment that
fully unzipping + DOM-parsing + re-zipping a multi-MB `.docx` with embedded images in Kotlin on a
phone is a materially different memory profile than the same operation in an Electron main process.

Fix: not a blocker for typical Word/Excel files (most are small), but worth a documented, watched
limit (e.g., "detect files over N MB and route to a specific, honest `<ErrorState>` rather than an
OOM crash") the same way F9c documented the mammoth-version risk as accepted-but-watched rather than
silently absent.

Triage: accepted — confirmed by re-reading §3.2a/§4.3a: no size guard, streaming fallback, or
heap-ceiling acknowledgment appears anywhere; the omission is real, not merely under-emphasized.
Fixed in §3.2a/§4.3a with a documented, watched file-size limit and a specific `<ErrorState>` for
files over it.

### F17 — [minor] The xlsx-note-reference capture (T18) carries the same dependency-version-drift risk review 1's F9c accepted for mammoth, without the same explicit "documented, watched risk" treatment

Evidence: F9c (round 1, accepted) explicitly records that mammoth's docx→HTML output isn't
guaranteed byte-stable across a version bump, and accepts that as a documented, watched risk rather
than building a disproportionate test now. §4.3a's T18 spike captures a point-in-time snapshot of
exceljs's OOXML output as `shared-fixtures/doc-comments/xlsx-note-reference/`; T19's Kotlin writer
then targets that snapshot's exact shape. If `exceljs` is later bumped and its output shape changes
even slightly (a different but still-valid attribute order), T19's Kotlin target silently stops
matching what desktop's CURRENT `xlsx-comments.ts` actually produces, and nothing in the design
calls this out as a risk to watch the way F9c did for mammoth.

Fix: extend the same accepted-risk language F9c already established to cover the xlsx-note-reference
capture, or confirm T18/T19's own re-run of desktop's writer against the fixture workbook also
re-diffs against the checked-in reference, so drift fails loudly at test time rather than only being
caught by intuition.

Triage: accepted — confirmed by re-reading §2.2 (F9c's "documented, watched risk" framing) against
§4.3a's T18 spike description, which carries no equivalent risk language at all despite an identical
risk shape (a captured library output snapshot a later dependency bump can silently invalidate).
Fixed in §4.3a with F9c-equivalent risk language plus a re-diff-on-drift self-check.

### F18 — [minor] Internal inconsistency: §2.3 names assistant tools that don't exist in §5's tool table

Evidence: §2.3 states "The assistant's `ReadComments`/`ReadCommentThread` tools (§5) report
`status: 'detached'` explicitly." §5's actual tool table defines exactly six tools:
`ReadFileComments`, `ReplyToComment`, `ResolveComment`, `ReopenComment`, `AddComment`,
`MoveComment`. There is no `ReadComments` and no `ReadCommentThread` anywhere in the design — this
reads as leftover naming from an earlier draft. Low risk on its own, but a subagent building T2 or
T8 who searches the design for "ReadCommentThread" as named in §2.3 and finds nothing in §5 could
reasonably wonder whether a tool is missing from the spec rather than just misnamed.

Fix: correct §2.3's citation to `ReadFileComments` (the one tool that actually exists).

Triage: accepted — confirmed by grep: §2.3 names `ReadComments`/`ReadCommentThread`, §5's table
defines only six tools, neither of those names among them. Fixed in §2.3 with the correct citation.

### F19 — [minor] T15 ("close PR #263... delete the three rejected mock branches/worktrees") appears to already be fully done, and the task table doesn't reflect it

Evidence: `gh pr view 263 --repo itsdestin/youcoded` → `state: CLOSED` (R11 satisfied). `git branch
-a` and `git ls-remote --heads origin` in the actual worktree show `comments-mock-a-v1`,
`comments-mock-b`, and `comments-mock-c` no longer exist locally or on the app repo's remote; no
`worktrees/sessions/comments-mock-{b,c}` directories remain either. This matches the handoff doc's
own "Q-2: practice branches ... deleted (local + GitHub)" note from the 2026-09-26 review deck —
this cleanup already happened during the review process, before this build design was even
finalized. The design's task table still lists T15 as outstanding build work.

Fix: mark T15 done/no-op in the task table rather than leaving it as a pending deliverable — minor,
but worth correcting before a build session spends a turn re-verifying or re-doing already-finished
cleanup.

Triage: already handled — verified: `gh pr view 263` → CLOSED; `git branch -a`/`git ls-remote
--heads origin` show no `comments-mock-a-v1`/`comments-mock-b`/`comments-mock-c` locally or
remotely; no leftover `worktrees/sessions/comments-mock-{b,c}` directories. R11/R21 are both already
satisfied. T15 marked done/no-op in the task table.

### F20 — [minor] The pending-mutation queue's `.pending/` subdirectory isn't specified to be excluded from `docComments:changed` chokidar broadcasts

Evidence: §9.2 places the MCP pending-mutation queue's request/result files at
`.youcoded/comments/.pending/<uuid>.json` — inside the SAME directory tree §1.5's chokidar watcher
already watches for `docComments:changed`. Neither section states whether the watcher excludes
`.pending/` from triggering a broadcast. If it doesn't, every pending-mutation request/result
create-then-delete cycle (normal operation for T9b/T20) fires a `docComments:changed` push to every
open comments pane on that project, which then re-`list()`s for no actual comment change — the kind
of per-event chattiness `performance.md` rule 4 ("coalesce... per-event work does not grow") flags,
though at the low volume of one assistant mutation at a time this is latent rather than a proven
regression.

Fix: have the chokidar watcher ignore the `.pending/` subdirectory explicitly (chokidar's own
`ignored` option), or state why it's unnecessary if the existing debounce already coalesces it to a
no-op.

Triage: accepted — confirmed by re-reading §1.5/§9.2: the watcher covers `.youcoded/comments/` with
no exclusions named, and `.pending/<uuid>.json` sits inside that same tree. Fixed in §1.5 with an
explicit chokidar `ignored` pattern for `.pending/`.

### F21 — [minor] Confirmed correct, no action needed (recorded so a later round doesn't re-spend research budget)

`DocxView.tsx`'s mammoth non-caching (F9c's basis) is real; `sync-spaces/guards.ts`'s
`DEFAULT_IGNORES` and `project-manager.ts`'s gitignore write both correctly cover the new
`.youcoded/comments/` subtree (no accidental-commit risk); `pages-service.ts`'s chokidar dependency
and `git-watcher.ts`'s 300ms `DEBOUNCE_MS` precedents are genuine (only the exact file path differs
slightly from the design's bare citation, same class as round 1's F14, not re-filed);
`remote-shim.ts`'s `REJECT_ON_NOT_OK`/`responseOutcome` mechanism works exactly as the design's F10
fix assumes; `<ErrorState>` (`components/ui/states.tsx`) really does take `message`+`onRetry` and
fits the design's proposed copy once wired (see F9); Android's `SessionService.kt` already runs as a
foreground service with a `PARTIAL_WAKE_LOCK` held during a session, so T20's ~250ms poll loop is
architecturally safe from Doze/background throttling (a citable precedent the design doesn't
currently name, but not a defect).

Triage: already handled — spot-checked 4 of the bucket's sub-claims directly (`guards.ts:36`'s
`DEFAULT_IGNORES` includes `.youcoded/`; `git-watcher.ts:16`'s `DEBOUNCE_MS = 300`; `SessionService.kt:724`'s
`PARTIAL_WAKE_LOCK`; `remote-server.ts`'s real chokidar-backed watch) — all confirmed real, no false
claims found. No design change needed.

## Summary

**21 findings: 2 blocker, 11 major, 8 minor.**

**Triage: 18 accepted, 2 already handled (F19, F21), 1 accepted-but-needs-Destin's-decision on the
specific default (F8 — a permission-gate default for the six new comment tools; see design §5.2 for
the options and tradeoffs).** Every finding was independently re-verified against the real code in
this session (not re-read from the review's own prose) before being triaged; evidence is inline with
each finding above. All 19 non-F8 accepted findings are fixed in the revised design below.

Top five:
1. F1 [blocker] — the path-containment fix (round 1's F3) mirrors `git-service.ts`'s shallower
   check instead of `write-authorization.ts`'s deeper one; a symlink planted inside a project
   escapes containment because only the project root is realpathed, not the final resolved path.
2. F2 [blocker] — the new compose-ref wire grammar has no form for `kind:'chat'` references
   (pathless, entryKey-based); every live "Ask about this" on a chat message or code block breaks
   if T7 ships the grammar as currently specified — a regression of a shipped, R15-covered feature.
3. F3 [major] — F4's own canonicalization fix ("realpath, fall through to raw on ENOENT") reopens
   the alias trap on exactly the first-write race its pinning test is built to catch, since the
   sidecar file doesn't exist yet on a file's first comment.
4. F8 [major] — the six new comment-mutating native tools have no specified `permissionSubject`;
   `AddComment`/`MoveComment` can silently write into a user's live Word/Excel file bypassing
   whatever approval tier governs ordinary file edits, since they never call `Edit`/`Write`.
5. F13 [major] — the ~3s pending-mutation timeout matches no real precedent (actual native-tool
   timeouts are 120–600s) and chokidar's own default `awaitWriteFinish` latency (2000ms) alone
   consumes most of that budget before any docx/xlsx work starts — risking spurious failures on
   the assistant-replies-to-a-Word-comment path specifically for Claude Code CLI sessions.
