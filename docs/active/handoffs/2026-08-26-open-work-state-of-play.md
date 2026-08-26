---
status: active
created: 2026-08-26
kind: state-of-play
---

# Open work — state of play, 2026-08-26

Every open thread in the workspace, reviewed one workstream at a time: 16 feature
branches, 12 open pull requests, 75 living documents, and the last three weeks of
conversations. Fourteen reviewers checked each claim against a command they ran;
where a doc disagreed with the code, the code won.

**This replaces the first draft of this file, which was wrong in four places.**
Those corrections are marked ⚠ below, because each one was the kind of mistake
that comes from trusting a document instead of checking.

---

## 1. The three things that could actually be lost

Nothing else on this page is urgent. These are.

**107 commits exist on this laptop and nowhere else.** Twelve branches have never
been pushed to GitHub: the specialists work (47 commits), the deliverables card
(24), past-conversation references (18), project descriptions (13), and four
smaller ones. A disk failure loses all of it. Pushing is one command per branch
and changes nothing else.

**The session-context panel exists only as unsaved files.** 658 lines across 12
files, including two brand-new components, on a branch with *zero* commits. A
reviewer read every line: it is coherent, complete, and safe to commit. The layout
was approved by eye and never written down, so losing it costs a full re-design
round with you. **Your own cleanup rule is what would destroy it** — `CLAUDE.md`
tells sessions to remove a worktree after merging, and that command erases this.

**The assistant-settings mockup is untracked in the main folder.** Two files,
33 KB, no copy in git history, plus four edited files that must move with them or
it won't open. It also sits in the main checkout rather than a worktree, which is
exactly what the worktree rule exists to prevent.

---

## 2. Decisions only you can make

Ordered by how long they've been waiting.

| Waiting since | Decision |
|---|---|
| **2026-08-16** | **A safety question you never saw.** The session hit your weekly limit mid-sentence. In auto-edit mode, hiring a helper agent skips *both* protections the specialists work built for it — so a helper defined inside someone else's repo could run shell commands unprompted. Ship it and track it, or exclude file-defined helpers from auto-edit? **This blocks the specialists merge.** |
| **2026-08-26** | **The deliverables card's memory blocker.** ⚠ A dev instance on that branch grew to 2.78 GB in 73 minutes and was killed. Compare against a plain-master instance, or dig into what's holding memory? |
| **2026-08-06** | **Two UI tweaks on project descriptions** — the New Conversation button moved, the description box became auto-sizing. You were asked to look; the work has been finished and idle for twenty days since. |
| **2026-08-16** | **The dual-model crash.** Should the app auto-unload, warn, or hard-block when two models won't fit — and is a single model capped? Explicitly flagged "do not guess." Still unfixed. |
| **2026-07-28** | **"Ask about this."** You called it *"janky af for the artifact viewer."* The branch is complete and tested; resuming means deciding whether to rework or rewrite the overlay. |
| now | **Phase B of the UI review** — three items, each with an "approve the measured part only" option, which means reverting the taste half before merge. Plus two questions raised and unanswered. |
| **v1.3 gate** | **Did you ever sign in to GitHub from inside the app?** Sync works either way, because a terminal login satisfies it. Check Account → Connected accounts: a login you did in YouCoded closes the gate; empty or terminal-only means it never passed. |
| **v1.3 gate** | **The perf lab is dispatched to your other Linux machine**, and two files it needs exist only here. |

---

## 3. Ready to merge, or nearly

**Window resize (black bars + lag)** — the most merge-ready work in the workspace.
Zero conflicts, zero drift, tests green. Needs you to drag a window edge once.
Currently has no pull request and **has never been pushed**.

**Project descriptions** — all nine tasks done, tests green, one trivial conflict.
Waiting only on the two tweaks in §2.

**UI Phase B** — merges clean, 0 behind. Waiting on your per-item decision.

**Deliverables card** — code complete through Task 9, one trivial conflict, but
see the memory blocker above.

**Search timeout** (the fix for that 181-second hang) — reviewed, corrected, no
human gate, no dependency. **Just needs scheduling.** Nothing built yet.

---

## 4. Blocked on real work

**Specialists plan 1c** — 47 commits, 89 behind, 4 conflicts (all fixture/doc
files). Nothing has been tested: all 15 checks in its testing checklist are blank.
Three of its four folders are redundant — their work is already inside the fourth.
Four files were edited on 2026-08-16 and never committed, one of which fixes a
real bug (Settings → "Open folder" always showed a blank error box).

