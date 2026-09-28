---
status: active
---

# Adversarial review — T9a/T9b (doc-comments Claude Code MCP + pending-mutation queue)

Reviewed read-only against `youcoded` worktree branch `session/comments-mock-a`, commits
`95db76e75` (T9a/T9b) and `568985ac6` (accept-edits permission_mode follow-up). Spec:
`docs/active/specs/2026-09-26-doc-comments-build-design.md` §1, §5 (esp. §5.2a, decided
option 1), §9. No files were edited; `npx vitest run tests/claude-code-doc-comments-mcp.test.ts
tests/pending-mutation-queue.test.ts tests/permission-auto-approve.test.ts` was run for
evidence only — **51/51 passed**.

Files read in full: `desktop/src/main/claude-code-doc-comments-mcp.ts`,
`desktop/src/main/doc-comments/pending-mutation-queue.ts`,
`desktop/src/main/permission-auto-approve.ts`, `desktop/src/main/doc-comments/doc-comments-dispatch.ts`,
`desktop/src/main/doc-comments/doc-comments-gate.ts`, `desktop/src/main/doc-comments/doc-comments-store.ts`
(relevant sections), `desktop/src/main/artifacts/cas-write.ts`,
`desktop/src/main/harness/tools/doc-comments-tools.ts`, `desktop/src/shared/doc-comments-{mcp,types}.ts`,
`desktop/src/main/session-manager.ts` (spawn section), `desktop/src/main/ipc-handlers.ts` (queue wiring),
`desktop/src/main/main.ts` (hook handler), `desktop/tests/pending-mutation-queue.test.ts`,
`desktop/tests/claude-code-doc-comments-mcp.test.ts`, `docs/cc-dependencies.md` (T9a/T9b entries).

---

## 1. CRITICAL — the pending-mutation queue trusts the request file's own self-reported `projectRoot`, reintroducing the exact escape a prior review blocker (F1) closed everywhere else

**Files:** `desktop/src/main/doc-comments/pending-mutation-queue.ts:87-89` (`applyRequest`'s
`const base = { path: req.path, projectRoot: req.projectRoot }`), consumed by
`desktop/src/main/doc-comments/doc-comments-dispatch.ts:113-123,189-199,268-301`
(`resolveDocxTarget`/`resolveXlsxTarget`/`listNativeComments`, all call `resolveSourceFilePath`
with `args.projectRoot`), which resolves in
`desktop/src/main/doc-comments/doc-comments-store.ts:178-193` (`locateInProject`):

```ts
async function locateInProject(projectRoot: string, filePath: string) {
  let realProjectRoot: string;
  try { realProjectRoot = await fs.realpath(projectRoot); } catch { return {ok:false, error:'path-outside-project'}; }
  const abs = path.resolve(realProjectRoot, filePath);
  const realAbs = await checkContainment(realProjectRoot, abs);
  ...
```

`locateInProject` verifies that `path` resolves **inside whatever `projectRoot` string it is
handed** — it does zero validation that `projectRoot` itself is a folder the app recognizes or
that the caller is entitled to name. That's exactly the hole
`desktop/src/main/doc-comments/doc-comments-gate.ts` was written to close (its own header,
verbatim): *"a caller naming `projectRoot: '/'` ... made that containment check a no-op ...
every docComments:* channel could then create/mutate a sidecar anywhere on disk, and — for a
`.docx`/`.xlsx` target — made the main process read and parse ANY such file on the machine."*
`refuseUnknownProjectRoot` (`doc-comments-gate.ts:47`) is the fix, and it **is** called by
`ipc-handlers.ts`, `remote-server.ts`, and the native T8 tool
(`harness/tools/doc-comments-tools.ts:98-101`, `gateProjectRoot`) before any of those three
surfaces touch a docx/xlsx target.

**`pending-mutation-queue.ts`'s `applyRequest` never calls `refuseUnknownProjectRoot`, and never
compares `req.projectRoot` against the `realRoot` the watcher itself already computed and is
scoped to** (`startPendingMutationQueue`, line 183-186, `fs.realpath(projectRoot)`). It builds
`base.projectRoot` straight from the untrusted JSON file's own `projectRoot` field
(`shared/doc-comments-types.ts:114-119` even documents this field as "passed through," never
re-verified) and hands it to `addNativeDocxComment`/`addNativeXlsxComment`/etc., which write real
document bytes.

