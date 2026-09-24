---
date: 2026-09-19
status: active
type: design
topic: specialists stage two — the binding decision log
---

# Specialists plans — decision log

**What this is.** The file every build subagent read before starting work on this feature. Each
numbered decision is the product owner's ruling, usually in his own words, and the code that
implements it carries a WHY comment naming the decision number. It lived at
`.superpowers/sdd/controller-context.md` inside the app worktree, which is **gitignored** — copied
here on 2026-09-19 so it survives the worktree being removed.

**It is a record, not a spec.** Where it and the shipped code disagree, the code is what shipped and
the disagreement is a bug in one of them. Decisions 25 onward were taken during live testing and are
the most recent thinking; decision 33 supersedes part of 31 (the forward flow clause was dropped).

---

# Controller context for every task (read after your brief)

Repo: YouCoded app. Worktree: /home/destin/youcoded-dev/worktrees/specialists-plans (branch
`feat/specialists-plans-ui`). Desktop code is under `desktop/`. Run commands from `desktop/`
(`npx vitest run <files>`, `npx tsc --noEmit -p tsconfig.json`). Never run `npm install`/`npm ci`
(node_modules is a hardlink farm shared with other checkouts). Never touch the user's running
YouCoded app. Commit with explicit paths (never `git add -A`), message ending with:

    Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

Do not push. Annotate every non-trivial edit with a WHY comment (the product owner reads them).

## Design sources (read the parts your task touches)
- Backend design: /home/destin/youcoded-dev/worktrees/specialists-plans-decisions/docs/active/design/2026-09-07-specialists-plans-backend-design.md
- Signed UI contract (do not change UI/copy): /home/destin/youcoded-dev/worktrees/specialists-plans-decisions/docs/active/design/2026-09-05-specialists-plans/specialists-plans.contract.json
- Global constraints: .superpowers/sdd/global-constraints.md (this directory)
- Rules for this code: /home/destin/youcoded-dev/.claude/rules/native-runtime.md,
  native-specialists.md, ipc-bridge.md, chat-reducer.md, react-renderer.md, harness-tools.md
  (read the ones matching the files you edit, BEFORE editing).

## What exists already (Task 1, built)
- `desktop/src/main/harness/plans/{schema,validator,eligibility}.ts`
- `desktop/src/main/harness/tools/propose-plan.ts` (structural `ToolServices.plans.propose` callback)
- `harness-session.ts` attaches/gates `propose_plan`, emits the `writing` projection, one repair.
- Renderer: `components/plans/PlanCard.tsx`, `PlanView` in `shared/types.ts`, `PLAN_CHANGED`
  reducer action, workbench fakes (`dev/workbench/mock-shim.ts`, `mock-only.ts`).

## Decisions made since the plan was written (2026-09-16) — binding
1. The branch was merged with a master that is 673 commits newer. New on master that touches
   this work:
   - **Automatic specialist models** (`desktop/src/main/harness/specialists/delegated-models.ts`
     and its resolver): specialists without an explicit model resolve to a provider-matched safe
     default. Plan children MUST resolve their model through that same resolver; the resolved
     binding is what the proposal's execution manifest freezes.
   - **Accepted-history capture** (`harness/accepted-history-capture.ts`): every site that
     mutates `HarnessSession.history` must report to `this.capture` (recordEvent /
     acceptAttempt / acceptAttemptText / abandonAttempt / mutated). New history mutations in
     plan-child mode must do the same.
   - **No per-child step cap** for specialists; `SPECIALIST_SPAWN_BUDGET_PER_SESSION = 30` is the
     per-parent runaway backstop.
2. **Plan-launched specialists do NOT count toward the 30-per-session spawn budget**, and never
   trigger its approval prompt: the user approved the plan card, which shows the specialist count
   and a hard ceiling. Concurrency limits (max 4) and the single-writer reservation still apply.
3. Words: the user-facing noun is always "specialist" (never helper/subagent/agent/spawn).

