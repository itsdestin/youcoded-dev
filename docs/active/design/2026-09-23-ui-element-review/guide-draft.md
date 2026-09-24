---
status: draft
date: 2026-09-24
replaces: docs/active/design/2026-08-25-ui-design-guide.md (on approval)
source: docs/active/design/2026-09-23-ui-element-review/decisions.md
---

# YouCoded design guide

**Read this before you design any screen, popup, panel or Page.** It tells you how
YouCoded looks and why, so something new fits without Destin having to correct it.
Every rule here comes from a decision Destin made while comparing real screens side by
side; the source of each is in `decisions.md` beside this file. Where a rule names a
screen, open that screen as the example — do not copy its code blindly, copy the look.

## The taste in one paragraph

Calm, quiet and consistent. One style per job, used everywhere that job appears.
The theme decides colour **and shape**, so nothing hard-codes a colour, a pill or a
corner size. Text is small, grey and normal-case unless it is the one thing to read;
no spaced-out capitals, no redundant labels, one-line headers. Things you open or pick
(cards) stand out; things you read past (rows, menus, notices) stay soft. When in
doubt, remove rather than add.

## Principles

1. **Find the job first.** Before styling anything, find its job in the recipes below
   and use that recipe exactly. A new look is only justified by a new job — and then it
   is a new recipe Destin approves, not a one-off.
2. **The theme paints and shapes everything.** Colours come from theme tokens
   (`canvas panel inset well accent fg fg-2 fg-muted fg-faint edge edge-dim` and the
   derived set); status colours (green, red, amber, blue) are the only fixed hues.
   Corner roundness comes from the theme's shape setting: controls use the theme's
   control radius, containers its larger radii. Never write a fixed pill
   (`rounded-full`) or pixel radius on a control.
3. **Quiet by default.** Small grey labels, normal case. Show what the user needs to act
   on; drop metadata they did not ask for. Headers are one line.
4. **Three levels of heading, no more.** See *Headings*. If a screen seems to need a
   fourth, it needs fewer sections instead.
5. **Cards stand out; rows stay soft.** Things you open are raised cards; lists of
   settings are soft boxed rows; pick-one menus are plain rows.
6. **One main action per view.** One filled button; everything else outlined or quiet.
7. **Every theme, every width.** Check light, a dark theme and a wallpaper theme, and a
   390px-wide phone view, before showing anyone.

## Recipes

### Full screens (Projects, Pages, Marketplace, Library)
- The screen names itself **centered in the window's top strip, small (14px medium),
  with its icon** — reference: Pages → any page.
- The way out is a **filled small button reading "Esc · Back to chat"** (key first),
  top right of the strip.
- Big groups on the screen use the *Large* heading.

### Popups and side panels
- Title: **16px semibold, one line**, close **✕ button** (28px, soft hover square) at
  the right, a **tapered divider** under the header (inset 16px, fading over its first
  and last 8%). Reference: Settings → Sound. Use the shared `<Dialog>`; never hand-roll
  a popup shell.
- When the body scrolls, fade the content at the hidden edge (42px, softened 4% at the
  sides); no fade when nothing is hidden. Never paint a solid strip.
- Every popup has the ✕ and closes on Esc.

### Headings
| Level | Use | Style |
|---|---|---|
| Large | Big groups on a full screen ("Favorites", "Destin's picks") | 18px medium, `fg` |
| Title | A popup or side panel's name | 16px semibold (above) |
| Small label | A group inside a screen, popup or list ("Volume", "Privacy") | 12px medium, `fg-muted`, **normal case, no letter-spacing** |

A small label that heads a **section of reading text** (About's "Disclaimer",
"Privacy") also gets a **soft underline under its words** (`edge` colour, 4px below
the text). Labels over short settings groups stay plain.

### Text and numbers
- Body 14px `fg`; secondary text one grey (`fg-muted`); `fg-faint` only for disabled.
- Nothing below 11px carries information.
- A count beside a label or tab: **the word, then a smaller faint number** — "Files 17".
  In a summary line: **bold number, grey word** — "17 files". No brackets, no chips.

### Buttons and controls
- Shape: the theme's control radius for every button, tab, filter and search box
  (built-in themes: Round, 14px).
- **Main action:** filled accent. At most one per view.
- **Everything less important beside it** (Cancel, Preview, Not now): **outlined** — a thin
  border, never bare text.
- Destructive: red, filled only in a confirmation step.
- Close: the ✕ button, never a letter or text.
- Switching views or filters: the shared `SegmentedTabs` / `FilterChip`; all follow the
  control radius.

### Cards
- Anything you open, install or pick from a grid is a **raised card**: panel colour,
  thin `edge-dim` border, a **medium shadow** (`0 4px 20px rgb(0 0 0 / .16), 0 1px 3px rgb(0 0 0 / .08)`), the theme's card radius, 12px gap between
  cards. Reference: Your Library.
- No flat, tinted or borderless card variants.

### Lists and menus
- **Settings-style lists** (each row opens or changes a setting): **boxed rows** — each
  row a soft tinted box with a small gap. Reference: the Settings list. Use `SettingRow`.
- **Pick-one menus and switchers** (right-click menu, session list): **plain rows** — no
  box, no line; hover highlights; the selected row is visibly different from a hovered
  one.

### Status and notices
- A status label is a **small tinted pill in its status colour, normal case**
  ("Installed"). A live status (a session Working / Inactive) carries its **coloured dot
  inside the pill**. Reference: the session list.
- A passive warning, info or danger notice is a **tinted box with a matching border**
  (`Callout`). Reference: Backup & Sync → "conversations too big to sync".
- Errors follow `docs/error-message-standards.md` (`<ErrorState>`).

### Building a Page
Pages use the page kit's classes (`.yc-button`, `.yc-card`, `.yc-title`, `.yc-muted`…),
which carry these recipes; theme colours and shape reach the page automatically. Follow
this guide where a class leaves a choice open, and never restyle a kit class.

## Before you show Destin

- [ ] Every element matches a recipe here; nothing invented.
- [ ] No hard-coded colour, pill or corner size; theme tokens and shape only.
- [ ] No spaced-out capitals; headings from the three levels.
- [ ] One filled button per view; popups have ✕ and close on Esc.
- [ ] Checked in light, a dark theme, a wallpaper theme and at 390px wide.
- [ ] Shown to Destin as pictures of the real screen, not described in words.
