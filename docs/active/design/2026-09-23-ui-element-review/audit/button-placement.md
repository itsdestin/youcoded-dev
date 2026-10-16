# Button placement audit — every action area

Read-only audit. Source: `youcoded/desktop/src/renderer` (excl. `dev/`). Scope: order,
alignment, stacking, spacing and single-button width of every clickable action area —
dialog footers, confirmation prompts, card/row actions, empty states, banners, forms,
first-run screens, settings rows, chat permission cards, marketplace detail, project hero,
sync wizard, sign-in, Pages dialogs, games. Screenshots opened for visual confirmation are
cited; everything else is cited by file:line from source. This file does not decide
anything — it is evidence for the questions deck that follows.

Yardstick used throughout (Destin's stated preference, not yet a rule): *paired buttons —
dark/filled on the right, light/outlined directly to its left. A single button is often
full width. Sometimes two buttons stack, sometimes they sit side by side.*

---

## Every action area

### A. Real dialog/popup footers (the `<Dialog>` shell or a hand-rolled `Scrim`+`OverlayPanel`)

| Surface | Order left→right (variant) | Align / gap | Side-by-side / stacked | Single-btn width | Cancel? | Destructive |
|---|---|---|---|---|---|---|
| `ConnectGithubModal.tsx:258-265` (install-gh step) | Check again:secondary → Install GitHub CLI:primary | `justify-end gap-2 pt-1` | side-by-side | — | no (✕ only) | — |
| `SessionRenameDialog.tsx:75-77` | Cancel:ghost → Save name:primary | `justify-end gap-2` | side-by-side | — | yes, ghost | — |
| `FirstTimeWarning.tsx:90-94` | Cancel:secondary → Continue:primary | `justify-end gap-2` | side-by-side | — | yes, secondary | — |
| `git/DiscardConfirmDialog.tsx:50-54` | Cancel:secondary → Revert/Move to Trash:**danger** | `justify-end gap-2` | side-by-side | — | yes, secondary | **rightmost** |
| `artifact-views/UnsavedChangesDialog.tsx:53-58` | Cancel:(no variant→primary) → Discard:(no variant→primary) → Save:(no variant→primary) | `justify-end gap-2` | side-by-side | — | yes, but same fill as everything else | none styled destructive |
| `project-view/ImportFileDialog.tsx:134-144` | Cancel:secondary → Move:secondary → Copy:primary | `justify-end gap-2` | side-by-side | — | yes, secondary | — |
| `ModelProvidersPopup.tsx:747-760` | Cancel:secondary(`flex-1`) → Connect:primary(`flex-1`) | plain `flex gap-2 pt-1`, **equal-width split** | side-by-side | n/a | yes | — |
| `ModelPickerPopup.tsx:511-520` | Cancel:secondary → confirm:primary | `justify-end gap-2 pt-1` | side-by-side | — | yes | — |
| `ContextPopup.tsx:210-234` (compact-with-instructions) | Back:secondary(`flex-1`) → Compact:primary(`flex-1`) | plain `flex gap-2`, equal-width split | side-by-side | n/a | Back, not "Cancel" | — |
| `marketplace/FeedbackSection.tsx:293-299` (comment box) | Post:secondary | `justify-end gap-2` | n/a (1 button) | hugs label | n/a | — |
| `marketplace/ReportReviewButton.tsx:215-226` | Cancel-ish → submit | `justify-end gap-2` | side-by-side | — | yes | — |
| `pages/page-connections.tsx:379-391` (manage-connections) | Never mind:secondary → Remove:**danger** | `justify-end gap-2` | side-by-side | single-button case hugs+right-aligned | yes | rightmost |
| `PermissionsSection.tsx` per-rule confirm (~835-849) | Cancel:secondary(`flex-1`) → Revoke:**danger**(`flex-1`) | equal-width split | side-by-side | n/a | yes | rightmost |
| `PermissionsSection.tsx` folder bulk-revoke (~651-708) | Cancel:secondary(`flex-1`) → Revoke all:**danger**(`flex-1`) | equal-width split | side-by-side | n/a | yes | rightmost |
| `SkillEditor.tsx:133-149` | (3 buttons — Cancel/secondary-ish, Save states) | — | side-by-side | — | yes | — |

**Pattern:** every genuine popup/dialog footer checked puts the filled/primary button
**rightmost**, secondary/ghost to its **left**, no exceptions found. Some use `justify-end`
+ hugging width, some use `flex-1` equal-width split — both keep primary on the right.
`UnsavedChangesDialog` is the one dialog where all three buttons render with **no
`variant` prop at all**, so Cancel/Discard/Save are three identical filled buttons — the
right-most-is-primary geometry still holds by accident, but there is no danger styling on
Discard and no visual hierarchy at all (see Inconsistencies #1).

### B. Single-button dialogs / prompts (own row in G-28's vocabulary: full width or right)

| Surface | Button | Width behavior | Context |
|---|---|---|---|
| `CloseSessionPrompt.tsx:347-367` | Close session:primary | **hugs**, right-aligned via `justify-between` (Toggle label occupies the left) | ✕ replaces Cancel (comment: "Cancel" redundant once ✕ exists) |
| `DonateConfirm.tsx:50-55` | primary | `w-full py-2.5` | — |
| `project-view/ProjectsEmptyCard.tsx:62-64` | Add a project:primary | `w-full` | empty state |
| `pages/PagesEmptyCard.tsx:29-31` | Make a page:primary | `w-full` | empty state |
| Tags & note popup, "Done" (screenshot `shots-site-gallery/light/tags.png`) | primary | full width of panel | — |
| `SyncSetupWizard.tsx:568-584` ("Start Backup") | primary/lg | `w-full` | — |
| `SyncSetupWizard.tsx:758-763` ("Install Now", rclone) | primary/lg | **hugs label, no width class** | same wizard, different step |
| `SyncSetupWizard.tsx:904-909` ("Install Now", gh) | primary/lg | hugs | same wizard |
| `SyncSetupWizard.tsx:1060-1062` (sign-in CTA) | primary/lg | hugs | same wizard |
| Resume-preview card in chat, "Resume Session" (screenshot `shots-chatsearch-gate-narrow/light/preview-narrow.png`) | primary | full width of card | chat, not a dialog |
| `ArcadeShell.tsx:265-277` ("Play") | primary/md | `w-full` | games panel |

**Same wizard (`SyncSetupWizard.tsx`), same button role ("the one action to proceed"),
three different width behaviors** — full width on the first step, hugging on the next
three. See Inconsistencies #2.

### C. Chat cards — permission/approval, questions, resume rows (HIGH TRAFFIC)

| Card | Order left→right | Align | Notes |
|---|---|---|---|
| `ToolCard.tsx` generic permission row, L863-898 | **Yes**:filled-green → **Always Allow**:filled-blue (conditional) → **No**:filled-red | left-aligned, `flex items-center gap-2`, no `justify-end` | Not `<Button>` at all — deliberate status-color carve-out, spec §11 change 61. All three buttons are filled; "primary vs secondary" doesn't apply. Order is fixed reading-order (yes → maybe → no), not filled-right. |
| `ToolCard.tsx` deny-listed "Always allow?" confirm, L790-803 | "Nevermind, allow once":filled-green → "Always allow":filled-red | left-aligned, `gap-2` | The rightmost button here is the **confirm/proceed** action, red for muscle-memory continuity, not because it's "No". |
| `ToolCard.tsx` full-auto safety stop, L826-856 | **Run it**:filled-green → **Skip it**:filled-red → divider → **Always Allow**:filled-red/orange | left-aligned | Deny explicitly placed **in the middle**, not last — code comment: "owner-approved... even though every other row ends on red." |
| `ToolCard.tsx` `PlanApprovalButtons`, L957-969 | 4 Ink-menu-mirrored buttons, `rounded-sm` (not the app's `rounded-lg`) | `flex-wrap`, left-aligned | Radius inconsistency vs. every other permission row. |
| `ToolCard.tsx` `AskUserQuestionCard`, L1295-1306 | **Submit**:primary(filled) → **Dismiss**:ghost | left-aligned, `flex items-center gap-2 pt-1`, **no `justify-end`** | Uses the real `<Button>` (comment cites spec §11.8 B). Filled button sits LEFT of the light one — the one clear, well-documented instance that inverts Destin's stated pairing rule. Comment explains "position plus label already carry 'this is the negative option'" — i.e. this was a deliberate choice, not an oversight. |
| `game/GameLobby.tsx` friend-request row, L471-479 | **Accept**:primary(filled) → **Decline**:secondary | inline in row, `gap-2` | Code comment: "Change 47, DECIDED 2026-07-16 as option A: Accept is the primary action... NOT semantic green" — i.e. filled-first-in-reading-order was an explicit, dated design decision for row-level actions, made 2 months before Destin's current ask. |
| `game/RunOverCard.tsx:60-65` (solo game-over) | **Play again**:primary(filled) → **Back to games**:secondary | centered, `gap-2 pt-2`, side-by-side | Same inversion as above — filled first/left. |
| `game/GameOverlay.tsx:69-93` (versus game-over) | **Rematch**:primary(filled) → **Back to Lobby**:secondary | **stacked** (`flex-col`), fixed `w-40` column, both `w-full` | Primary on **top**, not left — a different axis (vertical), same "primary comes first" rule. Same semantic pair as RunOverCard, rendered stacked here vs. side-by-side there — a direct layout inconsistency between the app's two "end of game" cards (see Inconsistencies #4). |
| Resume-list rows, "Preview" / "Resume" (screenshots `shots-main/light/home.png`, `shots-games-arcade/light/arcade-picker.png`) | Preview:secondary → **Resume**:primary(filled) | inline row, right side | This one chat-adjacent list-row pattern **does** put filled on the right — matches Destin's rule. |

**Reading:** every card whose two actions are "proceed / go back" or "do the good thing /
do the lesser thing" puts the filled button **first** (left, or top when stacked) — this
looks like a deliberate, dated house style for **card-level, inline, reading-order**
actions (spec change 47, 2026-07-16), separate from the **popup-footer** style in section A
which puts filled **last** (right). The one exception in the OTHER direction is the
Preview/Resume row, which already matches Destin's new preference.

### D. Empty states, banners, strips

| Surface | Button(s) | Width / align | Notes |
|---|---|---|---|
| `ui/states.tsx` `EmptyState` (L62-84) | 1 optional action:**secondary**, sm | block: `flex-col items-center`, **hugs label**, centered · inline: `flex items-center gap-3`, hugs, beside the message | The app's one shared empty-state primitive does **not** default to full width, and its one action is **secondary**, not primary — both diverge from G-28/the stated rule. Confirmed consistent across call sites: `FilesTab.tsx:1017`, `MarketplaceScreen.tsx:620`, `ResumeBrowser.tsx:1674`. |
| `ui/states.tsx` `ErrorState` general mode (L143-199) | up to 3: Report bug → Diagnose → Retry, ordered so whichever is supplied acts as `primary` and sits at the **rightmost** position of that fixed order | `justify-end gap-2` | **This is the one primitive that already codifies Destin's exact rule**, dated: comment cites "G-28, Destin 2026-09-10: 'buttons should either be full modal width or on the righthand side'". Pinned by `tests/error-state.test.tsx`. |
| `ui/states.tsx` `ErrorState` row mode (L202-215) | 1 action, filled primary, message pushes it right via `flex-1` | inline, right end of row | — |
| `AttentionBanner.tsx:167-236` | varies: stalled → Retry:primary(`ml-auto`) → Stop:secondary; plan-limit → Upgrade:secondary(`ml-auto`) → Switch:primary | first item carries `ml-auto`, pushing the pair to the band's right edge | Primary consistently ends up rightmost of its pair — matches the rule, though via `ml-auto` rather than `justify-end` on the container. |
| `LocalModelDownloadStrip.tsx:55-66` | 0-1, "Resume download":secondary, only in "stopped" state | hugs label | — |
| `QueuedMessagesStrip.tsx:65-101` | Edit:ghost-icon → Cancel:ghost-icon | row-end, `gap-0.5` | Cancel (a discard) has no danger styling — plain ghost, same as Edit. |
| `SessionContextBanner.tsx:65-92` | whole row is one `<button>` (`w-full`); "Details" is a fake nested span | n/a | can't nest a real button inside a button |
| `ContextIntroBanner.tsx:45-79` | 1 icon CloseButton, absolute corner | n/a | dismiss-forever, not an action row |

### E. Settings rows

| Surface | Pattern |
|---|---|
| `ui/SettingRow.tsx:150-268` | Universal primitive: text column `flex-1`, `control` slot renders after it (right side) — layout never varies per caller. |
| `PermissionsSection.tsx` revoke row + confirm | Trigger: Revoke:danger-outline, sm, inline in row (right side, via the row's own flex). Confirm: Cancel:secondary(`flex-1`) → Revoke:danger(`flex-1`), equal width. |

### F. Marketplace detail, project hero, sync wizard, sign-in, Pages, games — headline surfaces

| Surface | Order | Align / stack | Single-btn width | Notes |
|---|---|---|---|---|
| `marketplace/MarketplaceDetailOverlay.tsx:292-379` (skill/plugin body) | Favorite:icon → Share:icon → [Update] → **Uninstall:secondary:lg** / **Install:primary:lg** | header `flex-col` → `sm:flex-row sm:justify-between`, action cluster `flex-wrap gap-2` | — | Uninstall is `secondary`, not `danger`, despite removing something. Filled Install/primary sits **rightmost** of the cluster — matches the rule at the cluster level. |
| `marketplace/MarketplaceDetailOverlay.tsx:579-649` (theme body) | same shape, but **Uninstall is `ghost`** here, not `secondary` | same responsive stack | — | Same job ("Uninstall a plugin"), two different visual weights depending on which of the file's two nearly-identical panels renders it. |
| `project-view/ProjectHero.tsx:502-596` (bottom row) | management cluster (Rename:secondary, Remove:danger-outline) **left** ‖ **New Conversation:primary:lg right** (`sm:ml-auto`) | `flex-col sm:flex-row sm:justify-between`, stacks under 640px | primary is `w-full` when stacked (narrow), hugs + right-pinned at ≥640px | **The clearest example of Destin's exact rule already shipped**, and it's explicitly commented: "management actions left, the primary action right." |
| `project-view/ProjectHero.tsx:454-466` (stop-syncing armed confirm) | **Stop syncing:danger-outline** → Cancel:secondary | `flex-wrap gap-2`, `mt-3` | — | Danger-outline is **first/left**, Cancel **second/right** — opposite of `PermissionsSection`'s Cancel-then-danger order (see Inconsistencies #3). |
| `game/GameLobby.tsx:170-196` ("Block this friend?" confirm, a popover inside the friends list, not a `<Dialog>`) | **Block:danger** → Cancel:secondary, both `flex-1` | plain `flex gap-2`, no `justify-end` | — | Same danger-first/Cancel-second order as `ProjectHero`'s stop-syncing confirm — a **third** instance of this reversed order, all three outside a real `<Dialog>` shell (see Inconsistencies #3). |
| `remote-gate.tsx:104-131` (password sign-in form) | **single**: Connect:primary — no explicit `w-full`, but stretches full width of the `w-72` column because the parent `flex flex-col` has no `items-center`, so the flex default (`align-items: stretch`) fills it anyway | full width (via flex-stretch, not a `w-full` class) | below the password field, not beside it (comment: "stacked submit form, not a field with an inline action") | a fourth sign-in surface, distinct from `FirstRunView`'s picker — none of this file's screens were covered elsewhere in this audit |
| `remote-gate.tsx:135-160` (saved-key reconnect screen) | Try now:primary **top** → Enter password instead:ghost **bottom** | stacked, `flex-col gap-3` | full width via the same flex-stretch as above | is "Enter password instead" | matches the app-wide "stacked = primary on top" pattern (implicit rule 2) with a third corroborating instance beyond GameOverlay/page-connections |
| `project-view/ProjectHero.tsx:638-690` (sync popover) | action:secondary(`w-full`) → hairline → Stop syncing:danger-outline(`w-full`) | stacked, **both full width** | — | Different width convention from the hero row two inches away, which hugs its buttons. |
| `SyncSetupWizard.tsx` (throughout) | single primary/lg per step | see section B | inconsistent, see above | — |
| `FirstRunView.tsx:173-204` | 5 sign-in choices, all **secondary:xl** (pill), stacked, `gap-3`, all `w-full` | stacked always | full width | No primary/secondary hierarchy among the 5 — all equal weight, deliberately (it's a menu of equally-valid paths in, not a confirm). |
| `first-run/ApiKeySetup.tsx:58-65`, `LocalAppConnect.tsx:114-126`, `LocalModelSetup.tsx:101-111` | 2-3 buttons, **all `secondary`** hand-copied "pill" class, stacked, `gap-3`, all `w-full` | stacked | full width | The actual primary action ("Verify & Continue" / "Connect" / etc.) has **no visual emphasis** over "Back" — everything in first-run's sub-screens is flat secondary. |
| `pages/PagesView.tsx` header, L61-84 | title → spacer → Make a page:primary:sm → Esc·Back:ghost:sm (`hidden sm:inline-flex`) ‖ CloseButton (`sm:hidden`) | right side via a spacer div | n/a | Filled Make-a-page sits left of the close affordance, which is fine (close isn't a paired action) — cluster's one real action is filled, alone. |
| `pages/page-connections.tsx` approval steps | Continue/Allow:primary(`w-full`) then Back/Not now:secondary(`w-full`) | **stacked**, both full width | full width | Primary **on top**. |
| `game/ArcadeShell.tsx:265-277`, header L346-376 | Play:primary(`w-full`) · header Back-chevron ← title → Close-X, both hand-rolled icon buttons, not `<Button>` | — | — | Header icons are the one place in this whole audit using neither `<Button>` nor a documented exception. |

---

## Inconsistencies

1. **`UnsavedChangesDialog` renders Cancel, Discard and Save as three identically-styled
   filled buttons** (`artifact-views/UnsavedChangesDialog.tsx:53-58`) — no `variant` prop on
   any of the three, so all three are `primary` (filled accent). Destructive ("Discard") has
   no danger styling, unlike its sibling `DiscardConfirmDialog` two files over, which does
   use `variant="danger"`. A user cannot tell by looking which of the three buttons is safe.

2. **The same wizard uses two different single-button width rules on consecutive steps.**
   `SyncSetupWizard.tsx`'s "Start Backup" is `w-full` (L570-584); "Install Now" (rclone,
   L758), "Install Now" (gh, L904) and the sign-in CTA (L1060) all hug their label with no
   width class. Same component, same "the one action to proceed" role, three widths.

3. **Danger-vs-Cancel order is reversed between confirm patterns — and it's not a single
   outlier.** `PermissionsSection.tsx`'s revoke confirms put Cancel first, then the danger
   button (Cancel:secondary → Revoke:danger, both `flex-1`) — matching the dialog-footer
   convention. But `ProjectHero.tsx`'s stop-syncing confirm (L454-466) and
   `game/GameLobby.tsx`'s "Block this friend?" confirm (L170-196) both put the danger button
   FIRST, Cancel second (danger-outline/danger → Cancel:secondary) — two independent files
   agreeing with each other but disagreeing with `PermissionsSection`. Same job — "confirm or
   back out of something destructive" — two different left/right orders, each used more than
   once, in the same app.

4. **The app's two "end of game" cards stack differently for the identical action pair.**
   `game/RunOverCard.tsx` (solo games — Flappy, 2048) renders Play-again/Back-to-games
   **side by side**; `game/GameOverlay.tsx` (versus games — Connect 4, chess) renders the
   equivalent Rematch/Back-to-Lobby **stacked**, both `w-full`, in a fixed `w-40` column.
   Nothing about "solo vs versus" obviously requires different layouts — it reads as two
   different implementations of one idea rather than a deliberate choice (no comment marks
   the difference as intentional, unlike the other exceptions in this document).

5. **Uninstall is styled two different ways for the identical action in the same file.**
   `MarketplaceDetailOverlay.tsx` renders Uninstall as `secondary` for a skill/plugin (L339)
   but `ghost` for a theme (L634/644) — same overlay component, same button, different
   emphasis depending on which entry type is open.

6. **The `EmptyState` primitive's single action neither fills the container nor sits at the
   right edge — it's centered/hugging.** `ui/states.tsx:62-84`: block mode is
   `flex-col items-center`, which is a third width/alignment behavior distinct from both
   "full width" and "hugs at the right" — the two options G-28 documents as acceptable.
   Confirmed consistent across its call sites (`FilesTab.tsx`, `MarketplaceScreen.tsx`,
   `ResumeBrowser.tsx`), so it's not a one-off drift, it's the primitive's own default.

7. **Chat/card-level action pairs are consistently "filled first (left or top)", popup-footer
   pairs are consistently "filled last (right)."** This is the single biggest structural
   split in the app and is covered in detail in Implicit Rules below — flagging it here
   because from Destin's stated preference, every card-level instance (permission Yes/Always
   Allow/No, AskUserQuestionCard Submit/Dismiss, GameLobby Accept/Decline, RunOverCard
   Play-again/Back, GameOverlay Rematch/Back) reads as "wrong" even though most of them are
   dated, commented, deliberate decisions (spec change 47, 2026-07-16; spec §11.8 B) rather
   than oversights.

8. **`ArcadeShell.tsx`'s header (back-chevron / title / close-✕) is hand-rolled icon buttons**,
   not `<Button variant="ghost" size="icon">` — a plain implementation gap, not a documented
   exception (the earlier buttons-controls inventory flags the same file's close-✕ radius
   drift independently).

---

## Implicit rules today

The app is not inconsistent at random — reading the evidence above, there are (at least)
two competing but each-internally-consistent conventions already in place, plus one
explicit codified rule:

1. **Popup/dialog footers: filled button rightmost, lighter button(s) to its left,
   `justify-end` or an equal-width `flex-1` split.** Zero exceptions found among ~15 real
   dialog footers read directly (section A). This already matches Destin's stated
   preference exactly.

2. **Card-level / inline / reading-order actions: filled button first (left when
   side-by-side, top when stacked), lighter/negative action second.** This is explicit and
   dated in the source for at least two cases — permission-style rows (spec §11.8 B,
   AskUserQuestionCard) and list-row pairs (spec change 47, 2026-07-16, GameLobby
   Accept/Decline) — and appears consistently at RunOverCard and GameOverlay too, though
   without a comment there. The apparent logic: you read the row left-to-right (or top-down)
   and the first thing you meet is "the thing you'd normally do"; Dismiss/Decline/Back reads
   as the secondary path you reach only if you don't take the first one.

3. **`ErrorState`'s general mode is the one primitive that already implements Destin's rule
   as an explicit, dated, tested design decision** (G-28, 2026-09-10, pinned by
   `tests/error-state.test.tsx`) — filled always rightmost of a fixed action order,
   never bottom-left.

4. **A single button is full width when it's the one thing to do on an otherwise-bare
   screen or card** (empty states' CTA, SyncSetupWizard's main step action, Tags & note's
   Done, first-run's pill CTAs) — **and hugs its label, right-aligned, when it shares a row
   with other content** (CloseSessionPrompt's "Close session" beside a toggle, a single-item
   confirm dialog). Which one applies seems to track "is this button alone on its own row" —
   not fully consistent (SyncSetupWizard's own steps disagree, finding #2).

5. **Destructive actions get their own variant (`danger`/`danger-outline`) in dialog
   footers, but not uniformly in cards** — QueuedMessagesStrip's Cancel and
   UnsavedChangesDialog's Discard are both discard/destroy actions styled with no danger
   emphasis at all.

6. **Phone width (≤640px):** the only two responsive STACKING patterns found both use the
   `flex-col … sm:flex-row` breakpoint (640px, matching the app's documented
   `useNarrowViewport()` threshold): `ProjectHero.tsx`'s bottom row and the empty-card family
   (`ProjectsEmptyCard.tsx`, `PagesEmptyCard.tsx`, `HowContextWorksPopup.tsx`). Screenshots
   confirm both collapse cleanly to a vertical stack with the icon above the text
   (`shots-pages-empty-phone/light/landing.png`) and the single CTA staying full width
   throughout. **No two-button dialog FOOTER in this audit carries a narrow-width stacking
   class** — `UnsavedChangesDialog` (3 buttons), `DiscardConfirmDialog`, `ConnectGithubModal`,
   `ImportFileDialog` etc. all use a flat `flex gap-2 justify-end` with no `sm:`/`max-sm:`
   variant, inside a `max-w-sm` (340-420px) panel that itself shrinks to `88vw` on a narrow
   window. This was not confirmed visually at ≤390px for a *specific* multi-button dialog
   (none of the audited screenshot sets happened to catch one open at phone width) — flagged
   as inferred-from-source, not screenshot-confirmed, and worth a targeted capture before
   treating it as settled.

---

## Candidate rules

Proposals only — not decided. Each cites the evidence above.

1. **Order (popups/dialogs):** keep the pattern that's already universal — filled/primary
   rightmost, secondary/ghost to its left. Zero source changes needed for section A; this
   would formalize what's already there.

2. **Order (chat/card-level pairs):** this is the real decision point. Two honest options:
   - **(a) Keep filled-first for cards**, on the reasoning already in the source comments
     (reading order = "the normal thing to do first"), and treat Destin's rule as
     popup-footer-specific. Pro: zero rework, respects two dated, considered past decisions
     (spec change 47; §11.8 B). Con: a user who learns "filled = right" from every dialog in
     the app gets the opposite muscle memory the moment Claude asks a real question or a
     permission request appears — arguably the highest-stakes buttons in the whole app.
   - **(b) Flip cards to match dialogs** (filled/primary rightmost everywhere, including
     AskUserQuestionCard, GameLobby Accept/Decline, RunOverCard, GameOverlay). Pro: one rule,
     no "which surface am I on" ambiguity, matches the newest, most explicit product
     direction. Con: touches 2+ deliberately-designed, dated surfaces and the app's
     highest-frequency control (the Yes/Always Allow/No permission row) — reordering the
     permission row also changes keyboard-arrow traversal order and muscle memory Destin
     himself called out as load-bearing ("Always Allow stays one arrow press away" —
     `ToolCard.tsx:596-599`).
   - The permission triad (Yes/Always Allow/No) is a special case either way: it's 3 filled
     status-colored buttons, not a primary/secondary pair, so "filled goes right" doesn't
     map onto it cleanly — a separate decision either keeps it as-is or reorders it to
     end on the affirmative action instead of the negative one.

3. **Single-button width:** formalize the rule already implicit almost everywhere: full
   width when the button is alone on its own row/card; hugs + right-aligned when it shares
   a row with other content (a toggle, a label, stat text). Fix `SyncSetupWizard`'s 3 stray
   hugging steps to match its own 4th step. Fix/decide `EmptyState`'s centered-hug default
   (make it full width, or explicitly document "empty-state CTAs are the one centered
   exception").

4. **Stack vs. side-by-side:** the one clear signal found is **width, not count or label
   length** — `sm:flex-row` triggers at 640px regardless of label. Two things do NOT
   currently decide it despite arguably deserving to: total label length (first-run's
   pill buttons stack even though they'd easily fit two-across on desktop, by choice) and
   button count (3-button dialogs like `UnsavedChangesDialog` and `ImportFileDialog` stay
   side-by-side with no stacking fallback at all, unverified whether that overflows at
   phone width). Recommend deciding explicitly: dialogs stack under 640px when they hold ≥2
   buttons AND the panel is `prompt`/`panel` size (≤420px), consistent with what
   `ProjectHero`/empty-cards already do.

5. **Gap:** `gap-2` (8px) is the overwhelming default between sibling buttons in a row,
   everywhere audited except first-run's `gap-3` (12px, for its full-width stacked pills,
   where a slightly larger gap reads better between two full-bleed bars). No conflicting
   gap value found — this one is already consistent and needs no rule change, just
   documenting.

6. **Footer/content spacing:** `pt-1` to `pt-2` above a button row that sits directly under
   text in the same card (ToolCard, RunOverCard); a full `mt-3`/`mt-4` when the button row
   is visually a new section (ProjectHero, ImportFileDialog, AddProjectModal). No
   inconsistency found in this dimension.

7. **Destructive placement:** formalize "danger sits in the confirm pair, styled
   `danger`/`danger-outline`, never plain filled/secondary" — fixes `UnsavedChangesDialog`
   (Discard should be `danger` or `danger-outline`) and `QueuedMessagesStrip`'s Cancel.
   Separately decide left-vs-right for the danger button itself: `PermissionsSection`
   (Cancel-then-danger, danger right) disagrees with `ProjectHero`'s stop-syncing confirm AND
   `GameLobby`'s Block/Cancel confirm (both danger-then-Cancel, danger left) today
   (Inconsistency #3, now a 1-vs-2 split rather than a single outlier) — whichever way the
   dialog-footer rule above lands, apply it here too so a destructive confirm isn't a third
   convention.

8. **Card-level vs. popup-level actions — this audit's central finding:** the app already
   draws this line for its OWN reasons (dated design decisions, keyboard-order stability,
   "position + label carry the meaning" for Dismiss). Recommend treating this as two rules,
   not one, unless Destin wants the higher-risk unification in 2(b):
   - *Popup footers* (a true modal with a scrim, `<Dialog>` or hand-rolled `Scrim`+`OverlayPanel`):
     filled rightmost.
   - *Inline cards* (renders inside the chat/timeline, a list row, an in-place confirm strip
     that doesn't blur/scrim the rest of the screen): filled first in reading order.
   This matches what's shipped today almost everywhere except the two admitted exceptions
   (RunOverCard/GameOverlay disagreeing with each other, and the Preview/Resume row already
   doing it the "popup" way inside a card context) — both of which are inconsistencies to
   fix regardless of which top-level rule Destin picks.

9. **Phone width:** no dialog-footer regression found, but also no protection — recommend a
   targeted screenshot pass at ≤390px for `UnsavedChangesDialog` (3 buttons in a `max-w-sm`
   panel) and `ImportFileDialog` (3 buttons) specifically, since neither has a stacking
   fallback and neither was caught open in any existing screenshot set.

---

## Coverage

**Read directly (this session):** `components/ui/Button.tsx`, `components/ui/Dialog.tsx`,
`components/ui/states.tsx` (full files); `components/ToolCard.tsx` lines 590-1015 and
1490-1560 (all four permission-card variants + AskUserQuestionCard + PlanApprovalButtons);
`components/game/RunOverCard.tsx`, `components/game/GameLobby.tsx` (partial, 440-570);
`components/project-view/ProjectHero.tsx` lines 440-600; `components/project-view/
ProjectsEmptyCard.tsx`, `components/pages/PagesEmptyCard.tsx` (full files);
`components/ConnectGithubModal.tsx`, `components/MovedGate.tsx`, `remote-gate.tsx`,
`components/CloseSessionPrompt.tsx` (footer region), `components/SyncSetupWizard.tsx`
(spot-checked ~540-780), `components/marketplace/MarketplaceDetailOverlay.tsx` (spot-checked
~280-380), `components/artifact-views/UnsavedChangesDialog.tsx`, `components/git/
DiscardConfirmDialog.tsx` (full files); plus grep-then-read passes across ~25 more dialog/
popup/form files (`SessionRenameDialog`, `FirstTimeWarning`, `ImportFileDialog`,
`AddProjectModal`, `ModelProvidersPopup`, `ModelPickerPopup`, `ContextPopup`,
`PermissionsSection`, `TagManagerPopup`, `ShareSheet`, `SkillEditor`, `CopyPicker`,
`FeedbackSection`, `ReportReviewButton`, `SignInPromptModal`, `PreferencesPopup`,
`DonateConfirm`, `ErrorBoundary`/`ViewerErrorBoundary`, `ProjectDetailOverlay`,
`FirstRunView`, first-run/*).

**Delegated to a background research agent (same scope, no source overlap claimed
independently verified):** permission/approval chat cards cross-check, empty states,
banners/strips, settings rows, marketplace/project-hero/sync-wizard/sign-in spot checks,
Pages dialogs, games (`GameOverlay`, `ArcadeShell` header, `GameLobby` full). Its findings
are folded into the tables and Inconsistencies above (items 4, 5, 8 and most of section C
and D came from that pass, cross-referenced against this session's own reads of `ToolCard.tsx`
and `RunOverCard.tsx` for the overlapping cases — both passes agree).

**Added and independently re-verified in a final integration pass** (two more parallel
research passes plus direct source reads, reconciled against the draft above): the
`game/GameLobby.tsx:170-196` "Block this friend?" popover (read directly, screenshot not
available — confirmed via source only) strengthens Inconsistency #3 from a single outlier to
a two-file agreement against `PermissionsSection`'s order; `remote-gate.tsx` (YouCoded
Remote's password and saved-key sign-in screens) was read in full and added to section F as a
fourth, previously-uncovered sign-in surface distinct from `FirstRunView`'s picker — its
single-button-fills-via-flex-stretch behavior (no explicit `w-full` class, but the same visual
result) is a width mechanism not seen elsewhere in this audit and worth naming separately from
literal `w-full` usage when this becomes a formal rule.

**Screenshots opened to confirm visual order/placement (not just source):**
`scratch/element-sweep/shots-error-batch1/light/approval-card-unconfirmed.png` (permission
triad), `.../question-card-unconfirmed.png` (Submit/Dismiss), `shots-pages-empty-phone/light/
landing.png` (phone-width empty-state stack), `shots-narrow/light/settings.png` (narrow
settings list, no button row), `shots-main/light/marketplace.png`, `shots-games-arcade/light/
arcade-picker.png` (Preview/Resume rows), `shots-site-gallery/light/tags.png` (Tags & note
Done, full width), `shots-main/light/settings-drawer.png`, `shots-games-death/light/
flappy-dead.png` (Play again / Back to games), `shots-chatsearch-gate-narrow/light/
preview-narrow.png` (Resume Session, full width, narrow).

**Not verified / would need a targeted capture:**
- No screenshot of a genuine multi-button DIALOG footer (not a chat card, not a hero row) at
  ≤640px was found in the existing screenshot sets — the phone-width stacking claim for
  dialogs (Implicit Rules #6, Candidate Rule #9) is inferred from source (absence of a
  responsive class), not confirmed on screen.
- Cross-theme drift (whether these layouts hold in Midnight/Halftone/etc.) was not checked —
  this audit is layout/order only, not color/contrast.
- Android-specific rendering was not checked; the component source is shared but no Android
  screenshots exist in the sets browsed.
- Not every cell in the "Every action area" tables was opened as a live screenshot — most
  are sourced from reading the JSX and its `className` directly, which is a reliable but not
  identical substitute for seeing the rendered pixels (Tailwind class conflicts, like the
  ones `Button.tsx`'s own `mergeClasses` exists to prevent, could in principle still cause a
  className to not paint as read — none were observed, but the possibility isn't excluded by
  a source-only read).
- This audit does not re-litigate the separate close-button-shape / button-shape reviews
  already in `docs/active/design/2026-09-23-ui-element-review/{buttons,button-shapes}.review.json`
  and their answers — those cover icon/radius/pill-shape questions Destin already answered
  today (2026-09-24), not order/placement.
