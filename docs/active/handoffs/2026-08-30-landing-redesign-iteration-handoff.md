---
status: active
created: 2026-08-30
owner: landing-page redesign — iterate on the D1 "Centred" mockup
---

# Handoff: keep iterating on the landing-page redesign (D1 Centred)

You are continuing a mockup-only redesign of the public landing page
(https://itsdestin.github.io/youcoded/, source `youcoded/docs/index.html`).
**Nothing in `youcoded/docs/` has been changed** — all work lives in
`docs/active/prototypes/landing-redesign-mockups/` (this repo). Destin has
picked the **"Skin" visual direction** (the page wears the app's own themes)
and is now refining the **D1 "Centred" header** variant. Treat the other
variants (D2–D4, E, F, round-1 A/B/C) as comparison history, kept alive in the
compare page but no longer iterated unless asked.

## Boot it

```bash
cd docs/active/prototypes/landing-redesign-mockups
bash setup.sh          # symlinks (media/gallery/icons/site), wallpapers, compare page
python3 build.py       # regenerates the six mockup pages into mockups/
cd mockups && python3 -m http.server 8901   # view: http://localhost:8901/compare.html#D1
```

Reference copy of the CURRENT live page: `cd youcoded/docs && python3 -m http.server 8899`.
Destin looks at these in his browser — tell him the URL, never open a window for him.
Headless Chrome for your own verification is fine and expected.

## The files

| File | What it is |
|---|---|
| `build.py` | THE generator. One `BODY` template + `HEADERS` dict (4 header arrangements) + `CORE_JS`. Edit this, never the built html. **`CORE_JS` is %-formatted — a literal `%` anywhere in it breaks the build** (use `String.fromCharCode(37)`; this has bitten twice). `patch_modal()` inside it is the ONLY place `modal.js` gets modified. |
| `css_d.css` | The Skin base stylesheet (wallpaper backdrop, glass panels, type). |
| `css_d_headers.css` | Styles for the four D header arrangements. |
| `css_embed_acct.css` | Live-demo embed + account-card rules, appended to every variant. |
| `css_modal.css`, `css_integrations.css` | Install-popup skin; integrations chips. |
| `modal.js` | Install-tips popup script, **verbatim from the live page** — keep it byte-identical; all changes go through `patch_modal()` in build.py. |
| `themes.json` | The 8 themes (7 community packs + Midnight) extracted from `wecoded-themes/themes/*/manifest.json`. Regenerate only if the registry changes. |
| `integrations.html` | The restored Integrations section (18 services), recovered from `git show 75b1ede6^:docs/index.html` in the youcoded repo. |
| `compare.html` | Tab shell (keys 1–9, ←/→). D1 is the default tab. |
| `viewshots.mjs` | Screenshot harness: `CDP_PORT=99xx node viewshots.mjs <url> shots/prefix "name=JS-expr" ...`. Special specs: `"x=@wait 8000"` (pause — the demo takes ~8 s to boot), `"x=@hover <selector>"` (real mouse hover for :hover states). |
| `evalpage.mjs` | Same, but prints JS expression values instead of screenshots (picks the `type==='page'` CDP target — don't "fix" that). |
| `measure.mjs`, `fullshot.mjs` | Page-height comparison; full-page capture. |

**Verify every visual claim with a screenshot before reporting it.** The whole
session history is littered with things that "should have worked" and didn't.

## Landmines — do not re-learn these

1. **Never clip the live-demo iframe with `overflow:hidden`, `clip-path`, or a
   rounded ancestor — and never round corners from inside the app either.**
   Chromium then ignores the app's chrome-glass cutout and blurs the ENTIRE
   demo window under framed wallpaper themes (Cotton Candy Sky, Meadow Mist).
   The working corner treatment is `maskEmbed()` in CORE_JS: an SVG
   rounded-rect `mask-image` regenerated at the embed's current size, on boot,
   theme change, and resize. **This bug exists on the real live page today** —
   ROADMAP.md entry tagged `#landing-page` (2026-08-30) has the full repro.
   Proof technique if you touch this area: hide `.bd-layer/.bd-scrim`, set the
   page background red, screenshot — rounded corners show red arcs.
2. **The demo iframe is the real app** (`site/index.html?mode=workbench&…`,
   same-origin). Theme sync = `iframe.contentWindow.__workbenchAppearanceSync({theme: slug})`,
   live, no reload; boot theme is preset via `localStorage['youcoded-theme']`.
   A slug the embed doesn't bundle is **silently ignored** — the 7-theme
   bundle comes from the worktree `worktrees/site-themes` (branch
   `feat/site-embed-all-themes`, uncommitted). **Do not delete that worktree**;
   without it `setup.sh` falls back to the main checkout's embed, which knows
   only golden-sunbreak / halftone-dimension / meadow-mist.
3. **Copy is preserved, not rewritten.** Every sentence on the live page must
   appear in the mockups except two Destin-approved diffs: the "Type a
   message, open the model picker…" caption (dropped with the "Click around, I
   guess." heading) and the subtitle rewrite ("…work and build your way").
   Sweep after structural changes: extract >35-char text blocks from
   h1/h2/h3/p/summary/button of live page vs mockup and diff (the transcript
   has the exact script; ~15 lines of python).
4. **Readability floor:** prose panels use `--panel-op-prose = max(opacity,.80)`
   and `--blur-prose = max(blur,16px)` because Strawberry Kitty's 30%-opacity
   panels are tuned for UI labels, not paragraphs. Frames/media keep the
   theme's real numbers. Don't "simplify" this away.
5. `.nav-links a` outranks `.cta` — nav link styling needs `a.`-qualified
   selectors. Bit all three round-1 mockups.

## Design decisions already locked with Destin (don't reopen)

- Theme = the page's identity; swatches in the nav; every colour from the app's themes.
- No glass gutter around screenshots/demo — media mounts flush, one clean edge.
- Floating pill = back-to-top + Download, bottom-CENTER of the window.
- Nav bar corner radius = `var(--radius)` (matches footer card), not a full pill.
- Download row: Windows/macOS/Linux/Android + **iOS\*** chip → popup ("not yet
  natively supported; host on any other platform, use remote access"). The
  remote-access MENU PATH is deliberately unnamed (unverified in the app) —
  if you learn the real label, put it in.
- Account cards: whole card is the link, hover = lift + accent outline;
  Google-or-Apple card is a `div[role=link]` (two destinations, links can't nest).
- Integrations section between demo and story; NOTE line included.
- Tightened header rhythm (2026-08-30 pass) — don't re-inflate spacing.
- Subtitle sits on ONE line at desktop width (no max-width cap).

## Working rules that apply here

- Deliver files/URLs as plain paths in chat. No claude.ai Artifacts.
- Explain changes in layman's terms — Destin is a non-developer; focus on what
  he will SEE, including side effects.
- Iteration mode: report what changed and stop; no merge/close-out prompts.
- This is all mockup work — no sub-repo code changes without asking. When the
  design is approved for the real page, that becomes its own planned port:
  fixture packs → youcoded master + `site-assets.sh` regen, the mask fix and
  iOS modal entry into `youcoded/docs/index.html`, per the ROADMAP entry.

## Known open items

- D2 (split): the five download chips wrap 4+1 in its narrow column — Destin
  hasn't chosen a treatment (shrink to fit vs 3+2 wrap vs leave).
- The compare page still lists all 9 variants; prune when Destin says so.
- Servers on 8899/8901 and the site-themes worktree are running state Destin
  may ask you to clean up when iteration ends.
