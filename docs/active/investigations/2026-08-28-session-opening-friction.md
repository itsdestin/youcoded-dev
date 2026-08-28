---
title: What every session wastes its first ten minutes on
status: active
date: 2026-08-28
method: read the opening turns + full tool streams of all 46 Claude Code sessions started in this workspace 2026-08-26 00:00 → 2026-08-28 09:00
---

# What every session wastes its first ten minutes on

Every claim below is a count taken from the session transcripts in
`~/.claude/projects/-home-destin-youcoded-dev/`, not an impression.
Scripts used: `scratchpad/digest.py`, `count.py`, `count2.py` (session scratchpad).

**Sample:** 46 sessions. 4,961 Bash calls, 369 Edits, 309 subagent dispatches,
297 Reads, 50 Skill loads.

---

## 1. Unquoted globs abort the whole command — 69 dead tool calls, 29 of the 46 sessions

The single most common wasted call in the workspace. Two independent traps stack.

**Trap A (the big one) — the shell eats the glob.** Claude Code's Bash tool runs the
login shell, which here is **zsh**, not bash. zsh expands `*.ts` *before* the command
runs and, finding no match, aborts the entire command line — bash would have passed the
word through untouched. Verified 2026-08-28:

| shell / form | result |
|---|---|
| `bash -c 'grep -rn X --include=*.ts src'` | works |
| `zsh -c 'grep -rn X --include=*.ts src'` | `zsh:1: no matches found: --include=*.ts` |
| `zsh -c 'setopt nonomatch; …'` | works |
| `grep -rn X "--include=*.ts" src` (quoted) | works |
| `rg -n X -g '*.ts' src` | works |

Breakdown of the 69 aborts — **this is what decides the fix**:

| shape | hits | sessions |
|---|---|---|
| `grep --include=*.ext` | 35 | 20 |
| another bare glob inside a `grep`/`rg` call (`tailwind.config.*`) | 24 | 16 |
| a non-grep command with a bare glob (`ls -d ~/.config/youcoded*`, `sed`, `find`) | 10 | 8 |

So a *grep-specific* rule catches only **35 of 69 (51%)**. The trap is the shell, not grep.

**Trap B — `grep` is not grep.** It is a shell *function*, injected by Claude Code into
`~/.claude/shell-snapshots/snapshot-zsh-*.sh` (line ~4728), that reroutes to **ugrep**.
Different error text, and it rejects valid POSIX grep syntax:

- `ugrep: warning: desktop/src: No such file or directory` — 21 hits, 11 sessions
- `grep -o '.\{0,120\}122B.\{0,120\}' f` → `ugrep: error: … exceeds complexity limits`,
  while `command grep` with identical arguments succeeds

`rg` at `/usr/bin/rg` is real ripgrep 15.1.0 and has neither problem.

**Not present in the product.** YouCoded's own harness is immune to both, by
construction: its native Bash tool spawns `/bin/bash -c` explicitly
(`src/main/harness/tools/bash.ts:114`), never the user's login shell, and its Grep tool
spawns bundled ripgrep directly through `@vscode/ripgrep` with no shell at all
(`tools/grep.ts:1-3`). This is purely a Claude-Code-on-this-machine problem, and the
workspace docs say nothing about it — `rg -n 'ugrep|zsh|nomatch|--include' CLAUDE.md
.claude/rules/` returns zero hits.

### Fixes, ranked

| | Fix | Catches | Risk |
|---|---|---|---|
| **1** | **PreToolUse hook on Bash** that blocks a command containing an unquoted glob in an argument and says "quote it or use `rg -g`" | 69/69 | none — blocking (not rewriting) costs one call and teaches at the point of use |
| 2 | One line in `CLAUDE.md`: *never type `grep`, use `rg`* | 35/69 | none, but it is prose — the same tier that bought 0 Serena calls |
| 3 | `env: { "SHELL": "/bin/bash" }` in `.claude/settings.json` | 69/69 | **unverified** that Claude Code honors it; also swaps the shell under every session mid-stream — zsh-specific setup would silently stop applying. Test before adopting |
| 4 | `setopt nonomatch` in `~/.zshrc` | 69/69 | changes Destin's own interactive shell (unmatched globs stop erroring) — not worth it for a tooling problem |

