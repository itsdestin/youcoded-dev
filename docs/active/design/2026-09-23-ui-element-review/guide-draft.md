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

## How to use this guide

1. Name the job: "a popup with a main action", "a list of settings", "a card for something
   you can install".
2. **Before designing anything, find two or three places in the app that already do the
   same job** (or the closest one) and open them. Use them as your reference for the feel —
   spacing, weight, how busy it is — and name them when you show your work. Prefer the
   examples this guide names; if two references disagree, the guide decides.
3. Find that job's recipe below. Build it from the shared piece the recipe names, and copy
   its order and placement.
4. If no recipe fits, stop and ask Destin for one. Do not invent a look.

**Rules, not examples.** Each recipe is a general rule for a *kind* of job; the screens it
names are illustrations, not the limit of where it applies. Exact sizes live in the shared
pieces (`components/ui/`), not here — use the piece and you get them. If a rule seems wrong
for a new situation, ask rather than bending it or copying one screen's quirk.

## Principles

1. **Find the job first.** Every element has a job with a recipe below — "two buttons in a
   narrow popup" → Buttons; "a setting with a switch" → Settings. Copy the recipe exactly;
   if none fits, ask Destin for one instead of inventing a look.
2. **The theme paints and shapes everything.** Colours come from theme tokens; the fixed
   status hues (green, red, amber, blue) are the only exceptions and go in tints, never in
   text. Corner roundness comes from the theme's shape setting — never write a fixed pill
   or pixel radius on a control.
3. **Quiet by default.** Small grey labels in normal case. Show what the user needs to act
   on; drop details nobody asked for and options or information that would confuse someone
   who has never seen the app or used its features. Headers are one line.
4. **Three heading levels, no more.** If a screen seems to need a fourth, it needs fewer
   sections.
5. **Cards for things, rows for lists, no nesting.** Something you open or install (a
   plugin, a Page, a file) is a raised card. A list you read or pick from (settings, a menu)
   is rows, never cards. Group with a small label and spacing — never put a box inside a
   box.
6. **Actions live on the right.** One filled button per view. A filled button, switch or
   selection never sits alone at the bottom-left — only when balanced by something on the
   right of the same line.
7. **Tight, even spacing** from one scale (below).
8. **Every theme, every width.** Check light, a dark theme, a wallpaper theme and 390px
   phone width before showing anyone.

## Recipes

### Full screens (Projects, Pages, Marketplace, Library)
- The screen names itself **centered in the window's top strip, small (14px medium), with
  its icon**. Reference: Pages or the Projects view.
- The way out is a **filled small button reading "Esc · Back to chat"**, top right.
- Big groups on the screen use the *Large* heading.

### Popups and side panels
- Every popup and side panel uses the shared popup (`Dialog`): a **one-line 16px semibold
  title**, the **✕** at the right, a **tapered line** under the header. Every popup has the
  ✕ and closes on Esc. Examples: Settings, Session Files, Git review.
- When the body scrolls, the content fades at the hidden edge; never a solid strip.
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
- Body text: 14px, main text colour.
- Hints, descriptions, dates and other secondary text: 12px in the one grey used for
  secondary text. The faintest grey is only for disabled things.
- Smallest text: **open question** — the app's smallest step is 10px (used for most hints);
  whether that stays or grows to 11px is Destin's call.
- A count beside a label or tab is the word then a smaller, fainter number: "Files 17". In a
  summary line it is a bold number then a grey word: "17 files". Never "(17)" and never a
  number in a bubble.

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
- **A text box with its own action** (a password's Set, a search's filter, send) keeps that
  action **inside the box, at the right, as a small filled button** — like the message box.
- **A follow-up action under a group** ("Back up all now") is a **full-width outlined
  button**. Never underlined text as a button; underlined text is only a link inside a
  sentence.
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
- **Anything that folds open** (a log, advanced options, details) is a **boxed row like a
  setting, arrow on the right**. One fold-out style everywhere.
- **"I understand" before a risky action:** the whole line is a tappable box, tick box on
  the left, lighting up when ticked; the action stays disabled until it is ticked.

### Cards
- Anything you open, install or pick from a grid is a **raised card**: panel colour, thin
  border, a **medium shadow**, the theme's card corner, 12px between cards. Reference: Your
  Library.
- **Text order:** name with its status on the top line → **one row of chips right under the
  name** for the short facts about it (who made it, what kind, numbers) → the description
  (two lines at most).
- The chip row **never wraps**: one line that fades out at its end.
- **Quick actions on a card** (tag, note, favourite) sit at its **top right**; a **date** goes
  at the **bottom right**, at the end of the details line. Example: conversation cards.

### Lists and menus
- **Settings-style lists** (each row opens or changes a setting): **boxed rows** — each row a
  soft tinted box with a small gap. Reference: the Settings list.
- **Pick-one menus and switchers** (right-click menu, session list): **plain rows** — no box,
  no line; hover highlights; the selected row always looks different from a hovered one.

### Status and notices
- A status label is a **small tinted pill in its status colour, normal case** ("Installed").
  A live status (a session Working / Inactive) carries its **coloured dot inside the pill**.
- **Every warning, error or info notice is the one tinted box with a matching border**
  (Reference: Backup & Sync → "conversations too big to sync"). Its text is the normal grey
  and black; only the box and its title carry the colour — **never red or coloured body
  text, never a coloured strip**.
- A notice **about one thing sits inside that thing** — inside the setting's or the list
  item's own box — and **its buttons (Try again, Resume, Show details) go inside the notice,
  at the right**.
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

- [ ] Two or three existing screens that do the same job were used as references, and are
      named when showing the work.
- [ ] Every element matches a recipe here and is built from its shared piece; nothing invented.
- [ ] Checked in its hard states too: error, empty, loading, very long text.
- [ ] No hard-coded colour, pill or corner size; theme colours and shape only.
- [ ] No spaced-out capitals; headings from the three levels.
- [ ] Actions on the right; one filled button; nothing filled alone at the bottom-left.
- [ ] Spacing from the scale; no box inside a box.
- [ ] Popups have the ✕ and close on Esc.
- [ ] Checked in light, a dark theme, a wallpaper theme and at 390px wide.
- [ ] Shown to Destin as pictures of the real screen, not described in words.
