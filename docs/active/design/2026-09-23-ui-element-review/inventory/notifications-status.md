# Notifications & Status — element inventory

Scope: `youcoded/desktop/src/renderer` (shared by Electron desktop + Android WebView), excluding `dev/`. Method: read the shared primitives in `components/ui/` (`Toast`, `Callout`, `Badge`, `StatusStrip`, `ProgressBar`, `states.tsx`) and the standalone status components (`BrailleSpinner`, `StatusDot` (type only), `AttentionBanner`, `ThinkingIndicator`), then `rg`-swept the whole renderer for every call site and every hand-rolled look-alike (toast/banner/Callout/Badge/rounded-full dots/animate-spin/animate-pulse/Spinner/Progress/ErrorState/EmptyState/color utilities/status/dot). Screenshots opened with Read to confirm at least one real render per family from `scratch/ui-consistency-baseline/shots-*/<theme>/<surface>.png`.

---

## NOTIFICATIONS

### 1. Toast — floating transient message
- Looks like: a small dark pill that appears above the message box, shows one line of text plus an optional single button, and disappears on its own after a few seconds.
- Exact styling: `OverlayPanel` layer 4, `px-4 py-2 text-sm`, `radius-lg` (set inline, not via a Tailwind class), fixed and centered above the input bar (`variant="global"`) or pinned just above a small control like the Like button (`variant="anchored"`). Error tone adds a 6px red (`bg-destructive`) dot before the text. Auto-dismiss default 3000ms; `null` keeps it until dismissed.
- Built with: `components/ui/Toast.tsx` primitive (the only two call sites left).
- Used for: one-off confirmations/errors that don't belong in the chat timeline — e.g. "Copied", a failed like/share action.
- Count: 2 real render sites — `App.tsx:4385` (global app toast, replaces the old app-wide hand-rolled toast + 14 scattered `setTimeout`s per the file's own comment), `components/marketplace/LikeButton.tsx:208` (anchored, replaced a separate hand-rolled mini-toast). `utils/announce.ts` is a helper that feeds the App-level toast, not a separate UI.
- Screenshot: none captured directly (a toast is timed and easy to miss in a static shot) — would need a capture right after a Like-button tap or a "Copied" action.

### 2. In-chat attention/error banner
- Looks like: a rounded chat-bubble-shaped card that replaces the "thinking…" indicator when something needs the user's eyes — "Still waiting on your assistant…", "Session ended unexpectedly.", a red-ringed provider-error message with 1-2 buttons (Retry / Stop / Switch Providers / Upgrade plan / Open Settings / Add credit).
- Exact styling: `bg-inset`, `rounded-2xl rounded-bl-sm` (matches the assistant bubble shape), `px-4 py-2.5`. Non-error states: plain `text-fg-muted italic`. Destructive states (`session-died`, `error`, `stalled`) add `ring-1 ring-[var(--destructive)]` and switch text to `text-fg-2`. Spinner (BrailleSpinner) shown while still possibly working.
- Built with: `components/AttentionBanner.tsx`, styled the same family as `ThinkingIndicator.tsx` (both `in-view` bubbles).
- Used for: turn got stuck, session died, provider returned an error, ChatGPT plan-limit hit, OpenRouter credit/key problems.
- Count: 1 component, driven from `ChatView.tsx`'s attention-state machine.
- Screenshot: confirmed — `scratch/ui-consistency-baseline/shots-chatgpt-signin/light/chatgpt-plan-limit.png` shows the red-ringed bubble "You have reached ChatGPT's 5-hour session limit…" with **Upgrade plan** (secondary) + **Switch Providers** (primary) buttons.

### 3. Callout — passive info/warning/danger block
- Looks like: a boxed paragraph with a coloured tint and a thin matching border; optionally a bold title line; optionally collapsible (click to expand). Deliberately has **no button** inside it.
- Exact styling: `rounded-lg p-3 border`. `info` = `bg-accent/10 border-accent/25`; `warning` = `bg-amber-500/10 border-amber-500/25`, title `text-amber-400`; `danger` = `bg-destructive/10 border-destructive/50`, text `text-destructive-fg`.
- Built with: `components/ui/Callout.tsx`.
- Used for: standing information/warnings/danger notices with no action of their own (e.g. "This will delete X", setup prerequisites, sync caveats).
- Count: ~35 tone uses across ~19 files (5 info, ~20 warning, ~10 danger). Locations (top 15): `components/SettingsPanel.tsx` (8 warning/danger uses, e.g. lines 1199, 1243, 1259, 1779, 1839, 1854, 2053, 2403, 2448, 389), `components/SyncSetupWizard.tsx:527,623,638,784`, `components/SyncPanel.tsx:1333`, `components/EngineCard.tsx:329,487`, `components/SessionContextPopup.tsx:317,570,607`, `components/tool-views/ToolBody.tsx:379,486,564,1014,1068`, `components/LocalModelsSection.tsx:934,1159`, `components/AccountSection.tsx:735`, `components/marketplace/MarketplaceDetailOverlay.tsx:389`. Appendix: `assistant-settings/SkipPermissionsSection.tsx:56`, `buddy/BuddyNewSessionForm.tsx:42,197`, `ResumeOptions.tsx:152`, `SessionStrip.tsx:2691`.
- Screenshot: confirmed — `shots-sync-oversize-fix/light/sync-retrying.png`'s "Additional backups" note area is the same box family (checked against source shape); a warning-tone example is visible in `shots-sync-oversize-fix` sync-error/sync-auth-error shots.

### 4. StatusStrip — subsystem status row with one action
- Looks like: a rounded strip inside a settings/wizard screen with a small coloured dot (or a spinner) on the left, one line of status text, an optional quieter detail line, and one button on the right.
- Exact styling: `px-3 py-2.5 rounded-lg bg-inset`, dot `w-2 h-2 rounded-full`: ok=`bg-green-500`, warn=`bg-amber-500`, idle=`bg-fg-muted/40`; `busy` swaps the dot for a `BrailleSpinner`.
- Built with: `components/ui/StatusStrip.tsx`.
- Used for: "what is this subsystem doing right now, and what's the one thing I can do about it" — remote access/Tailscale setup, sync/reconnect state, chat "catching up" banners, local model download, game "waiting for opponent".
- Count: 31 sites. Top offender is `components/SettingsPanel.tsx` (Remote Access setup: lines 1283, 1312, 1319, 1326, 1332, 1381, 1388, 1395, 1404, 1411, 1419, 1458, 1461, 1464, 1469 — 15 of the 31). Others: `components/ChatView.tsx:1091,1099,1104,1110`, `App.tsx:3898,3902`, `components/FirstRunView.tsx:123`, `components/first-run/LocalAppConnect.tsx:65`, `components/LocalModelDownloadStrip.tsx:58,75`, `components/SpecialistModelUnavailable.tsx:96`, `components/InputBar.tsx:945`, `components/game/ChessBoard.tsx:215`, `components/game/ConnectFourBoard.tsx:110`, `components/tool-views/ToolBody.tsx:406`.
- Screenshot: confirmed — `shots-sync-oversize-fix/light/sync-retrying.png` shows the blue dot + "Syncing…" strip inside Backup & Sync.

### 5. ErrorState — the standardized error message
- Looks like: two shapes from one component. **Row** (`mode="recoverable"`): a small red dot, one line of specific error text, a filled Retry button, all on one line. **Card** (`mode="general"`): a red dot, a bold title, a dimmer explainer line, then Report bug / Diagnose with the assistant / Retry buttons right-aligned below.
- Exact styling: `bg-inset/50 rounded-lg p-3`, `role="alert"`; the failure mark is always the same 6px `bg-destructive` dot Toast's error tone also uses. Container is intentionally **neutral** (no red box) — only the dot signals danger.
- Built with: `components/ui/states.tsx` → `ErrorState`.
- Used for: every "this specific thing failed" and every "something went wrong, here's what you can do" message app-wide, per `docs/error-message-standards.md`.
- Count: 45 sites across 25 files — the most-adopted primitive in this catalog. Top files: `components/SettingsPanel.tsx`, `components/SyncPanel.tsx`, `components/SessionDrawer.tsx`, `components/ResumeBrowser.tsx`, `components/marketplace/MarketplaceScreen.tsx`, `components/library/LibraryScreen.tsx`, `components/tags/TagManagerPopup.tsx`, `components/tags/TagPicker.tsx`, `components/model/ModelPicker.tsx`, `components/EngineCard.tsx`, `components/project-view/tabs/FilesTab.tsx`, `components/CommandDrawer.tsx`, plus one each in `App.tsx`, `PermissionsSection.tsx`, `FolderSwitcher.tsx`, `SpecialistsSection.tsx`, `SessionRenameDialog.tsx`, `SessionPreviewPane.tsx`, `pages/PageHost.tsx`, `pages/PagesView.tsx`, `assistant-settings/SavedContextSettings.tsx`, `assistant-settings/SessionNaming.tsx`, `artifact-views/ActiveArtifactView.tsx`, `project-view/ConversationPreview.tsx`, `development/ContributionDesign.tsx`, `development/ReportDesign.tsx`.
- Screenshot: confirmed — `shots-error-batch1/light/tag-picker-load-failed.png` shows the exact recoverable row: red dot, "Couldn't load your tags: Mock failure (tags.list)", filled **Retry** button.

### 6. FieldError — inline field-validation text
- Looks like: a short red line of text directly under a form field (name, handle, password, folder path) — no box, no icon.
- Exact styling: `text-destructive-fg`, `text-3xs` by default (some callers opt into `text-2xs`), `role="alert"`.
- Built with: `components/ui/states.tsx` → `FieldError`.
- Used for: sign-in errors, validation errors, per-row unblock/export/remove errors.
- Count: 34 sites across 15 files, e.g. `components/AccountSection.tsx:275,438,487,637,711`, `components/SyncPanel.tsx:1934`, `components/SyncSetupWizard.tsx`, `components/HandlePrompt.tsx`, `components/ConnectedAccounts.tsx`, `components/EngineCard.tsx`, `components/PermissionsSection.tsx`, `components/ProvidersSection.tsx`, `components/RuntimeBinding.tsx`, `components/SessionDrawer.tsx`, `components/SettingsPanel.tsx`, `components/SkipPermissionsCaption.tsx`, `components/SpecialistsSection.tsx`, `components/assistant-settings/pages.tsx`, `components/first-run/LocalAppConnect.tsx`.
- Screenshot: none opened directly for this family (a validation error only appears mid-interaction); the design comment in the source is itself evidence: 25 hand-rolled copies existed before this primitive, split 19×`text-3xs` / 6×`text-2xs` — the two sizes were kept as an explicit prop rather than unified, so a caller can still pick either size today.

### 7. Permission / confirmation approval row
- Looks like: inline in a tool card — "Yes" / "No" / "Always Allow" buttons in a fixed order and position (never a modal), sometimes with a one-line note under them.
- Exact styling: primary action first (green/filled), deny in the middle for the Bash command shape ("Run it / Skip it | Always Allow"), Enter always presses the first-listed action (never Always Allow).
- Built with: `components/ToolCard.tsx` → `PermissionButtons` (single component; not duplicated elsewhere).
- Used for: every tool-use permission ask and native-runtime approval.
- Count: 1 component, all permission asks route through it (confirmed no second implementation via search for "Always Allow" outside ToolCard.tsx and its detector/dispatcher wiring).
- Screenshot: none opened directly, but `shots-overlays/…/native-session-stalled-and-permission.png` exists and should show it.

### 8. Attention / "needs a look" corner dot
- Looks like: a tiny solid dot pinned to the top-right corner of an icon or avatar — a settings gear, a marketplace sign-in avatar, a mic button, an account row.
- Exact styling: near-identical recipe reused independently in 5+ files, all `absolute -top-0.5/-1 -right-0.5/-1 w-2 h-2 rounded-full`, but the ring/border varies: none (HeaderBar), `ring-1 ring-canvas` (MarketplaceAuthChip), `ring-1 ring-panel` (SettingsPanel), `ring-2 ring-canvas` (VoiceButton). Color carries three unrelated meanings: red-500/blue-500 = "needs attention" vs "informational" (HeaderBar gear, deliberately red-wins-over-blue per its own code comment; MarketplaceAuthChip repeats the same red/blue pair independently), green-400 = "connected" (SettingsPanel account avatar), red-500 = "recording" (VoiceButton, pulsing).
- Built with: hand-rolled every time — no shared "corner dot" component exists despite the recipe being copied at least 5 times.
- Used for: unread/needs-attention badges on the Settings gear and account rows, sign-in-required badge on the marketplace auth chip, live-recording badge on the mic button.
- Count: 6 sites — `components/HeaderBar.tsx:367,369`, `components/SettingsPanel.tsx:2382`, `components/VoiceButton.tsx:304`, `components/marketplace/MarketplaceAuthChip.tsx:99,103`.
- Screenshot: confirmed — `shots-openrouter-trust/light/settings-dot.png` shows the red corner dot live on the Assistant Settings gear AND on the "Cloud provide…" sub-row simultaneously.

### 9. Numeric count / alert badge bubble
- Looks like: a small filled circle or pill with a number in it — a session/unread count, or a red "1" next to a failing setting.
- Exact styling: no shared component; each is its own recipe. `SearchFilterPill.tsx:114` — `min-w-[15px] h-[15px] rounded-full bg-accent text-on-accent text-3xs`. `SessionStrip.tsx:2155` — `min-w-[18px] h-[16px] rounded-full bg-inset text-fg-2 text-3xs font-semibold` (neutral, not accent). The Settings sidebar's red "1" next to "Backup & Sync" (visible in the screenshot below) is a third, red-filled variant.
- Built with: hand-rolled per call site.
- Used for: search-result counts, session tab overflow counts, "N settings need attention".
- Count: 3+ distinct recipes found; not unified.
- Screenshot: confirmed — `shots-sync-oversize-fix/light/sync-retrying.png` and `shots-openrouter-trust/light/settings-dot.png` both show the red numeric "1" pill next to "Backup & Sync — • Sync Failing" in the Settings list.

### 10. Hand-rolled coloured tone pill/label
- Looks like: a small rounded-full, uppercase, tinted label — "INSTALLED", a permission-mode chip ("NORMAL" / "PERMISSION UNKNOWN"), "Sync Failing" / "Sync Warning" in the status bar.
- Exact styling: **three independent recipes** for the same "tinted status label" job:
  - `components/marketplace/MarketplaceCard.tsx:71` `STATUS_TONE_CLASS`: ok=`bg-green-500/15 text-green-400 border-green-500/30`, warn=`bg-amber-500/15 text-amber-400 border-amber-500/30`, err=`bg-red-500/15 text-red-400 border-red-500/30`, neutral=`bg-inset text-fg-2 border-edge`, locked=`bg-inset/50 text-fg-dim border-edge`.
  - `components/StatusBar.tsx:463` `warnStyles`: danger=`bg-red-400/15 text-red-400 border-red-400/25`, warn=`bg-amber-700/15 text-amber-700 border-amber-700/25` — **different red shade (400 vs 500) and different amber shade (700 vs 500) than MarketplaceCard's version, for the same danger/warn meaning.**
  - `components/StatusBar.tsx:147` `PERMISSION_DISPLAY.unknown`: raw hex `color: '#DD4444'`, `border: 'rgba(221,68,68,0.3)'` — a third recipe, and a literal duplicate of the already-defined `--color-red-400` token (`#DD4444` in `styles/globals.css:342`) re-typed by hand instead of referencing it.
- Built with: none — all three are local consts, not a shared primitive.
- Used for: marketplace card status ("Installed", "Update available", "Blocked"), status-bar sync-failure pill, status-bar permission-mode chip.
- Count: 3 recipes, 6 call sites (`MarketplaceCard.tsx:298,423`, `MarketplaceScreen.tsx:826`, `StatusBar.tsx:1174-1176` (permission chip), `StatusBar.tsx:1642` (sync pill)).
- Screenshot: confirmed — `shots-marketplace-overhaul/light/grid.png` shows the light-gray "INSTALLED" pill on 4 cards; `shots-chatgpt-signin/light/chatgpt-plan-limit.png` shows the red-outlined "PERMISSION UNKNOWN" pill in the status bar.

---

## STATUS ELEMENTS

### 11. Status dot — session/subsystem health
- Looks like: a small filled circle next to a session name, folder, or project row: green = working/ok, red = needs input/failed, amber = needs a look, blue = unseen activity, gray = idle.
- Exact styling: the *meaning* (`SessionStatusColor` in `components/StatusDot.tsx`) is shared, but the **hex values are not**: `SessionStrip.tsx:172` `DOT_BG` = `bg-green-400` / `bg-red-400` / `bg-amber-400` / `bg-blue-400` / `bg-gray-500`; `FolderSwitcher.tsx:52` `DOT_CLASS` = `bg-[#44A05C]` (raw hex, green) / `bg-[#DD4444]` (raw hex, red) / `bg-fg-faint` (gray) — **`#44A05C` is a visibly different, darker green than `bg-green-400`'s `#4CAF50`** (globals.css:339), even though both dots claim to mean "ok". `ProjectSwitcher.tsx:243` and `ProjectHero.tsx:544,649` use a third recipe (`bg-green-400`/`bg-red-400`/`bg-fg-faint`, matching SessionStrip's green/red but with no amber/blue option). Size also varies: 1.5px (`SessionContextPopup.tsx:50`, `SessionContextBanner.tsx:75`), 2px (most), 2.5px (`StatusBar.tsx:943`, `SyncPanel.tsx:1439`), 3px (`CompactingCard.tsx:21`, game turn dots).
- Built with: hand-rolled at every site; `StatusDot.tsx` only exports the color/label types, the actual dot markup was deleted and never replaced with a shared component.
- Used for: which session needs attention in the session strip/switcher, which project has sync trouble, which route in the overflow menu needs a look.
- Count: 15+ sites. Locations (top 15): `SessionStrip.tsx:199`, `FolderSwitcher.tsx:352`, `OverflowMenu.tsx:155,182`, `SessionContextPopup.tsx:50`, `SessionContextBanner.tsx:75`, `SettingsPanel.tsx:545,2018`, `SyncPanel.tsx:1203,1439`, `project-view/ProjectSwitcher.tsx:243`, `project-view/ProjectHero.tsx:544,649`, `assistant-settings/AssistantSettings.tsx:121`, `marketplace/CapabilityList.tsx:60`. Appendix: `StatusBar.tsx:943`, `tags/SessionTagsChip.tsx:60` (colour swatch, not a health dot).
- Screenshot: confirmed — `shots-error-batch1/light/tag-picker-load-failed.png` top tab strip shows both a green and a red session-tab dot side by side.

