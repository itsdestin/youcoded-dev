---
status: draft
date: 2026-10-08
type: investigation
topic: master-plan
---

# Placement audit: do the doubtful parts sit in the right system?

Method: for each of the 43 distinct parts on the doubtful list (46 entries in `2026-10-08-parts-placement.md`; some parts appear twice), take every connection from the part's files to files in a different part. Counted kinds: import, channel (incl. Android sharing a channel name), event, cochange (edited together). Tests and doc mentions are ignored. Each connection counts by its weight and is credited to the system of the part on the other end. Computed by `scripts/command-center/aggregate.mjs --audit` (raw numbers in `scratch/command-center/audit.json`, not committed).

Rules applied: **settled** if the assigned system holds 60% or more of the non-foundations connections, or is the largest by 15+ points, or most connections go to foundations, or the part already is foundations. **move** if another product system holds 60% or more. **owner** otherwise.

Two judgement calls beyond the literal rule, both because chat-agents holds roughly half of all code and so attracts most connections from everything:
- A part already in Foundations only moves out at 80% or more of at least 15 connections. Otherwise 9 would have moved (app-shell, bridge-contract, app-logging, shared-utils, context-menu, updates, guide-tour, theming-backend, platform-support; 8 into Chat and agents, context-menu into Projects and files), which would be wrong for shared plumbing. context-menu is the one worth a look: 73% of its connections go to Projects and files.
- Own system largest by 15+ points but under 60% counts as settled (claude-code-link, conversation-store, games-arcade, project-context, marketplace-state).

## Outcome

43 parts audited. After applying the move: 39 settled, 4 owner. One move was applied to `parts.rules.json` (harness-eval). Note: this table is from the re-run after the move, so harness-eval shows as settled; the pre-move numbers were 96% chat-agents.

Caveat: the move of harness-eval is the mechanical result, but a scoring rig naturally imports the engine it tests. If Destin prefers dev-only rigs to stay in Workshop, revert that one part (system and its rule) in `parts.rules.json`.

Caveat 2: a connection from a skill/account file to Android's `android-runtime` part is credited to Chat and agents (Android reuses the same channel names), which inflates Chat and agents for the marketplace parts below.

## All doubtful parts

Columns: connection weight not counting foundations; top two systems (foundations excluded); top two (foundations included).

