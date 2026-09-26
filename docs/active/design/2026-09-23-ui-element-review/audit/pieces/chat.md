# Pieces audit: chat and overlays (meadow-mist)

Scope: shots-main (chat/composer/drawers/popovers), shots-overlays, shots-bubbles, shots-narrow, shots-helper-asks*, shots-cc-subagents, shots-tag-chip, shots-statusbar-relevance, shots-chatsearch-gate-*, shots-model-brand, shots-chatgpt-signin, shots-openrouter-*, shots-latency, shots-tall.
Read only. Rules from `guide-draft.md`; decisions from `decisions.md`. Tool cards, permission prompts (Yes / Always Allow / No) and the terminal view are EXEMPT ("Not covered yet"), so they are listed only as NO RULE / exempt, never as BREAKS.

Path prefix `S/` = `/home/destin/youcoded-dev/worktrees/sessions/ui-consistency-audit/scratch/pieces-audit/`. Every screenshot is `S/<plan>/meadow-mist/<file>.png`.

Verdict key: FOLLOWS / BREAKS / NO RULE. Pieces that plainly follow a rule are mostly skipped.

## 1. Table

### Chat home (message list, message box, status bar, header) — `S/shots-chatsearch-gate-main/meadow-mist/ask-scaffold.png`, `S/shots-cc-subagents/meadow-mist/bar.png`, `S/shots-main/meadow-mist/composer-typed.png`, `S/shots-main/meadow-mist/find-bar.png`
| screen | piece | verdict | note |
|---|---|---|---|
| chat home | message box with attach / mic / filled round send at right | FOLLOWS | text box with its own action inside, at right (reference) |
| chat home | quick-chip row above the message box (Journal, Inbox ... + pencil) | NO RULE | KIND: strip of shortcut chips that act as buttons, not card facts |
| chat home | status bar chips (Sonnet \| Auto Effort, NORMAL, Priority +1, 2 subagents, Meadow Mist, 5h 42%, Cost, In/Out...) | NO RULE | KIND: dense row of tiny status chips; mixed colours, some coloured text (green / amber percentages) |
| chat home | "NORMAL" chip | BREAKS | all-capitals label; guide says normal case, no capitals |
| chat home | header: round "12" number bubble on the Session Files button | BREAKS | "never a number in a bubble" (decisions H-4 leaves it open "with status/badges") |
| chat home | header: Chat / Terminal toggle, session strip with dots, "+10" pill, window buttons | NO RULE | KIND: main-window top bar and session switcher strip; the guide only covers full-screen titles |
| chat home | quoted-conversation cards inside assistant bubble: Preview (outlined) left of Resume (filled), date at bottom right | FOLLOWS | filled on right, outlined left; date bottom right |
| chat home | those cards sit inside a bubble and hold a boxed row each (bubble > card > row) | BREAKS | "no box inside a box" |
| chat home | greyed "Resume" (disabled) with "Project folder not on this device" as plain grey text | NO RULE | KIND: per-item unavailable state (a disabled action plus a reason line) |
| chat home | "Deliverables 4" row | FOLLOWS | word then smaller fainter number |
| chat home | "Ran a command · git status", "Running 2 sub-agents" collapsed rows | NO RULE | exempt tool cards ("not final") |
| chat home | user and assistant message bubbles | NO RULE | KIND: message bubble; guide has no chat-content recipe |
| chat home | "Thinking" pill ("Simmering...", "Percolating...") bottom-left of the list | NO RULE | KIND: live activity indicator |
| chat home | "Started with this project's rules and 3 skills ... Details" strip (find-bar shot) | BREAKS | bare-text "Details" action at the right; also a coloured dot leads a strip-like banner (amber dot in the small-context variant) |
| chat home | find bar (search box, 1/6, up/down, drawn ✕) | NO RULE | KIND: floating find-in-page bar; ✕ is present |

### Message-box states — `S/shots-overlays/meadow-mist/composer-attachments.png`, `S/shots-main/meadow-mist/edit-quick-chips.png`
| screen | piece | verdict | note |
|---|---|---|---|
| composer with attachments | attachment tiles (thumbnail, file name, small ✕ corner) | NO RULE | KIND: removable attachment tile |
| Edit Quick Chips popup | title, ✕, tapered line | FOLLOWS | shared popup |
| Edit Quick Chips popup | boxed rows with "×" letter on each row | NO RULE | KIND: removable row inside an editable list (× is a small letter, not the ✕ button) |
| Edit Quick Chips popup | "+ Add Chip" centred bare text | BREAKS | follow-up action should be a full-width outlined button, never bare text |
| Edit Quick Chips popup | text of each chip cut with "..." in a right-hand hint | NO RULE | long-text truncation inside a boxed row |

