---
status: active
---

# Settings Panel Card Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flatten YouCoded's Settings panel from grouped sections with uppercase headers into one uniform list of icon/title/subtitle/chevron cards, and convert the Buddy Floater checkbox to the same row-opens-popup pattern as every other setting.

**Architecture:** Extract the row markup that's currently copy-pasted ~12 times into one shared presentational `SettingsRow` component, then mechanically convert each existing row (in `SettingsPanel.tsx`, `AccountSection.tsx`, `SyncPanel.tsx`, `ModelProvidersPopup.tsx`, `PerformanceButton.tsx`) to use it and drop its `<h3>` section header. Three rows (Appearance, Remote Access, Buddy Floater) currently use a *dynamic value* as the title with no separate label — those get a static title with the dynamic value moved to the subtitle. Popup internals are untouched.

**Tech Stack:** Electron + React (TypeScript, functional components + hooks), Tailwind utility classes, Vitest.

**Design doc:** `docs/active/specs/2026-07-15-settings-panel-card-redesign-design.md`

---

## Before you start

This is a pure UI/markup restructuring — no new IPC, no new state, no business-logic changes (the one exception is Remote Access's subtitle string, which gets a small, intentional tweak described in Task 9). There is **no existing component-level test coverage** for any of the five files this plan touches (confirmed: `SettingsPanel.tsx`, `AccountSection.tsx`, `SyncPanel.tsx`, `ModelProvidersPopup.tsx`, `PerformanceButton.tsx` have zero test files, and only ~4 of 143 renderer components in this codebase have RTL render tests at all). Per-task verification is therefore **type-check + build**, not red/green unit tests — introducing a new component-test pattern for a pure-markup change would be scope creep beyond what this refactor needs. The final task does full manual visual verification via the dev server, plus a regression run of the existing `npm test` suite.

**Deviation from the design doc, called out explicitly:** the design doc's mapping table listed "Backup & Sync" and "Package Tier" as already matching the target format ("unchanged"). Re-reading the actual code while writing this plan found both are additional instances of the same "dynamic value used as title" pattern the design doc identified for Appearance/Buddy/Remote Access — `SyncSection`'s title is `{primaryLabel}` (e.g. "All synced"), not a static "Backup & Sync" label, and `TierSelector`'s title is `{currentTier.name}` (e.g. "Developer Essentials"), not a static "Package Tier" label. Tasks 4 and 11 fix these the same way as Appearance/Buddy/Remote Access, to actually satisfy the design's stated goal ("every card gets the same shape: static title + subtitle"). Flag this to Destin when the plan is reviewed.

---

## File Structure

| File | Change |
|---|---|
| `youcoded/desktop/src/renderer/components/SettingsRow.tsx` | **Create.** Shared presentational row: icon, title, subtitle, optional `rightAccessory`, chevron, `onClick`. |
| `youcoded/desktop/src/renderer/components/PerformanceButton.tsx` | Modify. Performance row → `SettingsRow`, title "Graphics" → "Performance", header removed. |
| `youcoded/desktop/src/renderer/components/AccountSection.tsx` | Modify. Account row → `SettingsRow`, header removed. |
| `youcoded/desktop/src/renderer/components/SyncPanel.tsx` | Modify. Backup & Sync row → `SettingsRow` (static title, dynamic subtitle, badge as `rightAccessory`), header removed. |
| `youcoded/desktop/src/renderer/components/ModelProvidersPopup.tsx` | Modify. Model Providers row → `SettingsRow`, header removed. |
| `youcoded/desktop/src/renderer/components/SettingsPanel.tsx` | Modify (9 tasks). Appearance, Buddy Floater, Sound, Remote Access, Defaults, Package Tier, Connect to Desktop rows → `SettingsRow`; "Other" section wrappers removed on both Desktop and Android; outer `space-y-6` → `space-y-2`. |

---

### Task 0: Set up the worktree

This touches 5 files with ~15 sequential edits — per workspace convention ("Use worktrees for non-trivial work"), do this in an isolated worktree, not the main `youcoded` checkout.

- [ ] **Step 1: Create the worktree**

```bash
cd "C:\Users\desti\youcoded-dev\youcoded"
git fetch origin
git worktree add "../youcoded-worktrees/settings-panel-cards" -b feat/settings-panel-cards origin/master
```

- [ ] **Step 2: Junction `node_modules` from the main checkout**

Matches this project's established worktree convention (see workspace `CLAUDE.md` → "`git worktree remove` follows junctions on Windows") — avoids a full `npm install` per worktree.

```bash
cmd //c "mklink /J \"C:\Users\desti\youcoded-dev\youcoded-worktrees\settings-panel-cards\desktop\node_modules\" \"C:\Users\desti\youcoded-dev\youcoded\desktop\node_modules\""
```

- [ ] **Step 3: Verify a clean baseline**

```bash
cd "C:\Users\desti\youcoded-dev\youcoded-worktrees\settings-panel-cards\desktop"
npx tsc --noEmit
npm test -- --run
```

Expected: `tsc` exits 0, all existing tests pass. If either fails, stop and report — don't attribute pre-existing failures to this plan's changes.

All subsequent tasks run from `C:\Users\desti\youcoded-dev\youcoded-worktrees\settings-panel-cards\desktop`.

---

### Task 1: Create the shared `SettingsRow` component

**Files:**
- Create: `youcoded/desktop/src/renderer/components/SettingsRow.tsx`

- [ ] **Step 1: Write the component**

```tsx
import React from 'react';

interface SettingsRowProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  // Overrides the default text-fg-muted subtitle color — e.g. Android's
  // "Connect to Desktop" row turns its subtitle green while connected.
  subtitleClassName?: string;
  onClick: () => void;
  // Extra content between the subtitle and the chevron — e.g. Backup & Sync's
  // status badge.
  rightAccessory?: React.ReactNode;
}

// Shared settings-list row: icon + title + subtitle + chevron. Every row in
// the Settings panel used to copy-paste this markup (~12 times across
// SettingsPanel.tsx, AccountSection.tsx, SyncPanel.tsx, ModelProvidersPopup.tsx,
// PerformanceButton.tsx) — this is the single source of truth so future style
// changes are one edit instead of a dozen. Presentational only: callers own
// their own open/popup state and render the popup as a sibling.
// See docs/active/specs/2026-07-15-settings-panel-card-redesign-design.md.
export default function SettingsRow({ icon, title, subtitle, subtitleClassName, onClick, rightAccessory }: SettingsRowProps) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-inset/50 hover:bg-inset transition-colors text-left"
    >
      <div className="flex items-center justify-center shrink-0" style={{ width: 32, height: 20 }}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-xs text-fg font-medium">{title}</span>
        {subtitle && <p className={`text-[10px] truncate ${subtitleClassName ?? 'text-fg-muted'}`}>{subtitle}</p>}
      </div>
      {rightAccessory}
      <svg className="w-3.5 h-3.5 text-fg-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: exits 0 (the file isn't imported anywhere yet, so this just confirms the new file itself is valid TypeScript).

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/SettingsRow.tsx
git commit -m "feat(settings): add shared SettingsRow component"
```

---

### Task 2: Convert `PerformanceButton.tsx`

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/PerformanceButton.tsx`

- [ ] **Step 1: Add the import**

Find:
```tsx
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { usePerformanceConfig } from '../hooks/usePerformanceConfig';
import PerformancePopup from './PerformancePopup';
```

Replace:
```tsx
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { usePerformanceConfig } from '../hooks/usePerformanceConfig';
import PerformancePopup from './PerformancePopup';
import SettingsRow from './SettingsRow';
```

- [ ] **Step 2: Replace the row + section wrapper**

Find:
```tsx
  return (
    <section>
      <h3 className="text-[10px] font-medium text-fg-muted tracking-wider uppercase mb-3">Performance</h3>

      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-inset/50 hover:bg-inset transition-colors text-left"
      >
        {/* Simple CPU/chip glyph — no real semantic image fits "GPU pref" cleanly,
            so a generic chip icon is the cleanest visual cue. */}
        <div className="flex items-center justify-center shrink-0" style={{ width: 32, height: 20 }}>
          <svg className="w-4 h-4 text-fg-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="4" width="16" height="16" rx="2" />
            <rect x="9" y="9" width="6" height="6" />
            <line x1="9" y1="2" x2="9" y2="4" />
            <line x1="15" y1="2" x2="15" y2="4" />
            <line x1="9" y1="20" x2="9" y2="22" />
            <line x1="15" y1="20" x2="15" y2="22" />
            <line x1="2" y1="9" x2="4" y2="9" />
            <line x1="2" y1="15" x2="4" y2="15" />
            <line x1="20" y1="9" x2="22" y2="9" />
            <line x1="20" y1="15" x2="22" y2="15" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-xs text-fg font-medium">Graphics</span>
          <p className="text-[10px] text-fg-muted">{stateLabel}{cfg.needsRestart ? ' · restart pending' : ''}</p>
        </div>
        <svg className="w-3.5 h-3.5 text-fg-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* Portal to document.body so the popup centers over the full viewport.
          SettingsPanel's outer wrapper has a transform/filter that creates a
          containing block for position:fixed descendants — without the portal,
          the popup would center inside the panel instead of the viewport. Same pattern as
          ThemeButton, SoundButton, RemoteButton. */}
      {open && createPortal(
        <PerformancePopup
          onClose={() => setOpen(false)}
          saved={cfg.saved}
          gpuList={cfg.gpuList}
          needsRestart={cfg.needsRestart}
          setPreferPowerSaving={cfg.setPreferPowerSaving}
          restart={cfg.restart}
        />,
        document.body,
      )}
    </section>
  );
