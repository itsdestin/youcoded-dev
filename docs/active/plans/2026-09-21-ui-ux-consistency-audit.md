---
status: active
date: 2026-09-21
revised: 2026-09-22
owner: Destin (taste and acceptance) / assistant (research, proposals and implementation)
related: docs/active/design/2026-08-25-ui-design-guide.md, docs/roadmap/user-interface.md
---

# Rebuild the UI design guide and align the app

## Outcome

Produce **both** (1) a concise design guide that future sessions can use to reliably
match Destin's taste and (2) approved improvements to inconsistent or unappealing app
surfaces. Every normative visual/UX instruction in the replacement guide must be shown
in its final wording and explicitly approved or edited by Destin. Current UI, prior
answers and the existing guide are inputs for proposals, not automatic authority.

Do not put technical safety, accessibility or functional correctness up for an aesthetic
vote. Existing contrast, keyboard, mobile-reachability and platform constraints still
apply. Keep the current guide available until the replacement is approved and its
consumers have switched; then archive it.

## Outputs

- **Evidence inventory** in `docs/active/design/`: verified captures, app patterns,
  counterexamples, coverage limits and known UI issues. This is research, not rules.
- **Rule ledger** in `docs/active/design/`: one stable ID and revision per proposed rule,
  exact wording, examples, conflicting surfaces, exceptions, impacts, decision status
  and the submitted answer that approved the final revision.
- **Small visual decision decks** with tracked `.answers.json`: Destin can accept,
  reject or edit each rule and independently decide what should happen to affected UI.
- **Replacement** `docs/active/design/2026-08-25-ui-design-guide.md`: approved
  principles, useful role-specific recipes, app examples, exceptions and a short
  builder checklist. No unapproved normative text.
- **Accepted app changes** with before/after decks and narrow, effective regression
  checks where a behaviour can actually be pinned.

## Execution

### 1. Gather current evidence

Resume the isolated workspace with
`node scripts/workspace-start.mjs --session ui-consistency-audit youcoded`; use its
returned app worktree. Read `docs/MAP.md`, relevant path rules, the app instructions,
`scripts/ui-review/README.md` and `.claude/rules/{feature-flow,review-deck}.md`.
Inspect every normative claim in the existing guide, including its unnumbered prose,
checklists and exceptions. Look up prior answers, UI findings, components, guards and
`docs/roadmap/user-interface.md` when they help establish what exists or avoid
reopening an already settled issue. An old claim or implementation is not approval
of its wording for the new guide.

Run one baseline Workbench sweep from the **app worktree** with
`bash scripts/ui-review/run-review.sh <absolute-app-worktree> <absolute-output-dir> midnight,light,halftone-dimension,meadow-mist,creme,dark`.
Read the new run's `coverage.md` before judging pictures; unverified screens remain
unreviewed. Record desktop, shared Android renderer, narrow remote layout and
platform-specific limits honestly. Inspect motion, hover and touch with an operable
isolated dev/Workbench surface where needed; static images do not prove them.
Never inspect or modify the running built app through DevTools or IPC.

### 2. Identify patterns and propose rules

Review by *visual role*: hierarchy/type, depth and containers, cards versus rows,
buttons and states, headers, menus, dividers, motion, themes and narrow layouts.
For each role, compare a strong existing example with an inconsistent or less
appealing one and any intentional exception. Cite screen, theme, capture and source
path. Search the app worktree before claiming a pattern is universal or absent.
Use independent read-only reviews by role if useful, then deduplicate findings;
run the cross-theme check on the merged findings, not in parallel with discovery.

Draft a **new, compact set of principles and role recipes**, not a renamed copy of
the old guide. For every candidate, record:

1. Stable ID/revision, exact actionable wording and why it should help.
2. Real app example and credible counterexample, with capture and code reference.
3. Named existing surfaces it would change; what might stay as an explicit exception;
   theme, mobile and accessibility consequences. If no conflicting surface was found,
   record the actual search and capture scope rather than claiming none exists.
4. Proposed treatment for each conflict: change UI, narrow the rule, allow an
   intentional exception or reject the rule. Keep this choice distinct from the
   rule's approval.
5. Status `proposed | needs-revision | approved | rejected | deferred`, answer
   source `<deck-key>#<step-id>` and implementation status separately.

If a rule needs many arbitrary exceptions, soften, split or discard it. Do not invent
a universal `Card` or `Divider` merely to reduce class-name variety. Taste rules
may be valuable even when only a visual review can enforce them; guards are for
precisely testable behaviours.

### 3. Get Destin's decision on every rule and visible change

Begin with a **small calibration deck** covering headers/type, separators and
cards/rows; improve the presentation based on his feedback before making more
decks. Use one independently editable step per rule. Each step shows exact final
wording, a real app example, a contradictory surface, the practical effect of Yes
and No, and any proposed exception. Use Choice/Decide/Live/Clip for a visual choice
and Question for a policy choice. Do not present taste as a measured defect.
Group related steps into short decks rather than one overwhelming questionnaire.
Preview each deck and read its contact sheet before serving it. Preserve submitted
answer files; never rebuild an answered deck in place.

