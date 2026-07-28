---
status: shipped (unmerged) — all 5 tasks landed on feat/menu-internals-tranche-1, 2026-07-26
supersedes-status: live status for the whole workstream lives in the TRANCHE 2 plan
---

# Menu Internals — Tranche 1 (mechanical adoption) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> ## ✅ ALL FIVE TASKS SHIPPED (2026-07-26) — this document is now history.
>
> Landed on `feat/menu-internals-tranche-1` (unmerged, no PR). Destin reviewed them in a dev build
> and asked for a 4-item rework of Sound, which also shipped: the popup could not scroll, two
> independent preset lists became one behind a category toggle, the separate play button was
> removed (selecting a sound now plays it), and the whole tile became the hit target.
>
> **That reversal inverted `tests/sound-preview.test.ts`** — it now asserts that selecting DOES
> preview, because a picker you cannot hear is the original bug wearing different clothes. Do not
> "fix" it back.
>
> Two counts in this plan were wrong when written, and the corrections matter more than the numbers:
> K1 was **~90 sites in SIX orderings**, not 78 in three — the enumerating grep matched only the
> orderings someone had already thought of, which is why the guard now asserts on the CLASS SET.
> K10's `animate-pulse` population was 17, not 9; only 4 were real loading text.
>
> **Live status for the whole workstream is in the tranche 2 plan**, not here.

**Goal:** Land the five D2-independent items of the menu-internals kit — one section-label recipe, no decorative dividers, the Sound audition fix, `SegmentedTabs` adoption, and `LoadingState` adoption — each with a source-text guard test so the idiom cannot come back.

**Architecture:** Pure adoption and normalization. **No new components are created.** Every primitive this tranche uses (`SegmentedTabs`, `LoadingState`) already ships in `components/ui/` with call sites. The work is replacing hand-rolled equivalents and adding guard tests in the established `tests/*-authority.test.ts` style — source-text assertions, not render tests, because the failure mode is a future session hand-rolling the idiom again in a new file, which renders perfectly and only surfaces as drift months later.

**Tech Stack:** React 19 + TypeScript, Tailwind v4 (semantic CSS-variable tokens), Vitest 4, Electron 41. The renderer is shared with the Android WebView — every change here ships on both platforms.

---

## START HERE (cold-start orientation)

*Written for a session with no memory of the design conversation. Everything needed is on disk.*

**What this is.** Destin asked for consistent settings/status-bar popups. The finding: the real
problem was not the popup chrome but that **no vocabulary existed for what goes inside a menu** — so
every menu invented its own row, button group, and callout. "Pick one of N" had 7 designs; a toggle
row had 5; explaining something to the user had 5 mechanisms. The design system that came out of it
is 12 roles (K1–K12), each with one recipe.

**Read in this order:**
1. `docs/active/specs/2026-07-26-menu-internals-design-system.md` — **§0 first** (it corrects three
   counts from the draft), then §1 for the exact recipes, then §6 for the ledger.