```

Replace:
```tsx
  return (
    <>
      <SettingsRow
        // Simple CPU/chip glyph — no real semantic image fits "GPU pref" cleanly,
        // so a generic chip icon is the cleanest visual cue.
        icon={
          <svg className="w-4 h-4 text-fg-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="4" width="16" height="16" rx="2" />
            <rect x="9" y="9" width="6" height="6" />
            <line x1="9" y1="2" x2="9" y2="4" />
            <line x1="15" y1="2" x2="15" y2="4" />
            <line x1="9" y1="20" x2="9" y2="22" />
            <line x1="15" y1="20" x2="15" y2="22" />
            <line x1="2" y1="9" x2="4" y2="9" />
            <line x1="2" y1="15" x2="4" y2="15" />
            <line x1="20" y1="9" x2="22" y2="9" />
            <line x1="20" y1="15" x2="22" y2="15" />
          </svg>
        }
        title="Performance"
        subtitle={`${stateLabel}${cfg.needsRestart ? ' · restart pending' : ''}`}
        onClick={() => setOpen(true)}
      />

      {/* Portal to document.body so the popup centers over the full viewport.
          SettingsPanel's outer wrapper has a transform/filter that creates a
          containing block for position:fixed descendants — without the portal,
          the popup would center inside the panel instead of the viewport. Same pattern as
          ThemeButton, SoundButton, RemoteButton. */}
      {open && createPortal(
        <PerformancePopup
          onClose={() => setOpen(false)}
          saved={cfg.saved}
          gpuList={cfg.gpuList}
          needsRestart={cfg.needsRestart}
          setPreferPowerSaving={cfg.setPreferPowerSaving}
          restart={cfg.restart}
        />,
        document.body,
      )}
    </>
  );
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/PerformanceButton.tsx
git commit -m "refactor(settings): convert Performance row to SettingsRow"
```

---

### Task 3: Convert `AccountSection.tsx`

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/AccountSection.tsx`

- [ ] **Step 1: Add the import**

Find:
```tsx
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Scrim, OverlayPanel } from './overlays/Overlay';
import { useEscClose } from '../hooks/use-esc-close';
import { useAccount } from '../state/account-context';
import type { MarketplaceUser } from '../../main/marketplace-auth-store';
import type { BlockRow } from '../state/marketplace-api-client';
```

Replace:
```tsx
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Scrim, OverlayPanel } from './overlays/Overlay';
import { useEscClose } from '../hooks/use-esc-close';
import { useAccount } from '../state/account-context';
import type { MarketplaceUser } from '../../main/marketplace-auth-store';
import type { BlockRow } from '../state/marketplace-api-client';
import SettingsRow from './SettingsRow';
```

- [ ] **Step 2: Replace the row + section wrapper**

Find:
```tsx
  return (
    <section>
      <h3 className="text-[10px] font-medium text-fg-muted tracking-wider uppercase mb-3">Account</h3>

      {/* Row button — verbatim class list from the About row (SettingsPanel:2451). */}
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-inset/50 hover:bg-inset transition-colors text-left"
      >
        <div className="flex items-center justify-center shrink-0" style={{ width: 32, height: 20 }}>
          {signedIn && user?.avatar_url ? (
            // alt="" so the avatar doesn't leak into the button's accessible name.
            <img src={user.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover" />
          ) : (
            <PersonIcon />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-xs text-fg font-medium">{rowLabel}</span>
          <p className="text-[10px] text-fg-muted truncate">{rowDesc}</p>
        </div>
        <svg className="w-3.5 h-3.5 text-fg-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* AccountPopup portals itself to document.body (same as AboutPopup) so the
          popup centers over the full viewport, not inside SettingsPanel's
          transformed wrapper. Render directly here — do NOT wrap in a second portal. */}
      {open && <AccountPopup onClose={() => setOpen(false)} />}
    </section>
  );
```

Replace:
```tsx
  return (
    <>
      <SettingsRow
        icon={
          signedIn && user?.avatar_url ? (
            // alt="" so the avatar doesn't leak into the row's accessible name.
            <img src={user.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover" />
          ) : (
            <PersonIcon />
          )
        }
        title={rowLabel}
        subtitle={rowDesc}
        onClick={() => setOpen(true)}
      />

      {/* AccountPopup portals itself to document.body (same as AboutPopup) so the
          popup centers over the full viewport, not inside SettingsPanel's
          transformed wrapper. Render directly here — do NOT wrap in a second portal. */}
      {open && <AccountPopup onClose={() => setOpen(false)} />}
    </>
  );
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/AccountSection.tsx
git commit -m "refactor(settings): convert Account row to SettingsRow"
```

---

### Task 4: Convert `SyncPanel.tsx` (Backup & Sync)

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/SyncPanel.tsx`

This is one of the two rows corrected beyond the design doc's literal table (see "Before you start" above): title becomes the static "Backup & Sync" instead of the dynamic `primaryLabel`, and `primaryLabel` moves into the subtitle alongside the existing sync/paused counts.

- [ ] **Step 1: Add the import**

Find the top of `SyncPanel.tsx` and locate its React import line (near the other renderer imports at the top of the file). Add, alongside the existing imports:

```tsx
import SettingsRow from './SettingsRow';
```

- [ ] **Step 2: Replace the row + section wrapper**

Find:
```tsx
  return (
    <section>
      <h3 className="text-[10px] font-medium text-fg-muted tracking-wider uppercase mb-3">Backup &amp; Sync</h3>

      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-inset/50 hover:bg-inset transition-colors text-left"
      >
        <div className="flex items-center justify-center shrink-0" style={{ width: 32, height: 20 }}>
          <div className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-xs text-fg font-medium">{primaryLabel}</span>
          {(syncCount + storageCount) > 0 && display.kind !== 'failing' && (
            <span className="text-[10px] text-fg-muted ml-2">
              {syncCount > 0 ? `${syncCount} synced` : ''}
              {syncCount > 0 && storageCount > 0 ? ' · ' : ''}
              {storageCount > 0 ? `${storageCount} paused` : ''}
            </span>
          )}
        </div>
        {badge}
        <svg className="w-3.5 h-3.5 text-fg-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {open && createPortal(
        <SyncPopup
          popupRef={popupRef}
          initialStatus={status}
          onClose={() => setOpen(false)}
          onRefresh={loadStatus}
        />,
        document.body
      )}
    </section>
  );
