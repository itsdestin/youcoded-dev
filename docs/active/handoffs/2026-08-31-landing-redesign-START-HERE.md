---
status: active
created: 2026-08-31
updated: 2026-08-31
owner: landing-page redesign — pick up and keep iterating
---

# Start here: landing-page redesign

Paste this whole file into a new session.

## What this is

A **mockup-only** redesign of the public landing page. The real page
(`youcoded/docs/index.html`, live at itsdestin.github.io/youcoded) has **not been
touched** and must not be until Destin says the redesign ships.

Everything lives in `docs/active/prototypes/landing-redesign-mockups/`.

## Boot it (30 seconds)

```bash
cd docs/active/prototypes/landing-redesign-mockups
bash setup.sh            # symlinks + wallpapers + compare page
python3 build.py         # regenerates mockups/mockup-landing.html
python3 serve.py 8901    # http://localhost:8901/compare.html
```

**Serve with `serve.py`, never `python3 -m http.server`** — the latter sends no
cache headers and Destin ends up reviewing a stale page and reporting your
changes as not applied. That has already cost a round trip.

## Where it stands (2026-08-31)

**`mockup-landing.html` is the page of record.** A copy-experiment variant B
existed for one session and was dropped — do not revive `YC_VARIANT`,
`mockup-landing-b.html`, or a second FEATURES list.

Everything in the previous checkpoint still holds. What changed this session:

**Hero motion (all shipped into A):**
- The dissolve mask is now **two intersected layers** — a static rounded-rect SVG
  plus a CSS gradient driven by `--fade-stop`. Scroll writes one property instead
  of re-encoding a data URL (measured: 0 SVG rebuilds across 100 scroll steps,
  down from ~50).
- Scroll work is **rAF-coalesced**, not once per wheel event.
- The dissolve **holds for ~80px, then eases in and out**, anchored on the embed's
  bottom edge passing the docked pill, finishing ~470px. It used to start on the
  first wheel notch and finish at 305px while the window was already leaving.
- The download pill's **width is pinned** across the four picker themes, so a
  mascot click no longer slides it sideways (was up to 8px; now 0).
- The narrow (<820px) layout actually applies now — it was outranked on
  specificity and went `position:fixed` the moment you scrolled.

**Features deck (all shipped into A):**
- The deck **re-measures** after fonts land, after the intro, on load and via a
  ResizeObserver. Its cached ladder was 63px wrong, so every card fired late.
- A card's clip now starts when **half the card is on screen** (~600px before it
  parks) rather than when it parks, and **two clips may run during a hand-off**
  so the card you are still reading does not freeze.
- Nothing plays before the deck is approaching or after it is behind you; the
  first clip no longer loops invisibly from page load.
- Each clip is fetched one card ahead (`preload="none"` fetched nothing until
  play was called).

## The files that matter

| File | What it is |
|---|---|
| `build.py` | THE generator — headers, features rows, FAQ, all the JS. Edit this, never the built HTML. |
| `css_d.css` | Skin base: wallpaper, glass, type, sections, FAQ, gallery. |
| `css_d_headers.css` | Hero arrangements, mascot theme picker, the word cycler and its intro. |
| `css_theater.css` | The features-section layouts. The live one is `deck-fade`. |
| `css_embed_fade.css` | Hero dissolve, the floating/docking download pill, its DOWNLOAD label. |
| `css_nav.css` | Brand mark + wordmark treatments (live: `brand-tile` + `wm-one`). |
| `media-local/` | Clips recorded FOR the redesign. |
| `mockups/media/` | **Symlink into the LIVE site's assets — never write here.** |
| `compare.html` | Tab shell. One tab today; add a line to `VARIANTS` to A/B something else. |

## Tooling

