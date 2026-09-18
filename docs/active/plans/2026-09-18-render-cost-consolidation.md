---
date: 2026-09-18
status: draft
type: plan
topic: One consolidated build — stop drawing what nobody can see (Conversations-tab freeze + every list with the same shape), merge the duplicated pieces, and add the rules/guards that keep it that way
investigation: docs/active/investigations/2026-09-18-list-render-cost-sweep.md
roadmap: docs/roadmap/user-interface.md → "Sustained sluggishness in real use" (this is its next step, alongside smoothness-sweep Batch B)
---

# Render-cost consolidation — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to work this plan task by task. Steps use
> checkbox (`- [ ]`) syntax. **Read the investigation first** — every "why" and every cited
> line number comes from it.

**Goal:** Project View's Conversations tab (and every other list with the same shape) opens
without a freeze at any size, the app solves each shape ONE way, and a guard fails the build
when a new surface draws an unbounded list.

**Architecture:** Extract the Resume browser's proven pieces into shared hooks
(`useChunkedReveal`), make the tag registry one shared store, cache the expensive per-file
transcript read in main, then move each offending surface onto the matching existing
technique. Rules, a design-guide entry, a source-scanning guard, an ast-grep rule and a perf-lab
budget lock it in.

**Tech stack:** React 18 + TypeScript renderer (Electron + Android WebView), Electron main
(Node), vitest + jsdom + @testing-library/react, ast-grep, `scripts/perf-lab`.

## Revised 2026-09-18 after a code-checked review — read this first

A second session checked this plan against the code before any of it was built. Seven
things changed; each task below already carries its change, this list is the why.

1. **Task 5 would not have delivered its headline.** `FilesTab` reads the app-wide file
   state itself (`useArtifact()`, `FilesTab.tsx:234`; `ArtifactContext.tsx` is a plain
   React context holding the WHOLE state). `React.memo` cannot stop a context reader from
   re-rendering, so "lag whenever any session saves a file" would have survived. Task 5 now
   moves that read up to `ProjectView` (which already has it, `:169`) and passes down the
   one value FilesTab needs.
2. **The Task 13 text scanner is gone.** Its two patterns were run against today's unfixed
   tree: `FilesTab`, `MarketplaceScreen` and `ToolBody` already PASS (an unrelated
   `.slice(0,` / `MAX_` elsewhere in the file), and `SessionDrawer`, `CsvView`,
   `SubagentTimeline` are never seen (their lists are not named like "user data"). It
   caught 5 of 11 known offenders, and `.claude/rules/test-suite-hygiene.md` asks that a
   new source-text guard have a reason a behavioural test cannot express. Task 13 is now
   behavioural pins + a DOM-size sweep.
3. **Task 3 cached answers, not reads.** Projects open starts two scans at the same moment;
   both miss an empty cache and both read every transcript. The cache now holds the
   in-flight promise, and never keeps a failed read.
4. **Measurement per stage (D4)**, not once before and once after 15 tasks.
5. **Test isolation for the shared tag store is central** (`tests/setup-dom.ts`), not seven
   hand-picked files.
6. **`useChunkedReveal` gains `resetScrollOnActivate`** so un-hiding the Files tab does not
   send a searched list back to the top, and a test for a REPLACED sentinel (grid ↔ list).
   The callback-ref sentinel stays: a plain ref object would strand the list when the
   sentinel element is swapped while the count is unchanged.
7. **`SubagentTimeline`'s `content-visibility` stays** (Task 10): removing a working
   speed-up inside a speed plan, unmeasured, is a regression risk. Out of scope below.

Checked and fine, so nobody re-checks: `tags:changed` is pushed on desktop
(`preload.ts:645`) and remote (`remote-server.ts:2201-2223`, `remote-shim.ts:994`); Android
answers `tags:create/update/delete` with `unsupported` (`SessionService.kt:1674`), so the
registry cannot go stale there. Neither `ModelPicker` nor `MarketplaceScreen` has
arrow-key row navigation, so a reveal window strands no keyboard user. `CsvView` has no
edit/save path, so a column cap cannot lose data. G-23…G-28 exist; G-29/G-30 are free.

## What Destin sees when this lands

| Surface | Before | After |
|---|---|---|
| Projects → Conversations tab | Freeze on every click; tags pop in | Opens at once; more cards appear as you scroll; tags there from the start |
| Anywhere in Projects | Lag whenever any session saves a file | Gone (Task 5 — needs the context read moved, not just memo) |
| Opening Projects / Resume / buddy list | Re-reads every transcript, twice at once on Projects | First open after launch reads each transcript once; after that only changed ones |
| Conversation preview, buddy chat | Slower the further back you scroll | Stays flat, like the main chat |
| Collapsed file-change / file-read boxes | Every line drawn, scroll inside the box | **Decision D1 below** |
| Marketplace, model search | Whole list drawn | 50 at a time as you scroll |
| Very wide CSV | Every column | Capped at 100 columns like Excel files, with the existing "showing N" note |
| Game chat | Grows forever | Last 200 messages |

Side effects that are expected and must be named in the review deck: the scrollbar on a long
list is sized to what has been drawn so far (the Resume browser already does this); Ctrl+F
cannot find a card not yet drawn (no surface touched here has an in-page find); on a phone
(below 640px) the next 50 Conversations cards arrive when the end of the list is reached,
not 400px early, so the end of the list can be seen for a moment (Task 4 says why).

## Decisions

- **D0 (Destin, 2026-09-18):** one consolidated build worked through in one session track, not
  separate projects. Commits stay one-per-task so any regression is traceable.
- **D1 — OWED, collapsed diff/read boxes.** Recommended: collapsed shows the first 15 lines
  as a real slice, Expand shows the rest (matches `CollapsibleBlock`, ToolBody.tsx:67-72).
  Alternative: keep scroll-inside and reveal 50 at a time inside the box. **Task 11 does not
  start until Destin answers.**
- **D2 — technical (Claude):** chunked reveal, not virtualization (rejected 2026-07-31:
  variable-height rows). Entry folding for timelines. No new `content-visibility: auto` on
  anything that can carry a theme glow (retired 2026-04-10).
- **D3 — route.** This is mostly invisible performance work, so the feature-flow questions deck,
  UX tester and contract are proposed to be SKIPPED; the Before/After review deck (Task 15) is
  the first thing Destin sees. **Ask Destin to confirm the skip before Task 1** (CLAUDE.md →
  "Small changes … Ask him before skipping").
- **D4 — measure per stage (review, 2026-09-18).** The investigation names four stacked
  causes and measured none. Re-run the Task 0 perf-lab command after **Task 3**, **Task 4**
  and **Task 5** (labels `render-cost-t3`, `-t4`, `-t5`) and add each row to the
  investigation's §1 table. The deck shows what each fix bought. Tasks 8 and 9 stay in
  (Destin asked for every list to be handled the same way) but their DOM-node before/after
  from Task 13's sweep goes in the deck beside the scrollbar side effect, so the trade is
  visible. A stage that makes a judged metric WORSE stops the track until explained.

## Global constraints

- Worktree: `/home/destin/youcoded-dev/worktrees/sessions/convo-tab-lag` (workspace docs) and
  its `youcoded/` (app, branch `session/convo-tab-lag`). Never edit shared checkouts. Never touch
  the live app; runtime checks use `bash scripts/run-dev.sh --label "Render cost"` or the workbench.
- Every non-trivial edit carries a **WHY** comment (Destin follows changes through them).
- Read before the first edit: `.claude/rules/react-renderer.md`, `docs/PITFALLS.md`,
  `youcoded/docs/renderer-chrome.md`, and for main-side Task 3 the session-browser section of
  `docs/MAP.md`. For ast-grep, `docs/code-intelligence.md` (updated 2026-09-18 with traps).
- Chunk size is **50** (`REVEAL_CHUNK`), sentinel `rootMargin: '400px 0px'` — the measured values.
- Desktop/Android parity: renderer changes run in both; Project View has no data on Android
  (`SessionService.kt:4107`), nothing to add there. No IPC shape changes in this plan.
- Tests: `cd youcoded/desktop && npx vitest run <file>`; before claiming any task done,
  `bash scripts/verify.sh /home/destin/youcoded-dev/worktrees/sessions/convo-tab-lag/youcoded`.
- Stage explicit paths. Push after every commit (`git push`), per Destin's global rule.
- A failing or flaky test found along the way is fixed then, not filed.

## File map