```

Replace:
```tsx
  const counts = (syncCount + storageCount) > 0 && display.kind !== 'failing'
    ? [syncCount > 0 ? `${syncCount} synced` : '', storageCount > 0 ? `${storageCount} paused` : ''].filter(Boolean).join(' · ')
    : '';

  return (
    <>
      <SettingsRow
        icon={<div className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />}
        title="Backup & Sync"
        subtitle={counts ? `${primaryLabel} · ${counts}` : primaryLabel}
        rightAccessory={badge}
        onClick={() => setOpen(true)}
      />

      {open && createPortal(
        <SyncPopup
          popupRef={popupRef}
          initialStatus={status}
          onClose={() => setOpen(false)}
          onRefresh={loadStatus}
        />,
        document.body
      )}
    </>
  );
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/SyncPanel.tsx
git commit -m "refactor(settings): convert Backup & Sync row to SettingsRow, static title"
```

---

### Task 5: Convert `ModelProvidersPopup.tsx`

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/ModelProvidersPopup.tsx`

- [ ] **Step 1: Add the import**

Find:
```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Scrim, OverlayPanel } from './overlays/Overlay';
import { useEscClose } from '../hooks/use-esc-close';
import { useScrollFade } from '../hooks/useScrollFade';
import { InfoPopover } from './InfoPopover';
import ProvidersSection from './ProvidersSection';
import LocalModelsSection from './LocalModelsSection';
import type { FirstRunState } from '../../shared/first-run-types';
import type { ProviderStatus } from '../../shared/provider-types';
```

Replace:
```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Scrim, OverlayPanel } from './overlays/Overlay';
import { useEscClose } from '../hooks/use-esc-close';
import { useScrollFade } from '../hooks/useScrollFade';
import { InfoPopover } from './InfoPopover';
import ProvidersSection from './ProvidersSection';
import LocalModelsSection from './LocalModelsSection';
import type { FirstRunState } from '../../shared/first-run-types';
import type { ProviderStatus } from '../../shared/provider-types';
import SettingsRow from './SettingsRow';
```

- [ ] **Step 2: Replace the row + section wrapper**

Find:
```tsx
  return (
    <section>
      <h3 className="text-[10px] font-medium text-fg-muted tracking-wider uppercase mb-3">Model Providers</h3>

      {/* Row-button — same class list as the Account / About rows. */}
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-inset/50 hover:bg-inset transition-colors text-left"
      >
        <div className="flex items-center justify-center shrink-0" style={{ width: 32, height: 20 }}>
          {/* Simple stacked-layers glyph — "choose your engine". */}
          <svg className="w-4 h-4 text-fg-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 3l9 5-9 5-9-5 9-5z" />
            <path d="M3 13l9 5 9-5" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-xs text-fg font-medium">Model Providers</span>
          <p className="text-[10px] text-fg-muted truncate">Claude Code, OpenRouter, and local models</p>
        </div>
        <svg className="w-3.5 h-3.5 text-fg-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {open && (
        <ModelProvidersPopupInner
          onClose={() => setOpen(false)}
          onOpenClaudePreferences={onOpenClaudePreferences}
        />
      )}
    </section>
  );
```

Replace:
```tsx
  return (
    <>
      <SettingsRow
        // Simple stacked-layers glyph — "choose your engine".
        icon={
          <svg className="w-4 h-4 text-fg-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 3l9 5-9 5-9-5 9-5z" />
            <path d="M3 13l9 5 9-5" />
          </svg>
        }
        title="Model Providers"
        subtitle="Claude Code, OpenRouter, and local models"
        onClick={() => setOpen(true)}
      />

      {open && (
        <ModelProvidersPopupInner
          onClose={() => setOpen(false)}
          onOpenClaudePreferences={onOpenClaudePreferences}
        />
      )}
    </>
  );
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/ModelProvidersPopup.tsx
git commit -m "refactor(settings): convert Model Providers row to SettingsRow"
```

---

