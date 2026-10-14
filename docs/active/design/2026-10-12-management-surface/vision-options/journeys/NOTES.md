# Journeys (round 2)

**The idea.** Seven real people walk through the app as left-to-right rows of boxes, each box a real feature with its real status; the first unfinished box is flagged "stops here".

**What changed (Destin: "overwhelming and unclear").**
- Reads only `../facts.json` (journeys, labels and catch flags come from there; stops and "held back by" are computed from `needs`).
- Each row now has one short line at most: "Stops at X" plus, if any, "N more things to finish behind the scenes". The reason, the catch and the hidden dependencies moved to that line's hover; the quote moved to the title's hover.
- Right-hand panels no longer use numbered chips. They say "4 journeys"; hovering lists the journeys by name; clicking lights those rows and boxes (click again to clear).
- Click detail is now: name, status, one sentence, three facts (Waiting on / Holds up or Used by / Part of), then a closed "More" fold with the rest (needs, ties, journeys by name, what backs it up; no code paths).
- No truncated words in boxes: text wraps, and the system shows its short name ("Everywhere", "Yours"); the full name is in the hover and in More.
- Opens on `#focus=<node id | part:id>` (lights journeys containing it, else its system's), reports selections to the parent, hides its title band when framed.

**Answers.** (a) status per box and per journey; (b) "Waiting on", "holds back"; (c) only through `needs`/`shares`. Weakest answer remains (c), and that only 33 of 168 pieces appear in any journey.

**Missing from facts.** Nothing blocking. Short system names are derived by cutting at the first colon.

Files: `build.py` + `template.html` make `index.html`; `shot.png`, `shot-detail.png` (click on "A saved recipe"), `shot-framed.png`.
