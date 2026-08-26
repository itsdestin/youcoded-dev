---
title: Deliverables card — implementation plan
status: active
date: 2026-08-25
spec: docs/active/specs/2026-08-25-deliverables-card-design.md
branch: youcoded feat/send-user-file-card (worktree `worktrees/send-user-file`)
---

# Deliverables Card Implementation Plan

> **Status 2026-08-26:** Tasks 1–9 are **complete**; Task 10 (finish/merge) and
> Checkpoint 3 are not. The `- [ ]` boxes below were **never ticked** — the real
> record of what was done, with commit shas, review verdicts and every carried
> Minor, is `worktrees/send-user-file/.superpowers/sdd/progress.md` plus the
> `fix-*-report.md` files beside it. Do not read the unchecked boxes as
> outstanding work.
>
> Task-by-task landing: T1 `eb3d9217`, T2 `91e0180c`, T3 `6983bd2e`,
> T4 `358174c1`, T5 `c779fd5b`, T6 `e9575e64`, T7 `7496be55`, T8 `8cdd6764`
> (+ fix `21a1840a`), T9 workspace commit `51adee6`. Post-Checkpoint-2.5 owner
> changes and review fixes: `18280a6b`, `cc20fc2c`, `e114e3aa`, `884b849f`,
> `9acbc41d`, `7e97d215`, `ada2fbcc`, `c36bcc60`, `8003fd6c`.
>
> **Two corrections to this plan's own text:**
> 1. **Task 9, Step 1 is wrong where it says "Expected: all anchors resolve."**
>    Anchors resolve against the `youcoded/` main checkout, which is on `master`,
>    so the six anchors this task adds cannot resolve until the branch merges.
>    Verified 2026-08-26: `node scripts/audit-anchors.mjs` reports all six as
>    failures (`missing:` for five files, `/'delivered'/ not found` for
>    `types.ts`). They **do** resolve against the worktree, so they will go green
>    at merge — but until then this task's commit leaves the workspace mechanical
>    audit (and the daily `workspace-ci.yml` cron) red. Same shape as the 12
>    anchors already carried for other unmerged branches.
> 2. **Task 10's first box ("`verify.sh --full` exits 0") is not currently
>    achievable** for a reason unrelated to this branch:
>    `tests/mcp-startup-wiring.test.ts` times out under machine load and fails on
>    `master` too (recorded in workspace `ROADMAP.md`, commit `878ac44`). Every
>    test belonging to this feature passes.
>
> **Open blocker before Task 10:** an unexplained dev-instance OOM (~2.78 GB main
> process over ~73 minutes, 2026-08-26) — see the spec's status block. Not
> attributed to this branch, not cleared either.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render Claude Code's `SendUserFile` as the approved in-bubble "Deliverables" card, auto-open explicitly-rendered files once per reply, track delivered files in the file panel, and give native sessions the same tool.

**Architecture:** The approved card UI already lives on the branch; this plan finishes it (two fixes + tests), then adds three renderer-side pieces (a `delivered` version type, tracker recording on the *successful* result, and a React-free auto-open module fed by transcript events like the existing tracker), then a stateless native tool. Live-vs-history for auto-open is decided by the event's **recorded** time: native replays keep their original `timestamp`; Claude Code's watcher gains a `recordedAt` field copied from the JSONL line. On top of that, the auto-open module remembers every `toolUseId` it has honored, so a replayed result can never open twice regardless of clock. (The renderer's existing `replay-complete` barrier — `ipc-handlers.ts:2519` — is NOT enough on its own: the Claude Code watcher's *live* path re-reads the whole file from offset 0 on every start, `transcript-watcher.ts:385`, and that path never passes the barrier.)

**Tech Stack:** Electron main (TypeScript, zod tools via `defineTool`), React renderer (vitest + jsdom + @testing-library), a one-line Kotlin mirror in `ArtifactStore.kt`, UI Workbench + dev instance for checkpoints.

## Global Constraints

- All work in the existing worktree `worktrees/send-user-file` (branch `feat/send-user-file-card`); `cd /home/destin/youcoded-dev/worktrees/send-user-file/desktop` for every desktop command.
- The card UI (spec §2) is **approved and final** — do not restyle it; only the two marked fixes.
- Tool name and inputs are Claude Code's exactly: `files: string[]` (≥1), `caption?`, `status?: 'normal'|'proactive'`, `display?: 'render'|'attach'`.
- One auto-open per assistant reply, renderer-side, both runtimes; opens the **first** file; `display` omitted = attach.
- `delivered` is a non-read version type that does **not** bump `lastModified` — on **both** platforms. The renderer tracker runs on Android too and reaches Kotlin `appendVersion` (`SessionService.kt:3552`); `ArtifactStore.kt:216` bumps unconditionally today (it even bumps for `read` — a pre-existing divergence from desktop), so Task 4 adds the one-line guard there.
- Tracker records deliveries on the **successful `tool-result`**, never on the call.
- Auto-open honors a given `toolUseId` at most once per app run, on top of the freshness window.
- Errors: never a hard-coded guess — the tile shows the tool's own error text; the tool names each bad path with its reason.
- `.claude/rules/artifacts.md` and `harness-tools.md` are at 599/600 words: add `verify:` anchors only, no body prose.
- Before claiming any task done: `bash scripts/verify.sh worktrees/send-user-file` (from `/home/destin/youcoded-dev`) exits 0.
- Commit after every task; never push to master from this plan (finishing is a separate step with Destin).
- Kotlin: one logic line in `ArtifactStore.kt` plus enumerating comments; run the Kotlin unit test with `-x bundleWebUi` (Task 4) — never plain Gradle in a worktree (CLAUDE.md worktree rule).
- **Not approved UI:** the card (spec §2) is signed off; the ten review calls in spec §12 (R1–R10: first file not last, omitted `display` = attach, 60 s window, record-on-result, "delivered" as the drawer word, …) were made without a separate sign-off and stay **vetoable until Task 6 starts**. Checkpoint 2.5 is where Destin sees them on a real screen.

**Parallelism:** Tasks 1–3 (card), 4–5 (tracking) and 6–7 (auto-open) are independent groups and may run as parallel subagents in the same worktree because each touches its own files (see File Structure). **Task 8 starts only after Checkpoint 2.5** — it is cheap, and the native tool's description bakes in the same R-decisions the checkpoint exists to test. Task 9 waits for all. Checkpoints are Destin's; be honest about what they are: 1 and 2 are *veto* points (nothing downstream depends on them), 2.5 is the *steering* point for auto-open, 3 is the end-to-end look.

---

## File Structure

| Path (under `youcoded/desktop` unless noted) | Responsibility | Task |
|---|---|---|
| `src/renderer/components/DeliverablesCard.tsx` | the card; fixes: Ctrl+O seed, real error text; drop compare-only props | 1 |
| `tests/deliverables-card.test.tsx` (new) | card behaviour pins | 1 |
| `src/renderer/components/ToolCard.tsx` | `friendlyToolDisplay` `SendUserFile` case: no "Sent 0 files" | 2 |
| `tests/deliverables-bubble.test.tsx` (new) | bubble hoist/last/padding/merge + fallback surfaces | 2 |
| `src/renderer/dev/workbench/compare/registry.tsx` | restore from master (rejected variants pruned) | 3 |
| `src/shared/artifacts/types.ts`, `src/main/artifacts/artifact-store.ts`, `src/main/ipc-handlers.ts`, `src/main/artifacts/visible-artifacts.ts`, `src/renderer/components/SessionDrawer.tsx`, `app/src/main/kotlin/com/youcoded/app/artifacts/{SidecarSchema,ArtifactStore}.kt` (ArtifactStore: one-line `lastModified` guard), `src/renderer/dev/workbench/fixtures/artifacts.ts` | `delivered` version type | 4 |
| `tests/artifacts/artifact-store.test.ts`, `tests/artifacts/visible-artifacts.test.ts`, `tests/session-drawer-delivered-label.test.tsx` (new), `app/src/test/kotlin/com/youcoded/app/artifacts/ArtifactStoreTest.kt` | `delivered` pins | 4 |
| `src/renderer/state/artifact-tool-use-tracker.ts`, `tests/artifacts/artifact-tool-use-tracker.test.ts` | record on successful result | 5 |
| `src/main/transcript-watcher.ts`, `src/shared/types.ts`, `tests/transcript-watcher.test.ts` | `recordedAt` on CC tool-result events | 6 |
| `src/renderer/state/deliverable-auto-open.ts` (new), `tests/deliverable-auto-open.test.ts` (new), `src/renderer/hooks/useOpenFilepath.ts`, `src/renderer/App.tsx` | auto-open rule + wiring | 7 |
| `src/main/harness/tools/send-user-file.ts` (new), `src/main/harness/tools/index.ts`, `src/shared/harness-manifest.ts`, `src/shared/permission-types.ts`, `tests/send-user-file-tool.test.ts` (new), `tests/tool-registry-manifest.test.ts`, `tests/permission-engine.test.ts`, `tests/specialist-registry.test.ts` | native tool | 8 |
| workspace: `.claude/rules/artifacts.md`, `.claude/rules/harness-tools.md`, `docs/MAP.md`, the spec, `ROADMAP.md` | anchors, map rows, status | 9 |

---

### Task 1: Card fixes — Ctrl+O seed, real error text, prune compare-only props

**Files:**
- Modify: `src/renderer/components/DeliverablesCard.tsx`
- Test: `tests/deliverables-card.test.tsx` (new)

**Interfaces:**
- Consumes: `getInitialExpanded(defaultOpen)` / `useExpandAllToggle` from `src/renderer/hooks/useExpandAllToggle.ts`; `ToolCallState.error?: string` (set by the reducer on `isError`).
- Produces: `SentFileTile` props become `{ path, sessionId, status, error?, narrow, tileBg?, compact? }` (the `record`, `projectPath`, `wrapName` props existed only for the compare route and go away in Task 3). `DeliverablesCard` unchanged externally: `{ tools: ToolCallState[]; sessionId: string }`.

- [ ] **Step 1: Write the failing tests**

Create `tests/deliverables-card.test.tsx`:

