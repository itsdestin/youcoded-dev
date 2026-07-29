---
status: draft
date: 2026-07-29
kind: plan
spec: docs/active/specs/2026-07-29-ui-workbench-design.md
---

# UI Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a dev-only `?mode=workbench` that boots the real YouCoded renderer in a browser
tab against a fake, stateful `window.claude`, so every menu is clickable and every design
alternative is comparable side by side — and delete the ToolCard sandbox it replaces.

**Architecture:** A mock `window.claude` (typed against the existing `Window['claude']`
declaration, with a `Proxy` catch-all for the unimplemented tail) is installed before React
mounts. It reads and writes an in-memory store seeded from a named scenario. Chat state comes
from replaying real `chatReducer` actions out of JSONL fixtures. A toolbar outside the app
frame switches theme, scenario, viewport, and per-surface component variants.

**Tech Stack:** TypeScript, React 18, Vite, Vitest, Tailwind v4.

## Global Constraints

- Repo is `youcoded/`; work in a git worktree per workspace rules. Workspace-level files
  (`scripts/run-workbench.sh`, `.claude/`, `docs/`) go to `youcoded-dev` instead.
- Everything workbench-related is gated on `import.meta.env.DEV` and must tree-shake out of
  production builds. Verified by Task 11.
- The mock must **never** install when a real `window.claude` exists.
- No new breakpoint numbers — 640px comes from `use-narrow-viewport.ts`.
- Every control goes through its `components/ui/` primitive; never hand-roll
  `bg-accent text-on-accent`. (`.claude/rules/react-renderer.md`)
- Overlays use `<Scrim>`/`<OverlayPanel>` or `.layer-surface`; never a hardcoded z-index.
- WHY comments on non-trivial edits — Destin is a non-developer and relies on them.
- Run `cd youcoded/desktop && npx tsc --noEmit` before every commit.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/renderer/dev/workbench/install-mock.ts` | Boot gate; builds the store + shim and assigns `window.claude` |
| `src/renderer/dev/workbench/mock-store.ts` | The stateful in-memory store + subscription |
| `src/renderer/dev/workbench/mock-shim.ts` | Hand-written channels + `Proxy` catch-all |
| `src/renderer/dev/workbench/mock-only.ts` | `MOCK_ONLY` registry of channels with no real backend |
| `src/renderer/dev/workbench/scenarios.ts` | Named store seeds |
| `src/renderer/dev/workbench/variants.ts` | Surface → variant registry |
| `src/renderer/dev/workbench/WorkbenchToolbar.tsx` | Theme / scenario / viewport / variant controls |
| `src/renderer/dev/workbench/WorkbenchFrame.tsx` | Lays the toolbar beside `<App/>` without overlaying it |
| `src/renderer/dev/workbench/ToolGallery.tsx` | Absorbs ToolSandbox — renders tool fixtures as real ToolCards |
| `src/renderer/dev/workbench/fixture-loader.ts` | **Moved + extended** from `dev/fixture-loader.ts` |
| `src/renderer/dev/workbench/fixtures/**` | Sessions, providers, models, tags, conversations, tools, themes |

---

## Task 1: Walking skeleton — the route boots

**Files:**
- Create: `youcoded/desktop/src/renderer/dev/workbench/install-mock.ts`
- Modify: `youcoded/desktop/src/renderer/index.tsx:112,119-126,155,163,186`
- Create: `youcoded-dev/scripts/run-workbench.sh`

**Interfaces:**
- Produces: `installMock(): void` — assigns `window.claude`, no-op if one exists.

- [ ] **Step 1: Write the failing test**

Create `youcoded/desktop/tests/workbench-install-mock.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { installMock } from '../src/renderer/dev/workbench/install-mock';

describe('installMock', () => {
  beforeEach(() => { delete (globalThis as any).window; (globalThis as any).window = {}; });

  it('installs a claude bridge when none exists', () => {
    installMock();
    expect((window as any).claude).toBeTruthy();
  });

  // The load-bearing safety property: it must never shadow a real preload
  // bridge or a live remote shim.
  it('refuses to install over an existing bridge', () => {
    const real = { session: {} };
    (window as any).claude = real;
    installMock();
    expect((window as any).claude).toBe(real);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd youcoded/desktop && npx vitest run tests/workbench-install-mock.test.ts`
Expected: FAIL — `Cannot find module '../src/renderer/dev/workbench/install-mock'`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/renderer/dev/workbench/install-mock.ts`:

```ts
// Dev-only. Installs a fake window.claude so the real renderer can boot with no
// Electron main process, no PTY and no remote server. See
// docs/active/specs/2026-07-29-ui-workbench-design.md.

/** Assigns the mock bridge. No-op when a real bridge is already present —
 *  this is what stops the workbench from ever shadowing Electron's preload
 *  or a connected remote shim. */
