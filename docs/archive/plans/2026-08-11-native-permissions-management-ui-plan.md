---
status: shipped
created: 2026-08-11
type: plan
spec: docs/active/specs/2026-08-11-native-permissions-management-ui.md
program: docs/active/plans/2026-08-11-native-sessions-remaining-work.md
milestone: M5 item 2a
---

# Permissions Management UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user see every "Always allow" they have granted to a native session, remove any of them, and have that removal take effect immediately — including in a session that is already running.

**Architecture:** Three phases, in order. **Phase 1 builds the entire UI in the UI Workbench against a fake `window.claude`**, with the three IPC channels registered in `MOCK_ONLY` — no backend exists yet, and Destin reviews the surface visually before any main-process code is written. **Phase 2** turns that `MOCK_ONLY` list into the real backend: store methods, a host-side revoke that reaches live sessions, and five-surface IPC. **Phase 3** is a separable honesty fix for "Always allow" on paths outside the project, which today records a rule that can never fire.

**Tech Stack:** TypeScript, React 18, Electron, Vitest, Tailwind (semantic CSS tokens), Kotlin (Android stub only).

## Global Constraints

Every task's requirements implicitly include this section.

- **Work in a git worktree.** `youcoded` sub-repo code never lands in the workspace repo. Create it before Task 1 (below).
- **Never canonicalize `ctx.cwd`.** The permission store is keyed by it; a spelling change orphans every remembered grant. (`.claude/rules/native-runtime.md`)
- **The removal API keys by SLUG, not cwd.** There is no cwd to pass for anything already on disk.
- **`permissions.json` stays `v: 1`.** Both new fields are optional; the reader already tolerates missing keys.
- **All `~/.youcoded/` JSON writes go through `NativeHome.mutateJson`** — the mkdir file lock is mandatory because the dev instance and built app share the home dir.
- **Every renderer control goes through a `components/ui` primitive.** Hand-rolling token classes fails `primitive-adoption.test.ts`.
- **No `.layer-surface` on repeated rows.** Pinned by `drawer-card-glass.test.ts`; shipped and reverted twice (`516411a5`, `1f68a7f0`).
- **No hover-only affordances.** `opacity-0 group-hover:` has no touch path; this screen is reachable from a phone over remote access.
- **No status glyphs (`●◐○`)** — plain-language state words.
- **640px is the only breakpoint**, via `useNarrowViewport()`; never hide a control as the narrow fix.
- **Copy is for non-developers.** Plain language, minimal, explain the confusing parts.
- **Annotate non-trivial edits with a WHY comment.**
- **`bash scripts/verify.sh <worktree>` runs on Linux only.** It cannot see the Windows/macOS break class. The three-platform CI matrix on the PR is the real gate.

## File Structure

**Phase 1 — renderer + workbench (no backend)**

| File | Responsibility |
|---|---|
| `src/renderer/hooks/useIpc.ts` (modify, `declare global` block ~`:291`) | Add the `permissions` namespace to the `Window['claude']` type. Type-only; the mock is typed as `Partial<Window['claude'][K]>`, so this must exist before the mock can compile. |
| `src/renderer/components/permissions/describe-rule.ts` (create) | Pure `PermissionRule → plain English`. No React. The DRY core of the list. |
| `src/renderer/components/permissions/permissions-explainer.ts` (create) | The `SettingsExplainer` `{ intro, sections }` payload. Data, not markup. |
| `src/renderer/components/PermissionsSection.tsx` (create) | The section. Follows `ProvidersSection.tsx`. |
| `src/renderer/components/SettingsPanel.tsx` (modify) | Mount the section + its `showInfo` explainer toggle. |
| `src/renderer/dev/workbench/fixtures/permissions.ts` (create) | Fixture factories. |
| `src/renderer/dev/workbench/scenarios.ts` (modify) | `MockState.permissions` + per-scenario seeds. |
| `src/renderer/dev/workbench/mock-shim.ts` (modify) | The `permissions` namespace, store-backed. |
| `src/renderer/dev/workbench/mock-only.ts` (modify) | Register the three channels. Currently empty — this feature is its first user. |

**Phase 2 — backend**

| File | Responsibility |
|---|---|
| `src/main/harness/permission-store.ts` (modify) | `list` / `remove` / `removeProject`; record `cwd` + `grantedAt`. |
| `src/main/harness/native-session-host.ts` (modify) | `revokeRule` — the single orchestrator for disk + live memory. |
| `src/main/ipc-handlers.ts` (modify) | Three handlers. |
| `src/main/preload.ts` (modify) | `window.claude.permissions`. |
| `src/renderer/remote-shim.ts` (modify) | Same shape over WebSocket. |
| `src/main/remote-server.ts` (modify) | One explicit WS `case` per channel. |
| `app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt` (modify) | Three strings into the existing not-implemented-on-mobile list. |
| `tests/ipc-channels.test.ts` (modify) | `permissions:*` parity block. |

**Phase 3 — honesty fix**

| File | Responsibility |
|---|---|
| `src/main/harness/harness-session.ts` (modify, `:1603`) | Don't emit `remember-rule` when the ask was forced by an external path; carry an `external` flag on the ask. |
| `src/renderer/components/ToolCard.tsx` (modify, `:826`) | Suppress the Always-allow button for an external ask. |

---

## Setup (before Task 1)

- [ ] **Create the worktree**

```bash
cd /home/destin/youcoded-dev/youcoded
git fetch origin && git pull origin master
git worktree add ../worktrees/native-permissions -b feat/native-permissions-ui
cd ../worktrees/native-permissions/desktop && npm ci
```

`npm ci` is required per worktree — `allowScripts` only approves `electron`, and without it the Electron binary is missing and `run-workbench.sh` fails at launch.

---

# PHASE 1 — UI in the workbench

## Task 1: Type surface, fixtures, and MOCK_ONLY registration

Scaffolding for every Phase 1 task. Ends with the workbench booting and the three channels callable against fake data.