### 12. Spinners — four different visual species doing the same job
- Looks like: (a) a rotating braille character that also slow-cycles through 4 theme colors; (b) a plain CSS ring with one bright quarter spinning (a "loading circle"); (c) an inline SVG spinner icon; (d) a single spinning Unicode glyph.
- Exact styling:
  - **BrailleSpinner** (`components/BrailleSpinner.tsx`): ⠋⠙⠹… cycling every 80ms, color cycling every 600ms through `fg-dim → fg-2 → accent → fg-muted`, one shared timer for every mounted instance (perf-driven design, see its own long WHY comment).
  - **CSS ring spinner**: `w-3 h-3 border-2 border-current/30 border-t-current rounded-full animate-spin` (`SyncSetupWizard.tsx:581,760,906`), a blue variant `w-4 h-4 border-blue-400/30 border-t-blue-400` (`SyncSetupWizard.tsx:1067`), an accent-on-button variant `border-on-accent border-t-transparent` (`MarketplaceDetailOverlay.tsx:320,610`), an accent variant `border-accent border-t-transparent` (`InstallingFooterStrip.tsx:54`).
  - **Inline SVG spin icon**: `VoiceButton.tsx:97`, `w-4 h-4 animate-spin`.
  - **Unicode glyph spin**: `SyncSetupWizard.tsx:68`, a single `◰` character (`◰`) with `animate-spin`, colored `text-blue-400`.