| Tool | Use |
|---|---|
| `python3 serve.py 8901` | No-cache static server. |
| `node viewshots.mjs <url> <prefix> "name=JS"` | Viewport screenshots. `"x=@wait 6000"`, `"x=@hover <sel>"`. `VS_W`/`VS_H` set the viewport. |
| `node evalpage.mjs <url> <setupJS> <ms> <expr>…` | Print JS values instead of pictures. Same `VS_W`/`VS_H`. |
| `node introshot.mjs <url> <prefix> <ms>…` | Shots at absolute times — the hero intro is over in 2.4s. Honours `VS_W`/`VS_H`. |
| `node scrollprobe.mjs <url> [from] [to] [step]` | **New.** One TSV row per scroll position: pill top/left/docked/hidden, hero bottom, live `--fade-stop`, embed top. Every hero-motion bug this session was invisible in a screenshot and obvious in this column of numbers. |
| `node introprobe.mjs <url> [ms]` | **New.** One row per frame from the FIRST PAINT: the pill's top, its effective opacity (every ancestor's multiplied) and what it is positioned against. The intro is over before evalpage's 5s settle or viewshots' 6s, so nothing else can see it. Found the pill's 144px one-frame jump. |
| `node bands2.mjs …` | Full-viewport captures with the wallpaper flattened to white, for measuring real empty space. |
| `node ../../../../scripts/ui-review/record.mjs <scene> <out>` | Record a demo clip. Needs the workbench up. |
| `bash scripts/run-workbench.sh <worktree>` (from the workspace root, `YOUCODED_PORT_OFFSET=300`) | The fake-backend app on :5473, which the clips are filmed against. Headless — no window appears. |

## Copy — what Destin signed off (2026-08-31, this session)

Not a brief. Do not invent a new strategy doc.

- **Replacement, not inventory.** The page argues that one assistant on your
  computer and your phone takes the place of the pile of AI tabs. It does not
  win by listing traits every rival also claims.
- **Useful / Fun / Yours is the page**, not just the headline cycler.
- **Destin built this by talking to it** is the proof the agent is good. That
  currently sits in FAQ #7; it is not a cute bio.
- **First eight seconds = work in motion.** Empty chrome and the Grok-edgy
  “any model” clip are not the opener.
- **The fight worth fighting is owning the agent**, not beating Cursor as an
  editor. Git review is a feature. Ownership is a position.
- **Banned on this page and in any copy you write for it:** “real app”,
  “real files”, “actually reads”, “does real work”, “self-improving”, leading
  with undo, leading with uniqueness / “nobody else has this”, a student/dev
  chooser, “do the reading on the bus with no data plan”.

`youcoded-feature-fact-sheet.md` is an **inventory**. Use it to check whether
a claim is true. Do not quote its old pitches (they were deleted) and do not
treat §22 as a ranking of what to put above the fold.

## Read next

`docs/active/handoffs/2026-08-30-landing-redesign-iteration-handoff.md` — locked
visual decisions and **23 landmines**. Read the landmines before touching
motion, clips, or CSS.

## How Destin works

- He is **not a developer**. Explain in plain language, focused on what he will
  SEE. No jargon.
- Hand him **plain file paths and URLs in chat**. Never claude.ai Artifacts.
- **Iteration mode**: report what changed and stop. No "shall we merge?" prompts.
- **Claims need measuring.** "It's centred", "they're in sync", "it fits" — take
  the measurement and paste it. Several bugs this session were caught only
  because a number disagreed with a screenshot, and **two claims I made from an
  agent's report were wrong until checked against the code** (Android tags, and
  the conversation list's speed).
- Screenshot every visual claim before making it.

## Open / next

- **Copy is the live question, not motion.** See the signed-off list above.
  Do not lead with tags, notes, or “nobody else has this.”
- **Games card is factually behind the product**: it says Connect Four only,
  but the four-game arcade **merged 2026-08-31** (`0cacff56`) and is on master.
  Re-film before changing that copy.
- **Never put on the page without fixing first** (fact-sheet §25): the README
  says a Claude plan is *required* while the site says optional; the
  integrations grid promises services the registry does not back, including a
  Safari chip with zero registry presence; the live page still carries
  "designed from the ground up **to improved by**" at
  `youcoded/docs/index.html:1490` (fixed in the mockups, not on the live site).
- Deck: Destin may still want the fade to reach three cards deep rather than two.
- The demo clip's dead space — the conversation fills only the top third of the
  window, so most of what dissolves is empty chrome. Re-filming it tighter is
  the fix.

## In-flight elsewhere

- **App-side worktree `worktrees/grok-clip`, branch `feat/landing-demo-clips`,
  TWO UNPUSHED commits.** Dev-only workbench changes: the softened Grok reply
  and the writable-artifact mock the row-2 demo needs. No PR yet.
- `worktrees/site-themes` is **required** by `setup.sh` — do not delete it.
- The four-game arcade **merged 2026-08-31** (`0cacff56`). Branch deleted; film from master.
