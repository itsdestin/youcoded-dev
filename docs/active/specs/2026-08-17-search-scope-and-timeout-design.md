---
status: draft
date: 2026-08-17
tags: [harness, tools, grep, glob, scope, timeout, reliability]
---

# Spec: Grep/Glob default scope + per-tool timeout (split into two independently shippable chunks)

> **STATUS (verified 2026-08-26): neither chunk is built.** Chunk A has a reviewed, ready
> implementation plan (`docs/active/plans/2026-08-17-search-scope-timeout-chunk-a.md`) with 0 of 29
> steps done and no branch. **Chunk B has no plan at all** — it exists only as the section below, and
> the ROADMAP carries no item for either chunk or for the A/B split. `git grep -n 'toolTimeoutMs'
> origin/master -- desktop/src` → no hits; Grep/Glob remain unbounded on master, so the motivating
> incident (a 181-second Grep from a non-git `$HOME` cwd) is still reproducible today.

> **Revision note (2nd review, another youcoded session):** v1 combined three
> changes. This revision splits them into **Chunk A** (the safety win, small)
> and **Chunk B** (parity/polish, larger blast radius, owns its own review),
> under-argued `--no-config` is fixed with a one-line why, the motivating
> incident is reframed honestly (the timeout is the sole guard for it — changes
> 1/2 are inert for a non-git home-dir cwd), the speculative tier-2 root
> resolution is cut, and Bash-cwd vs. search-root consistency is called out.

## Motivation

A live gemini-3.7-flash session hung on this single call:

```
Grep { pattern: "POWER FLOW|power chip|PowerFlow|power-flow", path: "." }
```

The session's `cwd` was `/home/destin`. Grep defaults `path:"."` to `ctx.cwd`
and passes `--hidden`; ripgrep was still grinding through **~1.97M files /
827 GB** fourteen minutes later (`z13-migration` 101G, `vms` 76G, `YouCoded`
55G, `Games` 44G, `.cache`, a 3.1 GB `.iso`). The Grep tool awaits only the
child's `close` event — **no timeout** — and the stall watchdog
(`armWatchdog` in `harness-session.ts`) guards *stream* liveness only, not
*tool* liveness. So the turn hung with no card, no retry, no error.

### Honest framing (which change actually bounds this incident)

`/home/destin` is **not inside a git toplevel**, and it has **no `.gitignore`**.
So for the exact incident that motivated this spec:

- **Change A1 (default root to project root)** is **inert** — the resolver
  finds no git root and falls back to `ctx.cwd`, which *is* `/home/destin`.
  The search root is unchanged.
- **Change B1 (respect `.gitignore`, drop `--hidden`)** is **mostly inert** —
  there is no `.gitignore` in a home dir to honor, and none of the huge dirs
  (`z13-migration`, `vms`, `YouCoded`, `Games`) are dot-hidden. Only `.cache`
  would be skipped by dropping `--hidden`.
- **Change A2 (per-tool timeout)** is **the sole guard** that bounds the
  incident — the 827 GB grind now stops after 180 s and returns an `isError`
  to the model instead of hanging the turn.