export function installMock(): void {
  if ((window as any).claude) return;
  // Task 3 replaces this placeholder with the real shim.
  (window as any).claude = {};
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `cd youcoded/desktop && npx vitest run tests/workbench-install-mock.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Make `isElectron` lazy in `index.tsx`**

`index.tsx:112` is `const isElectron = !!(window as any).claude;` — evaluated at **module-eval
time**, which is before an async mock install can resolve. Convert it to a function so it is
read at render time instead.

Replace line 112:

```ts
// WHY a function, not a const: the workbench installs its mock bridge via a
// dynamic import (see the boot branch at the bottom of this file), which
// resolves AFTER this module finishes evaluating. A module-level const would
// capture `false` and strand the app on the remote login screen.
const isElectron = () => !!(window as any).claude;
```

Then update its six readers — `index.tsx:120`, `:121`, `:122`, `:126`, `:155`, `:163` — to
call it: `useState(isElectron())`, `if (isElectron()) return;`, `if (isElectron() || connected
|| hasConnectedOnce)`. In the dependency array at `:155`, **remove** `isElectron` (a stable
function reference is not a meaningful dep) and leave the array otherwise unchanged.

- [ ] **Step 6: Add the boot branch**

Replace `index.tsx:186` (`createRoot(...).render(<Root />);`) with:

```ts
const __root = () => createRoot(document.getElementById('root')!).render(<Root />);

// Workbench boot. `import.meta.env.DEV` is statically replaced with `false` in
// production, so Vite drops this whole branch and never emits the chunk.
if (import.meta.env.DEV && new URLSearchParams(location.search).get('mode') === 'workbench') {
  import('./dev/workbench/install-mock').then(({ installMock }) => {
    installMock();
    __root();
  });
} else {
  __root();
}
```

- [ ] **Step 7: Create the launcher**

Create `youcoded-dev/scripts/run-workbench.sh`:

```bash
#!/bin/bash
# Launch the UI Workbench: the REAL renderer against a fake window.claude, in a
# plain browser tab. No Electron, no main process, no PTY.
#
# When to use which launcher:
#   run-workbench.sh  — building or redesigning UI. Fastest loop (~1s HMR).
#   run-dev.sh        — you need real event ordering, PTY, or main-process behavior.
#
# Spec: docs/active/specs/2026-07-29-ui-workbench-design.md
set -euo pipefail

cd "$(dirname "$0")/.."

# Same shifted ports as run-dev.sh so this coexists with the built app.
export YOUCODED_PORT_OFFSET="${YOUCODED_PORT_OFFSET:-50}"
PORT=$((5173 + YOUCODED_PORT_OFFSET))

echo "UI Workbench — open this in any browser:"
echo "  http://localhost:$PORT/?mode=workbench"
echo ""
cd youcoded/desktop
npm run dev:renderer -- --port "$PORT"
```

Then `chmod +x youcoded-dev/scripts/run-workbench.sh`.

- [ ] **Step 8: Verify it boots**

Run: `bash scripts/run-workbench.sh`, open `http://localhost:5223/?mode=workbench`.
Expected: the app shell renders (header, chrome, empty "No Active Session" welcome screen)
instead of the remote login form. Console will warn about missing channels — that is Task 3's
job. **Flag this first visual check for Destin** rather than asserting it yourself.

- [ ] **Step 9: Commit**

```bash
cd youcoded && git add desktop/src/renderer/dev/workbench/install-mock.ts \
  desktop/src/renderer/index.tsx desktop/tests/workbench-install-mock.test.ts
git commit -m "feat(workbench): dev-only ?mode=workbench route with a mock bridge gate"
cd ../ && git add scripts/run-workbench.sh
git commit -m "feat(workbench): add run-workbench.sh launcher"
```

---

## Task 2: The mock store and scenarios

**Files:**
- Create: `src/renderer/dev/workbench/mock-store.ts`
- Create: `src/renderer/dev/workbench/scenarios.ts`
- Create: `src/renderer/dev/workbench/fixtures/{sessions,providers,models,tags,defaults}.ts`
- Test: `youcoded/desktop/tests/workbench-store.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type ScenarioId = 'default' | 'empty' | 'no-providers' | 'refused' | 'stress'`
  - `interface MockStore { getState(): MockState; setState(fn: (s: MockState) => MockState): void; subscribe(fn: () => void): () => void; refuseWrites: boolean }`
  - `createStore(scenario: ScenarioId): MockStore`
  - `interface MockState { sessions: SessionInfo[]; past: PastSession[]; providers: ProviderRow[]; catalog: CatalogRow[]; tags: TagRecord[]; defaults: Record<string, unknown> }`

- [ ] **Step 1: Write the failing test**

Create `youcoded/desktop/tests/workbench-store.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createStore } from '../src/renderer/dev/workbench/mock-store';

describe('mock store', () => {
  it('seeds sessions from the default scenario', () => {
    const s = createStore('default');
    expect(s.getState().sessions.length).toBeGreaterThan(0);
    expect(s.getState().providers.some((p) => p.ready)).toBe(true);
  });

  it('empty scenario seeds nothing', () => {
    const s = createStore('empty');
    expect(s.getState().sessions).toEqual([]);
    expect(s.getState().past).toEqual([]);
    expect(s.getState().tags).toEqual([]);
  });

  it('no-providers scenario has zero ready providers', () => {
    const s = createStore('no-providers');
    expect(s.getState().providers.filter((p) => p.ready)).toEqual([]);
  });

  // The stress scenario is what stops UI-first development shipping designs
  // that only survive pretty data. Spec §4.
  it('stress scenario has long names and a large list', () => {
    const s = createStore('stress');
    expect(s.getState().past.length).toBeGreaterThanOrEqual(200);
    expect(Math.max(...s.getState().past.map((p) => p.name.length))).toBeGreaterThanOrEqual(80);
  });

  it('refused scenario flags writes as refused', () => {
    expect(createStore('refused').refuseWrites).toBe(true);
    expect(createStore('default').refuseWrites).toBe(false);
  });

  it('notifies subscribers on setState', () => {
    const s = createStore('default');
    let calls = 0;
    const off = s.subscribe(() => { calls += 1; });
    s.setState((st) => ({ ...st, sessions: [] }));
    expect(calls).toBe(1);
    off();
    s.setState((st) => st);
    expect(calls).toBe(1);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd youcoded/desktop && npx vitest run tests/workbench-store.test.ts`
Expected: FAIL — cannot find `mock-store`.

- [ ] **Step 3: Write the fixtures**

Create `src/renderer/dev/workbench/fixtures/sessions.ts`. Import the real types so the
compiler catches drift:

```ts
import type { SessionInfo } from '../../../../shared/types';

// Two live sessions: one Claude Code, one native. `provider` + `harnessId` are
// what mark a native session (shared/types.ts:67-82) — the transcript carries
// no such marker, so it has to be right here.
export const SESSIONS: SessionInfo[] = [
  {
    id: 'wb-1', name: 'fix chat scroll stick', cwd: '/home/destin/youcoded-dev/youcoded',
    permissionMode: 'normal', skipPermissions: false, status: 'active',
    createdAt: 1_753_800_000_000, provider: 'claude', model: 'sonnet',
  },
  {
    id: 'wb-2', name: 'theme contrast pass', cwd: '/home/destin/youcoded-dev/wecoded-themes',
    permissionMode: 'normal', skipPermissions: false, status: 'idle',
    createdAt: 1_753_790_000_000, provider: 'native', harnessId: 'coder',
    model: 'qwen2.5-coder:14b',
  },
];
```

Create `fixtures/providers.ts`:

```ts
export interface ProviderRow { id: string; type: string; label: string; ready: boolean }
export interface CatalogRow { id: string; providerId: string; label: string }

export const PROVIDERS: ProviderRow[] = [
  { id: 'pv-openrouter', type: 'openrouter', label: 'OpenRouter', ready: true },
  { id: 'local', type: 'local-engine', label: 'Local Models', ready: true },
  { id: 'pv-ollama', type: 'openai-compatible', label: 'Ollama', ready: false },
];

export const CATALOG: CatalogRow[] = [
  { id: 'anthropic/claude-sonnet-4-6', providerId: 'pv-openrouter', label: 'Claude Sonnet 4.6' },
  { id: 'openai/gpt-5', providerId: 'pv-openrouter', label: 'GPT-5' },
  { id: 'qwen2.5-coder:14b', providerId: 'local', label: 'Qwen2.5 Coder 14B' },
  { id: 'llama3.1:8b', providerId: 'local', label: 'Llama 3.1 8B' },
];
```

Create `fixtures/tags.ts`:

```ts
import type { TagRecord } from '../../../../shared/tags';

export const TAGS: TagRecord[] = [
  { id: 'tg-work', label: 'work', color: 'blue', archived: false },
  { id: 'tg-bug', label: 'bug', color: 'red', archived: false },
  { id: 'tg-idea', label: 'idea', color: 'green', archived: false },
  { id: 'tg-old', label: 'retired', color: 'gray', archived: true },
];
```

> If `TagRecord`'s real fields differ, take the real shape — `shared/tags.ts` is the authority,
> not this snippet. The compiler will tell you.

Create `fixtures/defaults.ts`:

```ts
export const DEFAULTS: Record<string, unknown> = {
  projectFolder: '/home/destin/youcoded-dev/youcoded',
  model: 'sonnet',
  skipPermissions: false,
};
```

Create `fixtures/models.ts` re-exporting `CATALOG` for symmetry:

```ts
export { CATALOG, PROVIDERS } from './providers';
export type { CatalogRow, ProviderRow } from './providers';
```

- [ ] **Step 4: Write the store and scenarios**

Create `src/renderer/dev/workbench/scenarios.ts`:

```ts
import type { SessionInfo } from '../../../shared/types';
import type { TagRecord } from '../../../shared/tags';
import { SESSIONS } from './fixtures/sessions';
import { PROVIDERS, CATALOG, type ProviderRow, type CatalogRow } from './fixtures/providers';
import { TAGS } from './fixtures/tags';
import { DEFAULTS } from './fixtures/defaults';

export type ScenarioId = 'default' | 'empty' | 'no-providers' | 'refused' | 'stress';

/** A row in the Resume Browser's list. Mirrors ResumeBrowser.tsx's PastSession. */
export interface PastSession {
  sessionId: string; name: string; projectSlug: string; projectPath: string;
  lastModified: number; size: number;
  flags?: Partial<Record<'priority' | 'complete', boolean>>;
  tags?: string[]; note?: string; provider?: string; harnessId?: string;
}

export interface MockState {
  sessions: SessionInfo[];
  past: PastSession[];
  providers: ProviderRow[];
  catalog: CatalogRow[];
  tags: TagRecord[];
  defaults: Record<string, unknown>;
}

const PROJECTS = [
  ['/home/destin/youcoded-dev/youcoded', 'youcoded'],
  ['/home/destin/youcoded-dev/wecoded-themes', 'wecoded-themes'],
  ['/home/destin/youcoded-dev/wecoded-marketplace', 'wecoded-marketplace'],
] as const;

function past(i: number, name: string, extra: Partial<PastSession> = {}): PastSession {
  const [path, slug] = PROJECTS[i % PROJECTS.length];
  return {
    sessionId: `wb-past-${i}`, name, projectSlug: slug, projectPath: path,
    lastModified: 1_753_800_000_000 - i * 3_600_000, size: 4096 + i * 137, ...extra,
  };
}

const DEFAULT_PAST: PastSession[] = [
  past(0, 'fix chat scroll stick', { flags: { priority: true }, tags: ['tg-bug'] }),
  past(1, 'theme contrast pass', { provider: 'native', harnessId: 'coder' }),
  past(2, 'sync health primary system', { note: 'blocked on the gh dead-end' }),
  past(3, 'menu internals tranche 3', { flags: { complete: true }, tags: ['tg-work'] }),
  past(4, 'ask-about-this reference UX', { tags: ['tg-idea', 'tg-work'] }),
];

// 200 rows with 80+ char names and holes in the optional fields. This is the
// scenario that catches designs which only work on tidy data (spec §4).
const STRESS_PAST: PastSession[] = Array.from({ length: 220 }, (_, i) =>
  past(i, i % 3 === 0
    ? `refactor the transcript watcher byte-offset reader and its eight downstream consumers (${i})`
    : `session ${i}`,
    i % 5 === 0 ? { tags: ['tg-work', 'tg-bug', 'tg-idea'] } : {}));

export function seed(scenario: ScenarioId): MockState {
  const base: MockState = {
    sessions: SESSIONS, past: DEFAULT_PAST, providers: PROVIDERS,
    catalog: CATALOG, tags: TAGS, defaults: DEFAULTS,
  };
  switch (scenario) {
    case 'empty':
      return { ...base, sessions: [], past: [], tags: [] };
    case 'no-providers':
      return { ...base, providers: PROVIDERS.map((p) => ({ ...p, ready: false })), catalog: [] };
    case 'stress':
      return { ...base, past: STRESS_PAST };
    case 'refused':
    case 'default':
    default:
      return base;
  }
}
```

Create `src/renderer/dev/workbench/mock-store.ts`:

```ts
import { seed, type MockState, type ScenarioId } from './scenarios';

export interface MockStore {
  getState(): MockState;
  setState(fn: (s: MockState) => MockState): void;
  subscribe(fn: () => void): () => void;
  /** When true every write channel resolves {ok:false}, so the real
   *  components' optimistic-revert paths actually run (spec §3.3). */
  refuseWrites: boolean;
}

export function createStore(scenario: ScenarioId): MockStore {
  let state = seed(scenario);
  const subs = new Set<() => void>();
  return {
    getState: () => state,
    setState(fn) { state = fn(state); subs.forEach((f) => f()); },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    refuseWrites: scenario === 'refused',
  };
}
```

- [ ] **Step 5: Run the tests**

Run: `cd youcoded/desktop && npx vitest run tests/workbench-store.test.ts && npx tsc --noEmit`
Expected: PASS, 6 tests; typecheck clean.

- [ ] **Step 6: Commit**

```bash
cd youcoded && git add desktop/src/renderer/dev/workbench desktop/tests/workbench-store.test.ts
git commit -m "feat(workbench): stateful mock store with five named scenarios"
```

---

## Task 3: The mock shim — Proxy catch-all and the MOCK_ONLY registry

**Files:**
- Create: `src/renderer/dev/workbench/mock-shim.ts`
- Create: `src/renderer/dev/workbench/mock-only.ts`
- Modify: `src/renderer/dev/workbench/install-mock.ts`
- Test: `youcoded/desktop/tests/workbench-mock-contract.test.ts`

**Interfaces:**
- Consumes: `createStore` / `MockStore` (Task 2).
- Produces:
  - `createMockShim(store: MockStore): any`
  - `MOCK_ONLY: ReadonlyArray<{ channel: string; feature: string }>`
  - `HAND_WRITTEN: ReadonlyArray<string>` — dotted paths the shim implements, e.g. `'session.list'`

- [ ] **Step 1: Write the failing contract test**

Create `youcoded/desktop/tests/workbench-mock-contract.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HAND_WRITTEN } from '../src/renderer/dev/workbench/mock-shim';
import { MOCK_ONLY } from '../src/renderer/dev/workbench/mock-only';

const preload = readFileSync(join(__dirname, '../src/main/preload.ts'), 'utf8');
const mockOnly = new Set(MOCK_ONLY.map((m) => m.channel));

describe('workbench mock contract', () => {
  // The rule that keeps UI-first development honest: a hand-written channel
  // either mirrors something real, or is registered as not-yet-built.
  it('every hand-written channel is real or registered MOCK_ONLY', () => {
    const orphans = HAND_WRITTEN.filter((path) => {
      if (mockOnly.has(path)) return false;
      const leaf = path.split('.').pop()!;
      return !new RegExp(`\\b${leaf}\\s*:`).test(preload);
    });
    expect(orphans).toEqual([]);
  });

  // A stale registry is worse than none — it would keep claiming a feature is
  // unbuilt after it shipped.
  it('no MOCK_ONLY entry has since gained a real preload channel', () => {
    const stale = MOCK_ONLY.filter((m) =>
      new RegExp(`\\b${m.channel.split('.').pop()}\\s*:`).test(preload));
    expect(stale).toEqual([]);
  });

  it('every MOCK_ONLY entry names the feature it belongs to', () => {
    expect(MOCK_ONLY.filter((m) => !m.feature.trim())).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd youcoded/desktop && npx vitest run tests/workbench-mock-contract.test.ts`
Expected: FAIL — cannot find `mock-shim`.

- [ ] **Step 3: Write `mock-only.ts`**

```ts
// Channels the workbench implements that have NO real backend yet. Each names
// the unbuilt feature it belongs to, so a fake can never quietly ship as real —
// and so this list doubles as the backend to-do when a design is approved.
// Spec §3.2, §6.2.
export const MOCK_ONLY: ReadonlyArray<{ channel: string; feature: string }> = [
  // Empty today. Add entries as new UI is designed ahead of its backend, e.g.
  // { channel: 'session.setColor', feature: 'per-session color coding' },
];
```

- [ ] **Step 4: Write `mock-shim.ts`**

```ts
import type { MockStore } from './mock-store';

/** Dotted paths this shim implements by hand. The contract test
 *  (tests/workbench-mock-contract.test.ts) checks each against preload.ts. */
export const HAND_WRITTEN: ReadonlyArray<string> = [];  // Task 4 fills this in.

const warned = new Set<string>();

/** Safe empty value for an unimplemented channel. Resolving (rather than
 *  hanging) is the whole point: a real bridge would answer, and a 30s timeout
 *  reads as a bug in the UI under design rather than a missing stub. */
function emptyFor(): Promise<null> { return Promise.resolve(null); }

/** Wraps a namespace so unimplemented members warn once and resolve empty,
 *  instead of throwing "not a function". This is what keeps a few-hundred
 *  channel surface from becoming a stubbing project (spec §3.2). */
function withCatchAll(namespace: string, impl: Record<string, unknown>): Record<string, unknown> {
  return new Proxy(impl, {
    get(target, prop: string) {
      if (prop in target) return (target as any)[prop];
      // `on.*` members are subscription registrars — they must return an
      // unsubscribe function synchronously, not a promise.
      if (namespace === 'on') return () => () => {};
      return (...args: unknown[]) => {
        const key = `${namespace}.${prop}`;
        if (!warned.has(key)) {
          warned.add(key);
          console.warn(`[workbench] unimplemented channel ${key}`, args);
        }
        return emptyFor();
      };
    },
    has() { return true; },
  });
}

// Namespaces the renderer reaches for. Derived from the typed contract in
// renderer/hooks/useIpc.ts (21 namespaces) plus the untyped `theme` namespace
// that theme-context.tsx uses.
const NAMESPACES = [
  'session', 'skills', 'on', 'dialog', 'shell', 'terminal', 'update', 'remote',
  'account', 'social', 'marketplaceApi', 'detach', 'defaults', 'analytics', 'dev',
  'performance', 'app', 'native', 'providers', 'engine', 'models', 'theme',
  'commands', 'tags', 'artifacts', 'firstRun', 'clipboard', 'window',
];

export function createMockShim(store: MockStore): any {
  const impls: Record<string, Record<string, unknown>> = handWritten(store);
  const bridge: Record<string, unknown> = { devLabel: 'Workbench' };
  for (const ns of NAMESPACES) bridge[ns] = withCatchAll(ns, impls[ns] ?? {});
  return new Proxy(bridge, {
    get(target, prop: string) {
      if (prop in target) return (target as any)[prop];
      return withCatchAll(prop, {});
    },
  });
}

/** Hand-written channel implementations. Task 4 fills this in. */
function handWritten(_store: MockStore): Record<string, Record<string, unknown>> {
  return {};
}
```

- [ ] **Step 5: Wire it into `install-mock.ts`**

Replace the placeholder body:

```ts
import { createStore } from './mock-store';
import { createMockShim } from './mock-shim';
import type { ScenarioId } from './scenarios';

/** Scenario comes from ?scenario= so a reload lands on the same seed. */
function currentScenario(): ScenarioId {
  const raw = new URLSearchParams(location.search).get('scenario');
  const allowed = ['default', 'empty', 'no-providers', 'refused', 'stress'];
  return (allowed.includes(raw ?? '') ? raw : 'default') as ScenarioId;
}

export function installMock(): void {
  if ((window as any).claude) return;
  const store = createStore(currentScenario());
  (window as any).__workbenchStore = store;   // read by the toolbar (Task 7)
  (window as any).claude = createMockShim(store);
}
```

- [ ] **Step 6: Run the tests**

Run: `cd youcoded/desktop && npx vitest run tests/workbench-mock-contract.test.ts tests/workbench-install-mock.test.ts && npx tsc --noEmit`
Expected: PASS (3 + 2 tests); typecheck clean.

- [ ] **Step 7: Commit**

```bash
cd youcoded && git add desktop/src/renderer/dev/workbench desktop/tests/workbench-mock-contract.test.ts
git commit -m "feat(workbench): Proxy catch-all shim + MOCK_ONLY contract registry"
```

---

## Task 4: Hand-written channels for the surfaces under design

**Files:**
- Modify: `src/renderer/dev/workbench/mock-shim.ts`
- Test: `youcoded/desktop/tests/workbench-channels.test.ts`

**Interfaces:**
- Consumes: `MockStore` (Task 2), `HAND_WRITTEN` (Task 3).
- Produces: a populated `HAND_WRITTEN` list and a `handWritten()` returning implementations for
  `session.list/create/browse/setFlag/setTag/setNote/destroy`, `providers.list/catalog`,
  `models.memoryCheck`, `defaults.get/set`, `native.supported`, `detach.openDetached`,
  `tags.list/create/update/remove`, `on.sessionMetaChanged`.

- [ ] **Step 1: Write the failing test**

Create `youcoded/desktop/tests/workbench-channels.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createStore } from '../src/renderer/dev/workbench/mock-store';
import { createMockShim } from '../src/renderer/dev/workbench/mock-shim';

describe('workbench channels', () => {
  it('session.browse returns the seeded past sessions', async () => {
    const c = createMockShim(createStore('default'));
    expect((await c.session.browse()).length).toBeGreaterThan(0);
  });

  it('session.create adds a row that session.list then returns', async () => {
    const c = createMockShim(createStore('default'));
    const before = (await c.session.list()).length;
    await c.session.create({ name: 'new one', cwd: '/tmp', skipPermissions: false });
    expect((await c.session.list()).length).toBe(before + 1);
  });

  it('session.setTag persists and is readable back', async () => {
    const store = createStore('default');
    const c = createMockShim(store);
    const id = (await c.session.browse())[0].sessionId;
    await c.session.setTag(id, 'tg-idea', true);
    const row = (await c.session.browse()).find((s: any) => s.sessionId === id);
    expect(row.tags).toContain('tg-idea');
  });

  // The refused scenario is what makes ResumeBrowser.tsx:428's revert visible.
  it('writes resolve {ok:false} under the refused scenario', async () => {
    const c = createMockShim(createStore('refused'));
    const id = (await c.session.browse())[0].sessionId;
    expect(await c.session.setTag(id, 'tg-idea', true)).toEqual({ ok: false });
  });

  it('providers.list reflects the scenario', async () => {
    expect((await createMockShim(createStore('no-providers')).providers.list())
      .every((p: any) => !p.ready)).toBe(true);
  });

  // Browser-only mode has no Electron, but detachAvailable gates the "Launch in
  // New Window" toggle in BOTH new-session forms (SessionStrip.tsx:1068,
  // ResumeBrowser.tsx:584) — omitting it deletes a control under redesign.
  it('detach.openDetached exists so the new-window toggle renders', () => {
    expect(typeof createMockShim(createStore('default')).detach.openDetached).toBe('function');
  });

  it('native.supported is true so the runtime selector renders', () => {
    expect(createMockShim(createStore('default')).native.supported).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd youcoded/desktop && npx vitest run tests/workbench-channels.test.ts`
Expected: FAIL — `session.browse()` resolves `null`, so `.length` throws.

- [ ] **Step 3: Implement `handWritten()`**

Replace the stub in `mock-shim.ts`. Note `native.supported` is a **boolean property**, not a
function — `isNativeSupported()` in `RuntimeBinding.tsx:101` reads it directly.

```ts
export const HAND_WRITTEN: ReadonlyArray<string> = [
  'session.list', 'session.create', 'session.browse', 'session.destroy',
  'session.setFlag', 'session.setTag', 'session.setNote',
  'providers.list', 'providers.catalog', 'models.memoryCheck',
  'defaults.get', 'defaults.set', 'detach.openDetached',
  'tags.list', 'tags.create', 'tags.update', 'tags.remove',
];

function handWritten(store: MockStore): Record<string, Record<string, unknown>> {
  const metaSubs = new Set<(id: string, meta: any) => void>();
  const ok = () => (store.refuseWrites ? { ok: false } : { ok: true });
  /** Applies a mutation only when writes are allowed, so the refused scenario
   *  exercises the components' revert paths rather than silently succeeding. */
  const write = (mutate: () => void) => {
    if (store.refuseWrites) return Promise.resolve({ ok: false });
    mutate();
    return Promise.resolve({ ok: true });
  };

  return {
    session: {
      list: async () => store.getState().sessions,
      browse: async () => store.getState().past,
      create: async (opts: any) => {
        const id = `wb-${Math.round(performance.now())}`;
        const created = {
          id, name: opts.name || 'new session', cwd: opts.cwd || '',
          permissionMode: opts.skipPermissions ? 'bypass' : 'normal',
          skipPermissions: !!opts.skipPermissions, status: 'active',
          createdAt: 1_753_800_000_000, provider: opts.provider ?? 'claude',
          harnessId: opts.harnessId, model: opts.model,
        };
        store.setState((s) => ({ ...s, sessions: [...s.sessions, created as any] }));
        return created;
      },
      destroy: async (id: string) => {
        store.setState((s) => ({ ...s, sessions: s.sessions.filter((x) => x.id !== id) }));
        return { ok: true };
      },
      setFlag: (id: string, flag: string, value: boolean) => write(() => {
        store.setState((s) => ({ ...s, past: s.past.map((p) => p.sessionId === id
          ? { ...p, flags: { ...(p.flags ?? {}), [flag]: value } } : p) }));
        metaSubs.forEach((f) => f(id, { flag, value }));
      }),
      setTag: (id: string, tagId: string, value: boolean) => write(() => {
        store.setState((s) => ({ ...s, past: s.past.map((p) => p.sessionId === id
          ? { ...p, tags: value
              ? [...new Set([...(p.tags ?? []), tagId])]
              : (p.tags ?? []).filter((t) => t !== tagId) }
          : p) }));
        metaSubs.forEach((f) => f(id, { flag: `tag:${tagId}`, value }));
      }),
      setNote: (id: string, note: string) => write(() => {
        store.setState((s) => ({ ...s, past: s.past.map((p) =>
          p.sessionId === id ? { ...p, note } : p) }));
        metaSubs.forEach((f) => f(id, { note }));
      }),
    },
    providers: {
      list: async () => store.getState().providers,
      catalog: async () => store.getState().catalog,
    },
    models: {
      // RuntimeBinding.tsx:193 only calls this for the local-engine provider.
      memoryCheck: async (modelId: string) => modelId.includes('14b')
        ? { verdict: 'tight', headline: 'This model is a tight fit.',
            detail: 'Loading it may evict another resident model.' }
        : { verdict: 'ok', headline: '', detail: '' },
    },
    defaults: {
      get: async () => store.getState().defaults,
      set: async (patch: Record<string, unknown>) => {
        store.setState((s) => ({ ...s, defaults: { ...s.defaults, ...patch } }));
        return ok();
      },
    },
    native: { supported: true },
    detach: {
      // Present so `detachAvailable` is true and the "Launch in New Window"
      // toggle renders. A browser tab cannot actually detach — say so loudly
      // rather than pretending it worked.
      openDetached: () => { console.warn('[workbench] detach is not available in a browser tab'); },
    },
    tags: {
      list: async () => store.getState().tags,
      create: async (label: string, color: string) => {
        const tag = { id: `tg-${label}-${store.getState().tags.length}`, label, color, archived: false };
        store.setState((s) => ({ ...s, tags: [...s.tags, tag as any] }));
        return tag;
      },
      update: async (id: string, patch: Record<string, unknown>) => {
        store.setState((s) => ({ ...s, tags: s.tags.map((t) =>
          t.id === id ? { ...t, ...patch } : t) }));
        return ok();
      },
      remove: async (id: string) => {
        store.setState((s) => ({ ...s, tags: s.tags.filter((t) => t.id !== id) }));
        return ok();
      },
    },
    on: {
      sessionMetaChanged: (fn: (id: string, meta: any) => void) => {
        metaSubs.add(fn);
        return () => metaSubs.delete(fn);
      },
    },
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `cd youcoded/desktop && npx vitest run tests/workbench-channels.test.ts tests/workbench-mock-contract.test.ts && npx tsc --noEmit`
Expected: PASS (7 + 3). If the contract test reports an orphan, the channel does not exist in
`preload.ts` under that name — either fix the name or add a `MOCK_ONLY` entry naming the
unbuilt feature. **Do not loosen the test.**

- [ ] **Step 5: Verify in the browser**

Run `bash scripts/run-workbench.sh`, open the workbench, and click: session pill → New Session
→ pick a folder → Create. The new session should appear in the strip. Open Resume; toggle a
tag on a row; reload with `?mode=workbench&scenario=refused` and confirm the tag snaps back.
**Flag this pass for Destin** — do not script it.

- [ ] **Step 6: Commit**

```bash
cd youcoded && git add desktop/src/renderer/dev/workbench/mock-shim.ts desktop/tests/workbench-channels.test.ts
git commit -m "feat(workbench): hand-written channels for session, tag, provider and model surfaces"
```

---

## Task 5: Conversation fixtures via reducer replay

**Files:**
- Move: `src/renderer/dev/fixture-loader.ts` → `src/renderer/dev/workbench/fixture-loader.ts`
- Move: `src/renderer/dev/fixture-loader.test.ts` → `src/renderer/dev/workbench/fixture-loader.test.ts`
- Move: `src/renderer/dev/fixtures/*.jsonl` → `src/renderer/dev/workbench/fixtures/tools/`
- Create: `src/renderer/dev/workbench/fixtures/conversations/{claude-code,native}.jsonl`
- Create: `src/renderer/dev/workbench/seed-chat.ts`
- Test: `youcoded/desktop/tests/workbench-fixture-actions.test.ts`

**Interfaces:**
- Consumes: `chatReducer`, `ChatAction` from `state/chat-types`.
- Produces:
  - `loadFixture(name, raw): LoadResult` — unchanged signature, `LoadResult` gains `actions: ChatAction[]`
  - `seedChat(dispatch: (a: ChatAction) => void): void`

- [ ] **Step 1: Move the loader, keeping git history**

```bash
cd youcoded/desktop/src/renderer/dev
mkdir -p workbench/fixtures/tools
git mv fixture-loader.ts workbench/fixture-loader.ts
git mv fixture-loader.test.ts workbench/fixture-loader.test.ts
git mv fixtures/*.jsonl workbench/fixtures/tools/
```

Fix the two relative imports at the top of `workbench/fixture-loader.ts` — `'../state/chat-reducer'`
becomes `'../../state/chat-reducer'`, same for `chat-types`. Update the test's import path.

Run: `cd youcoded/desktop && npx vitest run src/renderer/dev/workbench/fixture-loader.test.ts`
Expected: PASS — the existing cases still pass after the move.

- [ ] **Step 2: Write the failing test for the new line kinds**

Create `youcoded/desktop/tests/workbench-fixture-actions.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { loadFixture } from '../src/renderer/dev/workbench/fixture-loader';

const CONVO = [
  '{"type":"user_message","text":"fix the scroll stick"}',
  '{"type":"assistant_text","text":"Reading ChatView.tsx."}',
  '{"type":"tool_use","id":"t1","name":"Read","input":{"file_path":"/a/ChatView.tsx"}}',
  '{"type":"tool_result","tool_use_id":"t1","content":"ok"}',
].join('\n');

describe('fixture replay', () => {
  it('emits an action per user_message and assistant_text line', () => {
    const r = loadFixture('convo', CONVO);
    expect(r.error).toBeUndefined();
    const types = r.actions.map((a) => a.type);
    expect(types).toContain('USER_PROMPT');
    expect(types).toContain('TRANSCRIPT_ASSISTANT_TEXT');
  });

  it('still returns tool blocks for the existing tool fixtures', () => {
    const r = loadFixture('convo', CONVO);
    expect(r.blocks.filter((b) => b.kind === 'tool')).toHaveLength(1);
  });

  it('reports a parse error rather than throwing', () => {
    expect(loadFixture('bad', '{not json}').error).toContain('parse error');
  });
});
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `cd youcoded/desktop && npx vitest run tests/workbench-fixture-actions.test.ts`
Expected: FAIL — `r.actions` is undefined.

- [ ] **Step 4: Extend the loader**

In `workbench/fixture-loader.ts`:

1. Add `actions: ChatAction[]` to `LoadResult`.
2. Declare `const actions: ChatAction[] = [];` beside `blocks`, and push **every** action you
   dispatch (the existing `TRANSCRIPT_TOOL_USE`, `TRANSCRIPT_TOOL_RESULT` and
   `PERMISSION_REQUEST` branches each gain one `actions.push(action);` line right after their
   `state = chatReducer(state, action);`).
3. Add two branches before the `text` branch:

```ts
      } else if (parsed.type === 'user_message' && typeof parsed.text === 'string') {
        // WHY USER_PROMPT and not TRANSCRIPT_USER_MESSAGE: the optimistic path
        // is the one a live session takes first, and it is what puts the bubble
        // on the timeline. See desktop/CLAUDE.md "Chat View Data Flow" #3.
        const action: ChatAction = {
          type: 'USER_PROMPT', sessionId: SANDBOX_SESSION_ID, text: parsed.text,
        } as ChatAction;
        state = chatReducer(state, action);
        actions.push(action);
      } else if (parsed.type === 'assistant_text' && typeof parsed.text === 'string') {
        const action: ChatAction = {
          type: 'TRANSCRIPT_ASSISTANT_TEXT', sessionId: SANDBOX_SESSION_ID,
          uuid: `${name}-txt-${actions.length}`, text: parsed.text,
        } as ChatAction;
        state = chatReducer(state, action);
        actions.push(action);
      }
```

4. Return `{ blocks, actions }` on success and `{ blocks: [], actions: [], error: ... }` on failure.

> **Check the real action shapes before writing this.** `USER_PROMPT` and
> `TRANSCRIPT_ASSISTANT_TEXT` field names come from `state/chat-types.ts` — read the union,
> don't trust the `as ChatAction` casts above. Remove the casts once the fields are right;
> a cast that hides a wrong shape is exactly the drift this file exists to prevent.

- [ ] **Step 5: Write the conversation fixtures**

Create `workbench/fixtures/conversations/claude-code.jsonl`:

```
{"type":"user_message","text":"the chat view sticks to the bottom while I'm scrolling up"}
{"type":"assistant_text","text":"Let me look at the scroll re-arm logic."}
{"type":"tool_use","id":"c1","name":"Read","input":{"file_path":"/home/destin/youcoded-dev/youcoded/desktop/src/renderer/components/ChatView.tsx"}}
{"type":"tool_result","tool_use_id":"c1","content":"1  import React from 'react';\n2  // ..."}
{"type":"assistant_text","text":"The re-arm check runs on every scroll event. Moving it off the hot path."}
{"type":"tool_use","id":"c2","name":"Edit","input":{"file_path":"/home/destin/youcoded-dev/youcoded/desktop/src/renderer/components/ChatView.tsx","old_string":"onScroll={check}","new_string":"onScroll={throttled}"}}
{"type":"tool_result","tool_use_id":"c2","content":"Applied 1 edit."}
```

Create `workbench/fixtures/conversations/native.jsonl`:

```
{"type":"user_message","text":"check the contrast on the crème theme"}
{"type":"assistant_text","text":"Running the contrast audit."}
{"type":"tool_use","id":"n1","name":"Bash","input":{"command":"node scripts/audit-theme-contrast.mjs"}}
{"type":"tool_result","tool_use_id":"n1","content":"creme: fg-dim 3.1:1 PASS\ncreme: link 3.59:1 PASS"}
```

- [ ] **Step 6: Write `seed-chat.ts`**

```ts
// Replays the conversation fixtures through the real chat reducer on workbench
// boot. This is the same action sequence a live session produces, so reducer
// drift surfaces here automatically (spec §3.3).
import type { ChatAction } from '../../state/chat-types';
import { loadFixture } from './fixture-loader';

// @ts-ignore TS1343 — Vite rewrites import.meta.glob statically at build time.
const convos = import.meta.glob('./fixtures/conversations/*.jsonl', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;

/** Session ids must match the seeded SessionInfo rows so the timeline lands on
 *  the session the strip is showing. Keyed by fixture filename. */
const SESSION_FOR: Record<string, string> = {
  'claude-code': 'wb-1',
  native: 'wb-2',
};

export function seedChat(dispatch: (a: ChatAction) => void): void {
  for (const [path, raw] of Object.entries(convos)) {
    const name = path.split('/').pop()!.replace('.jsonl', '');
    const sessionId = SESSION_FOR[name];
    if (!sessionId) continue;
    dispatch({ type: 'SESSION_INIT', sessionId } as ChatAction);
    const { actions, error } = loadFixture(name, raw);
    if (error) { console.warn(`[workbench] ${error}`); continue; }
    // fixture-loader stamps its own SANDBOX_SESSION_ID; retarget each action at
    // the real seeded session so ChatView finds the timeline.
    for (const a of actions) dispatch({ ...a, sessionId } as ChatAction);
  }
}
```

- [ ] **Step 7: Run the tests**

Run: `cd youcoded/desktop && npx vitest run tests/workbench-fixture-actions.test.ts src/renderer/dev/workbench/fixture-loader.test.ts && npx tsc --noEmit`
Expected: PASS; typecheck clean.

- [ ] **Step 8: Commit**

```bash
cd youcoded && git add -A desktop/src/renderer/dev desktop/tests/workbench-fixture-actions.test.ts
git commit -m "feat(workbench): replay conversation fixtures through the real chat reducer"
```

---

## Task 6: Themes

**Files:**
- Modify: `src/renderer/dev/workbench/mock-shim.ts`
- Create: `src/renderer/dev/workbench/fixtures/themes/halftone-dimension.json`

- [ ] **Step 1: Vendor the community pack**

```bash
cp wecoded-themes/themes/halftone-dimension/manifest.json \
   youcoded/desktop/src/renderer/dev/workbench/fixtures/themes/halftone-dimension.json
```

- [ ] **Step 2: Add the two theme channels**

The four builtins need nothing — `theme-context.tsx:15-18` imports them directly. Community
packs go through `claude.theme.list()` + `readFile()` (`theme-context.tsx:238-243`). Add to
`handWritten()`:

```ts
    theme: {
      // No network (spec §2) — community packs are vendored fixtures.
      list: async () => Object.keys(THEME_FIXTURES),
      readFile: async (slug: string) => THEME_FIXTURES[slug] ?? '{}',
      // Writes never touch disk; re-firing reload is what makes an edited
      // fixture + HMR reflect live.
      writeFile: async () => ({ ok: true }),
    },
```

and above `handWritten()`:

```ts
// @ts-ignore TS1343 — Vite rewrites import.meta.glob at build time.
const themeRaw = import.meta.glob('./fixtures/themes/*.json', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;
const THEME_FIXTURES: Record<string, string> = Object.fromEntries(
  Object.entries(themeRaw).map(([p, raw]) => [p.split('/').pop()!.replace('.json', ''), raw]),
);
```

Add `'theme.list'`, `'theme.readFile'`, `'theme.writeFile'` to `HAND_WRITTEN`.

- [ ] **Step 3: Run the contract test**

Run: `cd youcoded/desktop && npx vitest run tests/workbench-mock-contract.test.ts`
Expected: PASS. If `theme.*` reports as an orphan, confirm the real channel names in
`preload.ts` before adding a `MOCK_ONLY` entry — `theme` is untyped (`useIpc.ts` has no
`theme` namespace), so the compiler will not have caught a wrong name.

- [ ] **Step 4: Commit**

```bash
cd youcoded && git add desktop/src/renderer/dev/workbench
git commit -m "feat(workbench): serve builtin + vendored community themes through the real engine"
```

---

## Task 7: The toolbar

**Files:**
- Create: `src/renderer/dev/workbench/WorkbenchToolbar.tsx`
- Create: `src/renderer/dev/workbench/WorkbenchFrame.tsx`
- Modify: `src/renderer/App.tsx` (add the `?mode=workbench` route beside the sandbox route)

- [ ] **Step 1: Write `WorkbenchFrame.tsx`**

```tsx
import React from 'react';
import App from '../../App';
import { WorkbenchToolbar } from './WorkbenchToolbar';

// WHY a flex column with the app in a sized child rather than a fixed overlay:
// HeaderBar's layout is SPACE-aware (packSessions() measures clientWidth), so a
// toolbar floating ON TOP of the app would leave the header measuring a width
// the real app never has. Shrinking the container keeps the measurement honest.
export function WorkbenchFrame() {
  const [narrow, setNarrow] = React.useState(false);
  return (
    <div className="h-screen w-screen flex flex-col bg-well">
      <WorkbenchToolbar narrow={narrow} onNarrow={setNarrow} />
      <div className="flex-1 min-h-0 flex justify-center overflow-hidden">
        {/* 640px is the real breakpoint (use-narrow-viewport.ts) — not a new number. */}
        <div className="h-full" style={{ width: narrow ? 390 : '100%' }}>
          <App />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write `WorkbenchToolbar.tsx`**

Use the real primitives (`Select`, `Toggle`) from `components/ui` — the workbench is not
exempt from the primitive rule, and using them is free extra exercise of them.

```tsx
import React from 'react';
import { Select, Toggle } from '../../components/ui';
import { useTheme } from '../../state/theme-context';
import { VARIANT_REGISTRY, useVariant } from './variants';

const SCENARIOS = ['default', 'empty', 'no-providers', 'refused', 'stress'];

export function WorkbenchToolbar({ narrow, onNarrow }: {
  narrow: boolean; onNarrow: (v: boolean) => void;
}) {
  const { theme, setTheme, themes } = useTheme();
  const scenario = new URLSearchParams(location.search).get('scenario') ?? 'default';
  const [variant, setVariant] = useVariant();

  return (
    <div className="shrink-0 flex items-center gap-3 px-3 py-1.5 bg-panel border-b border-edge">
      <span className="text-3xs font-medium text-fg-muted tracking-wider uppercase">Workbench</span>

      <Select size="sm" aria-label="Theme" value={theme}
        options={themes.map((t: string) => ({ value: t, label: t }))}
        onChange={setTheme} />

      {/* Scenario reseeds the store, so it reloads rather than mutating live. */}
      <Select size="sm" aria-label="Scenario" value={scenario}
        options={SCENARIOS.map((s) => ({ value: s, label: s }))}
        onChange={(next) => {
          const u = new URL(location.href);
          u.searchParams.set('scenario', next);
          location.assign(u.toString());
        }} />

      {Object.entries(VARIANT_REGISTRY).map(([surface, list]) => (
        <Select key={surface} size="sm" aria-label={`${surface} variant`}
          value={variant[surface] ?? list[0].id}
          options={list.map((v) => ({ value: v.id, label: `${surface}: ${v.label}` }))}
          onChange={(id) => setVariant(surface, id)} />
      ))}

      <label className="ml-auto flex items-center gap-1.5 text-3xs text-fg-muted">
        Narrow (640px)
        <Toggle checked={narrow} onChange={onNarrow} aria-label="Narrow viewport" />
      </label>
    </div>
  );
}
```

> `useTheme()`'s exact returned field names come from `state/theme-context.tsx` — read it and
> match. If it exposes `activeTheme`/`cycle` rather than `theme`/`themes`, use those.

- [ ] **Step 3: Route it in `App.tsx`**

Beside the existing sandbox route at `App.tsx:3482`, add — **above** it, since the sandbox
route is deleted in Task 10 and the workbench must not depend on ordering with it:

```tsx
  // Dev-only UI Workbench. Renders the REAL <App/> inside a toolbar frame; the
  // mock bridge was installed in index.tsx before React mounted.
  if (import.meta.env.DEV && buddyMode === 'workbench') {
    return <WorkbenchFrameRoute />;
  }
```

and beside the `ToolSandboxRoute` declaration at `App.tsx:111`:

```tsx
const WorkbenchFrameRoute: React.ComponentType = import.meta.env.DEV
  ? React.lazy(() =>
      // @ts-ignore TS1343 — Vite handles the dynamic import.
      import('./dev/workbench/WorkbenchFrame').then((m) => ({ default: m.WorkbenchFrame })))
  : () => null;
```

**Recursion check:** `WorkbenchFrame` imports `App`, and `App` lazily imports `WorkbenchFrame`.
The lazy import breaks the cycle at module level, but `WorkbenchFrame` renders `<App/>`, whose
`buddyMode` is still `'workbench'` — which would recurse. Guard it: `WorkbenchFrame` renders
`<App workbenchChild />` and the route check becomes
`if (import.meta.env.DEV && buddyMode === 'workbench' && !props.workbenchChild)`. Add the
optional prop to `App`'s signature.

- [ ] **Step 4: Verify**

Run `bash scripts/run-workbench.sh` and confirm the toolbar renders above the app, theme
switching re-themes everything, the scenario dropdown reloads with a different seed, and the
narrow toggle collapses the layout. **Flag for Destin.**

- [ ] **Step 5: Commit**

```bash
cd youcoded && git add desktop/src/renderer/dev/workbench desktop/src/renderer/App.tsx
git commit -m "feat(workbench): toolbar frame with theme, scenario, variant and viewport controls"
```

---

## Task 8: The variant registry

**Files:**
- Create: `src/renderer/dev/workbench/variants.ts`
- Test: `youcoded/desktop/tests/workbench-variants.test.ts`

**Interfaces:**
- Produces:
  - `VARIANT_REGISTRY: Record<string, Array<{ id: string; label: string; component: React.ComponentType<any> }>>`
  - `useVariant(): [Record<string, string>, (surface: string, id: string) => void]`
  - `pickVariant(surface: string, fallback: C): C`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { VARIANT_REGISTRY } from '../src/renderer/dev/workbench/variants';

describe('variant registry', () => {
  // The rule that stops a variant drifting from what ships: `current` must be a
  // live import of the real component, never a fork. Spec §3.4.
  it('every surface lists a `current` variant first', () => {
    for (const [surface, list] of Object.entries(VARIANT_REGISTRY)) {
      expect(list[0].id, `${surface} must lead with current`).toBe('current');
    }
  });

  it('variant ids are unique per surface', () => {
    for (const [surface, list] of Object.entries(VARIANT_REGISTRY)) {
      const ids = list.map((v) => v.id);
      expect(new Set(ids).size, `${surface} has duplicate ids`).toBe(ids.length);
    }
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd youcoded/desktop && npx vitest run tests/workbench-variants.test.ts`
Expected: FAIL — cannot find `variants`.

- [ ] **Step 3: Implement**

```tsx
import React from 'react';
import ResumeBrowser from '../../components/ResumeBrowser';

// Design alternatives, side by side as REAL components. `current` is a live
// import of the shipping file — never a copy — so it cannot drift from the app.
// Alternatives are new sibling files (ResumeBrowser.v2.tsx). Picking a winner:
// delete the losers, move the winner over the real filename, drop the entry.
export const VARIANT_REGISTRY: Record<string, Array<{
  id: string; label: string; component: React.ComponentType<any>;
}>> = {
  ResumeBrowser: [
    { id: 'current', label: 'current', component: ResumeBrowser },
  ],
};

const KEY = 'workbench-variants';

function read(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}'); } catch { return {}; }
}

export function useVariant(): [Record<string, string>, (s: string, id: string) => void] {
  const [state, setState] = React.useState(read);
  const set = React.useCallback((surface: string, id: string) => {
    setState((prev) => {
      const next = { ...prev, [surface]: id };
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);
  return [state, set];
}

/** Resolve the active component for a surface. Call sites render
 *  `pickVariant('ResumeBrowser', ResumeBrowser)` so the app path is unchanged
 *  outside the workbench. */
export function pickVariant<C extends React.ComponentType<any>>(surface: string, fallback: C): C {
  const chosen = read()[surface];
  const found = VARIANT_REGISTRY[surface]?.find((v) => v.id === chosen);
  return (found?.component as C) ?? fallback;
}
```

- [ ] **Step 4: Run tests and commit**

Run: `cd youcoded/desktop && npx vitest run tests/workbench-variants.test.ts && npx tsc --noEmit`
Expected: PASS.

```bash
cd youcoded && git add desktop/src/renderer/dev/workbench/variants.ts desktop/tests/workbench-variants.test.ts
git commit -m "feat(workbench): variant registry with a live-import current variant"
```

---

## Task 9: The tool gallery (absorbing ToolSandbox)

**Files:**
- Create: `src/renderer/dev/workbench/ToolGallery.tsx`
- Modify: `src/renderer/dev/workbench/WorkbenchToolbar.tsx`

- [ ] **Step 1: Port the gallery**

Create `ToolGallery.tsx` by copying the rendering logic from `dev/ToolSandbox.tsx` —
`orderedBlocks()`, `renderBlocks()`, and the `<ChatProvider>` wrapper — changing only the glob
path to `./fixtures/tools/*.jsonl`. Keep the WHY comments about Skill reordering and group
containers; they explain non-obvious behavior that is still true.

- [ ] **Step 2: Add a view toggle to the toolbar**

Add to `WorkbenchFrame`:

```tsx
  const [view, setView] = React.useState<'app' | 'tools'>('app');
```

pass `view`/`onView` into the toolbar as a two-option `Select` (`app`, `tools`), and render
`{view === 'app' ? <App workbenchChild /> : <ToolGallery />}`.

- [ ] **Step 3: Verify every fixture renders**

Run `bash scripts/run-workbench.sh`, switch the view to `tools`, and confirm all 24 fixtures
render as ToolCards — including the two `bash-awaiting-approval*` fixtures showing the
Yes/No/Always-allow strip. **Flag for Destin.**

- [ ] **Step 4: Commit**

```bash
cd youcoded && git add desktop/src/renderer/dev/workbench
git commit -m "feat(workbench): tool gallery absorbing the ToolCard sandbox fixtures"
```

---

## Task 10: Delete the ToolCard sandbox and update the docs

**Files:**
- Delete: `src/renderer/dev/ToolSandbox.tsx`, `youcoded-dev/scripts/run-sandbox.sh`
- Modify: `src/renderer/App.tsx:109-116,3480-3483`, `components/ToolCard.tsx:719`,
  `components/AssistantTurnBubble.tsx:109`, `src/main/main.ts:653-659`
- Modify: `youcoded-dev/CLAUDE.md`, `youcoded-dev/docs/MAP.md`,
  `youcoded-dev/.claude/rules/react-renderer.md`

- [ ] **Step 1: Delete the code**

```bash
cd youcoded && git rm desktop/src/renderer/dev/ToolSandbox.tsx
cd .. && git rm scripts/run-sandbox.sh
```

Remove `ToolSandboxRoute` (`App.tsx:109-116`) and its route branch (`App.tsx:3480-3483`).

- [ ] **Step 2: Fix the stale references**

`ToolCard.tsx:719` and `AssistantTurnBubble.tsx:109` both mention the sandbox in comments —
retarget them to the workbench tool gallery. `main.ts:655`'s comment cites `?mode=tool-sandbox`
as the `YOUCODED_DEV_URL` example — change the example to `?mode=workbench`. **Keep the env
var**; `run-dev.sh` and other callers still use it.

- [ ] **Step 3: Verify nothing still references it**

Run: `cd /home/destin/youcoded-dev && rg -n "tool-sandbox|ToolSandbox|run-sandbox" --glob '!docs/archive/**' .`
Expected: no hits outside `docs/archive/`. Archived plans are history — leave them.

- [ ] **Step 4: Update the docs**

Replace `CLAUDE.md`'s `### ToolCard sandbox` block with a `### UI Workbench` block: what it is,
`bash scripts/run-workbench.sh`, and that **new UI is built here before its backend exists**.
Keep it to 3–4 lines and point at the rule.

Add to `.claude/rules/react-renderer.md` a short "UI iteration tooling" section — it
auto-injects on every `src/renderer/` edit, so it is the highest-leverage home: use
`run-workbench.sh` for building or redesigning UI; use `run-dev.sh` when you need real event
ordering, PTY, or main-process behavior.

Add a `docs/MAP.md` row: **UI Workbench** | `youcoded/desktop/src/renderer/dev/workbench/`,
`scripts/run-workbench.sh` | react-renderer | `docs/active/specs/2026-07-29-ui-workbench-design.md` |
`tests/workbench-mock-contract.test.ts`, `tests/workbench-channels.test.ts`.

- [ ] **Step 5: Run the full suite**

Run: `cd youcoded/desktop && npm test && npx tsc --noEmit`
Expected: all green. A failure here most likely means a test still imports the deleted module.

- [ ] **Step 6: Commit**

```bash
cd youcoded && git add -A && git commit -m "refactor(dev): delete the ToolCard sandbox, absorbed by the UI workbench"
cd .. && git add -A && git commit -m "docs: retire the ToolCard sandbox, document the UI workbench"
```

---

## Task 11: Prove it tree-shakes, then rewrite the skill

**Files:**
- Modify: `youcoded-dev/.claude/skills/ui-mockup/SKILL.md`

- [ ] **Step 1: Verify production exclusion**

```bash
cd youcoded/desktop && npm run build
grep -ril "workbench" dist/ && echo "LEAK — workbench reached the prod bundle" || echo "OK: tree-shaken"
```

Expected: `OK: tree-shaken`. If it leaks, an `import.meta.env.DEV` gate is missing — most
likely a static import of a workbench module somewhere in the always-loaded path.

- [ ] **Step 2: Rewrite the skill**

Rewrite `.claude/skills/ui-mockup/SKILL.md`. **Delete** the entire rendering half — the
Tailwind utility reimplementation table, the token value list, the `computeOverlayTokens`
recipes, the glass-cascade rules, the BrailleSpinner cadence, and the Artifact publishing
section. All of it is now supplied by running the real CSS.

**Keep and re-point** the process half:
- Numbered changes, one-line what/why each, a change-ledger table, approve-by-number. Never
  renumber an approved change; new feedback gets new numbers.
- Before/after on real app surfaces, not component grids.
- Halftone Dimension as the standard stress theme.
- Explicit fidelity notes — never let an approximation pass silently.
- On ambiguous feedback, prefer the smallest literal reading and ask.
- Decisions get captured into a spec under `docs/active/specs/`, never left in chat.

**Add** the workbench workflow: run `bash scripts/run-workbench.sh`; build alternatives as real
components registered in `variants.ts`; review under `stress` and `empty`, not just `default`;
finalize by deleting the losers, promoting the winner over the real filename, and turning the
`MOCK_ONLY` entries into real IPC handlers.

Update the frontmatter `description` — it currently promises "interactive HTML artifacts",
which will be false.

- [ ] **Step 3: Commit**

```bash
cd /home/destin/youcoded-dev && git add .claude/skills/ui-mockup/SKILL.md
git commit -m "docs(skill): repoint ui-mockup at the workbench, drop the hand-written CSS half"
```

---

## Self-review

**Spec coverage.** §3.1 → Task 1. §3.2 → Task 3. §3.3 → Tasks 2 and 5. §3.4 → Task 8.
§3.5 → Task 7 (toolbar) and Task 6 (themes). §3.6 → Task 2. §4 (`stress`) → Task 2 step 1,
enforced by a test. §5 (deletion) → Tasks 9 and 10. §6.1 (launcher) → Task 1. §7 (skill) →
Task 11. §8 (guard tests) → Tasks 3, 4, 5, 8. §9 deliverables 1–10 all map to a task.

**Known gaps, deliberate.** §6.2's "promote MOCK_ONLY channels" has no task because it has
nothing to promote yet — `MOCK_ONLY` ships empty and fills as designs are built. The `empty`
and `no-providers` scenarios have unit tests but no dedicated review task; they are exercised
by the §4 review rule in Task 11's skill rewrite.

**Type consistency.** `MockStore`, `MockState`, `ScenarioId`, `PastSession`, `ProviderRow`,
`CatalogRow` are defined in Task 2 and used unchanged in Tasks 3, 4, 6. `HAND_WRITTEN` and
`MOCK_ONLY` are defined in Task 3 and extended in Tasks 4 and 6. `LoadResult` gains `actions`
in Task 5 and is consumed by `seedChat` in the same task.

**Three snippets are deliberately marked "verify against source" rather than asserted**, because
I did not read those files in full: `TagRecord`'s fields (Task 2), the `USER_PROMPT` /
`TRANSCRIPT_ASSISTANT_TEXT` action shapes (Task 5), and `useTheme()`'s returned field names
(Task 7). Each carries an inline instruction to take the real shape. Do not let the `as
ChatAction` casts in Task 5 survive — a cast that hides a wrong shape defeats the point of
replaying through the real reducer.
