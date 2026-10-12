# Current recommendations (session 3, 2026-10-12) — the thing to critique

Written by the current assistant for Destin after three sessions. Everything below is a proposal, not a decision. Destin has said he still feels confused and that the assistant is "missing some of what I'm trying to communicate"; take that seriously.

## What the app is, and how it is run today

YouCoded is an open-source assistant app for desktop (Electron), Android and the browser. Today its center is chat with any model, cloud or local. Around that: projects, which are folders holding instructions, conversations and Pages. Pages, which are small themed sandboxed apps inside the app (money page, smart-home page, document editors). A marketplace of skills, plugins, themes and Pages. Social (friends and games). Sync, so a chat started on one device continues on another. The vision past that: agents as reusable building blocks, agents attached to Pages running in the background, mesh so work runs on whichever device is on, forking and publishing Pages, the marketplace as the front door to the free open-source web for normal people, "GitHub for normies", an "artisan web".

It is managed by one person (non-developer) talking to about eight AI coding sessions at a time. The knowledge of the app lives in files agents read on demand: a subsystem index (docs/MAP.md), rules files, a roadmap of ~140 prose entries in bundles, ~180 active specs/plans/handoffs/investigations, an archive, a wrap-up ledger, hundreds of saved review-deck answers, speed reports, session records. The state of the work lives in git: worktrees, branches, merges. Releases are cut by a skill when things feel finished.

What is missing is any place where Destin sees it. Every "where do we stand" is re-derived by an agent, at cost, with a different answer each time. Each conversation is an island, so postponed work disappears. The roadmap records what, never who asked, when, or how. There is no picture of the app, no gallery of its screens, no history of what each merge changed. Destin understands the app entirely through what agents tell him.

## What Destin has asked for (from his words)

A new master plan and a better way to track plans and bugs. A big picture he can see. A real picture of the systems and the seams between them, tied to the code, "a web of boxes", green when ready, grey while in progress, hover shows the code, lines explain each seam in idea terms and code terms. A way to keep track of eight agents. A start-of-session briefing in his order (branches ready to merge; leftovers to clean up; major bugs hurting users; what changed since the last release and pre-release; active work and when he last touched it; one value-for-effort recommendation and how it connects and where it must be configurable). A review gallery of every screen from latest main, with history of what each merge changed and comments. Bugs and requests with who, when, how often and how reported. Self-maintaining, jargon-free, every item with a button. Multiple lenses on the same facts (screens nesting; long-term vision; where the model is called and which screens shape its context; where marketplace skills/plugins are used; tooling vs feature vs bug). Each conversation tied to a branch. Help thinking through how projects, agents and reusable instructions should fit together — he wants to think this through himself with questions asked of him. Interest in Lean-style verification. He rejected: a 124-part grid, four map shapes, three whole-page concepts ("ai slop… a ton of text, numbers… meaningless without a LOT of external context… graphics/map feel more contrived than genuinely useful"), a "vision rings" idea, and found all word-sketches "hard to see how these translate into the real app".

Decisions already made by Destin (keep unless he reopens): scope is organizing only, autonomy later. Active = touched in last 7 days. Completed = merged. Unsorted allowed, shown as inbox. Each status shows its evidence. Speed results compared only with previous run. Merging marks done; speed and screenshots attach to their build without asking. Big features: every session asks for a 1–3 sentence merge condition. First version: a generated page opened by file path; in-app Page later. Community issues via GitHub. Public roadmap is an approved snapshot, update by update. Parts can belong to more than one system. This is solely his tool for building YouCoded, possibly reshaped for other projects later.

## The proposed system: four layers

**1. One ledger of facts, generated, never typed.** Scripts read git, worktrees, session records, the chat index, screenshot runs, speed reports, deck answers, GitHub issues and releases, and write one plain data file. Runs at session start, on every merge, on every release. Nothing maintained by hand.

**2. One unit of work: ticket, branch, conversation and worktree are the same thing.** Each piece of work is one small file in the repo holding what, why in Destin's words, who asked and how, the merge condition, links to branch and conversation. Status is derived: branch with commits = in progress; merged = done; seven quiet days = stale; no branch = not started. Agents create/update these as a side effect of working via existing session-start and wrap-up steps. The old roadmap migrates into them once. (Shape borrowed from Backlog.md / Beads; checker already exists.)

**3. Views, each reading the ledger.** Opened by path first, in-app Page later.
- Briefing: Destin's list in his order, each line a work unit with its button.
- Work board: every unit by status, newest first, plus inbox; click → conversation, branch, screens.
- Screens: every screen captured on every merge by the existing screenshot tool; wall of latest, picker for older builds, before/after with change highlighted, comment becomes a work unit with Destin as source. (Argos as model.)
- Map: backbone is an exact dependency picture of the code drawn by a no-AI tool (dependency-cruiser), rolled up into ~10 parts a user would name; parts colored by status of work units touching them; hover shows files and an AI-written plain-language explanation clearly marked as such; lenses are traces ("where is the model called", "where do plugins get used") found by searching code. The earlier session's 614 classification rules (124 parts, 8 systems, 5 layers) are reusable as the roll-up.
- Releases: what merged since last release/pre-release, speed vs previous run.
- Vision: Destin's sentences each linked to the units pushing toward it. Not yet right; build the rest first.

**4. Automatic steps, organizing only.** Session start injects the briefing and asks the merge condition for big work. Wrap-up updates the unit. Merge captures screens and speed and attaches them. Release snapshots the public roadmap for approval.

Later: in-app Page with buttons that act; the whole thing as a development-tools marketplace plugin; checked-logic evidence ("every ordering tested") beside a status.

| Piece | Already exists | Build |
|---|---|---|
| Collecting facts | git, session records, chat index, shoot, perf lab, deck answers | collector script |
| Work units | roadmap checker, wrap-up and session-start steps | file format, migration, hooks |
| Briefing and board | workspace-start report | the pages |
| Screens | shoot captures every screen | history store, gallery, comment-to-unit |
| Map | dependency-cruiser, subsystem index, earlier classification rules | roll-up, render, lenses |
| Releases | release skill, changelog, perf reports | the view |

Stated priority: layer 2 with the briefing on top, first. The map is the least certain piece. The projects/agents/instructions question is product design the map can only display once decided.

## Known weaknesses the author admits
- The map and vision have failed three times across sessions; the author doesn't have a clear picture either.
- A page opened by path can only show links and hand over prompts, not act; Destin wants a button on everything.
- "Self-maintaining" is true for branches/screens/releases, not for linking vision sentences to work or recording who asked for a bug and how.
- Possibly two different products are being called one thing: an operations tool (what's ready, waiting, changed, next) and an understanding tool (how the app fits together, where it's going).
- Destin says the author is still missing something he is trying to communicate.
