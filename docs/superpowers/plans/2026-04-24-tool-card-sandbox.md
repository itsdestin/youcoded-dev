# ToolCard Dev Sandbox — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dev-only `?mode=tool-sandbox` page in the desktop renderer that renders real `<ToolCard>` / `<ToolBody>` components against fixture tool calls, so we can iterate on compact view designs with Vite HMR instead of triggering live Claude Code sessions.

**Architecture:** Fixtures are JSONL snippets (one `tool_use` + one matching `tool_result` per file) imported at build time via `import.meta.glob`. A pure fixture-loader module parses each snippet into the existing `TRANSCRIPT_TOOL_USE` / `TRANSCRIPT_TOOL_RESULT` reducer actions, applies them to a throwaway `ChatState`, and extracts the resulting `ToolCallState` objects. The sandbox page mounts a `<ChatProvider>` with that seeded state and renders each tool as a `<ToolCard>` with `expanded: true` forced. App.tsx adds a new render branch gated on `import.meta.env.DEV && mode === 'tool-sandbox'`.

**Tech Stack:** React 18, TypeScript, Vite (HMR + `import.meta.glob`), Vitest for unit tests.

**Repos:**
- `youcoded/` — all code changes land here
- `youcoded-dev/` — plan lives in `docs/superpowers/plans/`

---

## Task 0: Worktree setup

**Files:** n/a (git-only)

- [ ] **Step 0.1: Create worktree and branch**

```bash
cd /c/Users/desti/youcoded-dev/youcoded && git fetch origin && git worktree add ../youcoded-worktrees/tool-card-sandbox -b tool-card-sandbox origin/master
```

Expected: worktree created at `C:/Users/desti/youcoded-dev/youcoded-worktrees/tool-card-sandbox` on branch `tool-card-sandbox`.

- [ ] **Step 0.2: Verify dev server builds from worktree**

```bash
cd /c/Users/desti/youcoded-dev/youcoded-worktrees/tool-card-sandbox/desktop && npm ci
```

Expected: dependencies install cleanly. No further verification needed here — later tasks verify compilation.

---

## Task 1: Fixture loader (pure parser, TDD)

**Files:**
- Create: `desktop/src/renderer/dev/fixture-loader.ts`
- Test: `desktop/src/renderer/dev/fixture-loader.test.ts`

The loader takes the raw string contents of a `.jsonl` fixture file, parses the two JSON lines (one `tool_use`, one `tool_result`), converts them into `TRANSCRIPT_TOOL_USE` / `TRANSCRIPT_TOOL_RESULT` actions, applies them to a fresh reducer state, and returns the resulting `ToolCallState` array.

- [ ] **Step 1.1: Write the failing test**

Create `desktop/src/renderer/dev/fixture-loader.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { loadFixture } from './fixture-loader';

describe('loadFixture', () => {
  it('parses a Skill tool_use + tool_result pair into a completed ToolCallState', () => {
    const raw = [
      '{"type":"tool_use","id":"toolu_01ABC","name":"Skill","input":{"skill":"superpowers:brainstorming"}}',
      '{"tool_use_id":"toolu_01ABC","type":"tool_result","content":"Launching skill: superpowers:brainstorming","is_error":false}',
    ].join('\n');

    const result = loadFixture('skill-brainstorming', raw);

    expect(result.tools).toHaveLength(1);
    expect(result.tools[0]).toMatchObject({
      toolUseId: 'toolu_01ABC',
      toolName: 'Skill',
      input: { skill: 'superpowers:brainstorming' },
      status: 'completed',
      response: 'Launching skill: superpowers:brainstorming',
    });
    expect(result.error).toBeUndefined();
  });

  it('marks is_error:true results as failed status', () => {
    const raw = [
      '{"type":"tool_use","id":"toolu_01XYZ","name":"Bash","input":{"command":"false"}}',
      '{"tool_use_id":"toolu_01XYZ","type":"tool_result","content":"exit code 1","is_error":true}',
    ].join('\n');

    const result = loadFixture('bash-failure', raw);

    expect(result.tools[0].status).toBe('failed');
    expect(result.tools[0].error).toBe('exit code 1');
  });

  it('returns an error field when the fixture is malformed', () => {
    const result = loadFixture('broken', 'not valid json\n');

    expect(result.tools).toEqual([]);
    expect(result.error).toContain('parse');
  });
});
```

