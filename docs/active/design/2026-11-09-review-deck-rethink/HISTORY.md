---
status: active
---
# How the review deck got here

What changed in each round of the rethink and why, in his words where short. The current description
of the tool is `scripts/ui-review/deck/AUTHORING.md`; this file is only the record. Round answers are
the `*.answers*.json` files beside the specs (`earlier-rounds/` for the ten separate decks, dated
`review-deck-rethink.answers.<stamp>.json` for the growing deck).

## Before the rethink (2026-09)
- Pictures on a slide, not the deck (2026-09-06): a brief slide and an approve slide could never share a page, so he was handed two links for one ask.
- Live app rows and Try-it (2026-09-06): "a candidate is a SKETCH somebody wrote for one comparison"; a live pane cannot show that something WORKS.
- `pick: several` and `answer: words` (2026-09-06): "A and C, drop B" had nowhere to go but the free note.
- Notes carry no tag (2026-09-04). A picture decide keeps its Today / Problem / Proposal (2026-10-08). Tall pictures stay side by side (2026-10-08, 2026-10-12). Games-social friction: list crops, `"new": true`, width warning, `shoot` screen names as crops.

## Round 1-2 (2026-11-09): the first rethink answers
- One text box per answer; a calls list ("Choices I made", each row stands unless he changes it, Q-10); `checked` on Today (the stale Today was the worst fault); `picture` + `caption`; areas he drags on a picture; word caps (60 / 25); a build stamp on the chip and in the answers; voice on every box; changed calls and areas printed in the summary.

## Round 3 (2026-11-10)
- One pencil per row; "Change this" and "More context" gone. No "All fine" button: lists untouched are accepted on moving on (reversed in round 10).
- Row thumbnails (replaced in round 7), `gallery: true`, a Notes button on picture decks, question-deck page title said once, Back left of one Next, voice follows the app's method.

## Round 4 (2026-11-10)
- `wording` rows retired: "this system is terrible… directly edit text on the real ui surface so i can see it in context". Wording became `screen` steps on a frozen copy of the real screen, last.
- Status pills are his to change. A comment box at the foot of every page ("an extra more visible input region at the bottom of each page"). A picture viewer. A History button (`earlier`, `related`).

## Round 7 (2026-11-10)
- "a single card for each image. clicking that should open our popup image screen/comment menu": the Attachments tiles and viewer replaced row thumbnails. Pasted pictures and paths become pills. Buttons follow the design guide (one filled per view). The state pill became a status, not a control.
- `state` as a group heading, not a badge ("don't really make much sense… confusing next to the unclear/pass/fail chips"); `trail`, `more`, `reuse`; "Since last round"; proof can be video. `liveScreen` ("the dropdown menus in that about popup should probably still work?").

## Review fixes (2026-11-10)
- From a code review, the server and a fresh-eyes tester: a pencil pressed again keeps a saved comment; `context` lists never counted; one summary for page and server; drag under 3% makes no area; saved screens scrubbed of anything that runs; server hardening (locked saves, no outside symlinks, 200 attachment cap).

## Round 9 (2026-11-12)
- One kind of row per card ("why is it the only row in this card that has the unclear/etc dropdown chip?"; K-1). The "Details" fold removed ("what even is the point of this?… poorly styled text dropped into a dropdown"): `trail` above, `more` below, `reuse` an (i). The popup shows the picture at true size (V-1). Touch: Comment on an area (Q-4). Reopening an answered deck of the same build (Q-3). Checks he may switch need `more`. Contract and acceptance decks retired (S-1 "all"); the done gate replaced them.

## After round 10 (2026-11-12)
- No coloured bar at the left edge: "fingernail styling". A list's kind is one small label. A page's opening line sits in a card ("bare text with no card gets ignored easily as ai clutter"). The theme's typeface (L-3).
- Tick or change (R-1) and "Warn, list them, let me send anyway" (R-2): "i want to eliminate the scenario where a row gets accidentally taken as approved just because i didnt read or see it." The gate treats a row not looked at as not finished.

## A deck that grows (round 10 onward)
- Rounds 1, 8, 10: "a single deck that kind of 'evolves' in response to my questions and keeps my earlier responses"; of the History button, "feels like you tacked on a sticky note". One spec per feature, earlier rounds from dated answers files, `reopened` / `resolved` / `past` / `answered` / `retired` / `rounds_before`.

## Round 11 (2026-11-14)
- "it's very confusing that I can click around the different sections at the top and it jumps me between the sides… we're not editing prior sections of the deck once we've gotten to post build": the deck is AT one stage; the stage line is a picture; earlier stages are a read-only record. "It's not clear what the question was and how my response differed": answered topics became compact cards.

## Round 12 (2026-11-14)
- "i want them to look similar to how the original question would've been proposed/answered. also what about my history over rounds?": "Previously answered" holds the original cards, `answered` may list every round. Finished stages open from the stage line. Rows self-contained ("often significantly lacking in context"). The page: heading + one line, no question numbers, filled "Submit feedback".

## Round 13 (2026-11-14, answers to round 12)
- "why am i starting on a page full of completed questions?": only pages that need him are the path; "the card with the answered questions should be collapsible"; one header row (stage names, bars, submit). A row's `more` mirrors context/pros/cons ("more similar to our existing context/pros/cons structure"); `visual: true` ("this is a visual question, but lacks a visual reference").

## Round 14 (2026-11-15, answers to round 13)
- "where did the other pages go then? i didn't ask you to eliminate the others": every page of the stage has its bar, finished first and green; "everything answered earlier" removed ("tf is the difference between 'previously answered' and 'everything answered earlier'?"). "just commenting on an image should count as a response/pencil/edit click". "why was this text carried over from my last round of answers?": saved state tied to its build, `serve` refuses saves from another build (409), old files kept as `.unsent.`.

## Round 15-16 (2026-11-16 to 11-18)
- The final check reads the before-walkthrough as he approved it, from git (`built.commit`). "New" tags on a growing deck (big on a wholly new page, small on new cards). Early wording edits on a mockup, only when he asks (mock `.html` `screen` step).

## Tidy (2026-11-18)
- AUTHORING.md rewritten as one current description; the two rule files trimmed under 600 words; the ten separate decks moved to `earlier-rounds/` (with their pictures; the growing deck builds the same); the builder now enforces "What changed while building" ("what did you have to adjust") and "Found in review" on after-build decks, and the done gate fails without them.