The scope changes (A1/B1) are **not** "the fix for the incident" — they are the
**ecosystem-parity correctness work** (Claude Code / OpenCode default search
scope to the project root and let ripgrep's own ignore semantics apply) and
they protect the *common* case where the session cwd is a project root or a
subdirectory of one. The **timeout is the security backstop** and is what the
whole headline rests on. This split is intentional and is pinned by an
end-to-end test below.

Two review-flagged realities, restated plainly:
- `--hidden` did **not** cause the incident. The cause was the root being
  `/home/destin` with no governing ignore file. Removing `--hidden` touches
  almost nothing in that tree.
- Even after the timeout, the grind *does* run up to 180 s before the turn
  recovers. That is the accepted design (the timeout is the backstop, not a
  magic scope fix), and it must be tested.

---

## Chunk A — default search root → project root (git) + per-tool timeout

Chunk A is the isolated safety/expectation win. Small, low blast radius, ships
first. It does NOT touch gitignore semantics or the Glob rewrite.

### Change A1 — Default the search root to the project root (git toplevel only)

#### Goal

A Grep/Glob call with no `path` (or `path:"."`) searches the **repo toplevel**
when the session belongs to one — not the raw session `cwd` — and, when that
differs from what the model would assume, the tool result says so. This matches
Claude Code / OpenCode (`ins.directory`, the project reset).

#### Resolution (reviewed — tier 2 cut)

Two tiers, first match wins, all **synchronously** and bounded:

1. If `ctx.cwd` (or the resolved root) is inside a git worktree → the **repo
   toplevel** (`git rev-parse --show-toplevel`). Reuse `resolveRepoRoot`
   (`youcoded/desktop/src/main/git/git-exec.ts`, already cached per-dir).
2. Else → **keep `ctx.cwd`** (no better root exists; the safe fallback that
   already handled "no better root" before this change existed).

The v1 "project marker / workspace-root the host tracks" tier is **cut**. It was
speculative scaffolding with no concrete instance the spec could point to, and
it added resolve/rebase/guard surface for zero demonstrated need. Re-add it
only if a concrete home-cwd-but-project-worktree case shows up later (the
"ask-the-budget-az-worktrees" pattern is the closest known shape — see
"Recorded for later").

**Explicit `path` always wins.** A relative/absolute `path` is honored exactly
as today (resolution against `ctx.cwd`, existing `checkPathGuard` /
`external_directory` gating unchanged). Defaulting only changes the **no-path**
case.

#### Model notification — GATED (reviewed)

The v1 mandatory root-disclosure on every default search was noise (Claude Code
ships no such prose). **Resolution: fire it only when the resolved root actually
differs from what the model would naively assume**, i.e.:

- a git toplevel was found **above** a non-root `ctx.cwd` (cwd was a subdir), or
- the root is a git toplevel and `ctx.cwd` is *not* already that toplevel.

When it fires, one short line, folded with the B1 exclusion note if both apply:

```
Search scoped to the project root (/path/to/repo). Pass a specific `path` to search elsewhere.
```

When root == `ctx.cwd` (the home-dir case), **no disclosure** — nothing was
defaulted, and the proposed noise is exactly what the review objects to.

#### Bash-cwd vs. search-root consistency (reviewed — was absent)

Rules today say file tools resolve against `ctx.cwd`, not the scoped-persistent
`shellCwd`. Under this change, a model that `cd`s into a subdir via Bash and
then Greps with no path now gets the **project root**, not where it just cd'd —
a deliberate behavior change that will surprise a mid-session model. **Decide
and pin it:** with no `path`, search the project root regardless of shell cwd
(this is the Claude/OpenCode norm), and note in the root-disclosure line that
the search ignores the shell's cwd. Add a test: Bash `cd` into a subdir, then a
no-path Grep returns paths relative to the project root.

#### Keep the permission jail honest (unchanged from v1)

If the resolved project root is **outside** `ctx.cwd`'s allowed root (e.g. a
home-cwd session whose git toplevel is elsewhere), route it through the existing
`external_directory` approval rather than silently widening read access.
**RESOLVED: keep the jail honest.** Consequence, accepted: the *first* default
Grep in a home-dir session may prompt before it can search a repo root outside
the workspace — the honest cost of not widening read access implicitly.

### Change A2 — Per-tool timeout (the real guard for the incident)

#### Goal

