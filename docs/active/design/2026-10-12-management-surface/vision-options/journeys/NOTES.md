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

## Round 2 fixes after beta test (U2, U3, U8, U9, U10, sideways scroll)
- U2: words like Mesh, Specialist file, Fork, runtime get a dotted-underline hover in visible text and plainer wording inside hovers.
- U3: one name per thing: always the node title (labels dropped). Status words are exactly exists / being built / planned / only an idea.
- U8: "with a catch" now explains itself on hover; the detail leads with "The catch: ...".
- U9: "5 of 7 steps work", "Stops at step 6: ...", "3 more unbuilt things it needs", "Can't start: step 1 is unbuilt".
- U10: the journey list and the right-hand list fade out at the bottom with a "More journeys below" / "More below" cue while more is hidden.
- Sideways scroll: a pill's hidden hover bubble was making the rows wider than the pane; removed, and the pane no longer scrolls sideways (checked standalone and framed at 1440x900).
