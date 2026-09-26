---
date: 2026-09-26
status: active
type: review
---

# Document comments — build design review (round 1)

Reviewing: `docs/active/specs/2026-09-26-doc-comments-build-design.md` against
`docs/active/design/2026-09-24-doc-comments/doc-comments.contract.json` (signed,
`doc-comments.contract.answers.json` → `C: yes`), the app code at
`/home/destin/youcoded-dev/worktrees/sessions/comments-mock-a/youcoded` (branch
`session/comments-mock-a`), and `CLAUDE.md` / `.claude/rules/feature-flow.md` /
`.claude/rules/performance.md` / `docs/PITFALLS.md` / `docs/MAP.md`'s named subsystem rules
(`ipc-bridge.md`, `harness-tools.md`, `native-runtime.md`, `android-runtime.md`).

Method: five parallel read-only research passes verified every load-bearing citation in the
design against the real code (not the design's own paraphrase), plus a direct check of
`node --version` / `DOMParser` availability in this repo's Electron/Node setup. Every
citation checked came back TRUE or PARTIAL except two (F1/F2's root cause, and F10's Android
response-shape citation) — noted below. No app code or the design doc was edited.

**Encouraging finding first:** every "UI-already-done" row in the design's §0 coverage table
(R7, R12, R13, R14, R16, R18, R19, R20) was spot-checked against the actual component files
and is genuinely real, including the most load-bearing one — R20's citation of commit
`488df318c` (`git log --all --oneline | grep 488df318` confirms it exists, and
`youcoded:ask-in-new-session` really is dispatched by `FilesTab.tsx` and consumed by
`App.tsx` into `PageCreateDialog.tsx` exactly as described). No contract row was found to be
falsely marked done.

## Findings

### F1 — [blocker] Word/Excel comment-mutation code is specified for the renderer, but must run from main — and Node has no DOMParser

Evidence: `docs/active/specs/2026-09-26-doc-comments-build-design.md` §3.2 ("New module
`desktop/src/renderer/components/artifact-views/docx-comments.ts`, run in the **renderer**
(not main)... Parsing uses the browser's native `DOMParser`/`XMLSerializer`") directly
contradicts §9 ("For `.docx`/`.xlsx` writes specifically, only implementation #1 [**the TS
main process**, `desktop/src/main/doc-comments/doc-comments-store.ts`] has
JSZip/mammoth/exceljs available"). Confirmed by running `node -e "console.log(typeof
DOMParser)"` against this repo's own Node (v26.4.0, matching `youcoded/desktop/package.json`'s
`"electron": "^41.10.7"`): prints `undefined`. Electron's main process is a plain Node
runtime — it has no DOM.

This isn't a hypothetical edge case — it blocks three real call paths the design itself
specifies:
- **T8** (native harness tools `ReplyToComment`/`ResolveComment`/`MoveComment`/etc.) run
  in-process in `desktop/src/main/harness/tools/` (§5) and, for a Word/Excel-backed comment,
  must dispatch into `docx-comments.ts` via `doc-comments-store.ts` (§5: "which write path it
  dispatches to is an implementation detail of `doc-comments-store.ts`") — but that store
  lives in main (§1.5) and cannot call renderer-only DOMParser code.
- **T9**'s MCP pending-mutation queue (§9): "the main-process watcher... applies the mutation
  using its real JSZip/mammoth/exceljs-capable code" — same problem, same file.
- **Any UI-driven edit**: a user resolving a Word comment from the comments pane sends
  `docComments:resolve` over IPC, handled in `ipc-handlers.ts` (main process) — same problem.

Fix: pick one architecture and make every section agree with it. Recommended: move
`docx-comments.ts`'s parse/mutate logic into `desktop/src/main/doc-comments/` and swap
`DOMParser`/`XMLSerializer` for a small Node-compatible XML library (e.g.
`@xmldom/xmldom` or `fast-xml-parser`) as a new direct dependency — main already has raw
`fs` access, so this also resolves F2 for free (no renderer round-trip needed at all).
Android's WebView-side reasoning in §3.2 ("Android's WebView runs the same bundle... needs no
Kotlin port") would then need re-examination too: if the desktop write path moves to main, an
analogous Kotlin (`java.io.File` + a JVM XML parser, already available) or Android's own
main-thread equivalent should mirror it, not the WebView.

Triage: accepted — confirmed independently (`node -e "typeof DOMParser"` → `undefined` in this repo's
Node 26.4.0; no DOMParser/jsdom/xmldom import anywhere under `desktop/src/main/**`); design now moves
docx/xlsx comment parse+mutate into main (§3.2, §3.3, §4).

### F2 — [blocker] No IPC channel exists (or is proposed) to write mutated docx/xlsx bytes back to disk

Evidence: `desktop/src/main/artifacts/ipc-channels.ts` defines only `READ_BINARY` (base64
out, read-only) and `SAVE` (`ipc-handlers.ts` ~line 5025-5095, `fs.promises.writeFile(tmpPath,
newContent, 'utf8')` — **UTF-8 text only**, unsuitable for raw zip/docx/xlsx bytes without a
binary-safe redesign). The design's §1.6 IPC table lists only `docComments:*` JSON-payload
channels; §3.3/§4.3's "backup before write" and "verify after write" steps are filesystem
operations that, under §3.2's own placement (renderer, sandboxed, `contextIsolation: true` in
`desktop/src/main/main.ts`), the renderer cannot perform directly — every existing binary flow
in this app (`artifacts:read-binary`) goes through IPC precisely because the renderer has no
raw fs access. Android's WebView has even less (Kotlin's `SessionService.kt` has no
binary-write handler for this either; T3/T4 only add JSON-sidecar parity).

