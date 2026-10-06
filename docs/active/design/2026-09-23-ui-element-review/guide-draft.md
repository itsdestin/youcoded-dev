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
   text — not a word, not a label, not a notice's title. Corner roundness comes from the theme's shape setting — never write a fixed pill
   or pixel radius on a control.
3. **Quiet by default.** Small grey labels in normal case. Show what the user needs to act
   on; drop details nobody asked for and options or information that would confuse someone
   who has never seen the app or used its features. Headers are one line.
4. **Three heading levels, no more.** If a screen seems to need a fourth, it needs fewer
   sections.
5. **Cards for things, rows for lists, styled by level.** Something you open or install (a
   plugin, a Page, a file) is a raised card. A list you read or pick from (settings, a menu)
   is rows. Inside a popup, every card at the same depth looks the same (see Card levels) —
   a card that holds one idea keeps it together; never split one idea into separate boxes.
6. **Actions live on the right.** One filled button per view — except a list whose rows each
   carry their own main action, where each row's is filled (see Buttons). A filled button, switch
   or selection never sits alone at the bottom-left — only when balanced by something on the
   right of the same line.
7. **Tight, even spacing** from one scale (below).
8. **Every theme, every width.** Check light, a dark theme, a wallpaper theme and 390px
   phone width before showing anyone.

## Recipes

### Full screens (Projects, Pages, Marketplace, Library)
- The screen names itself **centered in the window's top strip, small (14px medium), with
  its icon**. Reference: Pages or the Projects view.
- The way out is a **filled small button reading "Esc · Back to chat"**, top right.
- In framed themes every pane (chat, side pane, full-screen pane) has a **thin outline in the
  card-outline colour** where it meets the frame.
- Big groups on the screen use the *Large* heading, one row per group: heading left (a one-line
  description under it, never beside it), its tools right. Lists scroll under a see-through
  fade at both edges, tall enough to fade a whole card edge.

### Popups and side panels
- Every popup and side panel uses the shared popup (`Dialog`): a **one-line 16px semibold
  title**, the **✕** at the right, a **tapered line** under the header. Every popup has the
  ✕ and closes on Esc. Examples: Settings, Session Files, Git review.
- The close control is always the ✕ — never the words "Esc" or "Close". Quick pickers (the project switcher) follow the same shell: a title and the ✕.
- When the body scrolls, the content fades at the hidden edge; never a solid strip.
- **Narrow** popups are up to 420px wide (confirmations, Sound, Create a page); **wide**
  popups are larger.

### Headings
| Level | Use | Style |
|---|---|---|
| Large | Big groups on a full screen ("Recent conversations", "Favorites") | 16px medium, main text colour |
| Title | A popup or side panel's name | 16px semibold (above) |
| Small label | A group inside a screen, popup or list ("Volume", "Privacy") | 12px medium, grey, normal case, no letter-spacing |

