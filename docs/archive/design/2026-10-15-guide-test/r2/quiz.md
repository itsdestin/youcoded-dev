# r2 · quiz — builder report and guide-gap notes

## What it built
A card inside the assistant's reply (under its message): quiz name, "Question 2 of 5" in grey, the question, answers as radio rows (Preferences' permission-mode row). Tapping checks at once (no Check button). Right → green "Right" tag on the row, others fade; wrong → red "Your answer" + green "Right answer", others fade; then an info notice with a one-line explanation and "Next question" (last: "See my score"). Finished: "**4** of 5 right", one box listing each question with Right/Missed tags ("You said … · Answer: …"), "Retake quiz" (outlined) + "Go over what I missed" (filled; perfect score: "Quiz me on harder ones"). Sent: grey "Sent to the assistant." + Retake. Send failed: red notice replaces buttons, Try again.
Live: `?seed=bubbles-quiz` (+ `&quiz=` right, wrong, finished, perfect, sent, send-failed); click the second practice conversation (amber dot). Phone via Narrow.
References: Deliverables card, chat question card, Preferences default permission mode, Submit a ticket.
Flagged: info notice takes the theme accent — hot pink in Halftone reads like an error. A journey (`tests/journeys/change-theme.json`, step 3 "Crème") timed out under load — being fixed.

## Where the guide left it guessing (condensed)
1. Chat cards "not covered yet" → no recipe at all; mixed Deliverables' shell with general rules.
2. Card levels only for popups/panels: level-1 card vanishes inside a chat bubble → used Deliverables' darker fill.
3. No recipe for "pick one and get marked right/wrong" → radio setting rows.
4. Right vs wrong on a picked item → per-row tags.
5. Notice tones lack neutral feedback; info = accent → pink in Halftone.
6. A lone button ending a step inside a card → inside the explanation box, right.
7. Score format "4 of 5" and size → bold 16px; no heading level fits.
8. No heading level for a card title in a chat bubble → 14px medium + 12px grey.
9. "No line crosses the full width" vs the shared list's row dividers.
10. Where "keep its subject" status tag goes on a card with no tag row.
11. Where a row's tag goes when narrow.
12. "Disabled control says why" vs the usual pick-then-Check.

## Pushed toward worse
- Level-1 card invisible inside a chat bubble.
- Fixed notice tones forced the accent onto a neutral explanation.
- Flush rule + SettingRow layout put the tag after the text at phone width.

Not read in full: Popups, Settings, Cards, Tags, Detail pages, Lists and menus, Full screens, Message box; feature-flow, review-deck, error standards, PITFALLS, MAP.
