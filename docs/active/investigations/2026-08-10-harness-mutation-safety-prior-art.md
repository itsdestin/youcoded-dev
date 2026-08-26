---
status: active — partially consumed, one recommendation still open
date: 2026-08-10
---

> **Kept active 2026-08-10** (not archived alongside its sibling prior-art docs): most of
> this doc's findings were acted on in `integration/harness-spec` (Write got Edit's
> staleness guard, no-op edits say so, timeout exit representation, shell persistence), but
> its strongest recommendation — replacing Write's and Edit's **mtime** staleness check with
> a **content hash** (§1, citing Gemini CLI's SHA-256 and OpenCode V2's byte comparison) —
> was deliberately deferred; both tools still compare mtime today (`write.ts`, `edit.ts`),
> consistently, per an in-code WHY comment that treats hash as the correct long-term answer.
> This doc is that recommendation's justification — see the open ROADMAP item. Re-archive
> once the hash migration ships.
>
> **Re-verified 2026-08-26:** still correct to keep active. Both tools still compare mtime
> (`edit.ts:77`, `edit.ts:135`, `write.ts:55`, `write.ts:66`) and
> `git grep -n "createHash|sha256" origin/master -- desktop/src/main/harness/tools/` → **0 hits**.
> The recommendation IS tracked — `ROADMAP.md` → "Move Write's and Edit's staleness checks from
> mtime to a content hash" — so this is a live input to open work, not an unconsumed finding.

# Prior art for file-mutation safety and shell result metadata: what mature harnesses do

Research task: ground fixes for six measured problems in our native harness's Write/Edit guards
and Bash tool result metadata against what real agentic coding harnesses actually do. Claude Code
is the primary reference (our tool surface is deliberately CC-compatible); Codex CLI, OpenCode,
Aider, Cline, and Gemini CLI are secondary references. Every claim below is cited to a primary
source (official docs, GitHub source, a live issue/PR) or marked **not found** — nothing here is
an estimate presented as fact.

All six sub-investigations were run by independent research agents against current `main`/live
docs on 2026-08-10 (commit SHAs pinned per-harness in the footnotes where source was read
directly). Two harnesses (Codex CLI, OpenCode) have interesting internal splits — Codex has two
different exec tools with different persistence models; OpenCode has two parallel tool
implementations (V1 shipping, V2 in-progress) with materially different guards — both are called
out explicitly rather than flattened into one answer.

## Comparison table