### Task 6: `SettingsPanel.tsx` — add the import

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/SettingsPanel.tsx`

- [ ] **Step 1: Add the import**

Find:
```tsx
import PerformanceButton from './PerformanceButton';
import AccountSection from './AccountSection';
import ModelProvidersSection from './ModelProvidersPopup';
```

Replace:
```tsx
import PerformanceButton from './PerformanceButton';
import AccountSection from './AccountSection';
import ModelProvidersSection from './ModelProvidersPopup';
import SettingsRow from './SettingsRow';
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: exits 0 (import unused warning is fine at this point — TypeScript emits it as a non-fatal hint under this project's config, not a build error; it'll be used starting next task. If `tsc --noEmit` fails specifically on "declared but never used" for this one import, that's expected and resolves itself in Task 7 — proceed).

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/SettingsPanel.tsx
git commit -m "refactor(settings): import SettingsRow in SettingsPanel.tsx"
```

---

### Task 7: `SettingsPanel.tsx` — convert `ThemeButton` (Appearance)

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/SettingsPanel.tsx`

- [ ] **Step 1: Replace the row + section wrapper**

Find:
```tsx
  return (
    <section>
      <h3 className="text-[10px] font-medium text-fg-muted tracking-wider uppercase mb-3">Appearance</h3>

      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-inset/50 hover:bg-inset transition-colors text-left"
      >
        <div className="flex rounded-sm overflow-hidden shrink-0" style={{ width: 32, height: 20 }}>
          <div style={{ flex: 1, background: canvas }} />
          <div style={{ flex: 1, background: panel }} />
          <div style={{ flex: 1, background: inset }} />
          <div style={{ flex: 1, background: accent }} />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-xs text-fg font-medium">{activeTheme.name}</span>
        </div>
        <svg className="w-3.5 h-3.5 text-fg-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {open && createPortal(
        <>
          <Scrim layer={2} onClick={() => setOpen(false)} />
          <div
            ref={popupRef}
            className="layer-surface fixed z-[61] overflow-hidden"
            style={{
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 'min(480px, 88vw)',
              height: 'min(600px, 80vh)',
            }}
          >
            <ThemeScreen onClose={() => setOpen(false)} onSendInput={onSendInput} onOpenMarketplace={onOpenMarketplace} onPublishTheme={(slug) => { setOpen(false); onPublishTheme?.(slug); }} />
          </div>
        </>,
        document.body,
      )}
    </section>
  );
}
```

Replace:
```tsx
  return (
    <>
      <SettingsRow
        icon={
          <div className="flex rounded-sm overflow-hidden w-full h-full">
            <div style={{ flex: 1, background: canvas }} />
            <div style={{ flex: 1, background: panel }} />
            <div style={{ flex: 1, background: inset }} />
            <div style={{ flex: 1, background: accent }} />
          </div>
        }
        title="Appearance"
        subtitle={activeTheme.name}
        onClick={() => setOpen(true)}
      />

      {open && createPortal(
        <>
          <Scrim layer={2} onClick={() => setOpen(false)} />
          <div
            ref={popupRef}
            className="layer-surface fixed z-[61] overflow-hidden"
            style={{
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 'min(480px, 88vw)',
              height: 'min(600px, 80vh)',
            }}
          >
            <ThemeScreen onClose={() => setOpen(false)} onSendInput={onSendInput} onOpenMarketplace={onOpenMarketplace} onPublishTheme={(slug) => { setOpen(false); onPublishTheme?.(slug); }} />
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/SettingsPanel.tsx
git commit -m "refactor(settings): convert Appearance row to SettingsRow, static title"
```

---

### Task 8: `SettingsPanel.tsx` — convert `BuddyToggle` → `BuddyButton`

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/SettingsPanel.tsx`

- [ ] **Step 1: Replace the whole component**

Find:
```tsx
// ─── Buddy floater toggle ─────────────────────────────────────────────────
// Small section row that controls the buddy mascot window: off by default,
// persists via localStorage['youcoded-buddy-enabled'] (matches theme/font
// persistence pattern). Toggling fires window.claude.buddy.show/hide;
// App.tsx also reads the flag on mount to auto-show if previously enabled.
function BuddyToggle() {
  const [enabled, setEnabled] = useState<boolean>(() =>
    localStorage.getItem('youcoded-buddy-enabled') === '1',
  );

  const toggle = useCallback(() => {
    const next = !enabled;
    setEnabled(next);
    localStorage.setItem('youcoded-buddy-enabled', next ? '1' : '0');
    if (next) window.claude.buddy?.show?.();
    else window.claude.buddy?.hide?.();
  }, [enabled]);

  return (
    <section>
      <h3 className="text-[10px] font-medium text-fg-muted tracking-wider uppercase mb-3">Buddy</h3>
      <label className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-inset/50 hover:bg-inset transition-colors text-left cursor-pointer select-none">
        <input
          type="checkbox"
          checked={enabled}
          onChange={toggle}
          className="shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="text-xs text-fg font-medium">Show buddy floater</div>
          <div className="text-[10px] text-fg-muted mt-0.5">A small always-on-top mascot that stays visible even when the app is minimized.</div>
        </div>
      </label>
    </section>
  );
}
```

Replace:
```tsx
// ─── Buddy floater button ──────────────────────────────────────────────────
// Row + popup that controls the buddy mascot window: off by default, persists
// via localStorage['youcoded-buddy-enabled'] (matches theme/font persistence
// pattern). Toggling fires window.claude.buddy.show/hide; App.tsx also reads
// the flag on mount to auto-show if previously enabled. Follows the same
// row-opens-popup pattern as Sound/Appearance/Remote Access instead of being
// a bare checkbox — see docs/active/specs/2026-07-15-settings-panel-card-redesign-design.md.
function BuddyIcon() {
  // Simplified outline mascot silhouette (rounded head + dot eyes + arm/leg
  // stubs) — deliberately NOT the full WelcomeAppIcon/AppIcon/ThemeMascot
  // illustration, which is too detailed for a 16px monochrome row icon.
  return (
    <svg className="w-4 h-4 text-fg-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="4" width="14" height="12" rx="4" />
      <circle cx="9.3" cy="10" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="14.7" cy="10" r="0.6" fill="currentColor" stroke="none" />
      <path d="M2 9v3M22 9v3" />
      <path d="M9 20h2M13 20h2" />
    </svg>
  );
}

function BuddyButton() {
  const [enabled, setEnabled] = useState<boolean>(() =>
    localStorage.getItem('youcoded-buddy-enabled') === '1',
  );
  const [open, setOpen] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const toggle = useCallback(() => {
    const next = !enabled;
    setEnabled(next);
    localStorage.setItem('youcoded-buddy-enabled', next ? '1' : '0');
    if (next) window.claude.buddy?.show?.();
    else window.claude.buddy?.hide?.();
  }, [enabled]);

  return (
    <>
      <SettingsRow
        icon={<BuddyIcon />}
        title="Buddy Floater"
        subtitle={enabled ? 'Enabled' : 'Disabled'}
        onClick={() => setOpen(true)}
      />

      {open && createPortal(
        <>
          <Scrim layer={2} onClick={() => setOpen(false)} />
          <div
            ref={popupRef}
            className="layer-surface fixed z-[61] overflow-hidden"
            style={{
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 'min(340px, 85vw)',
            }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-edge">
              <h2 className="text-sm font-bold text-fg">Buddy Floater</h2>
              <button onClick={() => setOpen(false)} className="text-fg-muted hover:text-fg-2 text-lg leading-none">✕</button>
            </div>
            <div className="px-4 py-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-fg font-medium">Show buddy floater</span>
                <Toggle enabled={enabled} onToggle={toggle} />
              </div>
              <p className="text-[10px] text-fg-muted mt-2">A small always-on-top mascot that stays visible even when the app is minimized.</p>
            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
```

- [ ] **Step 2: Update the call site in `DesktopSettings`**

Find:
```tsx
        <BuddyToggle />
```

Replace:
```tsx
        <BuddyButton />
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/SettingsPanel.tsx
git commit -m "refactor(settings): convert Buddy Floater checkbox to row+popup"
```

---

### Task 9: `SettingsPanel.tsx` — convert `SoundButton`

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/SettingsPanel.tsx`

- [ ] **Step 1: Replace the row + section wrapper**

Find:
```tsx
  return (
    <section>
      <h3 className="text-[10px] font-medium text-fg-muted tracking-wider uppercase mb-3">Sound</h3>

      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-inset/50 hover:bg-inset transition-colors text-left"
      >
        {/* Speaker icon */}
        <div className="flex items-center justify-center shrink-0" style={{ width: 32, height: 20 }}>
          <svg className="w-4 h-4 text-fg-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            {muted ? (
              <>
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <line x1="23" y1="9" x2="17" y2="15" />
                <line x1="17" y1="9" x2="23" y2="15" />
              </>
            ) : (
              <>
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                {volume > 0.5 && <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />}
              </>
            )}
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-xs text-fg font-medium">Notifications</span>
          <p className="text-[10px] text-fg-muted">{summaryParts.join(' · ')}</p>
        </div>
        <svg className="w-3.5 h-3.5 text-fg-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
```

Replace:
```tsx
  return (
    <>
      <SettingsRow
        icon={
          <svg className="w-4 h-4 text-fg-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            {muted ? (
              <>
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <line x1="23" y1="9" x2="17" y2="15" />
                <line x1="17" y1="9" x2="23" y2="15" />
              </>
            ) : (
              <>
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                {volume > 0.5 && <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />}
              </>
            )}
          </svg>
        }
        title="Sound"
        subtitle={summaryParts.join(' · ')}
        onClick={() => setOpen(true)}
      />
```

This leaves the file with an unmatched `</section>` and the popup no longer wrapped correctly — Step 2 fixes the closing tag.

- [ ] **Step 2: Fix the closing wrapper**

Find (this is the end of `SoundButton`, right after the popup portal):
```tsx
      )}
    </section>
  );
}
```

There are multiple `)}\n    </section>\n  );\n}` occurrences in this file — use the surrounding context to confirm you're editing the one immediately following the sound-category popup's closing `</div>\n          </div>\n        </>,\n        document.body,\n      )}\n    </section>\n  );\n}` (it's the block right after the `SoundCategorySection` for `"ready"` and before `// ─── Tier selector popup (Android) ───`). Replace:

```tsx
      )}
    </section>
  );
}

// ─── Tier selector popup (Android) ────────────────────────────────────────
```

Replace:
```tsx
      )}
    </>
  );
}

// ─── Tier selector popup (Android) ────────────────────────────────────────
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/SettingsPanel.tsx
git commit -m "refactor(settings): convert Sound row to SettingsRow"
```

---

### Task 10: `SettingsPanel.tsx` — convert `RemoteButton` (Remote Access)

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/SettingsPanel.tsx`

- [ ] **Step 1: Replace the row + section wrapper**

Find:
```tsx
  return (
    <section>
      <h3 className="text-[10px] font-medium text-fg-muted tracking-wider uppercase mb-3">Remote Access</h3>

      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-inset/50 hover:bg-inset transition-colors text-left"
      >
        {/* Status indicator dot — green when remote + Tailscale VPN fully active, gray otherwise */}
        <div className="flex items-center justify-center shrink-0" style={{ width: 32, height: 20 }}>
          <div className={`w-2.5 h-2.5 rounded-full ${
            isFullyConnected ? 'bg-green-500' : 'bg-fg-muted/40'
          }`} />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-xs text-fg font-medium">{statusText}</span>
          {tailscale?.installed && (
            <span className="text-[10px] text-fg-muted ml-2">Tailscale</span>
          )}
        </div>
        <svg className="w-3.5 h-3.5 text-fg-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
```

Replace:
```tsx
  // Tailscale is the transport under a fully-connected session — the old UI
  // showed a separate "Tailscale" tag next to the title whenever installed;
  // folding it into the subtitle only when it adds information (fully
  // connected) avoids a redundant "Tailscale VPN not active · Tailscale".
  const subtitle = isFullyConnected ? `${statusText} · Tailscale` : statusText;

  return (
    <>
      <SettingsRow
        // Status indicator dot — green when remote + Tailscale VPN fully active, gray otherwise
        icon={<div className={`w-2.5 h-2.5 rounded-full ${isFullyConnected ? 'bg-green-500' : 'bg-fg-muted/40'}`} />}
        title="Remote Access"
        subtitle={subtitle}
        onClick={() => setOpen(true)}
      />
```

- [ ] **Step 2: Fix the closing wrapper**

Find (end of `RemoteButton`, right after the big Remote Access popup portal):
```tsx
        </>,
        document.body,
      )}
    </section>
  );
}

// ─── Defaults popup button ────────────────────────────────────────────────
```

Replace:
```tsx
        </>,
        document.body,
      )}
    </>
  );
}

// ─── Defaults popup button ────────────────────────────────────────────────
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/SettingsPanel.tsx
git commit -m "refactor(settings): convert Remote Access row to SettingsRow, static title"
```

---

### Task 11: `SettingsPanel.tsx` — convert `DefaultsButton` and `TierSelector`

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/SettingsPanel.tsx`

`DefaultsButton` has no `<section>`/`<h3>` wrapper to remove (it's wrapped by the "Other" section, handled in Task 13) — only its button markup needs to become `SettingsRow`. `TierSelector` is the second row corrected beyond the design doc's table (see "Before you start"): title becomes the static "Package Tier", and the current tier's name moves into the subtitle.

- [ ] **Step 1: Convert `DefaultsButton`'s row**

Find:
```tsx
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-inset/50 hover:bg-inset transition-colors text-left"
      >
        <div className="flex items-center justify-center shrink-0" style={{ width: 32, height: 20 }}>
          <svg className="w-4 h-4 text-fg-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    <line x1="4" y1="7" x2="20" y2="7" /><circle cx="8" cy="7" r="2.2" fill="var(--panel)" />
                    <line x1="4" y1="17" x2="20" y2="17" /><circle cx="16" cy="17" r="2.2" fill="var(--panel)" />
                  </svg>
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-xs text-fg font-medium">Defaults</span>
          <p className="text-[10px] text-fg-muted">{summaryParts.join(' · ')}</p>
        </div>
        <svg className="w-3.5 h-3.5 text-fg-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {open && createPortal(
```

Replace:
```tsx
  return (
    <>
      <SettingsRow
        icon={
          <svg className="w-4 h-4 text-fg-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <line x1="4" y1="7" x2="20" y2="7" /><circle cx="8" cy="7" r="2.2" fill="var(--panel)" />
            <line x1="4" y1="17" x2="20" y2="17" /><circle cx="16" cy="17" r="2.2" fill="var(--panel)" />
          </svg>
        }
        title="Defaults"
        subtitle={summaryParts.join(' · ')}
        onClick={() => setOpen(true)}
      />

      {open && createPortal(
```

- [ ] **Step 2: Convert `TierSelector`'s row + section wrapper**

Find:
```tsx
  return (
    <section>
      <h3 className="text-[10px] font-medium text-fg-muted tracking-wider uppercase mb-3">Package Tier</h3>

      {/* Current tier row */}
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-inset/50 hover:bg-inset transition-colors text-left"
      >
        <span className="text-sm shrink-0 leading-none text-fg-dim">⬡</span>
        <div className="flex-1 min-w-0">
          <span className="text-xs text-fg font-medium">{currentTier.name}</span>
          <p className="text-[10px] text-fg-muted">{currentTier.desc}</p>
        </div>
        <svg className="w-3.5 h-3.5 text-fg-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
```

Replace:
```tsx
  return (
    <>
      {/* Current tier row — title is the static "Package Tier" label, subtitle
          is the current tier's name (was reversed: the tier name used to be
          the title with no static label, the one anti-pattern this component
          shared with pre-redesign Appearance/Remote Access/Buddy Floater). */}
      <SettingsRow
        icon={<span className="text-sm leading-none text-fg-dim">⬡</span>}
        title="Package Tier"
        subtitle={currentTier.name}
        onClick={() => setOpen(true)}
      />
```

- [ ] **Step 3: Fix `TierSelector`'s closing wrapper**

Find:
```tsx
              })}
              </div>
            </div>
          </div>
        </>,
        document.body,
      )}
    </section>
  );
}

// ─── Android Settings ───────────────────────────────────────────────────────
```

Replace:
```tsx
              })}
              </div>
            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  );
}

// ─── Android Settings ───────────────────────────────────────────────────────
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/SettingsPanel.tsx
git commit -m "refactor(settings): convert Defaults and Package Tier rows to SettingsRow"
```

---

### Task 12: `SettingsPanel.tsx` — convert `ConnectToDesktopButton` (Android)

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/SettingsPanel.tsx`

No `<section>`/`<h3>` wrapper here to remove — just the row markup, preserving the connected-state badge dot and green subtitle color via `SettingsRow`'s `subtitleClassName`.

- [ ] **Step 1: Replace the row**

Find:
```tsx
      <button
        onClick={() => { setOpen(true); setShowConnectForm(false); }}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-inset/50 hover:bg-inset transition-colors text-left"
      >
        <div className="relative flex items-center justify-center shrink-0" style={{ width: 32, height: 20 }}>
          <svg className="w-4 h-4 text-fg-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
          {remoteConnected && (
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-green-400 ring-1 ring-panel" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-xs text-fg font-medium">Connect to Desktop</span>
          <p className={`text-[10px] ${remoteConnected ? 'text-green-400' : 'text-fg-muted'}`}>{subtitle}</p>
        </div>
        <svg className="w-3.5 h-3.5 text-fg-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
```

Replace:
```tsx
      <SettingsRow
        icon={
          <div className="relative flex items-center justify-center">
            <svg className="w-4 h-4 text-fg-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
            {remoteConnected && (
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-green-400 ring-1 ring-panel" />
            )}
          </div>
        }
        title="Connect to Desktop"
        subtitle={subtitle}
        subtitleClassName={remoteConnected ? 'text-green-400' : undefined}
        onClick={() => { setOpen(true); setShowConnectForm(false); }}
      />
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/SettingsPanel.tsx
git commit -m "refactor(settings): convert Connect to Desktop row to SettingsRow"
```

---

### Task 13: `SettingsPanel.tsx` — flatten `DesktopSettings`

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/SettingsPanel.tsx`

Removes the "Other" `<section>`/`<h3>` wrapper (Development, Keyboard Shortcuts, Donate, About rows → `SettingsRow`), and flattens the outer `space-y-6` to `space-y-2` now that every group is a single row.

- [ ] **Step 1: Change the outer spacing**

Find (inside `DesktopSettings`, right before `<AccountSection />`):
```tsx
  return (
    <>
      <div className="flex-1 px-4 py-4 space-y-6">

        {/* Account leads the stack — your identity is the first thing settings should show (Destin, 2026-07-08) */}
        <AccountSection />
```

Replace:
```tsx
  return (
    <>
      <div className="flex-1 px-4 py-4 space-y-2">

        {/* Account leads the stack — your identity is the first thing settings should show (Destin, 2026-07-08) */}
        <AccountSection />
```

- [ ] **Step 2: Remove the "Other" wrapper and convert its rows**

Find:
```tsx
        {/* Other */}
        <section>
          <h3 className="text-[10px] font-medium text-fg-muted tracking-wider uppercase mb-3">Other</h3>
          <div className="space-y-2">
            <DefaultsButton defaults={defaults} onDefaultsChange={handleDefaultsChange} />

            {/* Development — bug reports, contributions, known issues */}
            <button
              onClick={() => setShowDevMenu(true)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-inset/50 hover:bg-inset transition-colors text-left"
            >
              <div className="flex items-center justify-center shrink-0" style={{ width: 32, height: 20 }}>
                {/* {YC} — curly braces with YC monogram in Cascadia Mono (matches the */}
                {/* "Development" label's font size). Wider viewBox/icon (32×24 → 24×16) */}
                {/* than the other Other-section icons because monospace YC at the */}
                {/* requested size won't fit alongside brackets in a 16×16 box. */}
                <svg className="w-6 h-4 text-fg-muted" viewBox="0 0 32 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 4 C 3 4 3 7 3 9 C 3 11 2 12 1 12 C 2 12 3 13 3 15 C 3 17 3 20 5 20" />
                  <path d="M27 4 C 29 4 29 7 29 9 C 29 11 30 12 31 12 C 30 12 29 13 29 15 C 29 17 29 20 27 20" />
                  <text x="16" y="17" textAnchor="middle" fontFamily="'Cascadia Code', 'Cascadia Mono', Consolas, monospace" fontSize="16" fontWeight="500" fill="currentColor" stroke="none">YC</text>
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-xs text-fg font-medium">Development</span>
                <p className="text-[10px] text-fg-muted">Report a bug, contribute, or browse known issues</p>
              </div>
              <svg className="w-3.5 h-3.5 text-fg-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <DevelopmentPopup
              open={showDevMenu}
              onClose={() => setShowDevMenu(false)}
              onOpenBug={() => { setShowDevMenu(false); setShowBugReport(true); }}
              onOpenContribute={() => { setShowDevMenu(false); setShowContribute(true); }}
            />
            <BugReportPopup open={showBugReport} onClose={() => setShowBugReport(false)} />
            <ContributePopup open={showContribute} onClose={() => setShowContribute(false)} />

            {/* Keyboard Shortcuts */}
            <button
              onClick={() => setShowShortcuts(true)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-inset/50 hover:bg-inset transition-colors text-left"
            >
              <div className="flex items-center justify-center shrink-0" style={{ width: 32, height: 20 }}>
                <svg className="w-4 h-4 text-fg-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M8 16h8" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-xs text-fg font-medium">Keyboard Shortcuts</span>
                <p className="text-[10px] text-fg-muted">View all hotkeys</p>
              </div>
              <svg className="w-3.5 h-3.5 text-fg-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <ShortcutsPopup open={showShortcuts} onClose={() => setShowShortcuts(false)} />

            <button
              onClick={() => setShowDonateConfirm(true)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-inset/50 hover:bg-inset transition-colors text-left"
            >
              <div className="flex items-center justify-center shrink-0" style={{ width: 32, height: 20 }}>
                <svg className="w-4 h-4 text-fg-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 000-7.78z" />
                  </svg>
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-xs text-fg font-medium">Donate</span>
                <p className="text-[10px] text-fg-muted">Support YouCoded development</p>
              </div>
              <svg className="w-3.5 h-3.5 text-fg-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>

            {/* Donate confirmation modal */}
            {showDonateConfirm && createPortal(
              <div className="fixed inset-0 z-[9999] flex items-center justify-center" onClick={() => setShowDonateConfirm(false)}>
                <div className="absolute inset-0 layer-scrim" data-layer="2" />
                <div
                  className="layer-surface relative p-6 max-w-xs w-full mx-4 text-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  <p className="text-xs text-fg-muted mb-1">Donations supported via</p>
                  <div className="flex items-center justify-center gap-2 mb-5">
                    {/* Custom coffee-mug icon: body + handle + rising steam. Ties to "Buy Me a Coffee" label via BMC yellow. */}
                    <svg className="w-5 h-5 text-[#FFDD00]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M7 2v2M11 2v2M15 2v2" />
                      <path d="M3 8h14v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8z" />
                      <path d="M17 11h2a2.5 2.5 0 0 1 0 5h-2" />
                    </svg>
                    <span className="text-sm font-bold text-fg">Buy Me a Coffee</span>
                  </div>
                  <p className="text-[11px] text-fg-dim mb-5">Okay to open donation link?</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowDonateConfirm(false)}
                      className="flex-1 text-xs font-medium py-2.5 rounded-lg border border-edge-dim text-fg-2 hover:bg-inset transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        window.open('https://buymeacoffee.com/itsdestin', '_blank');
                        setShowDonateConfirm(false);
                      }}
                      className="flex-1 text-xs font-medium py-2.5 rounded-lg bg-accent text-on-accent hover:brightness-110 transition-all"
                    >
                      Open
                    </button>
                  </div>
                </div>
              </div>,
              document.body
            )}

            {/* About — popup on click, styled like other settings popups */}
            <button
              onClick={() => setShowAbout(true)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-inset/50 hover:bg-inset transition-colors text-left"
            >
              <div className="flex items-center justify-center shrink-0" style={{ width: 32, height: 20 }}>
                <svg className="w-4 h-4 text-fg-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-xs text-fg font-medium">About</span>
                <p className="text-[10px] text-fg-muted">YouCoded {typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : ''}</p>
              </div>
              <svg className="w-3.5 h-3.5 text-fg-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <AboutPopup
              open={showAbout}
              onClose={() => setShowAbout(false)}
              platform="desktop"
              version={typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : ''}
            />
          </div>
        </section>
      </div>
    </>
  );
}
```

Replace:
```tsx
        <DefaultsButton defaults={defaults} onDefaultsChange={handleDefaultsChange} />

        {/* Development — bug reports, contributions, known issues */}
        <SettingsRow
          icon={
            // {YC} — curly braces with YC monogram in Cascadia Mono (matches
            // the "Development" label's font size).
            <svg className="w-6 h-4 text-fg-muted" viewBox="0 0 32 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 4 C 3 4 3 7 3 9 C 3 11 2 12 1 12 C 2 12 3 13 3 15 C 3 17 3 20 5 20" />
              <path d="M27 4 C 29 4 29 7 29 9 C 29 11 30 12 31 12 C 30 12 29 13 29 15 C 29 17 29 20 27 20" />
              <text x="16" y="17" textAnchor="middle" fontFamily="'Cascadia Code', 'Cascadia Mono', Consolas, monospace" fontSize="16" fontWeight="500" fill="currentColor" stroke="none">YC</text>
            </svg>
          }
          title="Development"
          subtitle="Report a bug, contribute, or browse known issues"
          onClick={() => setShowDevMenu(true)}
        />
        <DevelopmentPopup
          open={showDevMenu}
          onClose={() => setShowDevMenu(false)}
          onOpenBug={() => { setShowDevMenu(false); setShowBugReport(true); }}
          onOpenContribute={() => { setShowDevMenu(false); setShowContribute(true); }}
        />
        <BugReportPopup open={showBugReport} onClose={() => setShowBugReport(false)} />
        <ContributePopup open={showContribute} onClose={() => setShowContribute(false)} />

        {/* Keyboard Shortcuts */}
        <SettingsRow
          icon={
            <svg className="w-4 h-4 text-fg-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M8 16h8" />
            </svg>
          }
          title="Keyboard Shortcuts"
          subtitle="View all hotkeys"
          onClick={() => setShowShortcuts(true)}
        />
        <ShortcutsPopup open={showShortcuts} onClose={() => setShowShortcuts(false)} />

        <SettingsRow
          icon={
            <svg className="w-4 h-4 text-fg-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 000-7.78z" />
            </svg>
          }
          title="Donate"
          subtitle="Support YouCoded development"
          onClick={() => setShowDonateConfirm(true)}
        />

        {/* Donate confirmation modal */}
        {showDonateConfirm && createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center" onClick={() => setShowDonateConfirm(false)}>
            <div className="absolute inset-0 layer-scrim" data-layer="2" />
            <div
              className="layer-surface relative p-6 max-w-xs w-full mx-4 text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-xs text-fg-muted mb-1">Donations supported via</p>
              <div className="flex items-center justify-center gap-2 mb-5">
                {/* Custom coffee-mug icon: body + handle + rising steam. Ties to "Buy Me a Coffee" label via BMC yellow. */}
                <svg className="w-5 h-5 text-[#FFDD00]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 2v2M11 2v2M15 2v2" />
                  <path d="M3 8h14v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8z" />
                  <path d="M17 11h2a2.5 2.5 0 0 1 0 5h-2" />
                </svg>
                <span className="text-sm font-bold text-fg">Buy Me a Coffee</span>
              </div>
              <p className="text-[11px] text-fg-dim mb-5">Okay to open donation link?</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowDonateConfirm(false)}
                  className="flex-1 text-xs font-medium py-2.5 rounded-lg border border-edge-dim text-fg-2 hover:bg-inset transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    window.open('https://buymeacoffee.com/itsdestin', '_blank');
                    setShowDonateConfirm(false);
                  }}
                  className="flex-1 text-xs font-medium py-2.5 rounded-lg bg-accent text-on-accent hover:brightness-110 transition-all"
                >
                  Open
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

        {/* About — popup on click, styled like other settings popups */}
        <SettingsRow
          icon={
            <svg className="w-4 h-4 text-fg-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          }
          title="About"
          subtitle={`YouCoded ${typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : ''}`}
          onClick={() => setShowAbout(true)}
        />
        <AboutPopup
          open={showAbout}
          onClose={() => setShowAbout(false)}
          platform="desktop"
          version={typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : ''}
        />
      </div>
    </>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/SettingsPanel.tsx
git commit -m "refactor(settings): flatten DesktopSettings, remove Other section header"
```

---

### Task 14: `SettingsPanel.tsx` — flatten `AndroidSettings`

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/SettingsPanel.tsx`

Mirrors Task 13 for `AndroidSettings`'s "Other" section (Development, Donate, About — no Keyboard Shortcuts on Android, per the existing "no physical keyboard" comment) and outer spacing.

- [ ] **Step 1: Change the outer spacing**

Find (inside `AndroidSettings`, right before `<AccountSection />`):
```tsx
  return (
    <>
      <div className="flex-1 px-4 py-4 space-y-6">

        {/* Account leads the stack — your identity is the first thing settings should show (Destin, 2026-07-08) */}
        <AccountSection />

        <ThemeButton onSendInput={onSendInput} onOpenMarketplace={onOpenThemeMarketplace} onPublishTheme={onPublishTheme} />

        {/* No <BuddyToggle /> on Android — the floater relies on an Electron always-on-top window that Android doesn't support yet */}
```

Replace:
```tsx
  return (
    <>
      <div className="flex-1 px-4 py-4 space-y-2">

        {/* Account leads the stack — your identity is the first thing settings should show (Destin, 2026-07-08) */}
        <AccountSection />

        <ThemeButton onSendInput={onSendInput} onOpenMarketplace={onOpenThemeMarketplace} onPublishTheme={onPublishTheme} />

        {/* No <BuddyButton /> on Android — the floater relies on an Electron always-on-top window that Android doesn't support yet */}
```

- [ ] **Step 2: Remove the "Other" wrapper and convert its rows**

Find:
```tsx
        {/* Other */}
        <section>
          <h3 className="text-[10px] font-medium text-fg-muted tracking-wider uppercase mb-3">Other</h3>
          <div className="space-y-2">
            <DefaultsButton defaults={defaults} onDefaultsChange={handleDefaultsChange} />

            {/* Development — bug reports, contributions, known issues */}
            <button
              onClick={() => setShowDevMenu(true)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-inset/50 hover:bg-inset transition-colors text-left"
            >
              <div className="flex items-center justify-center shrink-0" style={{ width: 32, height: 20 }}>
                {/* {YC} — curly braces with YC monogram in Cascadia Mono (matches the */}
                {/* "Development" label's font size). Wider viewBox/icon (32×24 → 24×16) */}
                {/* than the other Other-section icons because monospace YC at the */}
                {/* requested size won't fit alongside brackets in a 16×16 box. */}
                <svg className="w-6 h-4 text-fg-muted" viewBox="0 0 32 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 4 C 3 4 3 7 3 9 C 3 11 2 12 1 12 C 2 12 3 13 3 15 C 3 17 3 20 5 20" />
                  <path d="M27 4 C 29 4 29 7 29 9 C 29 11 30 12 31 12 C 30 12 29 13 29 15 C 29 17 29 20 27 20" />
                  <text x="16" y="17" textAnchor="middle" fontFamily="'Cascadia Code', 'Cascadia Mono', Consolas, monospace" fontSize="16" fontWeight="500" fill="currentColor" stroke="none">YC</text>
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-xs text-fg font-medium">Development</span>
                <p className="text-[10px] text-fg-muted">Report a bug, contribute, or browse known issues</p>
              </div>
              <svg className="w-3.5 h-3.5 text-fg-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <DevelopmentPopup
              open={showDevMenu}
              onClose={() => setShowDevMenu(false)}
              onOpenBug={() => { setShowDevMenu(false); setShowBugReport(true); }}
              onOpenContribute={() => { setShowDevMenu(false); setShowContribute(true); }}
            />
            <BugReportPopup open={showBugReport} onClose={() => setShowBugReport(false)} />
            <ContributePopup open={showContribute} onClose={() => setShowContribute(false)} />

            {/* Keyboard shortcuts intentionally omitted on Android — no physical keyboard. */}

            <button
              onClick={() => setShowDonateConfirm(true)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-inset/50 hover:bg-inset transition-colors text-left"
            >
              <div className="flex items-center justify-center shrink-0" style={{ width: 32, height: 20 }}>
                <svg className="w-4 h-4 text-fg-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 000-7.78z" />
                  </svg>
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-xs text-fg font-medium">Donate</span>
                <p className="text-[10px] text-fg-muted">Support YouCoded development</p>
              </div>
              <svg className="w-3.5 h-3.5 text-fg-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>

            {/* Donate confirmation modal */}
            {showDonateConfirm && createPortal(
              <div className="fixed inset-0 z-[9999] flex items-center justify-center" onClick={() => setShowDonateConfirm(false)}>
                <div className="absolute inset-0 layer-scrim" data-layer="2" />
                <div
                  className="layer-surface relative p-6 max-w-xs w-full mx-4 text-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  <p className="text-xs text-fg-muted mb-1">Donations supported via</p>
                  <div className="flex items-center justify-center gap-2 mb-5">
                    {/* Custom coffee-mug icon: body + handle + rising steam. Ties to "Buy Me a Coffee" label via BMC yellow. */}
                    <svg className="w-5 h-5 text-[#FFDD00]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M7 2v2M11 2v2M15 2v2" />
                      <path d="M3 8h14v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8z" />
                      <path d="M17 11h2a2.5 2.5 0 0 1 0 5h-2" />
                    </svg>
                    <span className="text-sm font-bold text-fg">Buy Me a Coffee</span>
                  </div>
                  <p className="text-[11px] text-fg-dim mb-5">Okay to open donation link?</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowDonateConfirm(false)}
                      className="flex-1 text-xs font-medium py-2.5 rounded-lg border border-edge-dim text-fg-2 hover:bg-inset transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        window.open('https://buymeacoffee.com/itsdestin', '_blank');
                        setShowDonateConfirm(false);
                      }}
                      className="flex-1 text-xs font-medium py-2.5 rounded-lg bg-accent text-on-accent hover:brightness-110 transition-all"
                    >
                      Open
                    </button>
                  </div>
                </div>
              </div>,
              document.body
            )}

            {aboutInfo && (
              <>
                <button
                  onClick={() => setShowAbout(true)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-inset/50 hover:bg-inset transition-colors text-left"
                >
                  <div className="flex items-center justify-center shrink-0" style={{ width: 32, height: 20 }}>
                    <svg className="w-4 h-4 text-fg-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="16" x2="12" y2="12" />
                      <line x1="12" y1="8" x2="12.01" y2="8" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs text-fg font-medium">About</span>
                    <p className="text-[10px] text-fg-muted">YouCoded {aboutInfo.version}{aboutInfo.build ? ` · ${aboutInfo.build}` : ''}</p>
                  </div>
                  <svg className="w-3.5 h-3.5 text-fg-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                <AboutPopup
                  open={showAbout}
                  onClose={() => setShowAbout(false)}
                  platform="android"
                  version={aboutInfo.version}
                  build={aboutInfo.build}
                />
              </>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

// ─── Desktop Settings (existing, unchanged) ─────────────────────────────────
```

Replace:
```tsx
        <DefaultsButton defaults={defaults} onDefaultsChange={handleDefaultsChange} />

        {/* Development — bug reports, contributions, known issues */}
        <SettingsRow
          icon={
            // {YC} — curly braces with YC monogram in Cascadia Mono (matches
            // the "Development" label's font size).
            <svg className="w-6 h-4 text-fg-muted" viewBox="0 0 32 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 4 C 3 4 3 7 3 9 C 3 11 2 12 1 12 C 2 12 3 13 3 15 C 3 17 3 20 5 20" />
              <path d="M27 4 C 29 4 29 7 29 9 C 29 11 30 12 31 12 C 30 12 29 13 29 15 C 29 17 29 20 27 20" />
              <text x="16" y="17" textAnchor="middle" fontFamily="'Cascadia Code', 'Cascadia Mono', Consolas, monospace" fontSize="16" fontWeight="500" fill="currentColor" stroke="none">YC</text>
            </svg>
          }
          title="Development"
          subtitle="Report a bug, contribute, or browse known issues"
          onClick={() => setShowDevMenu(true)}
        />
        <DevelopmentPopup
          open={showDevMenu}
          onClose={() => setShowDevMenu(false)}
          onOpenBug={() => { setShowDevMenu(false); setShowBugReport(true); }}
          onOpenContribute={() => { setShowDevMenu(false); setShowContribute(true); }}
        />
        <BugReportPopup open={showBugReport} onClose={() => setShowBugReport(false)} />
        <ContributePopup open={showContribute} onClose={() => setShowContribute(false)} />

        {/* Keyboard shortcuts intentionally omitted on Android — no physical keyboard. */}

        <SettingsRow
          icon={
            <svg className="w-4 h-4 text-fg-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 000-7.78z" />
            </svg>
          }
          title="Donate"
          subtitle="Support YouCoded development"
          onClick={() => setShowDonateConfirm(true)}
        />

        {/* Donate confirmation modal */}
        {showDonateConfirm && createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center" onClick={() => setShowDonateConfirm(false)}>
            <div className="absolute inset-0 layer-scrim" data-layer="2" />
            <div
              className="layer-surface relative p-6 max-w-xs w-full mx-4 text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-xs text-fg-muted mb-1">Donations supported via</p>
              <div className="flex items-center justify-center gap-2 mb-5">
                {/* Custom coffee-mug icon: body + handle + rising steam. Ties to "Buy Me a Coffee" label via BMC yellow. */}
                <svg className="w-5 h-5 text-[#FFDD00]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 2v2M11 2v2M15 2v2" />
                  <path d="M3 8h14v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8z" />
                  <path d="M17 11h2a2.5 2.5 0 0 1 0 5h-2" />
                </svg>
                <span className="text-sm font-bold text-fg">Buy Me a Coffee</span>
              </div>
              <p className="text-[11px] text-fg-dim mb-5">Okay to open donation link?</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowDonateConfirm(false)}
                  className="flex-1 text-xs font-medium py-2.5 rounded-lg border border-edge-dim text-fg-2 hover:bg-inset transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    window.open('https://buymeacoffee.com/itsdestin', '_blank');
                    setShowDonateConfirm(false);
                  }}
                  className="flex-1 text-xs font-medium py-2.5 rounded-lg bg-accent text-on-accent hover:brightness-110 transition-all"
                >
                  Open
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

        {aboutInfo && (
          <>
            <SettingsRow
              icon={
                <svg className="w-4 h-4 text-fg-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
              }
              title="About"
              subtitle={`YouCoded ${aboutInfo.version}${aboutInfo.build ? ` · ${aboutInfo.build}` : ''}`}
              onClick={() => setShowAbout(true)}
            />
            <AboutPopup
              open={showAbout}
              onClose={() => setShowAbout(false)}
              platform="android"
              version={aboutInfo.version}
              build={aboutInfo.build}
            />
          </>
        )}
      </div>
    </>
  );
}

// ─── Desktop Settings (existing, unchanged) ─────────────────────────────────
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/SettingsPanel.tsx
git commit -m "refactor(settings): flatten AndroidSettings, remove Other section header"
```

---

### Task 15: Full verification and regression check

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

```bash
npm test -- --run
```

Expected: same pass count as the Task 0 baseline — this is a pure markup refactor, so no existing test's behavior should change.

- [ ] **Step 2: Full production build**

```bash
npm run build
```

Expected: exits 0 (this also re-runs `tsc` across the whole project, catching anything the per-task `--noEmit` checks might have missed due to incremental caching).

- [ ] **Step 3: Visual verification in the dev app**

Per workspace rules, never test against the live built app — always the isolated dev instance.

```bash
cd "C:\Users\desti\youcoded-dev"
bash scripts/run-dev.sh
```

In the "YouCoded Dev" window that opens, click the gear icon to open Settings and check:
- No uppercase section headers remain anywhere in the panel (Account through About is one continuous flat list).
- Every row shows icon + title + subtitle + chevron in the same visual style.
- Appearance row shows "Appearance" / current theme name.
- Buddy Floater row shows the new outline mascot icon (not a checkbox), and clicking it opens a popup with a working toggle; toggling shows "Enabled"/"Disabled" on the row and actually shows/hides the buddy floater window.
- Backup & Sync row shows "Backup & Sync" as the static title with the sync state in the subtitle, and its status badge still renders.
- Remote Access row shows "Remote Access" as the static title with connection status in the subtitle.
- Card spacing is uniform top to bottom (no leftover extra gaps from the old section grouping).

Shut down the dev server once verification is complete, per workspace convention (only pushing to master green-lights leaving it running unattended).

- [ ] **Step 4: Report status**

Summarize pass/fail for each check above before moving to `finishing-a-development-branch`.

---

## Self-review notes

- **Spec coverage:** every row named in the design doc's mapping table has a task (Account: 3; Appearance: 7; Buddy Floater: 8; Sound: 9; Performance: 2; Backup & Sync: 4; Model Providers: 5; Remote Access: 10; Package Tier: 11; Connect to Desktop: 12; Defaults/Development/Keyboard Shortcuts/Donate/About: 11/13/14). The shared component (Task 1) and layout flattening (Tasks 13–14) are both covered.
- **Placeholder scan:** no TBD/TODO; every step shows the literal before/after code.
- **Type consistency:** `SettingsRowProps` (icon, title, subtitle, subtitleClassName, onClick, rightAccessory) is defined once in Task 1 and every later task's `<SettingsRow ... />` usage matches that exact prop set — no task invents a prop name not defined in Task 1.