2. This plan. Tasks are ordered; Task 3 must precede Task 4 (it removes two of Task 4's sites).
3. Optional visual reference: <https://claude.ai/code/artifact/7e886cfc-9957-4e5f-918d-3d83bd77e0a6>
   — every role today-vs-proposed, all 16 menus rebuilt, in 5 themes.

**Decisions already made — do not relitigate:**
- **D2 = A** (drawer + modals). Approved 2026-07-26. Accepted cost: 6 modal-on-modal sites and up to
  2 stacked scrims remain. B and C stay available later; A is a strict subset of B.
- **D4 shipped** in tranche 6 — type tokens exist. It is not a prerequisite any more.
- The whole 2026-07-16 UI-consistency workstream **closed** (tranche 8, youcoded PR #252). Nothing
  in this plan overlaps it.

**Repo state at time of writing (verify before starting — it will have moved):**
- Workspace `youcoded-dev` @ `b72b8a1`, clean.
- Sub-repo `youcoded` was **23 commits behind** `origin/master`, and its working tree carries
  **another session's uncommitted** `desktop/knip.json` + a `package.json` `allowScripts` block.
  **Do not stash, revert, or commit those.** Branch from `origin/master`, not from the working tree.

**Setup:**
```bash
cd /home/destin/youcoded-dev/youcoded
git fetch origin
git worktree add ../wt-menu-tranche1 -b feat/menu-internals-tranche-1 origin/master
cd ../wt-menu-tranche1/desktop && npm ci
```
Do **not** junction `node_modules` on this machine (Linux) — that hazard is Windows-only, but a
plain `npm ci` in the worktree is the safe path either way.

**Verification loop for every task:** `npx vitest run tests/<the-new-test>.ts` → `npm test` →
`npm run build`. Never claim a task passes without running these and reading the output.

**Do not launch the built app to check anything.** All runtime verification goes through
`bash scripts/run-dev.sh <branch> --label "Menu Tranche 1"` from the workspace root. Destin's
installed YouCoded is his working environment and is off-limits — see
`.claude/rules/live-app-safety.md`.

**One open judgment call, flagged not resolved:** Task 3 turns Sound's 15 wrap-flowed chips into 15
full-width rows, so that section gets noticeably taller. The spec's §3 render pairs it with a
category switcher so only one list shows at a time, but that switcher is a tranche-3 restructure. In
tranche 1 the popup just gets long. Ship it and let Destin eyeball it; do not invent the switcher
here.

---

## Global Constraints

- **Spec:** `docs/active/specs/2026-07-26-menu-internals-design-system.md`. D2 = **A** (drawer + modals), decided 2026-07-26. This tranche is D2-independent, so nothing here depends on that.
- **Worktree required.** Per workspace CLAUDE.md, work beyond a handful of lines goes in a separate git worktree. Create one off `youcoded` master before Task 1.
- **Sync first.** `youcoded` is behind `origin/master`; the working tree also carries another session's uncommitted `desktop/knip.json` + `package.json` `allowScripts` block. **Do not stash or revert those.** Branch from `origin/master` directly.
- **Type tokens exist.** `--text-2xs: 11px` / `--text-3xs: 10px` / `--text-4xs: 9px`, `globals.css:229-231`. Never write `text-[Npx]` — `tests/type-scale-authority.test.ts` fails on it.
- **Every button goes through `<Button>`.** A caller's `className` REPLACES base tokens by conflict group via `mergeClasses`; it does not pile on.
- **Status colors stay hardcoded** (green/amber/red/blue). Only surface/text/border colors use semantic tokens.
- **Annotate non-trivial edits with a WHY comment.** Destin is a non-developer and relies on them.
- **Guard tests must `stripComments` before asserting.** WHY comments necessarily quote the idiom they replaced; a raw grep flags the very note explaining the fix. This trap has bitten three existing guard tests — copy the helper verbatim from `tests/type-scale-authority.test.ts`.
- **Never write misleading error messages, and never hand-roll one.** `<ErrorState>`
  (`components/ui/states.tsx`) renders both approved shapes: `mode="recoverable"` (specific message +
  Retry) and `mode="general"` (the two-action Report bug / Diagnose card). Workspace CLAUDE.md was
  updated 2026-07-26 to make this explicit.
- **Tranche boundary.** This plan is K1, K8, K3, K10 and the Sound bug — nothing else. K2/K6/K7 wait
  for D1's shell (tranche 2); K4/K5/K9/K11/K12 are per-menu restructures gated on a copy pass
  (tranche 3). If a task tempts you into restyling a row, stop — that is tranche 2.

## File Structure

**Modified (renderer):**
- `src/renderer/components/SettingsPanel.tsx` — Sound preset selector, keep-awake group, default-model group, two Tailscale loading strings
- `src/renderer/components/PreferencesPopup.tsx` — editor-mode group
- `src/renderer/components/AboutPopup.tsx`, `AccountSection.tsx`, `ModelProvidersPopup.tsx`, `PerformancePopup.tsx` — decorative `<hr>` removal
- `src/renderer/components/ShareSheet.tsx`, `ThemeShareSheet.tsx` — "Generating…" loading text
- ~78 files carrying a section-label class string (Task 1 enumerates them by grep)
- `src/renderer/utils/sounds.ts` — `SoundPreset.desc` field

**Created (tests):**
- `desktop/tests/section-label-authority.test.ts`
- `desktop/tests/choice-group-authority.test.ts`
- `desktop/tests/sound-preview.test.ts`

**Not touched:** `MarkdownContent.tsx:130`'s `<hr>` renders an actual markdown `---` rule. It is not a menu divider. Leave it.

---

### Task 1: One section-label recipe (K1)

The largest item in the kit: **78 sites across 3 orderings**. Tailwind class order is semantically irrelevant but textually decisive, which is why the original audit found only ~30 — it grepped one ordering.

**Files:**
- Modify: ~78 files under `src/renderer/` (enumerated by the grep in Step 1)
- Create: `desktop/tests/section-label-authority.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: the canonical string `text-3xs font-medium text-fg-muted tracking-wider uppercase`, asserted by the new guard test. Tasks 2–5 rely on it only inasmuch as they must not reintroduce a variant.

- [ ] **Step 1: Enumerate the three variants**

```bash
cd youcoded/desktop/src/renderer
echo "canonical:"; grep -rn --include="*.tsx" "text-3xs font-medium text-fg-muted tracking-wider uppercase" . | wc -l
echo "reversed: "; grep -rn --include="*.tsx" "uppercase tracking-wider text-fg-muted" . | wc -l
echo "oversized:"; grep -rn --include="*.tsx" "text-xs font-medium text-fg-muted tracking-wider uppercase" . | wc -l
```

Expected: `22`, `49`, `7` (78 total). If the numbers differ, master moved — re-derive before continuing; do not proceed on stale counts.

- [ ] **Step 2: Write the failing guard test**

Create `desktop/tests/section-label-authority.test.ts`:

```typescript
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';

// Guard for K1 (menu-internals tranche 1): a section label has ONE spelling.
//
// Before this, 78 sites wrote the same four classes in three different orders
// plus two wrong elements (<h4>, and <label> with no htmlFor — an a11y defect
// hiding inside a styling inconsistency). Tailwind class order is semantically
// irrelevant but textually decisive, which is exactly why the original audit
// counted 30 and missed a 49-site variant.
//
// Source-text assertion, not a render test: the failure mode is a future session
// typing the classes in a new order in a new file. It renders identically and
// only shows up as drift.

const RENDERER = join(__dirname, '..', 'src', 'renderer');

const CANONICAL = 'text-3xs font-medium text-fg-muted tracking-wider uppercase';

// The orderings K1 retired. Each renders identically to CANONICAL.
const RETIRED_ORDERINGS = [
  'uppercase tracking-wider text-fg-muted',
  'text-xs font-medium text-fg-muted tracking-wider uppercase',
];

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : [];
  });
}