- Built with: `BrailleSpinner` is the primitive (22 call sites); the other three species are all hand-rolled, and three of them live in the same file (`SyncSetupWizard.tsx` alone has both the CSS-ring style and the glyph style).
- Used for: "this is loading/working" everywhere — thinking indicator, attention banner, tool cards, sync wizard steps, marketplace install buttons, voice transcription.
- Count: BrailleSpinner 22 sites (`AssistantTurnBubble.tsx`, `AttentionBanner.tsx`, `FirstRunView.tsx`, `game/GameLobby.tsx`, `marketplace/InstallFavoriteCorner.tsx`, `ModelLoadingBar.tsx`, `ModelProvidersPopup.tsx`, `SpecialistsChip.tsx`, `ThinkingIndicator.tsx`, `ToolCard.tsx`, `tool-views/SubagentTimeline.tsx`, `ui/states.tsx`, `ui/StatusStrip.tsx`); CSS-ring spinner 7 sites (`SyncSetupWizard.tsx` ×4, `MarketplaceDetailOverlay.tsx` ×2, `InstallingFooterStrip.tsx` ×1); SVG icon 1 site; glyph 1 site.
- Screenshot: confirmed — `shots-sync-oversize-fix/light/sync-retrying.png` (blue dot + text, no visible ring spinner in this particular shot); BrailleSpinner is visible in any "thinking" chat shot.

