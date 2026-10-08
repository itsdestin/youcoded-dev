---
status: draft
date: 2026-10-08
type: investigation
topic: master-plan
---

# Where today's work lands on the app's subsystems

Method: MAP.md subsystem rows (163) matched to changed files by longest path prefix, then (weaker) by same-name file stem or a uniquely-owned deep folder. Everything else is "(unmapped)". Lines changed = added + removed vs origin/master (three-dot diff). Every in-flight branch listed is on origin. Fetched 2026-10-08.

**Caveat on the mapping:** MAP.md names entry-point files, not whole folders, so most changed lines (about two thirds on the big branches) fall in "(unmapped)", mostly tests and renderer/main files MAP does not list. The mapped share is real but undercounts.

## 1. In-flight branches (app repo)

| Branch | Ahead | Last commit | Pushed | PR | Top 3 subsystems by lines | Subsystems touched |
|---|---|---|---|---|---|---|
| session/ui-consistency-audit | 181 | 2026-10-07 | yes | none | (unmapped) desktop renderer (6073); (unmapped) tests (2787); the marketplace screen and its cards (2586) | 72 |
| feat/specialists-plans-ui | 139 | 2026-09-26 | yes | none | (unmapped) tests (18598); (unmapped) desktop main (7730); (unmapped) desktop renderer (2327) | 30 |
| session/perf-switch-marks-20261005 | 56 | 2026-10-07 | yes | none | (unmapped) tests (4933); the file/artifact panel (1438); (unmapped) desktop main (1001) | 24 |
| feat/specialists-plans-5b | 45 | 2026-09-16 | yes | none | (unmapped) tests (7525); (unmapped) desktop main (4143); Native runtime (1193) | 18 |
| session/perf-recorder-integration-20261005 | 45 | 2026-10-05 | yes | none | (unmapped) tests (3969); the file/artifact panel (1438); (unmapped) desktop main (928) | 21 |
| session/perf-hitch-recorder-20261005 | 38 | 2026-10-04 | yes | none | (unmapped) tests (3709); the file/artifact panel (1438); (unmapped) desktop main (878) | 21 |
| session/perf-integration-20261005 | 34 | 2026-10-04 | yes | none | (unmapped) tests (3055); the file/artifact panel (1438); what a message's TEXT does (551) | 17 |
| session/perf-reload-repaint-20261005 | 33 | 2026-10-04 | yes | none | (unmapped) tests (3066); the file/artifact panel (1438); what a message's TEXT does (551) | 18 |
| session/perf-zero-hitch-20261004 | 29 | 2026-10-04 | yes | none | (unmapped) tests (2856); the file/artifact panel (1438); what a message's TEXT does (551) | 17 |
| session/finance-dashboard | 28 | 2026-10-08 | yes | #248 MERGED | UI Workbench (1756); (unmapped) desktop main (878); (unmapped) tests (816) | 13 |
| feat/ask-claude-reference-ux | 27 | 2026-07-28 | yes | none | (unmapped) tests (2967); (unmapped) desktop renderer (1946); the input bar / composer (624) | 7 |
| session/plugin-project-controls | 21 | 2026-09-24 | yes | #203 OPEN | (unmapped) tests (3696); (unmapped) desktop main (2167); (unmapped) desktop renderer (531) | 21 |
| feat/permission-ask-timeout | 20 | 2026-07-31 | yes | none | (unmapped) tests (430); Chat & transcript (419); buddy mode (238) | 19 |
| feat/dev-dashboard | 5 | 2026-09-05 | yes | none | (unmapped) desktop renderer (1267); (unmapped) tests (709); Website analytics (272) | 14 |
| session/files-drawer-honesty | 4 | 2026-09-11 | yes | none | (unmapped) tests (1111); IPC bridge (167); (unmapped) desktop renderer (144) | 11 |
| session/model-picker-tags | 4 | 2026-09-11 | yes | none | (unmapped) desktop renderer (239); Model switcher recommendations (186); UI Workbench (147) | 7 |
| session/usage-visibility-20260929 | 3 | 2026-09-29 | yes | none | (unmapped) desktop renderer (400); UI Workbench (114); one file per domain (65) | 9 |
| session/dev-window-label | 2 | 2026-10-07 | yes | none | (unmapped) desktop renderer (14); (unmapped) desktop/line-budgets.json (2); React renderer / chrome (2) | 3 |
| session/dev-xray-tools | 2 | 2026-10-04 | yes | none | (unmapped) desktop renderer (1061); UI Workbench (93); one file per domain (39) | 8 |
| diag/mm-memory-timing | 1 | 2026-09-18 | yes | none | (unmapped) tests (23) | 1 |
| session/prerelease-sep07 | 1 | 2026-09-11 | yes | none | (unmapped) desktop/package.json (2) | 1 |
| session/quick-cache-check | 1 | 2026-09-11 | yes | none | Model switcher recommendations (56); UI Workbench (17); (unmapped) desktop renderer (10) | 4 |
| session/sync-retry-feedback | 1 | 2026-09-07 | yes | none | (unmapped) tests (40); (unmapped) desktop renderer (35); (unmapped) desktop main (14) | 3 |
| session/sync-safety-audit-20260908 | 1 | 2026-09-11 | yes | none | (unmapped) tests (261); (unmapped) desktop main (130); The runtime (10) | 5 |
| session/theme-plugin-update | 1 | 2026-09-20 | yes | none | (unmapped) tests (58); (unmapped) desktop main (41); Marketplace catalog (36) | 4 |

