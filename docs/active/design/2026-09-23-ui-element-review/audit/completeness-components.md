---
status: active
date: 2026-09-24
related: docs/active/plans/2026-09-21-ui-ux-consistency-audit.md
---

# Completeness audit — did the design-guide effort miss any element category?

Read-only census. This does not re-judge quality of the existing inventory/audit docs — it
checks whether every renderer file's visual *category* was assigned to some doc, and whether
`decisions.md` actually settled it. Source: full recursive listing of
`youcoded/desktop/src/renderer/components/**/*.tsx`, `App.tsx`, `styles/*.css`
(`dev/` excluded per the assignment), cross-checked with `grep -rl <name> inventory audit`
for every file/category named below, then the matched passages read for context (a filename
appearing in another doc's file:line citation list is not the same as that category being
inventoried).

## Coverage (files counted, dirs)

- 267 non-test `.tsx` files under `components/` + `App.tsx`, plus 4 `styles/*.css` files and
  4 component-local `.css` files (`Dialog.css`, `ResumeBrowser.css`, `SettingsDrawer.css`,
  `SessionTagsChip.css`, plus 3 more scoped CSS files) — matches the existing inventories'
  own stated scope (buttons-controls.md counted "488 non-test .ts/.tsx files" renderer-wide,
  which includes hooks/state/etc. outside components/).
- Subdirectories walked: `chat`-equivalent (`ChatView.tsx`, `AssistantTurnBubble.tsx`,
  `UserMessage.tsx`, `ToolCard.tsx` at top level), `tool-views/`, `artifact-views/`
  (+ `zoom/`), `buddy/`, `game/`, `pages/`, `project-view/` (+ `tabs/`), `marketplace/`,
  `first-run/`, `assistant-settings/`, `context-menu/`, `overlays/`, `specialists/`,
  `tags/`, `ui/`, `mascot/`, `guide/`, `git/`, `diff/`, `development/`, `library/`, `model/`.

## Coverage matrix

