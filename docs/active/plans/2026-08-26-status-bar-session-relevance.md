---
status: draft
created: 2026-08-26
spec: docs/active/specs/2026-08-25-status-bar-session-relevance-design.md
tags: [renderer, native-runtime, ux, status-bar]
---

# Status Bar Session Relevance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every session-scoped number in the status bar true, complete (specialist
work included), and explicit about what it counts — and stop rendering Claude-Code-only
chips in native sessions.

**Architecture:** Totals are accumulated **incrementally in the chat reducer** as events
arrive, so they are O(1) per event, referentially stable for `useSyncExternalStore`, and
rebuilt automatically by transcript replay on resume. Main computes only what main knows:
a per-turn `costUsd` on the existing `turn-complete` payload, and one new
`subagent-usage` transcript event carrying a finished specialist's tokens and cost. The
renderer never multiplies tokens by a price itself.

**Tech stack:** TypeScript, React 18, Vitest + @testing-library/react (renderer),
Electron main (Node), Vite. All work is in `youcoded/desktop`.

## Before you start

1. **Read the spec**: `docs/active/specs/2026-08-25-status-bar-session-relevance-design.md`.
   §2 (the contract), §5 (cost), §8 (where numbers come from) and §12 (checkpoints) are the
   load-bearing sections.
2. **Read** `.claude/rules/react-renderer.md` and `docs/MAP.md` for the status-bar and
   chat-reducer entries.
3. **Work in a worktree** (workspace rule — never build this on `master`):

```bash
cd /home/destin/youcoded-dev/youcoded
git fetch origin && git pull origin master
git worktree add ../../statusbar-relevance -b feat/statusbar-session-relevance
cp -al desktop/node_modules ../../statusbar-relevance/desktop/node_modules   # hardlinks, NEVER a symlink
```

`cp -al` is mandatory: a symlinked or junctioned `node_modules` has repeatedly wiped the
main checkout's dependencies and makes `verify.sh` silently skip suites. See
`docs/PITFALLS.md` → Cross-repo invariants.

4. **Verify after every task**: `bash scripts/verify.sh ../../statusbar-relevance` from the
   workspace root. Individual suites: `cd <worktree>/desktop && npx vitest run tests/<file>`.

## Global constraints

- **Never invent a number.** A chip with no value renders nothing — never `--`, never
  `$0.00`, never "No changes" (`docs/error-message-standards.md`).
- **Every user-facing string in this plan is final copy.** Do not paraphrase tooltips; they
  were reviewed as prose. If one reads wrong, raise it — don't silently reword it.
- **No new IPC channel.** One new transcript event type on the existing stream. Nothing in
  `SessionService.kt`, `preload.ts`, `remote-shim.ts` or `remote-server.ts` changes.
- **Two runtimes, one component.** `SessionProvider` is `'claude' | 'native'`. Desktop, the
  remote browser and Android all render the same `StatusBar.tsx`.
- **Cost units:** `CatalogModel.pricing` is **USD per 1,000,000 tokens**. Every conversion
  in this plan divides by `1e6`. OpenRouter's raw payload is USD-per-token (scaled by `1e6`
  at the mapper); models.dev's is already per-1M.
- **Do not touch Git Branch.** It is already invisible in native sessions and is tracked as
  its own ROADMAP item. No `appliesTo`, no menu reason line, no code change.

## File structure

| File | Change | Responsibility |
|---|---|---|
| `src/renderer/state/status-widgets.ts` | **Create** | `WidgetId` union (moved out of StatusBar), the Claude-only set, `widgetApplies()`, and the menu reason lines. One source both the bar and the menu read. |
| `src/renderer/state/session-totals.ts` | **Create** | `SessionTotals` type, `emptyTotals()`, `addTurnUsage()`, `addSubagentUsage()`, `addPatchLines()`. Pure functions, no React. |
| `src/renderer/state/chat-types.ts` | Modify | `totals` on `SessionChatState`; serialize/deserialize it; the `TRANSCRIPT_SUBAGENT_USAGE` action. |
| `src/renderer/state/chat-reducer.ts` | Modify | Accumulate totals at three existing sites + one new action. |
| `src/renderer/hooks/useNativeSessionTotals.ts` | **Create** | `useSyncExternalStore` reader for one session's totals. |
| `src/renderer/components/StatusBar.tsx` | Modify | `provider` prop; runtime gate; totals-fed chips; tooltips; menu reason lines. |
| `src/renderer/App.tsx` | Modify | Pass `provider` + totals to `StatusBar`; native fallbacks in `getUsageSnapshot`; dispatch the new event. |
| `src/renderer/components/UsageCard.tsx` | Modify | Label the subscription bars account-wide; omit unfillable rows. |
| `src/shared/types.ts` | Modify | `'subagent-usage'` event type; `costUsd` on the usage payload. |
| `src/shared/provider-types.ts` | Modify | `pricing.cacheRead` / `pricing.cacheWrite`. |
| `src/main/providers/model-catalog.ts` | Modify | Map the cache rates from both catalog sources. |
| `src/main/harness/pricing.ts` | **Create** | `costForUsage(usage, pricing)` — the one place tokens become dollars. |
| `src/main/harness/harness-session.ts` | Modify | `opts.pricing`; stamp `costUsd` on `turn-complete`; `emitSubagentUsage()`. |
| `src/main/harness/native-session-host.ts` | Modify | `pricingFor` resolver; pass pricing at create/resume/setBinding; emit `subagent-usage` when a specialist finishes. |
| `src/main/ipc-handlers.ts` | Modify | Wire `pricingFor` alongside the three existing resolvers. |
| `src/renderer/dev/workbench/*` | Modify | Scenarios for the seven review states. |

---

### Task 1: Prove the session record carries what the totals need

The whole design assumes a resumed session can rebuild its own totals. Two facts must hold:
`turn-complete` is persisted **with its usage payload**, and `tool-result` is persisted
**with its `structuredPatch`**. Both are believed true; neither is pinned. Pin them first —
if either is false, the tooltips in Task 7 must say so instead of quietly showing a smaller
number.

**Files:**
- Test: `desktop/tests/native-session-record-completeness.test.ts` (create)

**Interfaces:**
- Consumes: `SessionStore` (`src/main/harness/session-store.ts`), `TranscriptEvent`
  (`src/shared/types.ts`).
- Produces: nothing consumed by later tasks — this is a gate.

- [ ] **Step 1: Write the failing test**

```ts
// desktop/tests/native-session-record-completeness.test.ts
//
// WHY this exists: every session total in the status bar (tokens, cost, code
// changes) is derived from the session's own recorded events and rebuilt by
// replay on resume. That is only true if the record actually carries the
// per-turn usage and the per-edit patch. Pin both — a silent regression here
// would make a resumed session report smaller numbers than it showed live,
// which is the exact class of quiet wrongness this work exists to remove.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SessionStore } from '../src/main/harness/session-store';
import type { TranscriptEvent } from '../src/shared/types';

describe('native session record completeness', () => {
  let dir: string;
  let store: SessionStore;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yc-record-'));
    store = new SessionStore(dir);
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const ev = (type: TranscriptEvent['type'], data: TranscriptEvent['data']): TranscriptEvent =>
    ({ type, sessionId: 's1', uuid: `u-${type}-${JSON.stringify(data).length}`, timestamp: 1, data });

  it('round-trips turn-complete usage', async () => {
    await store.append(dir, ev('turn-complete', {
      stopReason: 'end_turn',
      usage: { inputTokens: 1200, outputTokens: 300, cacheReadTokens: 900, cacheCreationTokens: 100 },
    }));
    const back = await store.read(dir, 's1');
    const turn = back.find((e) => e.type === 'turn-complete');
    expect(turn?.data.usage).toEqual({
      inputTokens: 1200, outputTokens: 300, cacheReadTokens: 900, cacheCreationTokens: 100,
    });
  });

  it('round-trips a tool-result structuredPatch', async () => {
    await store.append(dir, ev('tool-result', {
      toolUseId: 't1',
      toolName: 'Edit',
      structuredPatch: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 2, lines: [' keep', '-gone', '+new'] }],
    }));
    const back = await store.read(dir, 's1');
    const res = back.find((e) => e.type === 'tool-result');
    expect(res?.data.structuredPatch?.[0].lines).toEqual([' keep', '-gone', '+new']);
  });
});
```

- [ ] **Step 2: Run it**

Run: `cd <worktree>/desktop && npx vitest run tests/native-session-record-completeness.test.ts`

Expected: PASS. **If it fails**, the constructor/method names differ — open
`src/main/harness/session-store.ts`, fix the call shape (do NOT change the assertions), and
re-run. If a payload genuinely does not round-trip, **stop and report it**: Task 7's tooltip
copy and the spec's §2 point 3 depend on the answer.

- [ ] **Step 3: Commit**

```bash
git add tests/native-session-record-completeness.test.ts
git commit -m "test(native): pin that turn-complete usage and tool-result patches survive the session record"
```

---

### Task 2: One registry for widget relevance

Move the widget id union out of `StatusBar.tsx` into a module the bar *and* the Customize
menu both import, so the two can never disagree about what a session can show.

**Files:**
- Create: `desktop/src/renderer/state/status-widgets.ts`
- Modify: `desktop/src/renderer/components/StatusBar.tsx:463-470` (delete the local
  `WidgetId` type, import it instead)
- Test: `desktop/tests/status-widgets.test.ts` (create)

**Interfaces:**
- Produces: `type WidgetId`, `type SessionRuntime = 'claude' | 'native'`,
  `widgetApplies(id: WidgetId, runtime: SessionRuntime): boolean`,
  `widgetUnavailableReason(id: WidgetId, ctx: RelevanceContext): string | null`,
  `interface RelevanceContext { runtime: SessionRuntime; hasPricedWork: boolean }`.

- [ ] **Step 1: Write the failing test**

```ts
// desktop/tests/status-widgets.test.ts
import { describe, it, expect } from 'vitest';
import { widgetApplies, widgetUnavailableReason } from '../src/renderer/state/status-widgets';

describe('widgetApplies', () => {
  it('hides the Claude subscription chips in a native session', () => {
    expect(widgetApplies('usage-5h', 'native')).toBe(false);
    expect(widgetApplies('usage-7d', 'native')).toBe(false);
  });

  it('shows them in a Claude Code session', () => {
    expect(widgetApplies('usage-5h', 'claude')).toBe(true);
    expect(widgetApplies('usage-7d', 'claude')).toBe(true);
  });

  it('leaves every other widget to the has-a-value rule', () => {
    for (const id of ['context', 'session-cost', 'code-changes', 'git-branch', 'theme'] as const) {
      expect(widgetApplies(id, 'native')).toBe(true);
    }
  });
});

describe('widgetUnavailableReason', () => {
  const native = { runtime: 'native' as const, hasPricedWork: true };

  it('explains the subscription chips', () => {
    expect(widgetUnavailableReason('usage-5h', native)).toBe('Claude Code sessions only — see /usage');
  });

  it('explains the unmeasured chips', () => {
    expect(widgetUnavailableReason('session-time', native)).toBe('Not measured in this kind of session yet');
    expect(widgetUnavailableReason('active-ratio', native)).toBe('Not measured in this kind of session yet');
  });

  it('explains a cost chip with nothing priced', () => {
    expect(widgetUnavailableReason('session-cost', { runtime: 'native', hasPricedWork: false }))
      .toBe('No published price for this model');
  });

  it('says nothing about cost when priced work exists', () => {
    expect(widgetUnavailableReason('session-cost', native)).toBeNull();
  });

  it('never explains git-branch away — it is a missing feed, not a relevance rule', () => {
    expect(widgetUnavailableReason('git-branch', native)).toBeNull();
  });

  it('says nothing in a Claude Code session', () => {
    const cc = { runtime: 'claude' as const, hasPricedWork: true };
    expect(widgetUnavailableReason('usage-5h', cc)).toBeNull();
    expect(widgetUnavailableReason('session-time', cc)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd <worktree>/desktop && npx vitest run tests/status-widgets.test.ts`
Expected: FAIL — `Failed to resolve import "../src/renderer/state/status-widgets"`.

- [ ] **Step 3: Create the module**

```ts
// desktop/src/renderer/state/status-widgets.ts
//
// The one place that answers "can this session show this widget at all?".
// Both the status bar and its Customize popup read it, so the bar can never
// hide a chip the menu still offers, or vice versa (spec §9).
//
// WHY a separate module rather than a helper inside StatusBar.tsx: the popup is
// rendered from StatusBar but the ANSWER is also needed by tests and, later, by
// the /usage card. A shared module keeps one definition; a local helper would
// have grown a second copy the first time something else needed it.

/** Every toggleable widget in WIDGET_CATEGORIES (StatusBar.tsx). Moved here so
 *  the relevance rules and the registry can reference one union. */
export type WidgetId =
  | 'usage-5h' | 'usage-7d' | 'context' | 'git-branch' | 'sync-warnings' | 'theme' | 'version'
  | 'session-cost' | 'tokens-in' | 'tokens-out' | 'cache-stats' | 'code-changes' | 'session-time'
  | 'cache-hit-rate' | 'active-ratio' | 'output-speed'
  | 'announcement'
  | 'open-tasks'
  | 'session-tags';

/** The session's runtime — NOT its provider type. Known the instant a session
 *  exists and never absent, which is why the gate below can never flicker. */
export type SessionRuntime = 'claude' | 'native';

export interface RelevanceContext {
  runtime: SessionRuntime;
  /** Has any counted work in this session had a published price? Drives the
   *  cost chip's reason line only. */
  hasPricedWork: boolean;
}

/** Widgets that describe the Claude SUBSCRIPTION — an account a native session
 *  neither spends nor is limited by. These are the only widgets gated on the
 *  runtime; everything else is gated on whether it has a value to show. */
const CLAUDE_ONLY: ReadonlySet<WidgetId> = new Set<WidgetId>(['usage-5h', 'usage-7d']);

/** Chips a native session has no measurement for. NOT a relevance judgment —
 *  the harness simply does not report turn wall-time yet (spec §15). */
const UNMEASURED_IN_NATIVE: ReadonlySet<WidgetId> = new Set<WidgetId>(['session-time', 'active-ratio']);

export function widgetApplies(id: WidgetId, runtime: SessionRuntime): boolean {
  return runtime === 'claude' || !CLAUDE_ONLY.has(id);
}

/** One line for the Customize menu explaining why a row can't be turned on
 *  here, or null when there is nothing to explain.
 *
 *  git-branch is deliberately absent: it is missing because nothing feeds it,
 *  not because it doesn't apply, and "Claude Code sessions only" would be a
 *  false sentence — the exact defect this work removes (spec §4). */
export function widgetUnavailableReason(id: WidgetId, ctx: RelevanceContext): string | null {
  if (ctx.runtime === 'claude') return null;
  if (CLAUDE_ONLY.has(id)) return 'Claude Code sessions only — see /usage';
  if (UNMEASURED_IN_NATIVE.has(id)) return 'Not measured in this kind of session yet';
  if (id === 'session-cost' && !ctx.hasPricedWork) return 'No published price for this model';
  return null;
}
```

- [ ] **Step 4: Run the test**

Run: `cd <worktree>/desktop && npx vitest run tests/status-widgets.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Point StatusBar at the shared union**

In `src/renderer/components/StatusBar.tsx`, delete the local `type WidgetId = …` block
(around line 463) and add to the imports at the top of the file:

```ts
import { type WidgetId, type SessionRuntime, widgetApplies, widgetUnavailableReason } from '../state/status-widgets';
```

- [ ] **Step 6: Typecheck**

Run: `cd <worktree>/desktop && npx tsc --noEmit`
Expected: clean. If `WidgetId` was also imported elsewhere, repoint those imports too.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/state/status-widgets.ts src/renderer/components/StatusBar.tsx tests/status-widgets.test.ts
git commit -m "refactor(status-bar): one shared registry for widget relevance"
```

---

### Task 3: Gate the Claude-only chips, and stop rendering `--`

**Files:**
- Modify: `desktop/src/renderer/components/StatusBar.tsx` (Props ~line 400; body ~1017;
  the 5h chip ~1165; the 7d chip ~1178; the Fast chip ~1118)
- Modify: `desktop/src/renderer/App.tsx:2936` (pass `provider`)
- Test: `desktop/tests/statusbar-session-relevance.test.tsx` (create)

**Interfaces:**
- Consumes: `widgetApplies`, `SessionRuntime` from Task 2.
- Produces: `StatusBar` accepts `provider?: 'claude' | 'native'` (absent → treated as
  `'claude'`, so an unwired caller hides nothing).

- [ ] **Step 1: Write the failing test**

