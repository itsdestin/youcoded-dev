---
status: shipped (unmerged) — K4/K6/K7/K12 done; K5/K9 deferred, gated on a copy pass
extends: docs/active/specs/2026-07-26-menu-internals-design-system.md
follows: docs/active/plans/2026-07-26-menu-internals-tranche-2.md
branch: feat/menu-internals-tranche-1 (tranches 1+2+3 ship as ONE PR — Destin's call 2026-07-28)
---

# Menu Internals — Tranche 3 (the passive roles) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or
> superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

---

## STATUS (2026-07-28, end of session — read this first)

**All four in-scope roles SHIPPED to `feat/menu-internals-tranche-1` (23 commits total across
tranches 1–3, UNMERGED, no PR).** Suite 3462 green, `tsc --noEmit` clean, `vite build` clean.
Destin reviewed in a dev instance and approved.

| Role | State |
|---|---|
| K4 callout | **DONE** — `ui/Callout.tsx`, 7 sites |
| K6 item list | **DONE** — 4 bare glyphs killed, 1 exempt, coupled help text fixed |
| K7 field + action | **DONE** — 1 site |
| K12 explainer | **DONE** — chrome moved to Dialog, ThemeScreen's `showInfo` lifted |
| K5 status strip | **NOT STARTED** — gated on a copy pass |
| K9 danger zone | **NOT STARTED** — gated on a copy pass |
| K11 footer | Folded into K9 (nothing independent left) |

### Where this plan's own estimates were wrong

The plan corrected the spec, and then the work corrected the plan. Both undercounts had the same
cause — reading for the recipes someone had already written down instead of for the shape:

- **K4 was 7 sites, not 6.** The plan's list came from a `bg-accent/10|bg-amber-500/10|bg-destructive/10`
  grep. The app also had `bg-red-500/10` at **two** border opacities (/20 and /25) and a
  `bg-green-500/10` success block. The first guard I wrote inherited the same blind spot, and a
  second one: it required the tint to appear BEFORE `border`, so it silently scored `Button.tsx` as
  zero — that recipe reads `border border-destructive/50 … hover:bg-destructive/10`. A guard that
  misses a violation because of class ORDER is the exact K1 failure. It looks both ways now.
- **K6 was 5 bare glyphs, not 3**, and they were three different problems: two item actions, two
  container dismisses that had reimplemented `CloseButton`, and one already-correct `Button` using
  the glyph as its label. The plan's guessed exemptions (`QuickChips`, `RemoteUnsupportedNotice`)
  were both wrong — `RemoteUnsupportedNotice` needed migrating, `QuickChips` had no glyph at all.
- **The SyncPanel "destructive banner" in the plan's K4 list was not a callout.** It was a
  hand-rolled dialog header inside a `<Dialog>` — D1 residue that tranche 2 had recorded as "titling
  them is a copy decision". Not true of that one: it already received a `title` prop and was passing
  it as an aria-label while drawing the heading itself. Fixed in the K4 commit.

### Bugs the work surfaced, fixed in place

- **`SettingRow`'s `disabled` dimmed the row but did not block its handler.** The `<button>` branch
  got that from the DOM attribute; the `<div>` branch did not. Found by K6's saved-devices row,
  which disables itself mid-connect and would otherwise have let you start a second connection.
- **`Callout`'s slots had to be `<div>`, not `<p>`.** SyncSetupWizard's install error puts a link on
  its own line, and a `<div>` inside a `<p>` is invalid HTML the browser repairs by closing the
  paragraph early — which would have dropped the body's text classes off everything after it.

### Residue

- **Three main views still paint their own headers inside a `Dialog`**: Remote Access, Backup & Sync,
  and SyncSetupWizard's `WizardHeader`. Same D1 gap the explainer had, but fixing them means lifting
  each view's state to its Dialog owner (as K12 did for ThemeScreen's `showInfo`) — a restructure,
  not a migration.
- **The explainer's close button announces as "Close About Context"** — `Dialog` builds that label
  from the title. Aria-only, cosmetic, would need a `closeLabel` prop.
- **`HowContextWorksPopup.tsx`** is a fifth explainer mechanism on the out-of-scope project-view
  surface.
- **`AnchorTip` survives in `ModelProvidersPopup`** as an inline hint — spec K12 explicitly permits
  that; it is not the explainer mechanism.
- **K6 candidates on other surfaces**: model providers, connected accounts, sync spaces, open tasks.
  Each has a bespoke row layout that deserves its own look rather than a blind conversion.

---

## READ THIS FIRST — the spec overstates what is left

Tranches 1 and 2 shipped K1, K3, K8, K10, D1 and K2. The spec's ledger lists seven roles remaining
(K4–K7, K9, K11, K12). **A survey of the actual code on 2026-07-28 found that number is wrong in
both directions**, which matters because the spec has now been wrong about shipped state four times
(see spec §0b for the first three).

| Role | Spec says | Code says |
|---|---|---|
| **K4** callout | "retires 3 geometries" | **2** geometries, 6 sites, no primitive exists. Real, small. |
| **K5** status strip | "Remote's 8 ad-hoc branches" | Real, but every branch's message is **new copy**. GATED. |
| **K6** item list | "3 shapes + the last bare ✕" | **3** bare glyphs, not one — and one of them is a dismiss, not an item action. Plus a copy coupling the spec missed (below). |
| **K7** field + action | "button-as-field" | Exactly **one** site. Real, tiny. |
| **K9** danger zone | "3 bespoke zones" | Real, but the consequence sentences are **new copy**. GATED. |
| **K11** footer | "retires 3 conventions" | **Almost nothing to do.** The only real dialog footer left is ContextPopup's, and that is the K9 split the spec already flags. K11 collapses into K9. |
| **K12** explainer | "retires 5 mechanisms" | **Mostly already done.** `SettingsExplainer` IS the one renderer — 4 call sites, one shared payload. What remains is different work (below). |