| Part | Assigned | Weight | Top 2 (no foundations) | Top 2 (with foundations) | Decision |
|---|---|---|---|---|---|
| harness-eval | chat-agents (was workshop) | 23 | chat-agents 96%; projects-files 4% | chat-agents 88%; foundations 8% | MOVE applied: workshop to chat-agents, 96% of connections |
| conversation-handoff | sync-devices | 40 | chat-agents 65%; sync-devices 35% | foundations 60%; chat-agents 26% | settled (mostly leans on foundations) |
| providers | chat-agents | 86 | chat-agents 92%; sync-devices 5% | chat-agents 52%; foundations 43% | settled |
| remote-access | sync-devices | 407 | chat-agents 51%; projects-files 18% | foundations 60%; chat-agents 21% | settled (mostly leans on foundations) |
| claude-code-link | chat-agents | 68 | chat-agents 59%; projects-files 25% | foundations 48%; chat-agents 31% | settled (own system is the largest by 15+ points (under 60%)) |
| github-connection | marketplace | 26 | sync-devices 46%; marketplace 35% | foundations 43%; sync-devices 26% | owner |
| conversation-store | chat-agents | 102 | chat-agents 58%; sync-devices 36% | foundations 41%; chat-agents 34% | settled (own system is the largest by 15+ points (under 60%)) |
| app-shell-backend | foundations | 423 | chat-agents 39%; projects-files 23% | foundations 48%; chat-agents 20% | settled (foundations part shared by several systems) |
| buddy-ui | chat-agents | 213 | chat-agents 81%; workshop 14% | chat-agents 51%; foundations 37% | settled |
| guide-tour | foundations | 4 | chat-agents 75%; workshop 25% | foundations 80%; chat-agents 15% | settled (mostly leans on foundations) |
| development-popups | foundations | 53 | chat-agents 36%; marketplace 23% | foundations 47%; chat-agents 19% | settled (foundations part shared by several systems) |
| chat-input | chat-agents | 304 | chat-agents 76%; sync-devices 9% | foundations 46%; chat-agents 41% | settled |
| bridge-contract | foundations | 923 | chat-agents 69%; workshop 11% | chat-agents 43%; foundations 38% | settled (kept in foundations (infrastructure; leans chat-agents 69%)) |
| shared-utils | foundations | 6 | chat-agents 83%; marketplace 17% | chat-agents 83%; marketplace 17% | settled (kept in foundations (infrastructure; leans chat-agents 83%)) |
| games-arcade | social | 62 | social 42%; workshop 24% | foundations 37%; social 26% | settled (own system is the largest by 15+ points (under 60%)) |
| marketplace-account | marketplace | 25 | marketplace 40%; chat-agents 40% | foundations 42%; marketplace 23% | owner |
| skill-library | marketplace | 66 | marketplace 53%; chat-agents 44% | foundations 38%; marketplace 33% | owner |
| office | projects-files | 187 | projects-files 81%; chat-agents 12% | projects-files 53%; foundations 35% | settled |
| voice-engine | chat-agents | 24 | chat-agents 100% | chat-agents 57%; foundations 43% | settled |
| settings-screens | foundations | 325 | chat-agents 59%; sync-devices 18% | foundations 43%; chat-agents 33% | settled (foundations part shared by several systems) |
| sync-service | sync-devices | 22 | sync-devices 91%; chat-agents 9% | sync-devices 51%; foundations 44% | settled |
| status-data | chat-agents | 19 | chat-agents 100% | chat-agents 79%; foundations 21% | settled |
| harness-askpass | chat-agents | 19 | chat-agents 100% | chat-agents 79%; foundations 21% | settled |
| harness-search | chat-agents | 12 | chat-agents 83%; sync-devices 17% | foundations 54%; chat-agents 38% | settled (mostly leans on foundations) |
| harness-prompts | chat-agents | 6 | chat-agents 100% | chat-agents 100% | settled |
| chatsearch-index | chat-agents | 35 | chat-agents 86%; sync-devices 11% | chat-agents 52%; foundations 40% | settled |
| document-comments | projects-files | 91 | projects-files 43%; sync-devices 31% | projects-files 33%; foundations 24% | owner |
| git-service | projects-files | 30 | projects-files 70%; chat-agents 30% | projects-files 43%; foundations 39% | settled |
| page-runtime | pages | 170 | pages 65%; workshop 20% | pages 51%; foundations 21% | settled |
| project-context | projects-files | 29 | projects-files 59%; chat-agents 28% | projects-files 40%; foundations 31% | settled (own system is the largest by 15+ points (under 60%)) |
| updates | foundations | 9 | chat-agents 100% | foundations 78%; chat-agents 22% | settled (mostly leans on foundations) |
| theming-backend | foundations | 14 | chat-agents 64%; marketplace 36% | foundations 63%; chat-agents 24% | settled (mostly leans on foundations) |
| app-logging | foundations | 42 | chat-agents 67%; projects-files 24% | foundations 42%; chat-agents 39% | settled (kept in foundations (infrastructure; leans chat-agents 67%)) |
| platform-support | foundations | 4 | chat-agents 100% | foundations 78%; chat-agents 22% | settled (mostly leans on foundations) |
| context-menu | foundations | 140 | projects-files 73%; chat-agents 21% | projects-files 69%; chat-agents 20% | settled (kept in foundations (infrastructure; leans projects-files 73%)) |
| voice-input | chat-agents | 41 | chat-agents 76%; workshop 24% | chat-agents 66%; workshop 21% | settled |
| app-shell | foundations | 1438 | chat-agents 67%; workshop 10% | chat-agents 50%; foundations 26% | settled (kept in foundations (infrastructure; leans chat-agents 67%)) |
| attention-prompts | chat-agents | 242 | chat-agents 71%; projects-files 13% | chat-agents 49%; foundations 31% | settled |
| renderer-utils | foundations | 51 | chat-agents 55%; projects-files 24% | chat-agents 41%; foundations 25% | settled (foundations part shared by several systems) |
| marketplace-state | marketplace | 86 | marketplace 55%; chat-agents 23% | marketplace 39%; foundations 28% | settled (own system is the largest by 15+ points (under 60%)) |
| android-parser | chat-agents | 0 | - | - | settled (no connections found) |
| android-skills | marketplace | 0 | - | - | settled (no connections found) |
| android-app | foundations | 0 | - | foundations 100% | settled (no connections found) |

## Questions for Destin (4)

Each asks which part of the app a piece belongs to. A wrong answer only changes which column the piece is drawn in on the map; no behaviour changes.

1. **GitHub connection** (links your GitHub account; 5 files). Today it is drawn under Marketplace. Which fits best?
   - Marketplace: it is used to publish your skills and themes (35% of its connections: theme marketplace, skill library, account screen).
   - Sync and devices: it is imported by sync spaces, the sync contract and the sync screens, and edited with remote access (46%).
   - Chat and agents: the Android app shares its request names with the chat engine (a small share).
