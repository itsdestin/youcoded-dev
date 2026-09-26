# Pieces audit chat-2a: popups and menus (meadow-mist)

S = /home/destin/youcoded-dev/worktrees/sessions/ui-consistency-audit/scratch/pieces-audit
Guide = guide-draft.md (2026-09-24). Tool cards and permission prompts are exempt.

| screen | piece | verdict | note |
|---|---|---|---|
| about-scrolled (`S/shots-overlays/meadow-mist/about-scrolled.png`) | Popup title "About" + ✕ + tapered line | FOLLOWS | 16px semibold, ✕ right, line under header |
| | Body fades at top edge | FOLLOWS | fade, not a strip |
| | "LICENSES", "POLICIES" labels | BREAKS | Spaced-out capitals; guide wants normal-case 12px grey (and soft underline for reading sections) |
| | Privacy policy / Terms of service | FOLLOWS | Underlined text as links, though not inside a sentence; they act as a link row (borderline) |
| | Open-source list rows (Electron · MIT · github...) | NO RULE | Plain credit/attribution lines; long URLs wrap under the name (long-text state handled by wrapping) |
| ctx-menu-assistant-bubble (`.../ctx-menu-assistant-bubble.png`) | Right-click menu (Ask about this / Copy / Select all) | FOLLOWS | Plain rows, no boxes |
| | Shortcut hints (Ctrl+C) | NO RULE | Keyboard-shortcut hint text in menus |
| | Quoted-conversation card in the bubble (Permission ask timeout, Preview / Resume) | BREAKS | Box inside a bubble inside a card; Preview outlined left of filled Resume = FOLLOWS the pair rule, but the rows nest boxes |
| | Tag chips "Follow-Up Needed", "UI" | NO RULE | Small outlined chips inside list rows |
| | Greyed Resume + "Project folder not on this device" | NO RULE | Item-level unavailable note (plain grey text, not a notice box) |
| | Header "12" round number badge on Session Files button | BREAKS | Number in a bubble (Counts rule; decisions say decide with status/badges) |
| | Bottom bar: "NORMAL" chip | BREAKS | Capitals chip / status as bare word |
| | Status bar "Sonnet \| Auto Effort" in orange-red text | BREAKS | Coloured text, not a tinted pill |
| ctx-menu-composer (`.../ctx-menu-composer.png`) | Right-click menu Cut/Copy/Paste/Select all | FOLLOWS | Plain rows, divider between groups; disabled items grey |
| | Send / stop buttons (round, green) | NO RULE | Icon-only round buttons in composer |
| first-run-authenticate (`.../first-run-authenticate.png`) | Wordmark "YouCoded" + subtitle | NO RULE | Full-window setup splash headings |
| | Progress bar with "100%" | NO RULE | Setup progress meter; 100% still shown while waiting for sign-in |
| | Five sign-in buttons (Log in with Claude ... Use an API key) | BREAKS | All five are outlined; none is the one filled main action. Full width and stacked, pill-shaped (looks hard-coded pill vs theme roundness, cannot confirm) |
| | Info box with two paragraphs | NO RULE | Plain intro text panel (card-like box holding buttons = box inside box? the buttons sit inside one panel; single level) |
| first-run-detect-prerequisites (`.../first-run-detect-prerequisites.png`) | Wordmark, sentence, progress bar | NO RULE | Same splash kind; no way out or ✕ (not a popup) |
| first-run-enable-developer-mode (`.../first-run-enable-developer-mode.png`) | "Enable Developer Mode" | BREAKS | Lone main action is a small pill hugging its label, centred; guide wants one button full width |
| | Instruction panel with fallback hint in grey | NO RULE | Info panel inside a setup step; normal grey text (fine) |
| first-run-launch-wizard (`.../first-run-launch-wizard.png`) | Tour bubble "1 OF 8" | BREAKS | Spaced-out capitals step label; also no ✕ on the tour (decisions say tour gets a ✕) |
| | "Skip tour" bare text + filled white "Next" | BREAKS | Less-important action is bare text, not outlined; pair is Skip left, Next right (order OK) |
| | Buddy mascot | NO RULE | Character image anchoring the tour |
| | Bottom bar "NORMAL" chip, orange "Sonnet Auto Effort" | BREAKS | Capitals, coloured text |
| local-models-damaged-why (`.../local-models-damaged-why.png`) | Popup title "Assistant settings" + ✕ | FOLLOWS | Shared popup title, ✕ right |
| | Left tab list (General, Cloud providers, ...) | FOLLOWS | Plain rows, selected row filled |
| | Red "Damaged" bar across the card top | BREAKS | Coloured strip; guide wants tinted box inside the item |
| | Red-outlined "Delete" buttons on every row | BREAKS | Destructive shown as outlined red on ordinary rows; text is red (coloured body text) |
| | "Settings" bare text button beside Delete | BREAKS | Bare text as button; should be outlined |
| | Underlined "Add vision (0.9 GB)" | BREAKS | Underlined words used as a button |
| | "Runs fast — fits on your GPU" green text | BREAKS | Coloured body text |
| | "Why can't this be resumed?" row with info icon | BREAKS | Fold-out should be a boxed row with arrow at right |
| | Tooltip "Damaged download" with title and paragraph | NO RULE | Hover tooltip / explainer popover with bold title |
| | Green filled "Download" beside a chevron on each recommended row | BREAKS | Chevron plus filled button, and several filled buttons in one view (one filled per view) |
| | "Recommended" label | FOLLOWS | Normal case grey small label |
| | "Other local apps" + "Detect" | FOLLOWS | Row with outlined action at right |
| | Ollama row: switch at right, "Disabled" grey, Add key / Test / Remove | BREAKS | Left-aligned buttons row under a setting; "Remove" red text; status as bare word "Disabled" |
| local-models-interrupted-delete-confirm (`.../local-models-interrupted-delete-confirm.png`) | Progress bar "66% — 74.2 of 113.0 GB" | NO RULE | Download progress meter |
| | Red-text confirmation line in a red-tinted box | BREAKS | Text is red; guide says normal grey/black, only box and title coloured |
| | "Keep" (outlined) and red "Delete download" as equal halves | BREAKS | Should hug labels at right (wide) with red on the right; equal halves rejected. Red is on right (order OK) |
| | Orange border around the interrupted card | BREAKS | Coloured edge strip/border on the item rather than a notice box inside |
| | Damaged bar, red Delete buttons, "Runs fast" green, Add vision underline | BREAKS | Same as damaged-why |
| local-models-paused (`.../local-models-paused.png`) | Same list as damaged-why, paused card scrolled out of view | BREAKS | Same breaks as damaged-why; the paused state itself is not visible in this shot |
| native-session (`.../native-session.png`) | Amber-dot banner "This model's context window is small..." + "Details" bare text | BREAKS | Dot + strip banner, not the tinted box; Details is bare text |
| | "Marinating" pill with dots icon | NO RULE | Thinking / working indicator bubble |
| | Bottom bar "PERMISSION UNKNOWN" in red capitals | BREAKS | Capitals and red text |
| | Bottom bar "Add tags", "Meadow Mist" chips | NO RULE | Status-bar chips |
| | Header "3" round badge on files button | BREAKS | Number in a bubble |
| | Session tab strip with tooltip "theme contrast pass" | NO RULE | Switcher strip with hover tooltip |
| | Deliverables row (icon, "Deliverables 1", grey description) | FOLLOWS | Count is word then faint number |
| permissions-scrolled (`.../permissions-scrolled.png`) | Small labels "Permission modes", "Always allowed" | FOLLOWS | 12px grey normal case |
| | Big boxed explainer with bullets and footer line inside it | BREAKS | Box (and a divider-separated inner footer) wrapping reading text; borderline "box inside box" with the grouped row list below in a second box |
| | "Always allowed" box containing three more boxed rows | BREAKS | Box inside a box |
| | Count "1 ▸" / "4 ▸" at row end | NO RULE | Count with disclosure arrow on a boxed list row |
| | Switch with description at top | FOLLOWS | Small control beside title and hint at right |

