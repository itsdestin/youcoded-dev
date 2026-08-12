---
status: active
created: 2026-08-05
---

# Handoff: code cleanup + bug hunting with Serena, lint, and verdict tools

> **Progress note 2026-08-12 — done so far:** the Serena setup below landed (`08067924`); the ESLint gate landed (`3bff0cf6`/`51d859e4`, merged via `48202704`); the 89 unused-`React`-imports sweep landed (`9961df9e`). The remaining backlog items below stay live.

Paste the prompt below to start a cleanup session. Everything above the prompt is
context for whoever is reading this file directly.

## What was set up on 2026-08-05

Serena had been installed on 2026-07-28 and then used **18 times, all on install day,
zero since**. The cause was structural, not preference:

- It resolves every path against the ONE project root it was started with — the main
  checkout at `youcoded-dev/youcoded` — and rejects paths outside it. `CLAUDE.md`
  mandates worktrees, so it could not see the tree the work was happening in, and it
  answered with master's copy without saying so.
- Its edit tools would have **written to the main checkout** during worktree work.

Fixes applied (branch `fix/diagnostics-sweep` in the `youcoded` repo):

- `youcoded/.serena/project.yml` — `read_only: true` + `excluded_tools`, leaving 7
  read-only symbol tools. Kills the wrong-tree write hazard.
- `.claude/rules/code-search.md` — path-scoped to the 13 files over ~1,300 lines, so
  the guidance injects when you touch a god-file instead of sitting in always-on prose.
- `CLAUDE.md` + `docs/code-intelligence.md` — Serena's job narrowed to one sentence:
  resolved references and file shape, **for code already on `master`**.

## The backlog this prompt should work through

**Unused-code findings: 1 remaining** (was 143; 142 cleared across 2026-08-05 and
2026-08-06). Reproduce with:

```bash
cd youcoded/desktop && npx tsc --noEmit --noUnusedLocals --noUnusedParameters -p tsconfig.json
```

- **89 unused `import React`** — cleared 2026-08-06 in `chore/cleanup-react-imports`
  (9961df9e). Mechanical sweep, no behavioral change.
- **31 everything else** — cleared 2026-08-06 in `chore/cleanup-unused-31` (4 commits).
  One real bug found: `applyThemeFont` was imported but never called, so theme fonts
  (Google Fonts injection + `--font-sans`/`--font-mono`) were silently dead. Fixed in
  67d2423c.
- **1 remaining:** `FilesTab.onMutated` — explicitly documented as vestigial with a
  re-wire note (Exclude was removed with External Artifacts; kept for future in-tab
  mutations). Left intentionally.

**The durable end state:** `noUnusedLocals` and `noUnusedParameters` can now be enabled
in `desktop/tsconfig.json` — the list is empty except for the one intentional vestige.
Either suppress that one with `@ts-ignore` or remove it and its re-wire comment, then
flip the flags.

**Bug hunts not yet run** (ranked by whether an existing tool is structurally blind):

1. **Workbench-only UI** — components whose only referencing symbols live under
   `renderer/dev/workbench/**`. Either a pending backend (`MOCK_ONLY` is the to-do
   list) or forgotten dead UI. `knip` cannot see these; they *are* referenced. Caveat:
   `workbench/compare/registry.tsx` legitimately references many components for the
   gallery — eyeball, don't auto-flag.
2. **Orphaned IPC channels** — `ipc-channels.test.ts` proves a channel exists on all
   three surfaces; it does not prove anyone calls it. Run
   `find_referencing_symbols` on each preload wrapper **method** (a symbol), not the
   channel **string** (not a symbol).
3. **`chat-reducer.ts` actions** never dispatched, or dispatched with no case arm.
4. **Provider implementations that stub a method** — `find_implementations` on the
   model-provider and sync-transport interfaces, then compare bodies. A no-op in one
   provider is a feature silently dead on that provider.
5. **The v1.3.1 error-message audit** `CLAUDE.md` already lists as owed —
   `find_referencing_symbols` on `ErrorState` gives the authoritative compliant-site
   list; the complement is the work list.

---

## The prompt

> I want to spend this session cleaning up code and fixing bugs in the YouCoded
> desktop app, using Serena, lint, and the workspace's verdict tools.
>
> Start by reading `docs/active/handoffs/2026-08-05-code-cleanup-with-serena.md` for
> the backlog and what's already set up.
>
> Ground rules for this session:
>
> - **Pull first.** On 2026-08-05 the main checkout was 29 commits behind
>   `origin/master` and a diagnostic sweep silently ran against stale code. Run
>   `bash setup.sh`, then confirm `git -C youcoded rev-list --count master..origin/master`
>   is 0 before trusting any result.
> - **Work in a worktree**, and remember **Serena cannot see it** — it answers about the
>   main checkout. Use it for orientation and "who calls this?"; use
>   `bash scripts/verify.sh <worktree>` for anything about your branch.
> - **Prefer a tool that returns a verdict**: `tsc`, `npm run knip`,
>   `ipc-channels.test.ts`, `bash scripts/ast-grep/check.sh`. Serena is for resolved
>   references and file shape, not for "is this dead" — it reports "no references"
>   identically whether it searched or never looked.
> - **Treat an unused symbol as a possible symptom, not lint noise.** Check what it was
>   reaching for before deleting it. Several of these turn out to be half-finished
>   features or write-only state.
> - **Verify negatives programmatically** and paste the command output. Watch the flags:
>   `rg -r` is `--replace`, not a shorthand for `-n`.
>
> Pick the highest-value item from the backlog, tell me what you're going to do and
> roughly how big the diff will be, then do it. Land each logical change as its own
> commit with a WHY comment at every non-trivial edit site, run `verify.sh` before
> claiming anything is done, and compile Kotlin (`./gradlew compileDebugKotlin`) if you
> touch the Android side — `verify.sh` does not cover it.
>
> Don't bundle the 89 unused-`React`-import sweep with anything else; it gets its own
> branch or it buries the real changes.
