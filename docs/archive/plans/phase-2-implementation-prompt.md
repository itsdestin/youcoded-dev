---
status: shipped
origin: wecoded-marketplace@eecc843:docs/phase-2-implementation-prompt.md
---

## Task: Unified Marketplace — Phase 2: Unify the UI

### Context

We're unifying YouCoded's three separate content systems into a single marketplace. The full plan is at `wecoded-marketplace/docs/unified-marketplace-plan.md`. The raw research is at `wecoded-marketplace/docs/unified-marketplace-research-report.md`. Read both before starting.

Phases 0 and 1 should already be completed. Phase 1 added: improved sync.js, restructured registry repo (skills/index.json + themes/index.json), extended youcoded-skills.json with a `packages` field, and consolidated Android plugin install routing. This phase builds the unified UI on top of that data layer.

### What you need to do

**Step 1: Familiarize with the codebase.** Read these files to understand the three UIs being merged:

Current marketplace UIs:
- `youcoded/desktop/src/renderer/components/Marketplace.tsx` — skill marketplace (205 lines). Full-screen modal, search, type/category pills, sort, 2-column grid. Uses `useSkills()` context for data.
- `youcoded/desktop/src/renderer/components/ThemeMarketplace.tsx` — theme marketplace (227 lines). Nearly identical layout. Uses direct `window.claude.theme.marketplace.list()` IPC calls — no context wrapper.
- `youcoded/desktop/src/renderer/components/SkillManager.tsx` — installed content manager (562 lines). Two tabs: "My Skills" (list with favorite/edit/share/delete) and "Quick Chips" (input bar shortcuts). Has "Browse Marketplace" button that opens skill marketplace.

Detail views:
- `youcoded/desktop/src/renderer/components/SkillDetail.tsx` — skill detail with install/uninstall/favorite/share (238 lines)
- `youcoded/desktop/src/renderer/components/ThemeDetail.tsx` — theme detail with try-before-install preview (272 lines)

Card components:
- `youcoded/desktop/src/renderer/components/SkillCard.tsx` — skill card (96 lines)
- `youcoded/desktop/src/renderer/components/ThemeCard.tsx` — theme card with token preview (122 lines)

Data fetching:
- `youcoded/desktop/src/renderer/state/skill-context.tsx` — React context wrapping skill IPC
- `youcoded/desktop/src/renderer/state/theme-context.tsx` — theme application context (separate from marketplace)

Entry points:
- `youcoded/desktop/src/renderer/App.tsx` — manages `marketplaceOpen`, `themeMarketplaceOpen`, `managerOpen` as separate boolean states
- `youcoded/desktop/src/renderer/components/CommandDrawer.tsx` — has pencil icon → SkillManager, "Browse Marketplace" link

IPC definitions:
- `youcoded/desktop/src/main/preload.ts` — channel definitions for skills (lines ~162-181) and themes (lines ~244-261)
- `youcoded/desktop/src/renderer/remote-shim.ts` — WebSocket IPC equivalents for Android/remote

**Step 2: Implement Phase 2.** Three sub-tasks:

#### 2a. Build MarketplaceContext

Create a new React context (`MarketplaceContext`) that unifies the two data-fetching patterns:

- Fetches both `skills/index.json` and `themes/index.json` on mount (parallel requests)
- Loads `packages` from youcoded-skills.json (via new IPC — may need to add a `marketplace:get-packages` handler)
- Runs filesystem reconciliation on load: verify tracked component paths exist, scan plugin/theme dirs for untracked items
- Exposes methods: `install(id, type)`, `uninstall(id)`, `update(id)` — work for any content type
- Exposes filtered views: `skillEntries`, `themeEntries`, `installedEntries` (includes marketplace, user-created, and external items)
- Exposes `privateSkills` from youcoded-skills.json
- On install/uninstall, refreshes state so all tabs re-render
- Handles loading, error, and empty states

The existing `SkillContext` stays for the command drawer. `ThemeContext` stays for applying themes to the DOM. `MarketplaceContext` is only for the marketplace modal.

#### 2b. Build unified marketplace modal

Replace `Marketplace.tsx` + `ThemeMarketplace.tsx` + `SkillManager.tsx` with a single unified `Marketplace.tsx` with three tabs:

**Installed tab:**
- All installed content: marketplace packages, user-created items (privateSkills + user themes), external items
- Type indicator per item (skill, theme, plugin, bundle)
- Actions based on source:
  - Marketplace-installed: update (if available), uninstall, favorite
  - User-created: edit, publish, delete (with warning), favorite
  - External: visible with "External" badge, not manageable
- "Update available" badge where index version > installed version
- Quick Chips management as a collapsible section within this tab

**Skills tab:**
- Type pills: All / Prompts / Plugins
- Category pills: Personal / Work / Development / Admin / Other
- Source pills: YouCoded / Anthropic / Community
- Sort: Popular / Newest / Rating / Name
- 2-column card grid with SkillCard components
- Search bar

**Themes tab:**
- Source pills: Official / Community
- Mode pills: Dark / Light
- Feature pills: wallpaper, particles, glassmorphism, custom-font, custom-icons, mascot, custom-css
- Sort: Newest / Name
- 2-column card grid with ThemeCard components
- Search bar

Keep SkillCard/ThemeCard as separate components. Keep SkillDetail/ThemeDetail as separate detail views. Share the modal shell: fixed full-screen overlay, header with back button and title, search bar, tab bar.

The modal accepts an `initialTab` prop so entry points can open to the right tab.

#### 2c. Update entry points

Update `App.tsx`: Replace separate `marketplaceOpen`, `themeMarketplaceOpen`, `managerOpen` booleans with a single `marketplaceTab: 'installed' | 'skills' | 'themes' | null` state. `null` means closed.

Update navigation:
- Command drawer pencil icon → `setMarketplaceTab('installed')`
- Command drawer "Browse Marketplace" → `setMarketplaceTab('skills')`
- Settings → Appearance → "Browse Themes" → `setMarketplaceTab('themes')`

Update `remote-shim.ts` and `preload.ts` if new IPC channels are needed for the MarketplaceContext.

### Important rules

- Sync every repo before starting: `git fetch origin && git pull origin master`
- Use a worktree for the work
- Annotate code edits with brief inline comments explaining purpose
- Use the same CSS token system the existing components use (bg-panel, border-edge, text-fg, etc.)
- Keep the tab bar simple — styled pills or underlined labels, consistent with existing UI patterns
- Commit each sub-task separately
- Do NOT push — report what you did and what branch it's on
