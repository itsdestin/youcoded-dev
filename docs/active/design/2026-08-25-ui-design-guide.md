---
status: active
date: 2026-08-25
owner: Destin (decisions) / Claude (draft)
related: 2026-08-25-ui-audit-findings.md (the evidence), docs/archive/specs/2026-07-16-ui-consistency-design-spec.md (the migration that made this possible)
---

# YouCoded UI Design Guide

**What this is.** The rulebook for how YouCoded looks and behaves, written from a
screenshot-by-screenshot review of every surface in six themes (see the findings doc).
It is short on theory and long on "do this, not that", because the app already has the
machinery — one token set, one `components/ui/` primitive set, one overlay layer — and
the remaining ugliness is almost entirely *choices made outside that machinery*.

**How to use it.** Building or changing UI: read §1 (the five laws), find the surface type
in §4, follow its anatomy, use only the primitives in §3, and run the §6 checklist before
asking Destin to look. Reviewing UI: the checklist *is* the review. Every rule has an ID
(`G-n`) so findings and PRs can cite it.

**Non-negotiables inherited from the workspace:** no jargon in copy ("files", not
"artifacts"); errors are specific-and-accurate or general-with-two-actions
(`docs/error-message-standards.md`); every control has an accessible name; nothing in a
component may re-declare a token value or a primitive's classes.

---

## 1. The five laws

**G-1 One primitive, one look.** Every button is `<Button>`, every switch is `<Toggle>`,
every field is `<TextInput>`/`<Textarea>`/`<Select>`/`<InputGroup>`, every close is
`<CloseButton>`, every single-choice strip is `<SegmentedTabs>`, every settings row is
`<SettingRow>`, every modal is `<Dialog>`, every empty/loading/error is the `states.tsx`
family. If a surface needs something none of these do, the answer is a *new primitive in
`components/ui/`* with a pinning test — never a one-off class string in a component.
(`tests/primitive-adoption.test.ts` enforces "every primitive has consumers"; the reverse —
"no hand-rolled lookalikes" — is what this guide adds.)

**G-2 Tokens paint everything.** The only colours a component may name are the 15 theme
tokens (`canvas panel inset well accent on-accent fg fg-2 fg-dim fg-muted fg-faint edge
edge-dim scrollbar-*`), the derived ones (`link`, `link-hover`, `destructive`,
`destructive-fg`, `on-destructive`), and the named semantic set in §2.3. A raw hex or a
Tailwind palette colour (`bg-green-600`, `text-yellow-400`) is a bug unless it is on the
documented-exception list (§2.3).

**G-3 Four radii, chosen by role — not by taste.** `sm` (4px) chips, tags, key caps, inline
badges · `md` (8px) buttons, fields, tool cards, list rows · `lg` (12px) cards, dialogs,
popovers, bubbles' *inner* elements · `xl` (16px) chat bubbles and full-screen panels ·
`full` only for the send/stop circle, avatars, toggles and the pill-shaped *filter* chips.
One view may show all of them, but the same *role* must never appear at two radii.

**G-4 One primary per view.** A dialog, card, sheet or screen has at most one filled
`primary` button. Everything else is `secondary` (outlined), `ghost` (text), or
`danger`/`danger-outline`. Two "main actions" means the copy is wrong, not the styling.

**G-5 Text has a floor.** Body `text-sm` (14px) · UI labels `text-xs` (12px) · captions,
counts and eyebrows `text-2xs` (11px) · **nothing below `text-2xs` may carry information.**
`text-3xs`/`text-4xs` (10/9px) exist for decorative glyphs. The **status bar is the one
documented exception** that carries information at `text-3xs`: raising it to 11px was proposed
(P-10) and Destin rejected it on 2026-08-26 — keep it at 10px and do not re-propose.

---

## 2. Foundations

### 2.1 Surfaces (the depth ladder)

Every theme provides four stacked surfaces. Use them by *depth*, never by colour:

