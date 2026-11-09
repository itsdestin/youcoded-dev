---
date: 2026-10-24
status: active
type: handoff
topic: specialists and plans — the one current picture and the one remaining-work list
supersedes:
  - docs/archive/handoffs/2026-09-04-specialists-stage-two-START-HERE.md
  - docs/archive/handoffs/2026-09-04-stage-two-decisions-prompt.md
  - "branch docs/specialists-plans-decisions: docs/active/handoffs/2026-09-19-specialists-plans-START-HERE.md"
---

# Specialists and plans — start here (2026-10-24)

This replaces every earlier "start here" for this work. Everything below was checked on
2026-10-24 against `origin/master`, the unmerged branches, and the past conversations.
**Card #74 is the one live work item; this file is its full list.**

## 1. What we set out to build

YouCoded's own assistant (the "YouCoded" engine, not Claude Code) should be able to hand work
to **specialists**: smaller assistant sessions it hires for one job — exploring the project,
researching the web, reviewing work, or building something — so one conversation can split a
big task up, run parts at the same time or in the background, and collect the results.

It was planned in three layers (vision doc `docs/active/specs/2026-09-01-agent-platform-vision-and-state.md`):

1. **Stage one — hiring specialists one at a time.** The assistant decides on its own to hire one.
2. **Stage two — plans.** For a bigger job the assistant writes a **plan** first: a list of steps,
   each run by one or more specialists. You see it as a card, can adjust it, and approve it. The
   app then runs it by itself, shows what it is spending, pauses safely, and picks up where it left
   off after a restart. Settled rules from the start: a plan is a list, never code the assistant
   writes; if a plan goes wrong the assistant writes a new plan instead of a clever one; surviving
   a restart is the headline feature.
3. **Later — Autonomous Assistants.** A third main view where you set up named assistants
   ("my Office assistant") that each own recurring **duties** and run on a schedule. Ruled
   2026-09-05: assistant-made-of-duties, coordinator shape first. A coordinator is basically a
   plan runner on a schedule, which is why it needs plans first. Card #61; not part of this work.

Your end goal for plans, in your words (2026-09-19): *"fully autonomous workflows of different
agents … provide a task at the beginning and get a fully complete output at the end … build a new
feature, and then … different types of reviewers … builders … UX beta testers … and then a final
consolidated PR reviewer … any kind of research task."*

## 2. What is actually done

### Stage one — DONE and in the app (shipped 2026-08-13 → 2026-10-22)

- Four built-in specialists (explorer, researcher, reviewer, worker), plus your own definition
  files in `~/.youcoded/specialists/` and Claude Code's `.claude/agents` files.
- Run in front or in the background; send one a note mid-run; stop it; answer its questions.
- Its approval requests show at the bottom of the chat, light the red dot, and wait with no
  time limit (2026-09-16).
- Automatic model choice per provider so a specialist never silently uses an expensive model
  (2026-09-15); Stop no longer lets a finished one start a reply by itself (2026-09-09).
- Status bar chip and popup; correct status after Stop, resume, restart (2026-10-22, youcoded `916f32b6f` and the background-tracking work).
- Limits today: 4 at once, 30 per conversation (the 31st is refused outright).

### Stage two (plans) — BUILT BUT NEVER MERGED

**The official docs say plans have "no code". That is wrong.** About 140 commits of plans work
exist on the app branch `feat/specialists-plans-ui` (last real work 2026-09-26), with 40 numbered
decisions you made along the way. It was never merged into the app, so nobody can use it.

What that branch does, in user terms:

1. **Propose.** The assistant writes a plan as a card: steps, which specialists, and an
   **estimate** from your own past specialist runs ("Usually $0.40–$2"; or "About 300k tokens ·
   included in your ChatGPT plan / runs on your computer"). Open a step to read the exact brief
   that specialist will get. A plan that is only one specialist doing one thing is refused — that
   should just be a normal hire.
2. **Adjust (optional).** A gear opens **Plan settings**, named after the plan: one optional
   spending limit for the whole plan (off by default) and the model for each step.
3. **Approve.** The assistant replies with one line saying it's underway and that it will
   report back. The card stays at the bottom of the chat until you answer it.
4. **Run.** Steps run in order; a "split" step sends several specialists out at once. A
   "combine" or "check" step reads the reports of the earlier steps it names
   ("← from steps 1, 2 and 3"). The card shows **Spent $X** (or "of $Y") with a Stop button —
   the same number as the chat's cost chip.
5. **Pauses.** Small hiccups retry once by themselves. A sign-in problem pauses with the
   provider's own words and a Continue button (no pointless retry). At your limit:
   "Reached your $X limit." with Stop · Continue (Continue asks for a new total). After an app
   restart, the plan waits for you to press Continue. "Ask the assistant" on a paused card sends
   your question as a normal message.
6. **Finish.** The assistant gets the final reports and presents the result as a normal reply.

How it was checked then: full desktop test suite green, Android tests green (1,023), an
independent dollar-math audit, many design review rounds. **You were shown one final clickable
review deck on 2026-09-26 and it was never answered** (the deck timed out after 4 hours).

### Not started

- Plans stage 2 (a coordinator step that can rewrite later steps; explore-first shared
  background) and stage 3 (builders working in separate copies of the project; saved plans).
- The Claude Code bridge (`youcoded agent run`), so Claude Code chats could use these too.
- Autonomous Assistants (card #61).

## 3. What makes finishing harder now

- **The app moved a lot since 2026-09-26: ~1,430 commits.** A trial merge shows **40 files
  conflict**, including the core engine files the plans code plugs into, the chat screen, and the
  phone/desktop connection layer (which was reorganized). Android was rebuilt to run the desktop
  engine, so the branch's Android edits are against deleted code.
- Upside of that Android rebuild: "Plans aren't available on the phone yet" may now be nearly
  free to lift, since the phone runs the same engine. Needs checking after the catch-up.
- The plans decision log, designs and reviews live only on the unmerged docs branch
  `docs/specialists-plans-decisions`. Your 2026-09-05 rulings (assistant-made-of-duties,
  "Autonomous Assistants", "specialist" as the word) are recorded there but **master's vision doc
  still lists them as undecided**.
- The local copies (worktrees) were deleted 2026-10-21 to free disk space; everything was pushed
  first as "WIP backup" commits, so nothing is lost.

## 4. The remaining-work list (the only one)

**A. Finish plans (stage two, part 1 — the spending rework)**

| # | Item | Who |
|---|---|---|
| A1 | Bring the plans branch up to today's app (merge master in, resolve 40 conflicts, re-wire to the new connection layer and Android shape), then full verification | Claude |
| A2 | Confirm plans still work end to end in a dev copy with a real model (propose → approve → run → limit pause → Continue → restart → finish) | Claude |
| A3 | Rebuild the one clickable review deck (decision 40) against the caught-up code, and walk you through the flows | Claude → you |
| A4 | Your feedback on the deck, then build the changes | you → Claude |
| A5 | Three small questions built with a default, still unconfirmed: change a step's model while the plan runs (built: only steps not started); auto-start plans with no dollar price (built: never); phone support (now maybe easy, see §3) | you |
| A6 | Fresh independent bug review of the whole branch, fix, verify | Claude |
| A7 | Sign-off: rewrite the 83-row contract for decisions 33–40, fresh grader, acceptance | Claude → you |
| A8 | Merge, when you say so; bring the docs branch's records onto master; archive old docs | you decide |

**B. Plans, later stages (agreed 2026-09-23, not started)**

| # | Item |
|---|---|
| B1 | Stage 2: results passed between any steps, incl. a cheap explore-first step whose report every split specialist gets (decision 35.3); a coordinator step that can rewrite later steps, asking you again only if the plan grows (36.2) |
| B2 | Stage 3: parallel builders in separate project copies, bringing the winner back; saved, reusable plans |
| B3 | Local models: you asked (2026-09-05) how plans work with several local specialists. Built answer: they run one at a time on your computer because they share one memory pool. Confirm that's acceptable |

**C. Stage-one leftovers (from cards #70, #71, #199, #63)**

| # | Item | State |
|---|---|---|
| C1 | In Auto-edit, a specialist runs shell commands the main assistant would ask about (#71a) | You chose "leave it for now" (2026-09-16) |
| C2 | A finished specialist's report always interrupts; option to arrive quietly with your next message (#71b) | Needs a default from you |
| C3 | Each specialist pays full price for its opening (#71c) | Likely drop |
| C4 | Amber "Needs you" label unreadable on pale themes (#71d, #137) | Re-check — the 2026-10-13 colour sweep may have fixed it |
| C5 | Finished specialists' chat records pile up forever (#73) | Blocked on a delete-conversation feature |
| C6 | Allow more than 30 per conversation: approve the next one or lift the limit (#72) and many more in parallel (#199, filed today) | Not built; fits with plans (plan specialists already don't count toward 30) |
| C7 | Hands-on checklist: 15 of 17 checks never run (`docs/archive/handoffs/2026-08-16-specialists-1c-testing-checklist.md`). Checks 3 and 9c test the 5-minute hold, which no longer exists | Claude can run most in a dev copy; trim the obsolete ones |
| C8 | A replay race (F3) from a 2026-09-04 code review, never fixed | Claude: check if still real |
| C9 | Six ideas: move a running specialist to the background, view its transcript, a project-level specialists folder, cost per specialist card, a strict approval toggle, live roster in Settings (#63m) | Parked ideas |
| C10 | Claude Code bridge (`youcoded agent run`) | Not started |

**D. Documents to correct (part of this work)** — vision doc §2, §5.3, §6.1, §7, §8, §9 (bring
over the 2026-09-05 rulings from the docs branch); `docs/MAP.md` specialists row (no plans
files); cards #70, #71, #74 progress; the two 2026-09-04 handoffs (now point here).

## 5. Where everything lives

| What | Where |
|---|---|
| Plans app code | youcoded branch `feat/specialists-plans-ui` (head `0b21a59ba`); `desktop/src/main/harness/plans/`, `tools/propose-plan.ts`, `renderer/components/plans/PlanCard.tsx` |
| Your 40 decisions (read first) | youcoded-dev branch `docs/specialists-plans-decisions` → `docs/active/design/2026-09-05-specialists-plans/decision-log.md` |
| Designs | same branch: `docs/active/design/2026-09-07-specialists-plans-backend-design.md`, `2026-09-16-specialists-plans-pause-handoff.md`, `2026-09-24-specialists-plans-spending-backend-design.md` |
| Reviews | same branch: `docs/active/reviews/2026-09-*-specialists-plans-*.md`, `2026-09-24-plans-spending-*.md` |
| Last review deck (unanswered) | same branch: `…/specialists-plans.spending.live-review.json` |
| Deck tooling changes from that session | youcoded-dev branch `session/specialists-plans-wrapup` (one WIP commit; check against master's deck tools before reuse) |
| Original spec | `docs/active/specs/2026-08-11-native-specialists-design.md` §4, §7, §8 |
| Stage-one depth | `youcoded/docs/native-runtime.md` → Specialists sections |

## 6. Past conversations this replaces

All marked complete in the chat index on 2026-10-24; this file and card #74 carry everything
still open. Spec and plans 1a–1c (2026-08-11 → 08-16), stage-two decisions (2026-09-05),
plans backend (2026-09-08 → 09-19), budget rethink (2026-09-19), spending rework stage 1
(2026-09-26, the last one), and the stage-one fixes (2026-09-05 → 10-22).