```tsx
// desktop/tests/statusbar-session-relevance.test.tsx
//
// The bar must not render another runtime's furniture. 5h/7d describe a Claude
// subscription a native session doesn't spend; Fast mode is a Claude Code
// toggle nothing native honours (spec §3).
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatusBar from '../src/renderer/components/StatusBar';

const statusData = {
  usage: {
    five_hour: { utilization: 42, resets_at: new Date(Date.now() + 3.6e6).toISOString() },
    seven_day: { utilization: 17, resets_at: new Date(Date.now() + 8.6e7).toISOString() },
  },
  updateStatus: null,
  announcement: null,
  contextPercent: null,
  gitBranch: null,
  sessionStats: null,
  syncWarnings: [],
} as any;

describe('StatusBar runtime relevance', () => {
  it('shows the subscription chips and the Fast chip in a Claude Code session', () => {
    render(<StatusBar statusData={statusData} provider="claude" fast sessionId="s1" />);
    expect(screen.getByText('5h:')).toBeInTheDocument();
    expect(screen.getByText('7d:')).toBeInTheDocument();
    expect(screen.getByText(/fast/i)).toBeInTheDocument();
  });

  it('renders none of them in a native session', () => {
    render(<StatusBar statusData={statusData} provider="native" fast sessionId="s1" />);
    expect(screen.queryByText('5h:')).toBeNull();
    expect(screen.queryByText('7d:')).toBeNull();
    expect(screen.queryByText(/fast/i)).toBeNull();
  });

  it('treats an unwired provider as Claude Code, so nothing hides by accident', () => {
    render(<StatusBar statusData={statusData} fast sessionId="s1" />);
    expect(screen.getByText('5h:')).toBeInTheDocument();
  });
});

describe('StatusBar renders no empty chips', () => {
  // Rule 1 (spec §3): a chip with no value hides. Verified today: Session
  // Duration (StatusBar.tsx:1289) and Active Ratio (:1377) both print a literal
  // '--' in every native session, forever, and the token/speed chips do the same
  // before their first turn.
  const widgets = ['session-time', 'active-ratio', 'tokens-in', 'tokens-out', 'output-speed', 'cache-stats', 'cache-hit-rate'];

  it('renders no "--" anywhere in a native session with no data', () => {
    window.localStorage.setItem('youcoded-statusbar-widgets', JSON.stringify(widgets));
    const { container } = render(<StatusBar statusData={statusData} provider="native" sessionId="s1" />);
    expect(container.textContent).not.toContain('--');
  });

  it('renders no "--" in a Claude Code session whose stats have not arrived yet', () => {
    window.localStorage.setItem('youcoded-statusbar-widgets', JSON.stringify(widgets));
    const { container } = render(<StatusBar statusData={statusData} provider="claude" sessionId="s1" />);
    expect(container.textContent).not.toContain('--');
  });

  it('still renders the chip once it has a value', () => {
    window.localStorage.setItem('youcoded-statusbar-widgets', JSON.stringify(['active-ratio']));
    const withStats = { ...statusData, sessionStats: { duration: 1000, apiDuration: 250 } };
    render(<StatusBar statusData={withStats} provider="claude" sessionId="s1" />);
    expect(screen.getByText('25%')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd <worktree>/desktop && npx vitest run tests/statusbar-session-relevance.test.tsx`
Expected: FAIL — the native case still finds `5h:`.

- [ ] **Step 3: Add the prop and the gate**

In the `Props` interface (after `modelProviderType`):

```ts
  /** The session's runtime. Gates the two Claude-subscription chips and the
   *  Fast toggle — see status-widgets.ts. Absent → treated as 'claude', so a
   *  caller that hasn't been wired yet hides nothing (spec §11). */
  provider?: SessionRuntime;
```

In the destructured parameter list (line ~1017), add `provider,`. Immediately after
`const show = (id: WidgetId) => visible.has(id);`, replace it with:

```ts
  // Runtime gate (spec §3, Rule 2): a widget that belongs to the OTHER runtime
  // never renders here, whatever the user's saved on/off choice says. The choice
  // itself is untouched and returns the moment they switch back.
  const runtime: SessionRuntime = provider ?? 'claude';
  const show = (id: WidgetId) => visible.has(id) && widgetApplies(id, runtime);
```

Change the Fast chip's condition (line ~1118) from `{fast && (` to:

```tsx
      {/* Fast mode is a Claude Code toggle read from the app-wide model-modes
          file — nothing in a native session honours it, so rendering it there
          is a control that lies (spec §1). Not a registry widget, so it takes
          the runtime gate directly rather than going through show(). */}
      {fast && runtime === 'claude' && (
```

The 5h and 7d chips need no edit — `show()` now gates them.

- [ ] **Step 4: Run the test**

Run: `cd <worktree>/desktop && npx vitest run tests/statusbar-session-relevance.test.tsx`
Expected: PASS (3 tests). The three Rule 1 tests below still fail — Step 5 fixes them.

- [ ] **Step 5: Implement Rule 1 — no value, no chip**

Every chip that currently prints a literal `'--'` gets an early return instead. There are
seven: `session-time` (:1284), `active-ratio` (:1369), `tokens-in`, `tokens-out`,
`cache-stats`, `cache-hit-rate`, `output-speed`. The shape is the same for each — wrap the
body in an IIFE, compute the value first, and bail before rendering:

```tsx
      {/* Session duration.
          Rule 1 (spec §3): no value, no chip. This used to render a literal
          '--' — forever in a native session, where the statusline that feeds it
          never runs, and briefly in a CC session before the first stats arrive.
          An empty chip is furniture that teaches the user to ignore the bar. */}
      {show('session-time') && ss?.duration != null && (
        <span
          className="flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-panel border border-edge-dim"
          title={ss.apiDuration != null ? `Wall: ${formatDuration(ss.duration)} | API: ${formatDuration(ss.apiDuration)}` : 'Session duration'}
        >
          <span>{formatDuration(ss.duration)}</span>
          {ss.apiDuration != null && (
            <span className="text-fg-muted hidden sm:inline">({formatDuration(ss.apiDuration)} API)</span>
          )}
        </span>
      )}
```

For `active-ratio`, the guard is `ss?.duration != null && ss?.apiDuration != null && ss.duration > 0`
(the same condition the `'--'` branch was already testing). For the four token chips and
`output-speed`, the guard is the derived value being non-null — e.g.
`{show('tokens-in') && inTokens != null && (`. Delete every `: '--'` fallback you pass; do
not leave one behind "just in case", or the test above will catch it.

**Note for the Task 9 review:** in a Claude Code session these chips now appear a second or
two into a session rather than sitting at `--` from the start. That pop-in is the intended
trade (a chip that says nothing is worse than one that arrives), but it is a visible change
for CC users and belongs on the review page.

- [ ] **Step 6: Run the tests**

Run: `cd <worktree>/desktop && npx vitest run tests/statusbar-session-relevance.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 7: Pass the prop from App**

In `src/renderer/App.tsx` at the `<StatusBar` call site (line ~2936), add alongside
`model={modelChip}`:

```tsx
                  provider={isNativeSession ? 'native' : 'claude'}
```

`isNativeSession` is already defined at line 2527 (`currentSession?.provider === 'native'`).

- [ ] **Step 8: Verify**

Run: `bash scripts/verify.sh <worktree>` from the workspace root.
Expected: passes. Existing status-bar suites must stay green — if one renders `StatusBar`
without `provider` and expects 5h/7d, that is the intended default and it should still pass.
If a suite asserted the literal `'--'` for an empty chip, that assertion is now wrong on
purpose: update it and cite spec §3 in the test comment.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/components/StatusBar.tsx src/renderer/App.tsx tests/statusbar-session-relevance.test.tsx
git commit -m "feat(status-bar): hide another runtime's chips, and stop rendering empty ones"
```

---

### Task 4: Session totals — the pure arithmetic

The accumulator, with no React and no store in sight. Everything later just calls these.

**Files:**
- Create: `desktop/src/renderer/state/session-totals.ts`
- Test: `desktop/tests/session-totals.test.ts` (create)

**Interfaces:**
- Produces:
  - `interface SessionTotals { inputTokens; outputTokens; cacheReadTokens; cacheCreationTokens; costUsd; anyPriced: boolean; anyUnpriced: boolean; linesAdded; linesRemoved; specialistRuns; }` (all numbers except the two booleans)
  - `emptyTotals(): SessionTotals`
  - `addTurnUsage(t: SessionTotals, u: TurnUsageLike): SessionTotals`
  - `addSubagentUsage(t: SessionTotals, u: TurnUsageLike): SessionTotals`
  - `addPatchLines(t: SessionTotals, hunks: StructuredPatchHunk[]): SessionTotals`
  - `interface TurnUsageLike { inputTokens?: number; outputTokens?: number; cacheReadTokens?: number; cacheCreationTokens?: number; costUsd?: number | null }`

- [ ] **Step 1: Write the failing test**

```ts
// desktop/tests/session-totals.test.ts
import { describe, it, expect } from 'vitest';
import {
  emptyTotals, addTurnUsage, addSubagentUsage, addPatchLines,
} from '../src/renderer/state/session-totals';

const hunk = (lines: string[]) => [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines }];

describe('session totals', () => {
  it('starts at zero with no pricing verdict either way', () => {
    const t = emptyTotals();
    expect(t).toEqual({
      inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0,
      costUsd: 0, anyPriced: false, anyUnpriced: false,
      linesAdded: 0, linesRemoved: 0, specialistRuns: 0,
    });
  });

  it('sums tokens across turns', () => {
    let t = emptyTotals();
    t = addTurnUsage(t, { inputTokens: 100, outputTokens: 10, cacheReadTokens: 5, cacheCreationTokens: 2 });
    t = addTurnUsage(t, { inputTokens: 250, outputTokens: 40, cacheReadTokens: 200, cacheCreationTokens: 0 });
    expect(t.inputTokens).toBe(350);
    expect(t.outputTokens).toBe(50);
    expect(t.cacheReadTokens).toBe(205);
    expect(t.cacheCreationTokens).toBe(2);
  });

  it('adds cost only when a price was known, and records that it was', () => {
    let t = emptyTotals();
    t = addTurnUsage(t, { inputTokens: 1, outputTokens: 1, costUsd: 0.25 });
    expect(t.costUsd).toBeCloseTo(0.25, 10);
    expect(t.anyPriced).toBe(true);
    expect(t.anyUnpriced).toBe(false);
  });

  it('records an explicitly unpriced turn without inventing a zero', () => {
    let t = emptyTotals();
    t = addTurnUsage(t, { inputTokens: 1, outputTokens: 1, costUsd: null });
    expect(t.costUsd).toBe(0);
    expect(t.anyPriced).toBe(false);
    expect(t.anyUnpriced).toBe(true);
  });

  it('ignores pricing entirely when the field is absent (a Claude Code turn)', () => {
    let t = emptyTotals();
    t = addTurnUsage(t, { inputTokens: 1, outputTokens: 1 });
    expect(t.anyPriced).toBe(false);
    expect(t.anyUnpriced).toBe(false);
  });

  it('folds a specialist run into the same totals and counts it', () => {
    let t = emptyTotals();
    t = addTurnUsage(t, { inputTokens: 100, outputTokens: 10, costUsd: 0.1 });
    t = addSubagentUsage(t, { inputTokens: 900, outputTokens: 90, costUsd: 0.9 });
    expect(t.inputTokens).toBe(1000);
    expect(t.outputTokens).toBe(100);
    expect(t.costUsd).toBeCloseTo(1.0, 10);
    expect(t.specialistRuns).toBe(1);
  });

  it('a paid specialist under a free parent still marks the session priced', () => {
    let t = emptyTotals();
    t = addTurnUsage(t, { inputTokens: 10, outputTokens: 1, costUsd: null });   // local parent
    t = addSubagentUsage(t, { inputTokens: 90, outputTokens: 9, costUsd: 0.42 }); // metered child
    expect(t.anyPriced).toBe(true);
    expect(t.costUsd).toBeCloseTo(0.42, 10);
  });

  it('counts added and removed lines, ignoring context lines', () => {
    let t = emptyTotals();
    t = addPatchLines(t, hunk([' context', '-old', '+new', '+extra', ' more']));
    expect(t.linesAdded).toBe(2);
    expect(t.linesRemoved).toBe(1);
  });

  it('treats an empty or malformed hunk list as nothing to count', () => {
    let t = emptyTotals();
    t = addPatchLines(t, []);
    t = addPatchLines(t, [{ oldStart: 1, oldLines: 0, newStart: 1, newLines: 0, lines: undefined as any }]);
    expect(t.linesAdded).toBe(0);
    expect(t.linesRemoved).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd <worktree>/desktop && npx vitest run tests/session-totals.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the module**

```ts
// desktop/src/renderer/state/session-totals.ts
//
// Session-so-far totals for the status bar and the /usage card (spec §2).
//
// WHY accumulate instead of walking the timeline on demand: the reader is a
// useSyncExternalStore hook, which needs a referentially STABLE snapshot or
// React loops. An incremental object replaced only when a number actually
// changes is stable by construction, costs O(1) per event, and — because the
// reducer sees replayed events exactly as it sees live ones — is rebuilt for
// free when a resumed session replays its record.
//
// WHAT IS COUNTED, in one place, because three chips and a card all repeat it:
//   - every turn of this session, plus every specialist run under it
//   - input counted PER REQUEST: a long turn re-sends its history each step and
//     each send is counted, because that is what a provider bills for. (This is
//     deliberately NOT the context gauge's number — that one measures occupancy
//     and lives on TurnUsage.contextUsedTokens.)
import type { StructuredPatchHunk } from '../../shared/types';

export interface SessionTotals {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  /** USD for work whose model had a published price. Work with no published
   *  price contributes NOTHING here and sets anyUnpriced instead — a false zero
   *  is worse than an absent chip (docs/error-message-standards.md). */
  costUsd: number;
  /** Some counted work had a published price → a cost figure means something. */
  anyPriced: boolean;
  /** Some counted work had NO published price → the figure is incomplete, and
   *  the tooltip has to say so. */
  anyUnpriced: boolean;
  linesAdded: number;
  linesRemoved: number;
  /** Specialist runs folded in above. Lets a tooltip say "including 3 specialists". */
  specialistRuns: number;
}

export interface TurnUsageLike {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  /** number = priced; null = native work with no published price; ABSENT = no
   *  pricing information at all (a Claude Code turn, whose cost comes from the
   *  statusline instead). The three cases are deliberately distinct. */
  costUsd?: number | null;
}

export function emptyTotals(): SessionTotals {
  return {
    inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0,
    costUsd: 0, anyPriced: false, anyUnpriced: false,
    linesAdded: 0, linesRemoved: 0, specialistRuns: 0,
  };
}

function addUsage(t: SessionTotals, u: TurnUsageLike): SessionTotals {
  const next: SessionTotals = {
    ...t,
    inputTokens: t.inputTokens + (u.inputTokens ?? 0),
    outputTokens: t.outputTokens + (u.outputTokens ?? 0),
    cacheReadTokens: t.cacheReadTokens + (u.cacheReadTokens ?? 0),
    cacheCreationTokens: t.cacheCreationTokens + (u.cacheCreationTokens ?? 0),
  };
  if (typeof u.costUsd === 'number') {
    next.costUsd = t.costUsd + u.costUsd;
    next.anyPriced = true;
  } else if (u.costUsd === null) {
    next.anyUnpriced = true;
  }
  return next;
}

export function addTurnUsage(t: SessionTotals, u: TurnUsageLike): SessionTotals {
  return addUsage(t, u);
}

export function addSubagentUsage(t: SessionTotals, u: TurnUsageLike): SessionTotals {
  const next = addUsage(t, u);
  next.specialistRuns = t.specialistRuns + 1;
  return next;
}

/** Count real edits out of jsdiff-style hunks. Hunk lines are prefixed ' ',
 *  '-' or '+' by construction (tools/edit.ts, tools/write.ts), so this is a
 *  prefix count, not a diff. Defensive against a malformed record: a hunk with
 *  no lines array contributes nothing rather than throwing inside a reducer. */
export function addPatchLines(t: SessionTotals, hunks: StructuredPatchHunk[] | undefined): SessionTotals {
  if (!hunks?.length) return t;
  let added = 0;
  let removed = 0;
  for (const h of hunks) {
    if (!Array.isArray(h?.lines)) continue;
    for (const line of h.lines) {
      if (line.startsWith('+')) added++;
      else if (line.startsWith('-')) removed++;
    }
  }
  if (!added && !removed) return t;
  return { ...t, linesAdded: t.linesAdded + added, linesRemoved: t.linesRemoved + removed };
}
```

- [ ] **Step 4: Run the test**

Run: `cd <worktree>/desktop && npx vitest run tests/session-totals.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/state/session-totals.ts tests/session-totals.test.ts
git commit -m "feat(chat): session totals accumulator — tokens, cost, edited lines"
```

---

### Task 5: Accumulate totals in the reducer

**Files:**
- Modify: `desktop/src/renderer/state/chat-types.ts` (`SessionChatState`,
  `createSessionChatState`, `SerializedSessionChatState`, `serializeChatState`,
  `deserializeChatState`)
- Modify: `desktop/src/renderer/state/chat-reducer.ts` (the `TRANSCRIPT_TURN_COMPLETE`
  case; the main-timeline tool-result case ~1324-1335; the subagent tool-result case
  ~437-444)
- Test: `desktop/tests/session-totals-reducer.test.ts` (create)

**Interfaces:**
- Consumes: `emptyTotals`, `addTurnUsage`, `addPatchLines` (Task 4).
- Produces: `SessionChatState.totals: SessionTotals`, populated by the reducer.

- [ ] **Step 1: Write the failing test**

```ts
// desktop/tests/session-totals-reducer.test.ts
import { describe, it, expect } from 'vitest';
import { chatReducer } from '../src/renderer/state/chat-reducer';
import type { ChatState } from '../src/renderer/state/chat-types';