### 13. Progress bar (determinate)
- Looks like: a thin rounded track with a filled, colour-coded bar and an optional right-aligned percentage.
- Exact styling: `h-1.5 rounded-full bg-inset` track (always `bg-inset`, never `bg-well` — the primitive's own doc comment says this replaced 3 near-misses that disagreed), fill `bg-accent` by default or a caller-supplied threshold color (e.g. green→orange→red as usage climbs).
- Built with: `components/ui/ProgressBar.tsx` — this one IS consistently adopted.
- Used for: model download progress, first-run setup, 5-hour/7-day usage limits, voice level, update download.
- Count: 8 sites — `FirstRunView.tsx`, `LocalModelDownloadStrip.tsx`, `LocalModelsSection.tsx`, `ModelLoadingBar.tsx`, `plan-windows.tsx`, `UpdatePanel.tsx`, `UsageCard.tsx`, `VoiceButton.tsx`.
- Screenshot: confirmed — `shots-openrouter-trust/light/card-verified.png` shows two colour-coded bars (green "5-hour limit 42%", orange "7-day limit 61%") for Claude Code, and green bars for ChatGPT.
- **Inconsistency of its own**: the *same* 5h/7d usage numbers appear a second way — as plain text with no bar at all in the bottom status bar chips (visible in the same screenshot's status bar: "5h: 42% Resets @ 8:04am", "7d: 61% Resets Saturday @ 5:04pm"). One surface earns a colour-coded bar, the other gets a number.

### 14. Pulsing "live/active" dot
- Looks like: a small dot with a soft breathing/pulse animation, meaning "this is happening right now."
- Exact styling: all `animate-pulse`, but colour and size are chosen per call site with no shared rule: `bg-accent` 12px (`CompactingCard.tsx:21`, compacting-in-progress), `bg-green-400` 8px ring (`SettingsPanel.tsx:2426`, "connected"), `bg-blue-400` (`SyncPanel.tsx:148,1088,1092,1093,1400`, syncing/hydrating/setup — 5 separate ternary branches in one file), `bg-blue-500` ring (`MarketplaceAuthChip.tsx:103`, sign-in needed), `bg-accent`/`bg-fg-muted` with a ring (`ConnectFourBoard.tsx:218,219`, "your turn"), plus a text-only pulsing pill (`MarketplaceCard.tsx:436`, install-in-progress label).
- Built with: hand-rolled at every site.
- Used for: sync in progress, background compaction running, account connected, sign-in required, "your turn" in a game.
- Count: 9 sites (see above) across 6 files.
- Screenshot: confirmed — `shots-games-arcade/light/arcade-connect4-board.png` shows the turn-indicator dots (filled black/accent disc for "You", outlined disc for "Jake") next to "Your turn".

### 15. Badge — static neutral label (primitive, barely adopted)
- Looks like: a small square-cornered (not pill-shaped) neutral chip with a count or short code, e.g. "4W - 2L".
- Exact styling: `rounded-sm border-edge-dim bg-inset px-1.5 py-0.5 text-3xs text-fg-2`, deliberately colourless by design (the component's own comment: "there is no coloured variant on purpose").
- Built with: `components/ui/Badge.tsx`.
- Used for: static record/count labels.
- Count: **1 call site** — `components/game/GameLobby.tsx:547`. Despite being a real, documented primitive meant to replace "three hand-rolled copies," the numeric/count bubbles found under family 9 (SearchFilterPill, SessionStrip, the red "1" in Settings) do not use it and instead re-invent their own rounded-full recipes — so the consolidation the component's own comment describes never reached those sites.
- Screenshot: none opened (would need the Arcade leaderboard/game lobby capture with win/loss records visible).

### 16. Empty states
- Looks like: centered muted text ("No results", "Nothing here yet") with an optional way-out button ("Clear filters", "Browse themes").
- Exact styling: `EmptyState` primitive has **no mark at all** ("absence IS the empty state's mark" — its own comment) — text-only, `text-sm text-fg-muted` (block) or `text-2xs` (inline), optional secondary button.
- Built with: `components/ui/states.tsx` → `EmptyState`.
- Used for: empty marketplace search, empty library, empty session/tag lists, empty file lists.
- Count: 17 sites — `CommandDrawer.tsx`, `library/LibraryScreen.tsx`, `marketplace/CommentList.tsx`, `marketplace/MarketplaceScreen.tsx`, `PermissionsSection.tsx`, `project-view/tabs/ConversationsTab.tsx`, `project-view/tabs/FilesTab.tsx`, `ResumeBrowser.tsx`, `SessionDrawer.tsx`, `SpecialistsSection.tsx`, `tags/TagManagerPopup.tsx`.
- Screenshot: **gap found** — `shots-marketplace/light/marketplace-empty.png` (a captured "0 results" search state) shows the filter bar with all counts at 0 and the heading "Explore everything," but **no visible empty-state message or icon in the captured viewport** — either the copy sits below the fold or this exact search-empty state isn't wired through the `EmptyState` primitive. Worth a follow-up screenshot scrolled down before treating this as a real gap.

### 17. Loading state / skeleton
- Looks like: almost always a `BrailleSpinner` + "Loading X…" line, never a shimmering placeholder box (a true loading "skeleton").
- Exact styling: `LoadingState` primitive — `flex items-center gap-2`, spinner + `{verb} {what}…` text, block (`py-8 text-sm`) or inline (`text-2xs`) variant. The verb is deliberately not always "Loading" (the component's own comment flags a past bug where "Loading Tailscale…" was shown for a 50MB download).
- Built with: `components/ui/states.tsx` → `LoadingState`.
- Used for: almost every async fetch-in-progress screen.
- Count: 29 sites across 24 files (`artifact-views/ActiveArtifactView.tsx`, `assistant-settings/SavedContextSettings.tsx`, `assistant-settings/SessionNaming.tsx`, `development/ContributionDesign.tsx`, `development/ReportDesign.tsx`, `first-run/LocalAppConnect.tsx`, `first-run/LocalModelSetup.tsx`, `game/ArcadeShell.tsx`, `library/LibraryScreen.tsx`, `marketplace/CommentList.tsx`, `marketplace/FileViewerOverlay.tsx`, `marketplace/MarketplaceScreen.tsx`, `ModelPickerPopup.tsx`, `pages/PageHost.tsx`, `pages/PagesView.tsx`, `PermissionsSection.tsx`, `PreferencesPopup.tsx`, `ResumeBrowser.tsx`, `SessionRenameDialog.tsx`, `SettingsPanel.tsx`, `ShareSheet.tsx`, `SpecialistsSection.tsx`, `SyncPanel.tsx`, `ThemeShareSheet.tsx`, `UpdatePanel.tsx`).
- Coverage note: only one place in the whole renderer talks about a real skeleton — `ProvidersSection.tsx:189`'s comment "Loading — quiet skeleton (a single muted line) rather than a spinner" — meaning the one deliberate exception to the spinner convention is itself just a muted text line, not a shimmer/placeholder skeleton. There is no shimmer-style loading skeleton component anywhere in the renderer.
- Screenshot: none opened specifically for this family (LoadingState renders are transient); would need a throttled-network capture.

### 18. Tags/chips carrying state
- Looks like: a small pill next to a session or tag name, sometimes with a small coloured dot swatch inside it to show the tag's own colour.
- Exact styling: `tags/SessionTagsChip.tsx:60` draws a `w-2 h-2 rounded-full` dot with an **inline `style={{ backgroundColor: 'var(--${c})' }}`** (a CSS-variable lookup built from a string) rather than a Tailwind class — the only status-family dot in the sweep built this way. `project-view/tabs/ContextTab.tsx:157` uses a different pill shape (`text-3xs bg-well border-edge-dim rounded-full px-2 py-0.5`) for what reads as the same "small state label" job.
- Built with: hand-rolled; distinct from `FilterChip`/`FilterMenuChip`/`SearchFilterPill` (those are pick-a-filter controls, not state displays, and are out of scope here).
- Used for: showing a session's assigned tag colour inline.
- Count: 2 sites directly relevant (`SessionTagsChip.tsx:60`, `ContextTab.tsx:157`); the filter-chip family (out of scope) has its own consistent primitive (`components/ui/FilterChip.tsx`) already.
- Screenshot: confirmed — `shots-error-batch1/light/tag-picker-load-failed.png` shows the amber "Priority" tag pill with its colour swatch square, and `shots-chatgpt-signin/light/chatgpt-plan-limit.png` shows a red-dotted "bug +1" chip in the bottom bar.

---

## Inconsistencies spotted

1. **Three separate hand-rolled recipes for "tinted status pill"** doing the identical job (marketplace card status, status-bar sync pill, status-bar permission-mode chip) — different opacity, different red shade (400 vs 500), different amber shade (500 vs 700), and one of them (`PERMISSION_DISPLAY.unknown`) hand-types the exact hex `#DD4444` that a token (`--color-red-400`) already holds. See family 10.
2. **Green used for "ok" in at least 5 different hex values**: `bg-green-400` (#4CAF50, the token), raw `bg-[#44A05C]` in FolderSwitcher's status dot, `bg-green-500` in StatusStrip's ok dot, `bg-green-500/15` in MarketplaceCard's ok pill, `bg-green-600`/`emerald` variants elsewhere. The same "everything is fine" meaning renders as visibly different greens depending which screen you're on.
3. **Amber/warning is the least consistent hue in the app**: amber-400 (7 uses), amber-500 (5), amber-700 (50 — the dominant one, largely session-status "needs a look"), plus yellow-400/500 (SyncPanel, GameOverlay) and orange-400 (OverflowMenu, ToolCard) standing in for the same warning meaning. A real semantic warning token (`--color-warning-fg`) exists in `globals.css` but is used in only 2 files (`RuntimeBinding.tsx`, `BuddyResumeList.tsx`) out of the 30 files that hardcode an amber/yellow/orange shade instead.
4. **A dead/likely-broken colour class**: `components/marketplace/FeedbackSection.tsx:274,295` use `text-danger` for vote/comment error text — there is no `--color-danger` token and no Tailwind config defines a `danger` colour (confirmed: no `tailwind.config.*` file exists; Tailwind v4's `@theme` block in `globals.css` never defines `danger`). Every other error message in the app uses `text-destructive-fg`. This class most likely renders as no colour at all, so these two error messages may not read as errors visually where every other error in the app does.
5. **Status dots have no fixed size**: 1.5px, 2px, 2.5px and 3px versions of the same "small filled circle = status" idea coexist (families 11 and 14), with no documented rule for which size goes where.
6. **The same underlying condition surfaces two/three different ways at once**: a "sync is failing" state is shown simultaneously as (a) a plain corner dot + "• Sync Failing" text in the Settings row, (b) a separate red numeric "1" badge next to that same row, and (c) a bordered text pill "Sync Failing" in the bottom status bar (`StatusBar.tsx` `warnStyles.danger`) — three different visual vocabularies for one fact, all visible at once in `shots-sync-oversize-fix` / `shots-openrouter-trust`'s `settings-dot.png`.
7. **Four unrelated spinner species** (braille glyph, CSS ring, inline SVG, spinning Unicode character) all mean "working," with `SyncSetupWizard.tsx` alone containing two of the four styles in one file. See family 12.
8. **Corner "attention dot"** is copy-pasted independently at least 5 times with 3 different meanings (needs-attention, connected, recording) and inconsistent ring treatment (none / `ring-1 ring-canvas` / `ring-1 ring-panel` / `ring-2 ring-canvas`), despite being visually near-identical everywhere. See family 8.
9. **Badge (the one primitive explicitly built to end "hand-rolled count/record chips") has only 1 real call site.** The count-bubble job it was meant to unify (family 9: SearchFilterPill's search count, SessionStrip's overflow count, Settings' red alert count) is still done with three separate hand-rolled recipes.
10. **Usage/limit percentages are shown two ways for the same numbers**: a colour-coded `ProgressBar` in the Assistant Settings/Cloud Providers panel vs. a bare "42%" text chip with no bar in the bottom status bar, for the identical 5-hour/7-day limit (see family 13's note).

## Coverage

Searched (renderer-wide, `--glob '!dev/**'`, via ripgrep): `<Toast`, `<Callout`, `<Badge`, `<StatusStrip`, `<ProgressBar`, `<ErrorState`, `<EmptyState`, `<LoadingState`, `<FieldError`, `<BrailleSpinner`, `animate-spin`, `animate-pulse`, small `rounded-full` dot patterns (`w-1.5`/`w-2`/`w-2.5`/`w-3` × `h-*`), corner-overlay dot patterns (`absolute -top-* -right-*`), `skeleton`/`Skeleton`, `Saving`/`Saved`/`Syncing` text, `role="status"`/`aria-live`, `PermissionRequest`/approval-card/"Always Allow", `ConfirmDialog`, `UpdatePanel`/`UpdateButton`/update-available, `STATUS_TONE_CLASS`, `warnStyles`, `text-danger`/`text-warning-fg`, and per-hue counts for green/red/amber/yellow/orange/emerald across the whole renderer. Read the full source of every primitive named above plus `BrailleSpinner.tsx`, `StatusDot.tsx`, `AttentionBanner.tsx`, `ThinkingIndicator.tsx`, `FilterChip.tsx`, `OpenTasksPopup.tsx` (task status dots), `ToolBody.tsx` (tool-step lifecycle dots — a neutral, internally-consistent family deliberately excluded from the health-status catalog above since it never carries colour), and the relevant slices of `HeaderBar.tsx`, `MarketplaceAuthChip.tsx`, `MarketplaceCard.tsx`, `StatusBar.tsx`, `SessionStrip.tsx`, `FolderSwitcher.tsx`, `ProjectSwitcher.tsx`, `ProjectHero.tsx`, `SyncPanel.tsx`, `SyncSetupWizard.tsx`, `SettingsPanel.tsx`, `VoiceButton.tsx`, `CompactingCard.tsx`, `ConnectFourBoard.tsx`.

Confirmed against real screenshots: Toast family (indirectly, via the primitive's own replaced-toast comment — no live toast screenshot found), AttentionBanner (`shots-chatgpt-signin/light/chatgpt-plan-limit.png`), Callout/StatusStrip (`shots-sync-oversize-fix/light/sync-retrying.png`), ErrorState (`shots-error-batch1/light/tag-picker-load-failed.png`), attention corner dot + numeric badge + StatusBar pill (`shots-openrouter-trust/light/settings-dot.png`), ProgressBar + text-only duplicate (`shots-openrouter-trust/light/card-verified.png`), tone pill (`shots-marketplace-overhaul/light/grid.png`), pulsing turn dot (`shots-games-arcade/light/arcade-connect4-board.png`), session status dots (`shots-error-batch1/light/tag-picker-load-failed.png`), tag chip with colour swatch (same file).

**Not verified with a screenshot** (documented from source only — flagged rather than assumed fine): Toast primitive's two live call sites, FieldError (34 sites, none opened live), Badge's one call site (`GameLobby.tsx`), permission/confirmation approval row (`shots-overlays/…/native-session-stalled-and-permission.png` exists but was not opened), the true LoadingState spinner-in-place render, and the `EmptyState` gap noted in family 16 (the captured "0 results" shot shows no visible empty-state copy — needs a re-capture scrolled to the empty area before concluding it's actually missing rather than off-screen).

This inventory covers `desktop/src/renderer` only, per the assignment (`dev/` excluded). It does not re-verify Android-specific rendering differences, and does not open every one of the 73 `shots-*` plan directories — screenshot confirmation was targeted at one clear example per family rather than an exhaustive per-surface pass (that exhaustive pass is the `ui-review` skill's job, not this catalogue's).
