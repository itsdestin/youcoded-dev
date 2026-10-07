---
status: active
date: 2026-10-07
related: redesign-backlog.md row 13, submit-ticket-1.json, docs/roadmap/other-features.md (misc)
---

# Submit a ticket — where the guide helped, and where it didn't

First drafts of the redesigned "Submit a ticket" flow (Settings → Help & feedback → Report a
bug, review step included), built only from `guide-draft.md`, `decisions.md`, the backlog and
the workspace tooling. Deck: `submit-ticket-1.json` (before `runs/st-before`, after
`runs/st-after`; YouCoded, YouCoded Night, Midnight). Code: `ReportDesign.tsx`,
`ticket-practice.ts` (practice switches), screen states in `screens/settings.ts`.

References opened first (guide "How to use" step 2): **Marketplace → Plugin details** (a top
card about the subject, then labelled cards), **Session details** (the subject as read text in
a card, with its pill), **Settings → Account, signed out** (one sentence and its button inside
one card), **Backup & sync** (a problem notice with its own Show details / Try again inside,
at the right). Destin's earlier verdicts: `rest-sweep#RS-1` (the regrouping he approved, with
"some of the ux is still a bit odd"), `surface-levels#SL-12` ("grouped/arranged/displayed
differently. it just looks off"), and the signed 2026-09-10 contract rows R11–R23
(`docs/archive/design/2026-09-08-error-states-development/`).

## The flow today, step by step — and what is odd

Practice states shot for every step (`settings/development/bug-report#…`, 23 states).

| Step | What it shows | What is odd (guide rule) |
|---|---|---|
| Draft | "Your ticket" card: a tiny public-ticket line, then the Bug/Feature switch, Title, Description. "Include with ticket" card: three tick rows. A loose grey "Add a title and a description to carry on." and a full-width Review ticket. | 1. The first thing in the card is an 11px notice, above the choice that shapes the rest. 2. The reason line floats bare between the card and the button ("Text that describes a card lives inside it"). 3. Ticking "Screenshots or files" drops a grey notice OUTSIDE the card, between it and the button ("a notice about one thing sits inside that thing"). |
| Review | "Review your ticket": the SAME two editable boxes again (Bug/Feature gone); then bare "Error details and version" + a code line, bare "Recent logs" + a bare sentence + a log box, all on the popup; "Optional AI help" fold whose opened text and buttons sit bare too; Submit and Back stacked full width. | 4. Nothing reads as a review — it is the draft again, minus the one choice you can't see any more. 5. Three groups sit bare on the popup ("Nothing sits bare"). 6. The pieces have no shared shape (label/code/notice/textbox). 7. Two buttons stacked full width in a 600px popup (guide: side by side, filled right — the older R21 signed the stack). 8. AI help: two wide outlined buttons plus an 11px caption under only the second. |
| Sending | A spinner line alone in the middle of a shrunken popup. | 9. Centred status line, bare. |
| Sent / Finish in GitHub / Assistant on it | Two sentences and stacked buttons, bare. In "Finish in GitHub" the FILLED Done is under the outlined Open it again. | 10. Bare text; 11. order flips between the two screens. |
| Failed | A grey ErrorState box ABOVE the label, bold "Your ticket wasn't sent", a centred Retry; the Submit button vanishes from the bottom. | 12. Not the notice box; a centred button; the problem sits far from where you pressed. |
| Offline | The same, reading "getaddrinfo ENOTFOUND api.github.com". | 13. Machine words for "no network". |
| Hand-over failed | Headed "Your ticket wasn't sent" — no ticket was being sent — and its Retry SENT the ticket. | 14. A real bug: wrong words, wrong action. |
| From an error | Should start "This happened in Office."; Diagnose should open on review with AI help open. Neither happens. | 15. A real bug: every caller keeps the popup mounted, so the seed ran at mount, before any error. |

Not odd in the guide's terms but worth Destin's eye: the tick rows keep their checkbox at the
right beside an (i) — two small controls side by side (R18 signed that shape).

## Decisions, one by one

| # | What I did | Driven by |
|---|---|---|
| 1 | Draft: Bug/Feature first in the card; the public line moves to the card's foot and carries the "Add a title…" reason when the button is grey. | Odd 1, 2; guide "Text that describes a card lives inside it". **Guide silent** on where a "this will be public" disclosure goes. |
| 2 | Files notice inside the Include card, under its row. | Guide "Status and notices" (inside the thing it is about). |
| 3 | Review = a read-only "Your ticket" card (title + Bug/Feature `Pill`, description, "This ticket will be public on GitHub.") and a "Sent with it" card holding every attached piece; "Nothing else — only your title and description." when nothing is ticked. Edit only through Back to draft. | Odd 4–6; references Session details and Plugin details. **Behaviour-visible change:** the boxes are no longer editable on review (the logs box still is). |
| 4 | Three drafts of the review behind `?ticketReview=` (cards shipped / folded / onepage) → Choice ST-C1. | Brief: "how the review step presents what will be sent". `onepage` also tests "one page vs steps"; it puts AI help on the draft, against R17 — said on the slide. |
| 5 | AI help: a fold row; opened, one card with the disclaimer and two setting rows (what it does + a small outlined Rewrite / Start). Buttons keep their old names for screen readers. | Odd 8; guide "Text and buttons in one box"; R17 kept. |
| 6 | Footer: side by side at the right, Submit on the right; stacked full width (Submit on top) at phone width. Submit is disabled when the title or description is empty (Diagnose can open review with an empty draft). | Odd 7; guide "Buttons" (BP-1, BW-2). **Reopens signed R21** → ST-4. The disable is new and small (GitHub refuses an empty title anyway). |
| 7 | A failed send REPLACES the footer with the danger notice: GitHub's own words + "Your draft is still here.", Back to draft and Try again inside, no title. | Odd 12; guide "A problem replaces the card it is about", "no red titles". `ErrorState` is no longer used here (CLAUDE.md still names it; the guide's notice rule is newer). |
| 8 | No network: amber notice in plain words, ONLY when the computer reports no network (`useNetworkOnline`, Games' rule). | Odd 13; error-message standards. |
| 9 | Hand-over failures are told apart (`errorFrom`): their own sentence, and Try again retries the setup. | Odd 14 — bug fix, pinned. |
| 10 | Context applies when it arrives (effect), never overwriting typed words. | Odd 15 — bug fix, pinned; seen red first. |
| 11 | Outcomes (sending, sent, finish in GitHub, setting up, on it) are one card each, no label (single-card popup); two buttons share the width, filled on the right. | Odd 9–11; Account's sign-in card. |
| 12 | Marked `data-parts-agree` on the button pairs and `data-centres-agree` on the title + pill row. No findings. | Tooling. |

Nothing invented to my knowledge. One thing I first drew and removed: a thin vertical line to
the left of what a tick adds on the one-page draft — no recipe has it.

**What gets sent is unchanged.** Same fields, same evidence, same browser route for files. One
discrepancy found and asked, not changed (ST-Q1): the main process always appends
"Environment: YouCoded vX · desktop · <OS release>" to bug AND feature tickets
(`dev-tools.ts buildIssueBody`), even with "Error details and version" unticked, and nothing on
screen shows that line. Also seen: a bug ticket with logs unticked still carries an empty
"Logs" fold in its body.

## Tooling — did the latest tooling help?

| Tool | Verdict |
|---|---|
| Open-first steps with typing and ticking | **The big win.** Every state of a multi-step form (typed, ticked, reviewed, sent, failed, offline, handed over) with no switch in production code — 23 states from one list. |
| Practice switches (`ticket=hold`, `network=offline`, `refused`, `reportFrom=error`) | Easy to add in the mock; `hold` is the only way to photograph a state that lasts 0 ms. |
| Shooting the states was itself a review | It found two real bugs (15 and 14) that the 53 unit tests missed — both looked fine in tests because the tests render with the context from the start. |
| `waitMs` | Worked for "Your assistant is on it" (setup takes 2.5 s). |
| 1.5× shots, region crops, `"new": true`, per-deck preview | Worked. |
| Parts / centres agree | Marked; quiet. Cheap to add. |
| "Several designs of one screen" recipe | Worked; switch kept in its own file (`ticket-practice.ts`) so commits by path can't sweep another session's edits in `workbench-mode.ts`. |

## New friction

1. **A tall popup can't be a good before/after slide.** The ticket popup is ~740px tall; both
   pictures stack and only the top of "Today" is on screen until you scroll (ST-1…ST-3,
   ST-13). Cropping shorter hides the very change. The deck needs a side-by-side mode for tall
   crops (shrink to fit both), or a zoom-to-fit default.
2. **`highlight: "panel"` is refused on a close-up**, while every outcome slide warns
   "whole-surface change, name an element instead". The warning's advice and the refusal
   contradict each other; for a close-up of one popup "the panel" is exactly the element.
3. **One picture times out only under load**: `#small · youcoded` failed twice in the full
   72-picture run ("Runtime.evaluate timed out after 20s") and passes alone. Because a reshoot
   into the same `--out` rewrites the manifest (project-switcher round 2), the only fix is
   reshooting all 72. That state is left out of the deck.
4. **Open-first steps take the label at the time of shooting**, so a before run must be shot
   BEFORE the labels change; I added the states and shot "before" first. Worth one line in
   the README's "Several designs" recipe.
5. **The signed older contract (R17–R23) is not linked from the guide or MAP's design rows**;
   I found it only through test names (`R21:` in `report-screen-shape.test.tsx`). A redesign
   that reverses a signed row needs to know it exists before drawing.

## Left undone / unsure

- Android: shared React UI, no IPC change; not built or run here.
- Contribute screen untouched.
- The tick rows' (i) + checkbox pairing kept (R18).
- `#small · youcoded` picture not taken (friction 3); `#small-review` is in every theme.
- No UX-tester / code-reviewer run (short route; ask Destin).

## Proposed guide and tooling changes (most valuable first — not implemented)

1. **Guide: "a review before sending" recipe** — the item as read text in a top card (with its
   kind pill), then one "Sent with it" card listing every attached piece; edits go back a step.
   (Decisions 3–4; references Session details, Plugin details.)
2. **Guide: an action's failure replaces its buttons** — a failed send is the notice box where
   the buttons were, with Back and Try again inside it. Generalises "A problem replaces the
   card it is about" to a footer.
3. **Guide: where "this will be public" goes** — the card's foot, joined by the reason the main
   button is grey.
4. **Deck: fit two tall crops side by side** (friction 1).
5. **Deck: allow `"panel"` on a close-up of one screen**, or stop warning (friction 2).
6. **shoot: merge, don't replace, a run's manifest on a partial reshoot** (again; friction 3).
7. **MAP: link the 2026-09-08 ticket contract from the Help & feedback row** (friction 5).