| File | Responsibility | Task |
|---|---|---|
| `desktop/src/renderer/hooks/use-chunked-reveal.ts` (new) | The one reveal window: count, reset key, sentinel, observer, fallback | 1 |
| `desktop/src/renderer/hooks/use-chunked-reveal.test.tsx` (new) | Its contract | 1 |
| `desktop/tests/helpers/firing-intersection-observer.ts` (new) | A test observer that can be told to fire | 1 |
| `desktop/src/renderer/components/ResumeBrowser.tsx` | Moves onto the hook, behaviour unchanged | 1 |
| `desktop/src/renderer/hooks/useTagRegistry.ts` | Becomes a view of one module-level store | 2 |
| `desktop/src/main/session-browser.ts` | Per-file transcript-meta cache | 3 |
| `desktop/src/renderer/components/project-view/tabs/ConversationsTab.tsx` | Reveal + memo row | 4 |
| `desktop/src/renderer/components/SessionCardDetails.tsx` | Shared card surface class + title line | 4 |
| `desktop/src/renderer/components/project-view/ProjectView.tsx` | Stable FilesTab props; owns the file-state read; keyed Conversations tab | 4, 5 |
| `desktop/src/renderer/components/project-view/tabs/FilesTab.tsx` | `React.memo`; NO `useArtifact()` of its own; reveal on flat results | 5 |
| `scripts/ast-grep/rules/filestab-memoized.yml`, `filestab-no-artifact-context.yml` (+ fixtures) | FilesTab stays memoised and off the app-wide file state | 5 |
| `desktop/tests/setup-dom.ts` | Forgets the shared tag registry after every test | 2 |
| `desktop/src/renderer/components/PreviewTimeline.tsx`, `SessionPreviewPane.tsx` | Entry folding | 6 |
| `desktop/src/renderer/components/buddy/BubbleFeed.tsx` | Entry folding | 7 |
| `desktop/src/renderer/components/marketplace/MarketplaceScreen.tsx`, `MarketplaceCard.tsx` | Reveal + memo card | 8 |
| `desktop/src/renderer/components/model/ModelPicker.tsx` | Reveal while searching | 9 |
| `artifact-views/CsvView.tsx`, `game-reducer.ts`, `SubagentTimeline.tsx` (memo row only), `CommandDrawer`'s `SkillCard.tsx` | Small bounded fixes + memo consistency | 10 |
| `diff/UnifiedDiff.tsx`, `tool-views/ToolBody.tsx` (ReadView) | Collapsed = real slice (D1) | 11 |
| `SessionDrawer.tsx` | Memo rows via ref handlers | 12 |
| `scripts/ui-review/dom-size-sweep.mjs` (new) + the per-surface stress pins | The guard: behaviour, not source text | 13 |
| `.claude/rules/react-renderer.md`, `youcoded/docs/renderer-chrome.md`, design guide, `code-reviewer.md`, `ux-tester.md`, `scripts/perf-lab/compare.mjs` budget | Guidance + enforcement | 14 |
| `docs/active/design/2026-09-18-render-cost/` (new) | Before/After review deck | 15 |

---

### Task 0: Baseline numbers (no code)

- [ ] **Step 1:** Confirm D3 with Destin (skip questions deck/UX tester/contract).
- [ ] **Step 2:** `bash scripts/perf-lab/bg-run.sh --only projects --label render-cost-before --dry-run`, then without `--dry-run`. Record `conversations.ms`, `thrash.toConversations.medianMs/maxMs` from the `perf-reports/*.md` it prints.
  The fixture already seeds a 700-conversation project (`scenario-projects.mjs:192`), so these numbers move with Tasks 3–5; per D4 the same command is re-run after each of them.
- [ ] **Step 2b: make the workbench's big sample reach these screens.** Today the `stress` scenario only enlarges the Resume list and permissions (`dev/workbench/scenarios.ts:261` → `past`, `permissions`); `?stressRows=` does nothing for Project View, Marketplace or the model list. Read `conversationsIn()` (`dev/workbench/mock-shim.ts:~1909`), `fixtures/marketplace/catalog.ts` and the `catalog` store field, and in the `stress` scenario make each honour `stressRowCount()` (conversations for the first project, marketplace entries, catalog models) — generated rows, same shape as the existing fixtures, WHY comment naming this plan. Then `node scripts/workbench-boot-check.mjs` against a serving workbench (required after any mock-shim change). Commit `test(workbench): stress scenario fills Project View, Marketplace and the model list`, push. Without this, Step 3's "before" shots and Task 13's sweep show small lists and prove nothing.
- [ ] **Step 2c: write the DOM-size sweep and record "before".** Create `scripts/ui-review/dom-size-sweep.mjs`. Read `scripts/ui-review/README.md` and one file under `scripts/ui-review/scenes/` first and REUSE how the review sweep opens a surface (`cdp-helpers.mjs`, the scene definitions) — do not hand-roll click paths. For each of: Resume browser, Projects → Conversations, Projects → Files with a one-letter search, Marketplace, model picker with "a" typed, a conversation preview, the side drawer — open it in `?mode=workbench&scenario=stress&stressRows=2000` and read the node count INSIDE the app frame: `document.querySelector('iframe').contentDocument.querySelectorAll('*').length` (the workbench frames the app — `scripts/ui-probe.mjs` header, 2026-09-10 trap). Print a table `surface · nodes · budget · PASS/FAIL`; exit 1 on any FAIL; a surface that could not be PROVEN open is FAIL, never skipped (same stance as `coverage.md`). `const NODE_BUDGET = 8000; // WHY: the Resume browser at 1,642 rows is 1,585 nodes bounded and 37,920 unbounded (f8ca631b) — 8,000 sits far above any bounded screen plus app chrome and far below any unbounded one`. Run it now: it MUST fail on Conversations, Marketplace and model search — that red run is what proves the guard works. Save the table into the investigation doc beside the Step 2 numbers. If a known-unbounded surface PASSES, Step 2b did not reach it — fix the sample, not the budget.
- [ ] **Step 3:** Workbench before-shots for the deck: `bash scripts/run-workbench.sh /home/destin/youcoded-dev/worktrees/sessions/convo-tab-lag/youcoded`, open `?mode=workbench&scenario=stress&stressRows=1000`, capture Project View → Conversations, a collapsed long diff, Marketplace, per `scripts/ui-review/README.md`. Save under `docs/active/design/2026-09-18-render-cost/images/`.
- [ ] **Step 4:** Paste the numbers into the investigation doc §1 (replacing "nothing measured yet"), commit the doc + images, push.

---

### Task 1: `useChunkedReveal` — one reveal window for every list

**Files:**
- Create: `desktop/src/renderer/hooks/use-chunked-reveal.ts`
- Create: `desktop/src/renderer/hooks/use-chunked-reveal.test.tsx`
- Create: `desktop/tests/helpers/firing-intersection-observer.ts`
- Modify: `desktop/src/renderer/components/ResumeBrowser.tsx:155-176, 784-845, 1746`

**Interfaces — Produces:**
```ts
export const REVEAL_CHUNK = 50;
export interface ChunkedReveal<T> {
  visible: readonly T[];                       // items.slice(0, count)
  hasMore: boolean;
  /** Callback ref for the 1px sentinel rendered after the last visible item. */
  sentinelRef: (el: HTMLElement | null) => void;
}
export function useChunkedReveal<T>(
  items: readonly T[],
  opts: {
    /** Serialized query VALUES. A change resets to one chunk and scrolls root to top. */
    resetKey: string;
    /** The scroll container. null → viewport. */
    rootRef: React.RefObject<HTMLElement | null>;
    /** false parks the observer (closed panel, hidden tab). Default true. */
    active?: boolean;
    /** Scroll root to top when `active` flips true. Default true (a reopened panel
     *  starts at the top — the Resume browser). false for a tab that is hidden and
     *  shown again with the same query (Files tab): coming back must not move it. */
    resetScrollOnActivate?: boolean;
    chunk?: number;
  },
): ChunkedReveal<T>;
```
Test helper: `installFiringIntersectionObserver(): { fireAll(): void; restore(): void }`.

- [ ] **Step 1: Test helper**

```ts
// desktop/tests/helpers/firing-intersection-observer.ts
// WHY: the no-op IntersectionObserver stubs in several tests (e.g.
// files-tab-list-view.test.tsx:53) never fire, and useChunkedReveal's jsdom
// fallback only triggers when the global is ABSENT — so a list under a no-op
// stub would sit at one chunk and a test would pass while the list is stranded.
// This stub records every observed element and fires on demand.
type Cb = (entries: Array<{ isIntersecting: boolean; target: Element }>) => void;
export function installFiringIntersectionObserver() {
  const prev = (globalThis as any).IntersectionObserver;
  const live = new Set<{ cb: Cb; els: Set<Element> }>();
  (globalThis as any).IntersectionObserver = class {
    private rec: { cb: Cb; els: Set<Element> };
    constructor(cb: Cb) { this.rec = { cb, els: new Set() }; live.add(this.rec); }
    observe(el: Element) { this.rec.els.add(el); }
    unobserve(el: Element) { this.rec.els.delete(el); }
    disconnect() { live.delete(this.rec); }
    takeRecords() { return []; }
  };
  return {
    fireAll() {
      // WHY isConnected: a real observer never reports an element that has left
      // the page. Without this filter a hook still watching a REPLACED sentinel
      // (grid ↔ list view) would be fired anyway and the stranded-list bug would
      // pass its own test.
      for (const r of [...live]) {
        const entries = [...r.els].filter((el) => el.isConnected).map((target) => ({ isIntersecting: true, target }));
        if (entries.length) r.cb(entries);
      }
    },
    restore() { (globalThis as any).IntersectionObserver = prev; },
  };
}
```

- [ ] **Step 2: Failing tests**