| Token | Depth | Used for |
|---|---|---|
| `canvas` | the page | chat background, full-screen backgrounds (Projects, Library, Marketplace) |
| `panel` | one step up | Settings drawer, side panes (Session Files, games), dialogs, popovers, header/status chrome |
| `inset` | a well *inside* a panel | assistant bubbles, tool cards, settings-row cards, fields, hover fills |
| `well` | the deepest cut | search surfaces inside drawers, code blocks, disabled fills |

Rule **G-6 — text-on-surface pairs.** `fg` on anything. `fg-2` on anything. `fg-dim` on
`canvas`/`panel` only. `fg-muted` anywhere, including `inset`/`well` — since P-11 (shipped
2026-08-25) every built-in clears 4.5:1 there, pinned by `theme-builtin-sources.test.ts`. `fg-faint` is **decorative only** —
dividers, disabled labels, the `|` between glyph and title — never a spinner, never a
value, never a date. The token audit (`scripts/audit-theme-contrast.mjs`) already
enforces the pairs it knows; the painted-pixel probe in the findings doc is how you
check a *composite* (glass, tinted card, coloured text).

### 2.2 Type

One family per theme (`--font-sans` / `--font-mono`; built-ins are both Cascadia Mono,
community packs may swap). Scale: `text-lg` 18 screen titles · `text-base` 16 dialog titles
and card titles · `text-sm` 14 body · `text-sm-tight` 13 dense body (Project View only) ·
`text-xs` 12 labels, buttons, tool-card headers · `text-2xs` 11 eyebrows (uppercase,
`tracking-wide`), counts, timestamps. Weight: `font-medium` for anything clickable or a
title; `font-semibold` only for screen titles. No `font-bold`.

**G-7 Eyebrows are the only section header.** Uppercase `text-2xs` `fg-muted` with an
optional ⓘ (`AnchorTip`). Sentence-case labels inside a dialog are *field labels*, not
section headers, and sit directly above their field. Never mix the two for sibling groups.

### 2.3 Colour beyond the tokens (the semantic set)

These are the *only* non-token colours, each with a light-theme and dark-theme value
(the light values are the fix for T-1 in the findings):

| Name | Meaning | Where |
|---|---|---|
| `status-ok / -warn / -error / -idle` | session dots, provider state, "signed in" | header dots, provider cards — the "Signed in with your Claude account" line uses `status-ok` **as a dot + `fg-2` text**, never as coloured text |
| `diff-add / diff-remove` (+ their `-bg`) | code diffs | tool cards, compare view |
| `tag-*` (4) | the four session tags | tag pills — as a **dot + neutral text**, not as coloured text (fixes the 2.2:1 *Priority* on light) |
| `permit-yes / permit-always / permit-no` | permission prompt buttons | PromptCard only — decision 61 keeps these filled and coloured; this is the *one* place filled colour pills are allowed |
| `gold` (`STAR_GOLD_CLASS`) | ratings/favourites | stars only |
| Connect 4 red/yellow | game pieces | wire-protocol values; never themed |

Anything else — the Donate coffee-cup yellow, the ad-hoc red "Remove", the lime "Signed
in" — is a bug (§3 of the findings lists them).

**G-8 Where the accent may paint.** `accent` is for *state*, not decoration: the selected
segment in a SegmentedTabs, the on-state of a Toggle/Checkbox/Radio, the focus ring, the
primary button fill, the send button, links, and the active session dot. **Midnight and Dark
are monochrome by design** (decision 2026-08-25, P-12 rejected): their accent is a light grey,
*selected/primary* is signalled by the fill, *disabled* by dimming — and the disabled
treatment must never paint a background, or the two become the same grey block
(pinned in `Button.test.tsx`). Do not propose a colour accent for them again. It may **not**
paint borders of resting containers (composer outline, header outline), bubble stripes,
the count badge, or the *Chat* tab at rest. Theme packs inherit this list — a pack that
paints accent on eight things (Halftone today) is over budget. This stays a **review**
rule — the validator does not check it (P-16, decided 2026-08-25: no new pack rules).

### 2.4 Spacing, borders, shadows, motion

