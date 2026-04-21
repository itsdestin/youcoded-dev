# Drawer + Marketplace Polish and Plugin Grouping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the recent CommandDrawer tile-sizing regression, add a three-state install affordance to marketplace tiles (download → braille spinner → unfavorited favorite star), unify integrations into the shared card, and group installed skills/commands under their parent plugin in the CommandDrawer and Library. Search in the CommandDrawer returns a mixed skill/plugin list.

**Architecture:** Changes are confined to the React renderer plus one install-flow tweak in `marketplace-context.tsx`. New pure grouping utility (`plugin-grouping.ts`) produces plugin-level entries shaped like `SkillEntry` so they flow through the existing `MarketplaceCard` / `SkillCard` components without a new card type. The favorite star becomes an internal absolutely-positioned child of `SkillCard` so the drawer grid regains uniform sizing. A new primitive `InstallFavoriteCorner` owns the download/spinner/star state machine on marketplace tiles. `IntegrationCard` is retired; integrations render through `MarketplaceCard` with optional `iconUrl` + `accentColor` props.

**Tech Stack:** React 18, TypeScript, Tailwind CSS classes already in use, Vitest for pure-function tests.

**Spec:** `docs/superpowers/specs/2026-04-21-drawer-marketplace-polish-and-grouping-design.md`

---

## File Structure

### Created

- `youcoded/desktop/src/renderer/utils/plugin-grouping.ts` — pure grouping utility `groupInstalledByPlugin()`
- `youcoded/desktop/tests/plugin-grouping.test.ts` — unit tests
- `youcoded/desktop/src/renderer/components/marketplace/InstallFavoriteCorner.tsx` — three-state corner primitive

### Modified

- `youcoded/desktop/src/shared/types.ts` — add `InstalledPluginGroup` type, add `installedPlugins` to `MarketplaceState`
- `youcoded/desktop/src/renderer/state/marketplace-context.tsx` — derive `installedPlugins`; remove auto-favorite-on-install
- `youcoded/desktop/src/renderer/components/SkillCard.tsx` — root becomes `position: relative`; accept `favorite?: { filled, onToggle }` and `chipSkills?: SkillEntry[]` / `onChipClick?` props
- `youcoded/desktop/src/renderer/components/CommandDrawer.tsx` — iterate `installedPlugins`; remove wrapper `div` around `SkillCard`; handle multi-skill plugin chips; mixed search results
- `youcoded/desktop/src/renderer/components/library/LibraryScreen.tsx` — iterate `installedPlugins` for the Skills tab
- `youcoded/desktop/src/renderer/components/marketplace/MarketplaceCard.tsx` — use `InstallFavoriteCorner`; move `Installed` badge z-order; accept `iconUrl` + `accentColor` props
- `youcoded/desktop/src/renderer/components/marketplace/MarketplaceScreen.tsx` — render integrations via `MarketplaceCard` instead of `IntegrationCard`

### Deleted

- `youcoded/desktop/src/renderer/components/marketplace/IntegrationCard.tsx` — subsumed by MarketplaceCard

---

## Task 1: Create worktree and branch

**Files:**
- None — worktree setup only

- [ ] **Step 1: From workspace root, create the worktree**

```bash
cd /c/Users/desti/youcoded-dev/youcoded
git fetch origin master
git worktree add .worktrees/drawer-mkt-polish -b feat/drawer-mkt-polish origin/master
cd .worktrees/drawer-mkt-polish/desktop
npm ci
```

- [ ] **Step 2: Verify baseline tests pass**