- [ ] **Step 1.2: Run test to verify it fails**

```bash
cd /c/Users/desti/youcoded-dev/youcoded-worktrees/tool-card-sandbox/desktop && npx vitest run src/renderer/dev/fixture-loader.test.ts
```

Expected: FAIL — `Cannot find module './fixture-loader'`.

- [ ] **Step 1.3: Implement the loader**

Create `desktop/src/renderer/dev/fixture-loader.ts`:

```typescript
// Dev-only fixture parser: converts a 2-line JSONL snippet (tool_use + tool_result)
// into real ToolCallState objects by running it through the actual chat reducer.
// This keeps the sandbox honest — any reducer drift surfaces here automatically.

import { chatReducer } from '../state/chat-reducer';
import type { ChatState, ChatAction, ToolCallState } from '../state/chat-types';

const SANDBOX_SESSION_ID = 'sandbox';

function makeInitialState(): ChatState {
  // Minimal state matching what chatReducer() returns for an unknown action on undefined.
  return chatReducer(undefined as unknown as ChatState, { type: '@@INIT' } as unknown as ChatAction);
}

interface LoadResult {
  tools: ToolCallState[];
  error?: string;
}

export function loadFixture(name: string, raw: string): LoadResult {
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);

  try {
    let state = makeInitialState();

    for (const line of lines) {
      const parsed = JSON.parse(line);

      if (parsed.type === 'tool_use') {
        state = chatReducer(state, {
          type: 'TRANSCRIPT_TOOL_USE',
          sessionId: SANDBOX_SESSION_ID,
          uuid: `${name}-use-${parsed.id}`,
          toolUseId: parsed.id,
          toolName: parsed.name,
          toolInput: parsed.input ?? {},
        });
      } else if (parsed.type === 'tool_result') {
        const content = typeof parsed.content === 'string'
          ? parsed.content
          : JSON.stringify(parsed.content);
        state = chatReducer(state, {
          type: 'TRANSCRIPT_TOOL_RESULT',
          sessionId: SANDBOX_SESSION_ID,
          uuid: `${name}-res-${parsed.tool_use_id}`,
          toolUseId: parsed.tool_use_id,
          result: content,
          isError: parsed.is_error === true,
        });
      }
    }

    const session = state.sessions[SANDBOX_SESSION_ID];
    const tools = session ? Array.from(session.toolCalls.values()) : [];
    return { tools };
  } catch (err) {
    return { tools: [], error: `parse error in ${name}: ${(err as Error).message}` };
  }
}
```

**Note on state shape assumption:** the code above assumes `ChatState` has a `sessions` map keyed by sessionId, and each session has a `toolCalls` Map. If the actual shape differs, adjust the extraction at the end. Verify by reading `chat-types.ts` before implementing.

- [ ] **Step 1.4: Run test to verify it passes**

```bash
cd /c/Users/desti/youcoded-dev/youcoded-worktrees/tool-card-sandbox/desktop && npx vitest run src/renderer/dev/fixture-loader.test.ts
```

Expected: all 3 tests PASS.

- [ ] **Step 1.5: Commit**