### Popups from the chat: Model & Effort, Tags & note, Status Bar Widgets, Submit a ticket — `S/shots-model-brand/meadow-mist/model-dialog.png`, `S/shots-main/meadow-mist/tags-note-popover.png`, `S/shots-main/meadow-mist/customize-status-bar.png`, `S/shots-overlays/meadow-mist/development-bug-report.png`
| screen | piece | verdict | note |
|---|---|---|---|
| Model & Effort | title, ✕, tapered line | FOLLOWS | shared popup |
| Model & Effort | model dropdown drawn as a bordered box holding a search box and a list, inside the popup | BREAKS | "no box inside a box" (search box inside list box inside popup) |
| Model & Effort | selected model row solid green, others plain | FOLLOWS | pick-one menu: plain rows, selected differs |
| Model & Effort | "Manage models..." bare text centred at the foot of the list | BREAKS | bare-text action (follow-up should be outlined button) |
| Model & Effort | "EFFORT LEVEL" spaced capitals | BREAKS | small label: 12px grey, normal case |
| Model & Effort | five-choice strip (Low Medium High Max Auto), Max greyed | BREAKS | 2-4 choices = tab strip, 5 is "many" = dropdown; disabled option has no reason shown |
| Model & Effort | Fast mode boxed row with switch at right | FOLLOWS | small control beside title and hint |
| Tags & note | title, ✕ | FOLLOWS | shared popup |
| Tags & note | whole body wrapped in a second inner box, with a text box, a list and another text box inside it | BREAKS | "no box inside a box" |
| Tags & note | tag list rows with coloured ring/dot + coloured tag chip; "pins to top" 10px hint at right | NO RULE | KIND: multi-pick list with colour chips |
| Tags & note | "Manage tags..." tiny bare text | BREAKS | bare-text action |
| Tags & note | single "Done" button, outlined, full width | BREAKS | a lone main action is full width AND filled |
| Status Bar Widgets | "ALWAYS ON", "RATE LIMITS", "SESSION", "TOKENS" | BREAKS | spaced capitals; should be 12px grey normal case |
| Status Bar Widgets | tick-circle + name + (i) rows, list scrolls with fade | NO RULE | KIND: checklist of on/off items with tick on the left (not a consent box, not a switch) |
| Status Bar Widgets | fade at scroll edge | FOLLOWS | content fades at the hidden edge |
| Submit a ticket | Bug / Feature tab strip | FOLLOWS | 2 choices = tab strip |
| Submit a ticket | "INCLUDE WITH TICKET" capitals | BREAKS | spaced capitals |
| Submit a ticket | boxed rows with tick box at the right of each | NO RULE | KIND: opt-in toggles as tick rows; guide's tick rule (tick left) covers only "I understand" |
| Submit a ticket | "Review ticket" full-width filled, disabled, hint line above | FOLLOWS | single button full width; hard state (disabled) shown with a reason |
| Submit a ticket | field labels "Title" / "Description" small grey normal case | FOLLOWS | small label style |

