# Workspace workflow reference

Read only the section needed for the task. `CLAUDE.md` is the operating core; this reference retains detailed recipes and incident explanations moved out of the always-loaded context. Runtime capabilities and user authorization take precedence over assumptions in a recipe. Command hooks mentioned here refer to Claude Code unless explicitly identified as native.

### Git, worktrees, and shipping

**Fetch into an isolated session workspace before working.** Use `workspace-start` below, not `git pull` in shared checkouts. New worktrees start from freshly fetched defaults; resumed ones preserve unfinished work. Updating an existing branch is a separate deliberate operation.

**Shared checkouts may be dirty and behind; do not repair them just to start work.** `workspace-start` fetches without changing their working files and creates from origin defaults. Read `.claude/rules/`, `docs/MAP.md`, and scripts from the returned worktree, not the shared copy. On resume, existing worktrees intentionally retain their branch versions; inspect relevant changes against `origin/master` before relying on potentially outdated guidance, rather than automatically pulling over unfinished work.

**Use isolated worktrees for every development edit, including docs and small fixes.** Read instructions and run scripts from the returned workspace; use its absolute paths with file tools. Never edit shared files first and copy whole files into a newer branch afterward. Existing manually created worktrees can stay in use; do not migrate their unfinished work automatically.

**Parallelize when possible.** Quality and speed are equally important. When building new features or making significant changes, you should endeavor to parallelize as much work as possible without sacrificing quality of the final product. Sequential work is fine when one task requires the prior completion of another, but we prefer parallelization when practical.

**Never link a worktree's `node_modules` to the main checkout — copy it with `cp -al` (hardlinks) instead.** On Windows, `git worktree remove` AND `npm ci` both follow `node_modules` junctions and will wipe the **main checkout's** deps; delete the junction first (`cmd //c "rmdir <path>"`, never `rm -rf`). **A POSIX symlink is no safer** (verified 2026-08-13): Gradle's `bundleWebUi` transitively runs `npm ci`, which followed the symlink and emptied the shared copy across six worktrees at once — so don't run Gradle or `build-web-ui.sh` in a linked worktree either (`-x bundleWebUi` if you must). A symlink ALSO makes `verify.sh` lie: Vite resolves the real path, sees it outside the worktree root, and fails suites at load with `Denied ID …?inline` — 2 suites silently never ran while the summary said "1 check failed". `cp -al` is near-instant, costs almost no disk, and has none of these failure modes — but it is not hazard-free: hardlinks SHARE THE INODE, so a tool that writes IN PLACE inside a worktree's `node_modules` edits every tree linked to it (one file was found on 7 links in 2026-08-27). Before running anything that patches a dependency, confirm it renames rather than writes in place. Full note: `docs/PITFALLS.md` → Cross-repo invariants.

**"Merge" means merge AND push.** Don't stop at a local merge.

**Clean up worktrees and branches after merging to master.** Once a feature branch is fully merged and pushed, remove its worktree and delete the branch **both remotely and locally**:
```bash
git worktree remove <path>
git push origin --delete <branch>   # skip if GitHub's PR auto-delete already removed it
git branch -D <branch>              # -D (not -d) because --no-ff merges leave the tip non-ancestral
```
**`gh pr merge --delete-branch` ends in `fatal: '<default>' is already used by worktree` in every
repo here, and THE MERGE STILL SUCCEEDED** — gh merges server-side, then tries to check the default
branch out locally, which fails because the main checkout already holds it (3/3 merges, 2026-09-03).
Confirm with `git log --oneline origin/master -1`, then do the cleanup above by hand; do not re-run
the merge.
Verify the commit landed on the remote default first: `git merge-base --is-ancestor <sha> origin/master` must exit 0 (a stale local `master` is not the authority). Leaving stale worktrees or branches around accumulates cruft and confuses future sessions about what's in-flight and what's already shipped.

**Run `bash scripts/close-out.sh <branch> [<repo>]` yourself** — it reports all of the above plus the docs half (live docs still naming the branch, shipped docs still under `docs/active/`, the ROADMAP and MAP items). Read-only, always exits 0: it says what is left, it does not do it, so address every line within the authorized scope. The `wrap-up` procedure includes it at close-out.

