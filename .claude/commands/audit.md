---
description: Fix-executing workspace audit — mechanical anchor pass via scripts/audit-anchors.mjs, diff-scoped semantic re-verification, fixes applied in-run, dated audit-trail report in docs/audits/.
---

# /audit — fix-executing workspace audit

/audit is a maintenance PROCESS, not a report generator. It fixes what it finds in the
same run and leaves the workspace healthier than it found it. Dumping an unactioned
to-do list is a failure mode, not an output. The dated report is an audit TRAIL — what
was verified, what was fixed — plus a near-empty residue of items that genuinely need
Destin's decision.

**Ground truth is the code.** The rules, depth docs, MAP, and ROADMAP are the claims
under test. This command doc deliberately contains NO subsystem-specific expectations —
the claims live in the documents themselves and are harvested at run time. (The old
/audit hardcoded its expectations and became the stalest doc in the workspace.)

## Usage

- `/audit` — diff-scoped (default): the mechanical pass always runs in full; semantic
  re-verification covers only subsystems whose files changed since the last report's
  `verified_shas`.
- `/audit full` — semantic re-verification of every rule + depth doc, and every `test:`
  anchor is RUN, not just existence-checked. Quarterly-ish, or whenever the script notes
  a base SHA is unknown. Diff-scoping can't catch claims that were wrong from the start.
- `/audit <subsystem>` — one subsystem. Names are `.claude/rules/*.md` basenames
  (`/audit sync-spaces`, `/audit chat-reducer`, …) — the list comes from the rules dir,
  never from this doc.

## Process

### 0. Sync

Run `bash setup.sh` from the workspace root. Stale git state invalidates findings.

### 1. Mechanical pass (always full, always first)

```bash
node scripts/audit-anchors.mjs --json
```

Checks, deterministically: every `verify:` anchor in `.claude/rules/*.md` (path exists,
`contains` regex present, test file exists), every `<!-- verify: {...} -->` doc anchor,
every path in `docs/MAP.md`, every rule `paths:` glob still matches ≥1 tracked file, and
the store budgets (rule bodies ≤600 words, PITFALLS ≤2,500 words, eager load ≤10k tokens).
It also emits the diff scope: changed files since the last report's `verified_shas`,
which rules they intersect, and changed code files matching NO rule.

**Every failure is confirmed drift. Fix it now**, before anything else:
- missing path / failed regex → read the code, correct the rule/doc/MAP entry (or the
  anchor, if the invariant moved), commit with the verification cited
- budget violation → trim or migrate content per the taxonomy (rule overflow → its lazy
  doc or a pinning test)
- glob matching nothing → the subsystem moved; update the rule's `paths:` and MAP row

Re-run until exit 0.

### 2. Determine semantic scope

- `/audit full` → all rules. `/audit <name>` → that rule.
- Default → `diffScope.affected` from the script output. If `diffScope.notes` says a base
  SHA is unknown or there's no base report, escalate to full.
- `diffScope.uncoveredCode` (changed code matching no rule) → judge whether a new
  subsystem has formed; if so, draft a new rule + MAP row as part of this run (gardening
  finding, not residue).

### 3. Semantic verification (subagents)

For each in-scope subsystem, dispatch a read-only verification agent (Explore) with:
the full rule text, the depth doc it points to, and this instruction:

> Verify every factual claim in these documents against the current code. For each claim,
> find the code that proves or disproves it and report file:line evidence. Report drift
> only — do not fix anything. Flag claims you could not verify either way.

Run up to 3 in parallel. The agents receive the documents as the claims — never a
paraphrase or a cached expectation.

### 4. Fix, don't report

Work every finding in the same run:
- **Doc/rule/MAP/CLAUDE.md corrections** — fix inline, commit as you go (verify against
  code first; cite the verification in the commit message).
- **Missing pinning tests, rule restructures** — superpowers:subagent-driven-development.
- **Sub-repo code fixes** — normal working rules: worktree, tests, PR. The audit gets no
  bypass.
- **Decision-residue** (privacy copy, LICENSE text, deleting user-created content,
  product-behavior questions) — never auto-edit; goes to the report's `## Residue` with a
  recommendation.
- Drift genuinely unfixable this session → ROADMAP `bug` line tagged `#docs` AND a
  residue entry.

### 5. Roadmap verification

For every open `[ ]` item in `ROADMAP.md`: check whether it already shipped (git log
since its `(added YYYY-MM-DD)` date, or read the code it names). Shipped → flip to `[x]`,
note the commit/PR in the detail line, move to `## Shipped`. Stale `in-progress` tokens
get the same check. Dedup near-identical items (merge detail lines, keep the older date).

### 6. Gardening (the anti-rot pass)

- Budgets: already enforced by the script in step 1; migrate any overflow now.
- `docs/active/` sweep: any doc whose feature merged → `docs/archive/`, status flipped
  to `shipped`/`superseded`. Verify every doc there still has `status:` frontmatter.
- MAP: update rows for renamed/new entry points found in steps 2–3.
- Auto-memory (`~/.claude/projects/C--Users-desti-youcoded-dev/memory/`): delete or
  migrate duplicative/misplaced/drifted entries. Planning content moves to ROADMAP.md —
  memory is the last-resort store.
- Outward-facing docs: diff each repo since the last audit; review README, in-app
  privacy copy, landing-page FAQ, LICENSE, sub-repo CLAUDE.md against what changed.
  README/CLAUDE.md accuracy fixes apply on sight; privacy/license changes are
  decision-residue.

### 7. Report + last_verified

- Update `last_verified:` to today in every rule that was semantically verified (not
  merely mechanically checked).
- Write `docs/audits/YYYY-MM-DD.md` with the frontmatter contract below, a changelog of
  applied fixes (what, where, verification), and `## Residue` listing ONLY items needing
  a human decision — each with a concrete recommendation. Set `residue:` to that count.
  The session-start hook greps `residue:` and the report date every session.
- Commit + push (workspace repo, direct or via worktree per size).

```yaml
---
date: YYYY-MM-DD
scope: full | diff-scoped | <subsystem>
residue: 0
verified_shas:
  workspace: <full sha>
  youcoded: <full sha>
  youcoded-core: <full sha>
  youcoded-admin: <full sha>
  wecoded-themes: <full sha>
  wecoded-marketplace: <full sha>
---
```

Take `verified_shas` from the script's `currentShas` output at the END of the run (after
fixes are committed), so the next diff-scoped run starts from what this run verified.

In full mode, additionally run every `test:` anchor through its repo's runner before
writing the report (e.g. `cd youcoded/desktop && npx vitest run <files>`;
`cd wecoded-marketplace/worker && npm test`). A failing pinned test is drift in the code
or the pin — investigate, don't skip.

## When to run

- Before any release (prevents shipping with stale docs)
- After major refactors touching IPC, reducer, or runtime
- When Claude acts on outdated info or mentions files that don't exist
- `/audit full` quarterly, or when diff-scope notes demand it
- The session-start hook nags when the latest report is >60 days old or has residue
