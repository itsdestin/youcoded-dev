---
status: draft
date: 2026-09-24
replaces: docs/active/design/2026-08-25-ui-design-guide.md (on approval)
source: docs/active/design/2026-09-23-ui-element-review/decisions.md
---

# YouCoded design guide

**Read this before you design any screen, popup, panel or Page.** It tells you how
YouCoded looks and how it is arranged, so something new fits without Destin having to
correct it. Every rule comes from a decision Destin made comparing real screens side by
side (`decisions.md` beside this file names the source of each). Where a rule names a
screen, open it as the example: copy the look, not blindly the code.

## The taste in one paragraph

Calm, quiet and consistent. One style per job, used everywhere that job appears. The
theme decides colour **and shape**. Text is small, grey and normal-case unless it is the
one thing to read; no spaced-out capitals, no redundant labels, one-line headers. Things
you open stand out as raised cards; things you read past stay soft. Actions sit on the
right: a filled button, switch or chosen option never hangs alone at the bottom-left.
When in doubt, remove rather than add.

## Principles

1. **Find the job first.** Use the recipe below for that job exactly. A new look needs a
   new job and Destin's approval — never a one-off.
2. **The theme paints and shapes everything.** Colours come from theme tokens; the fixed
   status hues (green, red, amber, blue) are the only exceptions and go in tints, never in
   text. Corner roundness comes from the theme's shape setting — never write a fixed pill
   or pixel radius on a control.
3. **Quiet by default.** Small grey labels in normal case. Show what the user needs to act
   on; drop details nobody asked for. Headers are one line.
4. **Three heading levels, no more.** If a screen seems to need a fourth, it needs fewer
   sections.
5. **Cards stand out; rows stay soft; nothing nests.** Things you open are raised cards.
   Lists of settings are soft boxed rows; pick-one menus are plain rows. Never a box inside
   a box.
6. **Actions live on the right.** One filled button per view. A filled button, switch or
   selection never sits alone at the bottom-left — only when balanced by something on the
   right of the same line.
7. **Tight, even spacing** from one scale (below).
8. **Every theme, every width.** Check light, a dark theme, a wallpaper theme and 390px
   phone width before showing anyone.

## Recipes

### Full screens (Projects, Pages, Marketplace, Library)
- The screen names itself **centered in the window's top strip, small (14px medium), with
  its icon**. Reference: Pages.
- The way out is a **filled small button reading "Esc · Back to chat"**, top right.
- Big groups on the screen use the *Large* heading.

### Popups and side panels
- One shared shell for every popup and side panel (Settings, Session Files, file viewers,
  Git review, Games, buddy windows): **16px semibold one-line title**, the **✕ close
  button** at the right (28px, soft hover square), a **tapered line** under the header
  (inset 16px, fading over its first and last 8%). Every popup has the ✕ and closes on Esc.
- When the body scrolls, fade the content at the hidden edge (42px, softened 4% at the
  sides); no fade when nothing is hidden; never paint a solid strip.
- **Narrow** popups are up to 420px wide (confirmations, Sound, Create a page); **wide**
  popups are larger.

### Headings
| Level | Use | Style |
|---|---|---|
| Large | Big groups on a full screen ("Favorites", "Destin's picks") | 18px medium, main text colour |
| Title | A popup or side panel's name | 16px semibold (above) |
| Small label | A group inside a screen, popup or list ("Volume", "Privacy") | 12px medium, grey, normal case, no letter-spacing |

A small label heading a **section of reading text** (About's "Disclaimer") also gets a soft
underline under its words. Labels over short settings groups stay plain.

### Text and numbers
- Body 14px; secondary text one grey; the faintest grey only for disabled things.
- Nothing below 11px carries information.
- A count beside a label or tab: **the word, then a smaller faint number** — "Files 17". In
  a summary line: **bold number, grey word** — "17 files". No brackets, no number chips.

### Spacing
- One scale: **4 · 8 · 12 · 16 · 24 px.** 4 between an icon and its label; 8 between
  things inside a card; 12 inside a card's edge and between cards; 16 between groups; 24
  for major breaks.
- In Settings popups: **16px between groups, 6px between rows.**

### Buttons
- Shape follows the theme's control roundness (built-in themes: Round, 14px).
- **Main action:** filled. **Everything less important beside it** (Cancel, Preview, Not
  now, Dismiss): **outlined**, never bare text.
- **One button:** full width.
- **Two buttons, side by side** (wide popups, chat messages): the **filled one on the right**,
  the outlined one directly left of it, both hugging their labels at the right edge.
- **Two buttons, stacked** (narrow popups and phone width): full width, **filled on top**.
- **Destructive confirm:** the red button takes the main action's place — on the right when
  side by side, on top when stacked.
- Close is always the ✕ button, never a letter or the word.
- Switching views or filters uses the shared tab strip and filter chips, following the same
  roundness.

### Settings
- **Small controls (switches) sit beside** the setting's title and hint, on the right.
  **Wide controls (text boxes, sets of choices) go below** the title and hint, full width.
- Offering choices: 2–4 short choices → a tab strip; many choices or long names → a
  dropdown; choices that each need an explanation → a boxed list.
- **Groups are flat:** a small label, then the rows directly under it, then a normal button.
  No box inside a box.
- Rows use the shared setting row: title, hint under it in the left column, control at the
  right.

### Cards
- Anything you open, install or pick from a grid is a **raised card**: panel colour, thin
  border, a **medium shadow**, the theme's card corner, 12px between cards. Reference: Your
  Library.
- **Text order:** name with its status pill and star on the top line → **one row of chips
  right under the name** (trust, who made it, kind, numbers) → the description (two lines at
  most).
- **Conversation cards** (Resume, Projects, chat references): name on top with the **tag and
  note buttons at the top right**; the **date at the bottom right**, at the end of the details
  line.

### Lists and menus
- **Settings-style lists** (each row opens or changes a setting): **boxed rows** — each row a
  soft tinted box with a small gap. Reference: the Settings list.
- **Pick-one menus and switchers** (right-click menu, session list): **plain rows** — no box,
  no line; hover highlights; the selected row always looks different from a hovered one.

### Status and notices
- A status label is a **small tinted pill in its status colour, normal case** ("Installed").
  A live status (a session Working / Inactive) carries its **coloured dot inside the pill**.
- A passive warning, info or danger notice is a **tinted box with a matching border**.
  Reference: Backup & Sync → "conversations too big to sync".
- Errors follow `docs/error-message-standards.md`.

### Building a Page
Pages use the page kit's classes (`.yc-button`, `.yc-card`, `.yc-title`, `.yc-muted`…), which
carry these recipes; theme colour and shape reach the page automatically. Follow this guide
where a class leaves a choice open, and never restyle a kit class.

## Not covered yet

These are **not final** and are exempt from this guide until their own redesign: **tool
cards**, **permission prompts** (Yes · Always Allow · No stays as today) and the **terminal
view**, which stays exactly as it is.

## Before you show Destin

- [ ] Every element matches a recipe here; nothing invented.
- [ ] No hard-coded colour, pill or corner size; theme colours and shape only.
- [ ] No spaced-out capitals; headings from the three levels.
- [ ] Actions on the right; one filled button; nothing filled alone at the bottom-left.
- [ ] Spacing from the scale; no box inside a box.
- [ ] Popups have the ✕ and close on Esc.
- [ ] Checked in light, a dark theme, a wallpaper theme and at 390px wide.
- [ ] Shown to Destin as pictures of the real screen, not described in words.