```tsx
// @vitest-environment jsdom
// Pins the approved Deliverables card (spec §2) plus the two review fixes:
// the open/closed seed follows Ctrl+O like every tool card, and a failed tile
// shows the TOOL's error text — never a hard-coded guess (error-message rule).
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import type { ToolCallState } from '../src/shared/types';

// The card is under test, not the preview: ArtifactThumbnail does IPC.
vi.mock('../src/renderer/components/ArtifactThumbnail', () => ({
  ArtifactThumbnail: () => <div data-testid="thumb" />,
}));

import { DeliverablesCard } from '../src/renderer/components/DeliverablesCard';
import { broadcastCollapseAll, broadcastExpandAll } from '../src/renderer/hooks/useExpandAllToggle';

// jsdom has neither matchMedia (useNarrowViewport) nor ResizeObserver (fades).
function setViewport(narrow: boolean) {
  (window as any).matchMedia = (query: string) => ({
    matches: narrow, media: query, addEventListener: () => {}, removeEventListener: () => {},
  });
}
(globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };

const call = (id: string, files: string[], extra: Partial<ToolCallState> = {}): ToolCallState => ({
  toolUseId: id, toolName: 'SendUserFile', input: { files, status: 'normal' }, status: 'complete', ...extra,
});

afterEach(cleanup);

describe('DeliverablesCard', () => {
  it('is open by default with one tile per file', () => {
    setViewport(false);
    render(<DeliverablesCard tools={[call('t1', ['/p/docs/a.md', '/tmp/b.png'])]} sessionId="s" />);
    expect(screen.getByTestId('deliverables-strip')).toBeInTheDocument();
    expect(screen.getAllByTestId('sent-file-tile')).toHaveLength(2);
    expect(screen.getByText('a.md')).toBeInTheDocument();
    expect(screen.getByText('/tmp/')).toBeInTheDocument(); // external folder shown absolute
  });

  it('seeds CLOSED when Ctrl+O collapse-all is active at mount, and reopens on expand-all', () => {
    setViewport(false);
    broadcastCollapseAll();
    render(<DeliverablesCard tools={[call('t1', ['/p/a.md'])]} sessionId="s" />);
    expect(screen.queryByTestId('deliverables-strip')).toBeNull();
    act(() => broadcastExpandAll());
    expect(screen.getByTestId('deliverables-strip')).toBeInTheDocument();
  });

  it('header click collapses to one line', () => {
    setViewport(false);
    render(<DeliverablesCard tools={[call('t1', ['/p/a.md'], { input: { files: ['/p/a.md'], caption: 'the report' } })]} sessionId="s" />);
    fireEvent.click(screen.getByText('Deliverables'));
    expect(screen.queryByTestId('deliverables-strip')).toBeNull();
    expect(screen.getByText('the report')).toBeInTheDocument(); // caption survives in the header
  });

  it('merges several calls: files concatenate, captions stack under the strip', () => {
    setViewport(false);
    render(<DeliverablesCard tools={[
      call('t1', ['/p/a.md'], { input: { files: ['/p/a.md'], caption: 'first' } }),
      call('t2', ['/p/b.md', '/p/c.md'], { input: { files: ['/p/b.md', '/p/c.md'], caption: 'second' } }),
    ]} sessionId="s" />);
    expect(screen.getAllByTestId('sent-file-tile')).toHaveLength(3);
    expect(screen.getByText('first').tagName).toBe('P');
    expect(screen.getByText('second').tagName).toBe('P');
  });

  it("a failed tile shows the tool's own error text, never a fixed guess", () => {
    setViewport(false);
    const err = 'SendUserFile failed — nothing was sent:\n- /tmp/out is a directory';
    render(<DeliverablesCard tools={[call('t1', ['/tmp/out'], { status: 'failed', error: err })]} sessionId="s" />);
    expect(screen.getByText('Couldn’t send')).toBeInTheDocument();
    expect(screen.getByText(/is a directory/)).toBeInTheDocument();
    expect(screen.queryByText(/not found/)).toBeNull();
    expect(screen.getByTestId('sent-file-tile')).toHaveAttribute('title', expect.stringContaining('is a directory'));
  });

  it('a running call shows Sending…', () => {
    setViewport(false);
    render(<DeliverablesCard tools={[call('t1', ['/p/a.md'], { status: 'running' })]} sessionId="s" />);
    expect(screen.getByText('Sending…')).toBeInTheDocument();
  });

});
```

Notes on this file: the tile-width (176/224px) and fade behaviour are deliberately **not** pinned here — they would pin Tailwind class names and faked `scrollWidth`, not behaviour, and Checkpoint 1 covers them by eye. The Ctrl+O test leaves the module-level mode at `expand-all` (there is no reset export); for this card that mounts open, same as default, so the order above is safe — keep the Ctrl+O test where it is if you add cases.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/deliverables-card.test.tsx`
Expected: FAIL — "seeds CLOSED…" (strip still rendered) and "a failed tile shows the tool's own error text" (finds "not found", no `title` with the error).

- [ ] **Step 3: Apply the fixes in `DeliverablesCard.tsx` — three hunks in the tile, nothing else**

The tile is the approved UI. Do **not** retype the component (a paste that differs by one class name restyles a signed-off card). Make these targeted edits and then confirm with `git diff` that no other line of `SentFileTile` changed:

1. Import line: `import { useExpandAllToggle, getInitialExpanded } from '../hooks/useExpandAllToggle';`
2. `SentFileTileProps` + signature: delete `record?`, `projectPath?`, `wrapName?` and their doc comments (compare-route-only; the route goes in Task 3). Add, after `status`:
   ```ts
   /** The tool's own error text when status is 'failed'. Shown verbatim (first
    *  line under the strip, full text as the tooltip) — never a guessed reason:
    *  a folder, a missing file and an unreadable file all fail differently and
    *  the user has to be able to tell which (docs/error-message-standards.md). */
   error?: string;
   ```
   Signature becomes `({ path, sessionId, status, error, narrow, tileBg = 'bg-well', compact = false }: SentFileTileProps)`. Inside the body the override fallbacks go away — `const record = tracked ?? standInRecord(abs);` and `const projectPath = record.kind === 'internal' ? (cwd ?? '') : '';` — and any `wrapName ? … : …` conditional on the name span collapses to its truncating branch.
3. Failure text (L149 and L172-176 on the branch): `title={failed ? `${path} — ${error || 'could not be sent'}` : `Open ${name}`}`, and the overlay reads `Couldn’t send` (drop ` — not found`).

In `DeliverablesCard`, replace the `useState(true)` line and its comment with:

```tsx
  // Open by default — unlike a tool card — because the files ARE the reply.
  // Still collapsible, and Ctrl+O's expand/collapse-all applies, so the card
  // behaves like the tool cards around it once the user starts managing space.
  // Fix (review 2026-08-25): seed from the CURRENT Ctrl+O mode like ToolCard
  // does — a card that mounts after a collapse-all must not come up open while
  // everything around it is closed.
  const [open, setOpen] = useState(() => getInitialExpanded(true));
```

Replace the `entries` memo so each entry carries the call's error:

```tsx
  const entries = useMemo(
    () => tools.flatMap((tool) => sentFilePaths(tool.input).map((path) => ({ path, status: tool.status, error: tool.error, key: `${tool.toolUseId}:${path}` }))),
    [tools],
  );
  // Failed calls list their reason under the strip, in the tool's own words —
  // one line per failed call (a multi-path error names every bad path).
  const failures = useMemo(
    () => tools.filter((t) => t.status === 'failed' && t.error).map((t) => ({ key: t.toolUseId, text: t.error as string })),
    [tools],
  );
```

Pass the error to the tile and render the failures after the captions:

```tsx
                  <SentFileTile path={e.path} sessionId={sessionId} status={e.status} error={e.error} narrow={narrow} tileBg="bg-inset" compact />
```

```tsx
          {footCaptions.map((c, i) => (
            <p key={i} className="px-3 pb-2 -mt-0.5 text-2xs text-fg-muted">{c}</p>
          ))}
          {failures.map((f) => (
            <p key={f.key} className="px-3 pb-2 -mt-0.5 text-2xs text-red-400 whitespace-pre-line">{f.text}</p>
          ))}
```

Also update the header comment block at the top of the file: the line `// with the caption, and previews instead of a status line.` stays; replace `a "Files · N" header` with `a "Deliverables · N" header`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/deliverables-card.test.tsx`
Expected: PASS (6 tests). `npx tsc --noEmit` will now FAIL in `compare/registry.tsx` (it passes `record`/`projectPath`/`wrapName`) — that is Task 3's job; commit this task anyway.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/DeliverablesCard.tsx tests/deliverables-card.test.tsx
git commit -m "fix(deliverables): seed collapse from Ctrl+O mode; failed tile shows the tool's own error"
```

---

### Task 2: Pin the bubble integration and the fallback surfaces

**Files:**
- Modify: `src/renderer/components/ToolCard.tsx` (the `case 'SendUserFile'` block in `friendlyToolDisplay`)
- Test: `tests/deliverables-bubble.test.tsx` (new)

**Interfaces:**
- Consumes: `AssistantTurnBubble` props `{ turn, toolGroups, toolCalls, sessionId, showTimestamps }`; `ToolCard` `{ tool, sessionId? }` with `data-testid="tool-card-chevron"` on its header toggle; `friendlyToolDisplay(tool) → { label, detail }`.
- Produces: nothing new — pins behaviour already on the branch.

- [ ] **Step 1: Write the failing tests**

Create `tests/deliverables-bubble.test.tsx`:

```tsx
// @vitest-environment jsdom
// Pins spec §2.1 (card LAST in the bubble, calls hoisted out of the tool
// group, prose padding for a card-only bubble, multi-call merge) and §5
// (friendlyToolDisplay + ToolBody fallbacks never show raw JSON).
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ChatProvider } from '../src/renderer/state/chat-context';
import type { AssistantTurn } from '../src/renderer/state/chat-types';
import type { ToolCallState, ToolGroupState } from '../src/shared/types';

vi.mock('../src/renderer/components/ArtifactThumbnail', () => ({
  ArtifactThumbnail: () => <div data-testid="thumb" />,
}));
vi.mock('../src/renderer/components/MarkdownContent', () => ({
  default: ({ content }: { content: string }) => <div data-testid="md">{content}</div>,
}));

import AssistantTurnBubble from '../src/renderer/components/AssistantTurnBubble';
import ToolCard, { friendlyToolDisplay } from '../src/renderer/components/ToolCard';

(window as any).matchMedia = (query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} });
(globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };

afterEach(cleanup);

const send = (id: string, files: string[]): ToolCallState =>
  ({ toolUseId: id, toolName: 'SendUserFile', input: { files, status: 'normal' }, status: 'complete', response: `Sent ${files.length} file(s) to the user.` });
const bash = (id: string): ToolCallState =>
  ({ toolUseId: id, toolName: 'Bash', input: { command: 'node scripts/perf.mjs' }, status: 'complete', response: 'ok' });

function turn(segments: AssistantTurn['segments']): AssistantTurn {
  return { id: 'turn_1', segments, timestamp: 0, stopReason: null, model: null, usage: null, anthropicRequestId: null };
}

function renderTurn(t: AssistantTurn, groups: Record<string, string[]>, calls: ToolCallState[]) {
  const toolGroups = new Map<string, ToolGroupState>(Object.entries(groups).map(([id, toolIds]) => [id, { id, toolIds }]));
  const toolCalls = new Map(calls.map((c) => [c.toolUseId, c]));
  return render(
    <ChatProvider>
      <AssistantTurnBubble turn={t} toolGroups={toolGroups} toolCalls={toolCalls} sessionId="s" showTimestamps={false} />
    </ChatProvider>,
  );
}

