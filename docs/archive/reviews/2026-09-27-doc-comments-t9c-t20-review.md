---
status: shipped
---

# Adversarial review — T9c/T20 (Android doc-comments MCP asset + pending-mutation queue)

Reviewed read-only against `youcoded` worktree branch `session/comments-mock-a`, commit
`627ca7426`. Spec: `docs/archive/specs/2026-09-26-doc-comments-build-design.md` §5.2a, §5.3, §9.
No files were edited. `JAVA_HOME=/usr/lib/jvm/java-21-openjdk ANDROID_HOME=$HOME/.android-sdk
./gradlew testDebugUnitTest -x bundleWebUi --tests '*DocComments*' --tests '*ClaudeCode*'` was
run for evidence only — **BUILD SUCCESSFUL, 95/95 tests green** across
`DocCommentsPendingQueueTest` (13), `DocCommentsPermissionTest` (13), `DocCommentsGateTest` (11),
`DocCommentsDispatchTest` (13), `DocCommentsBridgeTest` (16), `DocCommentsStoreTest` (21),
`ClaudeCodeDocCommentsMcpTest` (4), `ClaudeCodeMcpTest` (4) — counts read from
`app/build/test-results/testDebugUnitTest/TEST-*.xml`, not inferred from BUILD SUCCESSFUL alone.

Files read in full: `app/src/main/kotlin/com/youcoded/app/doccomments/{DocCommentsPendingQueue,
DocCommentsPermission,DocCommentsMcpNames,DocCommentsGate}.kt`,
`app/src/main/kotlin/com/youcoded/app/runtime/{ClaudeCodeDocCommentsMcp,ClaudeCodeMcp,PtyBridge,
SessionRegistry,ManagedSession}.kt` (relevant sections), `app/src/main/kotlin/com/youcoded/app/
parser/HookEvent.kt`, `app/src/main/assets/{doc-comments-mcp.js,hook-relay-blocking.js}`, plus
targeted reads of `Bootstrap.kt` (homeDir) and `desktop/src/main/claude-code-doc-comments-mcp.ts`
(deploy function) for cross-platform comparison. Test files skimmed for coverage shape, not
read line-by-line. Desktop's own adversarial review
(`docs/archive/reviews/2026-09-27-doc-comments-t9ab-review.md`) was read first and used as the
baseline Android must not regress.

---

## 1. CRITICAL — the per-session secret token that authorizes the pending-mutation queue is stored in a plaintext file any Bash call from the SAME session (or any other session) can read, defeating the entire "nothing planted before the session existed can supply the token" defense

**Files:** `app/src/main/kotlin/com/youcoded/app/runtime/ClaudeCodeDocCommentsMcp.kt:100-131`
(`deploy()` — `randomHex(16)` token at line 114, written unprotected via `configFile.writeText(...)`
at line 120, no `chmod`/`setReadable` call anywhere in the file);
`app/src/main/kotlin/com/youcoded/app/runtime/Bootstrap.kt:86` (`val homeDir: File get() =
File(context.filesDir, "home")` — **one** `$HOME` for the entire app, shared by every Claude Code
session the user has ever opened, current or past); `PtyBridge.kt:163` (`mobileDir = File(bootstrap
.homeDir, ".claude-mobile")` — the doc-comments deploy directory hangs directly off that single
shared home); `DocCommentsPendingQueue.kt:234-281,289-381` (`handleRequestFile`/`applyRequest` —
the token match is the *only* authorization check; neither function consults Claude Code's live
`permission_mode` or any other gate before calling `addNativeDocxComment`/etc.).

This file's own header (lines 34-40) states the token's purpose: "a value generated fresh at THIS
session's own spawn time... which nothing planted before the session existed can possibly supply."
That claim is only true for a file planted **before any session with a token exists** — e.g. a
`.docx` sitting in a freshly cloned repo. It is **false** for the threat scenarios the sibling
desktop file's own header names as the reason the token exists in the first place: "the same
Claude Code session's own Bash/Write tools," "a malicious skill/plugin," and "a compromised
dependency" — all of these run **inside** an already-live session, with the same filesystem access
as any other code in that session, and `$HOME/.claude-mobile/claude-code-doc-comments-mcp/
<sessionId>/mcp-config.json` sits in exactly that filesystem, holding the token in plain JSON.