Run: `npm test -- --run`
Expected: existing tests all pass. (We haven't added anything yet.)

- [ ] **Step 3: Verify baseline build compiles**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: no type errors.

---

## Task 2: Plugin grouping utility (pure function)

**Files:**
- Create: `youcoded/desktop/src/renderer/utils/plugin-grouping.ts`
- Test: `youcoded/desktop/tests/plugin-grouping.test.ts`

- [ ] **Step 1: Write the failing test**

Create `youcoded/desktop/tests/plugin-grouping.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { groupInstalledByPlugin } from '../src/renderer/utils/plugin-grouping';
import type { SkillEntry } from '../src/shared/types';

function skill(partial: Partial<SkillEntry> & { id: string }): SkillEntry {
  return {
    displayName: partial.id,
    description: '',
    category: 'other',
    prompt: `/${partial.id}`,
    source: 'plugin',
    type: 'prompt',
    visibility: 'published',
    ...partial,
  } as SkillEntry;
}

describe('groupInstalledByPlugin', () => {
  it('returns one group per plugin, bundling skills under pluginName', () => {
    const installed: SkillEntry[] = [
      skill({ id: 'youcoded-encyclopedia:journal', pluginName: 'youcoded-encyclopedia' }),
      skill({ id: 'youcoded-encyclopedia:compile', pluginName: 'youcoded-encyclopedia' }),
      skill({ id: 'civic-report', pluginName: 'civic-report' }),
    ];
    const marketplace: SkillEntry[] = [
      skill({ id: 'youcoded-encyclopedia', displayName: 'Encyclopedia', description: 'Life history', type: 'plugin' }),
      skill({ id: 'civic-report', displayName: 'Civic Report', description: 'Rep report', type: 'plugin' }),
    ];

    const groups = groupInstalledByPlugin(installed, marketplace);

    expect(groups).toHaveLength(2);
    const enc = groups.find(g => g.id === 'youcoded-encyclopedia')!;
    expect(enc.displayName).toBe('Encyclopedia');
    expect(enc.description).toBe('Life history');
    expect(enc.skills).toHaveLength(2);
    const civic = groups.find(g => g.id === 'civic-report')!;
    expect(civic.skills).toHaveLength(1);
  });

  it('treats skills with no pluginName as standalone single-skill groups', () => {
    const installed: SkillEntry[] = [
      skill({ id: 'my-custom-skill', source: 'self' }),
    ];
    const groups = groupInstalledByPlugin(installed, []);
    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe('my-custom-skill');
    expect(groups[0].skills).toHaveLength(1);
    expect(groups[0].skills[0].id).toBe('my-custom-skill');
  });

  it('falls back to the first skill metadata when marketplace entry is missing', () => {
    const installed: SkillEntry[] = [
      skill({ id: 'unknown:alpha', pluginName: 'unknown', displayName: 'Alpha' }),
      skill({ id: 'unknown:beta', pluginName: 'unknown', displayName: 'Beta' }),
    ];
    const groups = groupInstalledByPlugin(installed, []);
    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe('unknown');
    // Fallback titlecases pluginName rather than using 'Alpha'
    expect(groups[0].displayName).toBe('Unknown');
    expect(groups[0].skills).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd youcoded/desktop && npm test -- --run plugin-grouping`
Expected: FAIL with "Cannot find module" (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `youcoded/desktop/src/renderer/utils/plugin-grouping.ts`:

```typescript
import type { SkillEntry, InstalledPluginGroup } from '../../shared/types';

// Title-case fallback when we don't have a marketplace-supplied displayName
function titleCase(id: string): string {
  return id.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/**
 * Group installed SkillEntry objects by their pluginName.
 *
 * - Skills with a matching pluginName merge into one group, enriched with
 *   plugin-level metadata (displayName, description, category, prompt) from
 *   the marketplace entry if available.
 * - Skills without a pluginName become single-skill groups (standalone user
 *   skills, or entries whose plugin isn't in the registry).
 * - Output preserves installed-skill ordering by iterating the input once.
 */
export function groupInstalledByPlugin(
  installed: SkillEntry[],
  marketplace: SkillEntry[],
): InstalledPluginGroup[] {
  const registryById = new Map(marketplace.map(e => [e.id, e]));
  const byPluginId = new Map<string, InstalledPluginGroup>();

  for (const skill of installed) {
    const pluginId = skill.pluginName ?? skill.id;
    const existing = byPluginId.get(pluginId);
    if (existing) {
      existing.skills.push(skill);
      continue;
    }
    const registryEntry = registryById.get(pluginId);
    const group: InstalledPluginGroup = {
      id: pluginId,
      displayName: registryEntry?.displayName ?? titleCase(pluginId),
      description: registryEntry?.description ?? skill.description ?? '',
      category: registryEntry?.category ?? skill.category ?? 'other',
      prompt: registryEntry?.prompt,
      source: registryEntry?.source ?? skill.source,
      type: 'plugin',
      visibility: 'published',
      author: registryEntry?.author,
      installedAt: skill.installedAt,
      iconUrl: (registryEntry as any)?.iconUrl,
      accentColor: (registryEntry as any)?.accentColor,
      skills: [skill],
    };
    byPluginId.set(pluginId, group);
  }

  return Array.from(byPluginId.values());
}
```

- [ ] **Step 4: Add the `InstalledPluginGroup` type**

Edit `youcoded/desktop/src/shared/types.ts`. Find the section containing `SkillEntry` (around line 178) and append after it:

```typescript
/**
 * One installed plugin with its bundled skills grouped under it.
 * Shape-compatible with SkillEntry so the plugin card can flow through
 * MarketplaceCard and SkillCard without a new card component.
 */
export interface InstalledPluginGroup extends SkillEntry {
  /** The bundled skills that make up this plugin. Always length >= 1. */
  skills: SkillEntry[];
  /** Optional custom icon (only set on integrations today). */
  iconUrl?: string;
  /** Optional accent color (only set on integrations today). */
  accentColor?: string;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd youcoded/desktop && npm test -- --run plugin-grouping`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
cd /c/Users/desti/youcoded-dev/youcoded/.worktrees/drawer-mkt-polish
git add desktop/src/renderer/utils/plugin-grouping.ts \
        desktop/tests/plugin-grouping.test.ts \
        desktop/src/shared/types.ts
git commit -m "feat(marketplace): plugin-grouping utility for installed skills"
```

---

## Task 3: Expose `installedPlugins` from marketplace-context

**Files:**
- Modify: `youcoded/desktop/src/renderer/state/marketplace-context.tsx`

- [ ] **Step 1: Add the derived selector**

Edit `marketplace-context.tsx`. At the top of the file, add the import:

```typescript
import { groupInstalledByPlugin } from '../utils/plugin-grouping';
```

Add `installedPlugins: InstalledPluginGroup[];` to the `MarketplaceState` interface around line 76 (right after `installedSkills: SkillEntry[];`):

```typescript
  installedSkills: SkillEntry[];
  /** Skills grouped by parent plugin; one entry per plugin. */
  installedPlugins: InstalledPluginGroup[];
```

(Also add `InstalledPluginGroup` to the existing `import type { … } from '../../shared/types';` line.)

- [ ] **Step 2: Derive it inside the provider**

Inside `MarketplaceProvider`, after the `useState` hooks and before `fetchAll`, add a `useMemo`:

```typescript
// Plugin-grouped view of installed skills. Consumers that want one card per
// plugin (CommandDrawer browse, Library Skills tab) read this; consumers
// that need individual skills (search) continue to use installedSkills.
const installedPlugins = useMemo(
  () => groupInstalledByPlugin(installedSkills, skillEntries),
  [installedSkills, skillEntries],
);
```

- [ ] **Step 3: Include it in the context value**

Find the final `value = useMemo(() => ({…}), [...])` block near the bottom of the provider. Add `installedPlugins,` into the object literal (after `installedSkills`) and add `installedPlugins` to the dependency array.

- [ ] **Step 4: Verify types compile**

Run: `cd youcoded/desktop && npx tsc -p tsconfig.json --noEmit`
Expected: no type errors.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/renderer/state/marketplace-context.tsx
git commit -m "feat(marketplace): expose installedPlugins (plugin-grouped) selector"
```

---

## Task 4: Remove auto-favorite on install

**Files:**
- Modify: `youcoded/desktop/src/renderer/state/marketplace-context.tsx:236-239`

Per the spec: when the corner icon transitions from braille spinner to favorite star after a successful install, the star must appear **unfavorited**. Today `installSkill` calls `setFavorite(id, true)` automatically. Remove that.

- [ ] **Step 1: Delete the auto-favorite lines**

Find the `installSkill` function. Remove these lines:

```typescript
      // Auto-favorite on install so newly-added skills appear at the top of
      // the Command Drawer immediately. User can unstar at any time.
      try { await window.claude.skills.setFavorite(id, true); } catch {}
```

- [ ] **Step 2: Verify compile**

Run: `cd youcoded/desktop && npx tsc -p tsconfig.json --noEmit`
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add desktop/src/renderer/state/marketplace-context.tsx
git commit -m "feat(marketplace): stop auto-favoriting newly-installed skills

The install-affordance corner now ends in an unfavorited star so the
user sees a distinct favorite click as a separate action."
```

---

## Task 5: Refactor `SkillCard` so the favorite star is an internal child

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/SkillCard.tsx`

The CommandDrawer currently wraps `SkillCard` in an outer `relative` div and renders `FavoriteStar` as a sibling, which distorts the drawer grid's flex sizing. Move the star inside `SkillCard` so a single card element owns both the button and the overlay.

- [ ] **Step 1: Replace the file contents**

Replace the full contents of `SkillCard.tsx` with:

```tsx
import React from 'react';
import type { SkillEntry } from '../../shared/types';
import { useMarketplaceStats } from '../state/marketplace-stats-context';
import StarRating from './marketplace/StarRating';
import FavoriteStar from './marketplace/FavoriteStar';

interface FavoriteProps {
  filled: boolean;
  onToggle: () => void;
}

interface ChipSkill {
  id: string;
  displayName: string;
}

interface Props {
  skill: SkillEntry;
  onClick: (skill: SkillEntry) => void;
  variant?: 'drawer' | 'marketplace';
  installed?: boolean;
  updateAvailable?: boolean;
  onInstall?: (skill: SkillEntry) => void;
  installing?: boolean;
  /** When provided, a corner favorite star overlays the card. */
  favorite?: FavoriteProps;
  /** When provided, a row of bundled-skill chips renders beneath the blurb.
   *  Clicking a chip invokes the callback with the chip id; card click still fires. */
  chipSkills?: ChipSkill[];
  onChipClick?: (chipId: string) => void;
}

const sourceBadgeStyles: Record<string, string> = {
  'youcoded-core': 'bg-[#4CAF50]/15 text-[#4CAF50] border border-[#4CAF50]/25',
  self: 'bg-[#66AAFF]/15 text-[#66AAFF] border border-[#66AAFF]/25',
  plugin: 'bg-inset/50 text-fg-dim border border-edge/25',
  marketplace: 'bg-inset/50 text-fg-dim border border-edge/25',
};

const typeBadgeStyles: Record<string, string> = {
  prompt: 'bg-[#f0ad4e]/15 text-[#f0ad4e] border border-[#f0ad4e]/25',
  plugin: 'bg-inset/50 text-fg-dim border border-edge/25',
};

const typeLabels: Record<string, string> = {
  prompt: 'Prompt',
  plugin: 'Plugin',
};

export default function SkillCard({
  skill, onClick, variant = 'drawer', installed, updateAvailable,
  onInstall, installing, favorite, chipSkills, onChipClick,
}: Props) {
  const { plugins } = useMarketplaceStats();
  const liveStats = plugins[skill.id];
  const liveInstalls = liveStats?.installs ?? skill.installs ?? null;
  const liveRating = liveStats?.rating ?? null;
  const liveReviewCount = liveStats?.review_count ?? 0;

  const badge = (
    <span className={`text-[9px] font-medium px-1 py-0.5 rounded-sm shrink-0 ${
      skill.source === 'youcoded-core' ? sourceBadgeStyles['youcoded-core'] :
      typeBadgeStyles[skill.type] || sourceBadgeStyles.plugin
    }`}>
      {skill.source === 'youcoded-core' ? 'YC' : typeLabels[skill.type] || 'Plugin'}
    </span>
  );

  // Chip row renders for multi-skill plugin cards (Task 6/Task 8 pass `chipSkills`).
  // Chips stopPropagation so a chip click doesn't also fire the card's onClick.
  const chipRow = chipSkills && chipSkills.length > 0 && (
    <div className="flex flex-wrap gap-1 mt-2">
      {chipSkills.map(c => (
        <button
          key={c.id}
          type="button"
          onClick={(e) => { e.stopPropagation(); onChipClick?.(c.id); }}
          className="text-[10px] px-1.5 py-0.5 rounded-sm bg-inset/60 text-fg-dim border border-edge/25 hover:bg-inset hover:text-fg transition-colors"
        >
          {c.displayName}
        </button>
      ))}
    </div>
  );

  if (variant === 'marketplace') {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => onClick(skill)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(skill); } }}
        className="relative bg-panel border border-edge-dim rounded-lg p-3 text-left hover:bg-inset hover:border-edge transition-colors flex flex-col cursor-pointer"
      >
        {favorite && (
          <FavoriteStar corner size="sm" filled={favorite.filled} onToggle={favorite.onToggle} />
        )}
        <div className="flex justify-between items-start">
          <span className="text-sm font-medium text-fg leading-tight">{skill.displayName}</span>
          <span className="ml-1">{badge}</span>
        </div>
        <span className="text-[11px] text-fg-muted mt-1 leading-snug line-clamp-2 flex-1">
          {skill.description}
        </span>
        {chipRow}
        {liveRating != null && (
          <div className="mt-1">
            <StarRating value={liveRating} count={liveReviewCount} size="sm" />
          </div>
        )}
        <div className="flex justify-between items-center mt-1">
          <span className="text-[9px] text-fg-faint">
            {skill.author ? `${skill.author}` : ''}
            {liveInstalls != null ? ` · ${liveInstalls >= 1000 ? `${(liveInstalls / 1000).toFixed(1)}k` : liveInstalls} ↓` : ''}
          </span>
        </div>
        {installed ? (
          <div className={`text-center text-[11px] py-1 mt-2 border rounded-sm ${
            updateAvailable
              ? 'text-[#f0ad4e] border-[#f0ad4e]/40'
              : skill.source === 'self' || skill.visibility === 'private'
                ? 'text-[#66AAFF] border-[#66AAFF]/40'
                : 'text-[#4CAF50] border-[#4CAF50]/40'
          }`}>
            {updateAvailable
              ? 'Update Available'
              : skill.source === 'self' || skill.visibility === 'private'
                ? 'User Skill'
                : 'Installed'}
          </div>
        ) : installing ? (
          <div className="text-center text-[11px] py-1 mt-2 border rounded-sm text-fg-muted border-edge-dim opacity-60">
            Installing...
          </div>
        ) : onInstall ? (
          <button
            onClick={(e) => { e.stopPropagation(); onInstall(skill); }}
            className="w-full bg-accent text-on-accent text-[11px] font-medium py-1 mt-2 rounded-sm hover:brightness-110 transition-colors"
          >
            Get
          </button>
        ) : null}
      </div>
    );
  }

  // Drawer variant — Fix: root element is now `relative` so the FavoriteStar
  // can sit inside the card without an outer wrapper distorting the drawer
  // grid's flex sizing.
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClick(skill)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(skill); } }}
      className="relative bg-panel border border-edge-dim rounded-lg p-3 text-left hover:bg-inset hover:border-edge transition-colors flex flex-col cursor-pointer"
    >
      {favorite && (
        <FavoriteStar corner size="sm" filled={favorite.filled} onToggle={favorite.onToggle} />
      )}
      <span className="text-sm font-medium text-fg leading-tight">{skill.displayName}</span>
      <span className="text-[11px] text-fg-muted mt-1 leading-snug line-clamp-2 flex-1">{skill.description}</span>
      {chipRow}
      <span className={`text-[9px] font-medium px-1 py-0.5 rounded-sm mt-2 self-start ${
        skill.source === 'youcoded-core' ? sourceBadgeStyles['youcoded-core'] :
        typeBadgeStyles[skill.type] || sourceBadgeStyles.plugin
      }`}>
        {skill.source === 'youcoded-core' ? 'YC' : typeLabels[skill.type] || 'Plugin'}
      </span>
    </div>
  );
}
```

Key changes from the current version:
- Root becomes `<div role="button">` with `relative` class in both variants (drawer variant was `<button>` before). This matches the pattern MarketplaceCard already uses to avoid nested `<button>` with `FavoriteStar`.
- Optional `favorite?: { filled, onToggle }` prop; when set, renders `<FavoriteStar corner size="sm" />` inside the card.
- Optional `chipSkills` + `onChipClick` for multi-skill plugin tiles.

- [ ] **Step 2: Verify types compile**

Run: `cd youcoded/desktop && npx tsc -p tsconfig.json --noEmit`
Expected: TS may complain about any call sites passing props SkillCard no longer accepts. None expected from the current tree (SkillCard consumers are CommandDrawer and the search-commands view — both pass only `skill` and `onClick`). If errors appear, fix the call site.

- [ ] **Step 3: Commit**

```bash
git add desktop/src/renderer/components/SkillCard.tsx
git commit -m "refactor(SkillCard): internal favorite star + chip row props

Root is now a div role=button with relative positioning so FavoriteStar
can overlay the tile without an outer wrapper distorting the grid."
```

---

## Task 6: Update CommandDrawer to use `installedPlugins` and drop the outer wrapper

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/CommandDrawer.tsx`

- [ ] **Step 1: Swap the data source and rendering helpers**

In `CommandDrawer.tsx`, update the imports at the top:

```tsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { SkillEntry, InstalledPluginGroup } from '../../shared/types';
import SkillCard from './SkillCard';
import { useSkills } from '../state/skill-context';
import { useMarketplace } from '../state/marketplace-context';
import { useScrollFade } from '../hooks/useScrollFade';
```

(Remove the `FavoriteStar` import — it's no longer used directly here.)

- [ ] **Step 2: Inside the component, pull `installedPlugins` from marketplace-context and replace `renderDrawerCard`**

Right under `const { drawerSkills, favorites, setFavorite } = useSkills();`, add:

```tsx
  const mp = useMarketplace();
  const installedPlugins = mp.installedPlugins;
```

Replace `renderDrawerCard`:

```tsx
  // Browse mode: render one card per plugin group. Multi-skill plugins show
  // their bundled skills as chips; clicking a chip invokes that specific skill.
  // Clicking the card itself invokes the plugin's top-level prompt when one is
  // defined, otherwise falls through to the first skill. The favorite star
  // lives inside SkillCard so it doesn't distort the grid.
  const renderPluginCard = (group: InstalledPluginGroup) => {
    const isFav = skillFavSet.has(group.id);
    const favoriteProps = {
      filled: isFav,
      onToggle: () => setFavorite(group.id, !isFav),
    };

    const chipSkills = group.skills.length > 1
      ? group.skills.map(s => ({ id: s.id, displayName: s.displayName }))
      : undefined;

    const skillById = new Map(group.skills.map(s => [s.id, s]));

    const handleCardClick = () => {
      // Single-skill plugin → invoke that skill.
      if (group.skills.length === 1) {
        onSelect(group.skills[0]);
        return;
      }
      // Multi-skill plugin with a plugin-level prompt → invoke it.
      if (group.prompt) {
        onSelect(group as SkillEntry);
        return;
      }
      // Multi-skill, no top-level prompt → route to marketplace detail.
      onClose();
      onOpenMarketplace();
    };

    const handleChipClick = (chipId: string) => {
      const skill = skillById.get(chipId);
      if (skill) onSelect(skill);
    };

    return (
      <SkillCard
        key={group.id}
        skill={group as SkillEntry}
        onClick={handleCardClick}
        favorite={favoriteProps}
        chipSkills={chipSkills}
        onChipClick={handleChipClick}
      />
    );
  };

  // Search mode keeps skill-level cards but ALSO surfaces plugin groups whose
  // name/description matches the query (see Task 7 for the mixed-results path).
  const renderSkillCard = (skill: SkillEntry) => {
    const isFav = skillFavSet.has(skill.id) || (skill.pluginName != null && skillFavSet.has(skill.pluginName));
    const favId = skill.pluginName && skillFavSet.has(skill.pluginName) ? skill.pluginName : skill.id;
    return (
      <SkillCard
        key={skill.id}
        skill={skill}
        onClick={onSelect}
        favorite={{ filled: isFav, onToggle: () => setFavorite(favId, !isFav) }}
      />
    );
  };
```

- [ ] **Step 3: Update the browse-mode rendering to iterate `installedPlugins`**

Update `categoryFiltered` / `favsSorted` / `othersSorted` to operate on `installedPlugins`:

```tsx
  const pluginCategoryFiltered = useMemo(() => {
    if (isSearching) return installedPlugins;
    if (!categoryFilter) return installedPlugins;
    return installedPlugins.filter(g => (g.category ?? 'other') === categoryFilter);
  }, [installedPlugins, categoryFilter, isSearching]);

  const pluginFavs = useMemo(() =>
    pluginCategoryFiltered
      .filter(g => skillFavSet.has(g.id))
      .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [pluginCategoryFiltered, skillFavSet],
  );

  const pluginOthers = useMemo(() =>
    pluginCategoryFiltered
      .filter(g => !skillFavSet.has(g.id))
      .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [pluginCategoryFiltered, skillFavSet],
  );
```

- [ ] **Step 4: Rewire the browse-mode JSX**

Replace the previous `favsSorted.map(renderDrawerCard)` / `othersSorted.map(renderDrawerCard)` lines with `pluginFavs.map(renderPluginCard)` / `pluginOthers.map(renderPluginCard)`.

- [ ] **Step 5: Point the search branch at `renderSkillCard`**

The old `renderDrawerCard` helper is gone, so the search-mode JSX (still skill-level for now; Task 7 makes it mixed) must call the new `renderSkillCard` helper instead. Find the search branch (inside `{isSearching ? (`) and change `searchFiltered.map((skill) => renderDrawerCard(skill))` to `searchFiltered.map(renderSkillCard)`.

Also delete the old `favsSorted` and `othersSorted` useMemos — they're superseded by `pluginFavs` / `pluginOthers` and no longer referenced.

- [ ] **Step 6: Verify compile**

Run: `cd youcoded/desktop && npx tsc -p tsconfig.json --noEmit`
Expected: no type errors.

- [ ] **Step 7: Commit**

```bash
git add desktop/src/renderer/components/CommandDrawer.tsx
git commit -m "feat(drawer): group installed skills by plugin in browse mode

Browse surface shows one card per plugin; multi-skill plugins render
their bundled skills as clickable chips. Drops the outer wrapper div
that was causing uneven drawer tile sizing."
```

---

## Task 7: CommandDrawer mixed search results

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/CommandDrawer.tsx`

The search path today filters `drawerSkills` (flat individual skills). Spec §6: search matches BOTH individual skills and whole plugins.

- [ ] **Step 1: Replace the search filter with a mixed builder**

Find `searchFiltered` and replace with this plus a helper type:

```tsx
  type SearchResult =
    | { kind: 'skill'; skill: SkillEntry }
    | { kind: 'plugin'; group: InstalledPluginGroup };

  const searchResults = useMemo<SearchResult[]>(() => {
    if (!isSearching) return [];
    const q = effectiveQuery.toLowerCase();
    const skillHits: SearchResult[] = drawerSkills
      .filter(s =>
        s.displayName.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q),
      )
      .map(s => ({ kind: 'skill', skill: s }));
    const pluginHits: SearchResult[] = installedPlugins
      .filter(g =>
        g.displayName.toLowerCase().includes(q) ||
        g.description.toLowerCase().includes(q),
      )
      .map(g => ({ kind: 'plugin', group: g }));
    // Plugins first so a direct plugin-name match outranks its skills.
    return [...pluginHits, ...skillHits];
  }, [drawerSkills, installedPlugins, effectiveQuery, isSearching]);
```

- [ ] **Step 2: Render the mixed results**

Replace the previous `searchFiltered.map(renderDrawerCard)` block with:

```tsx
              {searchResults.map((r) =>
                r.kind === 'plugin' ? renderPluginCard(r.group) : renderSkillCard(r.skill),
              )}
```

- [ ] **Step 3: Verify compile**

Run: `cd youcoded/desktop && npx tsc -p tsconfig.json --noEmit`
Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add desktop/src/renderer/components/CommandDrawer.tsx
git commit -m "feat(drawer): mixed skill/plugin results in search mode

Plugin-level matches (displayName/description hit) appear alongside
individual skill matches in search results, with plugin hits ranked
first so a plugin-name query outranks its nested skills."
```

---

## Task 8: Update Library Skills tab to use `installedPlugins`

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/library/LibraryScreen.tsx`

- [ ] **Step 1: Swap the Skills-tab data source**

Find the Skills-tab block (`{tab === 'skills' && (`). Replace the two `mp.installedSkills` call sites with `mp.installedPlugins` and rename `renderSkillCard` calls accordingly.

The `renderSkillCard` helper currently takes `s: SkillEntry`. `InstalledPluginGroup extends SkillEntry`, so the existing helper works without rewriting — just pass the plugin group directly. Example:

```tsx
        {tab === 'skills' && (
          <>
            <Section title="Favorites" empty="No favorites yet — tap the star on any installed skill.">
              {mp.installedPlugins.filter(p => favSet.has(p.id)).length > 0 && (
                <MarketplaceGrid>
                  {mp.installedPlugins.filter(p => favSet.has(p.id)).map(renderSkillCard)}
                </MarketplaceGrid>
              )}
            </Section>
            <Section title="Installed" empty="Install something from the marketplace to see it here.">
              {mp.installedPlugins.filter(p => !favSet.has(p.id)).length > 0 && (
                <MarketplaceGrid>
                  {mp.installedPlugins.filter(p => !favSet.has(p.id)).map(renderSkillCard)}
                </MarketplaceGrid>
              )}
            </Section>
          </>
        )}
```

The Updates tab keeps using `mp.installedSkills` because update detection is still per-skill.

- [ ] **Step 2: Verify compile**

Run: `cd youcoded/desktop && npx tsc -p tsconfig.json --noEmit`
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add desktop/src/renderer/components/library/LibraryScreen.tsx
git commit -m "feat(library): Skills tab shows one card per plugin

Grouped view replaces the per-skill flat list. Updates tab still uses
installedSkills because update detection stays skill-level."
```

---

## Task 9: Create `InstallFavoriteCorner` primitive

**Files:**
- Create: `youcoded/desktop/src/renderer/components/marketplace/InstallFavoriteCorner.tsx`

- [ ] **Step 1: Write the component**

Create the file:

```tsx
import React, { useEffect, useState } from 'react';
import FavoriteStar from './FavoriteStar';

const BRAILLE_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

interface Props {
  installed: boolean;
  installing: boolean;
  favorited: boolean;
  onInstall: () => void;
  onToggleFavorite: () => void;
}

/**
 * Three-state corner affordance for marketplace tiles.
 *   not installed  → download arrow (click installs)
 *   installing     → braille spinner (click disabled)
 *   installed      → FavoriteStar (click toggles favorite)
 *
 * All three states share the same top-right coordinates so swapping between
 * them does not shift surrounding card content.
 */
export default function InstallFavoriteCorner({
  installed, installing, favorited, onInstall, onToggleFavorite,
}: Props) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!installing) return;
    const id = setInterval(() => setFrame(f => (f + 1) % BRAILLE_FRAMES.length), 80);
    return () => clearInterval(id);
  }, [installing]);

  if (installed) {
    return (
      <FavoriteStar
        corner
        size="sm"
        filled={favorited}
        onToggle={onToggleFavorite}
      />
    );
  }

  if (installing) {
    return (
      <span
        role="status"
        aria-label="Installing"
        className="absolute top-1.5 right-1.5 bg-panel/80 backdrop-blur-sm p-1 rounded-md text-accent font-mono text-sm leading-none select-none"
      >
        {BRAILLE_FRAMES[frame]}
      </span>
    );
  }

  // Not installed — download affordance.
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onInstall(); }}
      aria-label="Install"
      title="Install"
      className="absolute top-1.5 right-1.5 bg-panel/80 backdrop-blur-sm p-1 rounded-md text-fg-dim hover:text-fg transition-colors"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
    </button>
  );
}
```

- [ ] **Step 2: Verify compile**

Run: `cd youcoded/desktop && npx tsc -p tsconfig.json --noEmit`
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add desktop/src/renderer/components/marketplace/InstallFavoriteCorner.tsx
git commit -m "feat(marketplace): InstallFavoriteCorner three-state primitive"
```