```bash
git add desktop/src/renderer/dev/fixture-loader.ts desktop/src/renderer/dev/fixture-loader.test.ts
git commit -m "feat(dev): add ToolCard sandbox fixture loader

Pure parser that converts JSONL tool_use/tool_result snippets into real
ToolCallState via the actual chat reducer. Dev-only; will be consumed by
the upcoming /tool-sandbox route.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Seed fixtures

**Files:**
- Create: `desktop/src/renderer/dev/fixtures/skill.jsonl`
- Create: `desktop/src/renderer/dev/fixtures/agent.jsonl`
- Create: `desktop/src/renderer/dev/fixtures/bash.jsonl`
- Create: `desktop/src/renderer/dev/fixtures/read.jsonl`
- Create: `desktop/src/renderer/dev/fixtures/grep.jsonl`
- Create: `desktop/src/renderer/dev/fixtures/webfetch.jsonl`
- Create: `desktop/src/renderer/dev/fixtures/mcp-todoist.jsonl`
- Create: `desktop/src/renderer/dev/fixtures/mcp-windows-control.jsonl`

Each fixture is exactly 2 lines: one `tool_use`, one `tool_result`. Pull real samples from `C:/Users/desti/.claude/projects/` transcripts where possible; hand-craft plausible payloads for the MCP fixtures (no MCP calls appear in recent transcripts).

- [ ] **Step 2.1: Create `skill.jsonl`**

```
{"type":"tool_use","id":"toolu_01Sk1ll","name":"Skill","input":{"skill":"superpowers:brainstorming"}}
{"tool_use_id":"toolu_01Sk1ll","type":"tool_result","content":"Launching skill: superpowers:brainstorming","is_error":false}
```

- [ ] **Step 2.2: Create `agent.jsonl`**

```
{"type":"tool_use","id":"toolu_01Agent","name":"Agent","input":{"description":"Low-info tool call audit","subagent_type":"Explore","prompt":"Survey the ToolCard renderer and recent transcripts..."}}
{"tool_use_id":"toolu_01Agent","type":"tool_result","content":"Agent returned a 600-word report. See previous message for findings.","is_error":false}
```

- [ ] **Step 2.3: Create `bash.jsonl`**

```
{"type":"tool_use","id":"toolu_01Bash","name":"Bash","input":{"command":"ls -la docs/","description":"List docs directory"}}
{"tool_use_id":"toolu_01Bash","type":"tool_result","content":"total 48\ndrwxr-xr-x  8 user  staff   256 Apr 24 10:00 .\ndrwxr-xr-x 40 user  staff  1280 Apr 24 10:00 ..\n-rw-r--r--  1 user  staff  1024 Apr 24 10:00 README.md","is_error":false}
```

- [ ] **Step 2.4: Create `read.jsonl`**

```
{"type":"tool_use","id":"toolu_01Read","name":"Read","input":{"file_path":"/workspace/src/example.ts"}}
{"tool_use_id":"toolu_01Read","type":"tool_result","content":"     1→export function greet(name: string) {\n     2→  return `Hello, ${name}!`;\n     3→}\n","is_error":false}
```

- [ ] **Step 2.5: Create `grep.jsonl`**

```
{"type":"tool_use","id":"toolu_01Grep","name":"Grep","input":{"pattern":"TODO","path":"src/","output_mode":"files_with_matches"}}
{"tool_use_id":"toolu_01Grep","type":"tool_result","content":"src/renderer/App.tsx\nsrc/main/ipc-handlers.ts\nsrc/main/sync-service.ts","is_error":false}
```

- [ ] **Step 2.6: Create `webfetch.jsonl`**

```
{"type":"tool_use","id":"toolu_01Web","name":"WebFetch","input":{"url":"https://example.com/docs","prompt":"Extract the API reference"}}
{"tool_use_id":"toolu_01Web","type":"tool_result","content":"# API Reference\n\nThe example API exposes two endpoints: /users and /projects. Each returns JSON...","is_error":false}
```

- [ ] **Step 2.7: Create `mcp-todoist.jsonl`**

```
{"type":"tool_use","id":"toolu_01Todo","name":"mcp__todoist__tasks-list","input":{"project_id":"123456","filter":"today"}}
{"tool_use_id":"toolu_01Todo","type":"tool_result","content":"[{\"id\":\"901\",\"content\":\"Review PR #42\",\"priority\":3},{\"id\":\"902\",\"content\":\"Draft release notes\",\"priority\":2}]","is_error":false}
```

- [ ] **Step 2.8: Create `mcp-windows-control.jsonl`**

```
{"type":"tool_use","id":"toolu_01Win","name":"mcp__windows-control__Click","input":{"x":420,"y":180,"button":"left"}}
{"tool_use_id":"toolu_01Win","type":"tool_result","content":"{\"success\":true,\"clicked_at\":{\"x\":420,\"y\":180}}","is_error":false}
```

- [ ] **Step 2.9: Commit fixtures**

```bash
git add desktop/src/renderer/dev/fixtures/
git commit -m "feat(dev): seed ToolCard sandbox fixtures

