# CLAUDE.md

Shared workspace guidance for assistants working on YouCoded, whether running in Claude Code or YouCoded's native runtime. **Start non-trivial project work at `docs/MAP.md`**: subsystem entry points, rules, depth docs, tests, screen names and on-disk state. Read the relevant sections; do not assume a startup hook already supplied them.

**Before any development edit, including docs:** `node scripts/workspace-start.mjs --session <stable-key> [repo…]`. Use its returned absolute paths and read that workspace's instructions. Never edit shared checkouts first.

## About This Project

YouCoded is an open-source, cross-platform AI assistant built through conversation. Destin is a non-developer; assistants do the technical work rather than handing him commands.

The app serves students, professionals and everyday AI users—not just developers. It combines cloud/subscription and local models, personalization, community themes and skills, social features and a comprehensive workspace for research, documents, conversations and managing the assistant itself. Desktop, Android and remote web are parts of one product.

**The app is the product.** Registries and plugins support it. Use accessible language ("files," not "artifacts" in user-facing menus), minimal useful copy and explainers for complex systems. Prefer showing an interface to describing it.

## Workspace Layout

| Directory | Repo | Role |
|---|---|---|
| `youcoded/` | itsdestin/youcoded | Main app: Electron desktop and Android |
| `wecoded-marketplace/` | itsdestin/wecoded-marketplace | Skill registry and Cloudflare Worker |
| `wecoded-themes/` | itsdestin/wecoded-themes | Community theme registry |
| `youcoded-core/` | itsdestin/youcoded-core | Legacy plugin, mid-deprecation |
| `youcoded-admin/` | itsdestin/youcoded-admin | Owner-only release and announcement skills |

## Cross-Repo Relationships

Planning and versioning belong to the workspace; `ROADMAP.md` indexes area backlogs. Single-repo implementation depth belongs in that repo's `docs/`.

Registries are fetched at runtime. Bundled plugin definitions must agree across desktop and Android. The legacy `youcoded-core` retirement is governed by `docs/active/plans/2026-04-21-deprecate-youcoded-core.md`: until the relevant release ships, hook fixes must land in the legacy copy AND the app's bundled copies. Release coordination belongs to `youcoded-admin`.

## Working Rules

### Safety

**Never touch Destin's running, built app.** It is his working environment. No DevTools attachment, IPC, DOM/storage changes, process signalling, plugin/theme/hook installation or modification of files it holds open. Read-only inspection from outside is allowed. Full boundaries: `.claude/rules/live-app-safety.md`.

Ordinary workspace docs, guidance, roadmap and source edits are allowed under the usual authorization/worktree rules; they do not require closing the app. Do not equate editing a repository with modifying the running app. Active configuration, integrations and live reloads remain subject to the safety rule.

Runtime verification goes through an isolated dev worktree and `bash scripts/run-dev.sh`, never production. Ask before building an interactive or repeated-relaunch verification rig; Destin can often check motion, hover and drag directly. Unit tests, DOM assertions and static screenshots remain appropriate automation.

**Stay within the authorized task.** A read-only review yields findings, not surprise edits. "Fix on sight" and retrospective duties apply within authorized editing work; otherwise report the issue and ask. Shipping, live configuration changes and paid evaluations are separate decisions.

### Git, worktrees, and shipping

- Start/resume with `workspace-start`; never pull, stash, clean or repair shared checkouts merely to start work. New worktrees use freshly fetched defaults; resumed ones preserve unfinished work. Inspect relevant upstream changes before relying on old guidance.
- Use absolute worktree paths with file tools; shell `cd` does not change their root. Do not migrate another session's work automatically.
- **Never symlink or junction `node_modules` to a shared checkout.** Use `cp -al`; hardlinks still share inodes, so dependency patchers must replace files rather than write in place. Do not run `npm ci` or Android `bundleWebUi` against shared/linked dependencies. Details: `docs/PITFALLS.md` → Worktrees.
- Parallelize independent work when the runtime permits it. Do not assume multiple write-capable specialists can run concurrently.
- Stage explicit paths and inspect the staged diff. App code commits go to the app repo; workspace docs/tooling to `youcoded-dev`.
- **"Merge" means merge AND push**, then archive shipped lifecycle docs, close roadmap entries and remove merged worktrees and local/remote branches. Merge only on explicit instruction; never end a turn suggesting it.
- Confirm remote ancestry before cleanup. `gh pr merge --delete-branch` can merge successfully then fail its local checkout step; verify before retrying. Run `bash scripts/close-out.sh <branch> [<repo>]` yourself and address findings within the approved scope.
- Stop this session's dev server after landing on master unless Destin asks to keep it. Worker deployment is CI-driven on master; never tell him to run `wrangler deploy`.

Commands, cleanup recipes and recovery: `docs/workspace-workflows.md` → Git, worktrees, and shipping.

### Investigation discipline