| Harness | Write-overwrite guard | Edit read-requirement | Staleness check | No-op edit | Timeout exit representation | Shell persistence (cwd / env / session) |
|---|---|---|---|---|---|---|
| **Claude Code** | Session-membership only ("have you Read this path this session") — no mtime/hash freshness check [^cc-write] | Required for Opus 4.6/Haiku 4.5/older; newer models may edit an unread file if the read wouldn't need a permission prompt (v2.1.208+) [^cc-edit] | **Content-string matching** (`old_string` must match current disk content exactly/unambiguously), not mtime, not a whole-file hash [^cc-edit] | **Error**: `"Error: No changes to make: old_string and new_string are exactly the same."` [^cc-noop] | No sentinel exit code documented. Default behavior is **auto-background, not kill**: `"Command did not complete within its Ns timeout and was moved to the background."` A separate, undocumented bug path can propagate a real SIGTERM into exit 143 [^cc-timeout] | **cwd: yes** (persists, resettable via `CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR`) / **env: no** (docs state this explicitly) / one long-lived session for cwd+aliases, but the generic Anthropic API Bash-tool spec contradicts the env claim — a documented, open inconsistency [^cc-persist] |
| **OpenAI Codex CLI** | **Not found** — no guard of any kind; `apply_patch` reads the file fresh at apply time, no read-tracking, no mtime/hash [^codex-write] | Not enforced by any Read requirement; effectively content-context matching (patch hunks must find their context lines in the live file) [^codex-edit] | Content-based (context-line search), not mtime/hash [^codex-edit] | **Succeeds silently** — writes identical content, reports `"Success. Updated the following files:\nM <path>"`. Only a fully empty patch (zero hunks) errors [^codex-noop] | **Distinguished explicitly.** Internal `timed_out: bool` flag; normalized to conventional sentinel **exit 124**; message `"error: command timed out after {ms} ms"` / `"command timed out after {ms} milliseconds"` [^codex-timeout] | Two tools, different models: default `shell`/`shell_command` = **cwd: no, env: no**, fresh subprocess every call, `workdir` must be re-supplied [^codex-persist]. Separate `exec_command`+`write_stdin` = genuine **persistent PTY session** by `session_id`, for interactive workloads [^codex-persist] |
| **OpenCode** | V1 (shipping): **no code guard** — a real mtime-based guard (`FileTime`) existed and was deliberately deleted (April 2026); the tool's own prompt text still falsely claims "This tool will fail if you did not read the file first." V2 (in-progress): also no guard [^oc-write] | V1: not enforced (same stale prompt-text problem as write). V2: edit tool always self-reads at execute time [^oc-edit] | V1: **none**. V2: **content-hash-equivalent (raw byte comparison)**, but only across the tool's own internal read→approval→write window, not "did the model call Read" [^oc-edit] | **Error** in both V1 and V2: `"No changes to apply: oldString and newString are identical."` [^oc-noop] | V1: `exit: null` + prose `"shell tool terminated command after exceeding timeout..."`. V2: `exit` field omitted + `timeout: true` flag + `"Command timed out before completion."` Neither uses a numeric sentinel [^oc-timeout] | **cwd: no / env: no** in both V1 and V2 — fresh subprocess every call — **despite the tool description literally claiming** `"a persistent shell session"` (copied from Claude Code's own prompt text, never implemented) [^oc-persist] |
| **Aider** | Soft interactive confirm, default-yes (`"Allow edits to file that has not been added to the chat?"`), not a hard guard; separate git-dirty check auto-commits pre-existing uncommitted changes before applying an edit [^aider-write] | N/A — no persistent Read-tool state; every operation reads the file fresh from disk [^aider-edit] | **None as a distinct check** — "staleness" surfaces only indirectly, as an ordinary SEARCH/REPLACE match failure if disk content drifted [^aider-edit] | **No explicit check on the apply path** (writes anyway); a true no-op produces no git diff, which downstream reuses a generic, arguably-misleading message: `"I didn't see any properly formatted edits in your reply?!"` [^aider-noop] | **Not found — no timeout mechanism exists at all** in `run_cmd.py`; a hung command blocks indefinitely (open, unresolved feature request, issue #945) [^aider-timeout] | **cwd: no / env: no** — fresh subprocess per `/run`, cwd pinned to repo root every time [^aider-persist] |
| **Cline** | **No guard, no mtime/hash check.** Distinctive mitigation: a virtual-document diff preview is shown before the approval prompt, so the user reviews the real change before any write touches disk [^cline-write] | Not enforced in code | **None found** (the "modified since last read" string some models expected is not present in Cline; that phrasing is from an unrelated project) [^cline-edit] | **Succeeds** — writes identical bytes, reports success with an empty diff block [^cline-noop] | **Distinguished via separate error types.** `TimeoutError` (prose `"Command failed: Command timed out after {ms}ms"`, output discarded) vs. `CommandExitError` (`"[Command exited with code N]\n<output>"`, output preserved). No numeric sentinel for timeout [^cline-timeout] | **Two modes.** Default "vscodeTerminal" mode: **cwd: yes / env: yes** — reuses a real VS Code integrated terminal via shell integration (genuine session). Alternate "backgroundExec" mode: **cwd: no / env: no**, fresh subprocess [^cline-persist] |
| **Gemini CLI** | **No guard, no check.** Real-world breakage confirmed by a live issue where the model itself explained it clobbered a file because it "didn't know it replaced" the whole thing; issue closed with no code fix [^gem-write] | Advisory only (prompt text: *"Always use the read_file tool..."*), not code-enforced | **Content-hash (SHA-256)**, but only inside the self-correction fallback triggered after an initial match failure — not checked on every edit call [^gem-edit] | **Error**: `"No changes to apply. The old_string and new_string are identical in file: ..."` (`EDIT_NO_CHANGE`) [^gem-noop] | Distinguished via a separate `result.aborted` branch, prose-only: `"Command was automatically cancelled because it exceeded the timeout of X minutes without output."` Timeout is **inactivity-based** (no output for 300s default), not wall-clock. SIGTERM then SIGKILL after 200ms [^gem-timeout] | **cwd: no / env: no** — confirmed as an *intentional* design choice by a maintainer: `"it violates our security policy and our directory based session storage system"` [^gem-persist] |

## Six problems: recommendation + evidence

### 1. Write's guard is weaker than Edit's

**Evidence.** Claude Code's own Write guard is session-membership-only, with no freshness check —
confirmed against the live rejection text `"File has not been read yet. Read it first before
writing to it."`, which fires purely on "was this path ever Read this session," never on file
state [^cc-write]. This is a real gap in the reference implementation too, not something we
invented by deviating from it — but two other harnesses show what closing it looks like:

- **Gemini CLI's Edit tool** computes a **SHA-256 content hash** of the file at read time and
  compares it against a fresh on-disk hash before applying a self-corrected edit — explicitly
  commented in source as being there *"to keep from clobbering edits made outside our system"*
  [^gem-edit]. This is a hash comparison, not mtime.
- **OpenCode's V2 edit tool** (`FileMutation.writeIfUnchanged`) does the same thing via literal
  byte-array comparison under a per-path mutex, specifically to close the race between the tool's
  internal read and its internal write while a permission approval is pending — and its rejection
  message is exactly the shape we should copy: `"File changed after permission approval. Read it
  again before editing."` [^oc-edit]

Neither of these uses mtime. That's deliberate, not an oversight: mtime has two independent
failure modes a content check doesn't — a `touch`/checkout can bump mtime with unchanged bytes
(false positive), and some filesystems/clock resolutions can miss a true same-second change
(false negative). A hash answers the actual question ("are these the bytes I last saw") directly.

**Recommendation.** Give Write the same shape of guard Edit already has, but keyed to a **content
hash captured at Read time**, compared against a hash of the file on disk at Write time — not
mtime. Concretely: when Read runs, store a hash (SHA-256 is fine, matching Gemini CLI's choice)
alongside the "this path was read" flag already tracked for the session-membership check; at
Write time, if the path exists, re-hash it and reject on mismatch. Per this workspace's own
error-message standard (`docs/error-message-standards.md` — be specific and accurate, never a
guessed cause), the rejection message should name the tool, the reason, and the fix, not just
gesture at staleness. Something in the shape of:

> `Write rejected: config/settings.toml changed on disk since it was last read. Read it again before overwriting.`

This is more specific than Claude Code's own live collision message for Edit
(`"File has been unexpectedly modified. Read it again before attempting to write it."`
[^cc-edit]) — CC's version doesn't say *how* it detected the change, ours can, because we know our
own check is a hash, not a heuristic.

### 2. Read-before-edit consistency

**Evidence.** Grok's guess — "if you Read it, we fingerprint it; if you never Read it, Edit is
allowed" — turns out to be close to *Claude Code's own real, current (v2.1.208+) behavior*, not a
malfunction unique to some other harness. The official tools reference states it plainly: newer
models can edit a file they never read, provided the `old_string` match is exact/unambiguous and
reading the file wouldn't itself require a permission prompt; older models (Opus 4.6, Haiku 4.5)
still require the read unconditionally [^cc-edit]. So "enforce Read-first always" and "fingerprint
if read, otherwise allow" are not two competing designs we have to pick between in the abstract —
CC runs the *latter*, model-gated, and documents it as a v2.1.208 behavior change from the former.

**Recommendation.** This is a case where matching CC's *documented* semantics is very plausibly
the source of GPT 5.6 Luna's rejection and Kimi/Grok's success on the same battery — not a bug in
our enforcement, but different transcripts hitting different branches of a conditional rule that
isn't visible to the model. Two concrete fixes, not mutually exclusive:
1. **Put the actual rule in the tool description text**, not only in an external doc — the model
   deciding whether to call Read first needs to know the condition in-context. CC's own tool
   description for Edit doesn't fully spell this out either (per the docs excerpt, the nuance
   lives in the *docs site*, not confirmed in the live system prompt) — don't repeat that gap.
2. **Pick one deliberate scope for "unread edit is allowed"** — e.g., gate it on model tier the
   way CC does, or drop the exception entirely and always require Read-first (Claude Opus 4.6/
   Haiku 4.5's stricter behavior) — rather than have it fall out incidentally from whatever the
   fingerprint-tracking code happens to do. An inconsistent rule that isn't stated anywhere is the
   actual bug; a strict rule and a documented conditional rule are both fine.

### 3. No-op edit reports success

**Evidence.** Four of six harnesses treat `old_string == new_string` as an **error**, thrown before
any file I/O: Claude Code (`"Error: No changes to make: old_string and new_string are exactly the
same."` [^cc-noop]), OpenCode V1 and V2 identically (`"No changes to apply: oldString and newString
are identical."` [^oc-noop]), and Gemini CLI (`"No changes to apply. The old_string and new_string
are identical in file: ..."`, typed `EDIT_NO_CHANGE` [^gem-noop]). Two harnesses let it through
silently as a "successful" edit: Codex CLI (`apply_patch` writes the identical content and reports
`M <path>` [^codex-noop]) and Cline (writes identical bytes, reports success with an empty diff
[^cline-noop]) — and Grok's finding is exactly this second, minority shape.

**Recommendation.** Match the majority (and match Claude Code's own exact wording, since we're
CC-compatible by default): reject with an explicit pre-flight check before any write, using CC's
literal string —

> `Error: No changes to make: old_string and new_string are exactly the same.`

This is a same-day fix (a single equality check ahead of the existing match logic) and it is the
one recommendation in this document with the least ambiguity: three independent harnesses
converged on "error before write," none of the three worded it meaningfully differently, and it
directly answers Grok's ask ("should preferably say zero replacements so you know you botched the
args" — an error is a stronger, earlier signal than a zero-replacements success).

### 4. Timeout exit representation is opaque

**Evidence.** No harness surveyed reports a bare, undifferentiated exit code for a timeout — every
one that has a timeout at all (five of six; Aider has none, see below) puts timeout on a visibly
different path than a normal non-zero exit:
- **Codex CLI** is the most complete: an internal `timed_out: bool`, a dedicated `SandboxErr::Timeout`
  error variant, **and** a conventional sentinel (`exit 124`, matching GNU `timeout(1)`) for tooling
  that expects a number, plus explicit prose (`"command timed out after {ms} ms"`) for the model
  [^codex-timeout] — this is a genuine belt-and-suspenders design, not either/or.
- **Cline** uses two distinct exception *types* (`TimeoutError` vs. `CommandExitError`) so the
  branch itself is unambiguous in code, not just in string content, and *discards buffered output*
  on timeout specifically to make it visually distinct from a normal failing command's output
  [^cline-timeout].
- **OpenCode** and **Gemini CLI** both use an explicit boolean/null-sentinel-plus-flag rather than
  overloading the exit-code field: OpenCode V2's `timeout: true` with `exit` omitted entirely, and
  Gemini CLI's separate `result.aborted` branch [^oc-timeout] [^gem-timeout].
- **Claude Code's documented default isn't "kill" at all — it's auto-background**, and the message
  it surfaces (`"Command did not complete within its Ns timeout and was moved to the background"`)
  is prose, not a code [^cc-timeout]. If a command is actually killed (the documented
  `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` path, or the undocumented SIGTERM-propagation bug), no
  sentinel/signal-name convention is documented for that case either.

**Recommendation.** Copy Codex's combination, since it's the only one that serves both audiences
(a harness-side integration wanting a stable number, and the model wanting the reason). Report a
conventional sentinel exit code for tooling (**124**, the `timeout(1)` convention) *and* a distinct
`timeout: true`/reason field, *and* prose that states whether the kill was graceful or forced —
directly answering Opus's specific ask (*"whether the process died cleanly or was force-killed"*).
Concretely, on our SIGKILL-after-grace-period path: `exit 124 (timeout: command exceeded 3000ms,
killed with SIGKILL after a grace period)` — never a bare `exit ?` with no further signal.

### 5. Mid-chain shell failures are invisible

**Evidence.** This is not a gap unique to us — it's the *default behavior of every harness
surveyed*, and in Claude Code's case, a **declined feature request**: a GitHub issue asking
Anthropic to add `set -o pipefail` to the Bash tool was closed **"not planned"** [^cc-pipefail].
Codex CLI, OpenCode, Aider, Cline (POSIX shells), and Gemini CLI all confirmed via direct source
inspection to pass the model's command straight to `<shell> -c <command>` with no `-e`/`pipefail`
injected [^codex-pipefail] [^oc-pipefail] [^aider-pipefail] [^cline-pipefail] [^gem-pipefail]. The
one deliberate exception found anywhere is narrow and shell-specific: Cline injects
`if(-not $?){exit 1}` after the model's command, but **only for PowerShell**, as a targeted fix for
PowerShell's notoriously silent cmdlet-failure semantics — POSIX shells get no equivalent
[^cline-pipefail].

**Recommendation.** Don't change the shell invocation — turning on `pipefail`/`set -e` by default
would be an unforced deviation from both CC parity and unanimous industry practice, and it would
change behavior for scripts that *intentionally* chain with `;` expecting later commands to run
regardless of earlier failures. This is a documentation/prompt-wording problem, matching Grok's own
hedge ("something like ... would help" stated alongside "probably the right tradeoff" elsewhere in
the same battery). Two low-risk options, both wording-only: (a) state directly in the Bash tool
description that mid-chain failures in `;`-joined commands are not reported — mirroring OpenCode's
tool prompt, which explicitly tells the model `;` is for "sequentially but don't care if earlier
commands fail" and to use `&&` when it does care [^oc-pipefail]; (b) consider Cline's PowerShell
pattern as a model for *any* future targeted fix — inject a failure-surfacing wrapper only for a
shell family that's unusually bad at surfacing failures on its own, not universally.

### 6. cwd persists, env doesn't — is this the norm?

**Direct answer: no — full ephemerality (neither cwd nor env persists; both must be re-supplied
every call) is the more common pattern among the six harnesses surveyed, not CC's split.**
Breaking down what was actually found:

- **Fully ephemeral (4 of 6):** Codex CLI's default `shell`/`shell_command` tool (workdir must be
  re-passed every call, env rebuilt fresh) [^codex-persist]; OpenCode, both V1 and V2 (confirmed by
  reading the spawn call directly — no stored cwd, env rebuilt from `process.env` every call)
  [^oc-persist]; Aider (cwd pinned to repo root every `/run`, no env carryover) [^aider-persist];
  Gemini CLI (cwd resolved fresh from an optional param every call, and a maintainer confirmed on a
  live issue that this is *intentional*, tied to security policy and "directory based session
  storage system," calling persistent cd "a major major effort to support" [^gem-persist]).
- **Claude Code's split (cwd yes, env no) is real but is the outlier shape**, not the norm — and it
  isn't even internally consistent across Anthropic's own documentation: the generic Anthropic API
  Bash-tool spec (`bash_20250124`) states "your application keeps one bash process alive across
  tool calls, so ... environment variables ... are still there for the next command," directly
  contradicting Claude Code's own product docs ("Environment variables don't persist"). A live
  GitHub issue documents this exact contradiction between Anthropic's own two doc pages [^cc-persist].
  That contradiction is a plausible root cause for why this was the one problem unanimous across
  all five models on the battery — even Anthropic's own documentation doesn't agree with itself.
- **Genuine full persistence exists, but only via a real session, and only in two places:** Cline's
  *default* mode reuses an actual VS Code integrated terminal (matched by shell-integration-reported
  cwd), giving true cwd+env+alias persistence — but this is architecturally a full long-lived
  process, not a partial state carry-over, and Cline's own alternate "backgroundExec" mode is fully
  ephemeral like everyone else's default [^cline-persist]. Codex CLI ships a **second, separate**
  tool (`exec_command`/`write_stdin`, PTY-backed, keyed by `session_id`) purpose-built for
  interactive/stateful work, rather than making its one-shot `shell` tool stateful [^codex-persist].

So: when a harness wants statefulness, the two real-world patterns are "make everything ephemeral
and require the model to re-supply cwd" (majority) or "go all the way to a real persistent
process/session, exposed as such" (Cline, Codex's alt tool) — never a partial cwd-only carry-over
like ours and CC's. **This means CC's model — and ours, by extension — is a genuine hybrid that
matches neither the ephemeral majority nor the full-session minority.** Changing to a full
persistent session (one long-lived shell process) is a large architectural change, correctly
out of scope for this document — but the finding to act on now is the wording one: since 5/5
models flagged this as a trap despite it being documented, and even Anthropic's own two doc pages
disagree with each other, put the asymmetry directly in the tool description surfaced to the
model at call time (not only in an external doc), mirroring CC's own product-doc phrasing almost
verbatim: *"Environment variables don't persist. An `export` in one command won't be available in
the next."* [^cc-persist] A one-line addition to the in-context tool description is a much cheaper
fix than the architectural change, and directly addresses "the documentation isn't doing its job"
without touching behavior.

## Anything worth copying that nobody asked for

- **Cline's pre-write diff preview.** Before the approval prompt even appears, Cline opens a
  read-only *virtual-document* diff (both sides virtual — the real file is never touched by the
  preview itself), so the user reviews the actual proposed change, not just a description of it,
  before anything on disk changes [^cline-write]. This is a stronger safety property than a
  text-only approval prompt and doesn't require any guard logic to implement.
- **Codex's belt-and-suspenders timeout reporting** (conventional sentinel *and* a typed flag *and*
  prose, simultaneously) is worth copying wholesale — see recommendation #4 above.
- **Aider's "did you mean" hint on a failed edit match.** When a SEARCH/REPLACE block fails to
  match, Aider runs `find_similar_lines()` against the current file and appends the closest actual
  lines to the error, e.g. *"Did you mean to match some of these actual lines from {path}?"*
  [^aider-edit] — this turns a bare match-failure into an actionable hint without any extra tool
  call, and pairs naturally with a content-hash staleness message (it can distinguish "you got the
  string wrong" from "the file moved out from under you").
- **Gemini CLI's inactivity timeout** (kill after N seconds of *no output*, not wall-clock time)
  avoids punishing a legitimately slow-but-still-working command (a large `npm install`, a
  long-running build with sparse logging aside) — worth considering as an alternative timeout
  *trigger*, independent of the exit-representation fix in #4 [^gem-timeout].
- **OpenCode V2's scoped optimistic-concurrency check.** `writeIfUnchanged` protects specifically
  against the file changing *during the approval-wait window* — between the tool's own internal
  read and its internal write — which is a distinct race from "did the model call Read earlier in
  the conversation." Any approval-gated Write/Edit flow (ours included, once permission prompts are
  in the loop) has this exact window open regardless of what the Read-tracking guard does, and it's
  worth closing separately with the same hash-compare-under-mutex pattern [^oc-edit].
- **Cline's "proceed while running" for foreground/interactive commands.** Rather than a hard kill
  at timeout, Cline's VS Code-integrated-terminal mode auto-detaches after 5 minutes with partial
  output and an explicit note that the command is still running in the visible terminal — reported
  as success, not a timeout error, because the command wasn't actually terminated [^cline-timeout].
  Relevant for any long-running dev-server-style command our harness might run.

---

## Sources

[^cc-write]: Live rejection string confirmed in a real reproduction: GitHub issue [anthropics/claude-code#16182](https://github.com/anthropics/claude-code/issues/16182), quoting `"File has not been read yet. Read it first before writing to it."` Session-membership-only (no freshness check) corroborated against [Claude Code tools reference](https://code.claude.com/docs/en/tools-reference).

[^cc-edit]: [Claude Code tools reference](https://code.claude.com/docs/en/tools-reference) (fetched 2026-08-10), quoted directly: read-before-edit is required for Opus 4.6/Haiku 4.5/older, relaxed for newer models when the `old_string` match is exact/unambiguous and reading wouldn't need a permission prompt; behavior change dated to v2.1.208+; before that, any edit to an unread/changed file was flatly refused. Live collision-error string (`"File has been unexpectedly modified. Read it again before attempting to write it."`) confirmed independently across GitHub issues [#10633](https://github.com/anthropics/claude-code/issues/10633), [#12805](https://github.com/anthropics/claude-code/issues/12805), [#7443](https://github.com/anthropics/claude-code/issues/7443), [#10437](https://github.com/anthropics/claude-code/issues/10437) (reported as a false-positive bug, esp. on Windows — the underlying trigger for that specific string is not confirmed as mtime by any official doc).

[^cc-noop]: GitHub issue [anthropics/claude-code#1962](https://github.com/anthropics/claude-code/issues/1962), live transcript quoting `"Error: No changes to make: old_string and new_string are exactly the same."` Unicode/whitespace false-positive variants: [#1986](https://github.com/anthropics/claude-code/issues/1986), [#7197](https://github.com/anthropics/claude-code/issues/7197).

[^cc-timeout]: [Claude Code tools reference](https://code.claude.com/docs/en/tools-reference): `BASH_DEFAULT_TIMEOUT_MS` (2 min default) / `BASH_MAX_TIMEOUT_MS` (10 min default); auto-background on timeout (not kill), message `"Command did not complete within its 120s timeout and was moved to the background"`; `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` disables it (behavior when disabled + timeout hit: not found). SIGTERM-propagation-to-exit-143 bug: GitHub issue [anthropics/claude-code#45717](https://github.com/anthropics/claude-code/issues/45717).

[^cc-pipefail]: GitHub issue [anthropics/claude-code#13057](https://github.com/anthropics/claude-code/issues/13057), requesting `set -o pipefail`, closed **not planned**.

[^cc-persist]: [Claude Code tools reference](https://code.claude.com/docs/en/tools-reference), quoted directly: cwd carries over across Bash calls (resettable via `CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR=1`, with `"Shell cwd was reset to <dir>"` on out-of-bounds `cd`); `"Environment variables don't persist. An export in one command won't be available in the next."`; shell aliases/functions persist (sourced once from rc files at session start). Contradicted by the generic Anthropic API Bash-tool spec (`bash_20250124`) at [platform.claude.com/docs/en/agents-and-tools/tool-use/bash-tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/bash-tool), which states env vars persist. The contradiction itself is documented in GitHub issue [anthropics/claude-code#20503](https://github.com/anthropics/claude-code/issues/20503). Default shell invocation form (`bash -c` vs. login shell, etc.): **not found**.

[^codex-write]: `openai/codex`, [`codex-rs/apply-patch/src/file_update.rs`](https://github.com/openai/codex/blob/main/codex-rs/apply-patch/src/file_update.rs), `derive_new_contents_from_chunks`: reads the file fresh at apply time via `fs.read_file_text`, no cached-read/mtime/hash comparison found; repo-wide grep for `stale|mtime|content hash|modified since` in `codex-rs/apply-patch/src` and `codex-rs/core/src/tools` returned no relevant hits. Commit `89a335ed50258dc9dc5b3d7f410db61b431244f9`.

[^codex-edit]: [`codex-rs/apply-patch/src/lib.rs`](https://github.com/openai/codex/blob/main/codex-rs/apply-patch/src/lib.rs), `compute_replacements`: rejects with `"Failed to find context '{ctx_line}' in {path}"` / `"Failed to find expected lines in {}:\n{}"` when a hunk's context/old lines don't match current disk content. No mtime/hash field found on any patch/hunk type.

[^codex-noop]: [`codex-rs/apply-patch/src/lib.rs`](https://github.com/openai/codex/blob/main/codex-rs/apply-patch/src/lib.rs), `apply_hunks_to_files`/`print_summary`: unconditional write of computed `new_contents`, no equality check against original; success message `"Success. Updated the following files:\nM <path>"`. The only distinct error is a zero-hunk patch: `"No files were modified."`

[^codex-timeout]: [`codex-rs/core/src/exec.rs`](https://github.com/openai/codex/blob/main/codex-rs/core/src/exec.rs): `TIMEOUT_CODE = 64`, `EXEC_TIMEOUT_EXIT_CODE = 124`, `timed_out: bool` flag, `finalize_exec_result` normalizes reported exit code to `124` on timeout. [`codex-rs/protocol/src/error.rs`](https://github.com/openai/codex/blob/main/codex-rs/protocol/src/error.rs): `Timeout { output }` variant, message `"command timed out after {ms} ms"` (comment: *"Timeouts are not sandbox errors from a UX perspective; present them plainly"*). [`codex-rs/core/src/tools/mod.rs`](https://github.com/openai/codex/blob/main/codex-rs/core/src/tools/mod.rs): model-facing `"command timed out after {ms} milliseconds\n{output}"`.

[^codex-pipefail]: [`codex-rs/core/src/shell.rs`](https://github.com/openai/codex/blob/main/codex-rs/core/src/shell.rs), `derive_exec_args`: `[shell_path, "-c"/"-lc", command]`, no `set -e`/`pipefail` prefix; repo-wide grep confirms no injection anywhere in the exec path.

[^codex-persist]: Default tool: [`codex-rs/core/src/tools/handlers/mod.rs`](https://github.com/openai/codex/blob/main/codex-rs/core/src/tools/handlers/mod.rs) (`resolve_workdir_base_path` — `workdir` defaults to the turn's base cwd every call, no carry-over) and [`codex-rs/core/src/exec_env.rs`](https://github.com/openai/codex/blob/main/codex-rs/core/src/exec_env.rs) (`create_env` rebuilt fresh every call). Persistent alt tool: [`codex-rs/core/src/unified_exec/mod.rs`](https://github.com/openai/codex/blob/main/codex-rs/core/src/unified_exec/mod.rs) (module doc: manages reusable interactive PTY processes) and [`write_stdin.rs`](https://github.com/openai/codex/blob/main/codex-rs/core/src/tools/handlers/unified_exec/write_stdin.rs) (`session_id`-keyed).

[^oc-write]: `anomalyco/opencode` (formerly `sst/opencode`), commit `d90532a5952c08c4376167294ef7c316b8817f72`. V1 [`packages/opencode/src/tool/write.ts`](https://github.com/anomalyco/opencode/blob/d90532a5952c08c4376167294ef7c316b8817f72/packages/opencode/src/tool/write.ts) has no guard in `execute()`; description text in `write.txt` (stale, claims a guard that doesn't exist) inherited near-verbatim from Claude Code's own prompt. Historical `FileTime` mtime-based guard removed: PRs/issues `"chore: delete filetime module"` (#22999, closed 2026-04-17) and `"refactor(file): destroy FileTime facade"` (#22090, closed 2026-04-12); restoration attempts (#5045, #4923) closed unmerged. V2: [`packages/core/src/tool/write.ts`](https://github.com/anomalyco/opencode/blob/d90532a5952c08c4376167294ef7c316b8817f72/packages/core/src/tool/write.ts), no guard, no stale claim in its description.

[^oc-edit]: V1 [`packages/opencode/src/tool/edit.ts`](https://github.com/anomalyco/opencode/blob/d90532a5952c08c4376167294ef7c316b8817f72/packages/opencode/src/tool/edit.ts): no read-tracking; description text (`edit.txt`) again claims an unenforced guard. Historical mtime-error string documented in issues [#5840](https://github.com/anomalyco/opencode/issues/5840) and [#20354](https://github.com/anomalyco/opencode/issues/20354) (about the now-deleted `FileTime` system). V2 [`packages/core/src/tool/edit.ts`](https://github.com/anomalyco/opencode/blob/d90532a5952c08c4376167294ef7c316b8817f72/packages/core/src/tool/edit.ts) + [`packages/core/src/file-mutation.ts`](https://github.com/anomalyco/opencode/blob/d90532a5952c08c4376167294ef7c316b8817f72/packages/core/src/file-mutation.ts): `writeIfUnchanged`/`sameBytes` (raw byte comparison under a `KeyedMutex`), rejection message `"File changed after permission approval. Read it again before editing."`

[^oc-noop]: V1 `edit.ts` (~lines 75-77, 683-685) and V2 `edit.ts` (~lines 127-131), both: `"No changes to apply: oldString and newString are identical."`

[^oc-timeout]: V1 [`packages/opencode/src/tool/shell.ts`](https://github.com/anomalyco/opencode/blob/d90532a5952c08c4376167294ef7c316b8817f72/packages/opencode/src/tool/shell.ts): `Effect.raceAll` of exit/abort/timeout, timeout yields `exit: null` plus appended prose `"shell tool terminated command after exceeding timeout ${ms} ms..."`. V2 [`packages/core/src/tool/bash.ts`](https://github.com/anomalyco/opencode/blob/d90532a5952c08c4376167294ef7c316b8817f72/packages/core/src/tool/bash.ts): `exit` field omitted on timeout, `timeout: true` set, `"Command timed out before completion."`

[^oc-persist]: V1 `shell.ts`: fresh `ChildProcess.make` every call; `instanceCtx.directory` is static, never mutated by `cd`; tool description falsely claims `"a persistent shell session"` ([`packages/opencode/src/tool/shell/prompt.ts`](https://github.com/anomalyco/opencode/blob/d90532a5952c08c4376167294ef7c316b8817f72/packages/opencode/src/tool/shell/prompt.ts) line 259) while the tool's own usage notes contradictorily warn against relying on `cd &&` persistence. V2 `bash.ts`: same ephemeral-per-call behavior, but its description makes no persistence claim.

[^oc-pipefail]: V1 [`packages/core/src/shell.ts`](https://github.com/anomalyco/opencode/blob/d90532a5952c08c4376167294ef7c316b8817f72/packages/core/src/shell.ts): `bash -l -c` sourcing `~/.bashrc`, no `set -e`/pipefail. Tool prompt ([`packages/opencode/src/tool/shell/prompt.ts`](https://github.com/anomalyco/opencode/blob/d90532a5952c08c4376167294ef7c316b8817f72/packages/opencode/src/tool/shell/prompt.ts)) explicitly instructs the model to use `&&` for dependent commands, `;` only when not caring about earlier failures.

[^aider-write]: `Aider-AI/aider`, [`aider/coders/base_coder.py`](https://raw.githubusercontent.com/Aider-AI/aider/main/aider/coders/base_coder.py), `allowed_to_edit()`: `confirm_ask("Allow edits to file that has not been added to the chat?", ...)`, default-yes, bypassable via `--yes-always`; `check_for_dirty_commit()` auto-commits pre-existing `git diff`-dirty files before applying an edit. Documented at [aider.chat/docs/git.html](https://aider.chat/docs/git.html).

[^aider-edit]: [`aider/coders/editblock_coder.py`](https://raw.githubusercontent.com/Aider-AI/aider/main/aider/coders/editblock_coder.py), `apply_edits()`: reads `content = self.io.read_text(full_path)` fresh before each match attempt; on failure, raises `ValueError` with a detailed message including a `find_similar_lines()` "did you mean" hint, fed back to the model via `self.reflected_message`. Fuzzy-match fallback (`replace_closest_edit_distance`) is present in source but unreachable (dead `return` before it, lines ~183-187).

[^aider-noop]: No equality check on the apply path (writes unconditionally on match). [`aider/repo.py`](https://raw.githubusercontent.com/Aider-AI/aider/main/aider/repo.py), `commit()`: returns `None` if `get_diffs()` is empty. [`aider/coders/base_coder.py`](https://raw.githubusercontent.com/Aider-AI/aider/main/aider/coders/base_coder.py), `auto_commit()`: falls back to [`aider/coders/base_prompts.py`](https://raw.githubusercontent.com/Aider-AI/aider/main/aider/coders/base_prompts.py) line 8, `files_content_gpt_no_edits = "I didn't see any properly formatted edits in your reply?!"` — a generic message shared with the "no edits found at all" case.

[^aider-timeout]: [`aider/run_cmd.py`](https://raw.githubusercontent.com/Aider-AI/aider/main/aider/run_cmd.py): neither `run_cmd_subprocess` (`subprocess.Popen`/`.wait()`) nor `run_cmd_pexpect` (`pexpect.spawn`/`.close()`) passes any `timeout=`. Corroborating open issue: [Aider-AI/aider#945](https://github.com/Aider-AI/aider/issues/945).

[^aider-pipefail]: [`aider/run_cmd.py`](https://raw.githubusercontent.com/Aider-AI/aider/main/aider/run_cmd.py): interactive path uses `pexpect.spawn(os.environ.get("SHELL", "/bin/sh"), args=["-i","-c",command])`; non-interactive path uses `subprocess.Popen(command, shell=True, ...)` with no `executable=`, which per Python semantics invokes `/bin/sh -c` on POSIX regardless of `$SHELL`. No pipefail/set -e in either path.

[^aider-persist]: [`aider/commands.py`](https://raw.githubusercontent.com/Aider-AI/aider/main/aider/commands.py), `cmd_run()`: every call passes `cwd=self.coder.root` (fixed repo root, not carried from a prior `cd`); fresh `Popen`/`pexpect.spawn` per call; no stored process/env object between calls.

[^cline-write]: `cline/cline`, commit `149abb0` (current main, post-SDK-rewrite architecture — historical `DiffViewProvider`/`WriteToFileToolHandler` no longer exist). [`sdk/packages/core/src/extensions/tools/executors/editor.ts`](https://github.com/cline/cline/blob/main/sdk/packages/core/src/extensions/tools/executors/editor.ts): `createFile`/`replaceInFile`, plain `fs.readFile`→`fs.writeFile`, no guard. Diff-preview flow: [`apps/vscode/src/sdk/sdk-diff-edit-coordinator.ts`](https://github.com/cline/cline/blob/main/apps/vscode/src/sdk/sdk-diff-edit-coordinator.ts) (`openForApproval`, virtual-document, `AUTO_APPROVE_PREVIEW_LINGER_MS`).

[^cline-edit]: Same `editor.ts`: `countOccurrences` check only (`"No replacement performed: text not found in ${filePath}."` / `"...multiple occurrences of text found..."`), no read-state or freshness check. Repo-wide grep for "modified since"/"has not been read" returned zero hits in `cline/cline`; that phrasing traced instead to an unrelated project's issue, [`anomalyco/opencode#11249`](https://github.com/anomalyco/opencode/issues/11249).

[^cline-noop]: `editor.ts`: no `old_text === new_text` check; `content.replace()` with identical strings still calls `fs.writeFile`, and `createLineDiff()` on identical input produces an empty diff block, returned as a `success: true` result.

[^cline-timeout]: [`sdk/packages/core/src/extensions/tools/executors/bash.ts`](https://github.com/cline/cline/blob/main/sdk/packages/core/src/extensions/tools/executors/bash.ts): `CommandExitError` (`"Command exited with code ${exitCode}"`, output preserved) vs. `TimeoutError` from [`helpers.ts`](https://github.com/cline/cline/blob/main/sdk/packages/core/src/extensions/tools/helpers.ts) (`"Command timed out after ${ms}ms"`, output discarded on timeout). Model-facing wrapping in [`definitions.ts`](https://github.com/cline/cline/blob/main/sdk/packages/core/src/extensions/tools/definitions.ts): `"Command failed: Command timed out after {ms}ms"`. Foreground VS Code terminal mode: 1hr kill-timeout, 5-min "proceed while running" auto-detach reported as success — [`apps/vscode/src/sdk/vscode-run-commands-tool.ts`](https://github.com/cline/cline/blob/main/apps/vscode/src/sdk/vscode-run-commands-tool.ts).

[^cline-persist]: `bash.ts` (`backgroundExec` mode): plain `child_process.spawn()` per call, `cwd`/`env` from static per-call config, no carry-over. `vscodeTerminal` mode (default): [`apps/vscode/src/hosts/vscode/terminal/VscodeTerminalManager.ts`](https://github.com/cline/cline/blob/main/apps/vscode/src/hosts/vscode/terminal/VscodeTerminalManager.ts), `getOrCreateTerminal()` reuses a terminal whose shell-integration-reported cwd matches, or `cd`s an existing one — genuine persistent session.

[^cline-pipefail]: [`sdk/packages/shared/src/parse/shell.ts`](https://github.com/cline/cline/blob/main/sdk/packages/shared/src/parse/shell.ts), `getShellInvocation()`: POSIX → `[shell, "-c", command]`, no `-e`/pipefail; PowerShell → command wrapped with an appended `'if(-not $?){exit 1}'` check, the one deliberate exception. Multiple commands in one call run in parallel via `Promise.all`, not chained by Cline.

[^gem-write]: `google-gemini/gemini-cli`, commit `cf22ac7e86f3dcf528e3ae591fec1c03090a49f8`. [`packages/core/src/tools/write-file.ts`](https://github.com/google-gemini/gemini-cli/blob/cf22ac7e86f3dcf528e3ae591fec1c03090a49f8/packages/core/src/tools/write-file.ts): `validateToolParamValues()` checks path/directory/omission-placeholder only, no read-state or freshness check. Real-world breakage: [google-gemini/gemini-cli#6398](https://github.com/google-gemini/gemini-cli/issues/6398), model's own explanation quoted, closed without a code fix.

[^gem-edit]: [`packages/core/src/tools/edit.ts`](https://github.com/google-gemini/gemini-cli/blob/cf22ac7e86f3dcf528e3ae591fec1c03090a49f8/packages/core/src/tools/edit.ts): advisory-only read requirement in the tool description ([`default-legacy.ts`](https://github.com/google-gemini/gemini-cli/blob/cf22ac7e86f3dcf528e3ae591fec1c03090a49f8/packages/core/src/tools/definitions/model-family-sets/default-legacy.ts) line 351); `attemptSelfCorrection`'s `hashContent()` (SHA-256) compares initial-read hash vs. fresh on-disk hash (lines ~555-570), only inside the self-correction fallback triggered by an initial match failure. Occurrence-mismatch errors: `EDIT_NO_OCCURRENCE_FOUND` / `EDIT_EXPECTED_OCCURRENCE_MISMATCH`.

[^gem-noop]: `edit.ts`, `getErrorReplaceResult()` (~lines 379-384): `EDIT_NO_CHANGE`, `"No changes to apply. The old_string and new_string are identical in file: ${params.file_path}"`.

[^gem-timeout]: [`packages/core/src/tools/shell.ts`](https://github.com/google-gemini/gemini-cli/blob/cf22ac7e86f3dcf528e3ae591fec1c03090a49f8/packages/core/src/tools/shell.ts) (~lines 775-831): `result.aborted` branch, distinct from the normal non-zero-exit branch; message `"Command was automatically cancelled because it exceeded the timeout of X minutes without output."` [`packages/core/src/config/config.ts`](https://github.com/google-gemini/gemini-cli/blob/cf22ac7e86f3dcf528e3ae591fec1c03090a49f8/packages/core/src/config/config.ts) line 1303: `shellToolInactivityTimeout` default 300s (inactivity, not wall-clock). [`packages/core/src/utils/process-utils.ts`](https://github.com/google-gemini/gemini-cli/blob/cf22ac7e86f3dcf528e3ae591fec1c03090a49f8/packages/core/src/utils/process-utils.ts): SIGTERM then SIGKILL after `SIGKILL_TIMEOUT_MS = 200`.

[^gem-pipefail]: [`packages/core/src/utils/shell-utils.ts`](https://github.com/google-gemini/gemini-cli/blob/cf22ac7e86f3dcf528e3ae591fec1c03090a49f8/packages/core/src/utils/shell-utils.ts) (~lines 658-698), `getShellConfiguration()`: `bash -c <command>` on Linux/macOS (Windows: `pwsh`/`powershell -NoProfile -Command`, not cmd.exe); no `set -e`/pipefail injected anywhere in `shellExecutionService.ts` or `shell-utils.ts` (confirmed by grep).

[^gem-persist]: `shell.ts` (~lines 511-513): `cwd` resolved fresh from an optional `dir_path` param every call, default falls back to project root; [`shellExecutionService.ts`](https://github.com/google-gemini/gemini-cli/blob/cf22ac7e86f3dcf528e3ae591fec1c03090a49f8/packages/core/src/services/shellExecutionService.ts) spawns fresh per call. Maintainer confirmation of intentional design: [google-gemini/gemini-cli#25020](https://github.com/google-gemini/gemini-cli/issues/25020), closed by maintainer `scidomino`, quoted directly. Optional single-command PTY interactivity (`enableInteractiveShell`, not cross-call persistence) documented in [`docs/tools/shell.md`](https://github.com/google-gemini/gemini-cli/blob/cf22ac7e86f3dcf528e3ae591fec1c03090a49f8/docs/tools/shell.md).
