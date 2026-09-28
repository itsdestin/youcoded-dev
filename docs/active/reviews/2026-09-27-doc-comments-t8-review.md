---
status: active
date: 2026-09-27
reviewer: adversarial review (read-only), fresh session
scope: T8 only — commits 067af27269 (six native tools) and 06f5fcb9b (permission baseline)
verified: `cd desktop && npx vitest run tests/doc-comments-tools.test.ts tests/permission-engine.test.ts tests/tool-registry-manifest.test.ts` → 3 files, 67 tests, all green
---

# T8 review — document-comment native tools + permission baseline

Read-only review. No files edited, nothing committed or stashed. Scope: the two named
commits against `docs/active/specs/2026-09-26-doc-comments-build-design.md` §5/§5.2a
(option 1, decided) and the T8 task-table row (~line 1611).

## Summary verdict

The core product decision — "ask before changing comments only on Word/Excel files, at
the same tier as Edit/Write" — is implemented correctly and consistently. I could not find
a way to make a comment mutation touch real `.docx`/`.xlsx` bytes without either (a) the
ask firing in `ask` mode, or (b) the write actually landing in the inert JSON sidecar
instead of the real file. The two mechanisms that decide "is this a Word/Excel target"
(the permission gate's `*.docx`/`*.xlsx` glob, and `nativeFormatFor`'s dispatch decision)
are driven by the exact same string and the same case-insensitive extension check, so they
cannot disagree with each other for any input I could construct.

The real findings are about **things a security bypass would need but that aren't
reachable today**, plus two **user-visible gaps**: the Settings screen miscategorizes
these tools' remembered grants, and two test `describe` blocks violate the workspace's own
test-naming rule.

## Findings

### F1 (major, user-visible) — remembered grants for all six tools show under "Other" in Settings → Permissions

**File:** `desktop/src/renderer/components/permissions/describe-rule.ts:203-226`

`KIND_BY_TOOL` maps `Bash`→commands, `Edit`/`Write`/`NotebookEdit`→files, `WebFetch`/
`WebSearch`→connections, `Task`→commands. It has **no entry** for `ReadFileComments`,
`ReplyToComment`, `ResolveComment`, `ReopenComment`, `AddComment`, or `MoveComment`, so
`ruleKind()` (line 221-226) falls through to the `other` catch-all for every one of them.

