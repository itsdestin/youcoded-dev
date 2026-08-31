---
status: active
created: 2026-08-31
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
bash setup.sh          # symlinks + wallpapers + compare page
python3 build.py       # regenerates mockups/mockup-landing.html
python3 serve.py 8901  # http://localhost:8901/mockup-landing.html
```

**Serve with `serve.py`, never `python3 -m http.server`** — the latter sends no
cache headers and Destin ends up reviewing a stale page and reporting your
changes as not applied. That has already cost a round trip.

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
| `compare.html` | Tab shell. One tab today; add a line to `VARIANTS` to A/B something. |

## Tooling

| Tool | Use |
|---|---|
| `python3 serve.py 8901` | No-cache static server. |
| `node viewshots.mjs <url> <prefix> "name=JS"` | Viewport screenshots. `"x=@wait 6000"`, `"x=@hover <sel>"`. `VS_W`/`VS_H` set the viewport. |
| `node evalpage.mjs <url> <setupJS> <ms> <expr>…` | Print JS values instead of pictures. Same `VS_W`/`VS_H`. |
| `node introshot.mjs <url> <prefix> <ms>…` | Shots at absolute times — the hero intro is over in 2.4s. |
| `node ../../../../scripts/ui-review/record.mjs <scene> <out>` | Record a demo clip. Needs the workbench up. |
| `bash scripts/run-workbench.sh <worktree>` (from the workspace root, `YOUCODED_PORT_OFFSET=300`) | The fake-backend app on :5473, which the clips are filmed against. Headless — no window appears. |

## How Destin works

- He is **not a developer**. Explain in plain language, focused on what he will
  SEE. No jargon.
- Hand him **plain file paths and URLs in chat**. Never claude.ai Artifacts.
- **Iteration mode**: report what changed and stop. No "shall we merge?" prompts.
- **Claims need measuring.** "It's centred", "they're in sync", "it fits" — take
  the measurement and paste it. Several bugs this session were only caught
  because a number disagreed with a screenshot.
- Screenshot every visual claim before making it.

## In-flight

- **App-side worktree `worktrees/grok-clip`, branch `feat/landing-demo-clips`,
  TWO UNPUSHED commits.** Dev-only workbench changes: the softened Grok reply
  and the writable-artifact mock the row-2 demo needs. No PR yet.
- `worktrees/site-themes` is **required** by `setup.sh` — do not delete it.

## Read next

`docs/active/handoffs/2026-08-30-landing-redesign-iteration-handoff.md` — the
full state: every locked decision, and **16 landmines** that each cost real time
(the live-demo iframe must never be clipped; `CORE_JS` is `%`-formatted so a
literal `%` breaks the build; sticky cards are bounded by their own parent; and
so on). Read the landmines before touching anything.
