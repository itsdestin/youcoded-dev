# Pieces audit: Settings and Assistant settings (meadow-mist)

Base path for all shots: `/home/destin/youcoded-dev/worktrees/sessions/ui-consistency-audit/scratch/pieces-audit/`
(abbreviated `P/` below; every shot is `P/shots-<plan>/meadow-mist/<name>.png`).

Rules referred to: guide-draft.md. Verdicts: FOLLOWS / BREAKS / NO RULE.
Screens that were near-identical (the same Assistant-settings General page shown with a tooltip, saved value, or stress data) are grouped under one heading.
Some image files came back out of order or repeated when opened, so where a file's picture could not be tied to its name with certainty, the screen is listed under "Could not judge".

## 1. Settings menu (drawer)
Shots: `P/shots-main/meadow-mist/settings-drawer.png`, `P/shots-settings-rows/meadow-mist/settings-rows.png`, `P/shots-assistant-settings/meadow-mist/drawer-attention.png`

| Screen | Piece | Verdict | Note |
|---|---|---|---|
| Settings drawer | Title "Settings" + ✕, tapered line | FOLLOWS | shared popup title + ✕ |
| Settings drawer | Rows Account ... About (icon, title, hint, arrow) | FOLLOWS | settings-style list = boxed rows |
| Settings drawer | Row status "Sync Failing" red dot + small red "1" bubble | BREAKS | count "in a bubble" is banned; status is bare dot+grey word, not a tinted pill |
| Settings drawer | "Disabled" grey dot + word (Remote Access) | BREAKS | status label should be a tinted pill in normal case |
| Settings drawer | Red dot beside "Assistant settings" (attention) | NO RULE | an "attention needed" dot on a list row / nav item |
| Settings drawer | Appearance row with a half-green/half-white swatch icon | NO RULE | a row whose icon is a live preview swatch |
| Settings drawer | Hints cut off with "..." (Sign in to like themes, rat...) | NO RULE | long hint text in a row (truncation vs wrapping) |

## 2. Assistant settings, General
Shots: `P/shots-assistant-settings/meadow-mist/assistant-general.png`, `assistant-general-picker.png`, `assistant-claude.png`, `assistant-chatgpt.png`, `P/shots-cloud-context/meadow-mist/general.png`, `P/shots-cloud-context-after/meadow-mist/{empty,info,stress}.png`, `P/shots-cloud-context-saved/meadow-mist/{general,save-reopen}.png`, `P/shots-main/meadow-mist/settings-defaults.png`, `P/shots-assistant-settings/meadow-mist/assistant-search-addkey.png`

| Screen | Piece | Verdict | Note |
|---|---|---|---|
| General | Title "Assistant settings" + ✕, tapered line | FOLLOWS | shared popup |
| General | Left tab list (General, Cloud providers ...) | NO RULE | a side navigation inside a wide popup (sub-page menu) |
| General | Heading "General" over the page | FOLLOWS | heading ladder (title-size) |
| General | Default model / Default project folder: title, hint, dropdown below | FOLLOWS | wide control below the title, full width |
| General | Every setting in its own soft box with 6-8px gaps | FOLLOWS | boxed rows for a settings list |
| General | Context row: two labelled 250k / 1M switch strips side by side inside one box | NO RULE | two small tab strips sharing one row (a strip per provider) |
| General | Context "(i)" info icon with a tall tooltip card | NO RULE | help-icon popover (long explanatory text over the popup) |
| General | Session naming: Off / Basic / AI strip, then a grey explanation line | FOLLOWS | 2-4 short choices = tab strip |
| General | Step guard: text-style dropdown "None" | FOLLOWS | wide control below |
| General | Close-session prompt / Show recommended models: switch on the right | FOLLOWS | small control beside title |
| General | Web search box containing a nested Tavily box (box inside a box) | BREAKS | no box inside a box |
| General (add key) | Key field with small filled "Save" inside the box, "Cancel" to the right, "Get a free key" faint link bottom-left | FOLLOWS (Save inside) / BREAKS (Cancel is a small outline pill, faint link at bottom-left) | action inside text box ok; faint underlined-style text link as a button-like action |
| General | Content fades at the bottom edge | FOLLOWS | fade at hidden edge |

## 3. Cloud providers
Shots: `P/shots-main/meadow-mist/settings-model-providers.png`, `providers-none.png`, `P/shots-assistant-settings/meadow-mist/assistant-claude-info.png`, `assistant-chatgpt-blocked.png`, `assistant-openrouter.png`, `P/shots-error-audit-current/meadow-mist/mock-cloud-chatgpt-status-failure.png`, `_unverified/mock-cloud-openrouter-test-failure.png`

