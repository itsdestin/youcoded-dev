---
status: shipped
created: 2026-08-28
tags: [workspace, claude-md, session-start, hooks, MAP]
---

# Session-start orientation block — what shipped, and what is still weak

Merged to `youcoded-dev` master as `4684e17` (merge `03fc54d`). Written for a
reviewing session: what changed, why, what was measured, and the two failure modes
I proved exist but did not fix.

## Why any of this exists

I read the opening turns of every session in this workspace from 2026-08-26 → 08-28
(55 transcript files, 44 real sessions) and counted what each did *before* starting
its actual task. A parallel session ran the same exercise; its findings are in
`docs/active/investigations/2026-08-28-session-opening-friction.md` and overlap
heavily. Destin picked four items off my list; the other four (a `/review-doc`
command, a path-vocabulary block, a chatsearch-first rule, a `pkill -f` rule) were
explicitly deferred and are still open.

Measurements behind the four:

| Finding | Count |
|---|---|
| sessions that listed source dirs to find a file | 17 / 55 |
| sessions that hunted a type/function definition | 16 / 55 |
| sessions that hunted runtime paths on disk (2 timed out on `find /home/destin`) | 11 / 55 |
| sessions that re-derived worktree dirty/ahead with their own git calls | 22 / 55 |
| sessions that opened `ipc-handlers.ts`, which appeared in MAP zero times | 11 / 55 |
| sessions that read `docs/MAP.md` at all / within their first 5 tool calls | 39 / 55 · 7 / 55 |
| median tool call at which MAP.md was first opened | **#20** |

The pattern: sessions are not confused about *how to work here* — safety, worktrees,
`verify.sh` and the design-deck rules were all followed at a high rate. They are
confused about *where things are*, and those are facts, so they belong in the
session-start injection rather than in more prose asking people to go look.

## What changed

### `docs/MAP.md` — three new tables (all paths audited)
- **Hot paths** (28 rows) — product vocabulary → exact file. "quick chips", "the
  resume browser", "the No Active Session screen", "every main-process IPC channel".
  Every path was verified before being written.
- **Where shared types live** (4 rows) — six sessions in two days guessed wrong on
  `interface ConversationRecord` (it is in `main/conversations/store-core.ts`).
- **On-disk state** (11 rows) — `~/.youcoded/*`, `~/.config/youcoded` vs
  `~/.config/youcoded-dev`, `~/.cache/llama.cpp`, `~/.claude/projects`. The
  **Defined in** column is a repo path on purpose, so `/audit` catches a move.

### `.claude/hooks/context-inject.sh`
- Injects an orientation block **generated from MAP.md** (never hand-copied, so it
  cannot drift): a one-line-per-subsystem index collapsing each row to its first
  entry point + rule, then the two lookup tables verbatim (table rows and bold
  callouts only — MAP's explanatory prose is not injected).
- Worktree lines now carry commits-ahead and uncommitted-file counts, and flag
  `nothing ahead … candidate for cleanup`. The comparison base comes from
  `refs/remotes/origin/HEAD`, so wecoded-themes (`main`) is not compared against a
  `master` that does not exist. Measured at 0.14 s for 14 worktrees.

### `scripts/audit-anchors.mjs`
- `harvestMapPaths` now skips non-repo-relative paths (`~/…`, `<project>/…`,
  `/usage`). Without it the On-disk table would report eleven false missing paths
  and bury the real ones. It also removes one pre-existing false positive: `/usage`
  is a slash command, not a file.

### `.github/workflows/workspace-ci.yml`
- Runs `context-inject.test.mjs` and `glob-guard.test.mjs`. Both suites existed and
  **neither ran anywhere** — the exact failure shape `context-inject.test.mjs` was
  written about.

### `CLAUDE.md`
- The main checkout is normally dirty and behind; `setup.sh` and `git pull` skip it
  *without failing*; Serena is pinned to it and therefore answers from that stale
  copy; so worktrees branch from `origin/master`, never bare `master`.
- The MAP pointer now names the two new tables and says the hook already injected them.

## Verification actually run
- `node --test .claude/hooks/context-inject.test.mjs .claude/hooks/glob-guard.test.mjs
  scripts/audit-anchors.test.mjs` → **76 pass, 0 fail** (9 context-inject tests, 4 of
  them new).
- `harvestMapPaths` over the new MAP.md against the real workspace root → **288 paths
  harvested, 0 new missing**; the 3 that fail (`deck/`,
  `scripts/perf-lab/scenario-*.mjs`, `.claude/agents/*.md`) were failing before this
  change and are glob-shaped entries, not drift I introduced.
- End-to-end hook run against the live workspace → exit 0, 138 lines, 10,466 bytes
  total, of which the orientation block is ~7.7 KB (~1.9k tokens).

## Known weaknesses — proved, not fixed

Destin deferred these; a reviewing session should treat them as the top candidates.

1. **A dead path prints with full confidence.** Verified with a fixture row pointing
   at `DoesNotExist.tsx`: the hook emitted it identically to a real row. Nothing
   catches this until `/audit` runs, whose only automatic trigger is a daily 06:17
   UTC cron. A session that follows a dead row is worse off than one with no table,
   because it then distrusts the whole block. **Fix considered:** `test -e` per row
   at print time (microseconds), emitting `⚠ MOVED` instead of a confident path.
2. **An empty section still prints its heading.** Verified with a MAP.md containing a
   header row and no data rows: the block emitted `### Subsystems — open this file
   first` followed by nothing, which reads as "there are no subsystems". Same
   quiet-not-red shape as the original vanished-worktree bug. **Fix considered:** if a
   section yields zero rows while MAP.md exists, say so loudly.
3. **Coverage is a quarter of the surface** — 28 rows against 93 top-level renderer
   components and 20 component subdirectories. That is a reasonable size for a
   shortcut, but the block does not *say* it is one, so "not in the table" can be
   misread as "does not exist". **Fix considered:** one caveat line in the block.
4. **The rows encode my guess at Destin's vocabulary**, derived from two days of
   transcripts. A script that mines transcripts for file-hunts the table failed to
   answer would let the rows grow from evidence instead. Nice-to-have, not automatic.

Not worth doing: verifying that a row's *description* still matches its file. For
most rows the filename already carries the claim; the handful that diverge
(`App.tsx` for "No Active Session", `mock-shim.ts`, `cache-scan.ts`) do not justify
bespoke machinery.

## One incident worth recording
I wrote my findings report to
`docs/active/investigations/2026-08-28-session-opening-friction.md`, not realising
the parallel session had already committed a different report at that exact path.
Git had it, so `git checkout --` restored it and nothing was lost — but the write
itself was silent. The standing rule (save a `git diff` of any modified-uncommitted
file before touching it) does not cover this case, where the file is *committed* and
you are creating what you believe is a new file. Check `git log -- <path>` before
writing to a path in this shared workspace.