**Permission ask timeout (PR #278)** — ⚠ I first called this "the cheapest win."
It is not. GitHub reports it **conflicting**: 663 commits behind, 8 files, two of
them badly — August's full-auto work rebuilt the same permission card this branch
extends. It has also **never been reviewed by anyone**.

**Session-switch animation** — worse than drift. A change from 2026-08-06 takes
hidden panes out of rendering, which likely breaks the mechanism the animation
depends on. That's a design problem, not a merge problem.

**Past-conversation references** — in flight right now. 11 of 18 tasks remain and
none of the backend exists.

---

## 5. What the workspace was saying that wasn't true

This is the part worth reading twice. A wrong document is worse than a missing one.

**Your self-check is broken.** The reminder that should warn you when documentation
goes stale reads the wrong file — it reports **41 days** and stays quiet when the
true figure is **125 days**. Both of its warning paths are dead. That is why none
of what follows ever surfaced.

**The design guide states a rule you rejected.** `CLAUDE.md` tells every session
that guide is the standard for new work. It says light and creme themes move the
user bubble off solid black — you rejected that on 2026-08-25. Four more rules in
it describe things only proposed, never built, written as current fact.

**A data-corruption bug is recorded as fixed and isn't.** When you connect your
phone, new messages can take IDs that collide with loaded ones, and **your oldest
reply visibly turns into a copy of your newest**. The July fix covered one of
three ID types. Two-line fix; the doc said it was done.

**A shipping tooltip promises safety the app doesn't provide.** The Skip
Permissions explainer tells users Claude will still stop before the truly risky
things. Measured against the real tool: it read `.env`, wrote outside the project,
wrote to `.git/config`, wrote to the home folder — no prompt for any of them.

**Your daily CI has been red since 2026-08-16** — not from real drift, but because
the specialists branch's doc checks point at files that only exist on that branch.
It clears on merge; until then it can't tell you about anything else.

**Every plan reads as untouched.** Not one has ticked a single checkbox, while the
work behind it is finished. A fresh session following any of them would rebuild
code that already exists. Now corrected with dated status blocks.

Smaller ones, all now fixed in place: a settled 24h-vs-2h decision still written
as open; two plan steps editing a function deleted on 2026-08-22; a coverage figure
stale in three places including `docs/MAP.md`; an audit evidence file deleted by an
unrelated cleanup commit while two docs still cite it; a claim that specialists
plan 1c is "not yet written" when it has a 78 KB plan and four folders of code.

⚠ **And one of mine.** I said `feat/opencode-mvp` was "26 commits of mystery." It
is documented in six places including two formal decision records, and its own tip
carries a file titled "ARCHIVED — do not merge." It was an experiment in running a
third-party tool for local models, deliberately closed when you chose to build your
own; the salvageable parts shipped in July. Nothing is outstanding — tag it before
deleting the branch so the commits stay reachable.

---

## 6. Housekeeping

- **Five worktrees can go**: three specialists folders (already contained in the
  fourth), one empty, and the context-truncation one **after** its work is committed.
- **Two remote branches** are merged and deletable; one draft PR titled
  "DO NOT MERGE" should be closed — but a small Linux window-sizing fix is
  **trapped on that branch** and would die with it.
- **All 8 dependency updates are failing checks.** None is safe to merge. One
  labelled "minor patch" carries a three-version Kotlin jump.
- **`bowling.html` was deleted and it's cited by a filed bug as evidence.** The
  deletion isn't staged and looks accidental; one command restores it.
- **Strays worth keeping**: `flappy-bird/play.html` is live evidence for a filed
  bug, and the feature fact sheet (36 KB) is a real deliverable — both untracked.
  The four colour/grid test pages are leftovers and safe to delete.
- **`/audit` has not really run in 125 days.** The rolling-cleanup rule in the
  roadmap's own header has **never once been executed**.
- **The roadmap now holds 206 open items** (was 176 — this review added 30 for
  work that existed with nothing tracking it).

---

## 7. If you only do three things

1. **Push everything, and commit the two unsaved piles.** One afternoon's worth of
   risk removed permanently.
2. **Answer the specialists safety question.** It is the only unanswered item with
   a security dimension, and it blocks 47 commits.
3. **Drag a window edge** and merge the resize fix — the one piece of work that is
   genuinely finished and costs you thirty seconds.
