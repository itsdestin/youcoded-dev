---
status: draft
scope: Settings drawer and every screen/popup it opens (desktop)
date: 2026-09-23
---

# Settings screens audit

Read-only. Source: `youcoded/desktop/src/renderer/components/` (`SettingsPanel.tsx`,
`assistant-settings/`, `SyncPanel.tsx`, `SyncSetupWizard.tsx`, `ThemeScreen.tsx`,
`AccountSection.tsx`, `AboutPopup.tsx`, `HelpPopup.tsx`, `DonateConfirm.tsx`,
`development/*.tsx`, `ui/SettingRow.tsx`, `ui/Dialog.tsx`). Screenshots read with the
Read tool from `scratch/element-sweep*/shots-*/light/`. No source or running app touched.

**Important context for whoever reads this next:** the codebase already has a partial
design system for Settings — a shared `<SettingRow>` primitive (comment header "K2 — the
setting row") and a shared `<Dialog>` shell ("D1 — the one dialog shell"), plus named but
undocumented conventions referenced in code comments: K1 (uppercase section label), K3
(≤4 short options → segmented tabs), K4 (`<Callout>`), K5 (`<StatusStrip>`), K6 (disabled
item row), K9 (danger-zone label), K12 (lifted explainer state). These rules are real and
mostly followed — but they were never written down anywhere a person can read, only
inferred from scattered comments, and several screens predate them or were never migrated.
That gap — a design language that exists in fragments across 15+ files instead of in one
place — is very likely a big part of why Settings reads as "no clear design language" even
though a real one is half-built underneath it.

## Screen by screen

### Settings drawer (`SettingsPanel.tsx` → `DesktopSettings`)
**Screenshot:** `shots-main/light/settings-drawer.png`.

- **Layout:** a single left-edge sliding panel, 320px wide (`w-80`, full-width under
  640px), one column, one zone: a header ("Settings" + ✕) and a scrolling list of rows.
  No sections, no dividers between rows — 12 rows in a flat `space-y-2` stack.
- **Order:** icon → title → description, left to right; every row ends in a chevron
  (implying "opens something") except three rows that show a live value instead
  (Appearance shows the current theme name, Buddy Floater shows On/Off, Sound shows the
  volume %, Backup & Sync shows a red dot + "Sync Failing").
- **Spacing:** `px-4 py-4` outer padding, `space-y-2` between rows (8px), each row itself
  `px-3 py-2` (`SETTING_ROW_BASE`). Consistent — this screen is the cleanest one in the
  audit.
- **Controls:** every row is a `<SettingRow>` nav row (icon, title, description, chevron).
  None hand-rolled.
- **Where it's clean, not cluttered:** one visual zone, one row shape repeated 12 times,
  one spacing rhythm. This is the screen every other screen should look like.

### Account (`AccountSection.tsx`)
**Screenshot:** `shots-main/light/settings-account.png`.

- **Layout:** small popup (`panel`, 420px). Two zones when signed out: a short paragraph,
  a full-width primary button, fine print, then a "Connected services" nav row below a
  gap. Three-plus zones when signed in: identity summary, sign-in method, optional
  "Blocked users" list, edit/sign-out/export buttons, "Connected services" row.
- **Order:** title → description → control is followed for the one row it has
  (`Connected services`). The identity block breaks that order on purpose (photo + name +
  handle, no separate "title"), which reads fine because it's clearly a different kind of
  content (a profile, not a setting).
- **Spacing:** dialog default `px-4 py-4`, `space-y-5` between top-level sections is NOT
  used here — content is a flat sequence of `<section className="space-y-1.5">`/`space-y-2`
  blocks with no consistent outer rhythm; some sections touch, some have implicit gaps
  from stacked `<p>` margins.
- **Controls:** one `<SettingRow>`, three `<Button variant="secondary" className="w-full">`
  stacked (Edit account / Sign out / Download my data), a danger-zone two-step
  (arm → typed "delete" confirm → `<Button variant="danger">`).
- **Edit mode:** two inline fields (`<InputGroup>` with Save inside), each with its own
  `text-3xs uppercase tracking-wider` label — this is the SAME uppercase-label idiom used
  for section eyebrows elsewhere, but here it labels a single field, not a group of rows.
- **Clutter read:** not badly cluttered, but the popup has no consistent full-width
  vertical rhythm — three stacked full-width secondary buttons back to back (Edit account,
  Sign out, Download my data) read as a wall of identical grey buttons with no grouping or
  emphasis between "look at my profile", "leave", and "export my data" — three unrelated
  actions look like one list.

### Assistant settings — the shell (`assistant-settings/AssistantSettings.tsx`)
**Screenshot:** `shots-assistant-settings-r5/light/assistant-general.png` (and every
`assistant-*` shot below).

- **Layout:** the single biggest surface in Settings — a `wide` dialog (820px) with a
  left page rail (176px, 5 items: General / Cloud providers / Local models / Permissions /
  Specialists) and a scrolling page on the right. One `<SettingRow>`-style row in the
  drawer opens this whole two-pane window, replacing what used to be four separate
  popups.
- **This is the single most inconsistent screen in the app** — see below, page by page.
  It is one dialog, but its five pages use at least four different visual vocabularies for
  "a control with a label," which is very likely the #1 source of the "no clear design
  language" complaint, because a user never leaves this one window while seeing it.

#### General page
- Every control is wrapped in a **`FieldRow`**: `bg-inset/50 rounded-lg px-3 py-2.5
  space-y-1.5` — a filled, rounded card with a bold `text-xs` title, a `text-3xs` hint
  line under it, then the control full-width below. Used for Default model, Default
  project folder, Context, Session naming, Step guard — 5 boxed cards stacked with
  `space-y-2`/`space-y-5` gaps that look identical.
- Then, with no visual transition, two **flat, unboxed** `<SettingRow variant="item">`
  toggle rows (Close-session prompt, Show recommended models) — same page, two totally
  different row shapes for what is functionally the same kind of thing (one setting with
  a label, a hint, and a control).

#### Cloud providers page
- Zero `FieldRow` cards. Each provider (Claude Code, ChatGPT, OpenRouter) is its own
  unboxed block: bold provider name + inline outline buttons top-right ("My Account",
  "Preferences", "Sign out"), plain description lines below, then coloured progress bars
  for usage. No uppercase eyebrow label anywhere on this page, no card background — it
  sits directly on the dialog's canvas, unlike every card on the General page one click to
  the left.

#### Local models page
- A third shape again: "Local engine" status line with an inline nav row ("Advanced")
  **nested inside** the engine's own info block — a row inside a block inside the page,
  the only nested-row pattern in the audit. Below it, a search box, then an
  `INSTALLED` uppercase K1 label, then dense list rows (icon, name, file size, quant
  description, "Settings"/"Delete" buttons, sometimes a coloured progress bar for an
  in-progress download). These rows are far denser (5+ pieces of text/controls per row)
  than any SettingRow elsewhere in the app.

#### Permissions page
- A **fourth** shape: "Enable Skip Permissions Mode?" is flat, bold title + paragraph
  description + toggle, no card, no `FieldRow`. Directly below it: **two uppercase
  eyebrow labels back to back with no visual gap** — "CHATGPT, OPENROUTER AND LOCAL
  MODELS" (written by `pages.tsx`, wrapping `<PermissionsSection>`) immediately followed
  by "PERMISSION MODES" (written *inside* `PermissionsSection.tsx`, `SECTION_LABEL`
  constant) — confirmed in source, this is two independent components each adding their
  own eyebrow, producing a doubled header that reads like a mistake, not two components
  drifted apart.
  <!-- verify: {"path": "youcoded/desktop/src/renderer/components/PermissionsSection.tsx", "contains": "Permission modes"} -->
- Below that: a boxed card of plain-English mode explanations (Ask first / Auto edit /
  Full auto + a bulleted always-confirms list), then another eyebrow "ALWAYS ALLOWED",
  then boxed rows with a count badge and a chevron ("All projects — 1", "youcoded — 4").
  Opening "Enable Skip Permissions Mode?" launches a **second, stacked L3 dialog**
  ("Skip Permissions Mode") on top of this 820px window — a modal over a modal, the same
  pattern seen in Assistant settings' OpenRouter key dialog and Buddy Floater's consent
  card.

#### Specialists page
- A **fifth** shape: intro paragraph, then "SPECIALIST INTELLIGENCE TIERS" eyebrow over
  **one outer bordered box containing two inner `FieldRow`-style pickers** (Budget,
  Frontier) — a box inside a box, the only double-nested card in the audit. Then
  "AVAILABLE SPECIALISTS · 7 · 1 WARNING" — a count appended directly onto the eyebrow
  text, a header format not used anywhere else (every other eyebrow is plain words, no
  numbers). Then one more bordered box containing a "BUILT IN" sub-label and specialist
  rows carrying small pill badges (`READ-ONLY`, `CAN EDIT & RUN COMMANDS`) — the only
  place in Settings badges are attached to a row's icon/title area like this.

### Appearance / Themes (`ThemeScreen.tsx`)
**Screenshots:** `shots-main/light/settings-appearance.png`,
`shots-main/light/theme-edit-community.png` (glass-tuning edit view).

- **Layout, main list:** an eyebrow label ("FAVORITED THEMES" — but set in **`text-4xs`**,
  one size smaller than every other eyebrow in the app, which use `text-3xs`), a 2-column
  grid of theme preview cards, then three full-width actions stacked (Browse Marketplace →
  outline button, Build New Theme with Claude → primary button, Reduce Visual Effects →
  toggle row). Three different affordance types back-to-back with no separating label.
- **Edit view (per-theme):** cleanly different from the list — "GLASS" and "TERMINAL"
  eyebrows over slider rows (label left, slider + numeric value right, no description
  text at all — sliders are the one control type in the whole audit that never gets a
  hint line). Internally consistent, but a visibly different vocabulary from the grid
  screen one click away (cards+buttons vs. bare sliders).
- **Clutter read:** the grid itself is fine; the "Browse Marketplace / Build New Theme /
  Reduce Visual Effects" stack at the bottom mixes a secondary button, a primary button,
  and a toggle row as three consecutive but structurally different rows with no shared
  left column and no shared height.

### Buddy Floater (`SettingsPanel.tsx` → `BuddyButton`)
**Screenshot:** `shots-main/light/settings-buddy-floater.png`.

- **Layout:** the simplest popup after Donate — a single `<SettingRow variant="item">`
  (title "Show buddy floater", description, toggle) plus a right-aligned "Remove helper"
  ghost link when relevant. One zone, no cards, no eyebrows.
- **Source comments confirm this was deliberately cleaned up**: "K2: this popup was the
  worst offender in the app — it used TWO different description placements within itself."
  It is now the single cleanest popup after the drawer itself — good evidence that when a
  screen *is* migrated to SettingRow/K2, the clutter genuinely goes away.
- On Linux with the KDE helper flow, a consent card appears in the same dialog
  (bold title, paragraph, `<Callout tone="warning">`, two buttons) — a different shape
  again, but gated behind a rare state, so it doesn't cost most users anything.

### Sound (`SettingsPanel.tsx` → `SoundButton`)
**Screenshot:** `shots-main/light/settings-sound.png`.

- **Layout:** "VOLUME" eyebrow (`mb-3`, where Remote Access's identical-looking eyebrow
  also uses `mb-3` but Permissions' `SECTION_LABEL` constant uses `mb-2` — a real, silent
  1px-scale difference in vertical rhythm between hand-typed eyebrows and the shared
  constant), then a mute icon + slider + percentage on one row. "NOTIFICATION" eyebrow,
  then a 2-tab segmented control (Needs Attention / Response Ready), then a hand-rolled
  toggle row that shows **a coloured dot + description text but no title at all** — the
  category name only exists on the segmented tab above it, so this row is the one place
  in the app where a toggle has no visible label of its own next to the switch. Below
  that, a radio list of 7 sound presets, each a boxed row (name + note pitches).
- **Clutter read:** functionally fine, but the toggle-row-with-no-title directly
  contradicts K2's stated rule ("the description always lives in the left column, under
  the title... never below the whole row (Sound)") — the SettingRow.tsx source comment
  literally names Sound as the example K2 was built to fix, and this row still isn't
  migrated.

### Backup & Sync (`SyncPanel.tsx` → `SyncSection`/`SyncPopup`)
**Screenshots:** `shots-main/light/settings-backup-sync.png`,
`shots-sync-oversize-fix/light/{sync-error,sync-oversize-open}.png`.

- **Layout:** the most heavily-boxed screen in the audit. Top-to-bottom: a full-width
  status card (dot + bold state word "All synced"/"Couldn't sync" + description +
  a toggle on the right, sometimes a "Show details" disclosure and a "Try again" button
  inside the SAME card), then three pill tabs (Devices/Projects/Conversations) **inside**
  that same card, then a device list, then sometimes a nested amber warning card
  ("2 conversations too big to sync") **inside** the status card, then a *second*,
  separately-bordered card ("Additional backups", with an "OPTIONAL" pill next to its
  title — the only place a pill sits next to a section title rather than a row), which
  itself contains a **third**, smaller bordered row (Google Drive: icon, name, "Backed up
  5m ago", green dot, gear) and a **dashed-border** "+ Add a backup" button (the only
  dashed border in the whole audit), then a plain-text "Back up all now" link, then a
  non-interactive "INCLUDES: Memory · Conversations · …" caption line, then a "SYNC LOG"
  disclosure row.
- **Clutter read:** this is boxes-in-boxes almost literally — a card, inside which is
  another card, inside which is a smaller card, next to a dashed-border button, next to a
  plain link, above a caption, above a disclosure. At least 4 distinct border/background
  treatments appear in one screen (solid card, pill badge, nested mini-card, dashed
  button) where every other popup uses at most one or two.
- **Setup wizard** (`SyncSetupWizard.tsx`, judged partly from code — only an error-state
  screenshot exists, `sync-wizard-upload-failed.png`): the success/error step is a
  **centered vertical layout** (big circular icon, centered title, centered callout,
  centered button) — the only screen in the whole audit that centers instead of using the
  left-aligned row/section pattern every other screen (including every other step of this
  same wizard) uses. A sync setup step landing between two left-aligned screens will read
  as visually "off" purely from the alignment switch, independent of anything else on it.

### Remote Access (`SettingsPanel.tsx` → `RemoteButton`)
**Screenshot:** `shots-main/light/settings-remote-access.png`.

- **Layout:** an intro card (status dot + sentence + "Set up" button, all inside one
  bordered block) sits above two K1-labeled sections, "SERVER" and "TAILSCALE".
- **Server section, row by row, three different shapes for three adjacent settings:**
  - "Enabled" — a real `<SettingRow variant="item">` (title + toggle). Compliant.
  - "Password" — hand-rolled: a `<span className="text-xs text-fg-2">` label (NOT
    SettingRow's `text-xs`/`text-sm` title classes — a third, ad hoc text style), a field
    with the Set button built in, then a hint line and a "Generate" link **below and to
    the right of the field**, i.e. description-after-the-control, not under a title —
    the exact anti-pattern K2 was written to retire.
  - "Keep awake" — the same hand-rolled label style, then a 5-option `<SegmentedTabs>`
    (Off / 1h / 4h / 8h / 24h). The source comment directly above it says **"K3: four
    short options -> segmented"** but the array it renders (`KEEP_AWAKE_OPTIONS`) has
    five entries — the comment and the code have drifted apart, and the screen now
    breaks its own documented threshold for when a segmented control stops being
    appropriate (five options don't fit comfortably and this is visibly the widest,
    most cramped segmented control in the app).
    <!-- verify: {"path": "youcoded/desktop/src/renderer/components/SettingsPanel.tsx", "contains": "K3: four short options"} -->
- **Clutter read:** one popup, one topic ("remote access"), and it still manages three
  different row shapes (real SettingRow, hand-rolled label+field, hand-rolled
  label+segmented) plus a nested intro card, in the same screenful.

### Help & feedback (`HelpPopup.tsx`)
**No screenshot found** in any shots directory searched (`help`, `tour`, `feedback` all
came back empty for this popup specifically) — judged from code only.

- **Layout:** a `prompt`-sized dialog (340px), five `<SettingRow>` nav rows in a flat
  `space-y-2` stack (Show me around, Tips for new users [with a toggle], Community on
  Reddit, Report a bug, Known issues), then a centered version caption at the bottom.
  This is a clean, fully-migrated K2 screen — its own header comment says it deliberately
  copies Development's shape. No inconsistency to report; it is one of the better screens
  in the app, alongside the drawer and Buddy Floater.

### Development (`development/DevelopmentPopup.tsx`, `BugReportPopup.tsx`,
`ContributePopup.tsx`)
**Screenshots:** `shots-main/light/settings-development.png`,
`shots-overlays/light/development-bug-report.png`,
`shots-overlays/light/development-contribute.png`.

- **Development popup:** intro paragraph, then 5 `<SettingRow>` nav rows (Report a Bug,
  Contribute, Known issues, Roadmap, Get beta builds [toggle]) inside a manually-added
  `<div className="p-4">` that sits **inside** the Dialog's own default `px-4 py-4` scroll
  body — i.e. this popup's content has 32px of padding on each side where every sibling
  popup (Help, Buddy Floater, Sound) has 16px, because the wrapper div double-applies
  padding the shell already provides. Small, but it's a measurable, silent difference in
  how "roomy" this popup feels versus its neighbors.
  <!-- verify: {"path": "youcoded/desktop/src/renderer/components/development/DevelopmentPopup.tsx", "contains": "className=\"p-4\""} -->
- **Bug report ("Submit a ticket"):** a `document`-sized (600px) dialog — by far the
  densest single screen: a 2-tab segmented control (Bug/Feature), a text input, a
  textarea, an "INCLUDE WITH TICKET" eyebrow over three checkbox rows (a fourth row shape:
  bold label + info icon + checkbox, no description text under the title), a disabled
  helper caption, then a full-width primary button. Five distinct control types
  (segmented, input, textarea, checkbox row, button) in one screen — more than any other
  single popup except Assistant settings and Backup & Sync.
- **Contribute:** a short paragraph, then an unusual **inversion of the usual "primary
  action last" order** — a nav row ("How contributing works") sits ABOVE the primary
  "Set up development workspace" button, so the reference/info row comes before the
  action it explains, backwards from where explanatory rows sit everywhere else in
  Settings (info icons and explainer links are elsewhere always beside or after the
  control they explain, never a full row above it).

### Keyboard Shortcuts (`ShortcutsPopup`, in `SettingsPanel.tsx`)
**Screenshot:** `shots-main/light/settings-keyboard-shortcuts.png`.

- **Layout:** one clean two-column grid (`grid-cols-[1fr_auto]`, description left, key
  chip right), 13 rows, `gap-x-4`, each row `py-1.5`. No sections, no eyebrows, no boxes.
  One of the simplest, most consistent screens in the audit — nothing to flag.

### Donate (`DonateConfirm.tsx`)
**Screenshot:** `shots-main/light/settings-donate.png`.

- **Layout:** icon + bold title row, one paragraph, one full-width primary button. Clean,
  but its content wrapper is `<div className="p-5 space-y-4">` (20px padding) instead of
  the shell's usual 16px (`px-4 py-4`) — this dialog uses `scrollBody={false}` and supplies
  its own padding, landing on a different number than every `scrollBody=true` popup uses
  by default. A 4px difference, invisible in isolation, but it means "Donate" and "About"
  — two popups that look almost identical in composition (icon/title, paragraph, single
  action) — actually sit on two different padding scales.

### About (`AboutPopup.tsx`)
**Screenshot:** `shots-main/light/settings-about.png`; also
`shots-overlays/light/about-scrolled.png` (not opened in detail — same pattern, scrolled).

- **Layout:** the longest single popup in Settings by text volume — version line, then
  four `<section className="space-y-1.5">` blocks (Disclaimer, Privacy, Licenses,
  Policies), each a `text-3xs uppercase tracking-wider` eyebrow over several `text-2xs`
  paragraphs. A toggle row (`AnalyticsOptInToggle`) is embedded mid-paragraph inside the
  Privacy section, and a small library-license list (`text-3xs` two-column-ish rows) sits
  inside Licenses. Internally consistent (every section uses the same eyebrow+paragraph
  shape), but it is a wall of body text with only one embedded control — very different
  in density from every other popup in the drawer, which are mostly rows and controls
  with little prose.

### Preferences (`PreferencesPopup.tsx`, opened via `/config`, not from the drawer)
**Screenshot:** `shots-main/light/preferences-config.png`.

- **Layout:** "DEFAULT PERMISSION MODE" eyebrow over a **4-item boxed radio list** (each
  option its own `bg-inset` row, selected one highlighted) — a fifth distinct "list of
  choices" shape not seen elsewhere (Sound's preset list is unboxed radio rows; Specialists'
  tier pickers are dropdowns in `FieldRow` boxes; this is boxed radio *rows*). Then "EDITOR
  MODE" eyebrow over a 2-tab segmented control, "OUTPUT STYLE" eyebrow over a text input
  with its hint **below** the input (Remote Access's Password hint is also below its
  field, but General's `FieldRow` hint is always above the control — two different
  hint-placement rules coexisting), then a flat toggle row ("Show turn duration") with no
  card at all. Four shapes (boxed radio list, segmented tabs, input+below-hint, flat
  toggle) in one popup, same pattern as Assistant settings' General/Permissions pages.
