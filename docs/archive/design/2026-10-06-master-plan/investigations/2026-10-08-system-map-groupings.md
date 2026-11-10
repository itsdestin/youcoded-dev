---
status: draft
date: 2026-10-08
type: investigation
topic: master-plan
---

# Three ways to group YouCoded's systems on the map

Pictures, numbers and the regeneration steps: `docs/active/design/2026-10-06-master-plan/map/` (`graph.json`, `README.md`).

## Method
1. Read the 68 rows of the `docs/MAP.md` subsystem table and the file paths in each row's Entry points.
2. Listed the 1,247 desktop source files (`youcoded/desktop/src`, `.ts/.tsx`, no tests; 303,087 lines) and every import between them. Android is not included.
3. Gave each file to the MAP row with the longest matching path; the rest became "unclaimed" nodes by folder (or by file-name prefix for loose files).
4. Counted file-to-file imports between nodes (124 nodes, 1,061 node pairs).
5. Grouped the nodes three ways and counted how many imports stay inside a group.

## Coverage gap
MAP rows claim 484 of 1,247 files (39%). **763 files (61%), 138,452 lines (46%), belong to no MAP row.** Biggest gaps (files / lines):
- 92 / 20,871: loose files at the top of `renderer/components/` (dialogs, settings, chat bits of every kind)
- 79 / 13,433: `main/harness/` (the MAP row for the native runtime names only 14 of them)
- 59 / 8,260: loose files at the top of `main/`
- 53 / 5,910: `renderer/hooks/` (every `use-*` hook)
- 53 / 4,232: `shared/` loose files
- 38 / 4,911: `renderer/components/artifact-views/`
- 33 / 5,349: `renderer/state/` loose files
- 21 / 4,918: `renderer/components/marketplace/`; 19 / 5,937: `renderer/components/project-view/`
- 16 / 2,172: `main/office/`; 14 / 4,229: `main/conversations/`; 14 / 3,419: `renderer/components/game/`
Also: 13 MAP rows have no desktop source file at all (dev tooling, workers, Android, archive). Caveat: the Roadmap-style "depth doc" rows may cover these folders in prose; the table's Entry points do not.

## The three groupings
Numbers are file imports that cross between nodes. "Inside" = both ends in the same group.

| | Groups | Inside | Across | Share inside |
|---|---|---|---|---|
| A. Code-derived (Louvain) | 6 | 2,140 | 988 | 68.4% |
| B. Owner's systems (+ Foundations, Workshop) | 8 | 1,375 | 1,753 | 44.0% |
| C. Work streams | 5 | 1,816 | 1,312 | 58.1% |

A has fewest groups and is built to maximise this number, so it is a ceiling, not a rival to beat.

**A. Code-derived.** Six clusters, named by largest members: (1) screens: renderer components + UI Workbench (520 files); (2) plumbing: IPC bridge + main loose files, chat store, sync, sign-ins (357 files); (3) files: Document comments + artifact views, Office, Pages (179); (4) agent brain: main/harness + native runtime, permissions, specialists (160); (5) games (31); (6) 13 rows with no code links (dev tools, workers). It shows that Pages, Office and Artifacts hang together, and that the harness is a tight island. It splits "chat" in two (screens vs plumbing).

**B. Owner's systems.** Foundations 538 files, Chat & agents 309, Projects & files 178, Workshop 70 (no desktop code), Sync & devices 67, Marketplace 33, Social 31, Pages 21. Low score because Foundations (renderer chrome, IPC bridge, loose files) is imported by everything; 672 imports run Chat <-> Foundations.

**C. Work streams.** UI 462 files, Backend & experience 423, Harness engineering 194, Integrations & plugins 104, Workflow engineering 64. Keeps the three real code layers (screens, plumbing, agent brain) intact. Weakness: files features (comments, artifacts, git) have no stream and fell into Backend.

## Hard to place (B / C), with why
- Document comments, Artifact viewer: Projects & files / Backend. Files has no work stream.
- Office: Projects / Integrations (separate add-on, but a file feature to users). Pages: Pages / Integrations.
- Games arcade: Social / Backend. App telemetry, In-app updates, Android runtime: Foundations / Backend.
- Claude Code hooks: Foundations / Integrations. Archived youcoded-core, Website analytics: Workshop.
- Three sign-in rows (ChatGPT, OpenRouter, Claude Code): Chat / Integrations. Providers folder: Chat / Harness (connection or brain?).
- Conversation handoff, resume screens: Sync / Backend (chat or devices?). Conversation store: Foundations / Backend but it is chat data.
- Chat & transcript, Status push: Chat / Backend (screen code that holds conversation data).
- Claude Code prompts, Status bar, Voice, Multi-window detach: Chat or Foundations / UI.
- Harness evaluator, Luna rig: Workshop / Harness or Workflow (dev tools whose subject is the harness).
- Buddy window, session tags, Desktop packaging, development popups (bug report): one-line judgment calls, see `graph.json` -> `hard` (39 items in all).
- The big loose piles (92 components, 59 main files, 53 hooks, 53 shared, 33 state) were assigned wholesale to Foundations (B) and UI/Backend (C); that is a guess until they are split.

## Heaviest seams (imports)
- A: screens <> plumbing 384 (IPC bridge -> Remote access 18; components -> shared 17); screens <> files 200 (Document comments -> UI primitives 12); plumbing <> agent brain 128 (runtime -> harness 10).
- B: Chat & agents <> Foundations 672 (chat store 13, IPC bridge 12); Foundations <> Projects & files 270 (project view -> UI primitives 20; IPC -> main/artifacts 17); Foundations <> Sync & devices 213 (IPC -> Remote access 18).
- C: Backend <> UI 536 (components -> shared 17, -> Remote access 16, -> chat store 13); Backend <> Harness 203 (runtime -> harness 10); Backend <> Integrations 147 (marketplace UI -> shared 12).

## Recommendation (plain words)
Use grouping C (the work streams) as the main map, and add "Projects & files" as a sixth stream. It matches how the code is really wired better than your six systems do (58% vs 44% of connections stay inside a group), and it matches how work is actually divided: screens, behind-the-scenes, the assistant's brain, connections, and workshop tools. Your six systems (grouping B) are what users see, and that is useful as a second layer on top: label each stream's boxes with which system they serve. B scores low mostly because "Foundations" is a catch-all that everything touches, so keep it but treat it as the floor under the other systems, not a peer. Before drawing the final picture, someone should split the five big unclaimed piles (loose components, harness folder, loose main files, hooks, shared), because 61% of the code currently has no home in the MAP and any grouping places those files by guess.