- Rhythm is 4px. Card padding 12/16, dialog padding 16 (`panel`) / 20 (`document`), row
  height 40–44 (settings rows are 51 and stay that way — decision in spec §20).
- Borders are `edge` (1px) on `panel`-level containers and `edge-dim` on `inset` ones.
  **Every secondary button and every field has a visible border in every theme.** The
  validator already refuses `edge-dim` below 1.3:1 on `panel`; the gap in practice is glass
  over a bright wallpaper (Meadow Mist, fixed in the pack 2026-08-25 — P-16), which no
  flat-token rule catches, so check it on the sheet.
- Shadows only on floating layers (dialogs, popovers, toasts) — `Overlay.tsx` owns the
  layer and z-index; nothing else sets `z-`.
- Motion: 150ms ease for hover/press, 200ms for drawers and sheets; all of it behind
  `prefers-reduced-motion` and the app's *Reduce Visual Effects* toggle. Hover effects are
  behind `@media (hover: hover)` (the `.hover-lift`/`.card-interactive` guard) so a tap
  never sticks.

---

## 3. Primitives — when to use which

| Primitive | Use for | Don't |
|---|---|---|
| `Button` `primary` | the one main action (G-4) | full-width fills as "section CTAs"; a *disabled* state that paints a fill (G-8) |
| `Button` `secondary` | every other action; also the "browse / open / manage" links inside dialogs | outline-with-fill hybrids ("Browse all themes →") |
| `Button` `ghost` | dismiss/cancel next to a primary, icon buttons at rest | using ghost for the *only* action in a view |
| `Button` `danger` / `danger-outline` | destructive confirm / destructive option among neutrals | red text without a button shape; red for "important" |
| `Button size="sm"` | inside cards and rows | mixing `sm` and `md` in one row |
| `Button size="icon"` (needs `aria-label`) | ✕ is `CloseButton`; everything else icon-only | bare `<button>` with an SVG |
| `Toggle` | any boolean setting (with the toggle-row card, §4.6) | checkboxes for on/off *settings* |
| `Checkbox` | multi-select in a list (Status Bar Widgets, AskUserQuestion multi) | toggles for list selection |
| `Radio`/`RadioGroup` | 2–5 exclusive options with descriptions (Sound, permission mode) | SegmentedTabs when options need a second line |
| `SegmentedTabs` | 2–5 exclusive *short* options or view switches (Haiku/Sonnet/Opus; Chat/Terminal; Plugins/Themes) | for filter categories (those are pills); for anything that wraps |
| `TextInput`/`Textarea`/`Select`/`InputGroup` | every field; `InputGroup` when a button lives *inside* the field (search + clear, key + save) | icon buttons floating over a bare input (Skills drawer today) |
| `SearchFilterPill` | every search-with-filter control (Projects, Session Files, Marketplace, Skills drawer, Resume) | four bespoke search boxes |
| `SettingRow` | any row that navigates or holds one control; **also every expand-in-place section** (`expanded` turns its right-hand chevron down) | hand-rolled `flex` rows with a chevron; **a bare leading “›” text toggle** (Destin, 2026-09-05: “I HATE the bare dropdowns with a chevron”) |
| `Dialog` (`prompt` 340 / `panel` 420 / `document` 600) | all modals. `prompt` = one question + buttons; `panel` = a settings screen; `document` = long prose | choosing `prompt` for a list (Keyboard Shortcuts); headerless dialogs (Donate/Development) |
| `Callout` | inline explainer or warning inside a panel | coloured borders on ad-hoc divs |
| `LoadingState` / `EmptyState` / `ErrorState` | *every* async surface's three states; `EmptyState` always names what's missing **and** offers the way out | a lone sentence ("Nothing matches those filters."); two empty states on one screen; blank headings |
| `Toast` | transient confirmation; action slot for one follow-up | toasts for errors that need reading (use `ErrorState`) |
| `ProgressBar` | determinate progress with a label | percent in a disabled button label |
| `AnchorTip` | the ⓘ explainer | tooltips via `title=` on non-icon controls |
| `StatusStrip` | the model-loading strip and any thin status band above the composer | new bands |

