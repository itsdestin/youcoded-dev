---
status: active
date: 2026-10-14
---

# Round 2: one set of facts, one switcher, calmer detail

Every agent changing a view reads this, then `BRIEF.md` (round 1's rules all still hold).

## Destin's verdict on round 1 (vision-options.choice.answers.json)

> First view, all four picked: "these are all interesting and useful in their own ways. i think i
> would want to be able to kinda switch between any/all of them, and have them all kinda pull from
> the same underlying data"

> After one click: "these are all much more confusing. i think they are all good in spirit, but the
> actual ui/ux of these pages is just a bit overwhelming and unclear/confusing."

## 1. One set of facts

`facts.json` (built by `facts.py`; never hand-edit it) is the only data a view may read. It holds
`mission`, `tracks`, `systems`, `nodes` (every pillar/capability/feature: title, kind, parent,
pillar, status, since, why, evidence, needs, shares, needed_by, track, screens, optional label and
catch), `journeys`, and the wiring `parts`, `edges`, `traces`. Change your `build.py` to read only
`../facts.json` (plus `../../cc.css` / `../../page.css` for looks). Anything your view computes
(floors, journey stops, closures, sizes) is computed from it in your `build.py`. Four agents work at once, so **do not edit `facts.py`**: if a fact you need is missing, say so in
your report and work without it. Run `python3 ../facts.py` before your build if `facts.json` is absent.

## 2. The switcher, and staying on the same thing

`../bigpicture.html` (written by the main session) shows one view at a time in a frame, with a small
switcher above. Your view must:

- **Read focus on open:** if the address ends with `#focus=<id>`, open focused on that thing. `<id>`
  is a node id from `facts.json` (`sync.follow.chats`, `sync`) or a wiring part as `part:<id>`.
  Map it to your nearest equivalent: Zoom zooms to the node (or its parent); Journeys highlights
  the journeys containing it, or its system's; Foundations lights the block, or the nearest block
  in the same system; Wiring selects the part whose `vision` list contains the node, or the part
  for its system. If there is no sensible equivalent, open normally — never error.
- **Report focus:** whenever the person selects something, call
  `parent.postMessage({bp: 'focus', id: '<id>', title: '<plain title>'}, '*')` (guard with
  `window.parent !== window`). On zooming out / clearing, send `id: null`.
- **Drop your own top title band when framed** (`window.self !== window.top`): the switcher page
  carries the title. Keep your legend.

## 3. Calmer detail (the main fix)

After a click, show **only**: the thing's name, its status in words, one plain sentence of why it
matters or where it stands, and at most three short facts that answer "what is it waiting on / what
does it hold up". Everything else (evidence lists, code locations, long reasons, full connection
lists) goes behind one "More" fold, closed by default. No paragraph longer than two lines at
1440 wide. Also cut text from the first view where a hover can carry it.

Fix the specific complaint for your view (listed in your prompt). Do not add new features.

## 4. Proof

Overwrite `shot.png` (first view) and `shot-detail.png` (the SAME click as round 1 — see your
`NOTES.md`) at 1440x900 with no console errors, plus `shot-framed.png`: `../bigpicture.html` opened
on your view with `#focus=` a node of your choosing (open it as `bigpicture.html?view=<name>&focus=<id>`).
Update `NOTES.md` (under 300 words): what changed and why. Touch nothing outside your folder. Do not commit.
