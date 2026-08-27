---
status: draft
date: 2026-08-27
topic: Landing page rebuild for the 1.3.0 release — positioning, structure, live/recorded app demos
audit: docs/active/investigations/2026-08-27-landing-page-audit.md
---

# Landing page rebuild — design

The site at `itsdestin.github.io/youcoded` (`youcoded/docs/index.html`) was last written for v1.2.0 on 2026-04-22 and still describes "an add-on for Claude Code." This rebuild rewrites it for **1.3.0, the first broad public release**, keeping the general layout and replacing the hand-drawn app mockups with the real app — recorded and, in one place, live.

## Decisions already made (Destin, 2026-08-27)

| Decision | Choice |
|---|---|
| Target | The 1.3.0 product on master, published pre-emptively for that release |
| Voice | Audience-neutral, plain English (option B). Sell a useful product, not an open-source tech demo. No "harness", "agentic", "open-source", "built with Claude Code" in headlines |
| Copy standard | Concrete nouns, the fewest words, lead with the actual difference. "AI assistant that does real work" was rejected as meaningless. **Every changed string is reviewed by Destin in one old→new document before launch** |
| Wordmark | "YouCoded **Agent**" (styled variant; "Agent" visually subordinate). Subheader: **"AI for Everyone."** |
| Hero | "Make AI *Useful.* → *Fun.* → *Yours.*" — exactly three cycler states, slightly faster than today (~1.2 s gaps vs ~1.55 s), theme crossfades re-timed to match, page rests on "Yours." |
| Accounts | **GitHub required** (sync, marketplace, sign-in). Anthropic, OpenRouter, Google/Apple all **optional** (Google/Apple = Drive/iCloud second-copy backup) |
| Gallery | Keep the horizontal strip, refresh its images |
| Agents & Automations | Gets a row, visibly labelled **Roadmap** — sketch-style mock, not a recorded loop |
| Mockups | Recorded loops of the real app per row + one live, clickable embed near the top |

## Page structure (same general layout as today)