**Concrete failure scenario:** the deployed MCP script always writes the *correct*
`located.realProjectRoot` (claude-code-doc-comments-mcp.ts:380, `projectRoot:
located.realProjectRoot` — derived from its own trusted `YOUCODED_PROJECT_ROOT` env var, never
model input) — so through the *intended* call path this is inert. But the queue is a bare,
unauthenticated filesystem drop-box: **anything else that can place a file under
`<project>/.youcoded/comments/.pending/<uuid>.json`** — the same Claude Code session's own
Bash/Write tools (ordinary file-write permission, unrelated to the docx/xlsx gate this feature
exists to enforce), a malicious skill/plugin, a compromised dependency, or a file **already
sitting in a cloned/downloaded project folder before the user ever opens it** — can write:

```json
{"id":"<uuid>","kind":"add","format":"docx","path":"Contract.docx",
 "projectRoot":"C:\\Users\\destin\\Documents\\Contracts","commentId":null,
 "selector":{...},"text":"forged comment","author":"assistant","createdAt":0}
```

`startPendingMutationQueue` uses `chokidar.watch(pendingDir, { ignoreInitial: false, ... })`
(pending-mutation-queue.ts:213-220) — **`ignoreInitial: false` means a file already present in
`.pending/` when the watcher starts is processed immediately**, with no session, no MCP tool
call, and no permission prompt of any kind ever involved. `startPendingMutationQueue` runs for
**every** `provider === 'claude'` session (`ipc-handlers.ts:808-811`), which is the normal case
for opening a project. Net effect: **planting one file inside a project folder is enough to make
YouCoded silently write an attacker-chosen comment into an attacker-chosen `.docx`/`.xlsx` file
anywhere the app process can reach**, the instant a Claude Code session is opened on that folder
— completely bypassing §5.2a's entire "Word/Excel mutations must prompt like Edit/Write" design
intent, because the request never goes through a `PermissionRequest` hook at all.

**Test coverage confirms the gap, not just theorizes it:** every case in
`tests/pending-mutation-queue.test.ts` builds its request with `projectRoot: realRoot` (the
helper `writeRequest`, line 55-65, always uses the same `realRoot` the queue is watching) — there
is no test where a written request's `projectRoot` differs from the entry's own watched root, so
this exact escape has never been exercised, let alone guarded.

**Fix:** `applyRequest`/`handleNewRequest` must ignore `req.projectRoot` for authorization
purposes and instead resolve `req.path` against the `Entry`'s own known `realRoot` (already in
scope at the call site — `startPendingMutationQueue`'s closure), the same way every other
doc-comments surface pins the root it trusts rather than the root a caller names. At minimum,
refuse any request whose `projectRoot` doesn't realpath-equal the entry's `realRoot`. Separately,
consider not processing pre-existing `.pending/` files at watcher start (or require
`createdAt` to postdate watcher start) so a planted file can't fire on session open before any
tool call happens at all — this second mitigation is defense in depth once the root pinning
above is fixed, not a substitute for it.

---

## 2. HIGH (unverified against a live CLI — flagged honestly, not a confirmed exploit) — auto-approve matches purely on the composed tool-name string, with no check on which server actually answers it

**Files:** `desktop/src/main/permission-auto-approve.ts:55,111-121` (`DOC_COMMENTS_MUTATOR_TOOL_SET`,
`shouldAutoApproveDocComment`), `desktop/src/shared/doc-comments-mcp.ts:32-51`
(`DOC_COMMENTS_MCP_SERVER_ID = 'youcoded-doc-comments'`, composed as
`mcp__youcoded-doc-comments__<Tool>`).

`shouldAutoApproveDocComment` decides purely from `event.payload.tool_name` — a string — matching
it against the `DOC_COMMENTS_MCP_MUTATOR_TOOLS` set by exact text. There is no cross-check that
the call actually reached the app's own deployed `claude-code-doc-comments-mcp.js` (e.g. by PID,
by a per-session secret embedded at spawn, or otherwise). `DOC_COMMENTS_MCP_SERVER_ID` is a public
string in this open-source repo, not a secret.