```tsx
// desktop/src/renderer/hooks/use-chunked-reveal.test.tsx
import React, { useRef } from 'react';
import { render, act } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { useChunkedReveal, REVEAL_CHUNK } from './use-chunked-reveal';
import { installFiringIntersectionObserver } from '../../../tests/helpers/firing-intersection-observer';

function List({ n, q, active = true, alt = false, keepScroll = false }: { n: number; q: string; active?: boolean; alt?: boolean; keepScroll?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const items = Array.from({ length: n }, (_, i) => i);
  const r = useChunkedReveal(items, { resetKey: q, rootRef: root, active, resetScrollOnActivate: !keepScroll });
  return (
    <div ref={root} data-testid="root">
      {r.visible.map((i) => <div key={i} data-row />)}
      {/* alt swaps the sentinel ELEMENT (what grid ↔ list view does in FilesTab). */}
      {r.hasMore && (alt
        ? <span key="alt" ref={r.sentinelRef} data-sentinel />
        : <div key="main" ref={r.sentinelRef} data-sentinel />)}
    </div>
  );
}
const rows = (c: HTMLElement) => c.querySelectorAll('[data-row]').length;

describe('useChunkedReveal', () => {
  let io: ReturnType<typeof installFiringIntersectionObserver>;
  afterEach(() => io?.restore());

  it('draws one chunk of a long list', () => {
    io = installFiringIntersectionObserver();
    const { container } = render(<List n={2000} q="" />);
    expect(rows(container)).toBe(REVEAL_CHUNK);
  });

  it('adds a chunk each time the sentinel is reached', () => {
    io = installFiringIntersectionObserver();
    const { container } = render(<List n={2000} q="" />);
    act(() => io.fireAll());
    expect(rows(container)).toBe(REVEAL_CHUNK * 2);
  });

  it('draws a short list whole, with no sentinel', () => {
    io = installFiringIntersectionObserver();
    const { container } = render(<List n={12} q="" />);
    expect(rows(container)).toBe(12);
    expect(container.querySelector('[data-sentinel]')).toBeNull();
  });

  it('resets to one chunk on a new query, in the same render', () => {
    io = installFiringIntersectionObserver();
    const { container, rerender } = render(<List n={2000} q="a" />);
    act(() => io.fireAll()); act(() => io.fireAll());
    expect(rows(container)).toBe(REVEAL_CHUNK * 3);
    rerender(<List n={2000} q="b" />);
    expect(rows(container)).toBe(REVEAL_CHUNK);
  });

  it('keeps the window when only the items change (tagging a row must not collapse the list)', () => {
    io = installFiringIntersectionObserver();
    const { container, rerender } = render(<List n={2000} q="a" />);
    act(() => io.fireAll());
    rerender(<List n={2001} q="a" />);
    expect(rows(container)).toBe(REVEAL_CHUNK * 2);
  });

  it('does not grow while inactive', () => {
    io = installFiringIntersectionObserver();
    const { container } = render(<List n={2000} q="" active={false} />);
    act(() => io.fireAll());
    expect(rows(container)).toBe(REVEAL_CHUNK);
  });

  it('keeps growing after the sentinel element is replaced (count unchanged)', () => {
    io = installFiringIntersectionObserver();
    const { container, rerender } = render(<List n={2000} q="" />);
    rerender(<List n={2000} q="" alt />);
    act(() => io.fireAll());
    expect(rows(container)).toBe(REVEAL_CHUNK * 2);
  });

  it('scrolls to the top on a new query, and on re-activation only when asked to', () => {
    io = installFiringIntersectionObserver();
    const { getByTestId, rerender } = render(<List n={2000} q="a" keepScroll />);
    const root = getByTestId('root');
    root.scrollTop = 120;
    rerender(<List n={2000} q="a" keepScroll active={false} />);
    rerender(<List n={2000} q="a" keepScroll />);
    expect(root.scrollTop).toBe(120);            // hidden and shown again: untouched
    rerender(<List n={2000} q="b" keepScroll />);
    expect(root.scrollTop).toBe(0);              // a new query always starts at the top
    root.scrollTop = 120;
    rerender(<List n={2000} q="b" active={false} />);
    rerender(<List n={2000} q="b" />);
    expect(root.scrollTop).toBe(0);              // default: a reopened panel starts at the top
  });

  it('reveals everything when IntersectionObserver does not exist', () => {
    const prev = (globalThis as any).IntersectionObserver;
    delete (globalThis as any).IntersectionObserver;
    try {
      const { container } = render(<List n={300} q="" />);
      expect(rows(container)).toBe(300);
    } finally { (globalThis as any).IntersectionObserver = prev; }
  });
});
```

- [ ] **Step 3:** `cd youcoded/desktop && npx vitest run src/renderer/hooks/use-chunked-reveal.test.tsx` → FAIL (module not found).

- [ ] **Step 4: Implement** — the logic is ResumeBrowser.tsx:784-844 moved, with its WHY comments carried over verbatim where they apply.

```ts
// desktop/src/renderer/hooks/use-chunked-reveal.ts
// The ONE way a long list of cards/rows is drawn: a window of CHUNK items that
// grows as the user scrolls toward its end. Extracted from ResumeBrowser.tsx
// (f8ca631b, 2026-07-31) where it took opening 1,642 conversations from 804 ms
// to 96 ms and DOM from 37,920 to 1,585 nodes, flat at 4,000 rows.
//
// Deliberately NOT virtualization: rows here are variable-height, grow when
// opened, and sit in containers whose scroll-fade reads real content height
// (docs/archive/handoffs/2026-07-31-resume-browser-load-time-handoff.md).
// Timelines use hooks/use-entry-folding.ts instead; collapsed previews slice.
import { useCallback, useEffect, useRef, useState } from 'react';

export const REVEAL_CHUNK = 50;

export interface ChunkedReveal<T> {
  visible: readonly T[];
  hasMore: boolean;
  sentinelRef: (el: HTMLElement | null) => void;
}

export function useChunkedReveal<T>(
  items: readonly T[],
  { resetKey, rootRef, active = true, resetScrollOnActivate = true, chunk = REVEAL_CHUNK }: {
    resetKey: string;
    rootRef: React.RefObject<HTMLElement | null>;
    active?: boolean;
    resetScrollOnActivate?: boolean;
    chunk?: number;
  },
): ChunkedReveal<T> {
  const [count, setCount] = useState(chunk);

  // Reset keyed on the query VALUES, deliberately not on `items`' identity:
  // items also change when a row mutates (tag, complete, rename), and resetting
  // then would collapse the list under a user who scrolled down to organise it.
  // Adjusted DURING render (React's documented pattern), not in an effect — an
  // effect would commit one render at the OLD, large count first.
  const [lastKey, setLastKey] = useState(resetKey);
  if (resetKey !== lastKey) {
    setLastKey(resetKey);
    setCount(chunk);
  }

  // A new query starts at the top. Load-bearing: resetting the count while the
  // container stays scrolled deep leaves the sentinel in view, and the observer
  // cascades straight back (measured: 250 rows re-revealed instead of 50).
  //
  // Two triggers, kept apart: a NEW QUERY always scrolls to the top; becoming
  // ACTIVE again does so only when the host wants it (the Resume browser reopens
  // at the top; the Files tab, hidden and shown with the same search, must not
  // jump). A query that changed while inactive is caught on activation because
  // scrolledKey is only advanced while active.
  const wasActive = useRef(false);
  const scrolledKey = useRef<string | null>(null);
  useEffect(() => {
    if (!active) { wasActive.current = false; return; }
    const activated = !wasActive.current;
    wasActive.current = true;
    const keyChanged = scrolledKey.current !== resetKey;
    scrolledKey.current = resetKey;
    if (!keyChanged && !(activated && resetScrollOnActivate)) return;
    const el = rootRef.current;
    if (el) el.scrollTop = 0;
  }, [resetKey, active, rootRef, resetScrollOnActivate]);

  const hasMore = items.length > count;
  const visible = hasMore ? items.slice(0, count) : items;

  // The sentinel is held in STATE through a callback ref, not a ref object, on
  // purpose: a host that swaps the sentinel element without changing the count
  // (FilesTab grid ↔ list view) would leave a ref-object version observing the
  // detached element forever — no dep changes, so the effect never re-arms. The
  // cost is one extra host render when the sentinel mounts; rows are memoised.
  const [sentinel, setSentinel] = useState<HTMLElement | null>(null);
  const sentinelRef = useCallback((el: HTMLElement | null) => setSentinel(el), []);

  // Re-arming on every count change is what makes it cascade until the
  // sentinel is past the margin (short rows, tall window).
  useEffect(() => {
    if (!active || !hasMore) return;
    // No observer (jsdom, exotic WebView): draw everything rather than strand
    // the list at one chunk with no way to grow.
    if (typeof IntersectionObserver === 'undefined') { setCount(items.length); return; }
    if (!sentinel) return;
    const io = new IntersectionObserver(
      (entries) => { if (entries.some((e) => e.isIntersecting)) setCount((n) => n + chunk); },
      { root: rootRef.current, rootMargin: '400px 0px' },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [active, hasMore, count, items.length, sentinel, rootRef, chunk]);

  return { visible, hasMore, sentinelRef };
}
```

- [ ] **Step 5:** Run the test → PASS. All four imports (`useCallback, useEffect, useRef, useState`) are used.
- [ ] **Step 6: Move ResumeBrowser onto it.** Delete `REVEAL_CHUNK` (176) and lines 784-844 (`revealCount` state, `queryKey` reset, scroll-to-top effect, `visibleItems`, `sentinelRef`, observer effect). Keep the `queryKey` `useMemo` (it is the reset key). Replace with:

```ts
// WHY: the reveal window now lives in hooks/use-chunked-reveal.ts so every
// long list shares one implementation (render-cost consolidation 2026-09-18).
const { visible: visibleItems, hasMore, sentinelRef } =
  useChunkedReveal(items, { resetKey: queryKey, rootRef: listRef, active: open });
```
Import `useChunkedReveal` and `REVEAL_CHUNK` from `../hooks/use-chunked-reveal`; keep the long explanatory comment block at 155-175 but point it at the hook and fix its dangling "see the 2026-07-31 handoff" to the full path. The sentinel JSX at 1746 is unchanged (`ref={sentinelRef}` accepts a callback ref).
- [ ] **Step 7:** `npx vitest run tests/resume-browser-*.test.tsx src/renderer/hooks/use-chunked-reveal.test.tsx` → all PASS.
- [ ] **Step 8:** Commit `feat(renderer): extract useChunkedReveal from the Resume browser` (paths: the 4 files), push.

---

### Task 2: One shared tag registry