A small label heading a **section of reading text** (About's "Disclaimer") also gets a soft
underline under its words. Labels over short settings groups stay plain.

### Text and numbers
- Body text: 14px, main text colour.
- Hints, descriptions, dates and other secondary text: 12px in the one grey used for
  secondary text. The faintest grey is only for disabled things.
- **Nothing a user has to read is smaller than 11px.** (The app's 10px step becomes 11px.)
- A count beside a label or tab is the word then a smaller, fainter number: "Files 17". In a
  summary line it is a bold number then a grey word: "17 files". Never "(17)" and never a
  number in a bubble.

### Spacing
- One scale: **4 · 8 · 12 · 16 · 24 px.** 4 between an icon and its label; 8 between
  things inside a card; 12 inside a card's edge and between cards; 16 between groups; 24
  for major breaks.
- In popups: **16px between groups, 8px between neighbouring boxes or rows** (the Settings list's gap).
- **Nothing sits bare on the popup background.** A group is a small label and then a card holding its
  controls and text. Reference: Remote Access.
- **A label comes first.** A popup never opens straight into a card: a small label sits above the first
  card, and once one card has a label, every card on that page does (otherwise the next card reads as
  filed under the one above). A label never repeats the popup's title. Exceptions: a small popup holding
  a single card (Buddy), short yes/no confirmations, popups that open on a warning, **the card about the
  popup's own subject** at its top (Session details' name card, a detail page's top card), and **a
  picture of the item** (a theme's preview) — no label could say more than the title or the picture
  (decisions "Theme detail page").

### Buttons
- **Text and buttons in one box:** text on the left and buttons on the right **on one line** when they
  fit. When they must stack, the buttons go **full width** (side by side, sharing the width) — never
  pushed to the right under the text.
- Shape follows the theme's control roundness (built-in themes: Round, 14px).
- **Main action:** filled. **Everything less important beside it** (Cancel, Preview, Not
  now, Dismiss): **outlined**, never bare text.
- **One button:** any lone button is full width, unless it fits on one line beside its text — then it
  sits at the right of that line (decisions "Marketplace detail — lone Uninstall", NB-2).
- **Two buttons, side by side** (wide popups, chat messages): the **filled one on the right**,
  the outlined one directly left of it, both hugging their labels at the right edge.
- **Two buttons, stacked** (narrow popups and phone width): full width, **filled on top**. "Narrow" is
  the space the buttons sit in, not only the popup: a ~250px column inside a wide popup stacks too
  (decisions "Theme detail page").
- **Destructive confirm:** the red button takes the main action's place — on the right when
  side by side, on top when stacked.
- **One filled button per view, or one per row in a list of actions.** When every row of a list has
  its own main action (Challenge a friend, Accept a request), that action is **filled, at the right of
  its row**, and anything beside it is outlined (Decline, left of Accept). The row rule wins over "one
  filled button per view" there; everything else on the page follows the normal rule. (Destin:
  games-social-2#G2-8 "challenge button should be dark", games-social-1#GS-3 "accept should be on the
  right"; decisions "Games: game pages", "Games: friend rows and list".)
- Close is always the ✕ button, never a letter or the word.
- **A text box with its own action** (a password's Set, a search's filter, send) keeps that
  action **inside the box, at the right, as a small filled button** — like the message box.
- **A follow-up action under a group** ("Back up all now") is a **full-width outlined
  button**. Never underlined text as a button; underlined text is only a link inside a
  sentence.
- Switching views or filters uses the shared tab strip and filter chips, following the same
  roundness.
- **An edit button for a list is shaped like the things it edits** (the status bar's, quick
  chips', tags'): a pill among pills, a chip among chips. A "+ New" button among tags is a tag-
  shaped pill, dashed so it never reads as a tag. One deliberate exception: the New tag box's
  Cancel is red.

### Settings
- **Small controls (switches) sit beside** the setting's title and hint, on the right, **vertically centred**.
  Only a long explanation (a big block, like Performance's) puts the title and switch on one line with the
  text full width below.
  **Wide controls (text boxes, sets of choices) go below** the title and hint, full width.
- Offering choices: 2–4 short choices → a tab strip; many choices or long names → a
  dropdown; choices that each need an explanation → a boxed list.
- **Groups keep their card:** a group that is one idea (sync, "Models") is one first-level
  card, with its rows, notices and buttons inside it. Follow Card levels below.
- Rows use the shared setting row: title, hint under it in the left column, control at the
  right.
- **Anything that folds open** (a log, advanced options, details) is a **boxed row like a
  setting, arrow on the right**. One fold-out style everywhere.
- **"I understand" before a risky action:** the whole line is a tappable box, tick box on
  the left, lighting up when ticked; the action stays disabled until it is ticked.

### Card levels (inside popups and side panels)
Every card is styled **by how deep it sits**, never by which screen it is on. Reference:
Settings → Backup & Sync, Assistant → General, Account.
- **First level** — a card sitting on the popup: the shared see-through glass card with a
  thin outline (`CARD_LEVEL_1`). Every first-level card in every popup looks the same.
- **Second level** — anything boxed inside a first-level card (a device list, a text box, a
  picker, a fold-out row): one shared nested look (`CARD_LEVEL_2`, the field surface). All
  second-level boxes look the same.
- **A nested box looks the same in every state.** Its state (healthy, failing) is shown by its status
  light, not by tinting the box.
- **Notices** keep their own tint at any level; **buttons** look the same everywhere, and
  nothing that isn't a button looks like one.
- **A card's own header row** (its title, hint and switch) sits in the card with no box of its
  own — a boxed header inside a card reads as a card in a card.
- **Text that describes a card lives inside it.** No loose lines between cards.
- **No line crosses the full width** of a card or popup. Separate with spacing; a divider, if
  one is needed, is the tapered line.
- **Lists of short names** (saved devices) are plain rows inside **one** shared box, not a box
  each.
- 16px between first-level cards; 12px inside a card's edge.
- **The outline is what separates layers.** A card's fill is only a shade off what it sits on,
  in every theme, so every card and nested box carries the shared card outline — visible on
  any theme, and always weaker than a button's outline so a card never reads as a button.
  Never rely on fill alone, and never use the theme's faint outline for a card.
- A box built as a first-level card that ends up inside another card **takes the nested look
  automatically** — pick by meaning, the level follows from where it sits.

### Cards
- Anything you open, install or pick from a grid is a **raised card**: panel colour, thin
  border, a **medium shadow**, the theme's card corner, 12px between cards. Reference: Your
  Library.
- **Text order:** name with its status on the top line → **one row of chips right under the
  name** for the short facts about it (who made it, what kind, numbers) → the description
  (two lines at most).
- The chip row **never wraps**: one line that **scrolls sideways** when it does not fit, fading only at
  the edge that has more, with no scrollbar. Leave room inside its scroll edge so a chip's border is never
  cut (it showed only at 1.5×). Every chip in a row is **the one fact chip** (`Chip` in
  `components/ui/`) — one size; never mix it with `Badge` or a hand-made chip. (Refines G-9; decisions
  "Detail chips: one size, one row that scrolls".)
- **Quick actions on a card** (tag, note, favourite) sit at its **top right**; a **date** goes
  at the **bottom right**, at the end of the details line. Example: conversation cards.

### Detail pages (something you open from a card: a plugin, a theme, an integration)
Reference: the Marketplace detail pages; Session details for the top card. (Decisions "Marketplace
detail pages — shell" and the rows after it.)
- The shared popup, **titled by kind**: "Plugin details", "Theme details" — the item's name is in the
  top card, not the title.
- **The top card** is the subject (no label above it): name with its status pill, quick actions at its
  top right, the one chip row, the description, then any notice about the item and its buttons — all
  inside the card.
- **Two columns** in the wide popup: the reading (About, What's inside, Feedback, Comments) on the left,
  short facts (What this can do, Source) on the right; one column at phone width. Each group is a small
  label and one card.
- **An icon with a title, description and buttons lines up in one row** on one centre line — icon |
  title + description | buttons — like the shared setting row and the Account profile card.
- A **picture of the item** (a theme's preview) is a card with no label; beside it the top card and the
  facts stack on the right.
- Show a state only once: no "Installed" pill where the buttons already say so (themes); a number that
  changes when you click (likes) is a chip that moves at once.

### A panel at the top of a side pane (Games → Friends)
Reference: the Games friends card; Settings → Account's profile row for its header; Appearance's
themes box for its opened list. (Decisions "Games: signed-out card", "Games: friends card", "Games:
friend rows and list", "Games: managing a friend".)
- A small label above it, then **one first-level card**, at the top of the pane with the pane's own
  content (the games) below.
- **Folded by default**, every time the pane opens, to **one header row like Account's profile row**:
  the name with its clickable status pill, one grey summary line under it ("2 of 4 friends online · 1
  request"), the fold arrow at the right. No title inside the card — the label above already says it.
- **Opened**, it shows a **height-capped list that scrolls** under the see-through fade: one boxed row
  per item (the Settings list's look, which takes the nested look inside the card), and the list's
  **main action pinned inside it at the bottom, full width and filled**, the rows passing under it.
- Managing one item is **a click on its row**, opening a small "… details" popup (Session details'
  shape) — no ⋯ menus or edit modes inside the list.
- Its other states sit in the same spot under the same label: signed out → Account's sign-in card;
  when it cannot work → the notice box replaces the card (Status and notices).

### Lists and menus
- **Settings-style lists** (each row opens or changes a setting): **boxed rows** — each row a
  soft tinted box with a small gap. Reference: the Settings list.
- **Pick-one menus and switchers** (right-click menu, session list): **plain rows** — no box,
  no line; hover highlights; the selected row always looks different from a hovered one.
- **A few choices dropping from a pill or an icon** (your status in Games, your account in the
  Marketplace) use the **shared small menu** (`Menu` in `components/ui/`): it hangs under its
  trigger, closes on a click outside or Escape, and works with the arrow keys. Never a hand-made
  popover.

### Status and notices
- A status label is a **small tinted pill in its status colour, normal case** ("Installed").
  A live status (a session Working / Inactive) carries its **coloured dot inside the pill**,
  centred on the line of the name beside it.
- **Every warning, error or info notice is the one tinted box with a matching border**
  (Reference: Backup & Sync → "conversations too big to sync"). **Only the box — its tint and
  border — carries the colour.** Its title and text are the normal text colours: **never a red
  or coloured title, never red or coloured body text, never a coloured strip.** Most notices need
  no title at all: one plain sentence says it. (Decisions "Error notices: no red titles,
  app-wide", games-social-3#G3-7; the shared notice box enforces it, pinned by
  `callout-authority.test.tsx`.)
- **A problem replaces the card it is about.** When a whole card cannot work (no internet, the
  server unreachable), **the card becomes the notice box** — same spot, same label above it — with
  one plain sentence and its Try again inside, and no title. Never a changed line or a notice tucked
  inside a card that cannot work. Reference: Games → Friends while offline. (Decisions "Games:
  connection states"; games-social-2#G2-5 "just replace the whole card with the error state",
  games-social-3#G3-7.)
- A notice **about one thing sits inside that thing** — inside the setting's or the list
  item's own box — and **its buttons (Try again, Resume, Show details) go inside the notice,
  at the right**.
- A **short error line** under a field or on an item is the notice box in miniature: one line
  of normal grey text in a small red-tinted box with a red border. Never red text.
- Errors follow `docs/error-message-standards.md`.

### Empty states
Two different jobs, two looks:
- **First time, or nothing exists yet** (a surface never used, e.g. Pages): a **card** with a short
  explanation and **one full-width filled button**.
- **Nothing picked yet** (a preview pane waiting for a choice, e.g. Resume): **one quiet grey line**, no button.

### Sign-in and setup screens
When several equal ways in exist (Claude, ChatGPT, OpenRouter, a local model, a key), show them as
**equal outlined choices**, none filled. Each provider choice carries its **provider logo**
(`ProviderIcon`) — the app already uses these logos in the model picker, Resume cards and status bar.

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
- [ ] Actions on the right; one filled button (one per row in a list of actions); nothing filled
      alone at the bottom-left.
- [ ] Spacing from the scale; cards styled by level; no loose text; no full-width lines.
- [ ] Popups have the ✕ and close on Esc.
- [ ] Checked in light, a dark theme, a wallpaper theme and at 390px wide.
- [ ] Shown to Destin as pictures of the real screen, not described in words.