---

## Task 10: Wire `InstallFavoriteCorner` into MarketplaceCard + fix badge z-order + integrations props

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/marketplace/MarketplaceCard.tsx`

- [ ] **Step 1: Swap the corner affordance, add integration props**

Replace the full contents of `MarketplaceCard.tsx` with:

```tsx
// Unified card for skill + theme + plugin discovery. Corner affordance
// cycles through three states (install / installing / favorited) via
// InstallFavoriteCorner; integrations render through the same component via
// optional iconUrl + accentColor props (no separate IntegrationCard).

import React, { useState } from "react";
import type { SkillEntry, SkillComponents } from "../../../shared/types";
import type { ThemeRegistryEntryWithStatus } from "../../../shared/theme-marketplace-types";
import { useMarketplaceStats } from "../../state/marketplace-stats-context";
import { useMarketplace } from "../../state/marketplace-context";
import StarRating from "./StarRating";
import InstallFavoriteCorner from "./InstallFavoriteCorner";

export type MarketplaceCardEntry =
  | { kind: "skill"; entry: SkillEntry }
  | { kind: "theme"; entry: ThemeRegistryEntryWithStatus };

interface Props {
  item: MarketplaceCardEntry;
  onOpen(): void;
  installed?: boolean;
  updateAvailable?: boolean;
  /** Optional custom icon (integrations). Renders top-left inside the tile. */
  iconUrl?: string;
  /** Optional accent border color (integrations). */
  accentColor?: string;
  /** Integrations handle install/connect through their own flow (handleIntegration
   *  routed via onOpen) — hide the corner download/favorite affordance in that case. */
  suppressCorner?: boolean;
}

