---
status: draft
date: 2026-09-26
source: read-only look at meadow-mist screenshots (16 images) + grep of youcoded/desktop/src/renderer/components/ui/
---

# Unit vocabulary in the Settings-family popups

A **unit** is one visually distinct container or standalone control style: a big tinted card,
a tinted row, a bordered card with an icon, a warning box, pill chips, a tab strip, a filled
button, an outlined button, a faint text button, a boxed fold-out row, an input.
Switches, dropdowns and tag pills that sit *inside* a row are counted as parts of that row,
not as units of their own. Plain paragraphs are not counted.

Destin's complaint is right: the design guide says "cards for things, rows for lists, no
nesting" (principle 5), and the Settings popups do not follow it.

## What I could and could not see

- Looked at 16 images, all meadow-mist. Counts are for what is visible in the picture. Long
  popups are cut off at the bottom (Sync, Local models, Specialists, General, Permissions,
  Appearance), so the real counts are the same or higher.
- `settings-backup-sync.png` and `sync-error.png` are the same picture. `assistant-openrouter.png`
  is the same picture as `assistant-claude.png` (both are the Cloud providers page); the
  OpenRouter screen itself is not captured separately.
- The Development picture is from before batch 2 (`scratch/batch1-after`); no newer one exists.
- I did not find a separate "Sync" screen other than Backup & Sync.
- Counts are my own reading of the pictures, not a measured number. Treat +/-1 as noise; the
  point is the size of the gap between screens.

## 1. Count per screen

| Screen | Unit kinds | The kinds |
|---|---|---|
| Backup & Sync (error) | **10** | big tinted status card, red notice box, small filled button, small outlined button, tinted row ("Additional backups") + "Optional" tag, darker bordered icon-disc card (Google Drive), faint borderless "Add a backup", faint borderless "Back up all now", plain grey text line ("Includes Memory ..."), boxed fold-out row ("Sync log") |
| Backup & Sync (oversize) | **9** | status card, count chips (Devices / Projects / Conversations), plain table rows (devices, with tiny "Remove" text), yellow notice box, full-width outlined button, tinted row + tag, icon-disc card, faint "Add a backup", switches |
| Assistant: Local models | **12** | side nav, big card (engine), boxed fold-out row inside it, second big card (Models), search input, model card nested inside that card, small outlined button, red outlined button, small filled button, yellow notice box, progress bar, outlined chip ("Add vision") |
| Assistant: Cloud providers (and OpenRouter, same page) | 7 | side nav, provider card, small outlined buttons, filled button, usage bars, small label, faint "Add provider" |
| Assistant: Specialists | 7 | side nav, small label, big card with divider lines between groups, dropdown, full-width outlined "Clear", tag pills, warning pill |
| Remote Access | 7 | status strip with filled button, small label, tinted setting row, tall password card (label + input + inner button), tab strip, faint "Install Tailscale", plain paragraph |
| Assistant: General | 6 | side nav, tinted card with a control under its title, dropdown, tab strip (twice, one inside a card), text input, switch row |
| Assistant: Permissions | 5 | switch row, small label, reading-text card, card with a divider line, boxed fold-out rows nested inside that card |
| Sound & Notifications | 5 | small label, slider, tab strip, plain text line with switch, radio rows |
| Claude Code Preferences | 5 | small label, radio rows, tab strip, text input, switch row |
| Appearance (top part only) | 5 | small label, theme picture cards, faint "Browse Theme Marketplace", big full-width filled button, switch row |
| Development (before batch 2) | 3 | intro paragraph, icon menu rows, icon switch row (these two rows look the same) |
| Settings menu (drawer) | 2 | icon menu row, red count badge / status dot |
| About | 2 | reading text, underlined small label |

The three worst offenders (Backup & Sync 9-10, Local models 12, Specialists/Remote 7) all break
the same rule: a **container inside a container** (a card holding a card holding rows) and
**several different button looks**. The quiet screens (Sound, Preferences, Development, About)
are quiet because they are just labels and rows.

## 2. What is the app's real vocabulary, and what are one-offs

Appears on many screens (this is what people already recognise):

1. **The tinted rounded row**: title, grey hint under it, control on the right. Sound, Preferences,
   Remote, General, Permissions, Development, Appearance, Sync ("Additional backups", "Sync log"),
   Settings menu. About ten screens.
