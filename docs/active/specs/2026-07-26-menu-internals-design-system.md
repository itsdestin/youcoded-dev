---
status: draft
date: 2026-07-26
owner: Destin (decisions) / Claude (spec)
artifact: https://claude.ai/code/artifact/7e886cfc-9957-4e5f-918d-3d83bd77e0a6
supersedes: nothing
extends: docs/archive/specs/2026-07-16-ui-consistency-design-spec.md
---

# Menu Internals Design System — the kit (K1–K12) + the navigation drafts (D1–D4)

**Status: DRAFT. Nothing here is approved yet.** The kit is stable enough to implement; the
navigation model (D2) is an open decision. Do not start work from this document until Destin
approves by number.

## Why this exists

The 2026-07-16 UI-consistency spec locked **controls** — buttons, toggles, fields, cards, states,
z-index — across eight tranches, most of which have shipped. It never touched **dialog anatomy** or
**menu internals**. This spec is that missing layer.

Destin's framing (2026-07-25):

> "i want clear/consistent menu structure across most menus (some unique elements are okay where
> they make sense for unique features, but elements performing similar functions should share
> design)"

That sentence is the acceptance criterion. The kit below is the operationalization of it.

**The first pass of this design was at the wrong altitude** and Destin corrected it. It proposed
three shell designs (chrome: header padding, width ladder, footer rule) and left menu bodies alone.
The real problem is that there is no vocabulary for what goes *inside* a menu, so every menu invents
its own row, its own chip group, its own callout. Chrome discipline alone would have left the app
looking the same on the inside.

---

## 1. The kit — 12 roles, one design each

Each role: what it is · what it replaces · the exact recipe. Class strings are final and were
rendered against real theme tokens across Midnight / Crème / Halftone Dimension / Dark / Light.

Type sizes are written as tokens (`text-2xs` = 11px, `text-3xs` = 10px, `text-4xs` = 9px). **These
tokens do not exist yet** — they are spec change 35, tranche 6, still open. See D4.

### K1 — Section label · retires 4 shapes

```
<h3 class="text-3xs font-medium text-fg-muted tracking-wider uppercase mb-2">
```

Sentence case, not Title Case. Always `<h3>`.

