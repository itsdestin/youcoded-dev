# r1 · import — builder report and guide-gap notes

## What it built
A Settings row "Import from ChatGPT" under Backup & sync, opening one `document`-size popup that moves through steps: Start (three steps to export from ChatGPT + button to ChatGPT's export page; "What comes in" list; "Choose file…"), Preview ("Your file" card: name, counts, date range, pictures, four newest titles + "and 308 more", "12 already imported will be skipped"; switches for pictures and archived; "Import 300 conversations"), Importing (card marked "Importing", progress bar "128 of 300", "you can close this", Stop import), After (card marked Imported / Partly imported / Stopped). Partial failure: red notice naming two titles + "13 others", Try again for those 15, reasons under Details. Wrong file: "Choose another file". Total failure: nothing changed + Try again. "Show my conversations" closes Settings, opens Resume session.
Screens: `settings`, `settings/import-chatgpt` + `#reading`, `#wrong-file`, `#wrong-file-details`, `#preview`, `#preview-archived`, `#importing`, `#stopped`, `#done`, `#partial`, `#partial-details`, `#failed`, `#phone`, `#phone-preview`, `#phone-partial`.
References: Submit a ticket, Contribute, Backup & sync, Marketplace detail pages. Answered open questions itself: Q16 (Stop keeps what came in; ✕ only closes), Q23 (switches), Q22 (no step counter, no back arrow).
Reported flaky under load: `LocalModelsSection` (fixed), `prompt-assembly`, `switch-marks`.

## Where the guide left it guessing (condensed)
1. Q16 long-running work: Stop, ✕/Esc mid-run, part-finished result.
2. Q11/Q22 flow steps: counter, title change, back arrow.
3. Q23 switches vs tick boxes.
4. Where a new feature's entry point goes.
5. "Every error box has Try again or Report bug" doesn't fit a wrong file.
6. Does a notice's filled Try again count against the view's one filled button?
7. Partial failure listing the user's own item names.
8. Chip row: guide names `Chip` but not the shared scrolling `ChipRow` (found by searching code after shoot's check failed).
9. Does the popup's persistent subject card need a label?
10. Dialog sizes: guide describes narrow and wide, not `document` (600px).
11. ProgressBar: count text placement; pill + bar both?
12. "Bold number, grey word" — sentences too?
13. Preview of items inside a card (dates on right, "and N more").
14. A popup in Settings sending you to another surface.
15. Platforms: which a new Settings row appears on.

## Pushed toward worse
- "Nothing bare / a label comes first" → two labelled cards where one would do.
- "Every error box needs Try again or Report bug" → nearly a useless Try again on a wrong file.
- "One filled button per view" → partial result ends with two equal outlined buttons, no clear next step.

Not read: "documented as they are today", "Kept from the 2026-08-25 guide", error-message-standards, MAP, PITFALLS, review-deck, AUTHORING.