Eight initial fixtures covering Skill, Agent, Bash, Read, Grep, WebFetch,
and two MCP tools (Todoist, Windows-Control). Real transcript samples
where available; plausible hand-crafted payloads for MCP.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Sandbox page component

**Files:**
- Create: `desktop/src/renderer/dev/ToolSandbox.tsx`

The page iterates over all fixtures, runs them through `loadFixture`, and renders each tool as a `<ToolCard>`. The component must mount inside a `<ChatProvider>` because `<ToolCard>` calls `useChatDispatch()`.

- [ ] **Step 3.1: Implement `ToolSandbox.tsx`**

```typescript
// Dev-only page: renders every fixture through the real ToolCard/ToolBody so
// we can iterate on compact views with Vite HMR. Gated behind
// import.meta.env.DEV in App.tsx — must not be reachable in prod builds.

import React from 'react';
import { ChatProvider } from '../state/chat-context';
import { ToolCard } from '../components/ToolCard';
import { loadFixture } from './fixture-loader';

const fixtures = import.meta.glob('./fixtures/*.jsonl', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export function ToolSandbox() {
  const entries = Object.entries(fixtures)
    .map(([path, raw]) => {
      const name = path.split('/').pop()!.replace(/\.jsonl$/, '');
      return { name, result: loadFixture(name, raw) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <ChatProvider>
      <div style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
        <h1 style={{ fontSize: 20, marginBottom: 16 }}>ToolCard Sandbox</h1>
        <p style={{ opacity: 0.7, marginBottom: 24, fontSize: 13 }}>
          Dev-only. Each card renders a real &lt;ToolCard&gt; against a fixture
          tool_use/tool_result pair. Edit ToolBody.tsx and save to see changes
          via HMR.
        </p>
        {entries.map(({ name, result }) => (
          <section key={name} style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 14, opacity: 0.6, marginBottom: 8 }}>{name}</h2>
            {result.error ? (
              <div style={{ color: 'tomato', fontFamily: 'monospace' }}>
                {result.error}
              </div>
            ) : (
              result.tools.map((tool) => (
                <ToolCard key={tool.toolUseId} tool={tool} />
              ))
            )}
          </section>
        ))}
      </div>
    </ChatProvider>
  );
}
```

**Implementer notes:**
- If `<ToolCard>` is not exported by name, adjust the import to match the actual export (check `components/ToolCard.tsx` — it may be a default export).
- If `<ChatProvider>` requires specific props, pass the minimum needed. Read `state/chat-context.tsx` first.
- The cards will render with whatever collapsed/expanded state `getInitialExpanded()` returns in `ToolCard.tsx`. If you want both states visible, duplicate each card and wrap one in a `<details open>` for now — easy to remove later.

- [ ] **Step 3.2: Type-check**

```bash
cd /c/Users/desti/youcoded-dev/youcoded-worktrees/tool-card-sandbox/desktop && npx tsc --noEmit
```

Expected: no errors. If `ChatProvider` requires props you haven't supplied, either supply them or mock them inline.

- [ ] **Step 3.3: Commit**

```bash
git add desktop/src/renderer/dev/ToolSandbox.tsx
git commit -m "feat(dev): add ToolSandbox page component

Renders every fixture through the real ToolCard inside a ChatProvider.
Not yet wired into App.tsx — next task handles the route gate.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: App.tsx integration

**Files:**
- Modify: `desktop/src/renderer/App.tsx` (add dev-mode render branch near existing `buddyMode` handling)

- [ ] **Step 4.1: Add the sandbox branch**

Open `desktop/src/renderer/App.tsx`. Find the existing `buddyMode` extraction (around line 71–73) and the early-return branches that handle `buddyMode === 'chat' | 'mascot' | ...`. Add a parallel branch:

```typescript
// Dev-only sandbox route for iterating on ToolCard/ToolBody views.
// Gated on import.meta.env.DEV so production builds tree-shake the import.
if (import.meta.env.DEV && mode === 'tool-sandbox') {
  const { ToolSandbox } = await import('./dev/ToolSandbox');
  // NOTE: if App is not async-capable, use React.lazy + <Suspense> instead.
  return <ToolSandbox />;
}
```

If the surrounding code is not async, replace with `React.lazy`:

```typescript
const ToolSandbox = React.lazy(() => import('./dev/ToolSandbox'));

