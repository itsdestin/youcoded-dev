---
status: active
---

# Agent-shell CWD model + Grep `spawn ENOTDIR` — findings & proposed fixes

**Date:** 2026-07-17
**Status:** Investigation complete. Two unrelated harness issues surfaced during the
`AssistantTurnBubble` memoization session; root causes identified with evidence.
**Scope:** the YouCoded agent harness (the tool layer that drives an assistant session —
`youcoded/desktop/src/main/harness/tools/`). Reproduced against the installed app at
`/opt/YouCoded` (PID 769035), confirmed identical source in the dev workspace.

---

## TL;DR

1. **Bash CWD is stateless-per-call** in this harness: every Bash tool invocation is a
   brand-new process (verified: PID changed `1042732 → 1042910` across two calls) that
   starts at the workspace root. `cd` in one call does **not** carry to the next, and
   nothing tells the model that. This cost ~6 failed tool calls in one session.
   **Proposed:** move to Claude Code's *scoped-persistence* model.
2. **The Grep tool is hard-broken with `spawn ENOTDIR`** because its `spawn(rgPath, args)`
   omits the `cwd` option while the sibling Bash tool passes `cwd: ctx.cwd` (which works).
   **Proposed:** pass `cwd` explicitly in Grep (one line), and audit every other `spawn`
   for the same omission.

---

## Issue 1 — Bash CWD model

### What's happening

Each Bash tool call spawns a fresh `/bin/bash -c …` process. Consequences observed this
session:

- `cd desktop/ && npm test` worked within a single command, but the next call's
  `node_modules/.bin/vitest` "not found" because CWD had reset to the workspace root.
- `git add <relative-path>` → `fatal: pathspec … did not match any files` (wrong dir).
- The model burned several calls diagnosing "is the binary missing? is the symlink
  broken?" before realizing the CWD simply doesn't persist.

Verified directly: two consecutive Bash calls reported different PIDs, proving a fresh
process per call (no persistent shell). CWD is therefore never carried over, and there is
no "Shell cwd was reset" notice (Claude Code emits one) to clue the model in.

### How Claude Code & peers handle it (research)

This is a known, contested design point — multiple Claude Code GitHub issues
(#42837, #35058, #28228, #22023, #37659) debate it. Three models in the wild:

| Model | Used by | Behavior |
|---|---|---|
| **Persistent process** | Anthropic API-level Bash tool | One long-lived shell across calls; `cd`, env, files all persist. A sentinel line marks each command's output boundary. |
| **Scoped persistence** | Claude Code CLI (default) | cwd persists **only within approved working dirs**; `cd` outside them is silently reverted with a `Shell cwd was reset to …` notice. Env/aliases do **not** persist. `CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR=1` forces always-reset. |
| **Stateless / always-reset** | many CI harnesses | Every call starts fresh at project root. |

**YouCoded today is a fourth, undocumented case:** fresh process per call, cwd never
persists, no notice. The single biggest complaint across all the Claude Code issues is
*silent* behavior — the model can't tell which model it's in, guesses wrong, and burns
calls. Claude Code #35058 documents the exact failure seen here (a `cd` that looks like it
worked → cascading wrong-path errors).

### Proposed fix — adopt scoped persistence (Claude Code's model)

Destin's stated preference. Concretely for the harness:

1. **Keep one long-lived shell per session** (or emulate it): track `cwd` in the harness
   and pass it as `cwd:` to each spawned command, updating the tracked value when the
   command changes directory. (Detecting the post-command cwd is the tricky part — the
   robust trick is to append `; printf '\n__YC_CWD__%s' "$PWD"` to the command and parse
   the sentinel back out of stdout, which is what persistent-shell harnesses do.)
2. **Scope it to the workspace root** (`ctx.cwd` at session start): a `cd` that resolves
   *outside* the approved root is reverted, and a `Shell cwd was reset to <root>` notice
   is appended to the tool result so the model isn't fooled.
3. **Persist only cwd, not env** (match Claude Code): aliases/functions/exports stay
   per-call unless the harness explicitly supports an env file.
4. **Update the Bash tool description** to state the model plainly: *"Working directory
   persists between commands inside the workspace. `cd` outside the workspace is reverted.
   Env vars and aliases do not persist."*