| Category | Representative files | Covered by | Decided? |
|---|---|---|---|
| Buttons, toggles, checkboxes, radios, segmented tabs, chips | `ui/Button,Toggle,Checkbox,Radio,SegmentedTabs,FilterChip,ZoomPill`, ~360 hand-rolled `<button>` sites | `inventory/buttons-controls.md` | yes (decisions.md: close button, control shape/roundness, secondary=outlined) |
| Cards, list rows, spacing, dividers | grid/panel cards, `SettingRow`, `Callout`, `StatusStrip`, dividers | `inventory/cards-rows-spacing.md`, `audit/spacing-composition.md` | yes (card look, shadow, list-row rules) |
| Headings, eyebrows, body/caption text, counts | type scale, dialog/panel/section titles, count formats | `inventory/headers-text.md` | yes (heading ladder, counts, full-screen titles) |
| Dropdowns, menus, context menu, search fields, tooltips | `Select`, `TypeableSelect`, `ContextMenu`, `SearchFilterPill`, `Tooltip`, `AnchorTip` | `inventory/menus-search-fields.md` | partly (menu-row style decided; dropdown chrome itself not separately decided) |
| Toasts, banners, callouts, status dots/pills, badges, spinners, progress, empty/loading states | `Toast`, `AttentionBanner`, `Callout`, `StatusDot`, `Badge`, `ProgressBar`, `ErrorState` | `inventory/notifications-status.md` | yes (status pill, callout style decided) |
| Dialogs, drawers, full-screen shells, scrims, glass, icon system, `SegmentedTabs` nav | `Dialog`, `SettingsPanel`, `SessionDrawer`, `ScreenBand`, `Icons.tsx` | `inventory/shells-icons-nav.md` | yes (popup title/close decided; glass/blur not decided) |
| Settings screens (all sub-panels) | `assistant-settings/*`, `ThemeScreen`, `SyncPanel`, etc. | `audit/settings-screens.md` | researched, most folded into decisions above |
| Where any button sits in a footer/action row | dialog footers, chat approval cards, empty-state CTAs | `audit/button-placement.md` | researched, not yet a decided rule (candidate rules only) |
| **Diff viewer** | `diff/UnifiedDiff.tsx`, `git/GitReviewCard.tsx`, `git/GitReviewView.tsx` | **NOT COVERED** — 3 passing file:line citations only (as a card-recipe or divider example), never reviewed as its own visual family | NOT COVERED |
| **Terminal view** | `TerminalView.tsx` (721 ln), `SessionTerminal.tsx`, `TerminalToolbar.tsx`, `TerminalRightSlot.tsx` | **NOT COVERED** — zero mentions in any inventory/audit doc | NOT COVERED |
| **Artifact/file viewers** (code, image, PDF, CSV, XLSX, DOCX, HTML, binary) | `artifact-views/*` (2,407 lines across 16 files), `ActiveArtifactView.tsx` (frame/chrome) | **NOT COVERED** — `ImageView`/`PdfView` appear once each as one-off citations; `CsvView`, `XlsxView`, `DocxView`, `HtmlView`, `CodeEditorView`, `BinaryContent/Fallback`, `zoom/Loupe.tsx` never appear at all | NOT COVERED |
| **Composer / input bar** | `InputBar.tsx` (1,218 lines — the single largest uncovered file), `QuickChips.tsx`, `VoiceButton.tsx`, `AttachmentChip.tsx` | **NOT COVERED** as a category — `InputBar`/`QuickChips`/`VoiceButton` show up only as one-off className citations inside other families' appendices; the composer's own chrome (border, focus state, attach/mic/send button cluster layout) was never reviewed together | NOT COVERED |
| **Drag-and-drop zone** | `SessionDropZone.tsx` | **NOT COVERED** — zero mentions | NOT COVERED |
| **Buddy floater windows** (mascot chat popout) | `buddy/BuddyChat.tsx`, `BuddyMascot.tsx`, `BubbleFeed.tsx`, `AttentionStrip.tsx`, `SessionPill.tsx`, `CompactToolStrip.tsx`, `BuddyResumeList.tsx`, `BuddyWelcome.tsx`, `BuddyBarApp/BuddyChatApp/BuddyMascotApp.tsx` | lightly touched — headers-text.md notes Buddy text "bypasses the Tailwind type scale entirely" (one line); no other family reviewed there | NOT COVERED (beyond that one text note) |
| **Mascot / illustration rig** | `mascot/MascotRig.tsx` (543 ln), `mascot/MascotScene.tsx`, `mascot.css`, `default-mascot-paint.css` | **NOT COVERED** — zero mentions | NOT COVERED |
| **Onboarding coach marks / guided tour** | `guide/GuideBubble.tsx`, `GuideRing.tsx`, `GuideTipHost.tsx`, `GuideTour.tsx` | **NOT COVERED** — `GuideBubble` appears once as a className citation only | NOT COVERED |
| **Game boards** (visual design, not just footer buttons) | `game/ChessBoard.tsx` (513 ln), `ConnectFourBoard.tsx`, `FlappyGame.tsx` (737 ln), `TwentyFortyEightGame.tsx` (357 ln), `GameTiles.tsx`, `GamePanel.tsx`, `GameOverlay.tsx`, `ArcadeShell.tsx` | button-placement.md and cards-rows-spacing.md cite `RunOverCard`, `GameLobby`, `ArcadePicker` tile — the boards themselves (piece/tile rendering, board chrome, win/lose treatment) not reviewed | NOT COVERED |
| **Avatars / thumbnails / previews** | `ArtifactThumbnail.tsx`, `HeadPreview.tsx`, `PreviewTimeline.tsx`, `project-view/ConversationPreview.tsx`, `ProviderIcon.tsx` | lightly touched — `ConversationPreview`/`PreviewTimeline`/`HeadPreview` appear as passing citations in spacing-composition.md's screenshot list, not reviewed as a family | NOT COVERED |
| **Data grids / tabular rendering** | `artifact-views/CsvView.tsx`, `XlsxView.tsx` (cell/header/row chrome) | **NOT COVERED** — see artifact viewers above | NOT COVERED |
| **Charts / stat surfaces** | `UsageCard.tsx`, `StatsWithHealthBridge.tsx`, `game/Leaderboard.tsx`, `ModelLoadingBar.tsx` | **NOT COVERED** — `UsageCard`/`StatsWithHealthBridge` appear only as one-off citations | NOT COVERED |
| **Share sheets** | `ShareSheet.tsx`, `ThemeShareSheet.tsx` | touched only incidentally (5 passing mentions across docs, no dedicated review) | NOT COVERED |
| **Decorative/loading animation** | `BrailleBurst.tsx`, `BrailleSpinner.tsx`, `FlowingKeywords.tsx` | `BrailleSpinner` is covered (spinner family, notifications-status.md #12); `BrailleBurst` and `FlowingKeywords` are not mentioned anywhere | PARTIAL |
| **Pages frame / iframe chrome** | `pages/PageHost.tsx`, `PagesView.tsx`, `PageCodeChanged.tsx`, `PageFreshness.tsx`, `PageCreateDialog.tsx` | `PagesEmptyCard`/`PagesView` grid card covered (cards-rows-spacing #5, button-placement); the running-Page frame itself, freshness banner and code-changed banner not reviewed | PARTIAL |
| **Specialists UI** | `SpecialistEnvelope.tsx`, `specialists/SpecialistActions.tsx`, `SpecialistAskBlock.tsx`, `RunStatusLine.tsx`, `SpecialistsChip.tsx`, `SpecialistModelUnavailable.tsx` | `SpecialistReportCard` covered as one card family (cards-rows-spacing #15); Specialists settings page covered (settings-screens.md); the rest of the specialist-run UI (ask block, action row, status line) not reviewed | PARTIAL |
| **Tag glyphs / tag manager visuals** | `tags/glyphs.tsx`, `TagChip.tsx`, `TagManagerPopup.tsx`, `NoteEditor.tsx`, `TagNoteEditor.tsx` | `TagPicker` search field covered (menus-search-fields.md); the glyph set, `TagChip` paint, and note editor not reviewed | PARTIAL |

## Not covered — needs decisions

These are places a person will notice visual inconsistency or taste calls, not just cleanup.
Ordered roughly by how often a user sees the screen.

1. **Composer / input bar (`InputBar.tsx`, 1,218 lines — the largest reviewed-nowhere file).**
   Seen on every chat screen, every time — the most-used surface in the app. Holds the
   attach button, mic button (`VoiceButton.tsx`), send button, `QuickChips.tsx` prompt
   chips, and the attachment-chip tray (`AttachmentChip.tsx`). None of the button/chip/
   field families it's built from were checked *together* as a composed unit — only
   individually, elsewhere, as one-off citations. Needs a decision on: does the composer's
   border/focus ring match the new field standard from `menus-search-fields.md`? Do the
   quick-prompt chips match the `FilterChip` family or are they their own thing? This is a
   taste call, not cleanup, because it's the single highest-visibility unreviewed surface.

2. **Artifact/file viewers — image, PDF, CSV, XLSX, DOCX, HTML, code (`artifact-views/*`,
   2,407 lines across 16 files).** Seen whenever a user opens a file the assistant created
   or attached. Each format viewer was very likely built independently (`CsvView`,
   `XlsxView`, `DocxView`, `HtmlView`, `PdfView`, `ImageView`, `CodeEditorView` are all
   separate ~50–300 line files) — a quick skim of just the file list shows these are not a
   shared component, so a toolbar/header/zoom-control mismatch across formats is likely.
   `ActiveArtifactView.tsx` (658 lines) is the shared shell around all of them and wasn't
   reviewed either. Needs a decision on shared chrome (header bar, zoom controls, unsaved
   banner) across every format.

3. **Terminal view (`TerminalView.tsx`, 721 lines).** Seen whenever a session runs a shell
   command and the user expands the terminal. It has its own scrollbar-hiding CSS rules in
   `globals.css` (lines 482–520+) built specifically to fight xterm's default chrome — a
   sign real visual work already happened here without design-guide sign-off. Needs a
   decision on whether it should look like the rest of the app's cards/panels or stay a
   distinct "raw terminal" treatment.

4. **Diff viewer (`diff/UnifiedDiff.tsx`, `git/GitReviewCard.tsx`, `git/GitReviewView.tsx`,
   ~1,200 lines).** Seen whenever a user reviews code the assistant wrote. Never reviewed
   as its own family — only cited three times as an example inside *other* families'
   evidence (a card recipe, a header divider). Diff coloring (add/remove backgrounds) is a
   taste call that interacts directly with the light/dark/community-theme system.

5. **Mascot rig (`mascot/MascotRig.tsx`, 543 lines) and Buddy floater windows
   (`buddy/*`, 9 files).** Seen constantly if Destin uses the floating Buddy window at all
   — it's a persistent, always-visible surface, not a settings screen opened rarely. Only
   one note exists across every doc ("Buddy text bypasses the Tailwind type scale"). The
   mascot's paint/animation rig and the Buddy chat bubble family were never inventoried.

6. **Game boards (`game/ChessBoard.tsx`, `ConnectFourBoard.tsx`, `FlappyGame.tsx`,
   `TwentyFortyEightGame.tsx`, ~1,900 lines combined).** Each board is very likely a
   custom, independently-styled canvas/DOM rendering (chess pieces, tiles, pipes) — a
   design-taste area with no shared primitive to fall back on. Only the surrounding chrome
   (arcade picker tile, run-over card, lobby footer buttons) was reviewed; the boards
   themselves were not.

7. **Onboarding coach marks (`guide/GuideTour.tsx`, `GuideBubble.tsx`, `GuideRing.tsx`,
   `GuideTipHost.tsx`).** Seen by every new user during first-run guidance. A distinct
   visual language (ring highlight + bubble callout) that wasn't checked against the
   popup/tooltip rules decided elsewhere — plausible for it to now contradict the new
   Tooltip/AnchorTip or popup-title rules.

8. **Data-grid rendering inside CSV/XLSX viewers.** Header row, zebra striping, cell
   borders/typography for tabular data has no reviewed convention at all in a codebase that
   otherwise standardized cards, lists, and menu rows — grid rows are a fourth "list" shape
   nobody looked at.

## Not covered — cleanup only

Lower-taste, more mechanical items — likely just need someone to point a script/read pass
at them rather than a Destin decision, but are still gaps in the inventory as delivered.

- **Drag-and-drop zone (`SessionDropZone.tsx`, 101 lines).** Small, single-purpose, one
  file — a quick read-and-fold-in job, not a design debate.
- **Avatars/thumbnails/previews (`ArtifactThumbnail.tsx`, `HeadPreview.tsx`,
  `PreviewTimeline.tsx`, `project-view/ConversationPreview.tsx`, `ProviderIcon.tsx`).**
  These are small presentational components; likely just need confirming they use the
  already-decided card/border/radius tokens rather than a new taste call.
- **Charts/stat surfaces (`UsageCard.tsx`, `StatsWithHealthBridge.tsx`,
  `Leaderboard.tsx`, `ModelLoadingBar.tsx`).** No evidence of custom chart libraries or
  bespoke bar/line rendering was found in this pass (worth a follow-up grep for `<svg`/
  chart libraries specifically) — plausibly just number/label layout using the
  already-decided text and card rules.
- **Share sheets (`ShareSheet.tsx`, `ThemeShareSheet.tsx`).** Popups; plausibly already
  conform to the new Dialog/popup rules and just need a confirming pass, not new taste
  calls.
- **Decorative loaders (`BrailleBurst.tsx`, `FlowingKeywords.tsx`).** Small, cited
  nowhere; likely fine as-is, just unverified against the spinner-family decision.
- **Pages frame chrome (`PageHost.tsx`, `PageFreshness.tsx`, `PageCodeChanged.tsx`).**
  The Pages *grid card* is decided; the running-Page banner/frame chrome is a smaller,
  bounded gap likely resolved by applying the already-decided Callout/StatusStrip rules.
- **Specialist-run UI (`SpecialistAskBlock.tsx`, `SpecialistActions.tsx`,
  `RunStatusLine.tsx`).** Likely composed from the same `Button`/`Callout`/status-dot
  primitives already decided; needs a confirming read, not a new decision.
- **Tag glyphs/chip paint (`tags/glyphs.tsx`, `TagChip.tsx`, `NoteEditor.tsx`).** Small
  surface area; `TagPicker`'s search field is already covered, this is the remainder.

## Non-visual language

| Aspect | Status | Notes |
|---|---|---|
| Motion / transition timing | **NOT COVERED.** `styles/motion.css` (176 lines, 14 `transition`/`duration`/`@keyframes` rules) exists and is a real, shipped system, but no inventory or audit doc reviews it or proposes a standard duration/easing. Guide-draft.md has no "Motion" recipe section. | Needs a decision if inconsistent durations are visible; currently unverified either way. |
| Focus / keyboard affordances | **Lightly covered, not decided.** `globals.css` intentionally suppresses the default focus ring except for `:focus-visible` (line 379) and gives inputs/textareas/contenteditable their own focus style (lines 434–436) — a real, deliberate system exists in code, but no inventory doc reviews or documents it, and it's absent from `guide-draft.md`. | Cleanup-leaning: the code already has one convention; it mainly needs writing down, not redesigning. |
| Touch / phone-width behavior | **Partly covered.** `button-placement.md` explicitly checked phone-width stacking for empty states and settings lists (screenshots at ≤640px) and flagged that dialog-footer stacking at narrow width is *inferred*, not screenshot-confirmed. No other doc addresses touch target sizing, tap states, or Android-specific layout. | Needs targeted narrow-width screenshots to close the flagged gap; Android rendering is explicitly out of scope everywhere. |
| Copy / wording tone (labels, empty-state text, capitalization) | **Decided for headings/eyebrows only.** `decisions.md` settles Title-Case-vs-Sentence-case for section labels ("no spaced-out capitals... normal case") and count phrasing. Button-label wording tone (imperative vs noun phrases, e.g. "Add provider" vs "Browse marketplace" vs "Already allowed") and empty-state copy voice were not reviewed as a language question anywhere — the docs cover button *shape*, not button *words*. | NOT COVERED as a wording-consistency pass, though a quick sample shows most labels already read as short imperative phrases — likely low-risk, but unverified. |
| Iconography | **Covered.** `shells-icons-nav.md` §11 reviews the icon system (`lucide-react`, sizing, stroke width) renderer-wide. | Covered. |
| Sound | **NOT COVERED.** A "Sound" settings screen exists and is reviewed in `settings-screens.md` (as a settings row), but no doc addresses sound *design* — what sounds exist, when they play, whether they're consistent with the rest of the guide's "taste." Out of scope for a visual-element inventory by nature, but flagged since the task asked for it explicitly. | Out of category for this kind of audit; would need its own pass if wanted. |

## Bottom line

The six inventory docs plus four audit docs are thorough for the primitives-and-chrome layer
(buttons, cards, headers, menus, notifications, shells/dialogs, settings screens, button
placement, spacing). They are **not** thorough for content-rendering surfaces: nothing that
displays a *file, a diff, a terminal, a board game, or the composer itself* got a dedicated
pass — those files only appear as incidental file:line citations borrowed by other
categories' evidence, not as reviewed families. The Buddy floater and mascot rig — an
always-visible surface for anyone using that feature — also got essentially zero review.
Motion timing and focus-ring convention are real, shipped systems in `motion.css`/
`globals.css` that never made it into `guide-draft.md` at all.
