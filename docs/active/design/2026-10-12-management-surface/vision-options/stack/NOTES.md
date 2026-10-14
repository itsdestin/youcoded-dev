# Foundations (round 2)

**Idea.** The vision is a building: each block rests on the blocks it needs; unfinished blocks whose foundation is missing hang on dashed legs. "Build next" names the three unfinished things holding up the most.

**Round 2 changes (from ROUND2.md and the "overwhelming" complaint).**
- Reads only `../facts.json` (plain `label` used where present). Floors, "build next" and floating are computed from `needs`.
- Fewer things at once: finished blocks that nothing is missing under collapse into one quiet "N things that already work" strip per floor (click to open). Unfinished and floating blocks show full names, no cut-off words.
- The "up N" badges are gone. "Holds up N other unfinished things" appears only in the detail. Legend is one line. Floor sub-lines moved to hover.
- Build next: 3 items, full names.
- Detail: name, status, one sentence (long first sentences cut, rest under More), three facts (waiting on / holds up / area and date). Rests-on, holds-up, overlaps and evidence sit behind a closed "More". Hover lines are thinner and fainter.
- Switcher: `#focus=<node id | part:id>` opens the block (or nearest block in the same system); selecting or closing posts `{bp:'focus',id,title}` to the parent; own title band hidden when framed.
- Selecting a finished block opens its strip so it is visible.

**Answers.** (a) status by dot, colour, hatching; (b) hover or click lights what holds it up (green, amber if unfinished) and what it holds up (blue); only `needs` is drawn; (c) still weak: dependency only, no how-parts-talk.

**Weakest points.** Only 56 of 205 items have needs-links; the rest sit in a closed "Everything else". The bottom floor (mostly finished) is below the first screen at 1440x900; the unfinished floors and Build next fit. A missing link drops a block to the ground floor.
