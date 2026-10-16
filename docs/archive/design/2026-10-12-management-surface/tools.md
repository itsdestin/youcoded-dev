# Tools research for the YouCoded vision and management surface (2026-10-09)
Star counts verified with `gh api` on 2026-10-09. "Last push" = last code activity.

## A. Your GitHub stars (login: itsdestin, 23 starred; raw list in stars.tsv)
Relevant ones (the rest are unrelated: CAD, gym tracker, PS5 port, voice, video, finance):
- **paperclipai/paperclip** (99,124) https://github.com/paperclipai/paperclip. "Open-source app to manage agents at work." Why: closest to a manager's view of many agents; study its layout.
- **thedotmack/claude-mem** (98,912). Remembers what agents did across sessions and feeds it back. Why: the "what happened" record could feed your history views.
- **addyosmani/agent-skills** (103,778) and **mattpocock/skills** (282,291). Packaged instruction sets for coding agents. Why: ready-made habits (plans, reviews) agents could follow to keep your docs current.
- **DietrichGebert/ponytail** (159,372). Makes agents write less code. Why: fewer changes means fewer leftovers to review.
- **alibaba/open-code-review** (44,981). Automated code review: fixed rules plus an AI. Why: a "safe to merge?" signal for the ready-to-merge list.
- **anthropics/claude-code** (149,847). Your agents' engine. Why: its hooks and session files are the raw data for an agent-activity view.
- **trycua/cua** (29,164). Lets AI drive a computer and run tests. Why: could capture screens for the gallery.
- **NVIDIA/OpenShell** (15,582). Safe sandbox for autonomous agents. Why: safety for parallel agents.
- **TencentCloud/Octop** (8,212). Self-hosted multi-agent assistant. Why: another multi-agent UI to compare.
- **heygen-com/hyperframes** (59,625). Turns HTML into video. Why: possible for demo clips; marginal for the surface.
- **morluto/rea** (39,486). Agents reverse-engineer apps. Why: understanding unfamiliar code; marginal.
- **anthropics/knowledge-work-plugins**, **cursor/plugins**, **spotify/portal-ai-plugins**: plugin formats. Low relevance.

## B. The wider field