This is the same root cause as F1 (where does docx/xlsx OOXML logic actually execute), but
is a distinct, separately-actionable gap: even if F1 is fixed by moving the logic to main
(closing the need for a bytes-back-and-forth channel entirely), someone still has to notice
this was never specified in §1.6/T10-T13 and add it as an explicit task deliverable if F1 is
instead fixed by keeping the parse/write logic in the renderer.

Fix: resolve alongside F1. If the fix is "move to main" (recommended), no new binary IPC
channel is needed — main already has `fs`. If the design instead keeps docx/xlsx logic in the
renderer, add a new `artifacts:write-binary`-style channel (base64 in, all five surfaces) as
an explicit new task before T10-T13 can be implemented as currently written.

Triage: accepted — confirmed `desktop/src/main/artifacts/ipc-channels.ts` defines only `READ_BINARY`
(no `WRITE_BINARY`/`write-binary` counterpart) and `ipc-handlers.ts:5091`'s SAVE handler is
`fs.promises.writeFile(tmpPath, newContent, 'utf8')`, text-only; resolved together with F1 by moving
docx/xlsx logic to main (no new binary channel needed, §3.2/§3.3/§4).

### F3 — [blocker] No path-containment check specified for the comments sidecar path — path traversal / arbitrary-file-write risk

Evidence: `docs/active/specs/2026-09-26-doc-comments-build-design.md` §1.3 derives the
sidecar path by directly templating a caller-supplied `path` into
`<project root>/.youcoded/comments/<relative/path/to/file.md>.json`. §1.5 ("Main-process
service: reads, writes, watching") never mentions validating that `path` is actually inside
`projectRoot` before deriving this location. The `path` value in this design is reachable
from three untrusted-ish surfaces: the renderer IPC payload (`docComments:add/list/...`
`{path, projectRoot?}`), a native tool call's arguments (`AddComment {path, ...}`), and the
MCP script's tool arguments — the last two are **model-controlled input**, and
`.claude/rules/harness-tools.md` is explicit that "the file-tool guards (secret paths, cwd
jail) are honest friction, NOT a sandbox" for exactly this reason: a new tool surface must
implement its own containment check, it doesn't inherit one implicitly. Existing analogous
code in this repo is careful about exactly this: `desktop/src/main/artifacts/write-authorization.ts`'s
`judgeRelativeRecord(projectRoot, recordedPath, allowedRoots, home)` and
`desktop/src/main/git/git-service.ts`'s `locate()` both resolve/canonicalize and reject an
escaping path before trusting it — the design's own §1.4 cites these two functions only to
explain why there's no "walk up to find a project" helper, never as something the comments
store should reuse for path safety.

