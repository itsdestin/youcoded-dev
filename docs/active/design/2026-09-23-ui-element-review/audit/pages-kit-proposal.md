---
status: active
date: 2026-09-24
source: docs/active/design/2026-09-23-ui-element-review/guide-draft.md
related: docs/active/design/2026-09-23-ui-element-review/decisions.md
---

# Pages kit proposal — bringing the page style kit up to the new guide

Read-only research and proposal. No source file edited. Covers:
`youcoded/desktop/src/renderer/components/pages/page-kit.ts` (`PAGE_KIT_CSS`),
`page-theme.ts` (`PAGE_THEME_TOKENS`, `prepareHostedDocument`), `PageHost.tsx`, the builder
skill at `wecoded-marketplace/wecoded-pages-plugin/skills/page-builder/SKILL.md` +
`reference/{style-kit.md,page-template.html}` (marketplace checkout, not edited — its own
`extract-page-kit.cjs` regenerates `style-kit.md` from the app's kit, so kit changes flow to
it mechanically), and the three fixture pages in
`youcoded/desktop/src/renderer/dev/workbench/fixtures/pages.ts`.

Decisions row for this work: decisions.md → "Pages" — *"The guide can give Page builders more
elements and guidance; improve the Pages kit accordingly."*

---

## Why this matters for the test

Destin will have fresh builders make three mock Pages (smart home, Git/PR review, messaging)
from the guide **and the kit alone** — no app source, no this document. If the kit doesn't
have a class for something the guide describes (a status pill with a dot, a boxed settings
row, a chip row that fades instead of wrapping), each builder invents its own version, and the
three mocks won't look like one app, or like the guide. Every gap below is something at least
one of those three pages will need: a smart-home page needs status pills (device on/off) and
a settings-style list (room toggles); a PR review page needs status pills (checks passed/
failed), chip rows (labels, files-changed counts) and raised cards; a messaging page needs
plain menu rows (conversation list) and an input with an inline send action.

---

## Part 1 — where the kit contradicts the guide today

Each item: the exact kit rule (with line number in `page-kit.ts`), the guide rule it conflicts
with, and why it matters for a Page a builder makes today.