**Files:** Modify `desktop/src/renderer/hooks/useTagRegistry.ts`; Test `desktop/src/renderer/hooks/useTagRegistry.shared.test.tsx` (new). Check and fix: `tests/remote-reconnect-reloads.test.tsx`, `tests/tag-list-honest.test.tsx`, `tests/tag-picker-unreadable.test.tsx`, `tests/chatsearch-cards.test.tsx`, `tests/chatsearch-tool-wiring.test.tsx`, `tests/session-drawer-session-scoped-labels.test.tsx`, `tests/artifacts/html-viewer-stale-content.test.tsx`.

**Interfaces — Produces:** `useTagRegistry(): TagRegistryApi` (unchanged shape) + `export function __resetTagRegistryForTests(): void`.

Why: 8 consumers each fetch and each add a `tagsChanged` listener; the late answer re-renders whole lists (ConversationsTab ×838). The app's precedent for shared renderer state is `useSyncExternalStore` (`hooks/useSpecialists.ts`, `hooks/useSecondsTick.ts`).

- [ ] **Step 1: Failing test**

```tsx
// desktop/src/renderer/hooks/useTagRegistry.shared.test.tsx
import React from 'react';
import { render, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useTagRegistry, __resetTagRegistryForTests } from './useTagRegistry';

function Probe({ id }: { id: string }) { const r = useTagRegistry(); return <i data-id={id}>{r.tags.length}</i>; }

describe('useTagRegistry is one shared store', () => {
  beforeEach(() => { __resetTagRegistryForTests(); });

  it('three consumers cause ONE tags.list read', async () => {
    const list = vi.fn().mockResolvedValue([{ id: 't1', label: 'A', color: 'blue' }]);
    (window as any).claude = { tags: { list }, on: {} };
    render(<><Probe id="a" /><Probe id="b" /><Probe id="c" /></>);
    await act(async () => {});
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('a consumer mounted after the load renders the tags on its FIRST render', async () => {
    (window as any).claude = { tags: { list: vi.fn().mockResolvedValue([{ id: 't1', label: 'A', color: 'blue' }]) }, on: {} };
    render(<Probe id="a" />);
    await act(async () => {});
    const seen: number[] = [];
    function Late() { const r = useTagRegistry(); seen.push(r.tags.length); return null; }
    render(<Late />);
    expect(seen[0]).toBe(1);
  });

  it('a tags:changed push re-reads once, however many consumers', async () => {
    let push: () => void = () => {};
    const list = vi.fn().mockResolvedValue([]);
    (window as any).claude = { tags: { list }, on: { tagsChanged: (cb: () => void) => { push = cb; return () => {}; } } };
    render(<><Probe id="a" /><Probe id="b" /></>);
    await act(async () => {});
    await act(async () => { push(); });
    expect(list).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2:** Run → FAIL (`__resetTagRegistryForTests` not exported; list called 3×).
- [ ] **Step 3: Implement.** Replace the body of `useTagRegistry.ts` below the `TagRegistryApi` interface with a module store. Keep the existing WHY comments about optional chaining and "a failed re-read keeps what is on screen" on `load()`.

```ts
// WHY one module-level store (render-cost consolidation 2026-09-18): every
// consumer used to run its own tags.list() on mount and add its own tagsChanged
// listener. A list that mounted one (ConversationsTab) drew all its rows, then
// drew them ALL again when the late answer arrived — and tags visibly popped in.
// Now the first subscriber loads, later ones render the loaded tags on their
// first render, and one push means one re-read.
interface Snap { tags: TagRecord[]; byId: Map<string, TagRecord>; loading: boolean; error: string | null }
let snap: Snap = { tags: [], byId: new Map(), loading: true, error: null };
const subs = new Set<() => void>();
let started = false;
let offPush: (() => void) | null = null;

function publish(next: Partial<Snap>) {
  const tags = next.tags ?? snap.tags;
  snap = { ...snap, ...next, byId: next.tags ? new Map(tags.map((t) => [t.id, t])) : snap.byId };
  for (const s of subs) s();
}

function load() {
  Promise.resolve((window as any).claude?.tags?.list?.() ?? [])
    .then((list: unknown) => {
      if (Array.isArray(list)) { publish({ tags: list as TagRecord[], error: null, loading: false }); return; }
      const reason = (list as { error?: unknown } | null | undefined)?.error;
      publish({ error: typeof reason === 'string' && reason ? reason : 'the answer could not be read', loading: false });
    })
    .catch((e: unknown) => publish({ error: plainMessage(e), loading: false }));
}

function subscribe(cb: () => void) {
  subs.add(cb);
  if (!started) {
    started = true;
    load();
    const off = (window as any).claude?.on?.tagsChanged?.(() => load());
    // One reconnect listener for the store, not one per consumer (was
    // useOnRemoteReconnect in each hook instance — same WHY as that hook).
    window.addEventListener(REMOTE_RECONNECTED_EVENT, load);
    offPush = () => {
      if (typeof off === 'function') off();
      window.removeEventListener(REMOTE_RECONNECTED_EVENT, load);
    };
  }
  return () => { subs.delete(cb); };
}

/** Test-only: forget the loaded registry so each test starts cold. */
export function __resetTagRegistryForTests() {
  offPush?.(); offPush = null; started = false; subs.clear();
  snap = { tags: [], byId: new Map(), loading: true, error: null };
}

export function useTagRegistry(): TagRegistryApi {
  const s = useSyncExternalStore(subscribe, () => snap);
  const create = useCallback(async (label: string, color: TagColor) => {
    const res: any = await (window as any).claude.tags.create(label, color);
    load();
    return res?.ok ? (res.tag as TagRecord) : null;
  }, []);
  const update = useCallback(async (id: string, patch: { label?: string; color?: TagColor; archived?: boolean }) => {
    await (window as any).claude.tags.update(id, patch); load();
  }, []);
  const remove = useCallback(async (id: string) => {
    await (window as any).claude.tags.delete(id); load();
  }, []);
  return useMemo(() => ({ ...s, reload: load, create, update, remove }), [s, create, update, remove]);
}
```
Update imports: `useCallback, useMemo, useSyncExternalStore` from react; `REMOTE_RECONNECTED_EVENT` from `../remote-events`; drop the `useOnRemoteReconnect` import. The listeners are intentionally never removed while the app runs (the registry lives as long as the renderer) — say so in a comment.
- [ ] **Step 4:** Run the new test → PASS.
- [ ] **Step 5: reset centrally, not per file.** The store is module state, so within one test file a registry loaded by test A is still there for test B. In `desktop/tests/setup-dom.ts`, import `__resetTagRegistryForTests` from `../src/renderer/hooks/useTagRegistry` and call it inside the existing `afterEach` (after the unmount), with WHY: "a forgotten per-file reset leaks one test's tags into the next, and the failure names neither; one line here cannot be forgotten (render-cost consolidation 2026-09-18)". The import has no filesystem side effect (the `global-setup.ts` rule does not apply to it). Then run each file listed above, including `tests/remote-reconnect-reloads.test.tsx` → PASS; a file that swaps `window.claude.tags.list` MID-test additionally calls the reset at that point.
- [ ] **Step 6:** Remove the now-pointless hoisting note in `tool-views/chatsearch-tags.tsx:20` (it hoisted to avoid per-card fetches, which no longer happen) — keep `useTagLabelIndex` as a thin wrapper. Commit `perf(renderer): one shared tag registry instead of one per consumer`, push.

---

### Task 3: Main-side cache of per-transcript metadata

**Files:** Modify `desktop/src/main/session-browser.ts` (around `readSessionTranscriptMeta`, :299, and its call at ~:463); Test `desktop/tests/session-transcript-meta-cache.test.ts` (new).

Why: Project View open runs `listPastSessions()` twice (`project-conversations.ts:21`, `projects-index.ts:134`); Resume and buddy run it again. The expensive part per file is `readSessionTranscriptMeta` (64 KB tail read + JSON parse, +256 KB head read when untitled). Cache THAT, keyed on `(path, size, mtimeMs, wantTitle)` — a transcript that has not changed returns the same answer; topic, flags, tags, store overlay stay fresh because they are still read every call. No invalidation wiring needed.

**Produces:** `export async function readSessionTranscriptMetaCached(jsonlPath: string, stat: { size: number; mtimeMs: number }, wantTitle: boolean): Promise<SessionTranscriptMeta>` and `export function __clearTranscriptMetaCacheForTests(): void`.

- [ ] **Step 1: Failing test**

```ts
// desktop/tests/session-transcript-meta-cache.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { readSessionTranscriptMetaCached, __clearTranscriptMetaCacheForTests } from '../src/main/session-browser';

const line = (o: object) => JSON.stringify(o) + '\n';
function write(p: string, text: string) {
  fs.writeFileSync(p, line({ type: 'user', timestamp: '2026-09-18T00:00:00Z', message: { role: 'user', content: text } }) + 'x'.repeat(600));
}