const SID = 's1';
const start = (): ChatState => chatReducer(new Map(), { type: 'SESSION_INIT', sessionId: SID });

const turnComplete = (usage: any, uuid: string) => ({
  type: 'TRANSCRIPT_TURN_COMPLETE' as const,
  sessionId: SID, uuid, timestamp: 1,
  stopReason: 'end_turn', model: 'm', anthropicRequestId: null, usage,
});

describe('reducer session totals', () => {
  it('sums usage across turns', () => {
    let s = start();
    s = chatReducer(s, turnComplete({ inputTokens: 100, outputTokens: 10, cacheReadTokens: 0, cacheCreationTokens: 0 }, 'u1'));
    s = chatReducer(s, turnComplete({ inputTokens: 200, outputTokens: 20, cacheReadTokens: 0, cacheCreationTokens: 0 }, 'u2'));
    expect(s.get(SID)!.totals.inputTokens).toBe(300);
    expect(s.get(SID)!.totals.outputTokens).toBe(30);
  });

  it('does not count a SUBAGENT turn-complete twice — the subagent-usage event owns that', () => {
    let s = start();
    s = chatReducer(s, {
      ...turnComplete({ inputTokens: 500, outputTokens: 50, cacheReadTokens: 0, cacheCreationTokens: 0 }, 'u3'),
      parentAgentToolUseId: 'parent-tool-1',
      agentId: 'child-1',
    } as any);
    expect(s.get(SID)!.totals.inputTokens).toBe(0);
  });

  it('counts edited lines from a tool result exactly once, even on a duplicate emit', () => {
    let s = start();
    const patch = [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 2, lines: [' ctx', '-a', '+b', '+c'] }];
    const use = { type: 'TRANSCRIPT_TOOL_USE' as const, sessionId: SID, uuid: 'tu', timestamp: 1, toolUseId: 't1', toolName: 'Edit', toolInput: {} };
    const result = { type: 'TRANSCRIPT_TOOL_RESULT' as const, sessionId: SID, uuid: 'tr', timestamp: 2, toolUseId: 't1', toolName: 'Edit', result: 'ok', isError: false, structuredPatch: patch };
    s = chatReducer(s, use as any);
    s = chatReducer(s, result as any);
    s = chatReducer(s, result as any);   // duplicate delivery (replay overlapping live)
    expect(s.get(SID)!.totals.linesAdded).toBe(2);
    expect(s.get(SID)!.totals.linesRemoved).toBe(1);
  });

  it('counts a SPECIALIST edit — the segment path, not the main tool-call path', () => {
    let s = start();
    const patch = [{ oldStart: 1, oldLines: 0, newStart: 1, newLines: 3, lines: ['+x', '+y', '+z'] }];
    s = chatReducer(s, { type: 'TRANSCRIPT_TOOL_USE', sessionId: SID, uuid: 'p1', timestamp: 1, toolUseId: 'task-1', toolName: 'Task', toolInput: {} } as any);
    s = chatReducer(s, { type: 'TRANSCRIPT_TOOL_USE', sessionId: SID, uuid: 'c1', timestamp: 2, toolUseId: 'ct-1', toolName: 'Write', toolInput: {}, parentAgentToolUseId: 'task-1', agentId: 'child-1' } as any);
    s = chatReducer(s, { type: 'TRANSCRIPT_TOOL_RESULT', sessionId: SID, uuid: 'c2', timestamp: 3, toolUseId: 'ct-1', toolName: 'Write', result: 'ok', isError: false, structuredPatch: patch, parentAgentToolUseId: 'task-1', agentId: 'child-1' } as any);
    expect(s.get(SID)!.totals.linesAdded).toBe(3);
  });

  it('survives serialization', async () => {
    const { serializeChatState, deserializeChatState } = await import('../src/renderer/state/chat-types');
    let s = start();
    s = chatReducer(s, turnComplete({ inputTokens: 7, outputTokens: 3, cacheReadTokens: 1, cacheCreationTokens: 0 }, 'u9'));
    const back = deserializeChatState(serializeChatState(s));
    expect(back.get(SID)!.totals.inputTokens).toBe(7);
  });

  it('gives a pre-field snapshot empty totals rather than undefined', async () => {
    const { deserializeChatState, createSessionChatState } = await import('../src/renderer/state/chat-types');
    const legacy: any = { sessions: [[SID, { ...createSessionChatState(), toolCalls: [], toolGroups: [], assistantTurns: [], activeTurnToolIds: [], seenUuids: [], totals: undefined }]] };
    const back = deserializeChatState(legacy);
    expect(back.get(SID)!.totals.inputTokens).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd <worktree>/desktop && npx vitest run tests/session-totals-reducer.test.ts`
Expected: FAIL — `totals` is undefined.

- [ ] **Step 3: Add the field to state and serialization**

In `chat-types.ts`, import at the top:

```ts
import { emptyTotals, type SessionTotals } from './session-totals';
```

Add to `SessionChatState` (after `queuedMessages`):

```ts
  /** Session-so-far totals for the status bar and /usage (spec §2). Accumulated
   *  as events arrive rather than walked on demand — see session-totals.ts for
   *  why, and for exactly what is counted. */
  totals: SessionTotals;
```

Add to `createSessionChatState()`'s returned object: `totals: emptyTotals(),`

Add to `SerializedSessionChatState`:

```ts
  // Optional so a pre-field snapshot from an older host still deserializes —
  // it comes back as empty totals, which read as "nothing counted yet" rather
  // than as a crash or a wrong number.
  totals?: SessionTotals;
```

In `serializeChatState`, add `totals: s.totals,` to the pushed object. In
`deserializeChatState`, add `totals: ser.totals ?? emptyTotals(),`.

- [ ] **Step 4: Accumulate in the reducer**

In `chat-reducer.ts`, add to the imports:

```ts
import { addTurnUsage, addPatchLines } from './session-totals';
```

**(a) Turn usage.** In the `TRANSCRIPT_TURN_COMPLETE` case, where the completing turn is
written back into the session, add `totals` to the returned session object:

```ts
        // Session totals (spec §2). A SUBAGENT's turn-complete is skipped on
        // purpose: a specialist's spend arrives once, as a subagent-usage event
        // carrying the whole run (native-session-host.ts), and counting both
        // would double it. Everything else — including a Claude Code turn,
        // which carries no costUsd and so contributes tokens only — accumulates.
        totals: action.parentAgentToolUseId
          ? session.totals
          : addTurnUsage(session.totals, action.usage ?? {}),
```

**(b) Main-timeline edits.** In the tool-result case around line 1324 (where
`structuredPatch` is carried onto the tool state), the patch is applied to `updated`/the
tool map. Add alongside it, in the same returned session object:

```ts
        // Count edited lines ONCE. A tool-result can be delivered twice (a
        // renderer reload replays the transcript while the live stream is still
        // arriving — see seenUuids' comment), and Map.set absorbs the duplicate
        // silently, so the guard is "this call had no patch yet", not a uuid.
        totals: patch && !existingTool?.structuredPatch
          ? addPatchLines(session.totals, patch)
          : session.totals,
```

where `existingTool` is the pre-update `ToolCallState` already read in that branch (it is
the value `patch` is being merged onto — reuse it; do not re-read the map).

**(c) Specialist edits.** In `applySubagentEvent`'s `TRANSCRIPT_TOOL_RESULT` branch (around
line 437), the segment is replaced with one carrying `structuredPatch`. Thread the same
count into the session object that branch returns:

```ts
  // A specialist's edits are the parent session's edits (spec §7). They live in
  // subagentSegments, NOT session.toolCalls, so a count over toolCalls alone
  // would miss every edit made by delegation — i.e. undercount hardest on the
  // biggest sessions. Same once-only guard as the main path.
  const totals = action.type === 'TRANSCRIPT_TOOL_RESULT' && action.structuredPatch && !existing?.structuredPatch
    ? addPatchLines(session.totals, action.structuredPatch)
    : session.totals;
```

and include `totals` in the returned `{ ...session, toolCalls, ... }` object. `existing` is
the segment already destructured in that branch.

- [ ] **Step 5: Run the test**

Run: `cd <worktree>/desktop && npx vitest run tests/session-totals-reducer.test.ts`
Expected: PASS (6 tests). The subagent-edit test is the one that fails if step 4(c) was
skipped — do not weaken it.

- [ ] **Step 6: Verify the whole suite**

Run: `bash scripts/verify.sh <worktree>`
Expected: passes. `chat-serialization.test.ts` may need `totals` added to its fixture
object — add `totals: emptyTotals()` there, not `as any`.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/state/chat-types.ts src/renderer/state/chat-reducer.ts tests/session-totals-reducer.test.ts
git commit -m "feat(chat): accumulate session token and edited-line totals, specialists included"
```

---

### Task 6: Read totals from a component

**Files:**
- Create: `desktop/src/renderer/hooks/useNativeSessionTotals.ts`
- Test: `desktop/tests/use-native-session-totals.test.tsx` (create)

**Interfaces:**
- Consumes: `useChatStore` (`../state/chat-context`), `SessionTotals` (Task 4).
- Produces: `useNativeSessionTotals(sessionId: string | null): SessionTotals | null`.

- [ ] **Step 1: Write the failing test**

```tsx
// desktop/tests/use-native-session-totals.test.tsx
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNativeSessionTotals } from '../src/renderer/hooks/useNativeSessionTotals';

// Mirrors the harness the sibling useNativeSessionUsage test uses — see that
// file for the store/provider wrapper if this one drifts.
import { makeStoreWrapper, dispatchTo } from './helpers/chat-store-harness';

describe('useNativeSessionTotals', () => {
  it('returns null for a session that does not exist', () => {
    const { wrapper } = makeStoreWrapper();
    const { result } = renderHook(() => useNativeSessionTotals('nope'), { wrapper });
    expect(result.current).toBeNull();
  });

  it('returns the same object reference until a total actually changes', () => {
    const { wrapper, store } = makeStoreWrapper(['s1']);
    const { result } = renderHook(() => useNativeSessionTotals('s1'), { wrapper });
    const first = result.current;
    act(() => { dispatchTo(store, { type: 'TRANSCRIPT_THINKING_HEARTBEAT', sessionId: 's1' } as any); });
    expect(result.current).toBe(first);   // stable snapshot — React loops otherwise
  });

  it('updates when a turn completes', () => {
    const { wrapper, store } = makeStoreWrapper(['s1']);
    const { result } = renderHook(() => useNativeSessionTotals('s1'), { wrapper });
    act(() => {
      dispatchTo(store, {
        type: 'TRANSCRIPT_TURN_COMPLETE', sessionId: 's1', uuid: 'u1', timestamp: 1,
        stopReason: 'end_turn', model: 'm', anthropicRequestId: null,
        usage: { inputTokens: 42, outputTokens: 7, cacheReadTokens: 0, cacheCreationTokens: 0 },
      } as any);
    });
    expect(result.current?.inputTokens).toBe(42);
  });
});
```

If `tests/helpers/chat-store-harness.ts` does not exist, create it by extracting the
provider/store setup from `tests/statusbar-native-usage.test.ts` (or whichever existing test
mounts a chat store) — do not invent a second store shape.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd <worktree>/desktop && npx vitest run tests/use-native-session-totals.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the hook**

```ts
// desktop/src/renderer/hooks/useNativeSessionTotals.ts
//
// Session-so-far totals for the active session (spec §2). Sibling of
// useNativeSessionUsage, which returns the LAST TURN's usage and still feeds the
// context and speed chips — those two measure a moment, these measure a session.
// Keeping them separate is deliberate: merging them would force one of the two
// meanings onto chips that need the other.
//
// Snapshot stability: getSnapshot returns the totals object OWNED by the chat
// store, never one built here, so repeated calls return the same reference until
// the reducer replaces it — the requirement useSyncExternalStore imposes.
import { useCallback, useRef, useSyncExternalStore } from 'react';
import { useChatStore } from '../state/chat-context';
import type { SessionTotals } from '../state/session-totals';

export function useNativeSessionTotals(sessionId: string | null): SessionTotals | null {
  const store = useChatStore();
  // Render-phase mirror so getSnapshot sees the current sessionId on the very
  // render that switches sessions (R8 pattern — same as useNativeSessionUsage).
  const sidRef = useRef(sessionId);
  sidRef.current = sessionId;

  const getSnapshot = useCallback((): SessionTotals | null => {
    const sid = sidRef.current;
    if (!sid) return null;
    return store.getState().get(sid)?.totals ?? null;
  }, [store]);

  const subscribe = useCallback((cb: () => void) => store.subscribeAll(cb), [store]);
  return useSyncExternalStore(subscribe, getSnapshot);
}
```

- [ ] **Step 4: Run the test**

Run: `cd <worktree>/desktop && npx vitest run tests/use-native-session-totals.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/hooks/useNativeSessionTotals.ts tests/use-native-session-totals.test.tsx tests/helpers/chat-store-harness.ts
git commit -m "feat(chat): hook for reading a session's running totals"
```

---

### Task 7: Feed the chips from totals, and say what they count

The visible half of the change: In / Out / Cached / Reuse become session totals in native
sessions, Code Changes starts working, and every affected chip states its scope.

**Files:**
- Modify: `desktop/src/renderer/components/StatusBar.tsx` (Props; the token chips; the
  Code Changes chip ~1406-1421)
- Modify: `desktop/src/renderer/App.tsx:2936` (pass `nativeTotals`)
- Test: `desktop/tests/statusbar-session-relevance.test.tsx` (extend)

**Interfaces:**
- Consumes: `SessionTotals` (Task 4), `useNativeSessionTotals` (Task 6).
- Produces: `StatusBar` accepts `nativeTotals?: SessionTotals | null`.

- [ ] **Step 1: Write the failing tests (append to the Task 3 file)**

```tsx
// --- appended to desktop/tests/statusbar-session-relevance.test.tsx ---
import { emptyTotals } from '../src/renderer/state/session-totals';

const withWidgets = (ids: string[]) =>
  window.localStorage.setItem('youcoded-statusbar-widgets', JSON.stringify(ids));

describe('StatusBar session totals', () => {
  it('renders cumulative In/Out from totals in a native session', () => {
    withWidgets(['tokens-in', 'tokens-out']);
    const totals = { ...emptyTotals(), inputTokens: 12_345, outputTokens: 678 };
    render(<StatusBar statusData={statusData} provider="native" nativeTotals={totals} sessionId="s1" />);
    expect(screen.getByText('12,345')).toBeInTheDocument();
    expect(screen.getByText('678')).toBeInTheDocument();
  });

  it('renders a derived Code Changes count in a native session', () => {
    withWidgets(['code-changes']);
    const totals = { ...emptyTotals(), linesAdded: 40, linesRemoved: 9 };
    render(<StatusBar statusData={statusData} provider="native" nativeTotals={totals} sessionId="s1" />);
    expect(screen.getByText('+40')).toBeInTheDocument();
    expect(screen.getByText('-9')).toBeInTheDocument();
  });

  it('renders NOTHING for Code Changes when nothing has been edited — never "No changes"', () => {
    withWidgets(['code-changes']);
    render(<StatusBar statusData={statusData} provider="native" nativeTotals={emptyTotals()} sessionId="s1" />);
    expect(screen.queryByText(/no changes/i)).toBeNull();
    expect(screen.queryByText(/lines/i)).toBeNull();
  });

  it('says what the numbers include', () => {
    withWidgets(['tokens-in']);
    const totals = { ...emptyTotals(), inputTokens: 10, specialistRuns: 2 };
    render(<StatusBar statusData={statusData} provider="native" nativeTotals={totals} sessionId="s1" />);
    expect(screen.getByTitle(/including specialists/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd <worktree>/desktop && npx vitest run tests/statusbar-session-relevance.test.tsx`
Expected: FAIL — the first assertion finds no `12,345`.

- [ ] **Step 3: Add the prop and the derivations**

In `Props`, after `turnsWithUsage`:

```ts
  /** Native sessions only: session-so-far totals (spec §2) — tokens, cost and
   *  edited lines, specialists included. Absent for CC sessions, which take the
   *  same numbers from the statusline instead. */
  nativeTotals?: SessionTotals | null;
```

Add `nativeTotals,` to the destructured parameters and this import:

```ts
import type { SessionTotals } from '../state/session-totals';
```

Replace the `inTokens` / `outTokens` derivation (~line 1050) with:

```ts
  // In/Out come from the CC statusline for CC sessions and from SESSION TOTALS
  // for native ones. They used to come from the last completed turn, which made
  // one label mean two different measurements depending on the runtime — the
  // defect this change exists to remove (spec §6). Totals include specialists;
  // input is counted per request, because that is what a provider bills for.
  const inTokens = ss?.inputTokens ?? nativeTotals?.inputTokens ?? null;
  const outTokens = ss?.outputTokens ?? nativeTotals?.outputTokens ?? null;
```

Do the same for whatever feeds the Cached and Reuse chips: prefer `ss`, then
`nativeTotals.cacheReadTokens` / `nativeTotals.cacheCreationTokens`, then `null`. **Leave
`nativeChips` alone** — the context and speed chips must keep reading the last turn.

Add these tooltip constants near the top of the component file:

```ts
// One vocabulary for every session-scoped chip (spec §2). Repeated wording is
// the point: three chips and the /usage card must not each invent their own
// description of the same scope.
const SCOPE_NOTE = 'Counts this session so far, including specialists.';
const INPUT_NOTE = 'Input is counted per request — a long turn re-sends its history each step, and that is what you are billed for.';
```

Give the In chip `title={`${SCOPE_NOTE} ${INPUT_NOTE}`}` when the value came from
`nativeTotals`, and the Out / Cached / Reuse chips `title={SCOPE_NOTE}`. Leave the CC
tooltips as they are — they describe Claude Code's own accounting.

- [ ] **Step 4: Rewrite the Code Changes chip**

Replace the whole `show('code-changes')` block (~1406) with:

```tsx
      {/* Code changes — lines added/removed.
          CC sessions keep the statusline count: it is Claude Code's own number
          and covers edits made through ANY path, including shell commands.
          Native sessions use the derived count (structuredPatch hunks stored on
          tool calls AND on specialist segments). The two are not comparable
          across runtimes; each is the most complete number its runtime has.
          Nothing edited yet → the chip does not render. It used to say "No
          changes", which was FALSE in every native session (spec §1). */}
      {show('code-changes') && (() => {
        const added = ss?.linesAdded ?? nativeTotals?.linesAdded ?? null;
        const removed = ss?.linesRemoved ?? nativeTotals?.linesRemoved ?? null;
        if (!added && !removed) return null;
        const title = ss?.linesAdded != null
          ? `Lines added: ${added ?? 0} | Lines removed: ${removed ?? 0}`
          : `${SCOPE_NOTE} Counts edits made through the model's editing tools; edits made by shell commands are not counted.`;
        return (
          <span
            className="flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-panel border border-edge-dim"
            title={title}
          >
            <span className="text-[#4CAF50]">+{added ?? 0}</span>
            <span className="text-[#DD4444]">-{removed ?? 0}</span>
            <span className="text-fg-muted hidden sm:inline">lines</span>
          </span>
        );
      })()}
