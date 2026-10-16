# Pieces audit: everything else (games, buddy, git review, phone, file viewers, site gallery)

Read-only audit of meadow-mist screenshots against `guide-draft.md` + `decisions.md`.
Base path for all screenshots: `P = /home/destin/youcoded-dev/worktrees/sessions/ui-consistency-audit/scratch/pieces-audit`.
Only pieces that break a rule, have no rule, or are the reference example are listed. Screens where every other piece plainly follows a rule are not padded.
Where the same picture repeats in several plans (games panel header, session-files panel, viewer header, file footer) it is judged once and cross-referenced.
Chat content behind side panels (message bubbles, Resume/Preview cards, status bar, quick-chip row) is out of this scope except where noted.

## 1. Tables

### Games: picker (Flappy / 2048 / Connect 4 / Chess)
Shot: `P/shots-games-arcade/meadow-mist/arcade-picker.png` (also `shots-games-arcade-states/.../arcade-picker-empty.png`)

| Piece | Verdict | Note |
|---|---|---|
| Side-panel header "Games" + ✕ + line under | FOLLOWS | Popups and panels: title, ✕ right, line. Title looks ~14px, not clearly 16px semibold; no game icon. Cannot measure sizes from a picture. |
| 2x2 game cards (thumbnail, name, "Your best: 31 pipes") | FOLLOWS | Cards you open are raised cards, but the shadow is barely visible on the panel colour; cannot confirm "medium" |
| Card sub-line "Jake is online" / "Not played yet" / "Your best: ..." | BREAKS | Status "no bare grey words": online presence is plain grey text, no dot, no pill |
| Two different kinds of fact in the same sub-line slot (score vs presence vs "Not played yet") | NO RULE | Card facts: guide says a chip row under the name, but games cards have a text line |

### Games: picker signed out
Shot: `P/shots-games-arcade-signedout/meadow-mist/arcade-picker-signedout.png`

| Piece | Verdict | Note |
|---|---|---|
| Connect 4 / Chess cards greyed with "Sign in to play" | NO RULE | Disabled/locked card: guide says faintest grey is for disabled things but nothing on locked cards or how they say why |
| Notice box "Flappy and 2048 play without an account... Sign in" | BREAKS | Notices: one tinted box with matching border and a title; this is a plain untinted box with no title |
| "Sign in" (bare word at the bottom-left of that box) | BREAKS | Underlined/bare words as buttons; action belongs inside the notice at the right as a button; also bottom-left action |

### Games: picker degraded (server unreachable)
Shot: `P/shots-games-arcade-degraded/meadow-mist/arcade-picker-degraded.png`

| Piece | Verdict | Note |
|---|---|---|
| Faded Connect 4 / Chess cards with "Can't reach the game ser..." | BREAKS | Errors: specific detail + Retry via the notice box (error-message-standards). Here: truncated sentence in a card, no box, no Retry, no way to see the rest |
| Truncated error text (long-text hard state) | BREAKS | Text is cut off with "..." so the reason is unreadable |

### Games: leaderboard (Flappy detail)
Shots: `P/shots-games-arcade/meadow-mist/arcade-leaderboard.png`, `P/shots-games-arcade-alone/meadow-mist/arcade-leaderboard-alone.png`

| Piece | Verdict | Note |
|---|---|---|
| Header: ‹ back arrow + "Flappy" + ✕ | FOLLOWS | Panel title + ✕ (back arrow is extra, fine) |
| "Play" full-width filled button | FOLLOWS | One button: full width (reference example) |
| "Fly your theme's mascot through the gaps." | FOLLOWS | Secondary text: small grey |
| "PIPES CLEARED" | BREAKS | Small label: normal case, no spaced-out capitals |
| Ranking rows (1 Mira @mira 58 pipes...) with own row filled green | NO RULE | Leaderboard/ranked list: boxed rows are for settings; this is a ranked list with a highlighted "you" row |
| Alone state: one row + "Just you so far. Add a friend..." | NO RULE | Empty/almost-empty list hint text; plain grey line, no rule for empty states |

### Games: playing 2048 / Flappy
Shots: `P/shots-games-play/meadow-mist/2048-playing.png`, `P/shots-games-play/meadow-mist/flappy-playing.png`

| Piece | Verdict | Note |
|---|---|---|
| "SCORE 0 / BEST 12,480" (2048) and "PIPES 0 / BEST 31" (Flappy) | BREAKS | Small labels: normal case, no capitals. Number-under-label is also not the "17 files" or "Files 17" style |
| "New game" / "New run" small outlined button, top right | FOLLOWS | Actions on the right; secondary = outlined |
| Game board / play area (grid, sky, mascot) | NO RULE | Game canvas/board: nothing in the guide covers a play surface |
| "Press Space to fly / Nothing is moving until you do." overlay | NO RULE | On-canvas instruction overlay |
| Hint paragraph under the board ("Arrow keys or W A S D...") | FOLLOWS | Secondary text grey |