**Pushing to master green-lights closing the dev server.** If you started `bash scripts/run-dev.sh` to verify a change, shut it down (plus any helper Electron processes) once the commit lands on `origin/master`. Don't leave it running unless the user explicitly asks — orphaned Vite servers hold port 5223 and trip up the next session's dev launch.

**Never tell Destin to run `wrangler deploy` manually.** The Cloudflare Worker (`wecoded-marketplace/worker/`) auto-deploys on push to master via `.github/workflows/worker-deploy.yml` — CI runs tests, applies D1 migrations, deploys, and pushes secrets. To ship a Worker change, the workflow is: open a PR → merge to master → CI handles the rest. Same for `[vars]` flips like `CUTOVER_TIMESTAMP` — edit `wrangler.toml`, commit, merge. See `docs/build-and-release.md → Worker (wecoded-marketplace)`.

## Workspace Setup

**Normal session startup:** `node scripts/workspace-start.mjs --session <stable-key> [repo…]`. Choose a unique lowercase session key once, and reuse it on resume. Workspace docs always get their own worktree; add `youcoded` or another component name when needed. The command prints absolute paths and supports `--json`; `--root` accepts the shared workspace or a linked workspace worktree. Read that worktree's `CLAUDE.md` and `docs/MAP.md` before proceeding. It cannot change this conversation's file-tool root: use absolute paths. Details and recovery: `docs/workspace-start.md`.

**Installation / explicit maintenance only:** `bash setup.sh` clones missing repos and updates shared checkouts. It is not a prerequisite for each session. `workspace-start` only fetches for new worktrees; it never pulls, stashes, cleans, installs dependencies, or deletes unfinished work.

**A commit made IN the shared `youcoded-dev` checkout is refused by a pre-commit hook** (`scripts/git-hooks/pre-commit`, installed by `setup.sh`); commit from a linked worktree, which the hook always allows, and push from there. This is the rule that was already written down under "Workspace push via temp worktree" — it is now enforced, because ignoring it is what let this checkout reach 110 commits behind on 2026-09-03 while silently holding the only copy of five of Destin's product ideas. `setup.sh` no longer just refuses when it cannot pull: `scripts/workspace-sync.sh` tells a duplicate local commit (already upstream under another sha) from a unique one, catches the checkout up on its own when that is provably safe, and otherwise names the exact file or commit in the way. **It also DISCARDS leftover local copies of changes that are already on the remote** — a file whose exact bytes are a commit upstream, which is what the copy-to-a-worktree workflow leaves behind every time and what kept this checkout 175 commits behind for 31 hours on 2026-09-04; nothing is lost, because git still has the bytes. It merges what git can merge, and refuses only for files that genuinely disagree — printing, per file, how many lines exist only locally versus only on the remote, which is the number that decides whether the local copy is worth keeping (it is usually 0). **If you edited a workspace file here and landed it from a worktree, that is the whole story: leave the leftover alone, the next sync clears it.** Override, for a commit you genuinely mean to make here: `YOUCODED_ALLOW_MAIN_COMMIT=1 git commit …`.

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

When designing new features or making changes to user-facing app interfaces, the first step should always be to visualize and design the UI/UX of the final feature. Planning sessions should prioritize iterative UI design using the workbench and other tooling to help Destin shape the final user experience of the feature before building backend. When Destin provides final sign-off on the UI/UX design for the feature, the UI/UX should be treated as largely final and backend should be designed around the UI/UX accordingly. The standard every new surface is measured against is `docs/active/design/2026-08-25-ui-design-guide.md` (five laws, primitives, per-surface anatomies, checklist); show him the change as a **review deck** (scripts/ui-review/review-cards.py — one point per step: Before | After with the changed region boxed by the rig, a headline and three cards — What changed / You'll notice / Risk — Yes / No / Other, answers saved to a file and handed to Claude on Submit; `serve <spec>` in the background does it all), built from the UI review rig below; never a gallery, a prose page or a chat description (all three were rejected). The flow around the deck — questions deck first, contract at sign-off, acceptance deck at the end, then the build stage (technical design → capped review → task breakdown → subagent build) — is `.claude/rules/feature-flow.md`. **This overrides the brainstorming skill's habit of asking in chat:** on a YouCoded feature, its opening questions go on a questions deck (`ui-mockup` skill → "Before drawing anything"), and a chat answer is not a source for the contract. **For motion, drag or hover, use a LIVE step** — panes of the running app he can actually operate, one authored candidate each out of `youcoded`'s `compare/registry.tsx` (`serve` boots the worktree's workbench for them). A recording is the wrong tool for a 200 ms animation: four clip steps were rejected on 2026-08-31 as "just rough to compare". `scripts/ui-review/README.md` → "Live panes". **Two context-free subagents review every feature** (decided 2026-09-04): a **UX tester** that gets only a briefing and `scripts/ui-review/tester-kit.md` drives the mockups *before Destin sees the first deck* and the built branch at the end, reporting confusion and over-long copy; a **code reviewer** reads the whole branch for bugs and broken promises; a fresh **grader** writes the verdicts. Briefs: `scripts/ui-review/{ux-tester,code-reviewer,grader,contract-agent}.md`. Destin never opens a review session.