describe('transcript meta cache', () => {
  let dir: string;
  beforeEach(() => { __clearTranscriptMetaCacheForTests(); dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmc-')); });

  it('returns the same object for an unchanged file without re-reading it', async () => {
    const p = path.join(dir, 'a.jsonl'); write(p, 'hello');
    const st = fs.statSync(p);
    const a = await readSessionTranscriptMetaCached(p, st, true);
    fs.chmodSync(p, 0o000); // a second READ would now fail and return nulls
    try {
      const b = await readSessionTranscriptMetaCached(p, st, true);
      expect(b).toBe(a);
    } finally { fs.chmodSync(p, 0o644); }
  });

  it('re-reads when size or mtime change', async () => {
    const p = path.join(dir, 'a.jsonl'); write(p, 'hello');
    const a = await readSessionTranscriptMetaCached(p, fs.statSync(p), true);
    write(p, 'a different and longer first message');
    const b = await readSessionTranscriptMetaCached(p, fs.statSync(p), true);
    expect(b).not.toBe(a);
  });

  it('two scans asking at the same moment share ONE read (Projects open starts two)', async () => {
    const p = path.join(dir, 'a.jsonl'); write(p, 'hello');
    const st = fs.statSync(p);
    const open = vi.spyOn(fs.promises, 'open');
    try {
      const [a, b] = await Promise.all([
        readSessionTranscriptMetaCached(p, st, true),
        readSessionTranscriptMetaCached(p, st, true),
      ]);
      expect(b).toBe(a);
      expect(open.mock.calls.filter((c) => c[0] === p).length).toBe(1);
    } finally { open.mockRestore(); }
  });

  it('does not remember a failed read', async () => {
    const p = path.join(dir, 'gone.jsonl');
    const st = { size: 900, mtimeMs: 1 };
    const a = await readSessionTranscriptMetaCached(p, st, true);   // file absent → all nulls
    expect(a.lastTimestampMs).toBeNull();
    write(p, 'now it exists');
    const b = await readSessionTranscriptMetaCached(p, st, true);   // SAME stat on purpose
    expect(b.lastTimestampMs).not.toBeNull();
  });
});
```
Add `vi` to the vitest import. (`chmod 000` is ineffective as root and a no-op on Windows, where CI also runs — guard that first test with `it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)`; the `open`-spy test above covers the same ground everywhere.) If `fs.promises.open` cannot be spied because `session-browser.ts` captured it at import, spy on the `fs` default export the module actually uses — read its import line first.
- [ ] **Step 2:** Run → FAIL (export missing).
- [ ] **Step 3: Implement** directly after `readSessionTranscriptMeta`:

```ts
// WHY (render-cost consolidation 2026-09-18): opening Projects ran the whole
// transcript scan twice (conversation list + hero counts) and Resume/buddy ran
// it again — each time a 64 KB tail read + parse per transcript. A transcript
// whose size and mtime are unchanged yields the same answer, so remember it.
// Only THIS read is cached: titles, flags, tags and the store overlay are
// still read fresh on every scan, so nothing here needs invalidating.
// Bounded by the number of transcripts on disk; entries for files a scan no
// longer sees are dropped by pruneTranscriptMetaCache.
//
// The entry holds the PROMISE, not the answer: Projects open starts two scans
// at the same moment (conversation list + hero counts), and with an
// answer-cache both would find it empty and both read every transcript — the
// exact double read this exists to remove. Sharing the in-flight promise makes
// the second scan wait for the first one's read.
// A failed read (all nulls — readSessionTranscriptMeta never throws) is NOT
// kept: a transient EBUSY/sync-restore race would otherwise pin "Untitled" and
// a wrong date on that conversation until the file next changed.
type MetaEntry = { size: number; mtimeMs: number; wantTitle: boolean; meta: Promise<SessionTranscriptMeta> };
const metaCache = new Map<string, MetaEntry>();

export function readSessionTranscriptMetaCached(
  jsonlPath: string, stat: { size: number; mtimeMs: number }, wantTitle: boolean,
): Promise<SessionTranscriptMeta> {
  const hit = metaCache.get(jsonlPath);
  // A title-less entry cannot answer a title request; the reverse is fine.
  if (hit && hit.size === stat.size && hit.mtimeMs === stat.mtimeMs && (hit.wantTitle || !wantTitle)) return hit.meta;
  const entry: MetaEntry = {
    size: stat.size, mtimeMs: stat.mtimeMs, wantTitle,
    meta: readSessionTranscriptMeta(jsonlPath, wantTitle),
  };
  metaCache.set(jsonlPath, entry);
  void entry.meta.then((m) => {
    const failed = m.fallbackTitle === null && m.lastTimestampMs === null && m.lastModelId === null;
    // Only drop OUR entry — a newer read may have replaced it meanwhile.
    if (failed && metaCache.get(jsonlPath) === entry) metaCache.delete(jsonlPath);
  });
  return entry.meta;
}

function pruneTranscriptMetaCache(seen: Set<string>) {
  for (const k of metaCache.keys()) if (!seen.has(k)) metaCache.delete(k);
}

export function __clearTranscriptMetaCacheForTests() { metaCache.clear(); }
```
In `listPastSessions`, create `const seenPaths = new Set<string>()` before the slug loop, replace the call at ~:463 with
`const full = path.join(slugDir, file); seenPaths.add(full); const meta = await readSessionTranscriptMetaCached(full, stat, topicName === 'Untitled');`
and call `pruneTranscriptMetaCache(seenPaths)` after the loop — **only when `projectsDir === PROJECTS_DIR`** (a test scan of a temp tree must not wipe production entries).
- [ ] **Step 4:** Run the new test, `tests/session-browser.test.ts`, `tests/subagent-exclusion.test.ts` → PASS.
- [ ] **Step 5:** Commit `perf(main): remember unchanged transcripts' metadata between scans`, push.
- [ ] **Step 6 (D4):** perf-lab run, label `render-cost-t3`; add the row to the investigation's §1 table (this stage should move `projects.median.open.openMs`, not the tab switch).

---

### Task 4: Conversations tab — one chunk, drawn once

**Files:** Modify `ConversationsTab.tsx`, `SessionCardDetails.tsx`, `ProjectView.tsx:952-954`; Test `desktop/tests/conversations-tab-bounded.test.tsx` (new).

**Consumes:** `useChunkedReveal` (Task 1), shared `useTagRegistry` (Task 2).
**Produces (SessionCardDetails.tsx):** `export const SESSION_CARD_SURFACE = 'rounded-lg border border-edge-dim bg-inset transition-colors hover:border-edge';` and `export function SessionCardTitle({ title }: { title: string })`.

- [ ] **Step 1: Failing test**

```tsx
// desktop/tests/conversations-tab-bounded.test.tsx
import React from 'react';
import { render, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConversationsTab } from '../src/renderer/components/project-view/tabs/ConversationsTab';
import { __resetTagRegistryForTests } from '../src/renderer/hooks/useTagRegistry';
import { installFiringIntersectionObserver } from './helpers/firing-intersection-observer';
import { REVEAL_CHUNK } from '../src/renderer/hooks/use-chunked-reveal';

const convs = Array.from({ length: 1000 }, (_, i) => ({
  sessionId: `s${i}`, name: `Conversation ${i}`, projectSlug: 'p', projectPath: '/p',
  lastModified: 1_700_000_000_000 - i, size: 1000,
})) as any[];

describe('ConversationsTab draws one chunk', () => {
  let io: ReturnType<typeof installFiringIntersectionObserver>;
  beforeEach(() => {
    // WHY: this tab branches on viewport (the reveal root), and jsdom has no
    // matchMedia — .claude/rules/narrow-viewport.md: a test of a viewport-branching
    // component DECLARES the viewport. Wide here; the narrow case is its own test.
    (window as any).matchMedia = (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
    __resetTagRegistryForTests();
    (window as any).claude = { tags: { list: vi.fn().mockResolvedValue([]) }, on: {} };
    io = installFiringIntersectionObserver();
  });
  afterEach(() => io.restore());

  it('renders REVEAL_CHUNK cards for 1,000 conversations, more on scroll', () => {
    const { container } = render(<ConversationsTab conversations={convs} onOpenPreview={() => {}} />);
    expect(container.querySelectorAll('button[title]').length).toBe(REVEAL_CHUNK);
    act(() => io.fireAll());
    expect(container.querySelectorAll('button[title]').length).toBe(REVEAL_CHUNK * 2);
  });

  it('does not re-render cards when the tag registry answers', async () => {
    const renders = vi.fn();
    const { container } = render(<ConversationsTab conversations={convs} onOpenPreview={() => {}} onRowRender={renders} />);
    const first = renders.mock.calls.length;
    await act(async () => {});
    // Empty registry → same byId identity is NOT guaranteed; the row memo keys on
    // the tags a row actually shows, so rows with no tags must not re-render.
    expect(renders.mock.calls.length).toBe(first);
    expect(container).toBeTruthy();
  });
});
```
(`onRowRender` is a test-only optional prop, documented as such, called from the row body; it is how the other render-count pins in this repo observe renders — see `tests/status-bar-memo.test.tsx`. If that file uses a different probe, mirror it instead.)
- [ ] **Step 2:** Run → FAIL (1,000 cards).
- [ ] **Step 3: Implement** — `SessionCardDetails.tsx`: add `SESSION_CARD_SURFACE` and `SessionCardTitle` (the `<span className="block py-1 text-sm-tight font-semibold text-fg truncate">`), with a WHY comment that the Resume browser and the Projects tab draw the same card and must not drift. Use `SESSION_CARD_SURFACE` in ResumeBrowser's card className in place of the literal classes it duplicates (keep its own padding/extra classes).

  `ConversationsTab.tsx`:
```tsx
// WHY (render-cost consolidation 2026-09-18): this tab drew every conversation
// on every visit — 838 cards for youcoded-dev — then drew them all again when
// the tag list arrived. It now draws REVEAL_CHUNK at a time (the Resume
// browser's measured approach) and each card only when something it shows changes.
const ConversationRow = React.memo(function ConversationRow({ session: c, tagsById, onOpenPreview, onRowRender }: {
  session: PastSession; tagsById: ReadonlyMap<string, TagRecord>;
  onOpenPreview: (s: PastSession) => void; onRowRender?: () => void;
}) {
  onRowRender?.();
  const title = c.name?.trim() ? c.name : 'Untitled';
  return (
    <button type="button" title={title} onClick={() => onOpenPreview(c)}
      className={`w-full text-left shrink-0 ${SESSION_CARD_SURFACE} px-3 pt-2 pb-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent`}>
      <SessionCardTitle title={title} />
      <SessionCardTags session={c} tagsById={tagsById} />
      <SessionCardMeta session={c} showProject={false} />
    </button>
  );
}, (a, b) => a.session === b.session && a.onOpenPreview === b.onOpenPreview
  // Only the tags THIS row shows matter; a registry change for other tags
  // must not redraw 50 cards.
  && (a.session.tags ?? []).every((id) => a.tagsById.get(id) === b.tagsById.get(id)));
```
  In `ConversationsTab`: `const scrollRef = useRef<HTMLDivElement>(null);` on the `overflow-auto` div; `const narrow = useNarrowViewport();` (below 640px the page `<main>` scrolls, so pass `rootRef` pointing at nothing → viewport: use `const noRoot = useRef<HTMLElement | null>(null)`); `const { visible, hasMore, sentinelRef } = useChunkedReveal(rows, { resetKey: '', rootRef: narrow ? noRoot : scrollRef });` map `visible` to `<ConversationRow key=… />`, then `{hasMore && <div ref={sentinelRef} aria-hidden className="h-px shrink-0" />}`.
  Narrow trade-off, state it in the WHY: with the viewport as root, `rootMargin` does not reach through `<main>`'s own scroll clip (`ProjectView.tsx:752`, `max-sm:overflow-y-auto`), so on a phone the next chunk arrives when the sentinel is actually visible rather than 400px early. It still always arrives. `<main>` carries no ref today; threading one down for a 400px head start on phones is not worth a new prop — revisit only if Destin notices it.
  Export the tab memoised — `export const ConversationsTab = React.memo(ConversationsTabImpl)` — because `ProjectView` re-renders on every file-state change (it reads `useArtifact()`), and its two props are already stable (`conversations` is state, `onOpenPreview` is the raw `setPreviewSession` setter).
  Add a third test, narrow: same render with `matchMedia` answering `matches: true` for `NARROW_VIEWPORT_QUERY` (import it from `hooks/use-narrow-viewport`); assert one chunk, `fireAll` → two. It pins that the narrow branch gets an observer at all.
  `ProjectView.tsx:953`: add `key={activeProject.id}` to `<ConversationsTab>` so a project switch starts a fresh window at the top (WHY comment).
- [ ] **Step 4:** Run the new test + `tests/project-view-*.test.*` → PASS.
- [ ] **Step 5:** Commit `perf(projects): Conversations tab draws 50 at a time and each card once`, push.
- [ ] **Step 6 (D4):** perf-lab run, label `render-cost-t4`; add the row (this is the stage that should move `conversations.ms` and `thrash.toConversations.*`).

---

### Task 5: The hidden Files tab stops redrawing

**Files:** Modify `FilesTab.tsx:181`, `ProjectView.tsx:950`; Create `scripts/ast-grep/rules/filestab-memoized.yml` + `scripts/ast-grep/fixtures/filestab-memoized.tsx`; bump `EXPECTED_VIOLATIONS` in `scripts/ast-grep/check.sh`; Test `desktop/tests/project-view-files-tab-stays-mounted.test.tsx` (extend).

**Why memo alone is not enough (review finding 1).** Two separate things redraw the hidden grid: (a) `ProjectView` re-rendering and handing FilesTab fresh inline closures — memo + stable props fixes that; (b) FilesTab's OWN `const { state, dispatch } = useArtifact()` (`FilesTab.tsx:234`). `ArtifactContext` is a plain `createContext` whose value is the whole `{ state, dispatch }` (`state/ArtifactContext.tsx`), so every file any session writes re-renders every reader, and `React.memo` does not stop a context reader. FilesTab uses exactly one value from it — `state.activeArtifactBySession[PV_SESSION]` (`:235`) — plus `dispatch`. `ArtifactDetail` (`:942`) reads `dispatch` the same way. Both reads move up to `ProjectView`, which already calls `useArtifact()` (`:169`).

- [ ] **Step 1: Failing test** — in `project-view-files-tab-stays-mounted.test.tsx`, add a case that renders ProjectView under a REAL `ArtifactProvider` whose `value` the test controls (a tiny wrapper holding `useReducer`/`useState`, exposing its setter), with a FilesTab render probe (mock `./tabs/FilesTab` the way the file already does, wrapping the REAL component in a counter placed INSIDE it — a counter around the memo boundary would not see a context-driven render). Two assertions: (i) click the Conversations tab → count unchanged after the click's first commit; (ii) change the provider value to a new `state` object whose `activeArtifactBySession['project-view']` is unchanged (what another session's file write looks like) → count unchanged. Run → FAIL on both. Per `.claude/rules/test-suite-hygiene.md` → "A guard you did not break…", after Step 2 passes, put `useArtifact()` back into FilesTab once, watch (ii) go red, restore, and paste that run in the commit body.
- [ ] **Step 2: Implement.** `FilesTab.tsx`: rename the function `FilesTabImpl`, export `export const FilesTab = React.memo(FilesTabImpl);` with WHY: "kept mounted while hidden for its watcher (09-09); without memo every Project View render — each tab click — redrew the whole hidden grid; and it must not read ArtifactContext itself, because memo cannot stop a context reader and that context changes on every file any session writes (render-cost consolidation 2026-09-18)". Delete both `useArtifact()` calls and the import (`:15, :234, :942`); add two props to FilesTab — `pvActiveId: string | null` and `artifactDispatch: React.Dispatch<ArtifactAction>` — and pass `artifactDispatch` on to `ArtifactDetail` as a prop. Export `PV_SESSION` from FilesTab (`:53`). `ProjectView.tsx`: replace the inline props at :950 with stable ones:
```ts
// WHY: FilesTab is memoised; inline closures here would defeat it on every render.
const onFilesMutated = useCallback(() => setCountsKey((k) => k + 1), []);
const onFilesClearSearch = useCallback(() => setArtifactSearch(''), []);
// WHY: ProjectView is the ONE reader of the app-wide file state for this screen.
// It re-renders on every file any session writes; FilesTab is handed only the
// single value it shows, so that render stops here instead of redrawing up to
// 2,000 hidden cards. `dispatch` from useReducer is stable.
const pvActiveId = state.activeArtifactBySession[PV_SESSION] ?? null;
```
  and pass `pvActiveId={pvActiveId} artifactDispatch={dispatch}`. `types`/`fileSort`/`fileView` are state (stable). Confirm `setCurrentRelDir`, `setFileView` are raw setters (stable). Any other test that renders `<FilesTab>` directly (`rg -l "<FilesTab" desktop/tests`) now passes the two props instead of wrapping in a provider.