2. **Marketplace account** (sign in to the marketplace). Today it is Marketplace. Which fits best?
   - Marketplace: it talks to the marketplace backend, installer and contract (40%).
   - Chat and agents: the phone app reuses its request names (40%, almost all of it from one Android part).
   - Social: it imports from the arcade and presence code (2 connections each, a small share).
3. **Skill library** (browse and install skills). Today it is Marketplace. Which fits best?
   - Marketplace: it shares channels with marketplace state and is edited with the installer and backend (53%).
   - Chat and agents: it shares channel names with the Android runtime and is imported by the Claude Code link (44%).
4. **Document comments** (comments on a document you edit). Today it is Projects and files. Which fits best?
   - Projects and files: it is edited with its own screens and imports the project contract and artifacts (43%).
   - Sync and devices: it is edited in the same changes as remote access, 27 shared edits (31%).
   - Chat and agents: it also changes with the Claude Code link and the assistant's tools (about 25%).

Recommendation for all four: leave as assigned unless Destin has a strong reason; the evidence is a near tie, and none of them are heavily connected to the alternatives.

## Flags summary

Computed from the same data by `aggregate.mjs` (grid in `scratch/command-center/grid.json`). Counts: no-tests 11, collision 36, cycle 10, hot-seam 12, hidden-coupling 54. In-flight efforts counted: 23, grouped from 27 branches (local branches and pushed copies ahead of origin/master; dependabot and backup branches left out). Branches whose changed files overlap 80% or more are one effort, so stacked perf branches count once.

Hot-seam: cell pairs over 3 times the median weight (17), top 12 only.

### no-tests (11)
- android-runtime: 23 files, no test edges
- android-app: 13 files, no test edges
- android-doc-comments: 13 files, no test edges
- android-skills: 13 files, no test edges
- android-artifacts: 8 files, no test edges

### collision (36)
- app-shell: 13 in-flight efforts: session/ui-consistency-audit, session/perf-switch-marks-20261005, session/perf-recorder-integration-20261005, session/dev-xray-tools, feat/specialists-plans-ui, session/plugin-project-controls
- workbench: 11 in-flight efforts: session/ui-consistency-audit, session/dev-xray-tools, session/usage-visibility-20260929, feat/specialists-plans-ui, session/plugin-project-controls, feat/specialists-plans-5b
- bridge-client: 9 in-flight efforts: session/ui-consistency-audit, session/perf-switch-marks-20261005, session/perf-recorder-integration-20261005, session/dev-xray-tools, feat/specialists-plans-ui, session/plugin-project-controls
- chat-view: 8 in-flight efforts: session/ui-consistency-audit, session/perf-switch-marks-20261005, session/perf-recorder-integration-20261005, session/dev-xray-tools, feat/specialists-plans-ui, feat/specialists-plans-5b
- ipc-bridge: 8 in-flight efforts: session/ui-consistency-audit, session/perf-switch-marks-20261005, session/perf-recorder-integration-20261005, feat/specialists-plans-ui, session/plugin-project-controls, feat/specialists-plans-5b

### cycle (10)
- artifacts <-> projects-contract: artifacts->projects-contract 31 imports, projects-contract->artifacts 6 imports
- conversation-handoff <-> conversation-store: conversation-handoff->conversation-store 5 imports, conversation-store->conversation-handoff 5 imports
- app-shell-backend <-> ipc-bridge: app-shell-backend->ipc-bridge 6 imports, ipc-bridge->app-shell-backend 12 imports
- harness-tools <-> native-runtime: harness-tools->native-runtime 6 imports, native-runtime->harness-tools 14 imports
- app-shell <-> chat-view: app-shell->chat-view 5 imports, chat-view->app-shell 5 imports

### hot-seam (12)
- chat-agents/screens <-> foundations/screens: weight 1469 vs median 17; mostly cochange
- foundations/backend <-> foundations/screens: weight 745 vs median 17; mostly cochange
- chat-agents/backend <-> foundations/backend: weight 620 vs median 17; mostly cochange
- chat-agents/backend <-> chat-agents/screens: weight 431 vs median 17; mostly cochange
- foundations/backend <-> sync-devices/backend: weight 407 vs median 17; mostly cochange

### hidden-coupling (54)
- ipc-bridge <-> workbench: 158 shared edits, no import/channel/event link
- pages-screens <-> workbench: 94 shared edits, no import/channel/event link
- office-ui <-> workbench: 68 shared edits, no import/channel/event link
- remote-access <-> workbench: 60 shared edits, no import/channel/event link
- chat-state <-> native-runtime: 48 shared edits, no import/channel/event link

Unmapped note: files that a branch adds and that are not yet in the current map are not counted toward any part.
