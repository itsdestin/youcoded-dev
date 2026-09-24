---
status: active
date: 2026-09-24
related: docs/active/design/2026-09-23-ui-element-review/decisions.md
---

# Unreviewed surfaces — composer, file viewers, terminal, diff/Git review, buddy floater, games, guided tour, drag/share/thumbnails

Read-only review of eight surfaces the element-review effort never looked at (confirmed
against `audit/completeness-components.md` and `audit/completeness-screens.md`). Source read
directly under `youcoded/desktop/src/renderer/components` (`dev/` excluded); screenshots
opened under `scratch/element-sweep/shots-*`. Every finding below cites the file:line and,
where one exists, the screenshot.

## Breaks decided rules (by surface)

### 1. Composer (message box, quick chips, attachments, status bar)

- **Status Bar Widgets popup's section labels use spaced capitals.** Decision (Heading
  ladder, H-3/L-1…L-4): "Small section labels: 12px medium grey, **normal case — no
  spaced-out capitals** (VOLUME → Volume)." `StatusBar.tsx:795` renders `ALWAYS ON`,
  `RATE LIMITS`, `SESSION`, `TOKENS` with `className="text-3xs font-medium text-fg-muted
  tracking-wider uppercase mb-2"` — the exact pattern the decision rejected. Screenshot:
  `shots-main/light/customize-status-bar.png`.
- **The permission-mode chip's own text is set in capitals**, separately from the popup-label
  issue above. Decision (Status labels): "a small tinted pill in the label's color, **normal
  case**... No capitals." `StatusBar.tsx:148-160`'s `PERMISSION_DISPLAY` table stores the
  labels as literal capitalized strings — `'NORMAL'`, `'ACCEPT CHANGES'`, `'PLAN MODE'`,
  `'BYPASS PERMISSIONS'`, `'ASK FIRST'`, `'AUTO EDIT'`, `'FULL AUTO'`, `'PERMISSION UNKNOWN'`
  — so the chip renders in caps by construction, not by a CSS transform. The chip is
  otherwise a correct tinted pill (color/bg/border per mode). Screenshot: `shots-main/light/
  home.png`, bottom bar ("NORMAL").
- **Two secondary buttons are bare text instead of outlined**, in two different composer
  sub-popups: the mic's download-failed card shows `<Button variant="ghost">Not now</Button>`
  next to a filled Download/Retry (`VoiceButton.tsx:227`); the quick-chip editor's Save/Add
  rows put a filled `Save`/`Add Custom` button first, then a raw `<button>` (`text-3xs
  text-fg-muted`, no border) for `Cancel` — both wrong on two counts: bare text, and on the
  wrong side of the filled button (`QuickChips.tsx:340`, `:449`).
- Everything else in the composer already complies: the "Edit Quick Chips" and "Status Bar
  Widgets" popups both use the shared 16px-semibold title + tapered divider + ✕ pattern
  correctly (`QuickChips.tsx` `ChipEditorPopup`, `StatusBar.tsx:792`); the status-bar chips'
  roundness, the quick-prompt chips, the attachment card and the mic button all use Tailwind
  `rounded-*` classes that Tailwind's `@theme` block (`globals.css:303-309`) maps straight to
  the theme's own `--radius-*` custom properties — so they already move with the theme's shape
  setting and are **not** a control-shape violation, despite looking hard-coded at a glance.

### 2. File viewers (image, PDF, CSV/XLSX, DOCX, HTML, code)