- [ ] **Step 2b: ast-grep rule `filestab-no-artifact-context.yml`** (+ fixture `filestab-no-artifact-context.tsx` containing one `useArtifact()` call; bump `EXPECTED_VIOLATIONS` by 1 more): `files:` the same two globs as the rule in Step 4, `rule: { pattern: useArtifact() }`, message: "FilesTab stays mounted while hidden; reading ArtifactContext here re-renders the whole hidden grid on every file any session writes, and React.memo cannot stop it. Take the value as a prop from ProjectView." Children that only render while a file is OPEN may not read it either — they live in this file; pass props.
- [ ] **Step 3: Chunked reveal on flat results** (the 2,000-card case): in FilesTab's flat search/type-filter branch (~:745), `useChunkedReveal(flatResults, { resetKey: JSON.stringify([search.trim(), [...types].sort(), sortBy, view, project.id]), rootRef: <that branch's scroll div>, active: !hidden, resetScrollOnActivate: false })` (coming back to the Files tab with the same search must not move the list — the option exists for this call); sentinel is `<div ref={sentinelRef} className="col-span-full h-px" aria-hidden />` in grid view, a plain `h-px` div in list view. Give the two sentinels different `key`s (`"grid"` / `"list"`) so a view switch REPLACES the element — the case Task 1's replaced-sentinel test pins. Folder view is left whole (one folder's contents: tens of items; say so in a WHY comment). `tests/files-tab-list-view.test.tsx:53`: switch its no-op stub to `installFiringIntersectionObserver()`.
- [ ] **Step 4: ast-grep rule** (sibling of `filestab-mounted-with-hidden-prop.yml`):
```yaml
id: filestab-memoized
language: tsx
severity: error
message: >-
  FilesTab must be exported as React.memo(...). It stays mounted while hidden
  (filestab-mounted-with-hidden-prop), so without memo every Project View
  render redraws the whole hidden file grid — up to 2,000 cards per tab click
  (render-cost consolidation, 2026-09-18).
note: |
  Invariant source: tests/project-view-files-tab-stays-mounted.test.tsx
  ("hidden FilesTab does not re-render"). Fires when the file has no
  `export const FilesTab = React.memo(` / `memo(` declaration.
files:
  - "**/src/renderer/components/project-view/tabs/FilesTab.tsx"
  - "**/fixtures/filestab-memoized*.tsx"
rule:
  kind: program
  not:
    has:
      stopBy: end
      kind: lexical_declaration
      regex: "^export const FilesTab = (React\\.)?memo\\("