const FILES = walk(RENDERER).map((path) => ({
  path,
  src: stripComments(readFileSync(path, 'utf8')),
}));

describe('section label authority', () => {
  it('no retired class ordering ships', () => {
    const offenders: string[] = [];
    for (const { path, src } of FILES) {
      for (const ordering of RETIRED_ORDERINGS) {
        if (src.includes(ordering)) {
          offenders.push(`${path.replace(RENDERER, '')} → "${ordering}"`);
        }
      }
    }
    expect(
      offenders,
      `Section labels have one spelling: "${CANONICAL}". `
        + 'Same classes in a different order render identically and defeat every future grep.',
    ).toEqual([]);
  });

  it('the canonical recipe is actually in use', () => {
    // Sanity: if this reads zero the walk broke and the test above is vacuous.
    const users = FILES.filter(({ src }) => src.includes(CANONICAL));
    expect(users.length).toBeGreaterThan(15);
  });
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `cd youcoded/desktop && npx vitest run tests/section-label-authority.test.ts`
Expected: FAIL — `no retired class ordering ships` lists ~56 offenders across both retired orderings.

- [ ] **Step 4: Rewrite the 49 reversed-order sites**

For each hit from Step 1's `reversed` grep, replace the class fragment with the canonical order. The classes are otherwise identical, so this is a pure reorder — **zero visual change**.

Worked example, `components/OpenTasksPopup.tsx:99`:

```diff
-    <div className="text-3xs uppercase tracking-wider text-fg-muted px-2 pt-2 pb-1">
+    <div className="text-3xs font-medium text-fg-muted tracking-wider uppercase px-2 pt-2 pb-1">
```

Note this variant often lacks `font-medium` — add it; that is the one real visual change in this task and it is the intended one (the canonical recipe is the 22-site plurality).

- [ ] **Step 5: Rewrite the 7 oversized sites**

`text-xs` → `text-3xs`. Worked example, `components/PreferencesPopup.tsx:145`:

```diff
-              <label className="block text-xs font-medium text-fg-muted tracking-wider uppercase mb-2">
+              <h3 className="block text-3xs font-medium text-fg-muted tracking-wider uppercase mb-2">
                 Default Permission Mode
-              </label>
+              </h3>
```

The element changes too: these `<label>`s have no `htmlFor`, so they announce as form labels pointing at nothing. `<h3>` is correct and gives screen readers a real heading outline.

- [ ] **Step 6: Fix the two wrong elements**

`components/ModelProvidersPopup.tsx:143` — the app's only `h4`-as-section-header:

```diff
-      <h4 className="text-sm font-semibold text-fg">{title}</h4>
+      <h3 className="text-3xs font-medium text-fg-muted tracking-wider uppercase">{title}</h3>
```

`components/AboutPopup.tsx` — its `<h4>` uppercase labels (lines 121, 143, 210) become `<h3>` with the canonical string.

- [ ] **Step 7: Run the guard test and the full suite**

Run: `cd youcoded/desktop && npx vitest run tests/section-label-authority.test.ts && npm test`
Expected: the new file PASSES; the full suite PASSES with no new failures.

- [ ] **Step 8: Commit**

```bash
git add youcoded/desktop/tests/section-label-authority.test.ts youcoded/desktop/src/renderer
git commit -m "refactor(ui): one section-label recipe (K1)

78 sites wrote the same four classes in three orderings, plus <h4> and a
no-htmlFor <label> standing in as headings. Class order is semantically
irrelevant but textually decisive, which is why the original audit counted
30 and missed a 49-site variant.

Visual change is limited to adding font-medium where the reversed ordering
omitted it, and text-xs -> text-3xs on 7 sites. The <label> -> <h3> swap
fixes an a11y defect: those labels pointed at nothing.

Guard: tests/section-label-authority.test.ts"
```

---

### Task 2: No decorative dividers (K8)

**Files:**
- Modify: `src/renderer/components/AboutPopup.tsx:133,206` · `AccountSection.tsx:431,704` · `ModelProvidersPopup.tsx:120,124,128` · `PerformancePopup.tsx:167`

**Interfaces:**
- Consumes: Task 1's canonical section label — the labels are what replace the dividers as the separator.
- Produces: nothing consumed downstream.

- [ ] **Step 1: Confirm the 8 menu dividers, and the one to leave**

```bash
cd youcoded/desktop/src/renderer && grep -rn --include="*.tsx" "<hr" .
```

Expected: 9 hits. **`components/MarkdownContent.tsx:130` renders an actual markdown `---` and is NOT a menu divider — leave it.** The other 8 are the targets.

- [ ] **Step 2: Delete the 8 dividers**

Each is a standalone element inside a `space-y-*` stack, so deleting the line is the whole edit. Worked example, `components/PerformancePopup.tsx:167`:

```diff
-            {/* Visual divider between controls and explainer. */}
-            <hr className="border-edge-dim" />
-
             <p className="text-xs text-fg-2 leading-relaxed">{PERFORMANCE_EXPLAINER.intro}</p>
```

`components/ModelProvidersPopup.tsx:120,124,128` separate the three provider blocks, which already carry section headings from Task 1 — the headings are the separator now.

- [ ] **Step 3: Verify spacing did not collapse**

Run: `cd youcoded/desktop && npm run build`
Expected: build succeeds. Then confirm each edited parent still carries a `space-y-*` class — if any relied on the `<hr>` for its only vertical rhythm, add `space-y-5` to the parent rather than restoring the rule.

```bash
grep -n "space-y-" src/renderer/components/PerformancePopup.tsx src/renderer/components/AboutPopup.tsx \
  src/renderer/components/AccountSection.tsx src/renderer/components/ModelProvidersPopup.tsx
```

- [ ] **Step 4: Run the suite**

Run: `cd youcoded/desktop && npm test`
Expected: PASS, no new failures.

- [ ] **Step 5: Commit**

```bash
git add youcoded/desktop/src/renderer
git commit -m "refactor(ui): drop decorative dividers inside menu bodies (K8)

space-y-5 plus section labels already separate sections, and they do it
identically in every menu. Four idioms said 'new topic' -- <hr>, a bare
border-t div, a border-t on a wrapper, and nothing at all.

Inside a dialog the only border-t is now the footer and the only border-b
is the header. MarkdownContent's <hr> is untouched: it renders a real
markdown rule, not a menu divider."
```

---

### Task 3: Sound presets can be auditioned without assigning them

A functional bug, not a styling one. `onSelect(p.id); playPreview(p.id)` fire in the same handler, so the only way to hear a stock sound is to make it your notification sound. Fixing it also retires two of the five K3 sites, which is why it precedes Task 4.

**Files:**
- Modify: `src/renderer/utils/sounds.ts:133-149` (add `desc`), `src/renderer/components/SettingsPanel.tsx:331-368` (`PresetSelector`)
- Create: `desktop/tests/sound-preview.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `SoundPreset.desc?: string`. `PresetSelector` gains `onPreview: (id: string) => void` distinct from `onSelect: (id: string) => void`.

- [ ] **Step 1: Write the failing test**

Create `desktop/tests/sound-preview.test.ts`:

```typescript
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';
import { STOCK_PRESETS } from '../src/renderer/utils/sounds';

// Guard for the audition bug: hearing a preset must not assign it.
//
// PresetSelector fired onSelect(id) and playPreview(id) from ONE handler, so
// shopping through 15 presets meant overwriting the setting 15 times. Auditioning
// and assigning are different intents and need different affordances.

const PANEL = join(__dirname, '..', 'src', 'renderer', 'components', 'SettingsPanel.tsx');

describe('sound presets', () => {
  it('preview and select are not fired from the same handler', () => {
    const src = readFileSync(PANEL, 'utf8');
    expect(
      src,
      'Auditioning a sound must not assign it -- give preview its own control.',
    ).not.toMatch(/onSelect\([^)]*\);\s*playPreview\(/);
  });

  it('every stock preset carries a description', () => {
    expect(STOCK_PRESETS.length).toBeGreaterThan(10);
    for (const preset of STOCK_PRESETS) {
      expect(preset.desc, `${preset.id} needs a desc`).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd youcoded/desktop && npx vitest run tests/sound-preview.test.ts`
Expected: FAIL on both — the combined handler matches, and `desc` is undefined.

- [ ] **Step 3: Add `desc` to the preset type and data**

In `src/renderer/utils/sounds.ts`, add to the `SoundPreset` type:

```typescript
  /** Short tone signature shown under the label, e.g. "C5 → E5". Lifted from
   *  the trailing comments these definitions used to carry -- with 15 presets
   *  in one list, the label alone is not enough to tell them apart. */
  desc?: string;
```

Then lift each trailing comment into the data (first four shown; apply the same transform to all 15):

```typescript
export const STOCK_PRESETS: SoundPreset[] = [
  { id: 'chime',    label: 'Chime',    desc: 'C5 → E5',        play: twoTone([523.25, 659.25]) },
  { id: 'bell',     label: 'Bell',     desc: 'E5 → G5',        play: twoTone([659.25, 783.99], 'triangle') },
  { id: 'arpeggio', label: 'Arpeggio', desc: 'C5 → E5 → G5',   play: triTone([523.25, 659.25, 783.99]) },
  { id: 'soft',     label: 'Soft',     desc: 'A4 gentle',      play: pulse(440, 'sine', 0.25) },
  // ...remaining 11 follow the same pattern, each desc copied from its old trailing comment
];
```

- [ ] **Step 4: Split preview from select in `PresetSelector`**

Replace the body of `PresetSelector` (`SettingsPanel.tsx:331-368`) with a K6-shaped list — Radio assigns, ▶ auditions:

```tsx
function PresetSelector({ category, selectedId, onSelect, customName }: {
  category: SoundCategory;
  selectedId: string;
  onSelect: (id: string) => void;
  customName: string | null;
}) {
  return (
    <div className="space-y-1">
      {STOCK_PRESETS.map((p) => (
        <div key={p.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-inset/50">
          {/* Radio ASSIGNS. The play button AUDITIONS. Firing both from one
              handler meant you could not hear a sound without making it your
              notification sound -- 15 presets, 15 overwrites. */}
          <Radio
            checked={selectedId === p.id}
            onChange={() => onSelect(p.id)}
            aria-label={p.label}
          />
          <div className="flex-1 min-w-0">
            <div className="text-xs text-fg font-medium">{p.label}</div>
            {p.desc && <p className="text-3xs text-fg-muted -mt-0.5 font-mono">{p.desc}</p>}
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => playPreview(p.id)}
            aria-label={`Play ${p.label}`}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          </Button>
        </div>
      ))}
      {customName && (
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-inset/50">
          <Radio
            checked={selectedId === CUSTOM_SOUND_ID}
            onChange={() => onSelect(CUSTOM_SOUND_ID)}
            aria-label={customName}
          />
          <div className="flex-1 min-w-0">
            <div className="text-xs text-fg font-medium truncate">{customName}</div>
            <p className="text-3xs text-fg-muted -mt-0.5">Custom sound</p>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => playPreview(CUSTOM_SOUND_ID, category)}
            aria-label={`Play ${customName}`}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          </Button>
        </div>
      )}
    </div>
  );
}
```

Add `Radio` to the existing `./ui` import in `SettingsPanel.tsx` if it is not already there.

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd youcoded/desktop && npx vitest run tests/sound-preview.test.ts`
Expected: PASS, both cases.

- [ ] **Step 6: Run the full suite and build**

Run: `cd youcoded/desktop && npm test && npm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add youcoded/desktop/tests/sound-preview.test.ts youcoded/desktop/src/renderer
git commit -m "fix(sound): audition presets without assigning them

PresetSelector fired onSelect(id) and playPreview(id) from one handler, so
the only way to hear a stock sound was to make it your notification sound.
Shopping through the 15 presets overwrote the setting 15 times.

Radio assigns; a play button auditions. Presets also gain a desc field --
the tone signatures already existed as trailing comments on STOCK_PRESETS,
and with 15 rows the label alone does not distinguish them.

Guard: tests/sound-preview.test.ts"
```

---

### Task 4: Adopt `SegmentedTabs` for the remaining choice groups (K3)

**Files:**
- Modify: `src/renderer/components/PreferencesPopup.tsx:185-198` · `SettingsPanel.tsx:1130-1143` · `SettingsPanel.tsx:1514-1530`
- Create: `desktop/tests/choice-group-authority.test.ts`

**Interfaces:**
- Consumes: `SegmentedTabs` from `components/ui` — `{ tabs: readonly {id: string; label: React.ReactNode}[]; value: string; onChange: (id: string) => void; variant?: 'bare' | 'contained'; 'aria-label'?: string; className?: string }`. `label` is a `ReactNode`, so the default-model group can keep its inline `<ModelInfoTooltip>`.
- Produces: nothing consumed downstream.

- [ ] **Step 1: Write the failing guard test**

Create `desktop/tests/choice-group-authority.test.ts`:

```typescript
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';

// Guard for K3: "pick one of N" has one implementation.
//
// Seven hand-rolled groups shipped alongside SegmentedTabs -- 4 corner radii,
// 4 text sizes, 3 inactive treatments, for one function. Tranche 8 adopted the
// primitive in 2 places; this retires the rest.
//
// The retired signature is a flex-1 button carrying its own active/inactive
// pair. Matching on `bg-accent text-on-accent` alone would flag legitimate
// non-choice uses (badges, the InputBar send button), so the assertion is the
// full retired class fragments.

const RENDERER = join(__dirname, '..', 'src', 'renderer');

const RETIRED = [
  'flex-1 px-1.5 py-1 rounded-sm',
  'flex-1 px-1.5 py-1.5 rounded-sm',
  'flex-1 py-1.5 px-3 text-sm rounded',
  'px-2 py-1 rounded text-3xs',
];

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : [];
  });
}

const FILES = walk(RENDERER).map((path) => ({
  path,
  src: stripComments(readFileSync(path, 'utf8')),
}));

describe('choice group authority', () => {
  it('no hand-rolled segmented control ships', () => {
    const offenders: string[] = [];
    for (const { path, src } of FILES) {
      for (const fragment of RETIRED) {
        if (src.includes(fragment)) {
          offenders.push(`${path.replace(RENDERER, '')} → "${fragment}"`);
        }
      }
    }
    expect(
      offenders,
      'Pick-one-of-N goes through <SegmentedTabs>. '
        + '<=4 short options: segmented. Needs a description: radio list. >5: Select.',
    ).toEqual([]);
  });

  it('SegmentedTabs has real consumers', () => {
    const users = FILES.filter(
      ({ path, src }) => !path.includes(join('components', 'ui')) && src.includes('<SegmentedTabs'),
    );
    expect(users.length).toBeGreaterThanOrEqual(4);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd youcoded/desktop && npx vitest run tests/choice-group-authority.test.ts`
Expected: FAIL — 3 offenders (Task 3 already removed the `px-2 py-1 rounded text-3xs` pair), and only 2 `SegmentedTabs` consumers.

- [ ] **Step 3: Convert editor mode**

`components/PreferencesPopup.tsx:185-198`:

```tsx
              {/* K3: <=4 short options with no description -> segmented. */}
              <SegmentedTabs
                variant="contained"
                aria-label="Editor Mode"
                value={prefs.editorMode}
                onChange={(id) => save('editorMode', id as EditorMode)}
                tabs={[
                  { id: 'normal', label: 'Normal' },
                  { id: 'vim', label: 'Vim' },
                ]}
              />
```

Add `SegmentedTabs` to the existing `./ui` import.

- [ ] **Step 4: Convert keep-awake**

`components/SettingsPanel.tsx:1130-1143`:

```tsx
                        {/* K3: four short options -> segmented. */}
                        <SegmentedTabs
                          variant="contained"
                          aria-label="Keep awake"
                          value={String(config?.keepAwakeHours ?? 0)}
                          onChange={(id) => onSetKeepAwake(Number(id))}
                          tabs={KEEP_AWAKE_OPTIONS.map((opt) => ({
                            id: String(opt.value),
                            label: opt.label,
                          }))}
                        />
```

`SegmentedTabs` keys on `string`; `keepAwakeHours` is a number, so both directions convert at the boundary.

- [ ] **Step 5: Convert default model**

`components/SettingsPanel.tsx:1514-1530`. `label` is a `ReactNode`, so the tooltip rides along:

```tsx
                  {/* K3: three short options -> segmented. The info tooltip
                      rides in the label, which is a ReactNode. */}
                  <SegmentedTabs
                    variant="contained"
                    aria-label="Default Model"
                    value={defaults.model}
                    onChange={(id) => onDefaultsChange({ model: id })}
                    tabs={MODELS.map((m) => ({
                      id: m,
                      label: (
                        <>
                          {MODEL_LABELS[m] || m}
                          <ModelInfoTooltip model={m} />
                        </>
                      ),
                    }))}
                  />
```

- [ ] **Step 6: Run the guard test, suite, and build**

Run: `cd youcoded/desktop && npx vitest run tests/choice-group-authority.test.ts && npm test && npm run build`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add youcoded/desktop/tests/choice-group-authority.test.ts youcoded/desktop/src/renderer
git commit -m "refactor(ui): adopt SegmentedTabs for the remaining choice groups (K3)

Pick-one-of-N had seven implementations -- 4 corner radii, 4 text sizes, 3
inactive treatments -- while SegmentedTabs shipped as change 45 and sat at
2 call sites. This converts editor mode, keep-awake, and default model.

The rule that stops an eighth: <=4 short options -> segmented; any option
needing a description -> radio list; >5 -> Select.

Guard: tests/choice-group-authority.test.ts"
```

---

### Task 5: Adopt `LoadingState` for in-menu loading text (K10)

Scope is **4 sites**, not the 9 `animate-pulse` hits. The other 5 are status dots, a mascot, and game pieces — pulsing is correct there and they are not loading states.

**Files:**
- Modify: `src/renderer/components/SettingsPanel.tsx:1045,1050` · `ShareSheet.tsx:100` · `ThemeShareSheet.tsx:106`

**Interfaces:**
- Consumes: `LoadingState` from `components/ui` — `{ what: string; variant?: 'block' | 'inline'; className?: string }`. Copy always names the thing.
- Produces: nothing consumed downstream.

- [ ] **Step 1: Confirm the four text-as-loading sites**

```bash
cd youcoded/desktop/src/renderer && grep -rn --include="*.tsx" "animate-pulse" . | grep -iE "installing|authenticating|generating"
```

Expected: exactly the 4 sites above. Every other `animate-pulse` hit is a dot or a game piece — leave them.

- [ ] **Step 2: Convert the two Tailscale strings**

`components/SettingsPanel.tsx:1045` and `:1050`:

```diff
                         ) : setupStatus === 'installing' ? (
                           <div className="text-center py-1">
-                            <p className="text-xs text-fg-2 animate-pulse">Installing Tailscale...</p>
+                            <LoadingState what="Tailscale" variant="inline" />
                             <p className="text-3xs text-fg-muted mt-1">This may take a few minutes</p>
                           </div>
                         ) : setupStatus === 'authenticating' ? (
                           <div className="text-center py-1">
-                            <p className="text-xs text-fg-2 animate-pulse">Authenticating...</p>
+                            <LoadingState what="the Tailscale sign-in" variant="inline" />
                             <p className="text-3xs text-fg-muted mt-1">Check your browser to sign in to Tailscale</p>
                           </div>
```

`LoadingState` is already imported in this file (it renders at `:978`); confirm before adding.

- [ ] **Step 3: Convert the two share sheets**

`components/ShareSheet.tsx:100`:

```diff
-              <span className="text-xs text-fg-muted animate-pulse">Generating...</span>
+              <LoadingState what="the share image" variant="inline" />
```

`components/ThemeShareSheet.tsx:106`:

```diff
-              <span className="text-xs text-fg-muted animate-pulse">Generating preview...</span>
+              <LoadingState what="the preview" variant="inline" />
```

Add `LoadingState` to the `./ui` import in both files.

- [ ] **Step 4: Verify no loading text remains hand-rolled**

```bash
cd youcoded/desktop/src/renderer && grep -rn --include="*.tsx" "animate-pulse" . | grep -icE "installing|authenticating|generating"
```

Expected: `0`.

- [ ] **Step 5: Run the suite and build**

Run: `cd youcoded/desktop && npm test && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add youcoded/desktop/src/renderer
git commit -m "refactor(ui): route in-menu loading text through LoadingState (K10)

Four sites hand-rolled a loading state as animate-pulse prose while
ui/states.tsx shipped LoadingState. Copy now names the thing it is waiting
on, per the state-family rule.

Scope is deliberately 4 sites, not the 9 animate-pulse hits: the rest are
status dots, a mascot and game pieces, where pulsing is correct and there
is no loading state to adopt."
```

---

## Self-Review

**1. Spec coverage.** This plan implements the D2-independent subset only: K1 (Task 1), K8 (Task 2), K3 (Tasks 3–4), K10 (Task 5), plus the Sound audition bug from spec §4. **Deliberately deferred**, each with a reason:
- **K2/K6/K7 (row + list + field)** — these are the bulk of the visual change and touch every menu body. They want D1's shell landed first so rows are not restyled twice. Tranche 2.
- **K4/K5/K9/K11/K12 (callout, status strip, danger zone, footer, explainer)** — per-menu restructures. K12's mount point is settled by D2 = A, but the menu reorganisations still need the copy pass in spec §8 item 2. Tranche 3.
- **D1 (the `<Dialog>` shell)** — tranche 2, first task.
- **D4** — already shipped; §0 of the spec records this.

**2. Placeholder scan.** No "TBD", no "similar to Task N", no "add error handling". Every code step carries the code. Task 1's 78 sites are the one place I give a transform rule plus two worked examples rather than 78 diffs — the edit is a pure class-string reorder and listing every hit would be noise, but the enumerating grep is exact and Step 3 fails until all of them are done.

**3. Type consistency.** `SegmentedTabs` props match the real signature read from `origin/master` (`tabs`/`value`/`onChange`/`variant`/`aria-label`); `label` is `React.ReactNode`, which Task 4 Step 5 relies on for `ModelInfoTooltip`. `LoadingState` props match (`what`/`variant`). `SoundPreset.desc` is defined in Task 3 Step 3 and consumed in Step 4 of the same task. `onSelect`/`playPreview` keep their existing signatures.

**One risk flagged, not resolved:** Task 3 changes Sound's preset UI from 15 wrap-flowed chips to 15 full-width rows, which makes that section considerably taller. The spec's §3 render pairs it with a segmented category switcher so only one list shows at a time — but that switcher is a K2/K3 restructure belonging to tranche 3. **In tranche 1 the list renders under both categories, so the popup gets long.** Acceptable because the popup scrolls and the bug fix is worth shipping early; worth Destin's eye when he next opens Sound.

---

## Execution Handoff

Plan complete and saved to `docs/active/plans/2026-07-26-menu-internals-tranche-1.md`. Two execution options:

1. **Subagent-Driven (recommended)** — a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.
