# YouCoded's design rules: what exists today

*Audit of the workspace, 2026-11-18. Read-only; nothing was changed.*

---

## The short version

- **One main rulebook.** The design guide (`docs/active/design/2026-10-13-ui-design-guide.md`, 935 lines) is the rulebook for how the app looks. You approved it on 2026-10-14. Every rule in it traces back to one of your answers on a review deck.
- **About 38 shared building blocks.** Buttons, switches, popups, notice boxes and so on live in one folder. New screens are supposed to be built only from them.
- **About 183 named screens.** The photo tool can take a picture of each one automatically.
- **A heavy approval process.** New features go through question decks, mockups, AI testers, a signed "contract", AI reviewers and an acceptance deck.
- **Some automatic checks.** They catch raw colours, hand-made copies of shared pieces and similar mistakes. About 500 known violations are tolerated for now.
- **The gap you noticed is real.** There is no visual catalogue. Nothing lets you or an agent *see* all the buttons, popups, menus, error boxes and screens in one place. The rules exist only as words, and the examples are scattered across about 180 screens.

---

## 1. Where the guidance lives

| What | Where | What it's for |
|---|---|---|
| **Design guide** | `docs/active/design/2026-10-13-ui-design-guide.md` | How every kind of screen, popup, button, card, list, notice and error should look. The core document. |
| **Decision log** | `docs/active/design/2026-09-23-ui-element-review/decisions.md` | Every decision you made, about 16,000 words. This is where the guide's rules come from. |
| **About 200 answered decks** | Same folder | The original evidence: your clicks and comments. |
| **Brand guide** | `docs/brand/README.md` + `guide.html` | Logo, name, colours, fonts and voice for public material (website, posts). It explicitly does **not** govern the app's screens, except first-run setup. |
| **Error-message rules** | `docs/error-message-standards.md` | Never guess at a cause. Every error offers something to press. Retry buttons say "Try again". |
| **Vision** | `docs/vision/VISION.md` | The *why*: "if a step needs technical knowledge, that step is a bug." |
| **Process rules** | `.claude/rules/feature-flow.md`, `review-deck.md` | How a new feature gets designed and approved. |
| **Narrower rules** | `.claude/rules/narrow-viewport.md`, `renderer-lists.md`, `session-strip-motion.md`, `status-bar-relevance.md`, `react-renderer.md` | Phone width, long lists, the session tabs' drag motion, the status bar, and "always use the shared piece". |
| **Skills** | `ui-mockup`, `ui-review` | Step-by-step routines agents follow to mock up UI or review the whole app. |

---

## 2. The design guide, explained

### Its nine principles

1. **Find the job first.** Every element has a job ("two buttons in a narrow popup"), and every job has a recipe. If no recipe fits, ask you; never invent a look.
2. **The theme paints everything.** Colours and corner roundness come from the theme. Green, red, amber and blue status colours appear only as a **tint** (a pill, a notice box, a dot), **never in text**. There are two exceptions: destructive actions are red, and actions that cost money get a fixed orange button.
3. **Quiet by default.** Small grey labels in sentence case. Show only what's needed to act. Headers are one line.
4. **Three heading levels, no more.** These are a large group heading, a popup title and a small grey label.
5. **Cards for things, rows for lists.** Things you open or install are raised cards. Settings and menus are rows. Cards inside popups are styled by how deep they sit.
6. **Actions on the right, or full width.** Only one filled ("main") button per view. Nothing sits alone at the bottom-left, and no control floats mid-row.
7. **Tight, even spacing** from one scale: 4 · 8 · 12 · 16 · 24 pixels. No dead space.
8. **Every theme, every width.** Check light, dark, wallpaper themes and phone width (390px). On phones, chip rows scroll sideways instead of wrapping, and long sections fold.
9. **Anything clickable looks clickable.** It's always in a container, never bare text, except an underlined link inside a sentence.

### The recipes, by kind of element