```
  Fixture `filestab-memoized.tsx`: `export function FilesTab() { return null; }` (1 violation). Bump `EXPECTED_VIOLATIONS` by 1 with a dated changelog line. Run `bash scripts/ast-grep/check.sh youcoded/desktop/src` → clean.
- [ ] **Step 5:** Tests + ast-grep PASS. Commit `perf(projects): hidden Files tab no longer redraws; flat results draw 50 at a time`, push.
- [ ] **Step 6 (D4):** perf-lab run, label `render-cost-t5`; add the row (this stage should move `projects.median.thrash.*`). In the dev build (`bash scripts/run-dev.sh --label "Render cost"`), search in Files, scroll, switch to Conversations and back: the list is where it was left, or — if the browser itself drops the position of a `display:none` box (FilesTab hides with the `hidden` class, `:600`) — no worse than before this plan. Note which in the closing notes.

---

### Task 6: Conversation preview folds like the chat

**Files:** Modify `PreviewTimeline.tsx`, `SessionPreviewPane.tsx:241`; Test `desktop/tests/session-preview-pane.test.tsx` (extend).

- [ ] **Step 1: Failing tests** — add to `session-preview-pane.test.tsx`: render a pane whose first page has 60 entries. (a) every `.timeline-entry` carries `data-entry-key` (the fold hook's registration key). (b) **the fold actually happens** — (a) alone is a lookalike: it passes with the attribute present and nothing ever folded. Drive it the way `src/renderer/hooks/use-entry-folding.test.ts` does (read its top 40 lines first: its `IntersectionObserver` stub captures the callback as `fire`, and its "waits for scrolling to settle" case shows the timer to advance): give the first entry a non-zero measured height (jsdom measures 0 and the hook REFUSES to fold a 0-height entry — stub `getBoundingClientRect`/`offsetHeight` as that file does), report it `isIntersecting: false`, advance past the settle delay, then assert that entry's wrapper has an inline `height` and NO child content, while a still-intersecting entry keeps its content. Run → FAIL on both.
- [ ] **Step 2: Implement.** `SessionPreviewPane`: `const folding = useEntryFolding(true, scrollRef);` (no find bar reaches preview panes — `ContentFindBar` hosts are ChatView and the drawer's artifact branch only; state that in the WHY). Pass `folding` to `<PreviewTimeline … folding={folding} />`. `PreviewTimeline`: new optional prop `folding?: EntryFolding`; wrapper becomes
```tsx
// WHY: same fold as ChatView.tsx:1255-1269 (this timeline MUST mirror it).
const folded = folding?.isFolded(key) ?? false;
const foldHeight = folded ? folding!.heightOf(key) : undefined;
return (
  <div key={key} ref={folding?.registerEntry} data-entry-key={key}
    className={`timeline-entry in-view${archived ? ' opacity-60' : ''}`}
    style={folded && foldHeight ? { height: foldHeight } : undefined}>
    {folded && foldHeight ? null : content}
  </div>
);
```
  `registerEntry` is stable (hook contract), so no per-render re-attach.
- [ ] **Step 3:** Run `tests/session-preview-pane.test.tsx`, `tests/resume-browser-*.test.tsx`, `src/renderer/hooks/use-entry-folding.test.ts` → PASS. Commit `perf(preview): conversation preview folds far-off entries like the chat`, push.

### Task 7: Buddy chat folds like the chat

**Files:** Modify `buddy/BubbleFeed.tsx:~516`; Test `desktop/tests/bubble-feed-folding.test.tsx` (new, or extend the existing BubbleFeed test if one exists — `rg -l BubbleFeed desktop/tests`).

- [ ] Same shape as Task 6 with `useEntryFolding(true, scrollContainerRef)`; add `data-entry-key` and the spacer to its `.timeline-entry` wrapper; tests are Task 6's pair — (a) `data-entry-key` on every entry AND (b) a driven fold that leaves a height-only spacer with no content. BubbleFeed renders in the buddy window with no `ArtifactProvider` (`ArtifactContext.tsx:19-23`) — mount it bare in the test, as it runs. Commit `perf(buddy): buddy chat folds far-off entries`, push.

---

### Task 8: Marketplace draws 50 at a time

**Files:** Modify `marketplace/MarketplaceScreen.tsx:497-541`, `marketplace/MarketplaceCard.tsx`; Test `desktop/tests/marketplace-bounded.test.tsx` (new).

- [ ] **Step 1: Failing test** — render MarketplaceScreen with a mocked marketplace context of 300 entries (follow the provider setup in the nearest existing marketplace test, `rg -l MarketplaceScreen desktop/tests`); assert ≤ `REVEAL_CHUNK` cards in the "Explore everything" grid; `fireAll` → 100. Run → FAIL.
- [ ] **Step 2: Implement.** `useChunkedReveal(exploreAll, { resetKey: JSON.stringify(filter), rootRef: <outer overflow-y-auto scroller> })` for the bottom grid and the same for search results; sentinel `col-span-full h-px`. Replace the comment at 497-501 ("if it grows consider content-visibility:auto") with the WHY: content-visibility is retired (clips glows); the window keeps every entry reachable, unlike the removed `slice(0,48)`. The "N results" header keeps `filtered.length`. `MarketplaceCard`: `export default React.memo(MarketplaceCard)`, and callers pass a stable `onOpen` (a `useCallback` taking the entry id).
- [ ] **Step 3:** PASS; commit `perf(marketplace): explore grid draws 50 at a time`, push.

### Task 9: Model picker while searching

**Files:** Modify `model/ModelPicker.tsx:~783-818`; Test extend the ModelPicker test (`rg -l ModelPicker desktop/tests`).

- [ ] Failing test: 400 catalog models, type "a" → ≤ 50 rows. Implement `useChunkedReveal(rowsShown, { resetKey: JSON.stringify([q, [...sources].sort(), localOnly]), rootRef: listRef /* the overflow-y-auto div */, active: open })`. The selected model is pinned first in the favourites view, so the window never hides it (note in WHY). PASS; commit `perf(model-picker): search results draw 50 at a time`, push.

### Task 10: Small bounded fixes + memo consistency

- [ ] **CSV columns** — `CsvView.tsx`: add `const MAX_COLS = 100; // matches XlsxView (XlsxView.tsx:14-15)`; clip `usedCols` and each row to it; show the same truncation note XlsxView shows. Test: a 300-column CSV renders 100 column headers. Commit.
- [ ] **Game chat** — `game-reducer.ts` `CHAT_MESSAGE`: `chatMessages: [...state.chatMessages, msg].slice(-200)` with WHY. Test in the game-reducer test file: 250 messages → 200, newest kept. Commit.
- [ ] **SubagentTimeline** — wrap `SubagentToolRow` in `React.memo`; run `rg -l SubagentTimeline desktop/tests` tests; commit. **Leave `style={{ contentVisibility: 'auto' }}` (:210) where it is** (review finding 7): it is a working speed-up on a list this plan gives no other bound, nobody has reported a clipped glow or a jumping row there, and D2 only forbids NEW uses. Removing it is listed under "Deliberately out of scope" with what would justify it.
- [ ] **SkillCard comparator** — `SkillCard.tsx:99` ignores handler identity, so a skipped render can keep a stale `onToggle`. Switch to the RowMemo pattern: handlers read through a ref inside the card (`const onToggleRef = useRef(onToggle); onToggleRef.current = onToggle;` and call `onToggleRef.current`), and drop the custom comparator in favour of default shallow compare over data props only. Run SkillCard/CommandDrawer tests. Commit `refactor(renderer): memo'd cards call the latest handler`, push.

### Task 11: Collapsed boxes are a real slice — BLOCKED ON D1

**Files:** `diff/UnifiedDiff.tsx:128-143`, `tool-views/ToolBody.tsx` ReadView (~600-640); Tests: the UnifiedDiff and ReadView tests (`rg -l "UnifiedDiff|ReadView" desktop/tests`).

- [ ] If D1 = recommended: failing test — a 5,000-row diff collapsed renders `DIFF_PREVIEW_LINES` rows and a "Show N more lines" button; expanded renders all. Implement: when `overflow && !open`, map `rows.slice(0, DIFF_PREVIEW_LINES)` with no `maxHeight`/internal scroll; the button text matches `CollapsibleBlock` ("Show N more lines" / "Show less"). Same in ReadView with `READ_PREVIEW_LINES`, and delete its stale comment "All rows always render (no virtualization needed…)". `fill` mode (git review) instead uses `useChunkedReveal(rows, { resetKey: '', rootRef: <host scroller> })`. Commit `perf(diff): collapsed diffs and reads draw only what they show`, push.
- [ ] If D1 = keep scrolling: collapsed keeps its `maxHeight` box and uses `useChunkedReveal` with the box as root; same tests adjusted.

### Task 12: Side drawer rows memoised

**Files:** `SessionDrawer.tsx:783, 1330`.

- [ ] `ArtifactListItem` → `React.memo`; the list passes `onSelectId`/`onRemoveId` from a `useRef`-backed stable callback (the RowMemo idea) instead of per-row closures. `useTagRegistry` at :189 no longer costs a fetch (Task 2) — leave it. Test: extend `tests/session-drawer-skips-parent-rerenders.test.tsx` with "typing in the drawer search re-renders only rows whose visibility changed". Commit, push.

---

### Task 13: The guard — behaviour, not source text

**Files:** `scripts/ui-review/dom-size-sweep.mjs` (written in Task 0 Step 2c, wired here); no new vitest source scanner.

Why not the `bounded-lists.test.ts` text scanner this task used to be (review finding 2): run against the unfixed tree, its "is bounded" pattern already passed `FilesTab`, `MarketplaceScreen` and `ToolBody` on an unrelated `.slice(0,`/`MAX_` elsewhere in the file, and its "is a list" pattern never saw `SessionDrawer`, `CsvView` or `SubagentTimeline`. A guard that is green on 6 of 11 known offenders teaches sessions the wrong thing, and the workspace just removed 114 source-text guards for that reason (`.claude/rules/test-suite-hygiene.md`). Two things replace it, both of which look at what is DRAWN:

**(a) One stress pin per bounded surface** — each already written by its task; this is the inventory. A pin renders the real component with 1,000+ items and asserts what reaches the DOM.