| Screen | Piece | Verdict | Note |
|---|---|---|---|
| Cloud providers | Provider cards (Claude Code / ChatGPT / OpenRouter): title, small outlined buttons at the top right | FOLLOWS (outlined secondary right) | actions at right, outlined |
| Cloud providers | Three separate small outlined buttons in a row (My Account, Preferences, Sign out) on one card | NO RULE | a row of 3+ equal small actions on a card header |
| Cloud providers | "Sign in with OpenRouter" filled beside outlined "API Key" | FOLLOWS | filled main on the right |
| Cloud providers | Usage bars "5-hour limit 34%" / "7-day limit 12%" with bright green bar and green % text | BREAKS | status hue must not be text; bars/percent are coloured text |
| Cloud providers | Progress / usage meter itself | NO RULE | a meter or progress bar row |
| Cloud providers | "(i)" help icon beside provider name with tooltip card | NO RULE | help-icon popover |
| Cloud providers | ChatGPT "Checking..." grey text | NO RULE | loading text state inside a card |
| Cloud providers | Red text line "Mock audit: ChatGPT status request failed." directly under card text | BREAKS | error must be a tinted box with normal-colour text, never red body text; no Retry inside |
| Cloud providers | Red text line "Your workspace admin has turned off Codex for this account." | BREAKS | red body text, not the tinted notice box |
| Cloud providers | Red dot beside the "Cloud providers" heading and on the left tab | NO RULE | attention dot on a heading and a nav tab |
| Cloud providers | Left tab label cut "Cloud provide..." when the dot is added | NO RULE | tab label truncation |
| Cloud providers | "Your own API keys" small label then a wide "Add provider" dashed-outline button with centred text | BREAKS/NO RULE | follow-up action should be a full-width outlined button (mostly follows) but the dashed, faint outline is unlike shared button |
| OpenRouter test failure | Same pattern with failure text (see mock-cloud-openrouter-test-failure) | judged from picture: card shows "Checking..." and "Replace key" only; failure line not visible | see Could not judge |

## 4. Local models
Shots: `P/shots-assistant-settings/meadow-mist/assistant-local.png`, `P/shots-local-engine/meadow-mist/{local-engine-advanced,local-engine-card,local-engine-rocm-guide,local-model-memory-warning}.png`, `P/shots-error-audit-current/meadow-mist/{mock-local-damaged,mock-local-interrupted,mock-local-paused-after-resume,mock-local-resume-failure}.png`

| Screen | Piece | Verdict | Note |
|---|---|---|---|
| Local models | "Local engine  Stopped/Running" title with grey status word | BREAKS | status should be a tinted pill in normal case |
| Local models | "Advanced" boxed row with an arrow at right (folds open) | FOLLOWS | fold-out = boxed row, arrow right (arrow points down when open) |
| Local models | Opened Advanced: a group of boxed rows inside the engine box | BREAKS | box inside a box |
| Local models | Speculative decoding / Compress context memory: title + hint + switch right | FOLLOWS | small control beside |
| Local models | Context length: number field at right on the same row | NO RULE | a narrow input placed beside the label (wide vs small control) |
| Local models | "Optional engine for your AMD chip" with small outlined "Set up" / "Hide" | FOLLOWS | outlined secondary |
| Local models | ROCm install guide: command line, "Copy" text inside it, filled "Run in terminal", ghost "Check again" | BREAKS | "Check again" is bare text, not outlined; box inside a box |
| Local models | Command/code block with Copy action inside | NO RULE | copyable code/command block |
| Local models | Models box: title "Models", search box, "Installed" and "Recommended" small labels | FOLLOWS (labels) / BREAKS (box holding more boxes) | groups flat, no nesting |
| Local models | Model rows with Settings (bare text) + red outlined Delete | BREAKS | Settings is bare text next to an outlined destructive button; destructive button not filled-red on main action |
| Local models | "Recommended" rows: model card with chevron and filled green "Download" | FOLLOWS (filled on right) / NO RULE (chevron = expand row inside row) | |
| Local models | "Runs fast - fits on your GPU" green text; sizes with dotted underline | BREAKS | status hue used as text; underlined text that is not a link |
| Local models | "Add vision (0.9 GB)" underlined text as an action | BREAKS | underlined words used as a button |
| Local models | "Damaged" red coloured strip across the top of a model row, red border | BREAKS | no coloured strips; use tinted notice inside the item |
| Local models | "Download interrupted" bright orange strip across top with progress bar, Resume / Delete inside | BREAKS | coloured strip; buttons ok but strip not the shared notice |
| Local models | Progress bar "66% - 74.2 of 113.0 GB" | NO RULE | download progress bar with text |
| Local models | Red text-in-box "Mock audit: download could not resume." inside the row | BREAKS | red body text in the notice (box is close to the rule, but text should be normal grey) |
| Local models | "Why can't this be resumed?" small underlined-ish link with (i) | NO RULE | an explanation link inside a notice |
| Local models | "This model may not fit in available memory" collapsible amber notice in the session model menu | FOLLOWS (tinted box) | notice with fold arrow; text is amber-tinted |
| Local models | "Warn me about this model" switch inside that notice | NO RULE | a setting switch inside a warning notice |
| Local models | "Other local apps" row with small "Detect" outlined button | FOLLOWS | outlined action right |