This matters specifically because of what T8/the permission-baseline commit just built:
a remembered "Always allow" for one of the five mutation tools can **only** ever be
created for a Word/Excel target (the plain-text case is baseline-allowed and never
prompts, so no "Always allow" button is ever shown for it). Every real grant a user can
create for these tools is, by construction, "let the assistant write into this specific
Word/Excel file's real bytes" — functionally identical to a remembered Edit/Write grant
on that same file. Today it shows in the same "Other" bucket as things like a specialist
grant or an unrecognized future tool, not under "File changes" next to the Edit/Write
grant on the same file, even though `broadNote()` and the whole point of this screen (per
`.claude/rules/native-permissions.md` and the screen's own module comment, lines 181-187)
is "let someone scanning 'File changes' find the thing they regret approving." A user
auditing what the assistant can do to their Word file will not find this grant where they'd
look for it.

**Fix:** add the five mutation tools to `KIND_BY_TOOL` as `'files'` (matching Edit/Write —
they write real file bytes when they have a pattern at all). `ReadFileComments` can stay in
`other` (or move to `files` too, for consistency) since it never mutates anything and a
remembered rule for it should be rare to nonexistent. This is a one-line-per-tool fix with
no logic change.

### F2 (minor, latent — not exploitable today) — `child-permissions.ts`'s read-only-charter check doesn't know about the five mutation tools

**File:** `desktop/src/main/harness/specialists/child-permissions.ts:18-19`

```ts
const WRITE_TOOLS = new Set(['Write', 'Edit', 'Bash']);
```

This set is what stops a read-only specialist from calling a tool that changes something
real (`buildChildDecide` step 2). The five comment-mutation tools write directly into a
Word/Excel file's own XML/note bytes when targeted at one (§3.3/§4.3a) — functionally the
same class of write as `Edit`. They are absent from `WRITE_TOOLS`.

**Why this is not exploitable right now:** a specialist's `allowedTools` is filtered
against `NATIVE_CHILD_TOOLS` (`desktop/src/main/harness/specialists/definition-files.ts:18`
— `['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'TodoWrite']`)
for file-defined specialists, and against a hardcoded list for every built-in
(`specialists/builtins.ts:123,135,147,159` — none of which name any doc-comments tool).
Neither list was updated by T8, so a specialist — built-in or file-defined — cannot
currently be granted any of the six tools at all; `buildChildDecide` step 1 (`tool not in
allowlist`) refuses them before step 2's charter check is ever reached. I confirmed this by
reading both gating lists; it isn't inferred.

**Why it's still worth recording:** if a future task (T9a's MCP surface reaching
specialists, or a deliberate decision to let specialists comment) adds these tools to
`NATIVE_CHILD_TOOLS`/a builtin's `allowedTools` without also updating `WRITE_TOOLS`, a
read-only specialist would silently gain the ability to mutate a real Word/Excel file's
bytes — exactly the charter violation `child-permissions.ts`'s own module comment says is
the whole point of that file to prevent ("a definition that lists a write tool under a
read-only charter is a bug in the definition, and this is where that bug stops being
exploitable"). Recommend a one-line addition (`'ReplyToComment', 'ResolveComment',
'ReopenComment', 'AddComment', 'MoveComment'` to `WRITE_TOOLS`) now, cheaply, so this isn't
a landmine for whoever does that later — it costs nothing today since these tools aren't
reachable by a specialist anyway.

### F3 (minor, test hygiene) — two `describe` titles violate the workspace's own test-naming rule

**File:** `desktop/tests/doc-comments-tools.test.ts:132,241`

```
describe('path containment refusal at the tool-argument surface (review 3, F1 / review 2, F1)', ...)
describe('a comment never list()-ed in THIS process is still reachable by {path, commentId, ...} alone (review 3, F1)', ...)
```

`.claude/rules/test-suite-hygiene.md` ("A test lives with its feature and is named for its
behaviour"): *"Titles state behaviour: no dates, §, task ids or review rounds."* Both
titles are otherwise good (they do state the behaviour), but the trailing `(review 3, F1
...)` citations are exactly what that rule says to leave out — the parenthetical review
citations belong in the surrounding comment (which the file already has, correctly, above
each `describe`), not in the test name itself. Low severity, cosmetic, easy to fix by
deleting the parenthetical from the two title strings.

### F4 (low severity, correctness/UX only — not a permission bypass) — `nativeFormatFor` is a naive string check, so an unusual path can silently miss the real file

**File:** `desktop/src/main/doc-comments/doc-comments-dispatch.ts:59-64`

```ts
export function nativeFormatFor(filePath: string): NativeFormat | null {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.docx') return 'docx';
  if (ext === '.xlsx') return 'xlsx';
  return null;
}
```

I looked hard for a way to use this to make a mutation land in the real Word/Excel file
while the ask-gate thinks it's a plain-text target (the classic "path the tool normalizes
differently from the permission subject" bypass shape). **I could not construct one**,
because `doc-comments-tools.ts`'s `permissionSubject` and its `execute()` both call
`targetFormat()` → `nativeFormatFor()` on the exact same `args.path` string — there is no
point where one call site sees a resolved/realpath'd path and the other sees the raw one.
A `.docm`/`.xlsm` (macro-enabled) target, an uppercase extension, a Windows path, and a
symlink were all traced through by hand: extension case is normalized before comparison
(so `BRIEF.DOCX` is native on both sides), `.docm`/`.xlsm` are simply never treated as
native by either side (they fall to the plain-text sidecar path on both sides too — a
scope gap for macro-enabled Office files, not a bypass), and a symlink is resolved by
`doc-comments-store.ts`'s own `realpathWithNonexistentTail`/`checkContainment` (lines
84-119) which runs **inside `execute()`**, after the ask has already fired based on the
unresolved extension — but since a symlink's target extension can differ from the link's
own name (e.g. `report.docx` symlinked to `real.txt`), the ask-gate would see `.docx` (ask)
and the store could then successfully write a JSON sidecar comment for what's actually a
`.txt` file behind the link (an ask fires when arguably none was needed) — the reverse
direction of a bypass (over-asking), not the dangerous one (under-asking), so I'm not
raising it as a security finding, just noting the asymmetry exists.

The one path I could not fully rule out relates to Windows' own trailing-dot/space
filename stripping (`report.docx.` / `report.docx ` on disk resolve to `report.docx` in
the Win32 API `fs.realpath` eventually calls). `path.extname('report.docx.')` returns `.`,
not `.docx`, so `nativeFormatFor` calls this non-native on **both** the ask-gate and the
write-dispatch side — consistent, so still not an ask/write mismatch — but if
`realpathWithNonexistentTail` (called only on the plain-text sidecar path, not on the raw
string) resolves the trailing-dot path down to the real `.docx` file's realpath on Windows,
the result is a JSON sidecar comment created next to a real Word file whose actual
`comments.xml` was never touched and never asked about, because the whole request was
dispatched as plain-text. This is a data-integrity/UX bug (a comment silently goes into a
side channel instead of the real file, or vice versa surfaces nowhere in the Word comments
UI) rather than a permission bypass — the ask-gate and the write both agree it's "not
native," they just may be wrong about that once the OS's own filename normalization is
factored in. I was not able to verify this against a live Windows filesystem from this
Linux session; flagging it as unverified, not confirmed.

**Suggested fix (optional, low priority):** if this is worth closing, `nativeFormatFor`
could realpath the target before checking its extension the same way `doc-comments-store`
already does for containment, so the extension check and the containment check see the
same resolved path. Not blocking — I'd file this as a roadmap item rather than a build
blocker for T8, since it requires a Windows-specific filename quirk to reach and every
path this session could reproduce dispatched consistently.

## What I checked and found solid

- **`ctx.cwd` project-root jail** (`doc-comments-tools.ts:83-86`, `gateProjectRoot`): every
  one of the six tools always calls the store/dispatch functions with
  `projectRoot: ctx.cwd` — never `undefined` — so the model can never reach the
  loose-file/no-project fallback path via a native tool call, and `locateInProject`'s
  realpath-full-path containment check (`doc-comments-store.ts:170-193`) refuses any
  `path` (relative escape, absolute path outside cwd, or symlink resolving outside cwd)
  before any read or write happens. I ran the existing symlink-escape test
  (`doc-comments-tools.test.ts:171-196`) and traced the containment logic by hand; it
  matches the design's review-2/F1 "realpath the full joined path" fix, not the weaker
  root-only check the design explicitly warns against.
- **Permission-subject / dispatch consistency**: `permissionSubject` and `execute()` in
  every one of the five mutation tools call `targetFormat(args.path)` — the identical
  function on the identical string — so the ask decision and the actual write dispatch
  can never disagree about whether a given call's target is "Word/Excel" for that call.
- **The `*.docx`/`*.xlsx` glob** (`permission-types.ts:241-250`) compiles through
  `subjectMatches` (`subject-glob.ts:18-22`) to `^[\s\S]*\.docx$` case-insensitively —
  verified this matches a relative path, an absolute path, a Windows backslash path, and
  an uppercase extension, and confirmed by the passing
  `permission-engine.test.ts:210-215` test.
- **Last-match-wins / remembered-rule precedence**: `decidePermission` concatenates
  preset → mode → deny-list → remembered, last match wins (`permission-engine.ts:32-48`).
  A remembered "Always allow" for one exact Word file beats the mode-baseline ask
  (`permission-engine.test.ts:238-243`), and a remembered deny for one exact file beats
  the plain-text pattern-less allow that precedes it in the same mode layer
  (`permission-engine.test.ts:231-236`) — both tested against the real `rulesForMode()`
  output, not a hand-rolled stand-in.
- **`AddComment`'s description text** is byte-identical to the spec's verbatim "sparingly"
  wording (§5.1); pinned by `doc-comments-tools.test.ts:260-269`.
- **Plan mode / other `PermissionMode` values**: not applicable to these tools.
  `NativePermissionMode` (`permission-types.ts:7`) is `'ask' | 'auto-edit' | 'full-auto'`
  only — `'plan'` belongs to the separate PTY-scraped Claude Code mode
  (`desktop/CLAUDE.md`'s `PermissionMode`), which these native-harness tools do not run
  under at all. `rulesForMode`'s switch is exhaustive over the three real values, so there
  is no fourth, unhandled case silently falling through.
- **The workspace cwd-jail floor** (`harness-session.ts:3941-3981`): the five mutation
  tools are not in `NON_PATH_SUBJECT_TOOLS` (`harness-session.ts:61-69`), so a Word/Excel
  path also passes through `checkPathGuard`'s secret-path deny and external-directory ask
  *before* `decidePermission` even runs — a second, independent layer on top of the
  store's own containment refusal. One quirk I noticed but am not flagging as a bug: if a
  model names a path outside `ctx.cwd`, `checkPathGuard` can raise an "outside your
  workspace, allow?" card, but even if the user clicks yes, `doc-comments-store`'s
  containment check still hard-refuses it afterward (since `execute()` always resolves
  against `ctx.cwd`, never the externally-approved directory) — the ask is a dead end for
  this tool family specifically, unlike Edit/Write where approving it actually lets the
  write through. Not a security issue (it fails closed, just confusingly), so I'm noting
  it rather than filing it as a finding.
- **Renderer store staying in sync**: T8's tools call the exact same
  `doc-comments-store.ts`/`doc-comments-dispatch.ts` functions the IPC handlers already
  use (not a second implementation), and the existing chokidar-based watch
  (`doc-comments/ipc-handlers.ts:273+`) watches by filesystem path, not by writer identity
  — so a native-tool-triggered mutation should reach an open renderer window through the
  same `docComments:changed` broadcast any other writer's change would. I did not run the
  live app to confirm this (per this session's read-only/no-live-app instructions); this is
  a code-reading conclusion, not an observed one.
- **No invented error causes**: every refusal string T8 returns
  (`path-outside-project`, `unknown-project-root`, `comment-not-found`, etc.) is a typed
  refusal threaded straight from the store/dispatch layer, never a guessed cause. These are
  model-facing tool-result strings (not the renderer's `<ErrorState>` UI), and match the
  existing style of `edit.ts`/`write.ts`'s own error text.
- **No WHY comments missing**: every non-obvious decision in `doc-comments-tools.ts`
  (why `ctx.cwd` is passed as both `projectRoot` and its own extra root, why the
  permission split is by format, why `AddComment`'s text is verbatim) carries an inline
  WHY comment citing the spec section it implements.
- **Tests actually exercise the claims**: ran the three named suites myself —
  `tests/doc-comments-tools.test.ts`, `tests/permission-engine.test.ts`,
  `tests/tool-registry-manifest.test.ts` — 3 files, 67 tests, all passing. The permission
  tests call the real `rulesForMode()`/`decidePermission()`, not a mock of either, and the
  containment tests use real temp-directory symlinks/escapes rather than asserting against
  a stubbed containment function.

## Not reviewed (out of scope for this task)

- T9a (the Claude Code MCP surface for these six tools) has not landed yet — no commit for
  it exists on this branch — so Claude Code CLI sessions currently have no doc-comment
  tools at all, native or MCP. Nothing to review there yet.
- The underlying docx/xlsx read/write correctness (T10-T13) and the anchoring/detached-state
  logic (T14) are unchanged by T8 and were not re-reviewed here.

## Triage (2026-09-27)

F1–F4 all accepted and fixed in youcoded 62c3cf7bd.