2. **The small grey label** over a group. Sound, Preferences, Remote, Specialists, Cloud,
   Permissions, Appearance. Seven screens.
3. **The tab strip** (2-5 short choices). Sound, Preferences, Remote, General. Four screens.
4. **A small button** (outlined, sometimes filled). Sync, Local models, Cloud, Specialists,
   Remote. Five screens, but in five different sizes and levels of visibility.
5. **The tinted notice box.** Sync (twice) and Local models.

Also common, and the source of the nesting problem: **a big tinted group card wrapping rows**
(Local models, Specialists, General, Permissions, Cloud, Sync status).

One-offs that should not exist as their own look:
status card with chips and a table (Sync), darker bordered icon-disc card (Google Drive),
count chips as tabs (Sync), plain devices table (Sync), the tall password card (Remote),
provider cards (Cloud), model cards inside a Models card (Local), boxed "Advanced" inside the
engine card, faint borderless text buttons (Add a backup, Back up all now, Install Tailscale,
Add provider, Browse Theme Marketplace), the plain grey "Includes ..." line as its own unit,
outlined "Add vision" chip.

## 3. Proposed vocabulary for Settings-family popups

**Four kinds, and a popup uses at most those four.** Everything else on the screen must be
one of them, or a *part inside* one of them (a switch, dropdown, tab strip, input, tag,
progress bar).

| Kind | Job | What it looks like |
|---|---|---|
| **Small label** | Names a group of rows ("Volume", "Installed", "Additional backups") | 12px grey text, normal case |
| **Row** | Anything you read, pick, switch, open or remove: one thing per row | The one tinted rounded row: title, grey hint under it, control at the right. Same row whether it holds a switch, a radio, an arrow, an icon, a status dot, a tag or a small button |
| **Notice box** | Any warning, error, info or status message, with its buttons inside on the right | The one tinted box with matching border |
| **Button** | The follow-up action for a group, or a Yes/No action | Filled = main action (one per view). Outlined = everything else. Full width when it is the follow-up under a group. Never borderless or faint |

Groups are separated by a small label plus spacing (16px between groups, 6px between rows).
**No wrapper card around a group.** A wrapper is what creates the nested look.

Where a "card" is right: things you **open, install or pick from a grid** (theme pictures on
Appearance, plugins, Pages). Those stay raised cards and are a *fifth* kind that only appears
on grid screens, never mixed with rows on a settings list.

### What each one-off becomes

| Today | Becomes | Note |
|---|---|---|
| Big status card ("All synced" + switch + chips + table) | **Row** ("All synced", hint "GitHub · instant sync on · 2m ago", switch at right) | Its warning stays a **Notice box** directly under the row |
| Count chips (3 Devices / 3 Projects / 7 Conversations) | **Rows** that open in place (fold-out rows: "Devices 3" ...) | They are lists you open, not view switches. If a screen truly needs to switch views, use the tab strip, never home-made chips |
| Plain devices table | **Rows** inside the "Devices" fold-out: name, hint "Android · last synced 2 hours ago", small outlined "Remove" at right | |
| Yellow "too big to sync" box | **Notice box** (unchanged) | Already the reference |
| Full-width outlined "Sync now" / faint "Back up all now" / faint "Add a backup" | **Button**, outlined, full width | Same look, same place, never faint |
| "Additional backups / Optional" tinted row | **Row** | "Optional" becomes a small tag inside the row, or is dropped into the hint |
| Google Drive icon-disc card | **Row** with a leading icon; status dot in the hint, gear at right | The shared row already has an icon slot |
| Plain line "Includes Memory · Conversations ..." | The **hint** of the row/label it describes | Not a unit of its own |
| Boxed "Sync log" fold-out | **Row** (fold-out) | Already correct; this is the model |
| Status strip on Remote ("Not set up yet" + Set up) | **Row** with status dot + small filled button; or a **Notice box** if it is a problem | |
| Tall password card | **Row**: title, hint, then the text box under it (the shared wide-control row) | Its "Set" button stays inside the text box |
| Provider cards (Claude Code, ChatGPT, OpenRouter) | **Rows**: title + hint, small outlined buttons at right; the usage bars sit inside the row | |
| Big "Local engine" and "Models" cards, with a card per model inside | Small label ("Local engine", "Installed") then **Rows**; the model rows carry Settings/Delete as small buttons | Removes three levels of box |
| "Advanced" boxed fold-out inside the engine card | **Row** (fold-out) in the group | |
| "Download interrupted" strip | **Notice box** with Delete / Resume inside | |
| Wrapper cards on Specialists, General, Permissions | Removed; label + rows | Divider lines between groups go too |
| Fold-out rows with count nested in the Permissions card | **Rows** (fold-out), no card around them | |
| Tab strips (Sound, Remote, Prefs, General) | Stay: a control **inside a row** (title + hint above, strip below) or directly under a small label | |
| Tags ("Read-only", "1 warning", "Optional", "Stopped") | Stay as small tag pills **inside a row** | Not a unit of their own |
| Faint "Browse Theme Marketplace", "Install Tailscale", "Add provider" | **Button**, outlined, full width | |
| "Add vision" outlined chip | **Button**, small outlined, inside the model row | |

