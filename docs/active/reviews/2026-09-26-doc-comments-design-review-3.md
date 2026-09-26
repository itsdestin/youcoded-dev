---
date: 2026-09-26
status: active
type: review
---

# Document comments — build design review (round 3, final capped round)

Reviewing: `docs/active/specs/2026-09-26-doc-comments-build-design.md` (as revised after round 1
and round 2) against the signed contract (`doc-comments.contract.json`), Destin's reopen-1 answer
(`doc-comments.reopen-1.answers.json`, "full-phone"), the app code at
`/home/destin/youcoded-dev/worktrees/sessions/comments-mock-a/youcoded` (branch
`session/comments-mock-a`), and `CLAUDE.md` / `.claude/rules/feature-flow.md` /
`.claude/rules/performance.md` / `docs/PITFALLS.md`.

**Round-1 and round-2 fixes spot-checked, not re-litigated.** Direct code reads confirm the
specific algorithms the design now cites still match reality: `write-authorization.ts:100-113`
(`judgeRelativeRecord`) really does realpath the FULL resolved path (`path.resolve(projectRoot,
recordedPath)` then `fs.promises.realpath`) and fails closed on `ENOENT` (`{ok:false,
reason:'missing'}`, no fall-through) — matching §1.5's corrected containment algorithm and its
"never fall through on ENOENT" reasoning; `git-service.ts:55-56` (`locate`) really does realpath
only the root and fall through to the raw path on a missing target, confirming it's correctly
described as the weaker precedent no longer used for containment; `cas-write.ts:170,227` really do
derive `lock = target + '.lock'` with no realpath, matching §1.5/§9.1's canonicalize-the-root-only
fix. No findings below repeat anything already accepted in review 1 or review 2. Per instructions,
§5.2a's permission-gate question is not re-raised — it's correctly left as an open decision for
Destin, not silently resolved, and neither finding below depends on its outcome.

Method: read the full revised spec, both prior review files in full, the contract, the reopen-1
answer, and the actual mock renderer store (`desktop/src/renderer/state/doc-comments-store.ts`) and
its own precedent citations (`artifact-store.ts`, `pages-service.ts`) to check whether the storage
architecture the design commits to (§1.3: one JSON sidecar file per commented source file,
deliberately rejecting the single-file-per-project `artifacts.json` shape) is actually reachable by
every call surface the design specifies.

## Findings

### F1 — [blocker] No mechanism anywhere resolves a `commentId` to the file whose sidecar holds it, for `reply`/`resolve`/`reopen`/`move` — yet §1.3 deliberately chose a storage model where that lookup is required

Evidence: §1.3 rejects a single project-wide comments file specifically to get "no cross-file
contention, no whole-project rewrite" — the storage model is **one JSON file per commented source
file** (`.youcoded/comments/<relative/path>.json`). Given that model, mutating a comment by id alone
requires knowing which sidecar file contains it. But every actual call surface for
`reply`/`resolve`/`reopen`/`move` is specified WITHOUT a `path`:

- IPC payloads (`docs/active/specs/2026-09-26-doc-comments-build-design.md:389-392`):
  `docComments:reply` → `{id, text, author}`, `docComments:resolve` → `{id, by}`,
  `docComments:reopen` → `{id, by}`, `docComments:move` → `{id, newSelector}` — none carry `path`.
- Native/MCP tool schemas (`...build-design.md:888-892`): `ReplyToComment {commentId, text}`,
  `ResolveComment {commentId}`, `ReopenComment {commentId}`, `MoveComment {commentId, newSelector}`
  — none carry `path`, and these are the literal Zod/JSON-Schema input shapes the MODEL is allowed
  to fill in (`types.ts:357`'s `NativeTool<A>` and §5.3's MCP `inputSchema`), so the model has no
  field through which to supply one even if it wanted to.

Yet §1.5 itself asserts the opposite — that these same entry points DO take and validate a `path`:
"every entry point (`list`/`add`/`reply`/`resolve`/`reopen`/`move`) resolves `path` to a sidecar
location..." (`...build-design.md:301-302`), and requires "T3/T8/T9a each add the same shape of
[containment] test at their own surface (IPC payload, native tool args, MCP tool args)"
(`...build-design.md:320-322`) — a test that cannot be written for `reply`/`resolve`/`reopen`/`move`
at those surfaces, because no untrusted `path` input exists there to test containment against.