If scoped persistence is too much for the near term, the **cheapest 80% fix** is just
(2)'s notice + (4)'s explicit description: keep the stateless process but *tell the model*
("each Bash call starts fresh at the workspace root; use absolute paths or `cd X && …` in
one command") and emit the reset notice when a `cd` was attempted. That alone would have
prevented every failure seen this session.

---

## Issue 2 — Grep `spawn ENOTDIR` (root cause found)

### Symptom

Every `Grep` tool call fails with `Grep failed: spawn ENOTDIR` — regardless of `path`
(file, directory, or omitted), pattern, or `output_mode`. The `Glob` tool works on the
same paths, and `rg` works fine from a normal shell. Reproduced consistently; **not**
transient and **not** caused by the worktree add/remove that happened earlier in the
session.

### Root cause

`desktop/src/main/harness/tools/grep.ts:29`:

```ts
const child = spawn(rgPath, rgArgs, { windowsHide: true });   // ← no `cwd`
```

Compare the working Bash tool (`bash.ts:40`):

```ts
const child = spawn(shell.cmd, [...shell.args, args.command], { cwd: ctx.cwd, ... });
```

Grep is the **only** tool that spawns a child **without an explicit `cwd`**, so `rg`
inherits the Electron main process's ambient `process.cwd()`. In this app's runtime that
inherited cwd is not a usable directory for `posix_spawn`, and Node surfaces it as
`spawn ENOTDIR` ("a component of the path prefix is not a directory"). The error is thrown
synchronously out of `spawn`, propagates out of the tool's `new Promise` executor, and is
caught by `defineTool`'s wrapper (`registry.ts:25`), which formats it as
`` `${def.name} failed: ${err.message}` `` → exactly the observed `Grep failed: spawn ENOTDIR`.

### Evidence (each hypothesis tested & ruled in/out)

| Hypothesis | Result |
|---|---|
| `rg` binary missing/broken | **Ruled out.** `/usr/bin/rg` v15 and the bundled `@vscode/ripgrep-linux-x64/bin/rg` both execute fine (`--version` OK). |
| Node can't spawn `rg` at all | **Ruled out.** `spawn('rg', …)` via Bash-tool Node returns exit 0 with correct output. |
| `cwd` = a **file** | **Reproduces `ENOTDIR` exactly.** `spawn('rg',[],{cwd:'<a file>'})` → `spawn ENOTDIR`. (Mechanism confirmed.) |
| `cwd` = nonexistent dir | `ENOENT`, not `ENOTDIR` → ruled out as the literal trigger, same family. |
| Non-executable binary | `EACCES` → ruled out. |
| Stripped `PATH` | `ENOENT` → ruled out. |
| Grep passes a bad **search-path arg** | **Ruled out.** `resolveP(args.path ?? '.', ctx.cwd)` (line 27) produces a correct absolute path; that arg is fine. The broken value is the *spawn* cwd, not the search path. |
| Glob/FS layer broken | **Ruled out.** Glob works on identical paths — the bug is specific to Grep's `spawn`. |
| Built app differs from dev source | **Ruled out.** Extracted `app.asar` → `dist/main/harness/tools/grep.js` is byte-equivalent logic to the dev `grep.ts`. Same omission. |

The decisive comparison is **Bash (explicit `cwd`) works vs. Grep (no `cwd`) fails** —
same process, same runtime, the only difference is the `cwd` option.

### Proposed fix

1. **Primary (one line):** pass the session cwd in Grep's spawn, mirroring Bash:

   ```ts
   const child = spawn(rgPath, rgArgs, { cwd: ctx.cwd, windowsHide: true });
   ```

   `ctx.cwd` is already validated/used on line 27 for path resolution, so it's a known-good
   directory. This matches the proven-working Bash pattern.

2. **Audit for the same latent bug.** Any other `spawn(` in the main process that omits
   `cwd` is one ambient-cwd change away from the same failure. Files with `spawn(` to
   review: `session-manager.ts`, `engine/engine-supervisor.ts`, `prerequisite-installer.ts`,
   `update-installer.ts`, `github-auth.ts`, `theme-marketplace-provider.ts`,
   `remote-config.ts`, `dev-tools.ts`. Each should pass an explicit, validated `cwd`
   (or `process.cwd()` captured at startup when known-good) rather than inheriting.

3. **Defensive:** add a `child.on('error', …)` handler in Grep (and a shared spawn helper)
   so a future spawn failure resolves to a clear message instead of relying on the
   `defineTool` catch — and surfaces the *cwd actually used* to make this class of bug
   trivial to diagnose next time.

4. **Optional hardening:** a tiny `spawnWithCwd(cmd, args, ctx)` helper that always
   injects `cwd: ctx.cwd` would make the correct pattern the default and prevent
   regressions when new tools are added.

### Verification plan (after patch)

- In a dev instance (`bash scripts/run-dev.sh`): call Grep with (a) a file path, (b) a
  directory, (c) no path, across all three `output_mode`s — all should return results or
  "No matches found.", never `spawn ENOTDIR`.
- Regression pin: a unit test that spawns the Grep tool's `execute` with a stubbed `ctx`
  and asserts the child was spawned with `cwd === ctx.cwd` (spy on `child_process.spawn`).

---

## Cross-cutting note

Both issues share a theme: **ambient process state (cwd) is load-bearing but invisible to
the model.** The Bash fix makes cwd explicit and persistent-with-guardrails; the Grep fix
makes the spawn cwd explicit. A shared principle for the harness going forward — *never
inherit ambient cwd; always pass it explicitly, and always tell the model what the cwd
rules are* — would prevent the whole category.

## References

- Grep tool: `youcoded/desktop/src/main/harness/tools/grep.ts` (line 27 search-path, line 29 spawn)
- Bash tool (working pattern): `youcoded/desktop/src/main/harness/tools/bash.ts:40`
- Tool wrapper error format: `youcoded/desktop/src/main/harness/tools/registry.ts:25`
- Claude Code CWD issues: #42837, #35058, #28228, #22023, #37659 (scoped-persistence model +
  the "silent reset" complaint)
