---
date: 2026-08-31
scope: Workspace retrieval repair — audit budgets, rule globs, load measurement, close-out
residue: 1
verified_shas:
  workspace: 458d564aded501f6805d601b6d386d4ac2c2905f
  youcoded: ddac2f14112c92976a4b530e76d5efb1b7122c87
  youcoded-core: 39fb9413aefa7029b3fd070384914ac1a382264e
  youcoded-admin: a4d9e8cb2b3c82186cf61c12053b92451da983d8
  wecoded-themes: 94c5e462a777d5897c261147db6e28e831d24e79
  wecoded-marketplace: 0987b96eb975957cbb62012a6e2891a5394bef19
---

# Audit baseline — 2026-08-31

This report exists to reset the diff window. The previous and only baseline was
2026-07-15, so every `/audit` run since had been re-scoping 47 days and 3,196
changed files, and reporting 607 files as "matching no rule" — a number large
enough that nobody read it.

## What this run verified

The mechanical pass is green for the first time in weeks: `anchors 388/388`,
`MAP paths 340/340`, no budget violations, no worktree-blind globs, no rule
frontmatter a strict YAML parser rejects. `node --test scripts/audit-anchors.test.mjs`
passes 41/41.

Three checks are new in this run and did not exist for the 2026-07-15 baseline:

- **`worktreeBlindGlobs`** — a rule glob that names a sub-repo by its workspace
  path cannot match the same file inside `worktrees/<name>/`. 115 of 138 globs
  were in that state; all now relaxed to `**/`.
- **`yamlUnsafeFrontmatter`** — a rule whose frontmatter a strict YAML parser
  rejects loses its `paths:` and loads eagerly on every session. Two rules had
  been doing this since at least April.
- **`strayRuleDirs`** — a `.claude/rules/` directory inside a sub-repo is
  unreachable from a workspace-rooted session. Currently WARNs on
  `youcoded/.claude/rules/android-runtime.md`, pending a PR in that repo.

## Residue

**One item, and it is cross-repo.**

- `youcoded/.claude/rules/android-runtime.md` still exists. Its unique content was
  merged into `.claude/rules/android-runtime.md` in this change; deleting the file
  needs a PR in the `youcoded` repo. Until that lands, `strayRuleDirs` reports it
  as a WARN rather than failing the run — gating on it here would hold this
  workspace's CI red for the life of that PR, which is the defect this change set
  exists to end. Flip it to a failure condition in the commit that confirms the
  file gone.

The four budget violations that stood on 2026-08-31 were fixed in the same change
(see `docs/active/plans/2026-08-31-workspace-retrieval-repair.md`).