### Games: game over (Flappy death)
Shot: `P/shots-games-death/meadow-mist/flappy-dead.png`

| Piece | Verdict | Note |
|---|---|---|
| "You hit the ground / 0 pipes / Your best" result card on the canvas | NO RULE | End-of-game result overlay |
| "Play again" (filled) + "Back to games" (outlined) side by side, centred, filled on the LEFT | BREAKS | Two buttons side by side: filled on the right, outlined directly left, both at the right edge. Also narrow panel (<420px) should stack full-width, filled on top |
| "PIPES / BEST" header | BREAKS | Same capitals as above |

### Games: Connect 4 board / Chess board
Shots: `P/shots-games-arcade/meadow-mist/arcade-connect4-board.png`, `.../arcade-chess.png`

| Piece | Verdict | Note |
|---|---|---|
| "You ... Your turn ... Jake" turn strip with dots and a small pill | NO RULE | Live game status; guide's live pill (dot inside pill) is for sessions. "Your turn" is a pill (close to FOLLOWS) but the name dots sit outside it |
| Board (7x6 disc grid / 8x8 chess) | NO RULE | Game board |
| "You / Opponent" legend under chess board | NO RULE | Legend row |
| "GAME CHAT" | BREAKS | Small label: normal case; also a line above and below it |
| "No messages yet" italic | NO RULE | Empty state text |
| "Say something..." chat box with no visible send button | BREAKS | A text box with its own action keeps a small filled action inside at the right; none shown (sends on Enter, invisible) |

### Games: Connect 4 win popup (unverified capture)
Shot: `P/shots-games-record/meadow-mist/_unverified/connect4-record.png` (capture flagged unverified; layout looks intact)

| Piece | Verdict | Note |
|---|---|---|
| "You Win! / Congratulations! / Rematch (filled) / Back to Lobby (outlined)" card over the board | FOLLOWS | Stacked full width, filled on top (narrow) |
| Same card | NO RULE | In-panel modal with no title bar and no ✕ ("Every popup has the ✕ and closes on Esc"): it is neither a Dialog nor a notice |
| Card sits on top of the board and hides "No messages yet" | NO RULE | Overlay placement |

### Games: lobby / friends (Chess lobby)
Shot: `P/shots-games-lobby-record/meadow-mist/lobby-record.png`

| Piece | Verdict | Note |
|---|---|---|
| "You Online  Go Incognito" top row | BREAKS | "Go Incognito" is bare grey text used as a button/switch; "Online" is a bare grey word (status = pill) |
| "ADD A FRIEND" | BREAKS | No capitals |
| Text box "friend's handle" with "Send request" small filled button inside at right | FOLLOWS | Text box with its own action, inside at right (reference example) |
| "Send request" looks greyed (disabled) | NO RULE | Disabled inside-box action state |
| "FRIENDS (1)" | BREAKS | Capitals AND "(1)" brackets; should be "Friends 1" in normal case |
| Friend row: name @handle, "4W - 2L - 1D" chip, "Challenge" outlined button, "..." menu, "Online" under name | NO RULE | People list row (not a setting, not a pick-one menu); rows separated by a line. The record chip "4W - 2L - 1D" and bare "Online" are also off (Status rule) |
| Panel title "Chess" with ‹ back and ✕ | FOLLOWS | Panel title + ✕ |

### Buddy floater (320x480 mini window)
Shots: `P/shots-buddy-floater/meadow-mist/buddy-welcome.png`, `buddy-new-session-form.png`, `buddy-resume-list.png`

| Piece | Verdict | Note |
|---|---|---|
| Welcome: "No Active Session" text + "New Session" (filled) over "Resume Session" (outlined), full width | FOLLOWS | Stacked full width, filled on top (narrow) |
| Filled "New Session" is a washed-out pale green | NO RULE | Looks disabled; nothing in the guide about contrast of filled buttons on this window's background (the capture also flags white text on light green in the manifests) |
| "No Active Session" plain text | NO RULE | Empty state with no explanation |
| New-session form: "PROJECT FOLDER / MODEL / SKIP PERMISSIONS" | BREAKS | Small labels: normal case; also 12px medium grey, not tiny caps |
| Form: dropdowns (folder, model) full width | FOLLOWS | Many/long choices: dropdown; wide controls go full width |
| Form: "Skip permissions" switch on the right beside its label | FOLLOWS | Small controls beside |
| Form: "Cancel" (outlined, left) + "Create Session" (filled, right) side by side | BREAKS | decisions.md: buddy new-session form stacks its buttons; window is 320px so narrow = stacked, filled on top |
| No title and no ✕ on the form and list cards | NO RULE | Floating window cards are not a Dialog; guide names no rule for a floating mini-window |
| Resume list: "RECENT" header + "Back" bare text top right | BREAKS | "RECENT" capitals; "Back" is bare text used as a button (back = ‹ arrow elsewhere) |
| Resume list rows (title, project under it, "60w" at right) | FOLLOWS | Pick-one list: plain rows, no box, no line. "60w" (60 weeks) is an odd age format but is a date at the right |
| Card-in-window shadow | NO RULE | Floating card has a heavy drop shadow, not the medium card shadow |