// ...later, inside the component body:
if (import.meta.env.DEV && mode === 'tool-sandbox') {
  return (
    <React.Suspense fallback={null}>
      <ToolSandbox />
    </React.Suspense>
  );
}
```

The `ToolSandbox` export from Task 3 is a named export — adjust the dynamic import to `.then(m => ({ default: m.ToolSandbox }))` when using `React.lazy`:

```typescript
const ToolSandbox = React.lazy(() =>
  import('./dev/ToolSandbox').then((m) => ({ default: m.ToolSandbox }))
);
```

- [ ] **Step 4.2: Verify the non-dev path is untouched**

```bash
cd /c/Users/desti/youcoded-dev/youcoded-worktrees/tool-card-sandbox/desktop && npm run build
```

Expected: production build succeeds. The `import.meta.env.DEV` branch gets statically evaluated to `false` and the sandbox code is tree-shaken out.

- [ ] **Step 4.3: Type-check**

```bash
cd /c/Users/desti/youcoded-dev/youcoded-worktrees/tool-card-sandbox/desktop && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4.4: Commit**

```bash
git add desktop/src/renderer/App.tsx
git commit -m "feat(dev): route ?mode=tool-sandbox to ToolSandbox in dev builds

Gated on import.meta.env.DEV so production tree-shakes the import.
Follows the existing ?mode= query-param convention used by buddy windows.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Manual verification via HMR

**Files:** n/a (runtime check)

- [ ] **Step 5.1: Start the dev app**

From the main workspace (NOT the worktree — `run-dev.sh` launches from `youcoded-dev/`):

```bash
cd /c/Users/desti/youcoded-dev && bash scripts/run-dev.sh
```

Wait until the "YouCoded Dev" window opens.

- [ ] **Step 5.2: Navigate to the sandbox**

In the dev window, replace the URL with `http://localhost:5223/?mode=tool-sandbox` (or whatever port `run-dev.sh` prints). Open DevTools to confirm no console errors.

Expected: a page titled "ToolCard Sandbox" with eight sections (one per fixture), each showing at least one `<ToolCard>`.

- [ ] **Step 5.3: Verify HMR loop**

Edit `desktop/src/renderer/components/ToolBody.tsx` in the worktree. Change any visible text in the `RawFallbackView` — e.g. change "INPUT" to "TEST INPUT". Save.

Expected: the sandbox page updates within ~1 second without a full reload. The two MCP fixtures (which fall through to `RawFallbackView`) should show the new label. Revert the change before continuing.

- [ ] **Step 5.4: Confirm production path is unreachable**

```bash
cd /c/Users/desti/youcoded-dev/youcoded-worktrees/tool-card-sandbox/desktop && npm run build && grep -r "ToolSandbox" dist/ || echo "OK: sandbox tree-shaken out"
```

Expected: `OK: sandbox tree-shaken out`. If the string is found, the dev-gate isn't working — investigate before proceeding.

- [ ] **Step 5.5: Push the branch**

```bash
cd /c/Users/desti/youcoded-dev/youcoded-worktrees/tool-card-sandbox && git push -u origin tool-card-sandbox
```

Leave the branch open — merging waits until the first real consumer (e.g. Skill-as-pill experiment) is ready.

---

## Self-review notes

- **Spec coverage:** Every section of `2026-04-23-tool-card-sandbox-design.md` maps to a task (route → Task 4, file layout → Tasks 1+2+3, fixture format → Task 2, data flow → Task 1, rendering → Task 3, error handling → Task 1 + Task 3, testing → Task 1 unit tests + Task 5 manual).
- **No placeholders:** All code blocks are complete; all commands have expected output. Hedge notes on `ChatProvider` props / `ToolCard` export style are explicit implementer-decision points, not TBDs.
- **Type consistency:** `loadFixture`, `LoadResult`, `ToolSandbox` are referenced identically across tasks.
- **Known hedges** (acceptable — surfaced for implementer, not blocking):
  - `ChatState` shape (`sessions` Map with `toolCalls` Map) is inferred from `docs/chat-reducer.md` and the ToolCallState type; implementer must confirm before Task 1.
  - Whether App.tsx uses async top-level or React.lazy is implementer's call based on surrounding patterns.