## 5. Permissions
Shots: `P/shots-assistant-settings/meadow-mist/{assistant-permissions,assistant-permissions-explainer,assistant-permissions-link,assistant-claude-skip-on}.png`, `P/shots-main/meadow-mist/{settings-permissions,permissions-stress}.png`, `P/shots-assistant-settings-narrow/meadow-mist/narrow-permissions.png`, `P/shots-error-audit-current/meadow-mist/mock-permissions-load-failure.png`

| Screen | Piece | Verdict | Note |
|---|---|---|---|
| Permissions | Heading "Permissions" with (i) | NO RULE | heading with help icon |
| Permissions | "Enable Skip Permissions Mode?" switch right | FOLLOWS | small control beside |
| Permissions | "Permission modes" grey label over a big reading box (bold terms, bullets) | BREAKS | reading section label should have the soft underline; bulleted reading text in a box is unlisted |
| Permissions | Reading text with a horizontal divider and a footnote inside the same box | NO RULE | explanatory reading card with a divider and footnote |
| Permissions | "Always allowed" label, explainer box, then boxed rows "All projects 1 >" / "youcoded 4 >" (nested inside the box) | BREAKS | box inside a box; count shown as bare number with arrow |
| Permissions | Count "1", "4" beside a row arrow | NO RULE | a count on a list row (guide covers labels/tabs, not rows) |
| Permissions | Unable to show what you've approved - box: bold sentence-title, grey text, "Report bug" outlined and "Diagnose with the assistant" filled at the right | FOLLOWS | notice with actions inside at right (box is a nested card inside the "Always allowed" card = box in box) |
| Permissions explainer | "About Permissions" sub-page with back arrow + ✕; spaced capital headings "HOW MUCH IT ASKS", "PRESETS", "THINGS IT ALWAYS ASKS ABOUT", "APPROVALS YOU'VE ALREADY GIVEN" | BREAKS | no spaced-out capitals; headings for reading sections should be normal case with soft underline |
| Permissions explainer | Back arrow at left of title | NO RULE | a popup sub-page header with a back button |
| Skip Permissions Mode confirm | Narrow popup, title + ✕, reading text, whole-line tick box on the left ("I understand...") | FOLLOWS | consent tick box (but the line is not a tappable box: only the tiny tick square is boxed) -> BREAKS on "whole line a tappable box" |
| Skip Permissions Mode confirm | Full-width red "Turn it on" above full-width outlined "Cancel" | FOLLOWS | destructive on top when stacked |
| Skip Permissions Mode confirm | Red button is washed-out (disabled until ticked) | FOLLOWS | disabled until ticked |
| Permissions (narrow) | Back arrow + title + (i) + ✕ in one header | NO RULE | sub-page header with back and info |

## 6. Specialists
Shots: `P/shots-assistant-settings/meadow-mist/assistant-specialists.png`

| Screen | Piece | Verdict | Note |
|---|---|---|---|
| Specialists | Intro paragraph then labels "Specialist intelligence tiers", "Available specialists · 7 · 1 warning" | BREAKS | count as "· 7 ·" middle-dot text; should be word then fainter number |
| Specialists | Budget / Frontier rows inside one box with dividing line | FOLLOWS (wide control below) / BREAKS (rows separated by lines, not boxed rows) | |
| Specialists | "Clear" centred bare text under a dropdown; "Set to Claude Sonnet 4.6" plain line | BREAKS | bare text button (Clear) instead of outlined |
| Specialists | Built-in list: name + tiny capital badge "READ-ONLY" / "CAN EDIT & RUN COMMANDS" | BREAKS | spaced-out capitals; status labels must be normal case tinted pills |
| Specialists | Gap after heading larger than elsewhere | BREAKS | spacing scale (Destin flagged the gap earlier) |

## 7. Preferences (Claude Code)
Shots: `P/shots-main/meadow-mist/preferences-config.png`

| Screen | Piece | Verdict | Note |
|---|---|---|---|
| Preferences | Title + ✕, tapered line | FOLLOWS | shared popup |
| Preferences | Spaced capitals "DEFAULT PERMISSION MODE", "EDITOR MODE", "OUTPUT STYLE" | BREAKS | no spaced-out capitals; small labels normal case |
| Preferences | Radio rows (empty circle + title + hint) as boxed rows | NO RULE | pick-one list with radio circles (boxed rows) |
| Preferences | Normal / Vim two-option strip with no highlighted choice visible | BREAKS | selected choice not shown; strip lacks selected state |
| Preferences | Output style text box with placeholder and hint below | FOLLOWS | wide control below |
| Preferences | Show turn duration switch right | FOLLOWS | |

