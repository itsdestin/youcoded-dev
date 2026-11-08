# What changed — the run folder format

The contract between the three parts of "What changed since last release": the **recorder** (inside
`shoot`, writes one `*.elements.json` beside each picture), the **comparer** (`compare.mjs`, writes
`changes.json` and the highlight pictures) and the **viewer**: the work board's Screens tab (`pages/work-board/renderer/make_changes.py <run>` turns a
run into `<run>/board/`; `node scripts/manage.mjs --changes <run>` shows it — Destin, 2026-11-04: the comparison
lives in the existing Screens tab and its picture popup, not a page of its own). The older `viewer/` is superseded.
Change this file first when a part needs a new field.

## Folder

```
<run>/
  run.json                             written by what-changed.mjs: { before: {label, commit, dir}, after: {...} } (labels for changes.json)
                                       plus photoCopy: {dir, borrowed, standIns} when the release side is its photo copy (what-changed/photo-copy.mjs)
  changes.json                         the comparer's result (below)
  before/<screen name>/<theme>.png     shoot's own --before/--after layout, untouched
  before/<screen name>/<theme>.elements.json
  after/<screen name>/<theme>.png
  after/<screen name>/<theme>.elements.json
  diff/<screen name>/<theme>.mask.png  changed pixels nothing in the element lists explains (optional)
  decisions.json                       the viewer's Keep / Not this answers (below)
```

## `*.elements.json` (recorder)

One per picture, measured after the screen is proven showing, at the moment the picture is taken.
Boxes are CSS pixels relative to the picture's top-left; the picture's `scale` turns them into
picture pixels.

```json
{
  "screen": "settings/about", "theme": "meadow-mist", "scale": 1.5,
  "viewport": { "w": 1440, "h": 900 },
  "elements": [
    {
      "id": 17,
      "kind": "control | text | image | field",
      "role": "button", "name": "Check for updates",
      "text": "Check for updates",
      "title": null, "placeholder": null,
      "box": { "x": 610, "y": 402, "w": 148, "h": 32 },
      "style": { "color": "...", "background": "...", "border": "...", "radius": "...", "font": "...", "opacity": "..." },
      "path": "dialog>section:nth(2)>button"
    }
  ]
}
```

Only what a person can see: skipped when `display:none`, `visibility:hidden`, zero size, fully
clipped or fully covered. Text inside a control belongs to the control (`text`), not a separate
`text` element.

## `changes.json` (comparer)

```json
{
  "before": { "label": "v1.3.3", "commit": "abc123" },
  "after":  { "label": "master", "commit": "def456" },
  "generatedAt": "2026-11-03T15:00:00Z",
  "themes": ["meadow-mist", "halftone-dimension"],
  "screens": [
    {
      "name": "settings/about", "theme": "meadow-mist",
      "status": "changed | unchanged | new | nobefore | removed | failed",
      "reason": "only when failed or new: why",
      "before": "before/settings/about/meadow-mist.png",
      "after": "after/settings/about/meadow-mist.png",
      "mask": "diff/settings/about/meadow-mist.mask.png",
      "scale": 1.5,
      "shift": { "y": 0 },
      "changes": [
        {
          "kind": "added | removed | scrolled | text | moved | restyled | pixels",
          "role": "button", "name": "Check for updates",
          "oldText": "Check for updates", "newText": "Look for updates",
          "words": [{ "same": "for updates" }, { "old": "Check", "new": "Look" }],
          "styleChanges": [{ "prop": "background", "from": "...", "to": "..." }],
          "side": "after",
          "box": { "x": 610, "y": 402, "w": 148, "h": 32 },
          "beforeBox": { "x": 610, "y": 380, "w": 148, "h": 32 }
        }
      ]
    }
  ]
}
```

- A `text` change may carry `field: "title" | "placeholder"` when it is a tooltip / hint that changed (absent = the visible words).
- Left out on purpose: a spinner glyph and a countdown (`resets in 2h 59m` vs `3h 0m`) change by themselves.
- `new` = the screen list marks the screen new in the app (`newIn: 'after'`, carried in the after side's manifest) and only the after side has it. `nobefore` = only the after side has a picture but the screen is not marked new: it existed in the release but was not on the release's photo list, so nothing is known about whether it changed. `removed` = only the before side has it. `failed` = either side's picture was not taken (`reason` says which side and why).
- `box` is in CSS pixels on `side` (`removed` uses `before`; everything else `after`).
- `pixels` is a changed area no element explains (an icon, a picture, a border).
- `scrolled` is a piece shown on one side only that the other side still has, scrolled out of view (`way`: `out` = pushed below the visible part, `in` = came into view). Each `*.elements.json` carries `outOfView`: the controls and words scrolled out of view inside a scrolling area (no box).
- `edge` counts changes dropped because the piece only peeks in at its panel's edge (under 8 px, or under half, shown).
- `outside` counts changes dropped because they sit outside a popup's own panel (on the page behind it, which is
  its own screen). Only screens whose panel covers well under the window are filtered this way.
- `shift` is a shared offset the comparer found (a row inserted above), reported once so the elements
  below are not each listed as `moved`.

## `decisions.json` (viewer)

```json
{ "run": "<run folder name>", "decidedAt": "...", "screens": { "settings/about": { "verdict": "keep | not-this", "note": "" } } }
```

Decisions are per screen name (both themes together).

## Edge cases the viewer relies on

- `removed` screen: `after` is `null`; only the before picture shows.
- `failed` screen: `before` / `after` may be absent; no picture shows.
- `moved` change: `beforeBox` is drawn dashed on the before picture.
- `decisions.json`'s `run` is the run folder's name (the server fills it in; `changes.json` carries none).
- Counts: a screen name is "changed" when any of its themes is; "changed" includes removed.