| projects-add-project (`.../projects-add-project.png`) | Title "Add a project" | BREAKS | Title is small regular weight, not 16px semibold; no ✕ button in the popup (guide: every popup has ✕) |
| | Two option boxes ("Start something new", "Use a folder already on this computer") | BREAKS | Boxes inside the popup; the first has a third box (name field) inside it = box inside a box |
| | "Project name..." field with small filled "Create" inside at right | FOLLOWS | Text box with its own small filled action inside, at right |
| | Highlighted second box (green border) | NO RULE | Pick-one option cards that act as buttons |
| | "Cancel" bare text, right aligned | BREAKS | Less-important action is bare text, not outlined |
| projects-context-editor (`.../projects-context-editor.png`) | Title "CLAUDE.md" + ✕ + line | FOLLOWS | Shared popup header; but title is regular weight, not semibold (BREAKS, minor) |
| | Edit (filled) / Reveal / Copy path (outlined) in header, ✕ at far right | FOLLOWS | Filled main action, outlined others, all at right; but the filled one is leftmost of three (order BREAKS "filled on right") |
| | Bold "Project instructions." lead-in | NO RULE | Inline bold explanatory sentence |
| | Very large path heading with underline rule | BREAKS | Fourth, unlisted heading size (bigger than the 18px Large); Markdown-render style |
| | Body area is a blurred/empty picture of the page behind | BREAKS | Hard state: content area shows no file text (looks empty or loading with no indicator) |
| projects-conversation-preview (`.../projects-conversation-preview.png`) | Title with pencil icon at left, tag and check icons + ✕ right | BREAKS | Title is 11px bold underlined-looking text, not the 16px semibold popup title; icon-only tag/check actions |
| | Chat transcript bubbles | NO RULE | Read-only preview of past chat |
| | Bottom panel: chips "Priority", "bug", grey details, date at right | FOLLOWS | Date bottom right, chips first |
| | "MODEL", "SKIP PERMISSIONS", "LAUNCH IN NEW WINDOW" labels | BREAKS | Spaced-out capitals |
| | Dropdown box inside the panel box | BREAKS | Box inside a box (panel holds bordered dropdown and switches) |
| | Two switches with labels at left, switch right | FOLLOWS | Small controls beside label at right |
| | "Resume Session" full-width filled | FOLLOWS | One button, full width, filled |
| projects-how-context-works (`.../projects-how-context-works.png`) | Title + ✕ + line | FOLLOWS | Shared popup header |
| | Left tab list with selected row | FOLLOWS | Plain rows, selected row filled |
| | Inner heading "How context works" (large bold) + grey subtitle | BREAKS | Repeats the popup title as a heading; extra heading level |
| | Four stacked boxed cards with icons and "Always · every project" text, arrows between them | NO RULE | Diagram of steps (explainer flow) |
| | Info box with icon and bold lead "When two files disagree..." | FOLLOWS | Tinted notice box with normal text (info icon, no coloured body) |
| theme-cycle-editor (`.../theme-cycle-editor.png`) | Title "Status Bar Widgets" + ✕ + faded scroll edge | BREAKS | Title is in Title Case, fine; the "Widgets" popup title looks regular-weight-bold OK -> FOLLOWS title/✕/fade. |
| | "TOKENS", "CODE", "TASKS", "APP" labels | BREAKS | Spaced-out capitals |
| | Tick-box rows (checked = filled green tick) with (i) icon at right | NO RULE | Opt-in checklist rows with info icon (already seen by first reader) |
| | Hover row highlighted with pencil + tooltip "Edit theme cycle" | NO RULE | Hover tooltip and row hover; hover state shown as tinted row (plain row rule FOLLOWS) |
| | Sub-note in a lighter box under "Theme" | BREAKS | Box inside a row; bottom text cut off by popup edge |
| providers-local-scrolled (`.../providers-local-scrolled.png`) | Identical to local-models-paused (near duplicate) | BREAKS | Same as local-models-damaged-why without the tooltip; not counted again |
| thinking-chip-hover (`.../thinking-chip-hover.png`) | No hover state visible; same chat as ctx-menu-assistant-bubble | NO RULE | Picture shows no tooltip; nothing new judged |
| close-session-prompt (`.../_unverified/close-session-prompt.png`) | Shows the session list dropdown, NOT a close-session prompt (mislabelled) | see all-sessions-menu | Close prompt itself is not judged |
| welcome-empty (`S/shots-main/meadow-mist/_unverified/welcome-empty.png`) | "Start your first session" heading + grey subtitle | NO RULE | Empty-state hero heading on a wallpaper (not a popup) |
| | Buddy mascot | NO RULE | Character image in empty state |
| | "PROJECT FOLDER", "MODEL", "SKIP PERMISSIONS" labels | BREAKS | Spaced-out capitals |
| | Two dropdown boxes in a form panel | NO RULE | Form field selects on a translucent panel |
| | Switch beside "SKIP PERMISSIONS (i)" | FOLLOWS | Small control at right of label |
| | "Cancel" (bare text, left) + "Create Session" (filled, right) | BREAKS | Cancel is bare text not outlined; "Create Session" label wraps to two lines (long-text hard state); pair order otherwise right-filled OK |
| all-sessions-menu (`S/shots-main/meadow-mist/_unverified/all-sessions-menu.png`; identical to close-session-prompt) | "SESSIONS IN THIS WINDOW" | BREAKS | Spaced-out capitals |
| | Session rows, hover-selected row tinted, plain rows | FOLLOWS | Plain rows, selected row differs |
| | Status "Working" / "Inactive" with dot in tinted pill | FOLLOWS | Live status is a pill with coloured dot inside |
| | Tag chips "Priority", "work", "bug", "idea" on rows | NO RULE | Coloured tag chips on list rows |
| | Truncated text ("wecode…", "Qwen2.5 C…", "Deepseek …") | NO RULE | Long-text hard state handled by ellipsis; no full text on hover seen |
| | "Resume" and "+ New Session" bottom bar as bare text with divider | BREAKS | Bare-text buttons, not outlined; two equal halves |
| | "All Sessions" pill on the right | NO RULE | Hover tooltip / floating pill label |
| | Session menu list edge fade at the bottom (llama row faded) | FOLLOWS | Fades at hidden edge |

