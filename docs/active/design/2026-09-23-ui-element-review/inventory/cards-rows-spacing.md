# Cards, List Rows, Spacing & Dividers — YouCoded Renderer Inventory

Scope: `youcoded/desktop/src/renderer` (React + Tailwind v4), `src/renderer/dev/` excluded.
Researcher: Cards / Spacing / List rows / Dividers-separators. Five other researchers cover
buttons, inputs, typography, color/theming, and overlays/modals separately — this file does
not repeat those.

## Shared primitives (read this first — everything else is a variant or a departure)

| Primitive | Definition | Recipe | Used for |
|---|---|---|---|
| `.layer-surface` | `styles/globals.css:1291-1301` | `bg-panel` + `border: 1px solid var(--edge)` + `border-radius: var(--radius-xl)` (16px) + `box-shadow: 0 8px 32px rgba(0,0,0,var(--shadow-strength))` + `overflow:hidden` | The app's one "floating surface" — popovers, dropdowns, toasts, tooltips, AND (inconsistently — see Inconsistencies) some grid cards |
| `.card-interactive` | `globals.css:1458-1488` | Adds `hover`/`:active` background feedback (`stepped-hover`, `:active → bg-edge`), meant to pair with `.layer-surface` or a hand-rolled bordered box | Any clickable tile |
| `SettingRow` (K2) | `components/ui/SettingRow.tsx` | `SETTING_ROW_BASE = 'w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-inset/50 text-left transition-colors stepped-hover'` | The universal settings/drawer row — a self-contained rounded box, not a divided list line |
| `Callout` (K4) | `components/ui/Callout.tsx` | `rounded-lg p-3 border`, 3 tones (info=`bg-accent/10 border-accent/25`, warning=`bg-amber-500/10 border-amber-500/25`, danger=`bg-destructive/10 border-destructive/50`); **no action slot by design** | Passive explanatory boxes |
| `StatusStrip` (K5) | `components/ui/StatusStrip.tsx` | `px-3 py-2.5 rounded-lg bg-inset` + status dot/spinner + optional action button | "What's happening now" boxes that DO carry a button (the deliberate counterpart to Callout) |
| Radius tokens | `globals.css:38-45` | `--radius-sm`=4px, `--radius-md`=8px, `--radius-lg`=12px, `--radius-xl`=16px, `--radius-2xl`=24px | In practice, cards use `rounded-sm`/`rounded`/`rounded-md`/`rounded-lg`/`rounded-xl`/`rounded-2xl` almost interchangeably — see Inconsistencies |

---

## CARDS

### 1. Marketplace grid card (full `.layer-surface`, unmodified)
- Looks like: a soft, floating tile with a visible drop shadow and a gentle lift-on-hover — the "premium" card treatment.
- Exact styling: `.layer-surface` unmodified (bg-panel, border-edge, **16px radius**, `0 8px 32px` shadow) + `hover-lift` + inner `p-3 sm:p-4 flex flex-col gap-1.5 sm:gap-2`. Grid wrapper `grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3` (`MarketplaceGrid.tsx:58`). Rail variant scopes the shadow down to `0 3px 10px` via `.mp-rail-scroll .layer-surface` (`globals.css:1315`) because the full 32px blur gets clipped by `overflow-x-auto`.
- Built with: `.layer-surface` primitive, unmodified radius/shadow.
- Used for: Marketplace grid tiles, Library "Installed"/"Favorites" grid, theme cards, integration cards.
- Count: `components/marketplace/MarketplaceCard.tsx:337` (grid variant), `:248` (compact list-row variant for narrow/rail) — grid used throughout `MarketplaceScreen.tsx`, `LibraryScreen.tsx` (via `MarketplaceGrid`), `MarketplaceRail.tsx`.
- Screenshot: confirmed — `scratch/ui-consistency-baseline/shots-main/light/library.png` (visible shadow + rounded corners on "Civic Report" featured card and the 4-col Installed grid).