### K12 is not a consolidation any more

`SettingsExplainer.tsx` is already the single renderer for `{title, intro, sections, onBack,
onClose}`, used by ThemeScreen, SettingsPanel (Remote), ContextPopup and SyncPanel. The spec's
"5 mechanisms" predates that.

What is actually left is that **`SettingsExplainer` predates `<Dialog>` and hand-rolls the three
things D1 now owns**: a header (back chevron + `About {title}` + CloseButton, at
`SettingsExplainer.tsx:51-66`), its own `useScrollFade` body, and its own `useEscClose`. Every host
has to pass `scrollBody={false}` and surrender the whole panel to it. Dialog already has an `onBack`
prop — added in tranche 2 for exactly this affordance — and nothing uses it.

So K12 becomes: **delete the explainer's header and scroll body, render it through Dialog's.** That
is a smaller, sharper task than the ledger implies, and it removes the last surface in the family
that owns its own dialog chrome.

### The copy coupling the spec missed

`SettingsPanel.tsx:68` is Remote Access explainer copy that reads:

> `{ term: 'Connected device should be removed', text: 'Use the ✕ next to a device under "Connected Devices" to disconnect it. …' }`

K6 replaces that ✕ with a labelled `<Button size="sm">Disconnect</Button>`. **The copy must change in
the same commit** or the help text will describe a control that no longer exists. This is the exact
class of drift `/audit` exists to catch, and it is cheaper to not create it.

### What this plan covers, and what it defers

**In:** K4, K6, K7, K12. Four roles, all mechanical — no new prose beyond two button labels
("Disconnect", "Change") that are named by what the button does.

**Deferred to tranche 4, gated on a copy pass:** K5 and K9, plus the ContextPopup footer restructure
that K11 amounts to. Spec §8 open question 2 already flags this gate: *"the artifact renders these
with copy written by Claude, not shipped copy… Gates tranche 3 only."* K5 turns Remote's eight setup
branches into eight status-strip messages; K9 needs a consequence sentence per danger zone that
satisfies `docs/error-message-standards.md`. Both are Destin's words to write, not Claude's to
invent.

### Branching

Tranche 1 + 2 is 19 commits / 58 files on `feat/menu-internals-tranche-1`, unmerged, no PR.
**Recommendation: open that PR first and branch tranche 3 off master after it merges.** Stacking a
fifth kit role onto an already-large PR makes it unreviewable, and these four roles have no
dependency on each other beyond the shared `Callout` primitive. If Destin prefers one PR regardless,
branch off `feat/menu-internals-tranche-1` and the commits simply extend it.

---

**Goal:** Retire the last four mechanical kit roles — one callout geometry, one item-list row, one
field+action shape, and an explainer that stops owning dialog chrome.