If Claude Code's own config precedence ever lets a **project-level `.mcp.json`** (checked into an
untrusted repo the user opens) or another `--mcp-config` source declare a server also named
`youcoded-doc-comments` exposing tools also named `AddComment`/`ReplyToComment`/etc. — with an
arbitrary, attacker-controlled implementation and an arbitrary `inputSchema` — the composed
hook tool name `mcp__youcoded-doc-comments__AddComment` would be indistinguishable to
`shouldAutoApproveDocComment` from the app's own tool. If that attacker-controlled tool's
`tool_input.path` doesn't end in `.docx`/`.xlsx`, `shouldAutoApproveDocComment` auto-approves it
unconditionally — silently granting a completely different, untrusted implementation a free pass
through this app's own permission hook, for whatever that tool actually does.

**This session could not verify** (no paid live `claude -p` run authorized) whether Claude Code's
config-merge order would let a project `.mcp.json` collide with the app's `--mcp-config`-supplied
entries this way, or whether CC's own "new/untrusted MCP servers" consent flow would intercept it
first. Flagging this the same way the commits themselves flag comparable unknowns
(`docs/cc-dependencies.md`'s own "Not independently verified" entries) — but note the
auto-approve code provides **no** defense either way: it was written to trust the string alone.
**Recommend:** offer to verify server-identity precedence with Destin before relying further on
this mechanism, and/or scope the auto-approve match to a value that isn't just the public,
guessable server id (e.g. a per-install or per-session token folded into a private tool-name
suffix would at least raise the bar, though it wouldn't fully close a config-precedence hijack).

---

## 3. MEDIUM — an unrecognized or malformed `kind` silently falls through to a `move` mutation instead of an honest refusal

**File:** `desktop/src/main/doc-comments/pending-mutation-queue.ts:88-129` (`applyRequest`):

```ts
if (req.kind === 'list') {...}
if (req.kind === 'add') {...}
if (req.kind === 'reply') {...}
if (req.kind === 'resolve') {...}
if (req.kind === 'reopen') {...}
// 'move'
const args = { ...base, id: req.commentId!, newSelector: req.newSelector! };
const result = format === 'docx' ? await moveNativeDocxComment(args) : await moveNativeXlsxComment(args);
```

Every branch is an `if`, not `else if`/`switch`, and the final block has **no `kind === 'move'`
check at all** — any request whose `kind` is missing, misspelled, or simply not one of the five
named values (a bug in a future caller, a truncated/corrupted JSON write racing the rename, or a
forged request per Finding 1) is silently treated as a `move`. `req.commentId!`/`req.newSelector!`
are non-null *assertions*, not runtime checks, so a request lacking those fields passes `undefined`
straight into `moveNativeDocxComment`/`moveNativeXlsxComment`. The surrounding `try/catch` in
`handleNewRequest` (line 163-168) prevents this from crashing the watcher, but the caller (the MCP
script, and ultimately the model) receives whatever raw exception message the docx/xlsx move path
happens to throw for an `undefined` selector, rather than an honest, typed
`{ok:false, error:'unknown-kind'}` — a small instance of the workspace's own "never invent an
error cause" standard being violated by omission (an *un*-invented, JS-internal message
substituting for a clear one). **Fix:** make the `move` branch an explicit
`if (req.kind === 'move') {...} else { return {ok:false, error:'unknown-mutation-kind'}; }`.

---

## 4. MEDIUM — `.pending/*.result.json` accumulates forever when nobody ever polls it, and the honest timeout message overpromises "try again"

**Files:** `desktop/src/main/claude-code-doc-comments-mcp.ts:398-421` (`poll()`),
`desktop/src/main/doc-comments/pending-mutation-queue.ts:137-139,162-170` (`writeResult`,
`handleNewRequest`).

`handleNewRequest` deletes the **request** file after applying it (line 170), but the **result**
file is only ever deleted by the MCP script's own successful `poll()` (claude-code-doc-comments-
mcp.ts:400-407, `fsp.unlink(resultPath)` on the success branch). If the MCP script has already
given up — its own 8s timeout elapsed (line 410-416), or the whole Claude Code CLI process (and
this MCP child) was killed because the user closed the app or ended the session before the main
process finished applying a slow request — the main process still eventually writes
`<id>.result.json`, and **nothing ever deletes it**: no sweep, no TTL, no size cap exists anywhere
in this feature (confirmed by search: no other reference to `.pending` in `src/main` implements
cleanup). Over the life of a project this is small-file litter that only grows, never shrinks —
the same class of "test-suite-hygiene" concern this workspace's own rules call out for other
subsystems (`docs/PITFALLS.md`'s stale-tmp precedent, mirrored by `cas-write.ts`'s own
`sweepStaleTmp`, which this queue's result-file path has no equivalent of).

Separately, the timeout's own user/model-facing text (claude-code-doc-comments-mcp.ts:411-415):

> `timed-out — YouCoded did not finish applying this within 8s. It may still complete; try
> ReadFileComments again in a moment.`

is accurate for a slow-but-alive app, but if the real cause is "the app was closed," retrying can
never succeed — no invented cause, but a mildly misleading implied remedy for the case that most
plausibly triggers a real 8-second timeout in practice (nothing is watching to ever explain
otherwise). **Fix:** add a bounded sweep for orphaned `.result.json` files older than some
threshold (mirroring `cas-write.ts`'s `sweepStaleTmp`/`STALE_TMP_MS` pattern, e.g. run it opportunistically
inside `handleNewRequest` or on watcher start), and soften the timeout message to not assert a
specific remedy ("It may still be running, or YouCoded may not be open" reads as more honest than
guaranteeing "try again in a moment" always helps).

---

## 5. LOW / informational — a symlinked or extension-disguised Word/Excel file is treated as plain text consistently, but silently detaches the comment from the real document

**Files:** `desktop/src/main/claude-code-doc-comments-mcp.ts:175-180` (`nativeFormatFor`),
`desktop/src/main/permission-auto-approve.ts:111-121` (`shouldAutoApproveDocComment`).

Both the permission check and the MCP script's own operation dispatch compute `nativeFormatFor`
from the **caller-supplied path string itself** (never a realpath'd target) — this is
deliberately consistent (the same function, same input, in both places), so a `.txt` symlink
pointing at a real `.docx` does **not** create a prompt/write mismatch: both sides agree it's
"plain," so the write only ever lands in the inert JSON sidecar
(`.youcoded/comments/notes.txt.json`), never the real document's bytes. This is *not* a privilege
escalation — verified by reading both the permission gate and the dispatch code side by side and
confirming they call the identical function on the identical string. It is, however, a product
surprise worth a line in a known-limitations note: a user who renames/symlinks a Word file with
a non-Word extension (or hits case/trailing-dot edge cases outside the platform this repo already
special-cases) gets comments silently redirected to a shadow sidecar that never surfaces in the
real docx viewer, with no error telling them why. Given this only reaches an inert app-internal
file, not the real document, this is not urgent — noted for completeness since the task explicitly
asked about disguising a Word file as plain.

---

## 6. Product-rule spot check — plain/markdown/code vs Word/Excel prompting

Traced end-to-end and confirmed by direct code reading (not simulated): `shouldAutoApproveDocComment`
(permission-auto-approve.ts:111-121) returns `true` unconditionally whenever
`nativeFormatFor(path) === null` — i.e. every non-`.docx`/`.xlsx` target, in every permission
mode, matching §5.2a's decided intent exactly. For a `.docx`/`.xlsx` target it returns `true`
only when `permissionMode` is `'acceptEdits'` or `'bypassPermissions'`; `'plan'`, `'default'`,
`'dontAsk'`, `'auto'`, an unrecognized string, and an absent field all fall through to the
ordinary ask (`permissionMode !== undefined && FRICTIONLESS_DOC_COMMENT_MODES.has(...)` — a
missing field short-circuits to `false`, never guessed as approved). `nativeFormatFor` lowercases
the extension and, on `process.platform === 'win32'` only, strips trailing `.`/` ` before
extracting it — identically duplicated between `permission-auto-approve.ts`'s consumer
(`doc-comments-dispatch.ts`'s copy, imported) and the hand-copied MCP script's own copy
(claude-code-doc-comments-mcp.ts:171-180) — confirmed byte-for-byte equivalent logic, so the two
processes can't disagree about a given path. `permission-auto-approve.test.ts` (51 total tests
across the three files, all green) exercises every named mode plus a missing-field case and two
realistic full-payload shapes — this part of the design is solid and well-tested.

---

## 7. What's done well (for balance)

- The pending-mutation queue's request write (atomic tmp-then-rename) and the JSON sidecar's
  mkdir-lock mutex are faithful, correctly-scoped ports of `cas-write.ts`'s real algorithm
  (`acquireLock`/`atomicWrite`/`mutateFileUnderLock`), with matching constants
  (`LOCK_RETRY_MS`/`LOCK_MAX_WAIT_MS`/`LOCK_STALE_MS`) — the "novel work, not a port" framing
  in the commit message is accurate and the implementation actually delivers cross-process
  exclusion between the MCP script and the main process over the same sidecar path.
- `cc-dependencies.md`'s new `permission_mode` entry is honestly hedged (explicitly names what
  was verified — the CLI binary's embedded schema — versus what wasn't — a real captured
  `PermissionRequest` payload for an MCP tool specifically), consistent with this workspace's
  own evidence standards.
- The refcounted watcher lifecycle (`startPendingMutationQueue`/`stopPendingMutationQueue`,
  keyed by realpathed project root, gated to `provider === 'claude'` only) is correctly wired to
  `session-created`/`session-exit` in `ipc-handlers.ts` rather than `session-manager.ts`'s
  `createSession`, for the stated reason (avoiding a watcher leak into
  `session-manager.test.ts`'s shared tmpdir) — read and confirmed accurate.
- The bare-OS-tmpdir guard (`pending-mutation-queue.ts:190-202`) is a real, previously-bitten
  test-hygiene class this change correctly defends against.
- The dependency-free MCP script genuinely avoids template literals/backticks throughout (verified
  by reading the full `String.raw` block) and uses only `fs`/`path`/`crypto` — no Node-native
  modules — so it is structurally Termux/Android-ready for a future byte-identical T9c asset,
  though this session did not and could not test it under Termux itself.
- Tests (51/51 across the three targeted files) are real, not vacuous: they round-trip through
  the actual `docx-comments.ts` reader/writer against a real `.docx` fixture, not a mock, and the
  refcounting/malformed-request/reply-forwarding cases each assert genuine before/after state.

---

## Summary for follow-up

| # | Severity | One-line |
|---|---|---|
| 1 | Critical | Pending-mutation queue trusts a forgeable `projectRoot` field instead of its own watched root; pre-existing planted files apply on session start with zero prompt |
| 2 | High (unverified) | Auto-approve matches only the composed tool-name string; a same-named MCP server from elsewhere would be indistinguishable |
| 3 | Medium | Unrecognized `kind` silently executes as `move` instead of refusing |
| 4 | Medium | `.pending/*.result.json` never cleaned up; timeout message overpromises "try again" |
| 5 | Low/info | Symlink/extension-disguised Word file is consistently treated as plain (no bypass, but silently detaches the comment) |

Findings 1 and 3 are directly actionable in this codebase today; 2 needs a live-CLI check before
deciding how much to invest in a fix; 4 and 5 are small, well-scoped cleanups.

---

## Triage (2026-09-27, follow-up commit(s) on session/comments-mock-a)

- **#1 (Critical) — FIXED.** `pending-mutation-queue.ts`'s `applyRequest` now takes the watcher's
  own verified `entry.realRoot` as an explicit parameter and never reads `req.projectRoot` for
  authorization (the field is kept on the wire, now documented as advisory-only). Every request
  must additionally carry a per-session secret (`req.token`, `YOUCODED_MCP_TOKEN` env var, minted
  fresh per `deployClaudeCodeDocCommentsMcp` call, compared via `crypto.timingSafeEqual` against
  every session currently sharing that project's queue) — a request with a missing or wrong token
  is refused (`invalid-request-token`), never applied. `startPendingMutationQueue` also now runs
  `refuseUnknownProjectRoot` on its own root before creating a watcher (mirrors T8's own
  `gateProjectRoot` shape). Added a defense-in-depth freshness check (`isFreshEnough`, a request
  file's own mtime vs. the watcher's start time, ±5s margin) so a file already sitting in a project
  before the watcher starts is never processed even if it somehow carried a valid-looking payload —
  documented as weak ALONE (git checkout stamps a planted file's mtime as "now") since the token is
  the real boundary. **Found and fixed a second, related bug while writing this fix's own tests**:
  the chokidar `'add'` listener was registered AFTER awaiting the watcher's `'ready'` event, so a
  request written in the genuine cold-start race the code's own comment described (the MCP script's
  first write landing before this queue was ready) was silently dropped — the listener is now
  registered before that await. Tests: 12 new cases in `pending-mutation-queue.test.ts` (forged
  `projectRoot` against a decoy project with different content, forged `projectRoot` naming a
  nonexistent directory, wrong token, missing token, a second session's own valid token still
  accepted, a pre-planted back-dated request never firing, a genuine cold-start race still firing).
- **#2 (High) — MITIGATED, evidence documented, residual gap explained.** Could not verify Claude
  Code's exact same-name MCP server config-merge precedence without a paid live CLI run (unchanged
  from the original finding). What IS fixed: `deployClaudeCodeDocCommentsMcp` now mints a fresh
  random `mcpServers` config key per deployment (`youcoded-doc-comments-<8 hex chars>`) instead of
  the fixed, public `youcoded-doc-comments` constant; `shouldAutoApproveDocComment` takes that id as
  an explicit parameter (looked up per session in `main.ts`, via the SAME private
  `doc-comments-mcp-attached` event finding #1's token rides on) and fails closed when it has no
  record for the calling session. This closes the "checked into a repo ahead of time" version of
  the risk structurally — nothing can predict a value generated fresh after the session already
  started. **Residual risk, explicitly not closed and not claimed to be**: a same-named collision
  from a server declared or modified AFTER this session's id becomes known to it (a more
  sophisticated, real-time attack) is not addressed and would need the live-CLI verification the
  original finding asked for; documented in `cc-dependencies.md`. Bounded, per the original
  finding's own framing: auto-approve for a colliding tool masquerading as a plain-text target still
  only ever lets that tool's OWN implementation run un-prompted — it grants no access to this app's
  real Word/Excel write path, sidecar store, or any other tool. Found and fixed a related bug while
  adding this: two sessions created close together previously overwrote the SAME fixed
  `mcp-config.json` path before either's spawned CLI necessarily read it (mirrors claude-code-mcp.ts's
  SendUserLink shape, which has no per-session secret to protect and so never needed this) — the
  doc-comments deploy now uses a per-serverId subdirectory. Tests: session-manager.test.ts's own
  "two sessions... get DIFFERENT doc-comments server ids and tokens" case caught the collision
  before this file's fix landed; claude-code-doc-comments-mcp.test.ts's own "two deployments... never
  collide" case pins it directly. Plus permission-auto-approve.test.ts cases for a tool name composed
  under a different session's id, and a session with no recorded id at all.
- **#3 (Medium) — FIXED.** `applyRequest`'s `move` branch is now `if (req.kind === 'move') {...}
  else return {ok:false, error:'unknown-mutation-kind'}` — never a fall-through default. Tests: a
  bogus `kind` value (confirmed it does NOT silently move the target comment — the comment's
  original selector is asserted unchanged afterward) and a request missing `kind` entirely.
- **#4 (Medium) — FIXED, both halves.** Added `sweepStaleResults` (mirrors `cas-write.ts`'s own
  `sweepStaleTmp`/`STALE_TMP_MS` shape, 1-hour threshold) run opportunistically on watcher start and
  after every handled request — an orphaned `.result.json` (the MCP script gave up, or its whole
  process was killed) no longer accumulates forever. Softened the timeout message from "It may
  still complete; try ReadFileComments again in a moment" (asserts a specific remedy) to "It may
  still be running a slow operation, or YouCoded may not be open" (states only what's actually
  known). Tests: two new cases in pending-mutation-queue.test.ts (sweep on watcher start, sweep
  after handling a real request; a fresh result file is left alone in both).
- **#5 (Low/info) — NOT implemented; reporting why, per this task's own "or report why not."** A
  faithful fix means resolving symlinks (via the same realpath-with-nonexistent-tail machinery
  `doc-comments-store.ts`'s containment check already uses) BEFORE computing `nativeFormatFor`, on
  BOTH the permission-check path and the dispatch path, including the native T8 tools that share the
  same by-extension decision. The dispatch side has a resolved absolute path available late (after
  containment); the PERMISSION side does not — `permission-auto-approve.ts` is a deliberately pure,
  synchronous, filesystem-free function (`main.ts`'s hook handler calls it inline, before responding
  to a blocking hook), and it has no project root at all to resolve a relative `tool_input.path`
  against safely (the hook payload's own `cwd` field could supply one, but wiring that in makes this
  function asynchronous and filesystem-touching for the first time, a bigger behavioral change to a
  hot, shared permission path than this finding's own LOW/informational severity — "not a privilege
  escalation," per the review's own words — seems to justify on its own). `doc-comments-store.ts`
  (containment/locate logic) and `doc-comments-tools.ts` (native T8) are also outside this task's
  file ownership per its own coordination note, and `doc-comments-store.ts` is presently under
  active, uncommitted, unrelated edits by another concurrent session. Given the review's own
  assessment — never a bypass, both sides already agree consistently, worst case is a silently
  mis-routed comment landing in an inert sidecar rather than the real document — this reads as a
  product-polish/UX-surprise item (should the app instead show an error telling the user their
  Word file has a non-Word extension?) better suited to a deliberate design decision than a
  find-and-patch fix bolted onto a shared, hot permission path under concurrent-editing constraints.
  Recommend filing as a roadmap item for a dedicated pass once the concurrent docx/xlsx work lands.

- **#5 (Low/info) — FIXED for a resolvable path, in a later session on this same branch
  (2026-09-27, commit 38c74c268), once the concurrent docx/xlsx work above had landed.** The
  format decision now runs on the RESOLVED real path (following any symlink) at every dispatch
  site: `doc-comments-store.ts`'s new `resolveNativeFormat` (reusing `resolveSourceFilePath`'s
  own containment realpath) replaces `nativeFormatFor` in `ipc-handlers.ts`, `remote-server.ts`
  and the store's own `resolveWatchTarget`; the deployed Claude Code MCP script now decides from
  `located.sourceAbsolutePath` (it already computed this value, just wasn't using it); Android's
  `DocCommentsDispatch.kt`/`DocCommentsBridge.kt` mirror the same fix. For the two genuinely
  constrained sites this triage's own paragraph named: `doc-comments-tools.ts`'s
  `permissionSubject` (no ctx/cwd on its frozen signature) now resolves and gates correctly for
  an ABSOLUTE symlinked path — the common case this triage worried about (a real write with no
  ask) is closed for that shape — but a workspace-RELATIVE symlinked path is still judged on its
  own string (undocumented before, now an explicit, tested, accepted limitation, not silently
  reintroduced); `permission-auto-approve.ts` was fixed with the fail-safe direction instead of
  resolution, exactly as this paragraph anticipated: an absolute path that is itself a symlink
  never gets a free ride through the auto-approve hook, so it falls through to the ordinary ask
  rather than guessing. Path containment itself is unchanged everywhere — only which BRANCH a
  resolved path dispatches to. Tests added at every site named above (dispatch, native
  `permissionSubject`, auto-approve, the MCP script, Android's bridge). `bash scripts/verify.sh
  --full` and `./gradlew test -x bundleWebUi` (463 tests) both green afterward.

All five findings' own fixes are in desktop/src/main/{claude-code-doc-comments-mcp.ts,
doc-comments/pending-mutation-queue.ts, permission-auto-approve.ts, session-manager.ts,
ipc-handlers.ts, main.ts} and desktop/src/shared/{doc-comments-mcp.ts, doc-comments-types.ts}, with
tests in desktop/tests/{claude-code-doc-comments-mcp,pending-mutation-queue,permission-auto-approve,
session-manager}.test.ts. `bash scripts/verify.sh --full` shows three remaining failures, all
independently confirmed to be pre-existing, uncommitted, in-progress work by other concurrent
sessions (an xlsx-comments.ts rewrite and a docx-comments.ts/watcher/store change), not caused or
worsened by this pass: a type error and a comment-id-format regression in xlsx-comments.test.ts/
doc-comments-tools.test.ts, two test-title ast-grep violations in docx-comments.test.ts/
use-doc-comments.test.tsx, one new unused export in zip-size-guard.ts, and docx-comments.ts's own
line-budget entry (this pass's own ipc-handlers.ts/main.ts budget growth IS accounted for and
bumped).