### Asking Destin many questions at once

**Four or more questions that need Destin's input go on a question deck, never in a chat message** — `python3 scripts/questions/serve.py <spec.json>` (run it in the background; its exit is the submit signal and it prints every answer). A wall of one-liners in chat was rejected on 2026-09-01: it assumes he remembers every item, and some were filed months earlier. Every question on the deck is written for someone with **no context**, in plain words, in four parts the page renders as labelled blocks — **today** (what exists: which part of the app, what it does for the user), **the problem** (what goes wrong, as the user experiences it), **the proposal** (what would change, as the user would notice it), and **options** (each with pros and cons **about the user's experience**, not the code). Yes/No/Don't-know questions say in the proposal what each answer leads to. Fewer than four, or wording-only, still go in chat. Spec format is in the script's header.

### UI Workbench

`bash scripts/run-workbench.sh` boots the **real renderer** in a browser tab (Vite only — no Electron, no PTY) against a fake `window.claude`, on port 5233. Every menu is clickable and stateful, so **new feature UI is built here before its backend exists** — channels with no backend go in `MOCK_ONLY`, which is then the backend to-do list. Toolbar switches scenario (`default`/`empty`/`no-providers`/`refused`/`stress`), fake IPC latency, narrow viewport, and the tool gallery that replaced `?mode=tool-sandbox`. Use `run-dev.sh` instead when you need real event ordering, PTY, or main-process behaviour. **After any change to the mock shim run `node scripts/workbench-boot-check.mjs`** — it loads every registered workbench route headless (16 today) and fails on a console error, and refuses (exit 2) when nothing is serving the port; the unit suite passed while the app crashed at boot three times running. Rule: `.claude/rules/react-renderer.md`; spec: `docs/archive/specs/2026-07-29-ui-workbench-design.md`.

### UI review (autonomous screenshot sweep)

`bash scripts/ui-review/run-review.sh <worktree>` screenshots **every** screen, dialog, drawer, popover and menu in all six themes (workbench, headless, ~5 min — one Chrome per plan×theme×shard), builds side-by-side theme sheets, a painted-pixel contrast report and `gallery.html` — and **every shot must prove it opened** (target found, `expect` held, pixels changed) or it lands in `coverage.md` as a miss. **Read `coverage.md` before writing any finding; a surface that isn't `covered` is "unreviewed", never "fine".** Use it for the whole-app review pass (`/ui-review` skill: capture → fix misses → judge against `docs/active/design/2026-08-25-ui-design-guide.md` → numbered ledger) and as the Before/After runs behind a review deck for any UI PR (re-run only the affected plans; a second concurrent sweep needs `YOUCODED_PORT_OFFSET` ≥ 100 away from the first). Terminal, marketplace data, sync and live sessions need the real-app pass in `scripts/ui-review/README.md`. Born from the 2026-08-25 review, whose first rig filed 40 mislabelled sheets — that failure is why the verification exists.

### Demo clips and the landing page