## Product owner decisions, 2026-09-16 (answered in chat; the two UI changes still need a review deck before shipping)
4. **Step budget = work only.** A specialist's fixed starting cost (system prompt + tool schemas +
   framing, at the certified conservative bound) is counted SEPARATELY from the step's
   `budget_tokens` and added into the plan's ceiling, so a step's allowance pays for real work.
   The card's total must include that setup cost (ceiling stays an honest worst case).
   Also raise `PLAN_MAX_BUDGET_TOKENS` from 20,000 to 30,000 ("a bit").
5. **ChatGPT sign-in gets plans, with a softer limit.** `propose_plan` is offered in ChatGPT
   conversations, and ChatGPT specialists can run plan steps. Because ChatGPT rejects an output
   cap, the ChatGPT adapter sends without one; the harness still reserves before sending, still
   sends once, and checks authoritative usage after each reply — once the plan's limit is passed it
   pauses before any further request. One reply may overshoot. The card says the limit is
   approximate for such a plan (UI wording change → review deck in Task 5).
6. **Failed card explains itself.** A failed plan (e.g. unreadable journal) shows one short reason
   line plus Report bug and Diagnose with Claude actions, following
   /home/destin/youcoded-dev/docs/error-message-standards.md (never invent a cause). Needs a
   PlanView detail field (Task 5 renders it; review deck before shipping).

## Product owner decisions, 2026-09-16 afternoon (review deck 6 + follow-up chat)
Deck answers: specialists-plans.review6.answers.json (sources for contract rows).
7. Kept as built: failed-card reason + Report bug + Diagnose (R6-2), "Not started" (R6-8), plan asks
   light the "needs you" chip (R6-9) and its popup (R6-10), plain "The assistant isn't available
   right now." + Retry (Q6-5).
8. R6-1: NO approximate-limit sentence. Instead prefix approximate token numbers with a tilde
   ("Up to ~42,000 tokens") wherever the limit is approximate.
9. R6-4 + design-guide rule: Approve is rightmost, Comment to its left. Guide rule to add: filled/dark
   buttons are either centered and full-width of their card/modal, or right-aligned — never
   left-aligned; when a dark and a light/hollow button sit together, the light one is on the left.
10. Q6-1: a specialist waiting on the user (ordinary AND plan) lights the conversation's red dot WITH
    the alert sound, like the assistant's own asks.
11. Q6-2: the Specialists chip lists a plan's working specialists too, grouped under their plan; each
    plan is a collapsible one-line row that expands to its specialists.
12. Q6-4: keep "Plans aren't available on the phone yet." (mobile parity is planned).
13. Pause handling (chat, approved split):
    - AUTOMATIC (nobody asked): model hiccup / failed launch → retry once; local engine full → wait
      and retry; action cut off mid-way that only read → re-run; that changed files → the specialist
      restarts with a brief telling it to check what happened first.
    - HANDED TO THE ASSISTANT: repeating steps that never met their goal; plan out of budget; a
      cut-off action that reached outside the computer (e.g. sending a message). While handed over,
      the card is DEACTIVATED (greyed, says the assistant is looking into it). The assistant then
      re-presents the card with the right resume/whatever buttons (or proposes a revised plan). The
      user still presses the buttons — the assistant never adds budget or resumes by itself.
    - STILL THE USER'S: after an app restart the plan waits for Continue (signed R9).
    - Where a user-facing non-budget pause remains, it offers Continue, not Add budget (Q6-3).

## Product owner decisions, deck 7 (specialists-plans.review7.answers.json, 2026-09-17)
14. Kept: tilde on usage numbers AND dollars ("~$0.12") (R7-1, Q7-1); button order (R7-2); red dot +
    sound (R7-3); plan row wording (R7-4).
15. R7-2 note: put the plan card's Approve/Comment buttons on the same line as the limit text on the
    left (use the empty space) — filled button still rightmost.
16. R7-5: in the Specialists popup, no separate "Plans" header; each plan is a card the SAME WIDTH as
    the independent specialist cards, titled "Plan: <name>", still collapsible to its specialists.
