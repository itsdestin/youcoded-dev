---
status: draft
created: 2026-09-03
topic: Developer-tooling review — youcoded-dev vs. JLBC Search (ask-the-budget-az-dev) — what to carry each way
scope: Inventory of both repos' dev tooling, ranked transfer list. No code changed.
---

# Dev tooling: youcoded-dev ↔ JLBC Search

## How to read this

Two inventories were taken on 2026-09-03 (subagent sweeps, spot-checked by hand).
Every "absent" below was confirmed by a search, not assumed. Every "used in N of
46 sessions" figure comes from the 2026-08-28 study
(`docs/active/investigations/2026-08-28-session-opening-friction.md`), which is the
only usage data either repo has — so it is what decides the ranking.

Two ground rules for the ranking:

1. **Only export what is measured to be used.** youcoded-dev has a lot of tooling that
   sessions never open (Serena: 0 of 46 sessions; `PITFALLS.md`: 9 of 46). Copying
   those would move cruft, not value.
2. **Only export what is shell-shaped, not Electron-shaped.** The workbench, the
   ui-review rig and `verify.sh` as written are wired to Electron, React IPC and the
   fake `window.claude`. The *ideas* transfer; the files do not.

## The two repos in one line each

| | youcoded-dev | JLBC Search |
|---|---|---|
| Shape | Workspace of 5 repos, Electron + Android | One repo, FastAPI + Vite SPA |
| Agent config | `.claude/` with 2 hooks, 23 path-scoped rules, 2 skills, `/audit` | **No `.claude/` at all** — a 20 KB `CLAUDE.md` is the entire contract |
| Always-loaded context | `CLAUDE.md` + session-start hook (~2k tokens of MAP tables) | `CLAUDE.md` + **`@STATUS.md` = 7,628 lines / 486 KB**, imported into every session |
| One-command verdict | `scripts/verify.sh` (tsc, vitest-related, knip, eslint, ast-grep in parallel; used in 27/46 sessions) | None. `setup.sh --verify` runs pytest + vitest only; the "four gates" ritual (pytest / vitest / tsc / build) is prose in STATUS.md |
| Lint / types / dead code | eslint, tsc, knip, ast-grep invariants | **None** — no ruff, mypy, pyright, eslint, prettier, knip |
| CI | `workspace-ci.yml` (anchors, hook tests, ast-grep; daily cron) | **No `.github/` directory** |
| Quality measurement | `harness-eval.mjs` (paid model matrix), `perf-lab/` | `eval/` — Layer 1 retrieval eval (free, 60 s, results **committed with the code**, `.md` carries deltas), Layer 2 agent eval (paid, cost-to-accurate metric), 4 calibration sweeps, `over-time/trend.md` |
| Test guards | `*-authority` source-scanning suites, `ipc-channels` parity, ast-grep | 3 autouse conftest isolation fixtures (each with a WHY docstring naming the defect that bought it), coupled-constants guard, cross-producer agreement test, eval-safety guard |
| UI iteration | Workbench (real renderer, fake backend), screenshot sweep across 6 themes, review deck | Hand-written static HTML in `mockups/` (10 files) + `DESIGN-SYSTEM.md`; a human in a browser is the only renderer. STATUS.md logs "nobody has seen this in a browser" 11 times |
| Dev launcher | `run-dev.sh` with `--offset`/`--profile` so two sessions coexist | None; port 9300 hard-coded in 6 places, so two sessions cannot both run the app |
| Docs navigation | `docs/MAP.md` (used 31/46 sessions) + hot-paths table; `docs/active` vs `docs/archive` with `status:` frontmatter | No index; 39 specs + 47 plans navigable by date-prefixed filename only. `CLAUDE.md:152` points at `.claude/rules/`, which does not exist |
| Status ledger | `ROADMAP.md` — **714 KB**; rolling cleanup "never executed" | `STATUS.md` — **486 KB**; declared single source of truth |

## Part 1 — What JLBC should take from youcoded-dev, ranked by payoff ÷ cost

### 1. Stop auto-loading a 486 KB status file; inject a summary instead  *(biggest win, ~1 hour)*

