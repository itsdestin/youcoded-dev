---
status: active
created: 2026-08-30
updated: 2026-08-31
owner: landing-page redesign — iterate on the chosen direction
---

# Handoff: landing-page redesign (checkpoint 3)

Mockup-only redesign of the public landing page
(https://itsdestin.github.io/youcoded/, source `youcoded/docs/index.html`).
**Nothing in `youcoded/docs/` has been changed.** All work is in
`docs/active/prototypes/landing-redesign-mockups/` in this repo.

## Where it stands

Destin has settled on one design. `mockup-landing.html` is it:

- **Skin direction** — the page wears the app's own themes; every colour comes
  from a real theme pack.
- **Flank header** — kicker, the word-cycling headline with two mascot theme
  buttons either side, subtitle, download row, then the live app embed.
- **Deck-fade features section** — one card per feature, each sticking and
  being covered by the next, with covered cards dissolving to nothing.
- **Hero dissolve + docked download pill** (2026-08-31) — the bottom of the live
  demo fades into the page, the five platform buttons live in one glass pill
  floating over that fade with a small "Try Demo" pill beside it, and the pill
  docks to the bottom of the window as you scroll on.
- **Headline** — `An Assistant That's Useful. → Fun. → Yours.` The old
  `Make AI Yours.` was retired: "make" frames the product as something the
  visitor has to BUILD, which reads as developers-only.
- **Brand** — the YC monogram is replaced by the app's own mascot in the same
  accent tile, and the wordmark carries no accent colour at all.

**It is the only page built.** Everything else is **parked, not deleted** — the
D1–D4 headers, skins E and F, round-one A/B/C, the Dock and Crown mascot
placements, the theater / pinned / rail features sections and the
tight/depth/air decks all still have their `HEADERS` / `DEMOS` entries in
`build.py`. Adding one line to `BUILDS` brings any of them back for a
side-by-side, which is also why `compare.html` and its tab shell are still
here with a single tab in them.

## Boot it

```bash
cd docs/active/prototypes/landing-redesign-mockups
bash setup.sh            # symlinks (media, media-local, mascots, gallery, icons, site), wallpapers, compare page
python3 build.py         # regenerates mockup-landing.html into mockups/
python3 serve.py 8901    # http://localhost:8901/mockup-landing.html
```

**Serve with `serve.py`, never `python3 -m http.server`.** The latter sends no
cache headers, so the compare page's iframes keep showing a stale mockup while
the file on disk is already correct. That cost a round trip on 2026-08-30 —
Destin was reviewing an old page and reporting changes as not applied.

Reference copy of the CURRENT live page: `cd youcoded/docs && python3 -m http.server 8899`.
Destin looks at these in his own browser — give him the URL, never open a window.
Headless Chrome for your own verification is expected.

## The files

| File | What it is |
|---|---|
| `build.py` | THE generator. `HEADERS` (header arrangements) + `DEMOS` (features-section layouts) + one `BODY` + `CORE_JS`. Edit this, never the built html. |
| `css_d.css` | Skin base — wallpaper backdrop, glass, type, sections, FAQ, gallery. |
| `css_d_headers.css` | Header arrangements, the mascot theme picker, the hero word cycler and intro. |
| `css_theater.css` | The four features-section layouts (theater / pinned / deck / rail). |
| `css_embed_fade.css` | The hero dissolve, the floating/docking download pill, its DOWNLOAD label, and the parked fade/pill skins. |
| `css_nav.css` | The brand mark and wordmark treatments, live and parked. |
| `css_embed_acct.css`, `css_modal.css`, `css_integrations.css` | Embed + account cards, install popup, integrations chips. |
| `modal.js` | Install-tips popup, **verbatim from the live page** — keep byte-identical; changes go through `patch_modal()` in build.py. |
| `mascots/` | The picker art. `default.svg` is the app's own `AppIcon`; the per-theme ones are copies from `wecoded-themes` and are currently UNUSED (see below). |
| `media-local/` | Clips re-filmed for this redesign. Separate from `media/` on purpose — that is a symlink into the LIVE site's assets. |
| `themes.json` | The 8 themes extracted from `wecoded-themes/themes/*/manifest.json`. |
| `compare.html` | Tab shell. Copied into `mockups/` by setup.sh. |
| `serve.py` | No-cache static server. Use this one. |
| `viewshots.mjs` | Screenshots: `CDP_PORT=99xx node viewshots.mjs <url> shots/prefix "name=JS"`. `"x=@wait 8000"`, `"x=@hover <sel>"`. |
| `introshot.mjs` | Screenshots at absolute times from navigation — the hero intro is over in ~2.4s, which viewshots' 6s settle can never see. |
| `bands2.mjs` | Full-viewport captures with the wallpaper flattened to white, for measuring real empty space between sections. |
| `evalpage.mjs` | Prints JS values instead of screenshots. |

## Landmines — do not re-learn these

1. **Never clip the live-demo iframe** with `overflow:hidden`, `clip-path`, a
   rounded ancestor, or a body-level scroll lock. Chromium then smears the app's
   glass blur across the ENTIRE demo window under framed wallpaper themes. The
   working corner treatment is `maskEmbed()` in CORE_JS. **This bug is on the
   real live page today** — ROADMAP entry tagged `#landing-page`. Proof
   technique: hide `.bd-layer`/`.bd-scrim`, set the page background red,
   screenshot; rounded corners show red arcs and the app's glass stays crisp.
   This is why the hero intro does NOT lock scrolling the way the live page's does.
2. **`CORE_JS` is %-formatted — a literal `%` anywhere in it breaks the build.**
   That includes the MODULO OPERATOR and any comment that spells the character
   out. Bitten three times now. Percent signs come from `String.fromCharCode(37)`;
   write wrap-around as a conditional.
3. **The demo iframe is the real app** (`site/index.html?mode=workbench&…`,
   same-origin). Theme sync = `iframe.contentWindow.__workbenchAppearanceSync({theme: slug})`.
   A slug the embed doesn't bundle is silently ignored — the 7-theme bundle comes
   from the worktree `worktrees/site-themes` (branch `feat/site-embed-all-themes`,
   uncommitted). **Do not delete that worktree.**
4. **A sticky card is bounded by its own parent.** The deck's trailing spacer
   was on `.deck` while the cards live in `.decktext`; it therefore added blank
   page and bought the last card no dwell at all. It is on `.decktext::after`.
5. **Measure painted pixels, not the box model,** when judging empty space.
   `bands2.mjs` flattens the wallpaper so empty rows are unambiguous. Margins,
   padding and empty wrappers all read as content in `getBoundingClientRect`.
6. **`getBoundingClientRect` includes transforms.** Deck cards are scaled while
   buried, so measuring their heights mid-scroll reports garbage.
7. **`html{scroll-behavior:smooth}` breaks scripted verification.** A `scrollTo`
   in a test animates; sample too early and you measure a position the page was
   never at. Use `scrollTo({top, behavior:'instant'})`.
8. **Copy used to be preserved, not rewritten** — that was the rule while motion
   was being locked. Copy is now the live question. Do not invent a new strategy
   doc; follow `docs/active/handoffs/2026-08-31-landing-redesign-START-HERE.md`.
   Banned phrases: “real app”, “real files”, “actually reads”, “does real work”,
   “self-improving”. A copy-experiment variant B was dropped — do not revive it.
9. **Readability floor:** prose panels use `--panel-op-prose = max(opacity,.80)`
   and `--blur-prose = max(blur,16px)`. Don't simplify it away.
10. `.nav-links a` outranks `.cta` — nav link styling needs `a.`-qualified selectors.
11. **The recorder cannot resize a panel that holds the artifact preview.**
    That preview is a sandboxed cross-origin iframe, and Chromium's screencast
    does not repaint an out-of-process frame after a resize — the take showed a
    stale, clipped tile while a plain screenshot of the same state was perfect.
    Set the geometry BEFORE the first paint instead: `record.mjs` now takes a
    `storage` object, seeded into localStorage on new document, and the scene
    sets `youcoded-drawer-width`.
12. **The artifact panel's Edit button is not hover-revealed — it appears when
    the FILE LIST is collapsed** (`editState.editing || !showList`). Clicking it
    while the list is open is a no-op that leaves no trace, and the next step
    fails instead. The scene clicks `button[title='Hide list']` first.
13. **An iframe never chains its scroll to the page.** With the pointer over the
    demo, the wheel goes to the app and STOPS there even when the app has nothing
    left to scroll, and the page underneath sits still. There is no CSS for it
    (`overscroll-behavior` only works inside one document). `chainWheel()` in
    CORE_JS listens INSIDE the same-origin embed, walks up from the wheel's
    target, and forwards to the parent when nothing on that path can still move.
14. **`body.<state> .dlfloat` outranks `.dlfloat.docked`.** The docking rule
    silently lost on specificity: the pill kept the class and scrolled away with
    the page anyway. Any state rule for the pill must carry a body-class prefix.
    Caught only because the check measured the pill's screen position rather
    than trusting its class list.
15. **Widths measured before the web font lands are the FALLBACK font's**, and it
    is wider. That is where 42px of dead space after the cycler's final word came
    from. `CYCLER_JS` re-measures on `document.fonts.ready`.
16. **`--embed-fade` goes in the SVG mask, never an overlay.** Nothing can paint
    the page's wallpaper back over an iframe, and a clip would set off landmine 1.
17. **The mask is TWO layers now** (2026-08-31): the rounded-rect SVG, rebuilt only
    on resize/theme change, intersected with a CSS gradient whose stop is
    `--fade-stop`. Re-encoding the whole SVG data URL per scroll step is what made
    the hero's fade-back-in feel rough. Scroll writes ONE property; measured 0 SVG
    rebuilds across 100 scroll steps, down from ~50.
18. **Anything scroll-driven must be rAF-coalesced.** `placeFloat` reads three
    rects and four computed styles; running it straight off the `scroll` listener
    forces a synchronous layout on every wheel tick.
19. **A centred pill changes width when the theme changes**, because each theme
    brings its own webfont. Measured: the download row was 765.6 / 751.4 / 749.0px
    across the four picker themes, i.e. an 8px sideways hop on every mascot click.
    Fix is `lockPillWidth()` -- measure every picker theme's font after
    `document.fonts.ready` and pin the widest. Lock BOTH boxes; pinning only the
    download pill still left 2.4px.
20. **`body.fade-d .dlfloat` (0,2,0) outranks a bare `.dlfloat` in the narrow
    media query.** The phone-width layout never applied: the row stayed absolutely
    positioned and went FIXED as soon as you scrolled. Same shape as landmine 14.
21. **The deck's `remeasure()` ran during the intro and before the fonts landed,
    and nothing re-ran it.** Cached `base` was 1773 against a true 1710, so every
    card activated 63px late and every card's fade came off a ladder that did not
    exist. It now re-runs on `fonts.ready`, on `load`, at 3.2s, and from a
    ResizeObserver on `.decktext`.
22. **Deck playback is its OWN index, and it is a LIST.** A card climbs 913px
    before it parks, so tying `play()` to the park left every demo frozen on its
    poster for most of a screen-height; and during a hand-off two cards are on
    screen with neither faded, so one running clip froze the one you were reading.
    Clips run once half the card is on screen and stop at `--d > 0.7`; at most two
    at a time. `preload="none"` also means nothing is fetched until asked, so
    `warm()` fetches one clip ahead.
23. **The first clip used to start at page load and never rewind.** `onDeck()`
    runs at script time, `show(0)` played it 1,700px above the fold, and `show()`
    short-circuits on `i === cur` -- so the first demo a visitor ever saw was
    already mid-story. The playback list is `[]` until the deck is approaching.
24. **`dl_buttons()` renders TWICE, so nothing on a download button may be an
    `id`.** The lifted `modal.js` bound the install-tips popup with
    `getElementById`, and the hidden in-flow row comes FIRST in the document --
    so every chip on the visible pill fell straight through to
    /releases/latest with no install tips, and the iOS chip (href `#`) did
    nothing at all. Buttons carry `data-dl` now and the script binds every
    match. Re-test by clicking all five platforms in BOTH `.dlfloat` and
    `.dlrow`; a click that navigates has silently unbound itself.

## Decisions locked with Destin (don't reopen)

- Theme is the page's identity; every colour comes from the app's themes.
- No glass gutter around screenshots/demo — media mounts flush.
- Floating pill = back-to-top + Download, bottom-centre.
- Nav corner radius = `var(--radius)`; subtitle on one line at desktop width.
- Download row: Windows/macOS/Linux/Android + **iOS\*** → popup. The remote-access
  MENU PATH is deliberately unnamed (unverified in the app).
- Account cards: whole card is the link; the two-destination one is `div[role=link]`.
- Integrations between demo and story, with the NOTE line.
- **Mascot picker:** four themes only — cotton-candy-sky, meadow-mist,
  halftone-dimension, golden-sunbreak. **One robot silhouette in four colours**,
  not each theme's own mascot art: the per-theme art turns to mush at 62px and
  made four buttons that read as four different kinds of thing. Chips use the
  CURRENT theme's glass so they follow light/dark. Only two of those four themes
  ship a mascot at all; the other two use the app's own `AppIcon` fallback, which
  is what the real app renders for them.
- **Hero intro:** `Make AI Useful. → Fun. → Yours.`, ported from the live page.
  Golden Sunbreak → Halftone → Cotton Candy, resting on the last. The headline
  row starts CENTRED (no drop-in — the transform is pinned off during the intro)
  and only the exit glides. Timings after three rounds of tuning: word delays
  .62 / 1.40 / 2.18s, bump .82s, page rise fires at 2.36s over .58s. Meadow Mist
  sits the intro out — three words, four themes.
- **Section spacing:** `section{padding:28px 0}` → 60px of painted empty space
  between sections. Was 68px/136px. Destin asked twice; don't re-inflate.
- **FAQ** cards span the full column; the answer is NOT width-capped (his call).
- **Gallery** sits in the content column and its ends dissolve — but only where
  there is more to scroll to, driven from JS.
- **Features section = the deck-fade.** Cards butt together with 9vh between,
  every card rests at the same 80px line (no fan — a fan made the first three
  cards behave differently from the rest), sides alternate, copy is top-aligned,
  and the fade is driven CONTINUOUSLY off scroll position with transitions OFF.
  An integer fade plus a transition was the jank. The last card is measured
  differently on purpose: nothing can cover it, so its exit is driven by rising
  above its rest line.

## Decisions locked 2026-08-31

- **Headline: `An Assistant That's Useful. → Fun. → Yours.`** at the `h1-md`
  size. Four alternatives were built and three rejected; a two-slot version of
  "A Useful / A Fun / Your Assistant." was built and abandoned mid-flight.
  The sub-headline still ends "…to work and **build** your way" — same worry,
  not yet addressed.
- **Hero geometry:** window cropped to 16/8.8, dissolve starts at 40 percent of
  its height, pill rests 5 percent above the bottom edge and docks 34px above the
  window bottom. The dissolve LIFTS as you scroll, anchored on the embed's own
  bottom edge passing the docked pill (not on the docking moment — the pill docks
  while that edge is still below the fold).
- **Download pill:** one shared glass pill, accent ring, small "Try Demo" pill
  beside it that takes its height from the row (`align-items:stretch`), and a
  **DOWNLOAD** label straddling the top border at the LEFT. The label is opaque:
  the ring is a box-shadow and cannot be notched, so a translucent label lets the
  line read through it. The page's own floating "↑ Download" pill is hidden — it
  was a second bottom-centred download control on the same screen.
- **Try Demo** clears the dissolve over 520ms, docks the pill, and scrolls back
  to the embed first if the visitor has already scrolled past it.
- **Brand:** mascot in the accent tile (`brand-tile`), wordmark in ONE colour
  (`wm-one`) — the accent now appears exactly once in the bar, in the mark.
  Four whole-bar restyles (bare, split, glass disc, one-line lockup) were built
  and rejected: "not great options, closer to L".
- **The mascot has a size floor** — it silts up below about 20px on screen, the
  same reason the theme picker uses one silhouette rather than the themed art.
- **"More than a chatbot"** is ONE column at the same full width and left edge as
  every other section. A centred, narrowed version was built and rejected.
- **Kicker** is bigger/darker/tighter to the headline (0.8rem, 90 percent, 9px gap).
- **Selected mascot chip** breathes — halo, inner wash and a 1.1° lean on a 3.8s
  loop, with hover a scale and never a lift. First cut was twice this and read as
  distracting.

## Decisions locked 2026-08-31 (later)

- **Features deck row 2 is the artifact-edit demo.** Attach a spreadsheet, ask
  for a chart, open the generated HTML in the panel, change one colour, save,
  watch it repaint. The workbench half (writable artifacts, the site session's
  own two files, `chart.jsonl`) is dev-only and lives in the worktree.
- **The "works everywhere" card has the phone overlay back**, and the phone and
  desktop clips are ONE TAKE AT TWO SIZES -- same script, same fixture, same
  holds, 1440x900 and 390x844. They were previously unrelated recordings (20s vs
  5s, different fixtures). The phone plays at duration-ratio speed so the pair
  never drifts.
- **Deck clips rewind on activation** rather than resuming, so a visitor always
  sees a demo from its start.
- **`media/` is the LIVE site's asset directory** (a symlink). Everything the
  redesign records goes in `media-local/` and is listed in `MEDIA_LOCAL`. The
  live rig's `row5-follow.json` scene is deliberately unmodified for the same
  reason -- `site-assets.sh` regenerates the real page from it.

## Working rules

- Deliver files/URLs as plain paths in chat. No claude.ai Artifacts.
- Explain in layman's terms — Destin is a non-developer; focus on what he will SEE.
- Iteration mode: report what changed and stop; no merge/close-out prompts.
- Mockup work only — no sub-repo code changes without asking.

## Open / next

- ~~NEW DEMO CLIP~~ **DONE 2026-08-31.** Row 2 of the features deck is now
  "Real work, edited live": attach a spreadsheet, ask for a chart, open the
  generated HTML in the panel, edit its colour, save, watch it repaint. Clip at
  `media-local/row2-artifact-edit.webm`, scene at
  `scripts/ui-review/scenes/row2-artifact-edit.json`, and the app-side (dev-only)
  half is in the worktree `worktrees/grok-clip` on branch
  `feat/landing-demo-clips` — TWO commits, both UNPUSHED: the softened Grok line
  and the writable-artifact mock.
- Deck: Destin may want the fade to reach three cards deep rather than two.
- The sub-headline's "build your way" is the same framing worry the headline
  change was meant to fix. Not raised again since; ask before rewriting copy.
- The demo clip's dead space is now more visible, not less: the conversation
  fills only the top third of the window, so most of what dissolves is empty
  app. Re-filming it tighter is the fix.
- The `mascots/<theme>.svg` files are unused now that all four buttons use
  `default.svg`. Kept in case a bigger surface wants the real art.
- The roadmap card's sketch is forced visible in the deck (it is built to
  crossfade on the shared stage, so it was an empty panel).

## Running state Destin may ask you to clean up

- `serve.py` on 8901 (mockups) and `python3 -m http.server` on 8899 (live page copy).
- `worktrees/site-themes` — REQUIRED by setup.sh; do not remove.
- `worktrees/grok-clip` (branch `chore/grok-demo-copy`, one commit, unpushed) —
  the softened Grok fixture. Only needed to re-film that clip.