Retires: `h3 text-[10px] uppercase` (×22, the plurality — this is the winner, retyped), `label
text-xs uppercase` (×7 — and none of them have `htmlFor`, so the `<label>` element is wrong on
a11y grounds as well as visual), `h4 text-sm font-semibold` + AnchorTip (ModelProvidersPopup's
`SectionHeader`, the app's only `h4`-as-section-header), `h4 text-[10px] uppercase` (AboutPopup).

A section label never labels a single control. If a control needs a label, that's K2's title.
(Session Defaults' "Close-session prompt" is the one violation.)

### K2 — Setting row · retires 5 shapes

The universal row. Everything with a label and a control is this.

```
<div class="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-inset/50">
  [icon slot: 32×20, optional]
  <div class="flex-1 min-w-0">
    <div class="text-xs text-fg font-medium">{title}</div>
    <p class="text-3xs text-fg-muted -mt-0.5">{description}</p>
  </div>
  [control slot]
</div>
```

- Add `hover:bg-inset transition-colors` **only** when the whole row is clickable; then it's a
  `<button>` and the control slot holds a chevron.
- Use `items-center` instead of `items-start` when there is no description.
- Control slot is exactly one of: **Toggle** · **value** (`text-xs text-fg-dim font-mono`) ·
  **chevron** (`w-4 h-4 text-fg-muted`) · **`<Button size="sm">`**.

**The one rule that kills all five variants: the description always lives in the left column,
under the title.** Never below the whole row (Sound), never after the row (Buddy), never as a K1
section label (Session Defaults), never as a separate `<p>` outside the container (Buddy again —
that popup has two different placements *within itself*).

This is `SettingsRow.tsx` post-change-51 with the icon made optional and the chevron made one of
four control slots. **The drawer row and the in-menu row become the same object**, which is the
single biggest consistency win in the kit.

### K3 — Choice group (pick one of N) · retires 7 recipes

Three forms, and a **decidable rule** for which — the rule is the important part, because it's what
stops the next popup inventing an eighth recipe.

| Condition | Form |
|---|---|
| ≤4 options, short labels, no description needed | **Segmented** |
| Any option needs a description | **Radio list** |
| >5 options | **Select** |

**Segmented** — `ui/SegmentedTabs.tsx` verbatim, `variant="contained"`:

```
container: flex gap-1 p-1 bg-inset/50 rounded-lg
tab:       px-3 py-1.5 rounded-md text-xs font-medium + FOCUS_RING
active:    bg-accent text-on-accent
inactive:  text-fg-2 hover:bg-inset
```

**Radio list** — K2 rows with `<Radio>` in the icon slot.
**Select** — `ui/Select.tsx`.

Retires, in full: Sound presets (`px-2 py-1 rounded text-[10px]`), Remote keep-awake (`flex-1
px-1.5 py-1 rounded-sm text-[10px]`), default model (`flex-1 px-1.5 py-1.5 rounded-sm text-[11px]`),
editor mode (`flex-1 py-1.5 px-3 text-sm rounded`, inactive hover `bg-well`), model picker
(`text-left text-sm rounded px-3 py-2`), Bug/Feature (already correct — it's the `contained`
variant, hand-rolled), Sync filters (`rounded-full px-3 py-1 text-[11px]`).

That's **4 radii, 4 text sizes, 3 inactive treatments** for one function.

> **Finding worth keeping:** `ui/SegmentedTabs.tsx` already exists, shipped as spec change 45, and
> **has zero call sites in the renderer.** The primitive was built and never adopted. K3 is mostly
> an adoption task, not a design task.

### K4 — Callout (passive information) · retires 3 geometries

One geometry, three tones:

```
rounded-lg p-3 border          body: text-xs text-fg-2
info:    bg-accent/10      border-accent/25
warning: bg-amber-500/10   border-amber-500/25
danger:  bg-destructive/10 border-destructive/50   body: text-xs text-destructive-fg
```

Preserves change 14's rule (accent = info, amber = warning) and adds the missing danger tone.
Retires `rounded-md px-2.5 py-2` and the `text-[10px]` body variant.

**A callout with a button in it is K5, not K4.** That distinction is what stops the two roles from
collapsing back together.

### K5 — Status strip (state + the action that resolves it) · retires Remote's 8 ad-hoc branches

```
<div class="px-3 py-2.5 rounded-lg bg-inset flex items-center gap-3">
  <span class="w-2 h-2 rounded-full {statusColor} shrink-0" />
  <span class="flex-1 text-xs text-fg-2">{message}</span>
  [optional: <Button size="sm"> or <BrailleSpinner size="sm">]
</div>
```

Dot colors come from the app's existing status set (green / amber / muted) and stay hardcoded per
the standing "status colors are theme-independent" rule.

Every "what is this subsystem doing right now" line becomes this: Remote's eight setup branches
(currently loose `<p>` tags, `animate-pulse` prose, centered green text, and full-width buttons
stacked mid-scroll), Performance's restart notice (already close to correct — it's the model),
Sync's state, Update's progress.

### K6 — Item list (repeated entities with per-item actions) · retires 3 shapes

K2 geometry with a status dot in the icon slot; list wrapper `space-y-1`.

```
<div class="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-inset/50">
  <span class="w-2 h-2 rounded-full {statusColor} shrink-0" />
  <div class="flex-1 min-w-0">{title}{subtitle}</div>
  <Button size="sm" ... />
</div>
```

**Actions are always a labelled `<Button size="sm">`, never a bare glyph.** Change 41 banned
hand-rolled glyph buttons; the Remote device-list `✕` (`text-fg-faint hover:text-red-400 text-sm
leading-none px-1`, no label, no focus ring, no hover surface) survived that sweep and dies here.

Same object for: remote devices, model providers, connected accounts, sync spaces, saved Android
devices, open tasks.

### K7 — Field + action · retires the button-as-field

| Condition | Form |
|---|---|
| Typed value with one submit action | `InputGroup` (change 77, already correct) |
| Value chosen elsewhere (picker, dialog, OS) | **K2 value row + `<Button size="sm">Change</Button>`** |
| Anything else | `TextInput` + K11 footer |

The middle row is the fix. `SettingsPanel.tsx:1526` renders the project folder as a `<button>`
styled to look like a text field — nothing about it signals that it opens a picker. As a K2 row with
a Change button it reads as "here is the value, here is how to change it."

### K8 — Divider · retires 4 idioms, replaces them with nothing

**No decorative dividers inside a menu body.** `space-y-5` plus K1 labels already separate sections,
and they do it identically in every menu.

Retires: `<hr class="border-edge-dim">` (About, Performance), `<div class="border-t
border-edge-dim" />` (Sound), `mt-3 pt-3 border-t border-edge` on a wrapper (Buddy), and the
implicit fourth idiom of no separator at all.

Inside a dialog, the **only** `border-t` is the K11 footer and the **only** `border-b` is the header.

### K9 — Danger zone · retires 3 bespoke zones

Always **last in the menu**. Always this shape:

```
K1 label "Danger zone"
K4 danger callout      — states the consequence in plain words
the control            — danger-tone Toggle, or danger-outline Button (arm) → danger Button (confirm)
```

**Callout and control stay together.** (ContextPopup currently splits them — warning in the body,
Clear in the footer.)

The consequence sentence follows `docs/error-message-standards.md`: specific and accurate, no
guessing. Retires SkipPermissions' hand-rolled amber block with its raw `#DD4444` heading and
`&#9888;` glyph, plus AccountSection's and LocalModelsSection's separate arm/confirm
implementations.

### K10 — Empty / loading / error · adopts the existing primitives

`LoadingState` / `EmptyState` / `ErrorState` from `ui/states.tsx`, everywhere. Loading copy always
names the thing ("Loading remote access…"). `ErrorState` carries the **real** subsystem error plus
Retry and "Diagnose with Claude" — which is exactly what `docs/error-message-standards.md` already
mandates.

Retires: `animate-pulse` prose (Remote), italic bare strings (OpenTasks), red `<p>` tags (Remote,
Sync).

**This unblocks held change 33** (ErrorState adoption) by giving it a home in every menu at once
rather than needing a separate error audit first.

### K11 — Footer · retires 3 conventions

```
<div class="px-4 py-3 border-t border-edge shrink-0 flex items-center gap-2">
```

Buttons are `size="md"`, primary rightmost.

- **Only actions that commit or dismiss the surface.** Row-scoped actions stay with their row.
- **No prose in the footer** — it moves to a K1-labelled body section.
- **Autosaving menus have no footer at all**, which is most of them (Sound, Buddy, Performance,
  Widgets, Appearance, Session Defaults).

### K12 — Explainer · retires 5 mechanisms

All five current mechanisms consume the **same payload** — `{intro, sections: [{heading,
paragraphs, bullets}]}`, already defined by `SettingsExplainer.tsx`. One renderer for it.

Retires: inline-under-`<hr>` (Performance), full-surface takeover (Remote, Context), `AnchorTip`
beside a heading (Model Providers), a bespoke sidebar popup (HowContextWorksPopup), prose sections
(About).

**Where it mounts is the only thing the drafts disagree about** — see D2. In all three, the `(i)`
icon button disappears from dialog headers, which removes an inconsistently-present affordance.
`AnchorTip` survives for genuinely inline hints; it is not the explainer mechanism.

---

## 2. Unique controls — the exception list

Destin's "some unique elements are okay where they make sense." Four survive, each because the
**function** is unique:

| Control | Where | Why it stays |
|---|---|---|
| Theme tile grid | Appearance | Browsing visual packs is a different activity from picking a value |
| Volume slider | Sound | Continuous value; native `accent-accent` per change 40 |
| QR pairing block | Remote → Add device | Device handoff has no row equivalent |
| `kbd` chip | Keyboard Shortcuts | Key legend, not a control |

Plus two documented exceptions inherited from the 2026-07-16 spec: the **Context split button**
(§11.8 C) and the **ToolCard Yes/No/Always trio** (change 11).

**The test for anything claiming to be unique: is the *function* unique, or just the markup?**

> The context "% gauge" failed this test. It was on the exception list until the 2026-07-26
> revision, when it turned out `ui/ProgressBar.tsx` exists for exactly that shape and
> `UsageCard.tsx:79-80` **already renders context-remaining with it**. Two components were drawing
> the same metric two different ways. That's a duplicate, not a special case.

---

## 3. Menu × role matrix

Once the kit exists, nearly every menu is **K1 + K2 + K3 + K6 and nothing else**.

| Menu | K1 | K2 | K3 | K4 | K5 | K6 | K7 | K9 | K11 | Unique |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| Account | ✓ | ✓ | | | ✓ | ✓ | ✓ | ✓ | | avatar + handle editor |
| Appearance | ✓ | ✓ | ✓ | | | | | | | **theme grid**, roundness slider, color picker |
| Buddy Floater | ✓ | ✓ | | | | | | | | — |
| Sound | ✓ | ✓ | ✓ | | | ✓ | | | | **volume slider**, ▶ audition |
| Performance | ✓ | ✓ | | | ✓ | | | | | — |
| Backup & Sync | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | conflict diff, activity log |
| Model Providers | ✓ | ✓ | | | ✓ | ✓ | ✓ | ✓ | | model download progress |
| Remote Access | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | ✓ | **QR block** |
| Session Defaults | ✓ | ✓ | ✓ | | | | ✓ | ✓ | | — |
| Development | ✓ | ✓ | | | | | | | | — |
| Keyboard Shortcuts | ✓ | ✓ | | | | | | | | **kbd chip** |
| About | ✓ | ✓ | | | | | | | | prose |
| Context *(chip)* | ✓ | ✓ | | | | | | ✓ | ✓ | split button |
| Open Tasks *(chip)* | ✓ | | | | | ✓ | | | | — |
| Status Widgets *(chip)* | ✓ | ✓ | | | | | | | | — |
| Model & Effort *(chip)* | ✓ | | ✓ | | | | | | | — |

---

## 4. Per-menu notes (what actually moves)

Only the non-obvious ones. Everything else is a mechanical kit application.

**Remote Access** — the largest change in the app. Eight ad-hoc setup branches collapse into one K5
strip at the top. The accent info callout, the amber pre-scan warning, the mid-scroll "Set Up"
button and the QR block all move into an **Add a device** flow reached from the K11 footer, where
they are actually relevant. Currently the only popup that passes no `title` to the shell and paints
its own header, because `(i)` swaps the whole surface.

**Sound — rebuilt around auditioning (Destin, 2026-07-25).** Today all **15** stock presets render
as `px-2 py-1 rounded text-[10px]` chips in a `flex-wrap`, **twice** (once per category), and
`onSelect(p.id); playPreview(p.id)` fire together — so **the only way to hear a sound is to assign
it.** New structure:

1. **Volume** — unchanged.
2. **Alerts** — the two on/off K2 rows, with the current assignment in the subtitle
   ("Chime · when a session needs approval") so both mappings are visible without scrolling.
3. **Sounds** — the library, listed **once**. K3 segmented picks *which slot you are filling*
   (Needs attention / Response ready); a Radio assigns; a `▶` `<Button size="icon" variant="ghost">`
   **auditions without committing**. Custom sound is the last row of the same list.

Requires one code change: `SoundPreset` gains a `desc` field, and the tone signatures that currently
live as trailing comments on `STOCK_PRESETS` (`utils/sounds.ts:134-148` — "C5 → E5", "A4 double
tap") lift into it. Strings unchanged. Optional — the rows work title-only, they are just harder to
distinguish across 15 entries.

**Context — three fixes (Destin: "it still looks out of place", 2026-07-26).**

1. It was a **billboard**: a centered `text-3xl font-bold` number, the app's only display-size stat.
   Now a `ProgressBar` + `text-lg` readout in a `bg-inset` block — the shared component, matching
   `UsageCard`.
2. It had **zero K2 rows** — the only settings-family surface with none. Token count becomes a K2
   value row.
3. Its **danger zone was split across the panel** (callout in body, Clear in footer). Clear moves up
   under its own warning; the footer keeps one action. This also removes a real hazard: two
   full-width buttons stacked in a footer, one safe and one destructive, adjacent.

Thresholds unchanged: `contextColor()` — <20 red `#DD4444`, <50 amber `#FF9800`, else green
`#4CAF50`. Hint copy (`hintFor()`) unchanged.

**Model Providers** — three hand-built blocks, each with its own `h4 text-sm font-semibold` heading
and its own `AnchorTip`, become three K6 rows in one list. Removes the app's only
`h4`-as-section-header and three of the five explainer mechanisms in a single edit.

**Development** — has **no header** today; a `text-[10px]` uppercase micro-label stands in for the
title (the K1 role doing the header's job). Its rows use `SettingsRow`'s markup copy-pasted inline
rather than the component.

**Open Tasks** — has **no title at all**; a filter field sits where the header goes, on `px-3 pt-2
pb-1 border-edge-dim`, and it overrides the panel radius to `rounded-md`. Group headers are
clickable `text-[10px]` uppercase buttons doubling as collapse toggles.

**Status Bar Widgets** — rows are `px-2 py-1.5 rounded-md` with a **hand-rolled checkbox button on
the left**, the only left-hand control in any settings list. Plus inline expanding `(i)` panels and a
Theme-only cycle editor that expands in place.

**Keyboard Shortcuts** — `p-5` on the panel with the header inside the padding, and a hand-rolled
`✕` with no hover surface and no focus ring: the last close button that escaped change 41.

**About** — ~700 words of prose in three `<hr>`-separated blocks. Version numbers and the analytics
toggle (the two things you go there to do) surface as rows; prose becomes K12 pages.
**Privacy copy is user-approved (`docs/archive/specs/2026-04-23-analytics-privacy-copy-draft.md`)
and must be relocated verbatim, never reworded.**

---

## 5. The shell decisions (D1–D4)

### D1 — One dialog shell *(recommended, independent of D2)*

One `<Dialog>` component owns scrim, centering, sizing, header, and close. Hand-rolling
`Scrim` + `OverlayPanel` in a feature component becomes a lint error.

- **Header:** `px-4 py-3 border-b border-edge shrink-0`, title `h2 text-sm font-bold text-fg`,
  right cluster `gap-1` ending in `CloseButton`. No untitled dialogs.
- **Body:** unpadded `scroll-fade` wrapper → inner `px-4 py-4 space-y-5`.
- **Width ladder:** `sm 340` · `md 420` · `lg 560` · `xl 820`, each `min(N, 88vw)`. No bespoke widths.
- **Height:** always `max-h-[80vh]`. **A fixed `h-` on a dialog is banned** — that is what makes
  ContextPopup jump to full height when the explainer opens.
- **Centering:** the flex-wrapper technique, one implementation. Two existing WHY comments
  (`Overlay.tsx:68-76`, `StatusBar.tsx:529-533`) document that the transform technique breaks
  `flex-1` height and `backdrop-filter`; components currently pick based on whether they got bitten.

Retires 14 bespoke widths, 6 height values, 3 centering techniques, 4 header paddings.

`SettingsPopup.tsx` is the seed — it is already correct, it just has **7 callers out of ~42**.

### D2 — Navigation model *(OPEN — this is the blocking decision)*

| | **A · Strict shell** | **B · Drill-in stack** | **C · Workbench** |
|---|---|---|---|
| Shape | Drawer + modals | One frame, pages push | Screen (z-40) + popovers |
| Stacked scrims | up to 2 | 1 | 0 (screen) / 1 (confirm) |
| Modal-on-modal | **6 sites** | 0 | 0 |
| Clicks: Remote → Devices | 1 | **2** | 1 |
| Longest scroll | Remote/Sync ~2.5 screens | under 1 screen | ~1 screen |
| Explainer mount | surface takeover | a page | always-visible rail |
| Chip popups | centered modal | centered modal | anchored popover |
| Android fit | workable | native-feeling | B below 640px |
| Migration size | small | medium | large |
| Re-opens shipped decisions | no | no | **yes — two** |

**They compose.** A is a strict subset of B; B is what C degrades to below 640px. Shipping the kit +
A first costs nothing if B or C is wanted later.

**C's conflicts, stated plainly:**
1. Contradicts shipped **change 50** ("Settings drawer goes headerless") — a screen needs a header.
2. Reverses the **2026-07-23 git-branch popup decision**, which explicitly considered and rejected
   anchored popovers (stated reason: Android's system-nav gesture zone; C5 answers that by keeping
   the centered shape below 640px, but it is still a reversal).

C only makes sense if Destin actively wants those re-opened.

### D3 — Chip popups

Follows from D2: centered modal (A/B) or anchored popover (C). Under C, popovers use
`POPOVER_Z = 9001` from `Overlay.tsx:32`, already the sanctioned tier.

### D4 — Type tokens land first

Spec change 35 (tranche 6): `--text-2xs: 11px`, `--text-3xs: 10px`, `--text-4xs: 9px`, then a
mechanical rename of ~538 raw `text-[Npx]` sites. **Zero visual change.** Every recipe in this
document is written in those tokens, so this is a prerequisite, not a parallel track.

---

## 6. Ledger

Approve by number. K-numbers are shell-agnostic and can be approved independently of D2.

| # | What | Retires |
|---|---|---|
| K1 | Section label: `h3 text-3xs font-medium text-fg-muted tracking-wider uppercase mb-2`, sentence case | 4 shapes |
| K2 | One setting row, 4 control slots; description always in the left column | 5 shapes |
| K3 | Choice group: ≤4 → segmented · needs description → radio list · >5 → Select | 7 recipes |
| K4 | Callout `rounded-lg p-3 border`, 3 tones | 3 geometries |
| K5 | Status strip: dot + text + optional action | Remote's 8 branches |
| K6 | Item list = K2 + status dot; actions are labelled `Button sm` | 3 shapes + the last bare ✕ |
| K7 | Typed+submit → InputGroup · chosen elsewhere → K2 value row + Change | button-as-field |
| K8 | No decorative dividers in a menu body | 4 idioms |
| K9 | Danger zone: last, K1 + danger callout + arm/confirm, kept together | 3 bespoke zones |
| K10 | LoadingState / EmptyState / ErrorState everywhere | 3 ad-hoc; unblocks change 33 |
| K11 | Footer = commit/dismiss only, no prose; autosaving menus have none | 3 conventions |
| K12 | One explainer renderer for the existing payload | 5 mechanisms |
| D1 | One `<Dialog>` shell: ladder 340/420/560/820, `max-h-[80vh]`, no fixed `h-` | 14 widths, 6 heights, 3 centering techniques |
| **D2** | **Navigation model: A / B / C** | **— OPEN** |
| D3 | Chip popups: modal (A/B) or popover (C) | — |
| D4 | Type tokens first (change 35, tranche 6) | 538 raw `text-[Npx]` |

---

## 7. Findings worth keeping regardless of what ships

1. **`ui/SegmentedTabs.tsx` has zero call sites.** Built as change 45, never adopted. Seven
   hand-rolled choice groups exist alongside it. Any primitive shipped without migrating its call
   sites in the same tranche will land in this state.
2. **`ProgressBar` + `UsageCard` already render context-remaining**, while `ContextPopup` renders it
   a second way. Duplicate metric, duplicate implementation, different visual result.
3. **Sound cannot be auditioned without assigning.** A functional bug found by a visual audit, not a
   styling issue.
4. **Three dialogs have no title** (Development, Open Tasks, and the Widgets popup's original form),
   and two use a K1 micro-label to stand in for a header.
5. **`<label>` is used ~7 times as a section heading with no `htmlFor`** — an a11y defect hiding
   inside a styling inconsistency.

---

## 8. Open questions

1. **D2** — the navigation model. Blocking.
2. **Sound `desc` field** — add the tone signatures as data, or ship title-only rows?
3. **Appearance / Sync / Providers / About reorganisations** — the artifact renders these with copy
   written by Claude, not shipped copy. They need a copy pass before implementation. (About's
   privacy paragraphs are exempt: relocate verbatim.)
4. **Tranche ordering vs the existing spec** — this work overlaps open tranches 6 (type tokens, a
   prerequisite) and 8 (Session-8 additions 41–51). Sequencing to be decided when D2 lands.

## 9. Artifact

Interactive, theme-switching, pixel-faithful:
<https://claude.ai/code/artifact/7e886cfc-9957-4e5f-918d-3d83bd77e0a6>

Contains: the kit with today-vs-proposed for all 12 roles · the menu × role matrix · all 16 menus
rebuilt · full navigation flow trees for A/B/C · fidelity notes. Renders every panel against
Midnight, Crème, Halftone Dimension, Dark and Light using real theme tokens and verbatim app class
strings.