```

- [ ] **Step 5: Run the tests**

Run: `cd <worktree>/desktop && npx vitest run tests/statusbar-session-relevance.test.tsx`
Expected: PASS (10 tests — 3 runtime gate, 3 no-empty-chips, 4 totals).

- [ ] **Step 6: Wire it from App**

In `App.tsx`, next to the existing `nativeStatusUsage` (line ~2537):

```tsx
  // Session-so-far totals for the bar's token / cost / code-change chips.
  // Null for CC sessions, which take those numbers from the statusline.
  const nativeTotals = useNativeSessionTotals(isNativeSession ? sessionId : null);
```

with `import { useNativeSessionTotals } from './hooks/useNativeSessionTotals';` at the top,
and pass `nativeTotals={nativeTotals}` at the `<StatusBar` call site.

- [ ] **Step 7: Verify**

Run: `bash scripts/verify.sh <worktree>`
Expected: passes. If `statusbar-native-usage.test.ts` asserted last-turn In/Out for a native
session, **update it** — that behaviour is intentionally replaced. Add a comment in the test
pointing at spec §6 so the change reads as deliberate. The Task 3 no-empty-chips test must
still pass: the token chips are now fed by totals, but a session with no totals yet still
renders nothing.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/components/StatusBar.tsx src/renderer/App.tsx tests/statusbar-session-relevance.test.tsx tests/statusbar-native-usage.test.ts
git commit -m "feat(status-bar): cumulative token totals and a real code-change count for native sessions"
```

---

### Task 8: Explain the hidden rows in the Customize menu

**Files:**
- Modify: `desktop/src/renderer/components/StatusBar.tsx` (`WidgetConfigPopup` ~800-950,
  and its render site inside `StatusBar`)
- Test: `desktop/tests/statusbar-widget-menu.test.tsx` (create)

**Interfaces:**
- Consumes: `widgetUnavailableReason`, `RelevanceContext` (Task 2); `SessionTotals` (Task 4).
- Produces: `WidgetConfigPopup` accepts `relevance: RelevanceContext`.

- [ ] **Step 1: Write the failing test**

```tsx
// desktop/tests/statusbar-widget-menu.test.tsx
//
// The menu must never offer what the bar refuses to draw, and must never
// explain away a widget that is missing for a different reason (git-branch).
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatusBar from '../src/renderer/components/StatusBar';
import userEvent from '@testing-library/user-event';

const statusData = {
  usage: null, updateStatus: null, announcement: null, contextPercent: null,
  gitBranch: null, sessionStats: null, syncWarnings: [],
} as any;

async function openMenu(provider: 'claude' | 'native') {
  render(<StatusBar statusData={statusData} provider={provider} sessionId="s1" />);
  await userEvent.click(screen.getByRole('button', { name: /status bar widgets|customize/i }));
}

describe('Customize Status Bar menu', () => {
  it('explains the subscription rows in a native session', async () => {
    await openMenu('native');
    expect(screen.getAllByText('Claude Code sessions only — see /usage').length).toBe(2);
  });

  it('explains the unmeasured rows', async () => {
    await openMenu('native');
    expect(screen.getAllByText('Not measured in this kind of session yet').length).toBe(2);
  });

  it('leaves Git Branch unexplained — it is a missing feed, not a relevance rule', async () => {
    await openMenu('native');
    const row = screen.getByText('Git Branch').closest('div')!;
    expect(row.textContent).not.toMatch(/only|not measured|no published/i);
  });

  it('explains nothing in a Claude Code session', async () => {
    await openMenu('claude');
    expect(screen.queryByText(/Claude Code sessions only/)).toBeNull();
    expect(screen.queryByText(/Not measured in this kind/)).toBeNull();
  });

  it('dims the row without touching the saved choice', async () => {
    window.localStorage.setItem('youcoded-statusbar-widgets', JSON.stringify(['usage-5h']));
    await openMenu('native');
    expect(JSON.parse(window.localStorage.getItem('youcoded-statusbar-widgets')!)).toContain('usage-5h');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd <worktree>/desktop && npx vitest run tests/statusbar-widget-menu.test.tsx`
Expected: FAIL — no reason lines rendered.

- [ ] **Step 3: Thread the context in**

Add to `WidgetConfigPopup`'s props interface:

```ts
  /** What this session can actually show — the SAME values the bar itself
   *  gates on, so the menu can never offer a chip the bar refuses to draw. */
  relevance: RelevanceContext;
```

At its render site inside `StatusBar`, pass:

```tsx
          relevance={{ runtime, hasPricedWork: nativeTotals?.anyPriced ?? true }}
```

(`hasPricedWork` defaults to `true` so a session with no totals yet doesn't accuse a model
of having no price.)

- [ ] **Step 4: Render the reason line**

Inside the widget `map` (~line 880), before the returned row:

```tsx
                    const reason = widgetUnavailableReason(w.id, relevance);
```

and replace the checkbox `<button>` with a conditional — when `reason` is non-null, render
the label dimmed with the reason where the checkbox would be, and nothing focusable:

```tsx
                        {reason ? (
                          // Not a control: this row cannot be toggled in this
                          // session, so it must not look like it can. The saved
                          // on/off choice is untouched and returns when the user
                          // switches to a session where the widget applies.
                          <div className="flex items-center gap-2 flex-1 text-left opacity-50">
                            <span className="w-3.5 h-3.5 flex-shrink-0" />
                            <span className="flex-1">{w.label}</span>
                            <span className="text-3xs text-fg-muted italic">{reason}</span>
                          </div>
                        ) : (
                          <button
                            onClick={() => { if (!w.locked) toggle(w.id); }}
                            /* …existing button body, unchanged… */
                          />
                        )}
```

- [ ] **Step 5: Run the test**

Run: `cd <worktree>/desktop && npx vitest run tests/statusbar-widget-menu.test.tsx`
Expected: PASS (5 tests). If the menu's open button has a different accessible name, fix the
query — not the assertions.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/StatusBar.tsx tests/statusbar-widget-menu.test.tsx
git commit -m "feat(status-bar): explain unavailable widgets in the Customize menu instead of hiding them"
```

---

### Task 9: CHECKPOINT — workbench states and Destin's sign-off

**Stop here. Do not start Task 10 until Destin has approved the sheets.** This is the
design gate in spec §12; everything after it is main-process work that is expensive to
redo.

**Files:**
- Modify: `desktop/src/renderer/dev/workbench/` — the scenario definitions and the mock
  `window.claude` shim (see `.claude/rules/react-renderer.md` for where scenarios live)

**Interfaces:**
- Consumes: everything from Tasks 3–8.
- Produces: workbench scenarios named `statusbar-cc`, `statusbar-local`,
  `statusbar-metered`, `statusbar-unpriced`, `statusbar-delegated`.

- [ ] **Step 1: Add the five bar scenarios**

Each seeds one session into the mock chat store with the totals below and the matching
`provider`. Costs are mocked at this stage — Task 12 makes them real.

| Scenario | provider | totals |
|---|---|---|
| `statusbar-cc` | `claude` | n/a (statusline fixture: `linesAdded: 120`, `linesRemoved: 34`, `costUsd: 0.42`) |
| `statusbar-local` | `native` | `{ inputTokens: 84_000, outputTokens: 3_200, cacheReadTokens: 61_000, cacheCreationTokens: 900, costUsd: 0, anyPriced: false, anyUnpriced: true, linesAdded: 210, linesRemoved: 45, specialistRuns: 0 }` |
| `statusbar-metered` | `native` | same tokens, `costUsd: 1.37, anyPriced: true, anyUnpriced: false` |
| `statusbar-unpriced` | `native` | same tokens, `costUsd: 0, anyPriced: false, anyUnpriced: true` |
| `statusbar-delegated` | `native` | `{ …, costUsd: 0.61, anyPriced: true, anyUnpriced: true, specialistRuns: 3, linesAdded: 480, linesRemoved: 96 }` |

- [ ] **Step 2: Run the boot check**

Run: `cd <worktree>/desktop && node scripts/workbench-boot-check.mjs`
Expected: every registered route loads with no console error. **This is not optional** —
the unit suite passed while the app crashed at boot three times running
(`CLAUDE.md` → UI Workbench).

- [ ] **Step 3: Capture the sheets**

Run: `bash scripts/ui-review/run-review.sh <worktree>` from the workspace root, scoped to
the status-bar plan.

Then **read `coverage.md` before writing a single word about the result.** A surface that is
not marked `covered` is *unreviewed*, never *fine*.

- [ ] **Step 4: Assemble the review page for Destin**

One page, per `docs/active/design/2026-08-25-ui-design-guide.md` and the workspace's review
format: 1:1 crops, the Claude Code / local pair side by side (this is the shot that shows
the bar shortening), the Customize menu with its three reason lines, the `/usage` card, and
every tooltip's exact text. Separate measured facts from taste arguments, and give each item
its own decision control.

- [ ] **Step 5: Ask, then wait**

Present it and stop. Do not proceed on silence, and do not start Task 10 "while waiting".

- [ ] **Step 6: Commit the scenarios**

```bash
git add src/renderer/dev/workbench
git commit -m "chore(workbench): status-bar relevance scenarios for the design review"
```

---

### Task 10: Carry cache rates through the model catalog

**Files:**
- Modify: `desktop/src/shared/provider-types.ts:38`
- Modify: `desktop/src/main/providers/model-catalog.ts` (OpenRouter mapper ~170-184;
  models.dev mapper ~206-209)
- Test: `desktop/tests/model-catalog-pricing.test.ts` (create, or extend the existing
  catalog suite if one covers `pricing`)

**Interfaces:**
- Produces: `CatalogModel.pricing?: { in: number; out: number; cacheRead?: number; cacheWrite?: number }`
  — all four in **USD per 1M tokens**.

- [ ] **Step 1: Write the failing test**

```ts
// desktop/tests/model-catalog-pricing.test.ts
//
// The app's copy of the price list used to drop the cache rates, which forced
// the session-cost chip to over-report and apologise for it in a tooltip. The
// rates are in the payload; carry them (spec §5).
import { describe, it, expect } from 'vitest';
import { ModelCatalog } from '../src/main/providers/model-catalog';

describe('catalog pricing', () => {
  it('maps OpenRouter per-token strings to per-1M, cache rates included', () => {
    const rows = (ModelCatalog as any).prototype.openrouterModels.call({}, {
      data: [{
        id: 'vendor/model',
        pricing: {
          prompt: '0.000003', completion: '0.000015',
          input_cache_read: '0.0000003', input_cache_write: '0.00000375',
        },
      }],
    }, 'openrouter');
    expect(rows[0].pricing).toEqual({ in: 3, out: 15, cacheRead: 0.3, cacheWrite: 3.75 });
  });

  it('omits cache rates that are absent or malformed rather than guessing zero', () => {
    const rows = (ModelCatalog as any).prototype.openrouterModels.call({}, {
      data: [{ id: 'vendor/model', pricing: { prompt: '0.000003', completion: '0.000015', input_cache_read: '' } }],
    }, 'openrouter');
    expect(rows[0].pricing).toEqual({ in: 3, out: 15 });
  });

  it('maps models.dev cost fields, which are already per-1M', () => {
    const rows = (ModelCatalog as any).prototype.modelsdevModels.call({}, {
      anthropic: { models: { 'x': { id: 'x', cost: { input: 3, output: 15, cache_read: 0.3, cache_write: 3.75 } } } },
    }, 'anthropic', 'anthropic');
    expect(rows[0].pricing).toEqual({ in: 3, out: 15, cacheRead: 0.3, cacheWrite: 3.75 });
  });
});
```

If those mappers are private and not callable this way, export a small pure helper from
`model-catalog.ts` (e.g. `export function pricingFromOpenRouterRow(row: unknown)`) and test
that instead — do not loosen the assertions.

- [ ] **Step 2: Run to verify it fails**

Run: `cd <worktree>/desktop && npx vitest run tests/model-catalog-pricing.test.ts`
Expected: FAIL — `cacheRead` missing.

- [ ] **Step 3: Widen the type**

```ts
// src/shared/provider-types.ts — replace the pricing field
  /** USD per 1,000,000 tokens. `cacheRead`/`cacheWrite` are optional because
   *  not every provider publishes them; absent means "not published", never
   *  "free" (see the catalog's never-guess rule). Modelling them is what keeps
   *  the session-cost chip from over-reporting a cached session (spec §5). */
  pricing?: { in: number; out: number; cacheRead?: number; cacheWrite?: number };
```

- [ ] **Step 4: Map them, in both mappers**

OpenRouter (same non-empty-string guard the existing fields use — `Number('')` is `0`,
which would map "not published" to "free"):

```ts
        if (Number.isFinite(prompt) && Number.isFinite(completion)) {
          m.pricing = { in: prompt * 1e6, out: completion * 1e6 };
          // Cache rates ride the same payload and the same never-guess rule.
          const cr = typeof pricing.input_cache_read === 'string' && pricing.input_cache_read !== ''
            ? Number(pricing.input_cache_read) : NaN;
          const cw = typeof pricing.input_cache_write === 'string' && pricing.input_cache_write !== ''
            ? Number(pricing.input_cache_write) : NaN;
          if (Number.isFinite(cr)) m.pricing.cacheRead = cr * 1e6;
          if (Number.isFinite(cw)) m.pricing.cacheWrite = cw * 1e6;
        }
```

models.dev (already per-1M):

```ts
      if (isObj(row.cost) && typeof row.cost.input === 'number' && typeof row.cost.output === 'number') {
        m.pricing = { in: row.cost.input, out: row.cost.output };
        if (typeof row.cost.cache_read === 'number') m.pricing.cacheRead = row.cost.cache_read;
        if (typeof row.cost.cache_write === 'number') m.pricing.cacheWrite = row.cost.cache_write;
      }
```

- [ ] **Step 5: Run the test**

Run: `cd <worktree>/desktop && npx vitest run tests/model-catalog-pricing.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/shared/provider-types.ts src/main/providers/model-catalog.ts tests/model-catalog-pricing.test.ts
git commit -m "feat(catalog): carry prompt-cache rates through the model price list"
```

---

### Task 11: Price a turn in main

**Files:**
- Create: `desktop/src/main/harness/pricing.ts`
- Modify: `desktop/src/shared/types.ts` (add `costUsd` to the turn-complete usage payload)
- Modify: `desktop/src/main/harness/harness-session.ts` (`HarnessSessionOpts.pricing`;
  `setBinding`; the `turn-complete` emit ~1918)
- Modify: `desktop/src/main/harness/native-session-host.ts` (`pricingFor` constructor
  param; `resolveContextAndProfile` returns pricing; pass it at create/resume/child/setBinding)
- Modify: `desktop/src/main/ipc-handlers.ts` (wire `pricingFor`)
- Test: `desktop/tests/harness-pricing.test.ts` (create)

**Interfaces:**
- Produces:
  - `costForUsage(usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number }, pricing: ModelPricing | null | undefined): number | null`
  - `type ModelPricing = { in: number; out: number; cacheRead?: number; cacheWrite?: number }`
  - `turn-complete` usage payload gains `costUsd?: number | null`
    (**number** = priced, **null** = native work with no published price, **absent** = a
    Claude Code turn).

- [ ] **Step 1: Write the failing test**

```ts
// desktop/tests/harness-pricing.test.ts
import { describe, it, expect } from 'vitest';
import { costForUsage } from '../src/main/harness/pricing';