A `path` containing `../../` (or an absolute path outside the project, depending on how the
join is implemented) could write a JSON sidecar file outside `.youcoded/comments/` entirely —
in the worst case, outside the project root altogether, since nothing in §1.5 stops it.

Fix: T1 must resolve+canonicalize `path` against `projectRoot` and refuse (not silently
clamp) anything that escapes it, reusing or mirroring `write-authorization.ts`'s
`judgeRelativeRecord()` logic. Add a pinning test with `../../etc/passwd`-shaped and absolute
`path` inputs for every one of the six new IPC channels and six new tools.

Triage: accepted — confirmed `write-authorization.ts`'s `judgeRelativeRecord` (realpath + deny-check +
root-prefix test) and `git-service.ts`'s `locate()` (realpath + `path.relative` escape check) are the
existing containment precedents, and confirmed §1.5 as written has no equivalent check; T1 now
specifies and requires one (§1.5).

### F4 — [major] Cross-process lock-path agreement between TS main and the MCP script is untested for actual concurrency, and main's own lock key isn't canonicalized

Evidence: `desktop/src/main/artifacts/cas-write.ts`'s `acquireLock` (mkdir-based lock,
~line 64-96) derives the lock path deterministically from the target's absolute path
(`target + '.lock'`) but does **not** canonicalize it first (no `realpath`/symlink
resolution) — confirmed by reading the function. The design's §9 requires the MCP script (a
separate, dependency-free Node process — confirmed real and load-bearing via
`desktop/src/main/claude-code-mcp.ts`'s own comment: "this file is executed by a PLAIN node
process... zero dependencies is the only shape that works in both places") to
**independently reimplement the identical algorithm** so the two lock schemes actually
exclude each other. If either process resolves the target's absolute path differently (a
symlinked project directory, case differences, a relative-vs-absolute mismatch between how
Electron resolves `projectRoot` and how a Claude Code CLI session's cwd is set), the two
locks silently stop excluding each other — a torn or lost write on the exact JSON file this
feature depends on for "nothing is silently lost" (R6). `git-service.ts`'s `locate()` already
documents this exact alias trap for a different subsystem (macOS `/var` vs `/private/var`,
Windows 8.3 names), so it's a known class of bug here, not a hypothetical.

T9's only planned pinning test for this is a **sequential** round-trip ("native tool writes →
MCP script reads the same file, and back") — this verifies data-format compatibility, not
that the two lock implementations actually block a concurrent write from the other side.

Fix: (1) specify that both implementations canonicalize the target path identically before
deriving the lock path (document the exact canonicalization function to copy). (2) Add a true
concurrency test: start both writers racing against the same file simultaneously, assert no
write is lost (not just that both eventually succeed sequentially).

Triage: accepted — confirmed `cas-write.ts:170`/`:227` derive the lock path as `target + '.lock'` with no
`realpath` first (both `mutateFileUnderLock` and `casWrite`); T1/T9 now require identical
canonicalization and a true-concurrency pinning test (§1.5, §9).

### F5 — [major] "Verify after write" failure doesn't specify automatic rollback — a failed write may leave a corrupted live file

Evidence: §3.3 step 5 states "if the re-parse doesn't find the comment that was just
added/changed, the write is treated as failed and the backup is what the user is left with,
never a silently corrupted file." As worded this only guarantees the failure isn't *silent*
(an error surfaces) — it does not say the app automatically restores the pre-write bytes over
the now-possibly-corrupted target file. If the corrupted bytes remain the live `.docx`/`.xlsx`
on disk and only a separate `.bak` file exists alongside it, the user's actual working
document stays broken until someone notices the error and manually restores from the backup —
a real data-loss risk for a feature whose whole premise (R6, R9, R10) is that comments and
the underlying document survive assistant/user edits intact.