**Files:**
- Modify: `src/renderer/hooks/useIpc.ts` (`declare global` block, near `:291`)
- Create: `src/renderer/dev/workbench/fixtures/permissions.ts`
- Modify: `src/renderer/dev/workbench/scenarios.ts`
- Modify: `src/renderer/dev/workbench/mock-shim.ts`
- Modify: `src/renderer/dev/workbench/mock-only.ts`
- Test: `tests/workbench-mock-only.test.ts` (existing guard), `scripts/workbench-boot-check.mjs`

**Interfaces:**
- Produces: `StoredRule`, `StoredProject`, `window.claude.permissions.{list,remove,removeProject}` — consumed by Tasks 2, 3, 9.

- [ ] **Step 1: Add the shared types**

Create the types next to the existing permission types so main and renderer share one definition. In `src/shared/permission-types.ts`, append:

```ts
/** A remembered rule as STORED — the engine's PermissionRule plus provenance
 *  the engine never reads. `grantedAt` is absent on every rule written before
 *  the management UI existed; the UI shows no date rather than inventing one. */
export interface StoredRule extends PermissionRule {
  /** ISO-8601. Absent on pre-existing rules. */
  grantedAt?: string;
}

/** One project's slice of permissions.json, as the management UI reads it.
 *  `cwd` is absent for entries written before the UI existed: cwdToProjectSlug
 *  collapses ':', '\', '/' AND spaces all to '-', so the original path is NOT
 *  recoverable from the slug. That is why removal keys by slug, not cwd. */
export interface StoredProject {
  slug: string;
  cwd?: string;
  rules: StoredRule[];
}
```

- [ ] **Step 2: Declare the renderer type surface**

In `src/renderer/hooks/useIpc.ts`, inside `declare global` → `interface Window` → `claude`, after the `providers` block (~`:298`):

```ts
      // Remembered "Always allow" rules (M5 2a). Keyed by PROJECT SLUG, not
      // cwd — permissions.json never stored the cwd, and the slug is lossy.
      permissions: {
        list: () => Promise<import('../../shared/permission-types').StoredProject[]>;
        remove: (slug: string, rule: import('../../shared/permission-types').PermissionRule) => Promise<boolean>;
        removeProject: (slug: string) => Promise<boolean>;
      };
```

- [ ] **Step 3: Write the fixtures**

Create `src/renderer/dev/workbench/fixtures/permissions.ts`:

```ts
import type { StoredProject } from '../../../../shared/permission-types';

// Fixed timestamps, not Date.now(): a seed that moves with the clock makes
// "granted 3 days ago" non-reproducible between design reviews (same reason
// scenarios.ts pins T0).
const T0 = 1_753_800_000_000;
const at = (daysAgo: number) => new Date(T0 - daysAgo * 86_400_000).toISOString();

/** Two projects, deliberately mixed. Row shapes that MUST stay represented:
 *  a tool-wide grant (no pattern), an MCP grant, and a legacy entry with no
 *  recorded cwd — a design that only works on tidy data looks fine without them. */
export function permissions(): StoredProject[] {
  return [
    {
      slug: '-home-destin-youcoded-dev-youcoded',
      cwd: '/home/destin/youcoded-dev/youcoded',
      rules: [
        { tool: 'Bash', pattern: 'git push origin master', action: 'allow', grantedAt: at(2) },
        { tool: 'Edit', pattern: 'desktop/src/renderer/App.tsx', action: 'allow', grantedAt: at(9) },
        // Tool-wide: no pattern. Must render as visibly broader than the rest.
        { tool: 'Write', action: 'allow', grantedAt: at(1) },
        { tool: 'mcp__github__create_issue', action: 'allow', grantedAt: at(14) },
      ],
    },
    {
      // No `cwd`: written before the management UI existed. The path is NOT
      // recoverable from the slug — the UI must say so rather than guess.
      slug: '-home-destin-notes',
      rules: [{ tool: 'Bash', pattern: 'rm -rf build', action: 'allow' }],
    },
  ];
}

/** Many rules, long subjects, and a worktree that shares a basename with its
 *  parent repo — the case that catches a heading using basename alone. */
export function stressPermissions(): StoredProject[] {
  const long = 'cd packages/renderer && npm run build -- --mode production --sourcemap --outDir ../../dist/renderer';
  return [
    ...permissions(),
    {
      slug: '-home-destin-youcoded-dev-worktrees-youcoded',
      cwd: '/home/destin/youcoded-dev/worktrees/youcoded',
      rules: Array.from({ length: 40 }, (_, i) => ({
        tool: i % 4 === 0 ? 'Bash' : 'Edit',
        pattern: i % 4 === 0 ? `${long} # ${i}` : `src/very/deeply/nested/path/to/module-${i}.ts`,
        action: 'allow' as const,
        ...(i % 3 === 0 ? { grantedAt: at(i) } : {}),
      })),
    },
  ];
}
```

- [ ] **Step 4: Wire the fixtures into the scenario state**

In `src/renderer/dev/workbench/scenarios.ts`:

1. Add the import beside the others at the top:
```ts
import { permissions as seedPermissions, stressPermissions } from './fixtures/permissions';
```
2. Add to `interface MockState`, after `defaults`:
```ts
  permissions: StoredProject[];
```
   plus `import type { StoredProject } from '../../../shared/permission-types';`
3. Add to the `base` object inside `seed()`:
```ts
    permissions: seedPermissions(),
```
4. In the `switch`, extend the two cases that already exist:
```ts
    case 'empty':
      return { ...base, sessions: [], past: [], tags: [], permissions: [] };
    ...
    case 'stress':
      return { ...base, past: stressPast(), permissions: stressPermissions() };