| Kind | The rule in one line |
|---|---|
| **Full screens** (Projects, Pages, Marketplace, Library) | Small centred title with an icon at the top. A light "Esc · Back to chat" button at top right. If the whole screen fails to load, a centred full-screen error. |
| **Popups and side panels** | One shared shell: one-line title, ✕ at the right, a thin fading line under it. Closes on Esc. Enter does the main action. Settings save as you change them. A one-job popup is one card with its buttons stacked inside. A multi-group popup pins its buttons to the bottom. |
| **Headings and text** | Three sizes. Body text 14px, secondary 12px grey, nothing smaller than 11px. Sentence case everywhere. Counts read "Files 17", never "(17)". Buttons name what they do. Every retry says "Try again". |
| **Spacing** | One scale. No lines cutting across a box. Nothing sits bare on a popup's background. A small label always comes before the first card. |
| **Buttons** | One filled main action, outlined secondaries. Side by side, the filled one is on the right. Stacked, the filled one is on top. A lone button is full width. Red for destroy, orange for costs money. A disabled button says why. |
| **Settings** | A switch sits beside its text. Wide controls go underneath. Use tabs for 2–4 choices, a dropdown for more, a boxed list when each choice needs explaining. Folds open inside themselves. |
| **Card levels** | First-level card: see-through glass with a thin outline. Cards nested inside it all share one look. The outline, not the colour, separates the layers. |
| **Cards** (things to install or open) | Raised, with a shadow. Order: name and status, then one sideways-scrolling chip row, then a 2-line description. Quick actions top right, date bottom right. |
| **Tags** | A pill with a coloured tag icon. Edit in place. |
| **Detail pages** (a plugin, a theme) | The popup is titled by kind ("Plugin details"). The top card is the item. Two columns on wide screens. |
| **Writing and sending** (a ticket) | Draft, then review as it will read, then send. On failure the notice replaces the buttons and the draft is kept. |
| **Lists and menus** | Settings lists are boxed rows. Pick-menus are plain rows. The current item gets no checkmark. Remove is a bin, never ✕. Every dropdown is the shared one. |
| **Status and notices** | A status is a tinted pill (with a dot if it's live). Every warning or error is the one tinted box, with normal-coloured text. A problem replaces the card it's about. A failed action replaces its buttons. Machine error text goes only under "Details". |
| **Empty states** | Two looks: "nothing yet" is a card with one button, and "nothing picked" is one grey line. |
| **First-run setup** | Its own brand look (lavender gradient, Outfit font). Nothing else copies it. |
| **Pages** (user-made apps) | Use the Pages kit, which carries these same recipes. The user's own wishes win. |

### Parts of the guide that only *describe* today's app

You never reviewed these. They're written down so nobody copies their mistakes: **the message box, file viewers, the terminal, the code-change view, buddy windows, game boards and the guided tour.** Each one lists "known deviations", places where it breaks the general rules today.

### Explicitly not covered yet

**Tool cards, permission prompts and question cards in chat.** They stay as they are until they get their own redesign (card #149).

### 22 open questions (numbered Q1–Q23; there is no Q10)

The guide tells agents to stop and ask you about these. Highlights:
- Buttons beside text: aligned top, centre or bottom?
- When an explanation hides behind an (i) versus showing as a plain line.
- How multi-step popups show their steps.
- How long-running stoppable work looks.
- Times and dates.
- What a feature shows when you're signed out.
- Switches versus tick boxes.

---

## 3. The building blocks that exist (`youcoded/desktop/src/renderer/components/ui/`)

| Job | Piece | Used in (files) |
|---|---|---|
| Any button | **Button**: filled, outlined, red, red-outline, orange "costs money", and quiet variants; 7 sizes | 152 |
| The ✕ | **CloseButton** | 19 |
| On/off | **Toggle** (inside a **SettingRow**) | 34 / 36 |
| Tick box, radio list | **Checkbox**, **RadioGroup**, **ConsentRow** ("I understand") | 2 / 5 / 3 |
| Text fields | **TextInput**, **Textarea**, **InputGroup** (button inside the box) | 27 / 12 / 15 |
| Dropdowns | **Select**, **TypeableSelect** | 6 / 2 |
| Tabs | **SegmentedTabs** (4 styles), **DocumentTabs** (closable file tabs) | 12 / 2 |
| Search and filter | **SearchFilterPill**, **FilterChip**, **FilterMenuChip** | 5 / 2 / 1 |
| Facts and statuses | **Chip**, **Badge**, **Pill** (5 tones, optional dot) | 5 / 1 / 20 |
| Notices | **Callout** (info / warning / danger), **StatusStrip** | 37 / 15 |
| Loading, empty, error | **LoadingState**, **EmptyState**, **ErrorState**, **ScreenError**, **FieldError** | 32 / 13 / 62 / 1 / 44 |
| Short confirmations | **Toast** | 4 |
| Hover hints and explainers | **Tooltip**, **AnchorTip** | 81 / 8 |
| Popups | **Dialog** (sizes 340 / 420 / 600 / 820px), **OneJobCard** | 59 / 14 |
| Fold-outs, labels | **FoldRow**, **SectionLabel** | 19 / 60 |
| Card looks | **CARD_LEVEL_1 / 2** | 53 / 20 |
| Small menus | **Menu** | ~5 |
| Progress, sliders, zoom | **ProgressBar**, **Slider**, **ZoomPill** | 10 / 2 / 3 |

**Shared pieces that live elsewhere:**
- The dimmed backdrop and overlay panel.
- The right-click menu.
- The full-screen header band.
- The spinner.
- Provider logos.
- 24 one-off icons. **There is no real icon set.** Each icon is a separate drawing.
- Chat tool cards and prompt cards.

**Hand-made copies still in the app:**
- About 279 plain hand-made buttons in 109 files, versus 615 uses of the shared Button. Many are probably rows or tiles, not real buttons.
- A few hand-coloured "filled" buttons.
- Around 29 files that draw their own pop-over layers.

### Themes
- Colours, corners, shadows and fonts are named "tokens" defined in `styles/globals.css`.
- There are six built-in themes (Light, Dark, Midnight, Creme, YouCoded, YouCoded Night), plus community themes.
- Pages have their own matching token set.

---

## 4. The screens that exist

The photo tool's registry knows **183 distinct screens (571 states counting errors, empty states and phone widths)**:

| Area | States |
|---|---|
| Chat (model picker, sessions, files, terminal, games, browser, menus…) | 253 |
| Settings (account, assistant, appearance, sync, remote, help, tickets…) | 135 |
| Pages | 64 |
| Marketplace | 37 |
| Projects | 23 |
| Dev sheets, Office, first-run, Library, welcome, tour | ~58 |

By kind: 259 popups, 230 full views, 67 error states, 57 phone-width shots, 48 side panes.

**Never pictured or never reviewed:** the code-change view, the buddy window's content, real Android rendering, phone pairing screens and the live terminal. Spreadsheet, Word and HTML viewers, share sheets and drag-and-drop zones were never even captured.

---

## 5. How UI work is supposed to happen

**Full route** for a new feature, about 13 helper agents:
questions deck → mockups in the Workbench (the real app against fake data) → an AI "beta tester" who has never seen the plans → review deck → signed contract → build → code reviewer and second tester run → an independent grader → acceptance deck → your merge call.

**Short route** for small, clear work: just the review deck. Agents must ask you before taking it.

**Tools:**
- **Workbench**: the real screens with fake data, for designing safely.
- **shoot**: photographs any named screen in any theme, before and after a change.
- **explore**: lets agents click through like a user.
- **journeys**: replays 7 core user paths on every change.
- **design-check**: turns lint warnings into a deck with the bad element boxed on screen.

**Automatic enforcement:**
- **Design lint** flags raw colours, made-up sizes and restyled shared pieces. It only warns, and 504 warnings are tolerated (the count can only go down).
- **About 30 "pattern rules"** fail the build if someone hand-makes a popup shell, notice box, toggle, toast, section label and so on.
- **Tests** check that every error has a button, every retry reads "Try again", and every popup has a screen name.
- **A contrast check** blocks themes with unreadable text.

**Not enforced by anything:**
- Button placement, card levels and the spacing scale.
- Sentence case inside the app.
- Checking every theme and phone width.
- The guide's own "before you show Destin" checklist.

---

## 6. Problems I found

### Stale or contradictory docs
1. **No automatic rule points agents at the design guide.** When an agent edits screen code, the renderer rules load on their own, but the guide doesn't. Only the main instructions file mentions it.
2. **Theme counts disagree.** The `ui-review` skill and deck manual say "all six themes"; the photo tool's notes say 14.
3. **Slide kinds disagree.** One doc says nine kinds of deck slide; another lists ten.
4. **Old approval methods linger.** The `ui-mockup` skill still describes the old "approve changes by number" method that decks replaced. The `ui-review` skill points at a template that was archived.
5. **Stale audit files still look current.** `guide-contradictions.md` and `unit-vocabulary.md` still describe the draft guide, including the reversed "filled Back to chat" rule.
6. **The decision log says 2 items are open; the guide lists 22.**
7. **Brand versus app.** The app's YouCoded themes still use the old purple, and setup still says "agents for everyone", a line the brand guide retired.
8. **Two cards may overlap.** #139 and #235 both cover phone-width layout.

### Design debt
- An audit judged about 830 pieces across about 180 screens: **~255 follow the guide, ~375 break it, ~215 have no rule.** It's from late September, so it's likely better now.
- Seven surfaces are still unreviewed, plus all the chat cards (#149).
- 22 open questions are unanswered (#150).
- Your 2026-10-08 wish to rebuild the Pages kit "directly tied to the real app UI… more pre-built sets of buttons, menus, etc." is still unbuilt (#90).

### The missing visual catalogue
What exists is fragmentary:
- an icon sheet
- a status-pill sheet
- a chat tool-card gallery
- a few one-off design demos
- an archived August screenshot gallery that's now out of date

Nothing shows **every building block, in every variant, in the current theme, beside the rule that governs it**. Nothing shows **every screen, grouped by kind**. So today:
- **You** can't point at things ("I want this popup, with that notice, and those buttons").
- **Agents** read 935 lines of prose and guess what the words look like. That guessing is why new UI keeps arriving "random non-standard and extra busy" (your words, 2026-11-01).

---

## 7. Where this could go next (for discussion, not decided)

A **living visual guide** built from the real app's pieces, so it can never drift:

- **A components page.** Every shared piece in every variant (all button kinds and sizes, every notice tone, every pill, popup sizes, empty, loading and error states), each with a short caption: its name, the job it does and the guide rule behind it. A theme switcher on top shows it in any theme or at phone width.
- **A patterns page.** Whole recipes assembled: "one-job popup", "settings group", "detail page", "failed action", "first-time empty card". Each one shows a live example and names the real screens that use it.
- **A screens atlas.** Thumbnails of all ~183 screens, grouped by kind (full screens, popups, side panes, menus, errors), refreshed automatically by the photo tool.
- **A shared vocabulary.** Every piece and pattern gets a short name you and agents both use: "a one-job popup with a danger confirm", "a fold row".

Questions to settle together:
- Should it live inside the Workbench, the dev app or a standalone page you open?
- How should open questions and unreviewed surfaces be flagged on it?
- Should the written guide shrink to point at the visual one?

---

# Part 2: Where first attempts go wrong (deck history analysis)

Six reviewers read every deck answer since late August where Destin did not simply accept. That came to 1,534 moments across 144 design projects. About **1,145 were real pushbacks**. Counts are approximate, and one pushback can fall into two categories.

## What went wrong

| Kind | ~Count | Share |
|---|---|---|
| **Looks wrong** (wrong piece, spacing, alignment, button style, too busy, doesn't match the app) | 420 | 37% |
| **Arranged wrong** (wrong surface, wrong place, wrong order, hierarchy) | 295 | 26% |
| **Genuine taste / new preference** (about half is brand art) | 205 | 18% |
| **No rule covered it** (agent guessed) | 205 | 18% |
| **Words** (too long, jargon, unclear) | 155 | 14% |
| **The deck itself failed** (no picture, no context, fake states) | 150 | 13% |
| **Behaves wrong / misread intent** | 140 | 12% |
| **Over-built** (extra options, states, buttons) | 95 | 8% |

## What would have prevented it

| Preventer | ~Count |
|---|---|
| **A ready-made approved example to copy** | 255 |
| **Seeing an approved picture first** | 225 |
| **A clearer written rule** | 205 |
| Unforeseeable / taste | 190 |
| **A decision made in advance** | 175 |
| An automatic check | 55 |

## The single biggest cause

**New UI invents its own version of something the app already has.** Every reviewer named this as its top failure:
- error and warning boxes
- buttons
- cards
- permission menus
- dropdowns
- fades and chips

The fix often took 3–6 rounds and only landed once Destin pointed at the existing piece by name. His words:
- "seems like our UI design guide is insufficient/weak, we shouldn't be missing basics like this"
- "our design guide needs to help eliminate these kind of random non-standard and extra busy ui elements"
- "look for similar examples of errors with details and follow the examples"

## Mistakes corrected again and again (each across 3+ decks)

1. **A filled button at the bottom-left.** Corrected in about 10 decks before it became a rule.
2. **Hand-made error and warning boxes** instead of the standard notice box (about 20 times).
3. **Hand-styled buttons that don't match** (wrong colour, see-through, not clickable-looking).
4. **Lines and dividers cutting across boxes; the "fingernail" separators.**
5. **Chips and pills of mismatched size, roundness and height; text sitting too high next to a dot or icon.**
6. **Bare text where something should be a button or card; nothing bare on a popup.**
7. **Too much grey helper text, duplicate headings, extra subtext.**
8. **Wrong surface.** A popup where a side panel or full page belonged, or the reverse.
9. **Over-building.** Extra options, extra flows, states users never hit ("you're overcomplicating this").
10. **Losing core look while fixing something else** (the scroll fade, the glass).

## His meta-feedback about the guide itself

- "we shouldn't just be verbally describing every existing surface as currently designed. this should be about more general rules/principles/design instructions that will apply when building new surfaces, with only pointers to existing surfaces to reference." (rule-words-round2)
- Rule statements read as "word salad". "want to see these changes applied. hard to judge from just these statements" (guide-2).

## Conclusion

- **Prose rules alone don't stick.** Several mistakes kept happening *after* a written rule existed (bottom-left buttons, custom error boxes).
- **About 60% of pushbacks would most likely have been prevented by an approved example to copy or an approved picture to match.** That is well above what a better written rule would catch.
- **About 15% need decisions made in advance:** the open questions, plus "which surface does this go on".
- **Words are about 14%.** They need a short wording guide with good and bad examples and a glossary.
- **About 13% are deck problems.** Those belong to the separate approval-process session.