### 1. `.yc-eyebrow` is capitalized; the guide dropped capitals from every label
**Kit** (`page-kit.ts:52`): `text-transform: uppercase; letter-spacing: .06em;`
**Guide** — Heading ladder, "Small label": *"12px medium grey, normal case, no letter-spacing"*
(decisions.md H-3: *"VOLUME → Volume"*, explicitly the class of change the guide made).
Every one of the three fixture pages uses `.yc-eyebrow` as a section label ("Focus", "Today",
"Personal", "Studio", "Colour", "Brush", "Shortcuts", "This painting" — all through
`pages.ts`), so this single class change reaches every existing Page's section labels at once.
**Fix:** drop `text-transform` and `letter-spacing` from `.yc-eyebrow`; keep the 11px/500/grey
(close enough to the guide's 12px — see the sizing note in Part 4).

### 2. `.yc-card` has no shadow; the guide makes every card raised
**Kit** (`page-kit.ts:60-65`): `background`, `border`, `border-radius`, `padding` — no
`box-shadow`.
**Guide** — Cards: *"Anything you open, install or pick from a grid is a raised card: panel
colour, thin border, a medium shadow, the theme's card corner."* Decisions.md nails the exact
value: *"Medium: `0 4px 20px rgb(0 0 0 / .16), 0 1px 3px rgb(0 0 0 / .08)`."*
A Page's `.yc-card` is exactly the "something you open" case the guide means (every fixture
page's main content sits in one), so it should read as raised, matching Library/Marketplace
cards in the app shell around it — right now a page's cards sit flush with zero elevation,
visibly flatter than the chrome framing them.
**Fix:** add the medium shadow to `.yc-card`.

### 3. `.yc-card` radius is `--radius-lg` (12px); the guide wants a card corner nearer 18-24px
**Kit** (`page-kit.ts:63`): `border-radius: var(--radius-lg, 12px);`
**Guide/decisions** — Roundness: *"Built-in themes use Round: buttons, tabs, filters and search
boxes 14px; **cards and popups 18–24px**."* That range is `--radius-xl` (16px) / `--radius-2xl`
(24px) in the app's token scale (`globals.css:38-44`), not `--radius-lg` (12px).
**Compounding gap:** `page-theme.ts`'s `PAGE_THEME_TOKENS` list (line 17-26) stops at
`radius-xl` — **`--radius-2xl` is never sent into the frame at all.** Even after fixing
`page-kit.ts` to reach for it, a page has no way to read the app's actual card-corner token; it
would need to fall back to `--radius-xl` (16px), one step under the guide's own range.
**Fix (two files):** add `'radius-2xl'` to `PAGE_THEME_TOKENS` in `page-theme.ts`, then have
`.yc-card` (and the new raised-card/notice-box classes proposed below) use
`var(--radius-2xl, 18px)` or `var(--radius-xl, 16px)` — recommend `--radius-xl` as the *default*
card corner (18px reads large for a fixed-height list row like `.yc-list-row`; reserve
`--radius-2xl` for the page's own outermost containers, mirroring how the app uses it for
popups). Either choice needs the theme-token addition first.

### 4. Buttons don't yet distinguish "secondary" from "ghost"; the guide wants every less-important action outlined, never bare
**Kit** (`page-kit.ts:70-95`): `.yc-button` (default) is already bordered — good, matches the
guide's *"secondary buttons always bordered"* baseline from decisions.md F-2 (*"outlined —
never bare text"*). But `.yc-button--ghost` (`border-color: transparent`) is a **bare-text**
button with no border, and the builder skill's own instruction
(`SKILL.md:52`, *"one `.yc-button--primary` per screen, the rest default or `--ghost`"*) tells
builders to reach for it as the default "not the main action" choice. Several fixtures do
exactly that for a *secondary* action, not a true tertiary one — e.g. the timer's Reset button
(`pages.ts:44`, `yc-button yc-button--ghost`) sits beside the primary Start button as the
guide's "Cancel/Not now" role, which the guide says must be **outlined**, not bare.
**This is not a kit class contradicting the guide** (the default `.yc-button` already satisfies
it) — **it's the skill steering builders to the wrong class.** See Part 3, item 2.

### 5. Chips (`.yc-chip`) have no defined "row" behavior; the guide's chip row must never wrap and must fade at the end
**Kit** (`page-kit.ts:110-116`): `.yc-chip` styles one chip. There is no `.yc-chip-row` (or
similar) that lays multiple chips out on one line with overflow handling.
**Guide** — Cards: *"one row of chips right under the name... The chip row never wraps: one
line that fades out at its end."* Decisions.md G-9 confirms this is a hard requirement, and the
app's own pattern for exactly this fade exists already (`globals.css:973-974`,
`mask-image: linear-gradient(to right, #000 calc(100% - 12px), transparent)` on
`.session-pill__label`) — the kit should offer the same trick as a class, not leave builders to
reinvent (or skip) it. See Part 2, item 4.