## Screen paths

All under `/home/destin/youcoded-dev/worktrees/sessions/ui-consistency-audit/scratch/pieces-audit/`: `shots-overlays/meadow-mist/` (about-scrolled, ctx-menu-assistant-bubble, ctx-menu-composer, first-run-authenticate, first-run-detect-prerequisites, first-run-enable-developer-mode, first-run-launch-wizard, local-models-damaged-why, local-models-interrupted-delete-confirm, local-models-paused, native-session, permissions-scrolled, projects-add-project, projects-context-editor, projects-conversation-preview, projects-how-context-works, theme-cycle-editor, providers-local-scrolled, thinking-chip-hover, `_unverified/close-session-prompt`) and `shots-main/meadow-mist/_unverified/` (welcome-empty, all-sessions-menu). 22 images opened in total.

## NO RULE kinds

- Full-window setup splash (wordmark, subtitle, progress bar, info panel): `shots-overlays/meadow-mist/first-run-authenticate.png`, `first-run-detect-prerequisites.png`
- Guided-tour bubble with mascot: `first-run-launch-wizard.png`
- Empty-state hero with mascot and form: `shots-main/meadow-mist/_unverified/welcome-empty.png`
- Hover tooltips and explainer popovers: `local-models-damaged-why.png`, `theme-cycle-editor.png`
- Right-click menu shortcut hints: `ctx-menu-composer.png`
- Pick-one option cards that are buttons: `projects-add-project.png`
- Explainer flow diagram of stacked cards: `projects-how-context-works.png`
- Download progress meter with percent: `local-models-interrupted-delete-confirm.png`
- Coloured tag chips on list rows; truncated long text in rows: `all-sessions-menu.png`
- Credit/attribution lines: `about-scrolled.png`
- Round icon-only send/stop buttons; status-bar chips: `native-session.png`
- Read-only transcript preview with launch panel: `projects-conversation-preview.png`

