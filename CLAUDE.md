# CLAUDE.md

Workspace guidance for Claude Code. Subsystem details live in `docs/` and `.claude/rules/` — loaded only when relevant. **Start any non-trivial task at `docs/MAP.md`**, which maps every subsystem to its entry points, rule, lazy doc, and guard tests. **First action each session:** `bash setup.sh` (see [Workspace Setup](#workspace-setup)).

## About This Project

YouCoded is an open-source cross-platform AI assistant app built entirely without coding experience using Claude Code. The creator (Destin) is a non-developer — the entire ecosystem is built and maintained through conversation with Claude.

**What YouCoded is:** A hyper-personalized AI assistant app for students, professionals, and anyone who uses AI regularly. Users may sign in with their Claude subscription, access cloud models via OpenRouter, or run smaller models locally. It runs on Windows, macOS, Linux, Android, and via remote web access.

**Core pillars:**
- **Social AI** — share custom themes and skills with friends/classmates/coworkers, play multiplayer games while waiting for the assistant to work
- **Personalization** — community plugins (journaling, personal encyclopedia, task inbox, text messaging) install from the WeCoded marketplace; cross-device sync is built into the app
- **Comprehensive Workspace** — the ultimate goal of the app is to eliminate the need for users to leave it. Everything a user might utilize artificial intelligence for (editing documents, conducting research, coding, etc) should eventually be fully manageable within the app. Users should be able organize documents, context, and conversations in project view, directly edit documents alongside their assistant in the artifact panel, and create new personalized app features from within the app itself. This applies to the entire agent pipeline: users should be able to manage their agent, its context/harness, the user interface/interaction surface, etc in a way that provides more utility than any of Claude Cowork, Cursor, Codex, OpenClaw, Hermes, T3 Code, etc.
- **Accessibility** — designed for non-technical users, students, professionals, and more, not just developers. App menus should be intuitive and not use terms that a normal college student would find confusing (instead of "Artifacts," use "files," for example). Prose/copy should be minimal and utilitarian with clear explanations of confusing concepts where present. Complex app systems, like backup and sync, warrant explainers (often in the form of (i) popup menus) to help onboard new users.

**The app is the product.** Everything else — themes, skill marketplace, bundled plugins — supports the app. Documentation and code should reflect that hierarchy.

**One product.** The five sub-repos are components of a single consolidated product. Planning, versioning, and roadmapping happen at the workspace level (`ROADMAP.md`); sub-repo docs exist only for knowledge physically coupled to that repo's code.

## Workspace Layout

| Directory | Repo | What it is |
|-----------|------|------------|
| `youcoded/` | itsdestin/youcoded | **The app** — Desktop (Electron) + Android (Kotlin), skill marketplace UI, themes, multiplayer games |
| `wecoded-marketplace/` | itsdestin/wecoded-marketplace | Skill marketplace registry + Cloudflare Worker backend |
| `wecoded-themes/` | itsdestin/wecoded-themes | Community theme registry |
| `youcoded-core/` | itsdestin/youcoded-core | A bundled Claude Code plugin (being deprecated — see `docs/active/plans/2026-04-21-deprecate-youcoded-core.md`) |
| `youcoded-admin/` | itsdestin/youcoded-admin | Owner-only release and announcement skills |

## Cross-Repo Relationships

- **youcoded** is the main product. It contains `desktop/` (Electron app) and `app/` (Android app) side by side.
- **wecoded-marketplace** and **wecoded-themes** are the registries the app fetches at runtime from raw GitHub URLs. Community plugins live here.
- **Bundled plugins** — `wecoded-themes-plugin` and `wecoded-marketplace-publisher` ship with the app and are auto-installed on launch (see `youcoded/desktop/src/shared/bundled-plugins.ts` + `BundledPlugins.kt`).
- **youcoded-core** is the legacy plugin toolkit, mid-deprecation. `write-guard` now ships bundled natively in the app on both platforms, new installs no longer clone `~/.claude/plugins/youcoded-core/`, and the app deletes existing clones at launch. **Until that release ships, the repo is still the live hook source for existing installs — hook fixes must land in BOTH the youcoded-core copy and the app's bundled copies.** Repo will be archived after release N+1 — see `docs/active/plans/2026-04-21-deprecate-youcoded-core.md`.
- **youcoded-admin** release skill orchestrates coordinated releases across repos.

## Working Rules

### Safety

**NEVER touch Destin's live, built YouCoded app.** The built app on his machine is his **working environment** — treat it like production. All development, testing, debugging, and runtime verification must happen in a dev workspace using `bash scripts/run-dev.sh` (which spins up an isolated Electron instance on shifted ports with separate `userData`). Read-only inspection from *outside* the app is fine (`Get-Process`, GPU counters, Task Manager observation, log file tailing); anything that *talks to* the running app is not — DevTools JavaScript (even read-only), IPC messages, DOM/CSS/localStorage changes, signalling its processes, touching files Electron holds open, installing plugins or themes, or any code change requiring it to reload.

When you need to verify runtime behavior (GPU usage, DOM state, IPC responses, theme rendering, etc.), the workflow is **always**: dev worktree → `bash scripts/run-dev.sh` → test in the dev window. Never the production install. The full forbidden/allowed lists and the escalation path when a check genuinely needs live-app state: `.claude/rules/live-app-safety.md` (auto-injects on any file you touch).

**Flag final-stage visual/interactive verification for Destin instead of automating it.** When work reaches the point of "launch a dev instance and look at it / interact with it" (visual polish, animation staging, hover/drag behavior, anything cursor- or timing-sensitive), ASK before building a scripted verification rig — Destin can usually eyeball it in 30 seconds, and scripting multi-window interactions wastes time and tokens. Automated verification is still right for DOM assertions, unit-testable logic, and one-shot screenshots of static screens; the handoff point is *interactive* or *repeated-relaunch* verification.

### Git, worktrees, and shipping

**Always sync before working.** Before changes, plans, or investigations, pull the latest:
```bash
cd <repo> && git fetch origin && git pull origin master
```

**Use worktrees for non-trivial work.** Any work beyond a handful of lines or narrowly-scoped bug fixes must be done in a separate git worktree (or use the Agent tool with `isolation: "worktree"`). This prevents multiple concurrent Claude sessions from overwriting each other's changes.

**Parallelize when possible.** Quality and speed are equally important. When building new features or making significant changes, you should endeavor to parallelize as much work as possible without sacrificing quality of the final product. Sequential work is fine when one task requires the prior completion of another, but we prefer parallelization when practical.

**Never link a worktree's `node_modules` to the main checkout — copy it with `cp -al` (hardlinks) instead.** On Windows, `git worktree remove` AND `npm ci` both follow `node_modules` junctions and will wipe the **main checkout's** deps; delete the junction first (`cmd //c "rmdir <path>"`, never `rm -rf`). **A POSIX symlink is no safer** (verified 2026-08-13): Gradle's `bundleWebUi` transitively runs `npm ci`, which followed the symlink and emptied the shared copy across six worktrees at once — so don't run Gradle or `build-web-ui.sh` in a linked worktree either (`-x bundleWebUi` if you must). A symlink ALSO makes `verify.sh` lie: Vite resolves the real path, sees it outside the worktree root, and fails suites at load with `Denied ID …?inline` — 2 suites silently never ran while the summary said "1 check failed". `cp -al` is near-instant, costs almost no disk, and has none of these failure modes. Full note: `docs/PITFALLS.md` → Cross-repo invariants.

**"Merge" means merge AND push.** Don't stop at a local merge.

**Clean up worktrees and branches after merging to master.** Once a feature branch is fully merged and pushed, remove its worktree and delete the branch **both remotely and locally**:
```bash
git worktree remove <path>
git push origin --delete <branch>   # skip if GitHub's PR auto-delete already removed it
git branch -D <branch>              # -D (not -d) because --no-ff merges leave the tip non-ancestral
```
Verify the commit landed on master first: `git branch --contains <sha>` should list `master`. Leaving stale worktrees or branches around accumulates cruft and confuses future sessions about what's in-flight and what's already shipped.

**Pushing to master green-lights closing the dev server.** If you started `bash scripts/run-dev.sh` to verify a change, shut it down (plus any helper Electron processes) once the commit lands on `origin/master`. Don't leave it running unless the user explicitly asks — orphaned Vite servers hold port 5223 and trip up the next session's dev launch.

**Never tell Destin to run `wrangler deploy` manually.** The Cloudflare Worker (`wecoded-marketplace/worker/`) auto-deploys on push to master via `.github/workflows/worker-deploy.yml` — CI runs tests, applies D1 migrations, deploys, and pushes secrets. To ship a Worker change, the workflow is: open a PR → merge to master → CI handles the rest. Same for `[vars]` flips like `CUTOVER_TIMESTAMP` — edit `wrangler.toml`, commit, merge. See `docs/build-and-release.md → Worker (wecoded-marketplace)`.

### Investigation discipline

**Claiming a count, an exemption, or a negative requires programmatic verification.** Claims like "never called", "no mirror exists", "dead code", "only one call site", "not handled on Android" are only as good as the search that backed them — and one `grep` never establishes its own completeness. **This covers positive claims too**: "three files do X", "these two are exempt because they're popovers", "the guard covers the family" are all numbers, and a number you did not accurately measure can be actively misleading. Write the command *before* the sentence, and paste what it returned. **If the output disagrees with you, the output likely wins**. Search repo-wide FIRST and narrow after, never the reverse; use the tool that actually answers the question (`npm run knip` for dead code, a tree-wide `rg` for cross-platform parity, a failing test for "this can't happen") instead of inferring it from a pattern match. `docs/MAP.md` tells you where a subsystem *starts*, not its full extent — it is not a completeness oracle. A *surprising* negative ("dead state in a shipping app", "no Android equivalent of a core mechanism") raises the evidence bar rather than lowering it. This binds hardest at the moment a claim becomes durable — a commit message, a PR body, a ROADMAP entry — because loose talk mid-investigation is self-correcting and a wrong claim in `ROADMAP.md` outlives the session. Both misses in the 2026-07-26 wrong-transcript investigation were this exact shape (a one-file grep concluding "no Android `sessionIdMap`"; a short grep concluding `resumeInfo` was dead — both false).

**Query symbols before reading files, and delegate sweeps to a subagent.** The rule above is about search *completeness*; this one is about search *price*. `ipc-handlers.ts` is 3,906 lines and `App.tsx` is 3,679 — **one whole-file read costs ~10x this entire CLAUDE.md**, and a conventional IPC-parity sweep runs ~90k tokens. Escalate, stopping as soon as the question is answered: **Serena** (`get_symbols_overview`, `find_symbol`, `find_referencing_symbols`) → **ast-grep** for code *shapes* → **`rg`** for exact strings → **whole-file reads only for files you're about to edit**. Any question answered by sweeping files goes to a read-only search subagent (`Explore`, else `general-purpose`), which spends the tool calls in its own context and returns a 1–2k-token conclusion.

**Serena has exactly one job here: resolved references and file shape, for code already on `master`.** It is pinned to the main checkout (`youcoded/`) and resolves every path against that root, so **it cannot see your worktree** — during worktree work it silently answers with master's copy. Use it to orient in a big file and to answer "who calls this?"; never to check your own branch. Branch truth is `bash scripts/verify.sh`. It is read-only on purpose (an edit tool would have written to the main checkout mid-worktree). Not for: Kotlin/`app/**` (unindexed), other sub-repos (unreachable), string-keyed things like IPC channels or CSS classes (`rg`), or "is this dead" (`npm run knip` — Serena reports "no references" identically whether it searched or never looked). The full rule auto-loads on the god-files: `.claude/rules/code-search.md`; depth in `docs/code-intelligence.md`.

**Prefer a tool that returns a verdict over one that returns text to interpret.** `npm run knip` for dead code, `tsc --noEmit` for types, `npm run lint` for the bug classes types can't see (conditional React hooks, floating promises in main, runtime imports of undeclared packages), `ipc-channels.test.ts` for three-surface parity, `bash scripts/ast-grep/check.sh` for the invariants that have been promoted from prose to executable scans — or `bash scripts/verify.sh` to run all of those at once against a checkout (see [Local build & test](#local-build--test)). When you codify a new invariant, an ast-grep rule beats a sentence in `.claude/rules/` — adding rules to the scan is documented in `docs/code-intelligence.md`.

### Code and copy standards

**Annotate non-trivial code edits with a WHY comment.** Destin is a non-developer and relies on comments to understand what code does and why it was changed. Example: `// Fix: prevent stale tool IDs from coloring the status dot`. This is critical for long-term maintainability.

**Never write misleading error messages.** Do NOT guess at a cause you haven't verified. Every user-facing error must be either (a) *specific and accurate* — surface the real detail (subprocess stderr, caught exception, failing path/port/arg); never `catch` and replace the real error with a hardcoded guess — or (b) *general but non-committal* ("Error: Unable to run local models.") paired with two actions: **Report bug / submit PR** and **Diagnose with Claude** (the Settings → Development flow). **Don't hand-roll either shape — `<ErrorState>` (`components/ui/states.tsx`) renders both:** `mode="recoverable"` (specific message + Retry) and `mode="general"` (the two-action card). See `docs/error-message-standards.md`. Full audit/replacement of existing messages is a v1.3.1 followup.

**Verify fix consequences before shipping.** Batch fixes — especially network/permission changes — can silently break cross-cutting features. Check both platforms (desktop + Android) after any IPC change.

## Workspace Setup

**On first session**, run `bash setup.sh` to clone all repos. On subsequent sessions, run it again to pull the latest from each repo's default branch — it syncs every sub-repo *and* the workspace repo (`youcoded-dev`) itself, and resolves the workspace from its own location, so it works from any directory. Do this before any other work.

**Sub-repo code changes go to the relevant sub-repo** (e.g., `youcoded/`, `youcoded-core/`, `wecoded-themes/`, `wecoded-marketplace/`) — open PRs there, push there. Do NOT mix sub-repo code into the workspace repo (`youcoded-dev`).

**Workspace-level artifacts DO get committed + pushed to `youcoded-dev`.** That includes:
- Cross-cutting docs that span multiple sub-repos: `docs/PITFALLS.md`, `docs/registries.md`, `docs/build-and-release.md`, etc. (Single-repo subsystem depth — chat-reducer, android-runtime, shared-ui-architecture, etc. — lives in `youcoded/docs/`, not here.)
- This `CLAUDE.md` and any rule files under `.claude/rules/`.
- Lifecycle documents (specs, plans, investigations, handoffs, prototypes) — the artifacts produced by brainstorming, writing-plans, and similar skills before any sub-repo code changes. In-flight ones live under `docs/active/`; completed/superseded ones under `docs/archive/`. (These replace the old flat `docs/superpowers/` dump.)
- Dev tooling under `scripts/` — `run-dev.sh`, `run-workbench.sh`, `cdp-eval.mjs`, etc.
- The workspace's own `.gitignore`, `setup.sh`, and skill marketplace pointers under `.claude/`.

## Development Workflow

Release builds happen through GitHub Actions CI in the relevant sub-repo. For iterating on desktop changes locally alongside Destin's installed/built app:

```bash
bash scripts/run-dev.sh <branch-or-worktree> --label "Feature Name"
```

**Always pass `--label "<Feature Name>"`** so Destin can tell concurrent dev instances apart; without it the title falls back to the branch name. When another dev instance may be running, also pass a distinct `--offset` **and** `--profile` — a collision SIGKILLs the window. `--dry-run` prints the resolved target/ports/title without launching; `--list` shows registered worktrees. Ports, what's isolated, what's shared (`~/.claude/`), and the caveats: `docs/local-dev.md`.

### New Features & UI/UX Changes

When designing new features or making changes to user-facing app interfaces, the first step should always be to visualize and design the UI/UX of the final feature. Planning sessions should prioritize iterative UI design using the workbench and other tooling to help Destin shape the final user experience of the feature before building backend. When Destin provides final sign-off on the UI/UX design for the feature, the UI/UX should be treated as largely final and backend should be designed around the UI/UX accordingly. The standard every new surface is measured against is `docs/active/design/2026-08-25-ui-design-guide.md` (five laws, primitives, per-surface anatomies, checklist); show him the change as a **review deck** (`scripts/ui-review/review-cards.py` — one point per step: one screenshot, one ring, one problem line, one fix line, Yes / No / Tell me more, Before/After flip), built from the UI review rig below; never a gallery, a prose page or a chat description (all three were rejected).

### UI Workbench

`bash scripts/run-workbench.sh` boots the **real renderer** in a browser tab (Vite only — no Electron, no PTY) against a fake `window.claude`, on port 5233. Every menu is clickable and stateful, so **new feature UI is built here before its backend exists** — channels with no backend go in `MOCK_ONLY`, which is then the backend to-do list. Toolbar switches scenario (`default`/`empty`/`no-providers`/`refused`/`stress`), fake IPC latency, narrow viewport, and the tool gallery that replaced `?mode=tool-sandbox`. Use `run-dev.sh` instead when you need real event ordering, PTY, or main-process behaviour. **After any change to the mock shim run `node scripts/workbench-boot-check.mjs`** — it loads every registered workbench route headless (12 today) and fails on a console error; the unit suite passed while the app crashed at boot three times running. Rule: `.claude/rules/react-renderer.md`; spec: `docs/archive/specs/2026-07-29-ui-workbench-design.md`.

### UI review (autonomous screenshot sweep)

`bash scripts/ui-review/run-review.sh <worktree>` screenshots **every** screen, dialog, drawer, popover and menu in all six themes (workbench, headless, ~5 min — one Chrome per plan×theme×shard), builds side-by-side theme sheets, a painted-pixel contrast report and `gallery.html` — and **every shot must prove it opened** (target found, `expect` held, pixels changed) or it lands in `coverage.md` as a miss. **Read `coverage.md` before writing any finding; a surface that isn't `covered` is "unreviewed", never "fine".** Use it for the whole-app review pass (`/ui-review` skill: capture → fix misses → judge against `docs/active/design/2026-08-25-ui-design-guide.md` → numbered ledger) and as the Before/After runs behind a review deck for any UI PR (re-run only the affected plans; a second concurrent sweep needs `YOUCODED_PORT_OFFSET` ≥ 100 away from the first). Terminal, marketplace data, sync and live sessions need the real-app pass in `scripts/ui-review/README.md`. Born from the 2026-08-25 review, whose first rig filed 40 mislabelled sheets — that failure is why the verification exists.

### CDP eval (live renderer inspection)

`scripts/cdp-eval.mjs` is a one-shot Chrome DevTools Protocol eval helper — use it to inspect or poke a live React renderer, most often the Android WebView while a debug APK is running on a device. The full `adb forward` + page-discovery recipe is in the script's header comment.

### Local build & test

**Before claiming a desktop change is done, run `bash scripts/verify.sh [<worktree>]`.** One command, one exit code: `tsc --noEmit`, `vitest related` on the files you changed, `knip`, `eslint`, and the ast-grep invariant scan — in parallel, ~10s for a small diff. It runs the FULL suite automatically when the diff touches test infra (`vitest.config.ts`, `package.json`, `tests/__mocks__/`), since that invalidates the affected-test mapping; `--full` forces it, `--dry-run` prints the plan. **It covers `youcoded/desktop` only** — it says so on exit, and Android/worker still need their own commands below.

```bash
# Desktop
cd youcoded/desktop && npm ci && npm run build

# Android (requires Desktop React UI built first)
cd youcoded && ./scripts/build-web-ui.sh && ./gradlew assembleDebug && ./gradlew test
```

See `docs/build-and-release.md` for full build order, release flows, and version bumping rules.

### Harness evals (native agent tools)

**When you change a native harness tool, a prompt/instruction file, or want to compare models, OFFER to run the harness evaluator — then let Destin decide.** `youcoded/desktop/test-engine/harness-eval.mjs --plan <file>` runs a case across a matrix of **code version × instruction file × model**, each cell in its own disposable `os.tmpdir()` fixture, and grades every run twice: free mechanical checks read off the event stream, plus an LLM judge whose every grade must quote the text it scored. `--dry-run` is free and needs no key; `--only <cellId>` is one cell; `--max-spend <usd>` is a hard cap. A real run needs `--key-file` — **the CLI refuses to start if `OPENROUTER_API_KEY` is in its environment**, because that is readable by the models it runs. Measured ~$0.25 a cell, so **never run the paid path unasked**.

Why offer at all: four live rounds found **nine** real defects that 4,500 passing tests did not — Bash returning 27,966 chars from one command, Grep reporting a 500-match cap as a true total, Glob treating `{ts,kt}` as literal text, a provider 402 rendered as `[object Object]`. Unit tests here drive scripted fake models; only a real model spending a real turn exercises the judgment these tools are built for. Rule: `.claude/rules/harness-evaluator.md` (auto-loads on `harness/tools/**` too).

## Known Pitfalls

All architectural invariants, cross-cutting gotchas, and lessons learned live in `docs/PITFALLS.md`. **Read it before making non-trivial changes** — it covers IPC parity, chat reducer invariants, Android runtime constraints, bundled-plugin/hooks rules, release gotchas, and working conventions.

## Keeping Documentation Accurate

This workspace's documentation is intended to be self-verifying. Destin can run `/audit` — it verifies the machine-checkable anchors (`node scripts/audit-anchors.mjs`: rule `verify:` blocks, doc anchors, MAP paths, store budgets), diff-scopes semantic re-verification to what changed since the last report in `docs/audits/`, and **fixes what it finds in the same run** (the report is an audit trail, not a to-do list). `/audit full` re-verifies everything and runs every pinned test; `/audit <subsystem>` scopes to one rule (names = `.claude/rules/*.md` basenames).

- Run before any release (prevents shipping with stale docs)
- Run after major refactors touching IPC, reducer, or runtime
- Unresolved findings live in the latest `docs/audits/` report's `## Residue` section (the only surviving drift ledger — a snapshot, not an accumulator)
- Session-start hook surfaces a reminder if the latest `docs/audits/` report is >60 days old or its `residue:` frontmatter count is non-zero
- The mechanical pass also runs unattended in `.github/workflows/workspace-ci.yml` — on push/PR here, **and daily on a cron**. The cron is the one that matters: anchors point into the sub-repos, so they break when `youcoded` moves, which never triggers a push to this repo

If you notice Claude acting on outdated information, or you mention a file/function Claude doesn't recognize, that's the signal to run `/audit`.

## Where Knowledge Lives

New knowledge goes to, in descending preference: **a pinning test > an ast-grep rule > a WHY comment at the edit site > a path-scoped rule in `.claude/rules/` > the lazy doc the rule points to**. Never a new always-loaded doc. The first two tiers *execute*; the rest only ask to be read and honored — so prefer an ast-grep rule (`scripts/ast-grep/`) whenever the invariant is a code shape, since it covers the large class that isn't unit-testable but is still mechanically checkable, and it removes prose rather than adding it. Full taxonomy: `docs/archive/specs/2026-07-15-workspace-knowledge-management-design.md`.

| Kind of knowledge | Home |
|---|---|
| Invariant / lesson | The ladder above. Slim `docs/PITFALLS.md` holds only cross-repo items |
| Planned feature / bug / idea | `ROADMAP.md` — capture in the SAME session Destin mentions it (typed, tagged, dated; dedup first) |
| Doc contradicting code | **Fix on sight** (verify against code; cite verification in the commit). Unfixable this session → ROADMAP `bug` tagged `#docs`. There is no drift ledger |
| CC-version watch item | `youcoded/docs/cc-dependencies.md` |
| Completed/superseded plans, specs, handoffs | `docs/archive/` (in-flight ones live in `docs/active/`) |
| Destin-specific preferences / session feedback | Auto-memory — LAST resort; product planning never lives in memory |

**Document lifecycle:** new specs/plans/handoffs save to `docs/active/{specs,plans,handoffs,investigations,prototypes}/` with `status:` frontmatter (`draft | active | shipped | superseded`). When a feature merges, its docs move to `docs/archive/` and the ROADMAP item flips to `[x]` in the same session — "Merge means merge AND push" extends to "…AND archive the docs AND flip the roadmap item." Searches for live docs exclude `docs/archive/` by default.

## Subsystem References (read on demand — NOT auto-loaded)

Path-scoped rules in `.claude/rules/` inject automatically when you touch matching files, and `docs/MAP.md` maps every subsystem to its entry points, rule, depth doc, and guard tests — go there for anything subsystem-shaped. These workspace-level docs are not in MAP:

| Doc | Read when… |
|---|---|
| `docs/PITFALLS.md` | before any non-trivial change — cross-repo invariants |
| `docs/code-intelligence.md` | setting up Serena on a new machine, adding an ast-grep invariant rule, or deciding which search tool answers a question |
| `docs/build-and-release.md` | building, releasing, version bumping, beta/test builds (dogfooding master, VM install testing) |
| `docs/error-message-standards.md` | writing any user-facing error |
| `docs/local-dev.md` | running the dev instance |
