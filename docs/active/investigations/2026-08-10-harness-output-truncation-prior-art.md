---
status: draft
date: 2026-08-10
---

# Prior art: how mature agentic harnesses truncate large shell-command output

## Why this exists

Five frontier models ran an identical review battery against YouCoded's native Bash tool.
Four of five independently flagged output volume as the top cost problem. The sharpest
example: a `seq 1 20000` call returned 27,966 of 108,894 characters — roughly 7k tokens of
line-numbered noise, permanently resident in context, more expensive than everything else
the model did in that session combined. This doc surveys what other harnesses actually do
(source code and docs, not opinion) and recommends a concrete fix.

Current YouCoded behavior for reference: ~28,000-char cap, middle-elision, footer
`[showing 27966 of 108894 chars — pipe through head -n 100, tail -n 100, or wc -l to narrow
it]`. No spill-to-file. Read tool (separately) caps at 2,000 lines and was judged
well-calibrated by the same reviewers.

## Method

Each harness was researched by a dedicated subagent using WebSearch/WebFetch against
primary sources — official docs, GitHub source (cloned and read directly where open
source), CHANGELOGs, and maintainer-authored issue/PR threads. Secondary blog posts and
prompt leaks are flagged inline as such. Where no hard number was found, that is stated
explicitly rather than estimated.

## Comparison table