**Search before reading large files.** Use the available Grep tool (ripgrep), or shell `rg` for exact text; ast-grep for code shapes; focused Read ranges for implementation. Delegate broad sweeps to an available read-only specialist. Search the actual worktree, not a shared copy. Details: `.claude/rules/code-search.md` and `docs/code-intelligence.md`.

**Counts, exemptions and negatives require evidence.** Search repo-wide before narrowing; use verdict tools where possible. A MAP entry is a starting point, not proof of completeness. Verify surprising negatives and cross-platform claims before making them durable in commits, docs or roadmap entries. Report search scope and truncation honestly.

**Prefer verdicts:** `npm run knip` for dead code, `tsc --noEmit` for types, lint for its bug classes, IPC parity tests for bridge coverage, ast-grep for executable invariants, and `scripts/verify.sh` for combined desktop checks.

**Use tool descriptions as runtime truth.** Prefer dedicated file tools — reading and editing through shell `cat`/`sed`/heredocs loads NO path-scoped rule, because rules fire on the file tools. Measured 2026-09-05: a session that shipped a renderer feature, a new test and a review deck entirely through Bash got 0 of the 6 rules its own edits matched. If a harness mode pushes you toward Bash, open the rules `docs/MAP.md` names for the subsystem yourself. Quote shell glob patterns and URLs; use `rg -n`, never clustered `rg -rn`/`rg -nr` (`-r` means replacement). Avoid broad process-name kills; identify exact PIDs and never signal the live app. Claude Code's login-shell/ugrep workarounds are not facts about native Bash: YouCoded's native Bash uses bash and its Grep tool invokes ripgrep directly.

### Code and copy standards

Annotate non-trivial code edits with a **WHY** comment. Check cross-cutting consequences and desktop/Android parity after IPC changes.

Never invent an error cause. Use `<ErrorState>`: specific accurate detail + Retry for recoverable failures; general non-committal errors with Report bug and Diagnose with Claude for unknown causes. See `docs/error-message-standards.md`.

## Workspace Setup

`node scripts/workspace-start.mjs --session <stable-key> [repo…]` creates/resumes the workspace and requested component worktrees. Reuse the session key. Read `docs/workspace-start.md` for recovery and options.

`bash setup.sh` is installation/explicit maintenance, not session startup. Shared-checkout commits are guarded; work from isolated branches. Leave shared leftover copies alone—workspace sync owns reconciliation. Details: `docs/workspace-workflows.md` → Workspace Setup.

## Development Workflow

Load only the procedure needed. Existing approval gates still apply; moving their recipes out of this file does not waive them.

### New Features & UI/UX Changes

UI design precedes backend implementation. Read `.claude/rules/feature-flow.md` and `docs/active/design/2026-08-25-ui-design-guide.md` before proposing a new interface. Opening questions use a questions deck; approved decisions become a contract. Show Before/After review decks—not galleries or prose substitutes. Motion/drag/hover use operable live steps. Approved UI is the backend's contract; reopening it requires the prescribed deck.

Use the context-free UX tester before Destin's first deck and after implementation, a fresh code reviewer, and a fresh grader before acceptance. Briefs and execution: `scripts/ui-review/{ux-tester,code-reviewer,grader,contract-agent}.md`; full route: `.claude/rules/feature-flow.md`. This overrides generic brainstorming chat-question habits for YouCoded features.

### Asking Destin many questions at once

Four or more questions go on a questions deck (`scripts/questions/serve.py`), with context-free Today / Problem / Proposal / Options and user-facing pros/cons. Fewer than four or wording-only questions may stay in chat, except where feature-flow requires a deck. Format: script header; full guidance: `docs/workspace-workflows.md`.

### UI Workbench

`bash scripts/run-workbench.sh` runs the real renderer with a fake backend. Build UI there before backend; use `run-dev.sh` for real process/IPC ordering. After changing the mock shim, run `node scripts/workbench-boot-check.mjs` against a serving workbench. See `.claude/rules/react-renderer.md` and `docs/workspace-workflows.md`.

Dev launches must include `--label "Feature Name"`; concurrent instances also need distinct `--offset` and `--profile` to avoid collisions. See `docs/local-dev.md`.

### UI review (autonomous screenshot sweep)

Use `scripts/ui-review/run-review.sh` and **read `coverage.md` before judging**. A surface not proven open is unreviewed, not fine. Capture affected Before/After surfaces for the review deck. Full instructions and real-app exceptions: `scripts/ui-review/README.md`.

### Demo clips and the landing page

Use recordings of the running renderer, not drawings. Start at `scripts/ui-review/README.md` → Recording a loop, and `.claude/rules/landing-page.md`. Copy authority: `docs/active/handoffs/2026-08-31-landing-redesign-START-HERE.md`. Do not write "real app / real files / actually reads / does real work / self-improving." The fact sheet is inventory, not copy.