### Resume Session and conversation previews — `S/shots-main/meadow-mist/resume-browser.png` (not opened), seen: `S/shots-tag-chip/meadow-mist/tag-resume.png`, `S/shots-tag-chip/meadow-mist/tag-resume-stress.png`, `S/shots-chatsearch-gate-narrow/meadow-mist/preview-narrow.png`, `S/shots-chatsearch-gate-main/meadow-mist/preview-error.png`, `S/shots-chatsearch-gate-main/meadow-mist/gallery-find.png`
| screen | piece | verdict | note |
|---|---|---|---|
| Resume Session popup | title "Resume Session" with no ✕ visible | BREAKS | every popup has the ✕ |
| Resume Session popup | "SHOW COMPLETE" spaced capitals + switch in the header row | BREAKS | capitals; switch beside a label in a header rather than a setting row |
| Resume Session popup | search box, Projects / Tags / Most recent filter chips | FOLLOWS | shared filter chips, theme roundness |
| Resume Session popup | conversation cards: title with dotted underline + pencil, tag and note buttons top right, date bottom right | FOLLOWS | quick actions top right, date bottom right |
| Resume Session popup | chips (Priority, bug, idea) sit under the title, source line under them | FOLLOWS | one chip row right under the name |
| Resume Session popup | dotted underline under every conversation title | NO RULE | KIND: rename-by-click hint; looks like a link |
| Resume Session popup | "Not synced to this device yet" plain grey line on a card | NO RULE | KIND: item-level unavailable note (should it be the notice box?) |
| Resume Session popup | empty right pane: "Pick a conversation to read it here before you resume." | NO RULE | KIND: empty-state message |
| conversation preview (side panel) | header row with list icon, title, tag icon, check icon, expand icon, ✕ | FOLLOWS | ✕ at right; panel title one line |
| conversation preview | "Session Files (12)" heading with bracket count | BREAKS | "Never '(17)'" |
| conversation preview | error box "Couldn't read this transcript..." with red dot, Retry pill inside at right, long path overflows the box (cut off at right edge) | BREAKS | notice buttons inside at right = OK, but coloured dot instead of tinted box, no title; long text overflows (hard state) |
| conversation preview | "Resume Session" full width filled below a "MODEL" caps label and a "SKIP PERMISSIONS (i)" caps label + switch | BREAKS | spaced capitals x2 |
| conversation preview | "Choose a model..." dropdown with disabled Resume Session (no model chosen) | FOLLOWS | disabled main action until choice made (hard state shown) |
| conversation preview | "Hide list" tooltip | NO RULE | tooltip, KIND: hover label |

### Session switcher (drawer) — `S/shots-narrow/meadow-mist/all-sessions.png` (not opened), seen: `S/shots-overlays/meadow-mist/_unverified/close-session-prompt.png` (actually the drawer open), `S/shots-tag-chip/meadow-mist/tag-sessions-menu.png`
| screen | piece | verdict | note |
|---|---|---|---|
| session drawer | list of plain rows, selected row tinted | FOLLOWS | pick-one switcher: plain rows |
| session drawer | "Working" / "Inactive" pills with coloured dot inside | FOLLOWS | live status pill with dot |
| session drawer | "SESSIONS IN THIS WINDOW" spaced capitals | BREAKS | small label, normal case |
| session drawer | Resume / + New Session as two equal halves along the bottom, bare | BREAKS | buttons: filled on right / outlined; here neither is filled or outlined, they are a split bare bar |
| session drawer | tag chips (Priority, work, bug, idea) at the end of a line | FOLLOWS | chip style |
| session drawer | "All Sessions" floating tooltip pill beside the drawer | NO RULE | KIND: floating hint pill |
| session drawer | list fades at the bottom edge | FOLLOWS | fade at hidden edge |

### Right-click menus and command drawer — `S/shots-overlays/meadow-mist/ctx-menu-user-bubble.png`, `S/shots-chatsearch-gate-main/meadow-mist/context-menu-preview.png`, `S/shots-main/meadow-mist/command-drawer-slash.png`, `S/shots-narrow/meadow-mist/skills-drawer.png`
| screen | piece | verdict | note |
|---|---|---|---|
| context menus | Ask about this / Copy Ctrl+C / Select all: plain rows, icon left, shortcut right | FOLLOWS | plain rows in menus |
| skills drawer | search box with pencil + store icon at right, no ✕ | NO RULE | KIND: bottom sheet / drawer (has a drag handle, no ✕, no title) |
| skills drawer | category chips (Personal, Work ... "Favorites only") | FOLLOWS | filter chips |
| skills drawer | "FAVORITES" / "ALL INSTALLED" spaced capitals | BREAKS | small label normal case |
| skills drawer | skill cards: name, store and star icons top right | FOLLOWS | quick actions top right |
| skills drawer | source chip ("Superpowers") at the bottom of the card, below the description | BREAKS | chip row goes right under the name, then description |
| skills drawer | long name cut off behind icons ("Dispatching Parallel Agent" collides with the store icon) | BREAKS | long-text hard state: name runs under the quick-action icons |
| skills drawer | cards flat with thin border | NO RULE | cannot confirm the medium shadow at this zoom; not judged |

