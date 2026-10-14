---
status: active
approval: approved by Destin on the final-review deck (final-review#Q-1, 2026-10-14), with the light Back-to-chat button (final-review#FV-6)
date: 2026-10-13
owner: Destin (decisions) / Claude (writing)
replaces: docs/archive/design/2026-08-25-ui-design-guide.md
source: docs/active/design/2026-09-23-ui-element-review/decisions.md (every rule's decision); guide-draft.md beside it (the working draft this finishes)
---

# YouCoded design guide

**Read this before you design any screen, popup, panel or Page.** It tells you how YouCoded
looks and how it is arranged, so something new fits without Destin having to correct it. Every
rule comes from a decision Destin made comparing real screens side by side;
`2026-09-23-ui-element-review/decisions.md` names the source of each (cited here as
`<deck>#<step>` or the decisions row's topic). Where a rule names a screen, open it as the
example: copy the look, not blindly the code.

Sections marked **"documents current behaviour; not yet reviewed by Destin"** describe how part
of the app works today. They are not rules Destin chose. Follow the general rules there too; where
today's app breaks one, the section lists it under *Known deviations* — do not copy a deviation.

## How to use this guide

1. Name the job: "a popup with a main action", "a list of settings", "a card for something you can
   install".
2. **Before designing anything, find two or three places in the app that already do the same job**
   (or the closest one) and open them. Use them as your reference for the feel — spacing, weight,
   how busy it is — and name them when you show your work. Prefer the examples this guide names; if
   two references disagree, the guide decides.
3. Find that job's recipe below. Build it from the shared piece the recipe names
   (`youcoded/desktop/src/renderer/components/ui/`), and copy its order and placement.
4. If no recipe fits, or the job is one of the *Open questions* at the end, stop and ask Destin.
   Do not invent a look.

**Rules, not examples.** Each recipe is a general rule for a *kind* of job; the screens it names are
illustrations, not the limit of where it applies. Exact sizes live in the shared pieces, not here —
use the piece and you get them. If a rule seems wrong for a new situation, ask rather than bending it
or copying one screen's quirk.

**The shared pieces** (`components/ui/`, imported from `../ui`). Pick by job:

| Job | Piece |
|---|---|
| Any button; the ✕ | `Button` (filled `primary`, outlined `secondary`, red `danger` / `danger-outline`); `CloseButton` |
| An on/off setting | `Toggle` in a `SettingRow` |
| One "I understand" tick | `ConsentRow` |
| 2–4 short choices / a view switch | `SegmentedTabs` |
| Many choices | `Select` (`TypeableSelect` when typing helps) |
| Choices that each need a line of explanation | `RadioGroup` |
| Ticking several items in a list | `Checkbox` |
| Text | `TextInput`, `Textarea`; an action inside the box: `InputGroup` |
| Search with filters | `SearchFilterPill`, `FilterChip` |
| A row with a control, or one that opens | `SettingRow` |
| Something that folds open | `FoldRow` |
| A value you drag | `Slider` |
| Progress of a known length (a download, an import) | `ProgressBar` |
| A status | `Pill` (`PillButton` when clicking it opens a menu) |
| A fact in a chip row | `Chip` |
| A notice | `Callout` (`compact` for the slim one-line box) |
| Loading, empty, error | `LoadingState`, `EmptyState`, `ErrorState`; a field's error `FieldError` |
| A short confirmation that goes away | `Toast` |
| An (i) explainer; a hover name | `AnchorTip`; `Tooltip` |
| A small menu under a control | `Menu` |
| A popup or side panel | `Dialog` (its `footer`, `onEnter` and back arrow) |
| A small label | `SectionLabel` |
| Cards inside a popup | `CARD_LEVEL_1`, `CARD_LEVEL_2` |
| A thin status band above the message box | `StatusStrip` |

A job none of these does needs a new shared piece and Destin's look for it — not a hand-made one.

## Principles

1. **Find the job first.** Every element has a job with a recipe below — "two buttons in a narrow
   popup" → Buttons; "a setting with a switch" → Settings. Copy the recipe exactly; if none fits, ask
   Destin for one instead of inventing a look.
2. **The theme paints and shapes everything.** Colours come from theme tokens. The fixed status hues
   (green, red, amber, blue) are the only exceptions, and they go **only in a tint** — a status pill,
   a notice box's tint and border, a status dot — **never in text**: not a word, not a number, not a
   label, not a notice's title (decisions "Error notices: no red titles", "Coloured warning in the
   model menu"; small-fixes-3#SF3-10). Corner roundness comes from the theme's shape setting — never
   write a fixed pill or pixel radius on a control.
3. **Quiet by default.** Small grey labels in sentence case. Show what the user needs to act on; drop
   details nobody asked for, and options or information that would confuse someone who has never seen
   the app or used its features. Headers are one line.
4. **Three heading levels, no more.** If a screen seems to need a fourth, it needs fewer sections.
5. **Cards for things, rows for lists, styled by level.** Something you open or install (a plugin, a
   Page, a file) is a raised card. A list you read or pick from (settings, a menu) is rows. Inside a
   popup, every card at the same depth looks the same (see Card levels) — a card that holds one idea
   keeps it together; never split one idea into separate boxes.
6. **Actions live on the right — or span the full width.** At most one filled button per view — except a list whose rows each carry
   their own main action, where each row's is filled (see Buttons). A filled button, switch or
   selection never sits alone at the bottom-left — only when balanced by something on the right of
   the same line.
7. **Tight, even spacing** from one scale (below).
8. **Every theme, every width.** Check light, a dark theme, a wallpaper theme and 390px phone width
   before showing anyone.

## Recipes

### Full screens (Projects, Pages, Marketplace, Library)
- The screen names itself **centred in the window's top strip, small (14px medium), with its icon**.
  Reference: Pages or the Projects view.
- The way out is a **filled small button reading "Esc · Back to chat"**, top right (the key first).
- In framed themes every pane (chat, side pane, full-screen pane) has a **thin outline in the
  card-outline colour** where it meets the frame; floating layouts have none.
- Big groups on the screen use the *Large* heading, one row per group: heading left (a one-line
  description under it, never beside it), its tools right. Every tab of a screen opens with the same
  heading row (the Projects view's tabs). Lists scroll under a see-through fade at both edges, tall
  enough to fade a whole card edge.
- Known deviation: **at phone width the band shows no title** — only the lit Pages or Projects
  button says where you are, and pinned pages hide (they stay in Pages). Three columns could not
  hold both button clusters, the title and "Back to chat" at 390px; they drew over each other.

### Popups and side panels
- Every popup and side panel uses the shared popup (`Dialog`): a **one-line 16px semibold title**, the
  **✕** at the right, a **tapered line** under the header in the card-outline colour. Every popup has
  the ✕ and closes on Esc. Examples: Settings, Session details, Close session. (The Session Files pane
and Git review inside it are still hand-built — see their sections below.)
- The close control is always the ✕ — never the words "Esc" or "Close", never a × letter.
- **A page inside a popup** (an edit page, a step of a flow) uses the shared popup's **back arrow**
  beside the title; Escape still closes the whole popup from any page (decisions "Quick chips
  editor").
- **A quick picker** (jump to something by typing — the project switcher) keeps its own **palette
  shell, not the titled popup**: a search row with the ✕ at its right (no title), a small label
  ("Recent"), plain rows (Lists and menus), and its add or manage action as a **centred last row** with
  no icon ("+ Add a project", "Manage projects…"). The list alone scrolls, under the masked fade at the
  edge that has more; the search row and the last row stay put. (Decisions "Project switcher:
  container", "Manage rows in pickers".)
- **A small menu anchored to a control** (the model picker above the status bar's model chip) is a
  menu, not a centred popup (Lists and menus).
- When the body scrolls, the content fades at the hidden edge, **evenly across the whole width**;
  never a solid strip, never an unfaded side strip (decisions "Popup scroll fade").
- **Narrow** popups are up to 420px wide (confirmations, Sound, Create a page); **wide** popups are
  larger. At phone width a popup stays a popup, as wide as the screen allows (old guide §4.8).
- **Settings save as you change them.** A settings popup has no Save, no Done and no footer: closing it
  keeps what you set (old guide §4.3). A footer is only for a decision to confirm.
- **A popup's own buttons that must stay in view** (a long body above them) go in the shared popup's
  **footer**: pinned under the body, which scrolls and fades see-through where it meets them — no line
  between them. Never a hand-made scroll area with its buttons under it (Close session, Close window,
  Update available, Unsaved changes before quit).
- **Enter does the popup's main action** only through the shared popup (`onEnter`): it never fires while
  the keyboard is on a button, switch, tag or text box (those keep their own Enter), nor while another
  popup sits on top. A destructive main action (Close window, Discard) takes a click, not Enter.
- **While any popup is open, Enter belongs to the popup**: the chat's permission, question and prompt
  cards ignore Enter (and their arrow and number keys), and so does the message box. With no popup
  open nothing changes (decisions "Enter while a popup is open").
- **A popup whose job is an action but that also edits** (Close session; the same for send or resume):
  its editing cards are **open** when it opens — the same cards as where you edit it elsewhere, never a
  summary that swaps into a second form — and **nothing it edits is saved until the action**; the ✕
  leaves everything as it was (close-session-1#CS-2).
- **"Don't ask again"** on a popup that asks every time: a switch with its words, **bottom-left on the
  footer line**, balanced by the main button at the right (principle 6). The same choice lives in
  Settings so it can be turned back on (Close session: Settings → Assistant → General → "Close-session
  prompt").

### Headings
| Level | Use | Style |
|---|---|---|
| Large | Big groups on a full screen ("Recent conversations", "Favorites") | 16px medium, main text colour |
| Title | A popup or side panel's name | 16px semibold (above) |
| Small label | A group inside a screen, popup or list ("Volume", "Privacy") | 12px medium, grey, sentence case, no letter-spacing (`SectionLabel`) |

A small label heading a **section of reading text** (About's "Disclaimer") also gets a soft underline
under its words (`SectionLabel reading`). Labels over short settings groups stay plain.

### Text and numbers
- Body text: 14px, main text colour.
- Hints, descriptions, dates and other secondary text: 12px in the one grey used for secondary text —
  except a setting row's hint, which the shared `SettingRow` draws at 11px (both its sizes).
  The faintest grey is only for disabled things and decoration.
- **Nothing a user has to read is smaller than 11px** — the status bar included.
- **Sentence case everywhere**: every label, title, button, menu item, hint and screen-reader name
  ("Skip permissions", "Launch in new window"). Kept capitalised: product and brand names, skill and
  theme names, Fast mode, the status bar's all-caps mode badges, "YouCoded Remote" (decisions
  "Sentence case everywhere"). **No spaced-out capitals** anywhere.
- A count beside a label or tab is the word then a smaller, fainter number: "Files 17". In a summary
  line it is a bold number then a grey word: "17 files". Never "(17)" and never a number in a bubble.
- **Say what happens on the user's computer, not how it works.** A developer action is named by its
  effect — "downloads YouCoded's code (about 1 GB, the first time)", "opens a new conversation" —
  never by its mechanism ("a working copy", "set up a development workspace"). Size and time come with
  any download.
- **A button names what it does.** "Keep editing", not "OK", which could read as "OK, quit"
  (close-session-6#CS6-4).
- **Every retry button reads exactly "Try again"** — no "Retry", no "Try again now", no "Try installing
  again", no failure words in the button. The failure is a plain sentence in the notice box beside it.
  Still fine: a countdown ("Trying again in 5s…") and "try again" inside a sentence
  (small-fixes-1#SF-1, error-notices-1#EN-Q1).
- **A control that exists on one platform says which**: "Remove KDE helper" (nothing-bare-3#N3-3).

### Spacing
- One scale: **4 · 8 · 12 · 16 · 24 px.** 4 between an icon and its label; 8 between things inside a
  card; 12 inside a card's edge; 16 between groups; 24 for major breaks.
- In popups: **16px between groups, 8px between neighbouring boxes or rows** (the Settings list's gap,
  which is also the gap from the header line to its first row). Two first-level cards side by side
  or one under another are two groups, so **16px wins between first-level cards**; 8px is for boxes
  and rows inside one card or one list.
- **Nothing sits bare on the popup background.** A group is a small label and then a card holding its
  controls and text. Reference: Remote Access.
- **A label comes first.** A popup never opens straight into a card: a small label sits above the first
  card, and once one card has a label, every card on that page does (otherwise the next card reads as
  filed under the one above) — a card of switches too: Pin to top and Mark complete got their own label,
  "In your lists", rather than sitting under Tags (close-session-2#CS2-2, #CS2-5). A label never repeats
  the popup's title. Exceptions: a small popup holding a single card (Buddy), short yes/no
  confirmations, popups that open on a warning, **the card about the popup's own subject** at its top
  (Session details' name card, a detail page's top card), and **a picture of the item** (a theme's
  preview).

### Buttons
- **Text and buttons in one box:** text on the left and buttons on the right **on one line** when they
  fit. When they must stack, the buttons go **full width** (side by side, sharing the width) — never
  pushed to the right under the text.
- Shape follows the theme's control roundness (built-in themes: Round, 14px).
- **Main action:** filled — and only when there is one; a card of settings may have no filled button
  at all. **An action that only opens more** ("See full history", "Manage…") is outlined.
  **Everything less important beside it** (Cancel, Preview, Not now, Dismiss):
  **outlined** with the full-strength outline, never bare text.
- **One button:** any lone button is full width, unless it fits on one line beside its text — then it
  sits at the right of that line.
- **Two buttons, side by side** (wide popups, chat messages): the **filled one on the right**, the
  outlined one directly left of it, both hugging their labels at the right edge. A chat question card
  is the same: outlined Dismiss directly left of filled Submit.
- **Two buttons, stacked** (narrow popups and phone width): full width, **filled on top** — so the way
  back (Back, Back to draft) is the outlined one under it. "Narrow" is
  the space the buttons sit in, not only the popup: a ~250px column inside a wide popup stacks too.
- **Destructive confirm:** the red button takes the main action's place — on the right when side by
  side, on top when stacked.
- **An edit page's delete** sits **far left, red**, balanced by Cancel then Save at the right of the same
  line (the quick-chip edit page, a tag's edit box; decisions "Quick chips editor", "Tag actions menu").
- **One filled button per view, or one per row in a list of actions.** When every row of a list has its
  own main action (Challenge a friend, Accept a request), that action is **filled, at the right of its
  row**, and anything beside it is outlined (Decline, left of Accept). Everything else on the page
  follows the normal rule.
- **A disabled control says why**, within reach: a line beside it or under it (the ticket's "the reason
  the main button is grey", the greyed games "still saying why"). **Never a button that does nothing**
  ("Coming soon"); when something is unavailable, its status pill says so (decisions "Integration detail
  page").
- Close is always the ✕ button, never a letter or the word.
- **A text box with its own action** (a password's Set, a search's filter, send) keeps that action
  **inside the box, at the right, as a small filled button** — like the message box.
- **A plain multi-line field** (a note, a description, a ticket's text) is the shared text box at its
  standard size: full width, upright words, **three lines to start**, growing as you write. What you
  saved may show differently (a note in quotes and italics); the box you type in never does. Never
  pre-fill what the user is meant to write (decisions "Ticket: error details").
- **A follow-up action under a group** ("Back up all now") is a **full-width outlined button**. Never
  underlined text as a button; underlined text is only a link inside a sentence.
- Switching views or filters uses the shared tab strip and filter chips, following the same roundness.
- **An edit button for a list is shaped like the things it edits** (the status bar's, quick chips',
  tags'): a pill among pills, a chip among chips. A "+ New" button among tags is a tag-shaped pill,
  dashed so it never reads as a tag. One deliberate exception: the New tag box's Cancel is red.

### Settings
- **Small controls (switches) sit beside** the setting's title and hint, on the right, **vertically
  centred**. Only a long explanation (a big block, like Performance's) puts the title and switch on one
  line with the text full width below. **Wide controls (text boxes, sets of choices) go below** the
  title and hint, full width.
- Offering choices: 2–4 short choices → a tab strip; many choices or long names → a dropdown; choices
  that each need an explanation → a boxed list. A picker that may be left empty lists "No selection"
  first.
- **Groups keep their card:** a group that is one idea (sync, "Models") is one first-level card, with its
  rows, notices and buttons inside it. Follow Card levels below.
- Rows use the shared setting row (`SettingRow`): title, hint under it in the left column, control at
  the right.
- **Anything that folds open** (a log, advanced options, details) is the shared fold (`FoldRow`): a
  **boxed row like a setting, arrow on the right**. One fold-out style everywhere.
- **A folded box opens inside itself.** What it reveals appears within the same box, under its header
  row — never as a separate card or loose text below it. Example: the ticket review's Optional AI help.
- **Pointing at a folded box lights the whole box** — its own rounded shape, open or closed — never a
  strip across its header that ends in a hard line. The shared fold does it; a hand-built one is moved
  onto it.
- **A slider is the shared `Slider`**: a thick round track, the accent fill from its start to a round
  handle, the fill's end curving around the handle so the two read as one shape (Home Assistant's light
  slider). Its value sits at the right in small grey text. Never the browser's own thin slider.
  Reference: Settings → Sound → Volume; Appearance → Fine-tune glass.
- **Choosing what goes with something** (the details a ticket carries, what a download includes): one
  setting row per choice, **its switch at the right**, and **a plain line under the title saying what
  turning it on adds** — no (i) to explain it. **A choice that does not apply is not shown** (no error to
  attach → no error row). Reference: Submit a ticket → "Include with ticket".
- **"I understand" before a risky action** (`ConsentRow`): the whole line is a tappable box, tick box on
  the left, lighting up when ticked; the action stays disabled until it is ticked.

### Card levels (inside popups and side panels)
Every card is styled **by how deep it sits**, never by which screen it is on. Reference: Settings →
Backup & sync, Assistant → General, Account.
- **First level** — a card sitting on the popup: the shared see-through glass card with a thin outline
  (`CARD_LEVEL_1`). Every first-level card in every popup looks the same.
- **Second level** — anything boxed inside a first-level card (a device list, a text box, a picker, a
  fold-out row): one shared nested look (`CARD_LEVEL_2`, the field surface). All second-level boxes look
  the same.
- **A nested box looks the same in every state.** Its state (healthy, failing) is shown by its status
  light or pill, not by tinting the box.
- **Notices** keep their own tint at any level; **buttons** look the same everywhere, and nothing that
  isn't a button looks like one.
- **A card's own header row** (its title, hint and switch) sits in the card with no box of its own — a
  boxed header inside a card reads as a card in a card.
- **Text that describes a card lives inside it.** No loose lines between cards.
- **A control inside a card keeps the card's margins.** A full-width button or text box spans the card
  edge to edge inside its padding, the same space left and right — never pulled into the margin to line
  its words up with text above (Session details' "+ Add a note" and note box, the Projects description
  box). Only read-only text may hang to line its words up.
- **A short list of separate facts may sit in a card** as plain bullet points — three or four short
  lines, each one fact, no buttons in them (Contribute's "what happens" list). Longer reading stays
  paragraphs; anything you act on stays rows.
- **No line crosses the full width** of a card or popup. Separate with spacing; a divider, if one is
  needed, is the tapered line.
- **Lists of short names** (saved devices) are plain rows inside **one** shared box, not a box each.
- 16px between first-level cards; 12px inside a card's edge.
- **The outline is what separates layers.** A card's fill is only a shade off what it sits on, in every
  theme, so every card and nested box carries the shared card outline — visible on any theme, and always
  weaker than a button's outline so a card never reads as a button. Never rely on fill alone, and never
  use the theme's faint outline for a card.
- A box built as a first-level card that ends up inside another card **takes the nested look
  automatically** — pick by meaning, the level follows from where it sits.

### Cards
- Anything you open, install or pick from a grid is a **raised card**: panel colour, thin border, a
  **medium shadow**, the theme's card corner, 12px between cards. Reference: Your Library.
- **Text order:** name with its status on the top line → **one row of chips right under the name** for
  the short facts about it (who made it, what kind, numbers) → the description (two lines at most).
- The chip row **never wraps**: one line that **scrolls sideways** when it does not fit, fading only at
  the edge that has more, with no scrollbar. Leave room inside its scroll edge so a chip's border is
  never cut. Every chip in a row is **the one fact chip** (`Chip`; the decisions call it MetaChip) — one size; never mix it with `Badge`
  or a hand-made chip.
- **Quick actions on a card** (tag, note, favourite, pin) sit at its **top right**; a **date** goes at
  the **bottom right**, at the end of the details line. Example: conversation cards.

Known deviations (built 2026-10-13 from the final review; the rest of this recipe is built):
- **Marketplace rail cards keep a tighter shadow** (`0 3px 10px`, `globals.css` `.mp-rail-scroll`):
  a row that scrolls sideways clips anything taller than its own box, and the medium shadow
  would need about 24px more room between rails.
- **Project files' folder cards stay flat** (`FilesTab.tsx`): the folder is a tab and a body,
  two boxes, so a box shadow would draw a seam across the tab; a single drop-shadow filter on a
  grid of folders costs paint on every frame (`.claude/rules/performance.md`).
- **Games' tiles and Settings cards are not raised**: they follow the later Card levels rule
  (the glass first-level card), which replaced the raised look inside popups and side panes.

### Tags
Reference: Session details' Tags card. (Decisions "Tag look", "Tag actions menu", "Tags & note → Session
details".)
- Every tag is a **pill in the status pill's shape** with a **filled tag icon in its colour**; the word
  stays the normal text colour.
- A tag's × or + is a small round button sized to its pill.
- Three or more tags in a list row collapse to **one stacked-icons button** that rolls out on hover.
- Clicking a tag where tags are edited opens its edit box **in place** (name, colour, archived; red
  Delete tag left, Cancel and Save right; Delete asks first). No "…" menu and no separate manage popup.

### Detail pages (something you open from a card: a plugin, a theme, an integration)
Reference: the Marketplace detail pages; Session details for the top card.
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
- **A failed install** is one notice box in the buttons' place: "<name> couldn't be installed." with
  Try again inside it, and the installer's own words under a **Details** fold (decisions "Failed install
  on a detail page").

### Writing something others will read, then sending it (a ticket, a post, a share)
Reference: Submit a ticket.
- **Draft:** a "Your ticket"-style card holding the kind (a tab strip, first), the fields, and at its
  foot **who will be able to read it** ("Tickets are public on GitHub, where anyone can read them"),
  joined by **the reason the main button is grey** when it is. Then the choices of what goes with it
  (Settings → "Choosing what goes with something"), then the one full-width main button ("Review
  ticket").
- **Review:** the item **as it will read** — not the draft's boxes again — in a top card: title with its
  kind pill, the text, the "will be public" line at its foot. Under a "Sent with it" label, one card:
  everything always sent (the app version) as a plain row, each chosen piece as a **folded row with a
  short summary** that opens inside itself to read or edit. Changing the words means going back a step.
- **Buttons:** the way back outlined, the send filled, side by side at the right in a wide popup,
  stacked (filled on top) at phone width. A failure takes their place (Status and notices).
- **While sending:** a single box with the spinner under the same label, replaced by the result.
- **After:** the card stays, tagged (Status and notices → "When an action finishes").

### A panel at the top of a side pane (Games → Friends)
Reference: the Games friends card; Settings → Account's profile row for its header; Appearance's themes
box for its opened list.
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
- Its other states sit in the same spot under the same label: signed out → Account's sign-in card (one
  line and a full-width filled Sign in); when it cannot work → the notice box replaces the card (Status
  and notices).

### Lists and menus
- **Settings-style lists** (each row opens or changes a setting): **boxed rows** — each row a soft
  tinted box with a small gap. Reference: the Settings list.
- **Pick-one menus and switchers** (right-click menu, session list): **plain rows** — no box, no line;
  hover highlights; the selected row always looks different from a hovered one.
- **The one you're in, in a switcher** (the project you are in): **no marker** — no check, pill, tint,
  edge bar or words. The highlight **rests on it** when the switcher opens, follows the pointer and the
  arrow keys, and **returns to it** when the pointer leaves the list; screen readers still hear it as
  current. One highlight at a time: never a second row lit by hover.
- **A row's own action** (remove) **appears where the pointer is**: only on the pointed or arrowed-to
  row, always on touch, **never on the resting highlight**. Hidden, it **takes no space**, so the row's
  pills and counts sit flush right. A remove is a bin, red on hover — never a ✕, which means close.
- **A few choices dropping from a pill or an icon** (your status in Games, your account in the
  Marketplace) use the **shared small menu** (`Menu`): it hangs under its trigger, closes on a click
  outside or Escape, and works with the arrow keys. Never a hand-made popover. A list's manage action
  is its last row ("Manage models…").
- A list that can grow long shows a fixed number of rows (the sessions menu shows about 6½, so the cut
  row says "there is more") and fades see-through at the edge that has more.

### Status and notices
- A status label is a **small tinted pill in its status colour, sentence case** (`Pill`: "Installed",
  "Needed"). Its words are the normal text colour. A live status (a session Working / Inactive, the
  local engine Running / Stopped, a friend Online / Offline) carries its **coloured dot inside the
  pill**, centred on the line of the name beside it.
- **Sync status words are one set**, wherever a project's sync shows: **Synced** (green), **Sync
  problem** (red), **Sync stopped** · **Sync off** · **Not synced** (grey) — a pill with its dot — and
  **Folder missing** (amber) for a project whose folder has moved. "Not synced", never "Only on this
  computer". The full sentence goes in the pill's hover title.
- **Not everything needs a status.** Where working is the normal case (a saved key on a provider card),
  show nothing when it works; a problem is **one slim notice box across the card's foot**, its short
  sentence and its fix buttons on one line (decisions "Status words and provider cards").
- **A state that is a warning about fit or size** ("This model may not fit in available memory") is a
  warning or danger status pill with normal words — never amber or red text.
- **A state shown as a number** (usage, context, cache reuse) keeps the number in the text colour, with
  a small status dot before it, or a bar under it, in the status colour. **An added / removed count**
  ("+12 / −3") is plain (decisions "Status colours out of words, app-wide"; small-fixes-3#SF3-10).
- **Every warning, error or info notice is the one tinted box with a matching border** (`Callout`;
  reference: Backup & sync → "conversations too big to sync"). **Only the box — its tint and border —
  carries the colour.** Its title and text are the normal text colours: never a red or coloured title,
  never coloured body text, never a coloured strip. Most notices need no title: one plain sentence says
  it. A one-sentence notice centres its words beside its buttons.
- **A problem replaces the card it is about.** When a whole card cannot work (no internet, the server
  unreachable), **the card becomes the notice box** — same spot, **same label above it** — with one plain
  sentence and its Try again inside (filled — it is the box's main action), and no title. Never a changed line or a notice tucked inside a card
  that cannot work. Reference: Games → Friends while offline.
- **A failed action replaces the buttons it came from.** When Send, Download, Install or Update fails,
  the notice box takes the buttons' place — **one plain sentence saying what happened and what still
  holds** ("Your draft is still here"), and its own buttons inside it (the way back outlined, Try again
  filled at the right). What the user wrote stays as it was. **Machine words** (an installer's or a
  server's raw message) go only under a **Details** fold inside the box, never in the sentence
  (decisions "Contribute: conversation won't open", "Failed install on a detail page"). Reference:
  Submit a ticket's failed send; Contribute's failed download.
- **"No internet" only when the computer reports no network** (amber); otherwise say the server could
  not be reached (red). Never guess the cause (`docs/error-message-standards.md`).
- **When an action finishes, keep its subject.** The card the action was about stays on screen, tagged
  with a status pill ("Submitted", "Not sent") and one line at its foot saying what happened; the
  next buttons sit where the action's were. While it runs, a single box with the spinner sits under the
  same label, and is replaced by that card. Reference: Submit a ticket after sending.
- **A setup flow that adds an item to a list ends on that list**, with the new item visible there (its
  row, and an error box under it if something went wrong). It has no separate "done" page. Reference:
  Add a backup closes onto Backup & sync (decisions "Add a backup: no Done page"; small-fixes-3#SF3-5).
- A notice **about one thing sits inside that thing** — inside the setting's or the list item's own box
  — and **its buttons (Try again, Resume, Show details) go inside the notice, at the right**. Inside a
  menu, card or setting it is the slim one-line box (`Callout compact`). A request waiting on the user
  (a specialist's permission ask) is the slim amber box inside its card, its words and buttons on one
  line; the card keeps its normal outline.
- A **short error line** under a field or on an item is the notice box in miniature (`FieldError`): one
  line of normal grey text in a small red-tinted box with a red border. Never red text.
- **An error with a button is built with `ErrorState`** (`components/ui/states.tsx`) — it draws this
  notice box (red tint, red border) with its buttons inside at the right; never hand-draw one. **Every
  error box has something to press**: Try again where trying again can help, Report bug where it can't;
  the first of them is filled, the rest outlined (`ErrorState` does this). **Which shape:** when you
  can say what went wrong ("Usage couldn't be loaded — the server didn't answer"), one plain sentence
  and Try again, no title; only when nothing is known is it a "we don't know why" error, which keeps a
  bold title (normal colour) and put Report bug / Diagnose on their own
  line at the bottom right. The box lines up with the content it sits in, and a failed list spans that
  list's width.
- Errors follow `docs/error-message-standards.md`: never invent a cause.

### Empty states
Two different jobs, two looks:
- **First time, or nothing exists yet** (a surface never used, e.g. Pages): a **card** with a short
  explanation and **one full-width filled button**.
- **Nothing picked yet** (a preview pane waiting for a choice, e.g. Resume): **one quiet grey line**, no
  button.

### First-run setup and sign-in
Reference: the first-run screens (`components/FirstRunView.tsx`, `components/first-run/`). (Decisions
"First-run setup look" … "Setup at every window size", "Sign-in choices".)
- **Setup is its own brand surface**, not a themed screen: the lavender gradient, the stacked name
  "youcoded" + "agents for everyone" with no icon, fixed above the middle on every step, and Outfit for
  all setup text. The browser sign-in pages (ChatGPT, OpenRouter) match it. Nothing else in the app
  copies this look.
- **Ways in of equal standing are equal outlined choices, none filled** — on setup, three rows (A plan
  you already pay for / Pay as you go / Free, on this computer) that each open their facts and logo
  buttons, with "‹ All options" back.
- **A choice between outside services carries the service's logo** (`ProviderIcon` for model
  providers). **A choice of where something goes** (backup destinations: Google Drive, iCloud) carries
  the service's logo too, like provider choices do (decisions "Add a backup: choose where";
  small-fixes-3#SF3-6).
- A setup failure is one card: the red mark, "Setup stopped" and one plain sentence naming what failed,
  a full-width Try again, the raw message under "Show details". The progress bar hides while stopped.
- Setup fits from 1920×1080 down to 800×600 without scrolling.
- **The first session screen** (after setup, no session yet): the mascot beside "Start your first
  session" (24px Outfit heading, a line under it), the wider new-session form, no Cancel, one "Start
  session" button (decisions "First session screen").

### Building a Page
Pages use the page kit's classes (`.yc-button`, `.yc-card`, `.yc-title`, `.yc-muted`…), which carry
these recipes; theme colour and shape reach the page automatically, and the kit's slider has the shared
slider's look. Follow this guide where a class leaves a choice open, and never restyle a kit class.

## Parts of the app documented as they are today

Each section below **documents current behaviour; not yet reviewed by Destin.** Read from source on
2026-10-13 (paths under `youcoded/desktop/src/renderer/` unless they start with `main/`). The general
rules above apply to each; a *Known deviation* is today's app breaking one of them — listed so nobody
copies it, not fixed here.

### The message box
*Documents current behaviour; not yet reviewed by Destin.*
Files: `components/InputBar.tsx` (the box ~1126, the text area ~1185–1374, the window-wide Enter handler
~438–480, dropping a file ~1065–1073), `QuickChips.tsx`, `AttachmentChip.tsx`, `StopButton.tsx`,
`VoiceButton.tsx`, `LocalModelDownloadStrip.tsx`; theme styles in `styles/globals.css` and
`styles/float-chrome.css`.
- One box (`bg-inset`, the theme's large corner, no border) under the chat. Floating themes put it on the
  panel colour with a shadow.
- Left to right: attach (paperclip), the skills drawer (compass; hidden in terminal view), the text,
  then the mic and Stop, then **send as a small filled button inside the box at the right** — the
  reference for "a text box with its own action".
- The text starts at one line and grows to three, then scrolls under a fade. 14px; 16px at phone width
  (so phones don't zoom).
- **Enter sends, Shift+Enter adds a line**; nothing fires while typing in an input-method composition.
  With the mic on, Enter stops the mic. Typing "/" first opens the skills drawer in search mode. While a
  popup is open the window-wide handler ignores Enter (Popups → "Enter belongs to the popup").
- **Quick chips** sit above the box in one row that scrolls sideways, with a pencil at its end that opens
  the quick-chips editor.
- **Attachments** are 128×96 tiles above the box (the old guide's G-23): a preview, the name in a strip
  along the bottom, a remove × always visible top right. A tile previewing a document shows it formatted,
  never raw, and holds nothing clickable inside it.
- **The find bar** (G-22) is a bordered pill at the right of a lane above the messages that reserves its
  height, so it never covers a message.
- Disabled (trust question up, project moved, session not started): text dimmed to half, icons to a
  third. Placeholder "Message your assistant...".
- Terminal view on a phone: a minimal box with a key toolbar instead of the quick chips.
- The skills drawer opens from here at 70% of the window; its handle drags to any height, a click jumps
  to full height and back, and every open starts at 70% again (decisions "Skills drawer height and
  handle").

Known deviations:
- While a turn runs, Stop and Send are both filled side by side, and the mic is filled while listening
  (`InputBar.tsx` ~1412, ~1424; `VoiceButton.tsx` ~299) — one filled button per view.
- Stop and the mic are a fixed round pill (`StopButton.tsx` ~66, `VoiceButton.tsx` ~306) — roundness
  comes from the theme (a deliberate earlier choice; ask before changing).
- The local-model download warning is an inset strip with a coloured dot, not the notice box
  (`LocalModelDownloadStrip.tsx` ~105).
- "Waiting for approval..." shows for every disabled reason, including a moved project
  (`InputBar.tsx` ~1354) — say what is happening.
- The box has no border; the old guide asked for a visible edge on it.
- Quick chips are hand-made buttons, not a shared piece (`QuickChips.tsx` ~61).

### File viewers
*Documents current behaviour; not yet reviewed by Destin.*
Files: hosts `components/SessionDrawer.tsx` (the Session Files pane), `project-view/tabs/FilesTab.tsx`
in `project-view/ProjectDetailOverlay.tsx` (Projects → Files), `marketplace/FileViewerOverlay.tsx` (a
plugin's file); the shared body `artifact-views/ActiveArtifactView.tsx`, routed by
`artifact-views/RendererRegistry.ts`.
- Three hosts, one body. **Session Files** is a side pane (480px, wider when expanded) opened by a tool
  card's Open or a file pill; its top bar holds the file name (click to rename), Open in the default app
  or Office, Copy path, Reveal in folder, Expand and the ✕; Edit / Save / Cancel / Comments float at the
  bottom right; the git footer sits at the bottom. **Projects → Files** and **a plugin's file** are
  full-window overlays with their own title, tapered line, ✕ and Esc.
- What draws a file: Markdown and text (formatted, editable as text), code (CodeMirror, with a comments
  rail), images and SVG (with the zoom pill and a loupe), PDF (pages, the same zoom pill), Word, Excel
  and CSV (a sheet grid), HTML (in a frame on white), anything else a card with "Open externally".
- A read failure is `ErrorState` with Try again. Loading is `LoadingState` in the main path.
- At phone width the list and the file stack, and the list button becomes "‹ Files".

Known deviations:
- The Session Files top bar's file name is 14px, not the 16px panel title (decisions "Applied from
  earlier rules"); the bar is crowded at 480px, so it needs a look rather than a swap.
- A Word, PDF or Excel file that can't be opened (damaged or password-protected) is a plain grey note
  beside "Open in default app": trying again can't help, and the error box needs Try again, Report
  bug or Diagnose — the shape for "only open it elsewhere" is undecided.
- Sheets and HTML use fixed paper colours (`sheet-theme.ts`, `XlsxView.tsx`, white HTML) — possibly
  intended, never decided.

### The terminal
*Documents current behaviour; not yet reviewed by Destin.* **Exempt**: the terminal stays exactly as it
is (decisions "Terminal").
Files: `components/TerminalView.tsx`, `SessionTerminal.tsx`, `TerminalToolbar.tsx`,
`TerminalRightSlot.tsx`, `themes/theme-engine.ts` (`computeTerminalSurface`), the toggles
`WideViewToggle.tsx` / `NarrowViewToggle.tsx` in `HeaderBar.tsx`.
- Reached by the header's Chat / Terminal toggle or Ctrl+`; the toggle is hidden for native and shell
  sessions.
- Drawn by xterm.js (WebGL, falling back to plain drawing). Font always Cascadia Code (14px; 12px on
  touch) — the theme's font does not apply.
- **Backing (old guide G-24; the code calls it P-20.2):** on wallpaper and gradient themes the terminal
  sits on the theme's panel colour at no less than 80% opacity; flat themes use the canvas colour.
- The header stays; the message box and status bar fold away; a side pane floats over the terminal.
- On phones a key toolbar (Ctrl, Esc, Tab, Enter, Space, ←, →) sits above the minimal message box.
- Its scrollbar is a thin floating thumb.

Known deviations: the key toolbar's buttons are hand-made with a hand-written accent fill
(`TerminalToolbar.tsx` ~110–120). Nothing else breaks a general rule.

### The code-change view (Git review)
*Documents current behaviour; not yet reviewed by Destin.*
Files: `components/git/GitReviewView.tsx` (the view), `git/GitReviewCard` (its cards),
`git/DiscardConfirmDialog.tsx`, and the one diff drawer `components/diff/UnifiedDiff.tsx`, also used by
the Edit tool card (exempt) and the file viewer's conflict diff.
- Opened from the Session Files pane's git footer ("Review changes →"); it replaces the pane's content
  under the same top bar. A sub-header: back arrow, "Reviewing changes for '<name>'", a branch chip.
- A timeline of cards, each lighting as one box on hover (decisions "The two sweep finds"): the pinned
  Uncommitted card first, then one card per commit (short id, subject, lines added / removed, a relative
  time), its diff loading when opened.
- The diff: one line-number column, a − / + mark, removed lines tinted red and added lines tinted green
  with a coloured left bar, "⋯" between pieces, 15 lines then "Show N more lines".
- Uncommitted: "Include in commit", "Revert changes…" (red outline), a message box and a full-width
  filled "Commit N staged files".

Known deviations:
- The removed / added line tints and bars are fixed red and green, not theme tokens — allowed as
  status hues in a tint (principle 2); no theme token exists for them.
- "Show N more lines" is still bare text, but only in the exempt Edit tool card; Git review never
  shows it.

### Buddy windows
*Documents current behaviour; not yet reviewed by Destin.*
Files: `main/main.ts` (`createAppWindow({buddy})`), `main/buddy-window-manager.ts`, `main/buddy-tray.ts`,
`shared/buddy-geometry.ts`; renderer `components/buddy/` (`BuddyChatApp`, `BuddyChat`, `SessionPill`,
`BuddyWelcome`, `BuddyNewSessionForm`, `BuddyResumeList`, `BuddyBarApp`, `AttentionStrip`,
`CompactToolStrip`, `BubbleFeed`, `BuddyMascot`), `styles/buddy.css`.
- Three see-through, frameless, always-on-top windows that move together: the **mascot** (112×112, drag
  to move, a press opens or closes the chat), the **chat** (320×480), and a small **action bar** (three
  round icon buttons: screenshot the desktop, open YouCoded, hide the buddy). A tray-icon style replaces
  the mascot with a system tray icon and menu.
- The chat is one frosted panel: a session pill at the top (opens a session list with "+ New session…"),
  the messages, a compact message box, an attention strip for waiting questions.
- No session open: "No active session" and two stacked full-width buttons, New session (filled) and
  Resume session (outlined).
- In the YouCoded themes the mascot is the glass buddy (decisions "Glass buddy"); the windows around it
  don't change.
- Esc closes the chat.

Known deviations:
- **No ✕ on the chat window** — a frameless window, not a popup: where a ✕ goes beside the mascot
  press and Esc needs a design. The session list drops from the pill like a menu, and menus have no
  ✕ (Lists and menus) — the main session menu has none either; ruled neither way.
- The session pill, the collapsed "N tools used" pill and the attention strip are fixed full pills;
  the main window's session strip is too, so there is no theme-shaped reference to copy.
- Allow / Deny / Always ("✕ Deny") and "Dismiss — I answered in the terminal" are hand-made, at 10px —
  permission prompts are exempt until their rework (decisions "Permission row and tool cards").

### Game boards
*Documents current behaviour; not yet reviewed by Destin.*
Files: `components/game/ArcadeShell.tsx` (which screen shows, the header), `ConnectFourBoard.tsx`,
`ChessBoard.tsx`, `FlappyGame.tsx`, `TwentyFortyEightGame.tsx`, `GameOverlay.tsx` (game over),
`RunOverCard.tsx` (end of a solo run), `GameChat.tsx`, `GameLobby.tsx`, `game-registry.ts` (pane widths).
- Every game plays inside the Games side pane. Header: a back arrow, the game's name, the ✕, the tapered
  line.
- **Pieces and boards are theme colours**: your Connect 4 discs are the accent, theirs grey (the old
  red/yellow are gone); chess squares are two shades of the text colour; Flappy's sky, pipes and ground
  and 2048's tiles are mixes of the accent with surface colours; Flappy's bird is the theme's mascot.
- Versus games: a turn row ("You" · "Your turn" pill · opponent), the board, the game chat under it.
  Every column or square is a real button (Tab, Enter / Space; tap on touch).
- Game over: a card over the board — "You Win!" / "You Lose!" / "Draw!", the head-to-head record, then
  Rematch (filled) over Back to lobby (outlined).
- Solo games: Play, a blurb and the leaderboard; then the field with its score readouts and an outlined
  New run / New game; the end is a card with the score, "New best" or "Your best", Play again and Back to
  games.
- An opponent who drops out: a waiting strip with a spinner and Leave. A lobby that can't connect is
  `ErrorState` with Try again.

Known deviations:
- Game-chat sender names are coloured (see Open questions Q14).
- A hand-made back button in the pane header: the shared back arrow belongs to the shared popup only
  (ast-grep `no-hand-rolled-dialog-back-chevron`), and the pane is not one.
- "You Win!" / "You Lose!" are in title case (the words this section quotes; not yet ruled).
- **2048 has no touch input**, so it can't be played on a phone.
- Mid-match states are missing (Open questions Q15).

### The guided tour
*Documents current behaviour; not yet reviewed by Destin* — except the backup stop, its words and
Escape, which Destin approved (decisions "Backup warning: where it lives", "Tour: Escape").
Files: `components/guide/GuideTour.tsx`, `guide-stops.ts`, `GuideBubble.tsx`, `GuideRing.tsx`,
`guide-state.ts`; `components/backup-warning-copy.ts`; started in `App.tsx`.
- Starts once after first-run setup; replays from Settings → Help & feedback → "Show me around".
- Nine stops: the buddy, sessions, tags, projects, files, **backups**, models, themes, help.
- A bubble at the bottom right beside the theme's mascot, its tail pointing at him, filled with the
  accent colour: "6 of 9" above one sentence, buttons at the right — Back, a stop's own action, Skip
  tour, then Next / Done last.
- A ring (accent outline and soft glow) around the thing being explained.
- **Escape closes only the bubble** and leaves the screen under it open; Skip tour and Done take you back
  where you started.
- **The backup warning has two homes, in Destin's words, from one shared sentence**
  (`BACKUP_WARNING`: "With your permission, the assistant may create, change, or delete files on your
  device. Create backups for anything you cannot replace."): **stop 6 of 9, right after Files** (the
  Files tab still ringed), and **a notice always shown at the top of Settings → Permissions'
  "Permission modes" card**, with no button (`PermissionsSection.tsx`). Don't add a third home or change
  the words without asking.

Known deviations:
- Back, Skip tour and the stop's action are bare text on the accent fill; Next / Done's fill is set by
  hand (`GuideBubble.tsx` ~75–91).
- The bubble is an accent-filled box rather than the shared popup surface — an earlier deliberate shape,
  noted, not ruled on.

## Kept from the 2026-08-25 guide

The earlier guide's rules that no later decision changed still hold. Its `G-n` numbers stay valid
for citations; this list says where each went.

- **Hover, press and focus (§2.4, Destin 2026-09-18).** Every clickable thing answers hover, press and
  keyboard focus. The fill moves one step along the depth ladder on hover and one more on press, from
  wherever the control sits (inside an `inset` pill → `edge` → a step past it, `ON_INSET_CONTROL`). A
  glyph-colour nudge alone is not a hover. Hover sits behind `@media (hover: hover)`; press does not.
  Pieces: `styles/motion.css`, `components/header/control-states.ts`; guards
  `tests/hover-press-ladder.test.ts`, ast-grep `chrome-control-no-glyph-nudge-hover`.
- **Motion (§2.4).** Durations and curves are the `--dur-*` / `--ease-*` tokens, never a hand-typed
  number; movement sits behind reduced motion and *Reduce visual effects*; colour fades do not.
- **G-1 One primitive, one look** — the "built from its shared piece" rule above. A job no piece does
  gets a new piece in `components/ui/` with a pinning test, never a one-off class string.
- **G-2 Tokens paint everything** — principle 2.
- **G-4 One primary per view** — Buttons (refined: one per row in a list of actions).
- **G-6 Text on surfaces.** `fg-faint` is decoration and disabled only — never a spinner, value or date.
- **G-8 Where the accent may paint**: state only (selected segment, on-state, focus ring, the filled
  button, send, links, the active dot). Midnight and Dark are monochrome by design; do not propose a
  colour accent for them. Accent never paints resting borders or the count badge.
- **G-11 Popup body**: the body scrolls with no visible scrollbar and fades its edge; nothing is ever
  clipped silently; the header never scrolls.
- **G-12 Search**: every search-with-filter control is `SearchFilterPill`.
- **G-15 Status bar**: one chip treatment; at phone width chips become icons before the bar wraps; never
  two rows. (Its coloured words are listed as deviations in `coloured-text-inventory.md`.)
- **G-19 Counts** — Text and numbers.
- **G-22 Find bar**, **G-23 Attachment card** — The message box, above.
- **G-24 Terminal backing** — The terminal, above.
- **G-25 Session row** (two lines: name, then project folder; status pill and tags at the right; names
  never wrap) and **G-26 Session status pill** (dot + word, word in the text colour, words from
  `STATUS_LABEL`).
- **G-28 Where a button sits** — principle 6.
- **G-30 Fast at any size**: a list of the user's own things draws only what can be seen
  (`.claude/rules/renderer-lists.md`).
- **Phone width (§4.8)**: "Esc ·" is dropped from back buttons; chip rows scroll sideways with an edge
  fade; every control has a touch area of at least 44px (the `coarse-hit` mechanism) even when it looks
  smaller; full screens re-flow to one column.
- **Theme packs (§5)**: a community theme may change colours, roundness, fonts, wallpaper, glass and
  mascots; the validator keeps it usable; no new pack rules. Library and Marketplace are see-through to a
  pack's wallpaper; Projects stays opaque. On Library and Marketplace the word is *Plugins*.

**Replaced by this guide:** G-3 radii by role (→ the theme's shape setting) · G-5 text floor (→ 11px
for everything) · G-7 uppercase eyebrows (→ sentence-case small labels) · G-9 button vocabulary (→
Buttons: less important actions are outlined, never bare text) · G-10 popup header (→ 16px semibold,
tapered line in the card-outline colour) · G-13 welcome screen (→ the first-session screen, First-run setup
and sign-in) · G-14 chips (filter pill kept; fact chips → `Chip`; tags → Tags) · G-16 full-screen header (→
centred title) · G-17 list rows (→ Lists and menus; no ✓ on the current item) · G-18 empty states (→ two
jobs) · G-20 tool-card header (→ not covered yet) · G-21 menus (→ the shared `Menu`; see Open questions
for red destructive items) · G-27 tags as named chips (→ Tags) · G-29 expandable rows (→ `FoldRow`,
opening inside itself). The footer rule "ghost Cancel" is replaced by outlined Cancel.

## Not covered yet

These are **not final** and are exempt from this guide until their own redesign: **tool cards** and
**permission prompts** (Yes · Always allow · No stays as today, its coloured buttons included). The
**terminal view** stays exactly as it is; its section above only records it.

## Open questions

Not rules. Each needs Destin's decision before a guide line can say it; until then follow the nearest
recipe and ask.

| # | Question | Where it came from |
|---|---|---|
| Q1 | **Buttons beside text: top, centre or bottom?** Setting rows and one-line notices centre their buttons; provider cards, downloadable model rows and titled notices put them level with the first line; long errors put them on their own line at the bottom right. | Destin: "just leave this for now, but keep a future roadmap item to do a full review" (small-fixes-3#SF3-9); `button-alignment-survey.md` |
| Q2 | **A status at the top of a popup** (Remote Access's connection state): no look chosen; every option was "cluttered". | decisions "Status at the top of a popup" (P-7) |
| Q3 | **A plain empty list** (Library "Nothing installed"): the first-time card was inferred, never confirmed. | decisions "Empty states" |
| Q4 | **When an explanation hides behind an (i) and when it is a plain line.** Ticket choices dropped the (i) for plain lines; on Backup & sync Destin wanted the opposite — "too much bare text. should all just be hidden behind the i popup". | submit-ticket-2#ST2-1 vs small-fixes-3#SF3-7 |
| Q5 | **First-time explanations**: when to use a tour stop, a tip, a once-only popup or a notice inside the thing. | backup-warning-friction proposal 1 |
| Q6 | **Explanations on permission cards**: permission prompts are not covered, so nothing says where a note on one goes. | backup-warning-friction proposal 2 |
| Q7 | **A lone button inside a notice at phone width**: full width like any lone button, or kept beside its sentence. | backup-warning-friction proposal 11 |
| Q8 | **Popup titles name the popup** (no sentences, counts or full stops in a title). Proposed, then deferred with the guide tooling. | close-session-friction proposal 23; dev-workspace roadmap |
| Q9 | **A filterable list in a popup** (search first, one card of plain rows that alone scrolls, follow-up action pinned below, height kept while filtering). Only the quick picker is ruled. | project-switcher-friction proposal 1 |
| Q10 | **Red destructive items in menus.** The old guide's G-21 put destructive menu items in red text; principle 2 now keeps status colour out of text. | 2026-08-25 guide G-21 vs principle 2 |
| Q11 | **Steps of a multi-step popup** (Add a backup): one label and one card per step was tried; the choose-where step went back to one card per choice with logos, and the done page was dropped (both now decided). Still open: the shape of a step in general. | small-fixes-3#SF3-1, #SF3-5 |
| Q12 | **The number on the header's Session Files button**: "decide with status/badges", never decided. | decisions "Counts beside a label or tab" |
| Q13 | **Skills drawer, filters and tag notes as quick pickers**: Destin unsure, not ruled. | decisions "Quick pickers" (Q-2) |
| Q14 | **Who-said-it colour in chat-like lists** (game chat sender names in accent): an identity marker, not a status — allowed or not. | Game boards, above |
| Q15 | **Mid-match states in games**: losing your own connection, an opponent who never comes back, a challenge arriving while you play — nothing shows today. | Game boards, above |
| Q16 | **Work that runs for a while and can be stopped** (an import, a long download): whether it offers Stop, what the ✕ and Esc do while it runs, and how a part-finished result shows (one pill on the subject, or one per piece). | three-builder test, 2026-10-13 |
| Q17 | **A notice about a whole popup step** (not about one card): its own labelled box, or inside the step's card. "Nothing bare on the popup" doesn't say. | three-builder test |
| Q18 | **Status colour in a bar's fill** (a usage meter past its limit): a tint like a pill, or never. | three-builder test |
| Q19 | **A master switch over other settings**: whether the rows it governs dim or hide when it is off. | three-builder test |
| Q20 | **Times and dates** (quiet hours from / to): no shared piece and no look. | three-builder test |
| Q21 | **Something unavailable until you sign in**: whether its row offers Sign in, and the pill's words. | three-builder test |
| Q22 | **A step of a flow**: whether it shows "2 of 3", whether the title changes per step, and whether the outlined Back button repeats the title's back arrow (part of Q11). | three-builder test |
| Q23 | **Switches or tick boxes for picking items to bring along** (what an import includes): the ticket's include choices are switches; the old guide kept tick boxes for picking several items in a list. | three-builder test; submit-ticket-2#ST2-1 |

## Before you show Destin

- [ ] Two or three existing screens that do the same job were used as references, and are named when
      showing the work.
- [ ] Every element matches a recipe here and is built from its shared piece; nothing invented.
- [ ] Checked in its hard states too: error, empty, loading, very long text, disabled.
- [ ] Every action says what happens on the user's computer in plain words; any download says its size.
- [ ] Every retry button reads "Try again"; machine words only under Details.
- [ ] No hard-coded colour, pill or corner size; theme colours and shape only; no status colour in text.
- [ ] Sentence case; no spaced-out capitals; headings from the three levels.
- [ ] Actions on the right; one filled button (one per row in a list of actions); nothing filled alone
      at the bottom-left.
- [ ] Spacing from the scale; cards styled by level; a label first; no loose text; no full-width lines.
- [ ] Popups have the ✕, close on Esc, and do their main action on Enter only through the shared popup.
- [ ] Checked in light, a dark theme, a wallpaper theme and at 390px wide.
- [ ] A change is called a fix only when it names what is measurably broken; anything else is labelled a
      preference.
- [ ] Shown to Destin as pictures of the real screen, not described in words.