function componentSummary(c: SkillComponents | null | undefined): string | null {
  if (!c) return null;
  const parts: string[] = [];
  if (c.skills.length) parts.push(`${c.skills.length} skill${c.skills.length > 1 ? "s" : ""}`);
  if (c.commands.length) parts.push(`${c.commands.length} command${c.commands.length > 1 ? "s" : ""}`);
  if (c.hooks.length || c.hasHooksManifest) parts.push(`${c.hooks.length || "manifest"} hook${c.hooks.length === 1 ? "" : "s"}`);
  if (c.agents.length) parts.push(`${c.agents.length} agent${c.agents.length > 1 ? "s" : ""}`);
  if (c.mcpServers.length || c.hasMcpConfig) parts.push("MCP");
  return parts.join(" · ") || null;
}

export default function MarketplaceCard({ item, onOpen, installed, updateAvailable, iconUrl, accentColor, suppressCorner }: Props) {
  const stats = useMarketplaceStats();
  const mp = useMarketplace();
  const kind = item.kind;
  const installKey = kind === "theme" ? `theme:${item.entry.slug}` : item.entry.id;
  const isInstalling = mp.installingIds.has(installKey);
  const isFavorited =
    kind === "theme"
      ? mp.themeFavorites.includes(item.entry.slug)
      : mp.favorites.includes(item.entry.id);
  const isInstalled = !!installed;
  const [iconFailed, setIconFailed] = useState(false);

  const toggleFavorite = () => {
    if (kind === "theme") mp.favoriteTheme(item.entry.slug, !isFavorited).catch(() => {});
    else mp.setFavorite(item.entry.id, !isFavorited).catch(() => {});
  };

  const install = () => {
    if (kind === "theme") mp.installTheme(item.entry.slug).catch(() => {});
    else mp.installSkill(item.entry.id).catch(() => {});
  };

  const id = item.kind === "skill" ? item.entry.id : `theme:${item.entry.slug}`;
  const pluginStats = item.kind === "skill" ? stats.plugins[item.entry.id] : undefined;
  const themeStats = item.kind === "theme" ? stats.themes[item.entry.slug] : undefined;
  const installs = pluginStats?.installs ?? 0;
  const rating = pluginStats?.rating;
  const ratingCount = pluginStats?.review_count ?? 0;
  const likes = themeStats?.likes ?? 0;

  const title = item.kind === "skill" ? item.entry.displayName : item.entry.name;
  const author = item.kind === "skill" ? (item.entry.author || "") : (item.entry.author || "");
  const themePreviewUrl = item.kind === "theme" ? item.entry.preview : undefined;
  const blurb = item.kind === "skill"
    ? (item.entry.tagline || item.entry.description || "")
    : (item.entry.description || "");
  const peek = item.kind === "skill" ? componentSummary(item.entry.components) : null;

  const showIcon = !!iconUrl && !iconFailed;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      className="relative layer-surface text-left flex flex-col overflow-hidden transition-transform duration-200 hover:scale-[1.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      data-marketplace-card={id}
      style={accentColor ? { borderColor: accentColor } : undefined}
    >
      {/* Corner affordance — install → spinner → favorite star, all at the
          same absolute coordinates. Themes skip the install affordance so the
          corner is only wired for skills. Integrations opt out entirely via
          suppressCorner since their install/connect flow goes through onOpen. */}
      {!suppressCorner && (
        kind === "skill" ? (
          <InstallFavoriteCorner
            installed={isInstalled}
            installing={isInstalling}
            favorited={isFavorited}
            onInstall={install}
            onToggleFavorite={toggleFavorite}
          />
        ) : (
          isInstalled && (
            <InstallFavoriteCorner
              installed
              installing={isInstalling}
              favorited={isFavorited}
              onInstall={install}
              onToggleFavorite={toggleFavorite}
            />
          )
        )
      )}
      {themePreviewUrl && (
        <img
          src={themePreviewUrl}
          alt=""
          loading="lazy"
          className="w-full h-36 object-cover border-b border-edge-dim"
        />
      )}
      <div className="p-4 flex flex-col gap-2 flex-1">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-3 min-w-0">
          {/* Integration icon — renders alongside the title, not the corner,
              so it never collides with the install/favorite affordance. */}
          {showIcon && (
            <div className="w-8 h-8 rounded-md shrink-0 overflow-hidden bg-inset flex items-center justify-center">
              <img
                src={iconUrl!}
                alt=""
                className="w-full h-full object-contain"
                onError={() => setIconFailed(true)}
              />
            </div>
          )}
          <div className="min-w-0">
            <h3 className="font-medium text-fg truncate">{title}</h3>
            {author && <p className="text-xs text-fg-dim truncate">{author}</p>}
          </div>
        </div>
        {/* Status badge — z-10 keeps it above the corner star overlay so
            Installed/Update reads fully rather than being clipped by the
            corner affordance. */}
        {(isInstalling || updateAvailable || isInstalled) && (
          <span
            className={`relative z-10 text-[10px] uppercase tracking-wide shrink-0 mt-0.5 px-2 py-0.5 rounded-full ${
              isInstalling
                ? 'text-accent border border-accent/50 bg-accent/10 animate-pulse'
                : updateAvailable
                  ? 'text-fg-dim'
                  : 'text-fg-dim'
            }`}
          >
            {isInstalling ? 'Installing…' : updateAvailable ? 'Update' : 'Installed'}
          </span>
        )}
      </div>
      {blurb && <p className="text-sm text-fg-2 line-clamp-2">{blurb}</p>}
      <div className="mt-auto flex items-center gap-3 text-xs text-fg-dim pt-1">
        {rating != null && ratingCount > 0 && (
          <StarRating value={rating} count={ratingCount} size="sm" />
        )}
        {installs > 0 && <span>{installs.toLocaleString()} installs</span>}
        {likes > 0 && <span>{likes.toLocaleString()} likes</span>}
        {peek && <span className="text-fg-muted truncate">{peek}</span>}
      </div>
      </div>
    </div>
  );
}
```

Key changes:
- `InstallFavoriteCorner` replaces the old `{isInstalled && <FavoriteStar />}` block.
- New `iconUrl` + `accentColor` props with top-left icon rendering (used by integrations).
- `Installed/Update/Installing` badge gets `relative z-10` so it stays fully visible above the corner star.
- The old inline `InstallingPill` import is gone; the status badge absorbs the "Installing…" state inline.

- [ ] **Step 2: Remove the stale `InstallingPill` import if present elsewhere**

Grep for `InstallingPill` usage:

```bash
cd youcoded/desktop && grep -rn "InstallingPill" src/
```

Expected: only the file `src/renderer/components/marketplace/InstallingPill.tsx` itself remains. Leave the primitive file in place — it's fine as a helper for any other contexts.

- [ ] **Step 3: Verify compile**

Run: `cd youcoded/desktop && npx tsc -p tsconfig.json --noEmit`
Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add desktop/src/renderer/components/marketplace/MarketplaceCard.tsx
git commit -m "feat(marketplace): install-state corner + integration-style props

Corner affordance now cycles download → spinner → favorite via the new
InstallFavoriteCorner primitive. Status badge z-10'd so Installed/Update
read fully. iconUrl and accentColor props support integration tiles."
```