A Yes approves only the wording and consequences shown in that step, **not all
possible UI refactors**. If a note or an `Other` answer changes the meaning, draft
a new revision and ask again. Do not include unanswered, rejected or deferred
rules in the guide. Show Destin the assembled final wording, examples and
exceptions and ask whether the guide works as a whole; this sign-off does not
substitute for the individual rule decisions.

### 4. Check that the guide transfers to new work

Before guide-level sign-off, ask fresh builders to make **three review-only
YouCoded Pages UI prototypes**, each from a fixed brief and realistic fixture data:

| Prototype | Required content | Taste probe |
|---|---|---|
| Smart home | Rooms, device controls, a scene and an alert | Calm density, status colour and action safety |
| Git / PR / branches | Branches, a PR awaiting review, changed files and a risky action | Technical hierarchy, rows/cards and action priority |
| Social / messaging | Conversations, unread state, thread, compose and an empty/error state | Warmth, message rhythm and narrow layout |

Give each builder only the **candidate guide**, Pages style kit/runtime instructions
and its brief/fixture—not the rule ledger, earlier prototypes or Destin's private
feedback. Preserve first attempts. Render the results **inside an isolated themed
Workbench Pages frame**, in contrasting dark/light and wallpaper themes and at phone
width; check meaningful interaction and overflow. These are prototypes, not installed
sample Pages: no real devices, GitHub or messaging connections, persistent Pages,
marketplace entries or changes to Destin's running app.

In a review deck, let Destin judge each prototype separately: **does this look like
his taste, and does its layout work for the task?** Distinguish a guide failure
from a missing fixture or broken implementation. For a taste mismatch, identify
the missing/ambiguous/wrong rule, propose exact revised wording, get his approval,
and have a fresh builder retry the affected brief unaided. Recheck other examples
if the revised rule applies broadly. Do not manually polish a failed prototype
and call it a successful guide test. Keep verdicts and first-pass results; discard
prototypes afterwards unless a separate product decision authorizes shipping them.

### 5. Publish the guide and improve existing UI

Publish only after every normative line matches an approved ledger revision, the
three prototype verdicts are resolved, and Destin approves the assembled guide.
Include an opening taste summary, compact principles, role recipes, **do/avoid**
app examples, justified exceptions and a usable before-review checklist. Link to
current primitives and tokens instead of copying their source. Have a fresh
reviewer apply the guide to held-out app screens; reopen any rule it misreads.
Archive a copy of the old guide, replace the active guide at its existing path,
then verify references in `docs/MAP.md`, `.claude/rules/feature-flow.md`, the
UI-review README and other actual consumers. Update only pointers that need it;
no draft is presented as published authority.

Turn approved rule impacts and separately approved UI decisions into **small fix
batches**, starting where a shared component genuinely governs several surfaces.
Preserve different treatments for different jobs rather than enforcing visual
uniformity for its own sake. Include these concrete decisions in the review:

- **Session Files:** compare its current file rows with Project Files preview cards;
  decide the shape from the available content and task, and decide separately if
  the phone's `RemoteFileCard` should change.
- **Separators:** show Settings and representative cards/dialogs with inset-stop,
  tapered and no-line alternatives. Separate decorative rules from structural
  boundaries and Markdown content before setting a general rule.
- **Button placement:** show the proposed rule with real cards/dialogs and ask
  Destin to approve its final wording and affected screens.

For each batch use the workspace feature flow: mockups and review deck, answered
contract, reviewed implementation and before/after acceptance. Capture affected
themes and narrow width; test real behaviour in an isolated dev instance when the
Workbench is insufficient. Run `bash scripts/verify.sh <app-worktree>` for desktop
changes and applicable Android checks. A new guard must fail when its **real**
guarded site is broken; avoid broad source rules that cannot distinguish a
decorative border from a structural one. Link known roadmap issues rather than
re-reporting them, and file genuinely deferred work using the roadmap's Filing test.

## Completion gates

1. **Evidence:** current coverage and gaps are stated; candidates have real app
   examples, counterexamples and named affected surfaces.
2. **Rules:** every final normative instruction and exception has a submitted
   answer for its exact revision; no unresolved candidate is silently included.
3. **Transfer:** Destin has reviewed all three blind Pages prototypes; guide-level
   taste failures have an approved revision and fresh independent retry.
4. **Guide:** Destin accepts the assembled reference; held-out review shows no
   unresolved contradiction; consumers point to the replacement.
5. **App:** each agreed fix batch has verified before/after evidence, relevant
   platform checks and a submitted acceptance answer. Do not call the entire app
   consistent while agreed batches remain open.

An unanswered decision pauses only its rule or change, not independent research.
If implementation exposes a counterexample to an approved rule, show it and ask
again before changing the rule's meaning. Do not merge, push, deploy, touch the
live app or run paid evaluations as a side effect of this plan.