const usage = { inputTokens: 1_000_000, outputTokens: 100_000, cacheReadTokens: 0, cacheCreationTokens: 0 };

describe('costForUsage', () => {
  it('prices plain input and output per 1M tokens', () => {
    expect(costForUsage(usage, { in: 3, out: 15 })).toBeCloseTo(3 + 1.5, 10);
  });

  it('charges cached reads at the cache rate, not the full input rate', () => {
    const u = { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 900_000, cacheCreationTokens: 0 };
    // 100k uncached at $3/M + 900k cached at $0.30/M
    expect(costForUsage(u, { in: 3, out: 15, cacheRead: 0.3 })).toBeCloseTo(0.3 + 0.27, 10);
  });

  it('charges cache writes at the write rate on top of the prompt', () => {
    const u = { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 500_000 };
    expect(costForUsage(u, { in: 3, out: 15, cacheWrite: 3.75 })).toBeCloseTo(3 + 1.875, 10);
  });

  it('falls back to the full input rate when no cache rate is published', () => {
    const u = { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 900_000, cacheCreationTokens: 0 };
    expect(costForUsage(u, { in: 3, out: 15 })).toBeCloseTo(3, 10);
  });

  it('returns null — never 0 — when there is no price at all', () => {
    expect(costForUsage(usage, null)).toBeNull();
    expect(costForUsage(usage, undefined)).toBeNull();
  });

  it('never returns a negative number if a provider reports more cached than prompt tokens', () => {
    const u = { inputTokens: 100, outputTokens: 0, cacheReadTokens: 5_000, cacheCreationTokens: 0 };
    expect(costForUsage(u, { in: 3, out: 15, cacheRead: 0.3 })).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd <worktree>/desktop && npx vitest run tests/harness-pricing.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the pricing module**

```ts
// desktop/src/main/harness/pricing.ts
//
// The ONE place tokens become dollars (spec §5). Lives in main because main is
// where the binding — and therefore the price — is known; the renderer only
// ever adds up figures it was handed.
//
// Rates are USD per 1,000,000 tokens (CatalogModel.pricing), hence every /1e6.

export type ModelPricing = { in: number; out: number; cacheRead?: number; cacheWrite?: number };

export interface PricedUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

/** USD for one turn, or null when the model has no published price.
 *
 *  null, never 0: a zero would render as "$0.00", which claims the turn was
 *  free. An absent chip is the honest output (docs/error-message-standards.md).
 *
 *  WHY cached reads are subtracted from the prompt: providers report
 *  inputTokens as the WHOLE prompt and cacheReadTokens as the part served from
 *  cache. Charging both at the full input rate is exactly the over-reporting
 *  this modelling removes. When no cache rate is published, the cached portion
 *  stays at the full input rate — the honest fallback, since we don't know the
 *  discount. */
export function costForUsage(usage: PricedUsage, pricing: ModelPricing | null | undefined): number | null {
  if (!pricing) return null;
  const cachedRead = pricing.cacheRead != null ? Math.min(usage.cacheReadTokens, usage.inputTokens) : 0;
  const uncachedIn = Math.max(0, usage.inputTokens - cachedRead);
  const cost =
    (uncachedIn / 1e6) * pricing.in
    + (cachedRead / 1e6) * (pricing.cacheRead ?? pricing.in)
    + (usage.outputTokens / 1e6) * pricing.out
    + (pricing.cacheWrite != null ? (usage.cacheCreationTokens / 1e6) * pricing.cacheWrite : 0);
  return Math.max(0, cost);
}
```

- [ ] **Step 4: Run the test**

Run: `cd <worktree>/desktop && npx vitest run tests/harness-pricing.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Stamp the cost on `turn-complete`**

In `src/shared/types.ts`, inside the `usage` object on `TranscriptEvent['data']`:

```ts
      /** Native runtime only: USD for THIS turn, priced at the model that ran
       *  it. `null` means the model has no published price — distinct from
       *  absent, which means no pricing information at all (a Claude Code turn).
       *  The renderer sums these; it never multiplies tokens by a rate itself. */
      costUsd?: number | null;
```

In `harness-session.ts`, add to `HarnessSessionOpts` beside `contextLength`:

```ts
  /** Resolved price for the bound model, or null when none is published.
   *  Re-resolved on setBinding, so a mid-session model swap prices only the
   *  turns that run AFTER it — a turn is never repriced retroactively. */
  pricing?: ModelPricing | null;
```

In `setBinding` (line ~721), mirroring how `contextLength` is handled:

```ts
    if (pricing !== undefined) this.opts.pricing = pricing;
```

widening the signature to
`setBinding(binding: ModelBinding, contextLength?: number | null, profile?: CapabilityProfile, pricing?: ModelPricing | null)`.

At the `turn-complete` emit (line ~1918), inside the `usage` object:

```ts
          // Priced HERE, where the model that ran this turn is known. A
          // mid-session swap re-resolves opts.pricing, so already-counted turns
          // keep the price they actually ran at (spec §5).
          costUsd: costForUsage(turnUsage, this.opts.pricing),
```

- [ ] **Step 6: Resolve the price alongside the other per-binding facts**

In `native-session-host.ts`, add a fourth constructor resolver after `visionSupportFor`:

```ts
    // Fourth per-binding catalog fact, resolved at the same three moments as
    // its siblings (create / resume / swap). Returns null when the catalog has
    // no published price for this model — never a zero (spec §5).
    private pricingFor: (binding: ModelBinding) => Promise<ModelPricing | null>,
```

Have `resolveContextAndProfile` also return `pricing` (one more `await this.pricingFor(binding)`),
and thread it into every `HarnessSessionOpts` construction that already receives
`contextLength` — the create path (~2385), the resume path (~2808), the child path (~2517)
and `setBinding` (~3448).

In `ipc-handlers.ts`, wire it beside the three existing resolvers:

```ts
      // Reads the SAME catalog the model picker shows, so a price the user can
      // see in the picker is the price the chip charges.
      async (binding) => (await modelCatalog.find(binding.modelId))?.pricing ?? null,
```

Match the surrounding call's exact shape — if the neighbouring resolvers take
`(binding: ModelBinding)` and use a different catalog accessor, copy that.

- [ ] **Step 7: Verify**

Run: `bash scripts/verify.sh <worktree>`
Expected: passes. `native-session-host.test.ts` constructs the host directly — add the new
resolver (`async () => null`) to those constructions.

- [ ] **Step 8: Commit**

```bash
git add src/main/harness/pricing.ts src/main/harness/harness-session.ts src/main/harness/native-session-host.ts src/main/ipc-handlers.ts src/shared/types.ts tests/harness-pricing.test.ts tests/native-session-host.test.ts
git commit -m "feat(harness): price each native turn at the model that ran it"
```

---

### Task 12: Report a specialist's spend to its parent

**Files:**
- Modify: `desktop/src/shared/types.ts` (`'subagent-usage'` event type)
- Modify: `desktop/src/main/harness/harness-session.ts` (`emitSubagentUsage`)
- Modify: `desktop/src/main/harness/native-session-host.ts` (`runDelegation`, after
  `runSpecialist` returns ~912)
- Modify: `desktop/src/renderer/App.tsx` (dispatch the event ~1195 area)
- Modify: `desktop/src/renderer/state/chat-types.ts` (`TRANSCRIPT_SUBAGENT_USAGE` action)
- Modify: `desktop/src/renderer/state/chat-reducer.ts` (handle it)
- Test: `desktop/tests/subagent-usage-event.test.ts` (create)

**Interfaces:**
- Consumes: `costForUsage` (Task 11), `addSubagentUsage` (Task 4).
- Produces: `TranscriptEvent` type `'subagent-usage'` with
  `data: { usage: {inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens, costUsd: number|null}, model: string, parentAgentToolUseId: string, agentId: string }`;
  reducer action `{ type: 'TRANSCRIPT_SUBAGENT_USAGE'; sessionId; uuid; timestamp; usage; parentAgentToolUseId; agentId }`.

- [ ] **Step 1: Write the failing test**

```ts
// desktop/tests/subagent-usage-event.test.ts
//
// A specialist's spend belongs to the session that delegated it (spec §2). It
// cannot ride the child's own turn-complete: SUBAGENT_DISPLAY_TYPES excludes
// that deliberately, because a stamped copy would end the PARENT's turn in the
// reducer and attribute the child's model to the parent.
import { describe, it, expect } from 'vitest';
import { SUBAGENT_DISPLAY_TYPES } from '../src/main/harness/native-session-host';
import { chatReducer } from '../src/renderer/state/chat-reducer';

describe('subagent-usage', () => {
  it('is not smuggled in as a forwarded child turn-complete', () => {
    expect(SUBAGENT_DISPLAY_TYPES.has('turn-complete')).toBe(false);
  });

  it('folds a finished specialist into the parent session totals', () => {
    let s = chatReducer(new Map(), { type: 'SESSION_INIT', sessionId: 'p1' });
    s = chatReducer(s, {
      type: 'TRANSCRIPT_SUBAGENT_USAGE', sessionId: 'p1', uuid: 'su1', timestamp: 1,
      parentAgentToolUseId: 'task-1', agentId: 'child-1',
      usage: { inputTokens: 5000, outputTokens: 400, cacheReadTokens: 100, cacheCreationTokens: 0, costUsd: 0.05 },
    } as any);
    const t = s.get('p1')!.totals;
    expect(t.inputTokens).toBe(5000);
    expect(t.costUsd).toBeCloseTo(0.05, 10);
    expect(t.specialistRuns).toBe(1);
    expect(t.anyPriced).toBe(true);
  });

  it('marks the session unpriced when the specialist model has no published price', () => {
    let s = chatReducer(new Map(), { type: 'SESSION_INIT', sessionId: 'p1' });
    s = chatReducer(s, {
      type: 'TRANSCRIPT_SUBAGENT_USAGE', sessionId: 'p1', uuid: 'su2', timestamp: 1,
      parentAgentToolUseId: 'task-1', agentId: 'child-1',
      usage: { inputTokens: 10, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: null },
    } as any);
    expect(s.get('p1')!.totals.anyUnpriced).toBe(true);
    expect(s.get('p1')!.totals.costUsd).toBe(0);
  });

  it('is ignored by model-history rebuild — it is bookkeeping, not conversation', async () => {
    const { rebuildHistory } = await import('../src/main/harness/history-rebuild');
    const before = rebuildHistory([]);
    const after = rebuildHistory([{
      type: 'subagent-usage', sessionId: 'p1', uuid: 'x', timestamp: 1,
      data: { usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0 } },
    } as any]);
    expect(after).toEqual(before);
  });
});
```

Adjust `rebuildHistory`'s import/signature to match the real export — the assertion (an
unknown bookkeeping event changes nothing) must stay.

- [ ] **Step 2: Run to verify it fails**

Run: `cd <worktree>/desktop && npx vitest run tests/subagent-usage-event.test.ts`
Expected: FAIL — the reducer ignores the action.

- [ ] **Step 3: Add the event type**

In `src/shared/types.ts`, add to `TranscriptEventType`:

```ts
  // Native-runtime only: one finished specialist's TOTAL spend, reported to the
  // PARENT session so the parent's status bar can count work it delegated
  // (spec §2/§8). Persisted on the parent, so replay restores it exactly like a
  // tool card. NOT a forwarded child turn-complete — see SUBAGENT_DISPLAY_TYPES
  // for why that copy is deliberately withheld.
  | 'subagent-usage'
```

- [ ] **Step 4: Emit it from the parent session**

In `harness-session.ts`, beside the other public emitters:

```ts
  /** Report a finished specialist's total spend on THIS (parent) session's
   *  stream. Goes through emitEvent so wire()'s existing listener persists it to
   *  the parent's record and forwards it to the renderer — no second
   *  persistence path, no new IPC channel. */
  emitSubagentUsage(data: {
    usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number; costUsd: number | null };
    model: string;
    parentAgentToolUseId: string;
    agentId: string;
  }): void {
    this.emitEvent('subagent-usage', data);
  }
```

In `native-session-host.ts`'s `runDelegation`, immediately after `const run = await this.runSpecialist(...)`:

```ts
      // The child's spend is the parent's spend (spec §2). runSpecialist has
      // summed `usage` across the child's turns since plan 1b — until now it was
      // returned and discarded. Priced with the CHILD's binding, which can be a
      // different model from the parent's (specialists/delegated-models.ts): a
      // free local parent that delegates to a metered specialist really is
      // spending money, and must say so.
      const parentSession = parentId ? this.live.get(parentId)?.session : undefined;
      if (parentSession) {
        const childBinding = this.live.get(childId)?.session.binding;
        const childPricing = childBinding ? await this.pricingFor(childBinding) : null;
        parentSession.emitSubagentUsage({
          usage: { ...run.usage, costUsd: costForUsage(run.usage, childPricing) },
          model: childBinding?.modelId ?? 'unknown',
          parentAgentToolUseId: opts.parentToolCallId,
          agentId: childId,
        });
      }
```

Place it **before** the ledger write and before teardown — the child must still be in
`this.live` for its binding to be readable. Wrap in the same log-only try/catch the
neighbouring bookkeeping uses: a failed usage report must never discard the report itself.

- [ ] **Step 5: Dispatch it in the renderer**

In `App.tsx`'s transcript-event switch, next to `case 'turn-complete':`:

```tsx
        case 'subagent-usage':
          // Bookkeeping only — never touches the timeline, the turn state, or
          // the subagent card's segments. It exists so the parent's totals can
          // include work it delegated (spec §2).
          batchTranscriptDispatch({
            type: 'TRANSCRIPT_SUBAGENT_USAGE',
            sessionId: event.sessionId,
            uuid: event.uuid,
            timestamp: event.timestamp,
            usage: event.data.usage ?? null,
            parentAgentToolUseId: event.data.parentAgentToolUseId,
            agentId: event.data.agentId,
          });
          break;
```

Add the action to `ChatAction` in `chat-types.ts`:

```ts
  | {
      // One finished specialist's total spend, folded into the parent session's
      // totals. Deliberately NOT a turn event: it must not end a turn, create a
      // timeline entry, or touch the subagent card.
      type: 'TRANSCRIPT_SUBAGENT_USAGE';
      sessionId: string;
      uuid: string;
      timestamp: number;
      usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number; costUsd: number | null } | null;
      parentAgentToolUseId?: string;
      agentId?: string;
    }
```

And handle it in `chat-reducer.ts`, near the other transcript cases:

```ts
    case 'TRANSCRIPT_SUBAGENT_USAGE': {
      const session = state.get(action.sessionId);
      if (!session || !action.usage) return state;
      // Dedup on uuid: a renderer reload replays the parent's record while the
      // live stream is still delivering, and double-counting a specialist would
      // double the session's cost.
      if (session.seenUuids.has(action.uuid)) return state;
      const next = new Map(state);
      next.set(action.sessionId, {
        ...session,
        totals: addSubagentUsage(session.totals, action.usage),
        seenUuids: new Set([...session.seenUuids, action.uuid]),
      });
      return next;
    }
```

with `addSubagentUsage` added to the `session-totals` import.

- [ ] **Step 6: Run the test**

Run: `cd <worktree>/desktop && npx vitest run tests/subagent-usage-event.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Verify**

Run: `bash scripts/verify.sh <worktree>`
Expected: passes. If `history-rebuild.ts`'s switch has no `default`, add one that ignores
unknown types — a bookkeeping event must never reach the model's history.

- [ ] **Step 8: Commit**

```bash
git add src/shared/types.ts src/main/harness/harness-session.ts src/main/harness/native-session-host.ts src/renderer/App.tsx src/renderer/state/chat-types.ts src/renderer/state/chat-reducer.ts tests/subagent-usage-event.test.ts
git commit -m "feat(harness): report a finished specialist's tokens and cost to its parent session"
```

---

### Task 13: The Session Cost chip

**Files:**
- Modify: `desktop/src/renderer/components/StatusBar.tsx` (the `session-cost` chip)
- Test: `desktop/tests/statusbar-session-relevance.test.tsx` (extend)

**Interfaces:**
- Consumes: `SessionTotals.costUsd / anyPriced / anyUnpriced` (Tasks 4, 11, 12).

- [ ] **Step 1: Write the failing tests**

```tsx
// --- appended to desktop/tests/statusbar-session-relevance.test.tsx ---
describe('Session Cost chip', () => {
  const costTotals = (over: Partial<ReturnType<typeof emptyTotals>>) => ({ ...emptyTotals(), ...over });

  it('shows a cost when priced work happened', () => {
    withWidgets(['session-cost']);
    render(<StatusBar statusData={statusData} provider="native" sessionId="s1"
      nativeTotals={costTotals({ costUsd: 1.3749, anyPriced: true })} />);
    expect(screen.getByText('$1.37')).toBeInTheDocument();
  });

  it('renders NOTHING — never $0.00 — when nothing was priced', () => {
    withWidgets(['session-cost']);
    render(<StatusBar statusData={statusData} provider="native" sessionId="s1"
      nativeTotals={costTotals({ costUsd: 0, anyUnpriced: true })} />);
    expect(screen.queryByText(/\$/)).toBeNull();
  });

  it('shows the cost of a metered SPECIALIST under a free local parent', () => {
    withWidgets(['session-cost']);
    render(<StatusBar statusData={statusData} provider="native" sessionId="s1"
      nativeTotals={costTotals({ costUsd: 0.42, anyPriced: true, anyUnpriced: true, specialistRuns: 1 })} />);
    expect(screen.getByText('$0.42')).toBeInTheDocument();
  });

  it('says the figure is partial when some work had no price', () => {
    withWidgets(['session-cost']);
    render(<StatusBar statusData={statusData} provider="native" sessionId="s1"
      nativeTotals={costTotals({ costUsd: 0.42, anyPriced: true, anyUnpriced: true })} />);
    expect(screen.getByTitle(/no published price are not included/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd <worktree>/desktop && npx vitest run tests/statusbar-session-relevance.test.tsx`
Expected: FAIL — the chip still reads `ss?.costUsd` only.

- [ ] **Step 3: Rewrite the chip**

```tsx
      {/* Session cost.
          CC sessions show Claude Code's own figure. Native sessions show the
          sum of per-turn costs priced in main, specialists included.
          The chip renders only when SOME counted work had a published price —
          not when "the session's model is metered": a free local session that
          delegated to an OpenRouter specialist really is spending money
          (spec §5). Nothing priced → no chip, never "$0.00". */}
      {show('session-cost') && (() => {
        const ccCost = ss?.costUsd ?? null;
        const nativeCost = nativeTotals?.anyPriced ? nativeTotals.costUsd : null;
        const cost = ccCost ?? nativeCost;
        if (cost == null) return null;
        const partial = ccCost == null && nativeTotals?.anyUnpriced;
        const title = ccCost != null
          ? 'Estimated cost of this session, as counted by Claude Code.'
          : `${SCOPE_NOTE} Priced from published rates, prompt-cache discounts included.`
            + (partial ? ' Models with no published price are not included in this total.' : '')
            + ' Not exact — a few models charge more above very large prompts.';
        return (
          <span
            className="flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-panel border border-edge-dim"
            title={title}
          >
            <span className="text-fg-muted">Cost:</span>
            <span className="text-fg-2">${cost.toFixed(2)}</span>
          </span>
        );
      })()}
```

- [ ] **Step 4: Run the tests**

Run: `cd <worktree>/desktop && npx vitest run tests/statusbar-session-relevance.test.tsx`
Expected: PASS (14 tests total in the file).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/StatusBar.tsx tests/statusbar-session-relevance.test.tsx
git commit -m "feat(status-bar): a real session cost for native sessions, specialists included"
```

---

### Task 14: The `/usage` card

**Files:**
- Modify: `desktop/src/renderer/App.tsx:2071-2098` (`getUsageSnapshot`)
- Modify: `desktop/src/renderer/components/UsageCard.tsx`
- Test: `desktop/tests/usage-card-native.test.tsx` (create)

**Interfaces:**
- Consumes: `SessionTotals`.
- Produces: `UsageSnapshot` gains `specialistRuns?: number` and `costIsPartial?: boolean`;
  every existing field keeps its meaning.

- [ ] **Step 1: Write the failing test**

```tsx
// desktop/tests/usage-card-native.test.tsx
//
// /usage is the escape hatch for the subscription numbers the bar now hides in
// native sessions (spec §10). If this card is empty there, hiding those chips
// is indefensible — the two ship together.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UsageCard } from '../src/renderer/components/UsageCard';

const base = {
  entryId: 'u1', timestamp: 1,
  costUsd: 1.5, inputTokens: 1000, outputTokens: 200,
  cacheReadTokens: 50, cacheCreationTokens: 10, contextTokens: null, contextPercent: 40,
  duration: null, apiDuration: null, linesAdded: 12, linesRemoved: 3,
  fiveHourUtilization: 0.42, fiveHourResetsAt: new Date(Date.now() + 3.6e6).toISOString(),
  sevenDayUtilization: 0.17, sevenDayResetsAt: new Date(Date.now() + 8.6e7).toISOString(),
} as any;

describe('UsageCard in a native session', () => {
  it('still shows the Claude subscription bars', () => {
    render(<UsageCard snapshot={base} />);
    expect(screen.getByText('42%')).toBeInTheDocument();
    expect(screen.getByText('17%')).toBeInTheDocument();
  });

  it('labels those bars as account-wide, not session-scoped', () => {
    render(<UsageCard snapshot={base} />);
    expect(screen.getByText(/across your whole Claude account/i)).toBeInTheDocument();
  });

  it('shows the session numbers it has', () => {
    render(<UsageCard snapshot={base} />);
    expect(screen.getByText('1,000')).toBeInTheDocument();
    expect(screen.getByText('+12')).toBeInTheDocument();
  });

  it('omits a row it cannot fill rather than rendering it empty', () => {
    render(<UsageCard snapshot={{ ...base, duration: null, apiDuration: null }} />);
    expect(screen.queryByText(/session duration/i)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd <worktree>/desktop && npx vitest run tests/usage-card-native.test.tsx`
Expected: FAIL — no account-wide label; empty rows still render.

- [ ] **Step 3: Give `getUsageSnapshot` native sources**

In `App.tsx`, replace the body of `getUsageSnapshot` so each session field falls back to the
totals, mirroring the bar exactly:

```ts
  const getUsageSnapshot = useCallback(
    (sid: string) => {
      const stats = statusData.sessionStatsMap[sid];
      const ctx = statusData.contextMap[sid] ?? null;
      const usage = statusData.usage as { five_hour?: { utilization: number; resets_at: string }; seven_day?: { utilization: number; resets_at: string } } | null;
      // Native fallback (spec §10): without this the card is a page of "--" in
      // exactly the sessions the status bar just sent people here for. Same
      // precedence as the bar — statusline first for CC, totals for native — so
      // the two surfaces cannot disagree.
      const totals = chatStateMapRef.current.get(sid)?.totals ?? null;
      if (!stats && ctx == null && !usage && !totals) return null;
      return {
        entryId: `usage-${sid}-${Date.now()}`,
        timestamp: Date.now(),
        costUsd: stats?.costUsd ?? (totals?.anyPriced ? totals.costUsd : null),
        costIsPartial: stats?.costUsd == null && !!totals?.anyUnpriced,
        inputTokens: stats?.inputTokens ?? totals?.inputTokens ?? null,
        outputTokens: stats?.outputTokens ?? totals?.outputTokens ?? null,
        cacheReadTokens: stats?.cacheReadTokens ?? totals?.cacheReadTokens ?? null,
        cacheCreationTokens: stats?.cacheCreationTokens ?? totals?.cacheCreationTokens ?? null,
        contextTokens: stats?.contextTokens ?? null,
        contextPercent: ctx,
        duration: stats?.duration ?? null,
        apiDuration: stats?.apiDuration ?? null,
        linesAdded: stats?.linesAdded ?? totals?.linesAdded ?? null,
        linesRemoved: stats?.linesRemoved ?? totals?.linesRemoved ?? null,
        specialistRuns: totals?.specialistRuns ?? 0,
        fiveHourUtilization: usage?.five_hour?.utilization ?? null,
        fiveHourResetsAt: usage?.five_hour?.resets_at ?? null,
        sevenDayUtilization: usage?.seven_day?.utilization ?? null,
        sevenDayResetsAt: usage?.seven_day?.resets_at ?? null,
      };
    },
    [statusData],
  );
```

Add the two new optional fields to `UsageSnapshot` in `chat-types.ts`.

- [ ] **Step 4: Update the card**

In `UsageCard.tsx`: put this caption under the 5h/7d bars —

```tsx
            {/* These bars are ACCOUNT-wide, not session-scoped. Saying so here
                is the whole reason the status bar can drop the chips in a
                native session without leaving the user guessing (spec §10). */}
            <p className="text-3xs text-fg-muted mt-1">
              Measured across your whole Claude account, not just this conversation.
            </p>
```

— add `{SCOPE_NOTE}`-equivalent wording (`Counts this session so far, including specialists.`)
once above the session rows, and guard every session row with its own value check so a row
with nothing to show is omitted rather than rendered with `--`.

- [ ] **Step 5: Run the test**

Run: `cd <worktree>/desktop && npx vitest run tests/usage-card-native.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 6: Verify**

Run: `bash scripts/verify.sh <worktree>`
Expected: passes.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/App.tsx src/renderer/components/UsageCard.tsx src/renderer/state/chat-types.ts tests/usage-card-native.test.tsx
git commit -m "feat(usage): /usage works in native sessions and labels the subscription bars account-wide"
```

---

### Task 15: CHECKPOINT — measure the cost against a real bill

**Do not ship the cost chip until this passes.** A cost chip that is wrong is worse than no
cost chip (spec §12).

- [ ] **Step 1: Run one real metered session**

`bash scripts/run-dev.sh <worktree> --label "Status Bar Cost"`, bind an OpenRouter model,
run a session with several turns and at least one specialist delegation, and note the chip's
final figure.

- [ ] **Step 2: Compare against the provider**

Read the same period's spend from the OpenRouter dashboard. Record both numbers and the
percentage gap in the plan's completion notes.

- [ ] **Step 3: Decide with Destin**

Present: chip figure, dashboard figure, gap, and the likely cause of any difference
(unmodelled per-model price overrides; provider rounding). If the gap is larger than a few
percent, **stop and investigate** — do not paper over it in the tooltip.

- [ ] **Step 4: State the measured tolerance in the tooltip**

Replace `'Not exact — a few models charge more above very large prompts.'` with the measured
statement, e.g. `'Measured within 2% of billed spend.'` — a number you actually observed,
never an estimate of an estimate.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/StatusBar.tsx
git commit -m "docs(status-bar): state the measured cost tolerance in the chip tooltip"
```

---

### Task 16: Land it

- [ ] **Step 1: Full verification**

Run: `bash scripts/verify.sh <worktree> --full`
Expected: clean — `tsc`, the full vitest suite, `knip`, `eslint`, ast-grep.

- [ ] **Step 2: Re-run the UI review and read coverage first**

Run: `bash scripts/ui-review/run-review.sh <worktree>` and read `coverage.md` before
writing any finding. Diff the sheets against the Task 9 set; anything that changed and
wasn't approved goes back to Destin.

- [ ] **Step 3: Update the workspace docs**

- Move the spec from `docs/active/specs/` to `docs/archive/specs/` and set
  `status: shipped`.
- Move this plan to `docs/archive/plans/`.
- Flip the ROADMAP item for this work to `[x]`. **Leave the Git Branch item open** — this
  work deliberately did not fix it.
- Add to `.claude/rules/` (or extend the status-bar rule if one exists) the two invariants
  worth executing on: *a chip with no value renders nothing* and *session totals include
  specialists*. Both are already pinned by tests — cite the test names rather than
  restating the rule in prose.

- [ ] **Step 4: PR**

```bash
git push -u origin feat/statusbar-session-relevance
gh pr create --title "Status bar: numbers that are true, and that say what they count" \
  --body "Implements docs/active/specs/2026-08-25-status-bar-session-relevance-design.md. Hides Claude-subscription chips and the Fast toggle in native sessions; makes token totals cumulative and specialist-inclusive; adds a real session cost priced per turn at the model that ran it (prompt-cache rates included); makes Code Changes real and specialist-inclusive; /usage now works in native sessions."
```

- [ ] **Step 5: After merge**

```bash
cd /home/destin/youcoded-dev/youcoded
git branch --contains <sha>          # must list master
git worktree remove ../../statusbar-relevance
git push origin --delete feat/statusbar-session-relevance
git branch -D feat/statusbar-session-relevance
```

Shut down any dev server started for Task 15.

---

## Coverage against the spec

| Spec section | Task |
|---|---|
| §2 the contract (what a number counts) | 4, 7, 13, 14 |
| §3 Rule 1 (no value → no chip) | 3 (the seven `--` chips), 7 (Code Changes), 13 (Cost) |
| §3 Rule 2 (runtime gate) | 3 |
| §4 per-chip behaviour table | 3, 7, 13 |
| §5 cost | 10, 11, 12, 13, 15 |
| §6 cumulative tokens | 4, 5, 7 |
| §7 code changes incl. specialists | 4, 5, 7 |
| §8 one derivation path | 4, 5, 6, 12 |
| §9 Customize menu | 2, 8 |
| §10 `/usage` | 14 |
| §11 surfaces (no IPC) | enforced by Global Constraints; verified by `verify.sh` |
| §12 checkpoints | 9, 15 |
| §13 guards | every task's tests; Task 1 pins the replay assumption |
| §14 experience | 9 (the sheets are how Destin sees it) |
| §15 out of scope | Git Branch untouched (Global Constraints, Task 2 test) |

---

## Design decisions from the Task 9 checkpoint (2026-08-27)

Destin reviewed the deck at `docs/active/design/2026-08-26-statusbar-relevance/statusbar-cards.html`
and answered all nine points. **Declined** (do not build): #1 reserve a second bar row;
#2 a "Free" chip in local sessions; #5 a specialists chip. **Approved**: #3, #4, #6, #7,
#8 (cut the pointer), #9. Tasks 17–19 below implement the six approved changes and must
land before Task 16.

A note that shapes all three: the renderer currently CANNOT tell a free local model from a
metered model with no published price. `SessionInfo` carries no provider type, and
`StatusBar`'s `modelProviderType` prop is declared but never passed by `App.tsx` — verified
with `grep -rn "modelProviderType" desktop/src/renderer/`, which returns only the three
lines inside StatusBar.tsx itself. So the distinction must come from **main**, which knows
the provider, and ride the totals — exactly like `anyPriced`/`anyUnpriced` already do.
Do NOT try to infer it in the renderer from the model id.

---

### Task 17: Totals learn "this cost nothing to run" and "specialists spent this much"

**Depends on:** nothing (parallel-safe with Task 10 — disjoint files).
**Blocks:** Tasks 18 and 19.

**Files:**
- Modify: `desktop/src/renderer/state/session-totals.ts`
- ~~Modify: `desktop/src/renderer/state/chat-reducer.ts`~~ — **corrected during implementation:
  there is no `addSubagentUsage` call site to modify.** Verified repo-wide: the function is
  exported and used only by its own tests. A specialist's spend is designed to arrive as its
  own subagent-usage event, which **Task 12** creates; `chat-reducer.ts:1515-1529` says so in
  its WHY block. The reducer stays unchanged here, and the specialist→`specialistCostUsd`
  path is pinned at the module level instead.
- Modify: `desktop/src/renderer/dev/workbench/seed-chat.ts` (`STATUSBAR_TOTALS_OVERRIDE`)
- Test: `desktop/tests/session-totals.test.ts`, `desktop/tests/session-totals-reducer.test.ts`

**Interfaces produced:**

```ts
export interface SessionTotals {
  // …existing fields unchanged…
  /** Some counted work ran on a model that costs nothing to run (a local
   *  engine). Distinct from anyUnpriced, which means "metered, but we have no
   *  published rate" — opposite situations that the bar and the Customize menu
   *  must word differently (checkpoint decisions #3 and #9). */
  anyFree: boolean;
  /** Of costUsd, how much was spent by specialist runs rather than by this
   *  session's own turns. Lets the Cost chip name where the money came from
   *  (checkpoint decision #4) instead of leaving it to a hover tooltip. */
  specialistCostUsd: number;
}

export interface TurnUsageLike {
  // …existing fields unchanged…
  /** True when the work ran on a model that costs nothing to run. Main stamps
   *  it; Task 11 is what makes it real. Absent is treated as false. */
  free?: boolean;
}
```

- [ ] **Step 1: Write the failing tests** in `session-totals.test.ts`:
  1. `emptyTotals()` has `anyFree: false` and `specialistCostUsd: 0`.
  2. `addTurnUsage(t, { free: true })` sets `anyFree: true` and leaves `anyPriced`/
     `anyUnpriced` untouched — free is a THIRD state, not a spelling of unpriced.
  3. `addTurnUsage(t, { costUsd: 0.5 })` leaves `specialistCostUsd` at 0 — a parent turn's
     cost is not specialist spend.
  4. `addSubagentUsage(t, { costUsd: 0.5 })` adds 0.5 to BOTH `costUsd` and
     `specialistCostUsd`.
  5. Identity is preserved: `addTurnUsage(t, {})` still returns the SAME object reference
     (the existing no-op short-circuit must not be broken by the new fields), and
     `addTurnUsage(t, { free: true })` on totals that ALREADY have `anyFree: true` also
     returns the same reference. **This is the trap** — a naive `free` branch makes every
     free turn allocate a new object and the `useSyncExternalStore` snapshot churns.
  6. `addSubagentUsage` still always returns a NEW object (it always increments
     `specialistRuns`).

  And in `session-totals-reducer.test.ts`: a specialist run with a cost lands in
  `specialistCostUsd` on the parent session's totals, and a parent turn with a cost
  does not.

- [ ] **Step 2: Run to verify they fail.**
  `cd <worktree>/desktop && npx vitest run tests/session-totals.test.ts tests/session-totals-reducer.test.ts`

- [ ] **Step 3: Implement.** Add the two fields to `SessionTotals` and `emptyTotals()`.
  Extend the existing `hasTokens/hasCost` short-circuit to a third clause so a `free: true`
  that changes nothing still returns the same reference. In `addSubagentUsage`, add the
  priced amount to `specialistCostUsd` alongside `costUsd`.

- [ ] **Step 4: Update the workbench fixtures** in `seed-chat.ts` so the five review
  scenarios still say what their names claim, now that free and unpriced are different:
  - `statusbar-local`: `anyFree: true, anyUnpriced: false, specialistCostUsd: 0`
  - `statusbar-metered`: `anyFree: false, anyUnpriced: false, specialistCostUsd: 0`
  - `statusbar-unpriced`: `anyFree: false, anyUnpriced: true, specialistCostUsd: 0`
    (this is the metered-but-no-published-rate case — it must NOT be free)
  - `statusbar-delegated`: `anyFree: true, anyUnpriced: true, specialistCostUsd: 0.61`
    (a free local parent; every cent came from its specialists)
  - `statusbar-cc`: unchanged.

- [ ] **Step 5:** `cd /home/destin/youcoded-dev && bash scripts/verify.sh worktrees/statusbar-relevance`
- [ ] **Step 6: Commit** — `feat(status-bar): totals tell "free to run" apart from "no published price", and track specialist spend`

---

### Task 18: The Customize menu says it plainly (checkpoint #6, #7, #8, #9)

**Depends on:** Task 17. **Blocks:** Task 19 (same file).

**Files:**
- Modify: `desktop/src/renderer/state/status-widgets.ts`
- Modify: `desktop/src/renderer/components/StatusBar.tsx` (the `WidgetConfigPopup` dimmed-row
  branch ~890-905, and the `relevance={{…}}` prop ~1697)
- Test: `desktop/tests/status-widgets.test.ts`, `desktop/tests/statusbar-widget-menu.test.tsx`

**The four changes, exactly:**

1. **#8 — cut the pointer.** `'Claude Code sessions only — see /usage'` becomes
   `'Claude Code sessions only'`. Destin's words: "yes — cut the pointer." Do NOT make it
   a link; that option was on the card and this is the other one.
2. **#7 — drop the promise.** `'Not measured in this kind of session yet'` becomes
   `'Not available in this kind of session'`. The word "yet" promised a feature that is
   not on the roadmap.
3. **#9 — a local model is not a shop listing.** `RelevanceContext` gains
   `runsLocally: boolean`. When `id === 'session-cost'` and there is no priced work:
   - `runsLocally` → `"Models on your own machine don't cost anything to run"`
   - otherwise → `'No published price for this model'` (unchanged)
   No trailing period on any reason string — the two siblings have none.
   Feed it in StatusBar from the totals: `runsLocally: nativeTotals?.anyFree ?? false`.
4. **#6 — one line each, so every row is the same height.** In the dimmed-row branch,
   the reason currently sits BESIDE the label on the same flex row, which wraps
   "Session Duration" onto two lines and makes that row taller than its neighbours (visible
   in all six themes). Restack it: label on its own line, reason on the line beneath it,
   both left-aligned to the same x as the enabled rows' labels (keep the empty
   `w-3.5 h-3.5` checkbox spacer so the left edge still lines up). The reason keeps
   `text-3xs text-fg-muted italic`; the row keeps `opacity-50` and stays non-focusable.

**Guards that must not regress** (they exist and are load-bearing):
- The dimmed row contains ZERO focusable elements — no checkbox button, no "(i)" info
  button, no Theme pencil. `statusbar-widget-menu.test.tsx` asserts this; keep it passing.
- `git-branch` still gets NO reason (it is missing because nothing feeds it, not because it
  doesn't apply — spec §4).
- Reason strings are asserted byte-for-byte in `status-widgets.test.ts`. Update those
  assertions to the new strings; do not loosen them to `toContain`.

- [ ] **Step 1:** Write the failing tests first (new strings, the `runsLocally` branch, and a
  DOM assertion that the label and the reason are on separate lines — assert structure, e.g.
  the reason is not a sibling inside the same single-line flex row, rather than asserting
  pixel height).
- [ ] **Step 2:** Verify they fail. **Step 3:** Implement. **Step 4:** Verify they pass.
- [ ] **Step 5:** `bash scripts/verify.sh worktrees/statusbar-relevance`
- [ ] **Step 6: Commit** — `feat(status-bar): the Customize menu explains a dimmed row in one plain line`

---

### Task 19: The Cost chip names what it can't price, and where the money came from

**Depends on:** Tasks 17 and 18 (Task 18 edits the same file).

**Files:**
- Modify: `desktop/src/renderer/components/StatusBar.tsx` (the `session-cost` chip block
  ~1336-1360 only)
- Test: `desktop/tests/statusbar-session-relevance.test.tsx`

**The two changes:**

1. **#3 — "free" and "we can't price this" must not look identical.** Verified with
   `magick compare`: the bar row for `statusbar-local` and `statusbar-unpriced` is currently
   pixel-identical (0 differing pixels), because both simply hide the chip. That is the one
   gap in this design that can cost a user money. New rule for the chip, in order:
   - Claude Code cost present → unchanged.
   - `anyPriced` → the figure, unchanged (including the `<$0.01` guard and the
     "some work could not be priced" partial tooltip).
   - **NEW**: native, `!anyPriced`, `anyUnpriced` → render a dimmed chip reading
     `Cost: not listed`, styled like the other muted chips (no accent colour — it is an
     absence, not an alert). Tooltip: `This provider bills for usage, but no price is
     published for this model, so the session cost can't be totalled.`
   - `anyFree` and nothing priced → render NOTHING, as today. Destin declined a "Free"
     chip (#2); silence stays the answer for a local session.
   - Nothing at all measured → render nothing (Rule 1).
   Note both flags can be true at once (a free local parent that delegated to a metered
   specialist). `anyPriced` wins — a real figure beats "not listed".

2. **#4 — name the source.** When the chip renders a figure and
   `specialistCostUsd > 0`, append ` · specialists`, e.g. `Cost: $0.61 · specialists`.
   Destin approved the wording from the card. The tooltip carries the split:
   `$X.XX of this was spent by N specialists this session delegated to.` Do not show the
   marker when `specialistCostUsd` is 0 — most sessions never delegate, and the chip is on
   an already-crowded bar (the width risk Destin was shown and accepted).

- [ ] **Step 1: Write the failing tests** — one per branch above, plus:
  a free local session with a metered specialist renders `$0.61 · specialists` and NOT
  `not listed`; a metered session with no specialists renders no marker; the `<$0.01` guard
  from commit 4c5b06d3 still holds with the marker appended.
- [ ] **Step 2:** Verify they fail. **Step 3:** Implement. **Step 4:** Verify they pass.
- [ ] **Step 5:** `bash scripts/verify.sh worktrees/statusbar-relevance`
- [ ] **Step 6: Commit** — `feat(status-bar): say "not listed" instead of nothing, and name specialist spend`

---

### Carried into Task 11 (main-process pricing)

Three items the reviews and the checkpoint pushed forward. Task 11 is not done until all
three are handled:

1. **Widen the RENDERER's `TurnUsage`, not just `shared/types.ts`.** `chat-types.ts`'s
   `TurnUsage` has no `costUsd`, so a priced turn cannot reach the totals even once main
   stamps it. `App.tsx` already forwards the whole usage object — only the TYPE needs
   widening. (Found by Task 5's reviewer.)
2. **Stamp `free: true` for local-engine work, and `costUsd: null` for metered work with no
   published rate.** Tasks 17–19 are built against these two signals; without them the new
   "not listed" chip never fires and every local session claims "No published price".
   Related trap found by Task 13's reviewer: `model-catalog.ts:174-183` maps OpenRouter's
   `pricing.prompt: "0"` to a real `0` rate (the non-empty-string guard admits `"0"`), so an
   OpenRouter `:free` model would count as PRICED. Decide there that a zero rate means
   free, not priced.
3. **Carry the cache rates through, or change the tooltip.** The cost tooltip already
   claims "prompt-cache discounts included". Task 10 adds `cacheRead`/`cacheWrite` to
   `CatalogModel.pricing`; Task 11 must actually USE them, or that sentence ships false.

---

### Task 20: The bar and the Customize menu must agree about Cost

**Depends on:** Tasks 18 and 19. **Found by:** the reviews of both.

Two defects, one root cause. `status-widgets.ts` decides what the menu says about
`session-cost` from `hasPricedWork` alone, but Task 19 gave the chip a fourth state the menu
knows nothing about.

**Defect A (bar and menu structurally disagree).** With `!anyPriced && anyUnpriced` the bar now
renders `Cost: not listed`, while the menu still DIMS the Session Cost row. The user sees a
chip on their bar whose switch looks unavailable — and cannot turn it off. The whole reason
`status-widgets.ts` exists is that the bar can never show a chip the menu won't offer, or
vice versa (spec §9).

**Defect B (the menu tells a metered session it is free).** A free local parent that delegated
to a metered specialist with no published rate has `anyFree && anyUnpriced && !anyPriced`.
`runsLocally` wins unconditionally, so the menu says "Models on your own machine don't cost
anything to run" while metered work actually ran. Spec §5 names exactly this delegation shape
as the one that must not be hidden.

**Files:**
- Modify: `desktop/src/renderer/state/status-widgets.ts`
- Modify: `desktop/src/renderer/components/StatusBar.tsx` (the `relevance={{…}}` prop only)
- Test: `desktop/tests/status-widgets.test.ts`, `desktop/tests/statusbar-widget-menu.test.tsx`

**The rule, replacing the current `session-cost` branch.** `RelevanceContext` gains
`anyUnpriced: boolean`, fed from `nativeTotals?.anyUnpriced ?? false`. Then, in order:

| Session state | Chip renders | Menu row |
|---|---|---|
| `anyPriced` | a figure | **enabled** — no reason |
| `!anyPriced && anyUnpriced` | `Cost: not listed` | **enabled** — no reason |
| `anyFree` only | nothing | dimmed: `Models on your own machine don't cost anything to run` |
| nothing measured yet | nothing | **no reason at all** |

Two things to notice. First, the rule is now "does the chip render anything?" rather than
"is there priced work?" — which is what makes bar/menu agreement structural instead of a
coincidence that has to be maintained twice. Second, Defect B disappears on its own: when
`anyUnpriced` is true the row is not dimmed, so there is no sentence left to contradict.

**The "nothing measured yet" row is a real change, not an oversight.** Today a fresh native
session on a perfectly ordinary metered model is told `No published price for this model`,
which is simply false — nothing has been priced because nothing has run. A reason must be
true or it must not be shown (spec §4); this is the same defect the whole work removes, so
that string now fires only when it is accurate. `git-branch` is the existing precedent for a
widget that is empty without being unavailable.

- [ ] **Step 1: Write the failing tests.** The load-bearing one is a **bar/menu agreement
  test** driven by a table of all five session shapes: for each, assert that the chip renders
  something **iff** the menu row is enabled. Write it so a future change to either surface
  alone turns it red. Plus per-shape assertions on the reason strings (byte-for-byte, `toBe`).
- [ ] **Step 2: Run to verify they fail** — expect the unpriced shape and the
  nothing-measured shape to fail.
- [ ] **Step 3: Implement.** WHY comment at the branch explaining that the condition mirrors
  the chip's render condition on purpose, and that the two must be changed together.
- [ ] **Step 4: Re-prove the focusable-element guard.** Commit 10cf48cd widened
  `rowAround()` in `statusbar-widget-menu.test.tsx` after the Task 18 review found it could
  not see the row's "(i)" info button. The unmutated half was verified; the mutation half was
  run only in the reviewer's scratch copy. Re-prove it here: copy the tree OUT of the
  worktree, remove the `!reason` gate on the info button (`StatusBar.tsx` ~972), and confirm
  the test now FAILS. Report what you saw. Do NOT mutate the worktree in place.
- [ ] **Step 5:** `bash scripts/verify.sh worktrees/statusbar-relevance`
- [ ] **Step 6: Commit** — `fix(status-bar): the Customize menu offers the Cost row whenever the bar shows it`

---

### Task 21: "Free" must not mean "unpriced" (Critical, found by the Task 11 review)

**Depends on:** Tasks 11, 19, 20.

A cross-task collision. `session-totals.ts`'s `addUsage` sets `anyUnpriced = true` whenever
`costUsd === null`, with no `free` guard — a rule written before `free` existed. Task 11 then
began stamping a **local-engine** turn as `costUsd: null, free: true`, because a local model
has no rate card. Result: **every purely local session now has `anyUnpriced === true`.**

The Task 11 reviewer proved the consequence by rendering the real `StatusBar` with exactly
what Task 11 stamps:

```
AssertionError: expected 'Add tagsCost:not listed' not to contain 'not listed'
```

So a model running on the user's own machine draws `Cost: not listed`, with the tooltip
*"This provider bills for usage, but no price is published for this model"* — false, and
exactly the class of quiet wrongness this whole work exists to remove. It also makes Task 20's
`"Models on your own machine don't cost anything to run"` **unreachable dead code**, since its
gate requires `!anyUnpriced`.

`anyUnpriced` must mean what every consumer already assumes: **metered, with no published
rate.** Free is a different state and always was.

**Files:**
- Modify: `desktop/src/renderer/state/session-totals.ts`
- Test: `desktop/tests/session-totals.test.ts`, `desktop/tests/statusbar-session-relevance.test.tsx`

- [ ] **Step 1: Write the failing tests.**
  1. In `session-totals.test.ts`: `addTurnUsage(t, { costUsd: null, free: true })` sets
     `anyFree` and leaves `anyUnpriced` **false**; `addTurnUsage(t, { costUsd: null })` (no
     `free`) still sets `anyUnpriced` true. Check `addSubagentUsage` too — a **free local
     specialist** must not mark the parent session unpriced.
  2. In `statusbar-session-relevance.test.tsx`: the end-to-end guard the unit tests missed —
     feed the bar the totals a purely local session actually produces and assert it renders
     **no cost chip at all** and never the string `not listed`. This is the test whose absence
     let the defect through; write it so it fails today.
  3. A menu-side assertion that the local sentence is reachable again.
- [ ] **Step 2: Run to verify they fail.**
- [ ] **Step 3: Implement** — guard the `anyUnpriced` assignment on `u.free !== true`, in
  every place that sets it. WHY comment: `costUsd === null` has two causes — no rate card
  because the model is metered but unlisted, and no rate card because the model is free — and
  only the first is `anyUnpriced`.
- [ ] **Step 4:** `bash scripts/verify.sh worktrees/statusbar-relevance`
- [ ] **Step 5: Commit** — `fix(status-bar): a local session is free, not "not listed"`

**Deferred to Task 22** (they touch `harness-session.ts`, which Task 12 holds):
- `free: true` and a positive `costUsd` can coexist at the stamping site
  (`harness-session.ts` ~1949-1959). Unreachable in production only because `ipc-handlers.ts`
  short-circuits `local-engine` — the invariant lives in the wiring, not at the stamp.
  Fix: `costUsd: this.opts.free ? null : costForUsage(...)`.
- Two correct-but-**unpinned** behaviours, both mutation-proved by the reviewer:
  deleting `if (pricing !== undefined) this.opts.pricing = pricing;` from `setBinding` left
  137 tests green; replacing the `Math.min(cacheReadTokens, inputTokens)` clamp with the raw
  value left 11/11 pricing tests green (a provider reporting 5,000 cached against 100 prompt
  tokens would over-charge 50× with nothing red). Specialist-carries-its-own-price is also
  correct but unpinned.
- `eval/run-case.ts` ~441 constructs a 4th `HarnessSession` without pricing. Harmless (eval
  has its own estimator) but undocumented.

---

### Task 22: Pin the pricing behaviours nothing was guarding, and stop the tooltip over-claiming

**Depends on:** Tasks 11, 12, 19, 21. These were deferred from the Task 11 and Task 19/20
reviews because `harness-session.ts` was held by Task 12.

Four items. The middle two are the important ones: they are behaviours that are **correct
today and completely unprotected** — the reviewer deleted each and the suite stayed green.

**Files:**
- Modify: `desktop/src/main/harness/harness-session.ts`
- Modify: `desktop/src/renderer/components/StatusBar.tsx` (the `not listed` tooltip string only)
- Modify: `desktop/src/main/harness/eval/run-case.ts` (a comment, or thread pricing — your call)
- Test: `desktop/tests/harness-pricing.test.ts`, `desktop/tests/native-session-host.test.ts`,
  `desktop/tests/statusbar-session-relevance.test.tsx`

- [ ] **1. `free: true` and a positive `costUsd` must not be able to coexist.**
  `harness-session.ts` (~1949-1959) computes the two independently. The reviewer produced
  `{"costUsd":7,"free":true}` from a `local-engine` binding whose resolver returned a rate.
  It is unreachable in production only because `ipc-handlers.ts` short-circuits `local-engine`
  before the catalog — so the invariant lives in the wiring, not where it is stamped.
  Fix: `costUsd: this.opts.free ? null : costForUsage(...)`, with a test.

- [ ] **2. `setBinding` re-applying pricing is unpinned.** Deleting
  `if (pricing !== undefined) this.opts.pricing = pricing;` left **137 tests green**. The
  behaviour is right (the reviewer's probe: turn 1 = $7 at model 1, turn 2 = $70 at model 2,
  turn 1 never repriced) — pin it. A mid-session model swap must price only the turns that run
  after it, and must never reprice a finished turn.

- [ ] **3. The cached-token clamp is unpinned.** Replacing
  `Math.min(usage.cacheReadTokens, usage.inputTokens)` in `pricing.ts` with the raw value left
  **11/11 pricing tests green**. The existing "never negative" test is satisfied by the
  trailing `Math.max(0, …)` alone. A provider reporting 5,000 cached tokens against a
  100-token prompt would be charged **50× too much** with nothing going red. Add the test that
  fails without the clamp.

- [ ] **4. The `not listed` tooltip asserts a cause it has not verified.**
  It currently reads *"This provider bills for usage, but no price is published for this
  model, so the session cost can't be totalled."* But `pricingFor` returns null for **any**
  model missing from the catalog — including a dead network with an empty cache, where a price
  exists and simply wasn't fetched. `docs/error-message-standards.md` forbids stating an
  unverified cause. Reword to something true in both cases, e.g. *"This provider bills for
  usage, but no price is available for this model here, so the session cost can't be
  totalled."* Update the test's byte-for-byte assertion to match.

- [ ] **5. `eval/run-case.ts` (~441) constructs a fourth `HarnessSession` with no pricing**, so
  eval turns get `costUsd: null, free: false`. Harmless — eval has its own estimator — but
  undocumented. Either thread pricing or add a one-line WHY saying eval prices itself.

- [ ] **6:** `bash scripts/verify.sh worktrees/statusbar-relevance`
- [ ] **7: Commit** — `test(harness): pin the pricing rules that a deletion left green`

**For each of items 1–3, prove the new test is a real guard**: make the deletion the reviewer
made, in a copy of the tree OUTSIDE the worktree (`cp -a` to /tmp — never mutate in place,
another agent is working here), confirm the new test goes red, and report the failure text.

---

### Task 23: Close the silent failures around specialist spend

**Depends on:** Tasks 12, 22. **Found by:** the Task 12 review (3) and the Task 22 implementer (1).

Four items. Three are the same shape: **a path where a user's money quietly stops being
counted and nothing anywhere says so.** A cost figure that is silently short is worse than
one that is visibly missing — the user has no way to know not to trust it.

**Files:**
- Modify: `desktop/src/main/harness/native-session-host.ts`
- Modify: `desktop/src/renderer/state/chat-reducer.ts`
- Modify: `desktop/src/renderer/buddy/BubbleFeed.tsx`
- Test: `desktop/tests/native-session-host.test.ts`, `desktop/tests/subagent-usage-event.test.ts`

- [ ] **1. A finished specialist can be billed AND called free.** `native-session-host.ts`
  ~934-936 builds the roll-up as
  `usage: { ...run.usage, costUsd: costForUsage(run.usage, pricing), free }` — the two
  resolved from independent sources with nothing stopping them contradicting. This is the
  same defect Task 22 item 1 just fixed for `turn-complete`; the specialist path was outside
  that task's file scope. Fix it the same way (`free ? null : costForUsage(...)`) and pin it.

- [ ] **2. The likeliest failure is the silent one.** `native-session-host.ts` ~931-934:
  `if (parentSession && childSession)` has **no `else`**. A teardown or destroy race takes
  that branch rather than the `catch`, so the parent's totals go short with **zero** log
  output. The `catch` beside it logs properly; this path logs nothing. Add the `else` with a
  specific log naming which half was missing — do not write a message that guesses a cause
  (`docs/error-message-standards.md`).

- [ ] **3. The renderer drops an orphan report silently too.** `chat-reducer.ts` ~1547. If
  `SESSION_INIT` ordering ever slipped, money vanishes with no trace. Add a `console.warn` on
  the **orphan branch only** — never on the dedup branch, where a second delivery is expected
  and normal (live-plus-replay overlap). Getting that distinction wrong turns a useful warning
  into noise that trains people to ignore it.

- [ ] **4. Buddy-window parity.** `buddy/BubbleFeed.tsx` ~91 keeps its own transcript switch
  with no `subagent-usage` case. No user-visible bug today — nothing in `buddy/` reads
  `totals` — but its `turn-complete` case (~163) forwards usage explicitly *"if the buddy ever
  surfaces those UIs"*, so this now contradicts its own stated policy. Mirror the `App.tsx`
  case.

- [ ] **5:** `bash scripts/verify.sh worktrees/statusbar-relevance`
- [ ] **6: Commit** — `fix(harness): a specialist's spend never goes missing without saying so`

Prove items 1–3 with mutation, in a copy OUTSIDE the worktree (`cp -a` to /tmp): revert each
fix and confirm a named test goes red. Item 4 has no runtime behaviour to pin — say so rather
than inventing an assertion.

---

### Task 24: `setBinding`'s `free` re-apply is unguarded — and Task 22 made it load-bearing

**Depends on:** Tasks 22, 23. **Found by:** the Task 22 review.

`harness-session.ts` line ~739 is `if (free !== undefined) this.opts.free = free;`. The
reviewer deleted that single line and **151 tests stayed green** — it is exactly the defect
class Task 22 existed to remove, sitting on the line directly below the one Task 22 pinned.

It matters more now than it did yesterday. Task 22 item 1 made `costUsd` depend on
`this.opts.free` (`costUsd: this.opts.free ? null : costForUsage(...)`), so a **stale** `free`
no longer just mislabels a turn — it suppresses the bill entirely.

**The proven scenario** (the reviewer wrote and ran it): a mid-session swap from a
`local-engine` model to an OpenRouter one. With the line deleted, turn 2 reports
`{costUsd: null, free: true}`; with it restored, `{costUsd: 7, free: false}`. Downstream that
sets `anyFree` and never `anyPriced` — so the Cost chip tells the user the session is free
while OpenRouter bills them for every turn after the swap.

**Files:**
- Test: `desktop/tests/native-session-host.test.ts` (production code is already correct)
- Modify: `desktop/src/renderer/components/StatusBar.tsx` (one string, Minor 2 below)

- [ ] **1. Pin the `free` re-apply.** Add a swap test: `local-engine` → `openrouter`, asserting
  turn 2 comes back `free: false` with a real figure, and that turn 1 keeps `free: true` with
  `costUsd: null`. Prove it by deleting line ~739 in a copy OUTSIDE the worktree and
  confirming the new test goes red.

- [ ] **2. Strengthen the "never repriced" assertion, or soften its comment.** The reviewer
  found the existing turn-1 half near-tautological: `data.usage` is built at emit time and
  nothing in-process can mutate it afterwards, so the shape the test covers was never at risk.
  The shape that IS at risk is a swap issued **while a turn is still streaming** — the test
  awaits `waitForTurnComplete` first. Either add that case or make the comment honest about
  what it pins. Do not leave a comment claiming a guarantee the test does not provide.

- [ ] **3. One more "published" string.** `StatusBar.tsx` ~1413: *"Models with no published
  price are not included in this total."* Weaker than the tooltip Task 22 fixed — it states an
  exclusion rule rather than a cause — but it is the same word doing the same misleading work
  on the same surface. Reword for consistency (e.g. "no available price"). The `UsageCard.tsx`
  twin of this is being handled inside Task 14.

- [ ] **4:** `bash scripts/verify.sh worktrees/statusbar-relevance`
- [ ] **5: Commit** — `test(harness): pin that a model swap re-reads whether the new model is free`

---

### Task 25: A comment that invites someone to delete working code

**Depends on:** Task 23. **Found by:** the Task 23 review.

Three small items, but the first is the kind of thing that bites a future session.

**Files:**
- Modify: `desktop/tests/subagent-usage-event.test.ts`
- Modify: `desktop/src/main/harness/native-session-host.ts` (a comment only, unless you add the test in item 2)
- Modify: `desktop/src/renderer/state/chat-reducer.ts` (one comment)

- [ ] **1. The test comment is wrong, and it says live code is dead.**
  `subagent-usage-event.test.ts` ~302-307 explains why the test stages the PARENT going
  missing rather than the child: *"runSpecialist's own throwIfEnded already notices a missing
  CHILD … the parent is the half that can genuinely go missing."* That is true only at the
  point they stage it. `throwIfEnded` runs **during** the run and never again after
  `runSpecialist` returns — and `destroy()` awaits `destroyChildrenOf(sessionId)` **before**
  `this.live.delete(sessionId)`, so a parent teardown landing in the await gap after the run
  resolves deletes the **child first**, leaving the parent live. The reviewer proved it with a
  probe that wrapped `runSpecialist` to delete the child's live entry on resolve; the branch
  fired and logged *"the specialist session was no longer live"*.
  So the branch is reachable and its message is true — **the lie is in the comment**, and it
  invites a future reader to delete a live branch as unreachable. Replace it with the real
  reason (the parent half is what a `live.delete` hook inside `doStream` can stage; the child
  half needs a post-return hook) and record the cascade order that makes the child half the
  *more* likely one in production.

- [ ] **2. Two of the three `missing` phrases are unpinned.**
  `native-session-host.ts` ~962-964. Each phrase is individually accurate today and no branch
  can emit a false one — but collapsing the ternary to a hardcoded
  `'the parent session was no longer live'` **passes the current test while lying in the other
  two cases**. Add the child-missing case (the reviewer says its probe is ~15 lines) or assert
  the three arms directly.

- [ ] **3. One line of WHY.** `chat-reducer.ts` ~1553: `if (!action.usage) return state;` stays
  silent, and that is right — `emitSubagentUsage` types `usage` as required, so a null means a
  malformed or legacy persisted event carrying no dollar figure, and there is no money to
  lose. Say that at the site, so it doesn't read as a fourth silent hole next to the three
  Task 23 just closed.

- [ ] **4:** `bash scripts/verify.sh worktrees/statusbar-relevance`
- [ ] **5: Commit** — `test(harness): the child-missing branch is reachable, and the comment said otherwise`

---

### Task 26: The /usage card's untested centre, and the context row it never grew

**Depends on:** Task 14. **Found by:** the Task 14 review.

- [ ] **1. MAJOR — context is missing from the card in native sessions.** Spec §10 requires the
  snapshot to gain "the same native sources as the chips (**tokens, cache, context**, cost,
  code changes)". Four of five landed. `App.tsx`'s `getUsageSnapshot` sets
  `contextPercent: statusData.contextMap[sid]`, which `StatusBar.tsx` documents as Claude-Code
  only ("The native chip does NOT use this"). The bar already resolves native context as
  `contextPercent ?? nativeChips?.contextPct`. **Failure:** a native session at 61% context
  shows a context pill on the bar and NO context row in `/usage` — the two surfaces disagreeing
  about one session, which is the exact thing this work exists to prevent. Thread the same
  source the bar uses, with the same `??` precedence.

- [ ] **2. MAJOR — the fix's centre has zero test coverage.** `rg getUsageSnapshot tests/`
  returns nothing; no test imports `App.tsx` at all. The reviewer deleted the native totals
  fallback — the thing Task 14 was built to add — and **not one of 5,820 tests went red**. Only
  the presentation layer is guarded. Extract the snapshot body into a pure function under
  `src/renderer/state/` and pin it: native-with-empty-totals returns non-null (this is what
  stops `/usage` being typed at the model); Claude Code returns null; a totals zero collapses
  to absent; a statusline zero survives.

- [ ] **3. Minor — a brand-new native session gets furniture.** Nothing measured and no
  `.usage-cache.json` → the card renders only "SESSION USAGE" and a timestamp. Better than the
  old passthrough bug, but it needs one line of empty state.

- [ ] **4. Minor — the cache cell hides a real Claude Code zero.** `UsageCard.tsx` gates on
  `cacheTotal > 0`; `StatusBar.tsx` deliberately bails on `null`, not falsy, so a cold-cache
  statusline `0` renders "Cached: 0" on the bar and nothing on the card. It is the exact
  zero-rule the bar comments at length about.

- [ ] **5:** `bash scripts/verify.sh worktrees/statusbar-relevance`
- [ ] **6: Commit** — `fix(usage-card): show native context, and pin the snapshot nothing tested`

---

### Task 27: Check our cost against the provider's own figure

**Depends on:** Tasks 11, 22. **Destin chose this over the manual dashboard comparison
(2026-08-27), so it REPLACES checkpoint Task 15.**

Today nothing verifies `costForUsage`. The plan's original answer was a human running one paid
session and eyeballing the OpenRouter dashboard — a one-off, on one model, needing Destin's
account. OpenRouter will instead report its own authoritative cost per request, which lets the
app check its own arithmetic continuously.

Scouted 2026-08-27; every file and line below was verified then, but **re-verify before
editing** — line numbers in this plan have been stale in every task this session.

- Ask side: `src/main/providers/provider-registry.ts` — the OpenRouter branch calls
  `createOpenAICompatible({ name:'openrouter', baseURL, apiKey, headers, includeUsage:true })`.
  `includeUsage` is NOT the same thing: the SDK turns it into OpenAI's
  `stream_options:{include_usage:true}` (token counts only). OpenRouter's `cost` needs
  `usage:{include:true}` in the BODY. Add a `transformRequestBody` — the identical hook already
  exists ~12 lines above in the same file for `parallel_tool_calls`/`return_progress`, with
  tests in `tests/provider-registry.test.ts`.
- Read side: add a `metadataExtractor` to the same `createOpenAICompatible` call pulling
  `usage.cost` / `usage.cost_details`; its `buildMetadata()` surfaces as
  `result.providerMetadata`, a sibling promise of `result.usage` — awaitable one line below the
  existing `const usage = await result.usage` in `harness-session.ts`'s `runStreamOnce`.
- Thread it beside the tokens through `StepUsage`, the turn accumulator, and the
  `turn-complete` emit, where it lands next to the `costUsd` we compute.

**Three things that will bite, all named by the scout:**
1. **It is OpenRouter-shaped only.** The field must be optional everywhere, and **absent must
   never read as zero** — this codebase is emphatic about that (`pricing.ts`, `session-totals.ts`).
2. **Step vs turn.** Provider metadata arrives per request; `costForUsage` prices a whole turn
   of N steps. Accumulate on both sides or you will silently compare a step to a turn.
3. **No test scaffolding at the raw-HTTP layer.** Every existing stub returns SDK-level
   `doStream` parts, which sit ABOVE where a raw `cost` field lives, so they cannot express one.
   A fixture needs a `fetch` stub.

- [ ] **1.** Ask for the cost. **2.** Read it. **3.** Thread it beside `costUsd`.
- [ ] **4.** Assert agreement where it cannot mislead a user: a test over a recorded response,
  plus a dev-only log when `|provider − ours| / provider` exceeds a threshold. **No UI.** A
  disagreement is a bug for us, not a message for the user.
- [ ] **5.** Report the measured agreement. That number — observed, never estimated — replaces
  `'Not exact — a few models charge more above very large prompts.'` in the chip tooltip.
- [ ] **6.** `estimate.ts`'s `MEASURED_ROSTER_SPEND_USD = 3.46` is a hand-copied biller number
  whose own comment admits "the direction of the error is UNMEASURED". Say in your report
  whether this work retires it.
- [ ] **7:** `bash scripts/verify.sh worktrees/statusbar-relevance`
- [ ] **8: Commit** — `feat(harness): check our cost figure against the provider's own`

---

### Task 28: Three residues from the Task 24/25 review

- [ ] **1.** `tests/native-session-host.test.ts` — a comment claims "deleting it left 151 tests
  green". The reviewer could not reproduce 151 at any scope (full suite 5,906; related 787; the
  file itself 140). It understates the danger rather than overstating it, so it is not a lie —
  but it is uncheckable, in a commit about comment honesty. Replace with the reproducible fact:
  with that line deleted the entire suite stays green except this one test.
- [ ] **2.** `docs/active/specs/2026-08-25-status-bar-session-relevance-design.md` ~145 still
  says "no **published** price"; the shipped copy now says "available". One word.
- [ ] **3.** The third `missing` arm is still unpinned — mutating only
  `'neither session was still live'` leaves all 16 tests green. One probe that drops BOTH live
  entries after `runSpecialist` resolves closes it.
- [ ] **4:** `bash scripts/verify.sh worktrees/statusbar-relevance`
- [ ] **5: Commit** — `test(harness): pin the last missing-session arm; make a comment checkable`