---

## 4. Surface anatomies

Each anatomy is the *standard*; the findings doc lists which surfaces deviate today.

### 4.1 Window chrome (header + status bar)

Header: `panel` band, 40px. Left: Settings gear · Projects folder · `SegmentedTabs`
Chat/Terminal. Centre: session strip (`● name` pill + status dots + ▾ *All sessions*).
Right: Session Files count · game · window controls. **G-15** Status bar: `panel` band,
one chip treatment for all chips (`secondary`-style outline at `sm`, `text-2xs`); the model
chip identifies the model by icon + name, not by colour; the theme chip is a label. At
phone width chips collapse to icons before the bar wraps; the bar never becomes two rows.

**The welcome (no-session) screen is part of the chrome** (G-13, built 2026-08-27 as P-6):
it carries the app's **bare frame** — the same header bar as a session, reduced to the
Settings gear, the Projects folder and the window buttons (Mac: the traffic-light pill);
no session switcher, no chat/terminal toggle, no status bar, no composer (`BareHeaderBar`).
Below it, one `primary` (*New Session*) and one `secondary` (*Resume Session*) centred with
the mascot. Destin's words: "just bare frame like terminal view".

### 4.2 Chat

- User bubble: `accent` surface, `on-accent` text, `xl` radius, right-aligned — in **every**
  theme (a grey bubble on light schemes, P-13, was rejected 2026-08-25; the solid bubble is the
  decision). Assistant bubble: `inset`, left-aligned, no accent stripe.
- Timestamps `text-2xs` `fg-muted`, inside the bubble, bottom-right.
- **G-20 Tool card**: header row = status glyph · 1px divider · `font-medium` verb +
  filename · `↳` `fg-muted` path · chevron **right-aligned**; body = file chip (type badge ·
  name · path · *Open ↗*) + preview. Every tool — including AskUserQuestion — uses this
  header. Option rows inside a card share one row style (bordered, `md`, two-line capable).
  Permission rows: the three coloured pills (decision 61) in one row, wrapping as a group
  never splitting *No* onto its own line.
- Thinking/musing chip: `inset`, `md` radius, `fg-muted`, spinner glyph in `fg-muted` (not
  `fg-faint`), left-aligned under the last bubble.
- Composer: `inset` field with a visible `edge` border (not a borderless grey pill),
  attach + skills icons as `ghost` icon buttons at left, stop/send as `full` circles at
  right; quick-chip row above it uses `secondary sm` chips with an edge fade when it
  overflows.
- **G-22 Find bar** (P-14, decided 2026-08-27 after two rounds): the bordered `panel` pill
  (field · count · prev/next/close) sits at the right edge of an **in-flow lane** above the
  messages — the lane paints nothing and only reserves the height, so the bar never covers a
  message; the transcript nudges down while it is open. Not a floating popover over the
  first bubble (rejected: it hid the message) and not a full-width strip (rejected: "I still
  want it to be its own element/pill with border").
- **G-23 Attachment card** (P-19, Destin picked design C of three, 2026-08-27): 128×96,
  `md` radius, `edge` border; preview on top — a picture's thumbnail, a markdown/text/code
  file's first ~600 bytes, otherwise a large type glyph with the extension; the name in a
  12 px strip along the bottom with the type icon; ✕ always visible top-right. **Rendered,
  never raw:** any tile that previews a markdown file shows formatted markdown (headings,
  bold, lists), never `##` — and a preview inside a tile contains nothing clickable
  (`MarkdownContent preview`), because tiles are buttons.
- Terminal view: **G-24** under a wallpaper or gradient theme the terminal sits on the
  theme's `panel` colour at ≥ 80% opacity (a pack asking for less is floored, more is
  honoured); flat themes are untouched. Decided 2026-08-27 from four renderings (60% text
  over the picture · 85% · panel 90% · panel 100%) — Destin: panel, at 80%. The rest of the
  terminal's anatomy is still unreviewed; the workbench now shows a frozen sample screen
  (`?termBacking=`), and the real-app pass reproduced the two-thirds-width bug (ROADMAP).