### 6. `.yc-pill` / `.yc-pill--on` name the wrong thing and have no status-colour or dot variant
**Kit** (`page-kit.ts:117-118`): `.yc-pill` is a **shape** (full radius, 4px/12px padding) used
today only as a **toggle state** on buttons (the timer's preset buttons,
`pages.ts:40` `yc-button yc-button--sm yc-pill--on`) — it has no relationship to the guide's
"status pill" concept at all.
**Guide** — Status: *"A status label is a small tinted pill in its status colour, normal case
('Installed'). A live status... carries its coloured dot inside the pill."* This is a
**distinct component** the kit does not have: colour comes from a status hue (green/red/amber/
blue — the guide's one exception to "theme tokens only," decisions.md and principle 2), tinted
background+text in that hue, optionally a dot. Nothing in the kit today lets a builder make
"Installed" / "Checks passed" / "Online" read as anything but a plain `.yc-chip` or ad-hoc
inline style — which is exactly what an unguided builder will hand-roll for the PR-review
page's check states or the smart-home page's device status. See Part 2, item 1.

### 7. No boxed-row or plain-menu-row primitive; only `.yc-list-row` exists, and it's one fixed look
**Kit** (`page-kit.ts:120-127`): `.yc-list` / `.yc-list-row` gives one bordered, panel-background
row style. The guide splits list rows into two **different** jobs with two different looks
(decisions.md, "List rows by job"): **boxed rows** (soft tinted box, small gap) for
settings-style lists, and **plain rows** (no box, no line, hover highlight, selected reads
differently from hovered) for pick-one menus/switchers. `.yc-list-row`'s bordered-panel look is
close to neither — it reads as a card-ish row, not the guide's tinted settings box nor its
borderless menu row.
**Fix:** keep `.yc-list-row` for backward compatibility (existing pages use it for plain data
rows, e.g. the analytics/reader fixtures), and add two new, purpose-named classes — see Part 2,
items 2 and 3 — rather than reworking `.yc-list-row`'s look under existing callers.

### 8. No notice/callout box; a warning today has nowhere kit-native to live
**Kit:** no equivalent exists at all.
**Guide** — Status and notices: *"A passive warning, info or danger notice is a tinted box with
a matching border."* The app's own `Callout` component (`components/ui/Callout.tsx`) is the
exact reference — tinted surface + border, three tones, deliberately **no button slot**. A page
today has no way to show "this can't undo" or "nothing here yet, here's why" without ad hoc
inline styles that won't match the app's own notices. See Part 2, item 6.

### 9. Spacing is close to the guide's scale already, but not officially tied to it
**Kit:** `.yc-stack` gap 12px, `.yc-row` gap 8px, `.yc-page` padding 16px, `.yc-card` padding
16px, `.yc-grid`/`.yc-well`/`.yc-list` gaps 12px, `.yc-list-row` padding 6/10px (off-scale),
`.yc-chip` padding 2/8px (off-scale — fine for a chip's own internal padding, which the guide's
4·8·12·16·24 scale doesn't govern; that scale is about the gaps *between* elements).
**Guide** — Spacing: *"One scale: 4·8·12·16·24 px."* Nothing here is a hard violation — the kit
already lands on scale values for the gaps that matter (12 between cards/rows, 16 between
groups) — but nothing in the kit or the reference doc tells a builder the scale exists, so nested
custom CSS in fixtures drifts off it in places (`pages.ts:37` `margin-top:16px` inline — fine;
`pages.ts:239` `gap:8px` inline on a `<label>` — fine; no violations found, but also no guardrail
stopping the next builder from writing `margin-top: 15px`). See Part 3, item 4 — the skill
should just say the scale out loud.

---

## Part 2 — new kit elements the guide's recipes need

Concrete class proposals, styled only in theme-token terms, ready to add to
`PAGE_KIT_CSS`. Each says which of the three test pages (smart home / Git-PR / messaging) would
reach for it, so the priority is visible.

### 1. `.yc-status` — the status pill (tinted, optional dot)
Guide: small tinted pill in the label's own colour, normal case, optional coloured dot inside.
Status hues are the one thing that stays literal per theme (guide principle 2) — a page has no
`--status-*` tokens today and shouldn't invent its own hex; give it four named tone classes the
same way the app's own code treats status as fixed hues, not theme tokens.

```css
.yc-status {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 11px; font-weight: 500;
  padding: 2px 9px;
  border-radius: var(--radius-full, 9999px);
  background: color-mix(in srgb, var(--yc-status-hue) 16%, transparent);
  color: var(--yc-status-hue);
}
.yc-status--ok       { --yc-status-hue: #2f9e5b; }  /* green */
.yc-status--attn     { --yc-status-hue: #d63a3a; }  /* red */
.yc-status--warn     { --yc-status-hue: #e5a13a; }  /* amber */
.yc-status--info     { --yc-status-hue: #3070d6; }  /* blue */
.yc-status--live::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--yc-status-hue); }
```
Usage: `<span class="yc-status yc-status--ok">Installed</span>`,
`<span class="yc-status yc-status--ok yc-status--live">Online</span>`.
**Reaches for it:** smart home (device on/off), Git/PR review (check passed/failed/pending),
messaging (presence dot).

### 2. `.yc-boxed-list` / `.yc-boxed-row` — settings-style list
Guide: each row its own soft tinted box, small gap between rows (decisions.md: 6px inside a
Settings popup — reuse that number; it's already on-scale-adjacent and matches the app).

```css
.yc-boxed-list { display: flex; flex-direction: column; gap: 6px; }
.yc-boxed-row {
  display: flex; align-items: center; gap: 10px;
  min-height: 40px; padding: 8px 12px;
  border-radius: var(--radius-md, 8px);
  background: var(--inset);
}
.yc-boxed-row__control { margin-left: auto; }
```
**Reaches for it:** smart home (room/device toggles — literally "a setting with a switch," the
guide's own named job).

### 3. `.yc-menu` / `.yc-menu-row` — plain pick-one rows
Guide: no box, no line, hover highlights, selected always reads differently from hovered.

```css
.yc-menu { display: flex; flex-direction: column; }
.yc-menu-row {
  display: flex; align-items: center; gap: 10px;
  min-height: 36px; padding: 6px 10px;
  border-radius: var(--radius-md, 8px);
  cursor: pointer;
  color: var(--fg-2);
}
.yc-menu-row:hover { background: var(--inset); color: var(--fg); }
.yc-menu-row--on { background: var(--well); color: var(--fg); font-weight: 500; }
```
**Reaches for it:** messaging (conversation/channel list — the guide's own "session list"
example of a plain-row job).

### 4. `.yc-chip-row` — the never-wrap, fade-at-end chip line
Same fade mechanism the app already uses for pill labels (`globals.css:973-974`), offered as a
class so a builder never hand-rolls `overflow` math.

```css
.yc-chip-row {
  display: flex; align-items: center; gap: 6px;
  overflow: hidden; white-space: nowrap;
  -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 24px), transparent);
  mask-image: linear-gradient(to right, #000 calc(100% - 24px), transparent);
}
.yc-chip-row > .yc-chip { flex-shrink: 0; }
```
**Reaches for it:** Git/PR review (labels, files-changed, author chips under a PR title — the
guide's card recipe by name).

### 5. `.yc-card--raised` — explicit raised card with the chip-row anatomy baked in as a pattern, not a forced structure
Rather than changing `.yc-card`'s default shadow (item 2 in Part 1 already proposes that), also
document (in the reference doc, not as a new class) the guide's fixed text order — name+pill on
top, chip row directly under, description last, max two lines — as a **recipe** builders copy
with existing classes (`.yc-row .yc-row--between` for the top line, `.yc-status` for the pill,
`.yc-chip-row` for the chips, `.yc-muted` truncated to 2 lines via `-webkit-line-clamp: 2` — that
clamp utility does not exist in the kit today and is worth adding as `.yc-clamp-2`):

```css
.yc-clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
```
**Reaches for it:** Git/PR review (PR card: title + status pill, label chips, truncated
description).

### 6. `.yc-notice` — the tinted callout box
Mirrors `Callout.tsx`'s three tones and no-button rule exactly, in kit-CSS form (a page can't
import a React component, so this is the closest equivalent):

```css
.yc-notice { border-radius: var(--radius-md, 8px); padding: 10px 12px; border: 1px solid; font-size: 12px; }
.yc-notice__title { font-size: 11px; font-weight: 500; margin-bottom: 2px; }
.yc-notice--info    { background: color-mix(in srgb, var(--accent) 10%, var(--panel)); border-color: color-mix(in srgb, var(--accent) 25%, transparent); color: var(--fg-2); }
.yc-notice--info .yc-notice__title    { color: var(--fg); }
.yc-notice--warning { background: color-mix(in srgb, #e5a13a 10%, var(--panel)); border-color: color-mix(in srgb, #e5a13a 25%, transparent); color: var(--fg-2); }
.yc-notice--warning .yc-notice__title { color: #e5a13a; }
.yc-notice--danger  { background: color-mix(in srgb, var(--destructive) 10%, var(--panel)); border-color: color-mix(in srgb, var(--destructive) 50%, transparent); color: var(--fg-2); }
.yc-notice--danger .yc-notice__title  { color: var(--destructive-fg, var(--destructive)); }
```
**Reaches for it:** any page with an empty/blocked state that needs an explanation (messaging:
"no messages yet"; smart home: "device offline"), and Git/PR review (a merge-blocked notice).

### 7. Button-row helpers — the guide's three fixed arrangements, as layout classes
Guide: two buttons side by side hug the right edge, filled on the right; two buttons stacked go
full-width, filled on top; one button alone is full-width. All three are guide-mandated shapes
a builder currently has to reconstruct with raw flex/order every time.

```css
.yc-button-row { display: flex; justify-content: flex-end; gap: 8px; }
.yc-button-row--stack { flex-direction: column-reverse; align-items: stretch; }  /* filled (last DOM child = primary) ends up on top */
.yc-button-row--stack .yc-button { width: 100%; }
```
Usage note for the skill: put the outlined button first in markup, the primary/danger button
last — `--stack`'s `column-reverse` then puts the primary on top and the side-by-side default
still puts it on the right, from the same markup order. This one convention removes the need
for a builder to reason about the narrow/wide split at all inside a Page (Pages don't get
narrower than ~390px per the builder skill's own phone-width rule, so there's no live
breakpoint to gate on the way the app's popups do — just pick stacked for anything that must
survive 390px, side-by-side otherwise).
**Reaches for it:** every page with a confirm/cancel pair (messaging: delete conversation;
Git/PR review: approve/request changes).

### 8. `.yc-input-action` — input with its own inline action
Guide: a text box with its own action keeps it inside the box, at the right (password Set,
search filter, send).

```css
.yc-input-action { position: relative; display: flex; }
.yc-input-action .yc-input { padding-right: 40px; }
.yc-input-action .yc-button--icon {
  position: absolute; right: 4px; top: 50%; transform: translateY(-50%);
}
```
**Reaches for it:** messaging (the message box itself — the guide's own named example) and
Git/PR review (a comment box).

### 9. `.yc-tabs` — tabs / segmented control
Guide: switching views or filters uses the shared tab strip, following the theme's roundness.
The kit has `.yc-tool--on` for icon tools but nothing text-tab shaped; builders currently
improvise with plain buttons (the planner fixture's prev/today/next row is arrow buttons, not a
tab strip, but the analytics fixture's "7 days / 30 days / 90 days" row IS a tab strip
hand-rolled from `.yc-button--sm` + `.yc-pill--on`, `pages.ts:335` — exactly the class confusion
item 6 in Part 1 flags, since `.yc-pill--on` is really "toggled button," not "active tab").

```css
.yc-tabs { display: inline-flex; padding: 2px; gap: 2px; background: var(--inset); border-radius: var(--radius-md, 8px); }
.yc-tab { appearance: none; border: 0; background: transparent; font: inherit; font-size: 12px; font-weight: 500; color: var(--fg-2); padding: 5px 12px; border-radius: calc(var(--radius-md, 8px) - 2px); cursor: pointer; }
.yc-tab--on { background: var(--panel); color: var(--fg); }
```
**Reaches for it:** Git/PR review (Files changed / Conversation / Checks tabs — its own named
job in the guide) and the analytics-style fixture pattern already in use today.

### 10. `.yc-empty` refinement — give it an icon slot and an optional action
**Kit today** (`page-kit.ts:128`): text-only centered block. Fine as far as it goes, but the
guide's "empty state" implies room for an icon and, per the button-row rules, a single
full-width or right-aligned action below the text. No new class strictly required — just extend
the existing one with an optional icon row and note in the reference doc that a `.yc-empty` may
contain a `.yc-button` or `.yc-button-row` below its text.
**Reaches for it:** messaging (no conversation selected), smart home (no devices added yet).

### 11. List/grid spacing — no new classes needed, just naming
The existing `.yc-stack` (12px), `.yc-row` (8px), page/card padding (16px) and the 24px "major
break" are already exactly the guide's scale. **Add a 24px stack variant** since nothing today
expresses "major break" without an inline `style="margin-top:24px"` (which fixtures already do
ad hoc, e.g. `pages.ts:43`):

```css
.yc-stack--lg { gap: 24px; }
```

---

## Part 3 — what the builder skill's instructions should say

Concrete, short additions to `SKILL.md` (and the mechanically-regenerated `style-kit.md`, which
needs no manual edit once the kit changes — `extract-page-kit.cjs` pulls the new classes and
token list automatically). Ordered by where they'd land in the existing file.

1. **After the class list in `SKILL.md` step 3** (currently: *"Every control is a kit class:
   `.yc-button`... `.yc-eyebrow` for section labels..."*), extend the sentence to name the new
   families so a builder's first read of the skill already knows they exist — without this,
   nothing prompts a builder to go looking for a status-pill or boxed-row class:
   > *"...`.yc-status` for a tinted status pill (add `--ok`/`--attn`/`--warn`/`--info`, and
   > `--live` for a dot); `.yc-boxed-list`/`.yc-boxed-row` for a settings-style list of rows;
   > `.yc-menu`/`.yc-menu-row` for a pick-one list (a session list, a right-click-style menu);
   > `.yc-chip-row` around a run of `.yc-chip`s so they never wrap; `.yc-notice` (`--info`/
   > `--warning`/`--danger`) for a passive callout — never give it a button, that's what
   > `.yc-button-row` under a `.yc-card` is for; `.yc-button-row` /
   > `.yc-button-row--stack` for a pair of actions (put the outlined one first in markup, the
   > filled/danger one last); `.yc-input-action` for a text box with its own button inside it;
   > `.yc-tabs`/`.yc-tab` for switching views."*

2. **Fix the "rest default or `--ghost`" line** (`SKILL.md:52`) — this is the one line steering
   builders toward Part 1 item 4's contradiction. Change to:
   > *"one `.yc-button--primary` per screen; anything less important beside it (Cancel, Reset,
   > Dismiss) is the plain `.yc-button` (already bordered) — never `--ghost`, which is for a
   > quiet icon-only or tertiary action with no border at all, not a second real choice."*

3. **Add one line pointing at the guide directly.** The skill currently has no reference to the
   design guide at all — a builder following only `SKILL.md` + `style-kit.md` has no way to know
   the recipes (card text order, status-pill shape, button-row rules) exist outside the classes
   themselves. Add near the top of "Building a page":
   > *"For how something should look and where it goes — a status, a list, a notice, two
   > buttons together — check `docs/active/design/2026-09-23-ui-element-review/guide-draft.md`'s
   > Recipes section; the class names above carry those recipes but don't repeat every rule."*
   (Path is workspace-relative; if the skill ships without the guide beside it — it's a
   marketplace plugin, the guide is a youcoded-dev doc — this should instead become a short
   *inlined* recipe list in `style-kit.md` itself, since a builder given only the kit and the
   guide per Destin's test won't have workspace access either. **Recommended: inline the four
   or five shortest recipes — card text order, status pill, chip row, button pair — directly
   into `style-kit.md` under each class**, so the reference file is self-contained. This matters
   more than the SKILL.md pointer, since the actual test hands builders "the guide and the kit,"
   which likely means the guide doc plus this reference file, not the live workspace.)

4. **State the spacing scale explicitly.** Add one line to `style-kit.md` (or SKILL.md step 3):
   > *"Spacing follows 4·8·12·16·24px: `.yc-row` gap is 8, `.yc-stack` gap is 12, page/card
   > padding is 16, `.yc-stack--lg` gap is 24 for a bigger break. Don't write a spacing value
   > outside that scale."*

5. **Icon note carries over unchanged** — decisions.md G-10 ("mockups used placeholder glyphs;
   the real app uses its existing icons") doesn't apply to Pages, which have never had access to
   the app's icon set and use inline SVG or the fixed `icon` enum (`page`, `timer`, `notes`,
   `paint`, `chart`, `calendar`, `list`, `game`) for the page's own library entry only, not for
   in-page content. No change needed; noting it here so it isn't mistaken for a gap during the
   mock-page test.

---

## Part 4 — risks

1. **Backward compatibility with existing Pages.** All three fixture pages (`pages.ts`) and any
   real page a user has already built consume `page-kit.ts` classes by name; the host injects a
   *fresh copy* of `PAGE_KIT_CSS` into a page's frame on every open (`PageHost.tsx:150`,
   `prepareHostedDocument(..., PAGE_KIT_CSS, ...)`), so a kit edit reaches every existing page
   the next time it's opened — nothing to migrate on disk, but a class whose **appearance**
   changes changes every page using it immediately, unannounced.
   - `.yc-eyebrow` losing capitals (Part 1, item 1): purely cosmetic, safe — every current use is
     a short label where either case reads fine.
   - `.yc-card` gaining a shadow (item 2) and moving to a larger radius (item 3): also safe
     visually (cards get slightly more prominent, still theme-colored), but **worth flagging
     that `.yc-list-row` intentionally does NOT gain a shadow** — the guide's card/row
     distinction (item 5 of the guide's own principles: *"cards for things, rows for lists"")
     means only `.yc-card` should ever look raised; don't propagate the shadow onto
     `.yc-list-row`, `.yc-well`, or the new boxed/menu rows, or the guide's row-vs-card
     distinction collapses inside a page.
   - **Do not repurpose `.yc-pill`/`.yc-pill--on`** to become the new status pill — it is a
     load-bearing *toggle-state* class on today's fixture buttons (timer preset, analytics
     range). Adding `.yc-status` as a new, separately-named class (Part 2, item 1) avoids
     breaking that meaning; renaming or redefining `.yc-pill` in place would silently change
     what "the 25 min button is selected" looks like on the one page already shipped with real
     user data behind it (Focus timer, workbench-seeded but representative of what a user page
     looks like).

2. **The page frame's theme vars are a fixed, curated list — not "every custom property."**
   `page-theme.ts`'s comment (lines 11-15) is explicit about why: the app root also carries
   layout/perf variables that mean nothing inside a page. Any new kit class that wants a token
   not already in `PAGE_THEME_TOKENS` (this proposal needs exactly one: `radius-2xl`, Part 1
   item 3) requires editing `page-theme.ts` in the same change as the kit — a kit class that
   references `var(--radius-2xl)` without that token being in the delivered list will just fall
   back to its CSS fallback value forever (harmless, but the whole point of pulling the theme's
   real setting is lost). No other proposed class needs a new token — everything else in Part 2
   uses the existing 27-token list plus one literal-hue status-color convention (matching how
   status colors work everywhere else in the app: hardcoded, not tokenized, per the guide's own
   stated exception in principle 2).

3. **`color-mix()` support inside the sandboxed frame.** Several proposed classes
   (`.yc-status`, `.yc-notice`) use `color-mix(in srgb, ...)` for tinting, matching the pattern
   already in the app's own `globals.css` (2718-2815 use `color-mix` extensively for the same
   accent-tint effect) and in `Callout.tsx`'s Tailwind opacity classes. The page frame runs the
   same Chromium as the rest of the app (an `<iframe>`, not a separate engine), so this carries
   no additional platform risk beyond what the app already relies on elsewhere.

4. **`-webkit-line-clamp` and `-webkit-mask-image` are prefixed properties.** Both are already
   used elsewhere in the shipped app (`globals.css:973` for the mask, and line-clamp is standard
   practice in Chromium-only contexts like this frame), so this is consistent with existing
   practice, not a new risk — flagging only because a future non-Chromium embedding of Pages
   (none planned) would need the unprefixed equivalents too.

5. **Builder-skill wording risk: the "guide pointer" (Part 3, item 3) may not reach the actual
   test.** If Destin's three-mock-page test hands builders only `guide-draft.md` and
   `style-kit.md` (not live workspace access, not `SKILL.md`), then any instruction added to
   `SKILL.md` itself won't be seen. The inline-recipes recommendation inside item 3 is the
   mitigation — verify with Destin which files the test actually hands over before treating a
   `SKILL.md`-only change as sufficient.

6. **Scope not touched:** this proposal does not change `PageHost.tsx`'s React shell (rail,
   band, approval screen) — those are the app's own chrome around a page, already covered by the
   rest of the UI consistency audit, not the kit a page's *own* HTML uses. Also out of scope:
   the CSP (`page-theme.ts`'s `pageCsp`) and the sandbox/bootstrap wiring — none of the proposed
   classes need new capabilities (fonts, network, storage), so no security-surface change.