1. **Nav** — wordmark + subheader · About · Features · Download · FAQ · theme-cycle button.
2. **Hero** — headline with the 3-state cycler; one sentence; two buttons: **Download** (→ #get-started) and **See it work** (→ the live embed).
3. **Live embed** — the real renderer in a window frame; theme swatches and a model chip the visitor can click. See *Demo pipeline → Live embed*.
4. **What is this?** — one short box. Placeholder copy (draft 1, to be reviewed):
   > Most AI lives in a chat box on someone else's website. YouCoded Agent lives on your computer and phone, working in your own files — with Claude, hundreds of other models, or one that runs free on your machine. The look, the plugins, and your data are all yours.
   Followed by the permission note ("Nothing happens without your permission…").
5. **Showcase rows** (label · headline · ≤2 sentences · recorded loop, alternating sides):

| # | Row | The scene the loop shows | Theme |
|---|---|---|---|
| 1 | One app, any AI | Model picker: Claude → an OpenRouter model → a local model, chat continues; status-bar model chip changes | Midnight |
| 2 | It actually does things — and asks first | A request over a folder of files; Read/Edit/Bash cards; a permission prompt answered; the Permissions settings screen listing the remembered rule | Crème |
| 3 | Your projects, in one place | Project View: Files tab opens a PDF and a spreadsheet in-app; the editor pane; one project-wide search | Light |
| 4 | Stay organized | Quick chips clicked; a session tagged + noted; resume list filtered by tag; the Context tab showing the project's instructions | Dark |
| 5 | Follow you everywhere | Same conversation on desktop → phone frame (workbench narrow viewport) → browser tab; sync "up to date" | Meadow Mist |
| 6 | Make it yours | Today's Theme Builder scene (frame re-skins to Golden Sunbreak), then a pan across the real marketplace with the current plugin count | Midnight → Golden Sunbreak |
| 7 | Play while it works | A task running; Connect Four with a friend in the side panel; presence dots | Halftone Dimension |
| 8 | For builders | A Claude Code session tab beside a native session; git review (diff → stage → commit); an MCP server listed; local model manager | Midnight |
| 9 | **Roadmap:** Hand it off | Agents view sketch: a named automation with a schedule, "Run now" from a phone, an inbox entry waiting for approval. Copy names schedule/manual triggers as the plan and email/file triggers as where it's headed | outlined/sketch style, deliberately not a screenshot |

   Row 8 is the only place "Claude Code", "MCP", "git" appear. Rows 1–8 are shipped in 1.3.0; row 9 is not, and its label and visual style say so.
6. **Story — "How we got here."** Both existing paragraphs kept; a short third paragraph turns "never written code" from the point into the proof.
7. **Get started — accounts.** Four cards in this order: **GitHub** (Required · Free — sync, marketplace, sign-in; "Sign up with Google or Apple in a minute") · **Anthropic** (Optional · Paid — Claude with a Pro/Max plan) · **OpenRouter** (Optional · Pay-as-you-go — hundreds of models, one account) · **Google or Apple** (Optional · Free — an extra copy in Drive/iCloud). One line beneath: *Or none of the paid ones — run a model on your own computer, free and offline.*
8. **Download** — four platform cards + install modal, unchanged mechanics (GitHub releases API, OS detection, per-platform steps). "Just bring your Claude plan" clause removed. Modal "After install" steps: sign in with GitHub → choose where your AI comes from (Claude / OpenRouter / local) → pick a theme. iPhone-via-remote note stays.
9. **FAQ** (7): different from ChatGPT/claude.ai? · do I have to pay for anything? · is my data private? · platforms? · need to code? · is agentic AI safe? · who built this?
10. **Gallery** — same strip, current screenshots from the rig, WebP.
11. **Footer** — unchanged links; the Anthropic non-affiliation sentence stays verbatim.

Cut: the 18-tag Integrations wall (folds into row 2's copy, listing only services the marketplace ships), the 10-item "everything else" accordion, the standalone Journaling row (an example inside row 6).

## Demo pipeline (the "true-to-life and alive" part)

**Recorded loops (rows 1–8).** The UI-review rig (`scripts/ui-review/shot.mjs`) already drives the real renderer in the workbench over the Chrome debugging protocol with scripted actions. It gains a `record` mode: run a scene's actions while capturing frames (`Page.startScreencast`), then encode to a looping WebM (VP9, ~15 fps, 960×600 stage) with a poster frame. Scenes live as plans in `scripts/ui-review/plans/site-*.json`; one command re-records every row. Rows play on scroll-in (IntersectionObserver, like today's Theme Builder demo), pause off-screen, and honour `prefers-reduced-motion` (poster only). Each loop is recorded in one theme; the page's theme switcher restyles the page, not the videos — the rows are spread across themes on purpose to show the range.

**Live embed (top of page).** A static build of the workbench in a **site mode**: dev toolbar hidden, scenario pinned, narrow set of controls exposed (theme swatches, model chip, composer). Loaded lazily — a poster + "Try it" until the visitor scrolls to it or clicks "See it work". **Size budget: measure first.** If the built bundle exceeds ~3 MB gzipped after trimming, the embed falls back to a recorded loop and the "clickable" promise is kept only for the theme swatches (which restyle a poster set). Whatever is unfinished in the UI is exposed verbatim, so the pinned scenario avoids surfaces still in Phase D flux.

**Gallery.** Rig shots of chosen surfaces across themes, converted to WebP (target: whole strip < 1 MB, vs ~12 MB today).

**Roadmap row.** Hand-built, outlined/sketch style — the one place a drawing is correct, because it must not look like a screenshot.

## Technical shape

- The page stays a single `youcoded/docs/index.html` with no build step of its own; recorded loops, posters, gallery images, and the embed bundle land in `youcoded/docs/site/` and are committed (GitHub Pages serves `/docs`).
- Re-record loops + gallery is one script (`scripts/ui-review/site-assets.sh`), added to the release checklist in `docs/build-and-release.md` so the site cannot drift four months again.
- Dead CSS removed (`.hero-tagline`, `.hero-btn`, `.steps-flow`, `.features-grid`, `.android-*`). `og-image.png` created (link previews currently broken). Fonts unchanged (DM Sans, JetBrains Mono).
- Work happens in a `youcoded` worktree on branch `site/1.3-rebuild`; previewed locally with a static server at desktop (1440) and phone (390) widths. It merges to master when Destin says the 1.3.0 story is ready to be public.

## Review gates (in order)

1. **Copy review** — one document, every string old → new, grouped by section. Destin marks up; nothing launches before this passes.
2. **Visual preview** — the built page served locally, desktop + mobile, plus the recorded loops individually.
3. **Verification** — every loop plays; the embed loads under budget or falls back; `og:image` resolves; Lighthouse mobile performance not worse than today's page; downloads still resolve from the releases API.

## Not in scope

Competitor comparison tables (our docs only *name* T3 Code, Goose, Windsurf etc. — no facts to compare against); any claim in the "never claim" list of the audit (long-running background commands, PDF/Word reading in the native harness, automations as shipped, native models on Android, IDE features); changing the site's URL or hosting.

## Open items to resolve during planning

- Embed bundle size (measure with a trial `vite build` of a workbench entry).
- Whether the workbench's fake backend already has scenarios covering rows 2, 4, 5, 8; missing ones become `MOCK_ONLY` fixtures.
- Row 5's phone frame: workbench narrow viewport inside a device bezel, or a real Android capture.