describe('Deliverables card in the bubble', () => {
  it('renders LAST in the bubble and its call is absent from the tool group', () => {
    renderTurn(
      turn([{ type: 'text', content: 'Done.', messageId: 'm1' }, { type: 'tool-group', groupId: 'g1' }]),
      { g1: ['send1', 'bash1'] },   // SendUserFile listed FIRST; must render LAST, outside the group
      [send('send1', ['/p/report.md']), bash('bash1')],
    );
    const card = screen.getByTestId('deliverables-card');
    expect(card.nextElementSibling).toBeNull();                 // nothing after it in the bubble
    expect(screen.queryByText(/Sent a file/)).toBeNull();        // no ToolCard was drawn for the call
    expect(screen.getByText(/perf\.mjs/)).toBeInTheDocument();  // the Bash card still renders
    expect(card.compareDocumentPosition(screen.getByText(/perf\.mjs/)) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });

  it('a bubble holding only the card gets prose padding, not the tools-only padding', () => {
    const { container } = renderTurn(
      turn([{ type: 'tool-group', groupId: 'g1' }]),
      { g1: ['send1'] },
      [send('send1', ['/p/report.md'])],
    );
    const bubble = container.querySelector('.assistant-bubble') as HTMLElement;
    expect(bubble.className).toContain('pt-4');
    expect(bubble.className).not.toContain('py-2.5');
  });

  it('merges every SendUserFile call in the bubble into ONE card', () => {
    renderTurn(
      turn([{ type: 'text', content: 'Two batches.', messageId: 'm1' }, { type: 'tool-group', groupId: 'g1' }, { type: 'tool-group', groupId: 'g2' }]),
      { g1: ['send1'], g2: ['send2', 'bash1'] },
      [send('send1', ['/p/a.md']), send('send2', ['/p/b.md', '/p/c.md']), bash('bash1')],
    );
    expect(screen.getAllByTestId('deliverables-card')).toHaveLength(1);
    expect(screen.getAllByTestId('sent-file-tile')).toHaveLength(3);
  });
});

describe('fallback surfaces', () => {
  it('friendlyToolDisplay: singular, plural, and never "Sent 0 files" on malformed input', () => {
    expect(friendlyToolDisplay({ toolName: 'SendUserFile', input: { files: ['/p/a.md'] } } as any))
      .toEqual({ label: 'Sent a file', detail: '↳ a.md' });
    expect(friendlyToolDisplay({ toolName: 'SendUserFile', input: { files: ['/p/a.md', '/q/b.png'] } } as any))
      .toEqual({ label: 'Sent 2 files', detail: '↳ a.md, b.png' });
    // Pin the label only: whether the code yields '' or '↳ ' for detail on
    // garbage input is not worth a rule.
    expect(friendlyToolDisplay({ toolName: 'SendUserFile', input: { files: 'not-an-array' } } as any).label)
      .toBe('Sent files');
  });

  it('a bare SendUserFile ToolCard expands to the card, not the raw JSON view', () => {
    render(
      <ChatProvider>
        <ToolCard tool={send('send1', ['/p/report.md'])} sessionId="s" />
      </ChatProvider>,
    );
    fireEvent.click(screen.getByTestId('tool-card-chevron'));
    expect(screen.getByTestId('deliverables-card')).toBeInTheDocument();
    expect(screen.queryByText(/"files"/)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/deliverables-bubble.test.tsx`
Expected: only "never 'Sent 0 files'" FAILS (label is `Sent 0 files`). If any bubble test fails, the branch has drifted from spec §2.1 — fix the component, not the test.

- [ ] **Step 3: Fix the label**

In `src/renderer/components/ToolCard.tsx`, inside `case 'SendUserFile':`, replace the `label:` line with:

```ts
        // Fix: a non-array `files` (malformed input) used to read "Sent 0 files".
        label: files.length === 1 ? 'Sent a file' : files.length ? `Sent ${files.length} files` : 'Sent files',
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/deliverables-bubble.test.tsx tests/deliverables-card.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/ToolCard.tsx tests/deliverables-bubble.test.tsx
git commit -m "test(deliverables): pin card-last hoist, prose padding, merge, and fallback surfaces"
```

---

### Task 3: Prune the rejected compare-round variants

The compare surface `sent-files-card` holds five rejected candidates (~220 lines) plus props on `SentFileTile` that only they used. The approved card is reviewable in the workbench conversations (`fixtures/conversations/claude-code.jsonl` c3, `native.jsonl` n2) and the tool gallery.

**Files:**
- Restore: `src/renderer/dev/workbench/compare/registry.tsx` (to master)

- [ ] **Step 1: Restore the file from master and confirm the only lost line is the `ACTIVE_FIRST` pointer**

```bash
git diff master -- src/renderer/dev/workbench/compare/registry.tsx | grep '^-[^-]'
# Expected exactly:  -const ACTIVE_FIRST = 'bash-grant-width';
git checkout master -- src/renderer/dev/workbench/compare/registry.tsx
grep -c "sent-files" src/renderer/dev/workbench/compare/registry.tsx   # Expected: 0
```

- [ ] **Step 2: Type-check and boot the workbench**

```bash
npx tsc --noEmit                                  # Expected: clean (Task 1's prop removal no longer has a consumer)
cd /home/destin/youcoded-dev && bash scripts/run-workbench.sh worktrees/send-user-file   # in a second terminal
node scripts/workbench-boot-check.mjs             # Expected: "All 12 workbench routes mount cleanly."
```

- [ ] **Step 3: Commit**

```bash
cd /home/destin/youcoded-dev/worktrees/send-user-file/desktop
git add src/renderer/dev/workbench/compare/registry.tsx
git commit -m "chore(workbench): drop the sent-files compare round — pick D is the shipped card"
```

**CHECKPOINT 1 (Destin, workbench):** narrow toggle on the `claude-code` conversation (176px tiles), and the tool gallery's `senduserfile-failed` fixture (error text under the strip). Spec §10 items 1–2.

---

### Task 4: The `delivered` version type

**Files:**
- Modify: `src/shared/artifacts/types.ts:12`, `src/main/artifacts/artifact-store.ts:100,269`, `src/main/ipc-handlers.ts:3478`, `src/main/artifacts/visible-artifacts.ts:22-25` (comment), `src/renderer/components/SessionDrawer.tsx:925-933`, `app/src/main/kotlin/com/youcoded/app/artifacts/SidecarSchema.kt:20`, `app/src/main/kotlin/com/youcoded/app/artifacts/ArtifactStore.kt:162,216` (comment + the `lastModified` guard), `src/renderer/dev/workbench/fixtures/artifacts.ts:17`
- Test: `tests/artifacts/artifact-store.test.ts`, `tests/artifacts/visible-artifacts.test.ts`, `tests/session-drawer-delivered-label.test.tsx` (new), `app/src/test/kotlin/com/youcoded/app/artifacts/ArtifactStoreTest.kt`

**Interfaces:**
- Produces: `VersionType = 'create' | 'edit' | 'delete' | 'read' | 'delivered'`; drawer status word `'delivered'`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/artifacts/artifact-store.test.ts`, right after the `"a 'read' version does NOT bump lastModified on an existing record"` case:

```ts
  it("a 'delivered' version does NOT bump lastModified on an existing record", async () => {
    // Handing the user an old file is not a modification — it must not jump
    // to the top of "recently modified" (spec 2026-08-25 §4.2).
    await appendVersion(projectRoot, 'p1', 'proj', {
      path: 'a.md', kind: 'internal', absolutePath: null,
      sessionId: 's', type: 'edit', author: 'agent',
    });
    const before = (await readSidecar(projectRoot)) as ProjectSidecar;
    const stamp = before.artifacts[0].lastModified;
    await new Promise((r) => setTimeout(r, 5));
    await appendVersion(projectRoot, 'p1', 'proj', {
      path: 'a.md', kind: 'internal', absolutePath: null,
      sessionId: 's2', type: 'delivered', author: 'agent', toolUseId: 'toolu_d',
    });
    const after = (await readSidecar(projectRoot)) as ProjectSidecar;
    expect(after.artifacts[0].lastModified).toBe(stamp);
    expect(after.artifacts[0].versions.at(-1)?.type).toBe('delivered');
  });
```

Append inside the `describe('trackedArtifacts', …)` block of `tests/artifacts/visible-artifacts.test.ts`:

```ts
  it("shows an internal file whose only version is 'delivered', hides an external one (externals stay pin-gated)", () => {
    const delivered = { type: 'delivered' };
    const arts = [
      { kind: 'internal', path: 'out/chart.png', absolutePath: null, versions: [delivered], id: 'in' },
      { kind: 'external', path: 'chart.png', absolutePath: '/tmp/chart.png', versions: [delivered], id: 'ext' },
    ];
    expect(trackedArtifacts(arts, [], [], ROOT).map((a: any) => a.id)).toEqual(['in']);
  });
```

Create `tests/session-drawer-delivered-label.test.tsx` (same harness as `session-drawer-session-scoped-labels.test.tsx`):

```tsx
// @vitest-environment jsdom
// A file whose only version in THIS session is 'delivered' is labelled
// "delivered" in the Session Drawer — not "viewed" (it is more than a view)
// and not "created" (it was not modified). Spec 2026-08-25 §4.2.
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { ArtifactContext } from '../src/renderer/state/ArtifactContext';
import { initialArtifactState } from '../src/renderer/state/artifact-tracker';
import type { ArtifactRecord } from '../src/shared/artifacts/types';

vi.mock('../src/renderer/state/theme-context', () => ({
  useTheme: () => ({
    hideCodeAndConfigs: false, setHideCodeAndConfigs: vi.fn(),
    showDeletedArtifacts: false, setShowDeletedArtifacts: vi.fn(),
    drawerWidth: 420, setDrawerWidth: vi.fn(), resetDrawerWidth: vi.fn(),
  }),
}));

import { SessionDrawer } from '../src/renderer/components/SessionDrawer';

afterEach(cleanup);

describe('SessionDrawer — delivered label', () => {
  it('labels a delivered-only file "delivered"', () => {
    const artifact: ArtifactRecord = {
      id: 'a1', path: 'out/chart.png', kind: 'internal', absolutePath: null,
      lastModified: new Date().toISOString(), status: 'active',
      versions: [{ id: 'v1', ts: new Date().toISOString(), sessionId: 'sess', type: 'delivered', author: 'agent', toolUseId: 'toolu_1' }],
      comments: [], tags: [],
    };
    const state = {
      ...initialArtifactState,
      sessionArtifacts: { sess: [artifact] },
      drawerOpenBySession: { sess: true },
      activeArtifactBySession: {},
    };
    (window as any).claude = {
      artifacts: { get: vi.fn(), checkExistence: vi.fn().mockResolvedValue({ ok: true, missingIds: [] }), onChanged: undefined },
    };
    const { container } = render(
      <ArtifactContext.Provider value={{ state, dispatch: vi.fn() }}>
        <SessionDrawer sessionId="sess" projectRoot="/home/u/proj" projectId="proj-1" projectName="proj" />
      </ArtifactContext.Provider>,
    );
    // Match the status WORD, not a class: `.text-3xs` is shared by other
    // labels and `querySelector` returns whichever comes first.
    expect(container.textContent).toMatch(/\bdelivered\b/);
    expect(container.textContent).not.toMatch(/\b(created|viewed|edited)\b/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/artifacts/artifact-store.test.ts tests/artifacts/visible-artifacts.test.ts tests/session-drawer-delivered-label.test.tsx`
Expected: artifact-store FAILS (lastModified bumped; also a TS union error), visible-artifacts PASSES already (any non-read counts), drawer FAILS (label is "created").

- [ ] **Step 3: Add the type everywhere the union is spelled out**

`src/shared/artifacts/types.ts` — replace the comment + line 12:

```ts
// 'read' marks a document Claude opened (Read tool) but did not modify — it
// makes the file appear as a session artifact so it's openable from the tool
// card, without fabricating fake edit history. Only document-type files get a
// 'read' version (see the artifact tracker in App.tsx); code/config reads are
// not tracked.
// 'delivered' (2026-08-25) marks a file the assistant handed to the user via
// SendUserFile. Non-read — so an in-project file a script produced becomes
// visible in Project View — but, like 'read', it never bumps lastModified:
// delivery is not modification. Kotlin mirror is a String typealias, so an
// older client reads it fine (labels it "created"; cosmetic).
export type VersionType = 'create' | 'edit' | 'delete' | 'read' | 'delivered';
```

`src/main/artifacts/artifact-store.ts:100`: `type: 'create' | 'edit' | 'delete' | 'read' | 'delivered';`

`src/main/artifacts/artifact-store.ts:265-269` — replace the comment + line:

```ts
        // A 'read' is not a modification — bumping lastModified for a view
        // reordered "recently modified" sorting every time a pill was clicked.
        // 'delivered' is the same: handing over an old file must not jump it to
        // the top. (New records below still get lastModified = now: that's
        // record creation, and the UI labels read-only records "viewed".)
        if (input.type !== 'read' && input.type !== 'delivered') existing.lastModified = now;
```

`src/main/ipc-handlers.ts:3478`: `type: 'create' | 'edit' | 'delete' | 'read' | 'delivered';`

`src/main/artifacts/visible-artifacts.ts` rule-3 comment — after `(create/edit/delete = Claude's actual work, or a user save).` add: ` 'delivered' counts as work too — a script-made file the assistant handed over belongs here.`

`src/renderer/components/SessionDrawer.tsx` — replace `statusInfo`:

```ts
function statusInfo(artifact: ArtifactRecord, isDeleted: boolean, sessionId: string): string {
  if (isDeleted) return 'deleted';
  const sessionVersions = versionsInSession(artifact, sessionId);
  const versions = sessionVersions.length > 0 ? sessionVersions : artifact.versions;
  // 'read' and 'delivered' are not modifications. A delivered-only file says
  // "delivered" (more than a view, less than an edit) — spec 2026-08-25 §4.2.
  const modifying = versions.filter((v) => v.type !== 'read' && v.type !== 'delivered').length;
  if (modifying === 0) return versions.some((v) => v.type === 'delivered') ? 'delivered' : 'viewed';
  if (modifying > 1) return 'edited';
  return 'created';
}
```

Also update the comment above it (`// session's versions are all 'read'), edited …`) to mention `delivered`.

Kotlin comments: `SidecarSchema.kt:20` → `typealias VersionType    = String  // "create" | "edit" | "delete" | "read" | "delivered"`; `ArtifactStore.kt:162` → `val type: String,   // "create" | "edit" | "delete" | "read" | "delivered"`.

Kotlin **logic** (`ArtifactStore.kt:214-217`): the `if (existing != null)` branch sets `existing.lastModified = now` for EVERY type — including `read`, which desktop already skips (pre-existing divergence, verified 2026-08-25). The renderer tracker runs on Android and lands here through `artifacts:append-version`, so without this guard a delivery from the phone jumps an old file to the top of "recently modified" and the synced sidecar disagrees across devices. Replace the bump line with:

```kotlin
// Fix (2026-08-25): a 'read' or 'delivered' version is not a modification.
// Desktop already skips the bump for 'read' (artifact-store.ts); this store
// bumped unconditionally, so a viewed/delivered file jumped to the top of
// "recently modified" on the phone and the synced sidecar disagreed across
// devices. Delivery ≠ modification (spec 2026-08-25 §4.2).
if (input.type != "read" && input.type != "delivered") existing.lastModified = now
```

Add a case to `app/src/test/kotlin/com/youcoded/app/artifacts/ArtifactStoreTest.kt` mirroring the desktop pin (append an `edit`, then a `delivered` for the same path; `lastModified` unchanged, last version type `delivered`). Run it with `cd /home/destin/youcoded-dev/worktrees/send-user-file && ./gradlew test -x bundleWebUi --tests '*ArtifactStoreTest*'` — `-x bundleWebUi` because that task runs `npm ci` and must never run in a worktree (CLAUDE.md). If Gradle cannot run on this machine, say so in the commit body and in the handoff — do not report the test as run.

Workbench fixture `src/renderer/dev/workbench/fixtures/artifacts.ts:17`: widen the helper to `type: 'create' | 'edit' | 'read' | 'delivered'` and add `version('wb-1', 'delivered', T)` to the `versions` arrays of the `a-sent-report` and `a-sent-chart` records (both exist on the branch; open the file to find them) so the drawer checkpoint has a delivered file to show.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/artifacts/artifact-store.test.ts tests/artifacts/visible-artifacts.test.ts tests/session-drawer-delivered-label.test.tsx tests/session-drawer-session-scoped-labels.test.tsx && npx tsc --noEmit`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add src/shared/artifacts/types.ts src/main/artifacts/artifact-store.ts src/main/ipc-handlers.ts src/main/artifacts/visible-artifacts.ts src/renderer/components/SessionDrawer.tsx src/renderer/dev/workbench/fixtures/artifacts.ts ../app/src/main/kotlin/com/youcoded/app/artifacts/SidecarSchema.kt ../app/src/main/kotlin/com/youcoded/app/artifacts/ArtifactStore.kt ../app/src/test/kotlin/com/youcoded/app/artifacts/ArtifactStoreTest.kt tests/artifacts/artifact-store.test.ts tests/artifacts/visible-artifacts.test.ts tests/session-drawer-delivered-label.test.tsx
git commit -m "feat(artifacts): 'delivered' version type — non-read, no lastModified bump on either platform, drawer word"
```

**CHECKPOINT 2 (Destin, workbench):** Session Drawer for the `claude-code` conversation shows `scroll-perf-report.md` and the chart labelled "delivered". Spec §10 item 3.

---

### Task 5: Tracker records deliveries on the successful result

**Files:**
- Modify: `src/renderer/state/artifact-tool-use-tracker.ts`
- Test: `tests/artifacts/artifact-tool-use-tracker.test.ts`

**Interfaces:**
- Consumes: `tool-use` events `{ data: { toolName, toolUseId, toolInput } }` and `tool-result` events `{ data: { toolUseId, isError } }` on the same `transcript:event` channel.
- Produces: `TrackerAppendArgs.type` gains `'delivered'`; one `appendVersion` per delivered file, `author: 'agent'`, same `toolUseId`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/artifacts/artifact-tool-use-tracker.test.ts`, next to the existing `toolUse` builder:

```ts
function sendUse(toolUseId: string, files: string[], sessionId = 'sess-1') {
  return { type: 'tool-use', sessionId, uuid: `u-${toolUseId}`, timestamp: Date.now(),
    data: { toolName: 'SendUserFile', toolUseId, toolInput: { files, status: 'normal' } } };
}
function toolResult(toolUseId: string, opts: { isError?: boolean; sessionId?: string } = {}) {
  return { type: 'tool-result', sessionId: opts.sessionId ?? 'sess-1', uuid: `r-${toolUseId}`, timestamp: Date.now(),
    data: { toolUseId, toolResult: 'x', isError: opts.isError ?? false } };
}
```

and a new describe block:

```ts
describe('SendUserFile → delivered versions', () => {
  it('records nothing on the call and one delivered version per file on the successful result', () => {
    const { tracker, appendVersion } = makeTracker();
    tracker.handle(sendUse('toolu_s', [`${ROOT}/docs/report.md`, '/tmp/chart.png']));
    expect(appendVersion).not.toHaveBeenCalled();           // the file is not confirmed yet
    tracker.handle(toolResult('toolu_s'));
    expect(appendVersion).toHaveBeenCalledTimes(2);
    expect(appendVersion).toHaveBeenCalledWith(ROOT, 'sess-1', expect.objectContaining({
      type: 'delivered', author: 'agent', toolUseId: 'toolu_s', kind: 'internal', path: 'docs/report.md',
    }));
    expect(appendVersion).toHaveBeenCalledWith(ROOT, 'sess-1', expect.objectContaining({
      type: 'delivered', author: 'agent', toolUseId: 'toolu_s', kind: 'external', absolutePath: '/tmp/chart.png',
    }));
  });

  it('an error result drops the pending call — no ghost record for a typo’d path', () => {
    const { tracker, appendVersion } = makeTracker();
    tracker.handle(sendUse('toolu_bad', [`${ROOT}/docs/missing.md`]));
    tracker.handle(toolResult('toolu_bad', { isError: true }));
    tracker.handle(toolResult('toolu_bad'));                 // a late duplicate must not revive it
    expect(appendVersion).not.toHaveBeenCalled();
  });

  it('a result with no pending SendUserFile call is ignored', () => {
    const { tracker, appendVersion } = makeTracker();
    tracker.handle(toolResult('toolu_unknown'));
    expect(appendVersion).not.toHaveBeenCalled();
  });

  it('refreshes the drawer ONCE after a multi-file delivery', async () => {
    const { tracker, listSession } = makeTracker();
    tracker.handle(sendUse('toolu_s', [`${ROOT}/a.md`, `${ROOT}/b.md`, `${ROOT}/c.md`]));
    tracker.handle(toolResult('toolu_s'));
    await vi.advanceTimersByTimeAsync(300);
    expect(listSession).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/artifacts/artifact-tool-use-tracker.test.ts`
Expected: the first and fourth FAIL (nothing appended / no refresh).

- [ ] **Step 3: Implement**

In `src/renderer/state/artifact-tool-use-tracker.ts`:

`TrackerAppendArgs.type` → `type: 'create' | 'edit' | 'read' | 'delivered';`

Replace `const TRACKED_TOOLS = ['Write', 'Edit', 'MultiEdit', 'Read'];` with:

```ts
const TRACKED_TOOLS = ['Write', 'Edit', 'MultiEdit', 'Read', 'SendUserFile'];
// SendUserFile calls wait for their RESULT: the tool fails on a missing path,
// and recording at call time would create a "delivered" artifact of a file
// that does not exist (the renderer cannot check disk). Bounded so a session
// that dies between call and result cannot grow it forever.
const PENDING_DELIVERIES_CAP = 200;
```

Inside `createArtifactToolUseTracker`, after `let disposed = false;`:

```ts
    const pendingDeliveries = new Map<string, { sessionId: string; files: string[] }>();

    const holdDelivery = (sessionId: string, toolUseId: string | undefined, input: Record<string, unknown>) => {
      if (!toolUseId) return;
      const files = Array.isArray(input.files) ? input.files.filter((f): f is string => typeof f === 'string' && f.length > 0) : [];
      if (!files.length) return;
      if (pendingDeliveries.size >= PENDING_DELIVERIES_CAP) pendingDeliveries.delete(pendingDeliveries.keys().next().value as string);
      pendingDeliveries.set(toolUseId, { sessionId, files });
    };

    const settleDelivery = (toolUseId: string | undefined, isError: boolean) => {
      if (!toolUseId) return;
      const pending = pendingDeliveries.get(toolUseId);
      if (!pending) return;
      pendingDeliveries.delete(toolUseId);
      if (isError) return;                                   // nothing was sent — nothing to record
      const session = deps.getSessions()?.find?.((s) => s.id === pending.sessionId);
      const projectRoot: string = session?.cwd ?? '';
      if (!projectRoot) return;
      // One append per file, all sharing the call's toolUseId: main's replay
      // dedupe is per artifact record, so a 4-file call yields 4 records and a
      // replayed transcript adds nothing.
      const appends = pending.files.map((file) => {
        const resolved = resolveTrackedPath(file, projectRoot);
        const args: TrackerAppendArgs = {
          path: resolved.path, kind: resolved.kind, absolutePath: resolved.absolutePath,
          type: 'delivered', author: 'agent', toolUseId,
        };
        return Promise.resolve(deps.appendVersion(projectRoot, pending.sessionId, args))
          .catch((e) => log('[artifact-tracker] appendVersion (delivered) failed', e));
      });
      void Promise.all(appends).finally(() => scheduleRefresh(pending.sessionId, projectRoot));
    };
```

In `handle`, widen the event type and branch before the existing `tool-use` logic:

```ts
      const event = raw as { type?: string; sessionId?: string; data?: { toolName?: string; toolUseId?: string; toolInput?: Record<string, unknown>; isError?: boolean } } | null;
      if (!event?.type || !event?.sessionId) return;
      if (event.type === 'tool-result') { settleDelivery(event.data?.toolUseId, event.data?.isError === true); return; }
      if (event.type !== 'tool-use') return;
      const toolName: string = event.data?.toolName ?? '';
      const isRead = toolName === 'Read';
      if (!TRACKED_TOOLS.includes(toolName)) return;
      const input = event.data?.toolInput ?? {};
      if (toolName === 'SendUserFile') { holdDelivery(event.sessionId, event.data?.toolUseId, input); return; }
```

(the existing `const targetPath = …` line and everything after it stay as they are). Add `pendingDeliveries.clear();` to `dispose`. Update the file's header comment: the tracker now also listens to `tool-result` for `SendUserFile`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/artifacts/artifact-tool-use-tracker.test.ts && npx tsc --noEmit`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/state/artifact-tool-use-tracker.ts tests/artifacts/artifact-tool-use-tracker.test.ts
git commit -m "feat(artifacts): tracker records SendUserFile deliveries on the successful result"
```

---

### Task 6: Claude Code events carry the line's recorded time

**Why:** the renderer must not auto-open files when an old conversation replays. Native replays keep each event's original `timestamp`, but `parseTranscriptLine` stamps `Date.now()` at parse time, so a Claude Code transcript read from offset 0 (every resume, every app start) looks brand new. The JSONL line's own `timestamp` is the truth; carry it. (Why not the existing `replay-complete` barrier, `ipc-handlers.ts:2519`? It marks only the explicit `transcript:replay-from-start` history load; the watcher's own offset-0 re-read on `startWatching`, `transcript-watcher.ts:385`, is emitted as live events and never passes it.)

**Files:**
- Modify: `src/shared/types.ts` (`TranscriptEvent['data']`), `src/main/transcript-watcher.ts` (`parseTranscriptLine`)
- Test: `tests/transcript-watcher.test.ts`

**Interfaces:**
- Produces: `data.recordedAt?: number` on CC `tool-result` events — epoch ms from the JSONL line's `timestamp`, `0` when the line has none (fail closed).

- [ ] **Step 1: Write the failing test**

Append to `tests/transcript-watcher.test.ts` (it already imports `parseTranscriptLine`; if not, add `import { parseTranscriptLine } from '../src/main/transcript-watcher';`):

```ts
describe('parseTranscriptLine — recordedAt on tool results', () => {
  const line = (extra: Record<string, unknown>) => JSON.stringify({
    type: 'user', uuid: 'u-1', ...extra,
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'Sent 1 file to the user.' }] },
  });

  it("carries the line's own timestamp so the renderer can tell replayed history from a live result", () => {
    const events = parseTranscriptLine(line({ timestamp: '2026-08-25T10:00:00.000Z' }), 'sess');
    const result = events.find((e) => e.type === 'tool-result');
    expect(result?.data.recordedAt).toBe(Date.parse('2026-08-25T10:00:00.000Z'));
  });

  it('fails CLOSED when the line has no usable timestamp (recordedAt 0 = never fresh)', () => {
    const events = parseTranscriptLine(line({}), 'sess');
    expect(events.find((e) => e.type === 'tool-result')?.data.recordedAt).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/transcript-watcher.test.ts`
Expected: FAIL — `recordedAt` is `undefined`.

- [ ] **Step 3: Implement**

`src/shared/types.ts`, inside `TranscriptEvent['data']` next to `images?: string[]`:

```ts
    /** Claude Code tool-result events only: the JSONL line's OWN timestamp
     *  (epoch ms), 0 when the line has none. `timestamp` above is stamped at
     *  PARSE time, which is "now" for a whole transcript read from offset 0 on
     *  resume — so it cannot tell replayed history from a live result. The
     *  Deliverables auto-open rule (deliverable-auto-open.ts) reads this; native
     *  events keep their original `timestamp` through replay and need no field. */
    recordedAt?: number;
```

`src/main/transcript-watcher.ts`, in `parseTranscriptLine` right after `const timestamp = Date.now();`:

```ts
  // The line's own time. Fail closed (0) when absent/unparseable — a result
  // with no recorded time is treated as history, never as fresh.
  const parsedTs = Date.parse(parsed.timestamp);
  const recordedAt = Number.isFinite(parsedTs) ? parsedTs : 0;
```

and in the branch that pushes `type: 'tool-result'` (the object with `data: { toolUseId, toolResult, isError… }`), add `recordedAt,` to that `data` literal.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/transcript-watcher.test.ts && npx tsc --noEmit`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts src/main/transcript-watcher.ts tests/transcript-watcher.test.ts
git commit -m "feat(transcript): tool-result events carry the JSONL line's recordedAt"
```

---

### Task 7: The auto-open rule

**Files:**
- Create: `src/renderer/state/deliverable-auto-open.ts`
- Modify: `src/renderer/hooks/useOpenFilepath.ts` (extract a pure `openFilepath`), `src/renderer/App.tsx` (wire next to the artifact tracker, ~line 1526)
- Test: `tests/deliverable-auto-open.test.ts` (new)

**Interfaces:**
- Consumes: `guardDirtyEditor(action)` from `src/renderer/components/artifact-views/dirty-editor-guard.ts`; `getPlatform()` from `src/renderer/platform.ts`; `chatStateMapRef`/`artifactStateRef`/`dispatchArtifact` already in `App.tsx`; `data.recordedAt` from Task 6.
- Produces: `createDeliverableAutoOpen(deps): { handle(event), dispose() }`; `openFilepath(ctx, sessionId, path): Promise<void>`.

- [ ] **Step 1: Write the failing tests**

Create `tests/deliverable-auto-open.test.ts`:

```ts
// Spec 2026-08-25 §3.1: a SendUserFile result with display:"render" opens the
// FIRST file, once per reply, only when seven guards hold. Each guard is pinned
// alone. The replay pin is the one that matters most: every old conversation
// replays its tool calls through this handler, and a wrong gate would yank
// the file panel open on every session switch.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDeliverableAutoOpen, FRESH_WINDOW_MS } from '../src/renderer/state/deliverable-auto-open';

const NOW = Date.parse('2026-08-25T12:00:00.000Z');

function makeDeps(overrides: Partial<Parameters<typeof createDeliverableAutoOpen>[0]> = {}) {
  const open = vi.fn();
  const deps = {
    getFocusedSessionId: () => 's1',
    canAutoOpen: () => true,
    guard: (action: () => void) => action(),
    open,
    ...overrides,
  };
  return { ao: createDeliverableAutoOpen(deps), open };
}

const use = (id: string, input: Record<string, unknown>, sessionId = 's1') =>
  ({ type: 'tool-use', sessionId, uuid: `u-${id}`, timestamp: NOW, data: { toolName: 'SendUserFile', toolUseId: id, toolInput: input } });
// A live result: recorded just now (CC carries recordedAt; native carries a fresh timestamp).
const result = (id: string, opts: { isError?: boolean; recordedAt?: number; timestamp?: number; sessionId?: string } = {}) =>
  ({ type: 'tool-result', sessionId: opts.sessionId ?? 's1', uuid: `r-${id}`, timestamp: opts.timestamp ?? NOW,
     data: { toolUseId: id, toolResult: 'Sent 1 file to the user.', isError: opts.isError ?? false, ...(opts.recordedAt !== undefined ? { recordedAt: opts.recordedAt } : {}) } });
const userMessage = (sessionId = 's1') => ({ type: 'user-message', sessionId, uuid: 'um', timestamp: NOW, data: { text: 'next' } });

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterEach(() => { vi.useRealTimers(); });

describe('deliverable auto-open', () => {
  it('opens the FIRST file of a fresh, successful render call', () => {
    const { ao, open } = makeDeps();
    ao.handle(use('t1', { files: ['/p/a.html', '/p/b.md'], display: 'render' }));
    ao.handle(result('t1'));
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith('s1', '/p/a.html');
  });

  it('never opens for attach or an omitted display', () => {
    const { ao, open } = makeDeps();
    ao.handle(use('t1', { files: ['/p/a.html'], display: 'attach' }));
    ao.handle(result('t1'));
    ao.handle(use('t2', { files: ['/p/a.html'] }));
    ao.handle(result('t2'));
    expect(open).not.toHaveBeenCalled();
  });

  it('REPLAY: a result recorded long ago never opens (CC recordedAt, native timestamp, and no recordedAt at all)', () => {
    const { ao, open } = makeDeps();
    ao.handle(use('cc', { files: ['/p/a.html'], display: 'render' }));
    ao.handle(result('cc', { recordedAt: NOW - 10 * 60_000 }));            // old line, fresh parse time
    ao.handle(use('nat', { files: ['/p/a.html'], display: 'render' }));
    ao.handle(result('nat', { timestamp: NOW - 10 * 60_000 }));            // native replay keeps its stamp
    ao.handle(use('none', { files: ['/p/a.html'], display: 'render' }));
    ao.handle(result('none', { recordedAt: 0 }));                          // watcher failed closed
    expect(open).not.toHaveBeenCalled();
  });

  it('a result just inside the freshness window opens; just outside does not', () => {
    const { ao, open } = makeDeps();
    ao.handle(use('a', { files: ['/p/a.html'], display: 'render' }));
    ao.handle(result('a', { recordedAt: NOW - FRESH_WINDOW_MS + 1000 }));
    expect(open).toHaveBeenCalledTimes(1);
    ao.handle(userMessage());
    ao.handle(use('b', { files: ['/p/b.html'], display: 'render' }));
    ao.handle(result('b', { recordedAt: NOW - FRESH_WINDOW_MS - 1000 }));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('one auto-open per reply; a user message starts the next reply', () => {
    const { ao, open } = makeDeps();
    ao.handle(use('t1', { files: ['/p/a.html'], display: 'render' }));
    ao.handle(result('t1'));
    ao.handle(use('t2', { files: ['/p/b.html'], display: 'render' }));
    ao.handle(result('t2'));
    expect(open).toHaveBeenCalledTimes(1);
    ao.handle(userMessage());
    ao.handle(use('t3', { files: ['/p/c.html'], display: 'render' }));
    ao.handle(result('t3'));
    expect(open).toHaveBeenCalledTimes(2);
    expect(open).toHaveBeenLastCalledWith('s1', '/p/c.html');
  });

  it('an error result never opens', () => {
    const { ao, open } = makeDeps();
    ao.handle(use('t1', { files: ['/p/a.html'], display: 'render' }));
    ao.handle(result('t1', { isError: true }));
    expect(open).not.toHaveBeenCalled();
  });

  it('only the focused conversation opens', () => {
    const { ao, open } = makeDeps({ getFocusedSessionId: () => 'other' });
    ao.handle(use('t1', { files: ['/p/a.html'], display: 'render' }));
    ao.handle(result('t1'));
    expect(open).not.toHaveBeenCalled();
  });

  it('Android / narrow / non-Electron never open', () => {
    const { ao, open } = makeDeps({ canAutoOpen: () => false });
    ao.handle(use('t1', { files: ['/p/a.html'], display: 'render' }));
    ao.handle(result('t1'));
    expect(open).not.toHaveBeenCalled();
  });

  it('routes the open through the unsaved-edits guard', () => {
    const held: Array<() => void> = [];
    const { ao, open } = makeDeps({ guard: (action) => { held.push(action); } });
    ao.handle(use('t1', { files: ['/p/a.html'], display: 'render' }));
    ao.handle(result('t1'));
    expect(open).not.toHaveBeenCalled();     // parked behind the dialog
    held[0]();
    expect(open).toHaveBeenCalledWith('s1', '/p/a.html');
  });

  it('ignores results with no pending render call and malformed inputs', () => {
    const { ao, open } = makeDeps();
    ao.handle(result('nothing'));
    ao.handle(use('bad', { files: 'x', display: 'render' }));
    ao.handle(result('bad'));
    expect(open).not.toHaveBeenCalled();
  });

  it('REPLAY: the same toolUseId never opens twice even while its result is still fresh (switch away and back, re-dock)', () => {
    const { ao, open } = makeDeps();
    ao.handle(use('t1', { files: ['/p/a.html'], display: 'render' }));
    ao.handle(result('t1'));
    // A session switch replays the whole conversation: the turn boundary
    // resets the per-reply slot, then the identical call + result arrive again.
    ao.handle(userMessage());
    ao.handle(use('t1', { files: ['/p/a.html'], display: 'render' }));
    ao.handle(result('t1'));
    expect(open).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/deliverable-auto-open.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the module**

`src/renderer/state/deliverable-auto-open.ts`:

```ts
// Deliverable auto-open (spec 2026-08-25 §3): when a SendUserFile result whose
// call asked for display:"render" arrives, open the file panel to the call's
// FIRST file — under seven guards, each an injected predicate so it is testable.
// React-free, fed raw transcript events by App.tsx exactly like
// artifact-tool-use-tracker.ts.
//
// WHY the freshness gate instead of a "replaying" flag: there is none. Opening
// an old conversation delivers every tool call it ever made through this same
// channel, and the session's `isThinking` toggles during that replay too. What
// IS reliable is when the result was RECORDED: native events keep their
// original `timestamp` through replay; Claude Code results carry the JSONL
// line's own time as `data.recordedAt` (transcript-watcher.ts), because the
// watcher's `timestamp` is stamped at parse time. A result older than
// FRESH_WINDOW_MS is history. And because a session switch replays the whole
// conversation, every honored toolUseId is remembered for the life of this
// renderer: the same result can never open twice, however fresh. What remains
// (spec §8): an app relaunch within a minute of a render result opens it once.
export const FRESH_WINDOW_MS = 60_000;
const PENDING_CAP = 200;
const HONORED_CAP = 500;

export interface DeliverableAutoOpenDeps {
  /** The focused conversation (App.tsx `sessionId` state). */
  getFocusedSessionId: () => string | null;
  /** Electron + wide viewport. False on Android, in a remote browser, and on narrow windows. */
  canAutoOpen: () => boolean;
  /** Runs `action` now, or behind the unsaved-edits dialog (guardDirtyEditor). */
  guard: (action: () => void) => void;
  /** Open a file in the panel by the same path a tile click takes. */
  open: (sessionId: string, path: string) => void;
  /** Injectable clock for tests. */
  now?: () => number;
}

export interface DeliverableAutoOpen {
  handle: (event: unknown) => void;
  dispose: () => void;
}

type Ev = {
  type?: string;
  sessionId?: string;
  timestamp?: number;
  data?: { toolName?: string; toolUseId?: string; toolInput?: Record<string, unknown>; isError?: boolean; recordedAt?: number };
} | null;

export function createDeliverableAutoOpen(deps: DeliverableAutoOpenDeps): DeliverableAutoOpen {
  const now = deps.now ?? (() => Date.now());
  // render-requesting calls, keyed by toolUseId — the result carries no input.
  const pending = new Map<string, { sessionId: string; firstFile: string }>();
  // Sessions that already auto-opened in their current reply; a user message
  // (both runtimes emit one at every turn start) opens the next slot.
  const openedThisReply = new Set<string>();
  // toolUseIds already honored — insertion-ordered so the cap evicts oldest.
  const honored = new Set<string>();
  let disposed = false;

  const handle = (raw: unknown) => {
    if (disposed) return;
    const event = raw as Ev;
    if (!event?.type || !event.sessionId) return;

    if (event.type === 'user-message') { openedThisReply.delete(event.sessionId); return; }

    if (event.type === 'tool-use') {
      if (event.data?.toolName !== 'SendUserFile') return;
      const id = event.data.toolUseId;
      const input = event.data.toolInput ?? {};
      if (!id || input.display !== 'render') return;           // #1 explicit render only
      const files = Array.isArray(input.files) ? input.files.filter((f): f is string => typeof f === 'string' && f.length > 0) : [];
      if (!files.length) return;
      if (pending.size >= PENDING_CAP) pending.delete(pending.keys().next().value as string);
      pending.set(id, { sessionId: event.sessionId, firstFile: files[0] });
      return;
    }

    if (event.type !== 'tool-result') return;
    const id = event.data?.toolUseId;
    if (!id) return;
    const call = pending.get(id);
    if (!call) return;
    pending.delete(id);
    if (event.data?.isError) return;                            // nothing was sent
    const recordedAt = event.data?.recordedAt ?? event.timestamp ?? 0;
    if (now() - recordedAt > FRESH_WINDOW_MS) return;           // #4 history, not live
    if (honored.has(id)) return;                                // #7 already opened once (replay)
    if (!deps.canAutoOpen()) return;                            // #2
    if (deps.getFocusedSessionId() !== call.sessionId) return;  // #3
    if (openedThisReply.has(call.sessionId)) return;            // #5 one per reply
    openedThisReply.add(call.sessionId);
    if (honored.size >= HONORED_CAP) honored.delete(honored.values().next().value as string);
    honored.add(id);
    deps.guard(() => deps.open(call.sessionId, call.firstFile)); // #6 unsaved edits
  };

  return {
    handle,
    dispose: () => { disposed = true; pending.clear(); openedThisReply.clear(); honored.clear(); },
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/deliverable-auto-open.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Extract a pure `openFilepath` so App.tsx can open without a hook**

Rewrite `src/renderer/hooks/useOpenFilepath.ts` (same logic, now callable outside React):

```ts
// useOpenFilepath — the ONE resolve-and-open path for "a file mentioned in
// chat". Extracted from FilepathToken (2026-08-25) so the SendUserFile card
// opens files by exactly the same rules as a filepath pill: session list →
// whole project → artifactify. Two copies of this logic would drift; the pill
// and the card must never disagree about whether a click opens something.
// `openFilepath` is the pure core so App.tsx's auto-open (deliverable-auto-open.ts)
// takes the same path without a hook.
//
// Contract: clicking a file in chat ALWAYS opens the artifact viewer, NEVER
// Project View (artifacts rule → UI invariants).
import { useCallback } from 'react';
import { useArtifactOptional } from '../state/ArtifactContext';
import type { ArtifactState } from '../state/artifact-tracker';
import type { ArtifactAction } from '../state/artifact-actions';
import type { ArtifactRecord } from '../../shared/artifacts/types';
import { findBestMatch, buildArtifactifyArgs } from '../components/filepath-match';

export interface OpenFilepathCtx {
  state: ArtifactState;
  dispatch: (action: ArtifactAction) => void;
}

export async function openFilepath(ctx: OpenFilepathCtx, sessionId: string, path: string): Promise<void> {
  const { state, dispatch } = ctx;
  const name = path.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? path;

  // Open the drawer first so there's an immediate response regardless of how
  // the lookup below resolves. If resolution fails, set a pill-error note —
  // otherwise the drawer's generic "no files yet" empty state would directly
  // contradict the file the user just clicked.
  dispatch({ type: 'DRAWER_OPENED', sessionId });
  dispatch({ type: 'PILL_ERROR_CLEARED', sessionId });
  const failed = () => dispatch({
    type: 'PILL_RESOLVE_FAILED',
    sessionId,
    message: `Couldn’t open ${name} — the file wasn’t found in this project.`,
  });

  // 1. Already in this session's live list? Select it. findBestMatch prefers
  //    an exact path match over the suffix-tolerant fallback so a same-named
  //    file elsewhere can't shadow it.
  const sessMatch = findBestMatch(state.sessionArtifacts[sessionId] ?? [], path);
  if (sessMatch) {
    dispatch({ type: 'ACTIVE_ARTIFACT_SET', sessionId, artifactId: sessMatch.id });
    return;
  }

  // 2. Not in this session — resolve against the WHOLE project: every tracked
  //    artifact (any session, including deleted) plus on-disk files, and
  //    inject the match into the session list so the drawer can show it.
  const cwd = state.sessionCwd?.[sessionId];
  if (!cwd) { failed(); return; } // nothing to resolve without a root — say so
  try {
    const [projRes, filesRes] = await Promise.all([
      (window.claude as any).artifacts.listProject(cwd),
      (window.claude as any).artifacts.listAllFiles(cwd),
    ]);
    const trackedList: ArtifactRecord[] = projRes?.ok ? (projRes.artifacts ?? []) : [];
    const filesList: ArtifactRecord[] = filesRes?.ok ? (filesRes.files ?? []) : [];
    const projMatch: ArtifactRecord | undefined =
      findBestMatch(trackedList, path) ?? findBestMatch(filesList, path);
    if (projMatch) {
      dispatch({ type: 'SESSION_ARTIFACT_UPSERTED', sessionId, artifact: projMatch });
      dispatch({ type: 'ACTIVE_ARTIFACT_SET', sessionId, artifactId: projMatch.id });
      return;
    }

    // 3. Nothing matched anywhere — ARTIFACTIFY the path. A file visible in
    //    chat must open no matter how it was created or where it lives.
    //    appendVersion records it (author 'user', type 'read'); this is the
    //    only path that PERSISTS a brand-new artifact.
    const args = buildArtifactifyArgs(path, cwd);
    if (!args) { failed(); return; } // e.g. a ~/ path the renderer can't expand
    await (window.claude as any).artifacts.appendVersion(cwd, sessionId, args);
    const refreshed = await (window.claude as any).artifacts.listSession(sessionId, cwd);
    let selected = false;
    if (refreshed?.ok && Array.isArray(refreshed.artifacts)) {
      dispatch({ type: 'SESSION_ARTIFACTS_LOADED', sessionId, artifacts: refreshed.artifacts });
      const added = findBestMatch(refreshed.artifacts as ArtifactRecord[], path);
      if (added) {
        dispatch({ type: 'ACTIVE_ARTIFACT_SET', sessionId, artifactId: added.id });
        selected = true;
      }
    }
    if (!selected) failed();
  } catch { failed(); }
}

export function useOpenFilepath(sessionId: string): (path: string) => Promise<void> {
  // Optional: the buddy window / sandbox render without ArtifactProvider. The
  // caller still renders its pill/card; the click is a no-op there.
  const artifactCtx = useArtifactOptional();
  return useCallback(async (path: string) => {
    if (!artifactCtx) return;
    await openFilepath(artifactCtx, sessionId, path);
  }, [artifactCtx, sessionId]);
}
```

Run `npx tsc --noEmit`. If `ArtifactContextValue.dispatch` is a `React.Dispatch<ArtifactAction>`, it is assignable to `(action: ArtifactAction) => void` and this compiles; if the union in `artifact-actions.ts` has a different exported name, use that name (`grep '^export type' src/renderer/state/artifact-actions.ts`).

- [ ] **Step 6: Wire it in App.tsx**

Near line 180 (next to `sessionsRef`):

```ts
  // The focused conversation, readable from mount-once effects (the
  // deliverable auto-open rule needs it without re-subscribing per switch).
  const focusedSessionIdRef = useRef<string | null>(null);
  useEffect(() => { focusedSessionIdRef.current = sessionId; }, [sessionId]);
```

Add imports at the top of `App.tsx`:

```ts
import { createDeliverableAutoOpen } from './state/deliverable-auto-open';
import { openFilepath } from './hooks/useOpenFilepath';
import { getPlatform } from './platform';
```

(`guardDirtyEditor` is already imported at line 4.) Inside the same effect that builds `artifactTracker` (after `const artifactToolUseHandler = …`):

```ts
    // Deliverables auto-open (spec 2026-08-25 §3): a SendUserFile result whose
    // call asked for display:"render" opens the panel to its first file — once
    // per reply, focused conversation only, desktop only, never for replayed
    // history, and never over unsaved edits. Same raw event feed as the tracker.
    const deliverableAutoOpen = createDeliverableAutoOpen({
      getFocusedSessionId: () => focusedSessionIdRef.current,
      canAutoOpen: () => getPlatform() === 'electron' && !window.matchMedia?.('(max-width: 639.98px)').matches,
      guard: guardDirtyEditor,
      open: (sid, path) => {
        void openFilepath({ state: artifactStateRef.current, dispatch: dispatchArtifact }, sid, path);
      },
    });
    const deliverableAutoOpenHandler = (window.claude.on as any).transcriptEvent?.((event: any) => {
      deliverableAutoOpen.handle(event);
    });
```

and in the cleanup, after the tracker lines:

```ts
      if (deliverableAutoOpenHandler) window.claude.off('transcript:event', deliverableAutoOpenHandler);
      deliverableAutoOpen.dispose();
```

`dispatchArtifact` must be in scope in that effect (it is used at line ~1534 already). The narrow-viewport query string is the same `(max-width: 639.98px)` `use-narrow-viewport.ts` uses — keep them identical.

- [ ] **Step 7: Verify**

Run: `cd /home/destin/youcoded-dev && bash scripts/verify.sh worktrees/send-user-file`
Expected: exit 0 (tsc, related tests, knip, eslint, ast-grep). `knip` must not flag `FRESH_WINDOW_MS` (it is imported by the test) or `openFilepath` (imported by App.tsx).

- [ ] **Step 8: Commit**

```bash
cd /home/destin/youcoded-dev/worktrees/send-user-file/desktop
git add src/renderer/state/deliverable-auto-open.ts tests/deliverable-auto-open.test.ts src/renderer/hooks/useOpenFilepath.ts src/renderer/App.tsx
git commit -m "feat(deliverables): auto-open the first rendered file once per reply — fresh results only, never twice"
```

**CHECKPOINT 2.5 (Destin, dev instance — the steering point; Task 8 waits for it):** `bash scripts/run-dev.sh worktrees/send-user-file --label "Deliverables"`, open a **Claude Code** session — its `SendUserFile` exists today, so no native tool is needed to see this. Ask Claude to write a short HTML page and send it with `display: "render"`; then once more with `display` left out. Expect: the card is last in the bubble; the panel opens to the page exactly once for the `render` call and not at all for the omitted one; switch to another conversation and back — nothing opens; quit, relaunch after a minute, resume — nothing opens. This is the first time the one behaviour that moves the screen without a click is on a real screen, and the spec-§12 calls are still cheap to flip here: first file vs last (R3), omitted = attach (R2 — note Claude Code's own tool text tells Claude to *leave `display` unset*, so with R2 most Claude Code deliveries will show the card and never open the panel; keep or flip, but decide it knowingly), the 60 s window (R4). Why not the workbench: its fixtures feed the chat reducer directly (`dev/workbench/fixture-loader.ts`), never `transcript:event`, so nothing hanging off that channel — the tracker, this module — runs there.

---

### Task 8: The native `SendUserFile` tool

**Files:**
- Create: `src/main/harness/tools/send-user-file.ts`
- Modify: `src/main/harness/tools/index.ts`, `src/shared/harness-manifest.ts:3,35-38`, `src/shared/permission-types.ts:134-152`, `tests/tool-registry-manifest.test.ts:116-142` (`BOUNDS_EXEMPT`), `tests/permission-engine.test.ts`, `tests/specialist-registry.test.ts`
- Test: `tests/send-user-file-tool.test.ts` (new)

**Interfaces:**
- Consumes: `defineTool` (`tools/registry.ts`), `resolveP`/`toPosix` (`tools/guards.ts`), `ToolContext` (`tools/types.ts`).
- Produces: `SendUserFileTool: NativeTool`; result text `Sent N file(s) to the user.`; error text `SendUserFile failed — nothing was sent:` + one `- <path>: <reason>` line per bad path.

- [ ] **Step 1: Write the failing tests**

Create `tests/send-user-file-tool.test.ts`:

```ts
// Native mirror of Claude Code's SendUserFile (spec 2026-08-25 §6). Stateless:
// validates paths, reports, and leaves the one-render-per-reply rule to the
// renderer. Errors name every bad path WITH its reason — "does not exist" about
// a "~" path that exists would be a lie (docs/error-message-standards.md).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SendUserFileTool } from '../src/main/harness/tools/send-user-file';
import type { ToolContext } from '../src/main/harness/tools/types';

let dir: string;
let ctx: ToolContext;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'send-user-file-'));
  ctx = { sessionId: 'test', cwd: dir, signal: new AbortController().signal, readRegistry: new Map(), todos: [] };
  fs.writeFileSync(path.join(dir, 'report.md'), '# r\n');
  fs.mkdirSync(path.join(dir, 'out'));
  fs.writeFileSync(path.join(dir, 'out', 'chart.png'), Buffer.from([0x89, 0x50]));
});
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe('SendUserFile', () => {
  it('sends one relative file', async () => {
    const r = await SendUserFileTool.execute({ files: ['report.md'] }, ctx);
    expect(r.isError).toBeFalsy();
    expect(r.text).toBe('Sent 1 file to the user.');
  });

  it('sends several absolute files; display and caption do not change the text', async () => {
    const r = await SendUserFileTool.execute(
      { files: [path.join(dir, 'report.md'), path.join(dir, 'out', 'chart.png')], caption: 'both', display: 'render', status: 'normal' },
      ctx,
    );
    expect(r.isError).toBeFalsy();
    expect(r.text).toBe('Sent 2 files to the user.');
  });

  it('a missing file fails the WHOLE call and names the path', async () => {
    const r = await SendUserFileTool.execute({ files: ['report.md', 'nope.md'] }, ctx);
    expect(r.isError).toBe(true);
    expect(r.text).toContain('nothing was sent');
    expect(r.text).toContain('nope.md does not exist');
    expect(r.text).not.toContain('report.md');
  });

  it('a directory is named as a directory, not as missing', async () => {
    const r = await SendUserFileTool.execute({ files: ['out'] }, ctx);
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/out is a directory/);
    expect(r.text).not.toContain('does not exist');
  });

  it('a "~" path says "~" is not expanded — never "does not exist"', async () => {
    const r = await SendUserFileTool.execute({ files: ['~/report.md'] }, ctx);
    expect(r.isError).toBe(true);
    expect(r.text).toContain('"~" is not expanded');
    expect(r.text).not.toContain('does not exist');
  });

  it('lists every bad path with its own reason', async () => {
    const r = await SendUserFileTool.execute({ files: ['nope.md', 'out', '~/x'] }, ctx);
    expect(r.text.split('\n').filter((l) => l.startsWith('- '))).toHaveLength(3);
  });

  it('has no permission subject (no cwd jail — a /tmp chart must go through)', () => {
    expect(SendUserFileTool.permissionSubject({ files: ['/tmp/x.png'] })).toBeUndefined();
  });

  it('tells the model that only the first render per reply is honored', () => {
    expect(SendUserFileTool.description).toMatch(/first such request in a reply/);
    expect(SendUserFileTool.description).toMatch(/not scratch/i);
  });
});
```

Add to `tests/permission-engine.test.ts` inside `describe('decidePermission', …)`:

```ts
  it('SendUserFile is allowed in every mode baseline — it reads and writes nothing', () => {
    for (const mode of ['ask', 'auto-edit', 'full-auto'] as const) {
      expect(decidePermission('SendUserFile', '', layers(mode))).toMatchObject({ action: 'allow', denyListed: false });
    }
  });
```

Add to `tests/specialist-registry.test.ts` after the `allowedTools` membership test:

```ts
  it('no builtin specialist is granted SendUserFile — a specialist reports to its parent, not the user', () => {
    for (const d of listSpecialists()) expect(d.allowedTools).not.toContain('SendUserFile');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/send-user-file-tool.test.ts tests/permission-engine.test.ts tests/specialist-registry.test.ts`
Expected: send-user-file FAILS (module missing); permission-engine's new case FAILS (`ask`); specialist case PASSES.

- [ ] **Step 3: Create the tool**

`src/main/harness/tools/send-user-file.ts`:

```ts
// SendUserFile — the native mirror of Claude Code's built-in (spec 2026-08-25
// §6). Same name and inputs, so the renderer needs ONE Deliverables card.
// Stateless on purpose: it validates the paths and reports. The renderer owns
// the card, the auto-open rule and its one-render-per-reply limit
// (renderer/state/deliverable-auto-open.ts) — enforcing that here would have
// needed per-turn state plus a flag threaded through the result event.
import * as fs from 'fs';
import { z } from 'zod';
import { defineTool } from './registry';
import { resolveP, toPosix } from './guards';

export const SEND_USER_FILE_DESCRIPTION = [
  'Send finished files to the user — a report, a mockup, a screenshot, a built page — as a "Deliverables" card with previews they can open.',
  'Use it for deliverables the user will want to look at, not scratch or intermediate files, and do not re-send a file that has not changed.',
  'display: "render" asks to show ONE file immediately; only the first such request in a reply is honored. Everything else attaches to the card.',
  'Paths resolve against the working directory; "~" is not expanded, so use absolute paths for files outside the project.',
].join(' ');

export const SendUserFileTool = defineTool({
  name: 'SendUserFile',
  description: SEND_USER_FILE_DESCRIPTION,
  // Compact form for small local models (simplified presentation, spec §4.2).
  shortDescription: 'Hand finished files to the user as a Deliverables card. display: "render" shows one file now (first request per reply).',
  inputSchema: z.object({
    files: z.array(z.string()).min(1).describe('File paths to send — absolute, or relative to the working directory.'),
    caption: z.string().optional().describe('One line of context for the files.'),
    status: z.enum(['normal', 'proactive']).optional().describe('Accepted for parity with Claude Code; ignored.'),
    display: z.enum(['render', 'attach']).optional().describe('"render": show the first file immediately (first request per reply only). "attach" or omitted: just the card.'),
  }),
  // Reads nothing, writes nothing — it names files the user should look at.
  // No path subject, so checkPathGuard's cwd jail does not apply: a chart in
  // /tmp must go through. The viewer applies its own read guards on open.
  permissionSubject: () => undefined,
  async execute(args, ctx) {
    const problems: string[] = [];
    for (const raw of args.files) {
      if (raw.startsWith('~')) {
        problems.push(`${raw}: "~" is not expanded here; use an absolute path`);
        continue;
      }
      const abs = resolveP(raw, ctx.cwd);
      let st: fs.Stats;
      try {
        st = fs.statSync(abs);            // follows symlinks: a link to a file is a file
      } catch {
        problems.push(`${toPosix(abs)} does not exist`);
        continue;
      }
      if (st.isDirectory()) { problems.push(`${toPosix(abs)} is a directory`); continue; }
      if (!st.isFile()) problems.push(`${toPosix(abs)} is not a regular file`);
    }
    if (problems.length) {
      // The WHOLE call fails: half-delivering would leave the model believing
      // the missing file reached the user.
      return { text: `SendUserFile failed — nothing was sent:\n${problems.map((p) => `- ${p}`).join('\n')}`, isError: true };
    }
    const n = args.files.length;
    return { text: `Sent ${n} file${n === 1 ? '' : 's'} to the user.` };
  },
});
```

- [ ] **Step 4: Register, advertise, allow, exempt**

`src/main/harness/tools/index.ts`:

```ts
import { SendUserFileTool } from './send-user-file';
…
/** Plan A core set + Plan B tools + SendUserFile (2026-08-25). WebFetch/WebSearch
 *  are the web pair (free in every preset/mode — see permission-types.rulesForMode);
 *  AskUserQuestion (interactive, driver-routed) comes last. */
export const CORE_TOOLS: NativeTool[] = [ReadTool, WriteTool, EditTool, BashTool, GlobTool, GrepTool, TodoWriteTool, WebFetchTool, WebSearchTool, SendUserFileTool, AskUserQuestionTool];
```

`src/shared/harness-manifest.ts`: line 3 `both carry the full ten-tool suite` → `both carry the full eleven-tool suite`; and

```ts
export const NATIVE_TOOL_NAMES = [
  'Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep',
  'WebFetch', 'WebSearch', 'TodoWrite', 'AskUserQuestion', 'SendUserFile',
] as const;
```

`src/shared/permission-types.ts`, in `alwaysAllowed` after the `ModelSearch` entry:

```ts
    // SendUserFile (2026-08-25) reads and writes nothing: it names files the
    // user should look at, and the viewer's own read guards apply when they
    // open. Nothing to ask about, in any mode.
    { tool: 'SendUserFile', action: 'allow' },
```

`tests/tool-registry-manifest.test.ts`, in `BOUNDS_EXEMPT`:

```ts
  SendUserFile: 'returns a one-line confirmation or a per-path error list; never file or process output',
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/send-user-file-tool.test.ts tests/permission-engine.test.ts tests/specialist-registry.test.ts tests/tool-registry-manifest.test.ts tests/harness-tool-conformance.test.ts tests/harness-tool-presentation.test.ts`
Expected: PASS. (`harness-tool-presentation.test.ts:40-46` caps only the *simplified-profile* `description` of WebSearch at 200 chars and asserts WebSearch/Bash simplified < full; nothing there names `shortDescription` or any other tool — verified 2026-08-25. Keep the short description under 200 chars anyway so a future sweep over every tool passes.)

- [ ] **Step 6: Verify and commit**

```bash
cd /home/destin/youcoded-dev && bash scripts/verify.sh worktrees/send-user-file   # Expected: exit 0
cd /home/destin/youcoded-dev/worktrees/send-user-file/desktop
git add src/main/harness/tools/send-user-file.ts src/main/harness/tools/index.ts src/shared/harness-manifest.ts src/shared/permission-types.ts tests/send-user-file-tool.test.ts tests/tool-registry-manifest.test.ts tests/permission-engine.test.ts tests/specialist-registry.test.ts
git commit -m "feat(harness): native SendUserFile — stateless mirror of Claude Code's tool, always allowed"
```

**CHECKPOINT 3 (Destin, dev instance — interactive, not a rig):** `bash scripts/run-dev.sh worktrees/send-user-file --label "Deliverables"`, open a native session, ask the model to write a short HTML page and send it with `display: "render"`. Expect: the card appears last in the bubble, the panel opens to the page once, a second `render` in the same reply does not move it, and switching to an old conversation never opens anything. Then the same with a Claude Code session. Spec §10 item 4. Offer — do not run — the paid harness eval (`test-engine/harness-eval.mjs --dry-run` is free).

---

### Task 9: Anchors, map rows, spec status, roadmap

**Files (workspace `/home/destin/youcoded-dev`):**
- Modify: `.claude/rules/artifacts.md` (frontmatter `verify:` only), `.claude/rules/harness-tools.md` (frontmatter `verify:` only), `docs/MAP.md`, `docs/active/specs/2026-08-25-deliverables-card-design.md` (status), `ROADMAP.md`

- [ ] **Step 1: Add verify anchors (no body words — both rules sit at 599/600)**

`.claude/rules/artifacts.md` frontmatter, append under `verify:`:

```yaml
  - test: youcoded/desktop/tests/deliverable-auto-open.test.ts
  - test: youcoded/desktop/tests/deliverables-card.test.tsx
  - path: youcoded/desktop/src/renderer/state/deliverable-auto-open.ts
    contains: "FRESH_WINDOW_MS"
  - path: youcoded/desktop/src/shared/artifacts/types.ts
    contains: "'delivered'"
```

`.claude/rules/harness-tools.md` frontmatter, append under `verify:`:

```yaml
  - test: youcoded/desktop/tests/send-user-file-tool.test.ts
  - path: youcoded/desktop/src/main/harness/tools/send-user-file.ts
    contains: "permissionSubject: \\(\\) => undefined"
```

Run `node scripts/audit-anchors.mjs` — Expected: all anchors resolve, budgets unchanged.

- [ ] **Step 2: MAP rows**

`docs/MAP.md` — Artifact viewer row: add `youcoded/desktop/src/renderer/state/deliverable-auto-open.ts` and `youcoded/desktop/src/renderer/components/DeliverablesCard.tsx` to entry points; add the two new tests to guard tests. Native runtime row: add `youcoded/desktop/src/main/harness/tools/send-user-file.ts` and `youcoded/desktop/tests/send-user-file-tool.test.ts`.

- [ ] **Step 3: Spec + roadmap**

Spec frontmatter `status: draft` → `status: active` (it becomes `shipped` and moves to `docs/archive/specs/` when the branch merges — the finishing step, with Destin). ROADMAP entry (Features, "Deliverables card") stays `[ ]` until merge.

- [ ] **Step 4: Commit the workspace docs — this feature's hunks only**

On 2026-08-25 the workspace already held **unrelated** uncommitted edits to `.claude/rules/artifacts.md` and `.claude/rules/ipc-bridge.md` (word-budget trims) and `CLAUDE.md` ("seven routes" → "12 today"). A plain `git add` of those files would fold them into this feature's commit. Check first, commit them on their own, then stage this feature:

```bash
cd /home/destin/youcoded-dev
git status --short .claude/rules CLAUDE.md          # anything modified BEFORE this task started is not ours
git stash push -- .claude/rules/ipc-bridge.md CLAUDE.md .claude/rules/artifacts.md   # if pre-existing edits are present
# … re-apply this task's anchor edit to artifacts.md/harness-tools.md if the stash took it …
git add .claude/rules/artifacts.md .claude/rules/harness-tools.md docs/MAP.md docs/active/specs/2026-08-25-deliverables-card-design.md docs/active/plans/2026-08-25-deliverables-card.md ROADMAP.md
git diff --cached --stat                            # only the files above, only deliverables hunks
git commit -m "docs(deliverables): plan, anchors, MAP rows; spec active"
git stash pop                                       # the unrelated trims come back for their own commit
```

Simpler when the pre-existing diff is small: `git add -p` the two rule files and take only the `verify:` hunks. `CLAUDE.md` is not this feature's file; leave it alone.

---

### Task 10: Finish (with Destin)

- [ ] `bash scripts/verify.sh worktrees/send-user-file --full` exits 0; the Kotlin `ArtifactStoreTest` ran (or the handoff says it could not).
- [ ] Checkpoints 1, 2, 2.5 and 3 signed off.
- [ ] Destin edits `~/.claude/CLAUDE.md` "Environment Notes" with the spec §7 wording **at merge time**.
- [ ] Use `superpowers:finishing-a-development-branch`: PR from `feat/send-user-file-card`, merge + push, archive the spec and plan to `docs/archive/`, flip the ROADMAP item to `[x]`, remove the worktree and branch, shut the dev instance.

---

## Self-review (done while writing; revised after the 2026-08-25 plan review)

- **Spec coverage:** §2 fixes → T1; §2 pins → T2; §3 → T6+T7 (gate: recorded time + honored-toolUseId memory; spec R4/R11); §4 → T4+T5 (T4 now includes the Kotlin `lastModified` guard — the tracker runs on Android); §5 → T2 (+ buddy strip deliberately unchanged); §6 → T8; §7 → T10; §9 tests → T1,2,4,5,6,7,8; §10 checkpoints → after T3, T4, **T7 (dev instance, Claude Code session — the workbench cannot drive `transcript:event` consumers)**, T8.
- **Review corrections folded in (2026-08-25):** Kotlin store bumps `lastModified` unconditionally (was "comment-only"); Task 9 must not sweep the workspace's unrelated rule/CLAUDE.md edits; `replay-complete` exists but does not cover the watcher's offset-0 re-read; T1 is a three-hunk diff, not a component re-paste; two class-name/scroll-fake tests dropped; drawer test matches the word, not `.text-3xs`; presentation-test hedge pointed at the real assertion; §12 decisions flagged as vetoable until T6.
- **Type consistency:** `TrackerAppendArgs.type` (T5) matches `AppendVersionInput.type` and the IPC arg union (T4); `openFilepath(ctx, sessionId, path)` (T7 step 5) is what App.tsx calls (T7 step 6); `FRESH_WINDOW_MS` exported and imported by the test; `data.recordedAt` (T6) is what T7 reads.
- **Known soft spot:** T7's `OpenFilepathCtx.dispatch` type — resolved by the `tsc` step with the grep given.
