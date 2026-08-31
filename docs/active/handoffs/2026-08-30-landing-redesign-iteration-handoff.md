---
status: active
created: 2026-08-30
updated: 2026-08-30
owner: landing-page redesign — iterate on the chosen direction
---

# Handoff: landing-page redesign (checkpoint 2)

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
8. **Copy is preserved, not rewritten.** Every sentence on the live page appears
   in the mockups except the Destin-approved diffs: the dropped "Click around, I
   guess." caption, the subtitle rewrite, the nav tagline (`Agents for everyone`),
   the kicker (`BYO model`), and the Grok demo line.
9. **Readability floor:** prose panels use `--panel-op-prose = max(opacity,.80)`
   and `--blur-prose = max(blur,16px)`. Don't simplify it away.
10. `.nav-links a` outranks `.cta` — nav link styling needs `a.`-qualified selectors.

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

## Working rules

- Deliver files/URLs as plain paths in chat. No claude.ai Artifacts.
- Explain in layman's terms — Destin is a non-developer; focus on what he will SEE.
- Iteration mode: report what changed and stop; no merge/close-out prompts.
- Mockup work only — no sub-repo code changes without asking.

## Open / next

- **NEW DEMO CLIP, approved and not started.** Destin asked for a features row
  about real work + file editing: attach a spreadsheet → ask for an HTML chart →
  edit the HTML to change a chart colour. He said "let's do it" to this plan:
  the edit is a colour change; it goes in as row 2 without replacing anything;
  the app-repo change is dev-only.
  **Why it is not done:** the app does all of this for real (`HtmlView`,
  `CsvView`/`XlsxView`, `CodeEditorView`, `artifacts:save`), but the WORKBENCH's
  fake backend serves artifacts read-only from a static fixture list and mocks no
  save at all — so a scripted turn cannot create a file, and an edit does nothing.
  It needs a writable artifact store added to
  `desktop/src/renderer/dev/workbench/mock-shim.ts` (~100 lines, dev-only), then
  a reply fixture, a scene, and a recording. Attaching a file IS already
  scriptable: `window.dispatchEvent(new CustomEvent('buddy:attach-file', {detail:{filePath}}))`.
- Deck: Destin may want the fade to reach three cards deep rather than two.
- The `mascots/<theme>.svg` files are unused now that all four buttons use
  `default.svg`. Kept in case a bigger surface wants the real art.
- The roadmap card's sketch is forced visible in the deck (it is built to
  crossfade on the shared stage, so it was an empty panel).

## Running state Destin may ask you to clean up

- `serve.py` on 8901 (mockups) and `python3 -m http.server` on 8899 (live page copy).
- `worktrees/site-themes` — REQUIRED by setup.sh; do not remove.
- `worktrees/grok-clip` (branch `chore/grok-demo-copy`, one commit, unpushed) —
  the softened Grok fixture. Only needed to re-film that clip.
