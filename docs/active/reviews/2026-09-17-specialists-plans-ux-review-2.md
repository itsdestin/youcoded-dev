# Specialists / Plans UX review 2 — 2026-09-17

Beta-tester pass over the plan lifecycle (proposed → running → paused → asking →
failed-reply → interrupted → completed → approximate cost) plus the Specialists
panel and one phone-width check. Driven with `scripts/ui-review/shot.mjs` against
`http://localhost:5653/?mode=workbench&child=1&view=app&scenario=default&latency=150`
(workbench, simulated backend), second conversation tab.

- U1 rejected — (rejected — workbench artifact: the fixture conversations are seeded mid-reply and the fake backend never finishes that reply, so the thinking indicator stays; not plan behaviour) — Expected the "thinking" chip under the chat (the pill that says a word like
  "Stewing"/"Untangling"/"Embellishing"/"Noodling"/"Cogitating"/"Consulting the
  vibes"/"Marinating"/"Percolating"/"Pondering") to go away once the assistant
  actually answers, hits an error, or the plan finishes / gets paused for me /
  I approve it — instead it is showing, unchanged in behavior, in **every single
  plan state I loaded**: proposed, running, paused, asking, ask-failed (after a
  529 error), interrupted, completed, and even right after I clicked Approve.
  It never resolves into a real status and sits with a large empty gap below it.
  A first-time user has no way to tell "this is decorative/always-on" from "this
  looks stuck" — this is the single most confusing thing I saw. — theme contrast
  pass tab, all states — screenshots: `/tmp/claude-1000/-home-destin-youcoded-dev/a06dfaab-5d1b-449e-adb9-c62c5d0f19de/scratchpad/ux2/out-completed/midnight/01-completed.png`,
  `/tmp/claude-1000/-home-destin-youcoded-dev/a06dfaab-5d1b-449e-adb9-c62c5d0f19de/scratchpad/ux2/out-ask-failed/midnight/01-ask-failed.png`
- U2 rejected — (rejected for now — one-click Ask was the owner's choice (decision 19); the expectation of a typed question and the rename proposal go to the owner as a question, since they change meaning) — Expected "Ask the assistant" (the button on a paused plan) to let me type
  a question / say what I want, the same way "Comment" on the proposed plan opens
  a text box — instead it fires immediately with no text field at all, the plan
  header changes to "the assistant is looking into this," and a canned line
  "You asked the assistant about this plan." appears above my original message.
  I never got to ask anything specific. Rename it to something like "Let the
  assistant decide" so it's clear no typing happens. — theme contrast pass tab,
  paused plan — `/tmp/claude-1000/-home-destin-youcoded-dev/a06dfaab-5d1b-449e-adb9-c62c5d0f19de/scratchpad/ux2/out-paused2/midnight/01-ask-assistant.png`
- U3 accepted — (accepted — step-line usage text must wrap or shorten at phone width, never clip) — At phone width (390px), the running/paused plan card truncates step-line
  token counts off the right edge — step 1's line reads "2 of 3 reviewers done ·
  27,0" with the rest ("00 tokens") clipped by the screen edge, not wrapped or
  shortened. — theme contrast pass tab, phone width, paused plan —
  `/tmp/claude-1000/-home-destin-youcoded-dev/a06dfaab-5d1b-449e-adb9-c62c5d0f19de/scratchpad/ux2/out-phone6/midnight/01-select-tab2-phone.png`
- U4 rejected — (rejected — not a product finding (the test script matched two controls by a shared word; the controls are distinct and labelled)) — Clicking the bottom-bar "N specialists working — click to manage" chip
  worked well and is worth calling out as a place a plain click could go wrong
  in a future change: my first automated click on any button whose text merely
  *contained* the word "specialists" landed on the unrelated "specialists demo"
  tab in the top tab strip instead of the status-bar control, because both
  elements contain that word. Once I used the precise control (aria-label
  "2 specialists working — click to manage") it opened a clean modal listing
  each specialist by name with Note/Stop, a "Briefing" section and an "Activity"
  log (Thinking / Read a file / Reading a file) — no functional bug found here,
  flagging only because the two same-worded controls sit close together and a
  sighted user scanning quickly could misclick the same way. — bottom status bar
  — `/tmp/claude-1000/-home-destin-youcoded-dev/a06dfaab-5d1b-449e-adb9-c62c5d0f19de/scratchpad/ux2/out-running7/midnight/01-activity-expand.png`
- U5 accepted — (accepted — "its 9,000 tokens limit" → "its 9,000-token limit" (and the same pattern in the spend line)) — Wording: the plan step detail text "Each reviewer stops at its 9,000
  tokens limit." is missing an apostrophe-s/plural agreement — reads like a
  typo ("its 9,000 tokens limit" instead of "its 9,000-token limit"). Small,
  but noticeable in a cost-transparency sentence meant to build trust. —
  proposed plan, step 1 expanded — `/tmp/claude-1000/-home-destin-youcoded-dev/a06dfaab-5d1b-449e-adb9-c62c5d0f19de/scratchpad/ux2/out3/midnight/01-expand-step1.png`
- U6 rejected — (rejected — app-wide thinking words, not part of this branch; out of scope) — Wording: some of the "thinking" chip's words are above a plain-language
  bar for a non-developer audience — "Cogitating" and "Consulting the vibes" in
  particular. If this indicator is meant to stay (see U1), simpler options like
  "Thinking" or "Working on it" would read clearer to more people. — same
  screenshots as U1.
- U7 rejected — (rejected — praise, not a finding) — Good pattern, no bug: the "ask failed" state shows a specific, honest
  error — "The assistant couldn't answer your question: The provider returned
  an error (529: overloaded)." — with a single "Retry" button, matching the
  app's own error-message standard (specific cause + retry). Calling it out
  because it's a contrast to U1/U2 above, not a problem. —
  `/tmp/claude-1000/-home-destin-youcoded-dev/a06dfaab-5d1b-449e-adb9-c62c5d0f19de/scratchpad/ux2/out-ask-failed/midnight/01-ask-failed.png`

Could I complete the task: yes — I read a proposed plan, commented on it, approved
it, watched it run, opened the Specialists panel and saw individual specialist
detail, and worked through paused/budget/ask/ask-failed/interrupted/completed/
approximate-cost states plus one phone-width pass. The single most confusing
moment was the "thinking" chip (U1): it never went away in any state I tested,
including a completed plan and a failed error, so I could not tell whether it
meant "something is happening" or was just decoration — that ambiguity is worse
than either answer on its own.