### Asking a page a question, and A/B-ing the answer

Use existing tools before inventing a rig: `scripts/ui-probe.mjs` for an isolated browser query/screenshot, `scripts/ab-measure.sh` for HEAD-vs-edit comparisons, `scripts/image-churn.sh` for unchanged pixels, `scripts/check-doc-commands.mjs` for runnable doc examples. Recipes: `docs/workspace-workflows.md`. Never attach probes to the live app.

### Local build & test

**Before claiming a desktop change done, run `bash scripts/verify.sh [<worktree>]`.** It covers types, related tests plus source-scanning guards, knip, lint and ast-grep; `--full` forces the full suite. It covers desktop only. Android and Worker need their own checks.

Android worktree tests on this machine use JDK 21 and the installed SDK, with `-x bundleWebUi` to protect dependencies. Exact commands/build order: `docs/workspace-workflows.md` → Local build & test and `docs/build-and-release.md`. Run relevant tests after edits; distinguish pre-existing/environmental failures from regressions.

### Harness evals (native agent tools)

When changing a native tool or prompt/instruction file, or comparing models, **offer the harness evaluator and let Destin decide**. Never run paid evaluations unasked. Dry runs are free; real runs need `--key-file` and a spending cap, never `OPENROUTER_API_KEY` in the environment. See `.claude/rules/harness-evaluator.md` and `docs/workspace-workflows.md`.

## Known Pitfalls

Read `docs/PITFALLS.md` before non-trivial changes. It holds cross-repo invariants; subsystem depth is reached through MAP.

## Ending a Session

On "wrap up," "close out," "we're done," or a substantial session's end, follow `.claude/skills/wrap-up/SKILL.md`. Invoke it if available; otherwise read the procedure directly. Apply findings, file dated roadmap items, or explicitly drop them with reasons—never leave an unactioned list. Respect authorization and the no-merge boundary even if a procedure says otherwise.

**Wrap-up is not merge permission.** Destin decides when work is ready. A new-session handoff prompt goes in plain chat, not a file. Run the checks yourself; do not give him commands to type. Detailed close-out procedure: `docs/workspace-workflows.md` → Ending a Session.

## Keeping Documentation Accurate

`node scripts/audit-anchors.mjs` verifies machine-checkable anchors, MAP paths and budgets. `/audit` adds semantic verification and corrections; read `.claude/commands/audit.md` if the command is unavailable. Run before releases and after major refactors; distinguish failures caused by missing component checkouts from stale claims.

The latest `docs/audits/` report records unresolved residue; CI also runs mechanical checks. Do not assume the Claude Code startup reminder ran in a native session. Details: `docs/workspace-workflows.md` → Keeping Documentation Accurate.

## Where Knowledge Lives

Prefer **a pinning test > an ast-grep rule > a WHY comment > a path-scoped rule > an on-demand depth doc**. Do not grow the always-loaded core with incident narratives or task-specific recipes.

| Knowledge | Home |
|---|---|
| Planned feature / bug / idea | `docs/roadmap/<area>.md`; follow its Filing test and `ROADMAP.md` grammar, dedup first, symptoms in Destin's words; run `node scripts/roadmap-check.mjs --fix` |
| Invariant / lesson | Knowledge ladder above; cross-repo only in `docs/PITFALLS.md` |
| Doc contradicting code | Fix verified drift within authorized editing scope; otherwise report it. Deferred work goes in `docs/roadmap/dev-workspace.md` → knowledge |
| Claude Code dependency watch | `youcoded/docs/cc-dependencies.md` |
| In-flight specs/plans/handoffs | `docs/active/{specs,plans,handoffs,investigations,prototypes}/`, with `status: draft` or `active` |
| Shipped/superseded records | `docs/archive/`, with corresponding status |
| Personal preferences | Available personal guidance/memory mechanism, last resort; never product planning |

When work merges, archive its lifecycle docs, remove its open roadmap item and append a closure to `docs/roadmap/shipped.md`. Close retrospectives when their findings are resolved or filed. Exclude archives from searches for current guidance.

## Subsystem References (read on demand — NOT auto-loaded)

Native path-scoped rule injection exists and is separate from command hooks. In the inspected implementation it delivers rules after a tool step; **read relevant rules before the first edit**, rather than relying on that timing. A named skill, rule or hook is not proof it was loaded or executed in this session.

| Reference | Read when… |
|---|---|
| `docs/MAP.md` | locating subsystem code, rules, tests, screens or state |
| `docs/workspace-workflows.md` | needing detailed development, shipping, verification or close-out recipes |
| `docs/PITFALLS.md` | making non-trivial changes |
| `docs/code-intelligence.md` | choosing search/verdict tools or adding ast-grep rules |
| `docs/build-and-release.md` | building or releasing |
| `docs/error-message-standards.md` | writing user-facing errors |
| `docs/local-dev.md` | running a dev instance |
