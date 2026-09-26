---
status: draft
date: 2026-09-26
contract: docs/active/design/2026-09-24-doc-comments/doc-comments.contract.json (21 rows, signed)
handoff: docs/active/handoffs/2026-09-24-doc-comments-START-HERE.md
related: docs/roadmap/files.md → "Document comments"
changelog:
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
| R6 | After a fix: reply, resolve, and/or repoint — nothing silently lost | §2, §5 |
| R7 | Phone: tap opens the comment sheet | UI-already-done (`CommentsMargin.tsx`, review R-9) — needs only real data (§1, §7) |
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

- **Path containment (review 1, F3 — blocker):** every entry point (`list`/`add`/`reply`/`resolve`/
  `reopen`/`move`) resolves `path` to a sidecar location by first computing
  `realProject = fs.promises.realpath(projectRoot)` (mirroring `git-service.ts:55`'s fallback to the
  raw root on ENOENT), then `abs = path.resolve(realProject, path)`, then requires `abs` to equal or
  be strictly inside `realProject` (`path.relative(realProject, abs)` must not start with `..` and
  must not be absolute — `git-service.ts:56-60`'s exact test). A `path` that fails this check is
  **refused** (a typed error the caller surfaces honestly), never silently clamped into the root.
  This runs before the sidecar path is even built, so `.youcoded/comments/<relative>.json` can never
  be templated from an escaping value. Every one of T1's new unit tests includes a
  `../../etc/passwd`-shaped and an absolute-path case, and T3/T8/T9 each add the same shape of test
  at their own surface (IPC payload, native tool args, MCP tool args) since all three are reachable
  by model-controlled input, not just the renderer.
- **Read**: `mutateFileUnderLock`-free plain read for `list(path)` — a GET has nothing to lock.
  Missing file → `{ version: 1, comments: [] }`, never an error (a file with zero comments is the
  overwhelmingly common case).
- **Write** (add / reply / resolve / reopen / move): every mutation goes through
  `mutateFileUnderLock(sidecarPath, (onDisk) => …)` (`desktop/src/main/artifacts/cas-write.ts:165-185`)
  — read-current, apply one mutation, return the new JSON string. This is read-modify-write under
  an `fs.mkdir`-based lock with atomic tmp-then-rename (`cas-write.ts:133-150`), the same primitive
  already trusted for cross-process safety between a dev instance and the built app sharing
  `~/.claude/`/`~/YouCoded/` (PITFALLS.md → "Shared state"). No new locking primitive is invented.
  **Lock-path canonicalization (review 1, F4 — major):** `cas-write.ts`'s own `mutateFileUnderLock`/
  `casWrite` derive the lock path as `target + '.lock'` with no `realpath` first
  (`cas-write.ts:170,227`) — fine for `cas-write.ts`'s existing single-process-family callers, but
  this feature adds a SECOND, independent implementation of the same algorithm (§9's MCP script) that
  must exclude the first one. Both `sidecarPath` derivations (main's real one, the MCP script's
  reimplementation) canonicalize the target file's absolute path (`fs.realpath`, falling through to
  the raw path on ENOENT for a file that doesn't exist yet) BEFORE appending `.lock` — not just
  before comparing paths for containment above, a separate step, because a symlinked project
  directory or a case-difference between how Electron resolves `projectRoot` and how a Claude Code
  CLI session's cwd is set would otherwise let the two lock schemes silently stop excluding each
  other (the exact alias trap `git-service.ts:44-54` documents for a different subsystem). The
  pinning test for this is a TRUE concurrency test — both writers racing the same file
  simultaneously, asserting no write is lost — not just the sequential round-trip §9 already lists.
- **Non-blocking** (performance.md rule 1): every fs call is the `fs.promises`/async form; no
  `*Sync`, no whole-file synchronous parse on a path an IPC call or click reaches. `main-blocking-calls.test.ts`'s
  allowlist gets no new entry — that test failing on this module is a real defect, not
  something to permit.
- **Watching**: chokidar on `.youcoded/comments/` per open project (same library `pages-service.ts`
  already depends on — no new dependency), `awaitWriteFinish` to avoid reading a half-written file,
  its own ~300ms debounce (matches `git-watcher.ts`'s `DEBOUNCE_MS`) before dispatching a change.
  This is what lets a comment the assistant just added over the MCP path (§5, §9 — a separate
  process writing the same file) show up in an already-open comments pane without the user doing
  anything.
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
| `docComments:reply` | request/response | `{id, text, author}` | real |
| `docComments:resolve` | request/response | `{id, by}` | real |
| `docComments:reopen` | request/response | `{id, by}` | real |
| `docComments:move` | request/response | `{id, newSelector}` — the re-anchor/repoint tool (§2, §5) | real |
| `docComments:watch` / `:unwatch` | subscribe | `{path, projectRoot?}` | `{ok:false, error:'not-implemented-on-mobile'}` via an explicit Kotlin branch — the SAME shape `SessionService.kt`'s real `artifacts:watch-project`/`artifacts:unwatch-project` branch already returns (`SessionService.kt:4077-4080`; **not** `{unsupported:true}` — review 1, F10 — that shape is `MessageRouter.buildUnsupportedResponse`'s no-branch-at-all catch-all, a different mechanism per `.claude/rules/ipc-bridge.md`) |
| `docComments:changed` | push | `{path}` (client re-lists; no diff payload, same reasoning `pages:changed` uses) | n/a (no watch) |

Android's `docComments:list/add/reply/resolve/reopen/move` are **real Kotlin implementations**
(`java.io.File` read/write) for **plain-text/markdown `PersistedComment` targets**, not stubs —
exactly the precedent `artifacts:get/save/read-binary` already set (SessionService.kt). For a
`.docx`/`.xlsx` target specifically, these same channels answer `not-implemented-on-mobile` (§3.2's
Android scope decision, review 1 F1's follow-on) — Word/Excel comment mutation needs
JSZip/exceljs/a Node-XML-library, none of which have a Kotlin equivalent worth building for this
build, and the contract names no Android requirement for it. This is exactly unlike plain-text
files, and exactly like Git, which the app simply doesn't have on mobile at all. The one piece that
follows Git's "absent, not reimplemented" precedent for EVERY file type, not just docx/xlsx, is
**watching**: Android has no `FileObserver`-based watch today (`artifacts:watch-project` already
answers not-implemented-on-mobile), and building one is out of scope here. Practically: the comments
pane re-`list()`s on mount and after every local mutation; on Android/remote it simply never gets an
unprompted nudge when something changes from elsewhere. That is an accepted gap, not a silent one —
`docComments:watch` refuses honestly rather than pretending to subscribe.

Unlike `artifacts:watch-project` (whose caller today tolerates `{ok:false}` itself and is therefore
not currently in `remote-shim.ts`'s `REJECT_ON_NOT_OK` set), `docComments:watch`/`:unwatch` are new
channels with no existing caller convention to match, so T3/T4 explicitly add both to
`REJECT_ON_NOT_OK`: a failed watch must reject to the caller's catch, never resolve as an ordinary
value a comments pane could misread as "subscribed, no changes yet" (review 1, F10).

**Kotlin's own file-locking**: Android doesn't share `~/.claude/` with a second concurrent
YouCoded process the way desktop's dev-instance-plus-built-app does (PITFALLS.md's cross-process
hazard is desktop-only), so Kotlin's write path can use a plain in-process mutex plus a
temp-then-rename (still crash-safe) rather than porting the mkdir-lock protocol. See §9 for why
this is one of three separate implementations of "write this JSON safely" the design accepts
rather than fights.

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

**Two fallback gaps closed (review 1, F9a/F9b):**
- **`sel.occurrence` out of range** (the quote's 4th match at creation time, but an edit reduced the
  document to 2 matches): never clamp to a fixed index (the last match, index 0) — that produces a
  different, differently-wrong answer depending on which clamp you'd picked. Score every remaining
  occurrence by prefix/suffix match same as any other candidate and take the best one; only
  `'detached'` is returned when there are zero occurrences to score, never an out-of-range index
  error.
- **A tie between equally-scoring candidates** (the same edit touched text near two occurrences
  identically): deterministic tie-break is the candidate whose position is closest to where
  `sel.occurrence`'s original index would place it in the CURRENT set of matches — never array
  order, which is an implementation detail, not a rule.

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

- `CommentCard.tsx` shows a small non-committal line — "Text no longer found in this file." — with
  no invented cause (`docs/error-message-standards.md`'s rule: specific-and-true, or general and
  non-committal; never guess). This is new UI, but it is additive to an already-approved card, not
  a redesign — it fills the gap `CommentsMargin.tsx:265` already leaves for exactly this case.
- The card stays visible and repliable/resolvable (R6: nothing is silently lost) — resolving a
  detached comment is a legitimate way to say "this no longer applies."
- The assistant's `ReadComments`/`ReadCommentThread` tools (§5) report `status: 'detached'`
  explicitly, so the assistant can decide whether to reply, resolve, or re-anchor (`MoveComment`)
  rather than silently failing to find the text itself.

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

**Android scope (review 1, F1's own follow-on question, resolved as an explicit design decision, not
a contract change):** §3.2's original text argued Android needed no Kotlin port because "Android's
WebView runs the same bundle." That reasoning no longer holds once this logic is main-only, and
porting a full OOXML comment editor to Kotlin (`java.util.zip` + `javax.xml.parsers`, no equivalent
of mammoth/exceljs/JSZip's convenience layer) is a large, separately-risky undertaking the contract
never asked for — R9/R10's own thresholds are phrased as "in a dev instance" (desktop) and name no
Android requirement. This design now follows the SAME precedent already accepted for Git ("the app
simply doesn't have on mobile," §1.6): Word/Excel comment reading and mutation is **desktop-only**
for this build. Android's `docComments:*` handlers (T4) answer `not-implemented-on-mobile` (§1.6's
shape) specifically for `.docx`/`.xlsx` targets, while continuing to give REAL Kotlin
read/write for every plain-text/markdown `PersistedComment` file, exactly as already planned. This
narrows what Android users get from this build (no Word/Excel comment editing on the phone yet) —
worth Destin's awareness, though it changes no signed contract row.

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

### 3.3 Writing (add / reply / resolve)

Same module, mirrored write functions, applied to the **loaded JSZip archive** in memory:

1. **Backup before write** (contract requirement, R9/R10's own threshold language): copy the
   original bytes to a sibling path before touching anything —
   `<file>.docx.bak-<timestamp>` next to the source (or under `.youcoded/backups/`, decided at
   task time — either is fine as long as it survives the write it's protecting against). Only one
   rolling backup is kept per file per session to avoid unbounded growth; this is a safety net for
   a corrupted write, not a version history (Word comments already carry their own history, §1.1).
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
5. **Verify after write, with automatic rollback (review 1, F5 — major):** re-open the just-written
   bytes with the SAME read path (§3.2) before reporting success. If the re-parse doesn't find the
   comment that was just added/changed, OR a minimal relationship/content-types sanity check fails
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

### 4.1 What exceljs supports, and the tradeoff already decided

ExcelJS (`exceljs@4.4.0`, already a direct dependency — `XlsxView.tsx` uses it read-only today,
`.load()`, cell `.value`/`.formula`/`.numFmt`) exposes **legacy cell Notes** via
`cell.note` (get/set — a plain string or a rich-text object with `texts`/`margins`/`editAs`). It
does **not** support modern **threaded comments** (the `xl/threadedComments/` + `xl/persons/`
parts introduced in Excel 2019, which show in Excel's Comments pane with @mentions and a visible
reply chain) — writing those would mean hand-rolling that OOXML the same way §3 does for Word,
with no existing library help and no fixture precedent (`fixtures/sheets/make-by-rep.mjs` builds a
plain two-tab workbook with no comment API exercised at all).

This tradeoff was already decided, not left open: the handoff's chat answer for Excel is
explicit — *"yes, same as Word (exceljs, already a dependency, reads/writes notes)."* So this
design uses **legacy Notes**, with the accepted consequence that Word's exact reply-threading
model doesn't carry over 1:1 to Excel: a `PersistedComment`'s replies are rendered into ONE note
body as a formatted transcript —

```
Priya Shah: North looks low for July — was the Denver account left out?

You: Checked — Denver's July invoices posted a week late this quarter.
```

— which any version of Excel or Google Sheets displays as a normal cell note. **Author placement is
committed now, no task-time hedge (review 1, F15 — minor):** `desktop/node_modules/exceljs/index.d.ts`'s
`Comment` interface exposes only `texts`, `margins`, `protection`, `editAs` — confirmed no author
field exists in the installed version. The author's name goes as the first line of the note body,
which is still legible and still satisfies R8's "saved into the spreadsheet file itself"; there is no
"verify during T13" contingency to discover, the fallback is the only possible outcome.

Resolve state has no Excel-native equivalent for legacy notes (no "resolved" flag exists in that
format). **Marker choice, corrected (review 1, F7 — major):** a plain trailing "— resolved" string is
both something a legitimate reply could plausibly end with by accident (a false "resolved" read on
the next open) and something `ReopenComment` would have to strip back out, unspecified in the
original draft. Use a fixed, non-natural-language token no legitimate comment text would produce —
`​[[yc:resolved]]` (a leading zero-width space plus a bracketed machine token, matching the kind
of internal sentinel `compose-ref.ts`'s own `⦃…⦄` delimiters already use for the same reason: inert
in ordinary prose) appended as its own trailing line. `ReopenComment` on an Excel-backed comment
strips that exact trailing line back out. T13's pinning tests add: round-trip reopen (marker fully
removed, nothing else in the body touched) and a reply body whose real text happens to contain
resolve-like language (must NOT be read as resolved — the token, not the words, is the signal).

### 4.2 Sheet + cell anchor

Unchanged from the mock's own shape: `CellSelector { cell: 'C4', sheet?: 'Q3' }` — `sheet` is
required only when the workbook has more than one tab (`sourceLabel` already formats this as
"By rep · B4" vs plain "C4", `doc-comments-store.ts:249,281,298`). Reading walks every worksheet's
cells for a non-empty `.note`; writing sets `.note` on the exact `[sheet, cell]` pair. `sheet-reveal.ts`
already handles switching the visible tab when a comment on another sheet is clicked — no change
needed there.

### 4.3 Read/write/backup, mirroring §3.3

**Moved to main, alongside §3.2's docx fix (review 1, F1/F2 — blocker):** exceljs needs no DOM and
runs in plain Node exactly as well as in the renderer, so this module lives in
`desktop/src/main/doc-comments/xlsx-comments.ts`, not `XlsxView.tsx`'s renderer code, for the same
reason docx's parse/mutate logic moved: T8's native tools and T9's MCP queue must be able to mutate
an Excel comment with no renderer window open on that file, and no new binary IPC channel is needed
because `fs` is already local. `XlsxView.tsx`'s own read-only rendering of cell VALUES for display is
untouched — only the comment-note read/write path moves. Android scope follows §3.2's decision:
desktop-only for `.xlsx` comment mutation this build, `not-implemented-on-mobile` on Kotlin.

Read: alongside a load of the workbook via ExcelJS in main. Write: backup-before-write, apply via
ExcelJS's normal save API (`workbook.xlsx.writeBuffer()`), **verify-after-write with automatic
rollback on failure** by re-loading the buffer and re-reading the note (review 1, F5 — same fix as
§3.3 step 5: on a verify failure, rename the backup back over the target before surfacing a specific
`<ErrorState>`, never leave a possibly-corrupted file as the user's live document) — exactly §3.3's
five-step shape, minus the range-marker step (a note has no separate "range start/end," it's a cell
property).

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
| `ReplyToComment` | `{commentId, text}` | Appends a reply as `'assistant'` |
| `ResolveComment` | `{commentId}` | Marks resolved, `resolvedBy: 'assistant'` |
| `ReopenComment` | `{commentId}` | Clears resolved |
| `AddComment` | `{path, selector, text}` | Leaves a new assistant-authored comment |
| `MoveComment` | `{commentId, newSelector}` | Repoints a comment's selector — the re-anchor half of R6 |

`ReplyToComment`/`ResolveComment`/`ReopenComment`/`MoveComment` work identically whether the
target is a `PersistedComment` (§1) or a Word/Excel-native one (§3, §4) — the tool takes a
`commentId` regardless of backing format; which write path it dispatches to is an implementation
detail of `doc-comments-store.ts`, not something the assistant needs to know.

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

### 5.3 MCP tool definitions

`claude-code-mcp.ts`'s `SendUserLink` (`desktop/src/main/claude-code-mcp.ts:59-88`) is the
template: hand-rolled JSON Schema `inputSchema`, a `description` string, and a `callTool` handler
that validates then replies `{content:[{type:'text', ...}], isError}`. The six tools in the table
above get the same treatment, added to the SAME embedded server script (or a sibling one deployed
alongside it — a task-time call, not a design constraint) and to `--allowedTools` at spawn. Unlike
`SendUserLink`, which does nothing but validate and reply (the Deliverables card renders itself
from the tool_use event already visible in Claude Code's own transcript — `handle()`'s
`tools/call` path performs no side effect today), these six tools have to actually mutate stored
state, which is where §9's dependency-free-script constraint becomes load-bearing.

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

- **A quoted-text reference** (`kind: 'doc'`, no `commentId`/`commentIds` — an ephemeral "Ask
  about this," not a saved comment): `⦃"<exact quote>"_<path>[_L<start>-<end>|_cell_<C>_<S>]⦄`
  e.g. `⦃"Today's first-run flow shows five screens before the composer is reachable"_docs/active/plans/2026-09-24-onboarding-redesign.md⦄`.
  A model reading this sees a normal quoted excerpt and a file path — it can act on it with its
  existing Read/Grep tools without needing any new tool at all, because the quote text IS enough
  to locate the span (the same substring-search tolerance §2's `resolveSelector` uses).
- **A comment reference** (`commentId` set — from clicking an existing thread's chip, or the
  single-comment case of "Send to assistant"): adds the id so the assistant can call
  `ReplyToComment`/`ResolveComment` directly instead of re-finding the text:
  `⦃comment_c-<id>_"<quote>"_<path>⦄`.
- **The Ask Your Assistant summary chip** (`commentIds` set, §5's whole reason for existing):
  `⦃<N>_open_comments_<path>_use_ReadFileComments_to_read_them⦄`. This one deliberately does
  NOT inline every comment's text (`CommentsFloatingActions.tsx`'s own comment: *"The comments
  themselves reach the assistant through its comment tools (real build), not the chip"* —
  §5.3/§9's `ReadFileComments` is what actually delivers the content; the chip is a pointer, on
  purpose, so this design doesn't duplicate comment bodies into every future turn's context).

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
without a shared import to enforce it.

| # | Task | Depends on | Pre-written or description | Pinning test(s) | Key risk |
|---|---|---|---|---|---|
| T1 | `desktop/src/shared/doc-comments-types.ts` + main-process store (`list`/mutate via `mutateFileUnderLock`, project-relative + fallback path resolution, **path containment check** — review 1 F3) | — | **Pre-written schema** (§1.1's TS shape ships as the task's spec, not invented mid-task); **pre-written containment algorithm** (§1.5: realpath the project root, `path.relative` escape check, refuse never clamp) | new unit tests: read-modify-write, concurrent-lock behavior, missing-file default, fallback path for a project-less file, **`../../etc/passwd`-shaped and absolute-path containment refusal (F3)**, **lock-path canonicalization + a TRUE concurrent-write test, not just sequential (F4)** | Getting this schema wrong is expensive — T4/T8/T9a/T10/T12 all build on it. Freeze it before parallel work starts. A missed containment check is a path-traversal write bug, not a style nit. |
| T2 | `desktop/src/shared/doc-comments-anchor.ts` (`resolveSelector`) | T1 (types) | Pre-written algorithm (§2.2), **including the closest-scoring fallback for an out-of-range `occurrence` and the position-closest tie-break rule (review 1, F9a/F9b)** | exact match; moved text (prefix/suffix intact, position shifted); ambiguous repeated phrase; not-found → `'detached'`; cell-not-found; **occurrence-index-out-of-range resolves to the best-scoring remaining candidate, never a fixed clamp (F9a)**; **a scoring tie resolves deterministically by closest position, not array order (F9b)** | Anchoring correctness is the feature's whole trust model — under-test this and "text no longer found" fires on text that IS still there. §2.2 also flags mammoth-render stability as a documented, watched risk (F9c) rather than a test to build now. |
| T3 | IPC surface: `docComments:*` on preload/ipc-handlers/remote-shim/remote-server + chokidar watcher + `docComments:changed` broadcast; **register `docComments:watch`/`:unwatch` in `remote-shim.ts`'s `REJECT_ON_NOT_OK` (review 1, F10)** | T1 | Description | `ipc-channels.test.ts` additions; `main-blocking-calls.test.ts` stays clean; a watcher-debounce test; **path-containment refusal test at the IPC payload surface (F3)**; **a `REJECT_ON_NOT_OK` regression test for `docComments:watch`/`:unwatch` (F10)** | Forgetting a surface (5, not 4 — ipc-bridge.md's own correction) breaks remote silently. Skipping the `REJECT_ON_NOT_OK` registration lets a failed watch read as "subscribed, no changes yet." |
| T4 | Android `SessionService.kt` parity for `docComments:*` (plain-text files only — real Kotlin read/write); `.docx`/`.xlsx` targets and `watch`/`unwatch` answer **`{ok:false, error:'not-implemented-on-mobile'}` via an explicit branch (review 1, F10 — corrected from the earlier `{unsupported:true}` citation, which is a different no-branch-at-all mechanism)** | T3 (needs final channel/payload shapes) | **Pre-written wire format** (T1's schema doc, not re-derived); **pre-written response shape for the two refusal cases** (§1.6/§3.2) | shared JSON fixture both platforms round-trip; ipc parity guard; **an exact-JSON-shape test for the not-implemented-on-mobile response (F10)** | A schema drift here is invisible until an Android build actually runs — flag as needing a real Android build check (CLAUDE.md's own "CHECK, don't assume" rule on SDK presence). |
| T5 | Renderer: rewrite `doc-comments-store.ts` internals against real IPC, keep `DocCommentsApi` unchanged, move seeds to `mock-shim.ts`, add/remove `MOCK_ONLY` rows as channels land | T3 | Description | existing comment component tests keep passing unmodified (proves the interface didn't move); a workbench fixture-state test | Any interface drift here silently breaks the ALREADY-APPROVED UI — treat every `comments/*.tsx` test as a regression gate, not just new tests |
| T6 | "Text no longer found" UI on `CommentCard.tsx` (small, additive) | T2 | Description | a detached-state render test | Small enough to qualify for feature-flow's short route — confirm with Destin before skipping a review deck for it |
| T7 | `compose-ref.ts` wire-format rewrite (§6.2/6.3), **including the draft-token layer** (`makeDraftToken`/`splitDraftTokens`/`expandDraftTokens`/`draftTokenRanges` — review 1, F11) | T1 (comment ids exist) | Pre-written grammar (§6.2's three forms, **underscore-joined structural separators, no literal space in the delimiter syntax this design controls — F12**) | encode/decode round-trip per ref kind; a "no percent-encoding or JSON braces, and no literal space in the structural syntax" snapshot test; **a test that types a reference through as a draft token, sends it, and confirms `expandDraftTokens` produces the new grammar correctly (F11)**; **an end-to-end test that sends a message containing the new marker through the actual PTY submit path and confirms it arrives byte-identical (F12)** | Must not regress hover/click-to-source (`use-ref-source-highlight.ts`) — run its existing tests, don't just add new ones. A structural-separator regression to literal spaces is invisible in a pure-function test, only in the PTY e2e test. |
| T8 | Native tools: `ReadFileComments`, `ReplyToComment`, `ResolveComment`, `ReopenComment`, `AddComment`, `MoveComment` in `desktop/src/main/harness/tools/` | T1, T2 | Description (tool descriptions themselves are pre-written, §5.1/§5's table — copy verbatim, don't paraphrase) | per-tool execute tests; `tool-registry-manifest.test.ts` update; **a path-containment refusal test at the tool-argument surface, since a tool's `path` is model-controlled input (F3)** | `AddComment`'s description drifting from the exact "sparingly" wording is how R4 quietly regresses later |
| T9a | Claude Code MCP: extend `claude-code-mcp.ts`'s deployed server with the six tools' JSON-RPC definitions, dependency-free plain-file store read/write (§9), citing `chatsearch.js`'s atomic tmp-write+rename and outbox/receipt poll loop as the pattern to copy (review 1, F8) | T1, T2 | **Pre-written**: T1's frozen JSON schema, §9's "no Electron API, plain `fs` only" constraint, and the `chatsearch.js` precedent to copy rather than invent | mirrors `claude-code-mcp.test.ts`'s own style: JSON-RPC handler tests, a round-trip test (native tool writes → MCP script reads the same file, and back); **path-containment refusal test at the MCP tool-argument surface (F3)**; **lock-path canonicalization + true-concurrency test against T1's implementation (F4)** | Porting `cas-write.ts`'s Windows-specific `EPERM`/`EACCES`/`EBUSY` contention handling is easy to drop in a "simplified" reimplementation — test it explicitly. |
| T9b | The docx/xlsx pending-mutation queue: MCP tool writes `.youcoded/comments/.pending/<uuid>.json`, main's watcher applies it via its real JSZip/Node-XML-library/exceljs code and writes a result file the MCP script polls for (§9) — split out because it is blocked on §3.2/§4.3's F1/F2 architecture fix landing first (review 1, F8) | T9a, T10, T12 (needs the main-process docx/xlsx write path to exist) | Description | queue round-trip (request written → result appears → MCP script reads it); a bounded-timeout test (no result file within ~3s surfaces a specific failure, never hangs) | This piece is genuinely new (no direct precedent) — keep it isolated from T9a/T9c's lower-risk, precedented work so a review can weigh it on its own. |
| T9c | Android byte-identical MCP asset + its own parity test, citing `ClaudeCodeMcp.kt`/`claude-code-mcp.ts`'s existing `SendUserLink` deploy as precedent (review 1, F8) | T9a | Description, citing the existing `SendUserLink` deploy pattern verbatim | desktop-string-equals-Android-asset parity test (same shape as `claude-code-mcp.test.ts`'s existing one) | Low risk given the precedent — keep scope to parity, not new protocol design. |
| T10 | Docx read: `docx-comments.ts` (now `desktop/src/main/doc-comments/docx-comments.ts` — review 1, F1) parses `comments.xml`/`commentsExtended.xml` via a Node-compatible XML library (`@xmldom/xmldom` or `fast-xml-parser`, spike to confirm which), merges into `CommentableDocument`; promote `jszip` and the chosen XML library to direct dependencies | T1 | Description | parse `docs/launch-brief.docx` fixture; `w15:paraIdParent` reply reconstruction; a docx with no `comments.xml` part doesn't crash; **runs under plain Node in a test, not a renderer/jsdom test environment, proving the main-process placement (F1)** | JSZip's hoisted-not-declared status (§3.2) — confirm the direct-dependency bump doesn't change the resolved version underfoot. Confirm the chosen XML library's API maps cleanly enough from a `DOMParser`-shaped design that §3.2's algorithm doesn't need a rewrite, only a swap. |
| T11 | Docx write: add/reply/resolve into `comments.xml`/`commentsExtended.xml` (main process), backup-before-write, verify-after-write **with automatic rollback on failure (review 1, F5)**, **id/paraId uniqueness (F6)**, **a minimal OOXML relationship/content-types sanity check in the verify step (F17)** | T10 | Description | round-trip add/reply/resolve against the fixture; backup file created; **a verify-failure test asserts the target file is byte-identical to the pre-write original, not just that an error surfaced (F5)**; **a fixture with gapped/non-sequential existing `w:id`s (F6)**; **every `r:id` the new run references resolves in `document.xml.rels`, and every referenced part has a `[Content_Types].xml` override (F17)**; (manual, dev-instance, not CI) Word-and-Google-Docs-open check | OOXML relationship/content-type wiring is exactly the class of bug that "opens in Word but Google Docs silently drops it" — R10's manual check is not optional, and F17's automated check now catches part of that class before the manual gate. |
| T12 | Xlsx read: exceljs `.note` → `PersistedComment`-shaped cell records, in `desktop/src/main/doc-comments/xlsx-comments.ts` (review 1, F1) | T1 | Description; **author placement is committed now — first line of the note body, no distinct author field exists in the installed exceljs version (review 1, F15, hedge removed)** | parse a workbook fixture with a `.note` set; multi-sheet cell targeting | None beyond confirming the direct-dependency exceljs version stays pinned. |
| T13 | Xlsx write: `.note` add/reply/resolve as a formatted transcript, **using a fixed non-natural-language resolve marker instead of a plain "— resolved" string (review 1, F7)**, backup-before-write, verify-after-write **with automatic rollback on failure (F5)** | T12 | Description | round-trip; multi-reply formatting; backup+verify; **`ReopenComment` strips the marker's exact trailing line and nothing else in the body (F7)**; **a reply body containing resolve-like natural-language text is NOT read as resolved (F7)**; **a verify-failure test asserts the target file is byte-identical to the pre-write original (F5)** | Getting the marker's strip regex slightly wrong either leaves marker fragments visible or eats real trailing content — test both directions explicitly. |
| T14 | Wire real backend into `CommentableDocument`/`DocxView`/`XlsxView` (dispatch by file type: `PersistedComment` store for plain files, `docx-comments.ts` for `.docx`, `xlsx-comments.ts` for `.xlsx`); remove workbench-only seeds from the product path | T5, **T10 AND T11**, **T12 AND T13** (review 1, F16 — corrected from "T10 or T11, T12 or T13", which allowed starting on a read-only half-built lifecycle) | Description | full comment-lifecycle test per file type, run against the real (non-mock) store | The integration point where a wrong file-type dispatch silently sends a plain-file comment write at a `.docx`'s sidecar instead of into the file |
| T15 | Process cleanup: close PR #263 (R11); confirm with Destin, then delete the three rejected mock branches/worktrees (R21) | none | Description (not a build task — a closing-session step) | n/a | Do not delete without explicit go-ahead, per the handoff's own step 5 |

**Suggested batching**: T1 alone first (everything downstream reads its frozen schema and its
containment/lock-canonicalization algorithms). Then in parallel: T2, T7, T10, T12, and the desktop
half of T3. Then: T4, T5, T8, T9a (T9a last within this batch — it has real surface area and should
start once T1/T2 are truly stable, not while they might still shift), T11 (after T10), T13 (after
T12). Then T9b (needs T10/T12's main-process write paths), then T9c (needs T9a). Then T14 (needs
BOTH halves of each format's read/write pair, per F16). T6 can land any time after T2. T15 is
independent and low-priority.

## 9. Cross-cutting risk: three implementations of "write this JSON safely"

This design accepts, rather than architects away, three separate places that read/write the same
`.youcoded/comments/<path>.json` file format:

1. **TS main process** (`desktop/src/main/doc-comments/doc-comments-store.ts`, T1/T3) — uses the
   real `mutateFileUnderLock` from `cas-write.ts`, in-process, no duplication risk. As of §3.2/§4.3's
   revision, this is also the ONLY implementation with JSZip/a Node-XML-library/exceljs available —
   docx/xlsx parse+mutate lives here now too, resolving the earlier renderer/main contradiction
   (review 1, F1/F2).
2. **The Claude Code MCP script** (T9a) — a plain `node` process Claude Code spawns per session,
   with **zero `node_modules` beside it on either platform** (`claude-code-mcp.ts`'s own header
   comment: "this file is executed by a PLAIN node process… it has no node_modules beside it on
   either platform, and on Android it runs under Termux. Zero dependencies is the only shape that
   works in both places"). It cannot `import` `cas-write.ts` or any bundled dependency — it needs a
   small, dependency-free reimplementation of the SAME mkdir-lock-plus-atomic-rename algorithm,
   embedded the same way `LINK_SERVER_JS` is a self-contained `String.raw` template, and citing
   `chatsearch.js`'s own atomic tmp-write+rename (`chatsearch.js:812-814`) and bounded outbox/receipt
   poll loop as real, shipped precedent for the same shape (review 1, F8).
3. **Kotlin** (`SessionService.kt`, T4) — a plain-mutex-plus-atomic-rename implementation (simpler
   than #1/#2 because Android has no concurrent second-process hazard, per §1.6) — for plain-text
   `PersistedComment` files only; `.docx`/`.xlsx` targets answer `not-implemented-on-mobile` per
   §3.2's Android scope decision.

**Lock-path canonicalization must match across #1 and #2 (review 1, F4 — restated from §1.5):**
`cas-write.ts`'s existing lock derivation (`target + '.lock'`, no `realpath` first) is fine for its
existing single-process-family callers, but #1 and #2 here are two INDEPENDENT reimplementations of
the same algorithm that must actually exclude each other. Both canonicalize the target's absolute
path before deriving the lock path, identically, or a symlinked project directory / cwd-resolution
difference between Electron and a Claude Code CLI session silently stops the two locks from excluding
each other — a torn or lost write on the exact file R6 depends on. The pinning test is a TRUE
concurrency test (both writers racing the same file simultaneously, asserting nothing is lost), not
only the sequential round-trip below.

Since #1 now has JSZip/a Node-XML-library/exceljs for `.docx`/`.xlsx` writes, and #2 (the MCP script)
still has neither (no `node_modules`, no DOM, on either platform), this design still routes Word/Excel
comment mutations from the MCP path through a small file-based queue rather than a third from-scratch
XML editor (T9b): the MCP tool writes a pending mutation request into
`.youcoded/comments/.pending/<uuid>.json` (using the SAME dependency-free lock primitive as #2 above,
since it's a plain JSON write, not XML), then polls (bounded, ~3s, matching other native tool
timeouts) for a result file the main-process watcher (§1.5, already watching `.youcoded/comments/`)
writes once it applies the mutation using its real JSZip/Node-XML-library/exceljs-capable code.
Plain-file `PersistedComment` mutations from the MCP path skip the queue entirely — JSON
read-modify-write is simple and low-risk enough for the script to do directly (T9a).

**T9 split into three (review 1, F8 — major):** the original single T9 bundled six MCP tool
definitions, a from-scratch dependency-free lock port, an entirely new cross-process pending-mutation
queue, and Android byte-identical asset parity — four independently risky, independently testable
pieces the design's own "sized for one subagent each" rule argues against combining. Split into:
- **T9a** — the six MCP tool JSON-RPC definitions plus the dependency-free plain-file store (point 2
  above), citing `chatsearch.js` as the pattern to copy.
- **T9b** — the docx/xlsx pending-mutation queue (blocked on §3.2/§4.3's F1/F2 fix landing first).
- **T9c** — Android byte-identical asset parity + its own parity test, citing `ClaudeCodeMcp.kt` /
  `claude-code-mcp.ts`'s existing `SendUserLink` deploy as precedent.

**Recommended pinning test** (called out per-task above, worth restating together): a shared-fixture
round-trip test — implementation #1 writes a comment, #2 (or a Node harness standing in for it)
reads and adds a reply, #1 reads the result and confirms both are present in the expected shape.
This is the test that catches format drift between the three before it reaches a real session.

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
- **New this revision (review 1, F1's follow-on):** real Word/Excel comment reading and mutation is
  desktop-only for this build. Android's `docComments:*` answers `not-implemented-on-mobile` for
  `.docx`/`.xlsx` targets specifically (§3.2, §1.6), the same precedent already accepted for Git.
  Plain-text/markdown comments remain fully real on Android, unaffected. No contract row promises
  Android Word/Excel support — R9/R10's thresholds are phrased as desktop dev-instance checks — so
  this changes no signed row, but it is a real capability gap this build leaves for Android users
  that the original draft didn't call out explicitly. Worth Destin's awareness.