### Permission and ask cards in chat (exempt) — `S/shots-bubbles/meadow-mist/approval.png`, `S/shots-helper-asks-narrow/meadow-mist/bottom.png`, `S/shots-tall/meadow-mist/_unverified/tool-gallery.png`
| screen | piece | verdict | note |
|---|---|---|---|
| approval bubble | Yes (green) / No (red) pills | NO RULE | exempt: permission prompts keep today's look; note two coloured fills, green and red, are not the theme's filled/outlined |
| helper asks | Yes / Always Allow (blue) / No (red) pills | NO RULE | exempt |
| helper asks | approval card inside a bubble inside a bubble | NO RULE | exempt tool card |
| tool gallery | ask-question card: filled "Submit" at left, bare-text "Dismiss" at right | BREAKS | decision BP-5: outlined Dismiss directly left of filled Submit at the right; Dismiss is bare text |
| tool gallery | ask-question options as boxed rows with radio circles, "Add a note..." boxed text field | NO RULE | KIND: single-choice list with a note field |
| tool gallery | "Couldn't send" and "SendUserFile failed: ..." in red text | BREAKS | never red body text |
| tool gallery | tool card rows, grouped rows | NO RULE | exempt |

### Chat banners (errors) — `S/shots-openrouter-trust/meadow-mist/chat-credit-short.png`, `S/shots-openrouter-trust/meadow-mist/chat-key-expired.png`, `S/shots-openrouter-trust/meadow-mist/chat-request-refused.png`, `S/shots-chatgpt-signin/meadow-mist/chatgpt-plan-limit.png`, `S/shots-overlays/meadow-mist/native-session-stalled-and-permission.png`
| screen | piece | verdict | note |
|---|---|---|---|
| credit / key-expired banners | red-bordered tinted box, grey text, small filled action at right | FOLLOWS | one tinted box with matching border; text normal grey; action inside at right |
| credit / key-expired banners | sits as a loose bubble in the message list with no title | NO RULE | KIND: error message inside the chat flow (guide says a notice about one thing sits inside that thing) |
| request refused | box holds long text and no action | FOLLOWS | notice box; no Retry offered (see error standards) |
| plan-limit banner | "Upgrade plan" bare text left of filled "Switch Providers" | BREAKS | secondary action beside a main one must be outlined, not bare |
| stalled banner | Retry filled left, Stop outlined right | BREAKS | filled goes on the right, outlined directly left |
| stalled banner | busy dots icon at left of message | NO RULE | inline loading indicator |
| small-context strip | amber dot + text + bare "Details" | BREAKS | bare-text action; strip-like banner rather than the tinted box |
| status bar | "PERMISSION UNKNOWN" red text in red-bordered chip | BREAKS | spaced capitals + red text |

### Chat usage card and provider status — `S/shots-chatgpt-signin/meadow-mist/chatgpt-usage-card.png`
| screen | piece | verdict | note |
|---|---|---|---|
| usage card in chat | "SESSION USAGE" capitals, timestamp at right | BREAKS | spaced capitals |
| usage card in chat | two percentage bars (green) with percentages in green text | NO RULE | KIND: meter / progress bar; coloured text used for values (guide: status hues go in tints, never in text) |
| usage card in chat | card is a bordered box inside a bubble-like frame | BREAKS | box inside a box |