This isn't a documentation nit: it's a real, unbuilt piece of the architecture. Confirmed by reading
the mock renderer store this design is replacing
(`desktop/src/renderer/state/doc-comments-store.ts:374,385,393`): `addReply(id, author, text)`,
`resolveComment(id, by)`, `reopenComment(id)` take no path today ONLY because the mock keeps every
comment from every file in one flat in-memory array (`snap.comments`), so a linear scan by id is
free and correct. §7 commits to keeping `DocCommentsApi`'s exposed interface unchanged
(`...build-design.md:1108`, "**That interface does not change.**") — `resolveComment`/`addReply`/
`reopenComment` keep their id-only signatures. For the RENDERER specifically, `useDocComments(path)`
could quietly inject the closed-over `path` into the real IPC call without changing the exposed
type (the way `addComment` already does at `doc-comments-store.ts:337`) — but that trick is
unavailable to the two other callers the design itself names as needing this to work identically:
a native harness tool call and an MCP JSON-RPC call, both of which are bound by the literal
`inputSchema` the model can populate, which has no `path` field.

Checked whether an existing precedent in this codebase solves "look up a record by id when it could
be in any of N per-item files": it doesn't. §1.5 says the new module follows "the shape of
`artifact-store.ts` and `pages-service.ts`" — but `artifact-store.ts` uses exactly ONE sidecar
(`.youcoded/artifacts.json`) per project (`artifact-store.ts:13`, `SIDECAR_RELATIVE`), so an
artifact id is always looked up within one already-known file — the multi-file-fan-out problem
doc-comments creates for itself never arises there. `pages-service.ts` similarly keys per-page, not
by a foreign id scattered across many files. Neither cited precedent actually demonstrates the
lookup this design needs.

The gap bites hardest exactly where the design's own architecture (§9) says it matters most: the
Claude Code MCP script (T9a) is a **fresh, dependency-free process spawned per session** with no
warm cache from any prior call, and R2 ("assistant replies where you left a comment") routinely
means the assistant is asked to act on a comment days after it was made, in a file that was never
`list()`-ed in this process's lifetime. Without a specified index (built how, stored where, kept in
sync with concurrent writes from the other two implementations) or a specified full-tree scan of
`.youcoded/comments/**/*.json` (never mentioned, no task, no test, and in tension with §1.3's own
"no whole-project [operation]" reasoning), T1/T3/T8/T9a/T9b/T20 cannot actually be built as
specified — each would have to invent its own answer, and the three runtimes (TS main, the MCP
script, Kotlin) would almost certainly invent three different ones, silently reopening exactly the
kind of "three implementations quietly disagree" risk §9 exists to name and guard against for every
other piece of this design.

Fix: T1 must specify one lookup mechanism, shared by name across every consumer:
- Simplest buildable option: add `path` as a required field to every one of
  `reply`/`resolve`/`reopen`/`move`'s IPC payloads AND to the four tools' input schemas
  (`ReplyToComment`, `ResolveComment`, `ReopenComment`, `MoveComment` all gain `path`), since the
  caller in every real case already has it (the renderer's open file; the assistant's own prior
  `ReadFileComments{path}` call, whose returned `PersistedComment.path` field already carries it).
  This also makes the already-specified path-containment check at these surfaces (review 1 F3,
  review 2 F1) actually have something to validate.
- If id-only is kept for ergonomics, T1 must instead specify a maintained `commentId → path` index
  (file location, write discipline under the same lock, and how the MCP script and Kotlin
  synchronize against it without their own warm cache) as a pre-written piece of §1, not left to
  each task to invent.
Either way, add the `path` (or index) into T3/T4/T8/T9a/T9b/T20's task rows, and a pinning test that
exercises `reply`/`resolve`/`reopen`/`move` against a comment whose sidecar was never previously
`list()`-ed in the acting process.

Triage:

### F2 — [blocker] `MoveComment` has no specified write algorithm for Word/Excel-native comments, and isn't in T11 or T13's scope at all — despite §5 explicitly claiming it works "identically" across formats