### Git review + Session Files (side panel, desktop)
Shots: `P/shots-git-review/meadow-mist/git-review-uncommitted.png`, `git-review-commit-expanded.png`

| Piece | Verdict | Note |
|---|---|---|
| Viewer header: list icon + "ChatView.tsx" + 4 icon buttons + ✕ | BREAKS | Panel title should be the shared 16px semibold one-line title with the ✕. This title is small (~13px) and shares the row with 4 unlabeled icon buttons. ✕ itself is present (FOLLOWS) |
| "Session Files (12)" heading | BREAKS | Count rule: "Files 12", never "(12)". Also a second heading level inside a panel that already has a title |
| Session Files list: file cards with thumbnail, truncated name "scroll-...", "created . 7/28/2026" | BREAKS | Cards: name, then a chip row, description. Names cut to 7 characters ("scroll-...", "latency-c...") leave the cards unreadable |
| Search box "Search files..." with filter icon inside | FOLLOWS | Search box with its own filter action inside |
| "Reviewing ch..." title + branch chip "session/ui-consistency-audit" wrapping onto three lines | BREAKS | Chip row never wraps; the title is truncated to "ch..." |
| "Uncommitted changes" fold-out with arrow on the LEFT, "+4 -1" in green/red | BREAKS | Fold-outs: boxed row, arrow on the right. Coloured text (+4 -1) breaks "never coloured body text" (status colours go in tints) |
| Diff view (code with green/red lines, line numbers) | NO RULE | Code/diff display block |
| Diff box inside the Uncommitted box inside the panel | BREAKS | No box inside a box: two nested containers |
| "Include in commit" small checkbox + "Revert Changes..." red text | BREAKS | Red text; bare text button; destructive action should be a button (red button in the main action's place). Left checkbox is not the full-line tappable consent box |
| Commit rows "a1b2c3d chat: c... +4 -1 1d ago" with arrow at left | BREAKS | Same fold-out rule; coloured +/- text; date at the end is OK |
| Expanded commit (diff inside commit box) | BREAKS | Box inside a box again (`git-review-commit-expanded.png`); the expanded diff is cut off by the commit-message area |
| Commit message text area + full-width "Commit 0 staged files" (disabled) | NO RULE | Multi-line form with its submit under it; guide covers a one-line text box with an inside action and "one button full width" but not a text area with submit |
| Hint "Tick 'Include in commit'..." | FOLLOWS | Secondary text |

### Git review, phone width (390px)
Shot: `P/shots-git-review-narrow/meadow-mist/git-review-narrow.png`

| Piece | Verdict | Note |
|---|---|---|
| Same pieces as above, single column, header has "< Files" back word | BREAKS | Inherits every break above (left arrows, coloured +/-, red "Revert Changes...", box-in-box); "< Files" is a bare-text back |
| Title "Reviewing changes for..." truncated + branch chip in a two-line box | BREAKS | Truncation and chip wrap (long-text hard state fails) |
| "Commit 0 staged files" full width, filled but disabled | FOLLOWS | Single button full width |

### Android: hamburger menu and Settings
Shots: `P/shots-android-platform/meadow-mist/android-home.png`, `android-menu.png`, `android-settings.png`, `android-assistant-settings-general-only.png`

| Piece | Verdict | Note |
|---|---|---|
| Settings header "Settings" + ✕ + line | FOLLOWS | Popup title, ✕, tapered line (reference) |
| Settings list: boxed rows with icon, title, hint, chevron at right | FOLLOWS | Settings-style list: boxed rows (reference) |
| "Sync Failing" with a red dot + red number bubble "1" | BREAKS | Status = tinted pill in normal case, no bare words; count never "a number in a bubble" |
| "YouCoded undefined" under About | NO RULE | Missing value shown as the word "undefined" (a bug; also no rule for missing-data text) |
| Hamburger menu: plain icon rows | FOLLOWS | Pick-one menu: plain rows |
| Menu row "Session Files (12)" | BREAKS | Count style: "Files 12", no brackets |
| Red dot on the "Settings" row and on the hamburger | NO RULE | Notification dot badge: guide has none for dots that say "needs attention" |
| Assistant settings dialog with a single "General" row and blank body | FOLLOWS | Shared popup title + ✕ + line; row is a boxed row. Almost empty (one row in a tall panel) is a hard state the guide does not cover |
| Chat home: session pill "fix chat scroll stick +10 v" | NO RULE | Session switcher pill in the top strip |
| Terminal button (top right) | NO RULE | Terminal is explicitly exempt |

### Remote phone
Shots: `P/shots-remote-phone/meadow-mist/remote-phone-home.png`, `remote-phone-menu.png`, `remote-phone-settings.png`

| Piece | Verdict | Note |
|---|---|---|
| "REMOTE" blue pill in the top strip | BREAKS | Status label: normal case ("Remote"), not capitals |
| Bottom chips "UNKNOWN" (red-outlined), "GPT 5.6 Sol", "bug +1", "5h: 34%" and "7d: 12%" in green text | BREAKS | Capitals; coloured text (fixed hues go in tints, never in text); status "UNKNOWN" should be a normal-case tinted pill |
| Chip row wraps to a 2nd line ("Meadow Mist" alone) | BREAKS | Chip row never wraps: one line that fades |
| Quick-action chip row (Journal, Inbox, ...) cut at right edge "Fix Tests" | NO RULE | Horizontal scrolling suggestion chips; no fade-out shown at the cut edge |
| Settings: "Connected . Tailscale" with green dot; "Sync Failing" red dot; "Disabled" grey dot | BREAKS | Status = tinted pill, not bare word with a dot (dot only inside the pill for live statuses) |
| Settings rows, 12 of them, boxed | FOLLOWS | Settings-style list: boxed rows (reference) |
| Menu "Session Files (13)" | BREAKS | Count bracket |
| Message box with attach/compass/mic/send icons | NO RULE | Chat composer is not covered |

### File viewer: image / SVG / PDF (artifact zoom family)
Shots: `P/shots-artifact-zoom/meadow-mist/image-fitted.png`, `image-loupe.png`, `image-zoomed.png`, `svg-loupe.png`; `P/shots-artifact-zoom-ladder/meadow-mist/step-1-50.png` ... `step-6-400.png`; `P/shots-artifact-zoom-lens/meadow-mist/lens-*.png`; `P/shots-artifact-zoom-pdf/meadow-mist/pdf-*.png`; `P/shots-artifact-zoom-scrim/meadow-mist/lens-behind-dialog.png`; `P/shots-artifact-zoom-clicks/meadow-mist/_unverified/*.png`

| Piece | Verdict | Note |
|---|---|---|
| Viewer header: filename (small, plain) + 4 icon buttons + ✕ | BREAKS | Same as git review: panel title not the shared 16px semibold title; ✕ present (FOLLOWS) |
| Floating zoom control pill ("- 28% + lens") over the top right of the image | NO RULE | Floating control cluster on top of content. At 100% and 400% it covers the first line of the picture/PDF |
| Zoom lens (magnifier circle) on the picture | NO RULE | Interactive lens overlay |
| Footer "delivered . 7/28/2026   +4 -1   Review Changes ->" | BREAKS | "Review Changes ->" is bare text used as a button; +4 -1 coloured text; status "delivered/viewed" bare grey word (should be a pill) |
| "Edit" floating filled pill with icon, bottom right (svg-loupe.png) | NO RULE | Floating action button over content; also a pill shape (roundness should come from the theme) |
| PDF pages stacked, white page on green | NO RULE | Document page view |
| Session Files column beside the viewer (image-fitted.png) | BREAKS | Same as git review: "(12)", truncated names, chip and count rules |
| "Settings" panel dimmed behind the lens (lens-behind-dialog.png) | FOLLOWS | Settings left panel + ✕; unverified capture but the panel is intact |
| Body font is the sans-serif here, monospace in other captures | NO RULE | Theme font differs between capture runs; not a guide question, flagged only because it changes how every rule looks |

### Site gallery: Marketplace
Shot: `P/shots-site-gallery/meadow-mist/marketplace.png`

| Piece | Verdict | Note |
|---|---|---|
| Header "Marketplace" (large, LEFT) with logo; "Your Library" pill; "Esc . Back to chat" bare text | BREAKS | Full screens: title centred, small (14px medium) with the screen icon; way out = FILLED button "Esc . Back to chat" top right. (decisions.md says Marketplace has not moved yet) |
| "FEATURED" | BREAKS | No capitals |
| Featured banner "Civic Report" + "View details" filled | FOLLOWS | One filled action; NO RULE for the banner/carousel itself (dots at bottom right, arrows) |
| Carousel arrows (round buttons overlapping the cards) and pagination dots | NO RULE | Carousel controls |
| Tab strip "All 42, Plugins 28, Skills 22 ..." with icons | FOLLOWS | Tab strip; counts "word then fainter number" |
| Dropdowns "Any vibe" and "Everything", search box | FOLLOWS | Dropdown for many choices; search box |
| Section headings "Destin's picks", "If you journal", "For everyday life" with sub-line | FOLLOWS | Large heading. The grey sub-lines and the heading itself nearly vanish on the dark wallpaper (hard state: contrast) |
| Cards: name + "INSTALLED" bare grey caps + star at top right | BREAKS | Status label: tinted pill, normal case. Quick action (star/download) at top right is right (FOLLOWS) |
| Chip row: "Likely safe" + "@destin" (truncated "@de...") | BREAKS | One chip row for ALL short facts, then description; here "93% / 412 / 1 skill / Plugin" sit in a footer line and are not chips. "@de..." is truncated |
| Footer counts "93% 412 ... 1 skill . 1 command" | BREAKS | See above (decisions: footer details become chips in the same row) |
| Cards different heights, some with an extra "Uses the internet . Needs a key" line | NO RULE | Optional extra info line on a card; no rule for where it goes |
| Card shadow | NO RULE | Cards are glassy/translucent on the wallpaper, no visible raised look; medium shadow cannot be confirmed |

### Site gallery: Model picker
Shot: `P/shots-site-gallery/meadow-mist/model-picker.png`

| Piece | Verdict | Note |
|---|---|---|
| Title "Model & Effort" + ✕ + line | FOLLOWS | Popup title (reference) |
| Search box with filter icon, list inside a bordered box | FOLLOWS | Search box; pick-one list with plain rows and the selected row filled (reference) |
| "Manage models..." bare centred text under the list | BREAKS | Follow-up action: full-width outlined button, never bare text |
| "EFFORT LEVEL" | BREAKS | Small label: normal case, no capitals |
| Effort choices Low / Medium / High / Max (disabled) / Auto | FOLLOWS | 2-4 short choices = tab strip; this is 5 choices with one disabled, a stretch of the rule; the disabled "Max" gives no reason |
| "Fast mode" boxed row with switch on the right | FOLLOWS | Setting row: switch beside |
| Hint under the effort strip | FOLLOWS | Secondary text |

### Site gallery: Permissions (Assistant settings popup)
Shot: `P/shots-site-gallery/meadow-mist/permissions.png`

| Piece | Verdict | Note |
|---|---|---|
| Title "Assistant settings" + ✕ + line | FOLLOWS | Popup title |
| Left navigation (General, Cloud providers, Local models, Permissions, Specialists) | NO RULE | Vertical section navigation inside a wide popup: not a tab strip (2-4 choices) and not a settings list |
| "Permissions (i)" heading in the body | NO RULE | Second title inside the popup with an info icon |
| "Enable Skip Permissions Mode?" boxed row + switch at right | FOLLOWS | Setting row, switch beside (reference) |
| "Permission modes" label | BREAKS | A label heading a block of reading text should get the soft underline; this one has none |
| "Permission modes" reading box (paragraphs + bullets + divider + footnote in one box) | NO RULE | Explainer/reading block in a box; a box with a line inside it splits it into two boxes |
| "Always allowed" intro box with the boxed rows below it | BREAKS | Box inside a box: intro text box plus rows nested in the group |
| Fold-out rows "All projects  1 >" and "youcoded  4 >" (arrow on the right) | FOLLOWS | Boxed row, arrow on the right (reference). The bare count "1 / 4" left of the arrow is a number with no word |
| Bottom of the body fades | FOLLOWS | Fade at hidden scroll edge |

### Site gallery: Projects
Shot: `P/shots-site-gallery/meadow-mist/projects.png`

| Piece | Verdict | Note |
|---|---|---|
| Header "Projects" centred, no icon | BREAKS | Should be centred, small, with the icon (centred and small is right; icon missing) |
| "Back to chat . Esc" tinted button, top right | BREAKS | Should be a FILLED small button reading "Esc . Back to chat" (key first); this is unfilled and reversed |
| "PROJECT" label above the name | BREAKS | No capitals |
| Project card: large name with dropdown, underlined path, italic quote | NO RULE | Page header card with an underlined link-like path; underline is not used for a link inside a sentence, and the path opens a folder |
| Stats line "17 files  2 conversations  3 context files  active 7/29/2025" | FOLLOWS | Summary line: bold number then grey word |
| "Synced 2 minutes ago" green pill with dot + green text | BREAKS | Status pill: tinted, but its text is green (coloured text) |
| "Rename" small outlined + "New Conversation" filled at right | FOLLOWS | Actions on the right; one filled |
| Tab strip "Files 17 / Conversations 2 / Instructions & Memories 3" | FOLLOWS | Tab strip, faint number after the word |
| Search with filter icon, "+ Add file" outlined | FOLLOWS | Search box; outlined secondary |
| "Project Files" label + grid/list toggle icons | NO RULE | View-mode (grid/list) icon toggle |
| File/folder tiles (README preview, folder tiles with tab shape) | NO RULE | File/folder tiles are not the "raised card" kind; folder-tab shape is custom |
| Large empty area under the tiles | NO RULE | No rule on empty space |
| Tooltip "Back to chat" stuck open under the left toolbar | NO RULE | Stuck tooltip in the capture (hover artefact) |

### Site gallery: Tags & note
Shot: `P/shots-site-gallery/meadow-mist/tags.png`

| Piece | Verdict | Note |
|---|---|---|
| Title "Tags & note" + ✕ + line | FOLLOWS | Popup title |
| Everything inside a second bordered box within the popup | BREAKS | No box inside a box |
| Search box "Search or create a tag..." | FOLLOWS | Text box |
| Tag rows: dot + coloured tag chip + "pins to top" | NO RULE | User-coloured tags: colours are chosen by the user, not the fixed status hues |
| "Manage tags..." tiny bare text | BREAKS | Follow-up action: outlined button, not bare text |
| Note text area | NO RULE | Multi-line note box |
| "Done" full width but OUTLINED | BREAKS | One button: full width AND it is the main action, so filled |

### Site gallery: Themes
Shot: `P/shots-site-gallery/meadow-mist/themes.png`

| Piece | Verdict | Note |
|---|---|---|
| Title "Themes" + (i) + ✕ + line | FOLLOWS | Popup title + ✕ (info icon is an extra) |
| "FAVORITED THEMES" | BREAKS | No capitals |
| Theme tiles: preview + name + pencil, active one says "active" in green | BREAKS | Status label: a pill in normal case; here bare green text. Quick action (pencil) sits at bottom right, cards put quick actions at top right |
| Theme tiles as cards | NO RULE | Preview tiles (picture-first cards) have no card recipe; different from text-first cards |
| "Browse Theme Marketplace" bare centred text | BREAKS | Follow-up action: outlined full-width button |
| "+ Build New Theme with Claude" full-width filled | FOLLOWS | One main action full width |
| Two actions stacked (a bare text one above a filled one) | NO RULE | Order of a secondary-then-main pair when stacked is defined (filled on top); here the bare one is on top |
| "Reduce Visual Effects" boxed row + switch | FOLLOWS | Setting row |

### Site gallery: Home (chat)
Shot: `P/shots-site-gallery/meadow-mist/home.png`

| Piece | Verdict | Note |
|---|---|---|
| Whole chat screen | NO RULE | Chat, tool cards and the terminal are exempt (Not covered yet) |
| Top-right "12" file-count pill on the Session Files button | BREAKS | "Never a number in a bubble" (decisions.md marks this one as an open follow-up) |
| Bottom status chips ("Sonnet | Auto Effort", "NORMAL", "Priority +1", "2 subagents", "Meadow Mist") | BREAKS | "NORMAL" capitals; chips coloured (orange text "Auto Effort") |

## 2. NO RULE kinds

| Kind | Screens showing it | Example screenshots |
|---|---|---|
| Play surfaces and their overlays (game board, result card, "Press Space" prompt, turn strip, legend) | 8 (2048, Flappy x2, Connect 4 x2, Chess x2) | `P/shots-games-play/meadow-mist/2048-playing.png`, `P/shots-games-death/meadow-mist/flappy-dead.png`, `P/shots-games-arcade/meadow-mist/arcade-chess.png` |
| Empty, almost-empty and disabled states (no messages yet, "No Active Session", one-row leaderboard, a locked card, a nearly empty settings dialog, a large blank area) | 9 | `P/shots-games-arcade-alone/meadow-mist/arcade-leaderboard-alone.png`, `P/shots-buddy-floater/meadow-mist/buddy-welcome.png`, `P/shots-android-platform/meadow-mist/android-assistant-settings-general-only.png` |
| Ranked or people list rows (leaderboard, friends) | 3 | `P/shots-games-arcade/meadow-mist/arcade-leaderboard.png`, `P/shots-games-lobby-record/meadow-mist/lobby-record.png` |
| Floating controls over content (zoom pill, Edit floating button, carousel arrows, dots, lens) | 14 (all file-viewer shots plus Marketplace) | `P/shots-artifact-zoom/meadow-mist/svg-loupe.png`, `P/shots-artifact-zoom-ladder/meadow-mist/step-6-400.png`, `P/shots-site-gallery/meadow-mist/marketplace.png` |
| Floating mini-window / in-panel modal with no title and no ✕ (buddy cards, win card) | 4 | `P/shots-buddy-floater/meadow-mist/buddy-new-session-form.png`, `P/shots-games-record/meadow-mist/_unverified/connect4-record.png` |
| Code, diff and document views (diff block, PDF pages, picture canvas) | 6 | `P/shots-git-review/meadow-mist/git-review-uncommitted.png`, `P/shots-artifact-zoom-pdf/meadow-mist/pdf-base.png` |
| Multi-line text area with its own submit / note (commit message, tag note) | 3 | `P/shots-git-review/meadow-mist/git-review-uncommitted.png`, `P/shots-site-gallery/meadow-mist/tags.png` |
| Vertical section navigation inside a wide popup (Assistant settings left list) | 1 | `P/shots-site-gallery/meadow-mist/permissions.png` |
| Reading/explainer blocks (Permission modes text box, hint paragraphs, an intro box above rows) | 3 | `P/shots-site-gallery/meadow-mist/permissions.png` |
| Picture-first tiles (theme previews, file and folder tiles, game thumbnails) | 3 | `P/shots-site-gallery/meadow-mist/themes.png`, `P/shots-site-gallery/meadow-mist/projects.png` |
| Notification dots and attention badges (red dot on Settings, hamburger, top-strip pills) | 4 | `P/shots-android-platform/meadow-mist/android-menu.png`, `P/shots-remote-phone/meadow-mist/remote-phone-menu.png` |
| User-coloured tags | 1 | `P/shots-site-gallery/meadow-mist/tags.png` |
| Horizontal scrolling chip row with no fade at the cut edge (quick prompts) | 3 | `P/shots-remote-phone/meadow-mist/remote-phone-home.png`, `P/shots-android-platform/meadow-mist/android-home.png` |
| Grid/list view toggle icons, session switcher pill, chat composer | 3 | `P/shots-site-gallery/meadow-mist/projects.png`, `P/shots-android-platform/meadow-mist/android-home.png` |
| Missing-data text ("YouCoded undefined", "60w" age) and stuck tooltips | 3 | `P/shots-android-platform/meadow-mist/android-settings.png`, `P/shots-site-gallery/meadow-mist/projects.png` |

## 3. BREAKS

| Rule broken | Count (pieces) | What the screens do | Example screenshots |
|---|---|---|---|
| Small labels: normal case, no spaced-out capitals | 15 | PIPES CLEARED, SCORE/BEST, GAME CHAT, ADD A FRIEND, FRIENDS (1), PROJECT FOLDER/MODEL/SKIP PERMISSIONS, RECENT, FEATURED, EFFORT LEVEL, PROJECT, FAVORITED THEMES, INSTALLED, REMOTE, UNKNOWN, NORMAL | `P/shots-games-arcade/meadow-mist/arcade-leaderboard.png`, `P/shots-buddy-floater/meadow-mist/buddy-new-session-form.png`, `P/shots-site-gallery/meadow-mist/model-picker.png` |
| Status label: small tinted pill in normal case (no bare grey/green words, no dot beside plain text) | 12 | "Jake is online", "Online", "Sync Failing", "Connected . Tailscale", "Disabled", "active", "INSTALLED", "delivered/viewed", "Synced" text is green | `P/shots-games-arcade/meadow-mist/arcade-picker.png`, `P/shots-android-platform/meadow-mist/android-settings.png`, `P/shots-site-gallery/meadow-mist/themes.png` |
| Bare or underlined words used as buttons (follow-up action = full-width outlined button) | 11 | Sign in, Go Incognito, Back (buddy), Manage models..., Manage tags..., Browse Theme Marketplace, Review Changes ->, < Files, Revert Changes..., Back to chat . Esc (Projects), Esc . Back to chat (Marketplace) | `P/shots-games-arcade-signedout/meadow-mist/arcade-picker-signedout.png`, `P/shots-site-gallery/meadow-mist/model-picker.png`, `P/shots-site-gallery/meadow-mist/tags.png` |
| Coloured text (fixed hues go in tints, never in text; no red body text) | 8 | +4 -1 in green/red (git review, viewer footer), red "Revert Changes...", green "5h: 34% / 7d: 12%", green "active", green "Synced 2 minutes ago", orange "Auto Effort" | `P/shots-git-review/meadow-mist/git-review-uncommitted.png`, `P/shots-remote-phone/meadow-mist/remote-phone-home.png`, `P/shots-artifact-zoom/meadow-mist/image-loupe.png` |
| Counts: "Files 12", never "(12)" and never a number in a bubble | 8 | Session Files (12) x4 screens, FRIENDS (1), "12" pill on the header button, "1" red bubble on Backup & Sync, bare "1 / 4" on permission rows | `P/shots-git-review/meadow-mist/git-review-uncommitted.png`, `P/shots-android-platform/meadow-mist/android-menu.png`, `P/shots-android-platform/meadow-mist/android-settings.png` |
| No box inside a box | 6 | Uncommitted changes box holding a diff box; expanded commit; Tags & note content box; Permissions "Always allowed" intro box plus rows; Permission modes box with an inner line; picker list inside a bordered box | `P/shots-git-review/meadow-mist/git-review-commit-expanded.png`, `P/shots-site-gallery/meadow-mist/tags.png`, `P/shots-site-gallery/meadow-mist/permissions.png` |
| Fold-out: boxed row, arrow on the right | 3 | Git review "Uncommitted changes" and commit rows have arrows on the LEFT and are not boxed setting rows | `P/shots-git-review/meadow-mist/git-review-uncommitted.png` |
| Full screens: title centred, small, with icon; filled "Esc . Back to chat" top right | 2 | Marketplace: title big and left, bare text way out. Projects: centred but no icon, unfilled, key on the right | `P/shots-site-gallery/meadow-mist/marketplace.png`, `P/shots-site-gallery/meadow-mist/projects.png` |
| Popup/panel title: shared 16px semibold line with ✕ | 3 | Viewer/git review header is a small filename beside four icon buttons (Games panel title looks smaller than 16px too) | `P/shots-git-review/meadow-mist/git-review-uncommitted.png`, `P/shots-artifact-zoom/meadow-mist/image-fitted.png` |
| Two buttons: filled on the right, outlined directly left; stacked in narrow (<420px) with filled on top | 2 | Play again / Back to games centred with filled on the left in a 420px panel; buddy Cancel/Create side by side in a 320px window | `P/shots-games-death/meadow-mist/flappy-dead.png`, `P/shots-buddy-floater/meadow-mist/buddy-new-session-form.png` |
| One button: full width AND filled when it is the main action | 1 | Tags & note "Done" is outlined | `P/shots-site-gallery/meadow-mist/tags.png` |
| Notices: one tinted box with a title, action inside at the right; errors follow error standards | 3 | Signed-out notice untinted with "Sign in" bottom-left; degraded cards give a truncated reason with no Retry | `P/shots-games-arcade-signedout/meadow-mist/arcade-picker-signedout.png`, `P/shots-games-arcade-degraded/meadow-mist/arcade-picker-degraded.png` |
| Chip row never wraps / one row of facts under the name; footer details become chips | 4 | Marketplace card facts sit in a footer line; branch chip wraps to 3 lines; remote status chips wrap to a second line | `P/shots-site-gallery/meadow-mist/marketplace.png`, `P/shots-git-review/meadow-mist/git-review-uncommitted.png`, `P/shots-remote-phone/meadow-mist/remote-phone-home.png` |
| Text box with its own action keeps a small filled button inside at the right | 1 | "Say something..." game chat has no visible send | `P/shots-games-arcade/meadow-mist/arcade-connect4-board.png` |
| Reading-section labels get a soft underline | 1 | "Permission modes" is plain | `P/shots-site-gallery/meadow-mist/permissions.png` |
| Hard state: long text | 4 | File names cut to about 7 letters in Session Files; "Reviewing ch..."; "@de..."; "Can't reach the game ser..." | `P/shots-git-review/meadow-mist/git-review-uncommitted.png`, `P/shots-games-arcade-degraded/meadow-mist/arcade-picker-degraded.png` |
| Quick actions at top right of a card | 1 | Theme tiles: pencil at bottom right | `P/shots-site-gallery/meadow-mist/themes.png` |

## 4. Could not judge

- `P/shots-games-before/meadow-mist/_unverified/*.png`, `P/shots-games-before-signedout/meadow-mist/_unverified/*.png`: "before" experiment folders; not viewed by instruction.
- `P/shots-games-record/meadow-mist/_unverified/connect4-record.png` and `P/shots-site-gallery/meadow-mist/_unverified/connect4.png`: captures flagged unverified by the harness. The record shot was viewed and judged with that caveat; `connect4.png` turned out to be the plain Games picker, not a Connect 4 screen (wrong picture), so it adds nothing beyond `arcade-picker.png`.
- `P/shots-artifact-zoom-clicks/meadow-mist/_unverified/four-clicks.png` and `then-zoom-out.png`: unverified; `four-clicks.png` viewed, only a zoom state. `then-zoom-out.png` not opened (same viewer chrome).
- Exact sizes (title 16px, medium shadow, 14px roundness, 4/8/12/16/24 spacing, 6px between rows) cannot be measured from a picture; only the visible look was judged. Where a size could not be confirmed it is marked as such.
- Not opened individually (same screen as a viewed sibling, differing only by zoom or lens position): `image-zoomed.png`, `lens-off-picture.png`, `lens-outside-pane.png`, `lens-over-picture.png`, `pdf-loupe.png`, `pdf-zoomed.png`, ladder steps 1 to 5. Midnight and light themes were not opened.
- Mobile phone captures show a mobile browser layout; the real Android app's native pieces (system status bar etc.) are not in the pictures.
