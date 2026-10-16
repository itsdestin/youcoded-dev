# Independent review: the YouCoded vision and management surface

Reviewer: a fresh session that read all of your words, the proposal, the repo facts, the tools survey and the Lean notes.

## The short version

The proposal is a good **operations tool** (what's ready, running, changed). It's weak on what you keep circling back to: **understanding how YouCoded is built from reusable parts, so you can design it better.** It sets aside "where are those subcomponents shared" as something to display later. I think it's the heart of your ask.

I recommend:
- Collapse six views into **two places**: **Today** (what needs you) and **The App** (every screen, grouped the way a user would name it, with questions you can ask of it).
- Build the map out of **real screenshots and the app's real building blocks**, not boxes drawn from code.
- Turn your projects/agents/instructions puzzle into a short list of questions you answer.

---

## A. What the proposal misses

**1. You want a design tool, not only a status board.** Your strongest passages are about how the parts fit together:
> "I just think we need different ways to group and associate all of our various app elements."
> "How do agents interact with projects? How do agents interact with pages?... What are the subcomponents of an agent? And where are those subcomponents shared with other major systems... help me both reduce duplication and... plan better."

That's a question about **building blocks** (model, instructions, tools, permissions, files): where each shows up, and where the same thing is built twice. The proposal answers with a chart of code-file wiring. It doesn't show that a chat, a Specialist and a future Page-agent are made of the same ingredients, which is the picture you're describing.

**2. Your "map questions" are questions, not a map.**
> "where... our native harness/model apis are actually called. which screens configure the context... where do marketplace skills/plugins get utilized... what is dev tooling vs. feature buildouts vs. bugs?"

Pick a question, watch the matching **screens** light up. You said "hard to see how these translate into the real app" and "a normie should be able to glance at this and go 'ahh, gotcha'". The real app is its screens.

**3. Screens should be the backbone, not one view among six.** You asked for "a single ui review surface, always taken from latest master... every settings menu, page, etc... a diff view/history". It's the most concrete thing you've described, and almost free: the screenshot tool already knows 216 named screens and fails loudly when one breaks. A map made of real screens can't drift or look like "ai slop".

**4. You think in experiences and work streams, not code layers.**
> "I don't really group it by backend work, I feel I mostly group it by like user experience."

You named your own work streams: plugins and integrations / marketplace; harness engineering; UI ("its own separate side of the coin"); workflow engineering.

The proposal reuses the earlier 124 parts / 8 systems / 5 layers, the grid you called "really really bad". Group work by your four streams; group screens by the app's places (Chat, Projects, Pages…).

**5. Vision is a check on each item, not a page.** You called the vision interface "absolutely useless", but want to "always be aware" of "maximum personalization and configurability". So the vision belongs beside each item ("does this make the app more yours?").

**6. This surface is itself an instance of your vision.** You described "my finance page might have agents that run in its config to just like update it" and "page tools". A management page an agent keeps current, with buttons that start chats, has that exact shape. Not "the first real feature" (you rightly rejected that), but building it forces the Page + agent + tools questions you want to think through anyway. The proposal treats the in-app Page as an afterthought, yet your "button on everything" rule can only be met in the app.

**7. You said "too strict" twice; the proposal still is.**
> "I think you're taking some of what I've said so far a little too strictly."
> "this was a very loose outline by me earlier."

The "web of boxes" was a loose sketch; the proposal still builds it literally.

---

## B. Simplify, improve, reorganize

**Drop the four-layer framing from anything you see.** Layers 1 and 4 are plumbing for agents. You should see two places:

| Proposal's view | My verdict |
|---|---|
| Briefing | **Keep.** Becomes "Today". |
| Work board | **Merge into Today** with a "show everything" filter; a separate board repeats items. |
| Releases | **Merge into Today.** One section: "Since the last release." |
| Screens | **Promote.** Becomes "The App", the main understanding tool. |
| Map | **Replace** with questions that highlight real screens, plus one "building blocks" picture. Code graph is for agents. |
| Vision | **Cut as a page.** Becomes tags on items. |
| Public roadmap snapshot | **Defer.** Nobody outside asked for it yet. |

**Keep the best idea in the proposal:** one piece of work = one conversation + one branch + one merge goal in your words. That fixes "if something is waiting, it only lives in that conversation." Your side note (tie each conversation to a branch) should become a feature for every user.

**Reorder the build.**
1. Today, from real data.
2. The App gallery from the existing screenshot tool.
3. The building-blocks picture, after you've answered the questions in section C.

The proposal starts with a file format and migrating 143 roadmap entries: weeks of plumbing before you see anything, which is how the last three tries failed.

**Don't migrate the old roadmap in one go.** New items use the new shape; old entries sit in an "older backlog" inbox and an agent converts each when it's picked up.

---

## C. The units

There's one tree for **what the app is**. Work, bugs, decisions and evidence all attach to points on that tree. Tags: **[user]** = a user would name it; **[dev]** = developer-only; **[vision]** = doesn't exist yet.

**1. Mission** [user]. One sentence only you can write, like "An app that is yours: your tools, your data, your choice of AI, built and shared with everyone."

**2. Promises.** Tags, not branches: you rejected the "five goals" tree and asked "why can we not tag as relevant to both?" Each item can carry several: *Yours to shape · Any model, no lock-in · Free tools from the open web, curated · Everywhere you are · Together (share, fork, play) · Works for you while you're away.*

**3. Places** [user]: Chat, Projects, Pages, Marketplace, Files and documents (Office), Social (friends, games), Settings, Devices and sync. Vision only: Agents & Automations, Mesh, Feeds (Fediverse, wrapped social apps).

**4. Screens** [user]. The ~216 named screens the screenshot tool already knows, each belonging to one or more Places. Fully generated.

**5. Building blocks** [mostly dev today; user-facing in the vision]. These are what your "harness elements" question is really about. Every Place is assembled from them:
- **Model** (provider, model picker) · **Instructions** (project files, rules, memory) · **Skills and commands** · **Tools** (built-in, MCP servers; vision: page tools) · **Permissions** (mode, always-allow grants, Full Auto stops) · **Hooks** · **Context** (what the assistant was given, which folder) · **Connections and accounts** (Plaid, Home Assistant, sign-ins) · **Theme**
- **Saved recipes**: today, Specialists (prompt + tools + read/write rule + model preference), the closest thing to an "agent".
- **Bundles**: a plugin packages skills, hooks, commands, agents, MCP servers; a marketplace listing is a published bundle.
- **Device** [vision]. Mesh makes "which computer runs this" a block.

**6. Code areas** [dev]. The ~70 rows of the workspace map, each pointing at files, for agents. Generated links: code area → screens → blocks.

Read this way:
- **A conversation** = Model + Instructions + Tools + Permissions + Context, run in a folder.
- **A Specialist** = the same ingredients, saved and reusable.
- **A Project** = a folder that sets defaults and holds Pages and conversations.
- **A Page** = screen + data + connections, with no blocks of its own yet. That's why "page tools" and "page agents" feel missing.

**The questions only you can answer** (projects vs agents vs reusable instructions):
1. Is every chat "an agent", or is "agent" only the saved, reusable recipe?
2. When a project and an agent disagree about model, instructions or permissions, which one wins?
3. Can one agent work across several projects? Can one project hold several agents?
4. Where does a background agent belong: to a Page, a Project, or neither?
5. When someone shares or forks a Page in the marketplace, do its agent and tools come with it?
6. When instructions are reused, are they **shared** (edit once, everywhere updates) or **copied** (each copy drifts, fork-style)?
7. Do permissions belong to the agent, the project, or the device?
8. Should everyday users ever see the word "agent", or a friendlier word?

**My leaning:**
- An agent is a **saved recipe** of building blocks plus an optional schedule.
- A project is a **place with defaults**; the recipe wins only where it says something explicitly.
- Instructions, tools and permissions are blocks that either one can carry.
- A Page can **hold** recipes, which is how "finance page with its own updater agent" happens.
- Reused instructions are shared by default, with a "make my own copy" button. That's your fork model.

---

## D. How it all connects

**The single organizing idea: every part of the app has one name, and everything else points at a name.**

Every work item, bug, screenshot, speed result, decision and release note attaches to names on the tree above. Today and The App are two ways of reading the same pile.

**Generated from code (never typed):**
- the screen list and screenshots per merge
- which code area each screen and block lives in (the earlier link-finder does most of this)
- where the model is called, where plugins load, where permissions are checked 
- branches, worktrees, merges, releases, speed results, GitHub issues
- **which places a branch touches**, worked out from the files it changed (no agent judgement needed)
- "stale" flags when a screen's code changed since its picture or description

**Kept by agents as a side effect of working:**
- a plain one-sentence description of each Place, screen and block, re-checked only when its code changes
- who asked for a bug, when and how, recorded when it's filed
- the merge goal, which the agent **asks you for** at the start of big work
- a "waiting on X" note when work is paused

**Only you supply:** the mission sentence, answers to the eight questions, merge goals, yes/no on priorities and merges, comments on screens.

**Adopt or build:**
- **Adopt the ideas, not the apps**: Backlog.md/Beads (one file per item), Argos (screen history), Vibe Kanban (a row per agent). Their screens won't look like YouCoded.
- **Reuse what you already have:** the screenshot tool, workbench screens, review-deck answers, perf lab, session records, chat search, and the earlier session's link-finder (`scripts/command-center/derive-edges.mjs`).
- **Skip for now:** GitNexus (unclear license), DeepWiki-style AI-written wikis (they drift and sound confident when wrong), dependency-cruiser drawings for you (fine for agents).
- **Lean:** no. Later and separately: random-input tests on sync and session switching.

---

## E. The first thing you should see

A YouCoded Page in your theme, with today's real data, not a sketch. Two tabs.

### Tab 1: "Today"

Example rows below are illustrative (the bug is invented); real rows come from the data. No counts. Each row says what users will experience, why it's here, and has buttons. Nothing appears twice.

**Needs you**
- Row: *"Specialists can show their plan before acting." Finished Oct 8, all checks passed, waiting for your OK.* Next to it: a small before/after thumbnail.
  - **See what changed** opens before/after screens.
  - **Merge** opens that work's own conversation with "Destin approves merging" already typed.
  - **Not yet** asks why; the answer becomes the "waiting on" note.
- A friend's bug row: *"Chat froze when switching tabs" — reported by tjmorin on GitHub, Oct 5. Two other reports look the same.*
  - **Read report**
  - **Start a fix**: a new conversation, pre-filled.

**In progress**
- One row per piece of work: your 1–3 sentence merge goal, "last worked on 2 days ago", place chips (Chat, Pages) whose hover says what's touched and whether it's UI or behind-the-scenes, and the newest screenshot.
- Buttons: **Resume** (opens its conversation), **Pause**.

**Waiting**
- Parked work with its reason: *"Waiting on: Specialists plan screen merging."*
- Button: **Resume**, which lights up when the blocker merges.

**Since the last release (v1.3.0, Sept 20)**
- What users will notice, by place, each linking to its before/after.
- One button: **Start pre-release**, or a greyed-out version that says why ("2 things still in progress").

**Suggested next**
- One recommendation: why it's the best value for effort, which places it touches and connects to, what should be configurable, which promise it serves.
- Buttons: **Start it**, **Other options**.

**Not shown:** cleanup of finished branches; that happens automatically at session start and end.

### Tab 2: "The App"

- A scrolling wall of real screenshots from the latest main build, grouped under Places (Chat, Projects, Pages, Marketplace…).
- At the top, a **"Show me…"** picker of plain questions (Where does the app talk to the AI? Where do marketplace add-ons show up? What changes how the assistant behaves? What's being worked on? What changed since the release? Bugs vs tooling vs features). Picking one lights up matching screens and dims the rest.
- Clicking a screen opens a side panel: one plain sentence about it, the building blocks it uses, work touching it, a strip of past versions (one per merge), **Comment** (lands in Today's inbox as from you) and **Ask about this** (a chat already pointed at that screen's code).
- At the bottom, the **Building blocks** picture: blocks down the side, places across the top, a dot where a place uses a block. Duplication shows up here ("permissions are set three different ways"). Build it after you answer section C's questions.

**How you'll know it's right:** after a week of opening it at session start, you've stopped asking agents "where do we stand", and the weekly look at The App told you something new.

---

## F. Risks, and what I'd refuse to build

**Risks**
- **Buttons that do nothing.** A Page can't start a conversation today; that small ability needs adding (useful to every user). Until then, a button says honestly what it does, e.g. "copy this request".
- **Descriptions drifting.** AI-written sentences are marked as such and flagged when their code changes.
- **Screenshot cost.** One theme per merge, all themes before a release.
- **Leaking into the product.** Your agent/project answers shape the real app for everyone. Treat them as product decisions, not a dev-tool side effect.
- **A ninth thing to babysit.** If it asks you to maintain it, it failed.

**What I'd refuse:** a hand-kept vision page; health scores and counts without meaning; the 124-part grid; a code-file graph as your main view; an AI-written wiki treated as truth; an automatic public roadmap; Lean, for now; migrating the whole roadmap before the new views prove useful.