```

- [ ] **Step 5: Implement the mock namespace**

In `src/renderer/dev/workbench/mock-shim.ts`, inside `handWritten()`, after the `providers` namespace (~`:468`):

```ts
  // M5 2a. NO real backend yet — registered in MOCK_ONLY. Removal matches on
  // (tool, pattern, action) because remember() dedupes exact repeats, so that
  // triple is unique within a project; no rule id is needed.
  const permissions: Ns<'permissions'> = {
    list: async () => store.getState().permissions,
    remove: async (slug, rule) => {
      if (store.refuseWrites) return false;
      let hit = false;
      store.setState((s) => ({
        ...s,
        permissions: s.permissions.map((p) => {
          if (p.slug !== slug) return p;
          const rules = p.rules.filter((r) => {
            const match = r.tool === rule.tool && r.pattern === rule.pattern && r.action === rule.action;
            if (match) hit = true;
            return !match;
          });
          return { ...p, rules };
        }),
      }));
      return hit;
    },
    removeProject: async (slug) => {
      if (store.refuseWrites) return false;
      const hit = store.getState().permissions.some((p) => p.slug === slug);
      store.setState((s) => ({ ...s, permissions: s.permissions.filter((p) => p.slug !== slug) }));
      return hit;
    },
  };
```

Add `permissions` to the object returned at `:719`.

- [ ] **Step 6: Register the channels as mock-only**

In `src/renderer/dev/workbench/mock-only.ts`, replace the empty-list comment:

```ts
export const MOCK_ONLY: ReadonlyArray<{ channel: string; feature: string }> = [
  { channel: 'permissions.list', feature: 'permissions management UI (M5 2a)' },
  { channel: 'permissions.remove', feature: 'permissions management UI (M5 2a)' },
  { channel: 'permissions.removeProject', feature: 'permissions management UI (M5 2a)' },
];
```

- [ ] **Step 7: Verify the workbench boots**

```bash
cd desktop
npx tsc --noEmit
node scripts/workbench-boot-check.mjs
```
Expected: `tsc` clean; boot-check loads all seven routes with no console error. **The unit suite stayed green through three consecutive boot crashes — this check is the one that catches them.**

- [ ] **Step 8: Commit**

```bash
git add src/shared/permission-types.ts src/renderer/hooks/useIpc.ts src/renderer/dev/workbench/
git commit -m "feat(permissions): workbench fixtures + mock-only channels for the management UI"
```

## Task 2: Plain-language rule descriptions

A pure function, unit-tested, with no React. It is the piece most likely to be wrong in a way a visual review will not catch — an MCP grant that renders as a raw `mcp__github__create_issue` reads as a bug to a non-developer.

**Files:**
- Create: `src/renderer/components/permissions/describe-rule.ts`
- Test: `tests/describe-rule.test.ts`

**Interfaces:**
- Consumes: `PermissionRule` from `src/shared/permission-types.ts`
- Produces: `describeRule(rule): { verb: string; subject?: string; broad: boolean }` — consumed by Task 3.

- [ ] **Step 1: Write the failing test**

Create `tests/describe-rule.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { describeRule } from '../src/renderer/components/permissions/describe-rule';

