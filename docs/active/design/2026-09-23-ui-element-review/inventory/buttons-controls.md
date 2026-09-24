# Buttons & Choice Controls — Visual Family Inventory

Scope: every clickable "button-shaped" thing and every on/off or pick-one control in
`youcoded/desktop/src/renderer` (React renderer shared by desktop + Android), excluding
`src/renderer/dev/`. Paths below are relative to
`youcoded/desktop/src/renderer/` unless a full path is given.

All line numbers are current as of this audit (2026-09-23) on branch `session/ui-consistency-audit`.

---

## Part 1 — The shared primitives (`components/ui/`)

### Family: Filled accent button ("Primary"), medium
- **Looks like:** A solid, colour-filled rounded rectangle with white-ish text — the app's "do the main thing" button (Save, Sign in, Continue, Send).
- **Exact styling:** height ~30px (`py-1.5` + `text-xs` line height), `px-3`, `rounded-lg` (12px, or 24px on a big-radius theme pack), `font-medium`, fill = accent colour token, text = on-accent token, hover = accent at 90% opacity, press = accent at 80% opacity, visible focus ring.
- **Built with:** `<Button>` primitive, `variant="primary"` (default), `size="md"` (default).
- **Used for:** primary/confirming actions in dialogs and forms across Settings, Sync, first-run, Connect GitHub, etc.
- **Count:** 42 sites — locations: `App.tsx:4015`, `components/AccountSection.tsx:699`, `components/ConnectGithubModal.tsx:264`, `components/ConnectGithubModal.tsx:369`, `components/ContextPopup.tsx:243`, `components/DonateConfirm.tsx:50`, `components/FirstRunView.tsx:220`, `components/ModelProvidersPopup.tsx:753`, `components/PerformancePopup.tsx:127`, `components/PromptCard.tsx:192`, `components/ProvidersSection.tsx:518`, `components/SessionContextBanner.tsx:55`, `components/SessionRenameDialog.tsx:77`, `components/SettingsPanel.tsx:1201` …and 28 more (full list in Appendix A).
- **Screenshot:** `scratch/ui-consistency-baseline/shots-assistant-settings/light/assistant-specialists.png` (dialog action area — same recipe, though that exact frame doesn't crop a primary button; visually confirmed via `shots-games-arcade/light/arcade-picker.png` and `shots-site-gallery/light/tags.png` which both show sibling `secondary` buttons in the same family footprint).

### Family: Filled accent button, small
- **Looks like:** The same filled button, but noticeably shorter/tighter — used for inline row actions rather than dialog footers.
- **Exact styling:** height ~24px (`py-1`, `text-2xs`), `px-2.5`, same radius/colour recipe as above.
- **Built with:** `<Button variant="primary" size="sm">`.
- **Used for:** compact inline actions — engine cards, provider rows, chip rows, quick-chip editing.
- **Count:** 51 sites — locations: `components/AccountSection.tsx:628`, `components/AccountSection.tsx:667`, `components/AttentionBanner.tsx:186/216/221/228`, `components/ChatView.tsx:1094`, `components/CloseSessionPrompt.tsx:354`, `components/ConnectedAccounts.tsx:85`, `components/EngineCard.tsx:356/416/426/439` …and 37 more (Appendix A).
- **Screenshot:** none opened directly for this exact size; `shots-games-arcade/light/arcade-picker.png` shows the sibling `secondary/sm` size for comparison of footprint.

### Family: Filled accent button, large
- **Looks like:** The same filled button, taller — used for the one or two most important actions on a whole screen (sign-in CTAs, "Import", hero actions).
- **Exact styling:** height ~36px (`py-2`, `text-sm`), `px-4`.
- **Built with:** `<Button variant="primary" size="lg">`.
- **Count:** 23 sites — locations: `components/AccountSection.tsx:260`, `components/ConnectGithubModal.tsx:293`, `components/ContextPopup.tsx:223`, `components/ImportProjectModal.tsx:119/150`, `components/MovedGate.tsx:56`, `components/SkillEditor.tsx:149`, `components/SyncSetupWizard.tsx:570/758/904/1060`, `components/UpdatePanel.tsx:359`, `components/marketplace/MarketplaceDetailOverlay.tsx:368/614/640`, `components/marketplace/MarketplaceFilterBar.tsx:258`, `components/marketplace/MarketplaceHero.tsx:85`, `components/marketplace/MarketplaceScreen.tsx:1019`, `components/marketplace/SignInPromptModal.tsx:55`, `components/project-view/ProjectHero.tsx:589`, `remote-gate.tsx:124/152`.
- **Screenshot:** `scratch/ui-consistency-baseline/shots-marketplace/light/marketplace-detail.png` (not this exact size but confirms the family's visual weight relative to other buttons on the same screen).

### Family: First-run pill CTA (the one documented pill exception)
- **Looks like:** A big, fully rounded (stadium-shaped) full-width button — the sign-in choice buttons on the very first screen you see.
- **Exact styling:** `px-6 py-3`, `text-base`, `font-semibold`, `rounded-full` (radius and weight explicitly REPLACE the base recipe — this is Button.tsx's one documented exception).
- **Built with:** `<Button size="xl">`.
- **Used for:** the sign-in method picker (Log in with Claude / ChatGPT / OpenRouter / local model / API key).
- **Count:** 5 sites (the actual `size="xl"` Button call sites) plus 3 more files that hand-copy the identical recipe as a local `PILL` constant instead of using `size="xl"` — see "Hand-rolled first-run pill" below, and "Inconsistencies" #6.
- **Screenshot:** `scratch/ui-consistency-baseline/shots-chatgpt-signin/light/first-run-sign-in.png` — confirmed visible, all 5 stacked pill buttons.

### Family: Outlined/bordered secondary button, medium
- **Looks like:** A hollow rounded rectangle — a border and quiet text, no fill. The app's "Cancel", "Back", or secondary-choice button.
- **Exact styling:** height ~30px, `px-3 py-1.5`, `text-xs`, `border border-edge-dim`, text = fg-2, hover fills lightly with the inset token.
- **Built with:** `<Button variant="secondary">` (`size="md"` default).
- **Count:** 61 sites — locations: `components/AccountSection.tsx:429/448/455/475/607/689/766`, `components/ConnectGithubModal.tsx:260/285`, `components/ErrorBoundary.tsx:35`, `components/FirstRunView.tsx:195/201`, `components/FirstTimeWarning.tsx:91`, `components/HandlePrompt.tsx:133`, `components/LocalModelsSection.tsx:940` …and 47 more (Appendix A).
- **Screenshot:** `scratch/ui-consistency-baseline/shots-games-arcade/light/arcade-picker.png`? not that one; `shots-site-gallery/light/tags.png` shows the Tags & note "Done" footer button which is this recipe at size lg — confirms the shape family (hollow border + hover fill) even though that exact frame is `lg`.

### Family: Outlined/bordered secondary button, small
- **Same look, shorter** (`px-2.5 py-1`, `text-2xs`).
- **Built with:** `<Button variant="secondary" size="sm">`.
- **Count:** 50 sites — locations: `App.tsx:3757/4391`, `components/AttentionBanner.tsx:199/207`, `components/ConnectGithubModal.tsx:310`, `components/ConnectedAccounts.tsx:90/124`, `components/EngineCard.tsx:312/359/384/387`, `components/InputBar.tsx:947`, `components/LocalModelDownloadStrip.tsx:61` …and 38 more (Appendix A).

### Family: Outlined/bordered secondary button, large
- **Same look, taller** (`px-4 py-2`, `text-sm`).
- **Built with:** `<Button variant="secondary" size="lg">`.
- **Count:** 20 sites — locations: `App.tsx:4004/4089/4455/4503`, `components/ContextPopup.tsx:211`, `components/MovedGate.tsx:49`, `components/PreferencesPopup.tsx:233`, `components/buddy/BuddyWelcome.tsx:67`, `components/game/GameOverlay.tsx:85`, `components/library/LibraryScreen.tsx:184`, `components/marketplace/MarketplaceDetailOverlay.tsx:339/358/628`, `components/marketplace/MarketplaceScreen.tsx:409/1010`, `components/marketplace/UpdateButton.tsx:64`, `components/project-view/ImportFileDialog.tsx:135/139`, `components/project-view/ProjectView.tsx:1062/1135`.
- **Screenshot:** `scratch/ui-consistency-baseline/shots-marketplace/light/marketplace-detail.png` — "Uninstall" button, confirmed visible (rendered via `variant="ghost" size="lg"` in that particular file, see note under Inconsistencies — visually close to secondary but text-only, no border, at this size).

### Family: Extra-large pill secondary (first-run)
- **Looks like:** Same stadium-pill shape as the primary pill CTA, but hollow — used beside it on the sign-in screen wording variants.
- **Built with:** `<Button variant="secondary" size="xl">`.
- **Count:** 3 sites — `components/FirstRunView.tsx:184/188/192`.

### Family: Quiet text button ("Ghost"), small
- **Looks like:** No fill, no border at rest — just muted text that brightens and gets a soft background tint on hover. The lowest-emphasis clickable action (e.g. "Skip", a toolbar icon-adjacent label, a link-like action inside a card).
- **Exact styling:** `px-2.5 py-1`, `text-2xs`, text = fg-dim → fg on hover, hover background = inset token.
- **Built with:** `<Button variant="ghost" size="sm">`.
- **Count:** 29 sites — locations: `components/ConnectGithubModal.tsx:241`, `components/EngineCard.tsx:351`, `components/LocalModelsSection.tsx:877`, `components/MarkdownContent.tsx:285`, `components/OpenTasksPopup.tsx:82`, `components/PermissionsSection.tsx:654`, `components/ResumeBrowser.tsx:1208`, `components/SessionDrawer.tsx:985`, `components/SettingsPanel.tsx:569/1261/1941/2032/2035/2472`, `components/SpecialistsSection.tsx:299/300/352`, `components/UpdatePanel.tsx:413`, `components/VoiceButton.tsx:227/243/253`, `components/assistant-settings/SessionNaming.tsx:100`, `components/assistant-settings/pages.tsx:237`, `components/game/ChessBoard.tsx:219/428`, `components/game/ConnectFourBoard.tsx:114`, `components/pages/PagesView.tsx:68`, `components/project-view/ConversationPreview.tsx:86`, `components/ui/ZoomPill.tsx:49`.
- **Screenshot:** `scratch/ui-consistency-baseline/shots-games-arcade/light/arcade-picker.png` (Games panel — likely used for card-level secondary text, visually consistent with definition).

### Family: Quiet text button, medium / large
- **Same recipe**, taller. `md`: 8 sites (`components/QueuedMessagesStrip.tsx` area, `components/SessionDrawer.tsx`, etc. — see raw scan); `lg`: 6 sites — `components/ImportProjectModal.tsx:149`, `components/marketplace/MarketplaceDetailOverlay.tsx:634/644`, `components/project-view/AddProjectModal.tsx:175/205/206`.
- **Note:** `MarketplaceDetailOverlay.tsx:634/644` use `variant="ghost" size="lg"` for its **Uninstall** action — visually a quiet text button, not a bordered one. Flagged in Inconsistencies.

### Family: Solid red destructive button
- **Looks like:** Same shape as the filled accent button, but red — used only for "this deletes/removes something" actions.
- **Exact styling:** Identical geometry to `primary`, fill = destructive token, text = on-destructive token (a themeable colour, not hardcoded white, so it stays readable if a pack makes destructive pale).
- **Built with:** `<Button variant="danger">` (mostly `size="md"`).
- **Count:** 8 `md` sites — `components/AccountSection.tsx:776`, `components/LocalModelsSection.tsx:943`, `components/PermissionsSection.tsx:693/871`, `components/ProvidersSection.tsx:390`, `components/SyncPanel.tsx:1750`, `components/assistant-settings/SkipPermissionsSection.tsx:85`, `components/git/DiscardConfirmDialog.tsx:54`. Plus scattered `sm`/`lg` variants and 2 sites where `variant` is chosen dynamically between `danger`/`primary` (`components/ResumeOptions.tsx:167`, `components/SessionStrip.tsx:2725` — the "Skip Permissions" Create/Resume button turns red only when the dangerous option is on).
- **Screenshot:** none opened directly; would need capture on Settings → Permissions or a Discard-changes dialog.

### Family: Outlined red destructive button
- **Looks like:** A hollow red-bordered button — a lower-emphasis "delete" action next to a filled one, or standing alone in a settings row.
- **Exact styling:** `border border-destructive/50`, text = a SEPARATE destructive-fg token (not the same token as the border — the border is a fill-role colour, the text needs guaranteed contrast, so the two are split intentionally per Button.tsx's own comment).
- **Built with:** `<Button variant="danger-outline">`.
- **Count:** 9 `sm` sites (`components/LocalModelsSection.tsx:902`, `components/ModelProvidersPopup.tsx:939`, `components/PermissionsSection.tsx:835`, `components/ProvidersSection.tsx:344`, `components/SettingsPanel.tsx:2033`, `components/project-view/ProjectHero.tsx:459/567/678`, `components/tool-views/ToolBody.tsx:409`), 2 `md` (`components/AccountSection.tsx:727`, `components/SyncPanel.tsx:1918`), 2 `lg` (`components/ContextPopup.tsx:282`, `components/marketplace/ReportReviewButton.tsx:226`).

### Family: On-accent ghost button
- **Looks like:** A quiet icon/text button meant to sit ON TOP of a solid accent-coloured background (rather than a normal panel) — e.g. the ✕ on the narrow-view toggle hint banner.
- **Exact styling:** text = on-accent at 80% opacity, hover = full on-accent + a light on-accent-tinted background. Added 2026-09-04 specifically because plain `ghost` went unreadable on an accent-filled surface.
- **Built with:** `<Button variant="on-accent">`.
- **Count:** 1 site — `components/guide/GuideBubble.tsx:76`.

### Family: Raised chip-surface icon button
- **Looks like:** A small solid tile (not transparent) with its own border, sitting on top of a photo or file thumbnail — so it stays visible over any image content behind it.
- **Exact styling:** `bg-panel border border-edge`, `icon-xs` size (16px, fully round).
- **Built with:** `<Button variant="raised" size="icon-xs">`.
- **Count:** 1 site — `components/AttachmentChip.tsx:151` (the × on an attachment thumbnail).

### Family: Ghost icon-only square button (28px)
- **Looks like:** A plain square button with just a glyph in the middle, no border, background appears on hover only.
- **Exact styling:** `w-7 h-7 p-0`, `rounded-lg` (inherited from the base recipe), hover fills with the inset token.
- **Built with:** `<Button variant="ghost" size="icon">` (aria-label required by the type).
- **Count:** 5 sites — `components/QueuedMessagesStrip.tsx:77/88`, `components/ui/ZoomPill.tsx:38/61/73` (zoom out / zoom in / loupe toggle).
- **Screenshot:** would need capture on an open image/PDF artifact with the zoom pill visible.

### Family: Ghost icon-only square button (20px, "icon-sm")
- **Looks like:** Same, smaller — used inside a chip-height bar where a full 28px square would force the bar taller.
- **Built with:** `<Button variant="ghost" size="icon-sm">`.
- **Count:** 3 sites — `components/pages/PageHost.tsx:290`, `components/pages/PagesView.tsx:145/156`.

### Family: The shared "×" Close button
- **Looks like:** A 28px square, no border, an SVG X glyph (not a text character), background fades in on hover. Sits in the top-right of nearly every dialog/overlay.
- **Exact styling:** `<Button size="icon" variant="ghost">` wrapping a 16×16 SVG X with 2px stroke — `rounded-lg`, `hover:bg-inset`.
- **Built with:** `<CloseButton>` (wraps `<Button>`).
- **Used for:** dismissing a dialog/popup/overlay.
- **Count:** 23 sites — locations: `components/CopyPicker.tsx:27`, `components/RemoteUnsupportedNotice.tsx:76`, `components/ViewToggleHint.tsx:147`, `components/SyncSetupWizard.tsx:90`, `components/library/LibraryScreen.tsx:216`, `components/SettingsPanel.tsx:345/2050`, `components/SessionDrawer.tsx:731/1407`, `components/project-view/ProjectDetailOverlay.tsx:60`, `components/project-view/HowContextWorksPopup.tsx:398`, `components/ui/Dialog.tsx:256`, `components/project-view/ContextIntroBanner.tsx:69`, `components/project-view/ProjectSwitcher.tsx:261`, `components/marketplace/MarketplaceDetailOverlay.tsx:164`, `components/marketplace/ReportReviewButton.tsx:158`, `components/marketplace/SignInPromptModal.tsx:50`, `components/marketplace/FileViewerOverlay.tsx:94`, `components/pages/PagesView.tsx:77`, `components/marketplace/MarketplaceScreen.tsx:452/800`.
- **Screenshot:** `scratch/ui-consistency-baseline/shots-assistant-settings/light/assistant-specialists.png` — confirmed visible (Assistant settings dialog, top-right ✕).
- **See also:** "Inconsistencies" #1 — at least 4 UNMIGRATED hand-rolled look-alikes of this exact button still exist elsewhere.

---

### Family: The shared toggle switch
- **Looks like:** A small rounded track (like an iPhone-style switch) with a round white knob that slides right when on. Track fills with the accent colour (or red, for a "dangerous" toggle) when on.
- **Exact styling:** 36×20px track, `rounded-full`, 16×16px white knob with a hairline border, 1px border on the track present in BOTH states (so the knob never jumps).
- **Built with:** `<Toggle>` (`checked`/`onChange`; a thin same-visual wrapper in `SettingsPanel.tsx:392` re-exports it under an older `enabled`/`onToggle` API for one legacy caller — same pixels, different prop names, not a visual inconsistency).
- **Used for:** every settings on/off switch in the app.
- **Count:** 37 sites — locations: `components/AboutPopup.tsx:81`, `components/ProvidersSection.tsx:316`, `components/tags/TagManagerPopup.tsx:116`, `components/PreferencesPopup.tsx:270`, `components/EngineCard.tsx:554/576`, `components/PerformancePopup.tsx:116`, `components/ModelPickerPopup.tsx:456`, `components/CloseSessionPrompt.tsx:67/351`, `components/SettingsPanel.tsx:548/1236/1797/1880`, `components/BetaChannelToggle.tsx:95`, `components/LocalModelsSection.tsx:1188`, `components/SessionStrip.tsx:2686/2708` …and 15 more (Appendix B).
- **Screenshot:** would need capture on Settings → any toggle row (e.g. "Share anonymous usage stats").
- **Coverage note:** genuinely ONE recipe app-wide — no hand-rolled toggle-switch look-alikes were found (an old hand-rolled 32×18 red track in the buddy floater's new-session form was found and already migrated per its own 2026-09-10 rewrite comment).

### Family: The shared checkbox
- **Looks like:** A small square, flat corners (not round), with a white checkmark when checked. Deliberately square even on big-radius theme packs, so it never gets confused with a radio dot.
- **Exact styling:** 14×14px, `border-radius: 4px` (a literal pixel value, not a themeable token — by design), fill = accent when checked.
- **Built with:** `<Checkbox>` (a full button) or `<CheckboxMark>` (the same look with no button of its own, for a row that's already the button — used in menu rows).
- **Count:** 7 `<Checkbox>` sites (`components/FirstTimeWarning.tsx:78`, `components/development/ReportDesign.tsx:244/245/252`, `components/assistant-settings/SkipPermissionsSection.tsx:75`, `components/project-view/ProjectView.tsx:1053`) + 2 `<CheckboxMark>` sites (`components/ResumeBrowser.tsx:1440/1510`).
- **Screenshot:** would need capture on Resume browser's multi-select mode.

### Family: The shared radio dot
- **Looks like:** A small hollow circle that fills with a smaller accent-coloured dot when selected — the classic radio-button look.
- **Exact styling:** 14×14px, `rounded-full`, accent border + centred 6px accent dot when checked.
- **Built with:** `<Radio>` inside `<RadioGroup>` (one tab stop, arrow-key navigation).
- **Count:** 5 `<Radio>` sites (`components/ui/SettingRow.tsx:184`, `components/SyncSetupWizard.tsx:434/468`, `components/ToolCard.tsx:763`) + 5 `<RadioGroup>` sites (`components/PreferencesPopup.tsx:132`, `components/ToolCard.tsx:748`, `components/SettingsPanel.tsx:444`, `components/SyncSetupWizard.tsx:425`, plus the doc comment in `components/ui/SettingRow.tsx:123`).
- **Screenshot:** would need capture on Settings → Permissions (permission-mode list) or the Sync setup wizard.
- **See also:** "Inconsistencies" #4 — two OTHER controls in the app use `role="radio"` semantics but are drawn as segmented tab strips, not as this circular dot.

### Family: Segmented tab strip — bare
- **Looks like:** A plain row of text labels; the selected one gets an accent-filled pill, the rest are transparent until hovered.
- **Exact styling:** `px-3 py-1.5`, `rounded-md`, `text-xs font-medium`, active = accent fill + on-accent text, inactive = fg-2 with hover tint.
- **Built with:** `<SegmentedTabs variant="bare">` (the default).
- **Count:** low — most callers pass `variant="contained"` or `"pill"` explicitly; bare is the fallback for any of the 11 `<SegmentedTabs>` sites that omit `variant`.
- **Screenshot:** none confirmed.

### Family: Segmented tab strip — contained (trough)
- **Looks like:** The same tab labels, but sitting inside a shared light-grey trough/pill, splitting the width evenly between segments.
- **Exact styling:** container = `flex gap-1 p-1 bg-inset/50 rounded-lg`; segments `flex-1`.
- **Built with:** `<SegmentedTabs variant="contained">`.
- **Count:** used at, e.g., `components/development/ReportDesign.tsx:229` (Bug/Feature), `components/assistant-settings/SessionNaming.tsx:74`, `components/assistant-settings/ContextSettings.tsx:36`, and others among the 11 `<SegmentedTabs>` sites: `components/PreferencesPopup.tsx:159`, `components/SessionContextPopup.tsx:159/392`, `components/SettingsPanel.tsx:717/1967`, `components/library/LibraryScreen.tsx:233`, `components/marketplace/MarketplaceFilterBar.tsx:163/241`.
- **Screenshot:** none confirmed.

### Family: Segmented tab strip — pill (rounded-full switcher)
- **Looks like:** One big rounded-full "capsule" holding fully-round segments — the Projects/Library-style top-level view switcher, each segment showing an icon + label + a muted count.
- **Exact styling:** container `w-fit flex gap-0.5 p-0.5 layer-surface !rounded-full`, segments `px-3 py-1 rounded-full text-sm font-medium`.
- **Built with:** `<SegmentedTabs variant="pill">` + `<SegmentedTabLabel>`.
- **Used for:** Projects header switcher, Library's Plugins/Themes switcher, Marketplace's All/Plugins/Themes switch — explicitly unified by design (2026-08-27 review) to look identical.
- **Screenshot:** none confirmed directly, but this is the app's flagship "pick one" control and is high-traffic.

### Family: Filter chip (pick-any pill)
- **Looks like:** A small rounded-full pill; lit ones are solid accent, unlit ones are a hollow bordered pill. Several can be lit at once in one row.
- **Exact styling:** `px-3 py-1 rounded-full text-sm`; active = accent fill (no border, the fill carries it); inactive = inset fill + border (deliberately asymmetric).
- **Built with:** `<FilterChip>`.
- **Count:** 4 sites — `components/CommandDrawer.tsx:317/325`, `components/ResumeBrowser.tsx:1539`.
- **Screenshot:** would need capture on the skills/command drawer's filter row.

### Family: Filter menu chip (opens a dropdown, same paint)
- **Looks like:** Identical pill paint to Filter chip, but with a small chevron that flips when its menu is open.
- **Built with:** `<FilterMenuChip>` (same `FILTER_CHIP_*` constants + `<ChevronDown>`).
- **Count:** 2 sites — `components/ResumeBrowser.tsx:1392/1465`.

### Family: Search field with docked filter trigger
- **Looks like:** A rounded-full search box with a magnifying glass on the left and, docked inside its right edge, a small round "sliders" icon button that gets a filled badge showing the active filter count.
- **Built with:** `<SearchFilterPill>` (its own small hand-rolled circular trigger button internally, not `<Button>` — `w-7 h-7 rounded-full`, `hover:bg-well`).
- **Count:** 6 sites — `components/SessionDrawer.tsx:745`, `components/ResumeBrowser.tsx:1609`, `components/project-view/ProjectView.tsx:883`, `components/model/ModelPicker.tsx:802`, `components/marketplace/MarketplaceFilterBar.tsx:128/177`.
- **Screenshot:** would need capture on Project View's Files tab search bar.

### Family: Zoom pill (composed control)
- **Looks like:** A small floating capsule with `[ − | 120% | + | ⌕ ]` — always visible over a zoomable image/PDF, never hover-revealed.
- **Built with:** `<ZoomPill>`, itself composed entirely of `<Button variant="ghost" size="icon"/>size="sm"` — not a new visual recipe, just a specific arrangement of the ghost-icon and ghost-sm families above.
- **Count:** 2 sites — `components/artifact-views/PdfView.tsx:139`, `components/artifact-views/ImageView.tsx:168`.

---

## Part 2 — Hand-rolled buttons found outside `components/ui/`

A source scan found **361 raw `<button` elements** outside `components/ui/` (dev/ excluded).
Below are the distinct visual families among them that are NOT simply passing `className` through
a wrapper of `<Button>`; one-off unstyled or trivially-styled buttons (plain text links with no
box) are grouped together at the end.

### Family: Text/link button
- **Looks like:** Plain underlined coloured text, no button box at all — reads exactly like a hyperlink.
- **Exact styling:** `text-accent underline` (class name `link-control`, defined once in `styles/motion.css` and reused).
- **Built with:** hand-rolled `<button className="link-control ...">`.
- **Used for:** "Clear", "Learn more", small inline text actions inside settings rows and dialogs.
- **Count:** 11 sites — locations: `components/SyncSetupWizard.tsx` (several), `components/marketplace/MarketplaceDetailOverlay.tsx` (several), plus the CSS definition itself in `styles/motion.css`.
- **Screenshot:** `scratch/ui-consistency-baseline/shots-assistant-settings/light/assistant-specialists.png` — the "Clear" text button under the Frontier specialist picker is exactly this family, confirmed visible.

### Family: "Esc · Close" text link (overlay header)
- **Looks like:** No icon at all — a small grey text reading "Esc · Close" in the header of certain wide overlays, replaced by a bordered ✕ on narrow widths (per the code's own comments; the narrow-width X was not independently located in this scan).
- **Exact styling:** `text-fg-dim hover:text-fg text-sm px-2 py-1`, `hidden sm:inline-block`.
- **Built with:** hand-rolled `<button>`, NOT `<CloseButton>`.
- **Used for:** closing the Marketplace "Integration" detail overlay, the plugin/skill `MarketplaceDetailOverlay`, and `FileViewerOverlay` — three different overlays, sharing this one recipe consistently between themselves.
- **Count:** 3 sites — `components/marketplace/MarketplaceScreen.tsx:794`, `components/marketplace/MarketplaceDetailOverlay.tsx:160`, `components/marketplace/FileViewerOverlay.tsx:88`.
- **Screenshot:** `scratch/ui-consistency-baseline/shots-marketplace/light/marketplace-detail.png` — confirmed visible, top-right "Esc · Close".

### Family: Hand-rolled "✕"/"×" close glyph (text character, not SVG) — 3 different recipes
- **1a. `components/ConnectGithubModal.tsx:205`** — `✕` character, `w-6 h-6` (24px, smaller than the shared CloseButton's 28px), `rounded` (default ~6px radius), `hover:bg-inset`.
- **1b. `components/tags/SessionTagsChip.tsx:86`** and **`components/tags/TagChip.tsx:36`** — `×` character, `w-7 h-7` (28px), `rounded-sm` (4px radius — much squarer than the primitive's 12px), `text-lg leading-none`, `hover:bg-inset`.
- **1c. `components/game/ArcadeShell.tsx:367`** — an actual small inline SVG X (closest to the primitive), but `w-7 h-7 rounded-md` (8px radius, not the primitive's 12px `rounded-lg`).
- **Used for:** closing the "Connect GitHub" modal, the session's "Tags & note" popup, and the Games arcade panel, respectively — all three are "close this panel" jobs identical to the 23 sites using `<CloseButton>`.
- **Screenshot:** `scratch/ui-consistency-baseline/shots-site-gallery/light/tags.png` confirms 1b is visible (the "Tags & note" popup's × top-right). `scratch/ui-consistency-baseline/shots-games-arcade/light/arcade-picker.png` confirms 1c is visible (Games panel × top-right).
- **See:** Inconsistencies #1 for the full close-button roundup.

### Family: Small bordered secondary button (compact/text-only, non-primitive)
- **Looks like:** A tiny hollow-bordered text button — visually a smaller, squarer cousin of the shared "Outlined secondary, small" family.
- **Exact styling:** `text-2xs`/`text-xs`, `px-2 py-0.5`, `rounded-md` (8px, not the primitive's 12px), `border border-edge`, `hover:bg-inset`.
- **Built with:** a local `btn` class string, hand-rolled.
- **Used for:** "Note" / "Stop" buttons on a running specialist's action row.
- **Count:** 2 sites — `components/specialists/SpecialistActions.tsx:57/60`.
- **Screenshot:** none found — would need capture with a specialist actively running in a session.

### Family: Marketplace "Integration" action buttons (rounded-md, hand-rolled)
- **Looks like:** Rectangular buttons with an 8px corner radius (visibly squarer than the primitive's 12px `rounded-lg`) — a filled accent "Install/Connect/Retry" button and a hollow "Uninstall" button.
- **Exact styling:** `primaryCls = 'px-4 py-2 rounded-md bg-accent text-on-accent hover:opacity-90'`; `uninstallCls = 'px-4 py-2 rounded-md bg-inset text-fg border border-edge hover:border-edge-dim'`; `disabledCls` = the same shape, muted + `cursor-not-allowed`.
- **Built with:** hand-rolled classes defined once in `IntegrationActions()`, `components/marketplace/MarketplaceScreen.tsx:890-892`, reused across 8 call sites in the same function (lines 896-943).
- **Used for:** Install / Retry Install / Connect / Settings (disabled) / Uninstall on a third-party integration's detail overlay.
- **Count:** 8 sites, one file.
- **Screenshot:** none found — would need capture on Marketplace → an "Integration" card's detail overlay (distinct from the plugin/skill `MarketplaceDetailOverlay`, which correctly uses `<Button>` — see Inconsistencies #7).
- **Flag:** `hover:opacity-90` is the exact hover treatment Button.tsx's own docstring documents as **explicitly rejected** app-wide ("fades the label too... on glow themes the fill fades out from under the theme's own box-shadow glow").

### Family: Status-bar info chip — brightness-hover
- **Looks like:** A tiny rounded-square pill in the status bar bottom row, bordered, with a subtle "brighten on hover" effect (no colour/fill change).
- **Exact styling:** `flex items-center gap-1 px-1.5 py-0.5 rounded-sm border cursor-pointer hover:brightness-125`; colours set via inline CSS var styles rather than Tailwind tokens.
- **Built with:** hand-rolled, identical copy in two files.
- **Used for:** the open-tasks count chip and the specialists count chip in the status bar.
- **Count:** 2 sites — `components/OpenTasksChip.tsx:29-31`, `components/SpecialistsChip.tsx:53`.
- **Screenshot:** would need a session with running/pending tasks or specialists to appear — not captured in the baseline set checked.

### Family: Status-bar info chip — fill-swap hover
- **Looks like:** The same tiny rounded-square pill footprint, but with a visible panel background at rest and a colour SWAP (not a brightness shift) on hover.
- **Exact styling:** `flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-panel border border-edge-dim hover:bg-inset`.
- **Built with:** hand-rolled, in `UsageChip()`, `components/StatusBar.tsx:309-317`, reused for both the 5-hour and 7-day usage window chips (2 render call sites, `StatusBar.tsx:1245`, `:1291`) plus a third `bg-panel` chip variant at `StatusBar.tsx:314`.
- **Used for:** the "5h: 42% Resets @..." / "7d: 61% Resets..." usage-window chips, sitting immediately next to the tasks/specialists chips above.
- **Count:** 3 sites, one shared function.
- **Screenshot:** `scratch/ui-consistency-baseline/shots-statusbar-relevance/light/bar-claude-code.png` — confirmed visible (the "5h:"/"7d:" chips at the bottom of the window).
- **Flag:** sits in the exact same status-bar row as the brightness-hover chip family above — see Inconsistencies #2.

### Family: Icon-only square button, 28px — three different corner radii
Three files each draw a 28×28px icon-only square button for a toolbar-style action, and each
picked a different radius/hover token instead of using the shared `<Button size="icon">`:
- **`components/tags/SessionTagsChip.tsx:85`** — `rounded-sm` (4px), `hover:bg-inset`.
- **`components/ZoomOverlay.tsx:41,60`** — `rounded` (Tailwind's bare default, 6px), `hover:bg-well`.
- **`components/game/ArcadeShell.tsx:350,364`** — `rounded-md` (8px), `hover:bg-inset`.
- **The shared primitive itself** — `rounded-lg` (12px), `hover:bg-inset` (ghost variant).
- **Count:** 2 + 2 + 2 = 6 hand-rolled sites, vs. the primitive's `rounded-lg` used elsewhere for the same footprint.
- **Screenshot:** `scratch/ui-consistency-baseline/shots-games-arcade/light/arcade-picker.png` confirms the ArcadeShell instance is visible.
- **See:** Inconsistencies #3.

### Family: Floating pill action cluster (artifact editor)
- **Looks like:** A small cluster of stadium-shaped (fully rounded) buttons that pops in over the bottom-right corner of an open document being edited — "Cancel"/"Save" while editing, or a single "Edit" pill when not.
- **Exact styling:** `flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold shadow-lg` — Cancel = `bg-panel border border-edge`, Save/Edit = `bg-accent text-on-accent`. This exact padding/size (`px-4 py-2.5`, `text-sm`) does not match either of the app's other two pill sizes (the primitive's `xl` pill uses `px-6 py-3 text-base`).
- **Built with:** hand-rolled, `components/SessionDrawer.tsx:1252-1277`.
- **Used for:** Cancel / Save / Edit while editing a text file in the session's file drawer.
- **Count:** 3 sites, one location.
- **Screenshot:** none found — would need capture with an editable text artifact open in the Session Drawer's file view, actively editing.
- **See:** Inconsistencies #6 — a third distinct pill-button size, and Cancel/Save rendered nowhere else in the app this way.

### Family: Hand-rolled first-run pill (duplicates the primitive's `xl` pill by hand)
- **Looks like:** Identical to the shared `<Button size="xl">` pill (same padding/radius/weight), but defined as a local constant instead of using the primitive.
- **Exact styling:** `const PILL = 'px-6 py-3 rounded-full font-semibold text-base w-full';` — byte-identical geometry to Button's `xl` size.
- **Built with:** hand-rolled local constant, duplicated verbatim in 3 files.
- **Count:** 3 sites — `components/first-run/LocalModelSetup.tsx:31`, `components/first-run/LocalAppConnect.tsx:17`, `components/first-run/ApiKeySetup.tsx:13`.
- **Screenshot:** `scratch/ui-consistency-baseline/shots-chatgpt-signin/light/first-run-sign-in.png` — visually identical to the `xl` Button family above, confirmed.
- **Note:** not a visible inconsistency today (the recipe is copied correctly), but it is a maintenance trap — the next time the `xl` pill recipe changes in `Button.tsx`, these 3 files will silently drift out of sync since they don't reference the primitive.

### Family: "Jump to bottom" pill
- **Looks like:** A small dark rounded-full pill, floating at the bottom-center of the chat, appears only while scrolled up.
- **Exact styling:** `px-3 py-1.5 text-xs bg-inset hover:bg-edge rounded-full shadow-lg`.
- **Built with:** hand-rolled, `components/ChatView.tsx:1468`.
- **Count:** 1 site.
- **Screenshot:** none found — would need to scroll a long chat up to trigger it.

### Family: Icon-toggle button ("aria-pressed" favorite/like controls)
Several places implement their own small icon-only toggle button, each independently:
- **`FavoriteStar`** (`components/marketplace/FavoriteStar.tsx:38-48`) — a star outline that fills solid accent-coloured when "favorited"; `p-1 rounded-md`. 3 usage sites.
- **`LikeButton`** (`components/marketplace/LikeButton.tsx:182-196`) — a heart outline/fill with a like count next to it, turns red when liked; `px-1.5 py-0.5 rounded-md text-3xs`. 1 usage site.
- **`VoiceButton`** (`components/VoiceButton.tsx`) — uses the shared `<Button variant={listening ? 'primary' : 'ghost'} size="icon">`, so this one IS on the primitive (listed here only for contrast — it does the same "on/off icon toggle" job correctly through `<Button>`).
- **Count:** 3 (FavoriteStar) + 1 (LikeButton) = 4 hand-rolled toggle sites, vs. `aria-pressed` toggles elsewhere going through `<Button>` (e.g. VoiceButton, `components/ui/ZoomPill.tsx:73` loupe toggle).
- **Screenshot:** `scratch/ui-consistency-baseline/shots-marketplace/light/marketplace-detail.png` — confirmed visible (filled black star icon button, top-right of the plugin detail header).
- **See:** Inconsistencies #5.

### Family: Hand-rolled segmented "pick one" control — bordered full-width, 2 options
- **Looks like:** A single bordered rounded rectangle, split into exactly 2 equal, full-width segments by a vertical divider; the selected segment fills solid accent.
- **Exact styling:** container `flex w-full rounded-lg overflow-hidden border border-edge-dim`; each segment `flex-1 py-1.5 px-2 text-xs`, active = `bg-accent text-on-accent font-medium`, inactive = `bg-panel text-fg-2 hover:bg-inset`.
- **Built with:** hand-rolled `role="radiogroup"`/`role="radio"` pair, `components/ContextPopup.tsx:163-178`.
- **Used for:** choosing whether the status-bar context pill reads "Percentage" or "Token counts".
- **Count:** 1 site (2 rendered buttons).
- **Screenshot:** none found — would need capture on the Context popup (click the context/tokens pill in the status bar).

### Family: Hand-rolled segmented "pick one" control — icon-only, no container
- **Looks like:** Two bare icon buttons side by side with no shared background/border — the selected one is just tinted accent-coloured.
- **Exact styling:** `p-1 rounded-md`, active = `text-accent bg-inset`, inactive = `text-fg-muted hover:text-fg hover:bg-inset`.
- **Built with:** hand-rolled `role="radiogroup"`/`role="radio"` pair, `components/project-view/tabs/FilesTab.tsx:933-956`.
- **Used for:** switching a project's Files tab between grid view and list view.
- **Count:** 1 site (2 rendered buttons).
- **Screenshot:** would need capture on Project View → Files tab.

### Family: Hand-rolled segmented "pick one" control — pill mini-tabs with count badges
- **Looks like:** Small rounded-full "chip" tabs in a row, each showing a bold count + a word (e.g. "3 devices"); the selected one is solid accent with an accent border, unlit ones are a hollow inset pill.
- **Exact styling:** `role="tablist"`/`role="tab"`, `rounded-full px-3 py-1 text-2xs`, active = `bg-accent text-on-accent border border-accent`, inactive = `bg-inset border border-edge-dim text-fg-dim`.
- **Built with:** hand-rolled, `components/SyncPanel.tsx:1248-1277`.
- **Used for:** switching the Sync panel's device/project/conversation count tabs.
- **Count:** 1 site (3 rendered tabs).
- **Screenshot:** would need capture on Settings → Backup & Sync with sync enabled and healthy.

### Miscellaneous unstyled/trivially-styled hand-rolled buttons
The remaining ~330 hand-rolled `<button>` sites are either: (a) already-catalogued families
above rendered via a dynamic/passed-through className the scan resolved separately, (b) plain
text with no box styling at all (breadcrumb path segments in `FilesTab.tsx:917-923`, markdown
inline code-copy buttons, command-drawer rows whose "button-ness" is really a full list row),
or (c) one-off icon buttons whose class strings are unique enough (dashed-border command-drawer
"create new" tile, dotted-underline filepath tokens, etc.) that they don't repeat anywhere else
and so don't form a second instance of a "family" — each looks different because each does a
genuinely different, unrepeated job. These were read individually (see Coverage) but are not
worth their own family entries per the "two things with the same look = one family" rule; none
of them duplicate a Button-primitive recipe closely enough to flag as drift.

---

## Inconsistencies spotted

1. **"Close" (✕) renders at least 5 different ways for the identical job.** The shared
   `<CloseButton>` primitive (SVG X, 28px, 12px corner radius, `hover:bg-inset`) is used
   correctly at 23 sites, but four more places still hand-roll their own close button, each
   drifted differently:
   - `components/ConnectGithubModal.tsx:205` — `✕` text character, 24px, 6px radius.
   - `components/tags/SessionTagsChip.tsx:86` / `components/tags/TagChip.tsx:36` — `×` text
     character, 28px, 4px radius (noticeably squarer).
   - `components/game/ArcadeShell.tsx:367` — real SVG X, 28px, but 8px radius instead of 12px.
   - `components/marketplace/MarketplaceScreen.tsx:794`, `MarketplaceDetailOverlay.tsx`,
     `FileViewerOverlay.tsx:88` — no icon at all, a text link reading "Esc · Close" (internally
     consistent between these three, but a fifth visual style overall).
   A user closing five different popups in one session sees five different close controls.

2. **The status bar itself mixes two different "small info chip" hover treatments side by
   side.** `OpenTasksChip` / `SpecialistsChip` (rounded-sm, border, brighten-on-hover, no fill
   change) sit directly next to `StatusBar.tsx`'s usage-window chips (rounded-sm, filled panel,
   swap-to-inset on hover) — same size, same job (a small clickable status readout), two
   different hover languages in the same row.

3. **The same 28×28px icon-button footprint appears with three different corner radii**, none
   of which is the shared primitive's `rounded-lg` (12px): `SessionTagsChip.tsx` (`rounded-sm`,
   4px), `ZoomOverlay.tsx` (bare `rounded`, 6px), `ArcadeShell.tsx` (`rounded-md`, 8px). All
   three could be `<Button variant="ghost" size="icon">` unchanged.

4. **"Pick one of N" controls render at least 5 visually distinct ways.** The dedicated
   `<SegmentedTabs>` primitive already ships 3 different looks by design (bare / contained
   trough / rounded pill), which is documented and intentional. But on top of that, three more
   places hand-roll their OWN "pick one" control instead of using it, each with a completely
   different look for the same underlying job: `ContextPopup.tsx` (a bordered 2-segment bar),
   `FilesTab.tsx` (bare icon-only toggle), and `SyncPanel.tsx` (pill mini-tabs with count
   badges, which — coincidentally — looks almost like `FilterChip`, a different primitive
   entirely, rather than like `SegmentedTabs`).

5. **Icon-toggle "favorite"/"like" controls are hand-rolled independently in the marketplace**
   (`FavoriteStar.tsx`, `LikeButton.tsx`) rather than sharing one recipe, even though both are
   doing the identical "aria-pressed icon toggle" job that `VoiceButton` and `ZoomPill`'s loupe
   button already do correctly through `<Button>`.

6. **Pill-shaped (stadium) buttons come in three different, unrelated sizes**, despite
   `Button.tsx`'s own docstring insisting there is exactly ONE documented pill exception
   (`size="xl"`, `px-6 py-3 text-base`, for first-run sign-in CTAs only):
   - The documented `xl` pill (first-run sign-in) — correctly used at 5 sites.
   - An identical-looking pill hand-copied as a local `PILL` constant in 3 other first-run
     files instead of importing `size="xl"` (currently harmless since the numbers match, but
     will silently drift the next time the primitive's pill recipe changes).
   - A THIRD, smaller pill (`px-4 py-2.5 text-sm`, with its own `shadow-lg`) used for the
     floating Cancel/Save/Edit cluster in the artifact file editor (`SessionDrawer.tsx`) — a
     size that appears nowhere else and was never run through the primitive at all.

7. **The same "Install/Uninstall a plugin" job renders two different ways depending on which
   overlay you're on.** `MarketplaceDetailOverlay.tsx` (the skill/plugin detail screen) uses
   the shared `<Button variant="secondary|ghost" size="lg">` correctly. `MarketplaceScreen.tsx`'s
   `IntegrationActions()` (the third-party "Integration" detail screen, e.g. GitHub/ChatGPT)
   hand-rolls its own `primaryCls`/`uninstallCls`/`disabledCls` with an 8px corner radius
   (vs. the primitive's 12px) and, more importantly, uses `hover:opacity-90` — the exact hover
   treatment `Button.tsx`'s own comments document as **explicitly rejected app-wide** because it
   fades the button's label and breaks glow-theme box-shadows. A comment in the code
   (`// Shared styles — mirrors MarketplaceDetailOverlay's primary + uninstall classes`) claims
   these two screens are kept in sync by hand, but they are not: one migrated to `<Button>` and
   the other didn't.

8. **"Cancel"/"Save" render at least 3 different ways** depending on where they appear: as the
   shared rectangular `secondary`/`primary` Button (most dialogs), as the floating pill cluster
   described in #6 (artifact editor), and nowhere pinning down one canonical look for this pair
   even though it's one of the most common action pairs in the app.

---

## Coverage

**Searched:** the entire `youcoded/desktop/src/renderer/` tree (`components/`, `hooks/`,
`state/`, `game/`, `parser/`, `bootstrap/`, `themes/`, `utils/`, `data/`, `styles/`, plus
top-level files like `App.tsx`), explicitly excluding `src/renderer/dev/` per instructions and
all `*.test.tsx`/`*.test.ts` files. 488 non-test `.ts`/`.tsx` files in scope.

**Method:**
- Read all 10 primitive source files in `components/ui/` in full: `Button.tsx`, `Toggle.tsx`,
  `Checkbox.tsx`, `Radio.tsx`, `SegmentedTabs.tsx`, `CloseButton.tsx`, `FilterChip.tsx`,
  `FilterMenuChip.tsx`, `SearchFilterPill.tsx`, `ZoomPill.tsx`.
- A small Node script parsed every `<Button …>` JSX call site (367 matches) and grouped by its
  `variant`/`size` prop pair, resolving dynamic/conditional variant expressions by hand for the
  ~15 sites that used them (e.g. `variant={dangerous ? 'danger' : 'primary'}`).
- `rg -n` for every other primitive's exact JSX tag (`<Toggle`, `<Checkbox`, `<CheckboxMark`,
  `<Radio`, `<RadioGroup`, `<SegmentedTabs`, `<FilterChip`, `<FilterMenuChip`,
  `<SearchFilterPill`, `<ZoomPill`, `<CloseButton`) across the whole tree, with every result
  location recorded.
- A second script found all 361 raw `<button` elements outside `components/ui/` with a
  line-window regex, then normalized and clustered their `className` values to find repeated
  hand-rolled recipes; ~140 of the 361 needed manual `rg`/`Read` follow-up because their
  className was on a different line than the matched window (multi-line JSX with interposed
  comments) — these were chased down individually by targeted `rg` searches for specific
  patterns (`role="radio"`, `role="tab"`, close-glyph characters `✕`/`×`, `aria-label="Close"`,
  `rounded-full shadow-lg`, dynamic class-name constants like `btnClass`/`primaryCls`/
  `disabledCls`/`btn`) rather than read exhaustively one-by-one.
- Confirmed zero native `<input type="checkbox">` / `type="radio">` anywhere in scope — every
  on/off or pick-one control in the app is button-based (primitive or hand-rolled).
- Cross-referenced `scripts/ui-review/plans/*.json` for surface names and opened baseline PNGs
  in `scratch/ui-consistency-baseline/shots-*/light/` to confirm visibility for the families
  most central to the Inconsistencies section (10 screenshots opened: `assistant-specialists`,
  `tags` (×2 plan variants), `bar-claude-code`, `arcade-picker`, `marketplace-detail`,
  `first-run-sign-in`).

**Could not verify / not exhaustively checked:**
- Not every one of the ~50 distinct Button variant×size combinations was matched to an opened
  screenshot — for combinations with low usage counts (1–3 sites), "Screenshot: none found" is
  honest rather than guessed; a targeted capture would be needed to confirm on-screen appearance
  for: on-accent, raised/icon-xs, ghost/icon, ghost/icon-sm, most danger/danger-outline sites,
  the SessionDrawer floating pill cluster, the three hand-rolled segmented-radio controls
  (ContextPopup, FilesTab, SyncPanel), the status-bar brightness-hover chips (need an active
  task/specialist to render), and the Marketplace "Integration" detail overlay's hand-rolled
  actions.
- The ~140 hand-rolled `<button>` sites whose className fell outside the scan's line window were
  triaged by targeted pattern search rather than individually read end-to-end; it is possible a
  small number of additional repeated hand-rolled families exist among them that this pass
  didn't surface. The families reported above account for every REPEATED (2+ site) pattern this
  audit found; true one-off buttons doing a genuinely unique job were not forced into families.
- Screenshots were checked only in the `light` theme for each surface opened; cross-theme drift
  (e.g., whether a hand-rolled hex/inline-style colour like `OpenTasksChip`'s `color: '#60a5fa'`
  breaks on a theme pack) was not verified — that is a colour-token question better suited to a
  cross-theme researcher, not this pass.
- Android-specific rendering differences were not checked (no Android screenshots exist in the
  baseline set browsed); this inventory is desktop/Electron screenshots only, though the
  component source is shared with Android per the workspace's architecture.

---

## Appendix A — full location lists (Button primitive, sites >15)

### secondary, md (61 sites)
components/AccountSection.tsx:429, :448, :455, :475, :607, :689, :766, components/ConnectGithubModal.tsx:260, :285, components/ErrorBoundary.tsx:35, components/FirstRunView.tsx:195, :201, components/FirstTimeWarning.tsx:91, components/HandlePrompt.tsx:133, components/LocalModelsSection.tsx:940, components/ModelPickerPopup.tsx:515, components/ModelProvidersPopup.tsx:244, :750, components/PermissionsSection.tsx:683, :862, components/ProvidersSection.tsx:217, :371, :384, :515, components/SettingsPanel.tsx:1448, :2061, :2141, :2431, :2501, :2560, components/SkillEditor.tsx:133, :142, components/SyncPanel.tsx:1513, :1747, :1904, components/SyncSetupWizard.tsx:845, :953, :1083, components/TerminalToolbar.tsx:75, components/ThemeScreen.tsx:275, components/artifact-views/ViewerErrorBoundary.tsx:35, components/assistant-settings/SkipPermissionsSection.tsx:84, components/development/ContributionDesign.tsx:121, components/development/ReportDesign.tsx:199, :215, :285, :294, :308, components/first-run/ApiKeySetup.tsx:59, :62, components/first-run/LocalAppConnect.tsx:87, :115, :119, :123, components/first-run/LocalModelSetup.tsx:62, :102, :105, :108, components/git/DiscardConfirmDialog.tsx:53, components/pages/PageHost.tsx:227, components/project-view/ProjectView.tsx:924.

### primary, sm (51 sites)
components/AccountSection.tsx:628, :667, components/AttentionBanner.tsx:186, :216, :221, :228, components/ChatView.tsx:1094, components/CloseSessionPrompt.tsx:354, components/ConnectedAccounts.tsx:85, components/EngineCard.tsx:356, :416, :426, :439, components/HandlePrompt.tsx:122, components/LocalModelsSection.tsx:510, :1318, :1406, components/ModelLoadingBar.tsx:195, components/ModelProvidersPopup.tsx:375, :616, :627, :947, :968, components/ProvidersSection.tsx:367, components/QuickChips.tsx:334, :442, components/SettingsPanel.tsx:1312, :1319, :1326, :1332, :1381, :1388, :1395, :1404, :1419, components/ShareSheet.tsx:110, components/SpecialistModelUnavailable.tsx:89, :91, components/SyncPanel.tsx:1162, :1179, :1564, components/UpdatePanel.tsx:418, components/artifact-views/BinaryContent.tsx:64, components/game/GameLobby.tsx:471, :517, components/project-view/AddProjectModal.tsx:152, components/tags/TagManagerPopup.tsx:77, components/tags/TagPicker.tsx:84, components/ui/InputGroup.tsx:28, components/ui/SettingRow.tsx:105, components/ui/StatusStrip.tsx:41.

### secondary, sm (50 sites)
App.tsx:3757, :4391, components/AttentionBanner.tsx:199, :207, components/ConnectGithubModal.tsx:310, components/ConnectedAccounts.tsx:90, :124, components/EngineCard.tsx:312, :359, :384, :387, components/InputBar.tsx:947, components/LocalModelDownloadStrip.tsx:61, components/LocalModelsSection.tsx:888, :898, :1372, components/ModelProvidersPopup.tsx:72, :211, :216, :221, :365, :370, :605, :613, :979, components/OpenTasksPopup.tsx:68, components/ProvidersSection.tsx:204, :331, :335, components/SessionContextPopup.tsx:240, :287, components/SettingsPanel.tsx:559, :1847, :1923, components/SyncPanel.tsx:1173, :1569, components/ThemeScreen.tsx:606, components/buddy/BuddyResumeList.tsx:184, components/game/FlappyGame.tsx:497, components/game/GameLobby.tsx:479, :562, components/game/RunOverCard.tsx:63, components/game/TwentyFortyEightGame.tsx:167, components/marketplace/FeedbackSection.tsx:262, :265, :299, components/project-view/ProjectHero.tsx:462, :554, :659, components/ui/states.tsx:78.

### primary, md (42 sites)
App.tsx:4015, components/AccountSection.tsx:699, components/ConnectGithubModal.tsx:264, :369, components/ContextPopup.tsx:243, components/DonateConfirm.tsx:50, components/FirstRunView.tsx:220, components/ModelProvidersPopup.tsx:753, components/PerformancePopup.tsx:127, components/PromptCard.tsx:192, components/ProvidersSection.tsx:518, components/SessionContextBanner.tsx:55, components/SessionRenameDialog.tsx:77, components/SettingsPanel.tsx:1201, :1449, :1804, :1860, :1986, :2498, :2563, components/ShareSheet.tsx:139, components/SyncPanel.tsx:2024, components/SyncSetupWizard.tsx:642, components/ThemeScreen.tsx:297, components/ThemeShareSheet.tsx:216, :233, :250, components/ToolCard.tsx:1296, components/artifact-views/UnsavedChangesDialog.tsx:59, :60, :61, components/buddy/BuddyNewSessionForm.tsx:42, components/buddy/BuddyWelcome.tsx:22, components/development/ContributionDesign.tsx:100, :120, components/development/ReportDesign.tsx:189, :198, :216, :307, :318, components/ui/Button.tsx:131, :146 (the primitive's own doc examples).

### ghost, sm (29 sites)
components/ConnectGithubModal.tsx:241, components/EngineCard.tsx:351, components/LocalModelsSection.tsx:877, components/MarkdownContent.tsx:285, components/OpenTasksPopup.tsx:82, components/PermissionsSection.tsx:654, components/ResumeBrowser.tsx:1208, components/SessionDrawer.tsx:985, components/SettingsPanel.tsx:569, :1261, :1941, :2032, :2035, :2472, components/SpecialistsSection.tsx:299, :300, :352, components/UpdatePanel.tsx:413, components/VoiceButton.tsx:227, :243, :253, components/assistant-settings/SessionNaming.tsx:100, components/assistant-settings/pages.tsx:237, components/game/ChessBoard.tsx:219, :428, components/game/ConnectFourBoard.tsx:114, components/pages/PagesView.tsx:68, components/project-view/ConversationPreview.tsx:86, components/ui/ZoomPill.tsx:49.

### primary, lg (23 sites)
components/AccountSection.tsx:260, components/ConnectGithubModal.tsx:293, components/ContextPopup.tsx:223, components/ImportProjectModal.tsx:119, :150, components/MovedGate.tsx:56, components/SkillEditor.tsx:149, components/SyncSetupWizard.tsx:570, :758, :904, :1060, components/UpdatePanel.tsx:359, components/artifact-views/BinaryFallback.tsx:39, components/marketplace/MarketplaceDetailOverlay.tsx:368, :614, :640, components/marketplace/MarketplaceFilterBar.tsx:258, components/marketplace/MarketplaceHero.tsx:85, components/marketplace/MarketplaceScreen.tsx:1019, components/marketplace/SignInPromptModal.tsx:55, components/project-view/ProjectHero.tsx:589, remote-gate.tsx:124, :152.

## Appendix B — Toggle full location list (37 sites)
components/AboutPopup.tsx:81, components/ui/SettingRow.tsx (doc reference), components/ProvidersSection.tsx:316, components/tags/TagManagerPopup.tsx:116, components/PreferencesPopup.tsx:270, components/EngineCard.tsx:554, :576, components/PerformancePopup.tsx:116, components/ModelPickerPopup.tsx:456, components/CloseSessionPrompt.tsx:67, :351, components/SettingsPanel.tsx:548, :1236, :1797, :1880, components/BetaChannelToggle.tsx:95, components/LocalModelsSection.tsx:1188, components/SessionStrip.tsx:2686, :2708, components/HelpPopup.tsx:88, components/ThemeScreen.tsx:326, :341, components/ResumeBrowser.tsx:1598, components/RuntimeBinding.tsx:390, components/ResumeOptions.tsx:152, :161, components/SyncSetupWizard.tsx:513, App.tsx:3982, components/SyncPanel.tsx:1219, :1383, components/assistant-settings/pages.tsx:298, components/buddy/BuddyNewSessionForm.tsx:194, components/assistant-settings/SkipPermissionsSection.tsx:50.
