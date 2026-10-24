---
status: shipped
date: 2026-10-18
work-item: 39
shipped: https://github.com/itsdestin/youcoded/pull/636
commit: f61cab2eea49ab5a932a91a8b8d1ac993585f26c
---

# File comment popup

Destin requested frosting on the Add a comment box and a fix for clicks that create no visible typing box. He approved the small-change route in chat.

## Findings

- `NewCommentPopover` already used the shared `OverlayPanel`, but lived inside the viewer’s backdrop/mask ancestors. The text-document before/after capture shows sharp document text behind the old box and frosting behind the portaled one. No theme opacity or blur values changed.
- `CommentsMargin` used `focusId` only for card autofocus. A narrow rail rendered no card until a marker was explicitly opened, so a new draft created in collapsed Comments mode stayed inaccessible without another click.
- A new rail marker starts in the unanchored bottom group before its position settles. A fresh popup now takes its Y from the source mark and X from the marker/rail, rather than capturing that temporary bottom position.

## Change ledger

| Number | Change | Rule retained | Decision |
|---|---|---|---|
| 1 | Portal the existing comment composer above the viewer’s backdrop and scroll masks | Shared theme-painted popup surface; theme glass and Reduced effects remain authoritative | Approved in comment-popup.review.answers.json |
| 2 | Open new drafts when Comments mode has collapsed to the marker rail; consume each focus request once | Narrow controls remain reachable; resize does not replay a handled popup | Approved, then superseded by Destin’s note and confirmed two-view follow-up |
| 3 | No slim rail: narrow panes keep hoverable highlights, expanded panes keep the full comments panel; Shrink returns Reading mode | Preserve hover comments and touch access; no hidden Comments mode after shrinking | Approved in comment-popup.review-2.answers.json, steps 3 and 4 |

References opened: the file-link right-click menu and code right-click menu, in Light and Halftone Dimension. Review: `comment-popup.review.json` (before/after plus operable practice app).

## Regression coverage

- `NewCommentPopover.test.tsx`: glass surface escapes its rendering container.
- `CommentableDocument.test.tsx`: narrow panes have hoverable highlights and no markers; touch taps open the comment card; wide Comments mode retains the full panel. The original marker-draft handler and its new tests were removed when round 2 stopped rendering the marker rail.
- `ActiveArtifactView.test.tsx`: shrinking returns to Reading mode without re-expanding; Comments can open the panel again on the first click.
- `HighlightHoverCard.tsx`: its shared glass surface is now portaled, like the new-comment composer, so hovering in the narrow pane does not expose sharp document text underneath.
- `ActiveArtifactView.test.tsx`: code-file composer remains in Reading mode, now queried through its portal.
- `tests/journeys/comment-popup-reading.json`: wait for loaded comments, right-click a spreadsheet cell, choose Add comment, and find the composer at 150 ms mock latency.
- Retained screenshot state: `chat/files/open/a-q3-sales-comments#new-comment`. The text-document before/after images were captured successfully with a temporary `chat/files/open/a-launch-brief#new-comment` state. That multi-click capture setup was removed afterwards: under the whole-screen sweep, a hover card could cover its next target. The captured images remain the review record; the repeatable spreadsheet state and component tests cover the composer.

The new unit regressions were observed failing before their corresponding fixes. The original isolated renderer click-through exercised Comments → Shrink panel → right-click cell → Add comment and found the focused composer; round 2 replaces that rail flow with ReadingHighlights. Round-2 tests also pin touch-card outside-tap dismissal. Fresh code reviewers found no actionable bugs in either round.

Final round-2 desktop verification: `scratch/no-rail-verify-confirmed.log` reports all checks passed (types, related tests, knip, lint, design lint, invariants, all named screens and journeys). A prior run reported an unrelated Pages kit-menu screenshot look-alike; the pair passed alone, all 393 screens passed in a separate recheck, and the final combined verification passed. No claim of a diagnosed cause is made. The loaded 390px reading view was checked through `explore` after waiting for the document title; desktop Shrink is not a phone control.

No installed-app state was changed. Native Android build verification is not part of these renderer checks.