- **The open-file header does not use the shared popup/side-panel title.** Decision (Popup
  and side-panel titles): "Every popup and side panel uses the shared popup title (16px
  semibold, one line, tapered line under it, close button right)... Session Files... Games
  conform." The Session Files drawer's own *list* header does conform (`text-base
  font-semibold` + tapered divider + `CloseButton`, `SessionDrawer.tsx:718-736`). But once a
  file is open, a **second, different header** takes over: the filename renders at
  `text-sm-tight font-semibold` (not 16px/`text-base`) at `SessionDrawer.tsx:1012-1024`,
  left-aligned and click-to-rename, followed by **five separate icon buttons** — Open
  externally, Download (remote), Copy path, Reveal in folder, Expand/shrink — before the
  close ✕ (`SessionDrawer.tsx:1112-1121`), each a plain 28px `IconBtn` with no shared
  popup-title chrome around them. Screenshots:
  `shots-artifact-zoom/light/image-zoomed.png`, `shots-artifact-zoom-pdf/light/pdf-base.png`
  (top strip reads "latency-chart.png [↗] [copy] [folder] [expand] [✕]" and
  "scroll-perf-report.pdf [≡] [↗] [🕮] [folder] [⛶] [✕]").
- The same header is reused, unchanged, by Git file review (`GitReviewView.tsx`, "Standard
  top bar (above) stays" — `SessionDrawer.tsx:1190-1193`), so this finding also covers §3.
- **Another spaced-capitals label**, inside the artifact conflict banner (shown when a file
  changes on disk while you're editing it): `ActiveArtifactView.tsx:609`, `className="text-3xs
  font-medium text-fg-muted tracking-wider uppercase mb-1"` for "What keeping yours changes
  (disk → your draft)".
- **The Unsaved-changes popup shows three filled buttons in a row, with no primary/secondary
  distinction and the destructive action in the middle.** Decision (Secondary buttons /
  destructive confirm): "outlined... never bare text," and a destructive confirm should read
  filled-danger-on-the-right in wide layouts. `artifact-views/UnsavedChangesDialog.tsx:59-61`
  renders `<Button onClick={onCancel}>Cancel</Button> <Button onClick={onDiscard}>Discard
  </Button> <Button onClick={onSave}>Save</Button>` — none passes a `variant`, so all three
  default to filled/primary (`ui/Button.tsx`'s default), and "Discard" (destructive) sits in
  the middle, not at either edge.
- Everything else here is solid: `ZoomPill` (`ui/ZoomPill.tsx`) is built entirely from the
  `OverlayPanel` + `Button variant="ghost"` primitives, so it already follows the
  roundness/shape rule and is shared identically by `ImageView.tsx` and `PdfView.tsx`; DocxView
  routes converted HTML through the themed `.doc-html` class (no unstyled/hardcoded colors).

### 3. Terminal / diff viewer / Git file review

- Git review's header break is the same one described in §2 (reuses `SessionDrawer`'s file
  header, not a distinct issue).
- **Two more spaced-capitals labels** in the diff renderer shared by tool cards, the artifact
  conflict view, and Git review: `diff/UnifiedDiff.tsx:229` ("Show N more lines" /
  "Show less" — `text-3xs text-fg-muted tracking-wider uppercase`) and the identical pattern
  reused at `git/GitReviewView.tsx:350`.
- **Git review's card is flat and sunken, not raised.** Decision (Card look): "Raised
  everywhere: panel color, thin border and a shadow." `git/GitReviewCard.tsx:25` is
  `` `shrink-0 rounded-lg border ${accent ? 'border-accent' : 'border-edge'} bg-well
  overflow-hidden` `` — `bg-well` is the app's sunken/inset tone (not `bg-panel`), and there is
  **no shadow class anywhere in the file**. This is the shell every commit card and the pinned
  "Uncommitted" card render inside, so it affects every row in Git review. Also, the card list
  wrapper uses an 8px gap (`GitReviewView.tsx:199`, `gap-2`) against the decided 12px between
  cards. No screenshot exists for this surface (see Coverage) — source-only.