| Surface | Pin | Written in |
|---|---|---|
| The reveal hook | `src/renderer/hooks/use-chunked-reveal.test.tsx` | 1 |
| Resume browser | `tests/resume-browser-*.test.tsx` (existing) | 1 |
| Projects → Conversations | `tests/conversations-tab-bounded.test.tsx` | 4 |
| Projects → Files, hidden + flat results | `tests/project-view-files-tab-stays-mounted.test.tsx`, `tests/files-tab-list-view.test.tsx` | 5 |
| Conversation preview | `tests/session-preview-pane.test.tsx` (driven fold) | 6 |
| Buddy chat | the BubbleFeed test (driven fold) | 7 |
| Marketplace | `tests/marketplace-bounded.test.tsx` | 8 |
| Model search | the ModelPicker test | 9 |
| CSV columns, game chat | their Task 10 tests | 10 |
| Collapsed diff / read | the UnifiedDiff and ReadView tests | 11 |
| Side drawer rows | `tests/session-drawer-skips-parent-rerenders.test.tsx` | 12 |

- [ ] **Step 1:** For every row, prove the pin per `.claude/rules/test-suite-hygiene.md` → "A guard you did not break is a guard you did not test": undo that surface's bound (e.g. map `rows` instead of `visible`), run ONLY that test (`-t "<name>"`), see it red, restore. Paste the eleven red runs into the plan's closing notes. A pin that stays green is rewritten, not kept.

**(b) The DOM-size sweep** — catches a surface nobody thought to pin, whatever its variables are called.

- [ ] **Step 2:** Re-run `node scripts/ui-review/dom-size-sweep.mjs` (from Task 0 Step 2c) against a serving workbench. Every surface it opens must now be under `NODE_BUDGET`. Its Task 0 run is the proof it can fail: it was red on Conversations, Marketplace and model search before the fixes. If a surface is still over, its task is incomplete — fix it there, do not raise the budget.
- [ ] **Step 3:** Wire it where a human-free run already happens: add it to `scripts/ui-review/run-review.sh` as a final step that prints the table and exits non-zero over budget, and name it in `scripts/ui-review/README.md` beside the coverage instructions. It needs a serving workbench, so it does NOT go in `scripts/verify.sh` (no browser there) — say so in its header comment, so the next session does not move it.
- [ ] **Step 4:** Commit `test(ui-review): DOM-size sweep of the stress scenario` (workspace repo), push.

---

### Task 14: Guidance and enforcement (workspace + app docs)

- [ ] **`.claude/rules/react-renderer.md:36`** — replace the Perf bullet with a **Lists** section (invariant · why · guard format):
  - Card/row lists of user data → `useChunkedReveal` + memo rows (handlers via ref) · Resume 804→96 ms · guard `use-chunked-reveal.test.tsx` + each surface's stress pin (Task 13 table) + `scripts/ui-review/dom-size-sweep.mjs`. **A new list of the user's own things ships with its own stress pin** (1,000+ items in, ≤ one chunk drawn) — say so in the bullet; that sentence is the rule a future session needs.
  - Timelines → `useEntryFolding` (ChatView, PreviewTimeline, BubbleFeed) · guard `use-entry-folding.test.ts`.
  - Collapsed previews → real slice (`CollapsibleBlock`) · guard per Task 11 test.
  - Hidden-but-mounted tabs → `hidden` prop AND `React.memo` with stable props AND no context read of their own (memo cannot stop a context reader; the parent passes the one value down) · guard ast-grep `filestab-mounted-with-hidden-prop`, `filestab-memoized`, `filestab-no-artifact-context`.
  - Data several surfaces read → one store (`useTagRegistry`), never a fetch per mount.
  - `content-visibility: auto` only on glow-free self-contained blocks (code blocks); `hidden` for whole inactive views. Never on `.timeline-entry` or cards.
  Add the new tests to `verify:` anchors — one `- test:` line per stress pin in Task 13's table (e.g. `- test: youcoded/desktop/tests/conversations-tab-bounded.test.tsx`) plus `- path: scripts/ui-review/dom-size-sweep.mjs` — and bump `last_verified`. Keep ≤600 words; no backslash inside a double-quoted frontmatter value (`.claude/rules/README.md`).
- [ ] **`youcoded/docs/renderer-chrome.md:58`** — same correction, with the depth (numbers, rejected alternatives, links to the 07-31 handoff and this plan). Add a `<!-- verify: {"path": "youcoded/desktop/src/renderer/hooks/use-chunked-reveal.ts", "contains": "REVEAL_CHUNK = 50"} -->` anchor.
- [ ] **Design guide** (`docs/active/design/2026-08-25-ui-design-guide.md`): renumber the duplicate **G-22 Expandable rows** (:313) to **G-29** and update code citations that mean it (`rg -n "G-22" youcoded/desktop/src` — `RuntimeBinding.tsx:355` is one); add **G-30 Fast at any size** under §4.6: "A list, grid or timeline of the user's own things draws only what can be seen: cards 50 at a time as you scroll, a conversation folds what is far off screen, a collapsed box draws only the lines it shows. The scrollbar tracks what is drawn. Guard: each surface's stress test, and the DOM-size sweep of the `stress` scenario." Add to §6 checklist item 7: "the `stress` scenario opens without a visible pause". Update the appendix index.
- [ ] **`scripts/ui-review/code-reviewer.md`** — add under what to hunt: "A list/grid/timeline of user data drawn whole, a hidden-but-mounted component that is not memoised, or a fetch-on-mount inside a list (see react-renderer.md → Lists)." **`ux-tester.md`** — add: open each surface in the workbench `stress` scenario (`?scenario=stress&stressRows=2000`) and report any visible pause.
- [ ] **perf-lab budget** — the judged list is the array at the top of `scripts/perf-lab/compare.mjs` (`:11`; its Project View block at `~:90` already judges `projects.median.thrash.ipcStallMs` and `projects.median.open.openMs`). Add the Conversations-tab switch and the to-Conversations thrash there, each with a dated WHY comment in that block's style. Take the EXACT dotted keys from a Task 0 report JSON under `perf-reports/` (they are `projects.median.`-prefixed; do not guess them — a key that matches nothing is silently "not judged", which `compare.mjs:385` warns about). Confirm with a before-vs-after `compare.mjs` run that both names appear in the judged output.
- [ ] Fix the stale claims the sweep found: `docs/active/investigations/2026-09-01-ui-sluggishness-render-cost.md` (ChatView "no paging" — add a dated status line pointing at cycles 2/3); stale `globals.css:801-806` citations in `docs/active/investigations/2026-08-27-perf-defect-classes.md:178` → `:897-905`.
- [ ] `node scripts/audit-anchors.mjs` → clean. Commit workspace docs and app docs separately (app docs → youcoded repo), push both.

### Task 15: Verify, measure, review deck

- [ ] `bash scripts/verify.sh --full /home/destin/youcoded-dev/worktrees/sessions/convo-tab-lag/youcoded` → green (paste the summary into the plan's closing notes).
- [ ] perf-lab after-run with the Task 0 command and `--label render-cost-after`; `node scripts/perf-lab/compare.mjs <before> <after>` → KEEP. Record numbers in the investigation doc, completing the D4 table (before · t3 · t4 · t5 · after) — the deck's timing slide is that table in plain words.
- [ ] `node scripts/ui-review/dom-size-sweep.mjs` against the serving workbench → every surface under budget; paste its table into the closing notes and use its before/after node counts on the Marketplace and model-search deck slides.
- [ ] Workbench after-shots, same surfaces/themes as Task 0 (midnight, light, halftone-dimension, meadow-mist × desktop and 390px).
- [ ] Fresh code reviewer (`scripts/ui-review/code-reviewer.md`) over the full diff; address findings in scope.
- [ ] Review deck in `docs/active/design/2026-09-18-render-cost/` from `scripts/ui-review/templates/` per `.claude/rules/review-deck.md`: Before/After for Conversations tab (with timing), tags no longer popping in, collapsed diff (D1), Marketplace scroll, and a "things you might notice" slide (scrollbar sized to what is drawn). `preview`, read the contact sheet, then `serve` in the background; the printed link is the last line of that turn.
- [ ] Update `docs/roadmap/user-interface.md:109` with a dated line naming what shipped from this plan (do not close it — Destin closes it after real use). Ask "ready to merge?".

## Deliberately out of scope

- **Kept-built previews in Projects** (ResumeBrowser's `PreviewLayer`/`PANES_KEPT`, :266-475). Its logic is entangled with the Resume browser's `shownId` lag and hover warming; extracting it is its own design. File as a roadmap item under the same sluggishness entry once Task 6 is measured — folding may make it unnecessary.
- **Page-load re-render of every turn** (`chat-reducer.ts:2761-2763` builds new Maps; `AssistantTurnBubble` re-renders). Once per page, not per frame; belongs to smoothness Batch B (B2 is the same component). Note it there.
- **Per-card glass on Files grid** (`.layer-surface` per card, FilesTab.tsx:486) — a visible theme change; propose separately with its own Before/After deck.
- ContextTab, Library, CommandDrawer, ChatsearchFindCard — small by nature (tens of rows); no bound, no stress pin. If the Task 13 sweep ever shows one over budget, that is the evidence to revisit.
- **`SubagentTimeline`'s `content-visibility: auto`** (`:210`). Retired for chat entries because it clipped theme glows, but here it is a working speed-up with no reported symptom. Remove it only with (a) a screenshot of a clipped glow or jumping row in a theme that has glows, and (b) a replacement bound (a reveal window) measured no slower on a 300-row subagent run. File under the sluggishness roadmap entry if either turns up.
- **Splitting `ArtifactContext`** so no reader re-renders on unrelated file writes (a selector store like `state/chat-context.ts`). Task 5 takes FilesTab off it; `ProjectView` itself and every other reader (`rg -n "useArtifact\(\)" desktop/src/renderer`) still re-render per write. Worth its own measured plan; note it on the same roadmap entry in Task 15.