Totals: 25 branches, 25 pushed, 2 with a PR (gh worked; checked with --state all, both open). Other local branches (14) are not ahead of origin/master.

Notes:
- The six session/perf-* branches all carry the same 1,438-line change to the file/artifact panel and overlap heavily (29 to 56 commits each): they look like stacked or competing attempts at one piece of performance work, not six separate things.
- feat/specialists-plans-5b is fully contained in feat/specialists-plans-ui (139 commits ahead), so they are one body of work.
- Stale: feat/ask-claude-reference-ux (last commit 2026-07-28), feat/permission-ask-timeout (2026-07-31), feat/dev-dashboard (2026-09-05).
- session/ui-consistency-audit is the largest: 181 commits, 472 files, 72 subsystems touched.

## 2. Collision risk: subsystems touched by the most branches

Counting only mapped subsystems, branches touching at all (of 25):
1. React renderer / chrome: 16 branches
2. "one file per domain" (the per-domain IPC handler layer: permissions, models, providers, engine, tags): 13
3. IPC bridge (parity, one table both doors serve): 12

Next: Chat & transcript 11, UI Workbench 11, chat transcript / message list 10. As top-3 by size, the file/artifact panel leads (6 branches, but that is the one perf change repeated), then UI Workbench (5).

## 3. Open roadmap items

Total open: 131.
- By area: native-harness 21, dev-workspace 20, user-interface 13, files 9, perf 9, sync 9, other-features 8, remote-access 8, chat-data 7, local-models 6, marketplace 6, operations 5, claude-code-integration 4, themes 3, games 2, android-only 1
- By status: confirmed 65, needs-verify 21, parked 19, in-flight 9, blocked 9, decision 8
- By priority: P3 82, P2 28, P1 21
- Release targets: none set 104, v1.3.1 17, v1.3.2 7, v1.4 2, v1.3.3 1

Area x priority:

| Area | P1 | P2 | P3 |
|---|---|---|---|
| android-only | 0 | 1 | 0 |
| chat-data | 1 | 0 | 6 |
| claude-code-integration | 0 | 0 | 4 |
| dev-workspace | 3 | 5 | 12 |
| files | 2 | 1 | 6 |
| games | 0 | 0 | 2 |
| local-models | 2 | 1 | 3 |
| marketplace | 0 | 2 | 4 |
| native-harness | 8 | 5 | 8 |
| operations | 1 | 0 | 4 |
| other-features | 0 | 3 | 5 |
| perf | 2 | 0 | 7 |
| remote-access | 0 | 3 | 5 |
| sync | 0 | 4 | 5 |
| themes | 0 | 0 | 3 |
| user-interface | 2 | 3 | 8 |

## 4. P1 and P2 items with guessed home

Guess method: read the headline and the linked report path, then place it under the owner's six systems. These are my judgement calls, not a lookup; the roadmap has no subsystem field. 49 items (21 P1, 28 P2).

