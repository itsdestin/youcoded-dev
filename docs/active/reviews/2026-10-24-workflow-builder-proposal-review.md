---
date: 2026-10-24
status: active
type: review
topic: independent review of the workflow builder proposal (card #74), before mockups
reviewed: docs/active/specs/2026-10-24-workflow-builder-proposal.md
---

# Workflow builder proposal — independent review

Method: read the proposal, Destin's decisions, the landscape study, then the code. Code read from
`origin/master` (viewer registry, specialists folder, library/marketplace screens, project view)
and from `origin/feat/specialists-plans-ui` (plans `schema.ts`, `plan-executor.ts`,
`plan-host-bridge.ts`, `plan-journal.ts`, `plan-estimate.ts`, `propose-plan.ts`; `PlanCard.tsx` is 1,577
lines, executor 1,921, service 1,047, bridge 1,143). Not read in full: PlanCard internals, the
Android side, the Pages code (I rely on the landscape study for what Pages can't do). I did not run
anything. Confidence is stated per finding.

## Top 5 changes I'd make

1. **Decide the "no chat" question honestly before mockups (X1, S2).** Today every plan child runs
   *under a live chat*: its permissions, its approval prompts, its working folder, its model, its
   30-helper lifetime cap and its 4-at-once cap all belong to that chat. "A run does not need a
   chat" is the proposal's biggest claim and its least-supported one. Cheapest honest v1: a run
   is owned by a hidden/background chat session the app creates for it (shown as a card in the
   Workflows list), not by a brand-new owner. That still lets you close the chat that started it.
2. **Make the workflow file *be* the plan document, extended (S3).** The plans schema already has
   map / verify / combine / repeat, per-step model, "from steps", plain-words stop condition, caps,
   and validators; the proposal's "new file format" is mostly the same thing with a second name.
   Extend the plan schema (add `checkpoint`, `inputs`, per-step tools, a `lane` for different
   cards side by side) and wrap it in a `.workflow` file. Do not write a second validator.
3. **Cut v1 to one place to edit and one run view (S1, S4).** Ship the Workflows screen only
   (it already needs a run list), and make "Open in Files panel" a small viewer later that just
   shows a read-only picture plus "Open in Workflows". Make the run view the editor in read-only
   mode with live state (the proposal already says so), not a second thing to build.
4. **Fix the engine ceilings the examples already break (X2, X3).** The proposal's own example
   loop (3 builds+reviews+combine for up to 3 rounds, plus explore, plan, final) spends about
   20 helpers; the app refuses the 31st helper per chat, and a wide research job (6+ laptops, a
   folder of 40 PDFs) hits "8 items per split" and "6 steps" long before. Decide the real limits
   (and what the user sees at the wall) up front.
5. **Write the failure and mid-run-edit story, and give first-time users a starting point (U4–U7,
   M1).** Ship with 3 starter workflows matching Destin's three first jobs (build, research, my
   files), created from a chat sentence ("make me a workflow that..."), and say plainly that
   editing a running workflow means "pause, edit the cards that haven't run, resume" — otherwise
   the first thing a user tries (changing a card mid-run) has no answer.

---

## Part 1 — Overcomplication and reuse (S)

**S1. Two homes for editing (Files-panel viewer AND Workflows screen) in v1.**
- What: the proposal builds the editor twice in effect: a registered viewer in
  `artifact-views/RendererRegistry.ts` (keyed by file extension, `REGISTRY[ext]`) and a new
  top-level screen with the same editor.
- Why it matters: Destin asked for both, but the Files-panel viewer has real costs the proposal
  doesn't mention: the viewer API is built for one file with find/comments/edit-mode/unsaved-guard
  (`ActiveArtifactView`, `dirty-editor-guard`, `useArtifactContent`, text size caps), the panel is
  narrow (a rows-of-cards editor with a side panel doesn't fit a side pane, and phones are tighter),
  and a run view with live updates inside a file viewer is a poor fit.
- Change: v1 = the Workflows screen is the editor and the run view. The `.workflow` extension is
  registered in `RendererRegistry` to a *small* card-summary viewer ("Review: bugs · 3 rows ·
  Run · Open in Workflows"). Full in-panel editing comes later if people ask. This still honours
  "opens in the Files panel next to documents" — you meet it there; you edit it in the screen.
- Effort: saves M-L. Confidence: medium-high (registry shape read; I have not read the panel's
  width behaviour). Flag: Destin said "depends on how we actually build the backend" (Q-2 note),
  so this fits his own caveat. It is not silently overriding him.

**S2. "A new standalone run owner" is likely larger and riskier than the proposal makes it sound.**
- What: the proposal lists the standalone owner as one of seven "new" items and calls the plans
  engine reusable "through a narrow doorway". The doorway (`PlanHostPort` in `plan-host-bridge.ts`)
  is narrow but every method is keyed to a *live root chat*: `rootCwd(sessionId)`,
  `parentBinding(sessionId)`, `permissionState(sessionId)`, `maxConcurrent(sessionId)`,
  `queueTurn(sessionId, ...)`. Each child launch carries `parentId` and `parentToolCallId`
  ("the propose_plan call the plan renders on"). The journal file is
  `sessions/<slug>/<parentId>.plans.json`, i.e. one-per-chat. Child approval prompts are routed to
  the *parent chat's* permission card (`child-ask-router.ts`), and a child's permission is "the
  parent's decide() with caps stacked on" (`child-permissions.ts`).
- Why it matters: with no chat there is no one to ask, no folder, no model, no permission mode.
  A run started from the Workflows screen at 9pm, left alone, will hit an "edit file" approval
  and... where does it show? See X1.
- Change: v1 owner = a *background chat session created for the run* (hidden from the normal chat
  list, linked from the run). All the existing machinery (approval prompts, red dot, model, folder,
  caps) then works unchanged, and "closing the starting chat doesn't stop it" is still true. A true
  ownerless runner can come later. Name this as the decision to make, not a line item.
- Effort: this choice turns L into M. Confidence: medium-high that the engine assumes a live chat
  (read directly); medium on how hard a hidden session is (did not read `native-session-host.ts`).

**S3. A brand-new `.workflow` format + validator vs extending the plan document.**
- What: the plans schema (`schema.ts`) is already one table that generates both the JSON Schema
  shown to the model and the Zod validator, with kinds map/verify/combine/repeat, `of` (earlier
  steps, up to 6), `model`, `until`, `max_iterations` (cap 5), body of leaf steps (cap 4), 6
  top-level steps, 8 items, `summary` (a one-line plain sentence per step, required), and a
  validator for earlier-only references. The proposal's rows/cards/repeat/"from rows" are the same
  ideas under new names.
- Why it matters: two formats means two validators, two sets of caps, two "assistant writes it"
  prompts, and drift — the exact thing the proposal says it prevents ("one file, no drift").
- Change: `.workflow` = a JSON file whose body *is* the extended `PlanDocument` plus: `inputs`,
  `checkpoint` kind, `lane` (side-by-side group), per-step `tools`, and a title. Rows in the UI are
  just a rendering of the step list (steps with the same `lane` group share a row). Keep the file
  extension and viewer registration as proposed.
- Effort: saves M-L. Confidence: high.

**S4. Separate editor and run view.**
- The proposal already says the run view is "the editor in read-only mode with live state". Keep
  that: one component with a `mode` prop. Do not let the mockups draw two screens; draw one
  screen in three states (editing, running, paused-at-checkpoint). Effort saved: M. Confidence: high.

**S5. Side-by-side *different* cards are the single biggest engine change; v1 can get 90% of the
value without them.**
- What: today a `map` step runs one specialist type over a list of items (max 8, 4 at a time),
  each with the same brief and a `{item}` slot. "Three reviewers" = `map` over
  ["bugs", "UX", "speed"] with one reviewer brief. The proposal's "different cards in one row" needs
  the executor to launch heterogeneous attempts in a wave; the executor's wave logic and the journal
  attempt records (`itemIndex`, `iteration`) assume one step = one brief.
- Why it matters: without it, you lose per-reviewer model/tools/instructions, but the three jobs
  (build, research, my files) mostly need "same brief, different focus". The research example
  ("one researcher per option") is exactly `map`.
- Change: v1 = a card can be a *group* ("Review", with 1–8 items, same specialist/model/instructions
  with `{item}`). Heterogeneous side-by-side is v1.1. In the mockup, a group card shows its items as
  small chips. If Destin insists on different cards in a row, expect it to be the longest pole.
- Effort: saves L. Confidence: medium-high (read the executor's wave shape and journal records; did not
  read the full step runner).

**S6. Repeat "brackets" could be a property of a card or a row group.**
- What: the engine's `repeat` is a container step (≤4 leaf steps, max 5 rounds, `until` decided by
  the last leaf's report in a required answer format, and *reaching the cap pauses the run*, it is
  not success). A bracket drawn around rows 4–6 in the editor is the right picture, but it is also
  the hardest widget to build, drag into and explain.
- Change: draw it as a visible container row ("Repeat up to 3 times until: [no blocking findings]")
  that cards are dragged *into*, not a bracket spanning rows. Reuses the plan card's existing look
  for a repeat step. Cap is 5 (the proposal says 5; the example says 3, fine). Make the stop
  condition a text box *plus* a hint "the last card in the loop answers yes/no" (that is how it
  works: `parseRepeatDecision`). Effort: S-M. Confidence: medium.

**S7. Inputs — keep, but v1 = text and file/folder as plain placeholders.**
- Decision Q-9 says saved workflows take inputs; this is cheap if inputs are just named strings
  substituted into task text (`{input name}`), exactly how `{item}` already works. Do not add typed
  validation, defaults, or conditional fields in v1. Confidence: high. Effort: S.

**S8. Run records "next to the workflow in `.youcoded/runs/`" conflict with the engine.**
- The journal lives in the native home under `sessions/<slug>/<sessionId>.plans.json`, not in the
  project, and it holds spending data and reports. Writing run folders into the user's project also
  creates git noise and may leak spending into a shared repo or a synced folder. Change: keep
  journals where they are; show a "Runs" list in the Workflows screen; optionally export a finished
  run's final report into the project on request. Effort: saves S. Confidence: high (journal path
  read in `plan-journal.ts`).

**S9. Reuse the specialist chip/popup instead of a bespoke run activity line.**
- `SpecialistsChip.tsx` / `RunStatusLine.tsx` (master) already show named helpers, their state and
  live line; the "live activity line" and per-card live transcript should come from them, not be
  re-derived. Confidence: medium (did not open them). Effort: saves S-M.

## Part 2 — Use cases end to end (U)

### Scenario A — a student with their own files
"I have 12 PDF readings and a spreadsheet of notes. I want one study guide."

1. Discoverability: the student has never heard of "workflows". The proposal offers: a Workflows
   screen (where in the navigation? left open as a question), a `.workflow` file in the Files panel
   (they won't have one), and "build me a workflow" in chat (they won't say that). **Silent.** See M1/U1.
2. They would simply ask "summarise these PDFs into one guide" in chat. Today the assistant either
   does it itself or proposes a plan. With the builder, it should propose a workflow card with Open
   and Run. The proposal says the assistant's "propose a plan" becomes "propose a workflow" — good,
   but the card they see first should say the *job*, not "workflow". See U1.
3. Press Run → inputs form: "Folder: [choose]". Reasonable. A student may not know what "model" or
   "what it may do" means on a card. Defaults must be so good they never open the side panel. The
   proposal says defaults come from "Starts from"; fine, but "Read only · Edit files · Run commands ·
   Use the web" checkboxes are developer words ("Run commands"). Use "Change my files", "Look things up
   online".
4. 12 PDFs: this needs one card *per file*, from a folder. The engine's split has 8 items max and
   items come from a fixed list in the plan, not from a folder (landscape study: "a split step can't
   take its list from an earlier step's result"). **The proposal's own job #3 ("summarise every PDF
   in this folder") cannot be done as written.** See U2/X3.
5. Estimate: "Usually $0.80–$3". A student on a subscription or local model gets tokens instead of
   dollars (proposal says so). Fine, but "tokens" is jargon: the plans card already uses "included in
   your ChatGPT plan" / "runs on your computer" — keep that wording.
6. Finish: final report appears in the run, and files changed are listed with links. Where is the
   study guide *file*? The proposal says final report is the last card's output, not that it is
   saved as a file. A student wants a document in their folder. See U3.

### Scenario B — software build, parallel reviewers, repeat loop
"Add a dark-mode toggle."

1. A developer-ish user (or Destin) asks in chat, gets the workflow card, opens it. Eight rows.
2. Run. Explore (reads code), Plan, then Checkpoint "Approve the plan": the run pauses and shows
   results so far, options, a note box, Continue/Stop. Good. **Silent:** where does the user *see*
   this if they have the chat closed and the app is on another screen? The red attention dot exists
   for specialist approvals; the proposal says it will be reused. Needs a mockup of the dot's
   destination (opens the run, not the chat).
3. Build (a writer): runs alone — good, and already how the engine works (writer steps are run
   one at a time, `width = (writer || local) ? 1 : cap` in the executor). Nothing in the proposal
   mentions this, and its open question "Do several cards that edit files in the same row collide?"
   is answered by the engine today: they don't collide, they *queue*. The honest UI copy is "These
   run one after another because they change files." See X4.
4. Three reviewers in parallel (read-only), then Combine, then the loop asks "any blocking findings?"
   The loop decision is made by the last card in the loop; if it never says yes in N rounds the run
   *pauses* with "ran 3 times without meeting the stop condition" (engine behaviour). The proposal
   is silent on what the user should do then: Continue another round? Edit the cards? See U5.
5. Helper count: explore 1 + plan 1 + per round (build 1 + 3 reviewers + combine 1 = 5) × 3 = 15 +
   final 1 = **18**. At 5 rounds: 28. Hard lifetime cap per chat today is 30
   (`SPECIALIST_SPAWN_BUDGET_PER_SESSION`), and retries and restarts spawn more. A second run from the same
   chat can fail with a flat refusal. See X2.
6. Final report and a list of changed files. A software user next wants a branch/PR; out of scope for
   v1 but "Files the cards changed are listed with links" should say whether those are *uncommitted*
   changes in their working copy. See U3.

### Scenario C — something goes wrong
Variants the proposal should answer on the page:

1. **A card fails.** Proposal: error shown, one auto-retry for small hiccups, else pause with
   Retry this card · Skip · Stop. Good and consistent with the engine (`pause-routing.ts`). But
   "Skip" on a card whose later cards read it is dangerous: the combine card gets no input. Say what
   Skip does downstream (the later card sees "step skipped"), or remove Skip in v1.
2. **Limit hit.** "Reached your $5 limit — Stop · Continue (asks a new total)". Good. The proposal
   should say what already-finished cards cost vs what is lost: nothing is lost (journal), the run
   just stops launching.
3. **App restarts mid-run.** "Run waits with Continue." Good. But with a standalone/hidden owner
   (S2) the run needs to be findable on relaunch: the Workflows screen must show "1 run waiting"
   at startup/home, not require a trip into the screen. And a card that was mid-action outside the
   computer (a command, a web request) pauses and asks (engine rule "no silent replay") — worth one
   sentence, because users will see "paused, check first" on a restart and not know why.
4. **User wants to change a card mid-run.** Proposal: silent. The engine's plan is frozen at approval
   (permission fingerprint, frozen model manifest, journal keyed to the document). Changing a card
   that has not run yet is plausible; changing a finished card means re-running it and everything
   after. Offer exactly this: "Pause → edit cards that haven't run yet → Resume", and on a finished
   card "Re-run from here". See U6/M3.
5. **Two parallel cards edit the same files.** See X4: they serialize. But *the user can't see why
   the row is not parallel.* Also, a read-only reviewer reading files while a writer is changing
   them is a different race (the proposal's rows prevent this, since the writer is in an earlier row).
6. **Approval needed while no chat is open.** See X1.

**U1. First-time discoverability is unaddressed.**
- What: three entrances (a screen, a file, a chat sentence) and none teaches. A user who never
  saw the word "workflow" will never find it.
- Change: (a) when the assistant would have proposed a multi-step job, it shows the workflow card
  (with the picture of rows) — the first workflow most people meet is one the assistant made for
  them, in a chat; (b) an empty Workflows screen shows the 3 starter jobs as cards ("Compare
  options", "Summarise a folder", "Build a feature") with a one-line plain description and a
  "Use this" button; (c) a plain name: "Workflows" is fine, but the card should say "A saved,
  repeatable job". Effort: M. Confidence: high.

**U2. Lists from folders/files and wide fan-out can't be done by the engine today.**
- Evidence: plan limits in `schema.ts`: 8 map items, 6 top-level steps, 4 repeat-body steps; map
  items are literal strings in the document. "Every PDF in this folder" and "6 laptop options"
  (fine, ≤8) differ: the first needs list-from-folder.
- Change: add an input type "folder/files" that expands into map items at run start (a run-time
  `items from: input` and a cap, e.g. 20, with batching by 4). Or v1 honest copy: "up to 8 files
  at a time". Effort: M. Confidence: high on the limits, medium on how the change fits the journal.

**U3. Where does the output go?**
- Proposal ends with "final report shown in the run". Most real jobs (study guide, cleaned
  spreadsheets, a merged file) are *files*. Add a standard final card option "Save result as file
  [name/location]" — it's just a writer card with a known path — and show "Saved to ..." with Open
  in the finish state. Effort: S-M. Confidence: high this is needed.

**U4. Checkpoints with options (the user's own example) need a card that *produces* the options.**
- Proposal: options are "written by a card just before it". Engine has no structured output between
  cards except the repeat decision format. For options to render as buttons, the producing card must
  answer in a fixed shape (a list of titles + one-line summaries). Without it you get free text and a
  "Continue" button — which is fine and honest for v1. Say so. If options are in v1, the card needs
  a built-in "Give me N options" mode that the app parses and validates, with a fallback to plain text.
  Effort: M. Confidence: medium.

**U5. Loop didn't converge.** Say: pause at the cap with "Ran 3 times. Last findings: ... —
Run 2 more rounds · Edit the loop · Stop". The engine says "ask the assistant to revise the
plan"; for a builder, Continue-more-rounds is the natural button. Effort: S-M. Confidence: high.

**U6. Mid-run edits** — see Scenario C.4 and M3.

**U7. Mobile.** The proposal says phones can watch runs, editing "probably view-only". Make that
firm and design it: the phone's job is (1) get the red-dot notification, (2) read the checkpoint
results, (3) pick an option / Continue / Stop, (4) see spend. A rows-of-cards editor on a phone is
not v1. A rows-of-cards *read* view works on a narrow screen (cards stack; side-by-side becomes
wrapped chips). Also: a phone starting a run should be possible ("Run" on a saved workflow), since
that's the most natural remote action. Confidence: medium (assumes the remote UI shares the
renderer, as the project guide says).

**U8. Naming and words.** "Starts from: Explorer / Researcher / Reviewer / Worker" are internal
names; a student does not know "worker". Use job words ("Looks around the project / Looks things up
online / Checks work / Does the work") with the engine names as secondary. Confidence: high.

## Part 3 — Making it more useful (M), ranked by value vs effort

Ranked best first. "v1" = recommended inside the first release.

**M1. Starter workflows (3 included, matching Destin's 3 jobs) — v1. Value high, effort S-M.**
Ship build / compare-options / summarise-a-folder as files in the app. They teach the format by
example and solve the blank-page problem the landscape study says nobody should have. Also the
best material for the mockups and for the UX tester.

**M2. "Make a workflow from this chat" — v1. Value high, effort S.** A button/suggestion after a
long multi-helper chat ("Save this as a workflow"). Nothing in the proposal turns a good one-off
into a repeatable one except the assistant authoring a file on request.

**M3. Re-run one card / re-run from here — v1 for failed cards, v1.1 for finished ones. Value high,
effort M.** Retry-a-failed-card is already in the proposal (engine-supported). "Re-run this card
and everything after" is the natural answer to mid-run edits and output you dislike; the journal
keeps finished results so it is mostly engine-safe.

**M4. Result files as a first-class end: "Save result to" and a short results page — v1. Value high,
effort S-M.** See U3.

**M5. Compare outputs. Value medium, effort M — later.** Run the same card on two models side by
side and show both ("Which is better?"). The landscape study flags mixed local/cloud models as an
opening; comparison makes that choice visible. Do after the editor works.

**M6. Share via the marketplace — later (v1.2+). Value medium-high, effort M.** The Library /
Marketplace screens (`LibraryScreen.tsx`, `MarketplaceScreen.tsx`) and registry already move skills
and themes. Workflows are a natural third kind. Hold until the file format has survived real use
and input handling is settled; sharing a bad format is hard to take back. Safety review (a shared
workflow can say "run commands" — the permission cap "never more than the app's permission mode
allows" must be shown on install).

**M7. Run from a YouCoded Page — later (needs Pages phase 3). Value medium, effort M after phase 3.**
The landscape study says Pages cannot run agents yet. Don't plan around it for v1; design the run
API so a Page can call "run workflow X with inputs" later.

**M8. Plain-language run summary at the end ("what happened, what it cost, what changed") — v1.
Value medium, effort S.** The final report is the last card's output; a user also wants a "receipt".

**M9. Schedules — already ruled "later" (Q-10). Keep out.** But store `inputs` so a schedule can
fill them: designing inputs now makes Autonomous Assistants easier.

**M10. Estimate that tells you which card costs the most. Value medium, effort S.** The estimate
engine (`plan-estimate.ts`) works per step; show the per-card figures in the editor so people choose
cheaper models where it matters. This is a competitive opening per the landscape study.

## Part 4 — Contradictions, risky assumptions, unsupported claims (X)

**X1. Approvals with no chat.** Child approval prompts route to the parent chat's permission card
(`child-ask-router.ts`: "re-register on the broker under the PARENT's sessionId"). A run "that does
not need a chat" has no parent chat. Also the permission fingerprint, folder and model come from the
parent (`PlanHostPort`). The proposal says the red attention dot will be reused, but the dot belongs
to a chat. Effort to resolve: part of S2. Confidence: high that this is unaddressed.

**X2. 30-helper lifetime cap and 4-at-once cap are per chat, not per run.**
`SPECIALIST_SPAWN_BUDGET_PER_SESSION = 30` and `HOSTED_MAX_CONCURRENT_SPECIALISTS = 4` in
`specialists/limits.ts`. A build loop is ~18 helpers per three rounds (Scenario B). Also the plan's own
cap (6 top-level steps, 8 items) is lower than the proposal's examples imply. Change: make the
budget per run (cap e.g. 60 with a visible counter) and show a "this will use about N helpers"
line beside the estimate. Effort: S-M. Confidence: high (constants read).

**X3. Proposal's own job #3 and the "Research" job vs limits.** "Summarise every PDF in this folder"
and "clean these 4 spreadsheets and merge" exceed what a literal map can do (U2). The doc says the
plans engine is "Steps run in order ✔, repeat max 5 ✔" but does not list the limits it inherits.
Add an honest "Limits in v1" box to the proposal.

**X4. Open question #2 is already answered by the engine.** Writers run one at a time. The decision
is not "do they collide", it is "how do we show that two write-cards in a row run in sequence",
and whether to *forbid* two writers in a row to avoid confusion. Recommendation: allow, show a small
"one after another because they change files" label, and keep the "parallel builders in separate
copies" idea (plans stage 3) out of v1. Confidence: high (executor header and `width` line).

**X5. "Per-card allowed actions" is smaller than it looks only if you keep the existing envelope.**
A child's rights = parent's rights, capped by the specialist definition's allowed tools and charter
(read-only vs read-write). So per-card checkboxes can only *remove* abilities, never add; and "Use
the web" depends on whether the parent has it. Say that in the card panel ("This card can't do more
than your app's permission mode allows" is there; make it visible as disabled checkboxes with a
reason). Also the engine's step `specialist` field is a 4-value enum
(`explorer|researcher|reviewer|worker`), so "one of *your* specialists" in "Starts from" requires a
schema change, not just reuse. Confidence: high on the enum, medium on how big the change is.

**X6. "The plans estimate, already built" and "ahead ~1,430 commits / 40 conflicting files."**
The proposal calls the engine reuse "the first technical task" but plans it as an item in a list. It
is a major risk: the branch's schema has numbered decisions, a v2 journal format with a retired v1
reader, and chat-only assumptions. Treat "engine on master, behind a flag, tested" as its own
milestone with a go/no-go before any editor work starts. Confidence: high.

**X7. The assistant's `propose_plan` rules vs "assistant edits the file".** The plans work has a
firm rule: the assistant *never decides a step's model* (decision 35.4; the schema says "Do NOT set
this yourself for any reason"). Letting the assistant write/edit a `.workflow` file freely bypasses
that unless the write path enforces the same rules. Make "Ask the assistant" edits go through the
same validator and strip model/tools choices the user didn't ask for (or show them as highlighted
changes needing a click). Confidence: high on the rule, medium on enforcement.

**X8. "Highlighting what changed" after an assistant edit** is promised but not designed. Needs a
file-diff of two documents — easy for steps by id, harder for reordering. Confidence: medium. Effort M.

**X9. Spending claims.** "The same number as the cost chip" and "Subscription and local models show
tokens" are carried over from the plans card. Fine, but a run without a chat has no chat cost chip;
show spend in the run header and in the Workflows list, and decide whether a run's cost is also added
to the starting chat's total. Confidence: medium.

**X10. Internal inconsistency: "A workflow is a file" vs "Workflows screen lists every workflow the
app knows about".** How does the app *know* about files in arbitrary project folders? A scan of
every project folder is a performance and privacy question; a registry of "seen" files means a
workflow can vanish from the list when a folder moves. Change: the screen lists workflows in the
personal folder plus those in the open/known projects, plus anything opened or run once. Effort: S-M.
Confidence: medium.

**X11. Android parity.** Proposal says the phone "runs the desktop engine now". Repo guidance asks for
parity checks after IPC changes; every new channel (create workflow, run, answer checkpoint) must be
served to the phone through the one channel table (`ipc/channel-table.ts`). Cheap if done in the same
change; costly to retrofit. Confidence: high.

**X12. Words check against the app's rules.** "Workflow", "card", "row", "checkpoint", "bracket",
"inputs" are all new vocabulary. The project guide asks for accessible words ("files", not
"artifacts"). Suggest user-facing: "Saved job", "step", "Ask me first", "Repeat". Not blocking;
decide before mockups so the mockup text is final. Confidence: medium.

---

## One-line index

- S1 Ship the Workflows screen as the editor; Files panel gets only a small summary viewer in v1.
- S2 The "standalone owner" is the hardest part; use a background chat session for each run.
- S3 Extend the existing plan document instead of inventing a second format and validator.
- S4 One component, three states (edit / running / paused), not separate editor and run view.
- S5 Different cards in one row is the costliest new engine change; v1 = one card with several items.
- S6 Draw repeat as a container row, not a bracket, and explain how the loop decides.
- S7 Inputs: plain named text placeholders only in v1.
- S8 Don't write run folders into projects; keep the journal where it is.
- S9 Reuse the specialist chip and status line for live activity.
- U1 No first-time discovery path; add starter cards, empty-state and assistant-made first workflow.
- U2 "Every file in a folder" and wide fan-out exceed the engine's 8-item list; needs a run-time list.
- U3 Output should be a saved file with "Saved to...", not only a report on screen.
- U4 Checkpoint options need a fixed answer shape or fall back to plain text.
- U5 Loop that never converges needs "run more rounds / edit / stop".
- U6 Changing a card mid-run is unspecified; define pause, edit unrun cards, resume.
- U7 Mobile: make it firm that phones watch, answer checkpoints and start runs; no editing.
- U8 Replace developer words on the card panel with job words.
- M1 Starter workflows for the three jobs (v1).
- M2 "Save this chat as a workflow" (v1).
- M3 Re-run a card / from here (failed card v1, finished later).
- M4 Save results to a file as a standard last step (v1).
- M5 Compare outputs of two models (later).
- M6 Share workflows through the marketplace (later).
- M7 Run from a Page (needs Pages phase 3; later).
- M8 End-of-run receipt (v1).
- M9 Keep schedules out; store inputs so they fit later.
- M10 Per-card cost in the editor (v1, cheap).
- X1 Approvals, folder and permissions belong to a chat; none exist for an ownerless run.
- X2 30 helpers per chat and 4 at once block ordinary loops (about 18 for 3 rounds).
- X3 The proposal's first-job examples exceed inherited limits; add a "limits in v1" box.
- X4 Writer cards already queue; the open question is answered, only the label is needed.
- X5 Per-card actions can only restrict; the specialist field is a four-value list, so custom specialists need a schema change.
- X6 Bringing the plans branch over is a major milestone with a go/no-go, not one list item.
- X7 The assistant must not choose models/tools when editing files; route through the validator.
- X8 "Highlight what changed" after an assistant edit is not designed.
- X9 Spend display without a chat needs its own home.
- X10 "Every workflow the app knows about" is undefined for files in arbitrary folders.
- X11 Phone channels must be added with the desktop ones.
- X12 Pick the plain user-facing vocabulary before mockups.