### 1. Codebase knowledge / auto-wiki / code maps
| Tool | Stars | Last push | Open? | What it does / what it gives you |
|---|---|---|---|---|
| GitNexus https://github.com/abhigyanpatwari/GitNexus | 47,798 | 2026-10-09 | Source-available (non-standard license) | Builds a "knowledge graph" (map of what calls what) of a repo, browser-viewable and queryable by agents. Gives: the systems-and-connections map. Check license. |
| Serena https://github.com/oraios/serena | 30,129 | 2026-10-09 | Source-available | Gives agents code-aware search tools. Helps agents, not a viewer. |
| Repomix https://github.com/yamadashy/repomix | 28,770 | 2026-10-03 | MIT | Packs a repo into one file for an AI. Useful as the input step for generating explanations. |
| deepwiki-open https://github.com/AsyncFuncAI/deepwiki-open | 18,156 | 2026-09-03 | MIT | Open version of DeepWiki: auto-writes a wiki with diagrams from a repo. Closest to "explain my codebase in plain words". |
| GitDiagram https://github.com/ahmedkhaleel2004/gitdiagram | 18,026 | 2026-10-08 | MIT | Turns a repo into a clickable architecture diagram. Quick one-page system picture. |
| Gitingest https://github.com/coderamp-labs/gitingest | 15,878 | 2026-10-09 | MIT | Same idea as Repomix, by URL. |
| claude-context https://github.com/zilliztech/claude-context | 12,596 | 2026-07-14 | MIT | Semantic search over a repo for Claude Code. Agent helper. |
| Potpie https://github.com/potpie-ai/potpie | 5,739 | 2026-10-08 | Apache-2.0 | Builds a code graph and lets you ask questions in plain language. Good for "how does X work?" |
| code2prompt https://github.com/mufeedvh/code2prompt | 7,722 | 2026-09-25 | MIT | Another repo-to-prompt packer. |
| code-graph-rag https://github.com/vitali87/code-graph-rag | 5,239 | 2026-10-09 | MIT | Code graph you can query in English. |
| CodeWiki (FSoft) https://github.com/FSoft-AI4Code/CodeWiki | 1,760 | 2026-10-09 | MIT | Research tool that writes repo-wide docs with diagrams. |
| Aider repo-map https://github.com/Aider-AI/aider | 49,436 | 2026-05-22 | Apache-2.0 | Its compact repo-map idea is a cheap technique, not a viewer. |
| Swark https://github.com/swark-io/swark | 1,698 | n/a | OSS | Generates architecture diagrams from code using AI (VS Code). |
| dependency-cruiser https://github.com/sverweij/dependency-cruiser | 7,270 | 2026-10-08 | MIT | Draws which files depend on which, and can enforce rules (see 5). Fits "seams": shows where parts tie together. No AI needed, always accurate. |
| madge https://github.com/pahen/madge | 10,168 | 2026-01-21 | MIT | Dependency graphs, finds circular ties. Older. |
| Nx graph https://github.com/nrwl/nx | 29,399 | 2026-10-09 | MIT | Interactive project dependency graph. Needs Nx-style setup. |
Not on GitHub as open source (closed, not verified by gh): DeepWiki (Cognition), Devin wiki, Greptile, Swimm, Mintlify, Komment, Sourcegraph (Cody repo gone), CodeViz. Bloop (https://github.com/BloopAI/bloop, 9,487) is archived.

### 2. Parallel agent orchestration / dashboards
| Tool | Stars | Last push | Open? | Board view? | Notes |
|---|---|---|---|---|---|
| OpenHands https://github.com/OpenHands/OpenHands | 90,387 | 2026-10-09 | MIT | Web UI, no board | Full agent platform. |
| oh-my-claudecode https://github.com/Yeachan-Heo/oh-my-claudecode | 39,740 | 2026-10-08 | MIT | Mostly terminal | Team-of-agents add-on for Claude Code. |
| Vibe Kanban https://github.com/BloopAI/vibe-kanban | 28,306 | 2026-09-19 | Apache-2.0 | **Yes, kanban board** | Cards run coding agents in separate workspaces; review diffs, merge. Nearest to your "what are 8 agents doing". |
| cmux https://github.com/manaflow-ai/cmux | 28,063 | 2026-10-09 | Source-available | Terminal workspace | Terminal app for many agents with notifications. |
| OpenAI Symphony https://github.com/openai/symphony | 27,612 | 2026-09-15 | Apache-2.0 | Issue-tracker driven | Turns tracker tickets into agent runs. Idea: tickets are the control surface. |
| superset https://github.com/superset-sh/superset | 15,030 | 2026-10-09 | Source-available | Panels | Runs many agents in parallel worktrees. |
| claudecodeui https://github.com/siteboon/claudecodeui | 13,991 | 2026-10-09 | AGPL-3.0 | Web UI for sessions | Browse and drive Claude Code sessions from a browser. |
| agent-orchestrator https://github.com/OrchestratorInc/agent-orchestrator | 12,995 | 2026-10-09 | Apache-2.0 | Dashboard | Parallel agents with PR tracking. |
| claude-squad https://github.com/smtg-ai/claude-squad | 8,585 | 2026-08-20 | AGPL-3.0 | Terminal list | Manages many agents in separate worktrees. |
| emdash https://github.com/generalaction/emdash | 5,948 | 2026-10-09 | Apache-2.0 | Panels | Parallel agents in worktrees. |
| Crystal https://github.com/stravu/crystal | 3,127 | 2026-02-26 | MIT | Desktop app | Predecessor of Nimbalyst; stale. |
| ccmanager https://github.com/kbwo/ccmanager | 1,261 | 2026-10-08 | MIT | Terminal | Session/worktree manager. |
Closed products: Conductor (https://www.conductor.build/, Mac only, diff plus chat per agent), GitHub Agent HQ with "mission control" (https://github.blog/news-insights/company-news/welcome-home-agents/, one place to assign and track many agents, built around pull requests), Cursor background/cloud agents (remote VMs). Ralph loops are a technique (repeat an agent until done), not a product.

### 3. Specs / plans / issues for agents
| Tool | Stars | Last push | Open? | What it does |
|---|---|---|---|---|
| github/spec-kit https://github.com/github/spec-kit | 140,592 | 2026-10-09 | MIT | Write spec, plan, tasks as files agents follow. |
| OpenSpec https://github.com/Fission-AI/OpenSpec | 71,469 | 2026-10-09 | MIT | Spec files proposed and archived per change; lightweight. Matches your "archive shipped docs" habit. |
| BMAD-METHOD https://github.com/bmad-code-org/BMAD-METHOD | 53,989 | 2026-10-07 | Custom license | Role-based agent workflow (analyst, PM, dev). Heavy. |
| claude-task-master https://github.com/eyaltoledano/claude-task-master | 28,188 | 2026-04-28 | Source-available | Turns a spec into a task list for agents. Slowing. |
| Beads https://github.com/gastownhall/beads | 27,770 | 2026-10-09 | MIT | Agent-friendly task tracker with dependencies, stored in the repo; designed so agents remember work across sessions. |
| Backlog.md https://github.com/MrLesk/Backlog.md | 6,981 | 2026-10-07 | MIT | Each task is a Markdown file in the repo, with a terminal and web **kanban board**. Closest to a roadmap agents keep current and a human can view. |
GitHub Issues + Copilot coding agent and Linear agent features are closed hosted services.

### 4. Visual regression / screenshot galleries
| Tool | Stars | Last push | Open? | What it gives |
|---|---|---|---|---|
| Storybook https://github.com/storybookjs/storybook | 91,212 | 2026-10-09 | MIT | A gallery of every UI component; but needs components set up as "stories". |
| Playwright https://github.com/microsoft/playwright | 97,363 | 2026-10-09 | Apache-2.0 | Screenshot comparison and HTML reports. Foundation for capture. |
| BackstopJS https://github.com/garris/BackstopJS | 7,187 | 2026-09-08 | MIT | Before/after screenshot diffs with a browser report. |
| Lost Pixel https://github.com/lost-pixel/lost-pixel | 1,681 | 2026-04-22 | MIT, **archived** | Avoid. |
| reg-suit https://github.com/reg-viz/reg-suit | 1,298 | 2026-10-05 | MIT | Compares screenshots, publishes a report page. |
| Argos https://github.com/argos-ci/argos | 637 | 2026-10-09 | MIT | Self-hostable review of screenshot changes, with history per build. |
| Chromatic (cli) https://github.com/chromaui/chromatic-cli | 339 (CLI only) | 2026-10-08 | Hosted service | Storybook's paid review service. |
Note: YouCoded already has its own `scripts/shoot` and review decks; these show what a history-of-screens gallery looks like (Argos is the closest).

### 5. Architecture maps / rules from code
| Tool | Stars | Last push | Open? | What it does |
|---|---|---|---|---|
| Mermaid https://github.com/mermaid-js/mermaid | 90,594 | 2026-10-09 | MIT | Draws diagrams from text; renders in GitHub and most viewers. Likely the output format. |
| ADR collection https://github.com/architecture-decision-record/architecture-decision-record | 17,138 | 2026-10-09 | Docs | Reference for "decision records" (short notes on why a choice was made). |
| PlantUML https://github.com/plantuml/plantuml | 13,357 | 2026-10-08 | LGPL | Text-to-diagram, older. |
| LikeC4 https://github.com/likec4/likec4 | 5,837 | 2026-10-09 | MIT | Write a C4 model (zoomable systems, containers, parts) as text and get an interactive diagram. Best fit for a zoomable system map. |
| adr-tools https://github.com/npryce/adr-tools | 5,728 | 2024-04-25 | NA | Stale. |
| Structurizr https://github.com/structurizr/structurizr | 449 | 2026-10-05 | Apache-2.0 | Official C4 tool; Java parts archived. |
| ts-arch https://github.com/ts-arch/ts-arch | 665 | 2026-03-26 | MIT | Tests that say "this layer must not touch that" in TypeScript. |
Closed: IcePanel, CodeScene (hotspots, meaning files that change often and break often), Multiplayer.

## Five most relevant overall
1. **GitNexus** (code graph plus viewer): systems and connections map. Check its license first.
2. **deepwiki-open** or **Potpie**: plain-language wiki and Q&A about the code.
3. **Backlog.md** (with **Beads** or **OpenSpec** as format alternatives): Markdown-in-repo roadmap with a board agents can update.
4. **Vibe Kanban** (and GitHub mission control as a model): agent board; best layout reference for the 8-agents view.
5. **dependency-cruiser + LikeC4/Mermaid**: accurate, generated-from-code seam map (rules flag where parts cross boundaries), free of AI errors. Argos is the best reference for screen history.
Caveat: I read repo descriptions and counts only, not source; fit judgments are from descriptions. Closed products' details come from web search summaries.