**Architecture:** Two new primitives (`ui/Callout.tsx`, and `SettingRow`'s existing `item` variant
reused as the K6 row) plus one deletion (`SettingsExplainer`'s header and scroll body). Every task
migrates its own call sites in the same commit — the standing rule from spec §0, guarded by
`tests/primitive-adoption.test.ts`, after `SegmentedTabs` shipped with zero call sites and sat unused
for a release.

**Tech Stack:** React 19, TypeScript, Tailwind v4 semantic tokens, Vitest 4 + @testing-library/react
16, jsdom 29.

## Global Constraints

- **Status colors stay hardcoded.** green / amber / red / blue / orange are theme-independent; only
  surface/text/border colors use semantic tokens. (`desktop/CLAUDE.md`, "Theming & Appearance".)
- **Actions are always a labelled `<Button size="sm">`, never a bare glyph.** (spec K6; change 41.)
- **No decorative dividers inside a menu body.** Inside a dialog the only `border-t` is a K11 footer
  and the only `border-b` is the header. (spec K8, shipped in tranche 1.)
- **A callout with a button in it is K5, not K4.** That distinction is what stops the two roles
  collapsing back together — so a K4 `Callout` must NOT accept an action slot.
- **Named exemptions, never silent skips.** Every guard test lists what it excludes and why, plus a
  second assertion that fails when an exemption stops being true. (`tests/primitive-adoption.test.ts`,
  `tests/dialog-shell.test.tsx`, `tests/setting-row-authority.test.tsx`.)
- **`stripComments()` in every source-text guard.** WHY comments quote the idiom they replaced, so a
  guard reading raw text fails on the explanation of its own fix.
- **Every non-trivial edit carries a WHY comment.** Destin is a non-developer and relies on them.
- **In-scope surfaces:** `App.tsx`, `components/*.tsx`, `components/development/`, `components/ui/`.
  Out and recorded as residue: marketplace, project-view, game, git, tags, context-menu, buddy.

---

## File Structure

| File | Responsibility |
|---|---|
| `desktop/src/renderer/components/ui/Callout.tsx` | **New.** K4. One geometry, three tones, no action slot. |
| `desktop/src/renderer/components/ui/index.ts` | Export `Callout` + its types. |
| `desktop/src/renderer/components/SettingsPanel.tsx` | 5 callout sites, 2 bare glyphs, the project-folder field, the coupled explainer copy. |
| `desktop/src/renderer/components/SyncPanel.tsx` | 1 destructive banner. |
| `desktop/src/renderer/components/SettingsExplainer.tsx` | Lose the header + scroll body; keep the payload renderer. |
| `desktop/src/renderer/components/ContextPopup.tsx` | Explainer host — moves to Dialog `onBack`. |
| `desktop/src/renderer/components/ThemeScreen.tsx` | Explainer host. |
| `desktop/tests/callout-authority.test.tsx` | **New.** K4 guard. |
| `desktop/tests/item-list-authority.test.ts` | **New.** K6 guard — no bare-glyph actions in scope. |
| `desktop/tests/explainer-shell.test.tsx` | **New.** K12 guard — the explainer owns no dialog chrome. |

---

## Task 1: K4 — the Callout primitive, and its six call sites

**Files:**
- Create: `desktop/src/renderer/components/ui/Callout.tsx`
- Modify: `desktop/src/renderer/components/ui/index.ts`
- Modify: `desktop/src/renderer/components/SettingsPanel.tsx` (5 sites), `desktop/src/renderer/components/SyncPanel.tsx` (1 site)
- Test: `desktop/tests/callout-authority.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `Callout({ tone?: 'info' | 'warning' | 'danger', title?: React.ReactNode, className?: string, children: React.ReactNode }): JSX.Element`, exported from `components/ui`. Task 4 does not use it; Tasks 2 and 3 do not use it. It is self-contained.

The two geometries in the tree today, verbatim:

```
bg-amber-500/10 border border-amber-500/25 rounded-md px-2.5 py-2      x3  (SettingsPanel)
bg-amber-500/10 border border-amber-500/25 rounded-lg p-3              x1  (SettingsPanel)
bg-accent/10 border border-accent/25 rounded-lg p-3                    x1  (SettingsPanel)
px-4 py-3 border-b border-destructive/30 bg-destructive/10             x1  (SyncPanel)
```

- [ ] **Step 1: Write the failing test**

Create `desktop/tests/callout-authority.test.tsx`:

```tsx
// @vitest-environment jsdom
// desktop/tests/callout-authority.test.tsx
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { Callout } from '../src/renderer/components/ui/Callout';

// Guard for K4 — the callout.
//
// A callout is PASSIVE: it states something and offers nothing to press. The
// moment it grows a button it is a K5 status strip, which is a different role
// with a different geometry. Keeping the two apart is the entire reason K4 is
// its own kit entry, so the API is what enforces it: Callout has no action slot.

afterEach(cleanup);

describe('Callout', () => {
  it('has one geometry across all three tones', () => {
    const seen = new Set<string>();
    for (const tone of ['info', 'warning', 'danger'] as const) {
      cleanup();
      render(<Callout tone={tone}>body</Callout>);
      const el = screen.getByText('body').closest('div')!;
      for (const cls of ['rounded-lg', 'p-3', 'border']) {
        expect(el.className, `${tone} missing ${cls}`).toContain(cls);
      }
      seen.add(el.className.split(/\s+/).filter((c) => !c.includes('/')).sort().join(' '));
    }
    // Tone changes only the color pair; every structural class is shared.
    expect(seen.size, 'tones must not diverge in geometry').toBe(1);
  });

  it('each tone carries its own surface and border', () => {
    // Preserves change 14's rule (accent = info, amber = warning) and adds the
    // danger tone the old set was missing.
    const expected = {
      info: ['bg-accent/10', 'border-accent/25'],
      warning: ['bg-amber-500/10', 'border-amber-500/25'],
      danger: ['bg-destructive/10', 'border-destructive/50'],
    } as const;
    for (const [tone, classes] of Object.entries(expected)) {
      cleanup();
      render(<Callout tone={tone as 'info'}>body</Callout>);
      const el = screen.getByText('body').closest('div')!;
      for (const c of classes) expect(el.className, `${tone}`).toContain(c);
    }
  });

  it('defaults to info', () => {
    render(<Callout>body</Callout>);
    expect(screen.getByText('body').closest('div')!.className).toContain('bg-accent/10');
  });

  it('an optional title sits above the body', () => {
    render(<Callout tone="warning" title="Before scanning:">Download Tailscale first.</Callout>);
    const title = screen.getByText('Before scanning:');
    const body = screen.getByText('Download Tailscale first.');
    expect(title.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

// ── Adoption ────────────────────────────────────────────────────────────────

const RENDERER = join(__dirname, '..', 'src', 'renderer');
const IN_SCOPE_DIRS = ['', 'development', 'ui'];

function inScopeFiles(): string[] {
  const files = [join(RENDERER, 'App.tsx')];
  for (const dir of IN_SCOPE_DIRS) {
    const abs = join(RENDERER, 'components', dir);
    for (const f of readdirSync(abs)) {
      if (f.endsWith('.tsx') && !f.includes('.test.')) files.push(join(abs, f));
    }
  }
  return files;
}

// WHY comments quote the recipe they replaced, so a raw-text guard fails on the
// explanation of its own fix. Blank comments out, preserving offsets.
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + ' '.repeat(m.length - p.length));
}

describe('callout adoption', () => {
  it('nothing in scope hand-rolls a callout surface', () => {
    // Matched on the SURFACE token, not a full class string: the geometry
    // classes around it were already inconsistent (rounded-md px-2.5 py-2 vs
    // rounded-lg p-3), so a string match would have missed half of them. Same
    // lesson as K1, where matching known-bad orderings found 3 of 6.
    const SURFACES = ['bg-amber-500/10', 'bg-accent/10', 'bg-destructive/10'];
    const offenders: string[] = [];
    for (const file of inScopeFiles()) {
      if (file.endsWith(join('ui', 'Callout.tsx'))) continue;
      const src = stripComments(readFileSync(file, 'utf8'));
      for (const s of SURFACES) {
        if (src.includes(s)) offenders.push(`${file.replace(RENDERER, '')}: ${s}`);
      }
    }
    expect(offenders, 'Passive information blocks go through <Callout>.').toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd desktop && npx vitest run tests/callout-authority.test.tsx
```

Expected: FAIL — `Cannot find module '../src/renderer/components/ui/Callout'`.

- [ ] **Step 3: Write the primitive**

Create `desktop/src/renderer/components/ui/Callout.tsx`:

```tsx
import React from 'react';

/**
 * K4 — the callout. Passive information, one geometry, three tones.
 *
 * Replaces two competing geometries that were doing the same job:
 * `rounded-md px-2.5 py-2` (3 sites) and `rounded-lg p-3` (2 sites), plus
 * SyncPanel's destructive banner, which was a full-bleed `border-b` strip.
 *
 * THERE IS NO ACTION SLOT, AND THAT IS THE POINT. A block that states something
 * AND offers a button to resolve it is a K5 status strip — a different role with
 * a different geometry (`bg-inset`, a status dot, a horizontal layout). The two
 * collapsed back into each other historically because nothing stopped a callout
 * from growing a button. The API stops it now: if you need an action here, you
 * are reaching for the wrong component.
 *
 * Tone preserves change 14's rule — accent means information, amber means
 * warning — and adds the danger tone the old set never had, which is why
 * SyncPanel had to hand-roll one.
 */

export type CalloutTone = 'info' | 'warning' | 'danger';

const TONE: Record<CalloutTone, { surface: string; body: string; title: string }> = {
  info: { surface: 'bg-accent/10 border-accent/25', body: 'text-fg-2', title: 'text-fg' },
  warning: { surface: 'bg-amber-500/10 border-amber-500/25', body: 'text-fg-2', title: 'text-amber-400' },
  // Status colors stay hardcoded per the standing rule; `destructive` is the one
  // exception because theme packs are expected to restyle their own red.
  danger: { surface: 'bg-destructive/10 border-destructive/50', body: 'text-destructive-fg', title: 'text-destructive-fg' },
};

export type CalloutProps = {
  tone?: CalloutTone;
  /** Optional bold lead-in line above the body. */
  title?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
};

export function Callout({ tone = 'info', title, className = '', children }: CalloutProps) {
  const t = TONE[tone];
  return (
    <div className={`rounded-lg p-3 border ${t.surface} ${className}`.trim()}>
      {title && <p className={`text-3xs font-medium mb-0.5 ${t.title}`}>{title}</p>}
      <p className={`text-xs ${t.body}`}>{children}</p>
    </div>
  );
}
```

- [ ] **Step 4: Export it**

In `desktop/src/renderer/components/ui/index.ts`, after the `SettingRow` block:

```ts
export { Callout } from './Callout';
export type { CalloutProps, CalloutTone } from './Callout';
```

- [ ] **Step 5: Run the render tests — they pass, adoption still fails**

```bash
cd desktop && npx vitest run tests/callout-authority.test.tsx
```

Expected: 4 passed, 1 failed (`callout adoption` lists 6 offenders).

- [ ] **Step 6: Migrate the six sites**

Find them:

```bash
cd desktop/src/renderer && rg -n "bg-amber-500/10|bg-accent/10|bg-destructive/10" components/SettingsPanel.tsx components/SyncPanel.tsx
```

Each becomes a `<Callout>`. The Tailscale one, as the worked example — replace:

```tsx
<div className="bg-amber-500/10 border border-amber-500/25 rounded-md px-2.5 py-2 mb-2">
  <p className="text-3xs text-amber-400 font-medium mb-0.5">Before scanning:</p>
  <p className="text-3xs text-fg-muted">Download Tailscale on your other device, sign in to the same account, and make sure it's running. The page won't load without it.</p>
</div>
```

with:

```tsx
<Callout tone="warning" title="Before scanning:" className="mb-2">
  Download Tailscale on your other device, sign in to the same account, and make sure it&apos;s running. The page won&apos;t load without it.
</Callout>
```

SyncPanel's is the tone that did not exist before:

```tsx
<Callout tone="danger">{errorMessage}</Callout>
```

Note it loses the full-bleed `border-b` strip shape and becomes an inset card like the others. That
is the intended change — it is the only callout in the family that was not a card.

Add the import to each file's existing `from './ui'` line.

- [ ] **Step 7: Verify**

```bash
cd desktop && npx tsc --noEmit && npx vitest run tests/callout-authority.test.tsx
```

Expected: tsc silent, 5 passed.

- [ ] **Step 8: Commit**

```bash
git add desktop/src/renderer/components/ui/Callout.tsx desktop/src/renderer/components/ui/index.ts \
        desktop/src/renderer/components/SettingsPanel.tsx desktop/src/renderer/components/SyncPanel.tsx \
        desktop/tests/callout-authority.test.tsx
git commit -m "refactor(ui): one callout geometry, three tones (K4)"
```

---

## Task 2: K6 — item lists, and the death of the bare glyph

**Files:**
- Modify: `desktop/src/renderer/components/SettingsPanel.tsx` — the connected-clients list, the saved-devices list, and the explainer copy at line ~68
- Test: `desktop/tests/item-list-authority.test.ts`

**Interfaces:**
- Consumes: `SettingRow` from `components/ui` (shipped in tranche 2) — `SettingRow({ variant: 'item', icon, title, description, control, accessory, value, onClick, ... })`.
- Produces: nothing new. This task only removes shapes.

Three bare glyphs survive change 41's sweep. **Only two are K6** — read the third before touching it:

| Site | What it is | Verdict |
|---|---|---|
| `SettingsPanel.tsx:~1239` | Disconnect a connected remote client | **K6.** Becomes `<Button size="sm">Disconnect</Button>`. |
| `SettingsPanel.tsx:~1967` | Remove a saved Android device | **K6.** Becomes `<Button size="sm">Remove</Button>`. |
| `SettingsPanel.tsx:~1256` | Close the "Add Device" sub-panel | **NOT K6** — it is a dismiss affordance on a container, not a per-item action. It should be `<CloseButton>`, which already exists and carries a label and focus ring. |

- [ ] **Step 1: Write the failing test**

Create `desktop/tests/item-list-authority.test.ts`:

```ts
// desktop/tests/item-list-authority.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

// Guard for K6 — item lists.
//
// The rule is one line: an action on a list item is a LABELLED <Button size="sm">,
// never a bare glyph. Change 41 banned hand-rolled glyph buttons and swept the
// app; three survived in the Remote Access lists, unlabelled and unfocusable —
// `text-fg-faint hover:text-red-400 text-sm leading-none px-1`, no aria-label,
// no focus ring, no hover surface. A screen reader announced them as "✕".

const RENDERER = join(__dirname, '..', 'src', 'renderer');
const IN_SCOPE_DIRS = ['', 'development', 'ui'];

function inScopeFiles(): string[] {
  const files = [join(RENDERER, 'App.tsx')];
  for (const dir of IN_SCOPE_DIRS) {
    const abs = join(RENDERER, 'components', dir);
    for (const f of readdirSync(abs)) {
      if ((f.endsWith('.tsx') || f.endsWith('.ts')) && !f.includes('.test.')) files.push(join(abs, f));
    }
  }
  return files;
}

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + ' '.repeat(m.length - p.length));
}

// Named, with the reason each is not a bare-glyph ACTION. An exemption you
// cannot see is how the inconsistency this test exists to stop got in.
const GLYPH_EXEMPT: Record<string, string> = {
  'RemoteUnsupportedNotice.tsx': 'dismisses the whole notice — a close affordance, not an item action',
  'QuickChips.tsx': 'attachment remove inside an input row; documented exception, see the WHY at its call site',
};

describe('item list actions', () => {
  it('no bare glyph survives as a list-item action', () => {
    const offenders: string[] = [];
    for (const file of inScopeFiles()) {
      const name = file.split(/[\\/]/).pop()!;
      if (name in GLYPH_EXEMPT) continue;
      const src = stripComments(readFileSync(file, 'utf8'));
      // The literal glyph as an element's only child.
      for (const m of src.matchAll(/>\s*✕\s*</g)) {
        offenders.push(`${file.replace(RENDERER, '')}:${src.slice(0, m.index).split('\n').length}`);
      }
    }
    expect(
      offenders,
      'A list-item action is a labelled <Button size="sm">. A container dismiss is <CloseButton>. '
        + 'Neither is a bare ✕ in a <button> with no accessible name.',
    ).toEqual([]);
  });

  it('every exemption still exists and still applies', () => {
    const byName = new Map(inScopeFiles().map((p) => [p.split(/[\\/]/).pop()!, p]));
    for (const [file, why] of Object.entries(GLYPH_EXEMPT)) {
      const abs = byName.get(file);
      expect(abs, `${file} is exempted but no longer in scope — drop it`).toBeTruthy();
      expect(
        stripComments(readFileSync(abs!, 'utf8')).includes('✕'),
        `${file} (${why}) no longer uses the glyph — drop it from GLYPH_EXEMPT`,
      ).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd desktop && npx vitest run tests/item-list-authority.test.ts
```

Expected: FAIL — `SettingsPanel.tsx` listed three times.

- [ ] **Step 3: Migrate the connected-clients row to K6**

In `SettingsPanel.tsx`, replace the hand-rolled client row:

```tsx
<div key={client.id} className="flex items-center justify-between py-1.5 px-2 rounded-sm bg-inset/50">
  <div>
    <span className="text-xs text-fg-2 font-mono">{client.ip}</span>
    <span className="text-3xs text-fg-muted ml-2">{timeAgo(client.connectedAt)}</span>
  </div>
  <button
    onClick={() => onDisconnectClient(client.id)}
    className="text-fg-faint hover:text-red-400 text-sm leading-none px-1"
    title="Disconnect"
  >
    ✕
  </button>
</div>
```

with a K6 row — `SettingRow` at `item` density, a status dot in the icon slot, and a labelled action:

```tsx
{/* K6: a connected client is an item list row — same object as a settings row,
    with a status dot in the icon slot. The action was a bare ✕ with no
    accessible name and no focus ring; change 41 banned those and this one
    survived the sweep. */}
<SettingRow
  key={client.id}
  variant="item"
  icon={<span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />}
  title={client.ip}
  description={timeAgo(client.connectedAt)}
  control={
    <Button variant="ghost" size="sm" onClick={() => onDisconnectClient(client.id)}>
      Disconnect
    </Button>
  }
/>
```

The IP is monospace today via `font-mono` on the title. `SettingRow` does not expose a title font,
so pass the value through the `value` slot instead if the monospace matters visually — decide by
looking at it in the dev instance, and record which you chose in the commit message.

- [ ] **Step 4: Migrate the saved-devices row to K6**

Same shape. The row currently wraps a `<button>` around the name/host so the whole thing connects,
with the ✕ beside it. `SettingRow` handles this: `onClick={() => doConnect(device)}` plus a
`control`, which makes the row a `<div>` with the control's click stopped from bubbling.

```tsx
<SettingRow
  key={`${device.host}:${device.port}`}
  variant="item"
  title={device.name}
  description={`${device.host}:${device.port}`}
  onClick={() => doConnect(device)}
  disabled={connecting || remoteConnected}
  control={
    <Button variant="ghost" size="sm" onClick={() => handleRemoveDevice(device)}>
      Remove
    </Button>
  }
/>
```

- [ ] **Step 5: Replace the Add Device dismiss with CloseButton**

This one is NOT a K6 action:

```tsx
<CloseButton onClick={() => onSetShowAddDevice(false)} label="Close Add Device" />
```

`CloseButton` is already imported in this file.

- [ ] **Step 6: Fix the copy that describes the control you just deleted**

`SettingsPanel.tsx:~68`, inside the Remote Access explainer bullets. Change:

```ts
{ term: 'Connected device should be removed', text: 'Use the ✕ next to a device under "Connected Devices" to disconnect it. They\'ll need the password again to reconnect.' },
```

to:

```ts
{ term: 'Connected device should be removed', text: 'Use the Disconnect button next to a device under "Connected Devices". They\'ll need the password again to reconnect.' },
```

**Do not skip this step or split it into another commit.** Help text that names a control which no
longer exists is exactly the drift `/audit` is built to find, and it costs one line to not create.

- [ ] **Step 7: Verify**

```bash
cd desktop && npx tsc --noEmit && npx vitest run tests/item-list-authority.test.ts
```

Expected: tsc silent, 2 passed.

- [ ] **Step 8: Commit**

```bash
git add desktop/src/renderer/components/SettingsPanel.tsx desktop/tests/item-list-authority.test.ts
git commit -m "refactor(ui): item-list rows and labelled actions (K6)"
```

---

## Task 3: K7 — the button that pretended to be a field

**Files:**
- Modify: `desktop/src/renderer/components/SettingsPanel.tsx` — the Project Folder section (~line 1622)
- Test: extends `desktop/tests/setting-row-authority.test.tsx` (no new file)

**Interfaces:**
- Consumes: `SettingRow` and `Button` from `components/ui`.
- Produces: nothing new.

Exactly one site. Today:

```tsx
<section>
  <h3 className="text-3xs font-medium text-fg-muted tracking-wider uppercase mb-2">Project Folder</h3>
  <button
    onClick={handleBrowseFolder}
    className="w-full text-left px-2.5 py-1.5 bg-inset border border-edge-dim rounded-md text-xs text-fg-2 hover:border-edge transition-colors truncate"
  >
    {defaults.projectFolder || 'Home directory (default)'}
  </button>
  {defaults.projectFolder && (
    <button
      onClick={() => onDefaultsChange({ projectFolder: '' })}
      className="text-3xs text-fg-muted hover:text-fg-2 mt-1"
    >
      Reset to home directory
    </button>
  )}
</section>
```

Nothing about it signals that clicking opens an OS picker — it is styled as a text field, so it
reads as editable. It is also a second K1-label-as-control-label violation of the kind K2 retired
twice already.

- [ ] **Step 1: Add the failing assertion**

Append to the `setting row adoption` describe block in `desktop/tests/setting-row-authority.test.tsx`:

```ts
  it('no control is styled as a field it is not', () => {
    // K7. The project folder rendered as a <button> wearing the FIELD surface —
    // bg-inset + border-edge-dim + rounded-md — so it looked typeable and was
    // not. A value chosen elsewhere (an OS picker, a dialog) is a K2 value row
    // plus a Change button, which reads as "here is the value, here is how to
    // change it".
    const offenders: string[] = [];
    for (const file of inScopeFiles()) {
      const src = stripComments(readFileSync(file, 'utf8'));
      // A <button> carrying the field surface, on one line.
      for (const m of src.matchAll(/className="[^"]*bg-inset border border-edge-dim[^"]*"/g)) {
        const openTag = src.lastIndexOf('<', m.index);
        if (src.slice(openTag, openTag + 8) === '<button') {
          offenders.push(`${file.replace(RENDERER, '')}:${src.slice(0, m.index).split('\n').length}`);
        }
      }
    }
    expect(offenders, 'A button must not wear the field surface — use a value row + Change.').toEqual([]);
  });
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd desktop && npx vitest run tests/setting-row-authority.test.tsx
```

Expected: FAIL — one offender in `SettingsPanel.tsx`.

- [ ] **Step 3: Replace with a value row plus a Change button**

```tsx
{/* K7: this was a <button> wearing the FIELD surface, so it read as a text
    field you could type into — nothing signalled that it opens an OS folder
    picker. As a value row with a Change button it says what it is and how to
    change it. The K1 "Project Folder" eyebrow was also labelling a single
    control, which is K2's title job (same violation as Skip Permissions). */}
<SettingRow
  variant="item"
  title="Project folder"
  description={defaults.projectFolder || 'Home directory (default)'}
  control={
    <div className="flex items-center gap-1 shrink-0">
      {defaults.projectFolder && (
        <Button variant="ghost" size="sm" onClick={() => onDefaultsChange({ projectFolder: '' })}>
          Reset
        </Button>
      )}
      <Button variant="secondary" size="sm" onClick={handleBrowseFolder}>
        Change
      </Button>
    </div>
  }
/>
```

The path moves into `description` rather than the `value` slot because a filesystem path is long and
must wrap; the `value` slot is `shrink-0` and would push the buttons off the row.

- [ ] **Step 4: Verify**

```bash
cd desktop && npx tsc --noEmit && npx vitest run tests/setting-row-authority.test.tsx
```

Expected: tsc silent, 13 passed.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/renderer/components/SettingsPanel.tsx desktop/tests/setting-row-authority.test.tsx
git commit -m "refactor(ui): project folder is a value row, not a fake field (K7)"
```

---

## Task 4: K12 — the explainer stops owning dialog chrome

**Files:**
- Modify: `desktop/src/renderer/components/SettingsExplainer.tsx` — delete the header and the scroll body
- Modify: `desktop/src/renderer/components/ContextPopup.tsx`, `desktop/src/renderer/components/ThemeScreen.tsx`, `desktop/src/renderer/components/SettingsPanel.tsx`, `desktop/src/renderer/components/SyncPanel.tsx` — the four hosts
- Test: `desktop/tests/explainer-shell.test.tsx`

**Interfaces:**
- Consumes: `Dialog` from `components/ui` — specifically `onBack?: () => void`, which tranche 2 added for exactly this and which currently has zero call sites.
- Produces: `SettingsExplainer({ intro, sections }): JSX.Element` — **`title`, `onBack` and `onClose` are removed from its props**, because Dialog now supplies all three. Hosts pass `title={`About ${name}`}` and `onBack` to `<Dialog>` instead.

`SettingsExplainer` predates `<Dialog>`. It hand-rolls a header (`SettingsExplainer.tsx:51-66`), its
own `useScrollFade` body, and its own `useEscClose` — the three things D1 exists to own. Every host
passes `scrollBody={false}` and surrenders the panel to it.

- [ ] **Step 1: Write the failing test**

Create `desktop/tests/explainer-shell.test.tsx`:

```tsx
// @vitest-environment jsdom
// desktop/tests/explainer-shell.test.tsx
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import SettingsExplainer from '../src/renderer/components/SettingsExplainer';

// Guard for K12 — the explainer renders a payload, and nothing else.
//
// The spec framed K12 as consolidating five mechanisms. By the time tranche 3
// started, four of the five already shared this component and the same
// {intro, sections} payload, so that work was done. What was NOT done is that
// this component predates <Dialog> and hand-rolled the header, the scroll body
// and the Esc handler — the exact three things D1 was built to own, and the
// same "the caller must remember to wrap it" shape that made two of
// SettingsPopup's seven callers ship un-scrollable dialogs.

afterEach(cleanup);

const SECTIONS = [{ heading: 'What it does', paragraphs: ['It explains things.'] }];

describe('SettingsExplainer', () => {
  it('renders the payload', () => {
    render(<SettingsExplainer intro="An intro." sections={SECTIONS} />);
    expect(screen.getByText('An intro.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'What it does' })).toBeInTheDocument();
    expect(screen.getByText('It explains things.')).toBeInTheDocument();
  });

  it('section headings are h3, matching K1', () => {
    // The dialog title is h2, so an explainer heading must be h3 or it would
    // announce as a sibling of the dialog's own name rather than its child.
    render(<SettingsExplainer intro="i" sections={SECTIONS} />);
    expect(screen.getByRole('heading', { name: 'What it does' }).tagName).toBe('H3');
  });

  it('owns no dialog chrome', () => {
    render(<SettingsExplainer intro="i" sections={SECTIONS} />);
    expect(screen.queryByRole('heading', { level: 2 }), 'header belongs to Dialog').toBeNull();
    expect(screen.queryByRole('button', { name: /close/i }), 'close belongs to Dialog').toBeNull();
    expect(screen.queryByRole('button', { name: /back/i }), 'back belongs to Dialog').toBeNull();
    expect(document.querySelector('.scroll-fade'), 'the scroll body belongs to Dialog').toBeNull();
  });
});

describe('explainer hosts', () => {
  const HOSTS = ['ContextPopup.tsx', 'ThemeScreen.tsx', 'SettingsPanel.tsx', 'SyncPanel.tsx'];
  const COMPONENTS = join(__dirname, '..', 'src', 'renderer', 'components');

  it('every host routes the explainer through Dialog, not around it', () => {
    // scrollBody={false} beside a <SettingsExplainer> means the host is still
    // handing the whole panel over — the state this task exists to end.
    const offenders: string[] = [];
    for (const host of HOSTS) {
      const src = readFileSync(join(COMPONENTS, host), 'utf8');
      if (!src.includes('<SettingsExplainer')) continue;
      if (src.includes('onBack=')) continue;
      offenders.push(host);
    }
    expect(offenders, 'Hosts pass onBack to <Dialog>; the explainer is body content.').toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd desktop && npx vitest run tests/explainer-shell.test.tsx
```

Expected: FAIL — `owns no dialog chrome` finds an h2 and a close button; `explainer hosts` lists all four.

- [ ] **Step 3: Strip the chrome out of SettingsExplainer**

Replace the whole component body in `desktop/src/renderer/components/SettingsExplainer.tsx` (keep
the `ExplainerBullet` / `ExplainerSection` types and `InfoIconButton` exactly as they are):

```tsx
interface Props {
  /** One- or two-sentence opening summary. */
  intro: string;
  sections: ExplainerSection[];
}

/**
 * Renders the explainer payload — and nothing else.
 *
 * This used to carry its own header (back chevron + "About {title}" + close),
 * its own useScrollFade body and its own Esc handler, because it predates
 * <Dialog>. D1 owns all three now, so hosts render this as ordinary body
 * content and pass `title` + `onBack` to the Dialog instead. That also means the
 * explainer picks up the shell's edge fades and height cap for free, rather than
 * each host remembering to wire them.
 */
export default function SettingsExplainer({ intro, sections }: Props) {
  return (
    <>
      <p className="text-xs text-fg-2 leading-relaxed">{intro}</p>
      {sections.map((section, i) => (
        <section key={i}>
          <h3 className="text-3xs font-medium text-fg-muted tracking-wider uppercase mb-2">
            {section.heading}
          </h3>
          {section.paragraphs?.map((p, j) => (
            <p key={j} className="text-xs text-fg-2 leading-relaxed mb-2 last:mb-0">{p}</p>
          ))}
          {section.bullets && (
            <ul className="space-y-1.5 mt-1">
              {section.bullets.map((b, j) => (
                <li key={j} className="text-xs text-fg-2 leading-relaxed pl-3 relative before:content-['•'] before:absolute before:left-0 before:text-fg-faint">
                  {b.term && <span className="font-semibold text-fg">{b.term}</span>}
                  {b.term && ' — '}
                  {b.text}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </>
  );
}
```

Delete the now-unused `useScrollFade`, `useEscClose` and `CloseButton` imports.

- [ ] **Step 4: Move each host onto Dialog's header**

ContextPopup is the worked example. It becomes:

```tsx
<Dialog
  open
  onClose={onClose}
  size="prompt"
  title={showInfo ? 'About Context' : 'Context'}
  onBack={showInfo ? () => setShowInfo(false) : undefined}
  headerActions={showInfo ? undefined : <InfoIconButton onClick={() => setShowInfo(true)} />}
  scrollBody={showInfo}
>
  {showInfo ? (
    <SettingsExplainer intro={INFO_INTRO} sections={INFO_SECTIONS} />
  ) : (
    <>{/* unchanged main view */}</>
  )}
</Dialog>
```

Note `scrollBody={showInfo}`: the explainer wants the shell's scroll body, the main view still owns
its own surface. Apply the same shape to ThemeScreen, SettingsPanel (Remote Access) and SyncPanel —
each already keeps a `showInfo` boolean and an `InfoIconButton`.

- [ ] **Step 5: Verify**

```bash
cd desktop && npx tsc --noEmit && npx vitest run tests/explainer-shell.test.tsx tests/dialog-shell.test.tsx
```

Expected: tsc silent, all passed.

- [ ] **Step 6: Commit**

```bash
git add desktop/src/renderer/components/SettingsExplainer.tsx desktop/src/renderer/components/ContextPopup.tsx \
        desktop/src/renderer/components/ThemeScreen.tsx desktop/src/renderer/components/SettingsPanel.tsx \
        desktop/src/renderer/components/SyncPanel.tsx desktop/tests/explainer-shell.test.tsx
git commit -m "refactor(ui): the explainer renders a payload, Dialog owns the chrome (K12)"
```

---

## Task 5: Full verification and the residue record

**Files:**
- Modify: this plan (status frontmatter), `ROADMAP.md`

- [ ] **Step 1: Full suite, typecheck, build**

```bash
cd desktop && npx tsc --noEmit && npx vitest run && npx vite build
```

Expected: 3447 + ~20 new tests passing, tsc silent, build succeeds.

- [ ] **Step 2: Visual check in a dev instance**

```bash
bash scripts/run-dev.sh <branch> --label "Menu Tranche 3" --offset 200 --profile dev-menu3
```

Look at, in order: Remote Access (5 of the 6 callouts, both K6 lists, the Add Device dismiss),
Backup & Sync (the danger callout, which changes shape most), Session Defaults (the project folder),
and each of the four explainers via its (i) button — confirm Back returns to the main view and the
panel does not jump height.

- [ ] **Step 3: Record what this tranche did NOT do**

Add to the plan's residue section and to `ROADMAP.md`: K5 and K9 remain, gated on a copy pass; the
ContextPopup footer restructure goes with K9; `HowContextWorksPopup.tsx` is a fifth explainer
mechanism living on the out-of-scope project-view surface; `AnchorTip` survives in
ModelProvidersPopup as an inline hint, which spec K12 explicitly permits.

- [ ] **Step 4: Commit**

```bash
git add docs/active/plans/2026-07-28-menu-internals-tranche-3.md ROADMAP.md
git commit -m "docs(plan): tranche 3 complete, K5/K9 remain gated on a copy pass"
```

---

## Deferred to tranche 4 — needs Destin's words, not Claude's

**K5 — status strip.** Remote Access has eight setup branches, currently loose `<p>` tags,
`animate-pulse` prose, centered green text and full-width buttons stacked mid-scroll. Each becomes a
status strip with a dot, a message and an optional action. **Every one of those messages is new
copy**, and `docs/error-message-standards.md` binds the failure branches: specific and accurate, or
general and non-committal with Report bug / Diagnose with Claude. Claude guessing eight status
sentences is exactly the failure that standard exists to prevent.

**K9 — danger zone.** Three bespoke zones (SkipPermissions' amber block with its raw `#DD4444`
heading and `&#9888;` glyph, AccountSection's arm/confirm, LocalModelsSection's arm/confirm). The
shape is decided — K1 label, K4 danger callout, control, always last, callout and control together.
What is not decided is the consequence sentence for each, which the same standard governs.

**K11 — footer.** Only one real dialog footer remains (ContextPopup's), and moving its warning out
of the footer and into the body beside the Clear button IS the K9 "callout and control stay
together" fix. K11 has nothing independent left to do; fold it into K9.

---

## Self-Review

**Spec coverage.** K4 ✓ Task 1. K6 ✓ Task 2. K7 ✓ Task 3. K12 ✓ Task 4 — though scoped to what is
actually left rather than what the ledger claims. K5, K9, K11 explicitly deferred with the gate
named, not skipped. The spec's K6 line "same object for: remote devices, model providers, connected
accounts, sync spaces, saved Android devices, open tasks" is only partly covered: Tasks 2 handles
remote devices and saved Android devices. Model providers, connected accounts, sync spaces and open
tasks are on surfaces with their own in-flight structures (ProvidersSection, AccountSection's
sub-page, SyncPanel's space list, OpenTasksPopup) and are **listed as residue, not silently
dropped** — each is a K6 candidate whose row already has a bespoke layout that deserves its own
look.

**Placeholder scan.** No TBDs. Every code step carries the code. Task 2 Step 3 contains one
deliberate judgment call ("decide by looking at it, record which you chose") rather than a
placeholder — the monospace-vs-value-slot question genuinely cannot be answered without seeing it
rendered, and the step says exactly what to do and what to record.

**Type consistency.** `Callout` props (`tone`, `title`, `className`, `children`) are used
identically in Task 1 Steps 3 and 6. `SettingsExplainer`'s new props (`intro`, `sections`) match
between Task 4 Steps 1, 3 and 4, and the removal of `title`/`onBack`/`onClose` is stated in the
Interfaces block so a reader starting at Task 4 knows the hosts must change. `SettingRow`'s props
match the shipped component in `components/ui/SettingRow.tsx`.

**Risk.** Task 4 touches four dialogs' header wiring at once and the failure mode is visual, not
test-detectable — the guard proves the explainer owns no chrome, not that the result looks right.
Step 2 of Task 5 exists for that.
