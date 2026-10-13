---
status: active
date: 2026-10-04
---

# Home page redesign — shared brief for every helper

Read this, then your task in your prompt. Read nothing else unless your task needs it.

## The page

YouCoded "Pages" are small HTML apps the YouCoded desktop app shows in a sandboxed frame. The
**Home page** controls the owner's Home Assistant: rooms of lights, speakers, TVs, a thermostat,
cameras; a row of pills (Home, Lights, Media, Climate, Problems, Activity) that act as tabs; a
gear (page settings) and an Edit mode; a device pop-up (press-and-hold or right-click a card).
The owner (Destin) does not read code. He judges by looking and by clicking.

It is ONE HTML document assembled from TypeScript template strings. Paths below are under
`/home/destin/youcoded-dev/worktrees/sessions/ha-pages-connection/youcoded/desktop/src/renderer/dev/workbench/`.

| File | What is in it |
|---|---|
| `fixtures/home-assistant-page.ts` (1495 lines — budget 1500) | markup + the main script: data loading, `render()`, `put(id, html)`, tiles, rooms, pills, views, Edit (`editRow`, `onAct`), click/drag/input handlers |
| `fixtures/home-assistant-page-style.ts` | all base CSS |
| `fixtures/home-assistant-page-history.ts` | device pop-up (`dialogHtml`), Activity tab, their CSS |
| `fixtures/home-assistant-page-live.ts` | instant updates over a live socket (pushed state → redraw) |
| `fixtures/home-assistant-page-camera.ts` | camera card: recordings, clip player, live video canvas |
| `fixtures/fake-home-assistant.ts` | the pretend Home Assistant the practice app talks to |
| `fixtures/home-variants/` | **where you work** — see below |

How drawing works (matters for motion): `render()` builds HTML strings and `put(id, html)`
replaces `innerHTML` of `#chips`, `#bar`, `#view`, `#favs`, `#rooms`, `#dlg` — only when that
string changed. Live updates from the device and the 5/60-second checks can redraw at any
moment, so an animation that lives on an element can be cut off by a redraw. After every put,
the page calls `window.__homeAfterPut(id)` if you define it. Colour/brightness bars update live
while dragging without a redraw. Holds (`held`) keep a pressed switch's new state for 8 s.

## Showing your options (no edits to the page while designing)

You own ONE file: `fixtures/home-variants/<your-task>.ts`. Add entries to its `VARIANTS`:

```ts
export const VARIANTS: HomeVariants = {
  a: { label: 'Soft glass', css: String.raw`…`, js: String.raw`…`, data: { open: ['destins_room'] } },
  'a-edit': { label: 'Soft glass, Edit on', css: …, data: { editing: true } },
  b: { …, transform: (html) => html.replace('function editRow(it, ctx) {', '…') },
};
```

Fields (`fixtures/home-variants/types.ts`): `label`; `css` (after the page's styles); `js`
(after the page's script — plain ES5, no backticks); `transform(html)` (rewrite the page's
HTML/script text before it loads — use when CSS/JS on top cannot do it; replace whole
functions by exact text); `data` (the page's saved data to start from — e.g. `open`,
`scenesOpen`, `editing`, `view` ('lights' | 'media' | 'climate' | 'problems' | 'activity' |
'settings'), `dlg` (a device id for the pop-up), `remote`, `groupOpen`, `fav`, `hidden`).
Keys are `<option>` or `<option>-<state>`; each becomes the practice screen
`pages/page/page-home#v-<task>-<key>` automatically. Do not edit any other file.

**Pictures:** from `/home/destin/youcoded-dev/worktrees/sessions/ha-pages-connection`:
`node scripts/shoot/shoot.mjs 'pages/page/page-home#v-<task>-*' --themes golden-sunbreak,creme`
(add `--out <dir>` to keep them; read the contact sheet it prints). The current page, for
"before": `pages/page/page-home#connected` (also `#edit`, `#lights`, `#media`, `#climate`,
`#problems`, `#settings`, `#device`, `#activity`, `#camera`, `#remote`, `#group`).
`node scripts/shoot/shoot.mjs --list | rg page-home` lists them all.

**Motion:** Destin operates it himself in a live pane on the deck (below). You can check your
own motion with `node scripts/ui-probe.mjs` (headless Chrome; `--help`) against a running
practice app, or by reasoning from the CSS — do not build a recording rig.

## Your deliverable

1. Three options that differ in **kind**, not degree (not "fast / medium / slow").
2. A deck fragment at `docs/archive/design/2026-10-04-home-redesign/<your-task>.deck.json` —
   a normal deck spec (copy `scripts/ui-review/templates/choice.json` for pictures or
   `live.json` for operable panes; field rules in `scripts/ui-review/deck/AUTHORING.md`).
   - Pictures: `"runs": {"after": "<your --out dir>"}`, `"themes": ["golden-sunbreak", "creme"]`,
     variants with `crop` = screen names.
   - Live panes: deck-level `"live": {"worktree": "sessions/ha-pages-connection/youcoded"}`;
     each variant `"live": {"app": "default", "params": {"openPage": "page-home", "pagesHome": "v-<task>-a"}}`.
   - Every slide: `headline` (a question, ≤ 25 words), `notice`, `risk`; every variant
     `label`, `summary`, `risk` — plain words about what he will SEE and FEEL, no code words.
   - Run `python3 scripts/ui-review/review-cards.py preview <your spec>` and read its contact
     sheet; fix what is wrong. **Do not `serve`** — the coordinator merges all fragments into
     one deck.
3. Reply: option names with one line each, the screen names, the spec path, anything unsure.

## Rules

- Theme colours only, as CSS variables: `--canvas --panel --inset --well --accent --on-accent
  --fg --fg-2 --fg-dim --fg-muted --fg-faint --edge --edge-dim`, radii `--radius-sm/-md/-lg`,
  `--font-mono`. The app's classes `yc-card`, `yc-button` (`--sm --primary --ghost --icon
  --danger`), `yc-select`, `yc-input`, `yc-empty`, `yc-caption` exist in the frame. Status colours
  (green/amber/red, a light's own colour) may be literal. Check Golden Sunbreak (dark) AND
  Crème (light).
- No images, fonts or scripts from outside. No new dependencies.
- Motion: animate `transform` and `opacity` only (not width/height/top/left/box-shadow on many
  elements); any endless animation uses `steps()`; everything honours
  `@media (prefers-reduced-motion: reduce)`. Nothing animates while the page is hidden.
- Narrow windows (phone, 390 px wide) must still work.
- Write for a non-developer: option names and summaries in plain words.
- Do not commit, push, run `run-dev.sh`, or touch the user's running YouCoded app.

Note (2026-10-05): the option files (`fixtures/home-variants/*.ts`) and the device-page mockups were removed at merge prep, because the chosen designs are built into the page. They are in git history; the answered decks' live panes no longer resolve and are kept only as records.