The public site (`youcoded/docs/index.html`) is built from **recordings of the running renderer**, not drawings: `scripts/ui-review/record.mjs` films one JSON scene (`scripts/ui-review/scenes/`) into a WebM loop + poster, and `bash scripts/ui-review/site-assets.sh <worktree>` regenerates every loop, gallery still and the live embed in one go (a desktop release-checklist step). What the demo "model" says is a reply fixture. Any "make a clip of feature X" / "update the website" request starts at `scripts/ui-review/README.md` → "Recording a loop"; the rule `.claude/rules/landing-page.md` auto-loads on the page and the rig. **Landing copy lives in** `docs/active/handoffs/2026-08-31-landing-redesign-START-HERE.md`. Do not write “real app / real files / actually reads / does real work / self-improving.” The fact sheet is inventory, not copy.

### Asking a page a question, and A/B-ing the answer

`node scripts/ui-probe.mjs <url> [--size WxH]… [--wait '<js>'] [--eval '<js>']… [--shot p.png] [--json]` —
launches its own headless Chrome on a free port, waits for the page's readiness flag, evaluates, screenshots,
reports console errors (`--fail-on-error` makes them an exit code). **Reach for this instead of writing
another CDP script**; one session wrote fifteen throwaway ones in a day. Guard: `scripts/ui-probe.test.mjs`.

`bash scripts/ab-measure.sh <file>… [--prepare '<cmd>'] -- <measurement>` — answers **"did I break this, or
was it already broken?"** by running the same measurement against `HEAD`'s copy of those files and yours.
Restores your files on exit; never touches the index.

`bash scripts/image-churn.sh [--staged] [--revert]` — changed images whose PIXELS match `HEAD`. Any generator
that re-emits images makes these (265 in one deck rebuild) and they bury the image that really changed.

`node scripts/check-doc-commands.mjs [--list] [--local]` — runs the commands in blocks marked
`<!-- runnable -->` (or `<!-- runnable: local -->` for ones needing magick/ffmpeg/Chrome). Marking is opt-in;
CI runs it. Born from a test command that sat wrong in two docs for months and could not start at all.

`scripts/cdp-eval.mjs` is the other half of the first one: it attaches to an **already-running** CDP target by
WebSocket URL — most often the Android WebView over `adb forward` (recipe in its header).

### Local build & test

**Before claiming a desktop change is done, run `bash scripts/verify.sh [<worktree>]`.** One command, one exit code: `tsc --noEmit`, `vitest related` on the files you changed **plus every source-scanning guard** (the `*-authority` suites read the tree at runtime, so `related` can never reach them — one slipped a banned class past two green runs on 2026-08-28), `knip`, `eslint`, and the ast-grep invariant scan — in parallel, ~10s for a small diff. It runs the FULL suite automatically when the diff touches test infra (`vitest.config.ts`, `package.json`, `tests/__mocks__/`), since that invalidates the affected-test mapping; `--full` forces it, `--dry-run` prints the plan. **It covers `youcoded/desktop` only** — it says so on exit, and Android/worker still need their own commands below.

```bash
# Desktop
cd youcoded/desktop && npm ci && npm run build

# Android (requires Desktop React UI built first)
cd youcoded && ./scripts/build-web-ui.sh && ./gradlew assembleDebug && ./gradlew test

# Android in a WORKTREE, or when the bare commands above fail at SDK resolution.
# The SDK IS installed (/home/destin/.android-sdk) — ANDROID_HOME is just unset,
# and the system default java is 26, which AGP 8.7 rejects. `-x bundleWebUi` is
# MANDATORY in a worktree: it transitively runs `npm ci`, which is destructive
# against a hardlinked node_modules (see the worktree rule above).
cd <worktree> && JAVA_HOME=/usr/lib/jvm/java-21-openjdk ANDROID_HOME=/home/destin/.android-sdk \
  ./gradlew test -x bundleWebUi
```

See `docs/build-and-release.md` for full build order, release flows, and version bumping rules.

### Harness evals (native agent tools)

**When you change a native harness tool, a prompt/instruction file, or want to compare models, OFFER to run the harness evaluator — then let Destin decide.** `youcoded/desktop/test-engine/harness-eval.mjs --plan <file>` runs a case across a matrix of **code version × instruction file × model**, each cell in its own disposable `os.tmpdir()` fixture, and grades every run twice: free mechanical checks read off the event stream, plus an LLM judge whose every grade must quote the text it scored. `--dry-run` is free and needs no key; `--only <cellId>` is one cell; `--max-spend <usd>` is a hard cap. A real run needs `--key-file` — **the CLI refuses to start if `OPENROUTER_API_KEY` is in its environment**, because that is readable by the models it runs. Measured ~$0.25 a cell, so **never run the paid path unasked**.