### Cloud providers page (from sign-in plans) — `S/shots-openrouter-signin/meadow-mist/si-failed.png`, `S/shots-openrouter-signin/meadow-mist/si-waiting.png`, `S/shots-chatgpt-signin/meadow-mist/providers-chatgpt-blocked.png`, `S/shots-openrouter-trust/meadow-mist/card-rejected.png`
Assistant-settings screens are the settings scope's job; only the sign-in pieces are judged here.
| screen | piece | verdict | note |
|---|---|---|---|
| provider cards | error line "Sign-in timed out. Try again ..." in RED body text on the card | BREAKS | error goes in the tinted notice box inside the item, text normal grey, actions inside at right |
| provider cards | "OpenRouter didn't accept this key..." red text | BREAKS | same |
| provider cards | "Your workspace admin has turned off Codex for this account." red text | BREAKS | same |
| provider cards | red dot next to "Cloud providers" heading and on the left menu | NO RULE | KIND: attention dot (no label, colour only) |
| provider cards | small outlined buttons My Account / Preferences / Sign out; filled "Sign in with OpenRouter" next to outlined "API Key" | FOLLOWS | filled on right, outlined left of it |
| provider cards | "Waiting for the browser..." with busy dots and Cancel outlined at right | FOLLOWS | notice-like waiting state, action right |
| provider cards | "Add provider" centred bare text | BREAKS | follow-up action should be full-width outlined button |
| provider cards | progress bars in green / amber with coloured percentage text | NO RULE | meter (see above) |
| Replace OpenRouter key modal | title, ✕, numbered steps, key box, Connect filled on top, Cancel outlined below, full width | FOLLOWS | narrow popup stacks, filled on top |
| Replace OpenRouter key modal | key text box with Connect as a separate button below, not inside the box | BREAKS | a text box with its own action keeps it inside at right (arguable: it is a modal's main action) |
| Replace OpenRouter key modal | "openrouter.ai" as a link inside a sentence | FOLLOWS | underlined/colour link only inside sentence |

### First-run and splash — `S/shots-overlays/meadow-mist/first-run-install-prerequisites.png`, `S/shots-chatgpt-signin/meadow-mist/first-run-chatgpt-waiting.png`
| screen | piece | verdict | note |
|---|---|---|---|
| first run | centred "YouCoded" wordmark, one-line sentence, thin progress bar with "100%" | NO RULE | KIND: full-window setup / progress screen |
| first run (chatgpt waiting) | grey-green rounded box "A browser window should have opened..." with busy dots | BREAKS | a waiting message uses a hand-shaped, very round box unlike the shared notice (corner far rounder than the notice) |

### Local models damage / delete states — `S/shots-overlays/meadow-mist/local-models-delete-confirm.png`, `S/shots-overlays/meadow-mist/local-models-resuming.png`
| screen | piece | verdict | note |
|---|---|---|---|
| local models list | "Download interrupted" solid orange strip across the top of a card | BREAKS | "never a coloured strip" |
| local models list | "Damaged" solid red strip across the top of a card | BREAKS | same |
| local models list | delete warning: red-bordered box with RED body text | BREAKS | body text never red |
| local models list | Keep (outlined) and Delete model (solid red) as two equal-width halves, filled on the right | BREAKS | wide-popup pairs hug their labels at the right edge; equal halves rejected (BW-1) |
| local models list | small outlined red "Delete" buttons with red text | BREAKS | red used as text colour on a button outside a confirm (guide: status hues in tints, not text) |
| local models list | "Settings" bare text button beside outlined Delete | BREAKS | secondary must be outlined, never bare |
| local models list | "Add vision (0.9 GB)" underlined text used as a button | BREAKS | underlined text is only a link inside a sentence |
| local models list | "2.4 GB" dotted underline (tooltip) | NO RULE | KIND: hover-hint underline |
| local models list | "Why can't this be resumed?" with (i) icon, small grey | BREAKS | fold-outs are a boxed row with arrow at right |
| local models list | "Runs fast - fits on your GPU" green text | BREAKS | coloured body text |
| local models list | green download progress bar inside card | NO RULE | meter |

### Narrow (phone width) chat — `S/shots-narrow/meadow-mist/session-files.png`, `S/shots-narrow/meadow-mist/tags.png`, `S/shots-narrow/meadow-mist/model-picker.png`, `S/shots-narrow/meadow-mist/skills-drawer.png`, `S/shots-helper-asks-narrow/meadow-mist/bottom.png`
| screen | piece | verdict | note |
|---|---|---|---|
| narrow session files | popup title with (12), ✕, search box with filter icon inside at right, file rows with thumbnail | FOLLOWS (except brackets) | filter action inside the search box; title style |
| narrow session files | "Session Files (12)" | BREAKS | bracket count |
| narrow session files | row-level ✕ on the first file row | NO RULE | per-row remove |
| narrow session files | thumbnails "PDF" / "LOG" placeholder tiles | NO RULE | KIND: file-type placeholder tile |
| narrow chat home | status bar wraps onto 2 rows, quick-chip row cut at the right edge ("Fix Tests" clipped) | NO RULE | overflow behaviour of chip strips (chip row must fade rather than clip) |
| narrow Tags & note | same nested-box layout, Done full width outlined | BREAKS | box in box; lone action not filled |
| narrow Model & Effort | effort strip 5 items squeezed in one row | BREAKS | 5 choices should be a dropdown |
| narrow permission cards | Yes / Always Allow / No pills | NO RULE | exempt |

### Search-in-past-conversations pieces — `S/shots-chatsearch-gate-main/meadow-mist/referenced-list.png`, `S/shots-chatsearch-gate-main/meadow-mist/gallery-show.png`, `S/shots-chatsearch-gate-main/meadow-mist/tag-sheet.png`
| screen | piece | verdict | note |
|---|---|---|---|
| tag sheet (popover on panel button) | small dropdown popover with search, tag list, note box; no title, no ✕ | NO RULE | KIND: anchored popover (not a popup) |
| referenced list | left column list "Referenced conversations / Draft the newsletter / Permission ask timeout" as plain rows, selected tinted | FOLLOWS | pick-one list: plain rows |
| referenced list | "Referenced conversations" tiny label | FOLLOWS | small label (normal case) |
| side panel | title, tag icon (outlined, selected), check, expand, ✕ | FOLLOWS | close ✕ at right |

### Not seen / could not judge
See section 5.

## 2. NO RULE kinds

| KIND | screens | examples |
|---|---|---|
| Status-bar / small chip rows (many tiny coloured chips, some caps, some coloured text) | ~8 | `S/shots-cc-subagents/meadow-mist/bar.png`, `S/shots-model-brand/meadow-mist/statusbar.png`, `S/shots-statusbar-relevance/meadow-mist/bar-native-metered.png` |
| Chat message content (bubbles, quoted-conversation cards, thinking pill, timestamps) | ~10 | `S/shots-main/meadow-mist/composer-typed.png`, `S/shots-chatgpt-signin/meadow-mist/chatgpt-usage-card.png`, `S/shots-bubbles/meadow-mist/approval.png` |
| Error / notice as a loose message in the chat flow (guide only covers notices inside an item or setting) | 5 | `S/shots-openrouter-trust/meadow-mist/chat-credit-short.png`, `.../chat-key-expired.png`, `S/shots-chatgpt-signin/meadow-mist/chatgpt-plan-limit.png` |
| Main window top bar and session switcher strip (not a full screen title) | all chat screens | `S/shots-main/meadow-mist/find-bar.png`, `S/shots-overlays/meadow-mist/_unverified/close-session-prompt.png` |
| Meters / progress bars with coloured percentage text | 4 | `S/shots-chatgpt-signin/meadow-mist/chatgpt-usage-card.png`, `S/shots-openrouter-signin/meadow-mist/si-failed.png`, `S/shots-overlays/meadow-mist/local-models-resuming.png` |
| Bottom sheet / drawer (drag handle, no title, no ✕) | 3 | `S/shots-main/meadow-mist/command-drawer-slash.png`, `S/shots-narrow/meadow-mist/skills-drawer.png` |
| Anchored popover (tags sheet, dropdown lists) | 3 | `S/shots-chatsearch-gate-main/meadow-mist/tag-sheet.png`, `S/shots-main/meadow-mist/tags-note-popover.png` |
| Checklist rows with tick boxes (opt-in, not "I understand") | 2 | `S/shots-main/meadow-mist/customize-status-bar.png`, `S/shots-overlays/meadow-mist/development-bug-report.png` |
| Attachment tiles / removable rows / per-row remove | 3 | `S/shots-overlays/meadow-mist/composer-attachments.png`, `S/shots-main/meadow-mist/edit-quick-chips.png`, `S/shots-narrow/meadow-mist/session-files.png` |
| Empty states and item-level unavailable notes | 3 | `S/shots-tag-chip/meadow-mist/tag-resume.png` (empty right pane), `S/shots-chatsearch-gate-main/meadow-mist/ask-scaffold.png` (greyed Resume + reason) |
| Attention dot with no label (red dot on heading / tab) | 3 | `S/shots-openrouter-signin/meadow-mist/si-failed.png`, `S/shots-chatgpt-signin/meadow-mist/providers-chatgpt-blocked.png` |
| Command palette / jump list (project switcher with "esc" chip, no ✕) | 1 | `S/shots-overlays/meadow-mist/projects-switcher.png` (SEEN in the first batch only; "RECENT" is spaced capitals = BREAKS) |
| Full-window setup / splash progress | 2 | `S/shots-overlays/meadow-mist/first-run-install-prerequisites.png`, `S/shots-chatgpt-signin/meadow-mist/first-run-chatgpt-waiting.png` |
| Hover tooltips ("Hide list", "All Sessions") | 2 | `S/shots-chatsearch-gate-main/meadow-mist/ask-scaffold.png` |
| Find-in-page bar | 1 | `S/shots-main/meadow-mist/find-bar.png` |
| Exempt (by the guide): tool cards, permission pills, terminal | many | `S/shots-tall/meadow-mist/_unverified/tool-gallery.png`, `S/shots-main/meadow-mist/terminal-view-no-pty.png`, `S/shots-helper-asks-narrow/meadow-mist/bottom.png` |

## 3. BREAKS grouped by rule

| Rule | count | what the screens do | examples |
|---|---|---|---|
| No spaced-out capitals (small label 12px grey, normal case) | 12 | FAVORITES / ALL INSTALLED, ALWAYS ON / RATE LIMITS, EFFORT LEVEL, INCLUDE WITH TICKET, SHOW COMPLETE, MODEL / SKIP PERMISSIONS, SESSION USAGE, SESSIONS IN THIS WINDOW, RECENT, NORMAL and PERMISSION UNKNOWN chips | `S/shots-main/meadow-mist/customize-status-bar.png`, `S/shots-model-brand/meadow-mist/model-dialog.png`, `S/shots-tag-chip/meadow-mist/tag-resume.png` |
| Never red / coloured body text | 9 | provider error lines, local-model delete warning, "Runs fast - fits on your GPU", SendUserFile failed, PERMISSION UNKNOWN chip, red Delete text, green percentages | `S/shots-openrouter-signin/meadow-mist/si-failed.png`, `S/shots-overlays/meadow-mist/local-models-delete-confirm.png`, `S/shots-tall/meadow-mist/_unverified/tool-gallery.png` |
| Never a coloured strip | 2 | orange "Download interrupted" and red "Damaged" bars across card tops | `S/shots-overlays/meadow-mist/local-models-delete-confirm.png`, `.../local-models-resuming.png` |
| Never bare text as a button / less-important action is outlined | 11 | Manage models..., Manage tags..., + Add Chip, Add provider, Settings (local models), Details (strip), Upgrade plan, Dismiss, Resume / + New Session bar | `S/shots-chatgpt-signin/meadow-mist/chatgpt-plan-limit.png`, `S/shots-model-brand/meadow-mist/model-dialog.png`, `S/shots-openrouter-signin/meadow-mist/si-failed.png` |
| Underlined words used as buttons | 1 | "Add vision (0.9 GB)" | `S/shots-overlays/meadow-mist/local-models-delete-confirm.png` |
| Two buttons: filled on the right, outlined directly left, hugging labels | 3 | Retry (filled) left of Stop; Submit (filled) left of Dismiss; Keep / Delete model as equal halves | `S/shots-overlays/meadow-mist/native-session-stalled-and-permission.png`, `S/shots-tall/meadow-mist/_unverified/tool-gallery.png`, `S/shots-overlays/meadow-mist/local-models-delete-confirm.png` |
| One button = full width and filled | 2 | Tags & note "Done" outlined | `S/shots-main/meadow-mist/tags-note-popover.png`, `S/shots-narrow/meadow-mist/tags.png` |
| No box inside a box | 6 | Tags & note inner panel, Model dropdown box, chat bubble > quoted card > row, usage card in bubble, Session Files in panel, permission list boxes | `S/shots-main/meadow-mist/tags-note-popover.png`, `S/shots-model-brand/meadow-mist/model-dialog.png`, `S/shots-chatsearch-gate-main/meadow-mist/ask-scaffold.png` |
| Counts: "Files 17" not "(17)" and never a number in a bubble | 3 | "Session Files (12)" in both layouts; round "12" bubble on header button | `S/shots-narrow/meadow-mist/session-files.png`, `S/shots-chatsearch-gate-main/meadow-mist/referenced-list.png` |
| Every popup has the ✕ | 1 | Resume Session popup shows none | `S/shots-tag-chip/meadow-mist/tag-resume.png` |
| Fold-out = boxed row with arrow at right | 1 | "Why can't this be resumed?" | `S/shots-overlays/meadow-mist/local-models-delete-confirm.png` |
| Chip row right under the name, then description | 1 | skill cards put the source chip at the bottom | `S/shots-main/meadow-mist/command-drawer-slash.png` |
| Offer 2-4 choices as a tab strip, many as dropdown | 2 | 5-item effort strip (wide and narrow) | `S/shots-model-brand/meadow-mist/model-dialog.png`, `S/shots-narrow/meadow-mist/model-picker.png` |
| Notice = tinted box with buttons inside at right, never a dot/strip | 3 | preview error uses red dot and no box; amber-dot strip banner; waiting message box with a different, rounder shape | `S/shots-chatsearch-gate-main/meadow-mist/preview-error.png`, `S/shots-chatgpt-signin/meadow-mist/first-run-chatgpt-waiting.png` |
| Text box with its own action keeps it inside at right | 1 | OpenRouter key box with Connect below it | `S/shots-openrouter-signin/meadow-mist/si-modal.png` |
| Long text hard state | 2 | skill card name runs under icons; transcript path overflows notice | `S/shots-main/meadow-mist/command-drawer-slash.png`, `S/shots-chatsearch-gate-main/meadow-mist/preview-error.png` |

## 4. Counts (approximate, from the tables above)

Row tallies of the section 1 tables (counted by script): FOLLOWS 34, BREAKS 50, NO RULE 38. Only pieces that were on screen and opened are counted; skipped plainly-following pieces are not.

## 5. Could not judge

Attempts to open these pictures failed with "media removed: request limit", or I did not reach them, so nothing is claimed about them:
- `S/shots-main/meadow-mist/home.png`, `.../library*.png`, `.../marketplace*.png`, `.../projects*.png`, `.../settings-*.png`, `.../theme-*.png`, `.../resume-browser*.png`, `.../session-files-*.png`, `.../providers-none.png`, `.../games-picker.png` (settings/browse scope, skipped as instructed or not reached)
- `S/shots-main/meadow-mist/_unverified/welcome-empty.png` and `all-sessions-menu.png` (welcome empty state NOT judged)
- `S/shots-overlays/meadow-mist/`: `about-scrolled`, `ctx-menu-assistant-bubble`, `ctx-menu-composer`, `first-run-authenticate`, `first-run-detect-prerequisites`, `first-run-enable-developer-mode`, `first-run-launch-wizard`, `local-models-damaged-why`, `local-models-interrupted-delete-confirm`, `local-models-paused`, `native-session`, `permissions-scrolled`, `projects-add-project`, `projects-context-editor`, `projects-conversation-preview`, `projects-how-context-works`, `providers-local-scrolled`, `shift-session-switcher`, `theme-cycle-editor`, `thinking-chip-hover`, `_unverified/ctx-menu-code-block`, `_unverified/ctx-menu-file-pill`
- `S/shots-bubbles/meadow-mist/`: `deliverables`, `handoff`, `mix`, `reasoning-stop`, `silent-steps`, `skill-first`, `skills-chain`, `skills-spread` (only `approval` seen)
- `S/shots-narrow/meadow-mist/`: `home`, `menu`, `stress-permissions`, `terminal-no-pty`, `_unverified/connect4`, `_unverified/tool-expanded`, plus library/marketplace/projects/settings ones (other scopes)
- `S/shots-tall/meadow-mist/` main folder is empty (only `_unverified/tool-gallery.png` and `compare.png` exist); the tall gallery was used as the only picture of the ask-question card.
- `S/shots-helper-asks/meadow-mist/bottom.png`, `group.png`; `S/shots-cc-subagents/meadow-mist/helpers.png`; `S/shots-statusbar-relevance/meadow-mist/` (bar-* except by inference from bar.png, menu-*): not opened successfully
- `S/shots-openrouter-trust/meadow-mist/card-*.png`, `settings-dot.png`, `_unverified/modal-fake-key.png`; `S/shots-openrouter-signin/meadow-mist/si-apikey`, `si-broken`, `si-connected`, `si-not-connected`
- `S/shots-chatgpt-signin/meadow-mist/first-run-sign-in`, `providers-chatgpt-signed-in/out/waiting`, `providers-local-models`, `_unverified/*`
- `S/shots-latency/meadow-mist/` (only the light-theme Chat view in `home-1s.png` was seen; nothing latency-specific to judge)
- `S/shots-model-brand/meadow-mist/statusbar.png`, `model-list.png`, `providers-local-scrolled.png`, `resume-browser.png`
- `S/shots-chatsearch-gate-main/meadow-mist/_unverified/*`, `S/shots-chatsearch-gate-narrow/` beyond `preview-narrow.png`
- `S/shots-main/meadow-mist/compare-view.png` is a review-deck page, not an app screen; ignored.
- Shadow depth on cards and the 12px card gap could not be judged from screenshots at this size.
