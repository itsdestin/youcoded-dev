---
status: shipped
date: 2026-09-23
---
# Handoff freshness: inline direction

## Decision sources

- `freshness.questions.answers.json`, F-1: wait for latest messages with an explicit saved-copy escape; ordinary offline opening unchanged.
- `freshness.review.answers.json`, F-2/F-3: remove Leave it; reduce confusing and repeated explanation.
- `freshness-simple.review.answers.json`, F-4/F-5: open the conversation tab and place waiting status above input; explain the consequence rather than an internal confirmation check.
- Following chat: Destin approved the tab-first proposal with “okay, this is fine,” after the assistant proposed drafting with Send disabled.
- `freshness-inline.review.answers.json`, F-6/F-7: rejected placement inside the frame/input container. Use a separate floating notice at the bottom of the chat panel, styled like the existing model-loading notice. Place **Try again** on the right, inline with the warning text.
- `freshness-floating.review.answers.json`, F-8/F-9: floating placement approved with a width revision. Both this notice and the local-model loading notice should span the chat width, like the context banner. Put **Continue with these messages** directly left of **Try again**, not on a separate row. These revisions were presented in the final width review.
- `freshness-wide.review.answers.json`, submitted 2026-09-23 10:20: **F-10, F-11, F-12 all yes**. Full-width floating handoff notices, action order, and matching local-model loading width are visually approved. This is the UI contract for backend integration.

## Visible behavior

1. After explicit takeover consent, open a pending conversation tab displaying saved messages. No modal waiting screen, no duplicated preview, no extra Leave it action.
2. A separate floating notice at the bottom of the chat panel, above but outside the normal input/frame container: **Still syncing recent messages, this may take a moment.** Follow the existing model-loading notice's surface and positioning conventions, but span the chat column's available width with the context banner's side inset. Widen the local-model loading notice to match; neither should extend into an open drawer.
3. Users can draft while waiting. Both Send and keyboard submission remain blocked; the draft is not queued for automatic sending.
4. If freshness cannot be established, use the same floating notice: **This conversation may have newer messages on your other computer.** At the right of the text row, place **Continue with these messages** (secondary) directly left of **Try again** (primary). On narrow widths the action group may wrap together below the copy; do not separate or reverse the two actions.
5. Retry preserves the pending tab and draft. Successful preparation removes the strip and allows sending only after backend admission. Continue chooses the saved-history fallback, not proof of freshness or ownership.
6. The normal tab close remains available. Closing cancels pending local opening; it cannot reverse a stop already requested on the old computer.

## Safety and scope

A visible tab is not a writer. The future backend must not start a native harness or Claude Code writer solely because the renderer created a tab. Existing takeover/force consent and competing-writer checks remain required for both confirmed and fallback startup. New arrivals must not silently replace the history of a runtime already started from the saved copy.

The warning is an explicit-handoff recovery state, not a general offline warning and not a claim that data was lost. Causes can include delayed final upload, failed download, missing compatible transfer evidence, or expiration of the confirmation wait. Display only the known consequence, not a guessed cause.

The approved renderer/workbench prototype is implemented and desktop verification passed. Backend freshness proof, real transfer timing, pending-tab startup/cancellation integration and isolated cross-device verification remain unimplemented. The next stage wires this approved UI into the existing handoff/admission architecture.

## Change ledger

| Review | Outcome |
|---|---|
| F-2/F-3 | Superseded: verbose modal with duplicate preview and Leave it |
| F-4/F-5 | Superseded: short modal; user requested tab-first inline feedback |
| F-6/F-7 | Superseded: strip inside input chrome; user requested a floating chat notice and right-aligned retry |
| F-8/F-9 | Floating placement approved with revisions: full chat width for both notices; Continue directly left of Try again |
| F-10/F-11/F-12 | All approved: full-width waiting/recovery notices, Continue left of Try again, full-width model-loading notice |