## 8. Backup and Sync
Shots: `P/shots-main/meadow-mist/settings-backup-sync.png`, `P/shots-sync-oversize-fix/meadow-mist/{sync-oversize,sync-oversize-open,sync-error,sync-auth-error,sync-retrying,gear-dot}.png`, `P/shots-states-settings-repair/meadow-mist/{sync-log-open,sync-show-details}.png`, `P/shots-error-batch1/meadow-mist/{sync-retry-failed,sync-wizard-upload-failed}.png`, `_unverified/sync-retry-report-bug.png`

| Screen | Piece | Verdict | Note |
|---|---|---|---|
| Backup & Sync | Title + (i) + ✕ | FOLLOWS | shared popup |
| Backup & Sync | Status card "All synced" / "Couldn't sync" / "Syncing..." with coloured dot before title and a switch at top right | BREAKS | live status should be a tinted pill with the dot inside it, not a bare dot beside a heading |
| Backup & Sync | "Couldn't sync" body text in RED | BREAKS | never red body text (this is the guide's own reference screen, still wrong on the error text) |
| Backup & Sync | "Try again" small filled button at bottom right of the card | FOLLOWS | notice actions inside at right |
| Backup & Sync | "Show details" with small arrow at left | BREAKS | fold-out should be a boxed row with arrow on the right |
| Backup & Sync | Opened details: monospaced error dump inside the card | NO RULE | technical detail / log text block |
| Backup & Sync | "Connect GitHub..." outlined + "Try again" filled, at right | FOLLOWS | outlined left of filled |
| Backup & Sync | Stat chips "3 Devices / 3 Projects / 7 Conversations" (dark filled first chip) | NO RULE | summary chips that also act as tabs (number first, filled one selected) |
| Backup & Sync | Device list lines (name, OS, last synced, "Remove" bare text) | BREAKS | "Remove" is bare text; dense text rows unlike shared list rows |
| Backup & Sync | Amber "2 conversations too big to sync" tinted box with arrow, opens to text + bullets | FOLLOWS | tinted notice; the guide's reference. Text inside is amber-coloured title (acceptable, only title carries colour) |
| Backup & Sync | "Sync now" / "Back up all now" underlined text under the group | BREAKS | must be a full-width outlined button, never underlined text |
| Backup & Sync | "Additional backups [Optional]" boxed row with switch | FOLLOWS (switch right) / NO RULE ("Optional" mini badge) | small neutral tag next to a title |
| Backup & Sync | Google Drive row: icon, name, "Backed up 5m ago", green dot, gear icon | NO RULE | connected-service row with a status dot and settings gear |
| Backup & Sync | "+ Add a backup" wide dashed outlined button | FOLLOWS (full-width outlined) / BREAKS (dashed faint outline unlike the shared button) | |
| Backup & Sync | "Includes Memory · Conversations · Encyclopedia..." faint text line | NO RULE | plain footnote with a dot-separated list |
| Backup & Sync | "> Sync log" small arrow row that opens a monospaced log | BREAKS | fold-out should be a boxed row, arrow right, not a bare left-arrow text |
| Backup & Sync | Row-level error: red dot + "Upload failed: Some files didn't upload." + "Report bug" outlined + "Retry" filled inside a light box | FOLLOWS | notice inside the item with actions at right (text not red) |
| Backup & Sync | "Warnings" label + amber dashed-border card "Google Drive backup failed ... Retry / Dismiss" | BREAKS | dashed border unlike the shared notice; Retry/Dismiss at left, Dismiss bare text |
| Setup Complete | Green tick circle, "Backup added", amber-tinted box with tiny amber title and body | FOLLOWS (tinted box) / BREAKS (tiny hard-to-read amber title text) | |
| Setup Complete | Single "Done" filled button centred, not full width | BREAKS | one button should be full width |
| Update available | Bold version line + bullet; "Get beta builds" boxed row + switch | FOLLOWS | |
| Update available | "Download failed - Retry" filled green button (failure written into the button), "Open in browser instead" underlined text under it | BREAKS | error belongs in the tinted notice; underlined text used as a button |
| Gear (chat screen) | Red dot on the settings gear icon at top left | NO RULE | attention dot on a toolbar icon |

## 9. Remote Access
Shots: `P/shots-main/meadow-mist/settings-remote-access.png`, `P/shots-states-remote-access/meadow-mist/{remote-checked-failed,remote-checked-listening,remote-checked-silent,remote-checking,remote-conflict,remote-disabled,remote-error,remote-not-set-up,remote-ready,remote-setup,remote-sign-in-required}.png`, `P/shots-states-settings-repair/meadow-mist/{remote-access-error,remote-access-not-set-up,remote-access-setup-checking}.png`

| Screen | Piece | Verdict | Note |
|---|---|---|---|
| Remote Access | Title + (i) + ✕ | FOLLOWS | shared popup |
| Remote Access | Intro sentence in a bordered box that holds a second tinted box ("Not set up yet." dot + "Set up") | BREAKS | box inside a box |
| Remote Access | Status line "Not set up yet." with grey dot, filled "Set up" at right | BREAKS | live status should be a pill with dot inside; status text is plain body |
| Remote Access | "Remote access is off." + filled "Turn on" | BREAKS | same (bare dot status) |
| Remote Access | Error: "Unable to check the connection." bold sentence title, grey text, "Report bug" outlined + "Diagnose with the assistant" filled at right | FOLLOWS | tinted notice with actions inside at right (but the notice sits in a box: nesting) |
| Remote Access | "Another program ... EADDRINUSE" long text, red dot, filled "Retry" | BREAKS | red dot as marker; raw error text (address 100.82.14.7:9900) shown; dot instead of tinted notice |
| Remote Access | "Tailscale is already using this address..." with red dot + Retry | BREAKS | same |
| Remote Access | Tailscale "installed but not signed in" orange dot + filled "Sign in" | BREAKS | bare-dot status again |
| Remote Access | "This computer is listening at http://..." green dot with hint text | BREAKS | green dot status, not pill |
| Remote Access | Group label "Server", "Keep awake", "Devices", "Tailscale" grey small labels | FOLLOWS | small label headings, normal case |
| Remote Access | "Enabled" row: title left, switch right | FOLLOWS | |
| Remote Access | Password box: title, hint, input with tiny "Set" button inside at right | FOLLOWS | action inside text box, small filled button |
| Remote Access | "Generate" plain text at right under the input | BREAKS | bare-text action (Destin said remove Generate) |
| Remote Access | "Saved" in small green text | BREAKS | status hue as text |
| Remote Access | Keep awake strip Off / 1h / 4h / 8h / 24h | FOLLOWS | tab strip; 5 choices is more than the 2-4 the guide names |
| Remote Access | "Add Device" wide faint dashed button with phone icon | BREAKS | full-width outlined button expected; this looks disabled/faint |
| Remote Access | Devices list: boxed rows, dot, "Online/Offline", bare "Unpair" at right | BREAKS | Unpair is bare text; status is dot + word |
| Remote Access | Tailscale help text paragraph faded at the bottom | NO RULE | install-help paragraph |
| Remote Access (consent) | remote-consent.png shows the connected-devices view, not the consent tick line | see Could not judge | |

## 10. Appearance, Sound, other small popups
Shots: `P/shots-main/meadow-mist/{settings-appearance,settings-sound,settings-buddy-floater,settings-account,settings-about,settings-development,settings-donate,settings-keyboard-shortcuts}.png`

| Screen | Piece | Verdict | Note |
|---|---|---|---|
| Appearance (Themes) | Title "Themes" + (i) + ✕ | FOLLOWS | |
| Appearance | "FAVORITED THEMES" spaced capital label | BREAKS | no spaced-out capitals |
| Appearance | Theme thumbnail cards, name bottom left, pencil icon bottom right, "active" green text | NO RULE / BREAKS | card with quick-action icon (guide: top right) and green text status "active" (should be pill) |
| Appearance | "Browse Theme Marketplace" centred plain text | BREAKS | bare text action; should be full-width outlined button |
| Appearance | "+ Build New Theme with Claude" full-width filled | FOLLOWS | one filled, full width |
| Appearance | Reduce Visual Effects boxed row + switch | FOLLOWS | |
| Sound & Notifications | "VOLUME", "NOTIFICATION" spaced capital labels | BREAKS | no spaced-out capitals |
| Sound & Notifications | Slider with speaker icon and "30%" at right | NO RULE | slider control |
| Sound & Notifications | Needs Attention / Response Ready tab strip | FOLLOWS | |
| Sound & Notifications | Small red dot + faint hint + switch on a line under the tabs | NO RULE | a hint line with switch outside a boxed row |
| Sound & Notifications | Sound choice list: boxed rows with radio circle, name, note ("C5 -> E5") | NO RULE | pick-one list with radio circle in boxed rows (guide says pick-one menus are plain rows) |
| Buddy Floater | Narrow popup, boxed row with switch, "Remove helper" bare text bottom right | BREAKS | bare text action (destructive) instead of outlined/red button |
| Account | Centred paragraph, centred filled "Sign in to YouCoded" (not full width), then "Connected services" boxed row + arrow | BREAKS | single main action should be full width |
| About | "DISCLAIMER", "PRIVACY" spaced capital labels over reading text, no underline | BREAKS | no spaced-out capitals; reading-section labels get normal case + soft underline |
| About | Version line "YouCoded 1.3.0" grey; long reading paragraphs with fade at bottom | FOLLOWS | body 12-14px, fade |
| Development | Intro paragraph then boxed rows with icon, title, hint, arrow | FOLLOWS | settings-style list |
| Development | Row "Report a Bug or Request a Feature" title wraps to two lines; "Get beta builds" hint cut with "..." | NO RULE | long/truncated row text |
| Development | Get beta builds row with a switch instead of arrow, in the same list as arrow rows | NO RULE | mixed action and toggle rows in one list |
| Donate | "Support YouCoded" title, coffee icon + bold "Buy Me a Coffee", short text, full-width filled "Open Buy Me a Coffee" | FOLLOWS | one button, full width |
| Keyboard Shortcuts | Plain rows: label left, key chips at right | NO RULE | key/shortcut chips in a two-column table |

## 11. Narrow (phone width)
Shots: `P/shots-assistant-settings-narrow/meadow-mist/{narrow-drawer,narrow-general,narrow-list,narrow-permissions}.png`, `P/shots-cloud-context-narrow/meadow-mist/info.png`

| Screen | Piece | Verdict | Note |
|---|---|---|---|
| Narrow list | Title + ✕; five boxed rows with icon, title, arrow | FOLLOWS | settings list = boxed rows |
| Narrow permissions | Back arrow, title, (i), ✕; boxed rows | NO RULE | sub-page header |
| Narrow permissions | Switch row: hint wraps to 5 lines beside the switch | FOLLOWS | small control beside |
| Narrow General (cloud-context-narrow info) | Context tooltip card covers most of the popup, no close button on the card | BREAKS | every popup/panel has the ✕ (the tooltip has none) |
| Narrow drawer / narrow-general | narrow-drawer.png and narrow-general.png opened to show the chat screen with no settings popup | see Could not judge | |

## NO RULE kinds
Counts are numbers of the screens above (a screen listed in one row counts once).

| Kind of piece | Screens | Example shots |
|---|---|---|
| Live status text with a coloured dot beside it (not a pill) - the guide has a rule but the app does not use it, so it counts as BREAKS; listed here because the guide gives no dot-only exemption for lists | 12 | `P/shots-states-remote-access/meadow-mist/remote-checked-listening.png`, `P/shots-main/meadow-mist/settings-drawer.png`, `P/shots-sync-oversize-fix/meadow-mist/sync-retrying.png` |
| Help "(i)" icon that opens a floating tooltip card | 6 | `P/shots-cloud-context-after/meadow-mist/info.png`, `P/shots-assistant-settings/meadow-mist/assistant-claude-info.png`, `P/shots-cloud-context-narrow/meadow-mist/info.png` |
| Meter / progress bar rows (usage limits, download progress) | 5 | `P/shots-main/meadow-mist/settings-model-providers.png`, `P/shots-error-audit-current/meadow-mist/mock-local-interrupted.png` |
| Side navigation (left tab list) inside a wide popup, and its phone-width list version | 3 | `P/shots-assistant-settings/meadow-mist/assistant-general.png`, `P/shots-assistant-settings-narrow/meadow-mist/narrow-list.png` |
| Sub-page header with a back arrow (About Permissions, narrow permissions) | 3 | `P/shots-assistant-settings/meadow-mist/assistant-permissions-explainer.png`, `P/shots-assistant-settings-narrow/meadow-mist/narrow-permissions.png` |
| Attention dot on a nav item, heading, list row or toolbar icon | 4 | `P/shots-assistant-settings/meadow-mist/assistant-chatgpt-blocked.png`, `P/shots-assistant-settings/meadow-mist/drawer-attention.png`, `P/shots-sync-oversize-fix/meadow-mist/gear-dot.png` |
| Pick-one list with radio circles inside boxed rows | 3 | `P/shots-main/meadow-mist/settings-sound.png`, `P/shots-main/meadow-mist/preferences-config.png` |
| Row of 3 or more small equal actions on a card header | 2 | `P/shots-main/meadow-mist/settings-model-providers.png` |
| Copyable command / code / log block (monospaced) | 4 | `P/shots-local-engine/meadow-mist/local-engine-rocm-guide.png`, `P/shots-states-settings-repair/meadow-mist/sync-log-open.png`, `P/shots-states-settings-repair/meadow-mist/sync-show-details.png` |
| Slider control | 1 | `P/shots-main/meadow-mist/settings-sound.png` |
| Summary chips that also switch views (Devices / Projects / Conversations) | 5 | `P/shots-sync-oversize-fix/meadow-mist/sync-oversize.png` |
| Connected-service row (icon, name, status dot, gear) | 5 | `P/shots-sync-oversize-fix/meadow-mist/sync-error.png` |
| Row count next to an arrow ("All projects 1 >") | 2 | `P/shots-main/meadow-mist/settings-permissions.png` |
| Small neutral tag next to a title ("Optional", "Stopped") | 8 | `P/shots-main/meadow-mist/settings-backup-sync.png`, `P/shots-assistant-settings/meadow-mist/assistant-local.png` |
| Long / truncated row text ("..." cut, two-line titles) | 3 | `P/shots-main/meadow-mist/settings-development.png`, `P/shots-main/meadow-mist/settings-drawer.png` |
| Warning notice that holds a setting switch | 1 | `P/shots-assistant-settings/meadow-mist/drawer-attention.png` (session model menu) |
| Mixed arrow rows and toggle rows in one list | 2 | `P/shots-main/meadow-mist/settings-development.png` |
| Shortcut key chips in a table | 1 | `P/shots-main/meadow-mist/settings-keyboard-shortcuts.png` |
| Text-box with a narrow number input placed beside its label (Context length) | 1 | `P/shots-local-engine/meadow-mist/local-engine-advanced.png` |
| Loading text state inside a card ("Checking...") | 3 | `P/shots-error-audit-current/meadow-mist/mock-cloud-chatgpt-status-failure.png` |
| Theme thumbnail cards with quick-action icon | 1 | `P/shots-main/meadow-mist/settings-appearance.png` |

## BREAKS (grouped by rule)

| Rule | Count (pieces) | What the screens do | Example shots |
|---|---|---|---|
| No spaced-out capitals; small labels in normal case | 8 | "DEFAULT PERMISSION MODE", "EDITOR MODE", "OUTPUT STYLE", "VOLUME", "NOTIFICATION", "FAVORITED THEMES", "DISCLAIMER", "PRIVACY", permissions-explainer headings, READ-ONLY badges | `P/shots-main/meadow-mist/preferences-config.png`, `settings-sound.png`, `settings-appearance.png`, `settings-about.png`, `P/shots-assistant-settings/meadow-mist/assistant-permissions-explainer.png` |
| Never red or coloured body text (tint the box, keep text grey) | 9 | "Couldn't sync" text, ChatGPT failed/admin-off lines, "Mock audit: download could not resume." text, green "Saved", green usage %, "Runs fast" green text | `P/shots-sync-oversize-fix/meadow-mist/sync-error.png`, `P/shots-error-audit-current/meadow-mist/mock-cloud-chatgpt-status-failure.png`, `P/shots-assistant-settings/meadow-mist/assistant-chatgpt-blocked.png`, `P/shots-error-audit-current/meadow-mist/mock-local-resume-failure.png`, `P/shots-main/meadow-mist/settings-model-providers.png` |
| No coloured strips (use the tinted box inside the item) | 3 | red "Damaged" strip, orange "Download interrupted" strip | `P/shots-error-audit-current/meadow-mist/mock-local-damaged.png`, `mock-local-interrupted.png`, `P/shots-assistant-settings/meadow-mist/assistant-local.png` |
| Underlined words / bare text as a button (follow-up = full-width outlined button) | 11 | "Back up all now", "Sync now", "Generate", "Clear", "Add vision", "Browse Theme Marketplace", "Open in browser instead", "Remove", "Unpair", "Settings", "Dismiss", "Remove helper", "Get a free key" | `P/shots-sync-oversize-fix/meadow-mist/sync-oversize.png`, `P/shots-main/meadow-mist/settings-remote-access.png`, `P/shots-assistant-settings/meadow-mist/assistant-specialists.png`, `P/shots-main/meadow-mist/settings-buddy-floater.png`, `P/shots-error-batch1/meadow-mist/update-download-failed.png` |
| Status label = tinted pill (live status carries its dot inside the pill) | 12 | bare coloured dot + word: "Sync Failing", "Disabled", "Stopped/Running", "active", Remote Access status lines, device Online/Offline, sync "All synced" | `P/shots-main/meadow-mist/settings-drawer.png`, `P/shots-states-remote-access/meadow-mist/remote-ready.png`, `P/shots-states-remote-access/meadow-mist/remote-checked-listening.png`, `P/shots-assistant-settings/meadow-mist/assistant-local.png` |
| No box inside a box | 9 | Remote Access intro box, Local engine + Advanced group, Web search + Tavily, "Always allowed" + rows, ROCm install guide, sync-status card holding tabs/notice, permission-load error box, Models box holding model rows | `P/shots-main/meadow-mist/settings-remote-access.png`, `P/shots-local-engine/meadow-mist/local-engine-rocm-guide.png`, `P/shots-assistant-settings/meadow-mist/assistant-search-addkey.png`, `P/shots-main/meadow-mist/settings-permissions.png` |
| One button = full width (Account, Setup Complete "Done") | 2 | centred, hugging-label filled button | `P/shots-main/meadow-mist/settings-account.png`, `P/shots-error-batch1/meadow-mist/sync-wizard-upload-failed.png` |
| Fold-out = boxed row with arrow on the right | 3 | "Show details" (arrow left), "> Sync log" (arrow left, no box) | `P/shots-states-settings-repair/meadow-mist/sync-show-details.png`, `sync-log-open.png` |
| Count style ("Files 17", never bubbles, never "(17)") | 3 | red "1" bubble on Backup & Sync row, "· 7 · 1 warning", "1 >" / "4 >" | `P/shots-main/meadow-mist/settings-drawer.png`, `P/shots-assistant-settings/meadow-mist/assistant-specialists.png` |
| Secondary actions outlined, never bare text | 6 | Remove/Unpair/Settings/Clear/Dismiss/Check again | `P/shots-local-engine/meadow-mist/local-engine-card.png`, `P/shots-local-engine/meadow-mist/local-engine-rocm-guide.png` |
| Notice shape: tinted box with matching border, no dashed borders | 3 | dashed amber "Warnings" card, dashed "Add a backup", dashed "Add provider"/"Add Device" | `P/shots-error-batch1/meadow-mist/sync-retry-failed.png`, `P/shots-main/meadow-mist/settings-remote-access.png` |
| Error in the notice box, not written into a button | 1 | "Download failed - Retry" | `P/shots-error-batch1/meadow-mist/update-download-failed.png` |
| Reading-section labels get a soft underline (About) | 2 | "Permission modes" grey label and About headings have none | `P/shots-main/meadow-mist/settings-about.png`, `P/shots-main/meadow-mist/settings-permissions.png` |
| "I understand" line: whole line a tappable box | 1 | only a small tick square is boxed | `P/shots-assistant-settings/meadow-mist/assistant-claude-skip-on.png` |
| Every popup/panel has the ✕ | 1 | context tooltip card at phone width covers the popup with no close | `P/shots-cloud-context-narrow/meadow-mist/info.png` |
| Spacing scale (gap after heading too big) | 1 | Specialists heading gap | `P/shots-assistant-settings/meadow-mist/assistant-specialists.png` |

## Counts (pieces judged)
FOLLOWS 58, BREAKS 102, NO RULE 41 (a piece counted once; pieces marked with two verdicts were counted as BREAKS).

## Could not judge
- `P/shots-states-settings-repair-narrow/meadow-mist/_unverified/remote-access-not-set-up-narrow.png` and `_unverified/sync-log-open-narrow.png`: both opened to the chat screen with no settings popup, so the narrow Remote Access and narrow Backup & Sync states are not seen. The folder also has no verified shots (only `_unverified`).
- `P/shots-assistant-settings-narrow/meadow-mist/narrow-drawer.png` and `narrow-general.png`: narrow-drawer opened as a plain chat screen and narrow-general as the chat, so the phone-width Assistant settings General page is not seen (only the Context tooltip at `P/shots-cloud-context-narrow/meadow-mist/info.png` shows part of it).
- `P/shots-states-remote-access/meadow-mist/remote-consent.png`: shows the connected-devices view, not the consent tick-box line. The consent piece was judged from `assistant-claude-skip-on.png` instead.
- `P/shots-error-audit-current/meadow-mist/_unverified/*` (openrouter test failure, report-diagnose-setup-failure, report-submit-rejection, report-summary-rejection): the four are in an `_unverified` folder; only the OpenRouter one was opened (it showed "Checking..." and no failure text), the three "report" shots were not confirmed.
- `P/shots-error-batch1/meadow-mist/` files unrelated to settings (approval-card-unconfirmed, close-prompt-meta-unreadable, file-link-failed, file-save-unchecked, library-*, marketplace-uninstall-failed, model-picker-native-failed, native-send-unconfirmed, question-card-unconfirmed, skills-drawer-load-failed, slash-copy-failed, tag-*): these are chat/library/tag screens outside Settings; not judged here. `sync-retry-failed.png`, `sync-wizard-upload-failed.png`, `update-download-failed.png` were judged (section 8). `_unverified/sync-retry-report-bug.png` showed the same Backup & Sync error card and was not judged further.
- Only meadow-mist was opened; midnight and light were not checked.
- Some files opened in batches returned images that did not match their name (repeat of a neighbouring screen), so a few rows (e.g. `assistant-general-picker.png`, `assistant-claude-skip-on.png` vs `assistant-claude.png`, `assistant-prefs.png`, `assistant-search.png`, `drawer-attention.png`) may show a screen from a neighbouring shot; the row content reflects what the pictures actually showed.