**Concrete failure scenario** (no live device needed to establish this — it follows directly from
reading the code): a session opens a project. The model's own Bash tool (or a malicious skill file
committed to that project and given to Claude to run, or a compromised npm/pip package a Bash
command installs and executes) runs:

```sh
cat ~/.claude-mobile/claude-code-doc-comments-mcp/*/mcp-config.json
```

This is an ordinary, unprivileged file read — nothing about it is blocked by Android's app
sandbox (every Claude Code session on the device runs as the **same** app UID, so there is no
per-session isolation the way there is between two different apps) and nothing about it requires
defeating the containment/gate logic this feature is otherwise careful about. The read yields the
live `serverId` and `token` for this (or any other currently open) session. The attacker then
writes, directly, with no MCP tool call and no `PermissionRequest` hook ever firing:

```sh
id=$(cat /proc/sys/kernel/random/uuid)
cat > ~/project/.youcoded/comments/.pending/$id.json <<EOF
{"id":"$id","kind":"add","format":"docx","path":"Contract.docx",
 "projectRoot":"/whatever","token":"<token read above>",
 "selector":{"kind":"text","selector":{"type":"TextQuoteSelector","exact":"...","prefix":"","suffix":"","occurrence":0}},
 "text":"forged comment","author":"assistant","createdAt":$(date +%s%3N)}
EOF
```

`DocCommentsPendingQueue`'s 250 ms poller picks this up, `hasValidToken` passes (the token is
correct — it was read, not guessed), and `applyRequest` calls `addNativeDocxComment` on the real
file's real bytes — **in `default`/`plan`/any permission mode**, with **no prompt of any kind**,
because nothing in `handleRequestFile`/`applyRequest` ever consults `permission_mode` or re-runs
`DocCommentsPermission.shouldAutoApproveDocComment`. This is strictly *worse* than calling
`AddComment` as a real MCP tool against the same target: a real tool call at least reaches Claude
Code's own `PermissionRequest` hook first (and, for a Word/Excel target outside a frictionless
mode, would have to stop and ask a human) — the forged-file path skips that hook categorically.
It is also invisible in the ordinary sense a user would notice: the transcript shows (at most) a
`Write` tool call to a path under `.youcoded/comments/.pending/`, not anything that reads as a
document mutation.

**This is not an Android-introduced regression** — the identical structural gap exists on desktop:
`desktop/src/main/claude-code-doc-comments-mcp.ts:908-951` (`deployClaudeCodeDocCommentsMcp`) also
writes its config/token with `fs.writeFileSync(configPath, ..., 'utf8')` and no `chmod`, into a
directory under Electron's own userData dir — any Bash command run by any Claude Code session
under the same OS user account can read it the same way. The desktop adversarial review
(`2026-09-27-doc-comments-t9ab-review.md`) did not catch this: its finding #2 covers a *different*
risk (a same-named MCP server declared elsewhere), not "the model's own Bash tool can read its own
session's token file." I could not find this scenario addressed, tested, or even mentioned in
either platform's review or tests. Filing it here since this session's task is the Android review,
but it is a whole-feature design gap, not something T9c/T20 uniquely caused.

**Why this matters given the design's own stated intent:** §5.2a's entire premise is that
Word/Excel mutations "must prompt like Edit/Write." The token was the mechanism that was supposed
to make the pending-mutation queue safe to leave un-gated by any second permission check, on the
theory that only a legitimately-approved MCP tool call could ever produce a valid request. That
theory only holds if the token is inaccessible to anything except the MCP script process itself —
and it demonstrably is not, given the token's storage location is inside the one shared,
fully-Bash-readable home directory every session (including the attacking one) already has
complete access to.