A search tool can never hang the turn past a bounded wall-clock budget. On
expiry, kill the child and resolve with a synthetic `isError` result that tells
the model to narrow — the turn continues rather than wedging. This is OpenCode's
`tool_timeout` shape (PR #36869).

#### Where the timeout lives

In **`defineTool`** (`tools/registry.ts`) as an optional per-tool cap, one
mechanism for all tools:

- Add an optional `timeoutMs` to the tool def (`caps`). **RESOLVED: default for
  Grep/Glob is 180 s** — large enough for a legitimate broad search, small
  enough that a `/home/destin`-scale sweep returns instead of wedging.
  Configurable per-tool; `0`/unset disables.
- Race `def.execute(...)` against a timer; on timeout, abort via
  `AbortSignal.any([ctx.signal, timeoutSignal])` (so user-interrupt and timeout
  share one path, and both tools' existing `onAbort → kill('SIGKILL')` /
  `aborted` checks fire), and return:
  ```
  { text: "Grep timed out after 180 s — the search was too broad. Narrow it: pass a more specific `path`, add a `glob`/`pattern`, or use output_mode:\"count\".", isError: true }
  ```
- Crucially the child process must actually be killed; aborting the shared
  signal does this via the existing kill wiring.

#### Behavior matrix

| Case | Result |
|---|---|
| User interrupts (Stop / Esc) | Unchanged — existing abort → kill → "Canceled" |
| Timeout fires, tool keeps running | Abort signal → child killed → `isError` "timed out, narrow it" |
| Timeout fires after tool already resolved | Ignored (timer cleared on resolve) |
| `0` / unset | No timeout (opt-out for a caller that needs it) |

#### Why timeout not "park"

The stall-watchdog "park" is a *wait* — it tears nothing down so a later chunk
continues the turn. A hung *tool* has no stream to continue, only a child to
wait on, so the correct recovery is **abort + synthesize a resolved error
result** (the model decides whether to retry). The park feature stays as-is for
provider stalls; this is a separate mechanism for tool execution duration.

#### Specialist children

A specialist child that hits a tool timeout returns an `isError` tool-result
normally (the Task tool's existing failed-run path) — it must NOT hang, unlike
the park's child footgun. Matching the 2026-08-16 child-park fix.

---

## Chunk B — gitignore/hidden semantics + Glob rewrite + opt-in

Chunk B is the per-query parity/polish work. Larger blast radius (esp. the Glob
rewrite); ships after A, **own review, own tests**.

### Change B1 — Respect `.gitignore` by default; stop passing `--hidden`

#### Grep changes (`grep.ts`)

- **Remove `--hidden` from `rgArgs`** (line 266). ripgrep's default already
  skips hidden files/dirs; dropping `--hidden` is what lets the project's
  `.gitignore` (including `.cache`, `.claude`, etc.) apply.
- **Keep `--no-config`** with an explicit why: `--no-config` disables only the
  **user's global config** (`RIPGREP_CONFIG_PATH` / `~/.ripgreprc`), NOT ignore
  files — **we want to keep the repo's own ignore semantics while rejecting
  user-global config that could silently mutate every search result** (OpenCode
  has an open bug on exactly this: `#12925`). The pairing reads contradictory
  without this sentence: "respect .gitignore" and "reject user config" are two
  different things and both are deliberate.
- **Keep `--glob '!.git'`** as belt-and-suspenders VCS-dir exclusion.

#### Model notification — GATED (reviewed)

Like A1, gate the exclusion note so it is not noise on every call. Fire it only
when the search actually ran under the protective defaults **and** did not
request the opt-in — folded into A1's single disclosure line when both apply:

```
Search scoped to the project root (/path). Hidden and git-ignored files were excluded; pass the opt-in or a specific `path` to include them.
```

The user's requirement to "inform the model those were excluded" is preserved,
but only when exclusion actually happened, not postured on every default call.

#### Glob changes (`glob.ts`) and the blast-radius warning

Options considered:
- **(A) Keep the manual walk, make it ignore/hidden-aware** — hand-parse
  `.gitignore` (negation `!`, anchors, dir-only rules are subtle and easy to get
  wrong).
- **(B) Shell Glob's enumeration to `rg --files`**, then re-apply glob→regex,
  mtime sort, limits, cancellation.

**RESOLVED: (B)** — no hand-rolled ignore parser, and guarantees Grep/Glob
parity by construction (matches Claude Code, which shells Glob to ripgrep).

**Blast-radius acknowledgment (reviewed — this is the largest risk in the
spec):** the current manual walk gives Glob several properties "for free" that
a naive `rg --files` swap would silently lose:

- **`WALK_CEILING = 50_000`** — ripgrep has **no cheap "stop at 50k files"
  equivalent** (`rg --files` streams until done). An unbounded `rg --files` over
  an un-ignored huge dir drops the ceiling entirely — a **real regression risk**,
  not a trivial port. Must be solved explicitly (e.g. a streaming consumer that
  stops after N entries and reports "at least N", or a `--max-files`-style bound
  if pgrep/ripgrep supports it at the needed granularity).
- **mtime sort** — must be re-derived on the enumerated list.
- **cancellation** — must still honor `ctx.signal` and stop enumerating.
- **external-root rebasing** — must still produce workspace-root-relative (or
  absolute-for-external) paths, matching Grep.

This is **not** fused into Chunk A; it ships here in B with its own review and
its own tests. The `rg --files` path shares the same launcher/wiring as Grep's
pipeline (cwd pinning, `--path-separator /`, external-root rebase) — factoring a
shared search launcher is the cleanest way, but is a substantive refactor and is
treating as such.

### Change B3 — Opt-in override for hidden/ignored files

**RESOLVED: ship the opt-in** — a per-call `hidden`/`includeIgnored` flag that
re-adds `--hidden` (and lets Git-ignored files in) for that call only, so a
model that genuinely needs `.cache`/hidden files can reach them without
weakening every other search. Applies to both Grep and (via the `rg --files`
enumeration in B2) Glob. Default stays protective.

---

## Test plan

### Chunk A — `harness-search-scope.test.ts` (A1) + `harness-tool-timeout.test.ts` (A2)

**A1 root defaulting:**
- no `path` in a git-backed cwd resolves to the repo toplevel;
- `path:"."`/`"./"` treated as "no path" → repo toplevel;
- explicit `path` wins, resolution against `ctx.cwd` unchanged;
- **non-git cwd falls back to `ctx.cwd`** (tier 2 gone → two tiers, no marker);
- root outside the workspace jail still triggers `external_directory` ask;
- no disclosure when root == `ctx.cwd`; disclosure when a git toplevel was found above a subdir cwd;
- **Bash `cd` into a subdir, then no-path Grep → project root, not shell cwd** (consistency pin).

**A2 timeout:**
- a Grep whose rg child never closes resolves `isError` after the cap;
- the child process is killed (no lingering rg in the fixture's children);
- a Glob whose walk overruns the cap behaves the same;
- a fast tool is not affected (timer cleared, no false positive);
- `timeoutMs: 0` disables;
- timeout result is a normal tool-result (specialist-safe), not an unresolved promise.

**A2 + A1 end-to-end — the motivating case (the single most valuable test):**
- a **non-git home-dir cwd** fixture;
- assert Change A1 **falls back to cwd** (root unchanged);
- assert there is **no .gitignore to honor** (B1 inert);
- assert the **only** guard that fires is the timeout: run a would-be-huge sweep,
  let the 180 s cap fire, confirm the turn continues with an `isError`, and
  confirm **no lingering rg process** remains.
- This pins the headline claim ("the timeout is the sole guard for the incident")
  that the whole spec rests on, and is currently untested — adding it closes the
  review's single biggest gap.

### Chunk B — `harness-search-scope.test.ts` (B1/B3) + `harness-search-scope-glob.test.ts` (B2)

- a `.gitignore`'d dir is excluded by default; a hidden dir (`.cache`) is
  excluded by default;
- the opt-in override includes them;
- the exclusion note is present (folded) unless overridden;
- **Grep and Glob agree** on which files a default search returns (parity after B2);
- B2: `rg --files` enumeration respects `--max-files`-style ceiling (stop at N,
  report "at least N"), mtime sort is correct, cancellation stops the stream,
  external-root rebasing matches Grep.

---

## Chunk delivery order

- **Chunk A ships first.** `Change A1 (git-toplevel root default)` +
  `Change A2 (per-tool timeout)`. Small, isolated, bounds the incident class,
  minimal regression surface. Disclosures gated as above.
- **Chunk B ships second, independently.** `gitignore/hidden semantics + Glob
  onto rg --files rewrite + opt-in`. Own review, own tests, deliberate because
  the Glob rewrite is the most likely to regress the search tools.

## Out of scope (recorded for later)

- The stall watchdog itself (`armWatchdog`) — unchanged; stream-liveness only.
- Wiring the `defineTool` timeout to tools other than Grep/Glob (Bash has its own
  model-managed `timeout`; WebSearch has its own service) — generic infra, follow-up.
- **Re-adding a "project marker / workspace-root" tier** to A1 — only if a concrete
  home-cwd-but-project-worktree case (the "ask-the-budget-az-worktrees" shape)
  is demonstrated; not built speculatively in v1.
- A hardcoded "skip these huge dirs" list — deliberately NOT done; no mainstream
  harness does this, and root-default + gitignore + timeout is the correct,
  less-surprising fix. (An opt-in `skip` param could be a later add.)
