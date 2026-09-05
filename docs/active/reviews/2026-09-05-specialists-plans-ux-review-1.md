---
status: draft
feature: specialists-plans
run: 1
date: 2026-09-05
tester: context-free UX tester (workbench, simulated backend)
screenshots: /home/destin/youcoded-dev/scratch/plans-ux-review-1/
---

# Specialists plans — UX tester run 1

Task: review everything that changed in a module before a release; read the plan card, approve or comment, watch it run, see budget-exhausted / app-restarted / finished, and turn on the "Plans" setting under Settings → Specialists. Widths 1440 and 390; themes midnight, light, halftone-dimension. Screenshots: `/home/destin/youcoded-dev/scratch/plans-ux-review-1/` (paths below are relative to it).

## Findings (most important first)

- U1 — Pressing Enter in the plan's Comment box (and in a worker's Note box) should send the comment / I was thrown into a different conversation ("fix chat scroll stick"); the comment left no trace — when I came back the card was still "waiting for your approval" with no new plan — plan card, Comment box — out-p21/midnight/85-comment-sent.png, out-p21/midnight/86-comment-back-to-pill.png, out-p6/midnight/42-running-note-typed.png
- U2 — Clicking the "Run small plans without asking" switch with the mouse should flip it / the whole Settings panel closed on the click, so I could not see whether it turned on (a scripted check afterwards showed the switch itself does stay on when reopened, so it is the click that misbehaves) — Settings → Specialists → Plans — out-p14/midnight/64-specialists-page.png, out-p14/midnight/_unverified/65-plans-on.png
- U3 — "Run small plans without asking — A plan under the limit starts on its own" and the auto-run card's "Ran without asking — under the limit you set in Settings" / there is no limit anywhere in Settings to see or set, so I cannot tell what "small" means or change it — Settings → Specialists → Plans; auto-approved card — out-p14/midnight/64-specialists-page.png, seeds/midnight/seed-auto-approved.png
- U4 — After commenting, the old card says "revised — see the new plan below" and "Revised after your comment — the new plan is below." / nothing is below it; the same card also shows a "STOPPED" tag next to "revised", a check on step 1 with "24,600 tokens" while the total says "Used 0 tokens", and unexplained filled-dot icons on steps 2 and 3 — revised card — seeds/midnight/seed-revised.png
- U5 — When the plan finishes I expected the ranked list I asked for, or a link to it / the finished card only shows times and token counts and nothing follows it; the outcome of the whole plan is not reachable from the card — finished card — seeds/midnight/seed-completed.png
- U6 — After Approve (and after Continue, and after Add budget → Continue) I clicked the conversation's own tab at the top and expected the running plan / the card went back to its earlier state (waiting for approval, interrupted, paused) as if nothing had happened; this may be the simulator re-seeding on tab click, but if it is real it is the worst bug here — plan card after Approve / Continue / Add budget — out-p20/midnight/80-approve.png vs out-p20/midnight/81-approve-back-to-pill.png, out-p22/midnight/88-continue-back-to-pill.png, out-p23/midnight/90-addbudget-back-to-pill.png
- U7 — After Add budget → Continue the header says "step 1 of 3" and the limit rose to 50,000 / the third reviewer still reads "Stopped after 3m 45s · 9 steps — the assistant can pick this back up" and step 1 still says "2 of 3 done"; nothing on the card shows that anything actually resumed — paused card after Continue — out-p23/midnight/89-addbudget-continue.png
- U8 — "Paused — the review step reached its 27,000-token cap with 2 of 3 files done. Nothing is spent past the ceiling you approved." / step 1 reviews SIX files with THREE reviewers, so "2 of 3 files" is wrong (it is 2 of 3 reviewers); and one idea is called budget, limit, cap and ceiling within one card. Propose: "Paused — step 1 hit its limit with 2 of 3 reviewers done. Nothing is spent past the limit you approved." and use "limit" everywhere (button: "Raise limit") — paused card — seeds/midnight/seed-paused.png
- U9 — "tokens" appears on every line ("up to 27,000 tokens", "Used 11,200 tokens · $0.03 of up to 40,000 tokens (about $0.12)") / a college student does not know what a token is; the dollar figure is the part they understand. Propose: show only "up to about $0.12" on the card and keep token counts inside the expanded step; for the on-your-computer model, "no published price" → "free — runs on your computer" — all plan cards — out1/midnight/01-proposal.png, seeds/midnight/seed-proposed-local.png
- U10 — The running header says "step 1 of 3" and the line under it says "1 of 3 done" / two "of 3"s next to each other mean different things (steps vs reviewers); propose "1 of 3 reviewers done" — running card — seeds/midnight/seed-running.png
- U11 — "Stop the plan" should look like a button / it is plain text with no border, unlike Approve, Add budget and Continue; I thought it was a label — running card — seeds/midnight/seed-running.png, out-p20/midnight/80-approve.png
- U12 — Worker names should be spelled the same everywhere / a freshly approved plan shows "Wren the reviewer", the running / paused states show "Wren the Reviewer" — running card — out-p20/midnight/80-approve.png vs seeds/midnight/seed-running.png
- U13 — "Note" next to each working reviewer: I could not tell what it does before clicking (a note to whom?) / it opens a message box to that reviewer; propose "Send note" — running card — out-p6/midnight/41-running-note.png
- U14 — "Writing the plan · 1m 22s. The assistant thinks through the steps before it writes them — on a model running on your computer this can take a few minutes." (27 words) / propose "Writing the plan · 1m 22s — a model on your computer can take a few minutes." — writing card — seeds/midnight/seed-writing.png
- U15 — "The app closed while this plan was running. 2 of 3 steps finished and their results are kept; Continue runs only what is left." / propose "The app closed mid-plan. Steps 1–2 are saved; Continue runs step 3." — interrupted card — seeds/midnight/seed-interrupted.png
- U16 — Finished card says "finished in 6m 52s" in the header and "Finished in 6m 52s · used 33,600 tokens · $0.10 of up to 40,000 tokens" in the footer / same fact twice; propose header only, footer "Spent $0.10 of about $0.12" — finished card — seeds/midnight/seed-completed.png
- U17 — Expanding step 3 shows "Each worker gets up to 4,000 tokens; that cap is enforced, not estimated." / "enforced, not estimated" is developer talk; propose "Each worker stops at its 4,000-token limit." — finished card, step 3 — out-p7/midnight/50-completed-expand-step3.png
- U18 — Add budget opens "Allow [10000] more tokens (about $0.03) Continue Cancel" / the number has no comma while every other count reads "27,000"; and the box gives no hint what a sensible number is — paused card — out-p4/midnight/20-paused-addbudget.png
- U19 — Comment box placeholder "What should change? The assistant rewrites the plan and shows you a new one." / propose "What should change?" (the second sentence can be the Send button's tooltip) — Comment box — out-p21/midnight/83-comment-open.png
- U20 — Specialists page intro "Your assistant may utilize "specialists" to help it accomplish some tasks. This menu allows you to configure which specialists your assistant has access to. Click the (i) above for additional information." (37 words) / propose "Specialists are helpers your assistant can hire for parts of a task. Choose which ones it may use." Also "SPECIALIST INTELLIGENCE TIERS" and "Frontier" are jargon ("MODELS FOR SPECIALISTS", "Best"), and "Set to Claude Sonnet 4.6" repeats the picker right above it — Settings → Specialists — out-p14/midnight/64-specialists-page.png
- U21 — The proposal says "about $0.12 on Claude Sonnet 4.6" while the bar at the bottom says this chat runs on "Qwen2.5 Coder:14b" / I could not tell which model does the plan; propose "specialists run on Claude Sonnet 4.6" — proposal card — out1/midnight/01-proposal.png
- U22 — "3 reviewers · in parallel" / propose "3 reviewers · at the same time" — every plan card — out1/midnight/01-proposal.png
- U23 — At phone width (390) tapping a conversation in the "+10" list should show that conversation / the list stayed open covering the chat, and I could not reach the proposal at all (tapping "theme contrast pass" did nothing the tool could verify); the paused card was reachable and readable in all three themes, but its paused sentence wraps to five lines — narrow width — out-narrow/midnight/93-narrow-paused.png, out-narrow/light/93-narrow-paused.png, out-narrow/halftone-dimension/93-narrow-paused.png
- U24 — In halftone-dimension the small grey detail text ("3 reviewers · in parallel", "up to 9,000 tokens") is noticeably dimmer against the navy card than in light or midnight; the tool flagged 13–16 contrast failures on these two cards that I could not pin to one element — proposal and paused cards, halftone theme — out-themes/halftone-dimension/72-proposal-wide.png, out-themes/halftone-dimension/73-paused-wide.png
- U25 — The assistant's reply is stamped "2:04 AM" under my "7:40 AM" message / the reply appears to come before the question (likely fixture data, but a real user would notice) — proposal card — out1/midnight/01-proposal.png
- U26 — The thinking bubble under the card says "Stewing", "Noodling", "Ruminating", "Consulting the vibes", "Percolating", "Musing"… / with a plan card above it I could not tell whether the assistant was still doing something for the plan or just idle; propose one plain word ("Thinking") — under every card — seeds/midnight/seed-paused.png

## Could I complete the task?

Mostly. I read the plan, approved it and saw it start (80-approve), watched the running, paused, interrupted and finished cards, raised the limit and pressed Continue, and found and clicked the Plans switch. Two things I could not finish: leaving a comment (Enter threw me into another conversation and the comment vanished, U1) and confirming the Plans switch by eye (the click closed Settings, U2). The single most confusing moment was after commenting: a card that says "see the new plan below" with nothing below it (U4), right after having been dropped into a different conversation.

Not tested: touch input and a 1.5x-scaled screen (the tool cannot do either), and the plan header/step chevrons on the proposal card (my first attempt errored; the chevrons did work on the running and finished cards).

## Triage (implementing session, 2026-09-05)

- U1 rejected — the tester's tool opens a fresh page per screenshot, so pressing Enter landed on a session pill, not the box; verified by a scripted Approve → tab away → tab back that kept the plan running. The comment leaving no new plan is the mock: the assistant's rewrite cannot be faked honestly (deck P-3 says so).
- U2 rejected — same tool artifact; the switch is a real button with `role=switch` sitting under its own centre (checked with elementFromPoint), and the tester's own follow-up found it stays on.
- U3 accepted — the limit line now shows even while the switch is off (greyed, not editable), so "small" always has a number beside it.
- U4 accepted — a revised plan no longer wears the stopped tag; the revised fixture's steps are all "not started" with nothing spent.
- U5 accepted (fixture) — the finished conversation now shows the assistant's ranked list under the card; the card itself was never meant to hold the result.
- U6 rejected — tool artifact, see U1.
- U7 accepted (mock) — after Add budget → Continue the stopped reviewer goes back to work on the card.
- U8 accepted — "2 of 3 reviewers done"; one word, "limit", for the cap in every sentence; the button stays "Add budget" because that label was the answer on the questions deck (Q-6).
- U9 accepted in part — the dollar figure now leads when the model has a price ("Up to about $0.12 (40,000 tokens)"); the token limit stays on the card because the spec fixes it there, and a model on your computer is described as having no published price, not as "free" — it occupies the engine.
- U10 accepted — "1 of 3 reviewers done".
- U11 accepted — Stop the plan is a bordered secondary button.
- U12 accepted (mock) — names capitalised consistently.
- U13 accepted — specialists inside a plan use the full "Send Wren a note / Stop" pair, not the popup's compact "Note".
- U14 accepted — "Writing the plan · 1m 22s — a model on your computer can take a few minutes."; the clause is dropped on a priced (cloud) model.
- U15 accepted — "The app closed mid-plan. Steps 1–2 are saved; Continue runs the rest."
- U16 accepted — the footer no longer repeats the duration: "Spent $0.10 (33,600 tokens) of the $0.12 limit (40,000 tokens)".
- U17 accepted — "Each worker stops at its 4,000-token limit."
- U18 accepted — the amount shows a thousands comma and defaults to the paused step's own per-specialist cap.
- U19 accepted — placeholder "What should change?"; the rest is the Send button's tooltip.
- U20 rejected — the Specialists page intro and tier labels are Destin's own copy from the 1c workbench pass; out of this feature's scope.
- U21 accepted — the ceiling line says "specialists run on Claude Sonnet 4.6".
- U22 accepted — "at the same time".
- U23 already handled — the phone-width session list is the shipped app, not this card; the paused sentence is now shorter (U8).
- U24 accepted in part — the step detail text moved one shade up (fg-dim); the theme's own muted tone is the theme's call.
- U25 rejected — fixture clock.
- U26 rejected — the thinking chip's playful verbs are a shipped product decision.