Why offer at all: four live rounds found **nine** real defects that 4,500 passing tests did not — Bash returning 27,966 chars from one command, Grep reporting a 500-match cap as a true total, Glob treating `{ts,kt}` as literal text, a provider 402 rendered as `[object Object]`. Unit tests here drive scripted fake models; only a real model spending a real turn exercises the judgment these tools are built for. Rule: `.claude/rules/harness-evaluator.md` (auto-loads on `harness/tools/**` too).

## Ending a Session

**When Destin says "wrap up", "close out this session", "let's finish up", "we're done",
or asks what this session taught us — invoke the `wrap-up` skill.** Do not improvise a
summary: the skill is the procedure, and a freehand recap is the failure mode it exists
to replace. It also runs on its own at the end of any substantial session.

It replays what the session actually did — what context loaded, what you had to hunt for
because it was unwritten, which tooling you used and why, where you took a wrong turn —
and turns that friction into workspace changes. Every recommendation ends the session
**applied**, as a dated roadmap entry (`docs/roadmap/<area>.md` — see `ROADMAP.md` → "Filing an item"), or **explicitly dropped with a reason**.
A numbered list nobody actions is the failure mode, not the output.

**Why it has to be asked for.** No hook can know when a session is finished: `SessionEnd`
fires once the session is already over (Claude cannot think then) and `Stop` fires after
every turn. There is deliberately no tracker — a tracker for this would depend on the
undocumented transcript format and a marker string, and when it broke it would look
exactly like a clean record. A guard that fails silently is worse than none.

**"Wrap up" does not mean "merge".** It usually means the docs and workspace hygiene
while the branch stays open — Destin often has a fresh session review the PR first,
because the session that wrote the code is the worst reviewer of it. Merge only on an
explicit instruction, and never end a turn suggesting it.

**A handoff prompt for a new session goes in plain chat, never a file.** When Destin asks
for a prompt to start a fresh session with, write it as one chat message he can copy —
not a handoff document, not a path (Destin, 2026-09-04). A written handoff doc is still
right when the material is the *record* of a piece of work (`docs/active/handoffs/`); the
prompt that points a new session at that record is chat.

**Destin does not run commands.** If the wrap-up needs `scripts/close-out.sh`,
`scripts/audit-anchors.mjs` or a test run, YOU run it and act on the output. Never end a
turn by handing him something to type.

The mechanical anchor checker runs daily in CI; `/audit` adds an assistant-led semantic
review and corrections when invoked. The scheduled check does not perform that review.
`wrap-up` captures what only the session that lived through the work knows.

## Keeping Documentation Accurate

This workspace's documentation is intended to be self-verifying. Destin can run `/audit` — it verifies the machine-checkable anchors (`node scripts/audit-anchors.mjs`: rule `verify:` blocks, doc anchors, MAP paths, store budgets), diff-scopes semantic re-verification to what changed since the last report in `docs/audits/`, and **fixes what it finds in the same run** (the report is an audit trail, not a to-do list). `/audit full` re-verifies everything and runs every pinned test; `/audit <subsystem>` scopes to one rule (names = `.claude/rules/*.md` basenames).

- Run before any release (prevents shipping with stale docs)
- Run after major refactors touching IPC, reducer, or runtime
- Unresolved findings live in the latest `docs/audits/` report's `## Residue` section (the only surviving drift ledger — a snapshot, not an accumulator)
- Session-start hook surfaces a reminder if the latest `docs/audits/` report is >60 days old or its `residue:` frontmatter count is non-zero
- The mechanical pass also runs unattended in `.github/workflows/workspace-ci.yml` — on push/PR here, **and daily on a cron**. The cron is the one that matters: anchors point into the sub-repos, so they break when `youcoded` moves, which never triggers a push to this repo

If you notice Claude acting on outdated information, or you mention a file/function Claude doesn't recognize, that's the signal to run `/audit`.
