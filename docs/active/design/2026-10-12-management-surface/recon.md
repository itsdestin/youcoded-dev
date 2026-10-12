# Repo reconnaissance (read-only, 2026-10-08) — facts about what exists

Workspace: /home/destin/youcoded-dev (shared checkout; app repo `youcoded/` on disk was 200 commits behind origin/master at the time; origin/master was read with `git show`).

## 1. The app's building blocks as they exist in code
- **"FleetView" does not exist** anywhere. Nearest real things: the Specialists chip and an "Agents & Automations view" which ROADMAP.md says "has no design".
- **Projects.** A project is a folder. Three records: `SavedFolder` (`~/.claude/youcoded-folders.json`, `shared/prefs-types.ts`); a synced `ProjectRegistryEntry` (`main/sync-spaces/project-registry.ts`); an artifacts sidecar `<project>/.youcoded/artifacts.json`. A project holds instruction files, its `Pages/` folder, `.claude/agents/`, and its conversations. Screens: `renderer/components/project-view/`. Per-project skills and tools are a P1 roadmap item, not built (worktree `plugin-project-controls`).
- **Sessions vs conversations.** Session = live run (`SessionInfo`, `shared/types.ts`: folder, provider `claude|native|shell`, model, permission mode). Conversation = saved record (`ConversationRecord`, `main/conversations/store-core.ts`: title, project name, complete/priority flags, note, last model). Conversations tie to projects only by folder name; they don't record which skills or agents were used.
- **Agents: no general reusable "agent" object.** Nearest: **Specialists** (`main/harness/specialists/`): name, description, system prompt, allowed tools, read-only/read-write rule, optional model preference (`parent|budget|frontier`), report size limit. Sources: built-in, `~/.youcoded/specialists/*.md`, Claude Code's `~/.claude/agents` or `<project>/.claude/agents`. A specialist can't hire another. Harness presets exist (`assistant`/`coder`).
- **Skills and plugins.** `SkillEntry` (`shared/types.ts`): source core/self/project/plugin/marketplace, visibility. `SkillComponents` lists what a plugin can bundle: skills, hooks, commands, agents, MCP servers. Marketplace screens: `renderer/components/marketplace/`.
- **Hooks.** `main/hook-reconciler.ts` keeps `~/.claude/settings.json` hooks in step with installed plugins. App's own hooks from `scripts/install-hooks.js`.
- **MCP servers.** `main/mcp-reconciler.ts` copies a plugin's `mcp-manifest.json` into `~/.claude.json` (add-only). The app attaches its own servers per session: SendUserLink, doc comments, `youcoded-pages` (`claude-code-pages-mcp.ts`). MCP has no settings screen.
- **Instruction files.** `main/project-context.ts`, `shared/project-context-types.ts`: CLAUDE.md, AGENTS.md, rules, memory; scopes project/global/memory. Project view has an editor.
- **Themes.** `renderer/themes/`, `ThemeScreen.tsx`, separate `wecoded-themes` repo. Connect to nothing else except Pages pick up colors.

## 2. Pages
- On disk: folder `<home>/<slug>/` with `page.html`, `page.json` (name, description, icon, connections), `data.json`. Homes: Personal (`~/YouCoded/Personal/Pages/`) or a project's `Pages/`. Ids `personal:<slug>` / `project:<name>:<slug>` (`main/pages/pages-store.ts`, `shared/pages-types.ts`).
- Hosting: `renderer/components/pages/PageHost.tsx`, sandboxed iframe (`allow-scripts allow-popups allow-forms`, no same-origin). Page talks to app only via messages (`window.youcoded`, `page-theme.ts`): read/write its own data, receive theme, `youcoded.fetch` for connections declared in page.json (approved once); on origin/master also live sockets, camera, Plaid. A page cannot touch files, the app bridge, or the assistant's tools.
- Links to other units: belongs to a project only by living in its folder. Assistant-side link: the `youcoded-pages` MCP (list pages, read/update page data; update asks permission). Pages have no link to agents, skills or sessions.
- page-builder skill: `wecoded-marketplace/wecoded-pages-plugin/skills/page-builder/`. Money (Plaid) and Home (Home Assistant) are hand-installed personal pages. `youcoded-dev/Pages/analytics/` connects to YouCoded's admin service.

## 3. The planning system
- `ROADMAP.md`: hand-written prose per pillar, "Next release" (v1.3.1), a P1 list, a generated Backlogs table.
- Area files `docs/roadmap/<area>.md`: `Filing test:` line; entries `- [ ] **headline**`, prose (often lettered clauses bundling several items), then one token line: surface (opt), seen-on, status, priority P1/P2/P3, `checked YYYY-MM-DD`, flags, optional `→ link`. Vocab enforced by `scripts/roadmap-check.mjs` (`--fix`, `--close`, `--vocab`). `--close` deletes the entry and appends to `docs/roadmap/shipped.md` (477 lines).
- Open entries: 143 total; by area: native-harness 21, dev-workspace 20, perf 19, user-interface 14, files 9, remote-access 9, sync 9, other-features 8, chat-data 7, local-models 6, marketplace 6, operations 5, claude-code-integration 4, themes 3, games 2, android-only 1. 21 are P1.
- "150" = `ROADMAP_MAX = 150` in roadmap-check.mjs, an entry cap. Not branches.
- An entry lacks: filed date, reporter/source, owner, link to branch/PR/worktree, individual items (bundles hide them). Only "last checked" exists.
- `docs/active/`: investigations 87, design 28, handoffs 19, specs 18, plans 17, prototypes 8, reviews 6, locks 1.