- **G-25 Session row** (P-8, decided 2026-08-28 over three rounds): a row in the All
  Sessions menu (and the Shift switcher, the same menu) is **two lines sharing one left
  edge** — the session name on line one, one line only, cut with `…` and carrying the full
  name as its `title`; the project folder on line two behind a small folder mark. The right
  column carries the **status pill** on line one and the session's **tag chips** on line two.
  A name never wraps (rejected: three-line names made rows 42–70 px and the list ragged), and
  the project never sits beside the name (it stole the width that caused the wrap).
- **G-26 Session status pill**: the bare status dot is a pill — dot + word — tinted with its
  own colour at ~15% with a 30% border, the **word in the theme's text colour** because the
  status palette is fixed (`bg-green-400` and friends) and a coloured word failed contrast on
  the pale themes. Words come from `STATUS_LABEL` (`StatusDot.tsx`), one place: Working ·
  Needs Input · Needs a Look · Response Ready · Inactive. Amber keeps its own word (picked
  2026-08-28 over folding it into red's, which would have made two colours say one thing).
- **G-27 Tags in a list row**: tags read as the picker's **named chips** (`TagChip`), never
  colour-only dots — capped at three plus a `+N` that names the rest on hover, with the note
  page-mark after them. Destin, 2026-08-28: "tags should not be dots, but full chips with
  spelled names."

### 4.3 Settings drawer + dialogs

- Drawer: `panel`, 320px, title row (*Settings* + `CloseButton`), then `SettingRow` cards
  (`icon · title · one-line live subtitle · chevron`, 51px). Subtitles must fit on one line
  at 320px — write them for that width; truncation is a copy bug.
- **G-10 Dialog header**: title (`text-base` `font-medium`) left · optional ⓘ · `CloseButton`
  right · hairline. **Every** dialog, including confirmations (Donate) and menus
  (Development). A back arrow appears only when the dialog navigated *within itself*.
- **G-11 Dialog body**: eyebrow sections (G-7); content scrolls inside the body — the shared
  body hides the scrollbar and fades the edge instead (`.scroll-fade`); a visible bar was
  proposed as P-4 and **declined 2026-08-28** (it would land in every scrolling panel for one
  dialog's complaint). A dialog must never switch the body off and then overflow: `prompt` +
  `scrollBody={false}` put three keyboard shortcuts beyond reach at every window size (P-7,
  guarded by `menu-row-reachability.test.ts`). The header never scrolls; nothing is ever clipped
  silently. Pick size by content: `prompt` for a question, `panel` for settings,
  `document` for prose/lists longer than ~8 rows.
- Footer: only when there is a decision to confirm — right-aligned `ghost` Cancel +
  `primary`/`danger`. Settings-style dialogs have no footer and no *Done* (closing is
  saving).
- Danger zone: only rows whose action is destructive or disables a safety; it gets a
  `Callout`, not just a red eyebrow.

### 4.4 Full screens (Projects, Library, Marketplace)

**G-16** One header: 48px `panel` band, `text-lg` title left (with the screen's icon for
all three or none), right side = cross-link `secondary sm` (e.g. *Your Library* ↔
*Marketplace*) then the back affordance. Back affordance = `Esc · Back to chat` on desktop
(keyboard-capable) and a `CloseButton` on touch layouts. Below the header: the content
switcher is `SegmentedTabs variant="pill"` — one rounded-full pill of icon + label + muted
count segments, chip-sized (`px-3 py-1 text-sm`) so it matches the filter pills beside it
(Library *Plugins | Themes*, Marketplace *All | Plugins | Themes*; shipped Phase C, #332) —
then the `SearchFilterPill`, then content on `canvas`. **Copy:** the user-facing word is
*Plugins*, never *Skills* (Destin, 2026-08-27). Library and Marketplace are see-through to a
pack's wallpaper (T-6); **Projects stays opaque by decision** (P-5 declined 2026-08-27 —
do not re-propose).

- Cards (`lg`, `panel`, `edge`, `card-interactive` hover): one card species per grid;
  document previews are the intended thumbnail look; the folder "tab" nub is Destin's
  2026-07-19 call and stays. Secondary affordances that sit on a picture (the favourite
  star on a theme card) appear on hover / keyboard focus only, so the picture stays clean.
- Header card on Projects: unchanged by decision (P-5, 2026-08-27) — *New Conversation*
  and *Turn on sync* both stay filled; Rename / Remove are already the shared `sm` buttons.

### 4.5 Side panes and sheets

Side pane (Session Files, games, Context panel): `panel`, 320px, title row with count
**in the title's own style** (see G-19) + `CloseButton`; list rows are `SettingRow`-shaped
without chevrons (icon · name · `text-2xs` meta). Bottom sheet (skills/commands): drag
handle, `panel`, search as `SearchFilterPill` with actions *beside* it, filter pills row,
then a card grid; empty → `EmptyState` centred in the sheet.

### 4.6 Rows, cards, chips, counts

- Toggle-row card: `inset`, title + `text-2xs` hint left, `Toggle` right. The one shape
  for every boolean setting.
- **G-14 Chips**: three kinds, three shapes. *Filter pill* = the shared `FilterChip`
  (`px-3 py-1 rounded-full text-sm`, `inset` + `edge` border at rest, `accent`/`on-accent`
  when active — Marketplace categories and the skills drawer's categories + Favorites-only,
  P-9 2026-08-27; the 12 px drawer pills were rejected as the smallest text in the app). *Action chip* = `md` radius `secondary sm` (quick
  chips). *Tag/badge* = `sm` radius, dot + neutral text (session tags, counts). Tabs are
  never chips — they are `SegmentedTabs`.
- **G-22 Expandable rows** (2026-09-05): a section that opens below its row is a `SettingRow`
  with `onClick` + `expanded` — the same right-hand chevron every navigating row has, turned to
  point down while open. Never a leading “›” glyph beside a word, never a bare text toggle.
  Filed in `docs/roadmap/user-interface.md` for the two places that still do it (Sync log,
  the system marker). The recommended-model card was fixed in the local-engine mockup's
  round 2, along with the engine card and the model rows.
- **G-19 Counts**: a count next to a label is always `label` + space + muted numeral
  ("Files 9", "Session Files 4", "Results 0"); never parentheses, never "9 files" in a
  tab, never "+9" without a tooltip naming what.
- **G-17 List rows**: one row shape per surface family — Settings (`SettingRow`), files
  (icon · name · meta), sessions (title · project · time · tag dots), and the **picker row**
  (avatar/letter square · two-line title+hint · right meta · ✓ when current — the Project
  switcher's row; Resume and All-sessions should adopt it). Cards are for things with a
  preview; rows are for things without.
- **G-21 Menus** (context menus and anchored popovers): `panel` surface, `md` radius,
  `edge` border, rows of icon · label · right-aligned shortcut, `text-xs`, 28px rows,
  destructive items last and in `destructive-fg`. The context-menu host already does
  this; every new popover copies it rather than inventing a list.

### 4.7 States

- **G-18 Empty**: `EmptyState` = icon · title · one plain sentence · one action, centred in
  the region it describes. Every list/grid/sheet has one; "no results after filtering"
  gets a *Clear filters* action; the message never appears twice on one screen.
- Loading: `LoadingState` naming the thing ("Loading projects…"); quiet skeletons only
  where the spec protects them (Providers). Spinners are `fg-muted`.
- Error: `ErrorState` `recoverable` (specific message + Retry) or `general` (two-action
  card). Never a red sentence.
- Disabled: 50% opacity **plus** a reason within reach (tooltip or subtitle) — "Max" in the
  effort picker must say why.

### 4.8 Phone width (≤ 640px)

- Header collapses to hamburger → menu of the four destinations; session strip keeps ≥ 8
  characters of the name before truncating; "Esc ·" is dropped from back affordances.
- Everything that is a row of chips becomes a horizontally scrollable row with an edge
  fade; nothing wraps to a second line inside chrome.
- Dialogs use `min(…, 88vw)` (already), and any option strip inside them wraps.
- Coarse-pointer hit area ≥ 44px on every control (the `coarse-hit` mechanism the Toggle
  uses is the one to reuse); visible size may stay small.
- Full screens re-flow to one column; Projects' card grid becomes rows.

---

## 5. Theme packs — what the app guarantees and what a pack must keep

A community theme may change colours, radii, fonts, wallpaper, glass, mascots and
`custom_css`. The app promises users that any pack keeps the app *usable*, which means
the validator (`theme-validator.ts` + vendored `contrast-rules.js`) enforces:

- The 15 tokens plus derived `link`/`destructive` pass the HARD/SURFACE rules (today).
- **P-16 (decided 2026-08-25, minimal):** no new validator rule. A 1.5:1 outline rule was
  measured against the registry and would fail 6 of 7 published packs (1.30–1.38) that look
  fine; Meadow's invisible outlines were a glass-over-wallpaper problem, fixed in the pack
  (`edge-dim` 50% → 80% alpha, wecoded-themes #27). Checkbox radius is already a literal 4px
  in `Checkbox.tsx`. The accent budget (G-8) stays a review rule, not a lint.
- `custom_css` may target the documented hooks (`.send-btn` is *not* one — see spec §11)
  and the display-size headings; it should not restyle `[role=dialog] h2`.
- **Terminal backing (G-24, 2026-08-27):** a pack with a wallpaper or gradient gets its
  terminal drawn on `panel` at ≥ 0.8 opacity whatever `terminal-opacity` it declares (the
  engine floors it); a pre-baked `terminal-value` asset shows through only faintly. The
  Terminal Opacity slider in the theme editor still offers values below that (ROADMAP).
- Packs are reviewed under the same screenshot rig as the app: the six-theme sheet in the
  findings doc is the acceptance artifact for a pack PR.

---

## 6. Checklist before you ask Destin to look

1. Every control is a §3 primitive; no `<button>`/`<input>` in the diff outside `ui/`.
2. No raw hex / palette class outside §2.3; `rg -n "bg-(red|green|blue|yellow|orange)-|#[0-9a-f]{6}" <files>` is empty.
3. One `primary` per view (G-4). Selected states are visible in **midnight** (the
   hardest theme for it).
4. Text ≥ `text-2xs` for anything informational (G-5); `fg-faint` only on decoration (G-6).
0. **Before any of the above: is the problem measured or a preference?** A proposal must
   name the number it fixes (a ratio, a size, a count) or the behaviour that is broken (no
   close button, text wraps, a literal `|`). Anything else is a judgment call — label it so,
   show the baseline neutrally, and do not dress it as a defect (P-12, 2026-08-25).
5. Dialog has the G-10 header and scrolls per G-11; size chosen by content.
6. Counts per G-19, chips per G-14, empty/loading/error per §4.7.
7. Screenshot sheet: `default`, `empty`, `stress` scenarios × **midnight, light,
   halftone-dimension, meadow-mist** × desktop and 390px. If it survives Halftone and
   Meadow it survives.
8. Run `bash scripts/verify.sh`; then hand the sheet to Destin with numbered changes.

---

## Appendix — rule index

G-1 one primitive · G-2 tokens paint everything · G-3 radii by role · G-4 one primary ·
G-5 text floor · G-6 text-on-surface pairs · G-7 eyebrows · G-8 accent budget ·
G-9 button vocabulary (§3) · G-10 dialog header · G-11 dialog body/scroll · G-12 search
field · G-13 welcome screen · G-14 chips · G-15 status bar · G-16 full-screen header ·
G-17 list rows · G-18 empty states · G-19 counts · G-20 tool-card header · G-21 menus · G-22 find-bar
lane · G-23 attachment card · G-24 terminal backing floor · G-25 session row · G-26 session
status pill · G-27 tags in a list row.
