---
status: draft
created: 2026-07-18
owner: harness
related-pr: youcoded#174
---

# Multi-model cwd contract + model guidance

## Problem

PR #174 makes Bash's working directory persist between calls (scoped to the workspace,
revert-and-announce outside it). That lands YouCoded on **Option A** of the three cwd
models — but it exposes a design gap the harness never had to resolve when every Bash
call reset to root: **the file tools and Bash now disagree about "where I am."**

- `Read`/`Edit`/`Write`/`Glob`/`Grep` resolve relative paths against the **session
  root** (`ctx.cwd`), silently — `resolveP` is `path.resolve(cwd, p)`.
- `Bash` resolves against the **tracked shell dir** (`ctx.shellCwd`), which moves.

So after `cd sub`, `cat foo.txt` reads `root/sub/foo.txt` but `Read foo.txt` reads
`root/foo.txt`. Worse, `Read`'s schema currently *advertises* "Absolute or
workspace-relative path" — inviting the ambiguous call.

This is manageable for one model. It is not manageable for **four**. YouCoded's
harness serves Anthropic, OpenAI, Moonshot, and xAI models, and each vendor has
trained a *different* cwd convention into its model:

| Vendor | Trained behavior |
|---|---|
| Anthropic (Claude) | `cd` persists (scoped). File tools take **absolute paths**. |
| OpenAI (Codex) | Never `cd` for position; pass a per-call **`workdir`** param. |
| Moonshot (Kimi) | `cd` doesn't persist (fresh subprocess); use Bash **`cwd`** param or absolute paths. |
| xAI (Grok) | No native convention — pattern-matches to the dominant styles. |

## Decision (from the 2026-07-18 investigation)

**Option A — scoped persistence — is the substrate.** It is the only model where every
vendor's trained fallback either works natively or fails *loudly, not silently*:

- Claude: native.
- Kimi: `cd` persisting is a strict upgrade over its "doesn't persist" instinct.
- Codex: wants a `workdir` param; falls back to `cd X && command`, which **works**
  under Option A. (Under Option C, Claude's fallback fails — the asymmetry that
  settles the choice.)
- Grok: both patterns work.

The full four-way harness comparison (Claude Code / Codex / OpenCode / Kimi) is in the
investigation doc and the PR #174 review thread. The load-bearing facts: 3 of 4
harnesses refuse persistence, and the two oldest persistent-shell implementations
(OpenCode-Go, CC) both generated enough edge-case confusion that OpenCode ripped
persistence out — while CC kept it and pays a documentation tax. Option A survives
only if we are *more explicit than CC was* about the rules.

## The contract (what every tool promises)

One invariant, stated everywhere a model can see it:

> **There is one "current directory." Bash moves it (`cd` persists, scoped to the
> workspace). The file tools do NOT follow it — they are always rooted at the
> workspace, so give them absolute paths.**

That is CC's proven pairing (persistence + absolute-only file tools), with the two
additions that make it multi-model-safe.

## Work items

### 1. Add a `workdir` parameter to the Bash tool
Optional zod string; when present, overrides `shellCwd` for that call only (does not
update tracked state). Passed to `spawn`'s `cwd`. Subject to the same scope guard as
`cd` (outside workspace → error, not silent).

**Why:** Codex- and Kimi-shaped models scan the schema for this parameter. Giving it
to them converts their behavior from "falls back gracefully" to "native." Costs one
field; eliminates the largest non-Claude gap.

**File:** `desktop/src/main/harness/tools/bash.ts` (schema + `startCwd` resolution).

### 2. Make the file tools reject relative paths — loudly
Today `resolveP(cwd, p)` silently resolves. Change `Read`/`Edit`/`Write` (and the
`path` arg of `Glob`/`Grep` if applicable) to **hard-error on a relative path**:
`file_path must be absolute (got 'foo.txt'). The current working directory is <root>.`

**Why:** This is the CC #38270 lesson, and it matters *more* for us than for CC — CC
ships one model; we ship four and cannot predict a confused model's path. Loud beats
silent when the caller is unpredictable. The error returns the workspace root so the
model can self-correct in one retry.

**Files:** `tools/guards.ts` (add an `assertAbsolute` helper), `read.ts`, `edit.ts`,
`write.ts`, `glob.ts`, `grep.ts`.

### 3. Industry-standard guidance in the tool descriptions
Rewrite each tool's `description` so the rules are stated in the one place every model
actually reads. Principles: short, imperative, no vendor names, state the invariant
once per tool (models don't cross-reference descriptions).

- **Bash**: "The working directory PERSISTS between calls (`cd` carries over), scoped
  to the workspace — leaving it is reverted with a notice. Pass `workdir` to run one
  command in a specific directory without changing the persisted one. Env vars,
  aliases, and functions do NOT persist (each call is a fresh shell)."
- **Read/Edit/Write/Glob/Grep**: "`file_path` must be an ABSOLUTE path. The Bash
  working directory does not affect these tools — they are always rooted at the
  workspace. Build the absolute path from the workspace root shown in your
  environment block."

**Files:** the five tool files' `description` strings.

### 4. One canonical `<cwd-rules>` block in the system prompt
Add a short, byte-stable section to `assembleSystemPrompt` stating the contract once,
next to the `<env>` snapshot that already prints the workspace root. This is the
backstop for models that weight system prompt over tool descriptions.

**Do NOT** branch this text on `providerId` — a single canonical wording keeps the
prompt byte-stable (cache-friendly) and avoids per-vendor drift. `ModelBinding.
providerId` is available at the call site if we ever need per-provider tailoring, but
the multi-model argument cuts the other way: one contract, stated identically to all
models, is what makes it learnable.

**File:** `desktop/src/main/harness/prompt-assembly.ts`.

## Explicit non-goals

- **No Option B** (file tools follow `shellCwd`). No vendor precedent; couples file
  correctness to invisible session state. Decided against in the investigation.
- **No env-var / alias persistence.** CC's own tracker (#2508, #28228) shows this is
  the second-most-confusing dimension. Each Bash call stays a fresh shell for env.
- **No subagent cwd inheritance yet.** The native harness has no Task/subagent tool
  (Kimi's #1931 problem is deferred). When one is added, it takes an explicit
  `work_dir` param — the Kimi PR #1933 resolution — and never inherits `shellCwd`
  implicitly.

## Verification

- Pinning tests in `harness-tools-core.test.ts`:
  - Bash `workdir` param runs in the given dir and does NOT change tracked `shellCwd`.
  - `workdir` outside the workspace errors (same guard as `cd`).
  - Each file tool rejects a relative path with the absolute-path error + root.
  - File tools still accept absolute paths (regression: no behavior change there).
- The existing 8 scoped-persistence tests from PR #174 must stay green.
- Update the Bash tool-description assertions if any test snapshots the description.

## Docs to touch

- `youcoded/docs/` subsystem doc for the harness — record the contract + the Option A
  rationale so the next session doesn't re-litigate it.
- `docs/PITFALLS.md` — one cross-cutting entry: "file tools are absolute-only; Bash
  cwd persists scoped; never resolve file-tool paths against `shellCwd`."
- This plan moves to `docs/archive/` on merge; the ROADMAP item (the file-tools/
  `shellCwd` decision) flips to `[x]`.