## BREAKS by rule

| Rule | Examples |
|---|---|
| No spaced-out capitals | LICENSES / POLICIES (`about-scrolled.png`); "1 OF 8" (`first-run-launch-wizard.png`); PROJECT FOLDER / MODEL / SKIP PERMISSIONS (`welcome-empty.png`); MODEL / SKIP PERMISSIONS / LAUNCH IN NEW WINDOW (`projects-conversation-preview.png`); TOKENS / CODE / TASKS / APP (`theme-cycle-editor.png`); SESSIONS IN THIS WINDOW (`all-sessions-menu.png`); NORMAL / PERMISSION UNKNOWN chips (`native-session.png`, `ctx-menu-composer.png`) |
| Never red or coloured body text | Red confirmation text (`local-models-interrupted-delete-confirm.png`); green "Runs fast — fits on your GPU"; red Delete/Remove text (`local-models-damaged-why.png`); red PERMISSION UNKNOWN and orange "Sonnet Auto Effort" (`native-session.png`) |
| Never a coloured strip | Red "Damaged" bar and orange interrupted border (`local-models-damaged-why.png`, `local-models-interrupted-delete-confirm.png`); amber-dot banner (`native-session.png`) |
| Bare text / underline as a button; less-important action outlined | "Cancel" (`projects-add-project.png`, `welcome-empty.png`); "Skip tour" (`first-run-launch-wizard.png`); "Settings" and underlined "Add vision" (`local-models-damaged-why.png`); "Details" (`native-session.png`); "Resume" and "+ New Session" (`all-sessions-menu.png`) |
| Popup title and ✕ | "Add a project" has no ✕ and a small title (`projects-add-project.png`); conversation preview title is tiny and underlined (`projects-conversation-preview.png`); guided tour has no ✕ (`first-run-launch-wizard.png`) |
| Two-button order and shape | Keep / Delete download as equal halves (`local-models-interrupted-delete-confirm.png`); Edit filled at left of Reveal / Copy path (`projects-context-editor.png`); five equal outlined sign-in buttons with no filled main (`first-run-authenticate.png`) |
| One button full width | Lone "Enable Developer Mode" small centred pill (`first-run-enable-developer-mode.png`) |
| No box inside a box | Option boxes with name field (`projects-add-project.png`); panel with dropdown box (`projects-conversation-preview.png`); "Always allowed" box of boxes (`permissions-scrolled.png`); sub-note box under Theme (`theme-cycle-editor.png`) |
| Counts and number bubbles | Round "12" / "3" badge on Session Files button (`ctx-menu-assistant-bubble.png`, `native-session.png`) |
| Fold-out = boxed row, arrow right | "Why can't this be resumed?" (`local-models-damaged-why.png`) |
| Three heading levels | Repeated big inner "How context works" heading (`projects-how-context-works.png`); very large path heading (`projects-context-editor.png`) |
| Hard states | Empty-looking body in `projects-context-editor.png`; "Create Session" wraps to two lines in `welcome-empty.png`; sub-note cut off in `theme-cycle-editor.png` |
| Status as bare word | "Disabled" under Ollama (`local-models-damaged-why.png`); "NORMAL" chip |