| Pri | Area | Status | Headline | Report | Guessed home |
|---|---|---|---|---|---|
| P2 | android-only | in-flight | Rebuild the Android app into a premium, complete mobile equivalent of desktop: the same | docs/active/handoffs/2026-09-24-one-core-START-HERE.md | Android / Sync & devices |
| P1 | chat-data | blocked | v1.3.1 release blocker: the replayed-turn record's type is ambiguous (D11 in the simplific | docs/active/plans/2026-09-16-simplification-phases.md | Chat & agents |
| P2 | dev-workspace | confirmed | Dev instance: 11 faults where it touches the real app or its launcher fails. |  | Workshop |
| P1 | dev-workspace | confirmed | Session work lost or stranded: 6 ways a session's work or worktree goes missing. |  | Workshop |
| P2 | dev-workspace | confirmed | We can see how many people open the app and nothing else. The daily ping carries a device, |  | Foundations |
| P2 | dev-workspace | needs-verify | The public Office add-on repo (youcoded-office) once held a personal budget memo of Destin |  | Foundations / Marketplace |
| P1 | dev-workspace | blocked | Mac installers: nothing is signed or notarized, and a Mac download may open as "broken". | docs/active/investigations/2026-09-03-formalization-costs-and-risks.md | Foundations (release) |
| P1 | dev-workspace | confirmed | Waiting on CI runs eats whole sessions. Destin, 2026-09-20: "just fixing a few minor test |  | Workshop |
| P2 | dev-workspace | confirmed | Re-work the release method: releases tag master directly, so each ships all ~3,200 commits |  | Foundations (release) |
| P2 | dev-workspace | parked | No Google Play listing — Android installs only from a GitHub APK, and from 2027 Google req | docs/active/investigations/2026-09-03-formalization-costs-and-risks.md | Foundations (Android release) |
| P1 | files | confirmed | v1.3.1 release blocker: searching a big project stops early, for file names and for text i | docs/active/specs/2026-09-18-project-files-background-index.md | Projects & files |
| P1 | files | confirmed | Files: five ways work can be silently lost. |  | Projects & files |
| P2 | files | confirmed | Office: four safety and privacy edge cases. |  | Projects & files |
| P1 | local-models | confirmed | Gemma models download with no licence notice, and Google's Gemma terms require passing the | docs/active/investigations/2026-09-03-formalization-costs-and-risks.md | Chat & agents (local models) |
| P1 | local-models | blocked | The file downloader exists three times (model files, engine, voice assets) and the checksu | docs/active/plans/2026-09-16-simplification-phases.md | Chat & agents (local models) |
| P2 | local-models | confirmed | The model list says whether a model FITS and nothing about whether it will be fast. Destin |  | Chat & agents (local models) |
| P2 | marketplace | confirmed | The "Likely safe" badge claims more than the scan checks: it only looks for leaked secrets | docs/active/investigations/2026-09-03-formalization-costs-and-risks.md | Marketplace |
| P2 | marketplace | parked | Harden account sign-in against link-based account takeover. The GitHub device-flow can be |  | Marketplace / Social |
| P1 | native-harness | needs-verify | v1.3.1 release blocker. The "No folder" choice on the new-session form (shipped |  | Projects & files |
| P1 | native-harness | decision | v1.3.1 release blocker. Every install should come with a built-in project, "Your |  | Projects & files |
| P1 | native-harness | in-flight | v1.3.1 release blocker. Native Runtime Parity Program — everything that still separates | docs/active/specs/2026-09-01-agent-platform-vision-and-state.md | Chat & agents |
| P1 | native-harness | blocked | v1.3.1 release blocker. The one object that runs a native conversation is 4,756 lines | docs/active/plans/2026-09-16-simplification-phases.md | Chat & agents |
| P2 | native-harness | blocked | Agents & Automations — a third top-level view beside Chat and Projects where work runs on  | docs/active/specs/2026-09-01-agent-platform-vision-and-state.md | Chat & agents |
| P1 | native-harness | needs-verify | v1.3.1 release blocker. The assistant cannot search the WeCoded marketplace, so when it |  | Chat & agents + Marketplace |
| P1 | native-harness | confirmed | v1.3.1 release blocker. After picking a wide "Always allow" (any `npm run`, pushing to | docs/active/investigations/2026-09-01-permission-near-miss-silent.md | Chat & agents |
| P2 | native-harness | confirmed | Cloud model context management and cache/token efficiency — one item so the fixes are | docs/active/handoffs/2026-09-09-cache-efficiency-followups-START-HERE.md | Chat & agents |
| P2 | native-harness | blocked | Helper (specialist) transcripts pile up in the sessions folder forever — no way to delete | docs/active/investigations/2026-09-01-specialist-child-transcript-gc.md | Chat & agents |
| P2 | native-harness | decision | Specialists stage two — plans: the model proposes a multi-step fan-out as data, the user |  | Chat & agents |
| P1 | native-harness | in-flight | Per-project skills and tools: each project chooses which skills, plugins and tool connecti |  | Projects & files + Marketplace |
| P2 | native-harness | confirmed | MCP servers can only be set up by hand-editing a config file — no settings screen to add, | docs/active/investigations/2026-09-01-native-mcp-phase-2.md | Chat & agents + Marketplace |
| P1 | native-harness | blocked | v1.3.1 release blocker — native-only users need a YouCoded-owned skills home. The only |  | Marketplace / Chat & agents |
| P1 | operations | in-flight | Public launch paperwork for 1.3.1: the LLC behind every account and a trademark filing. Si | docs/active/investigations/2026-09-03-formalization-costs-and-risks.md | Foundations |
| P2 | other-features | decision | Explore bringing YouCoded to iOS. Today an iPhone only reaches the app through Safari poin |  | Sync & devices |
| P2 | other-features | in-flight | YouCoded Pages: let people create and install their own native-looking pages, from dashboa | docs/active/plans/2026-09-16-youcoded-pages-phasing.md | Pages |
| P2 | other-features | needs-verify | YouCoded Pages follow-ups: 6 decisions and sightings. |  | Pages |
| P1 | perf | blocked | v1.3.1 blocker, blocked on simplification phase 5: leftover whole-file reads and memory wa | docs/active/plans/2026-09-16-simplification-phases.md | Foundations (speed) |
| P1 | perf | confirmed | The app still feels sluggish: chat-switch pauses and typing interruptions (4 things, work  | docs/active/investigations/2026-09-29-performance-status.md | Chat & agents (speed) |
| P2 | remote-access | confirmed | Phone and computer parity: what is still missing after one-core (youcoded#604), four thing |  | Sync & devices |
| P2 | remote-access | confirmed | Remote access "just doesn't work sometimes" and the phone gives nothing to act on. |  | Sync & devices |
| P2 | remote-access | confirmed | Browser encryption (the optional second level) is an approved design with nothing behind i | docs/archive/design/2026-09-09-remote-access/remote-access.review-4.json | Sync & devices |
| P2 | sync | decision | Two devices editing the same file: no way in the app to see or resolve the conflict. | docs/active/investigations/2026-09-01-sync-conflict-copy-resolver.md | Sync & devices |
| P2 | sync | decision | Very long conversations (over 50 MB) stop updating on your other devices. The device that  |  | Sync & devices |
| P2 | sync | confirmed | Personal sync history only grows, and a first download of it shows nothing (2 things). |  | Sync & devices |
| P2 | sync | needs-verify | Sync security gaps: three things that could expose secrets or let one device pose as anoth |  | Sync & devices |
| P1 | user-interface | blocked | v1.3.1 release blocker. The settings screen exists twice, once for desktop and once for ph | docs/active/plans/2026-09-16-simplification-phases.md | Foundations (settings UI) |
| P1 | user-interface | confirmed | Error messages still guess at causes in many places. | docs/active/investigations/2026-09-10-error-inventory/README.md | Foundations (errors) |
| P2 | user-interface | confirmed | Browser-default hover tooltips look foreign to the app. | docs/archive/investigations/2026-09-01-app-native-tooltips.md | Foundations (UI) |
| P2 | user-interface | confirmed | Model rows in the picker carry no cost or intelligence tags, so choosing means knowing the |  | Chat & agents (model picker) |
| P2 | user-interface | needs-verify | Messages vanish from an open chat: the chat panel emptied behind "Start a conversation" | docs/archive/investigations/2026-08-27-terminal-black-glyphs-mipmap-driver.md | Chat & agents |

## 5. Active plans, specs, handoffs

39 files have status: active. Referenced check: slug match against in-flight branch names and roadmap text/links (crude; a plan can be live under a differently worded branch). 28 have neither: orphan candidates.

| Kind | File | Branch ref | Roadmap ref |
|---|---|---|---|
| plans | 2026-04-21-deprecate-youcoded-core.md **ORPHAN** | - | - |
| plans | 2026-07-20-remote-hydration-pr-spec.md **ORPHAN** | - | - |
| plans | 2026-07-31-permission-ask-timeout.md | feat/permission-ask-timeout | - |
| plans | 2026-09-09-error-states-development-build.md **ORPHAN** | - | - |
| plans | 2026-09-16-ci-followups-C-test-consolidation.md | - | dev-workspace |
| plans | 2026-09-16-simplification-phases.md | - | chat-data, local-models, native-harness, perf, user-interface |
| plans | 2026-09-16-youcoded-pages-phasing.md | - | other-features |
| plans | 2026-09-24-android-rebuild-plan.md **ORPHAN** | - | - |
| plans | 2026-09-29-history-rendering-and-stalls.md **ORPHAN** | - | - |
| specs | 2026-07-10-phase2-conversation-sync-design.md **ORPHAN** | - | - |
| specs | 2026-07-23-statusbar-git-branch-popup-design.md **ORPHAN** | - | - |
| specs | 2026-07-30-permission-ask-timeout-design.md | feat/permission-ask-timeout | - |
| specs | 2026-08-05-chat-search-design.md **ORPHAN** | - | - |
| specs | 2026-08-11-native-specialists-design.md **ORPHAN** | - | - |
| specs | 2026-08-11-presence-self-healing-design.md **ORPHAN** | - | - |
| specs | 2026-08-23-perf-lab-and-optimization-loop-design.md **ORPHAN** | - | - |
| specs | 2026-09-01-agent-platform-vision-and-state.md | - | native-harness |
| specs | 2026-09-08-repository-public-truth-audit-design.md **ORPHAN** | - | - |
| specs | 2026-09-09-remote-access-first-milestone.md **ORPHAN** | - | - |
| specs | 2026-09-15-specialist-budget-permission-design.md | - | native-harness |
| specs | 2026-09-15-youcoded-pages-scope.md **ORPHAN** | - | - |
| handoffs | 2026-07-10-remote-access-review-handoff.md **ORPHAN** | - | - |
| handoffs | 2026-07-10-review-followups.md | - | dev-workspace |
| handoffs | 2026-07-10-sync-completion-handoff.md **ORPHAN** | - | - |
| handoffs | 2026-08-16-specialists-1c-testing-checklist.md **ORPHAN** | - | - |
| handoffs | 2026-08-26-open-work-state-of-play.md **ORPHAN** | - | - |
| handoffs | 2026-08-26-perf-loop-operating-manual.md **ORPHAN** | - | - |
| handoffs | 2026-08-27-oom-read-class-session-handoff.md **ORPHAN** | - | - |
| handoffs | 2026-08-27-open-work-inventory.md **ORPHAN** | - | - |
| handoffs | 2026-08-27-perf-cycle-1-handoff.md **ORPHAN** | - | - |
| handoffs | 2026-08-27-perf-lab-session-status.md | session/perf-hitch-recorder-20261005, session/perf-integration-20261005, session/perf-recorder-integration-20261005, session/perf-reload-repaint-20261005, session/perf-switch-marks-20261005, session/perf-zero-hitch-20261004 | - |
| handoffs | 2026-08-30-landing-redesign-iteration-handoff.md **ORPHAN** | - | - |
| handoffs | 2026-08-31-codex-spec-review.md **ORPHAN** | - | - |
| handoffs | 2026-08-31-landing-redesign-START-HERE.md **ORPHAN** | - | - |
| handoffs | 2026-08-31-open-work-inventory.md **ORPHAN** | - | - |
| handoffs | 2026-09-04-specialists-stage-two-START-HERE.md **ORPHAN** | - | - |
| handoffs | 2026-09-04-stage-two-decisions-prompt.md **ORPHAN** | - | - |
| handoffs | 2026-09-09-cache-efficiency-followups-START-HERE.md | - | native-harness |
| handoffs | 2026-09-24-one-core-START-HERE.md | - | android-only, dev-workspace, native-harness, remote-access |

Orphan plans (plans only): 2026-04-21-deprecate-youcoded-core.md; 2026-07-20-remote-hydration-pr-spec.md; 2026-09-09-error-states-development-build.md; 2026-09-24-android-rebuild-plan.md; 2026-09-29-history-rendering-and-stalls.md. Note several orphan handoffs are older open-work inventories and probably should be archived rather than treated as work.

## 6. Sessions with a live workspace

20 manifests still have a workspace on disk.

| Session | Manifest modified | App branch | Branch ahead of master? |
|---|---|---|---|
| compaction-handoff-20260922 | 2026-09-23 | session/compaction-handoff-20260922 | no |
| dev-window-label | 2026-10-07 | session/dev-window-label | yes (in section 1) |
| dev-xray-tools | 2026-10-04 | session/dev-xray-tools | yes (in section 1) |
| finance-dashboard | 2026-10-06 | session/finance-dashboard | yes (in section 1) |
| master-plan-20261006 | 2026-10-06 | session/master-plan-20261006 | no |
| model-picker-tags | 2026-09-11 | session/model-picker-tags | yes (in section 1) |
| pages-empty-before | 2026-09-23 | session/pages-empty-before | no |
| perf-hitch-recorder-20261005 | 2026-10-05 | session/perf-hitch-recorder-20261005 | yes (in section 1) |
| perf-integration-20261005 | 2026-10-05 | session/perf-integration-20261005 | yes (in section 1) |
| perf-recorder-integration-20261005 | 2026-10-05 | session/perf-recorder-integration-20261005 | yes (in section 1) |
| perf-reload-repaint-20261005 | 2026-10-05 | session/perf-reload-repaint-20261005 | yes (in section 1) |
| perf-switch-marks-20261005 | 2026-10-05 | session/perf-switch-marks-20261005 | yes (in section 1) |
| perf-zero-hitch-20261004 | 2026-10-04 | session/perf-zero-hitch-20261004 | yes (in section 1) |
| performance-stream-attribution | 2026-09-28 | session/performance-stream-attribution | no |
| plugin-project-controls | 2026-09-23 | session/plugin-project-controls | yes (in section 1) |
| refactor-plans-20260924 | 2026-09-24 | session/refactor-plans-20260924 | no |
| specialists-plans-wrapup | 2026-09-26 | session/specialists-plans-wrapup | no |
| theme-plugin-update | 2026-09-23 | session/theme-plugin-update | yes (in section 1) |
| ui-consistency-audit | 2026-10-06 | session/ui-consistency-audit | yes (in section 1) |
| usage-visibility-20260929 | 2026-09-29 | session/usage-visibility-20260929 | yes (in section 1) |

14 of 25 in-flight branches have a live session worktree. In-flight branches with no live session: feat/specialists-plans-ui, feat/specialists-plans-5b, feat/ask-claude-reference-ux, feat/permission-ask-timeout, feat/dev-dashboard, session/files-drawer-honesty, diag/mm-memory-timing, session/prerelease-sep07, session/quick-cache-check, session/sync-retry-feedback, session/sync-safety-audit-20260908. Sessions with no commits ahead (idle or already merged): compaction-handoff-20260922, master-plan-20261006, pages-empty-before, performance-stream-attribution, refactor-plans-20260924, specialists-plans-wrapup.

## 7. What this means for grouping

The work cuts across, not down. The busiest shared ground is the screen layer (renderer/chrome), the connection between screens and the engine (the IPC layer), and Chat & transcript, and these are shared by almost every branch because most changes touch what the user sees. MAP's 163 rows are far too fine to read at a glance (the big branches touch 30 to 70 of them) and cover only about a third of the changed lines.

The owner's six systems plus Foundations and Workshop would make the roadmap table much easier to read: nearly every P1/P2 item above sorts cleanly into one, with Chat & agents and Sync & devices carrying the most. They would help the branches a bit less, because the branch work is dominated by cross-cutting UI and speed work (perf, UI consistency audit, workbench) that sits in Foundations or Workshop. The work streams (Integrations & plugins, Harness, UI, Backend & experience, Workflow) fit the branches better: perf-* and ui-consistency-audit are plainly UI or Backend work, specialists-plans is Harness, dev-* and dashboard are Workflow. Suggestion: use the six systems for the roadmap and "what the user gets", and the work streams for branches and sessions, with a short lookup table from MAP rows to a system.