17. R8-1 + Q7-2: do NOT show the "Note for the assistant" row in the chat.
18. R8-2..R8-5: the automatic handoff to the assistant feels heavy ("a lot of messages/cards for a
    straightforward action") — PENDING Destin's choice among: (1) no auto handoff, add an
    "Ask the assistant" button; (2) hand off only judgment calls; (3) keep as built, trimmed.
19. (chat 2026-09-17) Decision 18 resolved: NO automatic handoff. Every paused card gets an
    "Ask the assistant" button (light, far left) that starts the handoff on request. Design §6
    (revision 4) of the pause-handoff design.
20. (chat 2026-09-17, "ok" to the recommendation after UX review 2 U2) "Ask the assistant" opens a
    small optional text box (like Comment): type a question or leave it blank, then Send. The typed
    text travels to the assistant with the notice (as the user's own words, capped, marked as the
    user's question) and appears in the chat line: "You asked the assistant about this plan: <text>"
    (or the plain line when blank). Show on the acceptance deck.
21. (deck 9, D9-2) The "You asked the assistant about this plan…" special line is rejected: an Ask shows
    up as a REGULAR user message bubble (same component as any user message) containing the typed
    question; with a blank box it reads "What should I do about this paused plan?" as the user's
    message. The hidden notice facts still travel to the assistant only. Q9-1: leave the card as is.
22. (chat 2026-09-17) The plan usage limit does not re-count cached tokens — design §7 (revision 5)
    of the pause-handoff design. Build after the final-review fix batch.
23. (deck 10) G-5: remove the plan-settings read-failure error row (Retry/Report bug). If the
    auto-approve setting can't be read, the row simply shows its default (off), no error UI.
24. (deck 10) G-7: the unsaved-progress (orphan) pause is ONE row: message left, buttons right
    (Report bug · Ask the assistant · Stop · Continue, filled Continue rightmost); no separate
    "Something went wrong" block, no Add budget (it is not a budget pause — find why it got budget
    buttons and fix the kind mapping). Use the full card width; no stacking at desktop width.

## Product owner decisions, live testing (chat 2026-09-18)
25. A plan is never PROPOSED with a specialist that cannot run. At proposal time each resolved
    specialist's provider credential is checked LOCALLY (no network call, no spend): signed in /
    API key saved / endpoint configured / local engine installed. Not ready → `propose_plan`
    refuses, naming the specialist and repeating the provider's OWN sentence about what to fix
    (e.g. "Sign in with ChatGPT in Settings → Model Providers to use this model."). Never invent
    a cause. Destin's symptom: "tried in two sessions and both failed to make a plan" → the plan
    was proposed with ChatGPT specialists while signed out, and only failed once it ran.
26. An error that CANNOT heal itself is never retried automatically. Before any automatic retry of
    a launch failure or specialist error, re-check that specialist's provider credential; not ready
    → no retry, pause immediately carrying the provider's own sentence, and offer **Continue · Stop**
    (NOT Stop-only: the person fixes the sign-in/key and Continue is exactly the fix). Destin's
    symptom: the plan burned its one automatic retry on "Sign in with ChatGPT…", which could never
    succeed.
27. Changing specialist tiers does NOT force a re-proposal. On Approve/Continue, when the ONLY drift
    is which model a specialist uses and/or that model's price (instructions/tools fingerprints and
    the permission fingerprint unchanged), the plan re-freezes to the current models and runs
    SILENTLY when the new worst case is PROVABLY not more than the approved one. Otherwise the card
    asks ONCE, showing approved vs new limit, with Continue · Stop; Continue there accepts the new
    limit. Drift in instructions/tools or permissions still refuses exactly as today. Destin's
    words: "unclear why the assistant would need to re-propose a plan just cuz i needed to change my
    specialists tiers. this should've been a clean retry/resume".
28. (chat 2026-09-18, screenshot) A plan failure the assistant fixes BY ITSELF, in the same turn, is
    never shown. The red "The assistant's plan wasn't in a form the app can use." row (Report bug ·
    Diagnose) appears only when the turn ends with no usable plan. A turn shows AT MOST ONE plan card
    for the assistant's plan writing — a repaired attempt must not leave a second card, nor a stuck
    "writing a plan…" shell, behind. Scope: same-turn self-correction only. If the user had to say
    "try again", the first failure STAYS visible — they intervened, so it was real.
29. (chat 2026-09-18) A plan card AWAITING APPROVAL is lifted out of its place in the conversation and
    re-drawn as the last thing in the chat, exactly the way an unanswered permission prompt already is
    (ChatView's `awaitingTools` lift + ToolGroupInline's filter), snapping back to its original
    position once answered. It keeps following the bottom until it is answered (Destin's pick over
    "until the next message"): losing a plan you were about to approve is worse than seeing it twice.
    Only `proposed` lifts — running, paused and finished plans stay where they are.
    Process: Destin approved skipping the design/review round for 28 and 29; a before/after deck is
    the first thing he sees ("this should be a very short straightforward change, dont overthink it").
30. (chat 2026-09-18, screenshot of a 6-step plan) "it's still a bit hard to tell what exactly is
    going on or what the plan will do from this card. there's probably a better way to visualize
    this, but idk?" Four named causes, agreed: (a) a fan-out step says "7 reviewers" but never what
    each one GETS, though the document's `items` list is exactly that and is thrown away; (b) nobody
    ever writes a sentence for the USER — the row is the literal first line of a prompt written for
    a machine; (c) the shape is invisible (this plan is two parallel passes, each merged, then
    verified, then written up, rendered as a flat 1-6 list); (d) the per-step token figure is the
    loudest thing on every row and the least useful before approval. Fix order agreed: items, then a
    plain one-sentence description per step, then quieten the numbers, then fix the line my last
    change duplicated. The pipeline DIAGRAM is deliberately held back — "it could easily end up
    prettier and no clearer" — until those land. Decks: iteration decks are wanted; what he does not
    want is "a final before/after review deck when the work obviously isnt final".
31. (chat 2026-09-18, second screenshot) "still isnt great for transparency/understanding. like it's
    not clear to me how this breaks out into 7 reviewers, what the inputs/ouputs are, and how it
    flows to the next step of the plans inputs/outputs". Three answers, all from facts the app
    ALREADY holds: (a) a fan-out step renders one ROW PER SPECIALIST (numbered, each showing its own
    item), which is the same shape the card already takes once the plan runs — so the proposal is a
    preview of the running card and the layout never changes shape under him; (b) each step says
    what it produces (one report per specialist, or one for a combining/checking step); (c) the FLOW
    is already in the plan — a verify/combine step carries `of`, the id of the step whose results it
    consumes, validated to name an earlier step and fed in as that step's input at run time
    (plan-executor.ts dependencyReports) — so the card can name both directions without inventing
    anything. Plain line per step, e.g. "Each reviewer gets one of the 7 groups below · produces 7
    reports → step 2 combines them". The box-and-arrow DIAGRAM stays rejected: a picture of a
    straight line is decoration.

## Decision 32 — the card's LAYOUT is what is wrong, not its words (2026-09-18)

Destin, after task 17: *"this whole thing is just not well organized or easy to navigate through
visually. i want you to propose a new plan card style with better visual heirarchy that is easier
to quickly glance/click through and understand. minimal copy, maximum transparency and
comprehensibility"*. Then, asked how he wanted to see it: *"the deck is fine for comparisons"*.

Decisions 30 and 31 both kept the flat step list and rewrote the sentences on it. Three complaints
in a row is the evidence that was the wrong lever. This round changes the arrangement and cuts the
copy; the shipped card is not touched until he picks.

Three candidates, one round, proposed state only, at a chat bubble's real width (460px):
**spine** (the fan-out drawn on a rail, workers always visible, no flow sentence), **ledger**
(no drawing — hierarchy by type size and a fixed count column, inputs named with `←`), **strip**
(the whole plan's shape as one glanceable line of nodes above a minimal list).

Brief: `.superpowers/sdd/task-18-brief.md`. Shown as a **Live** deck — real panes he clicks, not
screenshots — which is the one thing the dev instance cannot give him, so the deck rule
(`.claude/rules/feature-flow.md`) is satisfied and he approved it besides. The winner is then
adapted to the running, paused and finished states.

## Decision 33 — what a plan may be, and what every step must say (2026-09-18)

After walking the grammar's real shape space with Destin, and then being corrected twice by him:

1. **A single-specialist SPLIT STEP stays legal.** Destin: *"a 'split' step is the only way for the
   assistant to include a single worker/explorer agent in a plan. we need to allow single-specialist
   split steps, but not single-specialists single-step plans. if the entire plan is a single
   specialist doing a single thing, its a shitty plan and should just be a specialist call."*
   → `items` keeps its minimum of 1. The rule belongs to the PLAN, not the step: reject a document
   whose whole worst case is one specialist run. `validator.ts` already computes exactly that number
   (`maximumAttempts`), so the check is `maximumAttempts >= 2`, and the refusal tells the assistant
   to hire a specialist instead of proposing a plan. The same sentence goes in the tool's guidance,
   so the model stops reaching for a plan it cannot have.
2. **`summary` becomes REQUIRED**, on every step including repeat bodies, because each draws its own
   row. Destin: *"i'm not sure what the benefit would be of making it optional."*
3. **`until` shows on the collapsed repeat row**, not only when the step is opened.
4. **No backward compatibility.** Destin: *"i don't car if 'every plan on disk' stops working. this
   isnt a finished feature, all of the existing plans are demos bruh."* → the grammar tightens IN
   PLACE, one schema, no authoring/storage split. Old journals may fail to parse; that is accepted.

Also settled from the same walk: a `map` step can never declare an input (`of` belongs to
verify/combine only) and at run time genuinely receives nothing from earlier steps, so the card can
never show a complete flow and must not imply one. Every link names exactly one earlier step, so the
structure is always a tree — which is why words carry it and no diagram is needed. Flow labels
therefore appear ONLY where the source is not the row directly above.

## Decision 34 — no per-step budgets; spending is watched, not rationed (2026-09-19)

Destin's symptom: *"almost immediately every single one of the assistants, even for simple tasks
like … a couple of web searches … hit their budget limit almost immediately. and then adding
budget, it just kept re hitting that same limit."* His ruling, after the research below:

1. **No limit by default.** Approve / Continue just starts the plan — "no limits, no cost
   expectations".
2. **Keep live spending in dollars with a Stop button.**
3. **Drop per-step budgets entirely** — *"they're confusing … it forces the model to try and
   predict how much each step is gonna cost, and that just doesn't make sense."* `budget_tokens`
   leaves the grammar.
4. **One optional whole-plan limit**, set by the user per plan, *"hidden behind an additional
   button that says set budget or set limit"*.
5. **An estimate, never a limit**, from his own past specialist runs by type and model.
6. Spending math must match and reuse the rest of the app's cost figures.

Evidence (2026-09-19, read-only):
- 297 of his past specialist runs: median ≈222k billed-equivalent tokens (≈$0.60 at list);
  workers median ≈517k (≈$2.26), p90 ≈2.3M. The old per-step maximum was 30,000 — a typical
  worker needed ~17× that. Model choice moves cost ~100×; specialist type ~3–5×. Re-run with
  `docs/active/investigations/2026-09-19-specialist-usage.py`; data lives in
  `~/.youcoded/sessions/<folder>/<childId>.jsonl` (`turn-complete` usage lines).
- Other tools: Claude Code, Codex and Hermes all have spending caps OFF by default; the defaults
  are generous step/iteration caps, and hitting a cap returns partial work rather than pausing.
- Spending-math audit: a reported request is priced by the same `costForUsage` (pricing.ts) as
  the chat's cost chip — correct. The divergences are all in the pessimism: stops/errors/missing
  usage charge the whole remaining allowance at the top rate as "spent"; inputs are reserved at
  one token per byte (≈3–4× real); images are refused in plan specialists only because they
  can't be bounded in advance. The `resolveManifest` setup probe (suspected Add budget freeze,
  Continue re-measure complaint) exists only to measure `setupTokens` and becomes unnecessary.
  Roughly 1,500–2,000 source lines of reservation/tranche/adapter machinery go with it.

Open details went to a questions deck: `specialists-plans.spending.questions.json`.

### Decision 34 — deck answers (`specialists-plans.spending.questions.answers.json`, 2026-09-19)
- S-1 yes: no default limit; live dollars (after each specialist reply) + Stop.
- Q-1 limit is in **dollars**, tokens only for plans with no price (subscription / on-computer).
- Q-2 at the limit it **just pauses** (Continue with a new limit · Stop); no wrap-up warning.
  His note: *"why would it cost more to restart? seems like this should be a clean same-cost
  resume?"* Answer: a paused specialist resumes from its saved conversation — no work is redone.
  The only extra is re-sending that conversation once; within the provider's short cache window
  that is ~a tenth of the price, after it the first request pays full price once.
- Q-3 the limit can be set or changed **before and while running**.
- Q-4 the estimate is a **range** ("usually $0.40–$2").
- Q-5 unpriced plans show **tokens, labelled** ("about 300k tokens · included in your ChatGPT plan").
- Q-6 auto-start becomes **"when the estimate is under $X"** (no limit implied).

## Decision 35 — plan settings, per-step models, research first (chat 2026-09-19)

1. **Any step's model can be changed** by the user — *"I want to be able to change the model used
   for any specialist in a plan really."*
2. **A plan settings screen**: a settings button on the plan card opens one place to set the
   plan's total limit and each step's model. (Supersedes the bare "Set limit" button of 34.)
3. **Shared background is gathered first, cheaply.** *"if a plan sends out a bunch of agents, and
   we know those agents are all gonna need some type of shared context or background. We should
   do the back first as part of the plan with a cheap model"* — e.g. a dozen builders trying a
   dozen approaches start from ONE explorer's brief, not a dozen separate explorations.
   **Grammar blocker (verified):** a `map` (split) step cannot declare `of` (schema.ts:73–74 allow
   it on verify/combine only), so "explore → fan out with the explorer's report" cannot be written
   today. Needs: `of` allowed on `map`, each item's specialist receiving that report as shared
   background (executor `dependencyReports` already does this for verify/combine), plus guidance
   in the `propose_plan` description (its only plan-writing guidance today is the `summary`
   sentence and the no-single-run rule — tools/propose-plan.ts:67–79). This reverses part of
   decision 33's "a split step never receives input" fact.
4. (chat 2026-09-19, answers the two follow-ups) **Models default to each specialist type's
   existing default.** The assistant changes a step's model ONLY when the user explicitly asks it
   to; the user can change any step's model themselves (plan settings). Changing models while a
   plan runs: not yet answered.
5. (same chat) **The goal, in his words:** *"fully autonomous workflows of different agents with
   different context settings, different instructions … provide a task at the beginning and get a
   fully complete output at the end … build a new feature, and then … different types of
   reviewers … builders … UX beta testers … and then a final consolidated PR reviewer … any kind of
   research task."* He floated an explorer step that hands back to the primary assistant to write
   the remaining steps' prompts, or a coordinator step that amends later steps. Under discussion.

## Decision 36 — staging, re-approval, parallel copies (chat 2026-09-23)

1. **Build in stages** (*"yeah"*): (1) spending rework of decisions 34–35; (2) results passed
   between steps + a coordinator step that can rewrite later steps; (3) parallel builders in
   separate project copies, and saved reusable plans.
2. **A coordinator's rewrite asks again only when the plan GROWS** (*"fine with asking when it
   grows"*): it continues by itself when the rewritten plan uses no more specialists than
   approved and is not likely to pass a limit the user set; otherwise it pauses and shows the new
   version for approval.
3. **Parallel builders each get their own copy of the project** (*"yes probably?"*) — stage 3.
   Start with version-controlled (git) projects; bringing the winner back is the hard part.

## Decision 37 — spending review deck (`specialists-plans.spending.review.answers.json`, 2026-09-24)
Kept: R-1 estimate line + gear, R-2 unpriced tokens line, R-3 "Spent $X" + Stop with per-step
limits gone, R-4 one "Reached your $5 limit." row with Stop · Continue, B-1 "Spent $X of $Y",
B-3 the low-limit warning line.
- B-2 (Continue → new-limit box): *"we can probably clean this state up a bit. lots of
  buttons/text in that warning card"* → rework, fewer words and buttons.
- C-1: **popup**, not in-card. *"if the popup is unique to that plan, it should name the plan.
  the popup styling needs to be greatly improved, currently does not match existing app styling
  well at all for popups."* → title names the plan; restyle to the app's own popup pattern.