Fix: make the rollback explicit and automatic — on verify failure, rename the backup back
over the target path before surfacing the error, so the document a user has open is always
either the successfully-mutated version or the original, never a half-written one. Surface a
specific, honest `<ErrorState>` per `docs/error-message-standards.md` ("the write didn't take
— your file wasn't changed" + Retry), not a generic failure.

Triage: accepted — §3.3/§4.3 as written only promised a surfaced error, not a restored file; design now
makes the backup-restore automatic on verify failure, with a specific `<ErrorState>` (§3.3, §4.3).

### F6 — [major] Word comment/paraId uniqueness on ADD is unspecified

Evidence: §3.3 step 2 ("append a new `<w:comment>` to `comments.xml`... insert
`w:commentRangeStart`/`End` + a `w:commentReference` run") never states how the new
`w:id`/`w15:paraId` is chosen. It must be unique against every id already in the file,
including gaps from previously-deleted comments or non-sequential ids Word itself may have
assigned — a naive "next sequential int" scheme can collide with an existing id Word left
behind. T11's pinning test list ("round-trip add/reply/resolve against the fixture; backup
file created; corrupted-write path leaves the backup, not a broken file") has no case for a
fixture with non-sequential/gapped existing ids.

Fix: specify "next id = max existing `w:id` + 1" (scanned from the current `comments.xml`,
not assumed monotonic from creation order) and generate `w15:paraId` the way Word itself
does (an 8-hex-digit value, not sequential); add a fixture with gapped/non-sequential ids to
T11's test list.

Triage: accepted — §3.3 step 2 as written was genuinely silent on id uniqueness; design now specifies
max-existing-id+1 plus a Word-shaped `w15:paraId`, and a gapped-id fixture (§3.3, T11).

### F7 — [major] Excel "resolved" marker is ambiguous and has no specified reopen path

Evidence: §4.1 tracks resolve state for legacy Notes (which have no native resolved flag) by
appending a literal trailing "— resolved" marker into the visible note body text. Two gaps:
(1) `ReopenComment` on an Excel-backed comment must strip this exact marker back out of the
note body — not specified anywhere in §4.1/§4.3/T13's task description or pinning tests
("round-trip; multi-reply formatting; backup+verify" — no reopen-strips-marker case). (2) A
legitimate reply or comment whose real text happens to end in the same string is
indistinguishable from an assistant/user resolve action on the next read — a false positive
that would show as "resolved" until the ambiguity is fixed at read time.

Fix: use a marker a legitimate reply could not plausibly produce by accident (e.g. a fixed
non-natural-language token, or a hidden line prefixed with an invisible character), and add
explicit round-trip tests for reopen (marker removed) and for a reply body that happens to
contain resolve-like text.

Triage: accepted — no reopen-strip or false-positive test existed; design now uses a PTY/prose-safe,
non-natural-language marker and specifies reopen-strip + collision-avoidance tests (§4.1, T13).

### F8 — [major] T9 bundles at least three independently risky pieces into "one subagent"

Evidence: the design's own task table (§8) states tasks are "sized for one subagent each,"
yet T9 combines: (a) six new MCP tool JSON-RPC definitions, (b) a from-scratch dependency-free
reimplementation of the mkdir-lock-plus-atomic-rename algorithm for the plain-file path
(non-trivial to port correctly — `cas-write.ts` has Windows-specific contention-code handling,
`EPERM`/`EACCES`/`EBUSY` treated as lock contention, that a "simplified" port could easily
drop), (c) an entirely new cross-process pending-mutation queue + polling protocol
specifically for docx/xlsx (blocked on F1/F2 being resolved first), and (d) Android
byte-identical asset parity + its own parity test. The design itself flags T9 as "the
highest-risk task in the whole list," which is itself a signal it should be decomposed for
reviewability, not assigned whole to one subagent.

(Note: research for this review found real prior art reducing (a)/(b)'s risk —
`wecoded-marketplace/youcoded-chatsearch/skills/chatsearch/scripts/chatsearch.js` is a
shipped, zero-dependency Node script that already does atomic tmp-write+rename and a bounded
async outbox/receipt polling loop, and `app/.../runtime/ClaudeCodeMcp.kt` already deploys a
zero-dependency MCP script under Termux on Android for `SendUserLink` today. This lowers the
*novelty* risk of (a)/(b)/(d) considerably — the design should cite these as precedent rather
than treating the pattern as unproven — but doesn't change that T9 as scoped is multiple
independent, separately-testable deliverables.)

Fix: split into e.g. T9a (six MCP tool definitions + dependency-free plain-file store,
explicitly citing `chatsearch.js`/`outbox-drain.ts` as the pattern to copy), T9b (the
docx/xlsx pending-mutation queue, blocked on F1/F2), T9c (Android byte-parity + Kotlin
wiring, citing `ClaudeCodeMcp.kt`/`PtyBridge.kt` as precedent).

Triage: accepted — confirmed the precedents are real (`chatsearch.js:812-822` atomic tmp-write+rename +
bounded poll loop, `ClaudeCodeMcp.kt`/`claude-code-mcp.ts` zero-dependency deploy pattern) and that T9
as written bundles independently-testable pieces; split into T9a/T9b/T9c (§8).

### F9 — [major] §2.2's anchoring algorithm has two unspecified-fallback correctness gaps and one unverified stability assumption

Evidence (independently reasoned against the algorithm as written, since no prior art for
scored multi-candidate text-quote re-anchoring exists anywhere in this codebase — confirmed
by search):

(a) **Occurrence-index out of range.** If `sel.occurrence` was 3 (the quote's 4th match at
creation time) and an edit reduces the number of matches of `sel.exact` to 2, "follow moved
text" has no defined behavior — clamping to the last match, returning `'detached'`, or
picking index 0 are all plausible and produce different, differently-wrong outcomes, and
§2.2 doesn't say which.

(b) **No tie-break rule.** When two or more candidate occurrences score equally on
prefix/suffix match (e.g. the same edit touched text near two occurrences identically), the
algorithm has no stated deterministic tie-break — behavior would depend on incidental
implementation details (array order) rather than a specified rule.

(c) **Mammoth-rendering stability is assumed, not verified.** `DocxView.tsx` re-runs
`mammoth.convertToHtml` fresh on every mount (no cached/pinned HTML tied to a specific
mammoth version); mammoth's docx→HTML conversion is a heuristic mapping not guaranteed
byte-stable across mammoth version bumps or across Word's own re-serialization of paragraph/run
boundaries on save. Since `resolveSelector` and prefix/suffix capture both operate on the
*rendered DOM text* (post-mammoth), a paragraph split/merge that changes nothing visible to a
human can shift where a whitespace-like boundary falls in a way "whitespace-collapsed
compare" doesn't fully absorb — a genuinely-unedited comment could spuriously show as
detached, or resolve to the wrong occurrence, purely from a mammoth version bump.

Fix: (a) specify a defined fallback (recommend: prefer the closest-scoring candidate rather
than a fixed index; only return `'detached'` when literally zero occurrences remain). (b)
specify a deterministic tie-break (e.g. prefer the candidate closest to the position implied
by the original `occurrence` index). (c) add a pinning-test fixture that re-parses the same
`.docx` content through two different states of mammoth's paragraph segmentation (or at
minimum, document explicitly that prefix/suffix are captured post-mammoth-render so a future
mammoth bump is a known, watched risk — add it to `docs/PITFALLS.md` or a dependency-watch
doc if not already tracked elsewhere).

Triage: accepted — confirmed `DocxView.tsx:40-44` re-runs `mammoth.convertToHtml` on every mount with no
version-pinned cache; §2.2 now specifies the closest-scoring fallback and a deterministic tie-break, and
documents the post-mammoth-render assumption as a watched risk rather than adding a hard-to-build
dual-mammoth-version fixture test now.

### F10 — [major] §1.6's cited Android "honest refusal" precedent for `docComments:watch` is the wrong pattern

Evidence: §1.6 says `docComments:watch`/`:unwatch` should use "the same honest-refusal
pattern as `artifacts:watch-project` (already not-implemented-on-mobile)... `{ok:false,
unsupported:true}`." Checked directly against `app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt`
(~line 4077-4081): the actual reply is
`JSONObject().put("ok", false).put("error", "not-implemented-on-mobile")` — **no
`unsupported: true` field**. Per `.claude/rules/ipc-bridge.md`, `{unsupported:true}` is a
*different* mechanism (`MessageRouter.buildUnsupportedResponse`) that fires only when Kotlin
has **no branch at all** for a channel (the generic `else` catch-all); `artifacts:watch-project`
has an explicit branch that deliberately answers `{ok:false, error:...}`, which requires the
channel to be listed in the shim's `REJECT_ON_NOT_OK` to reject cleanly rather than resolve
with a shape the caller doesn't expect. Confirmed independently by two separate research
passes reading the same Kotlin file.

If a subagent implements `docComments:watch` by copying the design's citation literally, it
will produce either the wrong response shape or omit the `REJECT_ON_NOT_OK` registration the
*actual* pattern needs, and remote-shim behavior would differ from what the design assumes.

Fix: correct the citation to `{ok:false, error:'not-implemented-on-mobile'}` via an explicit
Kotlin branch (matching `artifacts:watch-project`'s real code), and explicitly add
`docComments:watch`/`:unwatch` to `remote-shim.ts`'s `REJECT_ON_NOT_OK` list as part of T3/T4
(or explicitly choose the true `{unsupported:true}` no-branch-at-all pattern instead — either
is valid per `ipc-bridge.md`, but the design must pick the one it actually means and describe
it correctly).

Triage: accepted — confirmed `SessionService.kt:4077-4080` returns exactly
`{"ok": false, "error": "not-implemented-on-mobile"}`, no `unsupported` field, and that
`artifacts:watch-project` is not currently in `remote-shim.ts`'s `REJECT_ON_NOT_OK` (its caller already
tolerates `ok:false` itself); design now specifies the correct response shape and explicitly registers
`docComments:watch`/`:unwatch` in `REJECT_ON_NOT_OK` so a failed watch rejects rather than reading as "no
changes yet" (§1.6, T3/T4).

### F11 — [major] Compose-ref redesign (§6, T7) doesn't account for the composer's existing "draft token" layer

Evidence: `compose-ref.ts` has a second, separate encoding layer beyond
`encodeRefMarker`/`splitComposeRefs` — `makeDraftToken`/`splitDraftTokens`/`expandDraftTokens`/
`draftTokenRanges` (confirmed in the file). The composer textarea never actually contains the
full `⦃...⦄` marker while typing; it holds a short zero-width "draft token" so the caret isn't
thrown off by a 150+ character invisible blob, and `expandDraftTokens` converts draft tokens
to the full marker only at send time (`InputBar.tsx`'s `buildOutgoingMessage(expandDraftTokens(...))`).
§6.2/§7 and T7's scope describe rewriting `encodeRefMarker`/`splitComposeRefs`'s wire format
but never mention this draft-token layer. Since the handoff itself already documents this
exact UX ("TagChip-style accent chip... the composer holds a display-sized token so the caret
lines up (compose-ref.ts 'Draft tokens')"), omitting it from the build design's scope risks
either the caret-lineup behavior silently breaking, or T7 rediscovering mid-task that there
are two encodings to keep in sync, not one.

Fix: add the draft-token layer explicitly to T7's scope and pinning tests (a test that types
through a draft token and confirms `expandDraftTokens` still produces the new wire format
correctly), not just `encodeRefMarker`/`splitComposeRefs` in isolation.

Triage: accepted — confirmed `compose-ref.ts:141-213`'s draft-token layer is real and separate from
`encodeRefMarker`/`splitComposeRefs`, and that `InputBar.tsx:783` calls
`buildOutgoingMessage(expandDraftTokens(...))` at send time; T7's scope now explicitly includes the
draft-token layer and a type-through-a-draft-token pinning test (§6.2, T7).

### F12 — [major] The proposed "readable grammar" wire marker reintroduces literal whitespace into a PTY-submitted string

Evidence: the current marker (`encodeRefMarker`, confirmed real) is percent-encoded JSON —
`encodeURIComponent` guarantees **zero literal spaces** in the marker text. The design's
§6.2 replacement forms (e.g. `⦃"<exact quote>" — <path>[, lines L–L | cell C, sheet S]⦄`)
reintroduce literal spaces and punctuation. This matters specifically because YouCoded types
Claude Code CLI input through a PTY with documented whitespace-mangling risk
(`desktop/CLAUDE.md`'s `pty-worker.js` echo-driven submit chunking for text over 56 bytes;
`chat-reducer.ts`'s `sameUserMessage` already has a whitespace-insensitive comparison branch
specifically because "a pasted tab swallowed as the Tab key" can alter spacing in transit).
The current opaque format is *immune* to this class of bug by construction (no literal
spaces to mangle); the proposed readable format is *more* exposed to exactly the failure mode
`sameUserMessage`'s fuzzy matching exists to paper over. T7's listed pinning tests
("encode/decode round-trip per ref kind; a snapshot test") are pure-function tests — none
exercise the actual PTY submission path end-to-end.

Fix: either keep the wire marker itself whitespace-free while still being human-legible
(e.g. use `_` or another PTY-safe separator instead of literal spaces inside the `⦃...⦄`
payload, converting to display spacing only when rendering the pill), or add an end-to-end
test that sends a message containing the new marker through the actual PTY submit path (not
just a unit-level encode/decode test) and confirms it arrives byte-identical.

Triage: accepted — confirmed `encodeRefMarker` today produces zero literal spaces (`encodeURIComponent`)
and that `sameUserMessage`'s whitespace-insensitive branch exists specifically for PTY-transit mangling
(`chat-reducer.ts:69-71`); §6.2's marker now uses a PTY-safe separator with display-only spacing, plus an
end-to-end PTY-submission test in T7.

### F13 — [minor] "No history" claim about the mock `DocComment` is imprecise

Evidence: §1.1 says today's mock record has "no history." `desktop/src/renderer/state/doc-comments-store.ts:33-60`'s
`DocComment` already has `replies: CommentReply[]` and `resolvedBy`/`resolvedAt`. What's
actually new is a full resolve/reopen *audit trail* (`ResolveEvent[]`, multiple
resolve/reopen cycles) and comment/anchor edit-history — not "history" wholesale. Low risk,
but could mislead a subagent about how much of §1.1's shape is genuinely new work.

Fix: reword to "no resolve/reopen audit trail beyond the latest state" rather than "no
history."

Triage: accepted — confirmed `doc-comments-store.ts:33-60`'s `DocComment` already has
`replies`/`resolvedBy`/`resolvedAt`; §1.1 reworded to name the actually-new piece precisely.

### F14 — [minor] Several stale file-path / doc-location citations

Evidence:
- §1.3 cites `desktop/src/main/project-manager.ts`; the real path is
  `desktop/src/main/artifacts/project-manager.ts`.
- §1.4 cites `desktop/src/main/write-authorization.ts`; the real path is
  `desktop/src/main/artifacts/write-authorization.ts`.
- The design (and this review) rely on `.claude/rules/ipc-bridge.md`,
  `.claude/rules/performance.md`, `docs/error-message-standards.md`, etc. — these live in the
  `youcoded-dev` workspace repo, not inside the `youcoded` app repo the design otherwise cites
  paths from; worth being explicit about which repo a citation resolves in, since a subagent
  working only inside the app repo worktree could search the wrong tree.
- §0's R13 row cites `build-menu.ts` alongside `comments/`-prefixed files; it actually lives
  at `desktop/src/renderer/components/context-menu/build-menu.ts`, a different directory.

Fix: correct the four paths above before this doc is handed to task-executing subagents.

Triage: accepted, with a correction to the finding itself — the design's original citations were bare
filenames (`project-manager.ts`, `write-authorization.ts`, `build-menu.ts`), not the wrong full paths the
finding's wording implies; independently confirmed the real paths are
`desktop/src/main/artifacts/project-manager.ts`, `desktop/src/main/artifacts/write-authorization.ts` and
`desktop/src/renderer/components/context-menu/build-menu.ts` (all three files exist only there, not at
the bare-name guess). The underlying risk — ambiguous for a subagent — is real regardless, so the design
now spells out full paths and states which repo each cited rule lives in.

### F15 — [minor] T13's "verify exceljs's author API at task time" hedge is unnecessary — the answer is already knowable

Evidence: §4.1 says "verify the installed version's exact API during T13" for whether
ExcelJS exposes a distinct per-note author. Checked now:
`desktop/node_modules/exceljs/index.d.ts`'s `Comment` interface exposes only `texts`,
`margins`, `protection`, `editAs` — no author field. The "author as first line of the note
body" fallback is therefore already the certain outcome, not a contingency to discover later.

Fix: commit to the fallback now in §4.1 and remove the "verify during T13" hedge, saving a
task-time rediscovery step.

Triage: accepted — confirmed `exceljs/index.d.ts:403-408`'s `Comment` interface has no author field;
§4.1 now commits to the first-line fallback and drops the hedge.

### F16 — [minor] T14's dependency notation is ambiguous and likely too weak

Evidence: §8's task table lists T14's dependency as "T5, T10 or T11, T12 or T13." Read
literally, T14 (wiring the real backend into `CommentableDocument`/`DocxView`/`XlsxView`)
could start once only the docx *read* task (T10) is done, without its *write* counterpart
(T11) — which would wire up a comment panel that can display Word comments but not
mutate them, an incomplete lifecycle that contradicts T14's own stated pinning test ("full
comment-lifecycle test per file type").

Fix: change to "T10 AND T11, T12 AND T13" (or explicitly scope T14 into two sub-phases, read
then write, if a phased rollout is intended) so the dependency notation matches what T14
actually needs to deliver.

Triage: accepted — "T5, T10 or T11, T12 or T13" read literally does allow a read-without-write start;
changed to "T10 AND T11, T12 AND T13" (§8).

### F17 — [minor] No automated OOXML well-formedness/relationship check beyond "the comment re-parses"

Evidence: §3.3 step 5's automated verification is "re-open the just-written bytes with the
SAME read path... if the re-parse doesn't find the comment... the write is treated as
failed." This only proves the one comment that was just touched is still findable by this
app's own lenient reader — it does not check that `[Content_Types].xml` overrides, the
`word/_rels/document.xml.rels` relationship, or `commentsExtended.xml`'s structure are
actually well-formed OOXML a stricter consumer (not just Word/Google Docs' own repair-on-open
tolerance) would accept. R10's manual Google-Docs-upload check is the only thing that would
catch this class of bug, and it's manual/non-CI per the design's own admission.

Fix: not a blocker (R10's manual check already covers ship-blocking cases), but worth adding
a minimal automated relationship/content-types sanity check to the verify step (e.g., every
`r:id` referenced from `document.xml`'s new run resolves in `document.xml.rels`, every part
referenced has a `[Content_Types].xml` override) so a whole class of "opens in Word, silently
drops in Google Docs" bugs is caught before the manual R10 check rather than by it.

Triage: accepted (minor, non-blocking) — a cheap automated relationship/content-types sanity check is
added to T11's verify step, ahead of the manual R10 check rather than instead of it (§3.3, T11).

## Summary

**17 findings: 3 blocker, 9 major, 5 minor.**

Top five:
1. F1 [blocker] — docx/xlsx comment code is specified for the renderer (DOMParser) but must run from main (native tools, MCP queue, UI-driven IPC edits) where Node has no DOMParser — confirmed via `node -e "console.log(typeof DOMParser)"` → `undefined`.
2. F2 [blocker] — no IPC channel exists or is proposed to get mutated docx/xlsx bytes from wherever they're computed back onto disk on either platform.
3. F3 [blocker] — the `.youcoded/comments/<path>.json` sidecar path is built from a caller/model-controlled `path` with no specified containment check, unlike every comparable existing function in this codebase.
4. F4 [major] — the three-writer locking scheme has no test for actual concurrent-lock exclusion, only sequential data-format compatibility, and main's own lock key isn't canonicalized against symlink/path aliasing.
5. F5 [major] — a failed post-write verification doesn't specify automatic rollback, risking a corrupted live document being left in place after an error is merely reported.