Evidence: §5 states plainly that `ReplyToComment`/`ResolveComment`/`ReopenComment`/`MoveComment`
"work identically whether the target is a `PersistedComment` (§1) or a Word/Excel-native one (§3,
§4)" (`...build-design.md:894-897`), and §5.2a separately lists `MoveComment` among the tools that,
for a Word/Excel target, "write DIRECTLY into the live document's own XML"
(`...build-design.md:940-941`). R6 ("after fixing a comment... reply, resolve, and/or repoint —
nothing silently lost") is explicitly contract-covered for every format doc-comments supports,
Word/Excel included.

But §3.3 (Word writing) specifies exactly three mutation operations — add (`...build-design.md:675`),
reply (`:686`), resolve/reopen (`:688`) — and stops. There is no fourth step describing how to
actually relocate a `w:commentRangeStart`/`w:commentRangeEnd` pair (plus its paired
`w:commentReference` run) from its current position in `document.xml` to a new one, which is what
"moving" a Word-native comment structurally requires — unlike a `PersistedComment`, where the
anchor is pure external metadata (a `TextQuoteSelector` in the sidecar) and "moving" it is just a
data update with no document mutation at all. §4.3/§4.3a (Excel) has the same gap for repointing a
legacy Note from one cell to another. T11's task row (`...build-design.md:1179`) lists only "Docx
write: add/reply/resolve"; T13's row (`:1181`) lists only "Xlsx write: `.note` add/reply/resolve" —
neither mentions `MoveComment`, and neither task's pinning-test list includes a move/repoint case
for its format. T21's cross-platform parity guard (§9.3) likewise only exercises "an
add+reply+resolve sequence" (`...build-design.md:1319-1320`) — repoint on a native format is absent
from the ONE test that would have caught its absence.

If T11/T13 are built exactly as scoped, `MoveComment` on a Word- or Excel-backed comment has no
implementation to dispatch to at all — a silent gap, not a documented one, since §5's own text
asserts it already works "identically." This is exactly the shape of gap R6 exists to prevent
("nothing is silently lost"): the assistant decides to repoint a comment after fixing the text it
pointed at, calls `MoveComment` on what happens to be a Word- or Excel-backed comment, and there is
no code path in this design's own task breakdown that implements it.

Fix: add an explicit fourth step to §3.3 specifying the Word range-relocation algorithm (remove the
existing `w:commentRangeStart`/`End` pair and `w:commentReference` run, re-run `resolveSelector`
(§2.2) against the CURRENT `document.xml` text for the new anchor, insert a new range pair there,
keep the same `w:id`/`w15:paraId` and existing replies/resolve state untouched) and a mirroring step
in §4.3/§4.3a for repointing a Note to a different `[sheet, cell]` pair. Add both to T11/T13's task
descriptions and pinning-test lists, and add a repoint case to T21's parity guard so cross-platform
agreement on this operation is actually checked, not just add/reply/resolve.

Triage:

## Summary

**2 findings: 2 blocker, 0 major, 0 minor.**

No other new defects found. This round independently re-verified that round 1 and round 2's
blocker/major fixes (path containment's full-realpath algorithm, lock-path canonicalization against
the project root only, the `kind:'chat'` grammar form, the wire-grammar escaping rule, the xlsx
OOXML four-piece enumeration, the fixture-staleness self-check, the remote-server watch relay, the
rollback-to-UI contract, the safe dependency-install path, and per-task worktree isolation) still
match the real code cited for each. Both findings above are new: the design's storage architecture
(§1.3's deliberate move to one-sidecar-per-file) creates an id-to-file lookup requirement that no
call surface, task, or precedent in the codebase actually satisfies (F1); and `MoveComment`'s
claimed format-independence (§5) is not backed by any specified algorithm or task scope for either
native format (F2). Both are blockers because, as currently written, a subagent building T1/T3/T8/
T9a (F1) or T11/T13 (F2) exactly to spec would produce code that cannot perform the operation the
design claims it performs — not an edge case, but the ordinary case for `reply`/`resolve`/`reopen`
on any comment not already cached in the acting process (F1), and for any `MoveComment` call on a
Word/Excel-backed comment at all (F2).