Recommended: **1 + 2 together.** The hook is the enforcement (it executes, which is what
this workspace's own knowledge ladder asks for — "an ast-grep rule beats a sentence");
the CLAUDE.md line is what stops the model reaching for `grep` in the first place, and
also steers away from Trap B, which the hook does not cover.

---

## 2. The auto-title hook fires ~6× per session — 277 wasted round trips

277 topic-file writes across 45 sessions, average **6.2 per session**. The `[Auto-Title]`
reminder re-fires on later Bash calls, and the model dutifully rewrites the same title
(sometimes a different one — sessions renamed their own topic mid-run 2–3 times).

Each write is a full tool round trip that produces nothing after the first.

**This is a hook fix, not a prompt fix:** the PostToolUse hook should stop emitting the
reminder once `~/.claude/topics/topic-<id>` is non-empty.

---

## 3. The Serena guidance is dead text — 0 uses in 46 sessions

`CLAUDE.md` spends a full paragraph (~150 always-loaded words) plus a rule file
(`.claude/rules/code-search.md`) on a search ladder that begins **Serena →
ast-grep → rg → whole-file reads**.

Actual usage across 46 sessions:

| Tool | Calls |
|---|---|
| `mcp__serena__*` | **0** |
| ast-grep | 47 |
| Bash (`rg` / `sed -n` / `cat`) | 4,961 |

It isn't disobedience — it's structurally unusable: Serena is pinned to the main
checkout, and nearly all work happens in worktrees, where it silently answers with
master's copy. The rule even says so. Meanwhile bypass-permissions mode explicitly
tells the model to prefer Bash.

**Recommendation:** delete the Serena paragraph from `CLAUDE.md` (keep the rule file if
you want it for main-checkout orientation). It costs prompt budget on every single turn
and has bought nothing in two days. What sessions *actually* do — `rg` to locate, then
`sed -n '<range>p'` to read only the region — is the behaviour worth writing down.

---

## 4. "Review the attached document" is the #1 task shape, and has no procedure

Opening-prompt shapes across the 46 sessions:

| Shape | Sessions |
|---|---|
| "Review the attached document for errors…" | **8** |
| New feature / design idea | 9 |
| Bare file path or screenshot, no instruction | 8 |
| Implement / execute a plan | 4 |
| Investigate a bug or crash | 4 |
| Other (status sweeps, one-offs) | 13 |

Destin retypes the same ~60-word review prompt every time, and every session then
re-invents the same procedure from scratch: read the doc → chunk it → grep the code to
check its claims → find the right git ref → write the review.

**Recommendation:** a `/review-doc` slash command holding the standing question set plus
the two rules the good runs discovered on their own:
1. verify load-bearing claims against **`origin/master`**, not the local checkout;
2. quote what the command returned — a claim without a pasted result doesn't ship.

That converts 8-sessions-worth of retyping and rediscovery into one invocation.

---

## 5. Plans are too long to read in one piece — 4–6 reads each

Recent plans run 1,538 / 1,598 / 1,984 lines. The Read tool refuses anything over ~25k
tokens, so every session that opens one does this:

```
sed -n '1,400p' … '400,800p' … '800,1250p' … '1250,1700p' … '1700,1984p'
```

Three sessions hit the hard "exceeds maximum allowed tokens" wall and had to back out
and re-plan the read.

**Two ways out, pick one:**
- Cap plan length in `superpowers:writing-plans` (a plan that needs 1,900 lines is really
  three plans — and the marketplace work already split into three parts, which read fine).
- Or add a line to `CLAUDE.md`: *plans and specs are long; read them with
  `sed -n '<start>,<end>p'` in ~400-line slices, never `cat`.*

The first is better. The second just makes the tax explicit.

---

## 6. The workspace is often not in the state `CLAUDE.md` promises

`CLAUDE.md` says the first action each session is `bash setup.sh`. In **8 of 46
sessions** it silently failed on the main repo:

```
error: Your local changes to the following files would be overwritten by merge:
	desktop/src/renderer/dev/workbench/…
```

Another session's uncommitted edits blocked the pull. Five sessions then discovered the
local `youcoded` master was **112 to 146 commits behind** `origin/master` and had to
reason their way — mid-task — to "branch from `origin/master`, not `master`."

The good sessions all reached the same conclusion independently. That rediscovery is
free to eliminate.

**Guidance to add:**

> `setup.sh` skips a repo's pull when another session left uncommitted files there, and
> says so in its output. **Read that output.** If `youcoded/` was skipped, treat the local
> `master` as stale: create every worktree from `origin/master`, and check claims with
> `git show origin/master:desktop/<path>` (note the `desktop/` prefix — that path is
> repo-root-relative even when you are inside `desktop/`).

That last parenthesis is its own small trap: 3 hits of
`fatal: path '…' exists, but not '…'` from running `git show origin/master:src/…` while
sitting in `youcoded/desktop`.

---

## 7. Worktrees live in three different places

The documented convention is `worktrees/<name>`. Reality at the workspace root:

```
worktrees/…      (12 registered)   ← the convention
artifact-zoom/   qwen4exp/         ← worktrees at the root
youcoded.wt/     wecoded-marketplace.wt/   beta/   flappy-bird/
```

Sessions burn calls on `git worktree list` + `ls` + `find` to work out where a branch
actually is; one session did `ls youcoded` *from inside a workspace worktree*, got "No
such file or directory", and had to re-derive that sub-repos aren't visible from there.

**Guidance to add:** state the rule and the exception in `CLAUDE.md` —
*every worktree goes in `worktrees/<short-name>`; nothing else at the workspace root is a
worktree; from inside a workspace worktree the sub-repos (`youcoded/`, `wecoded-*`) are
NOT visible — use absolute paths.*

---

## 8. `verify.sh` cries wolf — 8 sessions chased its baseline failures

11 hits of `window is not defined` / `app.setPath is not a function` from
`scripts/verify.sh`, across 8 sessions. Each time the session had to work out whether it
had broken something. It hadn't — these are pre-existing.

This is already recorded in auto-memory but nowhere a fresh session will see it.

**Best fix is mechanical:** have `verify.sh` print its known-baseline failures by name
and exclude them from the exit code, so a green run means green. Failing that, one line
in `CLAUDE.md`.

---

## 9. The same files get rediscovered — MAP.md stops one level too high

`docs/MAP.md` is genuinely working: referenced in **31 of 46 sessions** (as is
`ROADMAP.md`; `verify.sh` in 27; `.claude/rules` in 22; `PITFALLS.md` only in 9).

But it maps *subsystems to entry points*, and what sessions actually need is the exact
path of a specific hot file. Observed misses:

- `native-session-host.ts` — guessed at `src/main/`, actually `src/main/harness/`
  (2 wasted calls, then a `find`)
- `ConversationRecord` — 6 greps across `shared/types.ts`, `conversation-store.ts`,
  `shared/conversation-types.ts` before finding it in `store-core.ts`
- `ArtifactThumbnail.tsx`, `StatusBar.tsx` (1,570 lines, read in 5 slices),
  `LocalModelsSection.tsx`, `cache-scan.ts` — each independently rediscovered by 2+ sessions

**Recommendation:** add a flat "hot paths" table to the bottom of `docs/MAP.md` — 20 rows,
`symbol or concept → exact path`. It is the cheapest possible fix and MAP.md is already
the file sessions open.

---

## What I would change, in order of payoff

| # | Change | Where | Payoff |
|---|---|---|---|
| 1 | PreToolUse hook blocking unquoted globs, + "never `grep`, always `rg`" line | hook + `CLAUDE.md` | kills 69 dead calls / 29 sessions |
| 2 | Stop the auto-title hook re-firing | the hook | kills ~5 calls × every session |
| 3 | Delete the Serena paragraph | `CLAUDE.md` | frees always-loaded budget; 0 uses |
| 4 | `/review-doc` slash command | `.claude/commands/` | the #1 task shape, currently retyped |
| 5 | "setup.sh skipped a repo → branch from origin/master" | `CLAUDE.md` | 8 sessions rediscovered it |
| 6 | Hot-paths table at the end of `MAP.md` | `docs/MAP.md` | ends per-session file hunting |
| 7 | Baseline-failure filter in `verify.sh` | `scripts/verify.sh` | 8 sessions chased ghosts |
| 8 | Worktree location rule | `CLAUDE.md` | ends `git worktree list` archaeology |
| 9 | Cap plan length (or document the slice-read) | `writing-plans` skill | 4–6 reads per plan today |

Items 1, 3, 5 and 8 are net-neutral or net-negative on prompt length — 3 removes more
than 1, 5 and 8 add.