- Not reachable from the Settings drawer (it opens from the chat `/config` command), but
  it is one of the "Preferences" popups named in the audit brief and shares the same
  visual system, so the same inconsistencies apply to it.

### Model picker (`ModelPickerPopup.tsx`, opened from Assistant settings → General)
**Screenshot:** `shots-assistant-settings/light/assistant-general-picker.png`.

- **Layout:** a search field opens a dropdown-style list under the "Default model" field
  — favorited models with a star icon first, then the rest grouped by provider label
  inline (`· OpenRouter`, `· Claude Code`, `· ChatGPT Plan`) rather than under eyebrow
  section headers the way every OTHER grouped list in Settings does it (Local models'
  "INSTALLED", Permissions' "ALWAYS ALLOWED", Development's rows). This is the one list in
  the audit that groups by an inline suffix instead of a heading — reads fine on its own,
  but is a sixth way of expressing "these rows belong together."

### OpenRouter sign-in (nested popup from Cloud providers page)
**Screenshot:** `shots-openrouter-signin/light/si-modal.png` ("Replace OpenRouter key").

- **Layout:** a small centered dialog stacked ON TOP of the 820px Assistant settings
  window (an L3-over-L2 modal, same pattern as Buddy Floater's consent card and Skip
  Permissions Mode's confirm). A numbered 1-2-3 instruction list — the **only** numbered
  list in the whole audit; every other multi-step explanation elsewhere uses bullets or
  plain paragraphs — then an input, then Cancel/Connect buttons.

### Sync setup wizard, Cloud context / SessionContextPopup
No dedicated in-flow screenshot was found for either beyond the states already covered
above (the sync wizard's error step, and a "cloud-context" plan that resolved to the same
Assistant Settings → General screenshot rather than a distinct context popup — likely a
stale or mislabeled capture, not a real screen). Judged from code only:
`SessionContextPopup.tsx` (616 lines) mixes 12 `<SettingRow>` uses, 7 `<Callout>` uses and
6 hand-set `h3` eyebrows in one file — a similar density of mixed patterns to Assistant
settings, but not independently confirmed against a screenshot.

## Same job, different treatment

| Job | Variant 1 | Variant 2 | Variant 3 | Variant 4+ |
|---|---|---|---|---|
| **A labeled control (title + hint + input/picker)** | `FieldRow` boxed card, hint above control — Assistant settings → General (Default model, Project folder, Step guard) | Flat, no box, bold title + paragraph, control at right — Permissions page ("Enable Skip Permissions Mode?") | Hand-rolled `<span className="text-xs text-fg-2">` label, hint **below** the control — Remote Access (Password, Keep awake) | Boxed radio-row list — Preferences (Default Permission Mode); provider card with inline buttons, no label/hint at all — Cloud providers |
| **A toggle setting row** | `<SettingRow>` with title+description+toggle (K2-compliant) — drawer's own toggled rows, Buddy Floater, Help & feedback "Tips", Assistant settings "Close-session prompt" | Dot + description, **no title** — Sound's Needs Attention/Response Ready toggle | Embedded mid-paragraph inside prose — About's analytics toggle | |
| **A section label ("eyebrow")** | `text-3xs uppercase tracking-wider mb-2` (the shared `SECTION_LABEL` constant) — Permissions | Same classes, hand-typed with `mb-3` — Sound, Remote Access | `text-4xs` (one size smaller) — Appearance's "Favorited Themes" | "LABEL · count · warning" appended inline — Specialists' "Available specialists · 7 · 1 warning" |
| **A list of related rows** | Boxed card containing the rows, one eyebrow above — Permissions "Always allowed", Local models "Installed" | Unboxed rows with an eyebrow above — Development's 5 nav rows | Grouped by inline suffix text, no eyebrow — Model picker ("· OpenRouter") | Double-nested box (a box inside a box) — Specialists' tier pickers |
| **A short numbered/lettered explanation** | Bulleted list — Permissions ("Full auto... it still asks before: •Deleting files..."), About | Numbered 1-2-3 — OpenRouter "Replace key" modal (the only numbered list found) | | |
| **A status/health strip** | Dot + bold word + description + toggle, all one card — Backup & Sync "All synced"/"Couldn't sync" | Dot + plain sentence + button, no card — Remote Access intro | | |
| **A modal-on-modal confirmation** | L3 dialog over an L2 popup — Buddy Floater's "Let the buddy be moved?" consent card | L3 dialog over the wide Assistant settings window — "Skip Permissions Mode" confirm, "Replace OpenRouter key" | | |
| **A short/long option chooser** | Segmented tabs, ≤4 options (the stated rule) — Sound (2), Preferences editor mode (2), Session naming (3) | Segmented tabs, 5 options (rule not followed; comment claims 4) — Remote Access "Keep awake" | Boxed radio-row list — Preferences default permission mode (4) | Unboxed radio list — Sound's preset picker (7) |
| **Popup body padding** | 16px, `px-4 py-4` from the shared Dialog shell (most popups: Help, Sound, Buddy Floater, About, Development's *outer* wrapper) | 32px effective (Dialog's 16px + an extra hand-added `p-4`) — Development popup's inner wrapper | 20px, `p-5` (dialog opts out of the shared body) — Donate | |
| **Primary-action placement** | Primary button last, after any explanatory rows — Sound, Sync, most popups | Explanatory nav row placed ABOVE the primary button — Contribute ("How contributing works" before "Set up development workspace") | | |
| **Popup content alignment** | Left-aligned rows/sections — every screen except one | Centered icon/title/button — Sync setup wizard's success/error step | | |

## Candidate Settings rules

Proposals only — not decided. Each ties back to a pattern actually seen above, and (where
one already exists in code) names the rule that should simply be *finished being applied*
rather than invented from scratch.

1. **Every labeled control is a `FieldRow`, everywhere it appears — not just on the
   General page.** Right now `FieldRow` (title + hint above + full-width control, in a
   `bg-inset/50` card) exists but is used on one page out of five in Assistant settings,
   and nowhere in Remote Access, Preferences, or Backup & Sync, all of which hand-roll a
   similar-but-not-identical shape. Picking one — `FieldRow`, or `SettingRow`'s existing
   `control` slot, but not both — and applying it everywhere a control needs a hint would
   remove the largest single source of "why does this look different" between screens.
2. **Finish the K2 migration.** `SettingRow`'s own source comments already name Sound,
   Buddy Floater ("the worst offender"), and (implicitly, by the shape it replaced)
   Remote Access's Password/Keep awake rows as the reason the rule exists. Buddy Floater
   is done; Sound and Remote Access are not. The rule ("title, then description under it,
   left column, always") is already written down in one file — the fix is applying it to
   the two rows above that still don't.
3. **One eyebrow-label spec, no exceptions.** Pick one size (`text-3xs`, matching the
   `SECTION_LABEL` constant already used in `PermissionsSection.tsx`) and one bottom
   margin (`mb-2`, also from that constant), and use the *constant*, not a hand-typed
   className, everywhere a section needs a label. This alone would fix Appearance's
   `text-4xs` outlier and the `mb-2`/`mb-3` drift between Permissions and
   Sound/Remote Access.
4. **A section never gets two eyebrows.** When a page wraps a shared block
   (`<PermissionsSection>`, `<SearchProvidersBlock>`, etc.) in its own labeled `<section>`,
   the wrapped block must not add a second label of its own — the wrapper's label is
   enough. This directly fixes the doubled "CHATGPT, OPENROUTER AND LOCAL MODELS" /
   "PERMISSION MODES" header on the Permissions page.
5. **Segmented tabs stop at 4 options — for real.** The rule is already written as a
   code comment ("K3: four short options -> segmented") next to the one place that
   breaks it (Remote Access's 5-option Keep Awake). Either drop it to 4 options (fold two
   together, e.g. "8h/24h" → "8h+") or switch it to the same boxed radio-row list
   Preferences already uses for its own 4-option chooser — but the comment and the code
   should agree, and no segmented control should render 5 tabs.
6. **One card style for "a box that groups rows."** Backup & Sync alone has four:
   a plain status card, a card with a pill badge next to its title, a smaller nested card
   inside it, and a dashed-border button. Settle on: solid `bg-inset/50` for a
   groupING card, no nested cards (flatten one level — if a group needs a sub-item, that
   sub-item is a row, not another card), and reserve any non-solid border (dashed, etc.)
   for a genuinely different affordance (e.g. "add new," never "existing item").
7. **Primary action is always last.** No popup should place a "learn more about this"
   nav row above the button it explains — info/explainer rows go beside or after the
   control they describe (as the (i) icon convention already does everywhere else),
   never as a full row preceding the primary CTA. Fixes Contribute's row-before-button
   order.
8. **One padding number for a titled popup's body.** `Dialog`'s own `scrollBody=true`
   path already sets `px-4 py-4` — no popup should add its own extra padding wrapper
   (Development) or opt out to hand-roll a different number (Donate's `p-5`). If a popup
   genuinely needs `scrollBody={false}`, it should still open with `px-4 py-4` as its own
   first line, not a value nobody chose on purpose.
9. **Modal-on-modal is a last resort, and always uses the same size.** Three different
   confirmation popups (Buddy Floater's consent, Skip Permissions Mode, Replace OpenRouter
   key) already agree on stacking an L3 dialog over an L2 one — keep that pattern, but
   audit whether Skip Permissions Mode in particular needs a whole second dialog rather
   than an inline expand (the toggle already lives on a page with room to expand in
   place, the way Buddy Floater's own "Remove helper" flow does not need a second dialog).
10. **Centered layouts are reserved for terminal states (success/error/empty), never for
    an in-progress step.** The sync wizard's final "Setup Complete" screen centers
    everything; every other screen, including every other step of the same wizard, is
    left-aligned rows. That split is fine as a *rule* (a finishing screen reads
    differently from a working screen on purpose) but should be named as one, so nobody
    centers a mid-flow step by mistake later.

## Coverage

**Screens with a verified screenshot, opened and read with the Read tool (light theme
unless noted):** Settings drawer; Account (+ Connected services entry row visible);
Assistant settings — General, Cloud providers, Local models, Permissions (+ Skip
Permissions Mode confirm), Specialists; Appearance/Themes grid + community-theme glass
edit view; Buddy Floater; Sound; Backup & Sync (all-synced state, error state, oversize
warning); Remote Access; Development (+ Bug report ticket form, + Contribute); Keyboard
Shortcuts; Donate; About; Preferences (`/config`); Model picker dropdown; OpenRouter
"Replace key" sign-in modal; Sync setup wizard (error/backup-added step only).

**Named in the brief but not independently confirmed with a screen from this audit's own
review, judged from code instead:**
- **Help & feedback** — no screenshot found under any plan searched (`help`, `tour`,
  `feedback` all came back empty specifically for this popup). Judged from
  `HelpPopup.tsx` only; it reads as one of the cleanest, fully-K2 screens in the app.
- **Sync setup wizard's normal (non-error) steps** — only the failure/backup-added step
  has a screenshot (`sync-wizard-upload-failed.png`); the picker/connect/progress steps
  earlier in the flow were not captured under any plan searched. The centered-layout
  finding above is confirmed for the one step that was captured; whether earlier steps
  share that centering was not independently verified.
- **Cloud context popup (`SessionContextPopup.tsx`)** — the `shots-cloud-context-after`
  plan's screenshots resolved to what appears to be the Assistant Settings → General page
  rather than a distinct context popup; this looks like a stale or mislabeled capture in
  the sweep, not a real render of this screen. Noted from source only (12 SettingRow uses,
  7 Callouts, 6 hand-set eyebrows in one file — similar mixed-pattern density to Assistant
  settings, not independently confirmed visually).
- **Theme cycle editor** (`shots-overlays/light/theme-cycle-editor.png`) — this is the
  Status Bar Widgets popup's theme-cycle sub-editor, reached from the status bar widget
  editor rather than from Settings → Appearance directly. Screenshot exists and was
  opened, but it isn't one of the drawer's own screens, so it's mentioned here rather
  than given its own section.
- **`theme-edit-builtin.png`** appears to be a duplicate/mis-capture of the main Themes
  grid rather than a distinct "editing a built-in theme" view — not used as evidence
  above; the community-theme edit view (`theme-edit-community.png`) was used instead and
  is representative of the edit-view pattern.

No screen in the requested list was skipped outright; every one is either backed by a
screenshot opened in this session or explicitly marked above as code-only with the reason.
