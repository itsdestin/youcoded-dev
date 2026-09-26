---
date: 2026-09-24
status: active
type: handoff
topic: Minimalist chrome + global Look settings — built and in PR; next is refining the Appearance panel before merge
---

# Minimalist chrome + Appearance panel — START HERE

## Where things stand

Everything below is built, checked, and open as PRs. **Nothing is merged.** Destin wants
to refine the Appearance panel further in this new session, then merge.

Resume the same branches: `node scripts/workspace-start.mjs --session theme-minimal-chrome
youcoded wecoded-marketplace wecoded-themes`. Every repo uses the branch
`session/theme-minimal-chrome`.

| Repo | What it carries | PR |
|---|---|---|
| youcoded | the Minimalist (`chrome-style: 'float'`) style; the global Look settings and the reorganised Appearance panel; the contrast rule (vendored); the phone fix | itsdestin/youcoded#569 |
| wecoded-marketplace | theme builder offers Minimalist (Kit preset, preview CSS, template, SKILL.md; plugin 1.0.1 → 1.0.2); canonical contrast rule | itsdestin/wecoded-marketplace#104 |
| wecoded-themes | the vendored contrast rule | itsdestin/wecoded-themes#35 — **merge after #104** (its drift check compares against marketplace master) |
| youcoded-dev (workspace) | review decks + answers, reviews, rules, roadmap item, this handoff | itsdestin/youcoded-dev#201 |

## Appearance panel redesign — done 2026-09-24/26 (decks review-3 … 7, theme-cards, theme-previews)

All approved by Destin; nothing merged. Final panel, top to bottom: **Themes** (filled box
~1.5 cards tall, Browse/Build pinned inside at the bottom, cards scroll under them behind the
masked fade `.scroll-mask`, `styles/scroll-mask.css`) → **Layout** (picture tiles in the
theme's own colours) with the **Additional Customizations** row under it (opens in place:
Message bubbles, Roundness Square/Soft/Round, Glass strip + Fine-tune) → **Effects & chat**.
"Auto" is every picker's first choice (= absent field). The **Message box setting is gone**:
a chosen layout brings its preset input-style (`LAYOUT_INPUT_STYLE`, look-overrides.ts).
Theme cards: `components/appearance/ThemeCard.tsx` — framed picture + slim strip, star
always shown; falls back to the registry preview because installs never download
preview.png (pinned by `tests/theme-card-preview.test.tsx`). Previews for the 4 built-ins
and 8 community themes are now real-app screenshots (`scripts/ui-review/theme-previews.py`);
the community ones ride on wecoded-themes #35. Own-theme previews still drawn — roadmap
`themes.md`. The fade elsewhere is left to the ui-consistency session (AR4-5).

## What the next session is for

**Refining the Appearance panel UI.** Destin: "the ui for the appearance panel will still need
to be completely rebuilt. a separate session is working on design guidelines and will manage
that. mostly just prioritizing functionality for that atm." Then (2026-09-24): "i will refine
the appearance panel a bit further in a new session before merging." Ask him what he wants
changed before touching it; check whether the design-guidelines session has produced
guidance that applies.

**The contract a redesign must keep** (the functionality is the lasting part; the controls
are interim — a comment at the top of `LookSettings.tsx` says so):
- One global set of user choices laid over every theme: layout (`chromeStyle`), glass
  (`glass` preset + `glassCustom` for Fine-tune), `bubbleStyle`, `inputStyle`, `roundness`.
- **An absent field means "Theme's choice".** Nothing changes for anyone until they pick
  something (`applyLookOverrides` returns the SAME theme object when nothing is set — pinned).
