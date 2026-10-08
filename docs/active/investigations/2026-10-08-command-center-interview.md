---
status: draft
date: 2026-10-08
type: investigation
topic: master-plan
---

# Command center — interview record (2026-10-07/08)

Destin's answers, in his words where they matter. Decisions here supersede the 2026-10-06
mockup and direction draft where they differ. Deck answers:
`docs/active/design/2026-10-06-master-plan/master-plan.questions-2.answers.json`.

## Vision, in his words

- YouCoded is "the core of a new personal open-source era, like an artisan web." Take the
  open-source internet and make it usable by a normal person: one app, curated free tools
  (office editors, finance, smart home), agentic setup instead of coding, "an app that is
  yours… kind of a cross-platform OS… your own personal cloud."
- The **marketplace** is "the core of this entire thing" eventually. **Pages** are "the most
  significant part of the app"; the pillar is **customization**: build from scratch or pull
  in any open-source project and make it fit YouCoded's theme, agents and files.
- Systems as he lists them: chat & agents (the core today, "still feels like a chatbot web
  UI"), marketplace, social (games now; later open media, own feed algorithms, DMs),
  projects (most useful unit today; in tension with agents/instructions/tools as reusable
  units — **he wants to think the organizing units through himself, with questions, later**),
  sync → mesh (sync works; mesh = autonomous agents run on whichever device is awake), pages.
- Work streams as he thinks in them: integrations & plugins (overlaps marketplace), harness
  engineering (local models, clouds, token efficiency, evals, workflows), UI (its own side of
  the coin; wants UI agents with the design guides), backend & experience, workflow
  engineering (dev tooling, evals, this surface). Sync is "something I do in between."

## The daily problem

- Runs ~8 agents at once. Can't see what's active, what's blocked waiting on another
  feature, what's safe to resume. "If something is waiting, it only lives in that conversation."
- Starts sessions by prompting; sometimes "check the roadmap, what's open" and picks by hand.
- Wants a true visualization of systems and the seams between them, tied to the real code,
  "both overlaid": as-is from code, vision dashed; boxes green when ready, grey in flight;
  hover shows the code; lines are the seams "in idea terms and in actual code terms."
- Increased autonomy is a **follow-up**; this round is organization only.

## The morning briefing (his list, in order)

1. Branches reviewed and mergeable, sitting there.
2. Merged work whose branches/worktrees can be cleaned up, local and remote.
3. Major bugs hurting users, to merge immediately.
4. Everything changed since the last release and last pre-release.
5. Active feature work and active plans, with when he last touched each.
6. Recommendation for what to pick up next, by most value for effort.
7. For that item: how it links to other items, seams to introduce, what must be configurable.

Users today: him and a handful of friends. Releases are vibes: finish the pile → pre-release
→ wait for bugs → release. "Major" is his call.

## Gallery

Not a deck: a scrollable gallery of every screen from latest master, side by side, with a
history of what each merged change altered. Selecting screens can generate a deck for
comments. For catching breakage and inconsistency.

## Kill list (what makes him stop opening it)

- Anything that drifts or that he must maintain. Must be generated, always current with code.
- Too much information; the same thing stated twice in one frame.
- Offering housekeeping that should happen automatically at session start/end.
- Raising an issue without its context. Jargon.
- Non-actionable states: "everything you bring to my attention should also have a button."

## Deck round 2 decisions (2026-10-07)

- Decisions served: next, waiting on me, overlap, drift, ready. Opened at session start and weekly.
- Active = touched in the last 7 days. Completed = merged. Unsorted items allowed, as an inbox.
- Sources: chat/voice, GitHub issues, friends, deck notes.
- Sessions: automatic facts + one written line; **big builds ask him the merge condition,
  recorded in 1–3 sentences per branch.**
- Automatic without asking: done-on-merge, perf report attaches to its build, screenshots
  and decks attach to their build. Priority and goal edits are not automatic.
- Evidence written inline beside every status. Perf compared to the previous run only.
- First version: a generated page opened by path; in-app Page later.
- Roadmap format: "no attachment… fine to completely trash and restart if best."
- September `feat/dev-dashboard` branch: take ideas only, mostly toss it.
- Rejected my five-goal cut of the vision; wants the grouping investigated, not asserted.

## Side notes to file

- Feature idea (his): permanently tie each conversation to a git branch so they can be
  searched and filtered together.
- Branch count correction: ~10 branches with real recent work, ~17 old leftovers with
  1–5 commits, the rest empty worktree shells. Shells are a cleanup chore, not work.

## Open

- Which grouping of systems/subsystems is "most logical/efficient/consistent/useful" —
  under investigation: `2026-10-08-system-map-groupings.md`, `2026-10-08-work-on-subsystems.md`.
