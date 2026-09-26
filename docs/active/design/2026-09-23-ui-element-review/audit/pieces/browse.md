# Pieces audit: Browse and Library screens

Scope: Library, Marketplace, Projects, Resume, Pages, theme browser, session switcher, project switcher, Add-a-project popup. Rules come from `guide-draft.md`; decisions from `decisions.md`. Read-only: I only viewed pictures. Theme: meadow-mist (a wallpaper theme) unless noted.

`P` = `/home/destin/youcoded-dev/worktrees/sessions/ui-consistency-audit/scratch/pieces-audit`

Verdicts: **F** = FOLLOWS, **B** = BREAKS, **N** = NO RULE. Pieces that plainly follow a rule are skipped unless they are the reference example.

Recurring things (not repeated in every row): (a) every full screen except Projects/Pages page views names itself LEFT, not centered; (b) the way-back control is bare text, or reads "Back to chat · Esc" (key on the right); (c) small spaced-out capital labels are everywhere; (d) "INSTALLED" is plain capital grey text, not a tinted pill.

## 1. Tables by screen

### Your Library, plugins tab
Shots: `P/shots-main/meadow-mist/library.png` (same screen: `P/shots-empty-marketplace/meadow-mist/library.png` empty state)

| Piece | Verdict | Note |
|---|---|---|
| Screen title "Your Library" | B | Full-screen title rule: centered, 14px, with icon, in the top strip. Here: left-aligned, larger, no icon, in a coloured band. |
| "Marketplace" button, top right | B | Filled (tinted) on this tab but outlined on the Themes tab: same button, two looks. Sits beside the way-back control. |
| "Esc · Back to chat" | B | Rule: filled small button. Here bare text, no fill. |
| Plugins 9 / Themes 3 tab strip | F | Shared tab strip; count is word then faint smaller number (the rule's example). |
| Full-width pale band holding only the tab strip | N | A whole-width sub-header band that carries a tab strip. |
| "Favorites" / "Installed" headings | F | Large heading, 18px. But "Installed" is dark text straight on dark wallpaper and nearly unreadable (no panel behind it). |
| Plugin card: raised, thin border, shadow, star top right | F | Raised card; quick action (star) top right. |
| "INSTALLED" on each card | B | Status = small tinted pill, normal case. Here capitals, plain grey, no tint. |
| Author as bare grey line ("@destin"), category chip AFTER the description, likes/downloads under that | B | Chips (author, kind, numbers) belong in ONE row right under the name, then the description. Here the order is name, author, description, chip, numbers. |
| Empty state: "Star an installed plugin and it appears here." and "Nothing installed yet." + small outlined "Browse the Marketplace" | N | Empty state on a section of a full screen: message plus one action. Text-only, no icon, small outlined button. |

### Your Library, themes tab
Shots: `P/shots-main/meadow-mist/library-themes.png`, `P/shots-empty-marketplace/meadow-mist/library-themes.png`

| Piece | Verdict | Note |
|---|---|---|
| Theme card with colour-swatch strip on top | N | Image-first card whose picture is a palette strip. |
| Theme card text: name + "INSTALLED", author, description, "87 downloads 120 likes" | B | Same as plugin card: caps status, numbers as loose text not chips. |
| Card with empty description (Meadow Mist) | N | Card with no description leaves a blank gap; no rule for missing optional text. |
| "Favorite themes" / "Installed themes" headings | F | Large heading. Same legibility problem on wallpaper. |

### Marketplace: home grid
Shots: `P/shots-marketplace-overhaul/meadow-mist/grid.png` (same as `P/shots-main/meadow-mist/marketplace.png`)

| Piece | Verdict | Note |
|---|---|---|
| Title "Marketplace" + GitHub avatar (with red dot), left | B | Not centered, not the screen's own icon. The avatar with a dot is a sign-in/account marker: N for that part. |
| "Your Library" button and "Esc · Back to chat" | B | Outlined cross-link next to bare-text way back; way back should be the filled button. |
| Featured banner: "FEATURED" label | B | Spaced-out capitals. |
| Featured banner as a whole (big title, description, carousel dots) | N | A hero/promo banner with rotating dots. Its title is a bigger size than the three heading levels. |
| "View details" filled button at bottom-left of banner, nothing on the right | B | Rule: a filled button never sits alone at bottom-left. |
| Filter bar: tab strip with counts, two dropdowns, search | F | Tab strip + count style + dropdown for many choices + search. |
| The bar itself (raised panel holding tabs + dropdowns + search) | N | A "filter bar" container; strip inside a box inside the page. |
| "Destin's picks" heading | F | Large heading (the guide's own example). |
| Grey subtitle "What I'm using this week." under a Large heading; "Capture, recall, connect." | N | A caption under a section heading. On wallpaper it is close to invisible. |
| Horizontal shelf with round ← → arrows floating over cards, last card cut off | N | Scrolling shelf with overlay arrows. |
| Card top line: name + star or download icon at right | F | Quick action top right. |
| Card chip row right under name ("Likely safe", "@de…") | F | This is the reference for chips-under-name. Chip truncates ("@de…") rather than wraps, as the rule wants. |
| Card extras: "Uses the internet · Needs a key" grey line, then likes/downloads, then "1 skill · 1 command" at right | B | Facts outside the chip row: at most one chip row, then description (two lines). Here a second and third row of facts under the description. |
| "INSTALLED" | B | Caps, no pill. |
| Name truncated hard to make room ("Civic Rep…", narrow) | N | No rule for what shrinks first (name vs status) when the top line is full. |

### Marketplace: themes, search results, Skills tab
Shots: `P/shots-main/meadow-mist/marketplace-themes.png`, `P/shots-marketplace-overhaul/meadow-mist/search-split.png`, `.../skills-tab.png`

| Piece | Verdict | Note |
|---|---|---|
| "7 results" / "2 results" / "22 results" line | N | A result-count line above a grid. |
| Theme cards (swatch strip, name, author, description, numbers) | B | Author and numbers are loose text, not chips; some cards have no text at all under the name. |
| Card with a grey "Skill" word under the name, then chips, then description, then a "Part of Superpowers" chip below the description | B | Kind should be a chip in the one row under the name; a chip after the description breaks the order. Cards in one row are built differently (some have the "Skill" line, some do not). |
| Selected tab with filled pill, count "22" | F | Tab strip and count rule. |
| Cards with no likes/downloads (e.g. "Superpowers … Runs on its own") | N | Card with missing stats: layout jumps. |

### Marketplace: item details popup
Shots: `P/shots-marketplace-overhaul/meadow-mist/detail.png`, `.../detail-caution.png`, `.../detail-feedback.png`

| Piece | Verdict | Note |
|---|---|---|
| Title "Details" + "Esc · Close" text at right | B | Popup rule: ✕ button at right; close is never words. Title style is plain small, not 16px semibold. Tapered line is present (F for that). |
| Item name, "Plugin" caption, chip row (Likely safe, YouCoded, @destin) | F | Chip row under the name. But the item name is a 4th heading size. |
| Star, share (icons) and "Uninstall" outlined / "Install" filled at right of the title block | F | Filled action on the right, one filled button. (Star/share icon pair: N.) |
| "WHAT THIS CAN DO", "ABOUT", "WHAT'S INSIDE", "FEEDBACK" | B | Spaced-out capital labels. |
| Grey box listing what the plugin can do (icon + line each) | N | A facts-list panel with icons. |
| Caution version: "Caution 2" amber chip | F | Tinted status chip. |
| Caution version: "The automatic check flagged:" with amber dots inside the same grey box | B | Every warning = the one tinted box with matching border. Here a divider line and coloured dots inside a plain grey box; no tinted warning box. |
| Tag chips "#research #personal #ai Personal For everyone" (two chip looks, wrapping) | N | Category/tag chips in two visual styles, one darker. |
| "WHAT'S INSIDE" box with underlined words "civic-report" | N | Underlined words used as links to open something inside a list, not inside a sentence. |
| "Helpful" / "Not for me" outlined pair, "Sign in to vote" grey text | N | Vote/reaction buttons. |
| Comment thread: letter avatar, name, date at right, text | N | Comments list. |
| "Sign in to comment" box + "Post comment" as bare grey text under it | B | A text box's own action goes inside the box at right as a small filled button; less-important actions are outlined, never bare text. |
| Theme item detail (`P/shots-marketplace/meadow-mist/marketplace-theme-detail.png`): broken-image strip showing the alt text "Cotton Candy Sky preview", row of colour squares, large empty area | N | Image failed to load: no error box, no retry; the rest of the popup is empty with no message. Heart, star, share are three icon buttons with different looks (heart has no border). |

### Marketplace: phone width
Shots: `P/shots-marketplace-overhaul-narrow/meadow-mist/grid-narrow.png`, `.../filters-narrow.png`, `.../detail-narrow.png`

| Piece | Verdict | Note |
|---|---|---|
| Header: title, bookmark (Library) icon button, square ✕ | N | The phone version of a full-screen header. The guide only defines the desktop strip. |
| Search box with filter icon inside at right | F | Action inside the box, at the right. |
| Filters bottom sheet: title "Filters", bare "Clear all" text at right, no ✕ | B | Every popup has ✕; actions are never bare text. |
| "TYPE", "VIBE", "SHOW" labels | B | Spaced-out capitals. |
| Tab strip inside the sheet runs off the edge ("Specialists" cut) | N | Tab strip wider than the screen; no rule for scrolling strips (no fade shown). |
| "Apply" full-width filled | F | One button = full width. |
| Detail popup: "Details" + ✕ | F | Shared popup header. |
| Star, share, "Uninstall" in a left-aligned row under the description | B | Actions live on the right; a filled/selected star sits left. |
| Cards: name cut to 8 letters ("Civic Rep…"), chip shows shield icon only | N | Truncation priorities. "INSTALLED" itself: B (caps). |
| Section captions in dark grey on wallpaper | N | Hard to read (same as desktop). |

### Marketplace: empty
Shot: `P/shots-empty-marketplace/meadow-mist/marketplace.png`, `P/shots-marketplace/meadow-mist/marketplace-empty.png`

| Piece | Verdict | Note |
|---|---|---|
| Heading "Explore everything" then a blank wallpaper | N | Empty or failed load with no message at all, no retry. I cannot tell from the picture whether it is meant as empty or failed. |
| Tabs all show "0" | F | Count style. |

### Projects: header card and Files tab
Shots: `P/shots-main/meadow-mist/projects.png`, `P/shots-project-files-any-size/meadow-mist/files-docs.png`

| Piece | Verdict | Note |
|---|---|---|
| Title "Projects" centered in the top strip | F | Reference for full-screen title. (No icon beside it.) |
| "Back to chat · Esc" tinted button | B | Rule: filled, reads "Esc · Back to chat" (key on the left). |
| Hover tooltip "Back to chat" under the left icon | N | Tooltips. |
| "PROJECT" label | B | Spaced-out capitals. |
| Project name "youcoded ▾" (switcher) | N | Screen identity header with a dropdown switcher. Its size is a 4th heading level. |
| Folder path with dotted underline | B | Underlined text used as a button/link outside a sentence. |
| Italic quoted description | N | Description text in italics. |
| "17 files  2 conversations  3 context files  active 7/29/2025" | F | Summary line: bold number, grey word. |
| "Synced 2 minutes ago" green pill with dot | F | Live status pill with dot. |
| "Rename" small outlined + "New Conversation" filled at far right | F | Filled on the right; secondary outlined. |
| The whole header is one raised card | F | Card. |
| Files / Conversations / Instructions & Memories tab strip | F | Tab strip; counts. |
| Search box with filter icon inside, "+ Add file" outlined at right | F | Action inside box at right; secondary outlined. |
| "Project Files" label and grid/list icon toggle | N | View toggle (grid vs list) icon pair. Label itself: F (small label). |
| File cards with page preview and folder tiles that show first 3 filenames | N | File/folder tiles with content previews. They look flat (thin border, shadow not visible), so B for "raised card, medium shadow" is possible; not certain from the picture. |
| "deleted" tag on a struck-through file (files-docs) | N | Tag laid over a card for a deleted item. |
| Breadcrumb "Project Files / docs" | N | Breadcrumb. |
| Filter popover (`projects-file-filter.png`): "Filters", "TYPE", "SORT BY", chips | B | Caps labels. Popover itself: N (small anchored panel without ✕ or tapered line). Chips: F. |

### Projects: Conversations tab and error
Shots: `P/shots-main/meadow-mist/projects-conversations.png`, `P/shots-conversation-previews/meadow-mist/projects-conversations-list.png`, `P/shots-project-files-any-size/meadow-mist/files-locked.png`

| Piece | Verdict | Note |
|---|---|---|
| Conversation row: title, coloured tag chips, model + size, date bottom right | F | Date bottom right (the rule's example). Quick actions top right are not visible in this picture (may be hover-only): cannot tell. |
| Tag chips in yellow, red, blue | N | User-coloured tag chips (colours are not status colours). |
| Rows are full-width boxes, flat | N | Rows for things you open: card or row? The guide is silent on which. |
| Error in Files: red dot + "Your computer won't let YouCoded open this folder (permission denied)." + small "Retry" inside one small tinted box | B | Box is tinted and holds its Retry at the right (F), but it uses a red dot marker and is narrow and centered, not the standard notice box inside the thing; it is a stand-alone strip. Partial break. |

### Projects: Instructions & Memories tab
Shot: `P/shots-main/meadow-mist/projects-context.png`

| Piece | Verdict | Note |
|---|---|---|
| "ABOUT CONTEXT" info box with ⓘ and ✕ | F | Tinted info box with matching border. |
| Label "ABOUT CONTEXT" | B | Capitals. |
| Dismiss ✕ inside a notice | N | Dismissible notice. |
| "PROJECT INSTRUCTIONS  May be loaded…" and "GLOBAL INSTRUCTIONS  Loaded before…" with ⓘ at far right | B | Capital label with a grey sentence on the same line; ⓘ icon far away. Small label should be 12px normal case. |
| Rows: icon tile, name, chip ("Always", "When editing desktop/src/renderer/**"), description, size at right | N | File list rows with icon tile and chips. Long chip text is cut off by width. |

### Projects: switcher, Add project, editor, "How context works", conversation preview
Shots: `P/shots-overlays/meadow-mist/projects-switcher.png`, `projects-add-project.png`, `projects-context-editor.png`, `projects-how-context-works.png`, `projects-conversation-preview.png`

| Piece | Verdict | Note |
|---|---|---|
| Switcher: search box "Jump to project…" with "esc" key chip, no title, no ✕ | N | A quick-switcher / palette popup (search + list). Closes on Esc but has no ✕ or title. |
| Group label "RECENT" | B | Capitals. |
| Switcher rows: letter tile, name, path, italic description, "17 files · 5 chats", coloured dot, ✓ on the selected row | F | Plain rows; selected row differs. Coloured dots (green, red, grey) with no words: N (a status dot with no label; red is unexplained). |
| "+ Add a project" row at the bottom | N | An action row at the foot of a list. |
| Add a project: title "Add a project" | B | Title is small, regular weight, no ✕, no tapered line. |
| "Start something new" box with name field and small filled "Create" inside the field at right | F | Action inside the box at right, small filled. But the field is a box inside an option box inside a popup: B for no box-in-box. |
| "Use a folder already on this computer" as a whole highlighted box | N | An option card that acts as a button. |
| "Cancel" as bare text bottom right | B | Less-important actions are outlined, never bare text. |
| CLAUDE.md popup: "Edit" filled left of "Reveal", "Copy path" outlined, then ✕ | N | Toolbar of actions in a popup header (filled comes first, left). Body appears blurred/empty in the picture: could not judge the body. |
| "How context works": title + ✕ + tapered line | F | Shared popup header. |
| Left nav (Overview, CLAUDE.md, AGENTS.md…), selected tinted | F | Plain rows, selected differs. |
| Stack of four boxes with "↓" between them | N | An explainer diagram made of cards and arrows. |
| Bottom tinted note with ⓘ, bold first sentence | F | Notice. |
| Conversation preview popup: title underlined dotted with pencil, tag + ✓ icons, ✕ | N | Inline-editable title. Otherwise F for ✕. |
| Preview: chat bubbles | N | Transcript view (outside guide). |
| Preview foot: "MODEL", "SKIP PERMISSIONS", "LAUNCH IN NEW WINDOW" caps labels + switches at right | B | Caps labels; switches on the right is F. The whole foot is a bordered box inside the popup (N). |
| "Resume Session" full-width filled | F | One button = full width. |

### Resume Session popup
Shots: `P/shots-main/meadow-mist/resume-browser.png`, `resume-browser-stress.png`, `P/shots-resume-preview/meadow-mist/resume-preview-selected.png`, `resume-preview-stress.png`

| Piece | Verdict | Note |
|---|---|---|
| Title "Resume Session" at top left of the list pane; no ✕, no tapered line | B | Shared popup: 16px semibold title, ✕ at right, tapered line. Only Esc closes it. |
| "SHOW COMPLETE" + switch at right | B | Capitals (switch beside label at right: F). |
| Search box; "Projects ▾", "Tags ▾", "Most recent ⇅" pills | F | Search box; shared filter chips/dropdowns. |
| Session rows: title, tag chips, folder / model / size, date bottom right, tag + ✓ icons top right | F | Reference for conversation card corners. |
| Row title with dotted underline + pencil | N | Inline-editable title. |
| Small "note" chip with a pencil-note emoji | N | Note marker using an emoji. |
| "Not synced to this device yet" as plain grey line in place of the meta line | B | A notice about one item sits inside it as the tinted box. Here plain text. |
| Long title cut with "…" | F | Long text handled. |
| List fades at the bottom | F | Fade at hidden edge. |
| Selected row with green outline | F | Selected looks different. |
| Right pane: "Pick a conversation to read it here before you resume." | N | Placeholder for an empty detail pane. |
| Preview pane: sticky floating header card over chat bubbles | N | Selected item header overlapping a transcript. |
| Resume panel (bordered box) with "MODEL", switches, "Resume Session" | B | Caps labels; nested box. Full-width filled button: F. |

### Session switcher (dropdown from the top bar)
Shot: `P/shots-overlays/meadow-mist/shift-session-switcher.png`

| Piece | Verdict | Note |
|---|---|---|
| "SESSIONS IN THIS WINDOW" | B | Capitals. |
| Rows: title + pencil, tag chips, folder / model | F | Plain rows, no box; selected row differs. |
| "Working" / "Inactive" pills with coloured dot | F | Live status pill with dot (the guide's example). |
| "Resume" and "+ New Session" as two bare text halves at the bottom | B | Bare-text buttons; no outlined/filled pair. |
| Drag dots and ✕ on the last row | N | Reorder/close hover controls. |
| Strip of coloured dots at top | N | Session dot strip (a status legend with no labels). |

### Skills / commands drawer (bottom sheet)
Shots: `P/shots-main/meadow-mist/skills-drawer.png` (same: `P/shots-marketplace/meadow-mist/skills-drawer.png`)

| Piece | Verdict | Note |
|---|---|---|
| Bottom sheet with a drag handle, no title, no ✕ | N | Bottom sheet. |
| Search box with pencil and store icons inside at right | N | Icon actions inside a search box (not a filled button). |
| Filter chips "Personal Work Development Admin Other ★ Favorites only" | F | Shared filter chips. |
| "FAVORITES", "ALL INSTALLED" | B | Capitals. |
| Cards: name, store + star top right, description, category chip at the bottom | B | Chip should be right under the name; here after the description. Quick actions top right: F. |
| Cards run off the bottom, first card darker | N | Hover/selected look: can't tell which. |

### Themes popup (Settings > Appearance)
Shots: `P/shots-main/meadow-mist/settings-appearance.png`, `theme-about.png`, `theme-edit-community.png` (this last one was drawn in a dark purple theme, not meadow-mist)

| Piece | Verdict | Note |
|---|---|---|
| "Themes" title, ⓘ and ✕, tapered line | F | Shared popup header (reference). |
| "FAVORITED THEMES" | B | Capitals. |
| Theme tiles with name bottom-left, pencil at right, "active" in green text | B | Status label is bare green text, not a tinted pill. Tile with pencil: N (image tiles). |
| "Browse Theme Marketplace" as bare centered text | B | Follow-up action: full-width outlined button, never bare text. |
| "✦ Build New Theme with Claude" full-width filled | F | One button full width. |
| "Reduce Visual Effects" row: switch at right, hint below | F | Shared setting row. |
| Body fades at the bottom edge | F | Fade. |
| "About Appearance": ‹ back arrow + title + ✕ | F | Header OK. Back arrow inside a popup: N. |
| "WHAT'S A THEME?", "WHAT THE SETTINGS DO" | B | Caps; for reading sections the rule wants normal case with a soft underline. |
| "Edit: Halftone Dimension": ‹, title, ✕ | F | Header. |
| Purple info box at top | F | Tinted notice. |
| "GLASS", "TERMINAL" | B | Capitals. |
| Slider rows: label left, slider, value right; sliders start at different places | B | Wide controls go below the title, full width; here beside it, and their left edges are not aligned. Large empty area below. |

### Manage pages (Pages library)
Shots: `P/shots-pages/meadow-mist/library.png`, `P/shots-pages-narrow/meadow-mist/library.png` (phone)

| Piece | Verdict | Note |
|---|---|---|
| Icon + "Manage pages" at top left | B | Rule: centered in the strip, small (14px). Here left and bigger; own header band. |
| "Make a page" pale filled button + "Esc · Back" bare text | B | Way back should read "Esc · Back to chat" as a filled button; here bare text and shorter. |
| "PERSONAL", "YOUCODED" group labels | B | Capitals; and they head big groups on a full screen, which the guide says take the Large 18px heading. |
| Page card: icon tile, name, 2-line description, ✎ and pin at top right | F | Quick actions top right (the guide's example). |
| Card foot "Personal · Updated 6 d ago · 1 connection" as one grey line | B | Short facts belong in the chip row under the name; date bottom right. Here plain text at the foot. |
| Cards look flat (thin border, shadow not visible) | B | Raised medium shadow: not clearly seen. Low confidence. |
| Filled vs outline pin icon | N | Pin toggle shown only by icon fill. |
| Phone version: cards full width, same anatomy | F | Cards keep order. |

### Pages: landing, empty, and phone
Shots: `P/shots-pages-empty-one-action/meadow-mist/landing.png`, `P/shots-pages-empty-phone/meadow-mist/landing.png`, `P/shots-pages-floating/meadow-mist/bleed-idle.png`

| Piece | Verdict | Note |
|---|---|---|
| "Pages" centered in strip (no icon) | F | Title rule (icon missing). |
| "Back to chat · Esc" tinted, key on the right | B | Rule: "Esc · Back to chat". |
| Phone: "Back to chat" wraps onto three lines and squeezes the title | B | Way back must be one small button; fails at 390px. |
| Intro card: icon tile, "PAGES" label, heading, two paragraphs | B | "PAGES" is spaced-out capitals. Card itself as first-run explainer: N. |
| "Make a page" full-width filled, paler than other filled buttons | F | One button = full width. Its fill looks washed out (like disabled); other filled buttons are darker. |
| "No page selected / Pick one from the list, or create a page." | N | Empty detail pane: bold line + hint, no action button. |

### Pages: view screens and side rail
Shots: `P/shots-pages/meadow-mist/page-planner.png`, `page-timer-from-library.png`, `page-paint.png`; `P/shots-pages-layouts/meadow-mist/layout-rail.png`; `P/shots-pages-narrow/meadow-mist/page-timer.png` (phone); `P/shots-pages-connections/meadow-mist/connected-fresh.png`, `connected-failed.png`

| Piece | Verdict | Note |
|---|---|---|
| Top strip: page icon + name, centered | F | The reference. |
| Freshness note in the strip "· 2m ↻" / "· now ↻" | N | Data-age + refresh indicator. |
| "Couldn't update · 3h ↻" in the strip | B | A failure shown as plain grey text; the guide wants the tinted notice inside the thing, with its retry inside. |
| Left rail "PERSONAL" / "YOUCODED" | B | Capitals. |
| Rail rows: icon, name, pin; selected tinted | F | Plain rows for pick-one; selected differs. |
| Rail foot: "+ Create a page" filled (pale) over "Manage pages" outlined | F | Stacked, filled on top, full width. |
| Page kit header: "PERSONAL" label over the page title | B | Capitals. |
| Toolbar ‹ Today › and "Add event" filled at right | F | Filled on the right. |
| Day columns each holding event cards | B | Boxes inside boxes. |
| Event blocks with a coloured left strip (blue, purple, red, green) | B | "Never a coloured strip." |
| "Work / Home / Health / Social" colour dots + "16 events this week  1 done  15 still to do" | F | Bold number, grey word (stat line). Dot legend: N. |
| Done event struck through and dimmed | N | Completed-item look. |
| Focus timer: "FOCUS" label, "Ready" tinted pill | B | Caps label (pill itself F). |
| Timer ring + "25:00" | N | Dial/graphic. |
| "5 min / 15 min / 25 min 50 min" separate chips | B | 2–4 short choices should be the shared tab strip. |
| "Reset" bare text + "Start" filled at right | B | Secondary is outlined, never bare text. |
| "TODAY / 0 sessions finished" darker tile | N | Stat tile (also a second box under a box). |
| Trip board / Weather rows: bordered rows inside a bordered card | B | Box inside a box. |
| Paint studio: "STUDIO", "COLOUR", "BRUSH", "SHORTCUTS", "THIS PAINTING" | B | Capitals. |
| Paint: "Undo" tinted, "Redo" faded, "Clear" bare text, "Save as picture" filled | B | Bare-text and non-outlined secondary buttons. |
| Paint: colour swatches, tool rail of icons, key-cap chips ("B brush") | N | Colour picker, tool palette, keyboard-hint chips. |
| Paint: "Size 6 px" / "Opacity 100%" label over a full-width slider | F | Wide control below title. |
| Hover tooltip "Back to chat" covering the page's own header | N | Tooltip overlap. |
| Phone: timer page cut off at the right edge, list rail eats most of the width | N | No rule for what a Page does at 390px; content is clipped. |
| Phone: top-strip title truncated ("Focus ti…") with wrapped "Back to chat" | B | Same as landing: way back must stay one line. |
| Phone menu (`pages-narrow/menu.png`): plain rows with icons, red dot on Settings | F | Plain rows menu. Red dot: N. |

### Page permissions ("wants to connect") screens
Shots: `P/shots-pages-connections/meadow-mist/approve-*.png` (approve-saved-key, approve-new-key-full, approve-key-step, approve-change, approve-open-internet, approve-on-phone), `after-allow.png`

| Piece | Verdict | Note |
|---|---|---|
| Card label "BEFORE THIS PAGE OPENS", "ONE MORE STEP", "THIS PAGE CHANGED" | B | Capitals. |
| "NEW" / "ALREADY ALLOWED" sub-labels in bold caps | B | Capitals. |
| Permission text in a tinted box with border, inside the centered card | F | Tinted notice. (Nested in a card: N.) |
| "Continue" / "Allow and open" filled full width over "Not now" outlined | F | Stacked, filled on top. |
| "Back" outlined under the filled button | F | Secondary is outlined. |
| "Reach any website…" box: bullets, no tick box before "Allow and open" | B | A risky grant should use the "I understand" tick-box line. Box has the same tint as the mild ones (no warning look). |
| Key step: text box "Paste your Todoist key" with the disabled "Allow and open" below it | N | A form: input + main action outside the box. The guide's "action inside the box" covers Set/search/send, not this. |
| "Finish on your computer" as a disabled-looking filled block holding a message | B | A message dressed as a disabled button; should be a tinted notice. |
| Numbered instructions list | N | Steps list. |

### Page connections and saved-keys popups
Shots: `P/shots-pages-connections/meadow-mist/card-connections.png`, `card-connections-remove.png`, `settings-saved-keys.png`; edit/create: `P/shots-pages-view/meadow-mist/create-dialog.png`, `edit-dialog.png`

| Piece | Verdict | Note |
|---|---|---|
| "Trip board · connections" title, ✕, tapered line | F | Shared popup. |
| Address box with "Remove" (outlined) and "Connect" (filled) inside at right | F | Buttons inside the box at the right. |
| Remove confirm: "Never mind" outlined + red "Remove" | F | Destructive red on the right, outlined beside it. Two buttons sit side by side though the popup is narrow (~420): the rule says stack. |
| Footer "Saved keys are kept under Settings › Account › Connected services." | N | Breadcrumb-style pointer in grey text. |
| "Connected services": ‹, title, ✕ | F | Header. |
| GitHub row: logo, name, hint, small filled "Connect…" at right | F | Setting row. |
| "KEYS SAVED FOR PAGES" | B | Capitals. |
| Saved key row with outlined "Delete" | N | Immediate delete on a list row, not red, no confirm shown. |
| Create a page / Edit Week planner popup: title, subtitle, ✕, tapered line | F | Shared popup. |
| "PROJECT FOLDER", "MODEL", "SKIP PERMISSIONS" | B | Capitals. |
| Dropdowns below their labels; switch at right | F | Wide control below; small control beside. |
| "Cancel" outlined left + wide "Create Session" filled right, side by side | B | Narrow popup: stack, filled on top; and the filled one should hug its label. |
| Edit popup's button reads "Create Session" | N | Wrong wording for an edit; a copy rule question, not a look. |

### Chat cards with Preview / Resume (seen behind Pages shots)
Shots: `P/shots-pages/meadow-mist/landing-empty.png` (this file shows the chat, not a Pages landing), `P/shots-conversation-previews/meadow-mist/drawer-preview-panel.png`

| Piece | Verdict | Note |
|---|---|---|
| "Preview" outlined left of "Resume" filled, at right | F | Wide pair: filled on the right, outlined beside it. |
| Greyed "Resume" + "Project folder not on this device" as plain grey text | B | Notice about one item should be the tinted box inside that item. |
| Preview side panel (tag, ✓, expand, ✕ icons; bordered resume box at the bottom) | N | Side panel with a transcript. Title bar is left-aligned bold; the ✕ is there (F). |

## 2. NO RULE kinds

| Kind | Screens | Examples |
|---|---|---|
| Empty state (message with or without one action; a blank area with no message) | Library plugins/themes, Marketplace empty, Pages "No page selected", Resume right pane, theme popup rest | `P/shots-empty-marketplace/meadow-mist/library.png`, `.../marketplace.png`, `P/shots-pages-floating/meadow-mist/bleed-idle.png` |
| Inline-editable title (dotted underline + pencil) | Resume rows, conversation preview, session switcher | `P/shots-main/meadow-mist/resume-browser.png`, `P/shots-overlays/meadow-mist/projects-conversation-preview.png` |
| Hero / promo banner with carousel dots; horizontal shelf with overlay arrows | Marketplace grid (2 shots) | `P/shots-marketplace-overhaul/meadow-mist/grid.png` |
| Image-first cards (colour swatch strip, page previews, folder tiles) | Library themes, Marketplace themes, Project files | `P/shots-main/meadow-mist/library-themes.png`, `.../marketplace-themes.png`, `.../projects.png` |
| Filter bar (tabs + dropdowns + search in one panel) and result-count line | Marketplace (4 shots) | `P/shots-main/meadow-mist/marketplace-themes.png`, `P/shots-marketplace-overhaul/meadow-mist/search-split.png` |
| Quick-switcher / palette popup and anchored small popovers (no title, no ✕) | Project switcher, file filter popover, skills drawer bottom sheet | `P/shots-overlays/meadow-mist/projects-switcher.png`, `P/shots-main/meadow-mist/projects-file-filter.png`, `P/shots-main/meadow-mist/skills-drawer.png` |
| Icon-only actions and toggles (grid/list, pin, star/share/heart, pencil, tool rails) | Projects, Pages, Marketplace detail, Themes popup, Paint | `P/shots-pages/meadow-mist/library.png`, `P/shots-pages/meadow-mist/page-paint.png` |
| Status shown by a dot or icon with no words | Session dot strip, project dots, pin fill, account red dot | `P/shots-overlays/meadow-mist/projects-switcher.png`, `.../shift-session-switcher.png` |
| Option card that acts as a button; explainer diagram of cards with arrows | Add a project, How context works | `P/shots-overlays/meadow-mist/projects-add-project.png`, `.../projects-how-context-works.png` |
| Facts/permissions list panels with icons; tag or category chips in two looks | Marketplace detail | `P/shots-marketplace-overhaul/meadow-mist/detail.png`, `.../detail-caution.png` |
| Feedback: vote buttons, comment thread, key-cap chips | Marketplace detail, Paint | `P/shots-marketplace-overhaul/meadow-mist/detail-feedback.png` |
| Freshness / refresh note in the top strip; tooltips | Pages, all full screens | `P/shots-pages-connections/meadow-mist/connected-fresh.png`, `P/shots-pages/meadow-mist/page-paint.png` |
| Phone-width header for a full screen; scrolling tab strip; long-name truncation priority | Marketplace narrow, Pages narrow | `P/shots-marketplace-overhaul-narrow/meadow-mist/grid-narrow.png`, `.../filters-narrow.png`, `P/shots-pages-narrow/meadow-mist/page-timer.png` |
| Text sitting straight on a wallpaper (headings, captions with no panel behind) | Library, Marketplace | `P/shots-main/meadow-mist/library.png`, `P/shots-marketplace-overhaul/meadow-mist/grid.png` |
| Editable-list rows for things you open (file rows) versus cards | Projects context and conversations | `P/shots-main/meadow-mist/projects-context.png`, `.../projects-conversations.png` |
| Failed image / broken preview; stepwise form with input + action | Marketplace theme detail, Page key step | `P/shots-marketplace/meadow-mist/marketplace-theme-detail.png`, `P/shots-pages-connections/meadow-mist/approve-key-step.png` |
| Slider rows (label, slider, value) beside the label; timer dial; stat tiles | Theme edit, Focus timer | `P/shots-main/meadow-mist/theme-edit-community.png`, `P/shots-pages/meadow-mist/page-timer-from-library.png` |

## 3. BREAKS, grouped by rule

| Rule | Count (screens) | What the screens do | Examples |
|---|---|---|---|
| No spaced-out capital labels (Headings, Small label) | 19 | Capital labels: PROJECT, FEATURED, WHAT THIS CAN DO, TYPE, RECENT, SHOW COMPLETE, MODEL, PERSONAL, FAVORITES, BEFORE THIS PAGE OPENS, GLASS… | `P/shots-main/meadow-mist/projects.png`, `P/shots-marketplace-overhaul/meadow-mist/detail.png`, `P/shots-overlays/meadow-mist/projects-switcher.png` |
| Status label = small tinted pill, normal case | 6 | "INSTALLED" in capitals with no tint; "active" as bare green text | `P/shots-main/meadow-mist/library.png`, `.../marketplace-themes.png`, `.../settings-appearance.png` |
| Full-screen title centered, small, with icon | 4 | Left-aligned, larger, icon missing or wrong (Library, Marketplace, Manage pages); Projects and Pages have no icon | `P/shots-main/meadow-mist/library.png`, `P/shots-pages/meadow-mist/library.png` |
| Way back = filled button "Esc · Back to chat" | 9 | Bare text, or "Back to chat · Esc", or "Esc · Back"; three lines at phone width | `P/shots-main/meadow-mist/projects.png`, `P/shots-pages/meadow-mist/library.png`, `P/shots-pages-empty-phone/meadow-mist/landing.png` |
| Popup: shared title, ✕, tapered line | 6 | No ✕: Resume, Add a project, project switcher, Filters sheet; "Esc · Close" text in Marketplace details | `P/shots-main/meadow-mist/resume-browser.png`, `P/shots-overlays/meadow-mist/projects-add-project.png`, `P/shots-marketplace-overhaul/meadow-mist/detail.png` |
| Card text order: one chip row under the name, then description | 6 | Author as bare text, numbers as loose text, kind chips after the description, extra rows of facts | `P/shots-main/meadow-mist/library.png`, `P/shots-marketplace-overhaul/meadow-mist/skills-tab.png`, `P/shots-pages/meadow-mist/library.png` |
| Secondary actions outlined, never bare text | 8 | "Cancel", "Clear all", "Post comment", "Reset", "Clear", "Browse Theme Marketplace", "Resume / + New Session" | `P/shots-overlays/meadow-mist/projects-add-project.png`, `P/shots-marketplace-overhaul-narrow/meadow-mist/filters-narrow.png`, `P/shots-main/meadow-mist/settings-appearance.png` |
| No box inside a box | 5 | Day columns holding event cards; rows inside a card; option box holding a field; resume box in a popup | `P/shots-pages/meadow-mist/page-planner.png`, `P/shots-pages-connections/meadow-mist/connected-failed.png`, `P/shots-overlays/meadow-mist/projects-add-project.png` |
| Never a coloured strip | 1 | Coloured left strip on calendar events | `P/shots-pages/meadow-mist/page-planner.png` |
| Every warning = the one tinted box; notice about an item sits inside it | 5 | Grey "Not synced to this device yet" text; "Couldn't update" text in the title strip; a warning list in a grey box; a disabled-looking button carrying a message; unusual red-dot strip for the folder error | `P/shots-main/meadow-mist/resume-browser-stress.png`, `P/shots-pages-connections/meadow-mist/connected-failed.png`, `P/shots-marketplace-overhaul/meadow-mist/detail-caution.png` |
| Filled button never alone bottom-left / actions live on the right | 2 | Featured banner "View details"; phone detail action row | `P/shots-marketplace-overhaul/meadow-mist/grid.png`, `P/shots-marketplace-overhaul-narrow/meadow-mist/detail-narrow.png` |
| Two buttons stack in narrow popups, filled on top | 2 | Create/Edit a page; Remove confirm; side by side at 420px | `P/shots-pages-view/meadow-mist/create-dialog.png`, `P/shots-pages-connections/meadow-mist/card-connections-remove.png` |
| Text box with own action: inside the box | 1 | Comment box with the action as bare text below | `P/shots-marketplace-overhaul/meadow-mist/detail-feedback.png` |
| Underlined text is only a link in a sentence | 1 | Dotted-underlined folder path as an action | `P/shots-main/meadow-mist/projects.png` |
| 2–4 short choices = tab strip | 1 | Timer presets as four separate chips | `P/shots-pages/meadow-mist/page-timer-from-library.png` |
| Wide settings controls below the title | 1 | Theme sliders beside their labels and misaligned | `P/shots-main/meadow-mist/theme-edit-community.png` |
| "I understand" before a risky action | 1 | "Reach any website" grant has no tick box | `P/shots-pages-connections/meadow-mist/approve-open-internet.png` |
| Raised card with medium shadow | 2 (low confidence) | File cards and Page cards look flat | `P/shots-main/meadow-mist/projects.png`, `P/shots-pages/meadow-mist/library.png` |
| Heading ladder: three levels | 3 | Big item name in the detail popup and hero banner; project name; "PERSONAL/YOUCODED" should be Large | `P/shots-marketplace-overhaul/meadow-mist/detail.png`, `P/shots-main/meadow-mist/projects.png` |

## 4. Could not judge

- `P/shots-pages/meadow-mist/landing-empty.png`: shows the chat view with resume cards, not a Pages landing. The real landing is `P/shots-pages-empty-one-action/meadow-mist/landing.png`.
- `P/shots-overlays/meadow-mist/projects-context-editor.png`: body of the CLAUDE.md popup is blurred/empty in the picture.
- `P/shots-main/meadow-mist/theme-edit-community.png` was captured in a dark purple theme, not meadow-mist; layout still judged.
- `P/shots-pages-connections` "Connected services" popup is captured at the Settings level over a blurred Settings drawer; not the pages screen itself.
- Not opened (looked like near copies): `shots-pages-floating` idle/page/rail/sheet/bleed variants other than `cards-projects.png`, `sheet-page.png`, `bleed-idle.png`; `shots-pages-view` view/view-idle/view-switched/view-focus-unfocus; `shots-pages/page-timer.png`, `page-planner` on light/midnight; `shots-pages-layouts/_unverified/*` (unverified captures); all light and midnight themes except one dark shot. Their verdicts are assumed the same as their meadow-mist twins; not verified.
- Hover-only controls (quick actions on conversation rows, card hover states) are not visible in any picture, so they were not judged.
- `shots-main/session-files*`, `home`, `settings-*` other than Appearance, `tool-*`, `permissions-*` are outside this scope.