**Recommended directions (a product/security decision for Destin, not something to patch
unilaterally in a read-only review):**
1. **Defense in depth, most tractable:** have `DocCommentsPendingQueue.applyRequest` independently
   re-check Claude Code's own live `permission_mode` for the owning session (the same value
   `DocCommentsPermission.shouldAutoApproveDocComment` already reads from the `PermissionRequest`
   hook) before applying a docx/xlsx mutation, refusing (or holding for a real prompt) outside a
   frictionless mode — this doesn't stop the token from being *read*, but it removes the "total,
   silent bypass of every permission check" property: a forged request could then never do more
   than a legitimately-authorized one already could in that session's current mode.
2. Treat the token as what it actually is — a shape/diagnostics field, not a security boundary —
   and be explicit in the header comments about what it does and doesn't defend against (today it
   overclaims "nothing planted... can possibly supply" without qualifying that a *live* session's
   own Bash access is a separate, unclosed case).
3. A stronger (harder) fix would bind a pending-mutation request to the specific, already-approved
   `tools/call` that produced it (e.g., a nonce Claude Code's own approved call path could carry
   through) rather than a static bearer secret readable by anything with filesystem access — this
   is a bigger design change and likely deserves its own dedicated pass rather than a patch here.

---

## 2. MEDIUM (latent, not currently reachable) — `mobileSessionId ?: "no-session-id"` reintroduces the exact fixed-path collision shape desktop's own fix (finding #2) already closed

**File:** `app/src/main/kotlin/com/youcoded/app/runtime/PtyBridge.kt:217-225` (the doc-comments
deploy call passes `mobileSessionId ?: "no-session-id"` as the per-deployment directory name).