| Harness | Bash output cap | Shape | Spill-to-file | Notice format | Source |
|---|---|---|---|---|---|
| **Claude Code** | ~30,000 chars inline (valid results), then file + short start preview. Failure results: ~10,000 chars, head+tail excerpt, no file. Hard kill at 5 GB output; spill file capped at 64 MiB. | Disputed by source: docs describe head-preview + full spill; the `BASH_MAX_OUTPUT_LENGTH` var's own description says "middle-truncated"; failure path is explicitly head+tail. | **Yes**, on valid results only — saved to `~/.claude/projects/.../tool-results/toolu_xxx.txt`, path + preview returned inline. | Prose (`Output too large (50.2KB). Full output saved to: <path>\nPreview (first 2KB):`) | [code.claude.com/docs/en/tools-reference](https://code.claude.com/docs/en/tools-reference), [env-vars](https://code.claude.com/docs/en/env-vars), [issue #17944](https://github.com/anthropics/claude-code/issues/17944), [issue #19901](https://github.com/anthropics/claude-code/issues/19901) |
| **Codex CLI** (OpenAI) | **10,000 bytes** default (`ModelInfo::default()`, `codex-rs/protocol/src/openai_models.rs:845`), configurable via `tool_output_token_limit` in `config.toml`. Confirmed by integration test asserting 9,900–10,100 char output. | Middle-out, exact 50/50 byte-budget split (`split_budget()`, `codex-rs/utils/string/src/truncate.rs`). | **No**, for shell/exec output. (Exists only for hook output, capped 2,500 tokens.) Open, unresolved issue [#14206](https://github.com/openai/codex/issues/14206) explicitly asks for this — "no artifact ID, temp file path, or follow-up handle for the omitted data." | Prose, spliced mid-string: `…N chars truncated…` / `…N tokens truncated…`, plus a prepended `Warning: truncated output (original token count: N)` / `Total output lines: N` header. | [truncate.rs](https://github.com/openai/codex/blob/main/codex-rs/utils/string/src/truncate.rs), [tools/mod.rs](https://github.com/openai/codex/blob/main/codex-rs/core/src/tools/mod.rs), [openai_models.rs](https://github.com/openai/codex/blob/main/codex-rs/protocol/src/openai_models.rs), [truncation.rs tests](https://github.com/openai/codex/blob/main/codex-rs/core/tests/suite/truncation.rs) |
| **Gemini CLI** (Google) | Two layers. Raw process buffer: 16 MiB (`MAX_CHILD_PROCESS_BUFFER_SIZE`). Tool-output-to-model: **40,000 chars default**, dynamically tightened to `min(4 × remaining_context_tokens, 40,000)`. | Raw layer: tail-only (drops head once buffer fills). Tool-output layer: **head 20% / tail 80%** split (`fileUtils.ts`). | **Yes** — full untruncated output always written first, to `<tempDir>/tool-outputs/.../<toolName>_<callId>.txt`; path is in the notice. | Prose: `Output too large. Showing first {N} and last {M} characters. For full output see: <path>\n{head}\n\n... [{X} characters omitted] ...\n\n{tail}` | [shellExecutionService.ts](https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/services/shellExecutionService.ts), [fileUtils.ts](https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/utils/fileUtils.ts), [config.ts](https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/config/config.ts), [discussion #8297](https://github.com/google-gemini/gemini-cli/discussions/8297) |
| **OpenCode** | Live bash tool: **2,000 lines / 50 KB** (`MAX_LINES`, `MAX_BYTES`, `truncate.ts`). Configurable via `tool_output.{max_lines,max_bytes}` in project config. Newer V2 core layer (parallel, in-progress): same 2,000/50KB default but head/tail split. | Live bash tool: **tail-only** (keeps the end). V2 core layer: **head+tail sandwich**, `ceil(maxLines/2)` head / `floor(maxLines/2)` tail. | **Yes**, always on overflow — full raw output streamed to `<data>/tool-output/tool_<id>`, retained 7 days, swept hourly. | Prose + structured flag: `...output truncated...\n\nFull output saved to: <file>`, plus a `truncated: boolean` (and `outputPath`) field in tool metadata. | `packages/opencode/src/tool/{truncate.ts,shell.ts,shell/prompt.ts}`, `packages/core/src/tool-output-store.ts` (read directly from cloned source, no public permalink at time of writing — repo migrating `sst/opencode` → `anomalyco/opencode`) |
| **Aider** | **None.** Verified negative by reading `run_cmd.py` in full: no truncation constant, no cap, output captured unbounded. Token count is computed only to show a human confirmation prompt, never to cut content. | N/A | No. | N/A — docs state the policy explicitly: *"Aider never enforces token limits, it only reports token limit errors from the API provider."* | `aider/run_cmd.py`, `aider/commands.py`, [aider/website/docs/troubleshooting/token-limits.md](https://aider.chat/docs/troubleshooting/token-limits.html) |
| **Cline** | Shared cap across CLI/SDK/VS Code: **48,000 chars** (`MAX_COMMAND_OUTPUT_CHARS`, `output-limits.ts`). Separate raw VS Code terminal-capture layer: 1 MB buffer, 500-line "unretrieved output" threshold. | **Middle-out**, `headLimit = ceil(max/2)`, tail = remainder; notice explicitly placed at the boundary, never inside the elided middle. Raw layer: keeps first 100 + last 100 lines once >500 unretrieved. | **Yes, but only for long-running/detached commands** — if a foreground command runs past 300s or the user "proceeds while running," remaining output streams to a temp log capped at 10 MB, path returned to the model. Not triggered by a normal large one-shot command. | Prose at the boundary: `[... output truncated: {N} chars total. Refine the command (grep, head, tail) to view the elided middle ...]` | `sdk/packages/core/src/extensions/tools/executors/output-limits.ts`, `apps/vscode/src/integrations/terminal/constants.ts` (read directly from cloned source) |
| **Goose** (Block) | **2,000 lines / 50,000 bytes** trigger; what the model actually *sees* on overflow is much smaller — a **50-line / 10,000-byte tail preview** (`OUTPUT_PREVIEW_LINES`, `OUTPUT_PREVIEW_BYTES`). | **Tail-preview + mandatory spill** — always writes full output to disk on overflow, shows only the last 50 lines. | **Yes, always** on any overflow, uncapped file size. | Prose: `[Output exceeded 2000 line limit ({N} lines total). Full output saved to <path>. Read it with shell commands like head, tail, or sed -n '100,200p' up to 2000 lines at a time.]` | `crates/goose/src/agents/platform_extensions/developer/shell.rs` (read directly from cloned source) |
| **Continue** | IDE core (`runTerminalCommand.ts`): **none** — unbounded, only a 2-min timeout. Standalone CLI (`extensions/cli`): **50,000 chars / 1,000 lines default**, configurable via `CONTINUE_CLI_BASH_MAX_OUTPUT_CHARS` / `_LINES` env vars; limits divide across concurrent in-flight tool calls. | CLI: **head-discard, tail-preserved** (opposite of Cline/Codex/Gemini — cuts from the start, snaps to a line boundary). | No. Long-running commands move to a background job service instead of being truncated. | Prose, prepended: `(previous {N} lines truncated)` / `(previous output truncated: {N} lines and {M} characters removed)` | `core/tools/implementations/runTerminalCommand.ts`, `extensions/cli/src/util/truncateOutput.ts` (read directly from cloned source) |
| **Amp** (Sourcegraph) | Reported **50,000 chars**, kept from the *end*. **Not source-verified** — Amp is closed source; this is a leaked/reconstructed system-prompt figure cross-confirmed by two independent secondary sources. Treat as unconfirmed. | Tail-only (reported). | Unknown. | Unknown exact wording; reported gist text: *"Only the last 50000 characters of the output will be returned to you along with how many lines got truncated, if any."* | Prompt-leak gist + `ampcode.com/news/more-tools-for-the-agent` (secondary, not primary) |

**Read/Grep caps, for context (not the focus of this doc but relevant to §4):**
- Claude Code Read: 2,000 lines default, 2,000 chars/line, historically a 25,000-token hard error, now (v2.1.145+) a truncated "PARTIAL view" instead of an error. Grep: no documented char cap; three output modes (`files_with_matches` default, `content`, `count`); `head_limit`/`offset` paginate content mode.
- OpenCode Read: 2,000 lines, 2,000 chars/line, 50 KB cap — independent implementation from the bash truncator. Grep: hardcoded **100-match limit**, no byte cap, no spill, notice `"(Results truncated. Consider using a more specific path or pattern.)"`.

## Consensus and divergence

**Consensus (5 of 8 tools with a real bash cap): pair a bounded inline slice with a
spill-to-file safety net.** Claude Code, Gemini CLI, OpenCode, Cline (partially), and Goose
all write the full output somewhere the model can retrieve it, and none of them treat the
inline slice as the only copy. The two tools that *don't* spill (Codex CLI's shell/exec
path, Continue CLI) are also the two with an open, unresolved user complaint asking for
exactly that feature (Codex issue #14206). That is direct evidence the no-spill design is
a recognized gap, not a considered trade-off.

**Consensus on absolute size: inline caps cluster far below our ~28,000 chars.** Sorted:
Codex 10,000 bytes · Goose preview 10,000 bytes/50 lines (real cap 50,000 bytes, but that's
what triggers the spill, not what the model sees) · Claude Code 30,000 chars (but immediately
spills past that) · Continue CLI 50,000 chars · Gemini CLI 40,000 chars (and shrinks further
as context fills) · Cline 48,000 chars · OpenCode 50,000 bytes. **No tool we found defaults
to an inline-only slice anywhere near 28,000 chars with nothing written to disk** — every
harness in that size range treats it as a spill *trigger*, not a budget the model reads in
full. Ours currently does the latter.

**Consensus on shape: preserve both ends, mark the cut at the boundary.** Claude Code
(failure path), Codex, Gemini CLI, Cline, and OpenCode's V2 layer all do head+tail with the
elision marker sitting between the two halves, never inside them. Goose and OpenCode's live
bash tool diverge by showing *only* the tail — justified in both cases by the fact that the
full output is unconditionally on disk, so nothing showing head+tail would have added is
actually lost. Continue CLI is the sole tool doing pure head-discard/tail-preserve without a
spill net, which is the shape most likely to lose an early error message with no recovery
path.

**This maps directly onto the review disagreement.** Kimi liked seeing both ends — that's
the majority shape (head+tail), not a minority opinion; Kimi is siding with 5 of 8 tools.
Opus's complaint was about *size*, not shape: getting 4,621 lines of head content is a lot of
budget for a "here's what ran" signal that a much shorter head would convey equally well. The
tools that get this right (Codex, Gemini CLI, Goose) keep the visible slice an order of
magnitude smaller than 28,000 chars precisely because they don't need to gamble on
completeness — the file backs it up.

**Divergence: whether the cap adapts to the conversation.** Only Gemini CLI ties the
threshold to remaining context budget (`min(4 × remaining_tokens, 40,000)`). Everyone else
uses a static constant. This is a real design choice, not an oversight — see §5.

**Divergence: notice format.** All are prose. Cline and OpenCode additionally carry a
structured boolean flag (`truncated: true`) in tool metadata alongside the prose, which is
for host-app use (badging, telemetry), not model consumption. Nobody puts the notice itself
in a machine-readable field the model is expected to parse instead of reading prose — prose
is the universal choice for what the *model* sees.

## Recommendation for our harness

**Cap: ~4,000 characters inline**, matching Opus's explicit ask almost exactly. This lands
below every other harness's static default (all cluster 40,000–50,000 chars) and below
Codex's 10,000-byte floor — deliberately more aggressive than the field. That's justified
by the combination of two facts nobody else's number reflects simultaneously:

1. Our reviewers just measured the cost of the *current* number directly (7k tokens of pure
   noise, "more expensive than everything else combined") — we have empirical signal the
   field mostly doesn't cite rationale for at all (§ "published rationale," almost
   universally "not found" per-tool).
2. Every harness that keeps its visible slice small (Codex, Gemini CLI, Goose) does so
   *because* the full output is safely on disk. We're adding that same safety net (below),
   so we can match the aggressive end of the range without the downside Codex users are
   currently complaining about (no recovery path). Goose's real precedent — a 50-line/10KB
   preview backed by a mandatory full spill — is closer to Opus's ask than any static-cap
   tool's number, and it's a shipped, real design, not just a reviewer's suggestion.

**Shape: head+tail sandwich, not full middle-out with large sides.** Concretely: first ~50
lines (or ~2,000 chars, whichever comes first) + last ~50 lines (or ~2,000 chars), elision
marker between them. This is exactly Opus's suggested split and matches the majority shape
across harnesses (Claude Code failure path, Codex, Gemini CLI, Cline, OpenCode V2) — keep
both ends, because "what ran" and "how it ended/the error" are both genuinely useful and
Kimi is right that dropping one is a real loss. The fix isn't switching to tail-only; it's
shrinking both halves.

**Spill-to-file: yes, unconditionally on overflow.** Write the full output to a session-scoped
temp file the moment the cap is exceeded (mirrors Claude Code, Gemini CLI, OpenCode, Goose —
4 of 5 tools with a real cap already do this). Give the model the path in the notice and let
it `Read`/`Grep`/pipe through `head`/`tail`/`sed` against the file, the same affordance
DeepSeek explicitly asked for ("a 'full output in a file' affordance"). Adopt OpenCode's
retention discipline too (see §5) so spilled files don't accumulate unbounded on disk.

**Exact notice wording**, adapted from the strongest elements of Claude Code's, Cline's, and
Goose's (all three put the marker at the boundary, name the total size, and give a concrete
next action):

```
[... 19,900 lines elided (104,894 of 108,894 chars) — full output saved to
/path/to/session/tool-output/<id>.txt. Read it with offset/limit, or pipe the
original command through head/tail/grep to narrow it. ...]
```

Keep the marker prose (every harness surveyed does this for the model-visible notice); add
a structured `truncated: true` / `output_path` field alongside it for our own UI/telemetry
layer only, following Cline/OpenCode's belt-and-suspenders pattern — the model reads prose,
the host app reads the field.

**Is Opus's ~4k too aggressive?** No — it's directionally exactly where Codex and Goose
already sit, and it's the number a model that actually paid the cost proposed unprompted.
The one caveat: don't go below it. Continue CLI's 50,000-char default with no dynamic
tightening is the closest thing to a caution here, but Continue's cap wasn't validated
against a real cost complaint the way ours now has been — treat 4,000 as the target, not a
floor to push lower without new evidence.

## Grep / search-result policy (§4 — Grok's complaint)

Grok flagged that Grep's content mode "can blow up the context window" — same failure class,
different shape, and it should get a **different policy than command output**, not the same
char-based cap. Evidence for treating them differently:

- OpenCode caps Grep by **match count** (hardcoded 100), not bytes — `"(Results truncated.
  Consider using a more specific path or pattern.)"`. No byte cap, no spill-to-file.
- Claude Code's Grep has three output modes precisely so the model can choose the cheap one
  (`files_with_matches`, the default) before paying for `content`, and offers `head_limit`/
  `offset` for pagination within content mode rather than a blanket truncation.

The reasoning: unlike command output, where the tail matters more than the untruncated
middle, a grep result's value is in *completeness of matches* — silently dropping matches
from the middle of a result set is a correctness risk (the model may believe it saw every
occurrence), not just a cost one. The fix isn't a bigger character budget or a file spill,
it's the same shape OpenCode and Claude Code both converged on independently: **cap by match
count** (e.g., first ~100 matches) with an explicit count of matches omitted, and push the
model toward narrowing the pattern or switching to `files_with_matches`/count mode — the
tool's own affordance for "too many results" is a *better query*, not a bigger read. Adopt a
~100-match cap on content mode with a notice like `(showing first 100 of 312 matches — narrow
the pattern or use output_mode: "count")`, and leave `files_with_matches` uncapped since path
lists are cheap.

## What we should copy that nobody in our reviews asked for

- **Dynamic tightening to remaining context (Gemini CLI's `min(4 × remaining_tokens,
  40,000)`).** Nobody in our review batch asked for this because none of them ran long
  enough sessions to feel a late-conversation squeeze, but it directly addresses *why* the
  same 28k-char dump is more damaging late in a session than early — worth adopting once the
  static cap ships, not blocking on it.
- **Spilled-file retention/cleanup (OpenCode: 7-day TTL, hourly sweep).** A spill-to-file
  design that never cleans up is a slow disk leak. None of the reviewers would have noticed
  this in a single session; it's a real gap in every design that adds a spill affordance
  without it (Claude Code's docs don't mention a retention policy either, for what that's
  worth).
- **An explicit "don't pipe it yourself" instruction in the tool description (OpenCode):**
  *"Do NOT use head, tail, or other truncation commands to limit output; the full output
  will already be captured to a file for more precise searching."* Without this, a model
  that knows output gets truncated may reflexively re-run the command through `| head` —
  burning a full extra tool round-trip for something the harness already solved. Worth
  including verbatim-adjacent in our Bash tool's own description once spill-to-file ships.
- **Cline's explicit quadratic-cost framing in its source comment** — *"Every character
  returned by an executor is re-sent to the model on each subsequent request, so oversized
  outputs cost quadratically."* Not a feature to copy, but the correct internal rationale to
  cite in our own commit/doc for *why* the cap matters beyond one turn's token count — worth
  stating explicitly in whatever code lands this change, since it's the actual mechanism
  behind "more expensive than everything else combined."
- **A distinct, tighter cap for failed-command output (Claude Code: ~10,000 chars vs. 30,000
  for success).** None of our reviewers' fixture commands failed, so nobody flagged this, but
  it's a free win: error output's useful signal is almost always at the tail (the actual
  error/stack trace), so a failure path can safely run a smaller, tail-weighted budget than a
  success path where "what ran" (the head) carries more of the value.

## Not found (explicit gaps, do not treat as zero)

- Published rationale for *why* any tool chose its specific number — every harness surveyed
  (Claude Code, Codex, Gemini CLI, OpenCode, Cline excepted for its cost-framing comment,
  Goose, Continue) has "not found" against this question. Cline is the one exception with an
  in-source rationale comment.
- Amp's entire row is unverified (closed source, prompt-leak evidence only) — do not cite its
  50,000-char figure as confirmed in any downstream doc.
- Grep's exact char/token cap in Claude Code (as opposed to its match-mode/pagination
  design) — the docs describe modes and pagination params but no numeric ceiling.