### 2. Skill/command drawer tile (`.layer-surface`, radius and shadow both stripped)
- Looks like: a flat, borderless-feeling tile — same family as #1 by class name, but reads completely different: no shadow, tighter corners, no hover-lift.
- Exact styling: `layer-surface !rounded-lg card-interactive p-3 text-left flex flex-col` + inline `style={{ boxShadow: 'none' }}` — radius forced to 12px (not the class's own 16px) and the shadow explicitly killed. Grid: `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2` for "All", but `gap-1.5` for pinned/category subsections in the same file.
- Built with: `.layer-surface` + `.card-interactive`, both overridden.
- Used for: `/` skill-and-command drawer tiles (`CommandDrawer.tsx:147`), `SkillCard.tsx:148` (same recipe, used inside the drawer and elsewhere `SkillCard` is imported).
- Count: `components/CommandDrawer.tsx:147,299,315,339,352,415` (incl. dashed "add" tile), `components/SkillCard.tsx:148`.
- Screenshot: confirmed — `shots-main/light/skills-drawer.png` (flat 5-col grid, no visible shadow, contrast with library.png's shadowed cards).

### 3. Project-files thumbnail card (`.layer-surface`, radius stripped, shadow stripped)
- Looks like: a fixed-height (h-44) preview tile with an image/thumbnail filling most of the box and a footer strip.
- Exact styling: `layer-surface !rounded-lg relative flex flex-col h-44 overflow-hidden hover-lift` + inline `boxShadow: 'none'`; thumbnail area `flex-1 min-h-0 w-full border-b border-edge-dim`; a small pill badge `absolute top-2 right-2 ... bg-canvas/80 border border-edge rounded`.
- Built with: `.layer-surface`, overridden the same way as #2.
- Used for: Project View → Files tab, grid view.
- Count: `components/project-view/tabs/FilesTab.tsx:693,706,710`. Grid wrapper: `:1008` `grid grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3`.
- Screenshot: confirmed — `shots-project-files-any-size/light/files-root.png` (right-most media/log tiles).

### 4. Folder tile with "tab nub" (hand-rolled, matched to #3's background but not its class)
- Looks like: a manila-folder shape — a small rounded-top tab sitting above a bordered rounded body, both painted `bg-panel` so they read as one folder.
- Exact styling: nub `relative -mb-px ml-4 h-3 w-14 rounded-t-md bg-panel border border-edge`; body `flex-1 min-h-0 flex flex-col rounded-lg border border-edge bg-panel overflow-hidden`; footer `border-t border-edge-dim px-2.5 py-1.5 bg-panel`. Deliberately `bg-panel` (not `.layer-surface`) — comment explains it must visually match the sibling file card's panel color without adopting its shadow.
- Built with: fully hand-rolled Tailwind, no shared class.
- Used for: folders inside the Project Files grid.
- Count: `FilesTab.tsx:821,832,841,866`.
- Screenshot: confirmed — same `files-root.png`, the "desktop", "docs", "logs" folder tiles.

### 5. Pages grid card (hand-rolled, `bg-panel`, no shadow)
- Looks like: a plain bordered box, flatter than any `.layer-surface` variant — no shadow at all, 12px corners.
- Exact styling: `bg-panel border border-edge rounded-lg p-4 text-left flex flex-col gap-3 cursor-pointer card-interactive`. Grid: `grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`.
- Built with: hand-rolled + `.card-interactive` only (no `.layer-surface`).
- Used for: the Pages (mini-apps) browser grid.
- Count: `components/pages/PagesView.tsx:118,134`. Empty-state variant same recipe, bigger padding: `:183` `p-5 sm:p-6`.
- Screenshot: none found in the baseline set for the grid itself — `shots-pages-view/light/*` capture individual Page *content* (user-built pages), not the browsing grid. Would need a capture of the Pages list/grid screen itself.

### 6. Context file row (hand-rolled, `bg-panel`+`border-edge-dim`)
- Looks like: a full-width bordered row, slightly lighter border than #5's Pages card.
- Exact styling: `w-full text-left flex items-center gap-3 bg-panel border border-edge-dim rounded-lg p-3 shrink-0 hover:bg-inset hover:border-edge transition-colors`. List wrapper `flex flex-col gap-2` per group, groups stack with `mb-5`.
- Built with: hand-rolled, no `.card-interactive` (hover baked in manually instead).
- Used for: Project View → Instructions & Memories / Context tab file rows.
- Count: `components/project-view/tabs/ContextTab.tsx:141,146`.
- Screenshot: none found in baseline set for this specific tab; `shots-main/light/projects-context.png` exists — not yet opened, recommend confirming there.

### 7. Session/conversation card (hand-rolled, `bg-inset` — recessed, not panel)
- Looks like: a bordered card that reads slightly "sunken" relative to #5/#6 because it sits on `bg-inset` rather than `bg-panel`.
- Exact styling: shared constant `SESSION_CARD_SURFACE_BASE = 'rounded-lg border bg-inset transition-colors'`, `SESSION_CARD_SURFACE = SESSION_CARD_SURFACE_BASE + ' border-edge-dim hover:border-edge'` — hover only changes border color, not background.
- Built with: hand-rolled shared constant (`components/SessionCardDetails.tsx:34-35`), reused by name.
- Used for: Project View → Conversations tab rows (`ConversationsTab.tsx:49`, `px-3 pt-2 pb-3`) and Resume Session browser rows (`ResumeBrowser.tsx`).
- Count: `SessionCardDetails.tsx:34-35`, `ConversationsTab.tsx:49,106`, plus every `ResumeBrowser.tsx` session row.
- Screenshot: confirmed — `shots-main/light/resume-browser.png` (each session is its own bordered rounded box with visible gap between, not a divided list).

### 8. Empty-state card (hand-rolled `bg-panel border-edge rounded-lg`, bigger padding, centered content)
- Looks like: a large, centered "nothing here yet" panel with icon + text + action, no shadow.
- Exact styling: `w-full max-w-[34rem] bg-panel border border-edge rounded-lg p-5 sm:p-6 flex flex-col items-center text-center gap-4 sm:flex-row sm:items-start sm:text-left` — same recipe family as #5's empty state (Pages) but a dedicated component.
- Built with: hand-rolled, static (no `.card-interactive` — not clickable).
- Used for: Project View hero when a project has no conversations yet.
- Count: `components/project-view/ProjectsEmptyCard.tsx:32`.
- Screenshot: none confirmed in baseline set; would need a fresh-project capture.

### 9. Project hero banner (`.layer-surface`, unmodified — the one non-grid use of the full primitive)
- Looks like: the big card at the top of Project View — full shadow, full 16px radius, holds the project name/path/stats/actions.
- Exact styling: `layer-surface p-3 sm:p-5 flex flex-col gap-3 sm:gap-4`.
- Built with: `.layer-surface`, unmodified (matches #1's treatment, not #2/#3's stripped version).
- Used for: Project View header.
- Count: `components/project-view/ProjectHero.tsx:298`.
- Screenshot: confirmed — `shots-project-files-any-size/light/files-root.png` (top "youcoded" project card, and `shots-main/light/projects.png`).

### 10. Theme preview tile (no token background — paints the theme's own colors)
- Looks like: a small rectangle literally colored with the theme being previewed, bordered, no shadow.
- Exact styling: `group relative h-24 rounded-lg overflow-hidden border ${isActive ? 'border-accent' : 'border-edge-dim hover:border-edge'}` with `style={{ background: t.tokens.canvas }}` — deliberately NOT `.layer-surface`, since a panel-colored surface would hide the previewed theme.
- Built with: hand-rolled, necessarily (can't reuse a token-colored primitive here).
- Used for: Appearance / theme picker grid.
- Count: `components/ThemeScreen.tsx:206,220`. Grid: `:192` `grid grid-cols-2 gap-2`.
- Screenshot: confirmed — `shots-main/light/settings-appearance.png` referenced in plan set (not yet opened in this pass, but file exists).

### 11. Arcade game-picker tile (`bg-well` — a third background token)
- Looks like: a flat bordered tile on the darker `bg-well` surface (chosen because the games panel itself is `bg-inset`, so an `bg-inset` card would vanish).
- Exact styling: `group flex flex-col gap-2 rounded-lg bg-well border border-edge-dim p-3 hover:border-edge hover:bg-well/70`. Grid: `grid grid-cols-2 gap-2`.
- Built with: hand-rolled, no `.card-interactive`.
- Used for: Arcade game picker (Connect 4 / Chess / Flappy / 2048 chooser).
- Count: `components/game/ArcadePicker.tsx:80,99,115`.
- Screenshot: confirmed — `shots-main/light/games-picker.png` exists in the baseline set (name only checked, not opened).

### 12. Chat tool-call card (ToolCard — hand-rolled, no background of its own)
- Looks like: the expandable bash/edit/read box in the chat timeline; unlike every other card family, it has **no fill color** unless nested inside a collapsed group.
- Exact styling: root `${cardBorder} rounded-lg overflow-hidden ${inGroup ? 'bg-inset' : ''}`, `cardBorder = 'border border-edge'` (default) or `'border border-dashed border-edge-dim/60'` (the compact "skill annotation" variant). Header `px-3 py-1.5 hover:bg-inset/50`. Footer/body sections `border-t border-edge bg-inset/30 px-3 py-2`.
- Built with: hand-rolled, unique among all cards in having no default background.
- Used for: every tool call in the chat timeline (Bash, Read, Edit, permission prompts, etc.)
- Count: `components/ToolCard.tsx:1394-1396,1401-1403,1465,710,958`. (1600-line file; many internal sub-sections share this shell.)
- Screenshot: confirmed — `shots-main/light/tool-cards-all-expanded.png`.

### 13. Chat "assistant bubble" card family (asymmetric `rounded-2xl`, bubble geometry)
- Looks like: a rounded speech-bubble shape (one corner squared off toward the sender) rather than a rectangular card — Usage summary, skill-invocation confirmation, compacting spinner, and the attention/error banner all share this geometry but NOT the same padding.
- Exact styling:
  - `UsageCard.tsx:152-153` — `max-w-[85%] rounded-2xl rounded-bl-sm bg-inset border border-edge-dim px-5 py-4`
  - `SkillInvocationCard.tsx:48-49` — `max-w-[80%] bg-inset rounded-2xl rounded-br-sm px-4 py-2.5` (no border)
  - `CompactingCard.tsx:19-20` — `bg-inset border border-edge-dim rounded-2xl rounded-bl-sm px-4 py-3`
  - `AttentionBanner.tsx:117` — `bg-inset rounded-2xl rounded-bl-sm px-4 py-2.5` (no border; destructive state adds `ring-1 ring-[var(--destructive)]` instead)
- Built with: all four hand-rolled independently — no shared "chat bubble card" component exists.
- Used for: system/status messages that appear as chat bubbles (usage report, skill-invoked confirmation, compacting-in-progress, stuck/error state).
- Count: 4 sites as above.
- Screenshot: confirmed — Usage/Deliverables card visible in `tool-cards-all-expanded.png`/`shots-pages-view` chat panel; Compacting/Attention not separately confirmed — would need a capture mid-compaction or mid-stall.
- **Inconsistency**: 4 near-identical jobs, 4 different padding values (`px-5 py-4` / `px-4 py-2.5` / `px-4 py-3` / `px-4 py-2.5`) and 2 of the 4 have no border while 2 do.

### 14. `bg-well` bordered timeline card (git review, deliverables, chatsearch reference)
- Looks like: a bordered box that reads slightly darker/recessed compared to ToolCard's plain-border-no-fill.
- Exact styling: `rounded-lg border border-edge bg-well overflow-hidden`, header `px-3 py-1.5-2 hover:bg-inset[/50]`, body `px-3 pb-3` or `px-2 pb-2`.
- Built with: hand-rolled, shared "recipe" (same 4 classes) across 3 unrelated files.
- Used for: `components/git/GitReviewCard.tsx:25,29,35`; `components/DeliverablesCard.tsx:462,467` (outer strip; nested `SentFileTile`/`SentLinkTile` at `:203,223,289` add `hover:border-fg-muted`); `components/tool-views/ChatsearchRefBlock.tsx:32,33`.
- Screenshot: confirmed — Deliverables strip visible in `shots-main/light/skills-drawer.png`'s background chat (the "Deliverables · 4" row) and `tool-cards-all-expanded.png`.

### 15. `bg-inset/40` translucent card (specialist/subagent reports)
- Looks like: a softer, semi-transparent version of the ToolCard/bg-well family — reads as "quieter" than a fully opaque card.
- Exact styling: `border border-edge rounded-lg overflow-hidden bg-inset/40`, header `px-3 py-1.5 hover:bg-inset/50`, body `px-4 py-3 border-t border-edge-dim`. `SpecialistEnvelope.tsx` (consent boxes nested inside a Task card) use the same `rounded-lg border border-edge bg-inset/40 px-3 py-2` without the header/body split. `SubagentTimeline.tsx` nests three MORE variants inside a specialist card: dashed `border-dashed border-edge-dim/60` (collapsed reasoning), plain `bg-inset/40 border-edge-dim/60` (note/steer row), and full `border-edge bg-inset` (tool-call sub-group) — three different border weights for three sibling row kinds in one component.
- Built with: hand-rolled.
- Used for: subagent/specialist report cards in chat.
- Count: `SpecialistReportCard.tsx:68-69,72,90`; `SpecialistEnvelope.tsx:78,148`; `SubagentTimeline.tsx:113,118,137,179,233`.
- Screenshot: confirmed — `shots-main/light/tool-cards-all-expanded.png` and `shots-pages-view` background ("Agent: Sweep the settings dialogs" card).

### 16. Small utility cards (each a one-off recipe)
- `RemoteFileCard.tsx:47` — `w-full max-w-xs rounded-lg bg-inset px-4 py-5` (largest vertical padding of any card in the app; no border, no shadow).
- `PartialFileBanner.tsx:43-45` — `rounded-full bg-panel border border-edge shadow-lg pl-4 pr-1.5 py-1.5` — the ONE card in the entire chat-adjacent set that uses a `shadow-*` utility, and the only pill-shaped (`rounded-full`) one.
- `AttachmentChip.tsx:133,138` — `w-32 h-24 rounded-md border border-edge bg-panel` + footer `border-t border-edge bg-panel` — smallest radius (`rounded-md`, 8px) of any card-like element found.
- `ToolBody.tsx:178` (link-preview row inside a tool result) — `rounded-lg bg-inset border border-edge hover:border-fg-muted`.
- `ToolBody.tsx:607` `READ_BOX_BASE = 'text-xs font-mono rounded-sm border border-edge bg-panel'` — the Read-tool code-preview box family, `rounded-sm` (4px), the smallest radius token used anywhere in a "card."
- Screenshot: not individually confirmed; these are secondary/rare surfaces (large-file notice, composer attachment thumbnail, inline link preview, read-tool preview).

---

## LIST ROWS

### A. Self-contained "boxed row," no separator (SettingRow family)
- Looks like: each row is its own soft rounded rectangle (`bg-inset/50`) with generous internal gap; rows are told apart by the small margin between boxes, never a line.
- Exact styling: `SETTING_ROW_BASE` (`px-3 py-2 rounded-lg bg-inset/50`), hover → `bg-inset`. Row height ~50px (comment: "py-2, not the spec's py-2.5 — the taller type pays for the lost padding").
- Built with: `SettingRow` primitive.
- Used for: Settings → every section, Backup & Sync, Remote Access, permission-grant rows (`PermissionsSection.tsx` `RuleRow`, renders `<SettingRow variant="item">`, container `space-y-1` — gap only), Permissions folder headers (reused directly via `SETTING_ROW_BASE.replace('rounded-lg','rounded-none')`, `PermissionsSection.tsx:149`).
- Screenshot: confirmed — `shots-main/light/settings-drawer.png`.
- **Known, acknowledged exception**: `components/ProvidersSection.tsx:303` hand-rolls a near-identical row (`bg-inset/50 hover:bg-inset rounded-lg px-3 py-2.5`) instead of using `SettingRow` — a code comment in `PermissionsSection.tsx:64-67` explicitly calls this out as "grandfathered legacy," exempted in `setting-row-authority.test.ts`, and warns other screens not to copy it.

### B. Hover-only flat row, no separator at all (the largest family — most dropdown/menu lists in the app)
- Looks like: a plain row that only reveals itself on hover (background or border-color tint) — no line, no box, and in several cases not even a `gap`/`space-y` between rows.
- Exact styling varies row-to-row (each hand-rolled independently):
  - `SessionDrawer.tsx:1386,1389` — outer `mx-2 my-1.5 rounded-lg border border-edge-dim bg-inset`, button `px-2 py-2.5 hover:bg-inset ${isActive?'bg-inset':''}`. **Bug for the audit: hover and active resolve to the identical `bg-inset` class — a user cannot tell "this row is selected" from "my mouse happens to be over it."**
  - `SessionDrawer.tsx:864` (nested "Referenced" sub-list) — `px-3 py-1.5 hover:bg-well`, selected `bg-well text-fg` — same collision pattern (selected and hover share `bg-well`) as the row above it, in the same file, but on a different token.
  - `model/ModelPicker.tsx:641-656` — `px-2 py-2 rounded hover:bg-inset`, selected `bg-accent` (this one does NOT collide — selected is visibly distinct from hover). Stacked in a plain `py-1.5` scroll container, no gap between rows.
  - `FolderSwitcher.tsx:265,300` — `px-2.5 py-1.5 hover:bg-inset`, selected `bg-accent/10` (also non-colliding). No gap between rows.
  - `project-view/ProjectSwitcher.tsx:176-182` — `px-2 py-2 rounded-md border`, hover `hover:bg-inset`, active `border-transparent bg-inset` (same collision risk as SessionDrawer: active and default-hover both land on plain `bg-inset`, distinguished only by the keyboard-highlight state adding `border-accent`). Rows separated by `flex flex-col gap-0.5` — the only member of this family with even a token gap.
  - `tags/TagPicker.tsx:130-131` — `px-1 py-1 rounded-sm hover:bg-inset` (smallest padding of the group), `gap-0.5` container.
  - `SessionStrip.tsx:2320-2392` (the "All Sessions" dropdown) — active `bg-inset text-fg`, hover `hover:bg-inset hover:text-fg` (same collision again), keyboard-highlight `bg-accent/20` (this one IS distinct). No gap between rows.
  - `OpenTasksPopup.tsx:55` — `px-2 py-1.5 rounded` — **no hover class on the row at all** (only a trailing action button hover-reveals), and no gap/margin/divide/border between rows — the weakest separation of any list found in this audit.
- Used for: session switcher, folder switcher, project switcher, tag picker, open-tasks popup, the session-strip's dropdown menu, ModelPicker's item list.
- Screenshot: not directly confirmed per-file; `settings-drawer.png` and `resume-browser.png` show adjacent surfaces.
- **Inconsistency inside this family**: at least three of these rows (SessionDrawer main + nested, ProjectSwitcher, SessionStrip dropdown) use the exact same class for "hovered" and "selected/active," so hovering a different row than the selected one can make both look selected at a glance. ModelPicker, FolderSwitcher and the keyboard-highlight states elsewhere avoid this by giving selection an `accent`-tinted background.

### C. Bordered-hairline row list, cleared on the last row
- Looks like: rows separated by a thin horizontal line, with the line removed after the final row so the list doesn't end on a stray rule.
- Exact styling: `ROW_CLS = 'w-full flex items-center gap-2.5 px-3 py-2 text-left min-w-0 border-b border-edge-dim last:border-b-0 transition-colors'` (comment: "draws the hairlines INSIDE").
- Built with: hand-rolled shared constant.
- Used for: Project Files tab, list view (`FilesTab.tsx:741-742,758,785`); same pattern in `marketplace/CommentList.tsx:47` (`border-b border-edge-dim last:border-0`).
- Screenshot: `shots-main/light/session-files-pane.png` / `session-files-filter.png` likely show this — not opened in this pass.

### D. True `divide-y` divider — the ONLY list in the app using a real Tailwind divider utility between rows
- Looks like: identical hairline effect to family C, but the ONE place it's done with `divide-y` on the parent instead of manually repeating `border-b`/`last:border-b-0` on every row.
- Exact styling: `SpecialistsSection.tsx:218` — `divide-y divide-edge-dim`, wrapping its 2-row Budget/Frontier tier picker (`TierRow`, `px-3 py-2.5 space-y-1.5`).
- Also present but for a *different* job (splitting footer buttons horizontally, not separating list rows): `ResumeBrowser.tsx:55` — `MENU_FOOTER = 'border-t border-edge flex divide-x divide-edge'`.
- Built with: hand-rolled. Every OTHER hairline-separated list in the app (family C) repeats `border-b`/`last:border-b-0` manually per row rather than reaching for `divide-y` — this is the single exception, not the rule.

### E. Card-per-row (each "row" is actually its own bordered card — see Cards family #7)
- Looks like: NOT a divided list at all — each session/conversation/account gets its own bordered rounded box with visible gap around it, closer to a vertical stack of small cards than a table.
- Exact styling: `SESSION_CARD_SURFACE` (`rounded-lg border bg-inset border-edge-dim hover:border-edge`) — note hover here moves the BORDER color, not the background, specifically because a large code comment in `ResumeBrowser.tsx:1141-1170` explains `.card-interactive` was deliberately left off (it's scoped to `.layer-surface`/opaque-bg cards and would be a visual no-op on `bg-inset`). Stacked with `px-4 pb-2` gap, no divider.
- Also used by: `CopyPicker.tsx:34` (`bg-panel hover:bg-well border border-edge-dim`, container `space-y-1.5` — a redundant belt-and-suspenders gap since each row already has its own border) and `ConnectedAccounts.tsx:71` (`rounded-lg border border-edge bg-inset/40 p-3`, container `space-y-4`, comment states future provider rows will append below in the same shape).
- Used for: Resume Session browser, Project View → Conversations tab, Copy-to picker, Connected Accounts.
- Screenshot: confirmed — `shots-main/light/resume-browser.png`.

**Cross-family finding**: the app has at least four different mechanisms for "make hover/selection visible on a row," used inconsistently even within single files: plain `hover:bg-inset`/`hover:bg-well` utilities, the `.card-interactive` class (grid tiles only), the `.state-layer` class (`styles/motion.css:117-126`, a 7%/13% `--fg` tint — used by `SpecialistsSection.tsx` roster rows, `SessionContextPopup.tsx`, `ToolCard.tsx`, `StatusBar.tsx`), and border-color-change-on-hover (ResumeBrowser's/ConnectedAccounts' cards). Five different "list of items in a dropdown/panel" jobs (A, B, C/D, E) also use five different separation strategies (boxed-row-no-line / hover-only-no-line-and-sometimes-no-gap / hairline-per-row / the one true `divide-y` / card-per-row with a gap), and family B alone has roughly six different padding values plus at least three hover/selected color collisions for what is functionally the same "pick one item from a short list" job.

---

## Spacing table

| Family | Inner padding | Gap between items (grid/list) | Gap inside item (title→meta→actions) |
|---|---|---|---|
| Marketplace grid card (#1) | `p-3 sm:p-4` | `gap-3` (grid) | `gap-1.5 sm:gap-2` |
| Skill/command drawer tile (#2) | `p-3` | `gap-2` (All) / `gap-1.5` (pinned/category — inconsistent within same file) | implicit stacking (`mt-1`, `mt-2`), no `gap-*` |
| Project files thumbnail card (#3) | none (image fills; footer `p-2.5`) | `gap-3` (grid) / `gap-2` (list view) | `gap-1.5` in footer metadata |
| Folder tile (#4) | body has no padding (nub + footer only) | same grid as #3 | n/a |
| Pages grid card (#5) | `p-4` (card), `p-5 sm:p-6` (empty state) | `gap-3` (grid) | `gap-3` |
| Context file row (#6) | `p-3` | `gap-2` (per group), groups separated by `mb-5` | n/a (single line) |
| Session/conversation card (#7) | `px-3 pt-2 pb-3` | `gap-2` | n/a |
| Empty-state card (#8) | `p-5 sm:p-6` | n/a (singleton) | `gap-4` |
| Project hero banner (#9) | `p-3 sm:p-5` | n/a (singleton) | `gap-3 sm:gap-4` |
| Theme tile (#10) | none (h-24 color swatch) | `gap-2` (grid) | n/a |
| Arcade tile (#11) | `p-3` | `gap-2` (grid) | `gap-2` |
| ToolCard (#12) | header `px-3 py-1.5`; body/footer `px-3 py-2` | n/a (single card per tool call) | n/a |
| Assistant bubble cards (#13) | `px-5 py-4` / `px-4 py-2.5` / `px-4 py-3` / `px-4 py-2.5` — 4 different values, see Inconsistencies | n/a | `mb-3` (Usage header) |
| `bg-well` timeline card (#14) | header `px-3 py-1.5-2`; body `px-3 pb-3` | `flex gap-2` (Deliverables tile strip) | n/a |
| `bg-inset/40` report card (#15) | header `px-3 py-1.5`; body `px-4 py-3` | n/a | n/a |
| SettingRow (list row A) | `px-3 py-2` | rows separated by small gap (no explicit value found; relies on parent `space-y`/`gap` where present) | n/a (single line title+desc) |
| Chat timeline entries (overall vertical rhythm) | n/a | outer wrapper `px-4 py-1` to `py-2` per entry (`ChatView.tsx:1346`, `PromptCard.tsx:149,168`) | n/a |

---

## Dividers / separators

### 1. Plain full-width `border-b`/`border-t` — 7 distinct jobs, no shared class behind any of them
All are hand-repeated `border-b border-edge[-dim]` or `border-t border-edge[-dim]` — there is no `.divider` utility class in `globals.css`.

- **Job A — header separated from content below** (`border-b`): `SessionDrawer.tsx:980`, `marketplace/MarketplaceFilterBar.tsx:225`, `library/LibraryScreen.tsx:232`, `project-view/ProjectSwitcher.tsx:118`, `game/GameLobby.tsx:365`, `pages/PagesView.tsx:57`, `git/GitReviewView.tsx:174`.
- **Job B — footer/action row separated from content above** (`border-t`): `ResumeBrowser.tsx:55`, `UpdatePanel.tsx:344`, `MarketplaceFilterBar.tsx:257`, `InstallingFooterStrip.tsx:47`, `ProjectSwitcher.tsx:283`, `PromptCard.tsx:186`, `model/ModelPicker.tsx` (Manage models… footer).
- **Job C — row hairline inside a list** (see List Rows family C/D above).
- **Job D — divider between stacked sections inside one panel body** (`border-t`, the largest, most-repeated job): `SpecialistsSection.tsx:247,267,271,275,280,295,312`, `PermissionsSection.tsx:445,489,638`, `SyncPanel.tsx:1279,1322`, `UsageCard.tsx:270,299`, `ModelPickerPopup.tsx:104`, `PreferencesPopup.tsx:232`, `ToolCard.tsx:710,818,870,958,1210`, `ThemeShareSheet.tsx:146`, `ShareSheet.tsx:118`, `BetaChannelToggle.tsx:87` (conditional).
- **Job E — standalone "bare" divider `<div>`** (a hand-rolled `<hr>` substitute, no content on either side needed to justify it): `QuickChips.tsx:456`, `SessionStrip.tsx:2522,2627`, `SyncPanel.tsx:1462`, `ProjectHero.tsx:614,677`.
- **Job F — media/thumbnail strip border** (visually identical CSS, different context — separates an image from its caption, not a section from a section): `DeliverablesCard.tsx:205,291`, `MarketplaceCard.tsx:198,350`.

### 2. Tapered/gradient inset header line — real, shipped, but narrowly applied
- Looks like: a 1px line under a header that fades to nothing at both ends (inset 16px from each edge) instead of running full width — visibly softer/more polished than a plain `border-b`.
- Exact styling: `::after` pseudo-element, `background: linear-gradient(to right, transparent, var(--edge) 8%, var(--edge) 92%, transparent)`, `left:16px; right:16px; height:1px`.
- Built with: shared CSS in **`components/ui/Dialog.css:5-15`** (`.dialog-header::after, [data-session-files-header]::after`) and **`components/ResumeBrowser.css:4-13`** (`[data-resume-header]::after`) — two separate small CSS files, not `globals.css`.
- Used for: every dialog built on the shared `<Dialog>` primitive (40 call sites, e.g. About, Development, Account, Preferences, Share sheets — see file list below), plus `SessionDrawer.tsx`'s "Session Files" header and `ResumeBrowser.tsx`'s "Resume Session" header specifically.
- Screenshot: confirmed — `shots-main/light/settings-about.png` (subtle fading line under "About / YouCoded 1.3.0").
- Dialog call sites (40, ≤15 inline, rest in appendix): `AccountSection.tsx`, `FirstTimeWarning.tsx`, `CloseSessionPrompt.tsx`, `ShareSheet.tsx`, `ConnectGithubModal.tsx`, `HandlePrompt.tsx`, `LocalModelsSection.tsx`, `OpenTasksPopup.tsx`, `QuickChips.tsx`, `SettingsExplainer.tsx`, `ModelPickerPopup.tsx`, `SessionContextPopup.tsx`, `PerformancePopup.tsx`, `ThemeShareSheet.tsx`, `SettingsPanel.tsx`.
  - Appendix (remaining 25): `App.tsx`, `ContextPopup.tsx`, `DonateConfirm.tsx`, `SessionRenameDialog.tsx`, `AboutPopup.tsx`, `SkillEditor.tsx`, `HelpPopup.tsx`, `ModelProvidersPopup.tsx`, `StatusBar.tsx`, `PermissionsSection.tsx`, `SyncPanel.tsx`, `assistant-settings/AssistantSettings.tsx`, `pages/PageCreateDialog.tsx`, `assistant-settings/SkipPermissionsSection.tsx`, `ImportProjectModal.tsx`, `PreferencesPopup.tsx`, `UpdatePanel.tsx`, `development/DevelopmentPopup.tsx`, `development/ReportDesign.tsx`, `development/ContributionDesign.tsx`, `marketplace/ReportReviewButton.tsx`, `tags/TagManagerPopup.tsx`.
- **Correction to a subagent's initial finding**: one research pass concluded this divider was "unshipped, dev/workbench only," because it searched for the literal word "tapered" and missed `Dialog.css`/`ResumeBrowser.css` (neither file contains that word). I read both files directly and confirmed the gradient rule is live production CSS with real call sites and a real screenshot. The dev/workbench files DO contain a separate, larger design-exploration version of the same idea (multiple taper widths being compared) — that one is genuinely unshipped and out of scope (dev/ excluded).
- **Inconsistency**: this is a strictly nicer-looking divider than plain `border-b` (Job A above), but it's only wired to Dialog-based popups and two specific drawer headers — most other screen headers (Pages, Library, Marketplace filter bar, Project Switcher, Game Lobby, Git Review) still use the plain full-width `border-b` from Job A. Two visually different "header separated from content" treatments coexist with no stated rule for which a new screen should use.

### 3. Markdown rules
- `<hr>` → `border-edge my-5`, full width, plain. Only production site: `MarkdownContent.tsx:384`. No other `.tsx` file renders a literal `<hr>` — every other "rule line" elsewhere in the app is a hand-built `<div>` with border classes (functionally an `<hr>` reimplementation without the semantic element).
- Markdown H1/H2 get an underline treatment that is ALSO a divider: `text-xl font-bold mt-6 mb-3 pb-1.5 border-b border-edge` (H1), `text-lg ... pb-1 border-b border-edge` (H2) — `MarkdownContent.tsx:360,363`. H3+ have no rule.

### 4. Left-rule "quote/note" block (`border-l-2`) — 3 near-identical, slightly divergent uses
- Looks like: a vertical bar on the left edge of an indented block of text — used for blockquotes and for secondary/muted notes.
- `MarkdownContent.tsx:388` (blockquote) — `border-l-2 border-edge pl-3 my-3 text-fg-dim italic`
- `AssistantTurnBubble.tsx:86,97` (error/status note under a turn) — `border-l-2 border-edge-dim pl-2` / `pl-1`
- `SpecialistsSection.tsx:412` (nested detail) — `border-l-2 border-edge-dim pl-2 space-y-1`
- **Inconsistency**: the Markdown blockquote uses `border-edge` while both other uses use the dimmer `border-edge-dim` — same visual idea, two different line colors.

### 5. `Callout` component (K4) — the shared system
- 3 tones, `rounded-lg p-3 border`, no action slot. ~19 call sites found (info/warning/danger mix, skewed heavily toward `warning`): `EngineCard.tsx:328,487`, `AccountSection.tsx:735`, `LocalModelsSection.tsx:934,1159`, `SessionContextPopup.tsx:317,570,607`, `SyncSetupWizard.tsx:527,622,638,784`, `SettingsPanel.tsx:1199,1243,1259,1779,1839,1854,2053,2402,2448`, `SyncPanel.tsx:1333` (collapsible), `development/ReportDesign.tsx:275`, `marketplace/MarketplaceDetailOverlay.tsx:389`.

### 6. Hand-rolled callout duplicates (NOT using the shared `Callout` component)
- **`SettingsPanel.tsx:1825`** — `bg-accent/10 border border-accent/25 rounded-lg p-3` — byte-for-byte the same geometry/tone as `Callout tone="info"`, built as a raw `<div>` right next to a comment explaining the info/warning color convention. Should use `<Callout tone="info">`.
- **`ModelPickerPopup.tsx:493`** — `rounded border border-amber-700/40 bg-amber-700/10 p-3 space-y-1.5` — Callout-shaped but drifted on radius (`rounded` = 4px, not `rounded-lg` = 12px) AND on color (`amber-700`, not Callout's `amber-500`); it also nests its own `border-t border-amber-700/25` divider (a second, unrelated inconsistency inside the same box).
- Everything else matching `bg-accent/10`/`bg-amber-*/N`/`bg-destructive/10` outside `Callout.tsx` itself turned out to be small single-line badges/pills (status tags), not block callouts — not counted as duplicates.

### 7. `StatusStrip` (K5) — the callout's action-bearing sibling
- `px-3 py-2.5 rounded-lg bg-inset` + status dot/spinner + optional detail line + action button. Deliberately distinct from Callout (which has no action slot) per its own doc comment. Not independently audited for call-site count here — flagged for completeness since it's visually similar to a callout at a glance.

---

## Inconsistencies spotted (top findings across all four categories)

1. **The same `.layer-surface` primitive produces two visually different card looks** depending on whether radius/shadow are overridden: Marketplace grid cards keep the full 16px-radius/32px-shadow/hover-lift treatment, while Skill-drawer tiles and Project-Files thumbnail cards force `!rounded-lg` (12px) and kill the shadow entirely (`boxShadow:'none'`). A user browsing the Marketplace and then opening the skill drawer or a project's Files tab sees three different "card" textures for conceptually similar "browse a grid of things" screens.
2. **Card background token fragments across at least 4 values** for what is often the same "static content box" job: `bg-panel` (Pages, Context rows, empty states, AttachmentChip), `bg-inset` (session cards, RemoteFileCard, chat bubbles), `bg-well` (git review, deliverables, chatsearch ref block, arcade tiles), and translucent `bg-inset/40`–`/50` (specialist reports, EngineCard rows, SettingRow, TagManagerPopup) — with no documented rule for which token a new "card that sits on the canvas" should use.
3. **Card radius has at least 5 unreconciled tiers in active use**: `rounded-sm` (4px, ToolBody's read-preview box, AttachmentChip's inner elements), `rounded`/`rounded-md` (6–8px, OpenTasksPopup rows, TagManagerPopup, AttachmentChip shell), `rounded-lg` (12px, the de-facto default for most cards/rows), `rounded-xl` (16px, `.layer-surface`'s own default, kept only by Marketplace cards and popovers), `rounded-2xl` (24px, the chat-bubble family). No visible pattern maps a job to a tier consistently.
4. **Chat "assistant bubble" cards (Usage/SkillInvocation/Compacting/AttentionBanner) share bubble geometry but not padding or border**: 4 different padding pairs, 2-of-4 bordered.
5. **List separation strategy is inconsistent across 5 similar "pick from a short list" surfaces**: SettingRow-style lists use no line at all (boxed rows with gaps), SessionDrawer/FolderSwitcher/TagPicker/OpenTasksPopup rely on hover color alone with 4 different padding values, FilesTab's list view and CommentList use `border-b last:border-b-0` hairlines, SpecialistsSection uses the Tailwind `divide-y` utility instead of manual borders for the same visual result, and ResumeBrowser/ConversationsTab wrap each row in its own bordered card with a gap instead of dividing a flat list at all.
6. **Two divider treatments compete for the same "header separated from content" job**: the plain full-width `border-b` (used by Pages, Library, Marketplace filter bar, Project Switcher, Game Lobby, Git Review) and the newer tapered/fading gradient line shipped in `Dialog.css`/`ResumeBrowser.css` (used by all `<Dialog>`-based popups plus two specific drawer headers). Nothing states which a new screen should reach for.
7. **Two hand-rolled boxes duplicate the shared `Callout` component** almost exactly (`SettingsPanel.tsx:1825`, `ModelPickerPopup.tsx:493`), the second additionally drifting to a different amber shade and radius than Callout's own warning tone.
8. **`ProvidersSection.tsx` is an explicitly acknowledged, code-commented exception** to the shared `SettingRow` primitive — a "grandfathered legacy" hand-rolled row shape that a nearby comment in `PermissionsSection.tsx` warns future work not to copy. This is the one inconsistency the codebase already knows about and has fenced off with a test exemption, rather than fixed.
9. **Left-rule note/quote blocks use two different border colors** for the same visual idea: Markdown blockquotes use `border-edge`, while the two in-app equivalents (AssistantTurnBubble note, SpecialistsSection detail) use the dimmer `border-edge-dim`.
10. **Grid gaps vary inside the very same file**: `CommandDrawer.tsx` uses `gap-2` for its main "All" grid and `gap-1.5` for the pinned/category subsections directly below it — a single screen with two grid-gap values for what looks like one continuous tile grid.
11. **Hover and selected states collide on at least 3 list rows**, making a hovered-but-not-selected row look identical to the actually-selected one: `SessionDrawer.tsx:1389` (main file rows, both states `bg-inset`), `SessionDrawer.tsx:864` (nested "Referenced" rows, both `bg-well`), `project-view/ProjectSwitcher.tsx:176-182` (default-hover and active both land on plain `bg-inset`), and `SessionStrip.tsx:2320` (session dropdown, both `bg-inset`). This is a real usability risk, not just a visual-polish one: a user hovering row B while row A is actually selected may believe they're about to act on B's already-selected state. ModelPicker and FolderSwitcher avoid this by giving selection an accent-tinted background distinct from hover.
12. **At least four different hover/selection-feedback mechanisms compete** for the same "show this row is interactive" job: plain `hover:bg-inset`/`hover:bg-well` Tailwind utilities (most rows), the `.card-interactive` class (grid tiles only), the `.state-layer` class (`styles/motion.css:117-126` — used by SpecialistsSection roster rows, SessionContextPopup, ToolCard, StatusBar), and hover-changes-border-color-not-background (ResumeBrowser's and ConnectedAccounts' card-per-row lists, deliberately opted out of `.card-interactive`).
13. **Only one list in the entire app uses a real `divide-y` divider between rows** (`SpecialistsSection.tsx:218`, a 2-row tier picker) — every other hairline-separated list (Project Files list view, marketplace CommentList) hand-repeats `border-b ... last:border-b-0` on each row instead of the shorter, less error-prone `divide-y` utility.

---

## Coverage

**Searched**: every `.tsx` file under `youcoded/desktop/src/renderer/components/`, `App.tsx`, and root-level renderer components, for `rounded-(sm|md|lg|xl|2xl|full)`, `bg-(panel|inset|well|glass|accent)`, `border-b`/`border-t`, `divide-x`/`divide-y`, `<hr`, `layer-surface`, `card-interactive`, `gap-`/`space-y-`, and the `Callout`/`SettingRow`/`StatusStrip` primitives. `styles/globals.css` was read directly for `.layer-surface`, `.card-interactive`, `.stepped-hover`, radius tokens, and searched for `divider`/`separator`/`hr`/`tapered`/`gradient` (none named `.divider` exist). `src/renderer/dev/` was explicitly excluded per instructions — its `compare/registry.tsx` contains a large, separate, still-unshipped design exploration of card/divider variants (including a wider tapered-divider study) that is out of scope here.

**Confirmed against real screenshots** (Read the PNG directly) for: Marketplace/Library grid cards, Skill/command drawer tiles, Project Files grid (thumbnail + folder cards), Project hero card, Resume Session browser cards, Settings row list, About-dialog tapered header line, subagent/specialist report cards, Deliverables strip, tool-call cards.

**Not confirmed against a screenshot** (styling verified in source only — flagged inline above, would need a targeted capture): Pages browsing grid itself (only Page *content* was in the baseline set), Context tab file rows, empty-state project card, theme-picker grid (file exists, `settings-appearance.png`, not opened), arcade picker grid (file exists, `games-picker.png`, not opened), chat bubble family for Compacting/AttentionBanner specifically, small utility cards (RemoteFileCard, PartialFileBanner, AttachmentChip, read-tool preview box).

**Delegated sweeps**: four research sweeps were run in parallel and their file:line findings were verified and incorporated directly into this document (chat-embedded cards; full-screen grid/list cards; dividers/callouts; list-row/popover styling). One sweep's initial conclusion about the tapered-divider CSS being unshipped was checked against the actual source files and corrected above (see "Correction to a subagent's initial finding" in the Dividers section) — its file:line evidence for the plain `border-b`/`border-t` jobs and the `Callout` audit was otherwise accurate and is used as-is. The list-row sweep (SessionDrawer, ResumeBrowser, ModelPicker, FolderSwitcher, ProjectSwitcher, TagPicker, TagManagerPopup, OpenTasksPopup, SessionStrip, CopyPicker, ModelProvidersPopup, ConnectedAccounts, PermissionsSection, SpecialistsSection, CommandDrawer) is used as-is; its hover/selected-collision finding is treated as a genuine bug-level inconsistency, not just a style note.

**Not separately audited in depth** (would need another pass if wanted): every individual settings sub-screen's exact vertical rhythm between `SettingRow` groups; `StatusStrip` call-site count; full appendix of every `border-t` "Job D" section-stack site beyond the ones listed (that job repeats extremely often — dozens more sites likely exist across settings sub-panels); `.state-layer`'s full call-site list beyond the four named; Android-specific rendering differences (not expected to differ, since it's the same React bundle, but not independently verified here).