`ClaudeCodeDocCommentsMcp.deploy()` needs a **unique** per-session directory precisely because it
carries a secret (this file's own header, and `ClaudeCodeDocCommentsMcp.kt:19-31`, explicitly
reasons about this: "Android's `mobileSessionId` already exists before this function is ever
called, so no race exists here to design around"). That reasoning is only correct because
`SessionRegistry.createSession()` (the sole current call site, confirmed by
`rg -n "PtyBridge\("`) always supplies a fresh `java.util.UUID.randomUUID().toString()` — never
null. But `PtyBridge`'s own constructor still declares `mobileSessionId: String? = null` as a
defaulted, nullable parameter, and `start()` silently substitutes the literal string
`"no-session-id"` rather than refusing to deploy. If any future caller (a test harness, a new
ephemeral-session type, a refactor that reuses this constructor with its default) ever constructs
a `PtyBridge` without an explicit id, and two such sessions are live concurrently, both would
write to the exact same `claude-code-doc-comments-mcp/no-session-id/` directory — the identical
"two sessions... overwrote the SAME fixed `mcp-config.json` path before either's spawned CLI
necessarily read it" race desktop's own triage found and fixed by moving to a per-serverId
subdirectory (see the T9a/T9b review's triage section for finding #2). Currently dead code (only
one call site, always non-null) — not exploitable today — but it is a landmine the desktop fix's
own reasoning was specifically designed to rule out, and here it is silently possible again via a
default parameter instead of a compile-time guarantee. Separately, `startDocCommentsQueue()`
(`PtyBridge.kt:136-143`) does `val id = mobileSessionId ?: return` — so a session that actually hit
this path would deploy a working (but collision-prone) MCP config, yet never start its own queue
entry, meaning its own requests would permanently fail `invalid-request-token` (a correctness bug
compounding the collision risk, not an additional security hole).

**Fix:** make `mobileSessionId` a required, non-nullable constructor parameter (there is no
legitimate PTY-backed Claude Code session without one), or have `ClaudeCodeDocCommentsMcp.deploy`
refuse (return `null`, its existing "best-effort" failure mode) when handed an empty/placeholder id
rather than accepting a shared literal.

---

## 3. LOW — per-session doc-comments deploy directories are never cleaned up, growing without bound and leaving historical tokens/server ids on disk indefinitely

**Files:** `PtyBridge.kt:392-408` (`stop()` — cancels the pending-mutation queue ref via
`DocCommentsPendingQueue.stop(id, root)` but never deletes `File(mobileDir,
"claude-code-doc-comments-mcp/$mobileSessionId")`); no counterpart to `sweepStaleResults`
(`DocCommentsPendingQueue.kt:399-415`) exists for the deploy directory itself.

Every session ever opened leaves its own `mcp-config.json` (with its now-inert, since no `Entry.
refs` map holds it once the session's ref is dropped, but still legible) sitting under
`~/.claude-mobile/claude-code-doc-comments-mcp/<uuid>/` forever. Not independently exploitable —
once a session ends, its token is no longer valid for `hasValidToken` since no live `Entry` carries
it — but it is exactly the class of unbounded litter the workspace's own test-hygiene standard
calls out elsewhere in this same feature (the `.result.json` sweep this commit itself added), and
it also means Finding #1's live-exploit window (read the token, forge a request) has a much longer
list of past `serverId` values sitting around for anyone doing recon, even if only the currently
live one is actually usable. **Fix:** delete the per-session directory in `PtyBridge.stop()`
alongside the existing `DocCommentsPendingQueue.stop()` call.

---

## 4. Verified clean — items this task asked to hunt for, checked and found sound

- **Unknown/malformed `kind`:** `DocCommentsPendingQueue.kt:299-380` is a `when` with an explicit
  `else -> ... "unknown-mutation-kind"` (line 379) — never falls through to `move`. Matches
  desktop's fixed state; `DocCommentsPendingQueueTest.kt` exercises this.
- **Stale `.result.json` sweep:** `sweepStaleResults` (`DocCommentsPendingQueue.kt:399-415`,
  `STALE_RESULT_MS` = 1 hour) runs on watcher start and after every handled request — matches
  desktop's fixed `STALE_RESULT_MS`/`sweepStaleTmp` shape.
- **Freshness margin:** `isFreshEnough`-equivalent check at `DocCommentsPendingQueue.kt:241-246`
  (`mtime < entry.startedAt - FRESHNESS_MARGIN_MS`) is honestly documented in the file's own header
  as weak-alone (a `git clone` stamps a planted file's mtime as "now") — the token is correctly
  described as the intended real boundary, though Finding #1 above shows that boundary itself is
  weaker than claimed.
- **Root gate / realpath containment:** `DocCommentsPendingQueue.start()` (`:122-178`) realpaths
  the project root itself, refuses the bare OS tmpdir, and calls the SAME
  `refuseUnknownProjectRoot` every other doc-comments surface on Android uses
  (`DocCommentsGate.kt:76-85`) before creating a watcher entry; `applyRequest` always receives
  `entry.realRoot`, never `req.projectRoot` (`DocCommentsPendingQueue.kt:269`, comment at
  `:283-288` states this explicitly) — matches desktop's fixed finding #1 shape.
- **`ManagedSession`'s `PermissionRequest` OR-ing:** `ManagedSession.kt:242-253`
  (`docCommentsApprove || categoryApprove`) cannot approve a non-doc-comment tool, because
  `shouldAutoApproveDocComment` (`DocCommentsPermission.kt:78-91`) independently gates on
  `toolName in DocCommentsMcpNames.mutatorTools(serverId)` using **this session's own**
  `bridge.docCommentsServerId` — a different session's server id, or a tool from an unrelated MCP
  server, never matches. Confirmed by reading both functions side by side; no cross-session or
  cross-tool leakage found.
- **`permission_mode` parsing / fail-closed:** `HookEvent.kt:147-148` reads `permission_mode` as
  `null` when absent or JSON-null; `DocCommentsPermission.kt:84,90` treats a `null` `serverId` OR a
  `null` `permissionMode` (for a native target) as "don't know, don't approve" — never guesses.
  `hook-relay-blocking.js` (`:29-40`) forwards Claude Code's whole hook payload verbatim (only
  adding `mobileSessionId`/`claudePid`), so if the CLI's payload includes `permission_mode`, it
  reaches `HookEvent.fromJson` unmodified — same mechanism as desktop's `main.ts`, same residual
  "not independently verified against a live captured payload" caveat desktop's own
  `cc-dependencies.md` entry already carries.
- **Symlink fail-safe:** `DocCommentsPermission.kt:54-62` (`isPathItselfASymlink`) and the MCP
  script's own dispatch (`doc-comments-mcp.js`, every operation's `nativeFormatFor(located.
  sourceAbsolutePath)` — e.g. lines 356, 378, 403, 426, 449, 473) both decide from a *resolved*
  path, matching desktop's finding #5 fix (already landed on both platforms per the T9a/T9b
  review's own addendum).
- **Combined `--mcp-config`/`--allowedTools` flag:** `PtyBridge.kt:194-239` builds one combined
  flag pair from `mcpConfigPaths`/`allowedToolNames` lists (SendUserLink first, doc-comments
  second), matching desktop's session-manager.ts fix shape. `ClaudeCodeMcp.deploy` no longer
  returns its own `--mcp-config`/`--allowedTools` fragment directly — `ClaudeCodeMcp.kt:33-43`
  documents exactly why (the combiner needs the raw config path). Verified SendUserLink still gets
  its `TOOL_NAME` appended to the same `allowedTools` list (`PtyBridge.kt:206-209`) — not dropped.
  No shell-quoting risk found: every path fed into the combined flag string
  (`mobileDir`/`serverFile`/`configFile` absolute paths) is built from fixed, non-user-controlled
  segments (`context.filesDir`-rooted paths plus a UUID) — the one genuinely user-influenced value,
  the project's `cwd`, is passed to `TerminalSession` as a structured argument and to
  `ClaudeCodeDocCommentsMcp.deploy` only as a JSON env value, never string-interpolated into the
  `launchCmd` shell command itself.
- **MCP script under Termux node — `/tmp`/lock-dir availability:** `doc-comments-mcp.js` never
  references the OS temp directory (`os.tmpdir()`/bare `/tmp`) at all — every temp file
  (`atomicWrite`'s `target + '.' + pid + '.' + Date.now() + '.tmp'`,
  `submitPendingMutation`'s `requestPath + '.' + pid + '.tmp'`) is written **next to its own final
  target** inside the project's own `.youcoded/comments/` tree, which already has to exist and be
  writable for the feature to work at all. This sidesteps the whole class of Android
  `TMPDIR`/Bionic-`/tmp` concerns `docs/android-runtime.md` warns about elsewhere — confirmed by
  reading the full script, not assumed.
- **Byte-identical asset / message parity:** `ClaudeCodeDocCommentsMcpTest.kt` and
  `desktop/tests/claude-code-doc-comments-mcp.test.ts:547-561` both assert the TS-embedded
  `DOC_COMMENTS_SERVER_JS` constant is byte-identical to `app/src/main/assets/doc-comments-mcp.js`
  — confirmed green in this session's own test run, so every message/timeout-wording parity
  question is guaranteed by construction rather than needing a manual diff.

---

## Summary for follow-up

| # | Severity | One-line |
|---|---|---|
| 1 | Critical | The pending-mutation queue's per-session secret lives in a plaintext file inside the one `$HOME` every session shares — any in-session Bash call can read its own (or another live session's) token and forge a docx/xlsx mutation with zero permission prompt in any mode. Not Android-specific; present on desktop too, and not previously flagged. |
| 2 | Medium (latent) | `mobileSessionId ?: "no-session-id"` fallback in `PtyBridge.start()` reintroduces the fixed-path collision shape desktop's own finding #2 fix closed — dead code today (single call site always supplies a real id), but not compile-time-guaranteed. |
| 3 | Low | Per-session doc-comments deploy directories (config + token) are never deleted on session end — unbounded litter, and more historical secrets left readable than necessary. |

Findings 2 and 3 are small, mechanical fixes. Finding 1 is a design-level question about what the
token can and can't be trusted to do — recommend surfacing it to Destin before deciding how much
to invest in a fix, the same way the desktop review's own finding #2 was left as a flagged,
unresolved residual risk rather than patched unilaterally.

---

## Housekeeping

Read-only per this task's instructions: no source files were edited, no scratch test files were
created, nothing was committed or stashed. `git status` was clean (`nothing to commit, working
tree clean`) before this review and remains so after — confirmed with a final `git status` below.

---

## Triage (Destin, 2026-09-27)

**Finding #1 — rejected as filed; treated as cheap hardening, not the real boundary.**
Anything able to read the token file and write a forged pending-mutation request (the session's
own Bash/Write tools, a malicious skill file it runs, a compromised dependency it executes — all
same-uid code inside the ALREADY-LIVE session) can already rewrite the target `.docx`/`.xlsx`
directly, with no token and no queue involved at all. The token was never a boundary against that
class of actor; it stops a request PLANTED before this session existed (nothing before spawn time
could know it) and a request from a DIFFERENT session/process that was never handed it. Separately,
in `default` permission mode, that same same-uid Bash/Write access would itself trigger an ordinary
`PermissionRequest` prompt before it could touch the file the "long way" either — so the forged-
request path is not even a strictly worse outcome than what that code could already do. The
recommended defense-in-depth fix (re-checking `permission_mode` inside the queue's own applier) is
**not** being made: it doesn't close the actual gap (the token is still readable by the same code
that could bypass it entirely another way) and adds real complexity (a second permission-mode read
path, a second place that can disagree with the hook-driven one) for a property this design was
never actually relying on. What IS being done, because it is real, cheap, and costs nothing to get
right: owner-only permissions (0700 dir / 0600 config, on both platforms) so a rooted device, an
`adb run-as` shell, or a backup/extraction tool that bypasses the app's own permission model
entirely doesn't get a free read of a still-live token purely because nothing ever restricted the
file. This reasoning now also lives as a WHY note beside the token's own generation in both
`desktop/src/main/claude-code-doc-comments-mcp.ts` and `app/src/main/kotlin/com/youcoded/app/
runtime/ClaudeCodeDocCommentsMcp.kt`.

**Finding #2 — fixed.** `ClaudeCodeDocCommentsMcp.deploy()` no longer takes a `mobileSessionId`
parameter at all; its directory is now keyed on the same freshly-minted `serverId` desktop already
uses (`deployClaudeCodeDocCommentsMcp`), so no caller mistake (a future default, a test harness, a
refactor) can reintroduce a fixed, collision-prone path — the uniqueness guarantee no longer depends
on anything a caller supplies.

**Finding #3 — fixed, both platforms.** Every deploy directory is deleted on that session's own
`stop()`/`session-exit` (Android: `PtyBridge.stop()`; desktop: `ipc-handlers.ts`'s
`doc-comments-mcp-attached`/`session-exit` wiring, extracted to `desktop/src/main/doc-comments/
session-lifecycle.ts` to keep `ipc-handlers.ts` under its own line budget). A crash or kill that
skips that delete is caught by a once-per-process startup sweep on the next deploy
(`ClaudeCodeDocCommentsMcp.sweepStaleDeploysOnce` / `claude-code-doc-comments-mcp.ts`'s own
`sweepStaleDeploysOnce`), safe because no in-memory queue state from a previous process life could
still reference a leftover directory.

No entry existed in `docs/cc-dependencies.md` or `docs/PITFALLS.md` for file-permission hardening
on this token file specifically (checked directly); none was added — the WHY notes beside token
generation on both platforms are judged sufficient for this narrow, cheap-hardening fix, and
`cc-dependencies.md`'s existing "doc-comments PermissionRequest auto-approve gate" entry already
covers the `permission_mode`/threat-adjacent territory that IS load-bearing.

**Verification:** `bash scripts/verify.sh` — all checks green (types, full test suite 13,714+ tests,
knip, lint, design lint, ast-grep). `JAVA_HOME=/usr/lib/jvm/java-21-openjdk ANDROID_HOME=$HOME/
.android-sdk ./gradlew test -x bundleWebUi` — BUILD SUCCESSFUL, 509 tests × 3 variants (debug/
releaseTest/release) = 1,527 total, 0 failures, 0 errors (counts read from `app/build/test-results/
*/TEST-*.xml`). `./gradlew :app:assembleReleaseTest -x bundleWebUi` — BUILD SUCCESSFUL. Fixes
committed to `youcoded`'s `session/comments-mock-a` branch with explicit paths; this review file
itself was edited but deliberately NOT committed, per instruction.