- **Two secondary actions in the commit row are bare text, and the diff/review "show more"
  links repeat the spaced-capitals pattern.** `git/GitReviewView.tsx:270` ("Include in
  commit", a plain `<button>` with only a hover text-color change, no border) and `:283`
  ("Revert Changes…", same treatment) both need outlining per the secondary-button rule.
  Separately, "Show more" (`GitReviewView.tsx:350`) and "Show N more lines" /"Show less"
  (`diff/UnifiedDiff.tsx:229`) both render `text-3xs ... tracking-wider uppercase` — the same
  spaced-capitals pattern flagged everywhere else in this review, applied to a button label
  this time rather than a section heading.
- Diff row colors (`bg-red-400/10`/`bg-green-400/10` with hardcoded red/green bars,
  `UnifiedDiff.tsx:191-202`) are deliberately theme-independent — the file's own comment says
  so, and this matches the app's existing documented rule that status colors stay hardcoded
  across themes (`react-renderer.md`: "Status colors... are theme-independent and stay
  hardcoded"). Not a break; noted under Coverage/cleanup, not as a new question. Likewise,
  `UnifiedDiff.tsx`'s row-box roundness (`rounded-sm`) and `GitReviewCard`'s (`rounded-lg`) are
  Tailwind classes mapped to the theme's `--radius-*` tokens (see §1) — not hardcoded shape.
- Terminal view itself (`TerminalView.tsx`, `TerminalToolbar.tsx`) breaks no decided rule —
  its Android/remote toolbar is deliberately styled to match `QuickChips` (`TerminalToolbar.tsx:13`,
  "so terminal-view and chat-view share the same... visual"). It simply has no card/popup
  chrome to check against (see new questions, below).

### 4. Buddy floater windows

- **This is the one surface where the roundness really is hard-coded, not theme-linked.**
  Everywhere else in this review, a Tailwind `rounded-*` class turned out to already be
  theme-aware (Tailwind's `@theme` block maps `rounded-sm/md/lg/xl/2xl/full` straight to the
  app's `--radius-*` custom properties — see §1). Buddy's floater components are written with
  raw inline `style={{ borderRadius: <number> }}` instead of Tailwind classes, which bypasses
  that mapping entirely: `buddy/AttentionStrip.tsx:68` (`borderRadius: 999`, the live-status
  pill) and `buddy/SessionPill.tsx:80,117,148,191` (`999`, `16`, `10`, `10` across the
  switcher button and its popover). These numbers will never move if a community theme ships a
  different (e.g. sharper) shape pack — a real instance of "nothing keeps a hard-coded pill."
- **The same status pill is also the wrong color.** Decision (Status labels): "a small tinted
  pill in the label's color... a live status... also carries its colored dot inside the pill."
  `AttentionStrip.tsx:60-73`'s pill is a neutral `var(--fg-dim)`-on-glass background with only
  the small dot colored to the status — the pill itself never picks up the status tint.
- One more instance of the spaced-capitals pattern: `BuddyResumeList.tsx:194`, the "Recent"
  label above the resume list — `className="text-3xs font-medium text-fg-muted tracking-wider
  uppercase"`.
- Two things already comply well and are worth naming as evidence the pattern is known and
  achievable elsewhere: `BuddyWelcome.tsx` stacks "New Session" (filled) **on top** of
  "Resume Session" (outlined) in its narrow column (`BuddyWelcome.tsx:59-77`) — exactly the
  decided stacked-order rule (filled on top). `BuddyResumeList.tsx`'s session rows are plain,
  hover-tinted, no box (`BuddyResumeList.tsx:217-240`) — correct for a pick-one/switcher list
  per the list-rows-by-job rule.
- No screenshot exists for any of this (see Coverage) — every finding here is code-only.

### 5. Guided tour / coach marks

- **The step-count eyebrow is set in spaced capitals.** `guide/GuideBubble.tsx:70` renders the
  "2 of 8"-style eyebrow with `className="text-2xs font-medium uppercase tracking-wider
  text-on-accent/70"` — the same pattern the heading-ladder decision retired everywhere else.
  This one postdates the tour's own design spec (`docs/archive/specs/
  2026-09-10-first-run-guide-design.md`, which specified "an eyebrow ('2 of 8')" without
  saying it should be capitalized) — it's a later, broader rule the tour was never revisited
  against, not a spec contradiction.
- The bubble has no ✕ close button anywhere in the file — confirmed by search
  (`grep -n "close\|×\|✕\|CloseButton" guide/GuideBubble.tsx` returns nothing). This matches
  what the original spec actually asked for (Skip tour / Next / Done as the only exits, no ✕),
  so it predates and isn't a violation of the later "every popup closes with ✕" decision —
  it's a real conflict between an older, still-valid spec and a newer, broader rule. Left as a
  question below rather than a break, since the spec never covered it either way.

### 6. Games (boards + arcade panel)

- **The solo game-over card's buttons are in the wrong order.** Decision (Button arrangement
  by width): "side by side: the filled button on the right, the outlined one directly left of
  it." `game/RunOverCard.tsx:60-65` renders `<Button variant="primary">Play again</Button>`
  **first** (left) and `<Button variant="secondary">Back to games</Button>` **second**
  (right) inside a plain `flex` row — filled on the left, outlined on the right, backwards.
  Confirmed visually: `shots-games-death/light/flappy-dead.png` shows "Play again" (solid
  black) left of "Back to games" (outlined) right. Contrast with
  `buddy/BuddyNewSessionForm.tsx:204-216`, in the same app area, which gets this right
  (Cancel/outlined left, Create/filled right).
- **Three more spaced-capitals labels**: `game/FlappyGame.tsx:724` and
  `game/TwentyFortyEightGame.tsx:334` (both `text-2xs uppercase tracking-wide text-fg-muted`
  for their stat labels — visible as "PIPES" / "BEST" in `shots-games-death/light/flappy-dead.png`),
  and `game/Leaderboard.tsx:125` (`text-2xs font-medium text-fg-muted tracking-wide uppercase`;
  the comment right above it, line 122, calls this "the app's only section header" — a
  pre-existing games-arcade convention that now conflicts with the later heading-ladder
  decision).
- **The Games panel's own title bar doesn't match what decisions.md says it does.** Decision
  (Popup and side-panel titles) names Games as already conforming. In code,
  `game/ArcadeShell.tsx:346-376` (`ArcadeHeader`) renders the title at `text-sm font-semibold`
  (14px, not the popup title's 16px/`text-base`), left-aligned next to an optional back-chevron,
  with a plain 1px `border-b` (not the tapered-fade divider the other conforming popups use).
  Screenshot `shots-games-arcade/light/arcade-picker.png` shows "Games" reading visibly smaller
  and flatter than "Edit Quick Chips" / "Status Bar Widgets" in the same theme. Either the
  decision's claim is stale or this is a second, unlisted header — worth resolving explicitly.
- **Arcade picker tiles have no shadow.** Decision (Card look): "Raised everywhere: panel
  color, thin border **and a shadow**." `game/ArcadePicker.tsx:69-80`'s `GameCard` is
  `rounded-lg bg-well border border-edge-dim` — border only, no `shadow-*` anywhere in the
  class list.
- Two things that look like open questions are actually **already decided** in earlier,
  separate decks and should not be reopened: chess piece treatment is "SETTLED: 'outline'"
  (`game/ArcadeShell.tsx:336-343`, deck `G-8`), and board background shading is "DECIDED...
  'contrast'" (`game/ChessBoard.tsx:77-99`, deck `board-contrast`, 2026-08-31). The
  `?chess=disc|fill` and `?board=soft|wood|today` screenshot variants on disk
  (`shots-games-chess-*`, `shots-games-board-*`) are the rejected alternatives kept
  renderable for reference, not unresolved options — decisions.md and guide-draft.md should
  just cross-reference these two decks so a future reader doesn't re-litigate them.

### 7. Drag-and-drop zones, share sheets, thumbnails/previews

- **The skill Share sheet hand-rolls its own title instead of using the shared one.**
  `ShareSheet.tsx:78-86` wraps its content in `<Dialog open onClose={onClose} size="prompt"
  ...>` (the same primitive `StatusBar.tsx`'s conforming popups use) but never passes a
  `title` prop — instead it builds its own header inside the body: `<h3 className="text-sm
  font-bold text-fg">Share...</h3>` (14px bold, not 16px semibold) next to a bare `&times;`
  glyph button (`className="text-fg-muted hover:text-fg text-lg leading-none"` — no 28px
  soft-hover square, no `CloseButton`). This is a small, mechanical fix: pass `title="Share"`
  to the existing `Dialog` and delete the hand-rolled header.
  `ThemeShareSheet.tsx` was not read in this pass — worth the same five-minute check.
- **The Project View conversation-preview footer card uses a one-off shadow value.** Decision
  (Card shadow, F-3): the medium shadow is `0 4px 20px rgb(0 0 0 / .16), 0 1px 3px rgb(0 0 0 /
  .08)`. `project-view/ConversationPreview.tsx:172` instead hardcodes `shadow-[0_4px_16px_rgba(0,0,0,0.18)]`
  — close but not the decided value (single layer, different blur/opacity).
- **Conversation card date is knowingly NOT on the name line — code already found the
  conflict decisions.md needs to know about.** Decision (Conversation card date, CA-2): "Date
  top right, on the name line." `ResumeBrowser.tsx:1249-1282` (the shared row card also used
  by Project View's Conversations tab and the Resume-Session panel opened from a file drawer)
  puts the date on a **second, metadata line** instead — and says exactly why, in its own
  comment: "The timestamp lives here rather than on the title line: the two icon buttons
  [rename pencil, tag glyph, complete check] own the card's top-right corner, and a third
  item crowding in beside them read as part of that control cluster." Confirmed visually in
  `shots-resume-preview/light/resume-preview-selected.png` and
  `shots-conversation-previews/midnight/projects-conversation-preview.png`: the name line's
  right side holds the rename/tag/complete icon cluster, and "7/29/2025" sits right-aligned
  one line below, next to the project/model/size trail. This isn't a miss — it's a considered
  decision that contradicts CA-2 as written, made because CA-2 didn't anticipate a card that
  also needs icon buttons on that same corner. Decisions.md should either amend CA-2 for this
  card shape or confirm the date's current position is the intended exception.
- **Four more spaced-capitals labels, all in the shared Resume/conversation-picker code**:
  `ResumeOptions.tsx:127` ("Model"), `:147` ("Skip Permissions"), `:160` ("Launch in New
  Window"), and `ResumeBrowser.tsx:1594` ("Show Complete") — all
  `text-3xs font-medium text-fg-muted tracking-wider uppercase`. `ResumeOptionsForm` is the
  exact component `ConversationPreview.tsx:177` renders in its footer card, so these render
  wherever that card does — visible as "MODEL", "SKIP PERMISSIONS", "LAUNCH IN NEW WINDOW",
  "SHOW COMPLETE" in both screenshots above.
- The drop-zone that appears when dragging a **session pill** onto the chat area is a
  fully-designed hot zone: a dashed accent outline, a tinted accent fill, and a floating
  pill label ("Open in a new window" / "Move here") — `SessionDropZone.tsx:94-98`. By
  contrast, dropping a **file** onto the chat/composer (`InputBar.tsx:893-901`,
  `handleDrop`/`handleDragOver`) shows **no visual feedback at all**: it just calls
  `e.preventDefault()`. This isn't a rule break (decisions.md never addressed drop states)
  but it's a visible inconsistency between two drag-and-drop affordances in the same window;
  see the new question below.

### Cross-cutting: the same small mistake, a dozen times

The spaced-capitals section-label pattern the heading-ladder decision explicitly rejected
("VOLUME → Volume") turned up independently in **fourteen instances across eleven files, in
seven of the eight surfaces reviewed here**: `StatusBar.tsx:795` (composer/status bar),
`ActiveArtifactView.tsx:609` (file viewers), `UnifiedDiff.tsx:229` + `GitReviewView.tsx:350`
(diff/Git review), `BuddyResumeList.tsx:194` (buddy floater), `GuideBubble.tsx:70` (guided
tour), `FlappyGame.tsx:724` + `TwentyFortyEightGame.tsx:334` + `Leaderboard.tsx:125` (games),
and `ResumeOptions.tsx:127,147,160` + `ResumeBrowser.tsx:1594` (conversation
previews/thumbnails, shared by Resume Browser, Project View, and the file-drawer's Resume
Session panel). Drag-and-drop/share sheets is the one surface with no instance of this pattern.
A related but mechanically different case — `StatusBar.tsx`'s `PERMISSION_DISPLAY` table
storing labels as literal capitalized strings ("NORMAL", "BYPASS PERMISSIONS") rather than a
CSS transform — is counted separately above under Composer, since fixing it means editing the
label text itself, not a shared class. None of the fourteen `tracking-wider uppercase`
instances were touched by the original heading-ladder pass (which scoped to
`inventory/headers-text.md`'s own citations). This reads as a single global-CSS-class-level
fix (a shared "eyebrow label" utility/component) rather than fourteen one-off edits — worth
flagging as its own follow-up task once decisions.md's heading-ladder rule ships, rather than
fixed piecemeal per surface.

## New questions for Destin

Merged down from the individual findings above to the ones that need Destin's taste, not
just a mechanical fix.

1. **File viewer toolbar.** Right now every open file gets the same header (filename +
   Open-externally/Copy-path/Reveal/Expand/Close, `SessionDrawer.tsx:1012-1121`) regardless of
   whether it's an image, a PDF, a spreadsheet, or code — and that header doesn't match the
   shared popup-title look used everywhere else. Options: (a) keep this header's own five-icon
   toolbar look but restyle it to match the popup title (16px title, tapered divider, single ✕
   at far right, other icons moved into an overflow or a secondary row) — most consistent, but
   a bigger visual change to a screen used constantly; (b) leave the toolbar as-is (it works,
   it's compact, five icons fit on one line) and simply document it as a **second, intentional
   header family** alongside the popup title, scoped to "the thing being shown is a file, not a
   dialog" — least work, but the guide would then need to explain two header styles instead of
   one; (c) split the difference — keep the icon row but restyle just the title text to 16px
   semibold so it reads as "the same family, adapted for a toolbar." Affects: every file view
   (image/PDF/CSV/XLSX/DOCX/HTML/code) and Git file review, which reuses this exact header.
2. **Terminal identity.** The terminal (`shots-main/light/terminal-view-no-pty.png`) currently
   looks nothing like the rest of the app — no card border, no shadow, a plain sharp-edged input
   box at the bottom instead of the chat composer's rounded `bg-inset` pill. Options: (a) give it
   the same raised-card treatment as everything else (thin border + medium shadow around the
   terminal pane, composer-style rounded input) — most consistent, but a monospace terminal
   inside a "soft app card" can look odd, and xterm's own chrome fights some of this (see
   `globals.css` lines ~482-520, custom scrollbar-hiding CSS already built for it); (b) keep it
   as a deliberately distinct "raw terminal" look, and just make that a named, documented
   exception (the way tool cards and permission prompts already are) — least work, keeps the
   "this is a real terminal" cue; (c) match only the input box to the chat composer (so switching
   between chat and terminal feels like one app) while leaving the terminal output area
   unstyled/raw. Affects: terminal view, both empty and live-PTY (no screenshot exists of the
   live-PTY state — see Coverage).
3. **Buddy floater windows — full popup rules, or an exception?** The mascot/chat/bar are three
   small, borderless, always-on-top OS windows, not dialogs or side panels — none of them today
   carries a title bar, a close ✕, or a card border, and BuddyWelcome/BuddyNewSessionForm/
   BuddyResumeList each look like a plain vertical stack rather than a titled popup. Options:
   (a) treat them as exempt, the way tool cards and permission prompts are exempt today — a
   floating companion window is a different category than a popup, and forcing a 16px title +
   ✕ onto a 320px-wide always-visible widget could feel cramped; (b) require the popup-title
   pattern inside the chat/new-session/resume panes even though the window itself has no OS
   chrome — most consistent with "every popup and side panel," but adds visual weight to a
   surface designed to be quick and light; (c) something in between — no title bar, but the
   close/dismiss affordance (currently the OS window controls plus a hide button per
   `.claude/rules/buddy-floater.md`) gets visually aligned with the app's 28px ✕ square.
   Affects: all three buddy windows; no screenshot exists for any of them today (structurally
   excluded from the capture tool — see Coverage), so this decision would currently be made
   from code alone.
4. **File drag-and-drop feedback.** Dropping a session pill onto the chat area shows a
   fully-designed hot zone (dashed border, tinted fill, floating label); dropping an actual
   file onto the same chat/composer area shows nothing at all while dragging, though the file
   still attaches on drop. Options: (a) give file drag-over the same visual language as the
   session drop zone (dashed accent border + label like "Attach files") for a consistent feel;
   (b) leave it as-is — file drop already works, and per-pixel drag-over feedback for a fast,
   frequent action (attaching a file) may not be worth the visual noise; (c) a lighter touch —
   just a subtle border tint on the composer itself, no floating label. Affects: the chat/
   composer area whenever a file is dragged over the window.
5. **Games panel header.** Confirm whether the panel's current header (14px left-aligned title,
   optional back-chevron, plain divider) is meant to be a smaller, purpose-built variant for
   games specifically (it needs to hold a back arrow the standard popup title doesn't have a
   slot for), or whether it should be upsized/restyled to literally match Settings/Resume/
   Session Files/Add-a-project, per what decisions.md currently says. This is really a
   confirm-or-correct question rather than a from-scratch design choice.
6. **Conversation card date — amend the rule, or fix the card?** The decided rule says the date
   goes top right on the name line. The conversation/resume card (used in Resume Browser,
   Project View and the file drawer's Resume panel) deliberately puts it on the line below
   instead, because two icon buttons (rename, tag) already sit in that top-right corner and a
   third item crowding in there read worse — a real, reasoned trade-off, not a miss. Options:
   (a) keep the card as it is and add a named exception to the rule for cards that carry their
   own icon buttons in that corner — least visual change, and it already reads cleanly in the
   screenshots; (b) redesign the card so the date fits top right anyway (e.g. icon buttons move
   to appear only on hover, freeing the corner) — matches the rule exactly everywhere, but is
   more rework for a small win; (c) leave the rule as written and accept this one card as a
   known, permanent exception without editing decisions.md. Affects every conversation/session
   list row across Resume Browser, Project View and the file drawer.
7. **Guided tour bubble — give it a ✕, or keep Skip tour as the only exit?** Every other popup
   in the app now closes with the drawn ✕ button; the tour bubble (and its one-off tips) only
   offer "Skip tour" / "Next" / "Got it" text buttons, which is what its original design
   intentionally specified before the ✕ rule existed. Options: (a) add the ✕ to match every
   other popup — most consistent, but doubles up with "Skip tour" as a second way to leave; (b)
   keep it text-only, and write it into the guide as a deliberate exception for onboarding
   bubbles (a tour is guiding you somewhere, not something you're dismissing) — least work,
   keeps the tour feeling like guidance rather than a dialog; (c) keep Skip tour for the
   multi-step tour, but add the ✕ to the shorter, one-off tips only (closer to a regular
   notification). Affects every tour step and every contextual tip.

## Cleanup only

- `AttachmentChip.tsx`'s 128×96 card (composer attachment tray) has a border but no shadow —
  minor, and it may be intentionally chip-scaled rather than card-scaled; worth a quick
  confirming look rather than a dedicated question.
- `IconBtn` in `SessionDrawer.tsx:142-156` (the five-icon file-view toolbar) is a hand-rolled
  `<button>` rather than the shared `Button` primitive — same visual result today, but a
  primitive-adoption gap worth folding into whichever fix addresses the toolbar question above.
- `RunOverCard.tsx:50-53`'s "New best" badge is a solid filled-accent chip
  (`bg-accent text-on-accent`), not the tinted-pill treatment status pills use elsewhere — may
  be intentionally a celebratory badge rather than a status label; low priority.
- CSV/XLSX viewers (`sheet-theme.ts`) deliberately render on a fixed light "paper" background
  in every theme (a documented, intentional choice — "like real Excel" — not an oversight).
  Worth a one-line confirmation from Destin since it's the one place in the app that doesn't
  follow the dark/light theme, but it's a working, considered decision, not a bug.
- `HtmlView.tsx:43`'s preview iframe is `bg-white` regardless of theme — reasonable (it's
  rendering the user's own HTML, which may have no background of its own) but worth a glance
  in a dark theme to confirm it isn't jarring against the surrounding drawer chrome.

## Coverage

Screenshots opened this pass, by surface:

| Surface | Screenshots | Status |
|---|---|---|
| Composer / quick chips / attachments / status bar | `shots-main/light/{home,composer-typed,customize-status-bar,edit-quick-chips}.png`, `shots-overlays/light/composer-attachments.png`, `shots-narrow/light/composer-typed.png` | **Covered** — extensive |
| Image/PDF/SVG viewer + zoom | `shots-artifact-zoom*/light/*.png` (image-fitted/zoomed/loupe, svg-loupe, pdf-base/zoomed/loupe) | **Covered** — best-tested corner of this whole review |
| CSV / XLSX / DOCX / HTML / code viewers | none found anywhere on disk (`find scratch -iname '*csv*.png' -o -iname '*xlsx*.png' -o -iname '*docx*.png' -o -iname '*html-view*.png' -o -iname '*code-*.png'` → empty) | **Code-only** |
| Terminal, no active shell | `shots-main/light/terminal-view-no-pty.png` | **Covered** (empty state only) |
| Terminal, live PTY output | none — a plan for this exists (`electron-live-session.json#e2-terminal-view`) but was never run | **Code-only** |
| Diff viewer / Git file review | none anywhere (`find scratch -iname '*git-review*.png' -o -iname '*diff*.png'` → empty) | **Code-only** |
| Buddy floater windows (mascot/chat/bar content) | none — the capture tool structurally excludes any window whose URL matches `buddy` (`shot.mjs` line ~144); only the Settings → Buddy Floater **toggle row** is captured, which is a different screen | **Code-only** |
| Guided tour / coach marks | none found | **Code-only** — the tour's overall behavior (eyebrow, buttons, when it fires) was designed in an earlier, archived spec (`docs/archive/specs/2026-09-10-first-run-guide-design.md`), just never revisited against the later heading-ladder or popup-close decisions — not cross-linked from decisions.md |
| Game boards + arcade panel | `shots-games-arcade/light/arcade-picker.png`, `shots-games-death/light/flappy-dead.png`, plus the board/piece-style exploration sets (`shots-games-board-*`, `shots-games-chess-*`) | **Covered** — thoroughly, across the "settled" decks and the shipped picker/game-over screens |
| Drag-and-drop zone | none | **Code-only** |
| Share sheets | none | **Code-only** |
| Thumbnails / conversation previews | `shots-resume-preview/light/{resume-preview-selected,resume-preview-stress}.png`, `shots-conversation-previews/midnight/{drawer-preview-panel,projects-conversation-preview,projects-conversations-list,resume-preview-selected}.png` (meadow-mist has the same set) | **Covered** |

Seven of the eleven rows above are entirely code-only: CSV/XLSX/DOCX/HTML/code viewers,
live-PTY terminal, diff/Git review, buddy floater window content, guided tour, drag-and-drop
zones, and share sheets. Every "breaks a decided rule" finding for those rows is evidenced
from source, not a picture — called out inline above wherever that's the case. The other four
rows (composer, image/PDF/SVG viewer, games, thumbnails/conversation previews) were confirmed
on screen.