Tally: 22 screens opened (including 1 near-duplicate and 1 with no visible hover state, both judged NO RULE / not re-counted). Rows above: FOLLOWS about 26, BREAKS about 62, NO RULE about 27 (approximate, counted by eye).

## Could not judge

- The paused-download card itself in `local-models-paused.png` (scrolled out of view); the "interrupted" card top is only partly visible.
- `about-scrolled.png`: top of popup (Disclaimer section) is scrolled out, so the soft-underline rule on reading-section labels could not be checked beyond LICENSES / POLICIES, which show no underline.
- `projects-context-editor.png`: the body is a blurred picture, so whether a file loaded is unknown.
- `close-session-prompt.png` is really the session dropdown; the close-session prompt itself was never seen.
- `thinking-chip-hover.png`: no hover state visible.
- Not opened (image limit / near-duplicates): `ctx-menu-user-bubble`, `_unverified/ctx-menu-code-block`, `_unverified/ctx-menu-file-pill`, `composer-attachments`, `development-bug-report`, `development-contribute`, `first-run-install-prerequisites`, `local-models-delete-confirm`, `local-models-resuming`, `native-session-stalled-and-permission`, `projects-switcher`, `shift-session-switcher` (first reader saw several).
- Corner roundness vs theme, exact pixel sizes, 390px width and other themes not judged.