- **No per-theme user tweaks.** The old per-theme `glassOverrides` were retired and are
  dropped on update, not migrated (Destin's answers, below).
- Saved to `~/.claude/youcoded-appearance.json` as `lookOverrides`; mirrored to localStorage
  (`youcoded-look-overrides`) so the first paint wears it; broadcast live to other windows;
  the disk write is throttled (`LOOK_PERSIST_MS`, 300 ms) and flushed on close.
- The user-theme editor (pencil, only on themes the user built) reads the RAW theme from
  `allThemes`, never `activeTheme` — otherwise saving would bake the global Look into the
  theme file. Its sliders grey out while the matching Look setting overrides them.

## Files

App (`youcoded/desktop/`):
- `src/renderer/themes/look-overrides.ts` — the rules: presets, parsing, `applyLookOverrides`
- `src/renderer/state/theme-context.tsx` — `lookOverrides` / `setLookOverrides`, load, sync, throttle
- `src/renderer/components/appearance/LookSettings.tsx` — `LayoutSettings` + `LookSettings` (interim UI)
- `src/renderer/components/ThemeScreen.tsx` — panel sections: Layout · Themes (favorites box) · Look · Effects & chat; the user-theme editor
- `src/renderer/components/SettingsPanel.tsx` — the dialog (title "Appearance")
- `src/renderer/styles/float-chrome.css`, `themes/theme-engine.ts` (`FLOAT_CHROME_GLASS`) — the Minimalist style itself
- Tests: `tests/look-overrides.test.ts`, `tests/ThemeProvider.test.tsx` (Look throttle), `tests/theme-builtin-sources.test.ts` (Minimalist outline), `tests/float-chrome-pops.test.ts`, `tests/theme-build-button.test.tsx`
- Docs: `docs/theme-spec.md` (chrome styles, Look), `desktop/CLAUDE.md` (persistence line)

Decisions (workspace, `docs/active/design/2026-09-20-minimalist-chrome/`):
- `appearance-panel.questions.json` + `.answers.json` — AP-1 one picker; AP-2 presets + Fine-tune;
  AP-3 global wins **and** "get rid of theme-specific tweaks"; AP-4 bubble shape, message box,
  roundness; AP-S1 nothing changes until changed; AP-5 undecided → AR-6 kept sections; AP-6
  two-row favorites box; AP-7 short route. In chat: old per-theme tweaks are **dropped**, not migrated.
- `appearance-panel.review.json` + answers — AR-2..5 yes; AR-1 note: "layout should be at the
  top. i want it to be clearer that there is a container around the themes and add our fade
  effect so it's scrollable."
- `appearance-panel.review-2.json` + answers — AR2-1 yes (layout on top, outlined edge-faded box).
- Shot plans: `appearance.shots.json`, `appearance-before.shots.json` (Before needs a master
  workbench on another port — see below).
- Minimalist style decks: `minimalist-chrome.*` rounds up to 9 and `.surfaces`.

Reviews: `docs/active/reviews/2026-09-24-float-chrome-code-review.md`,
`docs/active/reviews/2026-09-24-float-chrome-integration-review.md` (with a follow-up section).

## Known limits and open items

- **Windows:** the per-button blur is untested on Windows; Destin shipped it as is. Roadmap
  `themes.md`, flagged `v1.3.1` — test before that release. Reduce Visual Effects turns it off.
- **Theme-builder preview** cannot sample the wallpaper for text colour, so its Minimalist
  chips use the theme's `--fg`; over a busy wallpaper the preview reads a little worse than the app.
- **Favorites box:** mouse wheel over it scrolls the box, not the panel. The active theme is
  scrolled into view until the user touches the box.
- **Ivory Schematic** is Destin's unpublished theme; deliberately not copied into the
  workbench (it would make its files public).
- The shared checkout `/home/destin/youcoded-dev/wecoded-marketplace` still holds the
  uncommitted first draft of the theme-builder change; it is superseded by the marketplace
  PR. Leave it alone (workspace sync owns shared checkouts).

## Working here

- Workbench: `bash scripts/run-workbench.sh <this worktree>` (was serving on 5233);
  Minimalist on any theme: `?chrome=float`, or in the page
  `window.__workbenchAppearanceSync({lookOverrides:{chromeStyle:'float'}})`.
- Before pictures: a detached `origin/master` worktree INSIDE the workspace (cross-device
  hardlinks fail in /tmp), `cp -al` its `node_modules`, serve with `YOUCODED_PORT_OFFSET=97`
  (5243 was taken). Remove it after.
- Screenshots of a scrolling list: `SHOW_SCROLLBARS=1` keeps scroll bars in `shot.mjs`.
- Check: `bash scripts/verify.sh [--full] youcoded`. All green at hand-off, full suite included.