`CLAUDE.md` imports the whole of `STATUS.md` into every session. That is roughly
120k tokens **before Destin has typed a word**. Whether Claude Code loads all of it
(most of the context window gone at turn zero) or cuts it off (the "single source of
truth" is silently partial), the outcome is bad. I could not verify from transcripts
which happens — Claude Code does not store the system prompt — but neither case is
the intended one.

**Do instead:** copy the shape of `.claude/hooks/context-inject.sh`. A SessionStart
hook prints (a) the `## Phase summary` table, (b) every line carrying a 🔴 or ⏸
glyph, (c) current branch, behind-count and worktrees. That is ~2–3k tokens and is
the part a session actually needs. The rest of `STATUS.md` stays on disk for `rg`.

**You'll notice:** sessions start faster and stay coherent longer. **Risk:** a
session that needed a *shipped* detail must now search for it — that is a `rg`
call, not a loss.

### 2. One verify script  *(~1 hour; verify.sh was used in 27 of 46 sessions here)*

`scripts/verify.sh` for JLBC: `uv run pytest -q`, `npx vitest run`, `npx tsc -b`
(in `webapp/`), in parallel, one exit code, last 25 lines of any failure. Add a
`--eval` flag that runs Layer 1 and prints the recall delta against the previous
committed result, because `CLAUDE.md` already mandates that run after any change
under `retrieval/`, `ingest/`, `chunking/`, `citation/` or the system prompt — a
script can check the diff for those paths and run it automatically, the way the
youcoded one runs the full suite when test infra changes.

Lesson to carry with it, from here: a verdict script that "cries wolf" gets ignored
(8 sessions chased baseline failures until they were fixed). Keep it green.

### 3. Add the free linters  *(~1 hour, then continuous)*

Nothing checks Python or TypeScript style or types outside `npm run build`. Add
`ruff` (lint + format), `pyright` in basic mode, `eslint` with the typescript preset,
and `knip` for the webapp — then put them in verify.sh. youcoded-dev's experience:
eslint is the tool that catches the bug classes types cannot see (floating promises,
conditional hooks). Expect a first run to be noisy; fix or baseline once.

### 4. `.claude/` with 3–4 path-scoped rules and a hot-paths table  *(~2 hours)*

`CLAUDE.md` is 20 KB, every byte loaded every session. About half of it is only
relevant when touching specific directories:

- **Measurement discipline** → rule scoped to `**/retrieval/**`, `**/eval/**`,
  `**/harness/constants.py`
- **Testing conventions** → rule scoped to `**/tests/**`, `**/conftest.py`
- **Packaging** → rule scoped to `**/packaging/**`

Use the `**/` prefix form. youcoded-dev learned this the hard way: 100 of its 134
rule globs are `youcoded/desktop/...` and **never fire inside a worktree**, which is
where all real work happens (`docs/active/investigations/2026-08-31-session-retrospective-workspace-friction.md`,
Theme A). JLBC keeps worktrees under `~/ask-the-budget-az-worktrees/`, outside the
repo, so the rules must live in the worktree too — they will, since `.claude/` is
committed.

Then a `docs/MAP.md` with a hot-paths table (what you'd call it → exact file). It is
the single most-opened file in youcoded-dev and cost a few hours to write.

### 5. Copy `glob-guard.py` as-is  *(10 minutes)*

It is generic: a PreToolUse hook that blocks unquoted globs the login shell would
expand and abort on. Measured here at 29 aborts caught, 0 false positives, over 5,086
real commands. It fails open. Same shell, same trap in JLBC sessions.

### 6. A dev launcher with a port override  *(30 minutes)*

`JLBC_PORT` env var honoured by `app/main.py`, `vite.config.ts` proxy and a
`scripts/run-dev.sh` that picks a free port and labels the process. Today two
concurrent sessions cannot both run the app. Small change, removes a whole class of
"port already in use" detours.

### 7. CI  *(~1 hour)*

The repo is on GitHub with no `.github/`. One workflow running verify.sh on push and
PR turns the four-gate prose ritual into a check that runs whether or not a session
remembers. The Layer 1 eval needs the corpus, so it stays local — CI runs the free
gates only.

### 8. UI verification without a human  *(the big one — days, not hours; decide separately)*

The workbench and ui-review rig do not transfer as files. The **idea** does, and it
is the gap STATUS.md complains about most often. JLBC's SPA already has a clean
boundary (`/api/*` proxied to FastAPI). Two steps, smallest first:

- **Step A — screenshot sweep.** Playwright opens every route against a seeded local
  corpus, saves a PNG per route, and *verifies the page actually rendered* (target
  element present, pixels non-blank) before saving. Reuse the self-verification
  rules from `scripts/ui-review/README.md` → "Why it can be trusted"; skip the
  six-theme matrix, JLBC has one theme.
- **Step B — the review deck.** `scripts/ui-review/review-cards.py` takes Before/After
  image pairs and a spec and serves the Yes/No/Other deck Destin already approves
  YouCoded changes on. It is mostly generic; the crop config is the YouCoded-specific
  part. This replaces hand-written `mockups/*.html` for review of *changes* (mockups
  stay useful for *new* screens).

Skip the fake-backend workbench entirely unless Step A proves insufficient — a
FastAPI test fixture serving a tiny seeded LanceDB is JLBC's natural mock, and it
already exists in spirit in `tests/`.

### 9. `docs/active` vs `docs/archive` + a doc-anchor check  *(~1 hour, optional)*

Split `docs/superpowers/*` into active and archive with `status:` frontmatter, and
copy `scripts/audit-anchors.mjs` to check that paths named in docs still exist. It
would have caught `CLAUDE.md:152` pointing at a directory that is not there.

### Not worth exporting

- **Serena / MCP code search** — 0 uses in 46 sessions here; a Python repo of this
  size is served fine by `rg`.
- **ast-grep invariant rules** — worth it only once JLBC has a code-shape invariant
  that keeps recurring; none is recorded yet.
- **The full `/audit` command** — heavy; the anchor check (item 9) is the useful part.
- **ROADMAP.md conventions** — see Part 3; the format is fine, the file is not.

## Part 2 — What youcoded-dev should take from JLBC

JLBC's measurement discipline is the more mature of the two, and it is written as
*evidence-backed rules*, each naming the defect that bought it. Three transfers:

1. **"Run a control, not a remembered baseline."** The perf-lab and harness-eval
   compare against reference numbers. JLBC's rule — re-run the unmodified code
   *now, on the same machine* — belongs in `.claude/rules/harness-evaluator.md` and
   the perf-lab README, because this machine's load swings absolute numbers by 70%.
2. **Longitudinal eval archive.** JLBC keeps `eval/results/over-time/{metrics.jsonl,
   index.json, trend.md}` and names every result `<UTC>Z-<git-sha>`. youcoded-dev
   commits harness-eval `report*.md` per run (4 tracked today) but has no trend file
   and no sha in the name, so "did this get worse over the last month" has no answer.
3. **Autouse isolation fixtures instead of prose.** JLBC's `tests/conftest.py`
   makes it *impossible* for a test to write to real history or read a real data
   dir, with a docstring naming the incident. `test-suite-hygiene.md` here still has
   three of eight sections marked `Guard: none — candidate`. That is the top tier of
   youcoded-dev's own knowledge ladder, and JLBC is the one applying it.

Also worth a line in `CLAUDE.md` here: JLBC's *"parallelize on disjoint FILE SETS,
not tasks"* and *"tell a subagent what NOT to touch"* — both shorter and more
actionable than the current worktree paragraph.

## Part 3 — The disease both repos share

`ROADMAP.md` is 714 KB. `STATUS.md` is 486 KB. Both are declared the single source
of truth for what is open. Both have grown past the point where a session — or
Destin — reads them; youcoded-dev's own retrospective found a duplicate ROADMAP
entry filed because the existing one was too far down to find, and its rolling
archive is "flagged in-file as never executed."

The fix is the same in both places and is item 1 above applied twice: **the
always-loaded surface is a short generated summary; the ledger stays on disk and
gets searched.** Shipped items move to an archive file on every release. Neither
repo needs a new format — each needs the cleanup step that was designed and never
run.

## Suggested order, if all of it is approved

1 → 2 → 3 → 5 (one afternoon; each is independent) → 4 → 6 → 7 → 9 → then decide on 8.
Part 2 items are three small PRs here and can go in parallel with any of the above.