---

## Task 11: Swap integrations rail to use `MarketplaceCard` and delete `IntegrationCard`

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/marketplace/MarketplaceScreen.tsx`
- Delete: `youcoded/desktop/src/renderer/components/marketplace/IntegrationCard.tsx`

- [ ] **Step 1: Update the integrations rail rendering**

In `MarketplaceScreen.tsx`, locate the integrations rail (around line 252). Replace the `IntegrationCard` usage:

```tsx
            {integrations.length > 0 && (
              <MarketplaceRail title="Connect your stuff" description="Bring your data in.">
                {integrations.map((item) => {
                  // Integrations expose iconUrl as a path relative to the
                  // marketplace repo's /integrations/ dir; we resolve to the
                  // same raw.githubusercontent.com base used elsewhere.
                  const MARKETPLACE_BRANCH = "master";
                  const ICON_BASE = `https://raw.githubusercontent.com/itsdestin/wecoded-marketplace/${MARKETPLACE_BRANCH}/integrations`;
                  const resolvedIcon = item.iconUrl ? `${ICON_BASE}/${item.iconUrl}` : undefined;

                  // Shape an SkillEntry-compatible item for MarketplaceCard.
                  // Integrations carry the same install/favorite flow as any
                  // plugin; the detail overlay handles the OAuth/Connect step.
                  const skillLike: SkillEntry = {
                    id: item.slug,
                    displayName: item.displayName,
                    description: item.tagline || '',
                    category: 'integrations',
                    prompt: `/${item.slug}`,
                    source: 'marketplace',
                    type: 'plugin',
                    visibility: 'published',
                  } as SkillEntry;

                  return (
                    <div key={item.slug} className="shrink-0 !w-[min(360px,90vw)]">
                      <MarketplaceCard
                        item={{ kind: "skill", entry: skillLike }}
                        installed={!!item.state.installed}
                        iconUrl={resolvedIcon}
                        accentColor={item.accentColor}
                        suppressCorner
                        onOpen={() => handleIntegration(item)}
                      />
                    </div>
                  );
                })}
              </MarketplaceRail>
            )}