## 4. Work in progress
- Worktrees: 13 in youcoded-dev (11 under `worktrees/sessions/`), 16 youcoded worktrees (two on no branch, `plans-r12-before/after`, plus `feat/specialists-plans-ui`).
- Remote branches not merged (as of 2026-10-08 fetch): youcoded-dev 24 of 27; youcoded 31 of 33; wecoded-marketplace 5 of 6; themes/admin/core 0. ~55 total, many paired (same session name in both repos), plus backups, a diag branch, dependabot. ≈15–20 distinct efforts. Only 3 touched in the prior 7 days.
- Newest unmerged youcoded-dev branches: 10-08 master-plan-20261006, 10-08 ui-consistency-audit, 10-08 backup/performance-stream-attribution-wip, 10-04 dev-xray-tools, 09-29 usage-visibility, 09-27 integrations-research, 09-26 marketing-ads, 09-26 docs/specialists-plans-decisions, 09-24 plugin-project-controls, 09-22 theme-plugin-update, 09-15 onedrive-no-auto-download, 09-14 offline-auth-bypass, 09-14 agent-lint-tooling, 09-11 files-drawer-honesty, 09-11 wrap-up-open-work. youcoded adds a vitest dependabot bump, `fix-permission-approve-flake`, `feat/specialists-plans-ui`/`-5b`, `diag/mm-memory-timing` ("not for merge").

## 5. Existing tooling a surface could be generated from
- **shoot** (`scripts/shoot/`): screen list `youcoded/desktop/src/renderer/dev/workbench/screens/*.ts` (~216 screens); writes `scratch/shoot/<time>/<screen>/<theme>.png`, `manifest.json`, contact sheets; `--check` opens every screen, exits 1 on a miss. `explore.mjs` acts like a user.
- **Review decks** (`scripts/ui-review/review-cards.py`): answers saved as `<spec>.answers.json` beside the spec, committed; 435 under `docs/`; the record of Destin's decisions.
- **Perf lab** (`scripts/perf-lab/run.mjs`): one JSON + Markdown report per run in `youcoded-dev/perf-reports/` (157 files). Always-on hitch log `<userData>/perf/hitches.jsonl`.
- **close-out.sh**: read-only checklist for one branch.
- **workspace-start session records**: `.git/youcoded-sessions/<key>.json` (391), each with branch, path, base commit. `docs/wrap-ups.md` end-of-session ledger (99 sections).
- **Chat search index**: `~/.youcoded/chatsearch/` (meta + turn files per provider; a `chatsearch` skill queries it).
- **Releases**: `youcoded-admin/skills/release/SKILL.md`. Latest v1.3.0 (2026-09-20); betas on 1.3.1. `youcoded/CHANGELOG.md` hand-written per release.
- Also: `scripts/verify.sh` (types, tests, knip, lint, ast-grep), `scripts/audit-anchors.mjs`, `scripts/roadmap-check.mjs`, `scripts/ui-probe.mjs`, `scripts/run-workbench.sh` (real renderer with fake backend), `docs/MAP.md`.

## 6. The previous attempt (worktree `master-plan-20261006`, branch pushed)
- Reusable data pipeline `scripts/command-center/`: `derive-edges.mjs` links files by imports, IPC channels, events, co-changes, tests, doc mentions → `scratch/command-center/`; `parts-check.mjs` sorts every file into one of 124 parts via 614 rules (`parts.rules.json`) across 8 systems and 5 layers, fails if any file is left over; `aggregate.mjs`, `render-grid.mjs`. `map/README.md`: a second grouping from MAP.md rows + graphviz. `concepts/data.json`: real data as of 10-08 (21 efforts, 3 active, systems, connections, a morning briefing).
- Rejected: the 124-box grid; four map shapes; three whole-page concepts; a mocked "master-plan" Page in the workbench with made-up records and inert buttons.

## 7. GitHub Issues
- Enabled on `itsdestin/youcoded`; 0 open, 54 closed (51 Destin's own, 2 tjmorin03, 1 jinxk). No issue templates. In-app Report-a-bug posts to Issues (`main/dev-tools.ts`); Settings → Development → "Known issues" opens Issues; "Roadmap" row opens `youcoded-dev/ROADMAP.md` on GitHub. The backlog lives in the roadmap files, not Issues.