What people will experience: every list on every Settings popup looks and behaves the same;
the same action looks the same everywhere. The cost is that popups with many groups become
longer and flatter (no wrapper cards to compress them), and Backup & Sync loses its "dashboard"
feel. Both are the intent of principle 5.

## 4. Recommended guide rule and checklist item

**Rule (goes under "Settings" in the guide):**
"A Settings popup is made of only four things: a small label, a row, a notice box and a
button. Anything with a title and something you do to it is a row, whether it is a switch, a
device, a backup, a provider or a model. A group is a small label and its rows, never a box
around them. Switches, dropdowns, tab strips, text boxes, tags and progress bars live inside a
row; they are never a second kind of container. If you need a fifth kind, ask."

**Checklist item (add to "Before you show Destin"):**
- [ ] Count the unit kinds on the screen; more than four means it needs simplifying.

(Do not count switches, dropdowns, tab strips, text boxes, tags or bars that sit inside a row.
Grids of things to open or install, like themes, are the one allowed extra kind.)

## 5. Shared components that already implement each kind

Confirmed by grep in `youcoded/desktop/src/renderer/components/ui/`:

| Kind | Component | Notes |
|---|---|---|
| Small label | `SectionLabel` (`SectionLabel.tsx`) | `reading` prop adds the soft underline |
| Row | `SettingRow` (`SettingRow.tsx`) | Props: `title`, `description`, `icon`, `control`, `value`, `accessory`, `selected`/`onSelect` (radio), `expanded`, `variant: 'nav' \| 'item'`. Also exports `RowStatus` (dot + words) |
| Row, fold-out | `FoldRow` | Boxed row, arrow at right |
| Row, wide control | `FieldRow` | Title + hint, control full width below |
| Row, risky confirm | `ConsentRow` | |
| Notice box | `Callout` | Tones info / warning / danger; has `title`, `actions` (buttons inside at right), `collapsible` |
| Button | `Button` | Variants `primary`, `secondary` (outlined), `ghost`, `danger`, `danger-outline`; sizes include `icon` sizes. `ghost` is the borderless look behind the faint buttons |
| Inside a row | `Toggle`, `SegmentedTabs`, `Select`, `TypeableSelect`, `TextInput`, `InputGroup`, `Radio`/`RadioGroup`, `Pill`, `Badge`, `ProgressBar`, `FilterChip` | |

**Already in the folder but a candidate to retire into the above:** `StatusStrip` (an action-owning
status box; overlaps `SettingRow` with a status dot plus `Callout` with `actions`). Used in
App, SettingsPanel, InputBar, ChatView, FirstRunView and others, so removal is a separate task.

**Missing:**
1. **A group wrapper** (small label + rows with the 16px / 6px spacing). There is no
   `SettingGroup` in `ui/` or `assistant-settings/`; each screen hand-builds its own, which is
   how the wrapper cards crept in.
2. **A shared raised `Card`** for the "things you open or install" kind (theme pictures,
   Library, Pages). No `Card` in `ui/`; cards are hand-built per screen (`SkillCard`, `EngineCard`,
   etc. live outside `ui/`).
3. **A view-switching count tab** is not needed if the count chips become rows; if kept, they
   must use `SegmentedTabs`. `SyncPanel.tsx` currently hand-rolls them (around line 1307,
   `rounded-full px-3 py-1 ... bg-accent`) and hand-rolls two tag pills (lines 184, 191, `rounded-full
   ... text-4xs`) instead of `Pill`. Only 8 uses of the shared row/notice/tab/label pieces appear
   in that file (grep count), so it is the clearest screen to migrate first.