```

- [ ] **Step 2: Remove the now-unused `IntegrationCard` import**

Delete the `import IntegrationCard from ...` line at the top of `MarketplaceScreen.tsx` if present.

- [ ] **Step 3: Delete the `IntegrationCard` component file**

```bash
rm desktop/src/renderer/components/marketplace/IntegrationCard.tsx
```

- [ ] **Step 4: Verify nothing else imports `IntegrationCard`**

```bash
cd youcoded/desktop && grep -rn "IntegrationCard" src/
```

Expected: no matches.

- [ ] **Step 5: Verify compile**

Run: `cd youcoded/desktop && npx tsc -p tsconfig.json --noEmit`
Expected: no type errors.

- [ ] **Step 6: Commit**

```bash
git add desktop/src/renderer/components/marketplace/MarketplaceScreen.tsx
git rm desktop/src/renderer/components/marketplace/IntegrationCard.tsx
git commit -m "refactor(integrations): render through MarketplaceCard

Retires IntegrationCard. Integrations now use the same vertical tile
layout as other plugins (iconUrl + accentColor props), and the
click-to-expand detail overlay, while keeping their dedicated rail."
```

---

## Task 12: Manual browser verification

**Files:**
- None — runtime verification only

- [ ] **Step 1: Start the dev app**

From the workspace root:

```bash
cd /c/Users/desti/youcoded-dev
bash scripts/run-dev.sh
```

This launches the "YouCoded Dev" window on shifted ports so the built app can stay open.

- [ ] **Step 2: Verify CommandDrawer browse**

- Open the CommandDrawer (press `/` or click the compass).
- Check: tiles are uniformly sized in a regular grid. Favorite star overlays the top-right of each tile without shifting tile content.
- Check: multi-skill plugins (e.g. Encyclopedia) show **one** card with a row of skill-name chips beneath the description. Single-skill plugins (e.g. Civic Report) show no chip row.
- Click a chip → chat input receives that skill's prompt.
- Click a multi-skill plugin's card body → with a plugin-level prompt: invokes it. Without one: drawer closes and the marketplace opens.
- Click a single-skill plugin's card body → invokes that skill.

- [ ] **Step 3: Verify CommandDrawer search**

- Type `/enc` in the input bar (search mode). Expected: Encyclopedia plugin appears once as a plugin card (plugin-name match) PLUS any skills whose name/description contain "enc" appear as individual skill cards.
- Plugin match is ranked above skill matches.

- [ ] **Step 4: Verify Library Skills tab**

- Open Library → Skills.
- Check: installed plugins render as one card each. Encyclopedia is one tile, not five.
- Favorites section and Installed section both group by plugin.
- Click a plugin card → MarketplaceDetailOverlay opens showing the plugin detail with "What's inside" listing bundled skills.

- [ ] **Step 5: Verify marketplace install affordance**

- Open the Marketplace.
- Find a not-yet-installed skill tile. Confirm the top-right corner shows a download-arrow icon (not a star).
- Click the download icon. Confirm: icon swaps to a rotating braille spinner. Button becomes non-interactive.
- When install completes, confirm: spinner swaps to an **unfavorited** FavoriteStar (outline, not filled). Click it — it fills (favorited). Click again — it un-fills.
- Confirm: the "Installed" badge (top-right-ish, inline with the title row) remains fully visible and is NOT occluded by the corner star.

- [ ] **Step 6: Verify integrations parity**

- Marketplace → "Connect your stuff" rail at the top.
- Check: integration tiles use the same vertical card layout as plugin tiles (NOT the old horizontal logo-left layout).
- Custom icon still renders (top-left inside the tile).
- Accent color still applied as the border.
- Click an integration tile → behaves like any other plugin (opens detail overlay or triggers the existing connect/open-settings flow via `handleIntegration`).

- [ ] **Step 7: Stop the dev app**

Close the YouCoded Dev window.

- [ ] **Step 8: If every manual check passed, commit an empty marker**

```bash
git commit --allow-empty -m "chore: manual QA pass for drawer+marketplace polish"
```

---

## Task 13: Full test + type + lint verification

**Files:**
- None — verification only

- [ ] **Step 1: Run the test suite**

Run: `cd youcoded/desktop && npm test -- --run`
Expected: all tests pass, including the new `plugin-grouping` tests.

- [ ] **Step 2: Run typecheck**

Run: `cd youcoded/desktop && npx tsc -p tsconfig.json --noEmit`
Expected: no errors.

- [ ] **Step 3: Run the release build (optional but recommended)**

Run: `cd youcoded/desktop && npm run build`
Expected: build succeeds.

---

## Task 14: Merge and clean up

**Files:**
- None — git management

- [ ] **Step 1: Merge the feature branch to master**

From inside the worktree:

```bash
cd /c/Users/desti/youcoded-dev/youcoded/.worktrees/drawer-mkt-polish
git log --oneline master..feat/drawer-mkt-polish  # review what's going in
cd /c/Users/desti/youcoded-dev/youcoded
git checkout master
git merge --no-ff feat/drawer-mkt-polish -m "Merge feat/drawer-mkt-polish: drawer & marketplace polish + plugin grouping"
git push origin master
```

- [ ] **Step 2: Remove the worktree and delete the branch**

```bash
git worktree remove .worktrees/drawer-mkt-polish
git branch -D feat/drawer-mkt-polish
```

- [ ] **Step 3: Verify cleanup**

Run: `git worktree list` and `git branch --list feat/drawer-mkt-polish`
Expected: worktree removed; branch gone.