describe('describeRule', () => {
  it('renders a Bash grant as the command it runs', () => {
    expect(describeRule({ tool: 'Bash', pattern: 'git push origin main', action: 'allow' }))
      .toEqual({ verb: 'Run', subject: 'git push origin main', broad: false });
  });

  it('renders file tools with their path', () => {
    expect(describeRule({ tool: 'Edit', pattern: 'src/a.ts', action: 'allow' }))
      .toEqual({ verb: 'Edit', subject: 'src/a.ts', broad: false });
    expect(describeRule({ tool: 'Write', pattern: 'src/b.ts', action: 'allow' }))
      .toEqual({ verb: 'Create or overwrite', subject: 'src/b.ts', broad: false });
  });

  it('names the server and tool for an MCP grant', () => {
    expect(describeRule({ tool: 'mcp__github__create_issue', action: 'allow' }))
      .toEqual({ verb: 'Use the create_issue tool from the github connection', broad: false });
  });

  // A server id containing a double underscore must not swallow the tool name.
  it('splits an MCP id on the FIRST separator after the prefix', () => {
    expect(describeRule({ tool: 'mcp__my__server__do_thing', action: 'allow' }).verb)
      .toBe('Use the server__do_thing tool from the my connection');
  });

  it('flags a pattern-less grant as broad', () => {
    expect(describeRule({ tool: 'Write', action: 'allow' }))
      .toEqual({ verb: 'Create or overwrite', subject: undefined, broad: true });
  });

  // The type permits deny; nothing writes one today, but the UI must not
  // render a deny rule as though it were a grant.
  it('describes a deny rule as a block', () => {
    expect(describeRule({ tool: 'Bash', pattern: 'sudo *', action: 'deny' }))
      .toEqual({ verb: 'Never run', subject: 'sudo *', broad: false });
  });

  it('falls back to the tool name for an unknown tool', () => {
    expect(describeRule({ tool: 'SomeFutureTool', pattern: 'x', action: 'allow' }))
      .toEqual({ verb: 'Use SomeFutureTool', subject: 'x', broad: false });
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
cd desktop && npx vitest run tests/describe-rule.test.ts
```
Expected: FAIL — cannot resolve `describe-rule`.

- [ ] **Step 3: Implement**

Create `src/renderer/components/permissions/describe-rule.ts`:

```ts
import type { PermissionRule } from '../../../shared/permission-types';

export interface RuleDescription {
  /** Plain-language action, e.g. "Run" or "Create or overwrite". */
  verb: string;
  /** The thing acted on. Absent for a tool-wide grant and for MCP tools,
   *  whose subject is already folded into `verb`. */
  subject?: string;
  /** True when the rule has no pattern, so it covers EVERY use of that tool.
   *  The UI must render this as visibly broader than a specific grant. */
  broad: boolean;
}

// WHY a lookup rather than the raw tool name: the store speaks in tool ids
// (Bash / Edit / Write), and YouCoded is built for non-developers — "Create or
// overwrite src/a.ts" is a sentence, "Write: src/a.ts" is a log line.
const VERBS: Record<string, string> = {
  Bash: 'Run',
  Edit: 'Edit',
  Write: 'Create or overwrite',
  Read: 'Read',
  Glob: 'Search for files in',
  Grep: 'Search the contents of',
  WebFetch: 'Fetch',
  WebSearch: 'Search the web for',
  Skill: 'Load the skill',
};

export function describeRule(rule: PermissionRule): RuleDescription {
  const broad = rule.pattern === undefined;

  // MCP grants are per-tool and namespaced `mcp__{server}__{tool}`. Split on the
  // FIRST '__' after the prefix: a server id may itself contain '__', and the
  // tool name is whatever remains.
  const mcp = /^mcp__(.+?)__(.+)$/.exec(rule.tool);
  if (mcp) {
    return { verb: `Use the ${mcp[2]} tool from the ${mcp[1]} connection`, broad };
  }

  const base = VERBS[rule.tool] ?? `Use ${rule.tool}`;
  // Nothing writes a deny rule today, but PermissionRule permits one — render it
  // as a block rather than silently as a grant.
  const verb = rule.action === 'deny' ? (rule.tool === 'Bash' ? 'Never run' : `Never ${base.toLowerCase()}`) : base;
  return { verb, subject: rule.pattern, broad };
}
```

- [ ] **Step 4: Run and confirm it passes**

```bash
npx vitest run tests/describe-rule.test.ts
```
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/permissions/describe-rule.ts tests/describe-rule.test.ts
git commit -m "feat(permissions): plain-language rule descriptions"
```

## Task 3: The PermissionsSection component

**Files:**
- Create: `src/renderer/components/PermissionsSection.tsx`
- Test: `tests/permissions-section.test.tsx`

**Interfaces:**
- Consumes: `describeRule` (Task 2), `window.claude.permissions` (Task 1)
- Produces: `<PermissionsSection />` default export — mounted by Task 4.

**Structure** (visual detail is deliberately NOT specified here — it is iterated in the workbench in Task 5, which is the point of the phase order):

- Loads via `window.claude.permissions.list()` in a `useEffect`, with `<ErrorState mode="general">` on failure (never a hand-rolled error card — see `docs/error-message-standards.md`).
- Empty state when no projects have rules. This is the common first-run case, so it must read as normal, not broken.
- One group per project. Heading is the cwd's basename when `cwd` is present, with the full path beneath; when `cwd` is absent the slug renders instead, with a line saying the folder was not recorded.
- Each rule is a flat row — **no `.layer-surface`** — carrying `describeRule()`'s verb, subject in `font-mono`, the granted date when present, and a `Button variant="danger-outline" size="sm"` labelled Remove that is **always visible**.
- Remove swaps in place for the inline confirm: consequence line "You'll be asked the next time this comes up." plus `secondary` Cancel / `danger` Remove. This mirrors `ProvidersSection.tsx:307-360` exactly.
- A per-project clear with the same inline-confirm treatment.
- A tool-wide grant (`broad: true`) is marked as covering every use of that tool.

- [ ] **Step 1: Write the failing test**

Create `tests/permissions-section.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import PermissionsSection from '../src/renderer/components/PermissionsSection';

const list = vi.fn();
const remove = vi.fn();
const removeProject = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  (globalThis as any).window.claude = { permissions: { list, remove, removeProject } };
});

describe('PermissionsSection', () => {
  it('groups rules by project and shows the folder name', async () => {
    list.mockResolvedValue([
      { slug: '-home-d-proj', cwd: '/home/d/proj', rules: [
        { tool: 'Bash', pattern: 'git push origin main', action: 'allow' },
      ] },
    ]);
    render(<PermissionsSection />);
    expect(await screen.findByText('proj')).toBeTruthy();
    expect(screen.getByText('/home/d/proj')).toBeTruthy();
    expect(screen.getByText(/git push origin main/)).toBeTruthy();
  });

  it('says so when the folder was never recorded', async () => {
    list.mockResolvedValue([
      { slug: '-home-d-notes', rules: [{ tool: 'Bash', pattern: 'ls', action: 'allow' }] },
    ]);
    render(<PermissionsSection />);
    expect(await screen.findByText(/folder wasn't recorded/i)).toBeTruthy();
  });

  it('marks a pattern-less grant as covering every use of the tool', async () => {
    list.mockResolvedValue([
      { slug: '-p', cwd: '/p', rules: [{ tool: 'Write', action: 'allow' }] },
    ]);
    render(<PermissionsSection />);
    expect(await screen.findByText(/every file/i)).toBeTruthy();
  });

  // The confirm is the guard against a mis-click revoking something the user
  // wanted. A single-click remove would be a regression, not a simplification.
  it('requires a confirm before removing, then calls remove with the SLUG', async () => {
    const rule = { tool: 'Bash', pattern: 'git push origin main', action: 'allow' };
    list.mockResolvedValue([{ slug: '-home-d-proj', cwd: '/home/d/proj', rules: [rule] }]);
    remove.mockResolvedValue(true);
    render(<PermissionsSection />);

    fireEvent.click(await screen.findByRole('button', { name: /^remove$/i }));
    expect(remove).not.toHaveBeenCalled();
    expect(screen.getByText(/asked the next time/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /^remove$/i }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith('-home-d-proj', rule));
  });

  it('keeps the row when the backend reports nothing matched', async () => {
    const rule = { tool: 'Bash', pattern: 'ls', action: 'allow' };
    list.mockResolvedValue([{ slug: '-p', cwd: '/p', rules: [rule] }]);
    remove.mockResolvedValue(false);   // stale list — the rule was already gone
    render(<PermissionsSection />);
    fireEvent.click(await screen.findByRole('button', { name: /^remove$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^remove$/i }));
    await waitFor(() => expect(screen.getByText(/couldn't be found/i)).toBeTruthy());
  });

  it('renders an empty state rather than an error when nothing is granted', async () => {
    list.mockResolvedValue([]);
    render(<PermissionsSection />);
    expect(await screen.findByText(/haven't approved anything/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
npx vitest run tests/permissions-section.test.tsx
```
Expected: FAIL — cannot resolve `PermissionsSection`.

- [ ] **Step 3: Implement the component**

Build `src/renderer/components/PermissionsSection.tsx` to the structure above, using only `components/ui` primitives (`Button`, and `ErrorState` from `components/ui/states`). Model the load/error/confirm state machine on `ProvidersSection.tsx` — same `useState` + `useCallback` shape, same `danger-outline` → inline-confirm swap.

The one behaviour the tests pin that is easy to miss: `remove` resolving `false` means the on-screen list was stale, so the row **stays** and the user is told it could not be found. Reporting success there would teach the user to trust a list that lied.

- [ ] **Step 4: Run and confirm it passes**

```bash
npx vitest run tests/permissions-section.test.tsx
```
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/PermissionsSection.tsx tests/permissions-section.test.tsx
git commit -m "feat(permissions): grants list with consequence-gated removal"
```

## Task 4: Mount it in Settings, with the explainer

**Files:**
- Create: `src/renderer/components/permissions/permissions-explainer.ts`
- Modify: `src/renderer/components/SettingsPanel.tsx`

**Interfaces:**
- Consumes: `PermissionsSection` (Task 3), `SettingsExplainer` + `InfoIconButton` (`src/renderer/components/SettingsExplainer.tsx`)

- [ ] **Step 1: Write the explainer payload**

Create `src/renderer/components/permissions/permissions-explainer.ts`:

```ts
import type { ExplainerSection } from '../SettingsExplainer';

// Layman's terms on purpose — this doubles as in-app help (see the
// SettingsExplainer module header). No tool ids, no rule syntax.
export const PERMISSIONS_EXPLAINER_INTRO =
  "When the assistant wants to do something that changes your computer — run a command, edit a file — it asks first. If you chose \"Always allow,\" it stops asking for that one thing. This is where you take that back.";

export const PERMISSIONS_EXPLAINER_SECTIONS: ExplainerSection[] = [
  {
    heading: 'How much it asks',
    paragraphs: ['Each conversation has a setting for how often it checks with you. You can change it at any time from the chat.'],
    bullets: [
      { term: 'Ask', text: 'checks with you before anything that changes your files or runs a command. Reading and searching never ask.' },
      { term: 'Auto-edit', text: 'edits files without asking, but still checks before running commands.' },
      { term: 'Full Auto', text: 'does not check with you at all. Use it when you are watching.' },
    ],
  },
  {
    heading: 'Personalities',
    bullets: [
      { term: 'Assistant', text: 'starts out cautious and asks about most things.' },
      { term: 'Coder', text: 'starts out able to edit files without asking, since that is most of the work.' },
    ],
  },
  {
    heading: 'Approvals you gave Claude Code',
    paragraphs: ["Conversations running on Claude Code keep their own separate list of approvals, which this screen does not manage. You can change those in Claude Code's own settings."],
  },
];
```

- [ ] **Step 2: Mount the section and its explainer**

In `SettingsPanel.tsx`, add a `showPermissionsInfo` boolean beside the existing `showInfo` state, render `<InfoIconButton onClick={() => setShowPermissionsInfo(true)} />` in the host's header, pass `onBack={() => setShowPermissionsInfo(false)}` to the `<Dialog>`, and render either `<SettingsExplainer intro={PERMISSIONS_EXPLAINER_INTRO} sections={PERMISSIONS_EXPLAINER_SECTIONS} />` or `<PermissionsSection />`. This is the same shape Remote Access, Backup & Sync, Appearance and Context already use — copy the nearest one rather than inventing a variant.

**Do not gate the section on `window.claude.native.supported`.** `ProvidersSection` does, and `remote-shim.ts` hardcodes it `false`, which would render nothing over remote access — killing the WebSocket route added in Task 8 on the only transport that uses it, and preventing a revoke from a phone. Spec, "Open item for Phase 1 review".

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit && node scripts/workbench-boot-check.mjs
```
Expected: clean; seven routes, no console error.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/permissions/permissions-explainer.ts src/renderer/components/SettingsPanel.tsx
git commit -m "feat(permissions): mount the section in Settings with its explainer"
```

## Task 5: Visual review — Destin's gate

**This task is not automated.** Per the workspace rule, interactive and repeated-relaunch verification is handed to Destin rather than scripted.

- [ ] **Step 1: Launch the workbench**

```bash
cd /home/destin/youcoded-dev
bash scripts/run-workbench.sh
```

- [ ] **Step 2: Hand off for review**

Ask Destin to look at Settings → Permissions across: the **default** scenario, **empty** (no grants), **stress** (40+ rules, long commands, the worktree sharing a basename with its parent), **refused** (writes fail — the revert path), the narrow viewport, and at non-zero fake IPC latency.

- [ ] **Step 3: Iterate until he signs off**

Changes land as ordinary commits on this branch. **Phase 2 does not start until he approves the surface** — that is the entire reason the UI comes first.

---

# PHASE 2 — Backend

## Task 6: Store — list, remove, removeProject, and provenance

**Files:**
- Modify: `src/main/harness/permission-store.ts`
- Test: `tests/permission-store.test.ts`

**Interfaces:**
- Produces: `list()`, `remove(slug, rule)`, `removeProject(slug)` — consumed by Tasks 7 and 8.

- [ ] **Step 1: Write the failing tests**

Add to `tests/permission-store.test.ts` (create it if absent, using an in-memory `NativeHome` fake — one already exists in `tests/helpers/` for the native-home suite):

```ts
it('lists projects with their rules', async () => {
  await store.remember('/home/d/proj', { tool: 'Bash', pattern: 'ls', action: 'allow' });
  const projects = await store.list();
  expect(projects).toHaveLength(1);
  expect(projects[0].rules[0].pattern).toBe('ls');
});

// The whole reason removal keys by slug: remember() must record the cwd, or the
// UI has no path to show and no way to get one back from the lossy slug.
it('records the cwd and a grantedAt timestamp', async () => {
  await store.remember('/home/d/proj', { tool: 'Bash', pattern: 'ls', action: 'allow' });
  const [p] = await store.list();
  expect(p.cwd).toBe('/home/d/proj');
  expect(typeof p.rules[0].grantedAt).toBe('string');
});

// The trap: remember() rebuilds the entry as { rules }, which drops cwd on the
// SECOND write to the same project.
it('preserves the recorded cwd across a later remember', async () => {
  await store.remember('/home/d/proj', { tool: 'Bash', pattern: 'ls', action: 'allow' });
  await store.remember('/home/d/proj', { tool: 'Bash', pattern: 'pwd', action: 'allow' });
  const [p] = await store.list();
  expect(p.cwd).toBe('/home/d/proj');
  expect(p.rules).toHaveLength(2);
});

it('removes a rule by slug and reports the hit', async () => {
  const rule = { tool: 'Bash', pattern: 'ls', action: 'allow' as const };
  await store.remember('/home/d/proj', rule);
  const [p] = await store.list();
  await expect(store.remove(p.slug, rule)).resolves.toBe(true);
  expect((await store.list())[0]?.rules ?? []).toHaveLength(0);
});

it('reports false when nothing matched', async () => {
  await store.remember('/home/d/proj', { tool: 'Bash', pattern: 'ls', action: 'allow' });
  const [p] = await store.list();
  await expect(store.remove(p.slug, { tool: 'Bash', pattern: 'nope', action: 'allow' })).resolves.toBe(false);
});

// Pre-UI entries have neither cwd nor grantedAt and must still be listable and
// removable — they are exactly the rules a user most wants to audit.
it('lists and removes a legacy entry with no cwd', async () => {
  home.writeJson('permissions.json', { v: 1, projects: { '-legacy': { rules: [{ tool: 'Bash', pattern: 'ls', action: 'allow' }] } } });
  const [p] = await store.list();
  expect(p.slug).toBe('-legacy');
  expect(p.cwd).toBeUndefined();
  await expect(store.remove('-legacy', { tool: 'Bash', pattern: 'ls', action: 'allow' })).resolves.toBe(true);
});

it('returns [] for a missing or wrong-shape file', async () => {
  home.writeJson('permissions.json', { projects: null });
  await expect(store.list()).resolves.toEqual([]);
});

it('removeProject drops the whole slice', async () => {
  await store.remember('/home/d/proj', { tool: 'Bash', pattern: 'ls', action: 'allow' });
  const [p] = await store.list();
  await expect(store.removeProject(p.slug)).resolves.toBe(true);
  await expect(store.list()).resolves.toEqual([]);
});
```

- [ ] **Step 2: Run and confirm failure**

```bash
npx vitest run tests/permission-store.test.ts
```
Expected: FAIL — `store.list is not a function`.

- [ ] **Step 3: Implement**

In `permission-store.ts`: widen `PermFile` to `{ v: 1; projects: Record<string, { cwd?: string; rules: StoredRule[] }> }`; add the three methods; and fix `remember()` to spread the existing entry rather than rebuilding it:

```ts
      // Spread the existing entry, don't rebuild it: rebuilding as { rules }
      // silently drops the recorded cwd on the SECOND write to a project, and
      // the cwd is NOT recoverable from the slug.
      return { ...data, projects: { ...data.projects, [slug]: { ...(data.projects?.[slug] ?? {}), cwd, rules } } };
```

`remember()` stamps `grantedAt: new Date().toISOString()` on the rule it pushes. Keep the dedupe comparing only `(tool, pattern, action)` — a repeat must not refresh the date, or re-approving a thing you already approved would look like a new grant.

`remove` and `removeProject` both go through `this.home.mutateJson`.

- [ ] **Step 4: Run and confirm pass**

```bash
npx vitest run tests/permission-store.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/harness/permission-store.ts tests/permission-store.test.ts
git commit -m "feat(permissions): store gains list/remove/removeProject and provenance"
```

## Task 7: Revocation that reaches a live session

The task the whole feature rests on. A revoke a running session ignores is not a revoke.

**Files:**
- Modify: `src/main/harness/native-session-host.ts`
- Test: `tests/native-session-host.test.ts`

**Interfaces:**
- Consumes: `PermissionStore.remove` (Task 6)
- Produces: `NativeSessionHost.revokeRule(slug, rule): Promise<boolean>` — consumed by Task 8.

- [ ] **Step 1: Write the failing tests**

Add to `tests/native-session-host.test.ts`:

```ts
describe('revokeRule', () => {
  // The point of the feature. rememberedFor is unioned into decide() on every
  // call, so a disk-only delete leaves a running session still granting.
  it('stops a live session granting the revoked rule', async () => {
    const rule = { tool: 'Bash', pattern: 'git push origin main', action: 'allow' as const };
    // ...create a session on '/home/d/proj', emit 'remember-rule' with `rule`
    await expect(decideFor(sessionId)('Bash', 'git push origin main')).resolves.toMatchObject({ action: 'allow' });

    await host.revokeRule(cwdToProjectSlug('/home/d/proj'), rule);

    await expect(decideFor(sessionId)('Bash', 'git push origin main')).resolves.toMatchObject({ action: 'ask' });
  });

  // Two paths that collapse to one slug genuinely SHARE the disk rules, so the
  // in-memory drop must match on slug too — not on path equality. '/home/d/my
  // project' and '/home/d/my-project' both slug to '-home-d-my-project'.
  it('clears sessions whose cwd differs in spelling but shares the slug', async () => {
    const rule = { tool: 'Bash', pattern: 'ls', action: 'allow' as const };
    const spaced = await createSession({ cwd: '/home/d/my project' });
    const dashed = await createSession({ cwd: '/home/d/my-project' });
    for (const id of [spaced, dashed]) emitRememberRule(id, rule);

    await host.revokeRule('-home-d-my-project', rule);

    await expect(decideFor(spaced)('Bash', 'ls')).resolves.toMatchObject({ action: 'ask' });
    await expect(decideFor(dashed)('Bash', 'ls')).resolves.toMatchObject({ action: 'ask' });
  });

  it('leaves an unrelated project untouched', async () => {
    const rule = { tool: 'Bash', pattern: 'ls', action: 'allow' as const };
    const mine = await createSession({ cwd: '/home/d/proj' });
    const other = await createSession({ cwd: '/home/d/other' });
    for (const id of [mine, other]) emitRememberRule(id, rule);

    await host.revokeRule(cwdToProjectSlug('/home/d/proj'), rule);

    await expect(decideFor(mine)('Bash', 'ls')).resolves.toMatchObject({ action: 'ask' });
    await expect(decideFor(other)('Bash', 'ls')).resolves.toMatchObject({ action: 'allow' });
  });

  // The store is the authority on whether anything was actually stored; the
  // renderer uses this to avoid reporting success against a stale list.
  it('returns false when the store matched nothing', async () => {
    await expect(
      host.revokeRule('-never-granted', { tool: 'Bash', pattern: 'ls', action: 'allow' }),
    ).resolves.toBe(false);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

```bash
npx vitest run tests/native-session-host.test.ts -t revokeRule
```
Expected: FAIL — `host.revokeRule is not a function`.

- [ ] **Step 3: Implement**

Extend the `RememberedRuleStore` structural type (`:45-51`) with `remove(slug, rule): Promise<boolean>`, give `NOOP_REMEMBERED_STORE` an `async remove() { return false; }`, and add:

```ts
  /** Revoke one remembered rule: disk first, then every live session's in-memory
   *  copy. ONE entry point on purpose — a disk removal that succeeded while the
   *  memory drop failed would leave a running session granting exactly what the
   *  user just revoked, which is the failure this feature exists to prevent.
   *
   *  Matching is by SLUG, not path equality: cwdToProjectSlug collapses ':',
   *  '\', '/' and spaces to '-', so two differently-spelled cwds can share one
   *  disk entry — and must therefore both be cleared. */
  async revokeRule(slug: string, rule: PermissionRule): Promise<boolean> {
    const hit = await this.permissionStore.remove(slug, rule);
    for (const [sessionId, entry] of this.live) {
      if (cwdToProjectSlug(entry.cwd) !== slug) continue;
      const mem = this.rememberedFor.get(sessionId);
      if (!mem) continue;
      this.rememberedFor.set(sessionId, mem.filter(
        (r) => !(r.tool === rule.tool && r.pattern === rule.pattern && r.action === rule.action),
      ));
    }
    return hit;
  }
```

Add a matching `revokeProject(slug)` that calls `store.removeProject(slug)` and empties `rememberedFor` for every matching live session.

**The naming difference is deliberate, not a typo.** The store's methods are `remove` / `removeProject` — they touch disk only. The host's are `revokeRule` / `revokeProject` — disk *plus* live memory. IPC handlers must call the host's, never the store's, or a running session keeps the grant.

- [ ] **Step 4: Run and confirm pass**

```bash
npx vitest run tests/native-session-host.test.ts -t revokeRule
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/harness/native-session-host.ts tests/native-session-host.test.ts
git commit -m "feat(permissions): revocation reaches live sessions, not just disk"
```

## Task 8: IPC across five surfaces

**Files:**
- Modify: `src/main/ipc-handlers.ts`, `src/main/preload.ts`, `src/renderer/remote-shim.ts`, `src/main/remote-server.ts`, `app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt`
- Test: `tests/ipc-channels.test.ts`

- [ ] **Step 1: Write the failing parity block**

Append to `tests/ipc-channels.test.ts`, modelled on the `search:*` block at `:757`:

```ts
// Five-surface parity for the permissions management UI (M5 2a). A channel
// missing from remote-shim.ts or SessionService.kt would silently break the
// screen on remote or Android — the exact gap native:* had until 2026-07-28.
describe('permissions:* channel parity', () => {
  const NEW_TYPES = ['permissions:list', 'permissions:remove', 'permissions:remove-project'];
  const CHANNEL_TO_CONST: Record<string, string> = {
    'permissions:list': 'IPC.PERMISSIONS_LIST',
    'permissions:remove': 'IPC.PERMISSIONS_REMOVE',
    'permissions:remove-project': 'IPC.PERMISSIONS_REMOVE_PROJECT',
  };
  const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
  it('exposed in preload.ts', () => {
    const src = read('src', 'main', 'preload.ts');
    for (const t of NEW_TYPES) expect(src, `${t} missing from preload.ts`).toContain(`'${t}'`);
  });
  it('exposed in remote-shim.ts', () => {
    const src = read('src', 'renderer', 'remote-shim.ts');
    for (const t of NEW_TYPES) expect(src, `${t} missing from remote-shim.ts`).toContain(`'${t}'`);
  });
  it('registered in ipc-handlers.ts', () => {
    const src = read('src', 'main', 'ipc-handlers.ts');
    for (const t of NEW_TYPES) expect(src.includes(`'${t}'`) || src.includes(CHANNEL_TO_CONST[t]), `${t} missing from ipc-handlers.ts`).toBe(true);
  });
  it('handled by remote-server.ts (WS case)', () => {
    const src = read('src', 'main', 'remote-server.ts');
    for (const t of NEW_TYPES) expect(src, `${t} missing from remote-server.ts`).toContain(`'${t}'`);
  });
  it('stubbed in SessionService.kt (Android)', () => {
    const kt = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'src', 'main', 'kotlin', 'com', 'youcoded', 'app', 'runtime', 'SessionService.kt'), 'utf8');
    for (const t of NEW_TYPES) expect(kt, `${t} missing from SessionService.kt`).toContain(`"${t}"`);
  });
});
```

- [ ] **Step 2: Run and confirm five failures**

```bash
npx vitest run tests/ipc-channels.test.ts -t 'permissions:\*'
```
Expected: FAIL on all five surfaces.

- [ ] **Step 3: Implement all five**

Follow the **`search:*` payload convention exactly** — preload passes positionally, remote-shim wraps as an object, the WS case unwraps. (`provider:*` has a documented positional-vs-object mismatch and is the wrong model to copy.)

1. **`ipc-handlers.ts`** — the `PermissionStore` is already constructed at `:2276`; hold that reference and register the three handlers. `remove` and `remove-project` route through `nativeHost.revokeRule` / `revokeProject`, never the store directly, so live sessions are always covered.
2. **`preload.ts`** — `permissions: { list: () => ipcRenderer.invoke('permissions:list'), remove: (slug, rule) => ipcRenderer.invoke('permissions:remove', slug, rule), removeProject: (slug) => ipcRenderer.invoke('permissions:remove-project', slug) }`.
3. **`remote-shim.ts`** — same three, object-wrapped: `invoke('permissions:remove', { slug, rule })`.
4. **`remote-server.ts`** — one `case` each, unwrapping the object payload (see `case 'search:list'` at `:918`).
5. **`SessionService.kt`** — add the three strings to the existing `not-implemented-on-mobile` list beside `search:*` (~`:3707`), with a comment noting M5's Android parity belongs to M8.

- [ ] **Step 4: Run and confirm pass**

```bash
npx vitest run tests/ipc-channels.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc-handlers.ts src/main/preload.ts src/renderer/remote-shim.ts src/main/remote-server.ts ../app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt tests/ipc-channels.test.ts
git commit -m "feat(permissions): permissions:* IPC across five surfaces"
```

## Task 9: Cut the UI over to the real backend

**Files:**
- Modify: `src/renderer/dev/workbench/mock-only.ts`

- [ ] **Step 1: Empty the MOCK_ONLY list**

The three entries are now backed. Restore the file to its empty-with-example state — the mock namespace in `mock-shim.ts` **stays**, because the workbench still needs fake data; only the "no real backend" registration goes.

- [ ] **Step 2: Verify end to end**

```bash
cd /home/destin/youcoded-dev
bash scripts/verify.sh worktrees/native-permissions
bash scripts/run-dev.sh native-permissions --label "Permissions UI"
```

In the dev window: grant an "Always allow" in a native session, confirm it appears in Settings → Permissions, remove it, and confirm **the same running session asks again on the next matching call**. That last step is the feature; a passing test suite does not prove it.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/dev/workbench/mock-only.ts
git commit -m "chore(permissions): drop the mock-only registrations, backend is live"
```

---

# PHASE 3 — External-path honesty fix

## Task 10: Stop promising an "Always allow" the engine will not honor

Separable from Phases 1–2; can land on its own.

**Files:**
- Modify: `src/main/harness/harness-session.ts` (~`:1603`)
- Modify: `src/renderer/components/ToolCard.tsx` (~`:826`)
- Test: `tests/harness-session-loop.test.ts`, `tests/ToolCard.test.tsx`

- [ ] **Step 1: Write the failing tests**

```ts
// harness-session-loop.test.ts
it('does not remember a rule when an external path forced the ask', async () => {
  const remembered: unknown[] = [];
  session.on('remember-rule', (r) => remembered.push(r));
  // Read a file OUTSIDE ctx.cwd; approve with always: true.
  await runTurn();
  // An external path skips decide() entirely (harness-session.ts:1603), so a
  // rule stored here could never be consulted — recording it tells the user
  // they won't be asked again when they will be, every time.
  expect(remembered).toEqual([]);
});

it('marks an external-directory ask so the UI can suppress Always-allow', async () => {
  expect(askedRequests.at(-1)).toMatchObject({ external: true });
});
```

```tsx
// ToolCard.test.tsx
it('suppresses Always allow for an external-directory ask', () => {
  render(<ToolCard tool={{ ...askingTool, external: true }} />);
  expect(screen.queryByRole('button', { name: /always/i })).toBeNull();
});
```

- [ ] **Step 2: Run and confirm failure**

```bash
npx vitest run tests/harness-session-loop.test.ts tests/ToolCard.test.tsx
```
Expected: FAIL — a rule is recorded; no `external` flag; the button renders.

- [ ] **Step 3: Implement**

In `harness-session.ts`, pass `external: externalAsk` on the `askUser` request, and guard the emit:

```ts
      // Only remember when the decision came from decide(). An external-directory
      // path forced this ask and SKIPS decide() on every future call, so a stored
      // rule can never fire — recording one promises the user something the
      // engine will not honor. See spec 2026-08-11, finding 3.
      if (d.always && !externalAsk) {
        this.emit('remember-rule', {
          tool: call.toolName,
          ...(subject !== undefined ? { pattern: subject } : {}),
          action: 'allow',
        });
      }
```

Thread `external` through the broker to the hook event the same way `denyListed` already travels, then extend `ToolCard`'s existing `suppressAlwaysAllow` at `:826` to include it.

- [ ] **Step 4: Run and confirm pass**

```bash
npx vitest run tests/harness-session-loop.test.ts tests/ToolCard.test.tsx
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/harness/harness-session.ts src/renderer/components/ToolCard.tsx tests/
git commit -m "fix(permissions): don't record an always-allow the engine will never honor"
```

---

# Closing out

- [ ] **Update the docs in the SAME PR** — `.claude/rules/native-runtime.md` gains the revocation invariant (revoke reaches live sessions; removal keys by slug) and `docs/MAP.md` gains the new files. Program rule §3.
- [ ] **Run the full gate**

```bash
bash scripts/verify.sh worktrees/native-permissions --full
```

- [ ] **Open the PR and watch all three platforms.** `verify.sh` is Linux-only and cannot see the Windows/macOS break class that left master red for two days. **Note that master is currently red on Windows from unrelated work** (`43a9c43a`, `a2b0e35f`) — verify any failure is inherited before assuming it is yours, the way #289/#290 did.
- [ ] **After merge:** move this plan and the spec to `docs/archive/`, flip the ROADMAP item, remove the worktree, and delete the branch local and remote.
